import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { BrowserError } from '../browser-error';
import type { BrowserErrorCode } from '../browser-error-code';
import { MAX_BUFFER } from '../run-json';
import type { OrcaReply } from './orca-reply';
import type { RpcRequest } from './rpc-request';
import type { RuntimeCallOptions } from './runtime-call-options';
import type { RuntimeEndpoint } from './runtime-endpoint';
import { readFrame } from './runtime-frame';

// What the CLI prints when the socket fails once the request is out; the call may have reached the page.
const DROPPED = 'Could not connect to the running Orca app. Restart Orca and try again.';
const CLOSED = 'The Orca runtime closed the connection before responding. Restart Orca and try again.';

/**
 * One request on its own connection, the wire the `orca` CLI uses: `{id, authToken, method, params}` and a newline,
 * then newline-delimited frames until one answers that id. Keepalive frames are skipped, and the deadline is the
 * caller's whole budget, as the CLI path's process timeout is.
 *
 * Resolves null when the connection failed before the request was written, so nothing was sent and the CLI can run
 * it. After the write, a failure is the reply the CLI would print for it. Rejects a `BrowserError` on the deadline,
 * or on a reply larger than the CLI path would read. No message carries the token or a param.
 */
export function callRuntime(
  endpoint: RuntimeEndpoint, request: RpcRequest, opts: RuntimeCallOptions,
): Promise<OrcaReply | null> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const socket = createConnection(endpoint.socketPath);
    let written = false;
    let settled = false;
    let pending = '';
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      finish();
    };
    const fail = (code: string, message: string): void => {
      settle(() => resolve(written ? { ok: false, code, message } : null));
    };
    const refuse = (code: BrowserErrorCode, detail: string): void => {
      settle(() => reject(new BrowserError(code, detail)));
    };
    const seconds = Math.round(opts.timeoutMs / 1000);
    const late = `orca ${opts.verb} gave no answer within ${seconds} s`;
    const timer = setTimeout(() => refuse('timeout', late), opts.timeoutMs);

    socket.setEncoding('utf8');
    socket.once('error', () => fail('runtime_unavailable', DROPPED));
    socket.once('close', () => fail('runtime_unavailable', CLOSED));
    socket.on('data', (chunk: string) => {
      // Only the new chunk can hold the first newline: a large reply is not rescanned on every chunk.
      let newline = chunk.includes('\n') ? pending.length + chunk.indexOf('\n') : -1;
      pending += chunk;
      while (newline !== -1 && !settled) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
        if (line.trim() === '') continue;
        const frame = readFrame(line, id, endpoint.runtimeId);
        if (frame !== 'keepalive') settle(() => resolve(frame));
      }
      if (!settled && pending.length > MAX_BUFFER) {
        refuse('backend_error', `orca ${opts.verb}: the runtime reply exceeded ${MAX_BUFFER} bytes`);
      }
    });
    socket.once('connect', () => {
      const { method, params } = request;
      socket.write(`${JSON.stringify({ id, authToken: endpoint.authToken, method, params })}\n`);
      written = true;
      opts.onWritten?.();
    });
  });
}
