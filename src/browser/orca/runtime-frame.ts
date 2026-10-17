import { isRecord } from '../../shared';
import type { OrcaReply } from './orca-reply';

/** What the runtime said, in the reply the CLI would print for it; `keepalive` is a frame to skip. */
export type RuntimeFrame = OrcaReply | 'keepalive';

const INVALID: OrcaReply = {
  ok: false, code: 'invalid_runtime_response', message: 'The Orca runtime returned an invalid response frame.',
};

/**
 * One newline-delimited frame, checked as the CLI's `sendRequest` checks it: valid JSON in the envelope shape, the
 * request's own id, and the runtime the metadata named. A failure frame becomes the reply the CLI prints for it,
 * `{ok:false, error:{code, message}}`, so `orcaError` reads both transports alike.
 */
export function readFrame(line: string, requestId: string, runtimeId: string | null): RuntimeFrame {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return INVALID;
  }
  if (isRecord(raw) && raw._keepalive === true) return 'keepalive';
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.ok !== 'boolean') return INVALID;
  const meta = isRecord(raw._meta) ? raw._meta : null;
  const error = isRecord(raw.error) ? raw.error : {};
  const failure = typeof error.code === 'string' && typeof error.message === 'string'
    ? { ok: false as const, code: error.code, message: error.message }
    : null;
  if (raw.ok ? typeof meta?.runtimeId !== 'string' : failure === null) return INVALID;
  if (raw.id !== requestId) {
    const message = 'The Orca runtime returned a mismatched response id.';
    return { ok: false, code: 'invalid_runtime_response', message };
  }
  if (typeof meta?.runtimeId === 'string' && meta.runtimeId !== '' && meta.runtimeId !== runtimeId) {
    return {
      ok: false, code: 'runtime_unavailable',
      message: 'The Orca runtime changed while the request was in flight. Retry the command.',
    };
  }
  return raw.ok ? { ok: true, result: raw.result ?? null } : (failure ?? INVALID);
}
