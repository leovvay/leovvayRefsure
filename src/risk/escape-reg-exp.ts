/** `text` as a literal inside a regular expression: every character a pattern reads specially is escaped. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
