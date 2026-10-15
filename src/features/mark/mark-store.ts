import { boundText, cleanEgressText } from '../../egress';
import type { StateStore } from '../../local-state';
import type { PageReading } from '../shared';
import type { MarkRecord } from './mark-record';

/** A mark lives 15 minutes (spec §8.7): long enough for a multi-step act, short enough to leave little on disk. */
export const MARK_TTL_MS = 900_000;
/** The before-text a mark keeps, after cleaning. */
export const MARK_TEXT_MAX = 6_000;
const TITLE_MAX = 300;
const URL_MAX = 2_000;

/** The URL without query or fragment: a query often carries tokens, and a mark never needs one. */
export function markUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'null') return boundText(`${parsed.origin}${parsed.pathname}`, { max: URL_MAX });
  } catch {
    // Not a URL: cut at the first `?` or `#` below.
  }
  return boundText(url.split(/[?#]/, 1)[0] ?? '', { max: URL_MAX });
}

/**
 * A page as a mark keeps it: query-less URL; title and text redacted and PII-masked (masks always on, whatever
 * the config says), then cut. Both sides of a `--mark` comparison go through this, so they compare alike.
 */
export function markView(reading: PageReading): Pick<MarkRecord, 'url' | 'title' | 'text'> {
  return {
    url: markUrl(reading.tab.url),
    title: boundText(cleanEgressText(reading.tab.title, true), { max: TITLE_MAX, inline: true }),
    text: boundText(cleanEgressText(reading.text, true), { max: MARK_TEXT_MAX }),
  };
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A stored mark read back from disk, checked field by field; anything else is not a mark. */
export function asMark(value: unknown): MarkRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;
  const ok = isText(m.id) && isText(m.pageId) && (m.label === null || isText(m.label))
    && isText(m.url) && isText(m.title) && isText(m.text) && isTime(m.createdAt) && isTime(m.ttlMs);
  return ok ? (value as MarkRecord) : null;
}

export async function saveMark(store: StateStore, mark: MarkRecord): Promise<void> {
  await store.put(mark.pageId, 'mark', mark.id, mark);
}

/** The mark, or why there is none: `expired` past `createdAt + ttlMs` (never refreshed), `missing` otherwise. */
export async function loadMark(store: StateStore, id: string, nowMs: number): Promise<MarkRecord | 'expired' | 'missing'> {
  const hit = await store.find('mark', id);
  if (hit === null) return 'missing';
  const mark = asMark(hit.value);
  if (mark === null || mark.id !== id || mark.pageId !== hit.pageId) return 'missing';
  return nowMs >= mark.createdAt + mark.ttlMs ? 'expired' : mark;
}
