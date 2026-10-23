import { isoOrEmpty } from './format';
import { enumValue, optionLabel, type Order } from './schema';

interface CsvColumn {
  header: string;
  get: (o: Order) => string;
  /** Free-text columns get spreadsheet-formula protection. */
  text?: boolean;
}

/** Missing values are exported as empty cells, except priority which exports the label `None`. */
export const CSV_COLUMNS: readonly CsvColumn[] = [
  { header: 'id', get: (o) => o.id, text: true },
  { header: 'customer', get: (o) => o.customer, text: true },
  { header: 'email', get: (o) => o.email, text: true },
  { header: 'status', get: (o) => (o.status ? optionLabel('status', o.status) : '') },
  { header: 'amount_inr', get: (o) => (o.amount === null ? '' : o.amount.toFixed(2)) },
  { header: 'currency', get: (o) => o.currency },
  { header: 'created_at_utc', get: (o) => isoOrEmpty(o.createdAt) },
  { header: 'updated_at_utc', get: (o) => isoOrEmpty(o.updatedAt) },
  { header: 'region', get: (o) => (o.region ? optionLabel('region', o.region) : '') },
  { header: 'channel', get: (o) => (o.channel ? optionLabel('channel', o.channel) : '') },
  { header: 'priority', get: (o) => (enumValue(o, 'priority') === 'none' ? 'None' : String(o.priority)) },
  { header: 'payment_method', get: (o) => (o.paymentMethod ? optionLabel('paymentMethod', o.paymentMethod) : '') },
  { header: 'item_count', get: (o) => (o.itemCount === null ? '' : String(o.itemCount)) },
  { header: 'notes', get: (o) => o.notes, text: true },
];

/** RFC 4180 quoting: wrap in quotes when the value has a comma, quote, CR or LF; double inner quotes. */
export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Prefix `'` when text would be interpreted as a formula by Excel/Sheets (CSV injection). */
export const guardFormula = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export const CSV_BOM = '\uFEFF'; // lets Excel open the file as UTF-8
export const CSV_EOL = '\r\n';

export function toCsv(orders: readonly Order[]): string {
  const lines = [CSV_COLUMNS.map((c) => escapeCsvField(c.header)).join(',')];
  for (const o of orders) {
    lines.push(CSV_COLUMNS.map((c) => escapeCsvField(c.text ? guardFormula(c.get(o)) : c.get(o))).join(','));
  }
  return CSV_BOM + lines.join(CSV_EOL) + CSV_EOL;
}

export function csvFilename(count: number, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `orders-selected-${count}-${stamp}.csv`;
}

/** Triggers a real file download and releases the object URL afterwards. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
