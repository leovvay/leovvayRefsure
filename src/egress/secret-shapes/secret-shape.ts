/**
 * One secret shape: every match of `re` (always global) is replaced by `[redacted:<family>]`. Context a
 * shape needs but must keep (a field name, a URL scheme) sits in a lookbehind, so only the secret goes.
 */
export interface SecretShape { family: string; re: RegExp }
