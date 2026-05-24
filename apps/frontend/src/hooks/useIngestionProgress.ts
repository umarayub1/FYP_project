'use client';
import { useEffect, useState } from 'react';
import { getSocket, joinDoc, leaveDoc } from '@/lib/socket';
import { getDocument } from '@/lib/api/documents';

export interface IngestionProgress {
  stage: string;
  percent: number;
  message: string;
  documentId: string;
}

export function useIngestionProgress(docId: string | null): IngestionProgress | null {
  const [progress, setProgress] = useState<IngestionProgress | null>(null);

  useEffect(() => {
    if (!docId) return;

    // Primary: Socket.IO real-time events
    const socket = getSocket();
    joinDoc(docId);
    let rafHandle: number | null = null;
    const handleProgress = (data: IngestionProgress) => {
      if (data.documentId !== docId) return;
      // rAF-coalesce rapid event bursts so the bar interpolates smoothly.
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      rafHandle = requestAnimationFrame(() => setProgress(data));
    };
    socket.on('ingestion:progress', handleProgress);

    // Fallback: poll every 8s in case Socket.IO events don't arrive.
    // With C.3's denser events the WS path should carry; the poll only
    // covers misconfigured environments.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      try {
        const doc = await getDocument(docId!);
        if (cancelled) return;
        if (doc.ingestionStatus === 'ready') {
          setProgress({ stage: 'complete', percent: 100, message: 'Ready', documentId: docId! });
          return;
        }
        if (doc.ingestionStatus === 'failed') {
          setProgress({ stage: 'error', percent: 0, message: 'Processing failed', documentId: docId! });
          return;
        }
        if (doc.ingestionStatus === 'processing') {
          setProgress(prev => prev ?? { stage: 'processing', percent: 30, message: 'Processing…', documentId: docId! });
        }
      } catch { /* non-fatal */ }
      if (!cancelled) timer = setTimeout(poll, 8000);
    }

    // Give Socket.IO 3s to connect; if no event by then, start polling
    timer = setTimeout(poll, 3000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      socket.off('ingestion:progress', handleProgress);
      leaveDoc(docId);
      setProgress(null);
    };
  }, [docId]);

  return progress;
}
