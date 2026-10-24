import type { TrailSpec } from './trail-spec';

/**
 * The page script (`page/trail-page.js`), minified by build.mjs into one parenthesized function expression and put
 * in by esbuild's `define`. The build refuses a script that does not parse, is over 16 KB, or holds a forbidden
 * token. Null when refsure runs unbundled: the trail is then off.
 */
export const TRAIL_PAGE: string | null = typeof __TRAIL_PAGE__ === 'string' && __TRAIL_PAGE__ !== ''
  ? __TRAIL_PAGE__
  : null;

/**
 * The draw: the page function called on the spec as a JSON literal. Only the spec's JSON is joined to the fixed
 * script, never page text as code (a string in JSON is a string in JS; U+2028 and U+2029 are legal in both).
 */
export function trailCall(page: string, spec: TrailSpec): string {
  return `${page}(${JSON.stringify(spec)})`;
}
