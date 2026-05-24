import { Types } from 'mongoose';
import { Doc, DocumentDoc } from '../models/Document';

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://ai-engine:8000';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

async function invalidateBM25Cache(userId: string, studySetId: string): Promise<void> {
  try {
    await fetch(`${AI_ENGINE_URL}/internal/cache/bm25/invalidate`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ user_id: userId, study_set_id: studySetId }),
    });
  } catch (err) {
    console.warn('[documents] BM25 invalidate failed:', (err as Error).message);
  }
}

export async function createDocument(data: {
  userId: string;
  studySetId: string;
  title: string;
  storageUri?: string;
  type: 'pdf' | 'note';
}): Promise<DocumentDoc> {
  return Doc.create({
    userId: new Types.ObjectId(data.userId),
    studySetId: new Types.ObjectId(data.studySetId),
    title: data.title,
    storageUri: data.storageUri,
    type: data.type,
    ingestionStatus: 'pending',
    vectorChunkIds: [],
  });
}

export async function updateIngestionStatus(
  id: string,
  status: DocumentDoc['ingestionStatus'],
  vectorChunkIds?: string[],
): Promise<DocumentDoc | null> {
  return Doc.findByIdAndUpdate(
    id,
    { ingestionStatus: status, ...(vectorChunkIds && { vectorChunkIds }) },
    { new: true },
  );
}

export async function listDocuments(userId: string, studySetId: string): Promise<DocumentDoc[]> {
  return Doc.find({ userId, studySetId }).sort({ createdAt: -1 }).lean() as unknown as DocumentDoc[];
}

export async function getDocument(id: string, userId?: string): Promise<DocumentDoc | null> {
  const query = userId ? { _id: id, userId } : { _id: id };
  return Doc.findOne(query).lean() as unknown as DocumentDoc | null;
}

export async function deleteDocument(id: string, userId: string): Promise<boolean> {
  const deleted = await Doc.findOneAndDelete({ _id: id, userId: new Types.ObjectId(userId) });
  if (!deleted) return false;
  // Fire-and-forget: a downed ai-engine must not fail the delete.
  void invalidateBM25Cache(userId, deleted.studySetId.toString());
  void deleteChromaChunks(userId, id);
  return true;
}

export async function patchDocument(
  id: string,
  userId: string,
  patch: { title?: string; studySetId?: string },
): Promise<DocumentDoc | null> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.studySetId !== undefined) update.studySetId = new Types.ObjectId(patch.studySetId);
  if (Object.keys(update).length === 0) return getDocument(id, userId);
  const before = await Doc.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean();
  const updated = await Doc.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId) },
    update,
    { new: true },
  ).lean() as unknown as DocumentDoc | null;
  if (updated && patch.studySetId !== undefined && before) {
    // BM25 cache for both old and new study sets is now stale.
    void invalidateBM25Cache(userId, (before as { studySetId: Types.ObjectId }).studySetId.toString());
    void invalidateBM25Cache(userId, patch.studySetId);
    // Reflect the new studySetId on the chunks themselves so future
    // scoped retrievals find them under the new set.
    void updateChromaChunksStudySet(userId, id, patch.studySetId);
  }
  return updated;
}

export async function reingestDocument(
  id: string,
  userId: string,
): Promise<{ doc: DocumentDoc; storagePath: string } | null> {
  const doc = await Doc.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  if (!doc) return null;
  if (!doc.storageUri) return null;
  // Clear vector chunks so the re-ingest produces a clean set. The ai-engine
  // upsert is keyed by chunk_id so leaving stale rows would orphan them.
  void deleteChromaChunks(userId, id);
  doc.ingestionStatus = 'pending';
  doc.vectorChunkIds = [];
  await doc.save();
  return { doc: doc.toObject() as unknown as DocumentDoc, storagePath: doc.storageUri };
}

async function deleteChromaChunks(userId: string, documentId: string): Promise<void> {
  try {
    await fetch(`${AI_ENGINE_URL}/internal/chunks/delete`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ user_id: userId, document_id: documentId }),
    });
  } catch (err) {
    console.warn('[documents] chunk delete failed:', (err as Error).message);
  }
}

export async function bulkDeleteDocuments(ids: string[], userId: string): Promise<{ deleted: number; storageUris: string[] }> {
  const docs = await Doc.find({
    _id:    { $in: ids },
    userId: new Types.ObjectId(userId),
  }).select('_id studySetId storageUri').lean() as unknown as Pick<DocumentDoc, '_id' | 'studySetId' | 'storageUri'>[];

  if (docs.length === 0) return { deleted: 0, storageUris: [] };

  const docIds = docs.map(d => (d._id as unknown as Types.ObjectId).toString());
  await Doc.deleteMany({ _id: { $in: docIds }, userId: new Types.ObjectId(userId) });

  const setIds = new Set(docs.map(d => d.studySetId?.toString()).filter(Boolean) as string[]);
  for (const setId of setIds) {
    void invalidateBM25Cache(userId, setId);
  }
  for (const docId of docIds) {
    void deleteChromaChunks(userId, docId);
  }

  const storageUris = docs
    .map(d => d.storageUri)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);

  return { deleted: docIds.length, storageUris };
}

export async function bulkMoveDocuments(ids: string[], userId: string, targetSetId: string): Promise<number> {
  const result = await Doc.updateMany(
    { _id: { $in: ids }, userId: new Types.ObjectId(userId) },
    { $set: { studySetId: new Types.ObjectId(targetSetId) } },
  );
  if (result.modifiedCount > 0) {
    void invalidateBM25Cache(userId, targetSetId);
  }
  return result.modifiedCount;
}

async function updateChromaChunksStudySet(
  userId: string,
  documentId: string,
  newStudySetId: string,
): Promise<void> {
  try {
    await fetch(`${AI_ENGINE_URL}/internal/chunks/move`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ user_id: userId, document_id: documentId, study_set_id: newStudySetId }),
    });
  } catch (err) {
    console.warn('[documents] chunk move failed:', (err as Error).message);
  }
}
