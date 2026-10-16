import { existsSync, readFileSync } from 'node:fs';
import type { AgentId } from './config';

/*
  What an agent's own output records (6.5): its model and version, its skills, the commands it ran, its tokens,
  cost and turns, denied tool calls and its final reply. Claude: `--output-format stream-json --verbose` events.
  Codex: `exec --json` events plus `-o out/last.txt`. Read as data; nothing here judges the run.
*/

export interface Tokens {
  /** Claude: uncached input; Codex: `input_tokens - cached_input_tokens`. */
  input_uncached: number;
  cache_write: number;
  cache_read: number;
  output: number;
  reasoning_output: number;
  /** Claude: uncached + cache write + cache read; Codex: `input_tokens` (which includes cached). */
  tok_in_total: number;
}

export interface Transcript {
  agent: AgentId;
  models: string[];
  version: string | null;
  /** Skill names from the init or session record; null when the output carries no skill list. */
  skills: string[] | null;
  commands: string[];
  final_message: string;
  reply: string;
  result_subtype: string | null;
  total_cost_usd: number | null;
  duration_ms: number | null;
  duration_api_ms: number | null;
  num_turns: number | null;
  tokens: Tokens;
  denied: number;
  events: number;
  unparsed: number;
}

function readEvents(path: string): { events: Record<string, unknown>[]; unparsed: number } {
  if (!existsSync(path)) return { events: [], unparsed: 0 };
  const events: Record<string, unknown>[] = [];
  let unparsed = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const value = JSON.parse(line) as unknown;
      if (typeof value === 'object' && value !== null) events.push(value as Record<string, unknown>);
    } catch {
      unparsed += 1;
    }
  }
  return { events, unparsed };
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const numOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The last non-empty line of the final message, trimmed (6.5 "Reply"). */
export function lastLine(text: string): string {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return lines[lines.length - 1] ?? '';
}

function skillNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === 'string') return entry;
    const rec = (entry ?? {}) as Record<string, unknown>;
    return String(rec.name ?? rec.id ?? '');
  }).filter((name) => name !== '');
}

const emptyTokens = (): Tokens => ({ input_uncached: 0, cache_write: 0, cache_read: 0, output: 0, reasoning_output: 0, tok_in_total: 0 });

export function readClaude(transcriptPath: string): Transcript {
  const { events, unparsed } = readEvents(transcriptPath);
  const models = new Set<string>();
  const commands: string[] = [];
  let version: string | null = null;
  let skills: string[] | null = null;
  let result: Record<string, unknown> | null = null;
  let lastText = '';
  for (const event of events) {
    if (event.type === 'system' && event.subtype === 'init') {
      if (typeof event.model === 'string') models.add(event.model);
      if (typeof event.claude_code_version === 'string') version = event.claude_code_version;
      if (Array.isArray(event.skills)) skills = skillNames(event.skills);
    } else if (event.type === 'assistant') {
      const message = (event.message ?? {}) as Record<string, unknown>;
      if (typeof message.model === 'string' && message.model !== '<synthetic>') models.add(message.model);
      for (const block of Array.isArray(message.content) ? message.content as Record<string, unknown>[] : []) {
        if (block.type === 'tool_use') {
          const input = (block.input ?? {}) as Record<string, unknown>;
          commands.push(typeof input.command === 'string' ? input.command : `${String(block.name)} ${JSON.stringify(input)}`);
        } else if (block.type === 'text' && typeof block.text === 'string') {
          lastText = block.text;
        }
      }
    } else if (event.type === 'result') {
      result = event;
    }
  }
  const usage = (result?.usage ?? {}) as Record<string, unknown>;
  const tokens = emptyTokens();
  tokens.input_uncached = num(usage.input_tokens);
  tokens.cache_write = num(usage.cache_creation_input_tokens);
  tokens.cache_read = num(usage.cache_read_input_tokens);
  tokens.output = num(usage.output_tokens);
  tokens.tok_in_total = tokens.input_uncached + tokens.cache_write + tokens.cache_read;
  const final = typeof result?.result === 'string' ? result.result : lastText;
  return {
    agent: 'claude', models: [...models], version, skills, commands,
    final_message: final, reply: lastLine(final),
    result_subtype: typeof result?.subtype === 'string' ? result.subtype : null,
    total_cost_usd: numOrNull(result?.total_cost_usd),
    duration_ms: numOrNull(result?.duration_ms),
    duration_api_ms: numOrNull(result?.duration_api_ms),
    num_turns: numOrNull(result?.num_turns),
    tokens,
    denied: Array.isArray(result?.permission_denials) ? result.permission_denials.length : 0,
    events: events.length, unparsed,
  };
}

/** Every value under a key named `name`, at any depth (Codex events vary by version; read what is there). */
function deepValues(value: unknown, name: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) for (const v of value) deepValues(v, name, out);
  else if (typeof value === 'object' && value !== null) {
    for (const [key, v] of Object.entries(value)) {
      if (key === name) out.push(v);
      deepValues(v, name, out);
    }
  }
  return out;
}

export function readCodex(transcriptPath: string, lastMessagePath: string): Transcript {
  const { events, unparsed } = readEvents(transcriptPath);
  const commands: string[] = [];
  const tokens = emptyTokens();
  let input = 0;
  let cached = 0;
  let lastText = '';
  let turns = 0;
  for (const event of events) {
    const item = (event.item ?? {}) as Record<string, unknown>;
    if (event.type === 'item.completed' && item.type === 'command_execution' && typeof item.command === 'string') commands.push(item.command);
    if (event.type === 'item.completed' && item.type === 'agent_message' && typeof item.text === 'string') lastText = item.text;
    if (event.type === 'turn.completed') {
      turns += 1;
      const usage = (event.usage ?? {}) as Record<string, unknown>;
      input += num(usage.input_tokens);
      cached += num(usage.cached_input_tokens);
      tokens.output += num(usage.output_tokens);
      tokens.reasoning_output += num(usage.reasoning_output_tokens);
    }
  }
  tokens.cache_read = cached;
  tokens.input_uncached = input - cached;
  tokens.tok_in_total = input;
  const models = [...new Set(deepValues(events, 'model').filter((m): m is string => typeof m === 'string'))];
  const skillLists = deepValues(events, 'skills').filter(Array.isArray);
  const final = existsSync(lastMessagePath) ? readFileSync(lastMessagePath, 'utf8') : lastText;
  return {
    agent: 'codex', models, version: null,
    skills: skillLists.length > 0 ? [...new Set(skillLists.flatMap(skillNames))] : null,
    commands, final_message: final, reply: lastLine(final),
    result_subtype: null, total_cost_usd: null, duration_ms: null, duration_api_ms: null,
    num_turns: turns, tokens, denied: 0, events: events.length, unparsed,
  };
}
