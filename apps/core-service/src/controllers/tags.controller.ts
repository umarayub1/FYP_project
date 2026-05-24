import { Types } from 'mongoose';
import { Tag, TagDoc } from '../models/Tag';
import { Note } from '../models/Note';
import { Flashcard } from '../models/Flashcard';
import { Doc } from '../models/Document';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function listTags(userId: string): Promise<TagDoc[]> {
  return Tag.find({ userId: new Types.ObjectId(userId) }).sort({ usageCount: -1 }).lean() as unknown as TagDoc[];
}

export async function getTagBySlug(userId: string, slug: string): Promise<TagDoc | null> {
  return Tag.findOne({ userId: new Types.ObjectId(userId), slug }).lean() as unknown as TagDoc | null;
}

export async function createTag(
  userId: string,
  data: { name: string; color?: string },
): Promise<TagDoc> {
  const slug = slugify(data.name);
  const existing = await Tag.findOne({ userId: new Types.ObjectId(userId), slug });
  if (existing) return existing;
  return Tag.create({
    userId: new Types.ObjectId(userId),
    name:   data.name,
    slug,
    color:  data.color,
    global: false,
    usageCount: 0,
  });
}

export async function updateTag(
  id: string,
  userId: string,
  patch: Partial<{ name: string; color: string }>,
): Promise<TagDoc | null> {
  const update: Partial<{ name: string; slug: string; color: string }> = { ...patch };
  if (patch.name) update.slug = slugify(patch.name);
  return Tag.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId) },
    { $set: update },
    { new: true, lean: true },
  ) as unknown as TagDoc | null;
}

export async function deleteTag(id: string, userId: string): Promise<boolean> {
  const result = await Tag.deleteOne({ _id: id, userId: new Types.ObjectId(userId) });
  return result.deletedCount === 1;
}

export async function promoteTag(id: string, userId: string): Promise<TagDoc | null> {
  return Tag.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId) },
    { $set: { global: true } },
    { new: true, lean: true },
  ) as unknown as TagDoc | null;
}

export async function mergeTags(
  userId: string,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const source = await Tag.findOne({ _id: sourceId, userId: new Types.ObjectId(userId) });
  const target = await Tag.findOne({ _id: targetId, userId: new Types.ObjectId(userId) });
  if (!source || !target) return;

  // Re-tag all notes and flashcards
  await Note.updateMany(
    { userId: new Types.ObjectId(userId), tags: source.name },
    { $addToSet: { tags: target.name }, $pull: { tags: source.name } },
  );
  await Flashcard.updateMany(
    { userId: new Types.ObjectId(userId), tags: source.name },
    { $addToSet: { tags: target.name }, $pull: { tags: source.name } },
  );
  await Tag.deleteOne({ _id: sourceId });
}

export async function getTagItems(tagId: string, userId: string) {
  const tag = await Tag.findOne({ _id: tagId, userId: new Types.ObjectId(userId) }).lean();
  if (!tag) return null;

  const uid = new Types.ObjectId(userId);
  const [notes, flashcards, documents] = await Promise.all([
    Note.find({ userId: uid, tags: tag.name }).select('title studySetId updatedAt').lean(),
    Flashcard.find({ userId: uid, tags: tag.name }).select('front studySetId updatedAt').lean(),
    Doc.find({ userId: uid }).select('title studySetId updatedAt').limit(0).lean(), // PDFs not yet tag-indexed
  ]);

  return { notes, flashcards, documents };
}
