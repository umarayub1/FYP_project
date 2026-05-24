'use client';

import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import { gatewayFetch } from '@/lib/api/gateway';

type ActivityType = 'flashcard' | 'feynman' | 'document' | 'coach';

interface StudySessionState {
  startedAt: Date | null;
  activityType: ActivityType | null;
  studySetId: string | null;
}

interface StudySessionContextValue {
  session: StudySessionState;
  isActive: boolean;
  startSession: (type: ActivityType, setId?: string) => void;
  endSession: () => void;
}

const StudySessionContext = createContext<StudySessionContextValue>({
  session: { startedAt: null, activityType: null, studySetId: null },
  isActive: false,
  startSession: () => {},
  endSession: () => {},
});

export function StudySessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StudySessionState>({
    startedAt: null, activityType: null, studySetId: null,
  });
  // ref so the unmount cleanup can read the latest session without stale closure
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const startSession = useCallback((type: ActivityType, setId?: string) => {
    if (sessionRef.current.startedAt) return; // already active (handles strict mode double-mount)
    setSession({ startedAt: new Date(), activityType: type, studySetId: setId ?? null });
  }, []);

  const endSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s.startedAt || !s.activityType) return;
    const endedAt = new Date();
    const durationSeconds = Math.round((endedAt.getTime() - s.startedAt.getTime()) / 1000);
    setSession({ startedAt: null, activityType: null, studySetId: null });
    if (durationSeconds < 10) return;
    const today = new Date().toISOString().split('T')[0];
    gatewayFetch('/user/study-sessions', {
      method: 'POST',
      body: JSON.stringify({
        activityType: s.activityType,
        studySetId: s.studySetId,
        startedAt: s.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds,
        date: today,
      }),
    }).catch(() => {}); // fire-and-forget
  }, []);

  return (
    <StudySessionContext.Provider value={{ session, isActive: session.startedAt !== null, startSession, endSession }}>
      {children}
    </StudySessionContext.Provider>
  );
}

export const useStudySession = () => useContext(StudySessionContext);
