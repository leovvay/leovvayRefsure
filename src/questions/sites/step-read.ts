import { abstainVerdict } from '../abstain-verdict';
import { NONE_KEY, quoteOption } from '../present-candidates';
import type { Threshold } from '../site-policy';
import { noulVerdict } from '../validate-answers';
import type { Verdict } from '../verdict';
import type { DecisionAnswer, DecisionChoiceAnswer, DecisionQuestion } from '../wire-types';
import type { StepContext } from './step-request';
import { STEP_QUESTIONS } from './step-request';
import type { StepOp, StepReading, StepTarget } from './step-reading';
import { NOUL_BAND, STEP_OP_MIN, STEP_RUNNER_MIN } from './starting-thresholds';

type Sent = Readonly<Record<string, DecisionQuestion>>;
type Answers = Readonly<Record<string, DecisionAnswer>>;
/** One offered option of a head and its probability. */
type Scored = readonly [key: string, p: number];

/** How many leading options a low-confidence refusal names. */
const LEADING = 3;

/** The head that picks each operation's target; the others take none. */
const HEADS: Partial<Record<StepOp, string>> = {
  CLICK: STEP_QUESTIONS.click, TYPE: STEP_QUESTIONS.type, SELECT: STEP_QUESTIONS.select,
};

/** The operations that end the run; they do so only at `STEP_OP_MIN`. */
const TERMINAL: ReadonlySet<StepOp> = new Set<StepOp>(['DONE', 'BLOCKED']);

/**
 * A head that read the page and found no target it is sure of, which another operation may stand in for. A twin
 * pick and a missing or malformed answer stop as they are.
 */
const UNSURE_HEAD: ReadonlySet<string> = new Set(['low_confidence', 'none_chosen']);

/**
 * An offered option as a refusal names it: an operation by its name, a target by the code's own label for it (the
 * row without its value, the `--fill` key without the value): the refusal goes back to the agent, and a value never
 * does.
 */
function quoteIn(context: StepContext, head: string): (key: string) => string {
  return (key) => {
    const text = key === NONE_KEY ? undefined : context.labels[head]?.get(key);
    return text === undefined ? key : quoteOption(text);
  };
}

/** An option's text without its row number: two rows that read the same but for `[n]` are twins to the model. */
function unnumbered(text: string): string {
  return text.replace(/^\[\d+\]\s*/, '');
}

/**
 * The twin rule (spec §8.1 invariant 7) on the options as sent: the other keys whose text, number aside, reads the
 * same as `key`'s. Redaction and masks run after the rows were built, so two rows code told apart can leave as one.
 */
function sentTwinsOf(sent: Sent, head: string, key: string): string[] | null {
  const asked = sent[head];
  const text = asked?.type === 'choice' ? asked.criteria[key] : undefined;
  if (asked?.type !== 'choice' || text === undefined) return null;
  const same = unnumbered(text);
  const others = Object.entries(asked.criteria)
    .filter(([other, line]) => other !== key && other !== NONE_KEY && unnumbered(line) === same)
    .map(([other]) => other);
  return others.length === 0 ? null : others;
}

/** The leading options of a choice answer, best first: `CLICK 0.41, WAIT 0.32`. */
function leadingOf(answer: DecisionChoiceAnswer, quote: (key: string) => string): string {
  return Object.entries(answer.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LEADING)
    .map(([key, p]) => `${quote(key)} ${Math.round(p * 100) / 100}`)
    .join(', ');
}

function targetOf(context: StepContext, op: StepOp, key: string, p: number): StepTarget | null {
  if (op === 'CLICK') {
    const n = context.click.get(key);
    return n === undefined ? null : { op, n, p };
  }
  if (op === 'TYPE') {
    const pair = context.type.get(key);
    return pair === undefined ? null : { op, ...pair, p };
  }
  const pair = context.select.get(key);
  return pair === undefined ? null : { op: 'SELECT', ...pair, p };
}

/**
 * The control a head's key acts on: a select or a field by its row, a click target by the choice it is one
 * alternative of (`StepRow.choice`), else by its row.
 */
function controlOf(context: StepContext, op: StepOp, key: string): string {
  const n = op === 'CLICK' ? context.click.get(key) : (op === 'TYPE' ? context.type : context.select).get(key)?.n;
  return (op === 'CLICK' && n !== undefined ? context.choices.get(n) : undefined) ?? `row ${n}`;
}

