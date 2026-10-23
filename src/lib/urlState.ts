/**
 * URL <-> view state. The URL is a *projection* of the state (state is the source of truth),
 * which is what prevents update loops: we only read the URL on first load and on popstate.
 *
 *   g=status:in:shipped|delivered~amount:gt:5000     one `g` param per group (OR inside, `~` between conditions)
 *   g=region:in:north                                 (groups are AND-ed)
 *   sort=amount:desc
 *   pin=customer
 *   sel=1-3e.5a.7z-80                                 order numbers in base36, `a-b` = inclusive range
 *
 * Parsing is all-or-nothing: if anything is malformed the default view is used and the
 * reasons are returned so the UI can explain them. Nothing here throws.
 */
import { activeGroups, validateCondition, type Condition, type Group } from './filter';
import { uid } from './ids';
import { FIELD_BY_KEY, isFieldKey, isOperatorFor, type FieldKey } from './schema';
import type { SortState } from './sort';

export interface ViewState {
  groups: Group[];
  sort: SortState | null;
  pin: FieldKey | null;
  selected: Set<string>;
}

export const MAX_GROUPS = 10;
export const MAX_CONDITIONS_PER_GROUP = 25;
export const MAX_VALUES = 20;
export const MAX_SELECTED = 100_000;
/** Longer `sel` values are not written to the URL (browsers/servers/chat apps truncate very long URLs). */
export const MAX_SELECTION_URL_CHARS = 16_000;
export const MAX_SEARCH_LENGTH = 200_000;

export const defaultView = (): ViewState => ({ groups: [], sort: null, pin: null, selected: new Set() });

/* ---------- escaping ---------- */

const escapeToken = (s: string): string => s.replace(/[\\~:|]/g, '\\$&');
const unescapeToken = (s: string): string => s.replace(/\\(.)/g, '$1');

/** Splits on `sep` unless it is backslash-escaped. Escapes are preserved in the parts. */
export function splitUnescaped(s: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i++;
    } else if (ch === sep) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

/* ---------- selection encoding ---------- */

const ORDER_ID = /^ORD-(\d{7})$/;

export function encodeSelection(ids: Iterable<string>): { encoded: string; skipped: number } {
  const nums: number[] = [];
  let skipped = 0;
  for (const id of ids) {
    const m = ORDER_ID.exec(id);
    if (m) nums.push(Number(m[1]));
    else skipped++;
  }
  nums.sort((a, b) => a - b);
  const tokens: string[] = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j]! + 1) j++;
    tokens.push(j - i >= 2 ? `${nums[i]!.toString(36)}-${nums[j]!.toString(36)}` : nums.slice(i, j + 1).map((n) => n.toString(36)).join('.'));
    i = j + 1;
  }
  return { encoded: tokens.join('.'), skipped };
}

/** Throws Error with a readable message on malformed input. */
export function decodeSelection(encoded: string): string[] {
  const ids: string[] = [];
  const toId = (t: string): number => {
    if (!/^[0-9a-z]{1,6}$/.test(t)) throw new Error(`Bad selection token “${t.slice(0, 20)}”.`);
    const n = parseInt(t, 36);
    if (n < 1 || n > 9_999_999) throw new Error('Selection contains an out-of-range order number.');
    return n;
  };
  const pad = (n: number) => `ORD-${String(n).padStart(7, '0')}`;
  for (const token of encoded.split('.')) {
    if (token === '') continue;
    const range = token.split('-');
    if (range.length === 1) ids.push(pad(toId(token)));
    else if (range.length === 2) {
      const [a, b] = [toId(range[0]!), toId(range[1]!)];
      if (a > b) throw new Error('Selection range is reversed.');
      if (ids.length + (b - a + 1) > MAX_SELECTED) throw new Error('Selection is too large.');
      for (let n = a; n <= b; n++) ids.push(pad(n));
    } else throw new Error(`Bad selection token “${token.slice(0, 20)}”.`);
    if (ids.length > MAX_SELECTED) throw new Error('Selection is too large.');
  }
  return ids;
}

/* ---------- serialise ---------- */

