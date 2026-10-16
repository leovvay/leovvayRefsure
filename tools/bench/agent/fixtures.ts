import { readFileSync } from 'node:fs';
import { agentFile } from './config';

/*
  The N12 fixture rows (3.5, 6.1) as the agent level reads them, and the exact 6.5 task prompts. Scoring metadata
  (`allowed`, `writes`, `maxWrites`, `success`) is read from the frozen set file, never from the served pages.
*/

export type Task = 'A' | 'B' | 'C';

export interface AllowedLine {
  page?: string;
  line: 'button' | 'control' | 'fill';
  name?: string;
  role?: string;
  field?: string;
  fieldName?: string;
  value?: string;
}

/** A `where` value: a literal (equal) or `{trimFoldEquals}` (trimmed, locale-lower-cased equal). */
export type WhereValue = string | number | boolean | { trimFoldEquals: string };

export interface SuccessRule {
  event: string | null;
  where?: Record<string, WhereValue>;
  reply?: { starts: string; firstInteger?: number };
}

export interface Fixture {
  id: string;
  task: Task;
  variant: string;
  lang: string;
  entry: string;
  substitutions: Record<string, string>;
  allowed: AllowedLine[];
  writes: { name: string }[];
  maxWrites: number;
  success: SuccessRule;
}

export interface Prompts {
  v: 1;
  join: string;
  opening: string;
  tasks: Record<Task, string>;
  defaults: Record<string, string>;
  uk: Record<string, string>;
  preflight: string;
}

export function readPrompts(path = agentFile('prompts.json')): Prompts {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Prompts;
  if (raw.v !== 1 || typeof raw.opening !== 'string' || !raw.opening.includes('{PAGE}')) throw new Error(`${path}: not a v1 prompts file`);
  for (const task of ['A', 'B', 'C'] as const) {
    if (typeof raw.tasks?.[task] !== 'string') throw new Error(`${path}: task ${task} is missing`);
  }
  return raw;
}

export function readFixtures(path: string): Fixture[] {
  const rows = readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as Record<string, unknown>);
  return rows.map((row) => {
    const prompt = (row.prompt ?? {}) as { task?: unknown; substitutions?: Record<string, string> };
    const task = row.task;
    if (task !== 'A' && task !== 'B' && task !== 'C') throw new Error(`${String(row.id)}: task must be A, B or C`);
    if (prompt.task !== undefined && prompt.task !== task) throw new Error(`${String(row.id)}: prompt.task differs from task`);
    if (typeof row.entry !== 'string' || !row.entry.startsWith('/')) throw new Error(`${String(row.id)}: entry must be a served path`);
    const success = row.success as SuccessRule | undefined;
    if (success === undefined || !('event' in success)) throw new Error(`${String(row.id)}: no success rule`);
    return {
      id: String(row.id), task, variant: String(row.variant), lang: String(row.lang), entry: row.entry,
      substitutions: prompt.substitutions ?? {},
      allowed: (row.allowed ?? []) as AllowedLine[],
      writes: (row.writes ?? []) as { name: string }[],
      maxWrites: Number(row.maxWrites ?? 0),
      success,
    };
  });
}

/**
 * The exact 6.5 prompt: the common opening, then the task. Only the uk variant may substitute, and only the query
 * and the name, to the frozen uk values; anything else refuses (the prompt is frozen with the fixtures).
 */
export function promptFor(prompts: Prompts, fixture: Fixture, page: string): string {
  const values: Record<string, string> = { ...prompts.defaults };
  for (const [key, value] of Object.entries(fixture.substitutions)) {
    if (value === prompts.defaults[key]) continue;
    if (fixture.lang !== 'uk' || prompts.uk[key] !== value) {
      throw new Error(`${fixture.id}: substitution ${key} is not one 6.5 allows`);
    }
    values[key] = value;
  }
  const task = prompts.tasks[fixture.task].replace(/\{(\w+)\}/g, (_whole, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`${fixture.id}: no value for {${key}}`);
    return value;
  });
  return `${prompts.opening.replaceAll('{PAGE}', page)}${prompts.join}${task}`;
}
