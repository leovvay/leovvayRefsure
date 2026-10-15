import type { PageRef, TabInfo } from '../browser';
import { urlNorm } from '../page-model';
import type { Ticket } from './ticket';

/**
 * Where a ticket's pick was made: the page, its normalised URL, and, when the page id can name more than one tab
 * (an agent-browser session), the tab that answered. `recheck` holds the act to all three.
 */
export function ticketPlace(page: PageRef, tab: TabInfo): Pick<Ticket, 'pageId' | 'urlNorm' | 'tabKey'> {
  return { pageId: page.id, urlNorm: urlNorm(tab.url), ...(tab.tabKey ? { tabKey: tab.tabKey } : {}) };
}
