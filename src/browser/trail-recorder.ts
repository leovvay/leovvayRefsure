import type { ActResult } from './act-result';
import type { AxTree } from './ax-tree';
import type { PageRef } from './page-ref';

/** What the trail calls an act: the typed acts, Enter and a scroll. */
export type TrailAction = 'click' | 'dblclick' | 'fill' | 'select' | 'check' | 'uncheck' | 'enter' | 'scroll';

/**
 * One act about to go to a page: which, and on which ref (none for a scroll). There is no value here, on purpose:
 * a fill's text and a select's option stay in the closure that sends them, and the trail can only say "typing".
 */
export interface TrailAct { action: TrailAction; ref: string | null }

/** An act the recorder opened (`begin`), handed back to `draw` and `end`. Opaque to the browser. */
export interface TrailOpen { readonly id: string }

/** Sends one draw call to a page. Best effort: it never throws, and a draw it cannot send is dropped. */
export type TrailSend = (page: PageRef, call: string) => Promise<void>;

/** How the command ended, for the post-command draw: its status and cause, and whether it ran under `--dry-run`. */
export interface TrailClose { status: string; cause: string | null; dryRun: boolean; aborted: boolean }

/**
 * The port the Orca adapter records refsure's own steps through, for the in-page trail (spec trail v1). `src/trail`
 * implements it and `main.ts` injects it; the browser never imports the trail. Every method is cheap and
 * synchronous apart from `close`, and the adapter swallows anything one throws: a trail fault never changes an act.
 */
export interface TrailRecorder {
  /** Whether the trail runs in this process: `REFSURE_TRAIL` leaves it on, and a page script is built in. */
  on(): boolean;
  /** A snapshot of `page` that took `ms`: the step's read time, node count, origin, and role and name by ref. */
  read(page: PageRef, ms: number, tree: AxTree): void;
  /** An act about to be sent: its row goes in as `pending`. Null when nothing is recorded. */
  begin(page: PageRef, act: TrailAct): TrailOpen | null;
  /** The act's answer (null when it threw) after `ms` in the adapter. */
  end(open: TrailOpen, result: ActResult | null, ms: number): void;
  /**
   * The draw call for `page`, `(PAGE)(SPEC)`, carrying this process's rows on it and, with `open`, the arm for that
   * act's input. Without `open`, null when no row changed since the last call handed out (a settle rides only then).
   */
  draw(page: PageRef, open?: TrailOpen): string | null;
  /** The adapter's sender, for `close`; the agent-browser adapter attaches none, so nothing is ever drawn there. */
  attach(send: TrailSend): void;
  /**
   * After the command: one draw per page this process read, only when nothing reached a page (no act dispatched,
   * no act answered other than refused), and never under `--dry-run` or after an abort.
   */
  close(end: TrailClose): Promise<void>;
}
