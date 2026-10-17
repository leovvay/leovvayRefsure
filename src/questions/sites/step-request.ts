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
const FIT_STEP = 0.85;

/** What a read needs to map an answer back: the operations offered, and each target head's keys. */
export interface StepContext {
  ops: readonly StepOp[];
  click: ReadonlyMap<string, number>;
  type: ReadonlyMap<string, { n: number; fill: number }>;
  select: ReadonlyMap<string, { n: number; option: number }>;
  askedDone: boolean;
}

function line(text: string): string {
  return boundedText(text, BOUNDS.CANDIDATE_LINE_MAX, { inline: true });
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

function stateOf(input: StepInput, rows: readonly StepRow[]): Record<string, string> {
  const state: Record<string, string> = {
    goal: boundedText(input.goal, GOAL_MAX, { inline: true }),
    values: input.fills.length === 0
      ? '(none: nothing may be typed)'
      : input.fills.map((fill, at) => {
        const where = input.placed[at] ?? '';
        return `${fill.key} = ${boundedText(fill.value, VALUE_MAX, { inline: true })}${where === '' ? '' : ` (${where})`}`;
      }).join('\n'),
    page_url: boundedText(input.pageUrl, BOUNDS.URL_MAX, { inline: true }),
    title: boundedText(input.title, TITLE_MAX, { inline: true }),
    page: boundedText(input.page, PAGE_TEXT_MAX),
    new_text: input.newText === '' ? '(none yet)' : boundedText(input.newText, NEW_TEXT_MAX),
    recent: input.recent.length === 0
      ? '(no steps yet)'
      : input.recent.map((step) => boundedText(step, RECENT_LINE_MAX, { inline: true })).join('\n'),
    elements: rows.map((row) => line(row.text)).join('\n'),
  };
  if (input.expect !== null) state.expect = boundedText(input.expect, BOUNDS.DESCRIPTION_MAX, { inline: true });
  return state;
}

function choice(instructions: string, criteria: Record<string, string>): DecisionQuestion {
  return { type: 'choice', instructions, criteria: { ...criteria, [NONE_KEY]: STEP_TARGET_NONE } };
}

/** One request over `rows` (already cut), with the context that reads its answers. */
function assemble(input: StepInput, rows: readonly StepRow[]): { request: SiteRequest; context: StepContext } {
  const ops = offeredOps(input, rows);
  const opCriteria: Record<string, string> = {};
  for (const op of ops) opCriteria[op] = STEP_OPERATIONS[op];
  const questions: Record<string, DecisionQuestion> = {
    [STEP_QUESTIONS.operation]: { type: 'choice', instructions: STEP_OPERATION_INSTRUCTIONS, criteria: opCriteria },
  };
  const click = new Map<string, number>();
  const type = new Map<string, { n: number; fill: number }>();
  const select = new Map<string, { n: number; option: number }>();
  if (ops.includes('CLICK')) {
    const criteria: Record<string, string> = {};
    for (const row of rows.filter((r) => r.clickable)) {
      criteria[String(row.n)] = line(row.text);
      click.set(String(row.n), row.n);
    }
    questions[STEP_QUESTIONS.click] = choice(STEP_CLICK_INSTRUCTIONS, criteria);
  }
  if (ops.includes('TYPE')) {
    const criteria: Record<string, string> = {};
    for (const row of rows.filter((r) => r.typable)) {
      input.fills.forEach((fill, at) => {
        if (input.open[at] !== true) return;
        const key = `${row.n}:${at + 1}`;
        const value = boundedText(fill.value, VALUE_MAX, { inline: true });
        criteria[key] = line(`${row.text} ← ${fill.key} (${value})`);
        type.set(key, { n: row.n, fill: at });
      });
    }
    questions[STEP_QUESTIONS.type] = choice(STEP_TYPE_INSTRUCTIONS, criteria);
  }
  if (ops.includes('SELECT')) {
    const criteria: Record<string, string> = {};
    for (const row of rows.filter((r) => r.options.length > 0)) {
      row.options.forEach((label, at) => {
        const key = `${row.n}:${at + 1}`;
        criteria[key] = line(`${row.text} ← option ${JSON.stringify(label)}`);
        select.set(key, { n: row.n, option: at });
      });
    }
    questions[STEP_QUESTIONS.select] = choice(STEP_SELECT_INSTRUCTIONS, criteria);
  }
  const askedDone = input.expect !== null && input.newText !== '';
  if (askedDone) questions[STEP_QUESTIONS.done] = { type: 'noul', ...STEP_DONE_QUESTION };
  return { request: { state: stateOf(input, rows), questions }, context: { ops, click, type, select, askedDone } };
}

function fits(request: SiteRequest): boolean {
  return utf8Bytes(canonicalJson(request.questions)) <= FIT_QUESTIONS && utf8Bytes(canonicalJson(request.state)) <= FIT_STATE;
}

/**
 * The step request, its element table cut to fit both bounds (design 2026-10-17 §2.1): overlay rows are kept
 * first, then fields and selects, then the rest, each tier by its weight (`keepOrder`). The rows kept stay in page
 * order, and the site never refuses `oversize` for its own table. The done Noul is asked only once there is new text to judge.
 */
export function stepRequest(input: StepInput): { request: SiteRequest; context: StepContext } {
  const order = keepOrder(input.rows);
  let keep = order.length;
  for (;;) {
    const kept = new Set(order.slice(0, keep).map((row) => row.n));
    const built = assemble(input, input.rows.filter((row) => kept.has(row.n)));
    if (keep <= 1 || fits(built.request)) return built;
    keep = Math.floor(keep * FIT_STEP);
  }
}
