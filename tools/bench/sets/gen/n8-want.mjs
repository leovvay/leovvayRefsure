// One N8 case: the field's options, the gold (or none) and the want, for a domain, a condition and a page language.
// Every case is rejected and redrawn when the want folds equal to an option (refsure's code path would settle it)
// or two options fold equal (the twin rule would).
import { ALPHA, DOMAINS, ENDO_OK, LANG_NAME, NONE_CONDS } from './n8-domains.mjs';
import { LANGS, byName, foldEq } from './n8-lib.mjs';

const others = (lang) => LANGS.filter((l) => l !== lang);
const between = (rng, lo, hi) => lo + rng.int(hi - lo + 1);

/** Gold + `must` + random fillers (never `ban`), `n` in all, in the order a real site lists them. */
function optionSet(dom, lang, rng, { gold, must = [], ban = [], n }) {
  const byV = (v) => dom.concepts.find((c) => c.v === v);
  const keep = [gold, ...must.map(byV)].filter(Boolean);
  const out = new Set(keep.map((c) => c.v));
  const bannedV = new Set(ban);
  const pool = rng.shuffle(dom.concepts.filter((c) => !out.has(c.v) && !bannedV.has(c.v)));
  const picked = [...keep, ...pool.slice(0, Math.max(0, n - keep.length))];
  if (ALPHA.has(dom.id)) return picked.sort((a, b) => byName(lang)(a.l[lang], b.l[lang]));
  return dom.concepts.filter((c) => picked.includes(c));
}

/** A window of `n` consecutive concepts around `at` (time slots). */
function windowAround(dom, at, n, rng) {
  const k = dom.concepts.indexOf(at);
  const start = Math.max(0, Math.min(dom.concepts.length - n, k - rng.int(n)));
  return dom.concepts.slice(start, start + n);
}

const label = (c, lang) => c.l[lang];
const quote = (list) => list.map((s) => `"${s}"`).join(', ');

