import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { AgentId, AgentsConfig } from './config';
import type { RunDir } from './run-dir';

/*
  One agent process, exactly as 6.5 fixes it: an `env -i` environment (HOME, PATH, TMPDIR, USER, LANG,
  DISABLE_AUTOUPDATER, the broker port and run token, the agent's own credential), cwd `R/work`, a 600 s wall limit
  (SIGTERM to the process group, SIGKILL 10 s later). Stdout is the transcript (`out/transcript.jsonl`).
*/

export const WALL_MS = 600_000;
export const KILL_GRACE_MS = 10_000;

const CLAUDE_ALLOWED = [
  'Bash(orca *)', 'Bash(refsure *)', 'Bash(sleep *)', 'Bash(grep *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(jq *)',
  'Bash(wc *)', 'Skill(orca-cli)', 'Skill(refsure)',
];

export interface AgentCommand { cmd: string; args: string[]; env: Record<string, string> }

export function agentEnv(config: AgentsConfig, agent: AgentId, dir: RunDir, broker: { port: number; token: string }): Record<string, string> {
  const env: Record<string, string> = {
    HOME: dir.home,
    PATH: `${dir.bin}:/usr/bin:/bin`,
    TMPDIR: dir.tmp,
    USER: process.env.USER ?? 'bench',
    LANG: 'en_US.UTF-8',
    DISABLE_AUTOUPDATER: '1',
    REFSURE_BENCH_BROKER: String(broker.port),
    REFSURE_BENCH_BROKER_TOKEN: broker.token,
  };
  if (agent === 'claude') {
    const value = process.env[config.claude.credential.from];
    if (value === undefined || value === '') throw new Error(`the agent credential (${config.claude.credential.from}) is not in the harness environment`);
    env[config.claude.credential.as] = value;
  } else {
    env.CODEX_HOME = config.codex.home;
  }
  return env;
}

export function agentCommand(config: AgentsConfig, agent: AgentId, dir: RunDir, prompt: string, env: Record<string, string>): AgentCommand {
  if (agent === 'claude') {
    const c = config.claude;
    return {
      cmd: c.bin,
      args: [
        '-p', prompt, '--model', c.model, '--effort', c.effort, '--setting-sources', 'project', '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence', '--tools', 'Bash,Skill',
        '--allowedTools', ...CLAUDE_ALLOWED, '--max-turns', String(c.maxTurns), '--max-budget-usd', String(c.maxBudgetUsd),
        '--output-format', 'stream-json', '--verbose',
      ],
      env,
    };
  }
  const c = config.codex;
  return {
    cmd: process.execPath,
    args: [
      join(c.dir, 'bin', 'codex.js'), 'exec', prompt, '--ephemeral', '--ignore-user-config', '--ignore-rules', '-C', dir.work,
      '-s', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true',
      // A4: a login shell runs macOS path_helper, which puts /usr/local/bin (the real orca) before R/bin.
      '-c', 'allow_login_shell=false', '-m', c.model,
      '-c', `model_reasoning_effort="${c.effort}"`, '--json', '-o', join(dir.out, 'last.txt'),
    ],
    env,
  };
}

export interface AgentExit {
  T_agent_ms: number;
  t_start_epoch: number;
  t_end_epoch: number;
  exit_code: number | null;
  signal: string | null;
  timeout: boolean;
}

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // the group is gone
  }
}

/** Spawns the agent in its own process group and waits for its exit under the wall limit. */
export function runAgent(command: AgentCommand, dir: RunDir, transcript: string, stderr: string, wallMs = WALL_MS): Promise<AgentExit> {
  const out = openSync(transcript, 'a', 0o600);
  const err = openSync(stderr, 'a', 0o600);
  return new Promise((resolve, reject) => {
    const tStartEpoch = Date.now();
    const t0 = performance.now();
    const child = spawn(command.cmd, command.args, { cwd: dir.work, env: command.env, stdio: ['ignore', out, err], detached: true });
    let timeout = false;
    let kill: NodeJS.Timeout | undefined;
    const wall = setTimeout(() => {
      timeout = true;
      if (child.pid !== undefined) killGroup(child.pid, 'SIGTERM');
      kill = setTimeout(() => child.pid !== undefined && killGroup(child.pid, 'SIGKILL'), KILL_GRACE_MS);
    }, wallMs);
    const done = () => {
      clearTimeout(wall);
      if (kill !== undefined) clearTimeout(kill);
      closeSync(out);
      closeSync(err);
    };
    child.on('error', (error) => {
      done();
      reject(error);
    });
    child.on('exit', (code, signal) => {
      const T = performance.now() - t0;
      const tEnd = Date.now();
      done();
      // Anything the agent left running in its group goes with it.
      if (child.pid !== undefined) killGroup(child.pid, 'SIGKILL');
      resolve({ T_agent_ms: Math.round(T * 1000) / 1000, t_start_epoch: tStartEpoch, t_end_epoch: tEnd, exit_code: code, signal, timeout });
    });
  });
}
