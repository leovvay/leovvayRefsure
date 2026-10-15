import type { OriginPattern } from './origin-pattern-type';

const WILDCARD = /^(https?):\/\/\*\.(.+)$/i;
// A placeholder label lets the URL parser lowercase, punycode and default-port the rest of a wildcard entry.
const LABEL = 'refsure-wildcard-label';

/** Parses one origin entry, or `null` when it is not an http(s) origin without path, query or credentials. */
export function parseOriginPattern(entry: string): OriginPattern | null {
  const text = entry.trim();
  const wild = WILDCARD.exec(text);
  const candidate = wild ? `${wild[1]}://${LABEL}.${wild[2]}` : text;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/') return null;
  if (url.hostname.includes('*')) return null;
  let host = url.hostname;
  if (wild) {
    if (!host.startsWith(`${LABEL}.`)) return null;
    host = host.slice(LABEL.length + 1);
    if (!host.includes('.') && host !== 'localhost') return null;
  }
  return { scheme: url.protocol, host, port: url.port, wildcard: Boolean(wild) };
}

/** Whether a parsed page URL falls under the pattern. */
export function originMatches(pattern: OriginPattern, url: URL): boolean {
  if (url.protocol !== pattern.scheme || url.port !== pattern.port) return false;
  const host = url.hostname;
  return pattern.wildcard ? host.endsWith(`.${pattern.host}`) : host === pattern.host;
}
