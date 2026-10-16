import { randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { flags, need, num, opt } from '../calibrate/lib/args';
import { repoRoot } from './lib/freeze';
import { helpExit } from './lib/help';

/*
  The end-to-end fixture server (protocol 6.1). Serves only `tools/bench/fixtures/pages/` (the frozen site2 copies,
  the N12 pages, `clicklog.js` and `bench-events.js`) on 127.0.0.1; scoring metadata stays outside that root. The
  contract of the probe server it replaces: static GET/HEAD, `/status/500`, `/status/429`, `POST /log`. Added:
  `POST /__run` (body = the run id; empty clears it) sets the current run, and every log line is written as
  `<ISO ts> {"run":"<id>",...the beacon's own fields}` into `--log`. Lines are appended synchronously, so once
  `/__run` has answered, every earlier line is on disk and the harness's byte offsets bracket a run exactly.

  `/__run` is for the harness only: it needs the control token the server writes to `<log>.ctl` (mode 0600) in the
  `x-bench-control` header, and it refuses any request a browser marks (`Origin`, `Referer`, `Sec-Fetch-Site`/`-Dest`), so no fixture
  page can change the run id.

    fixture-server --log <results>/e2e/clicks.log [--port 8767] [--root <pages dir>]
*/

const USAGE = 'usage: fixture-server --log <clicks.log> [--port 8767] [--root <pages dir>]';
helpExit(USAGE);
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const MAX_BODY = 64 * 1024;
const RUN_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const values = flags(process.argv.slice(2), ['log', 'port', 'root'], USAGE);
const logPath = resolve(need(values, 'log', USAGE));
const port = num(values, 'port', 8767, USAGE, { min: 1, max: 65535, integer: true });
const root = resolve(opt(values, 'root') ?? join(repoRoot(), 'tools', 'bench', 'fixtures', 'pages'));
const ctlPath = `${logPath}.ctl`;
const token = randomBytes(24).toString('hex');
let run: string | null = null;

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => done(size > MAX_BODY ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => done(null));
  });
}

/** One log line: the beacon's JSON object with `run` first; anything else is kept as `raw`, cut to 2,000 chars. */
function logLine(body: string): string {
  let fields: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    fields = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : { raw: body.slice(0, 2000) };
  } catch {
    fields = { raw: body.slice(0, 2000) };
  }
  const { run: _ignored, ...rest } = fields;
  return `${new Date().toISOString()} ${JSON.stringify({ run, ...rest }).replace(/[\r\n\u2028\u2029]/g, ' ')}\n`;
}

/** A browser marks its requests (Origin, Referer, Sec-Fetch-Site/Dest); a harness on Node sends none of these. */
function fromBrowser(req: IncomingMessage): boolean {
  return ['origin', 'referer', 'sec-fetch-site', 'sec-fetch-dest'].some((name) => req.headers[name] !== undefined);
}

function send(res: ServerResponse, status: number, type: string, body?: string | Buffer): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function setRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  if (!loopback || fromBrowser(req) || req.headers['x-bench-control'] !== token) {
    send(res, 403, 'text/plain; charset=utf-8', 'forbidden');
    return;
  }
  const body = (await readBody(req))?.trim() ?? null;
  if (body === null || (body !== '' && !RUN_ID.test(body))) {
    send(res, 400, 'text/plain; charset=utf-8', 'run id: 1-128 of [A-Za-z0-9._:-], or empty to clear');
    return;
  }
  run = body === '' ? null : body;
  const offset = statSync(logPath, { throwIfNoEntry: false })?.size ?? 0;
  send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ run, offset }));
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    send(res, 400, 'text/plain; charset=utf-8', 'bad path');
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = join(root, normalize(rel));
  if (!file.startsWith(root + sep) || rel.split('/').some((part) => part.startsWith('.'))) {
    send(res, 403, 'text/plain; charset=utf-8', 'forbidden');
    return;
  }
  let data: Buffer;
  try {
    data = readFileSync(file);
  } catch {
    send(res, 404, 'text/plain; charset=utf-8', 'not found');
    return;
  }
  send(res, 200, TYPES[extname(file)] ?? 'application/octet-stream', req.method === 'HEAD' ? undefined : data);
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  if (req.method === 'POST' && pathname === '/log') {
    void readBody(req).then((body) => {
      if (body !== null) appendFileSync(logPath, logLine(body));
      send(res, body === null ? 413 : 204, 'text/plain; charset=utf-8');
    });
    return;
  }
  if (req.method === 'POST' && pathname === '/__run') {
    void setRun(req, res);
    return;
  }
  if (req.method === 'GET' && pathname === '/status/500') {
    send(res, 500, 'text/html; charset=utf-8',
      '<!doctype html><meta charset="utf-8"><title>500</title><h1>Internal Server Error</h1><p>The server failed.</p>');
    return;
  }
  if (req.method === 'GET' && pathname === '/status/429') {
    send(res, 429, 'text/plain; charset=utf-8', 'Too Many Requests - rate limit exceeded, try again later');
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, pathname);
    return;
  }
  send(res, 405, 'text/plain; charset=utf-8', 'method not allowed');
});

mkdirSync(dirname(logPath), { recursive: true });
appendFileSync(logPath, '');
writeFileSync(ctlPath, `${token}\n`, { mode: 0o600 });
chmodSync(ctlPath, 0o600);
const stop = (): void => {
  rmSync(ctlPath, { force: true });
  server.close(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('error', (error) => {
  rmSync(ctlPath, { force: true });
  process.stderr.write(`fixture-server: ${error.message}\n`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`${JSON.stringify({ listening: `http://127.0.0.1:${port}`, root, log: logPath, control: ctlPath })}\n`);
});
