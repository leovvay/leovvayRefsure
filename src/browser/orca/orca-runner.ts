import { execFile, type ExecFileException } from 'node:child_process';
import { BrowserError } from '../browser-error';
import { isRecord } from '../is-record';
import { boundDetail } from './orca-error-map';
import type { OrcaReply } from './orca-reply';
import type { OrcaRunOptions } from './orca-run-options';

export const READ_TIMEOUT_MS = 15_000;
export const ACT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 64 * 1024 * 1024;
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
 * Runs `orca <args> --json` and reads stdout as JSON whatever the exit code, because Orca prints its typed error
 * there and exits 1. Throws a `BrowserError` only when no reply could be read.
 */
export function runOrca(bin: string | null, args: readonly string[], opts: OrcaRunOptions): Promise<OrcaReply> {
  if (!bin) {
    return Promise.reject(new BrowserError(
      'orca_not_running', 'no orca binary in $ORCA_CLI_BIN_DIR, on PATH, or in /Applications/Orca.app',
    ));
  }
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      [...args, '--json'],
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

function readReply(stdout: string): OrcaReply | null {
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
  if (!isRecord(parsed) || typeof parsed.ok !== 'boolean') return null;
  if (parsed.ok) return { ok: true, result: parsed.result ?? null };
  const error = isRecord(parsed.error) ? parsed.error : {};
  return {
    ok: false,
    code: typeof error.code === 'string' ? error.code : 'unknown',
    message: typeof error.message === 'string' ? error.message : '',
  };
}

function failure(verb: string, timeoutMs: number, error: ExecFileException | null, output: string): BrowserError {
  if (error && typeof error.code === 'string' && SPAWN_FAILURES.has(error.code)) {
    return new BrowserError('orca_not_running', `could not start orca: ${error.code}`);
  }
  if (error?.killed && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return new BrowserError('timeout', `orca ${verb} gave no answer within ${Math.round(timeoutMs / 1000)} s`);
  }
  // Never error.message: it repeats the argv, and a fill value may be a secret.
  const why = typeof error?.code === 'number' ? `exit ${error.code}` : String(error?.signal ?? error?.code ?? 'exit 0');
  return new BrowserError('backend_error', boundDetail(`orca ${verb} gave no JSON reply (${why}): ${output}`));
}

function verbOf(args: readonly string[]): string {
  return args.filter((arg) => !arg.startsWith('--')).join(' ') || '?';
}
