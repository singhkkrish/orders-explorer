import { Fragment, memo } from 'react';
import { X } from 'lucide-react';
import { activeGroups, describeCondition, type Group } from '../lib/filter';

interface Props {
  groups: Group[];
  onRemove: (groupId: string, conditionId: string) => void;
  onClearAll: () => void;
}

/** Chips are derived from the same `activeGroups()` the filter engine uses, so they can never drift from the real filtering. */
export const FilterChips = memo(function FilterChips({ groups, onRemove, onClearAll }: Props) {
  const active = activeGroups(groups);
  if (active.length === 0) return null;
  return (
    <div className="chips" role="list" aria-label="Active filters">
      {active.map((g, gi) => (
        <Fragment key={g.id}>
          {gi > 0 && <span className="chip-and" aria-hidden="true">AND</span>}
          <span className="chip-group" role="listitem">
            {g.conditions.map((c, ci) => {
              const d = describeCondition(c);
              const text = `${d.field} ${d.op} ${d.value}`;
              return (
                <Fragment key={c.id}>
                  {ci > 0 && <span className="chip-or" aria-hidden="true">or</span>}
                  <span className="chip" title={text}>
                    <span className="chip-text"><b>{d.field}</b> {d.op} {d.value}</span>
                    <button type="button" aria-label={`Remove filter: ${text}`} title="Remove filter" onClick={() => onRemove(g.id, c.id)}>
                      <X size={12} />
                    </button>
                  </span>
                </Fragment>
              );
            })}
          </span>
        </Fragment>
      ))}
      <button type="button" className="btn small ghost" onClick={onClearAll}>Clear all</button>
    </div>
  );
});
