import { fold } from '../../page-model';
import { urlGlobMatches } from '../shared';
import type { OutcomeCheck } from './outcome-check';

/** One side of the comparison: the URL and the page text, as the mode reads them. */
type Side = { url: string; text: string };

/**
 * The code rules that settle `landed` with no Decision (spec §6.2): the `--expect-url` glob matches after and did
 * not before, or the `--expect-text` (`fold`ed) was absent before and is present after. Text that was already on
 * the page proves nothing. `null` when neither rule settles it.
 */
export function landedByCode(check: OutcomeCheck, before: Side, after: Side): 'expect_url' | 'expect_text' | null {
  const glob = check.expectUrl;
  if (glob !== null && !urlGlobMatches(glob, before.url) && urlGlobMatches(glob, after.url)) return 'expect_url';
  const needle = check.expectText === null ? '' : fold(check.expectText);
  if (needle !== '' && !fold(before.text).includes(needle) && fold(after.text).includes(needle)) return 'expect_text';
  return null;
}
