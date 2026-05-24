'use client';

import { useEffect, useState } from 'react';

export type Platform = 'mac' | 'windows' | 'linux';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'linux';

  // userAgentData is the modern API (Chromium-based browsers)
  const uad = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData;
  if (uad?.platform) {
    const p = uad.platform.toLowerCase();
    if (p.includes('mac'))  return 'mac';
    if (p.includes('win'))  return 'windows';
    return 'linux';
  }

  // Fallback: navigator.platform (deprecated but still reliable for desktop)
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac'))  return 'mac';
  if (platform.includes('win'))  return 'windows';
  return 'linux';
}

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>('linux');

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return platform;
}

/** Returns '⌘' on macOS, 'Ctrl' elsewhere. */
export function useModKey(): string {
  const platform = usePlatform();
  return platform === 'mac' ? '⌘' : 'Ctrl';
}
