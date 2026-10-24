import type {
  ActResult, AxTree, PageRef, TrailAct, TrailAction, TrailClose, TrailOpen, TrailRecorder, TrailSend,
} from '../browser';
import type { DecisionInfo } from '../output';
import { inFrame } from '../page-model';
import { boundMs, boundName, boundRef, boundRole, boundVerb } from './trail-bound';
import type { TrailBook } from './trail-book';
import type { TrailRecorderOptions } from './trail-recorder-options';
import { TRAIL_PAGE, trailCall } from './trail-page-call';
import { actEnded, readEnded } from './trail-result-of';
import type { TrailArm, TrailRow } from './trail-spec';
import { specOf } from './trail-spec-of';
import { trailSwitchedOff } from './trail-switch';
import { decideMs, whyOf } from './trail-why-of';

/** The rows a page keeps (spec trail v1): this process never sends more than it would keep. */
const MAX_ROWS = 12;
/** How long an arm waits for its act's trusted input before the page marks the row `no input seen`. */
const ARM_TTL_MS = 3_000;
/** The input each act causes, which the page locks onto: a scroll causes none it could point at. */
const ARMS: Readonly<Record<TrailAction, Pick<TrailArm, 'kind' | 'key'> | null>> = {
  click: { kind: 'point' }, dblclick: { kind: 'point' }, check: { kind: 'point' }, uncheck: { kind: 'point' },
  fill: { kind: 'focus' }, select: { kind: 'change' }, enter: { kind: 'key', key: 'Enter' }, scroll: null,
};
/** What a fill or a select shows in place of its value, which never reaches the recorder. */
const MARKERS: Partial<Record<TrailAction, NonNullable<TrailRow['marker']>>> = { fill: 'typing', select: 'option' };

interface RowStart { at: number; id: string; phases: TrailRow['phases']; since: DecisionInfo[] }

