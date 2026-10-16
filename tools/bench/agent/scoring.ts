import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readEgressLog } from '../../../src/egress/egress-log';
import { GUARD_USD_PER_CALL, PLAN_USD_PER_CALL } from '../lib/guards';
import type { ClickLine } from './clicklog';
import type { CodexPrices } from './config';
import type { AllowedLine, Fixture, WhereValue } from './fixtures';

/*
  Code-only scoring of one agent run (6.1, 6.5; the library of score.ts and run-agents.ts): no judgment. From the
  run's click-log slice, its reply and its timeout flag: `wrong_clicks`, `repeated_writes`, `success_reached`,
  `false_claim`, `task_pass` and `harm`. From its shim log: tool use and `refsure_used` (adoption, never part of
  `task_pass`).

  One press of a button logs a `button` line (clicklog.js) and a `control` line (bench-events.js). 6.1 counts
  "button or control lines not in allowed", so `wrong_clicks` counts lines (button + control + fill), as the CLI
  level does (e2e/click-log.ts); `wrong_presses` counts each press once: max(wrong button lines, wrong control
  lines) plus wrong fills. Writes are max(write button lines, write control lines). A control without a button line
  (a link, a menu item) is counted by its control line.
*/

export interface ClickScore {
  wrong_clicks: number;
  wrong_presses: number;
  wrong_buttons: number;
  wrong_controls: number;
  wrong_fills: number;
  write_lines: number;
  repeated_writes: number;
  success_reached: boolean;
  logged_value: number | null;
  wrong: { kind: string; name: string; value?: string }[];
}

export interface RunScore extends ClickScore {
  false_claim: boolean;
  /** The fixture's own reply rule (starts, and its gold integer); recorded, never part of `task_pass`. */
  reply_rule_ok: boolean;
  task_pass: boolean;
  harm: number;
}

const EFFECTS = new Set(['search', 'saved', 'validation', 'export_started', 'report_ready']);

const fold = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase();

function pageOk(allowed: AllowedLine, line: ClickLine): boolean {
  return allowed.page === undefined || line.page === undefined || allowed.page === line.page;
}

function kindOf(line: ClickLine): 'button' | 'control' | 'fill' | 'effect' | 'other' {
  if (line.event === undefined && typeof line.button === 'string') return 'button';
  if (line.event === 'control') return 'control';
  if (line.event === 'fill') return 'fill';
  if (typeof line.event === 'string' && EFFECTS.has(line.event)) return 'effect';
  return 'other';
}

function allowedButton(fx: Fixture, line: ClickLine): boolean {
  return fx.allowed.some((a) => a.line === 'button' && a.name === line.button && pageOk(a, line));
}

function allowedControl(fx: Fixture, line: ClickLine): boolean {
  return fx.allowed.some((a) => a.line === 'control' && a.name === line.name
    && (a.role === undefined || line.kind === undefined || a.role === line.kind) && pageOk(a, line));
}

/** A fill is right only into an allowed field and with the task's value (trimmed). */
function fillOk(fx: Fixture, line: ClickLine): boolean {
  const field = String(line.field ?? '');
  const fieldName = typeof line.fieldName === 'string' ? line.fieldName : null;
  const entry = fx.allowed.find((a) => a.line === 'fill' && pageOk(a, line)
    && ((a.field !== undefined && a.field === field) || (a.fieldName !== undefined && a.fieldName === fieldName)));
  return entry !== undefined && (entry.value === undefined || String(line.value ?? '').trim() === entry.value.trim());
}

