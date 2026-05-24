import { gatewayGet } from './gateway';

export interface LeechCard {
  _id:          string;
  front:        string;
  back:         string;
  isLeech:      boolean;
  againCount:   number;
  studySetId:   string;
  studySetName: string | null;
  suspended?:   boolean;
}

export interface WeakTopic {
  topic:        string;
  studySetId:   string;
  studySetName: string | null;
  clarityScore: number;
  sessionId:    string;
}

export interface WeakpointsResponse {
  leechCards: LeechCard[];
  weakTopics: WeakTopic[];
}

export async function getWeakpoints(): Promise<WeakpointsResponse> {
  return gatewayGet<WeakpointsResponse>('/weakpoints');
}
