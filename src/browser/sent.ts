/** `before`: what `trace.dispatched` said until this call, for an answer that proves nothing was sent. */
export type Sent<R> = { kind: 'reply'; reply: R; before: boolean } | { kind: 'lost'; error: unknown };
