import type { TabInfo } from '../../browser';

/** One look at a page: `tab show` plus the body's innerText. The text is page text, never sent uncleaned. */
export interface PageReading { tab: TabInfo; text: string }
