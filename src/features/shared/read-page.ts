import type { BrowserPort, PageRef } from '../../browser';
import type { RunTrace } from '../../output';
import type { PageReading } from './page-reading';
import { readTyped } from './read-typed';

/**
 * `tab show` and `get text body`, at once (spec §6.2: the before-read, the after-read, one poll), with what was typed
 * into editable regions, which the Decision inputs cut out (`withoutTyped`). An unread one is noted once.
 */
export async function readPage(ctx: { browser: BrowserPort; trace: RunTrace }, page: PageRef): Promise<PageReading> {
  const [tab, text, typed] = await Promise.all([
    ctx.browser.tabInfo(page), ctx.browser.text(page, 'body'), readTyped(ctx.browser, page),
  ]);
  if ('unread' in typed) {
    const note = `typed_text_withheld: ${typed.unread}; no Decision gets this page's text`;
    if (!ctx.trace.notes.includes(note)) ctx.trace.notes.push(note);
  }
  return { tab, text, typed };
}
