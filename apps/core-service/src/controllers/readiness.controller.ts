import { Types } from 'mongoose';
import { Flashcard } from '../models/Flashcard';
import { SpacedRepetition } from '../models/SpacedRepetition';
import { FeynmanSession } from '../models/FeynmanSession';
import { StudySetDoc } from '../models/StudySet';
import { Deadline } from '../models/Deadline';

export interface ReadinessBreakdown {
  retentionRate:       number;
  feynmanClarity:      number;
  deadlineUrgency:     number;
  reviewCompleteness:  number;
}

export interface ReadinessResult {
  score:     number;
  breakdown: ReadinessBreakdown;
}

async function computeDeadlineUrgencyFactor(
  studySetId: string,
  userId: string,
  fallback: StudySetDoc['deadlines'],
): Promise<number> {
  const now = new Date();
  // Primary source: Deadline collection (Plan H). Filter out passed and
  // active-snoozed entries; only set-scoped deadlines apply to this
  // study set's readiness.
  const rows = await Deadline.find({
    userId:     new Types.ObjectId(userId),
    studySetId: new Types.ObjectId(studySetId),
    passedAt:   null,
    $or:        [{ snoozeUntil: null }, { snoozeUntil: { $lte: now } }],
  }).select('date').lean();

  let days: number[] = rows
    .filter(r => r.date > now)
    .map(r => (r.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (days.length === 0) {
    // Read-side fallback to the legacy StudySet.deadlines subdoc — kept until
    // a follow-up cleanup phase removes the field after parity is verified.
    days = (fallback ?? [])
      .filter(d => !d.passedAt && new Date(d.date) > now)
      .map(d => (new Date(d.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  days.sort((a, b) => a - b);
  const nearest = days[0];
  if (nearest === undefined) return 1.0;
  if (nearest <= 0)  return 0.0;
  if (nearest <= 3)  return 0.3;
  if (nearest <= 7)  return 0.6;
  if (nearest <= 14) return 0.8;
  return 1.0;
}

export async function computeFullReadiness(
  studySetId: string,
  userId: string,
  studySet: StudySetDoc,
): Promise<ReadinessResult> {
  const flashcardIds = await Flashcard.distinct('_id', {
    studySetId: new Types.ObjectId(studySetId),
    userId:     new Types.ObjectId(userId),
    suspended:  { $ne: true },
  });

  const totalCards = flashcardIds.length;
  const now = new Date();

  // ── retentionRate ────────────────────────────────────────────────────────────
  // cardsNotOverdue = cards with no SR record (new) OR dueAt > now
  let retentionRate = 1.0;
  if (totalCards > 0) {
    const overdueCount = await SpacedRepetition.countDocuments({
      userId:      new Types.ObjectId(userId),
      flashcardId: { $in: flashcardIds },
      dueAt:       { $lte: now },
    });
    const srCardCount = await SpacedRepetition.countDocuments({
      userId:      new Types.ObjectId(userId),
      flashcardId: { $in: flashcardIds },
    });
    const newCardCount   = totalCards - srCardCount;
    const cardsNotOverdue = (srCardCount - overdueCount) + newCardCount;
    retentionRate = cardsNotOverdue / totalCards;
  }

  // ── feynmanClarity ───────────────────────────────────────────────────────────
  // last 5 completed Feynman sessions for this set
  const recentSessions = await FeynmanSession.find({
    studySetId: new Types.ObjectId(studySetId),
    userId:     new Types.ObjectId(userId),
    status:     'complete',
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('clarityScore')
    .lean();

  const feynmanClarity = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => sum + s.clarityScore, 0) / recentSessions.length / 100
    : 0.5;

  // ── deadlineUrgency ──────────────────────────────────────────────────────────
  const deadlineUrgency = await computeDeadlineUrgencyFactor(studySetId, userId, studySet.deadlines);

  // ── reviewCompleteness ───────────────────────────────────────────────────────
  const dueCardCount = await SpacedRepetition.countDocuments({
    userId:      new Types.ObjectId(userId),
    flashcardId: { $in: flashcardIds },
    dueAt:       { $lte: now },
  });
  const reviewCompleteness = dueCardCount === 0
    ? 1
    : Math.max(0, 1 - dueCardCount / Math.max(totalCards, 1));

  // ── weighted score (0–100) ────────────────────────────────────────────────────
  const score = Math.round((
    retentionRate      * 0.40 +
    feynmanClarity     * 0.30 +
    deadlineUrgency    * 0.20 +
    reviewCompleteness * 0.10
  ) * 100);

  return {
    score,
    breakdown: {
      retentionRate:      parseFloat(retentionRate.toFixed(4)),
      feynmanClarity:     parseFloat(feynmanClarity.toFixed(4)),
      deadlineUrgency:    parseFloat(deadlineUrgency.toFixed(4)),
      reviewCompleteness: parseFloat(reviewCompleteness.toFixed(4)),
    },
  };
}
