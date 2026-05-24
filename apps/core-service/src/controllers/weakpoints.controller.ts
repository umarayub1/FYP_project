import { Types } from 'mongoose';
import { Flashcard } from '../models/Flashcard';
import { FeynmanSession } from '../models/FeynmanSession';
import { StudySet } from '../models/StudySet';

export async function getWeakpoints(userId: string) {
  // ── Leech cards ──────────────────────────────────────────────────────────────
  const leechCards = await Flashcard.find({
    userId:  new Types.ObjectId(userId),
    isLeech: true,
  })
    .limit(50)
    .lean();

  // Enrich with study set names
  const setIds = [...new Set(leechCards.map((c) => c.studySetId.toString()))];
  const sets = await StudySet.find({ _id: { $in: setIds } })
    .select('_id name')
    .lean();
  const setMap = new Map(sets.map((s) => [s._id.toString(), s.name]));

  const enrichedLeechCards = leechCards.map((c) => ({
    ...c,
    againCount:   c.lapses ?? 0,
    studySetName: setMap.get(c.studySetId.toString()) ?? null,
  }));

  // ── Weak topics (Feynman sessions with low clarity) ──────────────────────────
  const lowClarityThreshold = 0.4;
  const sessions = await FeynmanSession.find({
    userId:       new Types.ObjectId(userId),
    clarityScore: { $lt: lowClarityThreshold },
    status:       'complete',
  })
    .sort({ clarityScore: 1 })
    .limit(50)
    .lean();

  // Group by topic, keep lowest clarity per topic
  const topicMap = new Map<string, typeof sessions[0]>();
  for (const s of sessions) {
    const existing = topicMap.get(s.topic);
    if (!existing || s.clarityScore < existing.clarityScore) {
      topicMap.set(s.topic, s);
    }
  }

  const weakTopicSessions = Array.from(topicMap.values());

  // Enrich with study set names
  const feynSetIds = [...new Set(weakTopicSessions.map((s) => s.studySetId.toString()))];
  const feynSets = await StudySet.find({ _id: { $in: feynSetIds } })
    .select('_id name')
    .lean();
  const feynSetMap = new Map(feynSets.map((s) => [s._id.toString(), s.name]));

  const weakTopics = weakTopicSessions.map((s) => ({
    topic:        s.topic,
    clarityScore: s.clarityScore,
    studySetId:   s.studySetId,
    studySetName: feynSetMap.get(s.studySetId.toString()) ?? null,
    sessionId:    s._id,
    createdAt:    s.createdAt,
  }));

  return { leechCards: enrichedLeechCards, weakTopics };
}
