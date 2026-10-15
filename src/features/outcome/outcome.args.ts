import type { RiskClass } from '../../risk';
import type { OutcomeCheck } from './outcome-check';
import type { WrappedAct } from './wrapped-act';

/** `outcome … -- <verb> --element @eN`: refsure runs the agent's own act, guarded, then checks it landed. */
export type OutcomeWrapArgs = OutcomeCheck & {
  mode: 'wrap';
  /** The name the agent saw on the element; the live ref must still show it (spec §8.3). */
  expectName: string;
  risk?: RiskClass;
  act: WrappedAct;
};

/** `outcome … --mark M`: the agent acted itself after `refsure mark`; this only reads. */
export type OutcomeMarkArgs = OutcomeCheck & { mode: 'mark'; mark: string };

export type OutcomeArgs = OutcomeWrapArgs | OutcomeMarkArgs;
