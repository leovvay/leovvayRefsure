import type { ActAction, BrowserPort, PageRef, Ref, TabInfo } from '../browser';
import { DryRunStop } from '../output';
import { RegistryInvariantError } from './registry-invariant-error';
import type { WatchedBrowser } from './watched-browser';

interface WatchOpts { command: string; mayAct: boolean; dryRun: boolean }

/**
 * Wraps the port for one command. It remembers the last `tabInfo`, and it guards every method that changes the
 * page (`act`, `dialogDismiss`): an `acts: never` verb cannot reach them, and under `--dry-run` they throw
 * `DryRunStop` before anything is dispatched. Methods are delegated one by one, so a frozen port still works.
 */
export function watchBrowser(browser: BrowserPort, opts: WatchOpts): WatchedBrowser {
  let last: TabInfo | null = null;
  const guard = (): void => {
    if (!opts.mayAct) throw new RegistryInvariantError(`${opts.command} never acts, yet it tried to`);
    if (opts.dryRun) throw new DryRunStop();
  };
  const port: BrowserPort = {
    backend: browser.backend,
    probe: () => browser.probe(),
    features: () => browser.features(),
    resolvePage: (hint) => browser.resolvePage(hint),
    tabInfo: async (page: PageRef) => {
      const tab = await browser.tabInfo(page);
      last = tab;
      return tab;
    },
    snapshot: (page) => browser.snapshot(page),
    text: (page, target) => browser.text(page, target),
    act: async (page: PageRef, ref: Ref, action: ActAction, value?: string) => {
      guard();
      return browser.act(page, ref, action, value);
    },
  };
  const { attr, html, count, selectorText, selectorAttr, highlight, network, dialogDismiss } = browser;
  const consoleLines = browser.console;
  if (attr) port.attr = (page, ref, name) => attr.call(browser, page, ref, name);
  if (html) port.html = (page, ref) => html.call(browser, page, ref);
  if (count) port.count = (page, css) => count.call(browser, page, css);
  if (selectorText) port.selectorText = (page, css) => selectorText.call(browser, page, css);
  if (selectorAttr) port.selectorAttr = (page, css, name) => selectorAttr.call(browser, page, css, name);
  if (highlight) port.highlight = (page, ref) => highlight.call(browser, page, ref);
  if (consoleLines) port.console = (page, since) => consoleLines.call(browser, page, since);
  if (network) port.network = (page, since) => network.call(browser, page, since);
  if (dialogDismiss) {
    port.dialogDismiss = async (page) => {
      guard();
      return dialogDismiss.call(browser, page);
    };
  }
  return { port, lastTab: () => last };
}
