import { FIELDS, FIELD_BY_KEY, type FieldDef, type FieldKey } from './schema';

/** Display order: the pinned column (if any) first, then the rest in schema order. */
export function orderedColumns(pin: FieldKey | null): FieldDef[] {
  if (!pin) return [...FIELDS];
  return [FIELD_BY_KEY[pin], ...FIELDS.filter((f) => f.key !== pin)];
}

export const defaultWidths = (): Record<FieldKey, number> =>
  Object.fromEntries(FIELDS.map((f) => [f.key, f.width])) as Record<FieldKey, number>;

export const clampWidth = (key: FieldKey, w: number): number => {
  const d = FIELD_BY_KEY[key];
  return Math.min(d.maxWidth, Math.max(d.minWidth, Math.round(w)));
};
