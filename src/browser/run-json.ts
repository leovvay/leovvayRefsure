import { execFile, type ExecFileException } from 'node:child_process';
import { boundDetail } from './bound-detail';
import { BrowserError } from './browser-error';
import type { JsonChild, SpawnJsonOptions } from './json-child';

// The child-process side both backends share: each spawns its own CLI with `--json` and reads its own reply shape.
export const READ_TIMEOUT_MS = 15_000;
export const ACT_TIMEOUT_MS = 30_000;
export const MAX_BUFFER = 64 * 1024 * 1024;
const SPAWN_FAILURES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOEXEC']);

/** The child never sees refsure's own settings, e.g. a page id meant for refsure alone. */
export function stripRefsureEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !key.startsWith('REFSURE_')) out[key] = value;
  }
  return out;
}

/**
 * Runs `bin argv` and reads stdout with `read` whatever the exit code, because both CLIs print their error there
 * and exit 1. Rejects with a `BrowserError` only when no reply could be read.
 */
export function spawnJson<T>(
  child: JsonChild, bin: string, argv: readonly string[], opts: SpawnJsonOptions, read: (stdout: string) => T | null,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      bin,
      [...argv],
      { env: opts.env, timeout: opts.timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8', windowsHide: true },
      (error, stdout, stderr) => {
        const reply = read(stdout);
        if (reply !== null) resolve(reply);
        else reject(childFailure(child, opts.verb, opts.timeoutMs, error, opts.withholdOutput ? null : stderr || stdout));
      },
    );
    proc.once('spawn', () => opts.onSpawn?.());
    if (opts.input === undefined) return;
    // A closed pipe is the child's to report; the reply above says what happened.
    proc.stdin?.on('error', () => undefined);
    proc.stdin?.end(opts.input);
  });
}

/** The JSON on stdout, tolerating a stray warning line printed before it; undefined when there is none. */
export function parseJsonFrom(stdout: string, open: '{' | '['): unknown {
  const text = stdout.trim();
  const start = text.startsWith(open) ? 0 : text.indexOf(`\n${open}`) + 1;
  if (start === 0 && !text.startsWith(open)) return undefined;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return undefined;
  }
}

/** Why a call gave no reply. `output` is the child's stderr or stdout; null keeps it out. */
export function childFailure(
  child: JsonChild, verb: string, timeoutMs: number, error: ExecFileException | null, output: string | null,
): BrowserError {
  if (error && typeof error.code === 'string' && SPAWN_FAILURES.has(error.code)) {
    return new BrowserError(child.spawnCode, `could not start ${child.label}: ${error.code}`);
  }
  if (error?.killed && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return new BrowserError('timeout', `${child.label} ${verb} gave no answer within ${Math.round(timeoutMs / 1000)} s`);
  }
  // Never error.message: it repeats the argv, and a fill value may be a secret.
  const why = typeof error?.code === 'number' ? `exit ${error.code}` : String(error?.signal ?? error?.code ?? 'exit 0');
  const said = output === null ? '; its output is withheld, since the call carried a value' : `: ${output}`;
  return new BrowserError('backend_error', boundDetail(`${child.label} ${verb} gave no JSON reply (${why})${said}`));
}
