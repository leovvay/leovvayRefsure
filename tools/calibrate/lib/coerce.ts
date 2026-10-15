/** A set field read as text: the string itself, else `fallback`. */
export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
