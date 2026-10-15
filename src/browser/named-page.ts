import { BrowserError } from './browser-error';
import type { PageHint } from './page-hint';

/**
 * The page the invocation names: `--page`, then `REFSURE_PAGE`; null when neither does, and each backend picks its
 * own default. A given `--page` is final: a blank one never falls through (the registry refuses it first).
 */
export function namedPage(hint: PageHint, env: NodeJS.ProcessEnv): string | null {
  if (hint.page !== undefined) {
    const id = hint.page.trim();
    if (!id) throw new BrowserError('no_tab', '--page is empty');
    return id;
  }
  return env.REFSURE_PAGE?.trim() || null;
}
