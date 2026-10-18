import { canonicalJson, utf8Bytes } from '../../egress';
import { BOUNDS } from '../bounds';
import { boundedText, NONE_KEY } from '../present-candidates';
import type { SiteRequest } from '../site-request';
import type { DecisionQuestion } from '../wire-types';
import type { StepInput, StepRow } from './site-inputs';
import type { StepOp } from './step-reading';
import {
  STEP_CLICK_INSTRUCTIONS, STEP_DONE_QUESTION, STEP_OPERATION_INSTRUCTIONS, STEP_OPERATIONS, STEP_SELECT_INSTRUCTIONS,
  STEP_TARGET_NONE, STEP_TYPE_INSTRUCTIONS,
} from './wordings';

/** The question names of one step request. */
export const STEP_QUESTIONS = {
  operation: 'operation', click: 'click_target', type: 'type_target', select: 'select_target', done: 'done',
} as const;

/** How each part of the state is cut. The page text keeps room for the element table beside it. */
const GOAL_MAX = 600;
const VALUE_MAX = 200;
const TITLE_MAX = 200;
const PAGE_TEXT_MAX = 4_000;
const NEW_TEXT_MAX = 2_000;
const RECENT_LINE_MAX = 240;
/** Both bounds with a tenth to spare: approve re-cleans every string, and a mask can grow a line. */
const FIT_STATE = Math.floor(BOUNDS.STATE_MAX_BYTES * 0.9);
const FIT_QUESTIONS = Math.floor(BOUNDS.QUESTIONS_MAX_BYTES * 0.9);
/**
 * The options of one select offered when the whole table does not fit, its best-ranked first (the table ranks
 * those naming the goal and the values first): a few long dropdowns would otherwise push every other row out.
 */
const OPTIONS_CUT = 10;

/**
 * What a read needs to map an answer back: the operations offered, each target head's keys, each key as a
 * refusal quotes it (by head: the row's label with the `--fill` key or the option, never a value), and by head the
 * keys whose element is already in the state asked of it (a selected date, a field holding its value, the option
 * a select already shows), which give way to a runner-up.
 */
export interface StepContext {
  ops: readonly StepOp[];
  click: ReadonlyMap<string, number>;
  type: ReadonlyMap<string, { n: number; fill: number }>;
  select: ReadonlyMap<string, { n: number; option: number }>;
  labels: Readonly<Record<string, ReadonlyMap<string, string>>>;
  asked: Readonly<Record<string, ReadonlySet<string>>>;
  askedDone: boolean;
}

/** Text cleaned and bounded (`boundedText`), each text once per request however many cuts are tried. */
type Clean = (text: string, max: number, inline?: boolean) => string;

function cleanOnce(): Clean {
  const seen = new Map<string, string>();
  return (text, max, inline = false) => {
    const key = `${max}${inline ? 'i' : 'b'}${text}`;
    let out = seen.get(key);
    if (out === undefined) {
      out = boundedText(text, max, inline ? { inline: true } : {});
      seen.set(key, out);
    }
    return out;
  };
}

/**
 * Overlay rows first, then fields and selects, then the rest; within each, the rows that name more of the goal and
 * the values first, then page order. A cut drops from the end of this.
 */
function keepOrder(rows: readonly StepRow[]): StepRow[] {
  const tier = (row: StepRow): number => (row.overlay ? 0 : row.typable || row.options.length > 0 ? 1 : 2);
  return rows.map((row, at) => ({ row, at }))
    .sort((a, b) => tier(a.row) - tier(b.row) || b.row.weight - a.row.weight || a.at - b.at)
    .map((x) => x.row);
}

function offeredOps(input: StepInput, rows: readonly StepRow[]): StepOp[] {
  const ops: StepOp[] = [];
  if (rows.some((row) => row.clickable)) ops.push('CLICK');
  if (input.open.some(Boolean) && rows.some((row) => row.typable)) ops.push('TYPE');
  if (rows.some((row) => row.options.length > 0)) ops.push('SELECT');
  if (input.canPressEnter) ops.push('PRESS_ENTER');
  if (input.canScroll) ops.push('SCROLL_DOWN');
  ops.push('WAIT', 'DONE', 'BLOCKED');
  return ops;
}

function stateOf(input: StepInput, rows: readonly StepRow[], clean: Clean): Record<string, string> {
  const state: Record<string, string> = {
    goal: clean(input.goal, GOAL_MAX, true),
    values: input.fills.length === 0
      ? '(none: nothing may be typed)'
      : input.fills.map((fill, at) => {
        const where = input.placed[at] ?? '';
        return `${fill.key} = ${clean(fill.value, VALUE_MAX, true)}${where === '' ? '' : ` (${where})`}`;
      }).join('\n'),
    page_url: clean(input.pageUrl, BOUNDS.URL_MAX, true),
    title: clean(input.title, TITLE_MAX, true),
    page: clean(input.page, PAGE_TEXT_MAX),
    new_text: input.newText === '' ? '(none yet)' : clean(input.newText, NEW_TEXT_MAX),
    recent: input.recent.length === 0
      ? '(no steps yet)'
      : input.recent.map((step) => clean(step, RECENT_LINE_MAX, true)).join('\n'),
    elements: rows.map((row) => clean(row.text, BOUNDS.CANDIDATE_LINE_MAX, true)).join('\n'),
  };
  if (input.expect !== null) state.expect = clean(input.expect, BOUNDS.DESCRIPTION_MAX, true);
  return state;
}

