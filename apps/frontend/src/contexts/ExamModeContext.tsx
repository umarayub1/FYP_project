'use client';

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getStudySets, type StudySet } from '@/lib/api/study-sets';

interface ExamModeState {
  examMode: boolean;
  examSetName: string;
  daysRemaining: number;
}

const ExamModeContext = createContext<ExamModeState>({
  examMode: false,
  examSetName: '',
  daysRemaining: 0,
});

export function useExamMode() {
  return useContext(ExamModeContext);
}

function computeExamMode(sets: StudySet[]): ExamModeState {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let nearest: { days: number; setName: string } | null = null;

  for (const set of sets) {
    for (const d of set.deadlines ?? []) {
      if (d.passedAt || d.type !== 'exam') continue;
      const target = new Date(d.date + 'T00:00:00');
      const days = Math.round((target.getTime() - today.getTime()) / 86400000);
      if (days >= 0 && days <= 3) {
        if (!nearest || days < nearest.days) {
          nearest = { days, setName: set.name };
        }
      }
    }
  }

  if (!nearest) return { examMode: false, examSetName: '', daysRemaining: 0 };
  return { examMode: true, examSetName: nearest.setName, daysRemaining: nearest.days };
}

const SESSION_KEY = 'synapse:exam-mode:activated';

export function ExamModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ExamModeState>({ examMode: false, examSetName: '', daysRemaining: 0 });
  const setsRef = useRef<StudySet[]>([]);
  const toastFiredRef = useRef(false);

  function applyState(sets: StudySet[]) {
    const next = computeExamMode(sets);
    setState(next);
    if (next.examMode && !toastFiredRef.current) {
      toastFiredRef.current = true;
      try {
        if (!sessionStorage.getItem(SESSION_KEY)) {
          sessionStorage.setItem(SESSION_KEY, '1');
          toast(`Exam Mode activated for ${next.examSetName} — ${next.daysRemaining} day${next.daysRemaining !== 1 ? 's' : ''} to go.`);
        }
      } catch {
        // sessionStorage unavailable (SSR / private browsing edge case)
      }
    }
  }

  useEffect(() => {
    getStudySets({ includeArchived: false })
      .then(sets => {
        setsRef.current = sets;
        applyState(sets);
      })
      .catch(() => {});

    const interval = setInterval(() => {
      applyState(setsRef.current);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ExamModeContext.Provider value={state}>
      {children}
    </ExamModeContext.Provider>
  );
}
