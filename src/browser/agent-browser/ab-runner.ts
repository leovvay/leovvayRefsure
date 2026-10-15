import { execFile, execFileSync } from 'node:child_process';
import { BrowserError } from '../browser-error';
import { isRecord } from '../is-record';
import {
  childFailure, type JsonChild, MAX_BUFFER, parseJsonFrom, READ_TIMEOUT_MS, spawnJson, stripRefsureEnv,
} from '../run-json';
import type { AbReply } from './ab-reply';
import type { AbRunOptions } from './ab-run-options';

const HELP_TIMEOUT_MS = 5_000;
const AGENT_BROWSER: JsonChild = { label: 'agent-browser', spawnCode: 'backend_error' };
export const NO_BINARY = 'no agent-browser binary on PATH or in /Applications/Orca.app';
/** The one agent-browser setting a child keeps: where the user's session sockets live. */
const KEPT: ReadonlySet<string> = new Set(['AGENT_BROWSER_SOCKET_DIR']);
// agent-browser reads these as its --proxy and --proxy-bypass when no AGENT_BROWSER_PROXY is set.
const PROXY = /^(http|https|all|no)_proxy$/i;
/**
 * How long a daemon the child starts may sit idle before it exits, with any browser it launched. refsure never
 * means to start one; a session closed between refsure's check and its call can still make the client start a
 * daemon, and this ends it. A daemon that already runs keeps its own setting (probed live).
 */
const STRAY_DAEMON_IDLE_MS = '500';

/**
 * The child never sees refsure's own settings, nor agent-browser's launch settings (a profile, a CDP target,
 * auto-connect, headed, a proxy, an executable). agent-browser sends launch settings with every command, and a
 * daemon whose session was launched with other values relaunches its browser to match (probed live: a proxy
 * variable or a profile relaunched a live session). Config files are kept out by `--config` (see ab-empty-config).
 */
export function stripChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = stripRefsureEnv(env);
  for (const key of Object.keys(out)) {
    if (PROXY.test(key) || (key.startsWith('AGENT_BROWSER_') && !KEPT.has(key))) delete out[key];
  }
  out.AGENT_BROWSER_IDLE_TIMEOUT_MS = STRAY_DAEMON_IDLE_MS;
  return out;
}

/**
 * Runs `agent-browser --json --config <empty> <args>` and reads stdout as JSON whatever the exit code, because
 * agent-browser prints its error there and exits 1. Throws a `BrowserError` only when no reply could be read.
 */
export function runAgentBrowser(bin: string | null, args: readonly string[], opts: AbRunOptions): Promise<AbReply> {
  return runJson(bin, args, opts, readReply, carriesValue(args));
}

/**
 * `batch` with the commands as a JSON array of argv arrays on stdin: one client, one daemon, run in order, each
 * whatever the one before answered. One reply per command; a single failed reply when the client failed first.
 */
export function runAgentBrowserBatch(
  bin: string | null, args: readonly string[], commands: readonly (readonly string[])[], opts: AbRunOptions,
): Promise<AbReply[]> {
  const input = JSON.stringify(commands);
  return runJson(bin, [...args, 'batch'], { ...opts, input }, readBatch, commands.some(carriesValue));
}

function runJson<T>(
  bin: string | null, args: readonly string[], opts: AbRunOptions, read: (stdout: string) => T | null,
  withholdOutput: boolean,
): Promise<T> {
  if (!bin) return Promise.reject(new BrowserError('backend_error', NO_BINARY));
  return spawnJson(AGENT_BROWSER, bin, ['--json', '--config', opts.config, ...args], {
    env: opts.env, timeoutMs: opts.timeoutMs, verb: verbOf(args), onSpawn: opts.onSpawn, input: opts.input ?? '',
    withholdOutput,
  }, read);
}

/** Plain text output (`--version`), for the probe. */
export function runAgentBrowserText(bin: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = { env, timeout: READ_TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: 'utf8' as const };
    execFile(bin, [...args], options, (error, stdout, stderr) => {
      if (error) reject(childFailure(AGENT_BROWSER, verbOf(args), READ_TIMEOUT_MS, error, stderr || stdout));
      else resolve(stdout);
    });
  });
}

/** `agent-browser --help`, read synchronously because `features()` is; null when it cannot be read. */
export function helpTextSync(bin: string, env: NodeJS.ProcessEnv): string | null {
  try {
    return execFileSync(bin, ['--help'], {
      env, timeout: HELP_TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

// A command answers `{success, data, error}`; a batch item answers `{success, result, error}`.
function asReply(value: unknown, field: 'data' | 'result'): AbReply | null {
  if (!isRecord(value) || typeof value.success !== 'boolean') return null;
  if (value.success) return { ok: true, result: value[field] ?? null };
  const error = value.error;
  if (typeof error === 'string') return { ok: false, message: error };
  return { ok: false, message: isRecord(error) && typeof error.message === 'string' ? error.message : '' };
}

function readReply(stdout: string): AbReply | null {
  return asReply(parseJsonFrom(stdout, '{'), 'data');
}

// A client that fails before the batch runs (a bad flag, no daemon) answers with one plain reply.
function readBatch(stdout: string): AbReply[] | null {
  const items = parseJsonFrom(stdout, '[');
  if (!Array.isArray(items)) {
    const single = readReply(stdout);
    return single && !single.ok ? [single] : null;
  }
  const replies = items.map((item) => asReply(item, 'result'));
  return replies.every((reply): reply is AbReply => reply !== null) ? replies : null;
}

/** The verb words, for messages: never a value, which follows a ref, nor the session name. */
function verbOf(args: readonly string[]): string {
  const words: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--session') i += 1;
    else if (arg.startsWith('@') || arg.startsWith('-')) break;
    else words.push(arg);
  }
  return words.slice(0, 2).join(' ') || '?';
}

/** A command that sends a value, which follows a ref (`fill @e7 <value>`); its output may echo the value. */
function carriesValue(command: readonly string[]): boolean {
  const at = command.findIndex((word) => word.startsWith('@'));
  return at >= 0 && at < command.length - 1;
}
