import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flags, need, opt } from '../calibrate/lib/args';
import { armById, readArmsFile } from './lib/arms';
import type { ArmsFile } from './lib/arms';
import { priceUsage, readKeySpend } from './lib/guards';
import { ledgerFiles, readRows } from './lib/ledger';
import { ledgerIndex } from './analyze/readings';
import { helpExit } from './lib/help';

/*
  7.3 spend cross-check. Per arm and phase, the ledgers' call counts and priced sums (each row's own `usage`, every
  attempt and every HTTP request, priced with the 7.2 table) against (a) the gateway's spend rows split by each arm's
  tag header and the bench key's own spend over each phase window, (b) OpenRouter `usage.cost` sums on the direct
  arm, (c) Claude `total_cost_usd` (`agent_usd`, Claude rows) from the P8 agent ledger. The gateway rows are also
  counted per arm against the ledger's call counts, and the rows no arm's tags match and the export's grand total are
  written beside. P7's CLI Decisions are summed per cfg from refsure's own `decision.usd`. A gap above 2% is listed for the report to explain, and so is each phase whose gateway arms have
  ledger rows but no key-spend snapshot (its key window reads unread).

    spend snapshot --results <dir> --phase <P> --at before|after
        reads the bench key's own spend (arms file `keyInfoPath`, read-only, free) into <results>/key-spend.jsonl;
        the key comes from the first gateway arm's `keyEnv` (run it under `secrets run`); nothing prints the key.
    spend crosscheck --results <dir> --out <spend-crosscheck.json> [--gateway-spend <rows.json>] [--p0-window <json>]

  `--gateway-spend`: a JSON array the operator exported from the gateway's spend log for the bench key, each row
  `{ "tags": [...] | "request_tags": [...] | "tag": "...", "spend": <usd> }` (the gateway's own rows fit as they
  are); a row is credited to the arm whose every `extraHeaders` tag (the header's comma list) it carries. `--p0-window` (when P0 found the tags unrecorded): `{ "<arm>": { "before": usd, "after": usd, "calls": n } }`.
  Exit 0 written, 64 bad usage. Calls no paid API.
*/

const USAGE = 'usage: spend snapshot --results <dir> --phase <P> --at before|after | spend crosscheck --results <dir> --out <json> [--gateway-spend <json>] [--p0-window <json>]';

export interface Sum { calls: number; rows: number; priced: number; unpriced: number; reported: number }

const empty = (): Sum => ({ calls: 0, rows: 0, priced: 0, unpriced: 0, reported: 0 });

interface Usage { cost?: unknown }
interface Wire { t_wire?: number[] | number; usage?: unknown[] | unknown; arm?: string; provider?: string; wires?: { t_wire?: number; usage?: unknown }[] }
interface AnyRow { arm?: string; provider?: string; attempts?: Wire[]; parts?: Wire[]; slice?: string }

/** Sums one row into per-arm totals: M1/quality rows by attempt, M2 Decision rows by part (each part names its arm). */
function addRow(totals: Map<string, Sum>, arms: ArmsFile, row: AnyRow): void {
  const wires: { arm: string; provider: string; wire: Wire }[] = row.parts
    ? row.parts.map((p) => ({ arm: p.arm ?? row.arm ?? '?', provider: p.provider ?? 'jev', wire: p }))
    : (row.attempts ?? []).map((a) => ({ arm: row.arm ?? '?', provider: row.provider ?? 'jev', wire: a }));
  for (const { arm, provider, wire: raw } of wires) {
    // A P5b live part keeps its HTTP records as `wires[]`; a quality attempt or an M2 part keeps parallel arrays.
    const wire = raw.wires ? { t_wire: raw.wires.map((w) => w.t_wire ?? 0), usage: raw.wires.map((w) => w.usage) } : raw;
    const sum = totals.get(arm) ?? empty();
    const usages = (Array.isArray(wire.usage) ? wire.usage : []).filter((u) => u !== null && u !== undefined);
    const calls = Array.isArray(wire.t_wire) ? wire.t_wire.length : 0;
    sum.calls += calls;
    const direct = arms.arms.find((a) => a.id === arm)?.via === 'direct';
    const cost = usages.map((u) => (u as Usage).cost).filter((c): c is number => typeof c === 'number').reduce((a, b) => a + b, 0);
    sum.reported += cost;
    const priced = direct ? (cost > 0 ? cost : null) : priceUsage(provider as 'jev' | 'openai', usages);
    if (priced === null) sum.unpriced += calls > 0 ? 1 : 0;
    else sum.priced += priced;
    totals.set(arm, sum);
  }
  if (row.arm === undefined) return;
  const own = totals.get(row.arm) ?? empty();
  own.rows += 1;
  totals.set(row.arm, own);
}

