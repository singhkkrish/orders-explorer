/**
 * Filter model + evaluation engine.
 *
 * Semantics (see README): conditions inside a group are OR-ed, groups are AND-ed.
 * Only *complete and valid* conditions take part. Groups left with no valid condition are
 * ignored (they do not match nothing, and do not match everything: they simply do not exist).
 * With no active group the filter is a no-op.
 */
import { formatAmount, formatDateInput, parseDateInput } from './format';
import { uid } from './ids';
import {
  FIELD_BY_KEY,
  OPERATORS_BY_KIND,
  OPERATOR_LABELS,
  enumValue,
  optionLabel,
  type EnumField,
  type FieldKey,
  type NumberField,
  type DateField,
  type Operator,
  type Order,
  type TextField,
} from './schema';

export interface Condition {
  id: string;
  field: FieldKey;
  op: Operator;
  /** Raw user input. text: [text]; number/date: [v] or [min,max]; enum: selected option values. */
  values: string[];
}
export interface Group {
  id: string;
  conditions: Condition[];
}

export const MAX_TEXT_LENGTH = 200;
const DAY = 86_400_000;
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export type Validity =
  | { state: 'ok' }
  | { state: 'incomplete'; message: string }
  | { state: 'invalid'; message: string };

const OK: Validity = { state: 'ok' };

