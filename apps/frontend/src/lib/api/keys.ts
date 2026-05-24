export const API_ROUTES = {
  coachConversations: (studySetId: string) =>
    `/coach/conversations?studySetId=${encodeURIComponent(studySetId)}`,
  coachConversation: (id: string) => `/coach/conversations/${id}`,
  pdfCheckpoints: (docId: string) => `/pdfs/${docId}/checkpoints`,
} as const;
