import { sha256Hex } from '../egress';

/**
 * The identity of a wording (spec §8.3): sha256 hex of `[kind, instructions, labels]`, labels in key order.
 * Labels are fixed text or slots (`{expect}`, `{state:<key>}`); candidate lines and page text are never hashed,
 * so a calibration entry keyed by this hash stays valid whatever page it is asked about.
 */
export function wordingHash(
  kind: 'choice' | 'noul',
  instructions: string,
  labels: Readonly<Record<string, string>>,
): string {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(labels).sort()) sorted[key] = labels[key]!;
  return sha256Hex(JSON.stringify([kind, instructions, sorted]));
}

/**
 * A site's `wording`, hashed on first read rather than at module load: `egress` owns the digest, and an import
 * cycle through it must never reach `sha256Hex` before that module has run.
 */
export function siteWording(
  kind: 'choice' | 'noul',
  instructions: string,
  labels: Readonly<Record<string, string>>,
): { version: number; hash: string } {
  let hash: string | null = null;
  return {
    version: 1,
    get hash() {
      return (hash ??= wordingHash(kind, instructions, labels));
    },
  };
}
