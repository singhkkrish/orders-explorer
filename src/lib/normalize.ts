/**
 * Data loading rules from data-notes.md, applied in ONE place before the data reaches
 * the grid or the filters. The source file is never modified.
 */
import {
  CHANNEL_VALUES,
  PAYMENT_VALUES,
  REGION_VALUES,
  STATUS_VALUES,
  type Order,
  type Priority,
} from './schema';

export interface NormalizationReport {
  sourceRecords: number;
  uniqueOrders: number;
  duplicatesRemoved: number;
  /** Records without a usable id/schemaVersion (not expected; counted, never invented). */
  skippedInvalid: number;
  unparseableCreatedAt: number;
  unparseableAmounts: number;
  unrecognisedEnumValues: number;
}

const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;
const ISO_NO_ZONE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?)?$/;
const MIN_TS = Date.UTC(1970, 0, 1);
const MAX_TS = Date.UTC(2100, 0, 1);

/**
 * Parses the four date formats listed in data-notes.md into epoch milliseconds (UTC):
 * ISO with zone, ISO without zone (UTC), epoch seconds, and DD/MM/YYYY (midnight UTC).
 * Returns null for anything else.
 */
export function parseDate(value: unknown): number | null {
  let ms: number;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    ms = value * 1000; // epoch seconds
  } else if (typeof value === 'string') {
    const s = value.trim();
    const dmy = DMY.exec(s);
    if (dmy) {
      const [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
      ms = Date.UTC(y, m - 1, d);
      const check = new Date(ms); // reject 31/02/2025 style overflow
      if (check.getUTCDate() !== d || check.getUTCMonth() !== m - 1) return null;
    } else if (ISO_WITH_ZONE.test(s)) {
      ms = Date.parse(s);
    } else if (ISO_NO_ZONE.test(s)) {
      ms = Date.parse(s.includes('T') ? `${s}Z` : `${s}T00:00:00Z`);
    } else {
      return null;
    }
  } else {
    return null;
  }
  return Number.isFinite(ms) && ms >= MIN_TS && ms < MAX_TS ? ms : null;
}

/** Amount to rupees: v1 stores paise, v2 stores rupees; strings are parsed as numbers. */
export function parseAmount(raw: unknown, schemaVersion: unknown): number | null {
  let n = NaN;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && raw.trim() !== '') n = Number(raw.trim());
  if (!Number.isFinite(n)) return null;
  if (schemaVersion === 1) n = n / 100;
  else if (schemaVersion !== 2) return null; // unknown unit: refuse to guess
  return Math.round(n * 100) / 100;
}

function pickEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Normalises one raw record; returns null if it has no usable id or schemaVersion. */
export function normalizeRecord(raw: unknown, counters?: Partial<NormalizationReport>): Order | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  if (!id) return null;
  const schemaVersion = r.schemaVersion === 1 || r.schemaVersion === 2 ? r.schemaVersion : null;
  if (schemaVersion === null) return null;

  const bump = (k: keyof NormalizationReport) => {
    if (counters) counters[k] = (counters[k] ?? 0) + 1;
  };

  const customer = (str(r.customerName) || str(r.customer_name)).trim(); // two names, one field
  const email = str(r.customerEmail).trim();
  const status = pickEnum(r.status, STATUS_VALUES);
  const region = pickEnum(r.region, REGION_VALUES);
  const channel = pickEnum(r.channel, CHANNEL_VALUES);
  const paymentMethod = pickEnum(r.paymentMethod, PAYMENT_VALUES);
  if (!status || !region || !channel || !paymentMethod) bump('unrecognisedEnumValues');

  const amount = parseAmount(r.amount, schemaVersion);
  if (amount === null) bump('unparseableAmounts');
  const createdAt = parseDate(r.createdAt);
  if (createdAt === null) bump('unparseableCreatedAt');
  const updatedAt = r.updatedAt == null ? null : parseDate(r.updatedAt); // null and missing are the same

  const p = r.priority;
  const priority: Priority | null = p === 1 || p === 2 || p === 3 ? p : null;
  const itemCount = typeof r.itemCount === 'number' && Number.isFinite(r.itemCount) ? r.itemCount : null;
  const notes = typeof r.notes === 'string' ? r.notes : '';

  return {
    id,
    schemaVersion,
    customer,
    email,
    status,
    amount,
    currency: str(r.currency).trim().toUpperCase(),
    createdAt,
    updatedAt,
    region,
    channel,
    priority,
    paymentMethod,
    itemCount,
    notes,
    lc: { id: id.toLowerCase(), customer: customer.toLowerCase(), email: email.toLowerCase(), notes: notes.toLowerCase() },
  };
}

/** Duplicate-ID rule (data-notes #7). `later` is the record that appears later in the file. */
export function pickDuplicateWinner(earlier: Order, later: Order): Order {
  const a = earlier.updatedAt;
  const b = later.updatedAt;
  if (a !== null && b !== null) return b >= a ? later : earlier; // later updatedAt; tie -> later in file
  if (a !== null) return earlier;
  if (b !== null) return later;
  return later;
}

export function normalizeOrders(rawRecords: readonly unknown[]): { orders: Order[]; report: NormalizationReport } {
  const counters: Partial<NormalizationReport> = {};
  const slotById = new Map<string, number>();
  const orders: Order[] = [];
  let duplicatesRemoved = 0;
  let skippedInvalid = 0;

  for (const raw of rawRecords) {
    const order = normalizeRecord(raw, counters);
    if (!order) {
      skippedInvalid++;
      continue;
    }
    const slot = slotById.get(order.id);
    if (slot === undefined) {
      slotById.set(order.id, orders.length);
      orders.push(order);
    } else {
      duplicatesRemoved++;
      orders[slot] = pickDuplicateWinner(orders[slot]!, order); // winner keeps the first occurrence's position
    }
  }

  return {
    orders,
    report: {
      sourceRecords: rawRecords.length,
      uniqueOrders: orders.length,
      duplicatesRemoved,
      skippedInvalid,
      unparseableCreatedAt: counters.unparseableCreatedAt ?? 0,
      unparseableAmounts: counters.unparseableAmounts ?? 0,
      unrecognisedEnumValues: counters.unrecognisedEnumValues ?? 0,
    },
  };
}
