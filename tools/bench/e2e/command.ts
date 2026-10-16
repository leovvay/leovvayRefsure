import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { performance } from 'node:perf_hooks';
import type { Envelope } from '../../../src/output/envelope';
import { describeElement } from '../../../src/page-model';
import { scrubDetail } from '../lib/ask';

/*
  One `refsure` process, timed from spawn to exit on the harness's monotonic clock (`T_cli`, protocol 6.4: it
  includes the key wrapper's own cost), its stdout read as the envelope. The fixture server's run control lives
  here too: `/__run` with the token from `<log>.ctl`, answering the log's byte offset at that moment.
*/

export interface CommandResult {
  envelope: Envelope | null;
  exit: number | null;
  signal: string | null;
  t_cli: number;
  end_ms: number;
  /** stderr, cut to 2,000 chars and scrubbed of anything key-shaped. */
  stderr: string | null;
}

const STDOUT_MAX = 8 * 1024 * 1024;

export function runCommand(argv: readonly string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(argv[0]!, argv.slice(1), { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= STDOUT_MAX) out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const finish = (exit: number | null, signal: string | null): void => {
      clearTimeout(timer);
      const t_cli = performance.now() - started;
      let envelope: Envelope | null = null;
      try {
        const parsed = JSON.parse(Buffer.concat(out).toString('utf8')) as Envelope;
        envelope = parsed !== null && typeof parsed === 'object' && parsed.refsure === 1 ? parsed : null;
      } catch {
        envelope = null;
      }
      const stderr = Buffer.concat(err).toString('utf8').trim();
      resolve({ envelope, exit, signal, t_cli, end_ms: Date.now(), stderr: stderr === '' ? null : scrubDetail(stderr.slice(-2000)) });
    };
    child.on('error', () => finish(null, 'spawn_error'));
    child.on('close', (code, signal) => finish(code, signal));
  });
}

/**
 * The ref of the one snap line whose role and name are exactly these, or why there is none (zero or two matches
 * void the run as a fixture defect, 6.4). Snap lines are `<role> "<name>" in="<path>" #k/n @eN`.
 */
export function refFromSnap(env: Envelope | null, role: string, name: string): { ref: string } | { defect: string } {
  const lines = Array.isArray(env?.result?.lines) ? env!.result!.lines as unknown[] : [];
  const head = `${describeElement(role, name)} in=`;
  const hits = lines.filter((l): l is string => typeof l === 'string' && l.startsWith(head));
  if (hits.length !== 1) return { defect: `snap: ${hits.length} lines for ${describeElement(role, name)}` };
  const ref = / @(e\d+)$/.exec(hits[0]!)?.[1];
  return ref === undefined ? { defect: `snap: no ref on ${describeElement(role, name)}` } : { ref: `@${ref}` };
}

/** Sets (or, with '', clears) the fixture server's run id; returns the log's byte offset at that moment. */
export function setServerRun(origin: string, logPath: string, runId: string): Promise<number> {
  const token = readFileSync(`${logPath}.ctl`, 'utf8').trim();
  return new Promise((resolve, reject) => {
    const req = request(`${origin}/__run`, { method: 'POST', headers: { 'x-bench-control': token, 'content-type': 'text/plain' }, timeout: 10_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`fixture server /__run answered ${res.statusCode}`));
          return;
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { run: string | null; offset: number };
        if (body.run !== (runId === '' ? null : runId)) reject(new Error('fixture server did not take the run id'));
        else resolve(body.offset);
      });
    });
    req.on('timeout', () => req.destroy(new Error('fixture server /__run timed out')));
    req.on('error', reject);
    req.end(runId);
  });
}