export function serializeView(view: ViewState): { search: string; selectionOmitted: boolean } {
  const params = new URLSearchParams();
  for (const g of activeGroups(view.groups)) {
    params.append('g', g.conditions.map((c) => `${c.field}:${c.op}:${c.values.map(escapeToken).join('|')}`).join('~'));
  }
  if (view.sort) params.set('sort', `${view.sort.field}:${view.sort.dir}`);
  if (view.pin) params.set('pin', view.pin);
  let selectionOmitted = false;
  if (view.selected.size > 0) {
    const { encoded } = encodeSelection(view.selected);
    if (encoded.length > MAX_SELECTION_URL_CHARS) selectionOmitted = true;
    else if (encoded) params.set('sel', encoded);
  }
  return { search: params.toString(), selectionOmitted };
}

/** True when two query strings differ only in their `sel` parameter. */
export function differOnlyInSelection(a: string, b: string): boolean {
  const strip = (s: string) => {
    const p = new URLSearchParams(s);
    p.delete('sel');
    return p.toString();
  };
  return a !== b && strip(a) === strip(b);
}

/* ---------- parse ---------- */

export interface ParseResult {
  view: ViewState;
  errors: string[];
}

function parseCondition(raw: string): Condition {
  const parts = splitUnescaped(raw, ':');
  if (parts.length !== 3) throw new Error(`Malformed condition “${raw.slice(0, 40)}”.`);
  const [field, op, rawValues] = parts as [string, string, string];
  if (!isFieldKey(field)) throw new Error(`Unknown field “${field.slice(0, 30)}”.`);
  const kind = FIELD_BY_KEY[field].kind;
  if (!isOperatorFor(kind, op)) throw new Error(`Operator “${op.slice(0, 30)}” does not apply to ${field}.`);
  const values = splitUnescaped(rawValues, '|').map(unescapeToken);
  if (values.length > MAX_VALUES) throw new Error(`Too many values for ${field}.`);
  const cond: Condition = { id: uid('c'), field, op, values };
  const v = validateCondition(cond);
  if (v.state !== 'ok') throw new Error(`Condition on ${field} is not valid: ${v.message}`);
  return cond;
}

export function parseView(search: string): ParseResult {
  const fail = (...errors: string[]): ParseResult => ({ view: defaultView(), errors });
  if (search.length > MAX_SEARCH_LENGTH) return fail('The URL state is too large to restore.');
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return fail('The URL could not be read.');
  }
  const errors: string[] = [];
  const view = defaultView();

  try {
    const gs = params.getAll('g');
    if (gs.length > MAX_GROUPS) throw new Error(`More than ${MAX_GROUPS} filter groups.`);
    for (const g of gs) {
      const conds = splitUnescaped(g, '~');
      if (conds.length > MAX_CONDITIONS_PER_GROUP) throw new Error(`More than ${MAX_CONDITIONS_PER_GROUP} conditions in a group.`);
      view.groups.push({ id: uid('g'), conditions: conds.map(parseCondition) });
    }
  } catch (e) {
    errors.push(`Filter: ${(e as Error).message}`);
  }

  try {
    const sorts = params.getAll('sort');
    if (sorts.length > 1) throw new Error('Sort given more than once.');
    if (sorts.length === 1) {
      const [field, dir, ...rest] = sorts[0]!.split(':');
      if (!isFieldKey(field) || (dir !== 'asc' && dir !== 'desc') || rest.length) throw new Error(`Unrecognised sort “${sorts[0]!.slice(0, 40)}”.`);
      view.sort = { field, dir };
    }
  } catch (e) {
    errors.push(`Sort: ${(e as Error).message}`);
  }

  try {
    const pins = params.getAll('pin');
    if (pins.length > 1) throw new Error('Pinned column given more than once.');
    if (pins.length === 1) {
      if (!isFieldKey(pins[0])) throw new Error(`Unknown column “${pins[0]!.slice(0, 30)}”.`);
      view.pin = pins[0];
    }
  } catch (e) {
    errors.push(`Pin: ${(e as Error).message}`);
  }

  try {
    const sels = params.getAll('sel');
    if (sels.length > 1) throw new Error('Selection given more than once.');
    if (sels.length === 1) view.selected = new Set(decodeSelection(sels[0]!));
  } catch (e) {
    errors.push(`Selection: ${(e as Error).message}`);
  }

  return errors.length > 0 ? fail(...errors) : { view, errors: [] };
}
