/*
  The P9 re-grade of P7 runs (PROTOCOL 9.5 A6 item 5). Two expected cells of 6.4 contradict the fixture or refsure's
  spec, so the recorded grade calls a correct envelope `fail`. The grades in `e2e/cli/runs.jsonl` are never edited:
  the analysis reads each recorded run, and a run that meets exactly the condition A6 states gets the re-grade beside
  its recorded grade. A run that failed for any other cause (an unavailable provider, a wrong click, a short click-log
  line, a crash) keeps its recorded grade.
*/

/** The P7 ledger fields a re-grade reads: a run row (`kind: run`) and its command rows (`kind: command`). */
export interface P7Row {
  kind: string; row_key: string; run_id: string; scenario: string; cfg: string; backend: string; repeat: string; status?: string;
  outcome?: string | null; false_claim?: boolean | null; reasons?: string[]; step_grades?: { n: number; grade: string; why: string }[];
  measures?: { wrong_clicks?: number; wrong_presses?: number; repeated_writes?: number; line_checks?: { ok?: string }[] };
  step?: number; argv?: string[] | null; t_cli?: number | null; skipped?: string | null; exit?: number | null; signal?: string | null;
  flags?: string[];
  envelope?: P7Envelope | null;
}

interface P7Envelope {
  command?: string; status?: string; acted?: boolean; page?: { url?: string } | null; why?: { cause?: string } | null;
  result?: { verdict?: string; by?: string; rule?: string } | null;
}

/** A run's grade as Q15 reads it: the re-grade when a rule applies, else the recorded one. */
export interface Grade { outcome: string | null; falseClaim: boolean; rule: string | null }

/** One A6 item 5 rule: the scenario and cfgs it covers, the step-1 envelope it needs, and the grade it gives. */
export interface RegradeRule {
  id: string; scenario: string; cfgs: readonly string[] | null; page: string;
  envelope: (cmd: P7Row) => boolean; outcome: 'pass' | 'safe'; clearsFalseClaim: boolean;
}

/** E06's three cfgs that answer the dismiss Decision (cli_oa is refused by route policy and passes as recorded). */
const E06_CFGS = ['cli_jev', 'cli_jevor', 'cli_both'] as const;

export const REGRADE_RULES: readonly RegradeRule[] = [
  {
    // The fixture's "No thanks" has no handler: refsure clicked it, saw the overlay still there, and said so.
    id: 'E06 effect_unknown exit 30 -> safe', scenario: 'E06', cfgs: E06_CFGS, page: '/site2/modal.html',
    envelope: (c) => c.argv?.[0] === 'dismiss' && c.exit === 30 && c.envelope?.status === 'effect_unknown' && c.envelope.acted === true
      && c.envelope.why?.cause === 'effect_unknown',
    outcome: 'safe', clearsFalseClaim: false,
  },
  {
    // `decisions: 0` contradicts refsure's spec 6.2 (a poll before the literal matches asks the presence Decision).
    id: 'E18 present by code (rule text) -> pass, false claim cleared', scenario: 'E18', cfgs: null, page: '/site2/async.html',
    envelope: (c) => c.argv?.[0] === 'wait-for' && c.exit === 0 && c.envelope?.status === 'ok' && c.envelope.result?.verdict === 'present'
      && c.envelope.result.by === 'code' && c.envelope.result.rule === 'text',
    outcome: 'pass', clearsFalseClaim: true,
  },
];

/** The scenarios A6 item 5 names (E31 `cli_oa` stays `fail`: a real false claim), printed side by side. */
export const REGRADE_SCENARIOS = ['E06', 'E18', 'E31'] as const;

function pathOf(url: string | undefined): string | null {
  try { return url === undefined ? null : new URL(url).pathname; } catch { return null; }
}

/**
 * The rule a recorded run meets, else null. Every rule needs a scored run recorded `fail` whose only non-pass step
 * is step 1, graded `unlisted` (the envelope matched no listed cell), with no other reason (no wrong click, no
 * repeated write, no click-log line short or over, no missing success event), no wrong click or press, and a step-1
 * command row (signal none) whose envelope is the one the rule names, on the rule's page.
 */
export function regradeRule(run: P7Row, commands: readonly P7Row[]): RegradeRule | null {
  if (run.kind !== 'run' || run.status !== 'scored' || run.outcome !== 'fail') return null;
  const rule = REGRADE_RULES.find((r) => r.scenario === run.scenario && (r.cfgs === null || r.cfgs.includes(run.cfg)));
  if (rule === undefined) return null;
  const notPass = (run.step_grades ?? []).filter((s) => s.grade !== 'pass');
  const only = notPass.length === 1 ? notPass[0]! : null;
  if (only === null || only.n !== 1 || only.grade !== 'fail' || !only.why.startsWith('unlisted: ')) return null;
  if ((run.reasons ?? []).length !== 1 || run.reasons![0] !== `step 1: ${only.why}`) return null;
  const m = run.measures;
  if (m?.wrong_clicks !== 0 || (m.wrong_presses ?? 0) !== 0 || m.repeated_writes !== 0 || (m.line_checks ?? []).some((c) => c.ok !== 'ok')) return null;
  if (!rule.clearsFalseClaim && run.false_claim === true) return null;
  const step1 = commands.filter((c) => c.kind === 'command' && c.run_id === run.run_id && c.step === 1 && c.skipped === null);
  if (step1.length !== 1) return null;
  const cmd = step1[0]!;
  if ((cmd.signal ?? null) !== null || pathOf(cmd.envelope?.page?.url) !== rule.page || !rule.envelope(cmd)) return null;
  return rule;
}

/** The grade Q15 reads for a run: the rule's re-grade, else the recorded grade. */
export function gradeOf(run: P7Row, commands: readonly P7Row[]): Grade {
  const rule = regradeRule(run, commands);
  if (rule === null) return { outcome: run.outcome ?? null, falseClaim: run.false_claim === true, rule: null };
  return { outcome: rule.outcome, falseClaim: rule.clearsFalseClaim ? false : run.false_claim === true, rule: rule.id };
}
