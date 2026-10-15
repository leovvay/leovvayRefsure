import type { BrowserPort, PageRef } from '../../browser';
import type { PageReading } from './page-reading';

/** `tab show` and `get text body`, at once (spec §6.2: the before-read, the after-read, one poll). */
export async function readPage(browser: BrowserPort, page: PageRef): Promise<PageReading> {
  const [tab, text] = await Promise.all([browser.tabInfo(page), browser.text(page, 'body')]);
  return { tab, text };
}
