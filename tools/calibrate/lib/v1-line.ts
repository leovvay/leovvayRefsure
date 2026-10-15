/** A line in line format v1 (`role "name" in="path"`), split into its parts; `null` when it is not one. */
export function parseV1Line(line: string): { role: string; name: string; path: string } | null {
  const match = /^(\S+) ("(?:[^"\\]|\\.)*") in=("(?:[^"\\]|\\.)*")$/.exec(line);
  if (!match) return null;
  try {
    return { role: match[1]!, name: JSON.parse(match[2]!) as string, path: JSON.parse(match[3]!) as string };
  } catch {
    return null;
  }
}