function draw(dom, cond, lang, rng) {
  const C = dom.concepts;
  const ofLang = (c) => label(c, lang);
  switch (cond) {
    case 'translated': {
      const gold = rng.pick(C);
      const wl = rng.pick(others(lang));
      const want = gold.alias && rng.chance(0.25) ? gold.alias[wl] : gold.l[wl];
      return { gold, want, wl, opts: optionSet(dom, lang, rng, { gold, n: Math.min(C.length, between(rng, 5, 10)) }),
        why: (g) => `"${g}" is the ${LANG_NAME[lang]} name of what the ${LANG_NAME[wl]} want "${want}" names.` };
    }
    case 'code': {
      const gold = rng.pick(C.filter((c) => c.code && c.v !== 'uk')); // `uk` reads as the United Kingdom
      const phone = dom.id === 'country' && gold.phone !== '+1' && rng.chance(0.3);
      const want = phone ? gold.phone : rng.pick(gold.code);
      const kind = phone ? 'dialling code' : dom.id === 'language' ? 'language tag' : 'ISO code';
      return { gold, want, wl: 'code', opts: optionSet(dom, lang, rng, { gold, must: rng.chance(0.5) ? gold.near : [], n: between(rng, 6, 12) }),
        why: (g) => `${want} is the ${kind} of ${gold.l.en}, listed as "${g}".` };
    }
    case 'paraphrase': {
      const gold = rng.pick(C.filter((c) => c.desc));
      const want = gold.desc[lang];
      return { gold, want, wl: lang, opts: optionSet(dom, lang, rng, { gold, n: Math.min(C.length, between(rng, 4, 8)) }),
        why: (g) => `"${want}" describes "${g}" (${gold.l.en}), and no other listed option fits that description.` };
    }
    case 'fold_near': {
      const gold = rng.pick(C.filter((c) => c.near.length && c.alias));
      const want = gold.alias[lang];
      const near = gold.near.map((v) => C.find((c) => c.v === v));
      return { gold, want, wl: lang, opts: optionSet(dom, lang, rng, { gold, must: gold.near, n: Math.min(C.length, between(rng, 5, 10)) }),
        why: (g) => `"${want}" is "${g}"; the look-alike ${quote(near.map(ofLang))} is a different ${dom.noun}.` };
    }
    case 'format': {
      const gold = rng.pick(C.filter((c) => c.fmt));
      const want = rng.pick(gold.fmt[lang]);
      const opts = dom.id === 'timeslot' ? windowAround(dom, gold, between(rng, 6, 10), rng)
        : dom.id === 'timezone' ? optionSet(dom, lang, rng, { gold, n: between(rng, 8, 14) }) : C;
      return { gold, want, wl: lang, opts, why: (g) => `"${want}" is the same ${dom.noun} as "${g}", written another way.` };
    }
    case 'long_list': {
      const gold = rng.pick(C.filter((c) => c.endo && ENDO_OK.has(c.v)));
      const want = gold.endo;
      const opts = optionSet(dom, lang, rng, { gold, n: C.length - rng.int(4) });
      return { gold, want, wl: 'endonym', opts, why: (g) => `"${want}" is ${gold.l.en}'s own name for itself, listed as "${g}" among ${opts.length} options.` };
    }
    case 'none_absent': {
      const target = rng.pick(C);
      const useDesc = target.desc && rng.chance(0.5);
      const want = useDesc ? target.desc[lang] : target.alias && rng.chance(0.3) ? target.alias[lang] : target.l[lang];
      const opts = optionSet(dom, lang, rng, { gold: null, ban: [target.v, ...target.near], n: Math.min(C.length - 1 - target.near.length, between(rng, 4, 10)) });
      return { gold: null, target, want, wl: lang, opts, why: () => `The list has no option for ${target.l.en} ("${want}"); none of ${quote(opts.map(ofLang))} means it.` };
    }
    case 'none_near': {
      // Cabin: only premium economy is a clean near miss ("cheapest seats" could be read as the cheapest listed).
      const target = rng.pick(C.filter((c) => (c.near.length && (dom.id !== 'cabin' || c.v === 'prem')) || dom.id === 'guests'));
      const near = dom.id === 'guests' ? C.filter((c) => c !== target).map((c) => c.v) : target.near;
      const want = target.fmt ? rng.pick(target.fmt[lang]) : target.alias ? target.alias[lang] : target.desc ? target.desc[lang] : target.l[lang];
      const opts = dom.id === 'timeslot' ? windowAround(dom, target, between(rng, 6, 9), rng).filter((c) => c !== target)
        : optionSet(dom, lang, rng, { gold: null, must: near, ban: [target.v], n: Math.min(C.length - 1, between(rng, 4, 10)) });
      const shown = opts.filter((c) => near.includes(c.v)).map(ofLang);
      return { gold: null, target, want, wl: lang, opts, why: () => `"${want}" means ${target.l.en}, which is not listed; the near miss${shown.length > 1 ? 'es' : ''} ${quote(shown.slice(0, 3))} ${shown.length > 1 ? 'are other' : 'is another'} ${dom.noun}${shown.length > 1 ? ' values' : ''}.` };
    }
    default:
      throw new Error(`unknown condition ${cond}`);
  }
}

/** A valid case or an error after 200 draws. `used` keeps (domain, gold or target, want) unique across the set. */
export function makeCase(domId, cond, lang, rng, used) {
  const dom = DOMAINS[domId];
  for (let tries = 0; tries < 200; tries += 1) {
    const c = draw(dom, cond, lang, rng);
    const texts = c.opts.map((o) => o.l[lang]);
    if (texts.some((t) => foldEq(t, c.want))) continue;
    if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) continue;
    if (c.gold && !c.opts.includes(c.gold)) continue;
    if (!c.gold && c.opts.includes(c.target)) continue;
    if (c.opts.length < 3) continue;
    if (NONE_CONDS.includes(cond) && c.opts.some((o) => foldEq(o.l.en, c.target.l.en))) continue;
    // An endonym is the same want in every page language, so long_list first tries to keep it unique across
    // languages too, and only then settles for unique within the page language.
    const key = `${cond}|${domId}|${cond === 'long_list' && tries < 150 ? '*' : lang}|${(c.gold ?? c.target).v}|${c.want}`;
    if (used.has(key)) continue;
    used.add(key);
    return { ...c, dom, options: c.opts.map((o) => ({ v: o.v, text: o.l[lang] })) };
  }
  throw new Error(`no case for ${domId} ${cond} ${lang}`);
}
