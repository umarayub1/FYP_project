import { gatewayGet } from './gateway';

export interface NowBriefItem {
  studySetId:    string;
  studySetName:  string;
  studySetColor: string;
  action:        'Review' | 'Read' | 'Practice';
  dueCount:      number;
  overdueCount:  number;
  nextDeadline:  { name: string; date: string; daysUntil: number } | null;
  priorityScore: number;
  examMode:      boolean;
}

export interface NowBrief {
  items:      NowBriefItem[];
  totalDue:   number;
  generatedAt: string;
}

export async function getNowBrief(): Promise<NowBrief> {
  return gatewayGet<NowBrief>('/now-brief');
}
