import { abstainVerdict } from '../abstain-verdict';
import { NONE_KEY, quoteOption } from '../present-candidates';
import type { Threshold } from '../site-policy';
import { noulVerdict } from '../validate-answers';
import type { Verdict } from '../verdict';
import type { DecisionAnswer, DecisionChoiceAnswer, DecisionQuestion } from '../wire-types';
import { readChoice } from './read-answer';
import type { StepContext } from './step-request';
import { STEP_QUESTIONS } from './step-request';
import type { StepOp, StepReading, StepTarget } from './step-reading';
import { NOUL_BAND, STEP_OP_MIN } from './starting-thresholds';

type Sent = Readonly<Record<string, DecisionQuestion>>;
type Answers = Readonly<Record<string, DecisionAnswer>>;

/** How many leading options a low-confidence refusal names. */
const LEADING = 3;

/** The head that picks each operation's target; the others take none. */
const HEADS: Partial<Record<StepOp, string>> = {
  CLICK: STEP_QUESTIONS.click, TYPE: STEP_QUESTIONS.type, SELECT: STEP_QUESTIONS.select,
};

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

/** The target head's own answer, as `readChoice` reads it, with the twin rule on the options as sent. */
function readTarget(
  answers: Answers, context: StepContext, op: StepOp, head: string, threshold: Threshold, sent: Sent,
): Verdict<StepTarget> {
  const answer = answers[head];
  if (answer === undefined) return abstainVerdict('provider_error', `no answer to ${head}`);
  const quote = quoteIn(context, head);
  const confidence = answer.type === 'choice' ? answer.confidence : 0;
  const read = readChoice(answer, threshold, (key) => targetOf(context, op, key, confidence), NONE_KEY, quote);
  if (read.kind === 'abstain') {
    const leading = answer.type === 'choice' ? `; leading: ${leadingOf(answer, quote)}` : '';
    return { ...read, detail: `${op} target: ${read.detail}${leading}` };
  }
  const twins = read.index === null ? null : sentTwinsOf(sent, head, read.index);
  if (twins === null || read.index === null) return read;
  const more = twins.length === 1 ? 'another option' : `${twins.length} other options`;
  return {
    kind: 'abstain', cause: 'twins', leaned: read.index, confidence: read.confidence, threshold: read.threshold,
    detail: `${op} target: picked ${quote(read.index)}, which reads the same as ${more} as sent: `
      + 'the model could not tell them apart',
  };
}

/** The row a target head leans to most, by its probabilities; null when its answer is no choice. */
function leaningRow(answer: DecisionAnswer | undefined, rowOf: (key: string) => number | undefined): number | null {
  if (answer?.type !== 'choice') return null;
  const [best] = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1]);
  return best === undefined ? null : rowOf(best[0]) ?? null;
}

/**
 * CLICK and TYPE aimed at one field are one intent: typing focuses the field (and opens its search box or picker)
 * as the click would. When the operation is split between the two and both heads lean to the same row, it reads as
 * TYPE, with the two operations' probabilities together. Null when that is not so.
 */
function typeIntent(answers: Answers, context: StepContext, operation: DecisionChoiceAnswer): number | null {
  if (!context.ops.includes('TYPE') || !context.ops.includes('CLICK')) return null;
  const [first, second] = Object.entries(operation.probabilities).sort((a, b) => b[1] - a[1]);
  const pair = new Set([first?.[0], second?.[0]]);
  if (!pair.has('CLICK') || !pair.has('TYPE')) return null;
  const clicked = leaningRow(answers[STEP_QUESTIONS.click], (key) => context.click.get(key));
  const typed = leaningRow(answers[STEP_QUESTIONS.type], (key) => context.type.get(key)?.n);
  if (clicked === null || clicked !== typed) return null;
  return Math.round(((operation.probabilities.CLICK ?? 0) + (operation.probabilities.TYPE ?? 0)) * 100) / 100;
}

/**
 * The step's answers together (design 2026-10-17 §2.3-2.4). The done Noul first: at the presence edge it is the
 * answer whatever leads. Then the operation, which needs `STEP_OP_MIN` (an unsure split with WAIT leading or next
 * waits, since WAIT sends nothing; a split between CLICK and TYPE on one field reads as TYPE: `typeIntent`); then
 * only the head of that operation, at
 * `threshold` (the write row: every act is floored at write, and the caller holds the pick to its risk row once it
 * has read the risk), with the twin rule on what was sent; when that head is unsure, the runner-up operation's
 * (`secondOperation`). A refusal names the leading options.
 */
