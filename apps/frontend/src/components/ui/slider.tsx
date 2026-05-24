'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

interface SliderProps {
  value: [number];
  onValueChange: (value: [number]) => void;
  min: number;
  max: number;
  step: number;
  className?: string;
  'aria-label'?: string;
}

export function Slider({ value, onValueChange, min, max, step, className, 'aria-label': ariaLabel }: SliderProps) {
  const pct = ((value[0] - min) / (max - min)) * 100;

  return (
    <div className={cn('relative flex items-center h-5 w-full', className)}>
      <div className="absolute h-1.5 w-full rounded-full bg-border" />
      <div
        className="absolute h-1.5 rounded-full bg-primary"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        aria-label={ariaLabel}
        onChange={(e) => onValueChange([Number(e.target.value)])}
        className={cn(
          'absolute w-full h-full opacity-0 cursor-pointer',
          'focus-visible:outline-none'
        )}
      />
      <div
        className="absolute h-4 w-4 rounded-full border-2 border-primary bg-background shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        style={{ left: `calc(${pct}% - 8px)` }}
        aria-hidden="true"
      />
    </div>
  );
}
