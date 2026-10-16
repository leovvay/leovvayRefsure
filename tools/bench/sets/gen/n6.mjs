#!/usr/bin/env node
/*
  N6: presence set (benchmark protocol 3.5, row N6, as amended by A1). 800 items: true 440 (paraphrase,
  translated, number_format, status_reached: 110 each), false 360 (loading, queued, wrong_entity, near_miss,
  negation, login, error, partial: 45 each). A base is one scenario (one record on one site); it holds at most 4
  items and at most 2 danger-eligible (false) ones: 180 bases carry 2 true + 2 false pages, 40 bases 2 true pages.

    node tools/bench/sets/gen/n6.mjs      (writes tools/bench/sets/n6/pages and tools/bench/sets/n6.draft.jsonl)

  Plain Node, no dependencies, fixed seed. Everything is synthetic: brands, people and places are made up, links
  are relative paths, and no page loads anything. `input.page` is this generator's own text reading
  (`input_provisional`); the native capture replaces pageUrl and page with what refsure reads through Orca.
*/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rngFrom, visibleText } from './n5-lib.mjs';
import { makeUi } from './n5-shell.mjs';
import { FALSE, TRUE, expKind, falsePage, truePage } from './n6-cond.mjs';
import { PAGE_STYLE, fmt, nearValue, otherStyle, pageFmt } from './n6-fmt.mjs';
import { TEMPLATES } from './n6-templates.mjs';

const SEED = 'refsure-bench-n6-20261016';
const HERE = dirname(fileURLToPath(import.meta.url));
const SETS = join(HERE, '..');
const OUT_DIR = join(SETS, 'n6');
const OUT = join(SETS, 'n6.draft.jsonl');

const BASES = 220;
const FULL = 180; // bases with 2 true + 2 false; the other 40 carry 2 true
const LANGS = { en: 100, uk: 50, de: 24, es: 23, pl: 23 };
const TRUE_PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

// ---------- plan: one row per base ----------
function plan() {
  const rng = rngFrom(`${SEED}:plan`);
  const langs = rng.shuffle(Object.entries(LANGS).flatMap(([l, n]) => Array(n).fill(l)));
  // False conditions: each of the 8 exactly 45 times, two different ones per full base.
  const half = (from) => rng.shuffle(FALSE.slice(from, from + 4).flatMap((c) => Array(FULL / 4).fill(c)));
  const fa = half(0);
  const fb = half(4);
  const turn = {};
  const rows = [];
  for (let j = 0; j < BASES; j += 1) {
    const lang = langs[j];
    const able = TEMPLATES.filter((t) => t.langs.includes(lang));
    turn[lang] = (turn[lang] ?? rng.int(able.length)) + 1;
    const tpl = able[turn[lang] % able.length];
    const tp = j < 216 ? TRUE_PAIRS[j % 6] : TRUE_PAIRS[j - 216];
    const conds = tp.map((i) => TRUE[i]);
    if (j < FULL) conds.push(fa[j], fb[j]);
    rows.push({ base: `b${String(j + 1).padStart(3, '0')}`, lang, tpl, conds });
  }
  return rows;
}

/** The expectation's language: the page's for paraphrase, another for translated, else mostly the page's. */
function expLang(cond, lang, tpl, rng) {
  if (cond === 'paraphrase') return lang;
  if (cond === 'translated') {
    const others = tpl.langs.filter((l) => l !== lang);
    if (lang === 'en') return rng.chance(0.6) ? 'uk' : rng.pick(others);
    if (lang === 'uk') return rng.chance(0.8) ? 'en' : rng.pick(others);
    return rng.chance(0.75) ? 'en' : 'uk';
  }
  return lang !== 'en' && rng.chance(0.3) ? 'en' : lang;
}

function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(join(OUT_DIR, 'pages'), { recursive: true });
  const items = [];
  for (const row of plan()) {
    const S = row.tpl.make(rngFrom(`${SEED}:${row.base}`), row.lang);
    row.conds.forEach((cond, k) => {
      const r = rngFrom(`${SEED}:${row.base}:${k}`);
      const kind = expKind(cond, r);
      const eLang = expLang(cond, row.lang, row.tpl, r);
      const numPage = pageFmt(S.spec, S.f.n, row.lang);
      let numExp = S.spec.type === 'date' ? fmt(S.spec, S.f.n, PAGE_STYLE[eLang], eLang) : numPage;
      for (let t = 0; cond === 'number_format' && t < 8 && numExp === numPage; t += 1) {
        numExp = fmt(S.spec, S.f.n, otherStyle(S.spec, row.lang, eLang, r), eLang);
      }
      if (cond === 'number_format' && numExp === numPage) throw new Error(`${row.base}: number_format equal`);
      const ctx = { ui: makeUi(rngFrom(`${SEED}:${row.base}:${k}:ui`)), numExp, numPage, near: nearValue(S.spec, S.f.n, r) };
      const res = (TRUE.includes(cond) ? truePage : falsePage)(S, row.lang, cond, kind, ctx, r);
      const expectation = S.exp(eLang, kind, { ref: S.f.ref, who: S.f.who, num: numExp });
      const gold = TRUE.includes(cond) ? 'true' : 'false';
      items.push({
        site: 'presence', lang: row.lang, expectation_lang: eLang, source: 'synthetic', condition: cond,
        base: row.base, template: row.tpl.id, kind: S.kind, exp_kind: kind, at: res.at, expectation,
        input: { expectation, pageUrl: res.at, page: visibleText(res.html) }, input_provisional: true,
        gold, alt: [], danger_eligible: gold === 'false', why: res.why.replace(/([.!?…])"\.$/, '$1"'), evidence: res.evidence, absent: res.absent,
        html: res.html,
      });
    });
  }
  // Labelling batches must not see a base's items side by side: one fixed shuffle, then ids in that order.
  const order = rngFrom(`${SEED}:order`).shuffle(items);
  const lines = order.map((item, i) => {
    const n = String(i + 1).padStart(3, '0');
    const { html, ...rest } = item;
    writeFileSync(join(OUT_DIR, 'pages', `${n}.html`), html);
    return JSON.stringify({ id: `n6-${n}`, page: `pages/${n}.html`, ...rest });
  });
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  process.stdout.write(`${lines.length} items, ${new Set(items.map((i) => i.base)).size} bases -> ${OUT}\n`);
}

main();
