'use client';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface HintQueueValue {
  register: (id: string) => void;
  unregister: (id: string) => void;
  isActive: (id: string) => boolean;
}

const HintQueueContext = createContext<HintQueueValue>({
  register: () => {},
  unregister: () => {},
  isActive: () => false,
});

export function HintQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<string[]>([]);

  const register = useCallback((id: string) => {
    setQueue(q => (q.includes(id) ? q : [...q, id]));
  }, []);

  const unregister = useCallback((id: string) => {
    setQueue(q => q.filter(h => h !== id));
  }, []);

  const isActive = useCallback((id: string) => queue[0] === id, [queue]);

  return (
    <HintQueueContext.Provider value={{ register, unregister, isActive }}>
      {children}
    </HintQueueContext.Provider>
  );
}

export const useHintQueue = () => useContext(HintQueueContext);
