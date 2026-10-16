import { existsSync, writeFileSync } from 'node:fs';
import { flags, need, num, opt } from '../calibrate/lib/args';
import { DOCTOR_PING_ITEM, goldStratifiedSample } from './lib/ablate';
import { assertFrozen, readFreezeTable, sha256File } from './lib/freeze';
import { readItems } from './lib/items';
import { helpExit } from './lib/help';

/*
  2.5 ablation inputs that are not authored sets: the doctor-ping item and the 60-item P1 sample. Each is written
  once as a JSONL set file, so it can be hashed into the 9.4 freeze table and then read by `run.ts` like any other
  frozen set. Nothing is sent.

    ablation-sets ping --write <file>
    ablation-sets p1-sample --from <P1 items.jsonl> --freeze <table> --write <file> [--n 60]

  Prints `{ file, items, sha256 }`. Exit 0 written, 64 bad usage or the output exists.
*/

const USAGE = 'usage: ablation-sets ping --write <file> | p1-sample --from <P1 items.jsonl> --freeze <table> --write <file> [--n 60]';
helpExit(USAGE);
const [command, ...rest] = process.argv.slice(2);
const values = flags(rest, ['write', 'from', 'freeze', 'n'], USAGE);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(64);
}

function writeSet(path: string, items: readonly unknown[]): void {
  if (existsSync(path)) fail(`${path} exists: a frozen input is written once`);
  writeFileSync(path, items.map((item) => `${JSON.stringify(item)}\n`).join(''), { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ file: path, items: items.length, sha256: sha256File(path) })}\n`);
}

switch (command) {
  case 'ping':
    writeSet(need(values, 'write', USAGE), [DOCTOR_PING_ITEM]);
    break;
  case 'p1-sample': {
    const from = need(values, 'from', USAGE);
    const freeze = opt(values, 'freeze') ?? fail(`--freeze <table> is required: the sample is drawn from frozen P1 only\n${USAGE}`);
    assertFrozen(readFreezeTable(freeze), from);
    const n = num(values, 'n', 60, USAGE, { min: 1, integer: true });
    const items = readItems(from);
    const other = items.find((item) => item.site !== 'presence');
    if (other) fail(`${from}: item ${other.id} is ${other.site}; the 2.5 sample is presence only`);
    writeSet(need(values, 'write', USAGE), goldStratifiedSample(items, n));
    break;
  }
  default:
    fail(USAGE);
}
