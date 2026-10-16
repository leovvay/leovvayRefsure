import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { AgentsConfig } from './config';

/*
  The isolation check of 6.5 with A6 item 6 (A7 item 4), over one run-agents window (dry, run); the tests and
  failure names of the phase-wide check of `results/p8/run.sh`, except that (1) keeps run-agents' own directories
  and patterns (run.sh's also searches the owner's live Codex home and names `refsure-bench-agent` and
  `refsure-probe-bench`), and (4) compares each kept line by its fields where run.sh compares bytes. Before and
  after the window:
  (1) `find ~/.claude/projects ~/.codex/sessions ~/.agents -newer <marker>` lists no path naming a run directory or
      the probe directory (Claude names project directories by the cwd with dashes);
  (2) `~/.codex/auth.json` keeps its mtime;
  (3) `~/.claude.json` gains no bench path and no bench skill name: no key of its `projects` map holding
      `refsure-bench-agent` or `refsure-probe`, and no key of its `skillUsage` map equal to `refsure` or `orca-cli`,
      that was not there at the marker. Any Claude Code session (the owner's main one too) writes the file, so its
      mtime is not tested (A6), and nothing else of it is read;
  (4) the `ls -la` listings of `~/.claude/skills`, `~/.codex/skills` and `~/.agents/skills`, without their `.` and
      `..` lines (`..` carries the parent's mtime, which any session moves), are equal (sha256; see listingSha).
  A failure voids the window. No failure name is one of the two names of the tests A6 replaced, which run.sh's
  agent_phase and exit check forgive, so every failure here stands there.
*/

export interface ClaudeJsonBench { projects: string[]; skillUsage: string[] }

export interface IsolationState {
  rule: string;
  marker: string;
  marked_at: string;
  mtimes: Record<string, number | null>;
  listing_entries_sha: string;
  patterns: string[];
  claude_json_before: ClaudeJsonBench;
}

export interface IsolationResult { ok: boolean; failures: string[]; newer_hits: string[] }

const RULE = '6.5 with A6';
const home = homedir();
const FIND_DIRS = [join(home, '.claude', 'projects'), join(home, '.codex', 'sessions'), join(home, '.agents')];
const MTIME_FILES = [join(home, '.codex', 'auth.json')];
const LISTED_DIRS = ['.claude', '.codex', '.agents'].map((dir) => join(home, dir, 'skills'));
const CLAUDE_JSON = join(home, '.claude.json');
const BENCH_PATHS = ['refsure-bench-agent', 'refsure-probe'];
const BENCH_SKILLS = ['refsure', 'orca-cli'];
const PARSE_TRIES = 10;
const PARSE_RETRY_MS = 500;

function mtime(path: string): number | null {
  return existsSync(path) ? statSync(path).mtimeMs : null;
}

/**
  (4)'s listing. `ls` pads each column to its widest cell, `.` and `..` included, so a `..` whose link count or size
  gains a digit (an APFS parent at 99 links, one per entry, that gains an entry) re-pads every kept line: each kept
  line is compared by its fields, so a dropped line leaves no trace.
*/
function listingSha(): string {
  const out = spawnSync('/bin/ls', ['-la', ...LISTED_DIRS], { encoding: 'utf8' });
  const entries = out.stdout.split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => !['.', '..'].includes(fields.at(-1)!))
    .map((fields) => fields.join(' '))
    .join('\n');
  return createHash('sha256').update(`${entries}\n${out.stderr}`).digest('hex');
}

const keysOf = (value: unknown): string[] => (value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []);

/** The bench paths and bench skill names `~/.claude.json` holds, or null when it never parsed (a session rewriting it). */
function claudeJsonBench(): ClaudeJsonBench | null {
  for (let attempt = 0; attempt < PARSE_TRIES; attempt += 1) {
    if (attempt > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, PARSE_RETRY_MS);
    let data: Record<string, unknown>;
    try {
      data = existsSync(CLAUDE_JSON) ? JSON.parse(readFileSync(CLAUDE_JSON, 'utf8')) as Record<string, unknown> : {};
    } catch {
      continue;
    }
    return {
      projects: keysOf(data.projects).filter((key) => BENCH_PATHS.some((p) => key.includes(p))).sort(),
      skillUsage: keysOf(data.skillUsage).filter((key) => BENCH_SKILLS.includes(key)).sort(),
    };
  }
  return null;
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
  const claudeJson = claudeJsonBench();
  if (claudeJson === null) throw new Error(`~/.claude.json did not parse in ${PARSE_TRIES} tries; no isolation window is opened`);
  const marker = `${stateFile}.marker`;
  writeFileSync(marker, new Date().toISOString());
  const state: IsolationState = {
    rule: RULE,
    marker,
    marked_at: new Date().toISOString(),
    mtimes: Object.fromEntries(MTIME_FILES.map((path) => [path, mtime(path)])),
    listing_entries_sha: listingSha(),
    patterns: isolationPatterns(config),
    claude_json_before: claudeJson,
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
  if (listingSha() !== state.listing_entries_sha) {
    failures.push('the listing of ~/.claude/skills, ~/.codex/skills and ~/.agents/skills changed (without its ./.. lines)');
  }
  const after = claudeJsonBench();
  if (after === null) {
    failures.push(`~/.claude.json did not parse in ${PARSE_TRIES} tries`);
  } else {
    const gained = (key: keyof ClaudeJsonBench) => after[key].filter((k) => !state.claude_json_before[key].includes(k));
    const projects = gained('projects');
    const skills = gained('skillUsage');
    if (projects.length > 0) failures.push(`~/.claude.json gained ${projects.length} bench path(s) in projects`);
    if (skills.length > 0) failures.push(`~/.claude.json gained the bench skill name(s) ${skills.join(', ')} in skillUsage`);
  }
  return { ok: failures.length === 0, failures, newer_hits: hits };
}
