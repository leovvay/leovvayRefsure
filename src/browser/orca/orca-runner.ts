import { BrowserError } from '../browser-error';
import { isRecord } from '../../shared';
import { type JsonChild, parseJsonFrom, spawnJson } from '../run-json';
import { NO_ORCA_BINARY } from './orca-binary';
import type { OrcaReply } from './orca-reply';
import type { OrcaRunOptions } from './orca-run-options';

const ORCA: JsonChild = { label: 'orca', spawnCode: 'orca_not_running' };

/**
 * Runs `orca <args> --json` and reads stdout as JSON whatever the exit code, because Orca prints its typed error
 * there and exits 1. Throws a `BrowserError` only when no reply could be read.
 */
export function runOrca(bin: string | null, args: readonly string[], opts: OrcaRunOptions): Promise<OrcaReply> {
  if (!bin) return Promise.reject(new BrowserError('orca_not_running', NO_ORCA_BINARY));
  return spawnJson(ORCA, bin, [...args, '--json'], {
    env: opts.env,
    timeoutMs: opts.timeoutMs,
    verb: verbOf(args),
    onSpawn: opts.onSpawn,
    withholdOutput: args.some((arg) => arg.startsWith('--value=')),
  }, readReply);
}

function readReply(stdout: string): OrcaReply | null {
  const parsed = parseJsonFrom(stdout, '{');
  if (!isRecord(parsed) || typeof parsed.ok !== 'boolean') return null;
  if (parsed.ok) return { ok: true, result: parsed.result ?? null };
  const error = isRecord(parsed.error) ? parsed.error : {};
  return {
    ok: false,
    code: typeof error.code === 'string' ? error.code : 'unknown',
    message: typeof error.message === 'string' ? error.message : '',
  };
}

function verbOf(args: readonly string[]): string {
  return args.filter((arg) => !arg.startsWith('--')).join(' ') || '?';
}
