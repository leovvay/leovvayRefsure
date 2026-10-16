import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nearestRank } from '../lib/stats';
import { ledgerFiles, readRows } from '../lib/ledger';
import { fmtMs } from './readings';
import { REGRADE_RULES, REGRADE_SCENARIOS, gradeOf } from './regrade';
import type { Grade, P7Row } from './regrade';
import type { Cell, Table } from './verdict';

/*
  Sections 7 and 8 of tables.md. Q15 is read here from the P7 CLI ledger (`<results>/e2e/cli/runs*.jsonl`, written by
  e2e/run-cli.ts; there is no separate summary): per cfg x backend the 6.4 readings, on the A6 item 5 re-grade
  (analyze/regrade.ts), with the recorded grade printed beside it. Q16 is copied from agent/score.ts's
  `agent-readings.json` (6.5 rules are applied there).
*/

/** `pass k / safe k / fail k` of graded runs. */
function counts(grades: readonly Grade[]): string {
  const k = (o: string) => grades.filter((g) => g.outcome === o).length;
  return `pass ${k('pass')} / safe ${k('safe')} / fail ${k('fail')}`;
}

/** Q15 (6.4): the latest run row per run key; command rows of that run only; grades as re-graded under A6 item 5. */
export function e2eTables(results: string, missing: string[]): Table[] {
  const files = ledgerFiles(results, 'e2e', 'cli', 'runs');
  if (files.length === 0) {
    missing.push('P7 CLI ledger (e2e/cli/runs.jsonl)');
    return [{ anchor: 'e2e', section: 7, source: 'P7', title: 'End-to-end CLI (Q15)', columns: ['reading'], rows: [['inconclusive (missing P7 ledger)']], notes: [] }];
  }
  const all = files.flatMap((f) => readRows<P7Row>(f));
  const latest = new Map<string, P7Row>();
  for (const r of all) if (r.kind === 'run') latest.set(r.row_key, r);
  const runs = [...latest.values()];
  const scoredIds = new Set(runs.filter((r) => r.status === 'scored').map((r) => r.run_id));
  const byRun = new Map<string, P7Row[]>();
  for (const r of all) if (r.kind === 'command' && scoredIds.has(r.run_id)) byRun.set(r.run_id, [...(byRun.get(r.run_id) ?? []), r]);
  const grade = new Map<string, Grade>(runs.filter((r) => r.status === 'scored').map((r) => [r.row_key, gradeOf(r, byRun.get(r.run_id) ?? [])]));
  const recorded = (r: P7Row): Grade => ({ outcome: r.outcome ?? null, falseClaim: r.false_claim === true, rule: null });
  const commands = all.filter((r) => r.kind === 'command' && scoredIds.has(r.run_id) && r.skipped === null && typeof r.t_cli === 'number');
  const cells = [...new Set(runs.map((r) => `${r.cfg}\0${r.backend}`))].sort();
  const summary: Cell[][] = [];
  const perScenario: Cell[][] = [];
  const timing: Cell[][] = [];
  for (const c of cells) {
    const [cfg, backend] = c.split('\0') as [string, string];
    const mine = runs.filter((r) => r.cfg === cfg && r.backend === backend);
    const scored = mine.filter((r) => r.status === 'scored');
    const g = scored.map((r) => grade.get(r.row_key)!);
    const n = (o: string) => g.filter((x) => x.outcome === o).length;
    const sum = (f: (r: P7Row) => number | undefined) => scored.reduce((a, r) => a + (f(r) ?? 0), 0);
    const rec = scored.map(recorded);
    summary.push([cfg, backend, mine.length, scored.length, mine.length - scored.length, n('pass'), n('safe'), n('fail'),
      g.filter((x) => x.falseClaim).length, sum((r) => r.measures?.wrong_clicks), sum((r) => r.measures?.repeated_writes),
      `${counts(rec)}; false claims ${rec.filter((x) => x.falseClaim).length}`, g.filter((x) => x.rule !== null).length]);
    for (const sc of [...new Set(mine.map((r) => r.scenario))].sort()) {
      const s = scored.filter((r) => r.scenario === sc).map((r) => grade.get(r.row_key)!);
      const k = (o: string) => s.filter((r) => r.outcome === o).length;
      perScenario.push([sc, cfg, backend, `${k('pass')} of ${s.length}`, k('safe'), k('fail'), mine.filter((r) => r.scenario === sc).length - s.length]);
    }
    const runIds = new Set(scored.map((r) => r.run_id));
    const cmds = commands.filter((r) => runIds.has(r.run_id));
    for (const verb of [...new Set(cmds.map((r) => r.argv?.[0] ?? '?'))].sort()) {
      const mineVerb = cmds.filter((r) => (r.argv?.[0] ?? '?') === verb);
      const t = mineVerb.map((r) => r.t_cli!);
      // 7.3 Load and T13: the same reading without rows flagged `high_load` or `slow_gateway`.
      const clean = mineVerb.filter((r) => (r.flags ?? []).length === 0).map((r) => r.t_cli!);
      timing.push([cfg, backend, verb, t.length, fmtMs(nearestRank(t, 0.5)), fmtMs(nearestRank(t, 0.95)),
        clean.length, clean.length === 0 ? null : fmtMs(nearestRank(clean, 0.5)), clean.length === 0 ? null : fmtMs(nearestRank(clean, 0.95))]);
    }
  }
  // A6 item 5: the recorded grade and the re-grade side by side, per scenario, cfg and backend, for the scenarios it names.
  const side: Cell[][] = [];
  for (const sc of REGRADE_SCENARIOS) {
    for (const c of cells) {
      const [cfg, backend] = c.split('\0') as [string, string];
      const scored = runs.filter((r) => r.scenario === sc && r.cfg === cfg && r.backend === backend && r.status === 'scored');
      if (scored.length === 0) continue;
      const g = scored.map((r) => grade.get(r.row_key)!);
      const rec = scored.map(recorded);
      const rules = [...new Set(g.map((x) => x.rule).filter((x): x is string => x !== null))];
      side.push([sc, cfg, backend, scored.length, counts(rec), rec.filter((x) => x.falseClaim).length, counts(g), g.filter((x) => x.falseClaim).length,
        g.filter((x) => x.rule !== null).length, rules.join('; ') || 'none (recorded grade stands)']);
    }
  }
  const regraded = [...grade.values()].filter((x) => x.rule !== null);
  const perRule = REGRADE_RULES.map((rule) => {
    const failed = runs.filter((r) => r.status === 'scored' && r.scenario === rule.scenario && (rule.cfgs === null || rule.cfgs.includes(r.cfg)) && r.outcome === 'fail');
    const hit = failed.filter((r) => grade.get(r.row_key)!.rule === rule.id).length;
    return `${rule.id}: ${hit} runs re-graded; ${failed.length - hit} recorded fail runs of its cells keep their grade (another cause)`;
  });
  const e31 = runs.filter((r) => r.status === 'scored' && r.scenario === 'E31' && r.cfg === 'cli_oa');
  const regradeNotes = [...perRule, `re-graded runs in all: ${regraded.length}`,
    `E31 cli_oa: no rule; ${e31.filter((r) => grade.get(r.row_key)!.outcome === 'fail').length} of ${e31.length} runs stay fail (a real false claim, A6 item 5)`,
    'The grades in e2e/cli/runs.jsonl are not edited; the re-grade is applied here only (PROTOCOL 9.5 A6 item 5).'];
  return [
    { anchor: 'e2e', section: 7, source: 'P7', title: 'End-to-end CLI (Q15): runs per cfg x backend (A6 item 5 re-grade)', columns: ['cfg', 'backend', 'run keys', 'scored', 'void (latest)', 'pass', 'safe', 'fail', 'false claims', 'wrong clicks', 'repeated writes', 'recorded grade (before the re-grade)', 're-graded runs'],
      rows: summary, notes: ['Latest run row per run key; a void run was re-run under a new id, and a key whose latest row is void counts as void.',
        'pass, safe, fail and false claims read the A6 item 5 re-grade; the recorded grade is printed beside it (see the re-grade table).'] },
    { anchor: 'e2e-scenarios', section: 7, source: 'P7', title: 'End-to-end CLI: per scenario (k of 3, A6 item 5 re-grade)', columns: ['scenario', 'cfg', 'backend', 'pass', 'safe', 'fail', 'void'], rows: perScenario,
      notes: ['Read on the A6 item 5 re-grade; E06, E18 and E31 are printed with their recorded grade in the re-grade table.'] },
    { anchor: 'e2e-regrade', section: 7, source: 'P7', title: 'End-to-end CLI: recorded grade and A6 item 5 re-grade side by side', columns: ['scenario', 'cfg', 'backend', 'scored runs', 'recorded', 'recorded false claims', 're-grade', 're-graded false claims', 're-graded runs', 'rule'],
      rows: side, notes: regradeNotes },
    { anchor: 'e2e-timing', section: 7, source: 'P7', title: 'End-to-end CLI: T_cli per verb (nearest rank, ok and non-ok rows alike)', columns: ['cfg', 'backend', 'verb', 'commands', 'p50', 'p95', 'commands without flagged rows', 'p50 without flagged', 'p95 without flagged'], rows: timing,
      notes: ['T_cli includes the key injection; its cost measured alone is in `e2e/injection.jsonl`.',
        'Without flagged rows: commands sent with no `high_load` or `slow_gateway` flag (7.3 Load, T13), a sensitivity reading.'] },
  ];
}

