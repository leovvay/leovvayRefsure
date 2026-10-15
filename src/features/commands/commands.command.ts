import { type AnyCommandSpec, type CommandSpec, GLOBAL_OPTIONS, type UsageError } from '../../cli';
import type { CommandEntry } from './command-entry';
import type { CommandsResult } from './commands.contract';

function entryOf(spec: AnyCommandSpec): CommandEntry {
  const { name, summary, since, stability, options, forms, needs } = spec;
  return { name, summary, since, stability, options, ...(forms ? { forms } : {}), needs };
}

/**
 * Self-description from the specs themselves (spec §6.3). The list is passed in as a thunk, so this verb can sit
 * in the very list it describes without a circular import.
 */
export function commandsCommand(list: () => readonly AnyCommandSpec[]): CommandSpec<Record<string, never>, CommandsResult> {
  return {
    name: 'commands',
    summary: 'Describe every command: options, page and capability needs, Decision sites, whether it acts',
    since: '0.1.0',
    stability: 'stable',
    options: {},
    needs: { page: 'none', capabilities: [], sites: [], acts: 'never' },
    parse(raw): Record<string, never> | UsageError {
      if (raw.positionals.length > 0) return { usage: `commands takes no arguments, got ${raw.positionals.length}` };
      return {};
    },
    async run() {
      const result: CommandsResult = { commands: list().map(entryOf), global_options: GLOBAL_OPTIONS };
      return { status: 'ok', acted: false, effect: 'none', result };
    },
  };
}
