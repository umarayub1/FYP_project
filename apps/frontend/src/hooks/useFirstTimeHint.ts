'use client';
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'synapse:hints:seen';

function readSeen(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function addSeen(hintId: string): void {
  try {
    const arr = readSeen();
    if (!arr.includes(hintId)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...arr, hintId]));
    }
  } catch {}
}

export function useFirstTimeHint(hintId: string): { shouldShow: boolean; dismiss: () => void } {
  const [seen, setSeen] = useState<boolean>(() => readSeen().includes(hintId));

  const dismiss = useCallback(() => {
    setSeen(true);
    addSeen(hintId);
  }, [hintId]);

  return { shouldShow: !seen, dismiss };
}