export function readStep(
  answers: Answers, context: StepContext, threshold: Threshold, sent: Sent,
): Verdict<StepReading> {
  const operation = answers[STEP_QUESTIONS.operation];
  if (operation?.type !== 'choice') return abstainVerdict('provider_error', 'expected a choice answer to the operation');
  const op = operation.choice as StepOp;
  const doneAnswer = context.askedDone ? answers[STEP_QUESTIONS.done] : undefined;
  const done = doneAnswer?.type === 'noul' ? doneAnswer.noul : null;
  if (done !== null && noulVerdict(done, NOUL_BAND) === 'yes') {
    return {
      kind: 'answer', value: { op, p: operation.confidence, target: null, done },
      index: STEP_QUESTIONS.done, confidence: done, threshold: NOUL_BAND.yesAtLeast,
    };
  }
  const merged = operation.confidence < STEP_OP_MIN ? typeIntent(answers, context, operation) : null;
  if (merged !== null && merged >= STEP_OP_MIN) {
    return readHead(answers, context, 'TYPE', merged, done, threshold, sent);
  }
  // Unsure, with WAIT leading or next: it is waited on. It sends nothing, so no threshold guards it, and the run's
  // budget bounds it; results still loading are what such a split most often reads.
  const [, runnerUp] = Object.entries(operation.probabilities).sort((a, b) => b[1] - a[1]);
  const waitLeads = op === 'WAIT' || runnerUp?.[0] === 'WAIT';
  if (operation.confidence < STEP_OP_MIN && context.ops.includes('WAIT') && waitLeads) {
    const p = operation.probabilities.WAIT ?? 0;
    return {
      kind: 'answer', value: { op: 'WAIT', p, target: null, done }, index: 'WAIT', confidence: p, threshold: STEP_OP_MIN,
    };
  }
  if (operation.confidence < STEP_OP_MIN || !context.ops.includes(op)) {
    return {
      kind: 'abstain', cause: 'low_confidence', leaned: op, confidence: operation.confidence, threshold: STEP_OP_MIN,
      detail: `the operation leaned to ${op} at ${operation.confidence}, below the threshold ${STEP_OP_MIN}; `
        + `leading: ${leadingOf(operation, (key) => key)}`,
    };
  }
  const read = readHead(answers, context, op, operation.confidence, done, threshold, sent);
  return read.kind === 'abstain' ? secondOperation(answers, context, operation, read, done, threshold, sent) : read;
}

/**
 * The least probability the second operation needs to stand in for the first (`secondOperation`): less when the
 * first head was sure that none of its options fits, which refutes the first operation.
 */
const SECOND_MIN = 0.2;
const SECOND_MIN_REFUTED = 0.1;
/** A head that read the page and found no target it is sure of: the step may still have a concrete second way. */
const UNSURE_HEAD: ReadonlySet<string> = new Set(['low_confidence', 'none_chosen']);

/**
 * The leading operation's head could name no target it is sure of. The runner-up operation is the step when it
 * takes a target, has at least `SECOND_MIN` (`SECOND_MIN_REFUTED` when the first head was sure that none of its
 * options fits), holds at least `STEP_OP_MIN` of what the first operation leaves (with the first set aside, it is
 * the operation the model favours, not one of several it spread the rest over), and its own head is sure (at its
 * threshold, the twin rule read); else the first refusal stands. Each head is asked as if its operation were
 * next, so its confidence is no evidence for the operation: that share is. Two right next steps (a date, an option
 * the goal names) split the first head's mass.
 */
function secondOperation(
  answers: Answers, context: StepContext, operation: DecisionChoiceAnswer, first: Verdict<StepReading>,
  done: number | null, threshold: Threshold, sent: Sent,
): Verdict<StepReading> {
  if (first.kind !== 'abstain' || !UNSURE_HEAD.has(first.cause)) return first;
  const [lead, second] = Object.entries(operation.probabilities).sort((a, b) => b[1] - a[1]);
  const least = first.cause === 'none_chosen' ? SECOND_MIN_REFUTED : SECOND_MIN;
  if (lead === undefined || second === undefined || second[1] < least) return first;
  if (second[1] < STEP_OP_MIN * (1 - lead[1])) return first;
  const op = second[0] as StepOp;
  if (!context.ops.includes(op) || HEADS[op] === undefined) return first;
  const read = readHead(answers, context, op, second[1], done, threshold, sent);
  return read.kind === 'answer' ? read : first;
}

/** The operation as read, and then only its own target head, if it takes one. */
function readHead(
  answers: Answers, context: StepContext, op: StepOp, p: number, done: number | null, threshold: Threshold, sent: Sent,
): Verdict<StepReading> {
  const head = HEADS[op];
  if (head === undefined) {
    return { kind: 'answer', value: { op, p, target: null, done }, index: op, confidence: p, threshold: STEP_OP_MIN };
  }
  const target = readTarget(answers, context, op, head, threshold, sent);
  if (target.kind === 'abstain') {
    const { cause, detail, leaned, confidence, threshold: bar } = target;
    return { kind: 'abstain', cause, detail, leaned, confidence, threshold: bar };
  }
  return {
    kind: 'answer', value: { op, p, target: target.value, done },
    index: target.index, confidence: target.confidence, threshold: target.threshold,
  };
}
