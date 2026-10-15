import { execFile, execFileSync, type ExecFileException } from 'node:child_process';
import { boundDetail } from '../bound-detail';
import { BrowserError } from '../browser-error';
import { isRecord } from '../is-record';
import type { AbReply } from './ab-reply';
import type { AbRunOptions } from './ab-run-options';

export const READ_TIMEOUT_MS = 15_000;
export const ACT_TIMEOUT_MS = 30_000;
const HELP_TIMEOUT_MS = 5_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const SPAWN_FAILURES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOEXEC']);
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
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || key.startsWith('REFSURE_') || PROXY.test(key)) continue;
    if (key.startsWith('AGENT_BROWSER_') && !KEPT.has(key)) continue;
    out[key] = value;
  }
  out.AGENT_BROWSER_IDLE_TIMEOUT_MS = STRAY_DAEMON_IDLE_MS;
  return out;
}

/**
 * Runs `agent-browser --json --config <empty> <args>` and reads stdout as JSON whatever the exit code, because
 * agent-browser prints its error there and exits 1. Throws a `BrowserError` only when no reply could be read.
 */
export function runAgentBrowser(bin: string | null, args: readonly string[], opts: AbRunOptions): Promise<AbReply> {
  return runJson(bin, args, opts, readReply);
}

/**
 * `batch` with the commands as a JSON array of argv arrays on stdin: one client, one daemon, run in order, each
 * whatever the one before answered. One reply per command; a single failed reply when the client failed first.
 */
export function runAgentBrowserBatch(
  bin: string | null, args: readonly string[], commands: readonly (readonly string[])[], opts: AbRunOptions,
): Promise<AbReply[]> {
  return runJson(bin, [...args, 'batch'], { ...opts, input: JSON.stringify(commands) }, readBatch);
}

function runJson<T>(
  bin: string | null, args: readonly string[], opts: AbRunOptions, read: (stdout: string) => T | null,
): Promise<T> {
  if (!bin) return Promise.reject(new BrowserError('backend_error', NO_BINARY));
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      ['--json', '--config', opts.config, ...args],
      { env: opts.env, timeout: opts.timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8', windowsHide: true },
      (error, stdout, stderr) => {
        const reply = read(stdout);
        if (reply !== null) resolve(reply);
        else reject(failure(verbOf(args), opts.timeoutMs, error, stderr || stdout));
      },
    );
    child.once('spawn', () => opts.onSpawn?.());
    // A closed pipe is the child's to report; the reply above says what happened.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(opts.input ?? '');
  });
}

/** Plain text output (`--version`), for the probe. */
export function runAgentBrowserText(bin: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = { env, timeout: READ_TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: 'utf8' as const };
    execFile(bin, [...args], options, (error, stdout, stderr) => {
      if (error) reject(failure(verbOf(args), READ_TIMEOUT_MS, error, stderr || stdout));
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

// Tolerate a stray warning line printed before the JSON.
function parseJson(stdout: string, open: '{' | '['): unknown {
  const text = stdout.trim();
  const start = text.startsWith(open) ? 0 : text.indexOf(`\n${open}`) + 1;
  if (start === 0 && !text.startsWith(open)) return undefined;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return undefined;
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
  return asReply(parseJson(stdout, '{'), 'data');
}

// A client that fails before the batch runs (a bad flag, no daemon) answers with one plain reply.
function readBatch(stdout: string): AbReply[] | null {
  const items = parseJson(stdout, '[');
  if (!Array.isArray(items)) {
    const single = readReply(stdout);
    return single && !single.ok ? [single] : null;
  }
  const replies = items.map((item) => asReply(item, 'result'));
  return replies.every((reply): reply is AbReply => reply !== null) ? replies : null;
}

function failure(verb: string, timeoutMs: number, error: ExecFileException | null, output: string): BrowserError {
  if (error && typeof error.code === 'string' && SPAWN_FAILURES.has(error.code)) {
    return new BrowserError('backend_error', `could not start agent-browser: ${error.code}`);
  }
  if (error?.killed && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return new BrowserError('timeout', `agent-browser ${verb} gave no answer within ${Math.round(timeoutMs / 1000)} s`);
  }
  // Never error.message: it repeats the argv, and a fill value may be a secret.
  const why = typeof error?.code === 'number' ? `exit ${error.code}` : String(error?.signal ?? error?.code ?? 'exit 0');
  return new BrowserError('backend_error', boundDetail(`agent-browser ${verb} gave no JSON reply (${why}): ${output}`));
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
