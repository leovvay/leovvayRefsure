import type { AnyCommandSpec, OptionSpec } from '../../cli';

/** One verb as `refsure commands --json` describes it: its `CommandSpec` without the functions. */
export interface CommandEntry {
  name: string;
  summary: string;
  since: string;
  stability: AnyCommandSpec['stability'];
  options: Readonly<Record<string, OptionSpec>>;
  needs: AnyCommandSpec['needs'];
}
