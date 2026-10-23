import {
  memo, useCallback, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode, type Ref,
} from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Minus, Pin, PinOff } from 'lucide-react';
import { useVirtualRows } from '../hooks/useVirtualRows';
import { clampWidth, defaultWidths, orderedColumns } from '../lib/columnsLayout';
import { EMPTY, formatAmount, formatDateTime } from '../lib/format';
import { optionLabel, type FieldDef, type FieldKey, type Order } from '../lib/schema';
import type { SortState } from '../lib/sort';
import { scrollOffsetToReveal } from '../lib/virtual';

export const ROW_H = 32;
export const HEADER_H = 34;
export const CHECK_W = 40;
const OVERSCAN = 8;

export interface GridHandle {
  focus: () => void;
  revealOrder: (id: string) => void;
}

interface Props {
  ref?: Ref<GridHandle>;
  rows: readonly Order[];
  indexById: ReadonlyMap<string, number>;
  selected: ReadonlySet<string>;
  visibleSelectedCount: number;
  sort: SortState | null;
  pin: FieldKey | null;
  onSort: (field: FieldKey) => void;
  onPin: (field: FieldKey | null) => void;
  onToggleRow: (id: string) => void;
  onSelectRange: (fromIndex: number, toIndex: number) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  /** Rendered over the body (below the header) when there are no rows. */
  empty: ReactNode;
  busy: boolean;
}

interface FocusState {
  kind: 'header' | 'cell';
  col: FieldKey;
  /** Order id of the focused row, so focus survives sorting/filtering. */
  id: string | null;
  /** Fallback index when `id` is no longer listed. */
  lastIndex: number;
}

const dash = <span className="empty">{EMPTY}</span>;

function renderCell(o: Order, key: FieldKey): { node: ReactNode; title?: string } {
  const text = (v: string) => (v ? { node: v, title: v } : { node: dash });
  switch (key) {
    case 'id': return { node: o.id };
    case 'customer': return text(o.customer);
    case 'email': return text(o.email);
    case 'notes': return text(o.notes); // plain text only: React escapes it, never rendered as HTML
    case 'status':
      return o.status ? { node: <span className="status"><i className={`dot s-${o.status}`} />{optionLabel('status', o.status)}</span> } : { node: dash };
    case 'amount': return { node: formatAmount(o.amount) };
    case 'createdAt': return { node: formatDateTime(o.createdAt) };
    case 'updatedAt': return { node: formatDateTime(o.updatedAt) };
    case 'region': return o.region ? { node: optionLabel('region', o.region) } : { node: dash };
    case 'channel': return o.channel ? { node: optionLabel('channel', o.channel) } : { node: dash };
    case 'paymentMethod': return o.paymentMethod ? { node: optionLabel('paymentMethod', o.paymentMethod) } : { node: dash };
    case 'priority': return o.priority === null ? { node: <span className="muted-text">None</span> } : { node: String(o.priority) };
    case 'itemCount': return o.itemCount === null ? { node: dash } : { node: String(o.itemCount) };
  }
}

interface RowProps {
  order: Order;
  index: number;
  columns: readonly FieldDef[];
  widths: readonly number[];
  totalWidth: number;
  pinned: boolean;
  selected: boolean;
  focusCol: FieldKey | null;
  gridId: string;
}

const Row = memo(function Row({ order, index, columns, widths, totalWidth, pinned, selected, focusCol, gridId }: RowProps) {
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-index={index}
      className={`row${selected ? ' selected' : ''}`}
      style={{ top: index * ROW_H, height: ROW_H, width: totalWidth }}
    >
      <div role="gridcell" className="cell check-cell" style={{ width: CHECK_W }}>
        <span className={`cbx${selected ? ' on' : ''}`} aria-hidden="true">{selected && <Check size={12} strokeWidth={3} />}</span>
      </div>
      {columns.map((c, i) => {
        const { node, title } = renderCell(order, c.key);
        const cls = `cell${c.align === 'right' ? ' num' : ''}${pinned && i === 0 ? ' pinned' : ''}${focusCol === c.key ? ' focused' : ''}`;
        return (
          <div
            key={c.key}
            role="gridcell"
            id={`${gridId}-${index}-${c.key}`}
            data-col={c.key}
            className={cls}
            style={{ width: widths[i], ...(pinned && i === 0 ? { left: CHECK_W } : null) }}
            title={title}
          >
            {node}
          </div>
        );
      })}
    </div>
  );
});

