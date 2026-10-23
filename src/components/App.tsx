import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Keyboard, Link2, Pin, RefreshCw, Search, Table2, X } from 'lucide-react';
import { useViewState } from '../hooks/useViewState';
import { csvFilename, downloadCsv, toCsv } from '../lib/csv';
import { applyFilters, removeCondition, type Group } from '../lib/filter';
import { formatInt } from '../lib/format';
import { loadOrders, type LoadedData } from '../lib/loadOrders';
import { FIELDS, FIELD_BY_KEY, type FieldKey } from '../lib/schema';
import { addRange, countVisibleSelected, resolveExportOrders, setMany, toggleId } from '../lib/selection';
import { nextSort, sortOrders } from '../lib/sort';
import { DataGrid, type GridHandle } from './DataGrid';
import { DetailsPanel } from './DetailsPanel';
import { FilterBuilder } from './FilterBuilder';
import { FilterChips } from './FilterChips';
import { Popover } from './Popover';

type Status = { text: string; kind: 'info' | 'warn' | 'error' };

function Shortcuts() {
  const rows: [string, string][] = [
    ['Arrow keys', 'Move the focused cell (↑ from the first row reaches the header)'],
    ['Home / End', 'First / last column (Ctrl+Home / Ctrl+End: first / last cell)'],
    ['PageUp / PageDown', 'Move one screen up / down'],
    ['Space', 'Select or unselect the focused row'],
    ['Shift+Space, Shift+↑/↓', 'Select a range from the last anchor'],
    ['Enter', 'Open the focused row’s details (on a header: sort)'],
    ['Esc', 'Close the details panel'],
    ['Header: P', 'Pin / unpin the focused column'],
    ['Header: Alt+←/→', 'Resize the focused column (Shift for bigger steps)'],
    ['Click / Shift+click', 'Toggle a row / select a range'],
    ['Double-click', 'Open details'],
  ];
  return (
    <dl className="shortcuts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt><kbd>{k}</kbd></dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Explorer({ data }: { data: LoadedData }) {
  const { orders, report } = data;
  const { view, update, urlErrors, dismissUrlErrors, selectionOmitted } = useViewState();
  const { groups, sort, pin, selected } = view;

  const gridRef = useRef<GridHandle>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const statusTimer = useRef(0);

  const notify = useCallback((text: string, kind: Status['kind'] = 'info') => {
    window.clearTimeout(statusTimer.current);
    setStatus({ text, kind });
    statusTimer.current = window.setTimeout(() => setStatus(null), 7000);
  }, []);
  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  // Selected ids from the URL that do not exist in the dataset are dropped (and reported).
  useEffect(() => {
    const unknown = [...selected].filter((id) => !byId.has(id));
    if (unknown.length === 0) return;
    update((v) => ({ ...v, selected: new Set([...v.selected].filter((id) => byId.has(id))) }), 'url');
    setNotice(`${unknown.length} selected order ID${unknown.length === 1 ? '' : 's'} from the URL ${unknown.length === 1 ? 'does' : 'do'} not exist in this dataset and ${unknown.length === 1 ? 'was' : 'were'} ignored.`);
  }, [selected, byId, update]);

  // Pipeline: sort once per sort change; filtering preserves that order. The filter input stays
  // responsive because the (potentially heavy) filtering runs against a deferred copy of the groups.
  const sortedAll = useMemo(() => sortOrders(orders, sort), [orders, sort]);
  const deferredGroups = useDeferredValue(groups);
  const rows = useMemo(() => applyFilters(sortedAll, deferredGroups), [sortedAll, deferredGroups]);
  const pending = deferredGroups !== groups;
  const indexById = useMemo(() => new Map(rows.map((o, i) => [o.id, i] as const)), [rows]);
  const visibleSelectedCount = useMemo(() => countVisibleSelected(selected, indexById), [selected, indexById]);
  const hiddenSelected = selected.size - visibleSelectedCount;
  const filtered = rows !== sortedAll;

  /* ----- state updaters ----- */
  const editGroups = useCallback((fn: (g: Group[]) => Group[]) => update((v) => ({ ...v, groups: fn(v.groups) })), [update]);
  const editFromBuilder = useCallback((fn: (g: Group[]) => Group[]) => { setFiltersOpen(true); editGroups(fn); }, [editGroups]);
  const removeChip = useCallback((gid: string, cid: string) => editGroups((g) => removeCondition(g, gid, cid)), [editGroups]);
  const clearFilters = useCallback(() => editGroups(() => []), [editGroups]);
  const onSort = useCallback((field: FieldKey) => update((v) => ({ ...v, sort: nextSort(v.sort, field) })), [update]);
  const onPin = useCallback((field: FieldKey | null) => update((v) => ({ ...v, pin: field })), [update]);
  const onToggleRow = useCallback((id: string) => update((v) => ({ ...v, selected: toggleId(v.selected, id) })), [update]);
  const onSelectRange = useCallback((a: number, b: number) => update((v) => ({ ...v, selected: addRange(v.selected, rows, a, b) })), [update, rows]);
  const onToggleAll = useCallback(() => {
    const allOn = rows.length > 0 && visibleSelectedCount === rows.length;
    update((v) => ({ ...v, selected: setMany(v.selected, rows.map((o) => o.id), !allOn) }));
  }, [update, rows, visibleSelectedCount]);
  const clearSelection = useCallback(() => update((v) => ({ ...v, selected: new Set() })), [update]);
  const openDetails = useCallback((id: string) => setDetailId(id), []);
  const closeDetails = useCallback(() => { setDetailId(null); gridRef.current?.focus(); }, []);

  const detailOrder = detailId ? byId.get(detailId) ?? null : null;
  const detailIndex = detailId ? indexById.get(detailId) : undefined;
  const stepDetails = (delta: -1 | 1) => {
    if (detailIndex === undefined) return;
    const next = rows[detailIndex + delta];
    if (next) {
      setDetailId(next.id);
      gridRef.current?.revealOrder(next.id);
    }
  };

  const exportCsv = () => {
    try {
      if (selected.size === 0) return notify('Select at least one row to export.', 'warn');
      const list = resolveExportOrders(byId, selected, sort);
      if (list.length === 0) return notify('Nothing to export: the selected orders are not in the dataset.', 'warn');
      const name = csvFilename(list.length);
      downloadCsv(name, toCsv(list));
      const hidden = list.length - countVisibleSelected(new Set(list.map((o) => o.id)), indexById);
      notify(`Exported ${formatInt(list.length)} order${list.length === 1 ? '' : 's'} to ${name}${hidden > 0 ? ` (${formatInt(hidden)} of them hidden by the current filters)` : ''}.`);
    } catch (e) {
      notify(`Export failed: ${e instanceof Error ? e.message : 'unknown error'}.`, 'error');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify('Link to this view copied.');
    } catch {
      notify('Could not copy automatically. Copy the address bar instead.', 'warn');
    }
  };

  const empty = (
    <div className="empty-state" role="status">
      <Search size={22} aria-hidden="true" />
      <h2>No orders match these filters</h2>
      <p>0 of {formatInt(orders.length)} orders match. Adjust a condition above, or clear the filters to see every order.</p>
      <button type="button" className="btn primary" onClick={clearFilters}>Clear filters</button>
    </div>
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand"><span className="logo" aria-hidden="true"><Table2 size={14} /></span> Orders Explorer</div>
        <div className="header-actions">
          <button type="button" className="btn ghost" onClick={copyLink} title="Copy a link to this exact view (filters, sort, pin, selection)">
            <Link2 size={14} /> Copy link
          </button>
          <Popover label="Shortcuts" icon={<Keyboard size={14} />} align="right" className="ghost" title="Keyboard shortcuts" ariaLabel="Keyboard shortcuts">
            {() => <Shortcuts />}
          </Popover>
        </div>
      </header>

      {(urlErrors.length > 0 || selectionOmitted || notice) && (
        <div className="banners">
          {urlErrors.length > 0 && (
            <div className="banner warn" role="alert">
              <AlertTriangle size={14} />
              <div>
                <b>Couldn’t restore the view from this URL, so the default view is shown.</b>
                <ul>{urlErrors.slice(0, 4).map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
              <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={dismissUrlErrors}><X size={14} /></button>
            </div>
          )}
          {selectionOmitted && (
            <div className="banner warn" role="status">
              <AlertTriangle size={14} />
              <div>The selection is too large to store in the URL, so it won’t survive a refresh or a copied link. Filters, sort and pin still will.</div>
            </div>
          )}
          {notice && (
            <div className="banner warn" role="status">
              <AlertTriangle size={14} />
              <div>{notice}</div>
              <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={14} /></button>
            </div>
          )}
        </div>
      )}

      <div className="summary" role="region" aria-label="Dataset summary">
        <strong>orders.json</strong>
        <span className="sep" aria-hidden="true">·</span>
        <span aria-live="polite">
          <b className="tnum">{formatInt(rows.length)}</b> of <span className="tnum">{formatInt(orders.length)}</span> orders{filtered ? ' match' : ''}
          {pending && <span className="muted"> · updating…</span>}
        </span>
        <span className="sep" aria-hidden="true">·</span>
        <span aria-live="polite" title="Selection is kept when filters hide rows; Export CSV exports every selected order.">
          <b className="tnum">{formatInt(selected.size)}</b> selected
          {hiddenSelected > 0 && <span className="muted"> ({formatInt(visibleSelectedCount)} in view, {formatInt(hiddenSelected)} hidden)</span>}
        </span>
        {report.duplicatesRemoved > 0 && (
          <span className="muted right" title={`The source file has ${formatInt(report.sourceRecords)} records. ${report.duplicatesRemoved} repeated order IDs were collapsed to one record each, following data-notes.md.`}>
            {report.duplicatesRemoved} duplicate IDs merged
          </span>
        )}
      </div>

      <FilterBuilder groups={groups} open={filtersOpen} onToggleOpen={() => setFiltersOpen((o) => !o)} onEdit={editFromBuilder} />
      <FilterChips groups={groups} onRemove={removeChip} onClearAll={clearFilters} />

      <div className="table-toolbar">
        <Popover label={pin ? `Pinned: ${FIELD_BY_KEY[pin].label}` : 'Pin column'} icon={<Pin size={14} />} title="Pin one column so it stays visible while scrolling sideways" ariaLabel="Pin column">
          {(close) => (
            <ul className="menu" role="group" aria-label="Choose a column to pin">
              {FIELDS.map((f) => (
                <li key={f.key}>
                  <button type="button" className={pin === f.key ? 'on' : ''} aria-pressed={pin === f.key} onClick={() => { onPin(f.key); close(); }}>
                    <span className="menu-check">{pin === f.key && <Check size={13} />}</span>{f.label}
                  </button>
                </li>
              ))}
              <li className="menu-sep"><button type="button" disabled={!pin} onClick={() => { onPin(null); close(); }}>Unpin column</button></li>
            </ul>
          )}
        </Popover>
        {sort && (
          <span className="tb-sort">
            Sorted by <b>{FIELD_BY_KEY[sort.field].label}</b> {sort.dir === 'asc' ? '↑ ascending' : '↓ descending'}
            <button type="button" className="icon-btn" aria-label="Reset sort" title="Reset sort (file order)" onClick={() => update((v) => ({ ...v, sort: null }))}><X size={12} /></button>
          </span>
        )}
        <span className="grow" />
        <span className="role-status" role="status" aria-live="polite">
          {status && <span className={`status-msg ${status.kind}`}>{status.text}</span>}
        </span>
        <button type="button" className="btn" disabled={selected.size === 0} onClick={clearSelection} title="Clear the selection">Clear selection</button>
        <button
          type="button"
          className="btn primary"
          onClick={exportCsv}
          disabled={selected.size === 0}
          title={selected.size === 0 ? 'Select rows to export' : `Export all ${formatInt(selected.size)} selected orders as CSV${hiddenSelected > 0 ? `, including ${formatInt(hiddenSelected)} hidden by filters` : ''}`}
        >
          <Download size={14} /> Export CSV{selected.size > 0 && <span className="count-badge on-primary">{formatInt(selected.size)}</span>}
        </button>
      </div>

      <main className="grid-area">
        <DataGrid
          ref={gridRef}
          rows={rows}
          indexById={indexById}
          selected={selected}
          visibleSelectedCount={visibleSelectedCount}
          sort={sort}
          pin={pin}
          onSort={onSort}
          onPin={onPin}
          onToggleRow={onToggleRow}
          onSelectRange={onSelectRange}
          onToggleAll={onToggleAll}
          onOpen={openDetails}
          empty={empty}
          busy={pending}
        />
        {detailOrder && (
          <DetailsPanel
            key={detailOrder.id}
            order={detailOrder}
            position={detailIndex === undefined ? null : { index: detailIndex, total: rows.length }}
            onClose={closeDetails}
            onStep={stepDetails}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: LoadedData }>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    loadOrders(ctrl.signal)
      .then((data) => setState({ kind: 'ready', data }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error while loading orders.' });
      });
    return () => ctrl.abort();
  }, [attempt]);

  if (state.kind === 'ready') return <Explorer data={state.data} />;
  return (
    <div className="app">
      <header className="app-header"><div className="brand"><span className="logo" aria-hidden="true"><Table2 size={14} /></span> Orders Explorer</div></header>
      <div className="load-state" role={state.kind === 'error' ? 'alert' : 'status'}>
        {state.kind === 'loading' ? (
          <><span className="spinner" aria-hidden="true" /> Loading and cleaning orders…</>
        ) : (
          <>
            <AlertTriangle size={20} />
            <h2>Couldn’t load the orders</h2>
            <p>{state.message}</p>
            <button type="button" className="btn primary" onClick={() => setAttempt((a) => a + 1)}><RefreshCw size={14} /> Try again</button>
          </>
        )}
      </div>
    </div>
  );
}
