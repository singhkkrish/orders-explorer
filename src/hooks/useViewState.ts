import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultView, differOnlyInSelection, parseView, serializeView, type ViewState } from '../lib/urlState';

const WRITE_DELAY_MS = 250;

/**
 * Owns the shareable view (filters, sort, pinned column, selection).
 *
 * React state is the source of truth; the URL is a projection of it. We read the URL only
 * (a) once on load and (b) on `popstate`, and we write it from an effect, so the two
 * can never ping-pong. History policy: changes to filters/sort/pin push a new entry
 * (Back/Forward walk through them); selection-only changes replace the current entry,
 * so Back is not consumed by every row click.
 */
export function useViewState() {
  const [initial] = useState(() => parseView(window.location.search));
  const [view, setView] = useState<ViewState>(initial.view);
  const [urlErrors, setUrlErrors] = useState<string[]>(initial.errors);
  const [selectionOmitted, setSelectionOmitted] = useState(false);
  // Where the latest change came from. 'url' changes (initial load, popstate, housekeeping) must never push history.
  const origin = useRef<'user' | 'url'>('url');

  const update = useCallback((fn: (v: ViewState) => ViewState, from: 'user' | 'url' = 'user') => {
    origin.current = from;
    setView(fn);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const r = parseView(window.location.search);
      origin.current = 'url';
      setView(r.view);
      setUrlErrors(r.errors);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(
      () => {
        const { search, selectionOmitted: omitted } = serializeView(view);
        setSelectionOmitted(omitted);
        const current = window.location.search.replace(/^\?/, '');
        if (search === current) return;
        const url = window.location.pathname + (search ? `?${search}` : '') + window.location.hash;
        if (origin.current === 'user' && !differOnlyInSelection(current, search)) window.history.pushState(null, '', url);
        else window.history.replaceState(null, '', url);
      },
      origin.current === 'user' ? WRITE_DELAY_MS : 0,
    );
    return () => window.clearTimeout(t);
  }, [view]);

  const dismissUrlErrors = useCallback(() => setUrlErrors([]), []);
  const reset = useCallback(() => update(() => defaultView()), [update]);

  return { view, update, urlErrors, dismissUrlErrors, selectionOmitted, reset };
}