/**
 * Every phase directory of a results dir (`P0`..`P9`, with suffixes such as `P5b`): `dir` as it is on disk, `phase`
 * as the protocol and `key-spend.jsonl` name it. The phase scripts create some directories in lower case (`p5`,
 * `p6`), so the match ignores case.
 */
function phases(results: string): { dir: string; phase: string }[] {
  if (!existsSync(results)) return [];
  return readdirSync(results, { withFileTypes: true }).filter((d) => d.isDirectory() && /^p\d/i.test(d.name))
    .map((d) => ({ dir: d.name, phase: `P${d.name.slice(1)}` })).sort((a, b) => a.phase.localeCompare(b.phase));
}

/**
 * Per phase and arm: ledger calls, rows and priced sums over every row of every file (a resumed failure spent too).
 * P4a's rows are P4 rows (`slice: interim`, 7.1) and are summed under P4a, the phase whose window they were sent in.
 */
export function ledgerTotals(results: string, arms: ArmsFile): Record<string, Record<string, Sum>> {
  const byPhase = new Map<string, Map<string, Sum>>();
  const totalsOf = (phase: string) => byPhase.get(phase) ?? byPhase.set(phase, new Map()).get(phase)!;
  for (const { dir, phase } of phases(results)) {
    for (const { arm, set } of ledgerIndex(results, dir)) {
      for (const file of ledgerFiles(results, dir, arm, set)) {
        for (const row of readRows<AnyRow>(file)) addRow(totalsOf(phase === 'P4' && row.slice === 'interim' ? 'P4a' : phase), arms, row);
      }
    }
  }
  const out: Record<string, Record<string, Sum>> = {};
  for (const [phase, totals] of [...byPhase.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (totals.size > 0) out[phase] = Object.fromEntries([...totals.entries()].sort());
  }
  return out;
}

interface KeyLine { phase: string; at: 'before' | 'after'; time: string; spend: number | null }

function keyWindows(results: string): Record<string, number | null> {
  const path = join(results, 'key-spend.jsonl');
  const out: Record<string, number | null> = {};
  if (!existsSync(path)) return out;
  const lines = readRows<KeyLine>(path);
  for (const phase of [...new Set(lines.map((l) => l.phase))].sort()) {
    const before = lines.filter((l) => l.phase === phase && l.at === 'before').at(0)?.spend;
    const after = lines.filter((l) => l.phase === phase && l.at === 'after').at(-1)?.spend;
    out[phase] = typeof before === 'number' && typeof after === 'number' ? after - before : null;
  }
  return out;
}

/** |a - b| / b, or null when b is not positive. */
function gap(a: number, b: number): number | null {
  return b > 0 ? Math.abs(a - b) / b : null;
}

/** Gateway spend: dollars and row (call) counts. */
export interface Spent { spend: number; rows: number }

/**
 * Gateway spend rows credited per arm through each arm's tag header value, the rows no arm's tags match, and every
 * row of the export (dollars and row (call) counts).
 */
function gatewaySplit(arms: ArmsFile, path: string | undefined): { perArm: Record<string, Spent>; unmatched: Spent; total: Spent } | null {
  if (path === undefined) return null;
  const rows = JSON.parse(readFileSync(path, 'utf8')) as { tags?: unknown; request_tags?: unknown; tag?: unknown; spend?: unknown }[];
  const spent = (list: typeof rows): Spent => ({ spend: list.reduce((a, r) => a + (typeof r.spend === 'number' ? r.spend : 0), 0), rows: list.length });
  const perArm: Record<string, Spent> = {};
  const matched = new Set<(typeof rows)[number]>();
  for (const arm of arms.arms.filter((a) => a.via === 'gateway')) {
    // The tag header is a comma list (`refsure-bench,arm:<id>`) that the gateway stores split, so a row is the arm's
    // when it carries every tag of the list; the first tag alone is shared by every arm.
    const values = Object.values(arm.extraHeaders ?? {}).flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => v !== '');
    if (values.length === 0) continue;
    const mine = rows.filter((r) => {
      const list = Array.isArray(r.tags) ? r.tags : Array.isArray(r.request_tags) ? r.request_tags : typeof r.tag === 'string' ? [r.tag] : [];
      const tags = list.map(String);
      return values.every((v) => tags.some((t) => t === v || t.endsWith(`:${v}`)));
    });
    for (const r of mine) matched.add(r);
    perArm[arm.id] = spent(mine);
  }
  return { perArm, unmatched: spent(rows.filter((r) => !matched.has(r))), total: spent(rows) };
}

