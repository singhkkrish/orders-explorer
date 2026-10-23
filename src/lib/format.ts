const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

export const EMPTY = '—';

/** ₹1,23,456.50 (Indian digit grouping). */
export const formatAmount = (n: number | null): string => (n === null ? EMPTY : inr.format(n));

/** One format everywhere in the grid: `14 Mar 2025, 09:30` (UTC). */
export function formatDateTime(ms: number | null): string {
  if (ms === null) return EMPTY;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** Strictly parses a `YYYY-MM-DD` date-input value to the UTC start of that day. */
export function parseDateInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const c = new Date(ms);
  return c.getUTCFullYear() === y && c.getUTCMonth() === mo - 1 && c.getUTCDate() === d ? ms : null;
}

/** `YYYY-MM-DD` (date input value) -> `14 Mar 2025`. */
export function formatDateInput(v: string): string {
  const ms = parseDateInput(v);
  if (ms === null) return v;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const formatInt = (n: number): string => new Intl.NumberFormat('en-IN').format(n);

export const isoOrEmpty = (ms: number | null): string => (ms === null ? '' : new Date(ms).toISOString());
