/**
 * Where Orca's runtime listens, read from its `orca-runtime.json`. `authToken` goes only into a request written to
 * `socketPath`: never into a log, a trace, an error or a reply.
 */
export interface RuntimeEndpoint {
  /** A unix socket path, or a named pipe on Windows. */
  socketPath: string;
  authToken: string;
  /** The runtime that wrote the file; a reply from another one was answered by a restarted app. */
  runtimeId: string | null;
}
