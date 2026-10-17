import type { BrowserPort, PageRef } from '../../browser';
import type { RunTrace } from '../../output';
import type { PageReading } from './page-reading';
import { readTyped } from './read-typed';
import { typedWithheld, withheldNote } from './without-typed';

/**
 * `tab show` and `get text body`, at once (spec §6.2: the before-read, the after-read, one poll), with what was typed
 * into editable regions, which the Decision inputs cut out (`withoutTyped`). A withheld text is noted once.
 */
export async function readPage(ctx: { browser: BrowserPort; trace: RunTrace }, page: PageRef): Promise<PageReading> {
  const [tab, text, typed] = await Promise.all([
    ctx.browser.tabInfo(page), ctx.browser.text(page, 'body'), readTyped(ctx.browser, page),
  ]);
  const withheld = typedWithheld(text, typed);
  if (withheld !== null) {
    const note = withheldNote(withheld);
    if (!ctx.trace.notes.includes(note)) ctx.trace.notes.push(note);
  }
  return { tab, text, typed };
}
