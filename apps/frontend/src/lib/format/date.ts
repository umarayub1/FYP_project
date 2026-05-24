// Intl-based date formatters — always pass locale from i18n context in real usage
const locale = () =>
  typeof navigator !== 'undefined' ? navigator.language : 'en-US';

export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale(), options).format(new Date(date));
}

export function formatRelative(date: Date | string | number): string {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);

  if (abs < 60)   return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function formatDateTime(date: Date | string | number): string {
  return formatDate(date, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDateShort(date: Date | string | number): string {
  return formatDate(date, { month: 'short', day: 'numeric' });
}
