import { stripControl } from './bound-text';
import { maskPii } from './pii-masks';
import { redactSecrets } from './redact';

type Clean = (text: string) => string;

const ESCAPE_RUN = /(?:%[0-9A-Fa-f]{2})+/g;
const ASCII_ESCAPE = /%([0-7][0-9A-Fa-f])/g;
/** `%2540` is `%40` encoded once more; two more rounds cover what a redirect chain usually adds. */
const DECODE_ROUNDS = 3;

// One run of escapes as UTF-8; a run that is not valid UTF-8 still gives up its ASCII escapes (`%40` is `@`).
function decodeRun(run: string): string {
  try {
    return decodeURIComponent(run);
  } catch {
    return run.replace(ASCII_ESCAPE, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  }
}

function decodeLoose(word: string): string {
  let text = word;
  for (let round = 0; round < DECODE_ROUNDS && text.includes('%'); round += 1) {
    const next = text.replace(ESCAPE_RUN, decodeRun);
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * A percent-encoded word (a URL, a query) is cleaned as its decoded text too: a GET form writes `@` as `%40`,
 * so `bob%40example.test` is an e-mail the literal masks never see. When cleaning the decoded word changes it,
 * the cleaned decoded word replaces the encoded one; otherwise the word is left as the page wrote it.
 */
function cleanEncodedWords(text: string, clean: Clean): string {
  return text.replace(/\S+/g, (word) => {
    if (!word.includes('%')) return word;
    const decoded = decodeLoose(word);
    if (decoded === word) return word;
    const cleaned = clean(decoded);
    return cleaned === decoded ? word : cleaned;
  });
}

function cleanLiteral(text: string, piiMasks: boolean): string {
  const redacted = redactSecrets(stripControl(text));
  return piiMasks ? maskPii(redacted) : redacted;
}

/**
 * Text as it may leave the machine (spec §7.3): control bytes stripped, secret shapes redacted, and, with PII masks
 * on, e-mail, IBAN, card and phone masked, in both the literal and the percent-decoded form. Idempotent. Clean
 * before cutting: a cut secret or e-mail no longer matches its shape.
 */
export function cleanEgressText(text: string, piiMasks: boolean): string {
  const once = (value: string): string => cleanLiteral(value, piiMasks);
  // Encoded words first: a literal pass could otherwise mask half of one (`(50)%20123-45-67`) and hide the rest.
  return once(cleanEncodedWords(text, once));
}
