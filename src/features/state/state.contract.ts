/**
 * `refsure state`: which research state the page is in (spec §6.2), as a key, never page text. `by` says whether
 * code settled it (an error tab, an open dialog) or a Decision did. On an abstain, `verdict` is null and `leaned`
 * names the state the model leaned to, when it leaned to one.
 */
export interface StateResult {
  verdict: string | null;
  by: 'code' | 'decision';
  leaned?: string | null;
}
