/**
 * Selection is a Set of order ids (never row indexes), so it is stable across
 * filtering, sorting and virtualisation. All helpers are pure and return new Sets.
 */
import { sortOrders, type SortState } from './sort';
import type { Order } from './schema';

export const toggleId = (sel: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(sel);
  if (!next.delete(id)) next.add(id);
  return next;
};

export function setMany(sel: ReadonlySet<string>, ids: Iterable<string>, on: boolean): Set<string> {
  const next = new Set(sel);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Adds every row between two indexes (inclusive, either order) of the *currently displayed* rows. */
export function addRange(sel: ReadonlySet<string>, rows: readonly Order[], a: number, b: number): Set<string> {
  const next = new Set(sel);
  if (rows.length === 0) return next;
  const lo = Math.max(0, Math.min(a, b));
  const hi = Math.min(rows.length - 1, Math.max(a, b));
  for (let i = lo; i <= hi; i++) next.add(rows[i]!.id);
  return next;
}

/** How many selected ids are among the displayed rows. */
export function countVisibleSelected(sel: ReadonlySet<string>, indexById: ReadonlyMap<string, number>): number {
  let n = 0;
  for (const id of sel) if (indexById.has(id)) n++;
  return n;
}

/**
 * Export semantics: EVERY selected order is exported, including ones currently hidden by a
 * filter, in the grid's current sort order. The count always equals `selected.size`
 * (minus ids that do not exist in the dataset, which are pruned on load).
 */
export function resolveExportOrders(
  byId: ReadonlyMap<string, Order>,
  selected: ReadonlySet<string>,
  sort: SortState | null,
): Order[] {
  const found: Order[] = [];
  for (const id of selected) {
    const o = byId.get(id);
    if (o) found.push(o);
  }
  // Selection Set preserves insertion order; put it in dataset order before applying the grid sort.
  found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [...sortOrders(found, sort)];
}
