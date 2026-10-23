import { normalizeOrders, type NormalizationReport } from './normalize';
import type { Order } from './schema';

export interface LoadedData {
  orders: Order[];
  report: NormalizationReport;
}

/**
 * The 17 MB dataset is served as a static asset (public/data/orders.json) and fetched at
 * runtime instead of being bundled into the JS: the app shell paints immediately, the
 * browser can cache the file independently, and the original file stays byte-for-byte unmodified.
 */
export async function loadOrders(signal?: AbortSignal): Promise<LoadedData> {
  const url = `${import.meta.env.BASE_URL}data/orders.json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}).`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error('orders.json is not a JSON array.');
  return normalizeOrders(json);
}
