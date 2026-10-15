import { fold } from './normalize';

// Short function words that carry no target. Only words of three or more letters matter: shorter ones never count.
const STOP_WORDS: ReadonlySet<string> = new Set([
  // en
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'are', 'its', 'into', 'our', 'then',
  // uk
  'для', 'що', 'від', 'або', 'які', 'який', 'яка', 'яке', 'цей', 'щоб', 'при',
  // ru
  'для', 'что', 'это', 'или', 'как', 'при', 'чтобы', 'который', 'которая',
  // de
  'der', 'die', 'das', 'und', 'für', 'mit', 'von', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'oder', 'zum', 'zur',
  // es
  'los', 'las', 'del', 'con', 'para', 'por', 'que', 'una', 'uno', 'unos', 'unas', 'sus',
  // fr
  'les', 'des', 'pour', 'avec', 'une', 'que', 'qui', 'dans', 'sur', 'aux', 'vos', 'votre',
  // pl
  'dla', 'nie', 'się', 'jest', 'oraz', 'lub', 'ten', 'tak', 'aby', 'przy',
]);

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/** The `fold`ed tokens of three or more letters or digits, minus the stop list, unique, in first-seen order. */
export function contentWords(text: string): string[] {
  const seen = new Set<string>();
  for (const match of fold(text).matchAll(WORD)) {
    const word = match[0];
    if (Array.from(word).length < 3 || STOP_WORDS.has(word)) continue;
    seen.add(word);
  }
  return [...seen];
}
