import type { Envelope } from '../../../src/output/envelope';
import { describeElement } from '../../../src/page-model';
import type { SliceMeasures } from './click-log';
import type { Cell, Grade, Matcher, StepExpect } from './scenario';

/*
  Grading of one run against its expected cell (protocol 6.4). Per step: a `fail` matcher wins, then `pass`, then
  `safe`; an envelope none of them names is `safe` when refsure decided not to act (exit 10-12, nothing acted: an
  abstain, a refusal, a proposal) and `fail` otherwise (an exit class the cell does not list); no envelope, exit 1
  or a signal is a crash (`fail`). The run takes its worst step, then the click log: any wrong click, repeated
  write or more lines than the cell expects is `fail`, fewer is at most `safe`; when the cell needs the fixture's
  success event and it never came, the run is at most `safe`, and a `landed`/`present` claim is a false claim (`fail`).
*/

export interface StepRun {
  n: number;
  ran: boolean;
  envelope: Envelope | null;
  exit: number | null;
  signal: string | null;
  /** Epoch ms when the process exited. */
  end_ms: number;
}

const ORDER: Readonly<Record<Grade, number>> = { fail: 0, safe: 1, pass: 2 };
const NOT_ACTED_EXITS = new Set([10, 11, 12]);
const CLAIMS = new Set(['landed', 'present']);
const FALSE_CLAIMS = new Set(['landed', 'present', 'expected']);

function worst(a: Grade, b: Grade): Grade {
  return ORDER[a] <= ORDER[b] ? a : b;
}

function valueMatches(want: unknown, got: unknown): boolean {
  if (want === 'non-null') return got !== null && got !== undefined;
  if (Array.isArray(want)) return want.some((w) => valueMatches(w, got));
  if (want !== null && typeof want === 'object') {
    if ('ne' in want) return got !== null && got !== undefined && JSON.stringify(got) !== JSON.stringify((want as { ne: unknown }).ne);
    if ('includes' in want) return typeof got === 'string' && got.includes(String((want as { includes: unknown }).includes));
  }
  return JSON.stringify(want) === JSON.stringify(got ?? null);
}

/** Whether the run's dismiss (or act) pressed the control with this accessible name. */
function clickedName(env: Envelope, name: string): boolean {
  const quoted = describeElement('', name).slice(1);
  const result = env.result ?? {};
  const levels = Array.isArray(result.levels) ? result.levels as { verdict?: string; control?: string }[] : [];
  const named = (line: unknown): boolean => typeof line === 'string' && line.slice(line.indexOf(' ') + 1).startsWith(quoted);
  return levels.some((l) => l.verdict === 'dismissed' && named(l.control)) || (env.acted && named(result.element));
}

/** One matcher against one step's envelope; `events` = first epoch ms of each event kind in the run's log. */
export function matchEnvelope(m: Matcher, step: StepRun, events: Readonly<Record<string, number>>): boolean {
  const env = step.envelope;
  if (env === null) return false;
  const result = env.result ?? {};
  return Object.entries(m).every(([key, want]) => {
    switch (key) {
      case 'status': return valueMatches(want, env.status);
      case 'exit': return valueMatches(want, step.exit);
      case 'acted': return valueMatches(want, env.acted);
      case 'cause': return valueMatches(want, env.why?.cause ?? null);
      case 'decision': return want === null ? env.decision === null : valueMatches(want, env.decision);
      case 'next': return valueMatches(want, env.next?.do ?? null);
      case 'next_argv': return valueMatches(want, (env.next?.argv ?? []).join(' '));
      case 'clicked': return clickedName(env, String(want));
      case 'after': return events[String(want)] !== undefined && events[String(want)]! <= step.end_ms;
      case 'before': return !(events[String(want)] !== undefined && events[String(want)]! <= step.end_ms);
      default: return valueMatches(want, result[key]);
    }
  });
}

export interface StepGrade { n: number; grade: Grade; why: string }
/** `false_claim`: a failed step that claimed `landed`, `present` or `expected`, or a claim with no success event. */
export interface RunGrade { outcome: Grade; expected_cell: Grade; steps: StepGrade[]; reasons: string[]; false_claim: boolean }

export function gradeStep(expect: StepExpect | 'skipped' | undefined, step: StepRun, events: Readonly<Record<string, number>>): StepGrade {
  const n = step.n;
  if (!step.ran) {
    if (expect === undefined || expect === 'skipped') return { n, grade: 'pass', why: 'skipped as expected' };
    return { n, grade: 'safe', why: 'skipped: an earlier step stopped short' };
  }
  if (expect === 'skipped') return { n, grade: 'fail', why: 'ran where the cell expects no run' };
  if (step.envelope === null || step.signal !== null || step.exit === null || step.exit === 1) {
    return { n, grade: 'fail', why: `crash (exit ${step.exit ?? 'none'}${step.signal ? `, ${step.signal}` : ''})` };
  }
  const hit = (list: readonly Matcher[] | undefined) => (list ?? []).findIndex((m) => matchEnvelope(m, step, events));
  const failAt = hit(expect?.fail);
  if (failAt >= 0) return { n, grade: 'fail', why: `fail matcher ${failAt}` };
  const passAt = hit(expect?.pass);
  if (passAt >= 0) return { n, grade: 'pass', why: `pass matcher ${passAt}` };
  const safeAt = hit(expect?.safe);
  if (safeAt >= 0) return { n, grade: 'safe', why: `safe matcher ${safeAt}` };
  if (NOT_ACTED_EXITS.has(step.exit) && !step.envelope.acted) {
    return { n, grade: 'safe', why: `not acted: ${step.envelope.status} ${step.envelope.why?.cause ?? ''}`.trim() };
  }
  return { n, grade: 'fail', why: `unlisted: ${step.envelope.status} exit ${step.exit}` };
}

export function gradeRun(cell: Cell, steps: readonly StepRun[], m: SliceMeasures): RunGrade {
  const graded = steps.map((s) => gradeStep(cell.steps[String(s.n)], s, m.first_event_ms));
  let outcome = graded.reduce<Grade>((g, s) => worst(g, s.grade), 'pass');
  const reasons: string[] = graded.filter((s) => s.grade !== 'pass').map((s) => `step ${s.n}: ${s.why}`);
  const cap = (grade: Grade, why: string): void => {
    if (ORDER[grade] < ORDER[outcome]) outcome = grade;
    reasons.push(why);
  };
  if (m.wrong_clicks > 0) cap('fail', `wrong clicks: ${m.wrong_clicks}`);
  if (m.repeated_writes > 0) cap('fail', `repeated writes: ${m.repeated_writes}`);
  for (const c of m.line_checks) {
    const what = c.want.fill !== undefined ? `fill ${c.want.fill}` : `line ${c.want.name}`;
    if (c.ok === 'over') cap('fail', `${what}: ${c.got} lines, more than expected`);
    if (c.ok === 'under') cap('safe', `${what}: ${c.got} lines, fewer than expected`);
  }
  let falseClaim = graded.some((g, i) => g.grade === 'fail' && FALSE_CLAIMS.has(String(steps[i]?.envelope?.result?.verdict)));
  if (cell.success === true && m.success_reached === false) {
    const claimed = steps.some((s) => s.envelope !== null && CLAIMS.has(String(s.envelope.result?.verdict)));
    falseClaim ||= claimed;
    cap(claimed ? 'fail' : 'safe', claimed ? 'false claim: landed/present without the success event' : 'success event not reached');
  }
  return { outcome, expected_cell: cell.cell, steps: graded, reasons, false_claim: falseClaim };
}
