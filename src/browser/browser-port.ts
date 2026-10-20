import type { ActBinding } from './act-binding';
import type { ActAction, ActResult } from './act-result';
import type { AxTree, Ref } from './ax-tree';
import type { BackendHealth } from './backend-health';
import type { BrowserCapability } from './capability';
import type { ConsoleLine } from './console-line';
import type { NetworkLine } from './network-line';
import type { PageHint } from './page-hint';
import type { PageRef } from './page-ref';
import type { Settled } from './settled';
import type { TabInfo } from './tab-info';

/** The only way commands reach a browser (spec §5.2). Optional methods are gated by `features()`. */
export interface BrowserPort {
  backend: 'orca' | 'agent-browser';
  /**
   * Binary, version, status, features; used by doctor. agent-browser asks only the session `hint` names (else its
   * default); Orca ignores it.
   */
  probe(hint?: PageHint): Promise<BackendHealth>;
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
  /**
   * `bind`, for a click: the name the caller's guard read on the fresh tree. Orca then clicks through its own mouse at
   * the element's point (press and release, no move) when the element at that point carries that name, and through
   * agent-browser otherwise; the agent-browser backend ignores it.
   */
  act(page: PageRef, ref: Ref, action: ActAction, value?: string, bind?: ActBinding): Promise<ActResult>;
  /**
   * `act` fill in fewer page calls, for a field the caller knows is no editable region (the page holds none): the
   * value replaces what the field holds, with the input events typing fires. Page-changing, like `act`. Absent where
   * `act` fill is already one call.
   */
  fillInput?(page: PageRef, ref: Ref, value: string): Promise<ActResult>;
  /**
   * Enter in element `ref` (never a terminal: the backend sends it to the page itself). The key goes to whatever
   * has focus, so the element is focused first: page script that moved focus since cannot take it elsewhere.
   * Page-changing, like `act`; `stale_ref` when the element is gone before anything was sent.
   */
  pressEnter?(page: PageRef, ref: Ref): Promise<ActResult>;
  /**
   * Waits until the page has rendered a frame and, with `anim`, runs no finite animation, at most `capMs`. Read only:
   * it reads a frame count and an animation count, never page text. Throws when the backend cannot wait so (Orca's
   * CLI transport); the caller then waits a fixed time.
   */
  settle?(page: PageRef, capMs: number, anim: boolean): Promise<Settled>;
  /**
   * Paints the page once if it has never painted (one loaded while its Orca tab was hidden, which drops or holds
   * clicks and keys), never showing or focusing the tab. No act: nothing counts as dispatched. Best effort: it never
   * throws, and a page it could not paint stays as it was. A hidden tab draws no frame even once painted.
   */
  paint?(page: PageRef): Promise<void>;
  /** Scrolls the page down by `px`. It moves the view only, so it is no act: nothing is dispatched. */
  scrollDown?(page: PageRef, px: number): Promise<void>;
  highlight?(page: PageRef, ref: Ref): Promise<void>;
  /** The page's recent console lines; a caller filters them by time itself. */
  console?(page: PageRef): Promise<ConsoleLine[]>;
  /** The page's recent requests; a caller filters them by time itself. */
  network?(page: PageRef): Promise<NetworkLine[]>;
  dialogDismiss?(page: PageRef): Promise<boolean>;
}
