/**
 * Single source of truth for the order schema: field keys, kinds, operators and the
 * allowed values of the fixed-value fields (taken from data-notes.md).
 */

export const STATUS_VALUES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export const REGION_VALUES = ['north', 'south', 'east', 'west', 'central', 'northeast'] as const;
export const CHANNEL_VALUES = ['web', 'app', 'phone', 'store'] as const;
export const PAYMENT_VALUES = ['upi', 'card', 'netbanking', 'cod', 'wallet'] as const;
export const PRIORITY_VALUES = [1, 2, 3] as const;

export type Status = (typeof STATUS_VALUES)[number];
export type Region = (typeof REGION_VALUES)[number];
export type Channel = (typeof CHANNEL_VALUES)[number];
export type PaymentMethod = (typeof PAYMENT_VALUES)[number];
export type Priority = (typeof PRIORITY_VALUES)[number];

export type TextField = 'id' | 'customer' | 'email' | 'notes';
export type NumberField = 'amount' | 'itemCount';
export type DateField = 'createdAt' | 'updatedAt';
export type EnumField = 'status' | 'region' | 'channel' | 'paymentMethod' | 'priority';
export type FieldKey = TextField | NumberField | DateField | EnumField;
export type FieldKind = 'text' | 'number' | 'date' | 'enum';

/** A normalised order. All fixes from data-notes.md are applied before this type exists. */
export interface Order {
  id: string;
  schemaVersion: 1 | 2;
  customer: string;
  email: string;
  status: Status | null;
  /** Rupees (paise already converted). */
  amount: number | null;
  currency: string;
  /** Epoch milliseconds (UTC). */
  createdAt: number | null;
  updatedAt: number | null;
  region: Region | null;
  channel: Channel | null;
  priority: Priority | null;
  paymentMethod: PaymentMethod | null;
  itemCount: number | null;
  /** Plain text. Never rendered as HTML. */
  notes: string;
  /** Pre-lower-cased text columns so filtering/sorting never re-lowers 50k strings. */
  lc: Record<TextField, string>;
}

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  key: FieldKey;
  label: string;
  kind: FieldKind;
  width: number;
  minWidth: number;
  maxWidth: number;
  align: 'left' | 'right';
  options?: readonly Option[];
}

const opt = (value: string, label: string): Option => ({ value, label });

export const STATUS_OPTIONS = [
  opt('pending', 'Pending'),
  opt('processing', 'Processing'),
  opt('shipped', 'Shipped'),
  opt('delivered', 'Delivered'),
  opt('cancelled', 'Cancelled'),
] as const;
export const REGION_OPTIONS = [
  opt('north', 'North'),
  opt('south', 'South'),
  opt('east', 'East'),
  opt('west', 'West'),
  opt('central', 'Central'),
  opt('northeast', 'Northeast'),
] as const;
export const CHANNEL_OPTIONS = [opt('web', 'Web'), opt('app', 'App'), opt('phone', 'Phone'), opt('store', 'Store')] as const;
export const PAYMENT_OPTIONS = [
  opt('upi', 'UPI'),
  opt('card', 'Card'),
  opt('netbanking', 'Net banking'),
  opt('cod', 'COD'),
  opt('wallet', 'Wallet'),
] as const;
/** `none` stands for a missing priority (data-notes #8). */
export const PRIORITY_OPTIONS = [opt('1', '1 (highest)'), opt('2', '2'), opt('3', '3 (lowest)'), opt('none', 'None')] as const;

const f = (
  key: FieldKey,
  label: string,
  kind: FieldKind,
  width: number,
  extra: Partial<FieldDef> = {},
): FieldDef => ({ key, label, kind, width, minWidth: 64, maxWidth: 640, align: 'left', ...extra });

export const FIELDS: readonly FieldDef[] = [
  f('id', 'Order ID', 'text', 116),
  f('customer', 'Customer', 'text', 160),
  f('email', 'Email', 'text', 230),
  f('status', 'Status', 'enum', 118, { options: STATUS_OPTIONS }),
  f('amount', 'Amount', 'number', 124, { align: 'right' }),
  f('createdAt', 'Created (UTC)', 'date', 168),
  f('updatedAt', 'Updated (UTC)', 'date', 168),
  f('region', 'Region', 'enum', 112, { options: REGION_OPTIONS }),
  f('channel', 'Channel', 'enum', 104, { options: CHANNEL_OPTIONS }),
  f('priority', 'Priority', 'enum', 108, { options: PRIORITY_OPTIONS }),
  f('paymentMethod', 'Payment', 'enum', 116, { options: PAYMENT_OPTIONS }),
  f('itemCount', 'Items', 'number', 76, { align: 'right' }),
  f('notes', 'Notes', 'text', 320),
];

export const FIELD_BY_KEY: Readonly<Record<FieldKey, FieldDef>> = Object.fromEntries(
  FIELDS.map((d) => [d.key, d]),
) as Record<FieldKey, FieldDef>;

export const isFieldKey = (v: unknown): v is FieldKey => typeof v === 'string' && Object.hasOwn(FIELD_BY_KEY, v);

export type Operator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'eq'
  | 'gt'
  | 'lt'
  | 'between'
  | 'before'
  | 'after'
  | 'in';

export const OPERATOR_LABELS: Record<Operator, string> = {
  contains: 'contains',
  not_contains: 'does not contain',
  equals: 'equals',
  eq: 'equals',
  gt: 'greater than',
  lt: 'less than',
  between: 'between',
  before: 'before',
  after: 'after',
  in: 'is one of',
};

export const OPERATORS_BY_KIND: Record<FieldKind, readonly Operator[]> = {
  text: ['contains', 'not_contains', 'equals'],
  number: ['eq', 'gt', 'lt', 'between'],
  date: ['before', 'after', 'between'],
  enum: ['in'],
};

export const isOperatorFor = (kind: FieldKind, op: unknown): op is Operator =>
  typeof op === 'string' && (OPERATORS_BY_KIND[kind] as readonly string[]).includes(op);

/** Label for a fixed-value option value (falls back to the raw value). */
export function optionLabel(field: FieldKey, value: string): string {
  return FIELD_BY_KEY[field].options?.find((o) => o.value === value)?.label ?? value;
}

/** The string used by filters/exports to represent an enum field's value ('none' for missing priority). */
export function enumValue(order: Order, field: EnumField): string | null {
  if (field === 'priority') return order.priority === null ? 'none' : String(order.priority);
  return order[field];
}