/** A head's offered options (not `none`, nothing never offered), best first. */
function rankedRows(answer: DecisionChoiceAnswer, context: StepContext, op: StepOp): Scored[] {
  return Object.entries(answer.probabilities)
    .filter(([key, p]) => key !== NONE_KEY && Number.isFinite(p) && targetOf(context, op, key, p) !== null)
    .map(([key, p]): Scored => [key, Math.round(p * 1000) / 1000])
    .sort((a, b) => b[1] - a[1]);
}

/**
 * A target head read by its argmax (design 2026-10-17 §2.3, revised 2026-10-18): the best offered row, when it has
 * at least `floor` and more than `none`. A row already in the state asked of it (a selected date, a field holding
 * its value) gives way to the runner-up when that one passes too and acts on another control: another option of
 * the same select, day of the same calendar or radio of the same group would undo what is already right, where the
 * asked row itself is a no-op at worst. The twin rule on what was sent refuses the pick.
 */
function readTarget(
  answers: Answers, context: StepContext, op: StepOp, head: string, floor: number, sent: Sent,
): Verdict<StepTarget> {
  const answer = answers[head];
  if (answer?.type !== 'choice') return abstainVerdict('provider_error', `expected a choice answer to ${head}`);
  const quote = quoteIn(context, head);
  const none = answer.probabilities[NONE_KEY] ?? 0;
  const passes = (row: Scored | undefined): row is Scored => row !== undefined && row[1] >= floor && row[1] > none;
  const [best, second] = rankedRows(answer, context, op);
  if (!passes(best)) {
    const p = best?.[1] ?? 0;
    return {
      kind: 'abstain', cause: none >= p ? 'none_chosen' : 'low_confidence', leaned: best?.[0] ?? NONE_KEY,
      confidence: p, threshold: floor,
      detail: `${op} target: no option reached ${floor} above none; leading: ${leadingOf(answer, quote)}`,
    };
  }
  const givesWay = context.asked[head]?.has(best[0]) === true && passes(second)
    && controlOf(context, op, second[0]) !== controlOf(context, op, best[0]);
  const pick = givesWay ? second : best;
  const [key, p] = pick;
  const twins = sentTwinsOf(sent, head, key);
  if (twins !== null) {
    const more = twins.length === 1 ? 'another option' : `${twins.length} other options`;
    return {
      kind: 'abstain', cause: 'twins', leaned: key, confidence: p, threshold: floor,
      detail: `${op} target: picked ${quote(key)}, which reads the same as ${more} as sent: `
        + 'the model could not tell them apart',
    };
  }
  return { kind: 'answer', value: targetOf(context, op, key, p)!, index: key, confidence: p, threshold: floor };
}

/** The row a target head leans to most, by its probabilities; null when its answer is no choice or `none` leads. */
function leaningRow(answer: DecisionAnswer | undefined, rowOf: (key: string) => number | undefined): number | null {
  if (answer?.type !== 'choice') return null;
  const [best] = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1]);
  return best === undefined || best[0] === NONE_KEY ? null : rowOf(best[0]) ?? null;
}

/**
 * CLICK and TYPE aimed at one field are one intent: typing focuses the field (and opens its search box or picker)
 * as the click would. When they are the two leading operations and both heads lean to the same row, the step is
 * TYPE, with the two operations' probabilities together.
 */
function typeIntent(answers: Answers, context: StepContext, lead: StepOp, next: StepOp | undefined): boolean {
  const pair = new Set([lead, next]);
  if (!pair.has('CLICK') || !pair.has('TYPE')) return false;
  const clicked = leaningRow(answers[STEP_QUESTIONS.click], (key) => context.click.get(key));
  const typed = leaningRow(answers[STEP_QUESTIONS.type], (key) => context.type.get(key)?.n);
  return clicked !== null && clicked === typed;
}

/**
 * The operation as read, with only its own target head when it takes one. An operation that takes none and sends
 * something (PRESS_ENTER, whose field code picks) needs `floor` itself, as every act does.
 */
function readHead(
  answers: Answers, context: StepContext, op: StepOp, p: number, done: number | null, floor: number, sent: Sent,
): Verdict<StepReading> {
  const head = HEADS[op];
  if (head === undefined) {
    if (op === 'PRESS_ENTER' && p < floor) {
      return {
        kind: 'abstain', cause: 'low_confidence', leaned: op, confidence: p, threshold: floor,
        detail: `the operation leaned to PRESS_ENTER at ${p}, below the floor ${floor}`,
      };
    }
    return { kind: 'answer', value: { op, p, target: null, done }, index: op, confidence: p, threshold: floor };
  }
  const target = readTarget(answers, context, op, head, floor, sent);
  if (target.kind === 'abstain') {
    const { cause, detail, leaned, confidence, threshold } = target;
    return { kind: 'abstain', cause, detail, leaned, confidence, threshold };
  }
  return {
    kind: 'answer', value: { op, p, target: target.value, done },
    index: target.index, confidence: target.confidence, threshold: target.threshold,
  };
}

