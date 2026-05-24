import { Types } from 'mongoose';
import { Deadline, IDeadline, DeadlineType } from '../models/Deadline';

export interface DeadlineDTO {
  id:               string;
  userId:           string;
  studySetId:       string | null;
  type:             DeadlineType;
  label:            string;
  date:             string;
  notifyDaysBefore: number[];
  snoozeUntil:      string | null;
  remindedAt:       string | null;
  passedAt:         string | null;
  createdAt:        string;
  updatedAt:        string;
}

export function serializeDeadline(d: IDeadline): DeadlineDTO {
  return {
    id:               (d._id as Types.ObjectId).toString(),
    userId:           d.userId.toString(),
    studySetId:       d.studySetId ? d.studySetId.toString() : null,
    type:             d.type,
    label:            d.label,
    date:             d.date.toISOString(),
    notifyDaysBefore: d.notifyDaysBefore ?? [],
    snoozeUntil:      d.snoozeUntil ? d.snoozeUntil.toISOString() : null,
    remindedAt:       d.remindedAt ? d.remindedAt.toISOString() : null,
    passedAt:         d.passedAt ? d.passedAt.toISOString() : null,
    createdAt:        d.createdAt.toISOString(),
    updatedAt:        d.updatedAt.toISOString(),
  };
}

export type ListFilter = 'all' | 'today' | 'week' | 'critical' | 'upcoming' | 'passed';

export async function listDeadlines(
  userId: string,
  opts: { studySetId?: string | null; filter?: ListFilter } = {},
): Promise<DeadlineDTO[]> {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday   = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek    = new Date(now); endOfWeek.setDate(endOfWeek.getDate() + 7);
  const threeDaysOut = new Date(now); threeDaysOut.setDate(threeDaysOut.getDate() + 3);

  const filter = opts.filter ?? 'all';

  const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (opts.studySetId === null) {
    query.studySetId = null;
  } else if (opts.studySetId) {
    query.studySetId = new Types.ObjectId(opts.studySetId);
  }

  switch (filter) {
    case 'today':
      query.date     = { $gte: startOfToday, $lte: endOfToday };
      query.passedAt = null;
      break;
    case 'week':
      query.date     = { $gte: startOfToday, $lte: endOfWeek };
      query.passedAt = null;
      break;
    case 'critical':
      query.date     = { $gte: startOfToday, $lte: threeDaysOut };
      query.passedAt = null;
      break;
    case 'upcoming':
      query.date     = { $gt: now };
      query.passedAt = null;
      break;
    case 'passed':
      query.passedAt = { $ne: null };
      break;
    case 'all':
    default:
      break;
  }

  const docs = await Deadline.find(query).sort({ date: 1 });
  return docs.map(serializeDeadline);
}

export async function getDeadline(id: string, userId: string): Promise<DeadlineDTO | null> {
  const d = await Deadline.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  return d ? serializeDeadline(d) : null;
}

export interface CreateDeadlineInput {
  type:             DeadlineType;
  label:            string;
  date:             string;
  notifyDaysBefore?: number[];
  studySetId?:      string | null;
}

export async function createDeadline(userId: string, input: CreateDeadlineInput): Promise<DeadlineDTO> {
  const created = await Deadline.create({
    userId:           new Types.ObjectId(userId),
    studySetId:       input.studySetId ? new Types.ObjectId(input.studySetId) : null,
    type:             input.type,
    label:            input.label,
    date:             new Date(input.date),
    notifyDaysBefore: input.notifyDaysBefore ?? [7, 3, 1],
  });
  return serializeDeadline(created);
}

export interface UpdateDeadlineInput {
  type?:             DeadlineType;
  label?:            string;
  date?:             string;
  notifyDaysBefore?: number[];
  studySetId?:       string | null;
  snoozeUntil?:      string | null;
  passedAt?:         string | null;
}

export async function updateDeadline(
  id: string,
  userId: string,
  patch: UpdateDeadlineInput,
): Promise<DeadlineDTO | null> {
  const d = await Deadline.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  if (!d) return null;
  if (patch.type !== undefined) d.type = patch.type;
  if (patch.label !== undefined) d.label = patch.label;
  if (patch.date !== undefined) d.date = new Date(patch.date);
  if (patch.notifyDaysBefore !== undefined) d.notifyDaysBefore = patch.notifyDaysBefore;
  if (patch.studySetId !== undefined) {
    d.studySetId = patch.studySetId ? new Types.ObjectId(patch.studySetId) : null;
  }
  if (patch.snoozeUntil !== undefined) {
    d.snoozeUntil = patch.snoozeUntil ? new Date(patch.snoozeUntil) : null;
  }
  if (patch.passedAt !== undefined) {
    d.passedAt = patch.passedAt ? new Date(patch.passedAt) : null;
  }
  await d.save();
  return serializeDeadline(d);
}

export async function snoozeDeadline(
  id: string,
  userId: string,
  snoozeUntil: Date,
): Promise<DeadlineDTO | null> {
  const d = await Deadline.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId) },
    { $set: { snoozeUntil } },
    { new: true },
  );
  return d ? serializeDeadline(d) : null;
}

export async function deleteDeadline(id: string, userId: string): Promise<boolean> {
  const result = await Deadline.deleteOne({ _id: id, userId: new Types.ObjectId(userId) });
  return result.deletedCount === 1;
}
