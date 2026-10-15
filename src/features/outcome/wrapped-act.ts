import type { ActAction, Ref } from '../../browser';

/** The act after `--`: `<verb> --element @eN [--value v]`, one of the six typed acts, never typing. */
export interface WrappedAct {
  action: ActAction;
  ref: Ref;
  /** fill and select only. Never logged, never sent, never shown. */
  value?: string;
}