/**
 * (c) Claude dollars: `agent_usd` (the run's `total_cost_usd`) summed over the P8 agent ledger
 * `<results>/P8/agents.jsonl` (and its resume files), Claude rows only (Codex rows carry token-priced dollars, not
 * a reported cost). Every run row counts once (latest per `run_id`): a void run spent too. Runs without a reported
 * cost are counted apart.
 */
function agentDollars(results: string): { runs: number; usd: number; unreported: number } | null {
  const present = ledgerFiles(results, 'P8', '', 'agents');
  if (present.length === 0) return null;
  const byRun = new Map<string, { agent?: unknown; agent_usd?: unknown }>();
  for (const file of present) for (const row of readRows<{ run_id?: unknown; agent?: unknown; agent_usd?: unknown }>(file)) {
    if (typeof row.run_id === 'string') byRun.set(row.run_id, row);
  }
  const claude = [...byRun.values()].filter((r) => r.agent === 'claude');
  const priced = claude.filter((r) => typeof r.agent_usd === 'number');
  return { runs: claude.length, usd: priced.reduce((a, r) => a + (r.agent_usd as number), 0), unreported: claude.length - priced.length };
}

/**
 * P7's CLI Decisions (`<results>/e2e/cli/runs*.jsonl`, every command row of every file: a void run spent too), per
 * cfg: Decisions, refsure's own `decision.usd` summed, and parts that report no usd (OpenAI parts). The ledger has no
 * arm or token usage, so P7 is not priced with the 7.2 table; its gateway calls carry no arm tag.
 */
