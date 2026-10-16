// n5 generator helpers: seeded randomness, HTML escaping, neutral control ids, and a provisional
// visible-text reading of a generated page (the native capture replaces it with Orca's own reading).

export function rngFrom(seedText) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let a = h;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  const pick = (arr) => arr[int(arr.length)];
  const chance = (p) => next() < p;
  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { next, int, pick, chance, shuffle };
}

export function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Every button and link on a page gets an id `c<n>` from one shuffled pool, so an id never hints at a role.
export function idPool(rng) {
  const ids = rng.shuffle(Array.from({ length: 190 }, (_, i) => `c${i + 10}`));
  let k = 0;
  return () => ids[k++ % ids.length];
}

const BLOCK = /<\/?(p|div|li|ul|ol|h[1-6]|tr|table|thead|tbody|section|article|header|footer|nav|main|aside|form|label|dialog|br|dt|dd|dl|fieldset|legend|figure|figcaption|button|option|select|summary|details)\b[^>]*>/gi;

export function visibleText(html) {
  let body = html.replace(/<head>[\s\S]*?<\/head>/i, '');
  body = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  body = body.replace(/<input[^>]*value="([^"]*)"[^>]*>/gi, ' $1 ');
  body = body.replace(/<\/(td|th)>/gi, ' \t ').replace(/<\/(a|strong|code|span|em)>/gi, ' ');
  body = body.replace(BLOCK, '\n').replace(/<[^>]+>/g, '');
  body = body.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return body.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '').join('\n');
}

export function titleOf(html) {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : '';
}

// The shape outcome-side.ts gives one side; the url is the served path, the host is filled at capture.
export function sideText(at, html) {
  return [`url: ${at}`, `title: ${titleOf(html)}`, 'visible_text:', visibleText(html)].join('\n');
}

export function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function money(lang, cur, amount) {
  const fixed = amount.toFixed(2);
  if (lang === 'en') {
    const [i, d] = fixed.split('.');
    const g = `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d}`;
    return cur === 'EUR' ? `€${g}` : cur === 'GBP' ? `£${g}` : `$${g}`;
  }
  const [i, d] = fixed.split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'de' || lang === 'es' ? '.' : ' ');
  const sym = cur === 'UAH' ? '₴' : cur === 'PLN' ? 'zł' : '€';
  return `${grouped},${d} ${sym}`;
}

export const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));

// A reference number of n digits that never starts with 0.
export const refNo = (rng, n) => String(1 + rng.int(9)) + Array.from({ length: n - 1 }, () => rng.int(10)).join('');
