import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background:      'hsl(var(--background) / <alpha-value>)',
        surface:         'hsl(var(--surface) / <alpha-value>)',
        'surface-2':     'hsl(var(--surface-2) / <alpha-value>)',
        'surface-3':     'hsl(var(--surface-3) / <alpha-value>)',
        border:          'hsl(var(--border) / <alpha-value>)',
        'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',

        foreground:            'hsl(var(--foreground) / <alpha-value>)',
        'foreground-muted':    'hsl(var(--foreground-muted) / <alpha-value>)',
        'foreground-subtle':   'hsl(var(--foreground-subtle) / <alpha-value>)',
        'foreground-disabled': 'hsl(var(--foreground-disabled) / <alpha-value>)',

        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          fg:      'hsl(var(--primary-fg) / <alpha-value>)',
          soft:    'hsl(var(--primary-soft) / <alpha-value>)',
          hover:   'hsl(var(--primary-hover) / <alpha-value>)',
          active:  'hsl(var(--primary-active) / <alpha-value>)',
        },

        success: { DEFAULT: 'hsl(var(--success) / <alpha-value>)', soft: 'hsl(var(--success-soft) / <alpha-value>)' },
        warning: { DEFAULT: 'hsl(var(--warning) / <alpha-value>)', soft: 'hsl(var(--warning-soft) / <alpha-value>)' },
        danger:  { DEFAULT: 'hsl(var(--danger) / <alpha-value>)',  soft: 'hsl(var(--danger-soft) / <alpha-value>)'  },
        info:    { DEFAULT: 'hsl(var(--info) / <alpha-value>)',    soft: 'hsl(var(--info-soft) / <alpha-value>)'    },
        amber:   { DEFAULT: 'hsl(var(--amber) / <alpha-value>)',   soft: 'hsl(var(--amber-soft) / <alpha-value>)'   },

        'sm2-again': 'hsl(var(--sm2-again) / <alpha-value>)',
        'sm2-hard':  'hsl(var(--sm2-hard) / <alpha-value>)',
        'sm2-good':  'hsl(var(--sm2-good) / <alpha-value>)',
        'sm2-easy':  'hsl(var(--sm2-easy) / <alpha-value>)',

        'focus-ring': 'hsl(var(--focus-ring) / <alpha-value>)',
      },

      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        full: 'var(--radius-full)',
        DEFAULT: 'var(--radius-md)',
      },

      boxShadow: {
        sm:    'var(--shadow-sm)',
        md:    'var(--shadow-md)',
        lg:    'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },

      fontFamily: {
        sans:  ['var(--font-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono:  ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        display: ['36px', { lineHeight: '1.15', fontWeight: '300', letterSpacing: '-0.02em' }],
        h1:      ['28px', { lineHeight: '1.2',  fontWeight: '400', letterSpacing: '-0.015em' }],
        h2:      ['20px', { lineHeight: '1.3',  fontWeight: '500', letterSpacing: '-0.01em' }],
        h3:      ['15px', { lineHeight: '1.4',  fontWeight: '500', letterSpacing: '0' }],
        body:    ['14px', { lineHeight: '1.6',  fontWeight: '400' }],
        'body-lg': ['16px', { lineHeight: '1.65', fontWeight: '400' }],
        small:   ['12px', { lineHeight: '1.5',  fontWeight: '500' }],
        code:    ['12px', { lineHeight: '1',    fontWeight: '500' }],
      },

      transitionTimingFunction: {
        'ease-out':    'cubic-bezier(0.16, 1, 0.3, 1)',
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      transitionDuration: {
        instant: '80ms',
        fast:    '120ms',
        DEFAULT: '180ms',
        slow:    '280ms',
      },

      zIndex: {
        base:     '0',
        sticky:   '10',
        dropdown: '20',
        overlay:  '30',
        modal:    '40',
        toast:    '50',
        tooltip:  '60',
      },

      spacing: {
        'content-x': 'var(--space-content-x)',
        'panel-x':   'var(--space-panel-x)',
        'block-y':   'var(--space-block-y)',
        'card-y':    'var(--space-card-y)',
        'section-y': 'var(--space-section-y)',
      },
    },
  },
  plugins: [],
};

export default config;
