// n6 conditions: for one scenario S (a template's make), one condition and one expectation kind, the page html,
// where it is served, why its gold holds, and the strings the page must (evidence) and must not (absent) show.
import { esc, fill } from './n5-lib.mjs';
import { L } from './n5-lang.mjs';
import { bareError, barePage, blocker, errorBlock } from './n5-shell.mjs';
import { pageFmt } from './n6-fmt.mjs';
import { W } from './n6-lang.mjs';
import { loadingMain, loginMain, page } from './n6-page.mjs';

export const TRUE = ['paraphrase', 'translated', 'number_format', 'status_reached'];
export const FALSE = ['loading', 'queued', 'wrong_entity', 'near_miss', 'negation', 'login', 'error', 'partial'];

/** Which expectation each condition asks (main record, its result, its number, its status). */
export function expKind(cond, rng) {
  const pick = (...k) => rng.pick(k);
  switch (cond) {
    case 'paraphrase': return pick('main', 'res');
    case 'translated': return pick('main', 'res', 'status');
    case 'number_format': return 'num';
    case 'status_reached': return 'status';
    case 'loading': return pick('main', 'res', 'num');
    case 'queued': case 'partial': return 'res';
    case 'wrong_entity': return pick('main', 'res', 'status', 'num');
    case 'near_miss': return rng.chance(0.7) ? 'num' : 'status';
    case 'negation': return 'status'; // a refused record is still shown, so only its state can be denied
    default: return pick('main', 'res');
  }
}

/** Unrelated warning banners; on mail pages none that talks about attachments. */
const decoys = (S, lang) => L[lang].decoys.filter((d) => S.kind !== 'mail' || !/attach|вклад|anhang|adjunt|załącz/i.test(d));

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clock = (rng) => `${String(7 + rng.int(14)).padStart(2, '0')}:${String(rng.int(60)).padStart(2, '0')}`;

/** The record as the page shows it when everything went as expected. */
export function baseView(S, lang) {
  const f = S.f;
  return {
    ref: f.ref, who: f.who, num: pageFmt(S.spec, f.n, lang), si: S.target, stage: S.ladder[S.target], tone: 'ok',
    hasResult: true, note: null,
  };
}

/** A true page: the record at its target state with its result; some carry an unrelated warning banner. */
function truePage(S, lang, cond, kind, ctx, rng) {
  const ui = ctx.ui;
  const v = baseView(S, lang);
  const decoy = rng.chance(0.25) ? rng.pick(decoys(S, lang)) : null;
  const html = page(S, lang, v, ui, { stamp: clock(rng), banner: decoy ? `<div class="banner">${esc(decoy)}</div>` : '' });
  const t = S.en.thing;
  const tail = decoy ? `; the banner "${decoy}" is about something else` : '';
  let why;
  let evidence;
  if (cond === 'number_format') {
    why = `The page shows the ${S.en.num} of ${t} ${v.ref} as "${v.num}", the same value as "${ctx.numExp}" written another way${tail}.`;
    evidence = [v.ref, v.num];
  } else if (kind === 'status') {
    why = `The status of ${t} ${v.ref} reads "${v.stage}" and the progress list ticks it${tail}.`;
    evidence = [v.ref, v.stage];
  } else if (kind === 'res') {
    why = `The page shows ${t} ${v.ref} with its ${S.en.res} "${S.resText}"${tail}.`;
    evidence = [v.ref, S.resText];
  } else {
    why = `The page shows ${t} ${v.ref} (${v.who}) with status "${v.stage}"${tail}.`;
    evidence = [v.ref, v.stage];
  }
  return { html, at: S.at(v.ref), why, evidence, absent: [], decoy };
}

export { truePage, cap, clock };

