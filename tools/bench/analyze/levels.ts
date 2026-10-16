import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nearestRank } from '../lib/stats';
import { ledgerFiles, readRows } from '../lib/ledger';
import { fmtMs } from './readings';
import type { Cell, Table } from './verdict';

/*
  Sections 7 and 8 of tables.md. Q15 is read here from the P7 CLI ledger (`<results>/e2e/cli/runs*.jsonl`, written by
  e2e/run-cli.ts; there is no separate summary): per cfg x backend the 6.4 readings. Q16 is copied from
  agent/score.ts's `agent-readings.json` (6.5 rules are applied there).
*/

interface RunRow {
  kind: string; row_key: string; run_id: string; scenario: string; cfg: string; backend: string; repeat: string; status?: string;
  outcome?: string | null; false_claim?: boolean | null; measures?: { wrong_clicks?: number; repeated_writes?: number };
  argv?: string[] | null; t_cli?: number | null; skipped?: string | null;
}

/** Q15 (6.4): the latest run row per run key; command rows of that run only. */
export function e2eTables(results: string, missing: string[]): Table[] {
  const files = ledgerFiles(results, 'e2e', 'cli', 'runs');
  if (files.length === 0) {
    missing.push('P7 CLI ledger (e2e/cli/runs.jsonl)');
    return [{ anchor: 'e2e', section: 7, source: 'P7', title: 'End-to-end CLI (Q15)', columns: ['reading'], rows: [['inconclusive (missing P7 ledger)']], notes: [] }];
  }
  const all = files.flatMap((f) => readRows<RunRow>(f));
  const latest = new Map<string, RunRow>();
  for (const r of all) if (r.kind === 'run') latest.set(r.row_key, r);
  const runs = [...latest.values()];
  const scoredIds = new Set(runs.filter((r) => r.status === 'scored').map((r) => r.run_id));
  const commands = all.filter((r) => r.kind === 'command' && scoredIds.has(r.run_id) && r.skipped === null && typeof r.t_cli === 'number');
  const cells = [...new Set(runs.map((r) => `${r.cfg}\0${r.backend}`))].sort();
  const summary: Cell[][] = [];
  const perScenario: Cell[][] = [];
  const timing: Cell[][] = [];
  for (const c of cells) {
    const [cfg, backend] = c.split('\0') as [string, string];
    const mine = runs.filter((r) => r.cfg === cfg && r.backend === backend);
    const scored = mine.filter((r) => r.status === 'scored');
    const n = (o: string) => scored.filter((r) => r.outcome === o).length;
    const sum = (f: (r: RunRow) => number | undefined) => scored.reduce((a, r) => a + (f(r) ?? 0), 0);
    summary.push([cfg, backend, mine.length, scored.length, mine.length - scored.length, n('pass'), n('safe'), n('fail'),
      scored.filter((r) => r.false_claim === true).length, sum((r) => r.measures?.wrong_clicks), sum((r) => r.measures?.repeated_writes)]);
    for (const sc of [...new Set(mine.map((r) => r.scenario))].sort()) {
      const s = scored.filter((r) => r.scenario === sc);
      const k = (o: string) => s.filter((r) => r.outcome === o).length;
      perScenario.push([sc, cfg, backend, `${k('pass')} of ${s.length}`, k('safe'), k('fail'), mine.filter((r) => r.scenario === sc).length - s.length]);
    }
    const runIds = new Set(scored.map((r) => r.run_id));
    const cmds = commands.filter((r) => runIds.has(r.run_id));
    for (const verb of [...new Set(cmds.map((r) => r.argv?.[0] ?? '?'))].sort()) {
      const t = cmds.filter((r) => (r.argv?.[0] ?? '?') === verb).map((r) => r.t_cli!);
      timing.push([cfg, backend, verb, t.length, fmtMs(nearestRank(t, 0.5)), fmtMs(nearestRank(t, 0.95))]);
    }
  }
  return [
    { anchor: 'e2e', section: 7, source: 'P7', title: 'End-to-end CLI (Q15): runs per cfg x backend', columns: ['cfg', 'backend', 'run keys', 'scored', 'void (latest)', 'pass', 'safe', 'fail', 'false claims', 'wrong clicks', 'repeated writes'],
      rows: summary, notes: ['Latest run row per run key; a void run was re-run under a new id, and a key whose latest row is void counts as void.'] },
    { anchor: 'e2e-scenarios', section: 7, source: 'P7', title: 'End-to-end CLI: per scenario (k of 3)', columns: ['scenario', 'cfg', 'backend', 'pass', 'safe', 'fail', 'void'], rows: perScenario, notes: [] },
    { anchor: 'e2e-timing', section: 7, source: 'P7', title: 'End-to-end CLI: T_cli per verb (nearest rank, ok and non-ok rows alike)', columns: ['cfg', 'backend', 'verb', 'commands', 'p50', 'p95'], rows: timing,
      notes: ['T_cli includes the key injection; its cost measured alone is in `e2e/injection.jsonl`.'] },
  ];
}

/** Q16 (6.5): `agent-readings.json` of agent/score.ts, copied as key/value rows; missing = listed. */
export function agentTable(path: string | null, missing: string[]): Table {
  const title = 'Agent level (Q16)';
  if (path === null || !existsSync(path)) {
    missing.push('agent readings (agent/score.ts agent-readings.json; render --agent-readings)');
    return { anchor: 'agent', section: 8, source: 'P8', title, columns: ['reading'], rows: [['inconclusive (missing agent readings)']], notes: [] };
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
