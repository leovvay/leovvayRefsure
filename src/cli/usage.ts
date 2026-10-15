import { VERSION } from '../version';
import type { AnyCommandSpec } from './any-command-spec';
import type { OptionSpec } from './option-spec';
import { GLOBAL_OPTIONS } from './parse-args';

type Described = Pick<AnyCommandSpec, 'name' | 'summary' | 'since' | 'stability' | 'options' | 'needs'>;

const EXIT_LINE = 'Exit: 0 ok; 10-19 decided not to act; 20-29 could not run; 30-39 effect unknown, re-observe '
  + 'before repeating; 64 usage.';

function optionLabel(name: string, spec: OptionSpec): string {
  const flag = spec.short ? `--${name}, -${spec.short}` : `--${name}`;
  return spec.type === 'string' ? `${flag} <value>` : flag;
}

function optionLines(options: Readonly<Record<string, OptionSpec>>): string[] {
  const entries = Object.entries(options);
  if (entries.length === 0) return ['  (none)'];
  const labels = entries.map(([name, spec]) => optionLabel(name, spec));
  const width = Math.max(...labels.map((label) => label.length)) + 2;
  return entries.map(([, spec], i) => {
    const extras = [
      spec.multiple ? 'repeatable' : null,
      spec.default !== undefined ? `default: ${String(spec.default)}` : null,
    ].filter((extra): extra is string => extra !== null);
    const suffix = extras.length > 0 ? ` (${extras.join('; ')})` : '';
    return `  ${(labels[i] ?? '').padEnd(width)}${spec.summary}${suffix}`;
  });
}

/** The top-level help: every verb in `features` order, the global options and the exit classes. */
export function usageText(features: readonly Described[]): string {
  const width = Math.max(0, ...features.map((spec) => spec.name.length)) + 2;
  const commands = features.map((spec) => {
    const tag = spec.stability === 'experimental' ? ' [experimental]' : '';
    return `  ${spec.name.padEnd(width)}${spec.summary}${tag}`;
  });
  return [
    `refsure ${VERSION}: Decision-backed browser judgment for agents in Orca.`,
    '',
    'Usage: refsure <command> [options]',
    '',
    'Commands:',
    ...(commands.length > 0 ? commands : ['  (none)']),
    '',
    'Global options:',
    ...optionLines(GLOBAL_OPTIONS),
    '',
    'Every command prints one JSON envelope on stdout.',
    EXIT_LINE,
    'Run `refsure <command> --help` for its options.',
  ].join('\n');
}

/** One verb's help, built from its `CommandSpec`. */
export function commandHelp(spec: Described): string {
  const { needs } = spec;
  const facts = [
    `since ${spec.since}`,
    spec.stability,
    needs.page === 'required' ? 'needs a page' : 'no page',
    needs.acts === 'never' ? 'never acts' : `acts: ${needs.acts}`,
    needs.sites.length > 0 ? `decisions: ${needs.sites.join(', ')}` : 'no decisions',
    ...(needs.capabilities.length > 0 ? [`capabilities: ${needs.capabilities.join(', ')}`] : []),
  ];
  return [
    `Usage: refsure ${spec.name} [options]`,
    spec.summary,
    `(${facts.join('; ')})`,
    '',
    'Options:',
    ...optionLines(spec.options),
    '',
    'Global options:',
    ...optionLines(GLOBAL_OPTIONS),
    '',
    EXIT_LINE,
  ].join('\n');
}