/**
 * Q16 (6.5): `agent-readings.json` of agent/score.ts, copied as key/value rows; missing = listed. Without readings,
 * P8 has not run while the owner's gate file `<results>/P8/G0` is absent (p8/run.sh refuses until it exists); A8
 * item 1 fixes Q16's text for that case. The readings stay a listed missing input (T15), with that reason.
 */
export function agentTable(path: string | null, missing: string[], results: string): Table {
  const title = 'Agent level (Q16)';
  if (path === null || !existsSync(path)) {
    const g0Closed = !existsSync(join(results, 'P8', 'G0')) && !existsSync(join(results, 'p8', 'G0'));
    missing.push(g0Closed ? 'agent readings (P8 not run: G0 closed; PROTOCOL 9.5 A8 item 1)' : 'agent readings (agent/score.ts agent-readings.json; render --agent-readings)');
    return { anchor: 'agent', section: 8, source: 'P8', title, columns: ['reading'],
      rows: [[g0Closed ? 'inconclusive (P8 not run: G0 closed)' : 'inconclusive (missing agent readings)']], notes: [] };
  }
  const rows: Cell[][] = [];
  const walk = (prefix: string, v: unknown) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v).sort()) walk(prefix ? `${prefix}.${k}` : k, (v as Record<string, unknown>)[k]);
    else if (Array.isArray(v) && v.length > 0 && v.every((x) => x !== null && typeof x === 'object')) v.forEach((x, i) => walk(`${prefix}[${i}]`, x));
    else rows.push([prefix, typeof v === 'number' || typeof v === 'string' || v === null ? v : JSON.stringify(v)]);
  };
  walk('', JSON.parse(readFileSync(path, 'utf8')) as unknown);
  return { anchor: 'agent', section: 8, source: 'P8', title, columns: ['reading', 'value'], rows, notes: [`Copied from ${path.split('/').slice(-2).join('/')} (agent/score.ts); section 6.5 rules are applied there.`] };
}

/** The first existing path, else null. */
export function firstExisting(...paths: (string | undefined)[]): string | null {
  return paths.find((p): p is string => p !== undefined && existsSync(p)) ?? null;
}

/** 4.5: the P6 end-RTT check (`slow_gateway`), from `<results>/P6/phase.jsonl`; null when not recorded. */
export function slowGateway(results: string): boolean | null {
  const path = join(results, 'P6', 'phase.jsonl');
  if (!existsSync(path)) return null;
  const ends = readRows<{ event?: string; slow_gateway?: boolean }>(path).filter((e) => e.event === 'end_rtt');
  return ends.length === 0 ? null : ends.at(-1)!.slow_gateway === true;
}
