import { Types } from 'mongoose';
import { SpacedRepetition } from '../models/SpacedRepetition';
import { StudySet, StudySetDoc } from '../models/StudySet';
import { Flashcard } from '../models/Flashcard';

export interface NowBriefItem {
  studySetId: string;
  studySetName: string;
  studySetColor: string;
  action: 'Review' | 'Read' | 'Practice';
  dueCount: number;
  overdueCount: number;
  nextDeadline: { name: string; date: string; daysUntil: number } | null;
  priorityScore: number;
  examMode: boolean;
}

export async function getNowBrief(userId: string): Promise<NowBriefItem[]> {
  const now = new Date();

  // 1. Get all non-archived StudySets for this user
  const studySets = (await StudySet.find({
    userId: new Types.ObjectId(userId),
    archived: false,
  }).lean()) as unknown as StudySetDoc[];

  // 2. Get SR records due now (≤ now). "Due" means actionable now —
  //    7-day windows confused users when the dashboard claimed "X due today"
  //    but the deck view showed everything caught up.
  const dueRecords = await SpacedRepetition.find({
    userId: new Types.ObjectId(userId),
    dueAt: { $lte: now },
  }).lean();

  // 3. Map SR records to studySetIds via Flashcard
  const flashcardIds = dueRecords.map((r) => r.flashcardId);
  const flashcards = await Flashcard.find({ _id: { $in: flashcardIds } })
    .select('studySetId')
    .lean();

  const cardToStudySet = new Map<string, string>();
  for (const fc of flashcards) {
    cardToStudySet.set(fc._id.toString(), (fc.studySetId as Types.ObjectId).toString());
  }

  // Aggregate due/overdue counts per studySet
  const dueBySet = new Map<string, { due: number; overdue: number }>();
  for (const sr of dueRecords) {
    const fcId = sr.flashcardId.toString();
    const ssId = cardToStudySet.get(fcId);
    if (!ssId) continue;
    const entry = dueBySet.get(ssId) ?? { due: 0, overdue: 0 };
    entry.due++;
    if (sr.dueAt < now) entry.overdue++;
    dueBySet.set(ssId, entry);
  }

  // 4. Build items
  const items: NowBriefItem[] = [];

  for (const ss of studySets) {
    const ssId = (ss._id as Types.ObjectId).toString();
    const counts = dueBySet.get(ssId) ?? { due: 0, overdue: 0 };

    // Find nearest deadline
    let nearestDeadline: NowBriefItem['nextDeadline'] = null;
    let minDaysUntil = Infinity;
    let examMode = false;

    for (const dl of ss.deadlines ?? []) {
      const daysUntil = (new Date(dl.date).getTime() - now.getTime()) / (1000 * 86400);
      if (daysUntil > 0 && daysUntil < minDaysUntil) {
        minDaysUntil = daysUntil;
        nearestDeadline = {
          name: dl.label,
          date: new Date(dl.date).toISOString(),
          daysUntil: Math.ceil(daysUntil),
        };
      }
      if (daysUntil > 0 && daysUntil <= 3) {
        examMode = true;
      }
    }

    // 5. Priority = (overdue_days × 1.5) + log(review_count + 1)
    //    With 10× multiplier for exam mode (ARCHITECTURE.md §8.3)
    const overdueDays = counts.overdue;
    const logReviews = Math.log(counts.due + 1);
    let priorityScore = overdueDays * 1.5 + logReviews;
    if (examMode) priorityScore *= 10;

    // Only include sets with due cards or upcoming deadlines
    if (counts.due === 0 && nearestDeadline === null) continue;

    const action: NowBriefItem['action'] =
      counts.overdue > 0 ? 'Review' : counts.due > 0 ? 'Practice' : 'Read';

    items.push({
      studySetId: ssId,
      studySetName: ss.name,
      studySetColor: ss.color,
      action,
      dueCount: counts.due,
      overdueCount: counts.overdue,
      nextDeadline: nearestDeadline,
      priorityScore,
      examMode,
    });
  }

  // 6. Sort by priorityScore descending
  items.sort((a, b) => b.priorityScore - a.priorityScore);

  return items;
}
