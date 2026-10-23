import { FIELD_BY_KEY, optionLabel, type FieldKey, type Order } from './schema';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  field: FieldKey;
  dir: SortDir;
}

type Key = string | number | null;

/** The comparable value for a field. null = missing: always sorted last, in both directions. */
export function sortKey(o: Order, field: FieldKey): Key {
  switch (field) {
    case 'id': return o.lc.id;
    case 'customer': return o.lc.customer || null;
    case 'email': return o.lc.email || null;
    case 'notes': return o.lc.notes || null;
    case 'amount': return o.amount;
    case 'itemCount': return o.itemCount;
    case 'createdAt': return o.createdAt;
    case 'updatedAt': return o.updatedAt;
    case 'priority': return o.priority; // numeric, None last
    case 'status': return o.status === null ? null : optionLabel('status', o.status).toLowerCase();
    case 'region': return o.region;
    case 'channel': return o.channel;
    case 'paymentMethod': return o.paymentMethod === null ? null : optionLabel('paymentMethod', o.paymentMethod).toLowerCase();
  }
}

/** Returns a NEW sorted array (the input is never mutated). Ties keep input order, so results are deterministic. */
export function sortOrders<T extends Order>(orders: readonly T[], sort: SortState | null): readonly T[] {
  if (!sort) return orders;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const keys = orders.map((o) => sortKey(o, sort.field));
  const idx = Array.from(orders.keys());
  idx.sort((a, b) => {
    const ka = keys[a]!;
    const kb = keys[b]!;
    if (ka === null) return kb === null ? a - b : 1;
    if (kb === null) return -1;
    if (ka < kb) return -dir;
    if (ka > kb) return dir;
    return a - b;
  });
  return idx.map((i) => orders[i]!);
}

/** Header click: new column -> ascending; same column -> reverse. */
export function nextSort(current: SortState | null, field: FieldKey): SortState {
  if (current?.field === field) return { field, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { field, dir: 'asc' };
}

export const isSortable = (field: FieldKey): boolean => field in FIELD_BY_KEY;
