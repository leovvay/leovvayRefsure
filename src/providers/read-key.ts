import type { KeySource } from '../config';

/**
 * The key a source gives now, or `null` when it gives none: only a non-empty string counts, and a source that
 * throws is a missing key (nothing it threw is kept). Every reader of a key's presence or value goes through here.
 */
export async function readKey(key: KeySource): Promise<string | null> {
  try {
    const value = await key.read();
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}
