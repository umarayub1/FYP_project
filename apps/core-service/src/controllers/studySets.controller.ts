import { Types } from 'mongoose';
import { StudySet, StudySetDoc, DeadlineSubDoc } from '../models/StudySet';

export async function getStudySet(id: string, userId: string): Promise<StudySetDoc | null> {
  return StudySet.findOne({ _id: id, userId: new Types.ObjectId(userId) });
}

export async function listStudySets(userId: string, includeArchived = false): Promise<StudySetDoc[]> {
  const query = includeArchived
    ? { userId: new Types.ObjectId(userId) }
    : { userId: new Types.ObjectId(userId), archived: false };
  return StudySet.find(query).sort({ createdAt: -1 }).lean() as unknown as StudySetDoc[];
}

export async function archiveStudySet(
  id: string,
  userId: string,
  archived: boolean,
): Promise<StudySetDoc | null> {
  const set = await StudySet.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  if (!set) return null;
  set.archived = archived;
  set.archivedAt = archived ? new Date() : undefined;
  return set.save();
}

export async function createStudySet(
  userId: string,
  data: { name: string; color: string },
): Promise<StudySetDoc> {
  return StudySet.create({ userId: new Types.ObjectId(userId), ...data });
}

export async function updateStudySet(
  id: string,
  userId: string,
  data: Partial<{ name: string; color: string }>,
): Promise<StudySetDoc | null> {
  const set = await StudySet.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  if (!set) return null;
  Object.assign(set, data);
  return set.save();
}

export async function deleteStudySet(id: string, userId: string): Promise<boolean> {
  const result = await StudySet.deleteOne({ _id: id, userId: new Types.ObjectId(userId) });
  return result.deletedCount === 1;
}

// ── Deadline sub-resource ────────────────────────────────────────────────────

function serializeDeadline(d: DeadlineSubDoc, studySetId: string) {
  return {
    id:               (d._id as Types.ObjectId).toString(),
    studySetId,
    type:             d.type,
    label:            d.label,
    date:             d.date,
    notifyDaysBefore: d.notifyDaysBefore,
    createdAt:        d.createdAt.toISOString(),
    passedAt:         d.passedAt?.toISOString(),
  };
}

export async function addDeadline(
  setId: string,
  userId: string,
  data: {
    type:             'exam' | 'quiz' | 'assignment' | 'custom';
    label:            string;
    date:             string;
    notifyDaysBefore: number[];
  },
) {
  const set = await StudySet.findOne({ _id: setId, userId: new Types.ObjectId(userId) });
  if (!set) return null;
  set.deadlines.push({
    _id: new Types.ObjectId(),
    type:             data.type,
    label:            data.label,
    date:             data.date,
    notifyDaysBefore: data.notifyDaysBefore,
    createdAt:        new Date(),
  } as DeadlineSubDoc);
  await set.save();
  const added = set.deadlines[set.deadlines.length - 1];
  return serializeDeadline(added, setId);
}

export async function updateDeadline(
  setId: string,
  userId: string,
  deadlineId: string,
  patch: Partial<{
    type:             'exam' | 'quiz' | 'assignment' | 'custom';
    label:            string;
    date:             string;
    notifyDaysBefore: number[];
    passedAt:         string;
  }>,
) {
  const set = await StudySet.findOne({ _id: setId, userId: new Types.ObjectId(userId) });
  if (!set) return null;
  const deadline = set.deadlines.id(deadlineId);
  if (!deadline) return null;
  if (patch.type)             deadline.type = patch.type;
  if (patch.label)            deadline.label = patch.label;
  if (patch.date)             deadline.date = patch.date;
  if (patch.notifyDaysBefore) deadline.notifyDaysBefore = patch.notifyDaysBefore;
  if (patch.passedAt)         deadline.passedAt = new Date(patch.passedAt);
  await set.save();
  return serializeDeadline(deadline, setId);
}

export async function deleteDeadline(
  setId: string,
  userId: string,
  deadlineId: string,
): Promise<boolean> {
  const set = await StudySet.findOne({ _id: setId, userId: new Types.ObjectId(userId) });
  if (!set) return false;
  const before = set.deadlines.length;
  set.deadlines.pull({ _id: deadlineId });
  if (set.deadlines.length === before) return false;
  await set.save();
  return true;
}
