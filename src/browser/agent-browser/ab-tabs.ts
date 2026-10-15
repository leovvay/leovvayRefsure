import { isRecord } from '../../shared';

/**
 * The active tab's id from `tab list` (`{tabs: [{tabId: "t1", active: true, …}]}`): the tab every other verb on
 * the session reads and acts on. agent-browser does not reuse a tab id while its browser lives. Null when no tab is
 * marked active or the shape is off.
 */
export function activeTabId(result: unknown): string | null {
  const tabs = isRecord(result) ? result.tabs : null;
  if (!Array.isArray(tabs)) return null;
  const active = tabs.find((tab) => isRecord(tab) && tab.active === true);
  return isRecord(active) && typeof active.tabId === 'string' ? active.tabId : null;
}
