/*
  PII masks for text that leaves the machine: e-mail, IBAN, card, phone, in that order (an IBAN and a card
  are digit runs a phone mask would otherwise take). Every lookbehind keeps a match from starting inside a
  longer run, which also keeps each scan linear on long unbroken text.
*/

const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9-])/g;
const IBAN = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}(?![A-Za-z0-9])/g;
const CARD = /(?<!\d[ -]?)\d(?:[ -]?\d){12,18}(?![ -]?\d)/g;
const PHONE = /(?<![\w+(.-])\+?\(?\d[\d ().-]{6,22}\d(?!\d|[ .-]\d)/g;

function ibanValid(compact: string): boolean {
  if (compact.length < 15 || compact.length > 34) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let rest = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const value = code >= 65 ? String(code - 55) : char;
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97;
  }
  return rest === 1;
}

// A greedy match may run into a following word ("DE89 3704 … 00 TO"); retry at each earlier space.
function maskIban(match: string): string {
  let cut = match.length;
  while (cut > 0) {
    if (ibanValid(match.slice(0, cut).replace(/ /g, ''))) return `[iban]${match.slice(cut)}`;
    cut = match.lastIndexOf(' ', cut - 1);
  }
  return match;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function maskCard(match: string): string {
  const digits = match.replace(/\D/g, '');
  return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? '[card]' : match;
}

// Dates, IPv4 addresses and decimals look like separated digit runs; a phone needs a `+` or a separator.
function looksLikePhone(match: string): boolean {
  const digits = match.replace(/\D/g, '').length;
  if (digits < 9 || digits > 15) return false;
  const separators = match.replace(/[\d+]/g, '');
  if (!match.startsWith('+') && separators === '') return false;
  if (/[ .-]{2,}/.test(match)) return false;
  const opens = (match.match(/\(/g) ?? []).length;
  if (opens > 1 || opens !== (match.match(/\)/g) ?? []).length) return false;
  if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}(?!\d)/.test(match) || /^\d{1,2}[-./]\d{1,2}[-./]\d{4}(?!\d)/.test(match)) {
    return false;
  }
  if (/^[.]+$/.test(separators)) {
    const groups = match.split('.');
    if (groups.length === 2) return false;
    if (groups.length === 4 && groups.every((group) => group.length <= 3)) return false;
  }
  return true;
}

/** E-mail → `[email]`, IBAN (mod-97 valid) → `[iban]`, card (13-19 digits, Luhn) → `[card]`, phone → `[phone]`. */
export function maskPii(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(IBAN, maskIban)
    .replace(CARD, maskCard)
    .replace(PHONE, (match) => (looksLikePhone(match) ? '[phone]' : match));
}
