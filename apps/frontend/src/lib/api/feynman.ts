import { gatewayDelete, gatewayGet, gatewayPost } from './gateway';

export interface CoverageChunk {
  id:     string;
  label:  string;
  status: 'covered' | 'partial' | 'missing';
}

export interface FeynmanSession {
  _id:                string;
  studySetId:         string;
  documentId?:        string;
  topic:              string;
  status:             'active' | 'paused' | 'complete';
  clarityScore?:      number;
  accuracyScore?:     number;
  coverage:           CoverageChunk[];
  explanation:        string;
  scheduledReviewAt?: string;
  createdAt:          string;
  updatedAt:          string;
}

export interface StartSessionPayload {
  studySetId:  string;
  documentId?: string;
  topic:       string;
}

/** Source of the rubric concepts for a Feynman evaluation.
 * - 'study_set': grounded in chunks from the user's uploaded material
 * - 'generic':   LLM-only fallback (no source matched the topic)
 * - 'none':      neither path produced a concept list (too-short input,
 *                no chunks indexed for the user, etc.) */
export type FeynmanGradingSource = 'study_set' | 'generic' | 'none';

export interface FeynmanStartResponse {
  _id:      string;
  question: string;
  topic:    string;
  /** Cross-set fit hint: study sets *other than the user's chosen one* that
   *  contain topically-relevant chunks. Ordered by closeness, capped at a few.
   *  Empty when the chosen set is the unique match. The FE renders a chooser
   *  when this is non-empty so the user can switch. */
  suggestedSets?: Array<{ studySetId: string; studySetName: string }>;
}

export interface EvaluatePayload {
  sessionId:   string;
  explanation: string;
}

export interface EvaluateResult {
  coverage:      CoverageChunk[];
  clarityScore:  number;
  accuracyScore: number;
  skepticQuestion?: string;
  /** When 'generic', the FE labels the coverage panel so the user knows
   *  they're being graded against the LLM's general knowledge of the topic,
   *  not their uploaded material. */
  source?:       FeynmanGradingSource;
}

export interface DueFeynmanSchedule {
  _id:          string;
  topic:        string;
  studySetId:   string;
  studySetName: string;
  nextReviewAt: string;
}

export async function getFeynmanSessions(setId: string): Promise<FeynmanSession[]> {
  return gatewayGet<FeynmanSession[]>(`/study-sets/${setId}/feynman/sessions`);
}

export async function getFeynmanSession(sessionId: string): Promise<FeynmanSession> {
  return gatewayGet<FeynmanSession>(`/feynman/${sessionId}`);
}

export async function startFeynmanSession(
  payload: StartSessionPayload,
): Promise<FeynmanStartResponse> {
  return gatewayPost<FeynmanStartResponse>('/ai/feynman/start', payload);
}

export async function deleteFeynmanSession(sessionId: string): Promise<void> {
  return gatewayDelete(`/feynman/${sessionId}`);
}

export interface SocraticChatMessage {
  role:    'user' | 'assistant';
  content: string;
}

export async function feynmanSocraticChat(
  sessionId: string,
  message:   string,
  history:   SocraticChatMessage[],
): Promise<{ question: string }> {
  return gatewayPost('/ai/feynman/socratic-chat', { sessionId, message, history });
}