/**
 * The step's answers together, progress over certainty (design 2026-10-17 §2.3, revised 2026-10-18):
 * - the done Noul at the presence edge is the answer whatever leads;
 * - DONE or BLOCKED ends the run only at `STEP_OP_MIN`;
 * - otherwise the step is the argmax over the other operations offered (CLICK and TYPE leading on one field read as
 *   TYPE: `typeIntent`), and its target the argmax of its own head at `threshold`, the step row (the floor), above
 *   `none`, an option already in the asked state giving way to a runner-up on another control that passes too, the
 *   twin rule read on what was sent;
 * - when that head finds no target it is sure of (`UNSURE_HEAD`), the next operation with a target head, while it
 *   holds `STEP_RUNNER_MIN`; a twin pick or a missing answer stops as it is.
 * Nothing else is held back here: the guard reads the act's risk and refuses money, irreversible, auth and consent
 * whatever the probability. A refusal names the leading options.
 */
export function readStep(
  answers: Answers, context: StepContext, threshold: Threshold, sent: Sent,
): Verdict<StepReading> {
  const operation = answers[STEP_QUESTIONS.operation];
  if (operation?.type !== 'choice') return abstainVerdict('provider_error', 'expected a choice answer to the operation');
  const doneAnswer = context.askedDone ? answers[STEP_QUESTIONS.done] : undefined;
  const done = doneAnswer?.type === 'noul' ? doneAnswer.noul : null;
  if (done !== null && noulVerdict(done, NOUL_BAND) === 'yes') {
    return {
      kind: 'answer', value: { op: operation.choice as StepOp, p: operation.confidence, target: null, done },
      index: STEP_QUESTIONS.done, confidence: done, threshold: NOUL_BAND.yesAtLeast,
    };
  }
  const p = (op: StepOp): number => operation.probabilities[op] ?? 0;
  const end = context.ops.find((op) => TERMINAL.has(op) && p(op) >= STEP_OP_MIN);
  if (end !== undefined) {
    return {
      kind: 'answer', value: { op: end, p: p(end), target: null, done }, index: end, confidence: p(end),
      threshold: STEP_OP_MIN,
    };
  }
  const moves = context.ops.filter((op) => !TERMINAL.has(op)).sort((a, b) => p(b) - p(a));
  const [lead, next] = moves;
  if (lead === undefined) return abstainVerdict('provider_error', 'no operation but DONE and BLOCKED was offered');
  const floor = typeof threshold === 'number' ? threshold : threshold.yesAtLeast;
  const led = leadingOf(operation, (key) => key);
  const withLed = (verdict: Verdict<StepReading>): Verdict<StepReading> => (
    verdict.kind === 'answer' ? { ...verdict, value: { ...verdict.value, led } } : verdict
  );
  const stops = (verdict: Verdict<StepReading>): boolean => (
    verdict.kind === 'abstain' && !UNSURE_HEAD.has(verdict.cause)
  );
  if (typeIntent(answers, context, lead, next)) {
    const both = Math.round((p('CLICK') + p('TYPE')) * 100) / 100;
    const typed = readHead(answers, context, 'TYPE', both, done, floor, sent);
    if (typed.kind === 'answer') return withLed(typed);
    if (stops(typed)) return typed;
  }
  const read = readHead(answers, context, lead, p(lead), done, floor, sent);
  if (read.kind === 'answer') return withLed(read);
  if (stops(read)) return read;
  // The lead's head found no target it is sure of (a click aimed at a field that waits for a value, which CLICK does
  // not offer): the next operation that takes a target of its own stands in, if it holds a share of the operation
  // and its head passes. Each head is asked as if its operation were next, so its own probability is no evidence for
  // that one.
  for (const op of moves.slice(1)) {
    if (p(op) < STEP_RUNNER_MIN) break;
    if (HEADS[op] === undefined) continue;
    const runnerUp = readHead(answers, context, op, p(op), done, floor, sent);
    if (runnerUp.kind === 'answer') return withLed(runnerUp);
  }
  return { ...read, detail: `${read.detail}; the operation led ${led}` };
}
