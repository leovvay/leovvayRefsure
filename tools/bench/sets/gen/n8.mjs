#!/usr/bin/env node
/*
  N8: option-map set (benchmark protocol 3.5, row N8). 300 select/combobox fields, 60 per language (en, uk, de, es,
  pl); gold `none` 60 (none_absent 30, none_near 30); gold option 240 (translated, code, paraphrase, fold_near,
  format, long_list: 40 each, 8 per language). Fold-near look-alikes (Slovakia/Slovenia, 3.2/3.12, Team monthly or
  yearly) sit beside the gold, or alone when the gold is none. A base is one (language, template, domain) scenario
  and holds at most 4 items.

    node tools/bench/sets/gen/n8.mjs      (writes tools/bench/sets/n8/pages and tools/bench/sets/n8.draft.jsonl)

  Plain Node, no dependencies, fixed seed. Everything is synthetic: brands and people are made up, links are relative
  paths, and no page loads anything. `input.field` and the option order are provisional (this generator's reading
  of the page, ranked as `pick-option` ranks); the native capture replaces them with refsure's own reading.
*/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COND_DOMAINS, DOMAINS, GOLD_CONDS, PLACEHOLDER } from './n8-domains.mjs';
import { LANGS, fieldLine, ranked, rngFrom } from './n8-lib.mjs';
import { makeUi, page, targetField } from './n8-page.mjs';
import { TEMPLATES } from './n8-templates.mjs';
import { makeCase } from './n8-want.mjs';

const SEED = 'refsure-bench-n8-20261016';
const HERE = dirname(fileURLToPath(import.meta.url));
const SETS = join(HERE, '..');
const OUT_DIR = join(SETS, 'n8');
const OUT = join(SETS, 'n8.draft.jsonl');
const PER_LANG = { ...Object.fromEntries(GOLD_CONDS.map((c) => [c, 8])), none_absent: 6, none_near: 6 };
const BASE_MAX = 4;

// ---------- plan: one row per item, then bases ----------
function plan() {
  const rng = rngFrom(`${SEED}:plan`);
  const hosts = (d) => TEMPLATES.filter((t) => d in t.hosts);
  const turnT = {};
  const rows = [];
  for (const lang of LANGS) {
    for (const [cond, n] of Object.entries(PER_LANG)) {
      const doms = rng.shuffle(COND_DOMAINS[cond].filter((d) => hosts(d).length > 0));
      for (let k = 0; k < n; k += 1) {
        const dom = doms[k % doms.length];
        const able = hosts(dom);
        turnT[dom] = (turnT[dom] ?? rng.int(able.length)) + 1;
        rows.push({ lang, cond, dom, tpl: able[turnT[dom] % able.length] });
      }
    }
  }
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.lang}|${r.tpl.id}|${r.dom}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  let b = 0;
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += BASE_MAX) {
      b += 1;
      for (const r of list.slice(i, i + BASE_MAX)) r.base = `n8b-${String(b).padStart(3, '0')}`;
    }
  }
  return rows;
}

// ---------- one item ----------
function build(row, k, used) {
  const rng = rngFrom(`${SEED}:${k}:${row.lang}:${row.cond}:${row.dom}`);
  const c = makeCase(row.dom, row.cond, row.lang, rng, used);
  const S = row.tpl.make(rng, row.lang, row.dom);
  const ui = makeUi(rngFrom(`${SEED}:${k}:ui`));
  const label = (row.tpl.hosts[row.dom] ?? DOMAINS[row.dom].label)[row.lang];
  const placeholder = rng.chance(0.5) ? PLACEHOLDER[row.lang] : null;
  const others = c.options.filter((o) => !c.gold || o.v !== c.gold.v);
  const selected = !placeholder && rng.chance(0.4) ? rng.pick(others).v : undefined;
  // A custom listbox carries more markup per option; lists past 30 stay native selects (the page stays near 8 KB).
  const widget = c.options.length <= 30 && rng.chance(0.3) ? 'listbox' : 'select';
  const id = `f${50 + rng.int(40)}`;
  const field = targetField({ id, label, opts: c.options, placeholder, widget, selected, help: S.help?.[row.dom] });
  const html = page(S, row.lang, field, ui);
  const texts = [...(placeholder ? [placeholder] : []), ...c.options.map((o) => o.text)];
  const options = ranked(texts, c.want);
  const goldText = c.gold ? c.gold.l[row.lang] : null;
  return {
    html,
    item: {
      site: 'option-map', lang: row.lang, want_lang: c.wl, source: 'synthetic', condition: row.cond, base: row.base,
      template: row.tpl.id, kind: S.kind, domain: row.dom, widget,
      field_ref: { selector: `#${id}`, role: 'combobox', name: label },
      input: { field: fieldLine(html, id, label, S.fieldInMain !== false), want: c.want, options },
      input_provisional: true,
      gold: c.gold ? { value: c.gold.v, text: goldText } : 'none',
      gold_index: c.gold ? options.indexOf(goldText) : null,
      alt: [], danger_eligible: !c.gold,
      why: `In the field "${label}": ${c.why(goldText)}`,
    },
  };
}

function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(join(OUT_DIR, 'pages'), { recursive: true });
  const used = new Set();
  const built = plan().map((row, k) => build(row, k, used));
  // Labelling batches must not see a base's items side by side: one fixed shuffle, then ids and pages in that order.
  const order = rngFrom(`${SEED}:order`).shuffle(built);
  const lines = order.map(({ html, item }, i) => {
    const nnn = String(i + 1).padStart(3, '0');
    writeFileSync(join(OUT_DIR, 'pages', `${nnn}.html`), html);
    return JSON.stringify({ id: `n8-${nnn}`, page: `pages/${nnn}.html`, ...item });
  });
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  const big = order.filter((b) => Buffer.byteLength(b.html) > 8192).length;
  process.stdout.write(`${lines.length} items, ${new Set(order.map((b) => b.item.base)).size} bases, ${big} pages over 8 KiB -> ${OUT}\n`);
}

main();
