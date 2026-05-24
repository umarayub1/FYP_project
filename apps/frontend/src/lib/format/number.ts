const locale = () =>
  typeof navigator !== 'undefined' ? navigator.language : 'en-US';

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), options).format(value);
}

export function formatCompact(value: number): string {
  return formatNumber(value, { notation: 'compact', compactDisplay: 'short' });
}

export function formatPercent(value: number, decimals = 0): string {
  return formatNumber(value / 100, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatOrdinal(value: number): string {
  const pr = new Intl.PluralRules(locale(), { type: 'ordinal' });
  const suffixes: Record<string, string> = {
    one: 'st', two: 'nd', few: 'rd', other: 'th',
  };
  return `${value}${suffixes[pr.select(value)] ?? 'th'}`;
}
