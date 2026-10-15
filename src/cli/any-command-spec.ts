import type { CommandSpec } from './command-spec';

/** A spec of any verb: `Args` is invariant, so a mixed list needs `any` here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCommandSpec = CommandSpec<any, any>;
