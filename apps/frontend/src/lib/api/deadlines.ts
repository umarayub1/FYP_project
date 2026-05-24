import { gatewayGet, gatewayPost, gatewayPatch, gatewayDelete } from './gateway';

export type DeadlineType = 'exam' | 'quiz' | 'assignment' | 'custom';
export type DeadlineFilter = 'all' | 'today' | 'week' | 'critical' | 'upcoming' | 'passed';

export interface Deadline {
  id:               string;
  userId:           string;
  studySetId:       string | null;
  type:             DeadlineType;
  label:            string;
  date:             string;   // ISO 8601 datetime
  notifyDaysBefore: number[];
  snoozeUntil:      string | null;
  remindedAt:       string | null;
  passedAt:         string | null;
  createdAt:        string;
  updatedAt:        string;
}

export interface CreateDeadlineInput {
  type:             DeadlineType;
  label:            string;
  date:             string;
  notifyDaysBefore?: number[];
  studySetId?:      string | null;
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

export async function listDeadlines(opts: { filter?: DeadlineFilter } = {}): Promise<Deadline[]> {
  const params = new URLSearchParams();
  if (opts.filter) params.set('filter', opts.filter);
  const qs = params.toString();
  return gatewayGet<Deadline[]>(`/deadlines${qs ? `?${qs}` : ''}`);
}

export async function createDeadline(input: CreateDeadlineInput): Promise<Deadline> {
  return gatewayPost<Deadline>('/deadlines', input);
}

export async function updateDeadline(id: string, patch: UpdateDeadlineInput): Promise<Deadline> {
  return gatewayPatch<Deadline>(`/deadlines/${id}`, patch);
}

export async function snoozeDeadline(id: string, snoozeUntil: string): Promise<Deadline> {
  return gatewayPost<Deadline>(`/deadlines/${id}/snooze`, { snoozeUntil });
}

export async function markDeadlinePassed(id: string): Promise<Deadline> {
  return updateDeadline(id, { passedAt: new Date().toISOString() });
}

export async function unmarkDeadlinePassed(id: string): Promise<Deadline> {
  return updateDeadline(id, { passedAt: null });
}

export async function deleteDeadline(id: string): Promise<void> {
  return gatewayDelete(`/deadlines/${id}`);
}
