#!/usr/bin/env node
/*
  N5: outcome set (benchmark protocol 3.5, row N5, as amended by A1). 760 before/after pairs, every step a write
  with its acted element: true 400, false 360 (validation_error, still_loading, wrong_item, modal_blocked, no_op,
  error_page: 60 each). A base is one scenario (one before page); it holds at most 4 items and at most 2
  danger-eligible (false) ones: 180 bases carry 2 true + 2 false afters, 20 bases carry 2 true afters.

    node tools/bench/sets/gen/n5.mjs      (writes tools/bench/sets/n5/pages and tools/bench/sets/n5.draft.jsonl)

  Plain Node, no dependencies, fixed seed. Everything is synthetic: brands, people and places are made up, links
  are relative paths, and no page loads anything. The input texts are provisional (this generator's own reading
  of the HTML); the native capture replaces before, after and acted with what refsure reads through Orca.
*/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, refNo, rngFrom, sideText, visibleText } from './n5-lib.mjs';
import { L } from './n5-lang.mjs';
import { banner, bareError, barePage, blocker, busyStrip, errorBlock, makeUi, shell, toast } from './n5-shell.mjs';
import { TEMPLATES } from './n5-templates.mjs';

const SEED = 'refsure-bench-n5-20261016';
const HERE = dirname(fileURLToPath(import.meta.url));
const SETS = join(HERE, '..');
const OUT_DIR = join(SETS, 'n5');
const OUT = join(SETS, 'n5.draft.jsonl');

export const TRUE = ['landed_toast', 'landed_quiet', 'landed_confirm', 'landed_decoy'];
export const FALSE = ['validation_error', 'still_loading', 'wrong_item', 'modal_blocked', 'no_op', 'error_page'];
const BASES = 200;
const FULL = 180; // bases with 2 true + 2 false; the other 20 carry 2 true
const LANGS = { en: 100, uk: 50, de: 17, es: 17, pl: 16 };
const TRUE_PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

// ---------- plan: one row per base ----------
function plan() {
  const rng = rngFrom(`${SEED}:plan`);
  const langs = rng.shuffle(Object.entries(LANGS).flatMap(([l, n]) => Array(n).fill(l)));
  const turn = {};
  const rows = [];
  for (let j = 0; j < BASES; j += 1) {
    const lang = langs[j];
    const able = TEMPLATES.filter((t) => t.langs.includes(lang));
    turn[lang] = (turn[lang] ?? rng.int(able.length)) + 1;
    const tpl = able[turn[lang] % able.length];
    const tp = j < 198 ? TRUE_PAIRS[j % 6] : TRUE_PAIRS[j - 198];
    const conds = tp.map((i) => TRUE[i]);
    if (j < FULL) {
      const a = j % 6;
      const b = (a + 1 + (Math.floor(j / 6) % 5)) % 6;
      conds.push(FALSE[a], FALSE[b]);
    }
    const il = lang !== 'en' && rng.chance(0.35) ? 'en' : lang;
    rows.push({ base: `b${String(j + 1).padStart(3, '0')}`, lang, il, tpl, conds });
  }
  return rows;
}

// ---------- rendering ----------
function page(S, lang, state, ui, extra = {}) {
  const main = `${extra.pre ?? ''}${S.main(state, ui)}${extra.post ?? ''}`;
  return shell({
    kind: S.kind, lang, brand: S.brand, title: S.title, nav: S.nav, slug: S.slug, user: S.user, crumbs: S.crumbs,
    ui, main, aside: S.aside(state, ui), toast: extra.toast, banner: extra.banner, overlay: extra.overlay,
  });
}

const BLOCKERS = ['session', 'session', 'reauth', 'reauth', 'code', 'confirm', 'confirm'];
const BLOCK_TITLE = { session: 'sessionTitle', reauth: 'reauthTitle', code: 'codeTitle', confirm: 'confirmTitle' };

