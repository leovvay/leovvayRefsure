import type { PageRef } from '../../browser';
import type { CommandContext } from '../../cli';
import { sha256Hex } from '../../egress';

/** A wait that starts this soon after an earlier one ended on the same page counts from that one's last change. */
const CARRY_MS = 120_000;
/** How long the record is kept before purge removes it. */
const KEEP_MS = 10 * 60_000;

/**
 * When a page last changed, as a wait saw it: the stall rule's key (a hash of the URL and the text as read, never the
 * text) and the time it took that value. `at` is when the wait that saw it ended.
 */
export interface PageStill { key: string; since: number; at: number }

function stillId(page: PageRef): string {
  return sha256Hex(`${page.backend}\n${page.id}`).slice(0, 32);
}

function isStill(value: unknown): value is PageStill {
  const v = value as Partial<PageStill> | null;
  return typeof v === 'object' && v !== null && typeof v.key === 'string'
    && typeof v.since === 'number' && typeof v.at === 'number';
}

/**
 * The page's last change as the wait that ended just before this one saw it, or null: none, another page, older than
 * `CARRY_MS`, or unreadable. A record only saves waiting, so any failure reads as none.
 */
export async function readStill(ctx: CommandContext, page: PageRef): Promise<PageStill | null> {
  try {
    const found = await ctx.store.find('still', stillId(page));
    if (found === null || found.pageId !== page.id || !isStill(found.value)) return null;
    const { value } = found;
    const now = ctx.now();
    return value.since <= value.at && value.at <= now && now - value.at <= CARRY_MS ? value : null;
  } catch {
    return null;
  }
}

/** Keeps the page's last change for the next wait on it; a failed write is dropped. */
export async function writeStill(ctx: CommandContext, page: PageRef, key: string, since: number): Promise<void> {
  try {
    const at = ctx.now();
    await ctx.store.put(page.id, 'still', stillId(page), { key, since, at, createdAt: at, ttlMs: KEEP_MS });
  } catch {
    // Only a later wait's time depends on it.
  }
}