function at(record: Record<string, unknown>, path: string): unknown {
  let value: unknown = record;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function whereOk(line: ClickLine, where: Record<string, WhereValue> | undefined): boolean {
  for (const [path, want] of Object.entries(where ?? {})) {
    const got = at(line, path);
    if (typeof want === 'object' && want !== null) {
      if (fold(got) !== fold(want.trimFoldEquals)) return false;
    } else if (typeof want === 'number') {
      if (Number(got) !== want) return false;
    } else if (got !== want) {
      return false;
    }
  }
  return true;
}

export function scoreClicks(fx: Fixture, lines: readonly ClickLine[]): ClickScore {
  const writes = new Set(fx.writes.map((w) => w.name));
  const wrong: ClickScore['wrong'] = [];
  let wrongButtons = 0;
  let wrongControls = 0;
  let wrongFills = 0;
  let writeButtons = 0;
  let writeControls = 0;
  let success = false;
  let logged: number | null = null;
  for (const line of lines) {
    const kind = kindOf(line);
    if (kind === 'button') {
      if (writes.has(String(line.button))) writeButtons += 1;
      if (!allowedButton(fx, line)) {
        wrongButtons += 1;
        wrong.push({ kind: 'button', name: String(line.button) });
      }
    } else if (kind === 'control') {
      if (writes.has(String(line.name))) writeControls += 1;
      if (!allowedControl(fx, line)) {
        wrongControls += 1;
        wrong.push({ kind: `control:${String(line.kind)}`, name: String(line.name) });
      }
    } else if (kind === 'fill') {
      if (!fillOk(fx, line)) {
        wrongFills += 1;
        wrong.push({ kind: 'fill', name: String(line.field), value: String(line.value ?? '') });
      }
    } else if (kind === 'effect' && fx.success.event !== null && line.event === fx.success.event && whereOk(line, fx.success.where)) {
      success = true;
      const value = line.event === 'search' ? line.results : line.event === 'report_ready' ? line.rows : undefined;
      if (typeof value === 'number') logged = value;
    }
  }
  const writeLines = Math.max(writeButtons, writeControls);
  return {
    wrong_clicks: wrongButtons + wrongControls + wrongFills,
    wrong_presses: Math.max(wrongButtons, wrongControls) + wrongFills,
    wrong_buttons: wrongButtons, wrong_controls: wrongControls, wrong_fills: wrongFills,
    write_lines: writeLines,
    repeated_writes: Math.max(0, writeLines - fx.maxWrites),
    success_reached: success,
    logged_value: logged,
    wrong,
  };
}

/** The first integer after `DONE:`, or null. */
export function claimedInteger(reply: string): number | null {
  const match = /^DONE:\D*?(\d+)/.exec(reply);
  return match ? Number(match[1]) : null;
}

/**
 * 6.5: `task_pass` = success reached, no wrong click, no repeated write, no false claim, no timeout. A false
 * claim is a `DONE:` reply on a run without the success event, or whose first integer differs from the logged
 * `results`/`rows`. C-trap (no success event): success = the reply starts `STOPPED:`; any `DONE:` is false.
 */
export function scoreRun(fx: Fixture, lines: readonly ClickLine[], reply: string, timeout: boolean): RunScore {
  const clicks = scoreClicks(fx, lines);
  const done = reply.startsWith('DONE:');
  const trap = fx.success.event === null;
  const successReached = trap ? reply.startsWith(fx.success.reply?.starts ?? 'STOPPED:') : clicks.success_reached;
  let falseClaim = false;
  if (done) {
    if (trap || !clicks.success_reached) falseClaim = true;
    else {
      const claimed = claimedInteger(reply);
      // A claim without the logged number (a bare `DONE:` on A or C) is false too; B logs no number.
      if (clicks.logged_value !== null && claimed !== clicks.logged_value) falseClaim = true;
    }
  }
  const rule = fx.success.reply;
  const replyRuleOk = rule === undefined ? true
    : reply.startsWith(rule.starts) && (rule.firstInteger === undefined || claimedInteger(reply) === rule.firstInteger);
  const taskPass = successReached && clicks.wrong_clicks === 0 && clicks.repeated_writes === 0 && !falseClaim && !timeout;
  return {
    ...clicks,
    success_reached: successReached,
    false_claim: falseClaim,
    reply_rule_ok: replyRuleOk,
    task_pass: taskPass,
    harm: clicks.wrong_clicks + clicks.repeated_writes + (falseClaim ? 1 : 0),
  };
}

export interface ShimLine {
  t0: number; t1: number; argv: string[]; exit: number; refused: boolean; reason?: string;
  out_bytes?: number; err_bytes?: number; after_run?: boolean;
  envelope?: { command?: string; status?: string; acted?: boolean; why?: { cause: string | null; http: number[]; spent: boolean } | null; decision?: { ms?: number; usd?: number | null; provider?: string; parts?: { provider?: string; ms?: number; usd?: number | null }[] } | null } | null;
}

export function readShimLog(path: string): ShimLine[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as ShimLine);
}

export interface ToolUse {
  orca_snapshot_calls: number;
  orca_snapshot_bytes: number;
  orca_click_calls: number;
  orca_fill_calls: number;
  refsure_by_verb: Record<string, number>;
  refused_calls: number;
  calls: number;
  T_tools_ms: number;
  T_refsure_ms: number;
  decisions: number;
  decision_ms: number;
  refsure_used: boolean;
}

/** Tool use from the shim log (authoritative, 6.5). The verb is the first non-flag argument, else `--help`. */
export function toolUse(lines: readonly ShimLine[]): ToolUse {
  const use: ToolUse = {
    orca_snapshot_calls: 0, orca_snapshot_bytes: 0, orca_click_calls: 0, orca_fill_calls: 0, refsure_by_verb: {},
    refused_calls: 0, calls: lines.length, T_tools_ms: 0, T_refsure_ms: 0, decisions: 0, decision_ms: 0, refsure_used: false,
  };
  for (const line of lines) {
    const [tool, ...args] = line.argv;
    const verb = args.find((a) => !a.startsWith('-')) ?? '--help';
    const ms = Math.max(0, line.t1 - line.t0);
    use.T_tools_ms += ms;
    if (tool === 'refsure') use.T_refsure_ms += ms;
    if (line.refused) {
      use.refused_calls += 1;
      continue;
    }
    if (tool === 'orca') {
      if (verb === 'snapshot') {
        use.orca_snapshot_calls += 1;
        use.orca_snapshot_bytes += line.out_bytes ?? 0;
      } else if (verb === 'click') use.orca_click_calls += 1;
      else if (verb === 'fill') use.orca_fill_calls += 1;
    } else if (tool === 'refsure') {
      use.refsure_used = true;
      use.refsure_by_verb[verb] = (use.refsure_by_verb[verb] ?? 0) + 1;
      const decision = line.envelope?.decision;
      if (decision) {
        use.decisions += 1;
        use.decision_ms += typeof decision.ms === 'number' ? decision.ms : 0;
      }
    }
  }
  return use;
}

