// n6 number and date formats: one value written in several styles (en 1,250.00; dot 1.250,00; space 1 250,00;
// iso 1250.00 EUR / 2026-10-03), the page's own style per language, and near-miss values for false items.

const SYM = { EUR: '€', GBP: '£', USD: '$', UAH: '₴', PLN: 'zł' };
export const PAGE_STYLE = { en: 'en', de: 'dot', es: 'dot', uk: 'space', pl: 'space' };

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  uk: ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  pl: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'],
};

function group(intPart, sep) {
  return sep ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : intPart;
}

/** Money: `{type:'money', cur}` and an amount. */
function money(style, cur, v) {
  const [i, d] = v.toFixed(2).split('.');
  if (style === 'en') return `${SYM[cur] ?? `${cur} `}${group(i, ',')}.${d}`;
  if (style === 'dot') return `${group(i, '.')},${d} ${SYM[cur]}`;
  if (style === 'space') return `${group(i, ' ')},${d} ${SYM[cur]}`;
  if (style === 'iso') return `${i}.${d} ${cur}`;
  return `${cur} ${i}`; // plain, whole units only when d is 00
}

function count(style, v) {
  const i = String(Math.round(v));
  if (style === 'en') return group(i, ',');
  if (style === 'dot') return group(i, '.');
  if (style === 'space') return group(i, ' ');
  return i;
}

function date(style, lang, v) {
  const [y, m, d] = v;
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  if (style === 'iso') return `${y}-${mm}-${dd}`;
  if (style === 'numeric') return `${dd}.${mm}.${y}`;
  const mon = MONTHS[lang][m - 1];
  if (lang === 'en') return `${d} ${mon} ${y}`;
  if (lang === 'de') return `${d}. ${mon} ${y}`;
  if (lang === 'es') return `${d} de ${mon} de ${y}`;
  return `${d} ${mon} ${y}`;
}

/** Writes value `v` of spec `spec` in `style` for language `lang`. */
export function fmt(spec, v, style, lang) {
  if (spec.type === 'money') return money(style, spec.cur, v);
  if (spec.type === 'count') return count(style, v);
  return date(style === 'en' || style === 'dot' || style === 'space' ? 'long' : style, lang, v);
}

/** The page's own way of writing a value. */
export const pageFmt = (spec, v, lang) => fmt(spec, v, PAGE_STYLE[lang], lang);

/** A different style for the expectation (number_format items), never one that reads ambiguously. */
export function otherStyle(spec, pageLang, expLang, rng) {
  const page = PAGE_STYLE[pageLang];
  let pool;
  if (spec.type === 'date') pool = expLang === 'en' ? ['iso'] : ['iso', 'numeric'];
  else if (spec.type === 'count') pool = ['iso', 'space', 'en'].filter((s) => !(s === 'en' && expLang !== 'en'));
  else pool = ['iso', PAGE_STYLE[expLang], 'en'];
  pool = pool.filter((s) => s !== page);
  if (spec.type === 'money' && page === 'en') pool = pool.filter((s) => s !== 'dot' || expLang !== 'en');
  return rng.pick(pool.length ? pool : ['iso']);
}

/** A near value: same size, visibly different digits (transposed or nudged), never equal. */
export function nearValue(spec, v, rng) {
  if (spec.type === 'date') {
    const [y, m, d] = v;
    return [y, m, d > 20 ? d - 1 - rng.int(2) : d + 1 + rng.int(2)];
  }
  const s = spec.type === 'money' ? v.toFixed(2) : String(Math.round(v));
  const digits = s.replace('.', '').split('');
  const cut = spec.type === 'money' ? digits.length - 2 : digits.length;
  for (let k = 0; k < 10; k += 1) {
    const i = rng.int(Math.max(1, cut - 1));
    if (digits[i] !== digits[i + 1] && !(i === 0 && digits[1] === '0')) {
      [digits[i], digits[i + 1]] = [digits[i + 1], digits[i]];
      const out = Number(spec.type === 'money' ? `${digits.slice(0, cut).join('')}.${digits.slice(cut).join('')}` : digits.join(''));
      if (out !== v) return out;
    }
  }
  return spec.type === 'money' ? v + 30 : v + 90;
}

/** A near-twin reference: two adjacent different digits swapped (A-1042 -> A-1024), never equal. */
export function twinRef(ref, rng) {
  const ch = ref.split('');
  const at = ch.map((c, i) => i).filter((i) => /\d/.test(ch[i]) && /\d/.test(ch[i + 1] ?? '') && ch[i] !== ch[i + 1]);
  const i = at.length ? at[rng.int(at.length)] : -1;
  if (i < 0) return `${ref}1`;
  [ch[i], ch[i + 1]] = [ch[i + 1], ch[i]];
  return ch.join('');
}

/** A random date in 2026 as [y, m, d], days 3..26 so a near miss stays in the month. */
export const someDate = (rng) => [2026, 1 + rng.int(12), 3 + rng.int(24)];
