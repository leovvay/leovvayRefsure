import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { repoRoot } from '../lib/freeze';
import { readCodexPrices } from './config';
import type { AgentArm, AgentId, AgentsConfig, CodexPrices } from './config';
import { readSlice } from './clicklog';
import type { Fixture } from './fixtures';
import { codexUsd, decisionCost, peeks, readShimLog, scoreRun, shimBypass, toolUse } from './scoring';
import type { DecisionCost, RunScore, ToolUse } from './scoring';
import { readClaude, readCodex } from './transcript';
import type { Tokens } from './transcript';

/*
  The agent ledger (7.4): one row per run, `<results>/P8/agents.jsonl`. The harness writes the run's facts
  (`AgentRunFacts`); `assembleRow` adds every 6.5 measure and score from the files the facts name, so score.ts can
  rebuild any row from its run directory and the click log.
*/

export type RunKind = 'run' | 'dry' | 'preflight';

export interface AgentRunFacts {
  kind: RunKind;
  row_key: string;
  run_id: string;
  phase: 'P8';
  agent: AgentId;
  arm: AgentArm;
  set: string;
  set_sha: string;
  fixture: string;
  repeat: string;
  /** Position of this (agent, arm) cell within its fixture's four, after the rotation. */
  cell: number;
  page: string;
  prompt_sha: string;
  ts_start: string;
  ts_end: string;
  /** Epoch ms of spawn and exit (egress-log window); `T_agent_ms` is the monotonic spawn-to-exit time. */
  t_start_epoch: number;
  t_end_epoch: number;
  T_agent_ms: number;
  exit_code: number | null;
  signal: string | null;
  timeout: boolean;
  loadavg_start: number;
  loadavg_end: number;
  flags: string[];
  dir: string;
  transcript: string;
  last_message: string;
  shim_log: string;
  stderr: string;
  clicks: { path: string; start: number; end: number };
  /** Files of the run holding a credential's exact value (names only); any hit voids the run (T27). */
  secret_files: string[];
  agents_sha: string;
  refsure_commit: string;
  bench_commit: string;
  node: string;
  pins: { model: string; version: string; effort: string };
  skills_sha: Record<string, string>;
}

export interface AgentRow extends AgentRunFacts {
  void: string | null;
  models_seen: string[];
  model_ok: boolean | null;
  version_seen: string | null;
  skills_seen: string[] | null;
  result_subtype: string | null;
  capped: boolean;
  budget_stop: boolean;
  reply: string;
  duration_ms: number | null;
  duration_api_ms: number | null;
  num_turns: number | null;
  tokens: Tokens;
  agent_usd: number | null;
  refsure_cost: DecisionCost;
  cost_run: number | null;
  cost_unit: 'usd' | 'tokens only';
  tools: ToolUse;
  denied_calls: number;
  peeked: boolean;
  peek_commands: string[];
  click_lines: number;
  click_defect: string | null;
  score: RunScore;
}

export function agentRowKey(k: { set: string; fixture: string; agent: string; arm: string; repeat: string; kind: RunKind }): string {
  return createHash('sha256').update(['P8', k.kind, k.set, k.fixture, k.agent, k.arm, k.repeat].join('\0')).digest('hex');
}

/** Model names compare without a context-size suffix such as `[1m]`. */
export function sameModel(seen: string, pinned: string): boolean {
  const strip = (m: string) => m.replace(/\[[^\]]*\]$/, '').trim();
  return strip(seen) === strip(pinned);
}

export interface AssembleContext {
  config: AgentsConfig;
  prices: CodexPrices | null;
  /** cli_both's egress log (`<xdgState>/refsure/egress.log`). */
  egressLog: string;
  /** Path fragments that flag `peeked` (bench dir, probe dir, fixtures dir, fixture server origin). */
  peekFragments: string[];
}

/** Every 6.5 measure and score of one run, from the files its facts name. Reads only; writes nothing. */
export function assembleRow(facts: AgentRunFacts, fixture: Fixture, ctx: AssembleContext): AgentRow {
  const t = facts.agent === 'claude' ? readClaude(facts.transcript) : readCodex(facts.transcript, facts.last_message);
  const slice = readSlice(facts.clicks.path, facts.run_id, facts.clicks.start, facts.clicks.end);
  const shim = readShimLog(facts.shim_log);
  const tools = toolUse(shim);
  const refsureCost = decisionCost(ctx.egressLog, facts.t_start_epoch, facts.t_end_epoch);
  const score = scoreRun(fixture, slice.lines, t.reply, facts.timeout);
  const modelOk = t.models.length === 0 ? null : t.models.every((m) => sameModel(m, facts.pins.model));
  const peekCommands = peeks(t.commands, ctx.peekFragments);
  const agentUsd = facts.agent === 'claude' ? t.total_cost_usd : codexUsd(t.tokens, ctx.prices);
  const bypass = shimBypass(t.commands, shim, facts.arm === 'rs' ? ['orca', 'refsure'] : ['orca'], join(facts.dir, 'bin'));
  const voids: string[] = [];
  if (slice.defect !== null) voids.push(`harness: ${slice.defect}`);
  if (bypass !== null) voids.push(`shim_bypass: ${bypass}`);
  if (modelOk === false) voids.push(`model: ${t.models.join(',')} is not ${facts.pins.model}`);
  if (facts.agent === 'claude' && t.version !== null && t.version !== facts.pins.version) voids.push(`version: ${t.version} is not ${facts.pins.version}`);
  if (facts.secret_files.length > 0) voids.push(`secret: ${facts.secret_files.length} file(s) hold a credential value`);
  return {
    ...facts,
    void: voids.length > 0 ? voids.join('; ') : null,
    models_seen: t.models,
    model_ok: modelOk,
    version_seen: t.version,
    skills_seen: t.skills,
    result_subtype: t.result_subtype,
    capped: t.result_subtype === 'error_max_budget_usd' || t.result_subtype === 'error_max_turns',
    budget_stop: t.result_subtype === 'error_max_budget_usd',
    reply: t.reply,
    duration_ms: t.duration_ms,
    duration_api_ms: t.duration_api_ms,
    num_turns: t.num_turns,
    tokens: t.tokens,
    agent_usd: agentUsd,
    refsure_cost: refsureCost,
    cost_run: agentUsd === null ? null : agentUsd + refsureCost.usd,
    cost_unit: agentUsd === null ? 'tokens only' : 'usd',
    tools,
    denied_calls: t.denied,
    peeked: peekCommands.length > 0,
    peek_commands: peekCommands,
    click_lines: slice.lines.length,
    click_defect: slice.defect,
    score,
  };
}

/** The assemble context of a config: cli_both's egress log, Codex prices and the `peeked` fragments. */
export function assembleContext(config: AgentsConfig): AssembleContext {
  const benchDir = join(repoRoot(), 'tools', 'bench');
  return {
    config,
    prices: readCodexPrices(config),
    egressLog: join(config.refsure.xdgState, 'refsure', 'egress.log'),
    peekFragments: [benchDir, 'tools/bench', join(benchDir, 'fixtures'), new URL(config.fixtureBase).host, ...config.peekPaths],
  };
}