export const parseNumberInput = (s: string): number | null => {
  const t = s.trim();
  if (!NUMBER_RE.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/* ---------- construction helpers (used by the UI) ---------- */

export const newCondition = (field: FieldKey = 'status'): Condition => {
  const kind = FIELD_BY_KEY[field].kind;
  return { id: uid('c'), field, op: OPERATORS_BY_KIND[kind][0]!, values: [] };
};
export const newGroup = (field?: FieldKey): Group => ({ id: uid('g'), conditions: [newCondition(field)] });

/** Changing the field resets operator and values to the field type's defaults. */
export function withField(c: Condition, field: FieldKey): Condition {
  if (field === c.field) return c;
  return { ...newCondition(field), id: c.id };
}

/** Changing the operator keeps whatever input is still meaningful. */
export function withOperator(c: Condition, op: Operator): Condition {
  if (op === c.op) return c;
  const kind = FIELD_BY_KEY[c.field].kind;
  if (kind === 'number' || kind === 'date') {
    const values = op === 'between' ? [c.values[0] ?? '', c.values[1] ?? ''] : [c.values[0] ?? ''];
    return { ...c, op, values };
  }
  return { ...c, op };
}

/* ---------- validation ---------- */

export function validateCondition(c: Condition): Validity {
  const def = FIELD_BY_KEY[c.field];
  if (!(OPERATORS_BY_KIND[def.kind] as readonly Operator[]).includes(c.op)) {
    return { state: 'invalid', message: 'Operator does not apply to this field.' };
  }
  switch (def.kind) {
    case 'enum': {
      if (c.values.length === 0) return { state: 'incomplete', message: 'Choose at least one value.' };
      const allowed = new Set(def.options!.map((o) => o.value));
      return c.values.every((v) => allowed.has(v)) ? OK : { state: 'invalid', message: 'Unknown value.' };
    }
    case 'text': {
      const v = (c.values[0] ?? '').trim();
      if (!v) return { state: 'incomplete', message: 'Enter text to match.' };
      return v.length > MAX_TEXT_LENGTH ? { state: 'invalid', message: `Keep it under ${MAX_TEXT_LENGTH} characters.` } : OK;
    }
    case 'number': {
      const need = c.op === 'between' ? 2 : 1;
      const raw = c.values.slice(0, need);
      if (raw.length < need || raw.some((v) => v.trim() === '')) return { state: 'incomplete', message: need === 2 ? 'Enter a minimum and a maximum.' : 'Enter a number.' };
      const nums = raw.map(parseNumberInput);
      if (nums.some((n) => n === null)) return { state: 'invalid', message: 'Enter a valid number, e.g. 2500 or 99.5.' };
      if (c.op === 'between' && nums[0]! > nums[1]!) return { state: 'invalid', message: 'Minimum must not be greater than maximum.' };
      return OK;
    }
    case 'date': {
      const need = c.op === 'between' ? 2 : 1;
      const raw = c.values.slice(0, need);
      if (raw.length < need || raw.some((v) => v === '')) return { state: 'incomplete', message: need === 2 ? 'Pick a start and an end date.' : 'Pick a date.' };
      const ts = raw.map(parseDateInput);
      if (ts.some((t) => t === null)) return { state: 'invalid', message: 'Enter a valid date.' };
      if (c.op === 'between' && ts[0]! > ts[1]!) return { state: 'invalid', message: 'Start date must not be after end date.' };
      return OK;
    }
  }
}

export const isActiveCondition = (c: Condition): boolean => validateCondition(c).state === 'ok';

/** Groups reduced to their valid conditions; groups with none are dropped. Single source for engine, chips and URL. */
export function activeGroups(groups: readonly Group[]): Group[] {
  const out: Group[] = [];
  for (const g of groups) {
    const conditions = g.conditions.filter(isActiveCondition);
    if (conditions.length > 0) out.push({ id: g.id, conditions });
  }
  return out;
}

/* ---------- evaluation ---------- */

export type Predicate = (o: Order) => boolean;

/** Compiles one *valid* condition into a predicate. Missing values never match positive comparisons. */
export function compileCondition(c: Condition): Predicate {
  const field = c.field;
  switch (FIELD_BY_KEY[field].kind) {
    case 'text': {
      const needle = (c.values[0] ?? '').trim().toLowerCase();
      const f = field as TextField;
      if (c.op === 'contains') return (o) => o.lc[f].includes(needle);
      if (c.op === 'not_contains') return (o) => !o.lc[f].includes(needle);
      return (o) => o.lc[f].trim() === needle; // equals (case-insensitive, trimmed)
    }
    case 'number': {
      const f = field as NumberField;
      const a = parseNumberInput(c.values[0] ?? '')!;
      const b = c.op === 'between' ? parseNumberInput(c.values[1] ?? '')! : 0;
      switch (c.op) {
        case 'eq': return (o) => o[f] !== null && Math.abs(o[f]! - a) < 0.005;
        case 'gt': return (o) => o[f] !== null && o[f]! > a;
        case 'lt': return (o) => o[f] !== null && o[f]! < a;
        default: return (o) => o[f] !== null && o[f]! >= a && o[f]! <= b; // inclusive
      }
    }
    case 'date': {
      // Date inputs are whole UTC days. before: earlier than that day starts.
      // after: later than that day ends. between: both days included.
      const f = field as DateField;
      const a = parseDateInput(c.values[0] ?? '')!;
      const b = c.op === 'between' ? parseDateInput(c.values[1] ?? '')! : 0;
      switch (c.op) {
        case 'before': return (o) => o[f] !== null && o[f]! < a;
        case 'after': return (o) => o[f] !== null && o[f]! >= a + DAY;
        default: return (o) => o[f] !== null && o[f]! >= a && o[f]! < b + DAY;
      }
    }
    case 'enum': {
      const f = field as EnumField;
      const set = new Set(c.values);
      return (o) => {
        const v = enumValue(o, f);
        return v !== null && set.has(v);
      };
    }
  }
}

/** Returns the same array instance when no filter is active, otherwise a new filtered array. */
export function applyFilters<T extends Order>(orders: readonly T[], groups: readonly Group[]): readonly T[] {
  const compiled = activeGroups(groups).map((g) => g.conditions.map(compileCondition));
  if (compiled.length === 0) return orders;
  const out: T[] = [];
  outer: for (const o of orders) {
    for (const g of compiled) {
      let any = false;
      for (const p of g) {
        if (p(o)) {
          any = true;
          break;
        }
      }
      if (!any) continue outer; // AND between groups
    }
    out.push(o);
  }
  return out;
}

/* ---------- description (chips) ---------- */

export interface ConditionText {
  field: string;
  op: string;
  value: string;
}

export function describeCondition(c: Condition): ConditionText {
  const def = FIELD_BY_KEY[c.field];
  const field = def.label.replace(' (UTC)', '');
  const op = OPERATOR_LABELS[c.op];
  let value: string;
  switch (def.kind) {
    case 'enum': value = c.values.map((v) => optionLabel(c.field, v)).join(', '); break;
    case 'text': value = `“${(c.values[0] ?? '').trim()}”`; break;
    case 'number': {
      const fmt = (v: string) => (c.field === 'amount' ? formatAmount(parseNumberInput(v)) : String(parseNumberInput(v)));
      value = c.op === 'between' ? `${fmt(c.values[0] ?? '')} and ${fmt(c.values[1] ?? '')}` : fmt(c.values[0] ?? '');
      break;
    }
    case 'date':
      value = c.op === 'between'
        ? `${formatDateInput(c.values[0] ?? '')} and ${formatDateInput(c.values[1] ?? '')}`
        : formatDateInput(c.values[0] ?? '');
      break;
  }
  return { field, op, value };
}

export const countActiveConditions = (groups: readonly Group[]): number =>
  activeGroups(groups).reduce((n, g) => n + g.conditions.length, 0);

/* ---------- immutable edits ---------- */

export function removeCondition(groups: readonly Group[], groupId: string, conditionId: string): Group[] {
  return groups
    .map((g) => (g.id === groupId ? { ...g, conditions: g.conditions.filter((c) => c.id !== conditionId) } : g))
    .filter((g) => g.conditions.length > 0); // empty groups are removed, never left dangling
}