function cliDecisions(results: string): Record<string, { decisions: number; reported: number; unreportedParts: number }> | null {
  const files = ledgerFiles(results, 'e2e', 'cli', 'runs');
  if (files.length === 0) return null;
  const out: Record<string, { decisions: number; reported: number; unreportedParts: number }> = {};
  for (const file of files) for (const row of readRows<{ kind?: string; cfg?: string; envelope?: { decision?: { usd?: unknown; parts?: { usd?: unknown }[] } | null } | null }>(file)) {
    const d = row.envelope?.decision;
    if (row.kind !== 'command' || typeof row.cfg !== 'string' || d === null || typeof d !== 'object') continue;
    const t = out[row.cfg] ?? { decisions: 0, reported: 0, unreportedParts: 0 };
    t.decisions += 1;
    if (typeof d.usd === 'number') t.reported += d.usd;
    t.unreportedParts += (d.parts ?? []).filter((p) => typeof p.usd !== 'number').length;
    out[row.cfg] = t;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** `spend-crosscheck.json` (7.3) as `crosscheck` writes it; analyze/spend-table.ts renders it. */
export interface CrossCheck {
  perPhase: Record<string, Record<string, Sum>>;
  perArm: Record<string, { calls: number; priced: number; unpriced: number; reported: number }>;
  gatewayTagSplit: Record<string, { measured: number; priced: number; gap: number | null; gatewayRows: number; ledgerCalls: number; callGap: number | null }> | null;
  /** Gateway rows no arm's tags match, and every row of the export. */
  gatewayUnmatched: Spent | null; gatewayTotal: Spent | null;
  /** Per phase; `snapshot: false` when the phase's gateway arms have ledger rows but key-spend.jsonl holds no snapshot. */
  keyWindows: Record<string, { measured: number | null; priced: number; gap: number | null; snapshot?: false }>;
  p0Window: Record<string, { measuredPerCall: number | null; pricedPerCall: number | null; gap: number | null }> | null;
  openRouter: { arm: string; usageCost: number }[];
  claude: { runs: number; usd: number; unreported: number } | null;
  /** P7's CLI Decisions per cfg, from refsure's own `decision.usd` (cliDecisions). */
  p7: Record<string, { decisions: number; reported: number; unreportedParts: number }> | null;
  summary: { arms: Record<string, { calls: number; priced: number }>; gapsToExplain: number };
  explain: string[];
}

export function crosscheck(results: string, arms: ArmsFile, gatewaySpend?: string, p0Window?: string): CrossCheck {
  const ledgers = ledgerTotals(results, arms);
  const perArm: Record<string, { calls: number; priced: number; unpriced: number; reported: number }> = {};
  for (const byArm of Object.values(ledgers)) for (const [arm, s] of Object.entries(byArm)) {
    const t = perArm[arm] ?? { calls: 0, priced: 0, unpriced: 0, reported: 0 };
    t.calls += s.calls; t.priced += s.priced; t.unpriced += s.unpriced; t.reported += s.reported;
    perArm[arm] = t;
  }
  const explain: string[] = [];
  const split = gatewaySplit(arms, gatewaySpend);
  const tagRows = split === null ? null : Object.fromEntries(Object.entries(split.perArm).map(([arm, m]) => {
    const priced = perArm[arm]?.priced ?? 0;
    const calls = perArm[arm]?.calls ?? 0;
    const g = gap(priced, m.spend);
    const gCalls = gap(calls, m.rows);
    if (g === null || g > 0.02) explain.push(`gateway tag split ${arm}: priced ${priced.toFixed(4)} vs measured ${m.spend.toFixed(4)}`);
    if (gCalls === null || gCalls > 0.02) explain.push(`gateway rows ${arm}: ledger calls ${calls} vs gateway spend rows ${m.rows}`);
    return [arm, { measured: m.spend, priced, gap: g, gatewayRows: m.rows, ledgerCalls: calls, callGap: gCalls }];
  }));
  const windows = keyWindows(results);
  const gatewayArms = new Set(arms.arms.filter((a) => a.via === 'gateway').map((a) => a.id));
  // Every phase with a snapshot, and every phase whose gateway arms sent calls but have no snapshot in
  // key-spend.jsonl: that window is unread, and listed.
  const sent = Object.keys(ledgers).filter((phase) => Object.entries(ledgers[phase]!).some(([arm, s]) => gatewayArms.has(arm) && s.calls > 0));
  const keyRows: CrossCheck['keyWindows'] = Object.fromEntries([...new Set([...Object.keys(windows), ...sent])].sort().map((phase) => {
    const priced = Object.entries(ledgers[phase] ?? {}).filter(([arm]) => gatewayArms.has(arm)).reduce((a, [, s]) => a + s.priced, 0);
    if (!(phase in windows)) {
      explain.push(`key window ${phase}: unread (no snapshot)`);
      return [phase, { measured: null, priced, gap: null, snapshot: false }];
    }
    const measured = windows[phase] ?? null;
    const g = measured === null ? null : gap(priced, measured);
    if (g === null || g > 0.02) explain.push(`key window ${phase}: priced ${priced.toFixed(4)} vs measured ${measured === null ? 'unread' : measured.toFixed(4)}`);
    return [phase, { measured, priced, gap: g }];
  }));
  const window = p0Window === undefined ? null : JSON.parse(readFileSync(p0Window, 'utf8')) as Record<string, { before: number; after: number; calls: number }>;
  const windowRows = window === null ? null : Object.fromEntries(Object.entries(window).map(([arm, w]) => {
    const perCall = w.calls > 0 ? (w.after - w.before) / w.calls : null;
    const ledgerPerCall = (perArm[arm]?.calls ?? 0) > 0 ? perArm[arm]!.priced / perArm[arm]!.calls : null;
    const g = perCall === null || ledgerPerCall === null ? null : gap(ledgerPerCall, perCall);
    if (g === null || g > 0.02) explain.push(`P0 window ${arm}: priced per call ${ledgerPerCall} vs measured ${perCall}`);
    return [arm, { measuredPerCall: perCall, pricedPerCall: ledgerPerCall, gap: g }];
  }));
  const direct = arms.arms.filter((a) => a.via === 'direct').map((a) => ({ arm: a.id, usageCost: perArm[a.id]?.reported ?? 0 }));
  const agents = agentDollars(results);
  const p7 = cliDecisions(results);
  if (p7 !== null) explain.push('P7: priced by refsure\'s own decision.usd only (OpenAI parts report none); its gateway calls carry no arm tag, and Jev calls sent to OpenRouter are in no gateway row');
  if (split === null && windowRows === null) explain.push('no gateway spend rows and no P0 window: the per-arm split is unchecked');
  if (Object.keys(windows).length === 0) explain.push('no key-spend snapshots: the phase windows are unchecked (or /key/info unreadable, per P0)');
  if (agents === null) explain.push('no agent ledger (P8/agents.jsonl): Claude dollars unchecked');
  else if (agents.unreported > 0) explain.push(`Claude runs without a reported total_cost_usd: ${agents.unreported} of ${agents.runs}`);
  return {
    perPhase: ledgers, perArm, gatewayTagSplit: tagRows, gatewayUnmatched: split?.unmatched ?? null, gatewayTotal: split?.total ?? null,
    keyWindows: keyRows, p0Window: windowRows, openRouter: direct, claude: agents, p7,
    summary: { arms: Object.fromEntries(Object.entries(perArm).map(([a, s]) => [a, { calls: s.calls, priced: Math.round(s.priced * 1e6) / 1e6 }])), gapsToExplain: explain.length },
    explain,
  };
}

async function main(): Promise<void> {
  helpExit(USAGE);
  const [command, ...rest] = process.argv.slice(2);
  const arms = readArmsFile();
  if (command === 'snapshot') {
    const v = flags(rest, ['results', 'phase', 'at'], USAGE);
    const at = need(v, 'at', USAGE);
    if (at !== 'before' && at !== 'after') { process.stderr.write(`--at before|after\n${USAGE}\n`); process.exit(64); }
    const gw = arms.arms.find((a) => a.via === 'gateway');
    const spend = gw && arms.keyInfoPath && arms.gateway ? await readKeySpend(arms.gateway.url, arms.keyInfoPath, armById(arms, gw.id).keyEnv) : null;
    const line = { phase: need(v, 'phase', USAGE), at, time: new Date().toISOString(), spend };
    appendFileSync(join(need(v, 'results', USAGE), 'key-spend.jsonl'), `${JSON.stringify(line)}\n`);
    process.stdout.write(`key spend ${spend === null ? 'unreadable' : spend.toFixed(6)} (${line.phase} ${at})\n`);
    return;
  }
  if (command === 'crosscheck') {
    const v = flags(rest, ['results', 'out', 'gateway-spend', 'p0-window'], USAGE);
    const report = crosscheck(need(v, 'results', USAGE), arms, opt(v, 'gateway-spend'), opt(v, 'p0-window'));
    writeFileSync(need(v, 'out', USAGE), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${need(v, 'out', USAGE)}: ${report.explain.length} gaps or unchecked parts to explain\n`);
    return;
  }
  process.stderr.write(`${USAGE}\n`);
  process.exit(64);
}

if (process.argv[1] && /spend\.(ts|mjs|js)$/.test(process.argv[1])) void main();
