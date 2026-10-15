import type { AnyCommandSpec, OptionSpec } from '../../cli';

/** One verb as `refsure commands --json` describes it: its `CommandSpec` without the functions. */
export interface CommandEntry {
  name: string;
  summary: string;
  since: string;
  stability: AnyCommandSpec['stability'];
  options: Readonly<Record<string, OptionSpec>>;
  /** The invocation shapes, when options alone do not show them (e.g. the act after `--`). */
  forms?: readonly string[];
  needs: AnyCommandSpec['needs'];
}