/** One after page for a condition: its html, where it is served, and why its gold holds. */
function after(S, lang, cond, rng) {
  const T = L[lang];
  const ui = makeUi(rng);
  const at = S.doneAt ?? S.at;
  const w = S.why;
  switch (cond) {
    case 'landed_toast':
      return { html: page(S, lang, 'done', ui, { toast: toast(S.ok) }), at, why: `A confirmation "${S.ok}" appears and ${w.change}.` };
    case 'landed_quiet':
      return { html: page(S, lang, 'done', ui), at, why: `No message appears, but ${w.change}.` };
    case 'landed_confirm': {
      const html = shell({
        kind: S.kind, lang, brand: S.brand, title: S.confirm.title, nav: S.nav, slug: S.slug, user: S.user, ui,
        main: S.confirm.main(ui), aside: S.confirm.aside ? S.confirm.aside(ui) : S.aside('done', ui),
      });
      return { html, at: S.confirm.at, why: `The step opens a page that ${w.confirm}.` };
    }
    case 'landed_decoy': {
      const decoy = rng.pick(T.decoys);
      const t = rng.chance(0.5) ? toast(S.ok) : '';
      return { html: page(S, lang, 'done', ui, { banner: banner(decoy), toast: t }), at, why: `${cap(w.change)}; the notice "${decoy}" is about something else.`, decoy };
    }
    case 'validation_error': {
      const pre = !S.ownSummary && rng.chance(0.5) ? `<div class="errsum" role="alert">${esc(T.fixErrors)}</div>` : '';
      const draft = S.drafty === true && rng.chance(0.4);
      const post = draft ? `<p class="muted">${esc(T.draftSaved)}</p>` : '';
      return { html: page(S, lang, 'invalid', ui, { pre, post }), at, why: `The page shows the error "${S.invalid}" and ${w.unchanged}${draft ? ' (the draft note is local, not the save)' : ''}.` };
    }
    case 'still_loading': {
      const strip = busyStrip(lang, rng);
      const shown = visibleText(strip).split('\n')[0];
      return { html: page(S, lang, 'before', ui, { pre: strip }), at, why: `The page still says "${shown}" and ${w.unchanged}.` };
    }
    case 'wrong_item': {
      const t = rng.chance(0.6) ? toast(S.bad) : '';
      return { html: page(S, lang, 'wrong', ui, { toast: t }), at, why: `${cap(w.wrong)}${t ? ` (the message says "${S.bad}")` : ''}, which is not what the intent asked for.` };
    }
    case 'modal_blocked': {
      const kind = rng.pick(BLOCKERS);
      const overlay = blocker(kind, lang, ui, rng, S.confirmQ);
      return { html: page(S, lang, 'before', ui, { overlay }), at, why: `An overlay "${T[BLOCK_TITLE[kind]]}" stands in the way and ${w.unchanged}.` };
    }
    case 'no_op': {
      const v = rng.int(3);
      const note = rng.pick(S.noop ?? [T.noChanges, T.lastSaved]);
      if (v === 2) return { html: page(S, lang, 'before', ui), at, why: `The after page reads exactly like the before page: ${w.unchanged}.` };
      const extra = v === 0 ? { pre: `<p class="muted" role="status">${esc(note)}</p>` } : { toast: toast(note) };
      return { html: page(S, lang, 'before', ui, extra), at, why: `Nothing changed: the page only adds "${note}" and ${w.unchanged}.` };
    }
    case 'error_page': {
      const err = rng.pick(T.errors);
      const ref = `${refNo(rng, 4)}-${refNo(rng, 6)}`;
      const html = rng.chance(0.6)
        ? shell({ kind: S.kind, lang, brand: S.brand, title: err[1], nav: S.nav, slug: S.slug, user: S.user, ui, main: errorBlock(lang, err, ref, ui) })
        : barePage(lang, `${err[0]} ${err[1]}`, bareError(lang, err, ref));
      return { html, at: S.errAt ?? S.at, why: `The step ends on an error page (${err[0]} "${err[1]}"), so the intended change is not shown.` };
    }
    default:
      throw new Error(`unknown condition ${cond}`);
  }
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The provisional acted line in line format v1; the capture rebuilds it from refsure's own snapshot.
function actedLine(html, acted) {
  const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(html.split(`id="${acted.selector.slice(1)}"`)[0]);
  const path = h1 ? `main > heading ${JSON.stringify(visibleText(h1[1]))}` : 'main';
  return `${acted.role} ${JSON.stringify(acted.name)} in=${JSON.stringify(path)}`;
}

// Which of the page's controls with the same role and name the acted one is (1-based, document order).
function ordinalOf(html, acted) {
  const tag = acted.role === 'link' ? 'a' : 'button';
  const re = new RegExp(`<${tag}\\b[^>]*\\bid="([^"]+)"[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let n = 0;
  for (const m of html.matchAll(re)) {
    if (visibleText(m[2]) !== acted.name) continue;
    n += 1;
    if (`#${m[1]}` === acted.selector) return n;
  }
  throw new Error(`acted ${acted.selector} not found`);
}

function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  const items = [];
  for (const row of plan()) {
    const rng = rngFrom(`${SEED}:${row.base}`);
    const S = row.tpl.make(rng, row.lang, row.il);
    const ui = makeUi(rngFrom(`${SEED}:${row.base}:before`));
    const before = page(S, row.lang, 'before', ui);
    const ref = ui.actedRef();
    if (!ref) throw new Error(`${row.base}: no acted control`);
    const acted = { ...ref, ordinal: ordinalOf(before, ref) };
    const dir = join(OUT_DIR, 'pages', row.base.slice(1));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'before.html'), before);
    row.conds.forEach((cond, k) => {
      const a = after(S, row.lang, cond, rngFrom(`${SEED}:${row.base}:${k}`));
      const file = `after-${k + 1}.html`;
      writeFileSync(join(dir, file), a.html);
      const gold = TRUE.includes(cond) ? 'true' : 'false';
      const pageB = `pages/${row.base.slice(1)}/before.html`;
      const pageA = `pages/${row.base.slice(1)}/${file}`;
      items.push({
        page: pageB, site: 'outcome', lang: row.lang, intent_lang: row.il, source: 'synthetic', condition: cond,
        base: row.base, template: row.tpl.id, kind: S.kind, risk: 'write',
        before: { page: pageB, at: S.at }, after: { page: pageA, at: a.at },
        acted_element: acted,
        input: { intent: S.intent, acted: actedLine(before, acted), before: sideText(S.at, before), after: sideText(a.at, a.html) },
        input_provisional: true, gold, alt: [], danger_eligible: gold === 'false', why: a.why,
      });
    });
  }
  // Labelling batches must not see a base's items side by side: one fixed shuffle, then ids in that order.
  const order = rngFrom(`${SEED}:order`).shuffle(items);
  const lines = order.map((item, i) => JSON.stringify({ id: `n5-${String(i + 1).padStart(3, '0')}`, ...item }));
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  process.stdout.write(`${lines.length} items, ${new Set(items.map((i) => i.base)).size} bases -> ${OUT}\n`);
}

main();
