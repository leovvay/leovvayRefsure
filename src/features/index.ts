import type { CommandSpec } from '../cli';

/** Every command, in `--help` order. A static list: one bundle, no directory scan. Feature tasks append here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FEATURES: readonly CommandSpec<any, any>[] = [];
