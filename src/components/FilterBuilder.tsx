import { memo, useId } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import {
  countActiveConditions, newCondition, newGroup, validateCondition, withField, withOperator,
  type Condition, type Group,
} from '../lib/filter';
import { FIELDS, FIELD_BY_KEY, OPERATORS_BY_KIND, OPERATOR_LABELS, type FieldKey, type Operator } from '../lib/schema';

type Edit = (fn: (groups: Group[]) => Group[]) => void;

interface Props {
  groups: Group[];
  open: boolean;
  onToggleOpen: () => void;
  onEdit: Edit;
}

function ValueInputs({ c, onChange }: { c: Condition; onChange: (values: string[]) => void }) {
  const def = FIELD_BY_KEY[c.field];
  const label = def.label.replace(' (UTC)', '');
  const id = useId();
  const set = (i: number, v: string) => {
    const next = [...c.values];
    while (next.length <= i) next.push('');
    next[i] = v;
    onChange(next);
  };
  switch (def.kind) {
    case 'enum':
      return (
        <div className="pills" role="group" aria-label={`${label} values`}>
          {def.options!.map((o) => {
            const on = c.values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className={`pill${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange(on ? c.values.filter((v) => v !== o.value) : [...c.values, o.value])}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    case 'text':
      return (
        <input
          className="input grow"
          type="text"
          maxLength={200}
          placeholder="Text…"
          aria-label={`${label} text`}
          value={c.values[0] ?? ''}
          onChange={(e) => onChange([e.target.value])}
          spellCheck={false}
          autoComplete="off"
        />
      );
    case 'number':
      return c.op === 'between' ? (
        <>
          <input className="input num" inputMode="decimal" placeholder="Min" aria-label={`${label} minimum`} value={c.values[0] ?? ''} onChange={(e) => set(0, e.target.value)} autoComplete="off" />
          <span className="muted">and</span>
          <input className="input num" inputMode="decimal" placeholder="Max" aria-label={`${label} maximum`} value={c.values[1] ?? ''} onChange={(e) => set(1, e.target.value)} autoComplete="off" />
        </>
      ) : (
        <input className="input num" inputMode="decimal" placeholder="Number" aria-label={`${label} value`} value={c.values[0] ?? ''} onChange={(e) => set(0, e.target.value)} autoComplete="off" />
      );
    case 'date':
      return c.op === 'between' ? (
        <>
          <input id={id} className="input date" type="date" aria-label={`${label} from`} value={c.values[0] ?? ''} onChange={(e) => set(0, e.target.value)} />
          <span className="muted">and</span>
          <input className="input date" type="date" aria-label={`${label} to`} value={c.values[1] ?? ''} onChange={(e) => set(1, e.target.value)} />
        </>
      ) : (
        <input id={id} className="input date" type="date" aria-label={`${label} date`} value={c.values[0] ?? ''} onChange={(e) => set(0, e.target.value)} />
      );
  }
}

function ConditionRow({ c, groupId, first, onEdit }: { c: Condition; groupId: string; first: boolean; onEdit: Edit }) {
  const def = FIELD_BY_KEY[c.field];
  const validity = validateCondition(c);
  const patch = (next: Condition) =>
    onEdit((gs) => gs.map((g) => (g.id === groupId ? { ...g, conditions: g.conditions.map((x) => (x.id === c.id ? next : x)) } : g)));
  const remove = () =>
    onEdit((gs) =>
      gs.map((g) => (g.id === groupId ? { ...g, conditions: g.conditions.filter((x) => x.id !== c.id) } : g)).filter((g) => g.conditions.length > 0),
    );
  return (
    <div className="cond">
      <span className="cond-join" aria-hidden="true">{first ? 'Where' : 'or'}</span>
      <select className="select" aria-label="Field" value={c.field} onChange={(e) => patch(withField(c, e.target.value as FieldKey))}>
        {FIELDS.map((f) => (
          <option key={f.key} value={f.key}>{f.label.replace(' (UTC)', '')}</option>
        ))}
      </select>
      <select className="select" aria-label="Operator" value={c.op} onChange={(e) => patch(withOperator(c, e.target.value as Operator))}>
        {OPERATORS_BY_KIND[def.kind].map((op) => (
          <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
        ))}
      </select>
      <ValueInputs c={c} onChange={(values) => patch({ ...c, values })} />
      <button type="button" className="icon-btn" aria-label="Remove condition" title="Remove condition" onClick={remove}>
        <X size={14} />
      </button>
      {validity.state === 'invalid' && <span className="hint error" role="alert">{validity.message}</span>}
      {validity.state === 'incomplete' && <span className="hint">Not applied yet · {validity.message}</span>}
    </div>
  );
}

export const FilterBuilder = memo(function FilterBuilder({ groups, open, onToggleOpen, onEdit }: Props) {
  const active = countActiveConditions(groups);
  const regionId = useId();
  return (
    <section className="builder" aria-label="Filter builder">
      <div className="builder-head">
        <button type="button" className="btn ghost" aria-expanded={open} aria-controls={regionId} onClick={onToggleOpen} disabled={groups.length === 0}>
          {open && groups.length > 0 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Filters{active > 0 && <span className="count-badge">{active}</span>}
        </button>
        {groups.length === 0 && <span className="muted">No filters. Showing every order.</span>}
        <button type="button" className="btn" onClick={() => onEdit((gs) => [...gs, newGroup()])}>
          <Plus size={14} /> {groups.length === 0 ? 'Add filter' : 'Add group (AND)'}
        </button>
      </div>
      {open && groups.length > 0 && (
        <div className="builder-body" id={regionId}>
          {groups.map((g, gi) => (
            <div key={g.id}>
              {gi > 0 && <div className="and-divider"><span>AND</span></div>}
              <div className="group" role="group" aria-label={`Filter group ${gi + 1}: match any condition`}>
                <div className="group-head">
                  <span className="group-title">Group {gi + 1} · match <b>any</b> of</span>
                  <button type="button" className="btn small ghost" onClick={() => onEdit((gs) => gs.map((x) => (x.id === g.id ? { ...x, conditions: [...x.conditions, newCondition()] } : x)))}>
                    <Plus size={12} /> OR condition
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Remove group ${gi + 1}`} title="Remove group" onClick={() => onEdit((gs) => gs.filter((x) => x.id !== g.id))}>
                    <X size={14} />
                  </button>
                </div>
                {g.conditions.map((c, ci) => (
                  <ConditionRow key={c.id} c={c} groupId={g.id} first={ci === 0} onEdit={onEdit} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
});
