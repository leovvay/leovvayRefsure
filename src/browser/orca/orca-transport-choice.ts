import type { RuntimeEndpoint } from './runtime-endpoint';

/** How the next Orca call travels: over the runtime socket, or through the `orca` CLI, and why. */
export type OrcaTransportChoice =
  | { kind: 'socket'; endpoint: RuntimeEndpoint }
  | { kind: 'cli'; why: string };
