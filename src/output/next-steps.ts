import type { Next } from './status';

/*
  The two ways on that most outcomes share. Every verb and the registry name them from here, so a change to the
  re-observe step (a flag, another verb) is one edit. They are shared objects: build a new `Next` to change one.
*/

/** Look again: a fresh snapshot, before any further act. The registry pins it to the command's page. */
export const RE_OBSERVE: Next = Object.freeze({
  do: 'snapshot', argv: Object.freeze(['refsure', 'snap']),
}) as unknown as Next;

/** Only a human can go on: setup, a refusal no flag lifts, or a choice refsure will not make. */
export const NEEDS_HUMAN: Next = Object.freeze({ do: 'needs_human' }) as Next;
