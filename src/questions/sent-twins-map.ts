/** Each option key of a Choice that reads the same as sent as another option: its text, and the keys it reads like. */
export type SentTwins = ReadonlyMap<string, { text: string; others: readonly string[] }>;
