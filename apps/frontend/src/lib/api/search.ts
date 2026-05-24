import { gatewayGet } from './gateway';

export interface SearchResult {
  id:             string;
  type:           'note' | 'pdf' | 'flashcard' | 'chat';
  title:          string;
  studySetName:   string;
  studySetId:     string;
  excerpt:        string;
  matchRanges:    { start: number; end: number }[];
  pageNumber?:    number;
  matchCount?:    number;
}

export interface SearchOptions {
  type?:       string;
  studySetId?: string;
  tagSlug?:    string;
}

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (options.type)       params.set('type',  options.type);
  if (options.studySetId) params.set('setId', options.studySetId);
  if (options.tagSlug)    params.set('tag',   options.tagSlug);
  return gatewayGet<SearchResult[]>(`/search?${params.toString()}`);
}
