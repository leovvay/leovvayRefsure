/** One provider as `privacy` shows it: where its requests go and which key pays, by name, never by value. */
export interface PrivacyProvider {
  host: string | null;
  /** The key's env name or the key command's argv[0]. */
  key: string | null;
  /** It has an endpoint and a key source; whether the key is set is `doctor`'s question. */
  configured: boolean;
  /** A consent grant for this host under today's disclosure. */
  granted: boolean;
}
