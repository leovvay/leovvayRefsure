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

/**
 * The child never sees refsure's own settings, nor agent-browser's launch and output settings (a profile, a CDP
 * target, auto-connect, a session, output limits). refsure only drives a session the user already opened, so it
 * needs none of them, and a browser launched by accident must never open a real profile.
 */
export function stripChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || key.startsWith('REFSURE_')) continue;
    if (key.startsWith('AGENT_BROWSER_') && !KEPT.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Runs `agent-browser --json <args>` and reads stdout as JSON whatever the exit code, because agent-browser prints
 * its error there and exits 1. Throws a `BrowserError` only when no reply could be read.
 */
export function runAgentBrowser(bin: string | null, args: readonly string[], opts: AbRunOptions): Promise<AbReply> {
  if (!bin) return Promise.reject(new BrowserError('backend_error', NO_BINARY));
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      ['--json', ...args],
      { env: opts.env, timeout: opts.timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8', windowsHide: true },
      (error, stdout, stderr) => {
        const reply = readReply(stdout);
        if (reply) resolve(reply);
        else reject(failure(verbOf(args), opts.timeoutMs, error, stderr || stdout));
      },
    );
    child.once('spawn', () => opts.onSpawn?.());
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

function readReply(stdout: string): AbReply | null {
  const text = stdout.trim();
  // Tolerate a stray warning line printed before the JSON.
  const start = text.startsWith('{') ? 0 : text.indexOf('\n{') + 1;
  if (start === 0 && !text.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.success !== 'boolean') return null;
  if (parsed.success) return { ok: true, result: parsed.data ?? null };
  const error = parsed.error;
  if (typeof error === 'string') return { ok: false, message: error };
  return { ok: false, message: isRecord(error) && typeof error.message === 'string' ? error.message : '' };
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
