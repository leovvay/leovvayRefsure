import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  The freeze gate (3.1, 9.4): a set, conversion, capture or sample file is read only when its sha256 is in the
  freeze table passed by `--freeze <file>`. The table is either the protocol's markdown table
  (`| file | sha256 | frozen at |`, every row whose second cell is 64 hex) or JSON: `{"files": [{"file", "sha256"}]}`
  or a plain `{"<file>": "<sha256>"}` map. Also here: the A3 pin, the code under test unchanged since its commit.
*/

export interface FreezeEntry { file: string; sha256: string }

export const PINNED_REFSURE_COMMIT = '7d622c0';

/** Paths whose tree must equal the pinned commit (A3): the code under test. */
export const PINNED_PATHS = ['src', 'build.mjs', 'package.json', 'package-lock.json', 'tsconfig.json', 'skills'] as const;

const HEX64 = /^[0-9a-f]{64}$/;

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Every (file, sha256) row of a freeze table file, markdown or JSON. Throws on a table with no row. */
export function readFreezeTable(path: string): FreezeEntry[] {
  const text = readFileSync(path, 'utf8');
  const out: FreezeEntry[] = [];
  if (/^\s*[{[]/.test(text)) {
    const raw = JSON.parse(text) as unknown;
    const list = Array.isArray(raw) ? raw : (raw as { files?: unknown }).files;
    if (Array.isArray(list)) {
      for (const row of list as { file?: unknown; sha256?: unknown }[]) {
        if (typeof row.file === 'string' && typeof row.sha256 === 'string') out.push({ file: row.file, sha256: row.sha256 });
      }
    } else {
      for (const [file, sha] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof sha === 'string') out.push({ file, sha256: sha });
      }
    }
  } else {
    for (const line of text.split('\n')) {
      const cells = line.split('|').map((cell) => cell.trim().replace(/^`|`$/g, ''));
      if (cells.length >= 4 && HEX64.test(cells[2] ?? '')) out.push({ file: cells[1] ?? '', sha256: cells[2] ?? '' });
    }
  }
  const valid = out.filter((entry) => HEX64.test(entry.sha256.toLowerCase()) && entry.file !== '');
  if (valid.length === 0) throw new Error(`${path}: no frozen file in the table`);
  return valid.map((entry) => ({ file: entry.file, sha256: entry.sha256.toLowerCase() }));
}

/** Whether a table row names this path: the same path, a suffix of it at a `/`, or the same basename. */
function names(entry: FreezeEntry, path: string): boolean {
  const abs = resolve(path);
  return entry.file === path || abs.endsWith(`/${entry.file.replace(/^\.\//, '')}`) || basename(entry.file) === basename(path);
}

/**
 * The file's sha256 when the table holds a row naming it with that hash; otherwise throws (the runner refuses an
 * unhashed or changed file, 3.1).
 */
export function assertFrozen(table: readonly FreezeEntry[], path: string): string {
  const sha = sha256File(path);
  if (table.some((entry) => entry.sha256 === sha && names(entry, path))) return sha;
  const named = table.find((entry) => names(entry, path));
  throw new Error(named
    ? `${path}: sha256 ${sha.slice(0, 12)} differs from the frozen ${named.sha256.slice(0, 12)}`
    : `${path}: not in the freeze table`);
}

/** The refsure repo root (this file lives in tools/bench/lib, or in a bundle under --outdir: pass `root` then). */
export function repoRoot(root?: string): string {
  if (root !== undefined) return resolve(root);
  if (process.env.REFSURE_REPO) return resolve(process.env.REFSURE_REPO);
  const top = (dir: string) => execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    return top(dirname(fileURLToPath(import.meta.url)));
  } catch {
    return top(process.cwd());
  }
}

/**
 * A3: the code under test equals the pinned commit, both at HEAD and in the working tree. Returns the two commits
 * every row records; throws when anything under `PINNED_PATHS` differs. `bench_commit` carries `+dirty` when
 * `tools/bench` has uncommitted or untracked files, and with `requireCleanBench` (every real run) that throws.
 */
export function assertPinnedSource(root = repoRoot(), pinned = PINNED_REFSURE_COMMIT, opts: { requireCleanBench?: boolean } = {}): { refsure_commit: string; bench_commit: string } {
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  for (const against of [['HEAD'], []]) {
    try {
      execFileSync('git', ['-C', root, 'diff', '--quiet', pinned, ...against, '--', ...PINNED_PATHS], { stdio: 'ignore' });
    } catch {
      throw new Error(`the code under test differs from ${pinned} (${against.length > 0 ? 'HEAD' : 'working tree'}): ${PINNED_PATHS.join(' ')}`);
    }
  }
  const dirty = git('status', '--porcelain', '--', 'tools/bench') !== '';
  if (dirty && opts.requireCleanBench) {
    throw new Error('tools/bench has uncommitted or untracked changes: commit them so bench_commit names the code that runs');
  }
  return { refsure_commit: git('rev-parse', '--short=7', pinned), bench_commit: `${git('rev-parse', '--short=12', 'HEAD')}${dirty ? '+dirty' : ''}` };
}
