import type { ActAction, ActResult } from './act-result';
import type { AxTree, Ref } from './ax-tree';
import type { BackendHealth } from './backend-health';
import type { BrowserCapability } from './capability';
import type { ConsoleLine } from './console-line';
import type { NetworkLine } from './network-line';
import type { PageHint } from './page-hint';
import type { PageRef } from './page-ref';
import type { TabInfo } from './tab-info';

/** The only way commands reach a browser (spec §5.2). Optional methods are gated by `features()`. */
export interface BrowserPort {
  backend: 'orca' | 'agent-browser';
  /** Binary, version, status, features; used by doctor. */
  probe(): Promise<BackendHealth>;
  features(): ReadonlySet<BrowserCapability>;
  /** Orca: `--page` → `REFSURE_PAGE` → `tab current --worktree`. */
  resolvePage(hint: PageHint): Promise<PageRef>;
  tabInfo(page: PageRef): Promise<TabInfo>;
  /** Parsed and backend-neutral; never raw agent-browser text. */
  snapshot(page: PageRef): Promise<AxTree>;
  /** innerText of the body or of one element. */
  text(page: PageRef, target: 'body' | Ref): Promise<string>;
  attr?(page: PageRef, ref: Ref, name: string): Promise<string | null>;
  count?(page: PageRef, css: string): Promise<number>;
  /** innerText of the first element a CSS selector matches; a backend error when none does. Read only. */
  selectorText?(page: PageRef, css: string): Promise<string>;
  /**
   * An attribute of the first element a selector matches (null when it lacks it); a backend error when none does.
   * Read only. The selector (CSS, or `xpath=…` as agent-browser reads it) has no double quote or backslash: Orca
   * hands it to agent-browser's own tokenizer as one quoted token.
   */
  selectorAttr?(page: PageRef, css: string, name: string): Promise<string | null>;
  act(page: PageRef, ref: Ref, action: ActAction, value?: string): Promise<ActResult>;
  highlight?(page: PageRef, ref: Ref): Promise<void>;
  /** The page's recent console lines; a caller filters them by time itself. */
  console?(page: PageRef): Promise<ConsoleLine[]>;
  /** The page's recent requests; a caller filters them by time itself. */
  network?(page: PageRef): Promise<NetworkLine[]>;
  dialogDismiss?(page: PageRef): Promise<boolean>;
}
