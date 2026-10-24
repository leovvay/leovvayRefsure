/**
 * The contract between Node and the page script (spec trail v1), which both sides are written to: the draw is the
 * expression `${__TRAIL_PAGE__}(${JSON.stringify(spec)})`, a JSON literal the page never parses, so no page patch of
 * `JSON` sees it. The page function answers synchronously and never throws: `'ok'`, `'skip:<why>'` (`loading`,
 * `origin`, `off`, `sheets`) or `'err:<name>'`.
 */
export interface TrailSpec {
  v: 1;
  /** Node's `Date.now()` when built. */
  now: number;
  /** The origin refsure last read for this page, or null when unknown; the page drops a spec for another origin. */
  origin: string | null;
  /** New or updated rows; the page merges them by id and keeps the newest 12 by `at`. */
  rows: TrailRow[];
  /** At most one; it replaces any earlier arm. */
  arm?: TrailArm;
  /** QA only: the page answers JSON `{ver, rows, marks, armed}` instead of `'ok'`. */
  probe?: true;
}

/** The trusted input an act's row waits for, to lock onto the element it lands on; `ttl` in ms (3000). */
export interface TrailArm { id: string; kind: 'point' | 'focus' | 'key' | 'change'; key?: 'Enter'; ttl: number }

/** One step refsure took on the page: what it read, why it chose, what it did and how that went. No value, ever. */
export interface TrailRow {
  /** Unique across processes: `at.toString(36) + pid.toString(36) + n`. */
  id: string;
  /** Epoch ms the step began (its first read). */
  at: number;
  /** Epoch ms it ended, when known. */
  end?: number;
  /** The refsure command, e.g. `run`, `do`, `state`; at most 16 characters. */
  verb: string;
  /** This process's act ordinal, 1-based, for every verb: not `run`'s own `n`, as a WAIT or stale step has no row. */
  step?: number;
  kind: 'act' | 'read';
  action?: 'click' | 'dblclick' | 'fill' | 'select' | 'check' | 'uncheck' | 'enter' | 'scroll';
  /** `name` is cleaned, at most 80 characters, sent only on the origin it was read on, never for a framed element. */
  target?: { ref: string; role: string | null; name?: string | null };
  marker?: 'typing' | 'option';
  /** Rounded ms, and the snapshot's node count. */
  phases: { read?: number; nodes?: number; decide?: number; act?: number };
  why?: { by: 'decision' | 'code' | 'agent'; site?: string; model?: string; p?: number; threshold?: number };
  result: 'pending' | 'ok' | 'unknown' | 'refused' | 'abstained';
  detail?: 'stale' | 'covered' | 'focused' | 'error' | 'low_confidence' | 'none_chosen' | 'no_input';
}
