// N7 events: the block a page shows in its slot for one (category, gold, condition), the expectation asked,
// and a `why` that quotes the page. Abstract items here; concrete ones in n7-events-c.mjs.
import { esc } from './n5-lib.mjs';
import { L } from './n5-lang.mjs';
import { ABSTRACT, G, NOUN } from './n7-lang.mjs';

// ---------- blocks ----------
export const greetBlock = (t) => `<h2 class="hello">${esc(t)}</h2>`;
export const okCard = (t) => `<div class="card" role="status"><strong>${esc(t)}</strong></div>`;
export const errCard = (t) => `<div class="errsum" role="alert">${esc(t)}</div>`;
export const note = (t) => `<p class="muted">${esc(t)}</p>`;
export const busy = (t) => `<div class="busy" role="status" aria-busy="true"><strong>${esc(t)}</strong></div>`;
export const okToast = (t) => `<div class="toast" role="status">${esc(t)}</div>`;
export function resultsBlock(lang, q, rows) {
  const items = rows.map((r) => `<li>${esc(r)}</li>`).join('');
  return `<section class="card"><h2>${esc(G[lang].resultsFor(q, rows.length))}</h2><ol>${items}</ol></section>`;
}
export const totalBlock = (label, val) => `<div class="card"><strong>${esc(label)}: ${esc(val)}</strong></div>`;
export const totalPending = (label, text) => `<div class="card">${esc(label)}: <em>${esc(text)}</em></div>`;

/** A shown confirmation sits in the page or in a toast; returns { slot, toast }. */
export const showOk = (t, rng) => (rng.chance(0.4) ? { slot: '', toast: okToast(t) } : { slot: okCard(t), toast: '' });

export const ABSTRACT_FALSE = {
  greeting: ['name_only', 'loading'],
  confirmation: ['loading', 'other_category', 'mention_only', 'negation'],
  error: ['loading', 'other_category', 'mention_only', 'negation'],
  results: ['loading', 'negation', 'mention_only', 'other_category'],
  total: ['loading', 'mention_only'],
};

/** One abstract item's page slot: { slot, toast, why, condition, expectation }. */
export function abstractEvent(S, lang, cat, gold, cond, rng) {
  const expectation = rng.pick(ABSTRACT[cat]);
  const noun = NOUN[cat];
  const g = G[lang];
  const c = S.cats[cat];
  const out = (slot, why, toast = '') => ({ slot, toast, why, condition: cond, expectation });
  if (gold === 'true') {
    switch (cat) {
      case 'greeting': { const t = rng.pick(g.greet)(S.voc); return out(greetBlock(t), `The page greets the user: "${t}".`); }
      case 'confirmation': { const s = showOk(c.ok, rng); return out(s.slot, `The page confirms the action${s.toast ? ' in a status toast' : ''}: "${c.ok}".`, s.toast); }
      case 'error': return out(errCard(c.e1), `The page shows the error "${c.e1}".`);
      case 'results': return out(resultsBlock(lang, c.q, c.rows), `The page lists ${c.rows.length} results for "${c.q}".`);
      case 'total': return out(totalBlock(c.label, c.val), `The page shows the total "${c.label}: ${c.val}".`);
      default: throw new Error(`no category ${cat}`);
    }
  }
  const none = `no ${noun} is on the page`;
  switch (`${cat}:${cond}`) {
    case 'greeting:name_only': return out('', `The user is only named in the header ("${L[lang].signedIn} ${S.user}"); ${none}.`);
    case 'greeting:loading': { const t = rng.pick(g.loadingPage); return out(busy(t), `The page only says "${t}"; ${none}.`); }
    case 'confirmation:loading': return out(busy(c.pending), `The action is still in progress ("${c.pending}"); ${none}.`);
    case 'confirmation:other_category': { const t = S.cats.error ? S.cats.error.e1 : c.neg; return out(errCard(t), `The page shows an error instead ("${t}"); ${none}.`); }
    case 'confirmation:mention_only': return out(note(c.mention), `The page only says a confirmation will come ("${c.mention}"); ${none}.`);
    case 'confirmation:negation': return out(errCard(c.neg), `The page says the action failed ("${c.neg}"); ${none}.`);
    case 'error:loading': return out(busy(c.checking), `The page is still checking ("${c.checking}"); ${none}.`);
    case 'error:other_category': { const t = S.cats.confirmation ? S.cats.confirmation.ok : c.clear; return out(okCard(t), `The page shows a success message ("${t}"); ${none}.`); }
    case 'error:mention_only': return out(note(c.mention), `The page only describes where errors would appear ("${c.mention}"); ${none}.`);
    case 'error:negation': return out(okCard(c.clear), `The page says there is no problem ("${c.clear}"); ${none}.`);
    case 'results:loading': { const t = g.searching(c.q); return out(busy(t), `The search is still running ("${t}"); ${none}.`); }
    case 'results:negation': { const t = g.noResults(c.q); return out(note(t), `The search found nothing ("${t}"); ${none}.`); }
    case 'results:mention_only': return out(note(g.resultsMention), `No search has run; the page only explains where results would appear; ${none}.`);
    case 'results:other_category': return out(errCard(g.searchDown), `The page says search is unavailable ("${g.searchDown}"); ${none}.`);
    case 'total:loading': return out(totalPending(c.label, c.pending), `The total is not computed yet ("${c.label}: ${c.pending}"); ${none}.`);
    case 'total:mention_only': return out(totalPending(c.label, c.mention), `The page only says when the total will be shown ("${c.mention}"); ${none}.`);
    default: throw new Error(`no abstract false ${cat}:${cond}`);
  }
}
