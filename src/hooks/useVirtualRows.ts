import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { computeRange, scrollOffsetToReveal, type RowRange } from '../lib/virtual';

interface Options {
  count: number;
  rowHeight: number;
  overscan: number;
  /** Height of the sticky header that sits inside the scroll container, above the rows. */
  headerHeight: number;
}

/**
 * Hand-written row virtualiser for a single scroll container with fixed-height rows.
 * - scroll events only read `scrollTop` and schedule ONE requestAnimationFrame;
 * - React state changes only when the rendered row window [start, end) actually changes;
 * - a ResizeObserver tracks the viewport height;
 * - every listener / observer / scheduled frame is released on cleanup.
 */
export function useVirtualRows({ count, rowHeight, overscan, headerHeight }: Options) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState<RowRange>({ start: 0, end: 0 });
  const metrics = useRef({ scrollTop: 0, viewport: 0 });
  const frame = useRef(0);

  const recompute = useCallback(() => {
    frame.current = 0;
    const m = metrics.current;
    const next = computeRange(m.scrollTop, m.viewport, rowHeight, count, overscan);
    setRange((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [count, rowHeight, overscan]);

  const recomputeRef = useRef(recompute);
  recomputeRef.current = recompute;

  const schedule = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(() => recomputeRef.current());
  }, []);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      metrics.current.scrollTop = el.scrollTop;
      metrics.current.viewport = Math.max(0, el.clientHeight - headerHeight);
    };
    const onScroll = () => {
      metrics.current.scrollTop = el.scrollTop;
      schedule();
    };
    measure();
    recomputeRef.current();
    const ro = new ResizeObserver(() => {
      measure();
      schedule();
    });
    ro.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [el, headerHeight, schedule]);

  // The list length / row height changed (filtering): refresh synchronously, before paint.
  useLayoutEffect(() => {
    if (!el) return;
    metrics.current.scrollTop = el.scrollTop;
    recompute();
  }, [el, recompute]);

  /** Scrolls just enough to bring a row fully into view (below the sticky header). */
  const scrollToRow = useCallback(
    (index: number) => {
      if (!el) return;
      const viewport = Math.max(0, el.clientHeight - headerHeight);
      const next = scrollOffsetToReveal(index * rowHeight, (index + 1) * rowHeight, el.scrollTop, viewport);
      if (next !== el.scrollTop) {
        el.scrollTop = next;
        metrics.current.scrollTop = next;
        recomputeRef.current();
      }
    },
    [el, headerHeight, rowHeight],
  );

  return { setEl, el, range, totalHeight: count * rowHeight, scrollToRow, viewportRows: Math.max(1, Math.floor(metrics.current.viewport / rowHeight)) };
}
