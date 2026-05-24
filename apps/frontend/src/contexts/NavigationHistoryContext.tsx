'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

const MAX_STACK = 50;

interface Router {
  push: (href: string) => void;
}

interface NavigationHistoryContextValue {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: (router: Router) => void;
  goForward: (router: Router) => void;
  isStudySession: (pathname: string) => boolean;
}

const NavigationHistoryContext = createContext<NavigationHistoryContextValue | null>(null);

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stackRef = useRef<string[]>([]);
  const [index, setIndex] = useState(-1);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }

    const stack = stackRef.current;
    const currentPath = stack[index] ?? '';

    if (pathname === currentPath) return;

    // Truncate forward history and push new path
    const newStack = stack.slice(0, index + 1);
    newStack.push(pathname);

    if (newStack.length > MAX_STACK) {
      newStack.shift();
    }

    stackRef.current = newStack;
    setIndex(newStack.length - 1);
  }, [pathname, index]);

  const canGoBack = index > 0;
  const canGoForward = index < stackRef.current.length - 1;

  function goBack(router: Router) {
    if (!canGoBack) return;
    isNavigatingRef.current = true;
    const newIndex = index - 1;
    setIndex(newIndex);
    router.push(stackRef.current[newIndex]);
  }

  function goForward(router: Router) {
    if (!canGoForward) return;
    isNavigatingRef.current = true;
    const newIndex = index + 1;
    setIndex(newIndex);
    router.push(stackRef.current[newIndex]);
  }

  function isStudySession(path: string): boolean {
    return (
      /\/sets\/[^/]+\/flashcards\/review/.test(path) ||
      /\/sets\/[^/]+\/feynman\/[^/]+/.test(path)
    );
  }

  return (
    <NavigationHistoryContext.Provider value={{ canGoBack, canGoForward, goBack, goForward, isStudySession }}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory() {
  const ctx = useContext(NavigationHistoryContext);
  if (!ctx) throw new Error('useNavigationHistory must be used within NavigationHistoryProvider');
  return ctx;
}
