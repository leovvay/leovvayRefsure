import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { AgentsConfig } from './config';

/*
  The per-phase isolation check of 6.5. Before and after the phase: `find ~/.claude/projects ~/.codex/sessions
  ~/.agents -newer <marker>` lists no path naming a run directory or the probe directory (Claude names project
  directories by the cwd with dashes); the mtimes of `~/.claude.json` and `~/.codex/auth.json` are unchanged; the
  sha256 of `ls -la ~/.agents/skills ~/.claude/skills` is unchanged. A failure voids the phase.
*/

export interface IsolationState {
  marker: string;
  marked_at: string;
  mtimes: Record<string, number | null>;
  listing_sha: string;
  patterns: string[];
}

export interface IsolationResult { ok: boolean; failures: string[]; newer_hits: string[] }

const home = homedir();
const FIND_DIRS = [join(home, '.claude', 'projects'), join(home, '.codex', 'sessions'), join(home, '.agents')];
const MTIME_FILES = [join(home, '.claude.json'), join(home, '.codex', 'auth.json')];
const LISTED_DIRS = [join(home, '.agents', 'skills'), join(home, '.claude', 'skills')];

function mtime(path: string): number | null {
  return existsSync(path) ? statSync(path).mtimeMs : null;
}

function listingSha(): string {
  const out = spawnSync('/bin/ls', ['-la', ...LISTED_DIRS], { encoding: 'utf8' });
  return createHash('sha256').update(`${out.stdout}\n${out.stderr}`).digest('hex');
}

/** Run-directory and probe-directory names as they appear in a dashed project directory name. */
export function isolationPatterns(config: AgentsConfig): string[] {
  const dashed = (path: string) => path.replace(/[/.]/g, '-').replace(/^-+/, '').split('-').filter(Boolean).slice(-2).join('-');
  // The whole run root, dashed: a short basename (`runs`) alone falls under the length floor and would match nothing.
  const whole = (path: string) => path.replace(/[/.]/g, '-').replace(/^-+/, '');
  return [...new Set([basename(config.runRoot), whole(config.runRoot), ...config.peekPaths.map(dashed)].filter((p) => p.length >= 6))];
}

function newerHits(marker: string, patterns: readonly string[]): string[] {
  const dirs = FIND_DIRS.filter((dir) => existsSync(dir));
  if (dirs.length === 0) return [];
  const out = spawnSync('/usr/bin/find', [...dirs, '-newer', marker], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.stdout.split('\n').filter((path) => path !== '' && patterns.some((p) => path.includes(p)));
}

/** Sets the marker and records the before state (and its own newer-than-marker check, trivially empty). */
export function isolationBefore(config: AgentsConfig, stateFile: string): IsolationState {
  mkdirSync(dirname(stateFile), { recursive: true });
  const marker = `${stateFile}.marker`;
  writeFileSync(marker, new Date().toISOString());
  const state: IsolationState = {
    marker,
    marked_at: new Date().toISOString(),
    mtimes: Object.fromEntries(MTIME_FILES.map((path) => [path, mtime(path)])),
    listing_sha: listingSha(),
    patterns: isolationPatterns(config),
  };
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export function isolationCheck(stateFile: string): IsolationResult {
  const state = JSON.parse(readFileSync(stateFile, 'utf8')) as IsolationState;
  const failures: string[] = [];
  const hits = newerHits(state.marker, state.patterns);
  if (hits.length > 0) failures.push(`${hits.length} path(s) under the owner's agent dirs name a bench run`);
  for (const [path, before] of Object.entries(state.mtimes)) {
    if (mtime(path) !== before) failures.push(`${path.replace(home, '~')} changed its mtime`);
  }
  if (listingSha() !== state.listing_sha) failures.push('the listing of ~/.agents/skills and ~/.claude/skills changed');
  return { ok: failures.length === 0, failures, newer_hits: hits };
}
