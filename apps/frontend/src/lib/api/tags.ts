import { gatewayGet, gatewayPost, gatewayPatch, gatewayDelete } from './gateway';

export interface Tag {
  _id:        string;
  name:       string;
  slug:       string;
  color?:     string;
  global:     boolean;
  usageCount: number;
}

export interface TaggedItems {
  notes:      { _id: string; title: string; studySetId: string; updatedAt: string }[];
  flashcards: { _id: string; front: string; studySetId: string; updatedAt: string }[];
  documents:  { _id: string; title: string; studySetId: string; updatedAt: string }[];
}

export async function getTags(): Promise<Tag[]> {
  return gatewayGet<Tag[]>('/tags');
}

export async function getTagBySlug(slug: string): Promise<Tag> {
  return gatewayGet<Tag>(`/tags?slug=${encodeURIComponent(slug)}`).then((res) => {
    const tag = Array.isArray(res) ? res[0] : res;
    if (!tag) throw new Error('Tag not found');
    return tag;
  });
}

export async function getTagItems(tagId: string): Promise<TaggedItems> {
  return gatewayGet<TaggedItems>(`/tags/${tagId}/items`);
}

export async function createTag(name: string): Promise<Tag> {
  return gatewayPost<Tag>('/tags', { name });
}

export async function renameTag(id: string, name: string): Promise<Tag> {
  return gatewayPatch<Tag>(`/tags/${id}`, { name });
}

export async function deleteTag(id: string): Promise<void> {
  return gatewayDelete(`/tags/${id}`);
}

export async function mergeTag(sourceId: string, targetId: string): Promise<void> {
  return gatewayPost<void>('/tags/merge', { sourceId, targetId });
}

export async function promoteTag(id: string): Promise<Tag> {
  return gatewayPatch<Tag>(`/tags/${id}/promote`, {});
}
