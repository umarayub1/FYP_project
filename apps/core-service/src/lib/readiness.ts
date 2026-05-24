import { Flashcard } from '../models/Flashcard';
import { SpacedRepetition } from '../models/SpacedRepetition';

export async function computeReadiness(studySetId: string, userId: string): Promise<number> {
  const [totalCards, dueRecords] = await Promise.all([
    Flashcard.countDocuments({ studySetId, userId, suspended: { $ne: true } }),
    SpacedRepetition.countDocuments({
      userId,
      dueAt: { $lte: new Date() },
      flashcardId: {
        $in: await Flashcard.distinct('_id', { studySetId, userId, suspended: { $ne: true } }),
      },
    }),
  ]);
  if (totalCards === 0) return 100;
  return Math.max(0, Math.round(100 - (dueRecords / totalCards) * 100));
}