function choice(instructions: string, criteria: Record<string, string>): DecisionQuestion {
  return { type: 'choice', instructions, criteria: { ...criteria, [NONE_KEY]: STEP_TARGET_NONE } };
}

type Built = { request: SiteRequest; context: StepContext };

/**
 * One request over `rows` (already cut), each select offering at most `optionsMax` of its options, with the context
 * that reads its answers.
 */
function assemble(input: StepInput, rows: readonly StepRow[], clean: Clean, optionsMax: number): Built {
  const line = (text: string): string => clean(text, BOUNDS.CANDIDATE_LINE_MAX, true);
  const ops = offeredOps(input, rows);
  const opCriteria: Record<string, string> = {};
  for (const op of ops) opCriteria[op] = STEP_OPERATIONS[op];
  const questions: Record<string, DecisionQuestion> = {
    [STEP_QUESTIONS.operation]: { type: 'choice', instructions: STEP_OPERATION_INSTRUCTIONS, criteria: opCriteria },
  };
  const click = new Map<string, number>();
  const type = new Map<string, { n: number; fill: number }>();
  const select = new Map<string, { n: number; option: number }>();
  const labels: Record<string, Map<string, string>> = {};
  const asked: Record<string, Set<string>> = {};
  const head = (name: string): Map<string, string> => (labels[name] ??= new Map());
  const done = (name: string, key: string): void => {
    (asked[name] ??= new Set()).add(key);
  };
  if (ops.includes('CLICK')) {
    const criteria: Record<string, string> = {};
    for (const row of rows.filter((r) => r.clickable)) {
      criteria[String(row.n)] = line(row.text);
      click.set(String(row.n), row.n);
      head(STEP_QUESTIONS.click).set(String(row.n), row.label);
      if (row.asked) done(STEP_QUESTIONS.click, String(row.n));
    }
    questions[STEP_QUESTIONS.click] = choice(STEP_CLICK_INSTRUCTIONS, criteria);
  }
  if (ops.includes('TYPE')) {
    const criteria: Record<string, string> = {};
    for (const row of rows.filter((r) => r.typable)) {
      input.fills.forEach((fill, at) => {
        if (input.open[at] !== true) return;
        const key = `${row.n}:${at + 1}`;
        criteria[key] = line(`${row.text} ← ${fill.key} (${clean(fill.value, VALUE_MAX, true)})`);
        type.set(key, { n: row.n, fill: at });
        head(STEP_QUESTIONS.type).set(key, `${row.label} ← ${fill.key}`);
      });
    }
    questions[STEP_QUESTIONS.type] = choice(STEP_TYPE_INSTRUCTIONS, criteria);
  }
  if (ops.includes('SELECT')) {
    const criteria: Record<string, string> = {};
    for (const row of rows.filter((r) => r.options.length > 0)) {
      row.options.slice(0, optionsMax).forEach((label, at) => {
        const key = `${row.n}:${at + 1}`;
        criteria[key] = line(`${row.text} ← option ${JSON.stringify(label)}`);
        select.set(key, { n: row.n, option: at });
        head(STEP_QUESTIONS.select).set(key, `${row.label} ← option ${JSON.stringify(label)}`);
        if (label === row.chosen) done(STEP_QUESTIONS.select, key);
      });
    }
    questions[STEP_QUESTIONS.select] = choice(STEP_SELECT_INSTRUCTIONS, criteria);
  }
  const askedDone = input.expect !== null && input.newText !== '';
  if (askedDone) questions[STEP_QUESTIONS.done] = { type: 'noul', ...STEP_DONE_QUESTION };
  return {
    request: { state: stateOf(input, rows, clean), questions },
    context: { ops, click, type, select, labels, asked, askedDone },
  };
}

function fits(request: SiteRequest): boolean {
  return utf8Bytes(canonicalJson(request.questions)) <= FIT_QUESTIONS && utf8Bytes(canonicalJson(request.state)) <= FIT_STATE;
}

/**
 * The step request, its element table cut to fit both bounds (design 2026-10-17 §2.1). When the whole table does
 * not fit, each select first offers only its `OPTIONS_CUT` best options; then the rows are cut, overlay rows kept
 * first, then fields and selects, then the rest, each tier by its weight (`keepOrder`), as many as fit (more rows
 * never take fewer bytes, so the most that fit are found by halving). The rows kept stay in page order, and the site
 * never refuses `oversize` for its own table. Every text is cleaned once, whatever the cuts tried. The done Noul is
 * asked only once there is new text to judge.
 */
export function stepRequest(input: StepInput): Built {
  const clean = cleanOnce();
  const order = keepOrder(input.rows);
  const build = (keep: number, optionsMax: number): Built => {
    const kept = new Set(order.slice(0, keep).map((row) => row.n));
    return assemble(input, input.rows.filter((row) => kept.has(row.n)), clean, optionsMax);
  };
  const whole = build(order.length, Infinity);
  if (fits(whole.request)) return whole;
  const allRows = build(order.length, OPTIONS_CUT);
  if (fits(allRows.request)) return allRows;
  let fit: Built | null = null;
  let low = 0;
  let high = order.length;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const built = build(mid, OPTIONS_CUT);
    if (fits(built.request)) {
      low = mid;
      fit = built;
    } else {
      high = mid;
    }
  }
  return fit ?? build(1, OPTIONS_CUT);
}
