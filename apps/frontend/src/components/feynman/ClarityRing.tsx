'use client';

const CIRC = 2 * Math.PI * 30; // ≈ 188.5

interface ClarityRingProps {
  clarity: number; // 0–100
  topic?:  string;
}

export function ClarityRing({ clarity, topic }: ClarityRingProps) {
  const color =
    clarity > 70  ? 'hsl(var(--success))'
    : clarity >= 40 ? 'hsl(var(--warning))'
    : 'hsl(var(--danger))';

  return (
    <div className="flex flex-col items-center gap-1.5 py-4">
      {topic && (
        <p className="text-[10px] uppercase tracking-wider text-foreground-subtle text-center px-3">
          Coverage · {topic}
        </p>
      )}
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        aria-label={`Clarity score: ${clarity}%`}
        role="img"
      >
        {/* Track */}
        <circle
          cx="36"
          cy="36"
          r="30"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="5"
        />
        {/* Arc */}
        <circle
          cx="36"
          cy="36"
          r="30"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={String(CIRC)}
          strokeDashoffset={CIRC * (1 - clarity / 100)}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
        />
        {/* Score */}
        <text
          x="36"
          y="32"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="18"
          fontWeight="500"
          fontFamily="monospace"
          fill="hsl(var(--foreground))"
        >
          {clarity}
        </text>
        {/* "clarity" label */}
        <text
          x="36"
          y="47"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8"
          fontFamily="sans-serif"
          fill="hsl(var(--foreground-subtle))"
          letterSpacing="0.08em"
        >
          CLARITY
        </text>
      </svg>
    </div>
  );
}
