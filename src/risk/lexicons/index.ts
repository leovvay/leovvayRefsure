import { DE } from './de';
import { EN } from './en';
import { ES } from './es';
import { FR } from './fr';
import type { Lexicon } from './lexicon';
import { PL } from './pl';
import { RU } from './ru';
import { UK } from './uk';

export type * from './lexicon';

/** Every language refsure reads. A name is matched against all of them at once (spec §8.5). */
export const LEXICONS: readonly Lexicon[] = [EN, UK, RU, DE, ES, FR, PL];
