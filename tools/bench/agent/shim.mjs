#!/usr/bin/env node
// PATH shim of the agent level (6.5): copied into a run's `bin/` as `orca` and, in the rs arm, `refsure`. It runs
// nothing itself. It sends its own name, argv and stdin to the broker on the loopback port named by
// REFSURE_BENCH_BROKER, with the run token REFSURE_BENCH_BROKER_TOKEN, and replays the reply's stdout, stderr and
// exit code. The broker holds every credential and the allowlist; this file holds neither.
import { fstatSync, readSync } from 'node:fs';
import { connect } from 'node:net';
import { basename } from 'node:path';

const MAX_STDIN = 1024 * 1024;

function fail(message, code) {
  process.stderr.write(`${basename(process.argv[1] ?? 'shim')}: ${message}\n`);
  process.exit(code);
}

/*
  No allowed command reads stdin, so the shim never waits for it: it takes a regular file whole, and from a pipe only
  the bytes already in it (macOS reports them as the pipe's st_size). An open, empty pipe, as an agent's tool may
  leave, costs nothing.
*/
function readStdin() {
  let st;
  try {
    st = fstatSync(0);
  } catch {
    return Buffer.alloc(0);
  }
  if (!st.isFile() && !(st.isFIFO() && st.size > 0)) return Buffer.alloc(0);
  if (st.size > MAX_STDIN) fail('stdin is larger than 1 MB', 2);
  const buffer = Buffer.alloc(st.size);
  let read = 0;
  try {
    while (read < buffer.length) {
      const n = readSync(0, buffer, read, buffer.length - read, null);
      if (n === 0) break;
      read += n;
    }
  } catch {
    // EAGAIN on a non-blocking pipe: what was read stands
  }
  return buffer.subarray(0, read);
}

const port = Number(process.env.REFSURE_BENCH_BROKER);
const token = process.env.REFSURE_BENCH_BROKER_TOKEN ?? '';
if (!Number.isInteger(port) || port <= 0 || port > 65535) fail('REFSURE_BENCH_BROKER is not a port', 126);

const stdin = readStdin();
const request = JSON.stringify({ token, tool: basename(process.argv[1] ?? ''), argv: process.argv.slice(2), stdin: stdin.toString('base64') });

const socket = connect({ host: '127.0.0.1', port });
const parts = [];
socket.on('connect', () => socket.end(`${request}\n`));
socket.on('data', (chunk) => parts.push(chunk));
socket.on('error', (error) => fail(`broker unreachable (${error.code ?? error.message})`, 126));
socket.on('close', () => {
  let reply;
  try {
    reply = JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    fail('no reply from the broker', 126);
  }
  const write = (stream, b64) => new Promise((resolve) => {
    if (!b64) return resolve();
    stream.write(Buffer.from(b64, 'base64'), () => resolve());
  });
  Promise.all([write(process.stdout, reply.stdout), write(process.stderr, reply.stderr)])
    .then(() => process.exit(Number.isInteger(reply.exit) ? reply.exit : 1));
});
