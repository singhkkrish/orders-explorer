/** Pure maths for the hand-written row virtualiser. */

export interface RowRange {
  /** First rendered row index (inclusive). */
  start: number;
  /** Last rendered row index (exclusive). */
  end: number;
}

/**
 * Rows to render for a fixed row height: every row intersecting the viewport,
 * plus `overscan` extra rows above and below.
 */
export function computeRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan: number,
): RowRange {
  if (count <= 0 || rowHeight <= 0 || viewportHeight <= 0) return { start: 0, end: 0 };
  const maxScroll = Math.max(0, count * rowHeight - viewportHeight);
  const top = Math.min(Math.max(0, scrollTop), maxScroll);
  const first = Math.floor(top / rowHeight);
  const last = Math.ceil((top + viewportHeight) / rowHeight); // exclusive
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + overscan) };
}

/**
 * New scroll offset that brings [itemStart, itemEnd) fully into view, or the current offset
 * when it already is. `leadingInset` is space at the viewport start covered by sticky UI.
 */
export function scrollOffsetToReveal(
  itemStart: number,
  itemEnd: number,
  scroll: number,
  viewport: number,
  leadingInset = 0,
): number {
  if (itemStart < scroll + leadingInset) return Math.max(0, itemStart - leadingInset);
  if (itemEnd > scroll + viewport) return Math.max(0, itemEnd - viewport);
  return scroll;
}
