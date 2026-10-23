import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { EMPTY, formatAmount, formatDateTime } from '../lib/format';
import { optionLabel, type Order } from '../lib/schema';

interface Props {
  order: Order;
  position: { index: number; total: number } | null;
  onClose: () => void;
  onStep: (delta: -1 | 1) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Non-modal side panel. Focus moves in on open; Escape closes it and the grid regains focus (handled by the parent). */
export function DetailsPanel({ order: o, position, onClose, onStep }: Props) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => closeBtn.current?.focus(), []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <aside className="details" role="dialog" aria-label={`Order ${o.id} details`} onKeyDown={onKeyDown}>
      <header className="details-head">
        <div>
          <h2>{o.id}</h2>
          <span className="muted">{position ? `Row ${(position.index + 1).toLocaleString('en-IN')} of ${position.total.toLocaleString('en-IN')} in view` : 'Not in the current filtered view'}</span>
        </div>
        <div className="details-actions">
          <button type="button" className="icon-btn" aria-label="Previous order" title="Previous order" disabled={!position || position.index === 0} onClick={() => onStep(-1)}>
            <ChevronUp size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label="Next order" title="Next order" disabled={!position || position.index >= position.total - 1} onClick={() => onStep(1)}>
            <ChevronDown size={16} />
          </button>
          <button ref={closeBtn} type="button" className="icon-btn" aria-label="Close details" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>
      <dl className="details-body">
        <Field label="Customer">{o.customer || EMPTY}</Field>
        <Field label="Email">{o.email || EMPTY}</Field>
        <Field label="Status">{o.status ? optionLabel('status', o.status) : EMPTY}</Field>
        <Field label="Amount">{formatAmount(o.amount)} <span className="muted">{o.currency}</span></Field>
        <Field label="Created (UTC)">{formatDateTime(o.createdAt)}</Field>
        <Field label="Updated (UTC)">{formatDateTime(o.updatedAt)}</Field>
        <Field label="Region">{o.region ? optionLabel('region', o.region) : EMPTY}</Field>
        <Field label="Channel">{o.channel ? optionLabel('channel', o.channel) : EMPTY}</Field>
        <Field label="Priority">{o.priority === null ? 'None' : o.priority}</Field>
        <Field label="Payment">{o.paymentMethod ? optionLabel('paymentMethod', o.paymentMethod) : EMPTY}</Field>
        <Field label="Items">{o.itemCount ?? EMPTY}</Field>
        <Field label="Source schema">v{o.schemaVersion}</Field>
      </dl>
      <div className="details-notes">
        <h3>Notes</h3>
        {/* Plain text only: React escapes the string, so HTML-like notes are shown literally. */}
        <div className="notes-text" tabIndex={0} aria-label="Order notes">{o.notes || <span className="muted">No notes.</span>}</div>
      </div>
    </aside>
  );
}
