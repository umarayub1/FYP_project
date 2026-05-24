import { Types } from 'mongoose';
import { Flashcard, FlashcardDoc } from '../models/Flashcard';
import { SpacedRepetition } from '../models/SpacedRepetition';
import { UserPreferences } from '../models/UserPreferences';
import { applySM2 } from '../lib/sm2';

export function parseClozeMarkers(clozeBody: string): number {
  const matches = clozeBody.match(/\{\{c(\d+)::/g) ?? [];
  const nums = matches.map(m => parseInt(m.replace('{{c', '').replace('::', ''), 10));
  return nums.length > 0 ? Math.max(...nums) : 1;
}

export async function listFlashcards(userId: string, studySetId: string): Promise<FlashcardDoc[]> {
  const cards = await Flashcard.find({ userId, studySetId }).sort({ createdAt: -1 }).lean();
  if (cards.length === 0) return [] as unknown as FlashcardDoc[];
  const srs = await SpacedRepetition.find({
    userId:      new Types.ObjectId(userId),
    flashcardId: { $in: cards.map(c => c._id) },
  }).lean();
  const srMap = new Map(srs.map(s => [s.flashcardId.toString(), s]));
  return cards.map(c => {
    const sr = srMap.get(c._id.toString());
    if (!sr) return c;
    return {
      ...c,
      dueDate:     sr.dueAt instanceof Date ? sr.dueAt.toISOString() : sr.dueAt,
      interval:    sr.interval,
      easeFactor:  sr.easeFactor,
      repetitions: sr.repetitions,
    };
  }) as unknown as FlashcardDoc[];
}

export async function createFlashcard(
  userId: string,
  data: {
    studySetId:     string;
    cardType?:      'basic' | 'bidirectional' | 'cloze';
    front?:         string;
    back?:          string;
    clozeBody?:     string;
    bidirectional?: boolean;
    tags?:          string[];
    sourceDocumentId?: string;
    sourceTitle?:   string;
    sourcePage?:    number;
  },
): Promise<FlashcardDoc> {
  const cardType = data.cardType ?? 'basic';
  const clozeNumber = (cardType === 'cloze' && data.clozeBody)
    ? parseClozeMarkers(data.clozeBody)
    : undefined;
  const flashcard = await Flashcard.create({
    userId:           new Types.ObjectId(userId),
    studySetId:       new Types.ObjectId(data.studySetId),
    cardType,
    front:            data.front ?? '',
    back:             data.back ?? '',
    clozeBody:        data.clozeBody,
    clozeNumber,
    bidirectional:    data.bidirectional ?? false,
    tags:             data.tags ?? [],
    sourceDocumentId: data.sourceDocumentId ? new Types.ObjectId(data.sourceDocumentId) : undefined,
    sourceTitle:      data.sourceTitle,
    sourcePage:       data.sourcePage,
    suspended:        false,
  });
  await SpacedRepetition.create({
    flashcardId:    flashcard._id,
    userId:         new Types.ObjectId(userId),
    easeFactor:     2.5,
    interval:       0,
    repetitions:    0,
    dueAt:          new Date(),
    lastReviewedAt: new Date(),
  });
  // Create reverse card for bidirectional — share pairId
  if (data.bidirectional && data.front && data.back) {
    const pairId = new Types.ObjectId();
    const reverse = await Flashcard.create({
      userId:          new Types.ObjectId(userId),
      studySetId:      new Types.ObjectId(data.studySetId),
      cardType:        'bidirectional',
      front:           data.back,
      back:            data.front,
      isBidirectional: true,
      pairId,
      tags:            data.tags ?? [],
      sourceTitle:     data.sourceTitle,
      suspended:       false,
    });
    await Flashcard.updateOne({ _id: flashcard._id }, { $set: { pairId } });
    await SpacedRepetition.create({
      flashcardId:    reverse._id,
      userId:         new Types.ObjectId(userId),
      easeFactor:     2.5,
      interval:       0,
      repetitions:    0,
      dueAt:          new Date(),
      lastReviewedAt: new Date(),
    });
  }
  return flashcard;
}

export async function updateFlashcard(
  id: string,
  userId: string,
  studySetId: string,
  patch: Partial<{
    cardType:      'basic' | 'bidirectional' | 'cloze';
    front:         string;
    back:          string;
    clozeBody:     string;
    bidirectional: boolean;
    tags:          string[];
    sourceTitle:   string;
    sourcePage:    number;
  }>,
): Promise<FlashcardDoc | null> {
  const update: Record<string, unknown> = { ...patch };
  if (patch.clozeBody !== undefined) {
    update.clozeNumber = parseClozeMarkers(patch.clozeBody);
  }
  const card = await Flashcard.findOneAndUpdate(
    {
      _id:        id,
      userId:     new Types.ObjectId(userId),
      studySetId: new Types.ObjectId(studySetId),
    },
    { $set: update },
    { new: true, lean: true },
  ) as unknown as FlashcardDoc | null;

  // Sync partner card for bidirectional pairs
  if (card && (card as unknown as { pairId?: Types.ObjectId }).pairId) {
    const pairId = (card as unknown as { pairId?: Types.ObjectId }).pairId!;
    const partnerUpdate: Record<string, unknown> = {};
    // front↔back swap: editing front of A updates back of B, and vice versa
    if (patch.front !== undefined) partnerUpdate.back  = patch.front;
    if (patch.back  !== undefined) partnerUpdate.front = patch.back;
    if (patch.tags  !== undefined) partnerUpdate.tags  = patch.tags;
    if (Object.keys(partnerUpdate).length > 0) {
      await Flashcard.updateOne({ pairId, _id: { $ne: card._id } }, { $set: partnerUpdate });
    }
    // If type changed away from bidirectional, unlink both
    if (patch.cardType && patch.cardType !== 'bidirectional') {
      await Flashcard.updateMany({ pairId }, { $unset: { pairId: 1 } });
    }
  }

  return card;
}

export async function suspendFlashcard(id: string, userId: string, studySetId: string): Promise<boolean> {
  const result = await Flashcard.updateOne(
    {
      _id:        id,
      userId:     new Types.ObjectId(userId),
      studySetId: new Types.ObjectId(studySetId),
    },
    [{ $set: { suspended: { $not: '$suspended' } } }],
  );
  return result.matchedCount > 0;
}

export async function getCramCards(userId: string, studySetId: string): Promise<FlashcardDoc[]> {
  const cards = await Flashcard.find({ studySetId, userId, suspended: { $ne: true } }).lean() as unknown as FlashcardDoc[];
  return cards.sort(() => Math.random() - 0.5);
}

export async function reviewFlashcard(
  flashcardId: string,
  userId: string,
  studySetId: string,
  quality: 1 | 2 | 3 | 4,
  isCram = false,
): Promise<{ updated: boolean; leech: boolean; becameLeech?: boolean; message?: string }> {
  const card = await Flashcard.findOne({
    _id:        flashcardId,
    userId:     new Types.ObjectId(userId),
    studySetId: new Types.ObjectId(studySetId),
  });
  if (!card) throw Object.assign(new Error('Flashcard not found'), { status: 404 });

  if (isCram) {
    return { updated: false, leech: false, message: 'Cram review recorded' };
  }

  let sr = await SpacedRepetition.findOne({ flashcardId, userId });
  if (!sr) {
    sr = await SpacedRepetition.create({
      flashcardId:    new Types.ObjectId(flashcardId),
      userId:         new Types.ObjectId(userId),
      easeFactor:     2.5,
      interval:       0,
      repetitions:    0,
      dueAt:          new Date(),
      lastReviewedAt: new Date(),
    });
  }
  const next = applySM2(
    {
      easeFactor:     sr.easeFactor,
      interval:       sr.interval,
      repetitions:    sr.repetitions,
      dueAt:          sr.dueAt,
      lastReviewedAt: sr.lastReviewedAt ?? new Date(),
    },
    quality,
  );
  Object.assign(sr, next);
  await sr.save();

  let leech = false;
  if (quality === 1) {
    await Flashcard.updateOne({ _id: card._id }, { $inc: { lapses: 1 } });
    card.lapses = (card.lapses ?? 0) + 1;
    const prefs = await UserPreferences.findOne({ userId: new Types.ObjectId(userId) }).lean();
    const leechThreshold = (prefs as { leechThreshold?: number } | null)?.leechThreshold ?? 8;
    if (card.lapses >= leechThreshold && !card.isLeech) {
      await Flashcard.updateOne(
        { _id: card._id },
        { $set: { isLeech: true, leechAt: new Date() } },
      );
      leech = true;
    }
  }

  return { updated: true, leech, becameLeech: leech };
}

export async function bulkDeleteFlashcards(ids: string[], userId: string, studySetId: string): Promise<number> {
  const result = await Flashcard.deleteMany({
    _id:        { $in: ids },
    userId:     new Types.ObjectId(userId),
    studySetId: new Types.ObjectId(studySetId),
  });
  if (result.deletedCount > 0) {
    await SpacedRepetition.deleteMany({ flashcardId: { $in: ids }, userId });
  }
  return result.deletedCount;
}

export async function bulkTagFlashcards(
  ids: string[],
  userId: string,
  studySetId: string,
  tags: string[],
  mode: 'add' | 'remove',
): Promise<number> {
  const update = mode === 'add'
    ? { $addToSet: { tags: { $each: tags } } }
    : { $pull: { tags: { $in: tags } } };
  const result = await Flashcard.updateMany(
    { _id: { $in: ids }, userId: new Types.ObjectId(userId), studySetId: new Types.ObjectId(studySetId) },
    update,
  );
  return result.modifiedCount;
}

export async function bulkMoveFlashcards(
  ids: string[],
  userId: string,
  fromStudySetId: string,
  toStudySetId: string,
): Promise<number> {
  const result = await Flashcard.updateMany(
    { _id: { $in: ids }, userId: new Types.ObjectId(userId), studySetId: new Types.ObjectId(fromStudySetId) },
    { $set: { studySetId: new Types.ObjectId(toStudySetId) } },
  );
  return result.modifiedCount;
}

export async function deleteFlashcard(id: string, userId: string, studySetId: string): Promise<boolean> {
  const deleted = await Flashcard.findOneAndDelete({
    _id:        id,
    userId:     new Types.ObjectId(userId),
    studySetId: new Types.ObjectId(studySetId),
  });
  if (!deleted) return false;
  await SpacedRepetition.deleteOne({ flashcardId: id, userId });
  return true;
}

interface CsvRow {
  front:      string;
  back:       string;
  tags?:      string;
  cardType?:  'basic' | 'bidirectional' | 'cloze';
  clozeBody?: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  malformed: number;
  errors: string[];
}

export async function bulkImportFlashcards(
  userId: string,
  studySetId: string,
  rows: CsvRow[],
): Promise<ImportResult> {
  const CLOZE_MARKER = /\{\{c\d+::/;
  const isMalformed = (r: CsvRow) => {
    if (r.cardType === 'cloze') {
      const body = r.clozeBody?.trim() ?? '';
      return !body || !CLOZE_MARKER.test(body);
    }
    return !r.front.trim() || !r.back.trim();
  };
  const malformedRows = rows.filter(isMalformed);
  const validRows     = rows.filter(r => !isMalformed(r));

  let imported = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const row of validRows) {
    try {
      const cardType = row.cardType ?? 'basic';
      const existing = cardType === 'cloze'
        ? await Flashcard.findOne({ userId, studySetId, clozeBody: row.clozeBody })
        : await Flashcard.findOne({ userId, studySetId, front: row.front, back: row.back });
      if (existing) {
        duplicates++;
      } else {
        await createFlashcard(userId, {
          studySetId,
          cardType,
          front:     row.front,
          back:      row.back,
          clozeBody: cardType === 'cloze' ? row.clozeBody : undefined,
          tags:      row.tags ? row.tags.split('|').map((t) => t.trim()).filter(Boolean) : [],
        });
        imported++;
      }
    } catch (err: unknown) {
      errors.push((err as Error).message);
    }
  }

  return { total: rows.length, imported, duplicates, malformed: malformedRows.length, errors };
}

export async function getLeechCount(userId: string): Promise<number> {
  return Flashcard.countDocuments({ userId: new Types.ObjectId(userId), isLeech: true, suspended: { $ne: true } });
}
