import { boundText, cleanEgressText } from '../../egress';
import type { StateStore } from '../../local-state';
import { type PageReading, typedWithheld, withoutTyped } from '../shared';
import { bareUrl } from './bare-url';
import type { MarkRecord } from './mark-record';

/** A mark lives 15 minutes (spec §8.7): long enough for a multi-step act, short enough to leave little on disk. */
export const MARK_TTL_MS = 900_000;
/** The before-text a mark keeps, after cleaning. */
const MARK_TEXT_MAX = 6_000;
const TITLE_MAX = 300;
const URL_MAX = 2_000;

/**
 * A page as a mark keeps it: query-less URL; the text without what was typed into editable regions (spec §7.3); URL,
 * title and text redacted and PII-masked (masks always on, whatever the config says), then cut. Both sides of a
 * `--mark` comparison go through this, so they compare alike.
 */
export function markView(
  reading: PageReading,
): Pick<MarkRecord, 'url' | 'title' | 'text' | 'textCut' | 'textWithheld'> {
  const text = cleanEgressText(withoutTyped(reading.text, reading.typed), true);
  return {
    url: bareUrl(reading.tab.url, { max: URL_MAX }),
    title: boundText(cleanEgressText(reading.tab.title, true), { max: TITLE_MAX, inline: true }),
    text: boundText(text, { max: MARK_TEXT_MAX }),
    textCut: text.length > MARK_TEXT_MAX,
    textWithheld: typedWithheld(reading.text, reading.typed) !== null,
  };
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A stored mark read back from disk, checked field by field; anything else is not a mark. `textWithheld` came later:
 * a mark stored without it reads false.
 */
function asMark(value: unknown): MarkRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;
  const ok = isText(m.id) && isText(m.pageId) && (m.label === null || isText(m.label))
    && isText(m.url) && isText(m.title) && isText(m.text) && typeof m.textCut === 'boolean'
    && (m.textWithheld === undefined || typeof m.textWithheld === 'boolean')
    && isTime(m.createdAt) && isTime(m.ttlMs);
  return ok ? { ...(value as MarkRecord), textWithheld: m.textWithheld === true } : null;
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
