#!/usr/bin/env node
/*
  N7: presence wording-ablation set (benchmark protocol 2.5 and 3.5, row N7). 120 items: 60 abstract-category
  expectations ("a greeting", "a confirmation", "an error message", "search results", "a total amount") and 60
  concrete ones (a quoted message, a reference, a query, an amount, a person); each half 30 true / 30 false.
  A base is one scenario (template, brand, people, references) in one language; it holds 2 items, one abstract
  and one concrete, each on its own page.

    node tools/bench/sets/gen/n7.mjs      (writes tools/bench/sets/n7/pages and tools/bench/sets/n7.draft.jsonl)

  Plain Node, no dependencies, fixed seed. Everything is synthetic; links are relative paths, page URLs use
  example.test, and no page loads anything. `input` is provisional (this generator's reading of the HTML); the
  native capture replaces pageUrl and page with what refsure reads through Orca.
*/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rngFrom, visibleText } from './n5-lib.mjs';
import { makeUi, shell } from './n5-shell.mjs';
import { ABSTRACT_FALSE, abstractEvent } from './n7-events.mjs';
import { CONCRETE_FALSE, concreteEvent } from './n7-events-c.mjs';
import { TEMPLATES } from './n7-templates.mjs';

const SEED = 'refsure-bench-n7-20261016';
const HERE = dirname(fileURLToPath(import.meta.url));
const SETS = join(HERE, '..');
const OUT_DIR = join(SETS, 'n7');
const OUT = join(SETS, 'n7.draft.jsonl');
const PER_TPL = { en: 3, other: 2 };
// Gold pairs (abstract, concrete) per language, so that every kind x gold cell holds 30 and each language splits evenly.
const PAIRS = {
  en: [...Array(9).fill('TT'), ...Array(9).fill('TF'), ...Array(9).fill('FT'), ...Array(9).fill('FF')],
  uk: ['TT', 'TT', 'TT', 'TF', 'TF', 'TF', 'FT', 'FT', 'FT', 'FF', 'FF', 'FF'],
  de: ['TT', 'FF', 'TF', 'TF', 'FT', 'FT'],
  es: ['TT', 'TT', 'FF', 'FF', 'TF', 'FT'],
};

function plan() {
  const rng = rngFrom(`${SEED}:plan`);
  const slots = TEMPLATES.flatMap((tpl) => [
    ...Array(PER_TPL.en).fill(0).map(() => ({ tpl, lang: 'en' })),
    ...Array(PER_TPL.other).fill(0).map(() => ({ tpl, lang: tpl.langs[1] })),
  ]);
  const pools = Object.fromEntries(Object.entries(PAIRS).map(([l, p]) => [l, rng.shuffle(p)]));
  return slots.map((s, j) => {
    const pair = pools[s.lang].pop();
    if (!pair) throw new Error(`no gold pair left for ${s.lang}`);
    return { ...s, base: `b${String(j + 1).padStart(3, '0')}`, ga: pair[0] === 'T' ? 'true' : 'false', gc: pair[1] === 'T' ? 'true' : 'false' };
  });
}

// Categories are chosen greedily so that within each kind every category holds about as many true as false
// items (category never stands in for gold); the two items of a base prefer different categories.
const catCount = new Map();
function chooseCat(tpl, kind, gold, avoid, rng) {
  const n = (c) => (catCount.get(`${kind}:${c}:${gold}`) ?? 0) + (c === avoid ? 2 : 0);
  const best = Math.min(...tpl.cats.map(n));
  const cat = rng.pick(tpl.cats.filter((c) => n(c) === best));
  catCount.set(`${kind}:${cat}:${gold}`, (catCount.get(`${kind}:${cat}:${gold}`) ?? 0) + 1);
  return cat;
}

// Conditions cycle per (kind, category) so every category gets every false condition in turn.
const cycles = new Map();
function nextOf(key, list) {
  const n = cycles.get(key) ?? 0;
  cycles.set(key, n + 1);
  return list[n % list.length];
}

function render(S, lang, ev, rng) {
  const ui = makeUi(rng);
  return shell({
    kind: S.kind, lang, brand: S.brand, title: S.title, nav: S.nav, slug: S.slug, user: ev.user ?? S.user, crumbs: S.crumbs,
    ui, main: S.body(ev.slot, ui), aside: S.aside(ui), toast: ev.toast || undefined,
  });
}

function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(join(OUT_DIR, 'pages'), { recursive: true });
  const items = [];
  const pickRng = rngFrom(`${SEED}:categories`);
  for (const row of plan()) {
    const S = row.tpl.make(rngFrom(`${SEED}:${row.base}`), row.lang);
    let prev = null;
    for (const kind of ['abstract', 'concrete']) {
      const gold = kind === 'abstract' ? row.ga : row.gc;
      const cat = chooseCat(row.tpl, kind, gold, prev, pickRng);
      prev = cat;
      const rng = rngFrom(`${SEED}:${row.base}:${kind}`);
      let ev;
      if (kind === 'abstract') {
        const cond = gold === 'true' ? (row.lang === 'en' ? 'category_shown' : 'category_translated') : nextOf(`a:${cat}`, ABSTRACT_FALSE[cat]);
        ev = abstractEvent(S, row.lang, cat, gold, cond, rng);
      } else {
        const form = row.lang !== 'en' ? 'specific' : nextOf(`form:${gold}`, ['quote', 'specific']);
        const cond = gold === 'true' ? (row.lang !== 'en' ? 'specific_translated' : form === 'quote' ? 'exact_quote' : 'specific') : nextOf(`c:${cat}`, CONCRETE_FALSE[cat]);
        ev = concreteEvent(S, row.lang, cat, gold, cond, form, rng);
      }
      const html = render(S, row.lang, ev, rngFrom(`${SEED}:${row.base}:${kind}:ui`));
      items.push({ html, row, S, kind, cat, gold, ev });
    }
  }
  const order = rngFrom(`${SEED}:order`).shuffle(items);
  const lines = order.map(({ html, row, S, kind, cat, gold, ev }, i) => {
    const n = String(i + 1).padStart(3, '0');
    writeFileSync(join(OUT_DIR, 'pages', `${n}.html`), html);
    const pageUrl = `https://${S.host}.example.test${S.at}`;
    return JSON.stringify({
      id: `n7-${n}`, page: `pages/${n}.html`, site: 'presence', lang: row.lang, expect_lang: 'en', source: 'synthetic',
      condition: ev.condition, kind, category: cat, ...(ev.expect_form ? { expect_form: ev.expect_form } : {}),
      base: row.base, template: row.tpl.id, page_kind: S.kind, expectation: ev.expectation,
      input: { expectation: ev.expectation, pageUrl, page: visibleText(html) }, input_provisional: true,
      gold, alt: [], danger_eligible: gold === 'false', why: ev.why,
    });
  });
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  process.stdout.write(`${lines.length} items, ${new Set(items.map((x) => x.row.base)).size} bases -> ${OUT}\n`);
}

main();
