import { gatewayDelete, gatewayGet, gatewayPatch, gatewayPost } from './gateway';
import type { Annotation } from '@/components/pdf/PDFAnnotationLayer';

export interface SynapseDocument {
  _id:              string;
  userId:           string;
  studySetId:       string;
  title:            string;
  type:             'pdf' | 'note';
  storageUri?:      string;
  ingestionStatus:  'pending' | 'processing' | 'ready' | 'failed';
  pageCount?:       number;
  cardsGenerated?:  number;
  createdAt:        string;
  updatedAt:        string;
}

export async function getDocuments(studySetId: string): Promise<SynapseDocument[]> {
  return gatewayGet<SynapseDocument[]>(`/documents?studySetId=${encodeURIComponent(studySetId)}`);
}

export async function getDocument(docId: string): Promise<SynapseDocument> {
  return gatewayGet<SynapseDocument>(`/documents/${docId}`);
}

export async function getDocumentAnnotations(docId: string): Promise<Annotation[]> {
  return gatewayGet<Annotation[]>(`/documents/${docId}/annotations`).catch(() => []);
}

export async function patchDocument(
  docId: string,
  payload: { title?: string; studySetId?: string },
): Promise<SynapseDocument> {
  return gatewayPatch<SynapseDocument>(`/documents/${docId}`, payload);
}

export async function reingestDocument(docId: string): Promise<{ documentId: string }> {
  return gatewayPost<{ documentId: string }>(`/documents/${docId}/reingest`, {});
}

export async function deleteDocument(docId: string): Promise<void> {
  return gatewayDelete(`/documents/${docId}`);
}

export async function bulkDeleteDocuments(ids: string[]): Promise<{ deleted: number }> {
  return gatewayPost<{ deleted: number }>('/documents/bulk-delete', { ids });
}

export async function bulkMoveDocuments(ids: string[], targetSetId: string): Promise<{ moved: number }> {
  return gatewayPost<{ moved: number }>('/documents/bulk-move', { ids, targetSetId });
}
