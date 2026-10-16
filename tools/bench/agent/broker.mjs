#!/usr/bin/env node
// Allowlisting broker of the agent level (6.5). Started by run-agents outside every agent sandbox, with refsure's
// key in ITS environment only (through the config's launcher, a secret-store runner). It listens on a loopback TCP
// port for shim requests, checks each against the allowlist and the current run's tab id, runs the real `orca` or
// `refsure` with the owner's HOME (refsure also with the cli_both XDG pair and the key under the name refsure reads)
// and returns stdout, stderr and the exit code. A refusal is exit 126 with a one-line reason. Every request is
// logged to the run's `out/shim.jsonl` as {t0, t1, argv, exit, refused, ...}. The key never reaches a reply, a log
// line or an agent's process tree.
//
// Control is this process's stdin, one JSON line per op, reachable only by the harness that spawned it:
//   {"op":"run","run":<id>,"page":<tab id>,"token":<run token>,"log":<shim.jsonl path>,"tools":["orca","refsure"]}
//   {"op":"idle"}  ends the run: refuses every request, kills its in-flight children
//   {"op":"scan","dir":<path>}  exact-value scan of the files under <path> for the key; replies {hit, files}
//   {"op":"exit"}
// Each op is answered by one JSON line on stdout; the first line is {"ready":true,"port":N}.
//
//   node broker.mjs --config <agents config json> [--port 0]
import { spawn } from 'node:child_process';
import { appendFileSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';

const CHILD_TIMEOUT_MS = 590_000;
const MAX_OUTPUT = 32 * 1024 * 1024;
const REFUSED = 126;

// A4: Orca's key command is `keypress --key <name>`; 6.5's `press` named no real command.
const ORCA_VERBS = new Set(['snapshot', 'click', 'fill', 'keypress', 'wait']);
const ORCA_ALLOWED = 'snapshot, click, fill, keypress, wait, --help';
const REFSURE_PAGE_VERBS = new Set(['snap', 'state', 'locate', 'dismiss', 'outcome', 'mark', 'wait-for', 'pick-option', 'triage']);
// refsure itself needs no page for these (`commands` reports needs.page = none): a ticket names its page.
const REFSURE_PAGELESS_VERBS = new Set(['act', 'guard', 'commands', 'causes']);
const ORCA_REFUSED_FLAGS = ['--environment', '--pairing-code'];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function say(line) {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

const configPath = arg('config');
if (!configPath) {
  process.stderr.write('usage: broker.mjs --config <agents config json> [--port 0]\n');
  process.exit(64);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const keyFrom = config.refsure?.key?.from;
const keyAs = config.refsure?.key?.as;
const keyValue = keyFrom ? process.env[keyFrom] ?? '' : '';
if (!keyFrom || !keyAs || keyValue === '') {
  process.stderr.write('broker: refsure.key.from is not set in this environment (start the broker through the launcher)\n');
  process.exit(64);
}

/**
 * The owner's environment minus every credential the broker holds and every refsure or bench variable: refsure's
 * routing, keys and endpoints come only from the cli_both config and the one key the broker sets, never from
 * whatever the owner's shell exports.
 */
function baseEnv() {
  const env = { ...process.env };
  delete env[keyFrom];
  delete env[keyAs];
  for (const name of Object.keys(env)) if (name.startsWith('REFSURE_')) delete env[name];
  return env;
}

let current = null; // { run, page, token, log, tools: Set, children: Set }

/** Every value of `--<flag> v` and `--<flag>=v` in argv, and argv without those pairs. */
function takeFlag(argv, flag) {
  const values = [];
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === `--${flag}`) {
      values.push(i + 1 < argv.length ? argv[i + 1] : '');
      i += 1;
    } else if (a.startsWith(`--${flag}=`)) {
      values.push(a.slice(flag.length + 3));
    } else {
      rest.push(a);
    }
  }
  return { values, rest };
}

/**
 * The allowlist of 6.5: the real argv to run, or a refusal reason. `--help` (alone or after an allowed verb) needs
 * no page; every other allowed verb needs `--page` equal to the run's tab id, except refsure's page-less verbs,
 * whose `--page`, when given, must still equal it. Orca's worktree is the run's own: added when absent, refused
 * when it names another.
 */
function check(tool, argv, run) {
  if (!run.tools.has(tool)) return { reason: `${tool} is not available in this arm` };
  const { values: pages, rest } = takeFlag(argv, 'page');
  const verb = rest.find((a) => !a.startsWith('-'));
  // Help only as `<tool> --help` or `<tool> <verb> --help`: a `--help` given as a flag's value, or `-h`, is not help.
  const help = (rest.length === 1 && rest[0] === '--help') || (rest.length === 2 && rest[0] === verb && rest[1] === '--help');
  if (pages.some((p) => p !== run.page)) return { reason: `--page must be this run's tab id ${run.page}` };
  if (tool === 'orca') {
    if (ORCA_REFUSED_FLAGS.some((f) => argv.some((a) => a === f || a.startsWith(`${f}=`)))) return { reason: 'that orca option is not allowed here' };
    if (verb === undefined) return help ? { argv } : { reason: `allowed orca commands: ${ORCA_ALLOWED}` };
    if (!ORCA_VERBS.has(verb) || rest.indexOf(verb) !== rest.findIndex((a) => !a.startsWith('-'))) {
      return { reason: `orca ${verb} is not allowed here (allowed: ${ORCA_ALLOWED})` };
    }
    if (rest[0] !== verb) return { reason: `orca: put the command first (orca ${verb} ...)` };
    if (!help && pages.length === 0) return { reason: `orca ${verb} needs --page ${run.page}` };
    const wt = `id:${config.orca.worktreeId}`;
    const { values: worktrees } = takeFlag(argv, 'worktree');
    if (worktrees.some((w) => w !== wt)) return { reason: 'orca --worktree must name this run\'s worktree' };
    return { argv: worktrees.length === 0 ? [...argv, '--worktree', wt] : argv };
  }
  if (verb === undefined) return help ? { argv } : { reason: 'allowed refsure commands: snap, state, locate, act, dismiss, outcome, mark, wait-for, pick-option, guard, triage, commands, causes, --help' };
  if (rest[0] !== verb) return { reason: `refsure: put the command first (refsure ${verb} ...)` };
  if (REFSURE_PAGELESS_VERBS.has(verb) || (help && REFSURE_PAGE_VERBS.has(verb))) return { argv };
  if (!REFSURE_PAGE_VERBS.has(verb)) return { reason: `refsure ${verb} is not allowed here` };
  if (pages.length === 0) return { reason: `refsure ${verb} needs --page ${run.page}` };
  return { argv };
}

// 7.3: a 429 whose text says the quota or budget is spent (the pattern refsure's own transport reads).
const SPENT = /insufficient_quota|budget_exceeded|exceededbudget|budget has been exceeded|quota exceeded|out of credits/i;

/**
 * The 7.3 guard facts of an envelope's `why` (never its text): the HTTP codes it names and whether it says the
 * quota is spent. refsure words a provider failure `<provider>: HTTP <code>[ (...)]`.
 */
function whyFacts(why) {
  const detail = typeof why?.detail === 'string' ? why.detail : '';
  const http = [...detail.matchAll(/\bHTTP (\d{3})\b/g)].map((m) => Number(m[1]));
  return { cause: typeof why?.cause === 'string' ? why.cause : null, http, spent: SPENT.test(detail) };
}

/** What a refsure envelope says about its Decision (never content): status, ms, usd, provider and parts. */
function envelopeFacts(stdout) {
  const text = stdout.toString('utf8').trim();
  const last = text.slice(text.lastIndexOf('\n') + 1);
  try {
    const e = JSON.parse(last);
    if (e?.refsure !== 1) return null;
    const d = e.decision;
    return {
      command: e.command, status: e.status, acted: e.acted, why: whyFacts(e.why),
      decision: d ? {
        ms: d.ms, usd: d.usd, provider: d.provider, model: d.model,
        parts: Array.isArray(d.parts) ? d.parts.map((p) => ({ provider: p.provider, model: p.model, ms: p.ms, usd: p.usd })) : [],
      } : null,
    };
  } catch {
    return null;
  }
}

const now = () => performance.timeOrigin + performance.now();

function logLine(run, line) {
  try {
    appendFileSync(run.log, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  } catch (error) {
    process.stderr.write(`broker: cannot write ${run.log}: ${error.code ?? error.message}\n`);
  }
}

function runChild(run, tool, argv, stdin) {
  const env = baseEnv();
  let cmd = config.orca.bin;
  let args = argv;
  if (tool === 'refsure') {
    Object.assign(env, {
      XDG_CONFIG_HOME: config.refsure.xdgConfig,
      XDG_STATE_HOME: config.refsure.xdgState,
      ORCA_WORKTREE_ID: config.orca.worktreeId,
      ORCA_CLI_BIN_DIR: dirname(config.orca.bin),
      REFSURE_BACKEND: 'orca',
      REFSURE_PAGE: run.page,
      [keyAs]: keyValue,
    });
    cmd = process.execPath;
    args = [config.refsure.dist, ...argv];
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    run.children.add(child);
    const out = [];
    const err = [];
    let size = 0;
    const keep = (into) => (chunk) => {
      size += chunk.length;
      if (size <= MAX_OUTPUT) into.push(chunk);
    };
    child.stdout.on('data', keep(out));
    child.stderr.on('data', keep(err));
    const timer = setTimeout(() => child.kill('SIGKILL'), CHILD_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      run.children.delete(child);
      resolve({ exit: 127, stdout: Buffer.alloc(0), stderr: Buffer.from(`broker: cannot run ${tool} (${error.code ?? 'error'})\n`) });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      run.children.delete(child);
      resolve({ exit: code ?? (signal ? 128 + 9 : 1), stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(stdin);
  });
}

async function handle(raw) {
  const t0 = now();
  let req;
  try {
    req = JSON.parse(raw);
  } catch {
    return { exit: REFUSED, stderr: Buffer.from('broker: refused: malformed request\n') };
  }
  const run = current;
  if (run === null || typeof req.token !== 'string' || req.token !== run.token) {
    return { exit: REFUSED, stderr: Buffer.from('broker: refused: no run is active for this shim\n') };
  }
  const tool = req.tool === 'orca' || req.tool === 'refsure' ? req.tool : null;
  const argv = Array.isArray(req.argv) && req.argv.every((a) => typeof a === 'string') ? req.argv : null;
  const verdict = tool && argv ? check(tool, argv, run) : { reason: 'unknown tool' };
  const logged = [tool ?? String(req.tool), ...(argv ?? [])];
  if (verdict.reason !== undefined) {
    logLine(run, { t0, t1: now(), argv: logged, exit: REFUSED, refused: true, reason: verdict.reason });
    return { exit: REFUSED, stderr: Buffer.from(`broker: refused: ${verdict.reason}\n`) };
  }
  const stdin = typeof req.stdin === 'string' ? Buffer.from(req.stdin, 'base64') : Buffer.alloc(0);
  const result = await runChild(run, tool, verdict.argv, stdin);
  const line = { t0, t1: now(), argv: logged, exit: result.exit, refused: false, out_bytes: result.stdout.length, err_bytes: result.stderr.length };
  if (tool === 'refsure') line.envelope = envelopeFacts(result.stdout);
  if (run === current) logLine(run, line);
  else logLine(run, { ...line, after_run: true });
  return result;
}

// allowHalfOpen: the shim half-closes after its request; the reply still goes out on the same socket.
const server = createServer({ allowHalfOpen: true }, (socket) => {
  const parts = [];
  let size = 0;
  socket.on('data', (chunk) => {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) socket.destroy();
    else parts.push(chunk);
  });
  socket.on('error', () => undefined);
  socket.on('end', () => {
    handle(Buffer.concat(parts).toString('utf8')).then((result) => {
      socket.end(JSON.stringify({
        exit: result.exit,
        stdout: (result.stdout ?? Buffer.alloc(0)).toString('base64'),
        stderr: (result.stderr ?? Buffer.alloc(0)).toString('base64'),
      }));
    });
  });
});

/** Files under `dir` that hold the key's exact value; paths only, never the value or its position. */
function scan(dir) {
  const hits = [];
  const needle = Buffer.from(keyValue, 'utf8');
  const walk = (path) => {
    let st;
    try {
      st = lstatSync(path); // never follows the run's bin/node symlink
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const name of readdirSync(path)) walk(join(path, name));
    } else if (st.isFile() && st.size <= 256 * 1024 * 1024) {
      try {
        if (readFileSync(path).includes(needle)) hits.push(relative(dir, path));
      } catch {
        // unreadable: not a hit, not an error worth stopping for
      }
    }
  };
  walk(dir);
  return hits;
}

function endRun() {
  const run = current;
  current = null;
  if (run === null) return 0;
  for (const child of run.children) child.kill('SIGKILL');
  return run.children.size;
}

const control = createInterface({ input: process.stdin });
control.on('line', (text) => {
  let op;
  try {
    op = JSON.parse(text);
  } catch {
    say({ op: 'error', error: 'malformed control line' });
    return;
  }
  if (op.op === 'run') {
    endRun();
    const tools = new Set((Array.isArray(op.tools) ? op.tools : []).filter((t) => t === 'orca' || t === 'refsure'));
    if (typeof op.page !== 'string' || op.page === '' || typeof op.token !== 'string' || op.token.length < 16 || typeof op.log !== 'string') {
      say({ op: 'run', ok: false, error: 'run needs page, token (16+ chars) and log' });
      return;
    }
    current = { run: String(op.run), page: op.page, token: op.token, log: op.log, tools, children: new Set() };
    say({ op: 'run', ok: true, run: current.run, tools: [...tools] });
  } else if (op.op === 'idle') {
    say({ op: 'idle', ok: true, killed: endRun() });
  } else if (op.op === 'scan') {
    say({ op: 'scan', ok: typeof op.dir === 'string', files: typeof op.dir === 'string' ? scan(op.dir) : [] });
  } else if (op.op === 'exit') {
    endRun();
    say({ op: 'exit', ok: true });
    server.close();
    process.exit(0);
  } else {
    say({ op: String(op.op), ok: false, error: 'unknown op' });
  }
});
control.on('close', () => {
  endRun();
  process.exit(0);
});

server.listen(Number(arg('port', '0')), '127.0.0.1', () => say({ ready: true, port: server.address().port }));