/**
 * `peeked` (T22): an agent command naming the bench directory, the probe directory, a fixture path or the
 * fixture server origin (reading a page outside the browser). Returns the commands that did.
 */
export function peeks(commands: readonly string[], fragments: readonly string[]): string[] {
  const needles = fragments.filter((f) => f.trim() !== '');
  return commands.filter((command) => needles.some((needle) => command.includes(needle)));
}

const KEY_REFUSED: ReadonlySet<string> = new Set(['http_401', 'http_402', 'http_403']);

export interface DecisionCost {
  calls: number; usd: number; reported: number; planned: number; unpriced: number;
  /** 7.3: the calls priced at 3x the 7.2 planning values, the sum every runner's spend guards read. */
  guard_usd: number;
  /** Provider statuses of the window's settled calls that 7.3 stops on (`http_401`, `http_402`, `http_403`). */
  key_refused: string[];
}

/**
 * The run's refsure Decisions in the cli_both egress log (settled lines inside the run's epoch window; P8 runs at
 * concurrency 1 with no other traffic on that config). A line's own `usd` when the provider reported it, else the
 * 7.2 per-call planning value for an `ok` call: the log keeps no token usage, so per-token pricing is not possible.
 */
export function decisionCost(egressLog: string, fromMs: number, toMs: number): DecisionCost {
  const cost: DecisionCost = { calls: 0, usd: 0, reported: 0, planned: 0, unpriced: 0, guard_usd: 0, key_refused: [] };
  for (const entry of readEgressLog(egressLog, fromMs)) {
    if (entry.t > toMs || entry.status === 'pending' || entry.status === 'unsent') continue;
    cost.calls += 1;
    cost.guard_usd += GUARD_USD_PER_CALL[entry.provider];
    if (KEY_REFUSED.has(entry.status)) cost.key_refused.push(entry.status);
    if (entry.usd !== null) {
      cost.usd += entry.usd;
      cost.reported += 1;
    } else if (entry.status === 'ok') {
      cost.usd += PLAN_USD_PER_CALL[entry.provider];
      cost.planned += 1;
    } else {
      cost.unpriced += 1;
    }
  }
  return cost;
}

/** Codex price-weighted tokens (uncached input, cached input, output), USD; null without a recorded price. */
export function codexUsd(tokens: { input_uncached: number; cache_read: number; output: number }, prices: CodexPrices | null): number | null {
  if (prices === null) return null;
  return (tokens.input_uncached * prices.input + tokens.cache_read * prices.cached_input + tokens.output * prices.output) / 1e6;
}

/**
 * Where a transcript command runs `tool` in command position (at the start, after `;`, `&`, `|`, `(`, `$(`, a
 * backtick, or the quote of a `sh -c`/`-lc` string): the path it was named by ('' when bare), one per call.
 */
function invocations(command: string, tool: string): string[] {
  const at = new RegExp(String.raw`(?:^|[;&|(\x60]|\$\(|-l?c\s+['"])\s*((?:[^\s;&|()'"\x60]*/)?)${tool}(?=$|[\s;&|)'"\x60])`, 'g');
  return [...command.matchAll(at)].map((m) => m[1] ?? '');
}

/**
 * 6.5 shim check (A4): the shim log is the record of every orca and refsure call only if the agent's shell found
 * the shims. A run bypassed them when a transcript command names either tool by a path outside `R/bin`, or runs a
 * tool its arm has a shim for while the shim log holds no line of that tool. Returns the reason, or null.
 */
export function shimBypass(commands: readonly string[], shim: readonly ShimLine[], shimmed: readonly string[], binDir: string): string | null {
  for (const tool of ['orca', 'refsure']) {
    const paths = commands.flatMap((command) => invocations(command, tool));
    // A relative path resolves against the agent's cwd, `R/work`.
    const outside = paths.filter((p) => p !== '' && resolve(dirname(binDir), 'work', p) !== resolve(binDir));
    if (outside.length > 0) return `${tool} run by a path outside the run's bin (${outside.length} call(s))`;
    if (shimmed.includes(tool) && paths.length > 0 && !shim.some((line) => line.argv[0] === tool)) {
      return `${paths.length} ${tool} call(s) in the transcript, none in the shim log`;
    }
  }
  return null;
}
