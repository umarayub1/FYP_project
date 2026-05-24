import { gatewayGet, gatewayPost, gatewayPatch, gatewayDelete } from './gateway';

export interface Deadline {
  id:               string;
  studySetId:       string;
  type:             'exam' | 'quiz' | 'assignment' | 'custom';
  label:            string;
  date:             string;   // ISO 8601 date only (YYYY-MM-DD)
  notifyDaysBefore: number[];
  createdAt:        string;
  passedAt?:        string;
}

export interface StudySet {
  _id:        string;
  name:       string;
  color:      string;
  userId:     string;
  deadlines:  Deadline[];
  createdAt:  string;
  updatedAt:  string;
  archived?:  boolean;
  archivedAt?: string;
  dueCount?:  number;
}

export async function getStudySets(opts?: { includeArchived?: boolean }): Promise<StudySet[]> {
  const qs = opts?.includeArchived ? '?includeArchived=true' : '';
  return gatewayGet<StudySet[]>(`/study-sets${qs}`);
}

export async function archiveStudySet(setId: string, archive: boolean): Promise<StudySet> {
  return gatewayPatch<StudySet>(`/study-sets/${setId}/archive`, { archived: archive });
}

export async function createStudySet(payload: { name: string; color: string }): Promise<StudySet> {
  return gatewayPost<StudySet>('/study-sets', payload);
}

export async function updateStudySet(setId: string, payload: { name?: string; color?: string }): Promise<StudySet> {
  return gatewayPatch<StudySet>(`/study-sets/${setId}`, payload);
}

export async function deleteStudySet(setId: string): Promise<void> {
  return gatewayDelete(`/study-sets/${setId}`);
}

export type DeadlinePayload = Omit<Deadline, 'id' | 'studySetId' | 'createdAt' | 'passedAt'>;

export async function addDeadline(setId: string, payload: DeadlinePayload): Promise<Deadline> {
  return gatewayPost<Deadline>(`/study-sets/${setId}/deadlines`, payload);
}

export async function updateDeadline(setId: string, deadlineId: string, payload: Partial<DeadlinePayload>): Promise<Deadline> {
  return gatewayPatch<Deadline>(`/study-sets/${setId}/deadlines/${deadlineId}`, payload);
}

export async function deleteDeadline(setId: string, deadlineId: string): Promise<void> {
  return gatewayDelete(`/study-sets/${setId}/deadlines/${deadlineId}`);
}

export interface ReadinessBreakdown {
  retentionRate:      number;
  feynmanClarity:     number;
  deadlineUrgency:    number;
  reviewCompleteness: number;
}

export async function getReadinessScore(setId: string): Promise<{ score: number; breakdown: ReadinessBreakdown }> {
  return gatewayGet(`/study-sets/${setId}/readiness`);
}

export interface SetAnalytics {
  totalCards:             number;
  dueCards:               number;
  overdueCards?:          number;
  readinessScore:         number;
  avgEaseFactor:          number;
  reviewSessionsThisWeek: number;
  avgSessionDurationMin:  number;
  retentionRate?:         number;
  retentionTrend?:        number;
  sessionAccuracies?:     number[];
  topicsWithCoverage?:    number;
  totalTopics?:           number;
  lastSessionLabel?:      string;
  lastSessionAgo?:        string;
}

export async function getSetAnalytics(setId: string): Promise<SetAnalytics> {
  return gatewayGet<SetAnalytics>(`/study-sets/${setId}/analytics`);
}
