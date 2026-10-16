import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { flags, list, need, opt } from '../calibrate/lib/args';
import { armById, readArmsFile } from './lib/arms';
import { armRuntime, askRow, prepare } from './lib/ask';
import { assertFrozen, assertPinnedSource, readFreezeTable } from './lib/freeze';
import { defaultOrders, readItems } from './lib/items';
import type { OrderLabel } from './lib/items';
import { ledgerPath, openLedger } from './lib/ledger';
import { p0ThresholdAsserts } from './lib/thresholds';
import { helpExit } from './lib/help';

/*
  P0 steps that need refsure's modules and have no other entry point (7.1's P0 row):

    p0 thresholds                      the 2.2 asserts for the arms file's Jev model; exit 1 on any failure
    p0 body --set <items.jsonl> --item <id> --arm <id> --write <file> [--order p0|fixed]
                                       the wire body `prepare` builds (provider.body), as JSON text, for the golden
                                       pair beside refsure's own `--dry-run` body; sends nothing, reads no key
    p0 ping --set <ping.jsonl> --freeze <table> --out <results> [--arms a,b]
                                       one row per arm through lib/ask.ts (askRow) on the set's first item, written
                                       to <results>/P0/<arm>/<set>.jsonl; prints one summary line per arm

  Exit 0 pass, 1 a check failed, 64 bad usage. Never prints a key.
*/

const USAGE = [
  'usage: p0 thresholds',
  '       p0 body --set <items.jsonl> --item <id> --arm <id> --write <file> [--order p0|fixed]',
  '       p0 ping --set <ping.jsonl> --freeze <table> --out <results> [--arms a,b]',
].join('\n');
helpExit(USAGE);
const [command, ...rest] = process.argv.slice(2);
const values = flags(rest, ['set', 'item', 'arm', 'write', 'order', 'freeze', 'out', 'arms'], USAGE);

function fail(message: string, code = 64): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function thresholds(): void {
  const file = readArmsFile();
  const jev = file.arms.find((arm) => arm.provider === 'jev');
  if (!jev) fail('the arms file has no Jev arm');
  const failures = p0ThresholdAsserts(jev.model);
  process.stdout.write(`${JSON.stringify({ check: 'thresholds', model: jev.model, pass: failures.length === 0, failures })}\n`);
  if (failures.length > 0) process.exit(1);
}

function body(): void {
  const file = readArmsFile();
  const arm = armById(file, need(values, 'arm', USAGE));
  const id = need(values, 'item', USAGE);
  const item = readItems(need(values, 'set', USAGE)).find((one) => one.id === id) ?? fail(`no item ${id}`);
  const order = (opt(values, 'order') ?? defaultOrders(item)[0]) as OrderLabel;
  const prepared = prepare(armRuntime(file, arm), item, order);
  if (prepared.body === null) fail(`${arm.id} ${id}: refused ${prepared.refusal?.cause ?? 'unknown'}`, 1);
  const out = need(values, 'write', USAGE);
  writeFileSync(out, JSON.stringify(prepared.body));
  process.stdout.write(`${JSON.stringify({ arm: arm.id, item: id, order, wire_sha: prepared.wireSha, bytes: prepared.reqBytes, file: out })}\n`);
}

async function ping(): Promise<void> {
  const file = readArmsFile();
  const setPath = need(values, 'set', USAGE);
  const setSha = assertFrozen(readFreezeTable(need(values, 'freeze', USAGE)), setPath);
  const results = need(values, 'out', USAGE);
  const item = readItems(setPath)[0] ?? fail(`${setPath}: no item`);
  const setId = basename(setPath).replace(/\.jsonl$/, '');
  const commits = assertPinnedSource();
  const runId = `${new Date().toISOString().replace(/[:.]/g, '')}-${randomBytes(3).toString('hex')}`;
  const arms = list(values, 'arms', file.arms.map((arm) => arm.id)).map((id) => armById(file, id));
  let failed = false;
  for (const arm of arms) {
    const path = ledgerPath(results, 'P0', arm.id, setId);
    if (existsSync(path)) fail(`${path} exists: P0 pings once per arm`);
    const row = await askRow(armRuntime(file, arm), item, {
      phase: 'P0', slice: 'final', set: setId, setSha, order: defaultOrders(item)[0] as OrderLabel, repeat: 'r1',
      deadlineMs: 15000, maxAttempts: 3, runId, concurrency: 1, commits,
    });
    const ledger = openLedger(path);
    ledger.append(row);
    ledger.close();
    const usage = row.attempts.at(-1)?.usage.at(-1) as Record<string, unknown> | null | undefined;
    const ok = row.status === 'ok' && row.family_ok === true;
    failed ||= !ok;
    process.stdout.write(`${JSON.stringify({
      arm: arm.id, host: row.host, status: row.status, http_status: row.http_status, model: row.model, family_ok: row.family_ok,
      model_changed: row.model_changed, r1: row.r1, attempts: row.attempts.length, t_wire: row.attempts.map((a) => a.t_wire),
      usd: row.usd, usage_cost_present: usage !== null && usage !== undefined && typeof usage.cost === 'number',
      usage_keys: usage ? Object.keys(usage) : [], headers: row.attempts.at(-1)?.headers.at(-1) ?? null, detail: row.detail,
    })}\n`);
  }
  if (failed) process.exit(1);
}

switch (command) {
  case 'thresholds':
    thresholds();
    break;
  case 'body':
    body();
    break;
  case 'ping':
    await ping();
    break;
  default:
    fail(USAGE);
}
