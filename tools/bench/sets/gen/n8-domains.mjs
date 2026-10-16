// The N8 domain registry and which conditions each domain can author. A domain is a list of concepts:
// { v (option value), l (label per page language), code?, alias?, desc?, fmt?, endo?, near (look-alike values) }.
import { country } from './n8-dom-country.mjs';
import { guests, rows, timeslot, version, weight } from './n8-dom-format.mjs';
import { cabin, doctype, frequency, marital, meal } from './n8-dom-life.mjs';
import { language, timezone } from './n8-dom-lang.mjs';
import { currency, payment } from './n8-dom-money.mjs';
import { delivery, plan, sort } from './n8-dom-shop.mjs';
import { category, priority, role } from './n8-dom-work.mjs';
import { T } from './n8-lib.mjs';

export const DOMAINS = Object.fromEntries([
  country, language, timezone, currency, payment, delivery, plan, sort, frequency, cabin, meal, doctype, marital,
  role, priority, category, timeslot, guests, weight, rows, version,
].map((d) => [d.id, d]));

// The English noun a `why` uses for one concept of each domain.
const NOUN = {
  country: 'country', language: 'language', timezone: 'time zone', currency: 'currency', payment: 'payment method',
  delivery: 'delivery method', plan: 'plan', sort: 'sort order', frequency: 'frequency', cabin: 'cabin class',
  meal: 'meal', doctype: 'document type', marital: 'marital status', role: 'role', priority: 'priority', category: 'topic',
  timeslot: 'time', guests: 'guest combination', weight: 'pack size', rows: 'page size', version: 'version',
};
for (const d of Object.values(DOMAINS)) d.noun = NOUN[d.id];

// Lists a real site sorts by name; the rest keep their natural order (tiers, times, sizes).
export const ALPHA = new Set(['country', 'language', 'currency']);

// Endonyms a reader of any of the five languages can be expected to know (Latin or Greek script, or a well-known
// script for the languages); the others (romanised Korean, Arabic transliterations) are never a want.
export const ENDO_OK = new Set([
  'SE', 'FI', 'HU', 'HR', 'EE', 'LV', 'LT', 'NL', 'CZ', 'AL', 'GR', 'NO', 'DK', 'DE', 'ES', 'IT', 'PL', 'UA', 'AT', 'IS',
  'RO', 'BR', 'MX', 'PT', 'FR', 'SK', 'SI', 'TR', 'BE', 'IE',
  'de', 'es', 'pl', 'fr', 'it', 'nl', 'sv', 'fi', 'cs', 'sk', 'sl', 'hu', 'ro', 'el', 'tr', 'ja', 'uk', 'pt-BR', 'pt-PT', 'da',
]);

export const NONE_CONDS = ['none_absent', 'none_near'];
export const GOLD_CONDS = ['translated', 'code', 'paraphrase', 'fold_near', 'format', 'long_list'];

export const COND_DOMAINS = {
  translated: ['country', 'language', 'currency', 'payment', 'delivery', 'cabin', 'meal', 'doctype', 'marital', 'role', 'priority', 'category', 'frequency'],
  code: ['country', 'currency', 'language'],
  paraphrase: ['payment', 'delivery', 'plan', 'frequency', 'cabin', 'meal', 'doctype', 'marital', 'role', 'priority', 'sort', 'category'],
  fold_near: ['country', 'language', 'currency', 'plan', 'sort', 'version'],
  format: ['timeslot', 'guests', 'weight', 'rows', 'timezone'],
  long_list: ['country', 'language', 'country'], // country twice: its endonym pool is the larger one
  none_absent: ['country', 'language', 'currency', 'payment', 'meal', 'doctype', 'category', 'delivery'],
  none_near: ['country', 'currency', 'plan', 'sort', 'version', 'timeslot', 'role', 'language', 'cabin', 'frequency', 'timezone', 'guests'],
};

export const LANG_NAME = { en: 'English', uk: 'Ukrainian', de: 'German', es: 'Spanish', pl: 'Polish' };

// The placeholder a real select opens with; it is an option node, so refsure offers it too.
export const PLACEHOLDER = T('Select…|Оберіть…|Bitte wählen|Selecciona una opción|Wybierz…');
