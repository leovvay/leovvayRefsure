import { sha256Hex } from './canonical';

/*
  What a human reads before granting a provider host. Any edit changes DISCLOSURE_HASH, and every grant
  recorded under the old hash stops counting until `refsure setup` runs again: that is the point.
*/
export const DISCLOSURE_TEXT = [
  'refsure sends page text from your browser to a Decision provider. Before you grant a host, know this:',
  '1. Orca\'s default browser profile carries the Chrome cookies you imported, so the pages refsure reads are '
    + 'logged in.',
  '2. Jev goes to TypeSafe via OpenRouter (US, early access). zdr and data_collection:"deny" are request '
    + 'preferences that refsure cannot verify.',
  '3. OpenAI /v1/decisions is a public beta with no retention control in the request body.',
  '4. A custom gateway does whatever its operator does.',
  'What is sent, per Decision: the page URL and title, headings, dialog and alert names, bounded page text, '
    + 'element lines with their names, and the intent or expectation you give. Secret shapes are redacted first; '
    + 'e-mail, phone, card and IBAN masks are on by default.',
  'Never sent: cookies, storage, screenshots, keys, typed or filled values, textbox values, console or network '
    + 'bodies.',
  'A local egress.log records the time, command, provider, host, bytes, digest, status and cost of every call, '
    + 'never its content.',
].join('\n');

export const DISCLOSURE_HASH = sha256Hex(DISCLOSURE_TEXT);