export function DataGrid({
  ref, rows, indexById, selected, visibleSelectedCount, sort, pin, onSort, onPin, onToggleRow, onSelectRange, onToggleAll, onOpen, empty, busy,
}: Props) {
  const gridId = useId();
  const columns = useMemo(() => orderedColumns(pin), [pin]);
  const [widthMap, setWidthMap] = useState<Record<FieldKey, number>>(defaultWidths);
  const widths = useMemo(() => columns.map((c) => widthMap[c.key]), [columns, widthMap]);
  const totalWidth = CHECK_W + widths.reduce((a, b) => a + b, 0);

  const { setEl, el, range, totalHeight, scrollToRow } = useVirtualRows({ count: rows.length, rowHeight: ROW_H, overscan: OVERSCAN, headerHeight: HEADER_H });

  const [focus, setFocus] = useState<FocusState>({ kind: 'cell', col: 'id', id: null, lastIndex: 0 });
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const anchorRef = useRef<string | null>(null);

  // Effective focused row index: -1 = header row.
  const rowIndex = useMemo(() => {
    if (focus.kind === 'header' || rows.length === 0) return -1;
    const byId = focus.id === null ? undefined : indexById.get(focus.id);
    return byId ?? Math.min(focus.lastIndex, rows.length - 1);
  }, [focus, rows.length, indexById]);

  /* ----- focus + scrolling helpers ----- */

  const revealColumn = useCallback(
    (key: FieldKey) => {
      if (!el) return;
      const idx = columns.findIndex((c) => c.key === key);
      if (idx < 0 || (pin && idx === 0)) return;
      let left = CHECK_W;
      for (let i = 0; i < idx; i++) left += widths[i]!;
      const inset = CHECK_W + (pin ? widths[0]! : 0);
      const next = scrollOffsetToReveal(left, left + widths[idx]!, el.scrollLeft, el.clientWidth, inset);
      if (next !== el.scrollLeft) el.scrollLeft = next;
    },
    [el, columns, widths, pin],
  );

  const moveTo = useCallback(
    (row: number, col: FieldKey) => {
      if (row < 0 || rows.length === 0) {
        setFocus({ kind: 'header', col, id: null, lastIndex: 0 });
      } else {
        setFocus({ kind: 'cell', col, id: rows[row]!.id, lastIndex: row });
        scrollToRow(row);
      }
      revealColumn(col);
    },
    [rows, scrollToRow, revealColumn],
  );

  useImperativeHandle(ref, () => ({
    focus: () => el?.focus({ preventScroll: true }),
    revealOrder: (id: string) => {
      const idx = indexById.get(id);
      if (idx !== undefined) moveTo(idx, focusRef.current.col);
    },
  }), [el, indexById, moveTo]);

  // Rows changed (filter / sort / URL): keep focus on the same order if it is still listed and bring it into view; otherwise reset to the top.
  useLayoutEffect(() => {
    if (!el) return;
    const f = focusRef.current;
    if (f.kind === 'header') return; // keyboard focus on a header (e.g. after Enter to sort) must stay there
    const idx = f.id !== null ? indexById.get(f.id) : undefined;
    if (idx !== undefined) scrollToRow(idx);
    else {
      el.scrollTop = 0;
      setFocus((p) => ({ ...p, kind: 'cell', id: null, lastIndex: 0 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, el]);

  /* ----- column resize ----- */

  const drag = useRef<{ key: FieldKey; startX: number; startW: number } | null>(null);
  const [resizing, setResizing] = useState<FieldKey | null>(null);
  const setWidth = useCallback((key: FieldKey, w: number) => setWidthMap((m) => ({ ...m, [key]: clampWidth(key, w) })), []);

  const onResizeDown = (e: RPointerEvent<HTMLDivElement>, key: FieldKey) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { key, startX: e.clientX, startW: widthMap[key] };
    setResizing(key);
  };
  const onResizeMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setWidth(d.key, d.startW + e.clientX - d.startX);
  };
  const onResizeUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setResizing(null);
  };

  /* ----- mouse selection (delegated: one handler for all rows) ----- */

  const onBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const rowEl = target.closest<HTMLElement>('[data-index]');
    if (!rowEl) return;
    const idx = Number(rowEl.dataset.index);
    const order = rows[idx];
    if (!order) return;
    const colAttr = target.closest<HTMLElement>('[data-col]')?.dataset.col as FieldKey | undefined;
    const col = colAttr && columns.some((c) => c.key === colAttr) ? colAttr : focus.col;
    setFocus({ kind: 'cell', col, id: order.id, lastIndex: idx });
    if (e.shiftKey) {
      const a = anchorRef.current ? indexById.get(anchorRef.current) : undefined;
      onSelectRange(a ?? idx, idx);
    } else {
      onToggleRow(order.id);
      anchorRef.current = order.id;
    }
  };
  const onBodyDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const idx = (e.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index;
    const order = idx === undefined ? undefined : rows[Number(idx)];
    if (order) onOpen(order.id);
  };

  /* ----- keyboard ----- */

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // never hijack keys meant for inner controls
    const n = rows.length;
    const nCols = columns.length;
    const colIdx = Math.max(0, columns.findIndex((c) => c.key === focus.col));
    const row = rowIndex;
    const ctrl = e.ctrlKey || e.metaKey;
    const inHeader = row < 0;
    if (e.altKey && !(inHeader && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) return;
    if (ctrl && e.key !== 'Home' && e.key !== 'End') return;
    const page = Math.max(1, Math.floor(((el?.clientHeight ?? 0) - HEADER_H) / ROW_H) - 1);

    let nr = row;
    let nc = colIdx;
    switch (e.key) {
      case 'ArrowDown': nr = inHeader ? (n > 0 ? 0 : -1) : Math.min(n - 1, row + 1); break;
      case 'ArrowUp': nr = row <= 0 ? -1 : row - 1; break;
      case 'ArrowLeft':
        if (e.altKey) { e.preventDefault(); setWidth(focus.col, widthMap[focus.col] - (e.shiftKey ? 48 : 16)); return; }
        nc = Math.max(0, colIdx - 1); break;
      case 'ArrowRight':
        if (e.altKey) { e.preventDefault(); setWidth(focus.col, widthMap[focus.col] + (e.shiftKey ? 48 : 16)); return; }
        nc = Math.min(nCols - 1, colIdx + 1); break;
      case 'Home': nc = 0; if (ctrl) nr = n > 0 ? 0 : -1; break;
      case 'End': nc = nCols - 1; if (ctrl) nr = n - 1; break;
      case 'PageDown': nr = inHeader ? (n > 0 ? 0 : -1) : Math.min(n - 1, row + page); break;
      case 'PageUp': nr = inHeader ? -1 : Math.max(0, row - page); break;
      case 'Enter':
        e.preventDefault();
        if (inHeader) onSort(focus.col);
        else if (rows[row]) onOpen(rows[row]!.id);
        return;
      case ' ':
        e.preventDefault();
        if (inHeader) { onSort(focus.col); return; }
        if (rows[row]) {
          if (e.shiftKey) {
            const a = anchorRef.current ? indexById.get(anchorRef.current) : undefined;
            onSelectRange(a ?? row, row);
          } else {
            onToggleRow(rows[row]!.id);
            anchorRef.current = rows[row]!.id;
          }
        }
        return;
      case 'p':
      case 'P':
        if (inHeader && !e.shiftKey && !ctrl) { e.preventDefault(); onPin(pin === focus.col ? null : focus.col); }
        return;
      default:
        return;
    }
    e.preventDefault();
    if (e.shiftKey && !inHeader && nr >= 0 && nr !== row && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp')) {
      // Shift+arrows extend the selection from the anchor.
      if (!anchorRef.current && rows[row]) anchorRef.current = rows[row]!.id;
      const a = anchorRef.current ? indexById.get(anchorRef.current) : undefined;
      onSelectRange(a ?? row, nr);
    }
    moveTo(nr, columns[nc]!.key);
  };

  /* ----- render ----- */

  const rendered: ReactNode[] = [];
  for (let i = range.start; i < Math.min(range.end, rows.length); i++) {
    const o = rows[i]!;
    rendered.push(
      <Row
        key={o.id}
        order={o}
        index={i}
        columns={columns}
        widths={widths}
        totalWidth={totalWidth}
        pinned={pin !== null}
        selected={selected.has(o.id)}
        focusCol={i === rowIndex ? focus.col : null}
        gridId={gridId}
      />,
    );
  }

  const allSelected = rows.length > 0 && visibleSelectedCount === rows.length;
  const someSelected = visibleSelectedCount > 0 && !allSelected;
  const activeDescendant =
    rowIndex < 0 ? `${gridId}-h-${focus.col}` : `${gridId}-${rowIndex}-${focus.col}`;

  return (
    <div className={`grid-wrap${busy ? ' busy' : ''}${resizing ? ' resizing' : ''}`}>
      <div
        className="grid"
        role="grid"
        aria-label="Orders"
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length + 1}
        aria-multiselectable="true"
        aria-activedescendant={activeDescendant}
        tabIndex={0}
        ref={setEl}
        onKeyDown={onKeyDown}
      >
        <div className="grid-header" role="row" aria-rowindex={1} style={{ width: totalWidth, height: HEADER_H }}>
          <div role="columnheader" className="hcell check-cell" style={{ width: CHECK_W }}>
            <button
              type="button"
              tabIndex={-1}
              className={`cbx${allSelected || someSelected ? ' on' : ''}`}
              role="checkbox"
              aria-checked={someSelected ? 'mixed' : allSelected}
              aria-label={allSelected ? 'Deselect all matching orders' : 'Select all matching orders'}
              title={allSelected ? 'Deselect all matching orders' : `Select all ${rows.length.toLocaleString('en-IN')} matching orders`}
              disabled={rows.length === 0}
              onClick={onToggleAll}
            >
              {allSelected ? <Check size={12} strokeWidth={3} /> : someSelected ? <Minus size={12} strokeWidth={3} /> : null}
            </button>
          </div>
          {columns.map((c, i) => {
            const isSorted = sort?.field === c.key;
            const isPinned = pin === c.key;
            const headerFocused = rowIndex < 0 && focus.col === c.key;
            return (
              <div
                key={c.key}
                id={`${gridId}-h-${c.key}`}
                role="columnheader"
                aria-sort={isSorted ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={`hcell${c.align === 'right' ? ' num' : ''}${pin !== null && i === 0 ? ' pinned' : ''}${headerFocused ? ' focused' : ''}${isSorted ? ' sorted' : ''}`}
                style={{ width: widths[i], ...(pin !== null && i === 0 ? { left: CHECK_W } : null) }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className="hsort"
                  title={`Sort by ${c.label}${isSorted ? (sort!.dir === 'asc' ? ' (currently ascending)' : ' (currently descending)') : ''}`}
                  onClick={() => onSort(c.key)}
                >
                  <span className="hlabel">{c.label}</span>
                  {isSorted ? (sort!.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={12} className="sort-idle" />}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  className={`hpin${isPinned ? ' on' : ''}`}
                  aria-label={isPinned ? `Unpin ${c.label}` : `Pin ${c.label} column`}
                  title={isPinned ? `Unpin ${c.label}` : `Pin ${c.label}`}
                  onClick={() => onPin(isPinned ? null : c.key)}
                >
                  {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                </button>
                <div
                  className={`resizer${resizing === c.key ? ' active' : ''}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${c.label} column (or Alt+Arrow keys on the focused header)`}
                  aria-valuenow={widthMap[c.key]}
                  aria-valuemin={c.minWidth}
                  aria-valuemax={c.maxWidth}
                  title="Drag to resize · double-click to reset"
                  onPointerDown={(e) => onResizeDown(e, c.key)}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeUp}
                  onPointerCancel={onResizeUp}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => { e.stopPropagation(); setWidth(c.key, c.width); }}
                />
              </div>
            );
          })}
        </div>
        <div className="grid-body" style={{ height: totalHeight, width: totalWidth }} onClick={onBodyClick} onDoubleClick={onBodyDoubleClick}>
          {rendered}
        </div>
      </div>
      {rows.length === 0 && <div className="grid-empty">{empty}</div>}
    </div>
  );
}