/** A false page for one of the eight false conditions. `ctx`: { ui, numExp }. */
export function falsePage(S, lang, cond, kind, ctx, rng) {
  const ui = ctx.ui;
  const f = S.f;
  const T = L[lang];
  const t = S.en.thing;
  const v = baseView(S, lang);
  const stamp = clock(rng);
  const decoy = rng.chance(0.2) ? `<div class="banner">${esc(rng.pick(decoys(S, lang)))}</div>` : '';
  const at = S.at(f.ref);
  const out = (html, why, evidence, absent, a = at) => ({ html, at: a, why, evidence, absent });
  switch (cond) {
    case 'loading': {
      const ld = loadingMain(lang, S.loadTitle, rng);
      const html = page(S, lang, v, ui, { main: ld.html, stamp, aside: rng.chance(0.5) ? '' : undefined });
      return out(html, `The page only shows "${ld.text}" over empty placeholders; ${t} ${f.ref} itself is not shown yet.`, [ld.text], [f.ref, S.resText]);
    }
    case 'queued': {
      Object.assign(v, { si: 0, stage: S.ladder[0], tone: 'wait', hasResult: false, note: fill(S.queued, { ref: f.ref }) });
      return out(page(S, lang, v, ui, { stamp, banner: decoy }), `${cap(t)} ${f.ref} is only queued ("${v.note}"); no ${S.en.res} is on the page.`, [v.note], [S.resText]);
    }
    case 'partial': {
      Object.assign(v, { hasResult: false, note: fill(S.pend, { ref: f.ref }) });
      return out(page(S, lang, v, ui, { stamp, banner: decoy }), `${cap(t)} ${f.ref} is shown, but where its ${S.en.res} belongs the page says "${v.note}".`, [f.ref, v.note], [S.resText]);
    }
    case 'wrong_entity': {
      Object.assign(v, { ref: f.ref2, who: f.who2 });
      const html = page(S, lang, v, ui, { stamp, banner: decoy });
      return out(html, `The page is about ${t} ${f.ref2} (${f.who2}), not ${f.ref}.`, [f.ref2], [f.ref], S.at(f.ref2));
    }
    case 'near_miss': {
      if (kind === 'num') {
        v.num = pageFmt(S.spec, ctx.near, lang);
        const html = page(S, lang, v, ui, { stamp, banner: decoy });
        return out(html, `The page shows the ${S.en.num} of ${t} ${f.ref} as "${v.num}", not ${ctx.numExp}.`, [f.ref, v.num], [ctx.numExp, ctx.numPage]);
      }
      const k = S.target - 1;
      Object.assign(v, { si: k, stage: S.ladder[k], tone: 'wait', hasResult: false, note: null });
      const html = page(S, lang, v, ui, { stamp, banner: decoy });
      return out(html, `The status of ${t} ${f.ref} reads "${v.stage}", one step before "${S.ladder[S.target]}", which is not ticked.`, [f.ref, v.stage], [S.resText]);
    }
    case 'negation': {
      Object.assign(v, { si: 0, stage: S.neg[0], tone: 'bad', hasResult: false, note: fill(S.neg[1], { ref: f.ref }) });
      return out(page(S, lang, v, ui, { stamp }), `The page says "${v.note}" (status "${v.stage}").`, [v.note], [S.resText]);
    }
    case 'login': {
      const next = `/login?next=${encodeURIComponent(at)}`;
      if (rng.chance(0.65)) {
        const html = page(S, lang, v, ui, { main: loginMain(lang, ui, T), title: `${W[lang].loginTitle} | ${S.brand}`, aside: '', crumbs: null, noUser: true });
        return out(html, `The page is a sign-in form ("${W[lang].loginTitle}"); ${t} ${f.ref} is not shown.`, [W[lang].loginTitle], [f.ref], next);
      }
      const ld = loadingMain(lang, S.loadTitle, rng);
      const html = page(S, lang, v, ui, { main: ld.html, aside: '', overlay: blocker('session', lang, ui, rng), noUser: true });
      return out(html, `A "${T.sessionTitle}" sign-in box covers a page that has not loaded ${t} ${f.ref}.`, [T.sessionTitle], [f.ref]);
    }
    case 'error': {
      const err = rng.pick(T.errors);
      const code = `${100 + rng.int(900)}-${1000 + rng.int(9000)}`;
      const html = rng.chance(0.6)
        ? page(S, lang, v, ui, { main: errorBlock(lang, err, code, ui), title: `${err[1]} | ${S.brand}`, aside: '' })
        : barePage(lang, `${err[0]} ${err[1]}`, bareError(lang, err, code));
      return out(html, `The page is an error page (${err[0]} "${err[1]}"); ${t} ${f.ref} is not shown.`, [err[1]], [f.ref]);
    }
    default:
      throw new Error(`unknown condition ${cond}`);
  }
}