/** The origin of a snapshot's URL; null for one with no origin a page could compare (`file:`, `data:`, `about:`). */
function originOf(url: string): string | null {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/**
 * The trail's recorder for one process (spec trail v1): rows in memory per page, built from the adapter's snapshots
 * and acts and from the trace's Decisions, and handed out as draw calls. A row's phases are what this process spent
 * since the previous row: snapshot ms and the last node count, model ms (`decideMs`), and the act's own ms. History
 * across processes lives in the page only: nothing is written to disk, and a new document starts empty.
 */
export function createTrailRecorder(opts: TrailRecorderOptions): TrailRecorder {
  const { trace } = opts;
  const script = TRAIL_PAGE;
  const enabled = script !== null && !trailSwitchedOff(opts.env);
  const verb = boundVerb(opts.command);
  const books = new Map<string, TrailBook>();
  // `framed`: the act's target sits inside a frame, whose input never reaches the top window the arm listens on.
  const opened = new Map<string, { book: TrailBook; row: TrailRow; framed: boolean }>();
  let send: TrailSend | null = null;
  let made = 0;
  // This process's acts, numbered for every verb: the page counts the gap between step n and n+1 of one verb as
  // refsure's own time, so the waits inside one `run` or `do` (a WAIT, a stale step, a settle) are not the agent's.
  let acts = 0;
  // `trace.decisions.length` at the last row: the Decisions asked since belong to the next one.
  let seen = 0;
  // An act answered other than `refused`: the page may have taken input, so no draw follows the command.
  let reached = false;

  const bookOf = (page: PageRef): TrailBook => {
    const known = books.get(page.id);
    if (known !== undefined) return known;
    const book: TrailBook = { page, origin: null, tree: null, draft: null, rows: [], changed: false };
    books.set(page.id, book);
    return book;
  };

  /** A new row's start, id and phases from the page's draft (or none, now), and the Decisions since the last row. */
  const rowStart = (book: TrailBook, now: number): RowStart => {
    const draft = book.draft ?? { at: now, read: 0, nodes: null };
    book.draft = null;
    const since = trace.decisions.slice(seen);
    seen = trace.decisions.length;
    const phases: TrailRow['phases'] = {};
    if (draft.nodes !== null) {
      phases.read = boundMs(draft.read);
      phases.nodes = boundMs(draft.nodes);
    }
    const decide = boundMs(decideMs(since, now - draft.at - draft.read));
    if (decide !== undefined) phases.decide = decide;
    made += 1;
    return { at: draft.at, id: `${draft.at.toString(36)}${process.pid.toString(36)}${made}`, phases, since };
  };

  const keep = (book: TrailBook, row: TrailRow): void => {
    book.rows.push({ row, origin: book.origin });
    if (book.rows.length > MAX_ROWS) book.rows.splice(0, book.rows.length - MAX_ROWS);
    book.changed = true;
  };

  const drawOn = (book: TrailBook, open?: TrailOpen): string | null => {
    if (script === null || (open === undefined && !book.changed)) return null;
    book.changed = false;
    const entry = open === undefined ? undefined : opened.get(open.id);
    const action = entry === undefined || entry.framed ? undefined : entry.row.action;
    const shape = action === undefined ? null : ARMS[action];
    const arm = shape === null || open === undefined ? undefined : { id: open.id, ...shape, ttl: ARM_TTL_MS };
    return trailCall(script, specOf(book, Date.now(), arm));
  };

  return {
    on: () => enabled,

    read(page: PageRef, ms: number, tree: AxTree): void {
      if (!enabled) return;
      const book = bookOf(page);
      book.tree = tree;
      book.origin = originOf(tree.origin);
      const draft = book.draft ?? { at: Math.round(Date.now() - ms), read: 0, nodes: null };
      draft.read += ms;
      draft.nodes = tree.nodes.length;
      book.draft = draft;
    },

    begin(page: PageRef, act: TrailAct): TrailOpen | null {
      if (!enabled) return null;
      const book = bookOf(page);
      const { at, id, phases, since } = rowStart(book, Date.now());
      const row: TrailRow = { id, at, verb, kind: 'act', action: act.action, phases, result: 'pending' };
      acts += 1;
      row.step = acts;
      const ref = boundRef(act.ref);
      let framed = false;
      if (ref !== null) {
        // Role and name only, from the last snapshot of this page: never a value. A name read inside a frame belongs
        // to the frame's origin, not the one this row is drawn on, so it is never sent.
        const node = book.tree?.nodes.find((candidate) => candidate.ref === ref);
        framed = node !== undefined && book.tree !== null && inFrame(book.tree, node.i);
        row.target = { ref, role: boundRole(node?.role), name: framed ? null : boundName(node?.name) };
      }
      const marker = MARKERS[act.action];
      if (marker !== undefined) row.marker = marker;
      const why = whyOf(trace.trailWhy, since, { by: 'agent' });
      if (why !== undefined) row.why = why;
      delete trace.trailWhy;
      keep(book, row);
      opened.set(id, { book, row, framed });
      return { id };
    },

    end(open: TrailOpen, result: ActResult | null, ms: number): void {
      const entry = opened.get(open.id);
      if (entry === undefined) return;
      opened.delete(open.id);
      const ended = actEnded(result);
      if (ended.result !== 'refused') reached = true;
      entry.row.result = ended.result;
      if (ended.detail !== undefined) entry.row.detail = ended.detail;
      entry.row.end = Date.now();
      const actMs = boundMs(ms);
      if (actMs !== undefined) entry.row.phases.act = actMs;
      entry.book.changed = true;
    },

    draw(page: PageRef, open?: TrailOpen): string | null {
      const book = enabled ? books.get(page.id) : undefined;
      return book === undefined ? null : drawOn(book, open);
    },

    attach(sender: TrailSend): void {
      send = sender;
    },

    async close(end: TrailClose): Promise<void> {
      // After an act, never: a dialog it opened would hold this eval in the tab's queue and break the agent's own
      // `dialog dismiss` (measured: the confirm then returned true).
      if (!enabled || send === null || end.dryRun || end.aborted || reached || trace.dispatched) return;
      const sender = send;
      const draws: Promise<void>[] = [];
      for (const book of books.values()) {
        if (book.draft !== null) {
          const now = Date.now();
          const { at, id, phases, since } = rowStart(book, now);
          const row: TrailRow = { id, at, end: now, verb, kind: 'read', phases, ...readEnded(end.status, end.cause) };
          const why = whyOf(trace.trailWhy, since, null);
          if (why !== undefined) row.why = why;
          keep(book, row);
        }
        const call = drawOn(book);
        if (call !== null) draws.push(Promise.resolve().then(() => sender(book.page, call)).catch(() => undefined));
      }
      await Promise.all(draws);
    },
  };
}
