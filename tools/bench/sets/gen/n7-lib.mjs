// N7 helpers shared by the templates: people, near-miss references and amounts.
import { money } from './n5-lib.mjs';

/** Two different people from [first, full, vocative] rows: the signed-in user and the "other" one. */
export function people(rng, rows) {
  const [a, b] = rng.shuffle(rows);
  return { first: a[0], user: a[1], voc: a[2] ?? a[0], other: [b[0], b[1], b[2] ?? b[0]] };
}

/** Swap two adjacent, different characters at a deterministic place: 48213 -> 48231, K7R2P -> K7RP2. */
export function nearRef(rng, ref) {
  const s = ref.split('');
  const spots = [];
  for (let i = 1; i < s.length - 1; i += 1) if (s[i] !== s[i + 1] && /[0-9A-Z]/.test(s[i]) && /[0-9A-Z]/.test(s[i + 1])) spots.push(i);
  const i = spots.length ? rng.pick(spots) : s.length - 2;
  [s[i], s[i + 1]] = [s[i + 1], s[i]];
  const out = s.join('');
  if (out === ref) throw new Error(`nearRef: no swap for ${ref}`);
  return out;
}

export const refDigits = (rng, n) => String(1 + rng.int(9)) + Array.from({ length: n - 1 }, () => rng.int(10)).join('');
export const refCode = (rng, n) => Array.from({ length: n }, (_, i) => (i % 2 ? '23456789' : 'ABCDEFGHJKLMNPRSTUVWXYZ')[rng.int(i % 2 ? 8 : 23)]).join('');

/**
 * An amount, its page form, a near miss with two digits swapped, and the English spec form.
 * `cur` USD/EUR/UAH; en pages use $ or €, others the local format (n5's money()).
 */
export function amounts(rng, lang, cur) {
  let whole = 120 + rng.int(4800);
  while (new Set(String(whole)).size < 3) whole += 7;
  const cents = [0, 50, 90, 25, 40][rng.int(5)];
  const amt = whole + cents / 100;
  const digits = String(whole).split('');
  const i = digits.findIndex((d, j) => j > 0 && j < digits.length - 1 && d !== digits[j + 1]);
  const at = i < 0 ? 0 : i;
  [digits[at], digits[at + 1]] = [digits[at + 1], digits[at]];
  const nearAmt = Number(digits.join('')) + cents / 100;
  if (nearAmt === amt) throw new Error('amounts: near equals amount');
  return {
    val: money(lang, cur, amt), near: money(lang, cur, nearAmt),
    spec: `a total of ${lang === 'en' ? money('en', cur, amt) : `${amt.toFixed(2)} ${cur}`}`,
  };
}
