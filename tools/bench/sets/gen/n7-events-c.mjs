// N7 concrete events: the expectation names quoted or specific content (a message's words, a reference, a query,
// an amount, a person). Expectations are English; on a uk/de/es page the content appears in that language.
import { L } from './n5-lang.mjs';
import { G } from './n7-lang.mjs';
import { busy, errCard, greetBlock, note, okCard, resultsBlock, showOk, totalBlock, totalPending } from './n7-events.mjs';

export const CONCRETE_FALSE = {
  greeting: ['wrong_entity', 'loading', 'name_only'],
  confirmation: ['wrong_entity', 'quoted_in_help', 'negated', 'loading'],
  error: ['wrong_entity', 'quoted_in_help', 'negated', 'loading'],
  results: ['wrong_entity', 'negated', 'loading'],
  total: ['wrong_entity', 'loading'],
};

/** The quoted form needs the page's own words, so it is used on English pages only. */
function expectationOf(S, lang, cat, form, greetText) {
  const c = S.cats[cat];
  const quote = form === 'quote';
  switch (cat) {
    case 'greeting': return quote ? `the greeting "${greetText}"` : `a greeting to ${S.first}`;
    case 'confirmation': return quote ? `the message "${c.ok}"` : c.spec;
    case 'error': return quote ? `the error "${c.e1}"` : c.spec;
    case 'results': return `search results for "${c.q}"`;
    case 'total': return quote ? `a total of ${c.val}` : c.spec;
    default: throw new Error(`no category ${cat}`);
  }
}

/** One concrete item's page slot: { slot, toast, why, condition, expectation, expect_form, user? }. */
export function concreteEvent(S, lang, cat, gold, cond, form, rng) {
  const c = S.cats[cat];
  const g = G[lang];
  const k = rng.int(g.greet.length);
  const greetText = g.greet[k](S.voc);
  const expectation = expectationOf(S, lang, cat, form, greetText);
  const out = (slot, why, extra = {}) => ({ slot, toast: '', why, condition: cond, expectation, expect_form: form, ...extra });
  if (gold === 'true') {
    switch (cat) {
      case 'greeting': return out(greetBlock(greetText), `The page greets ${S.first}: "${greetText}".`);
      case 'confirmation': { const s = showOk(c.ok, rng); return out(s.slot, `The page shows "${c.ok}"${s.toast ? ' in a status toast' : ''}.`, { toast: s.toast }); }
      case 'error': return out(errCard(c.e1), `The page shows the error "${c.e1}".`);
      case 'results': return out(resultsBlock(lang, c.q, c.rows), `The page lists ${c.rows.length} results for "${c.q}".`);
      case 'total': return out(totalBlock(c.label, c.val), `The page shows "${c.label}: ${c.val}"${lang === 'en' ? '' : ', the expected amount in local number format'}.`);
      default: throw new Error(`no category ${cat}`);
    }
  }
  switch (`${cat}:${cond}`) {
    case 'greeting:wrong_entity': {
      const [first, full, voc] = S.other;
      const t = g.greet[k](voc);
      return out(greetBlock(t), `The page is signed in as ${full} and greets ${first} ("${t}"), not ${S.first}.`, { user: full });
    }
    case 'greeting:loading': { const t = rng.pick(g.loadingPage); return out(busy(t), `The page only says "${t}"; no greeting is shown.`); }
    case 'greeting:name_only': return out('', `${S.first} is only named in the header ("${L[lang].signedIn} ${S.user}"); no greeting is shown.`);
    case 'confirmation:wrong_entity': { const s = showOk(c.wrong, rng); return out(s.slot, `The confirmation is for another item: "${c.wrong}".`, { toast: s.toast }); }
    case 'confirmation:negated': return out(errCard(c.neg), `The page says it failed: "${c.neg}".`);
    case 'confirmation:loading': return out(busy(c.pending), `It is still in progress ("${c.pending}"); no confirmation is shown.`);
    case 'confirmation:quoted_in_help': { const t = g.helpOk(c.ok); return out(note(t), `The words appear only in a tip about what will appear later ("${t}"); nothing is confirmed.`); }
    case 'error:wrong_entity': return out(errCard(c.e2), `The page shows a different error: "${c.e2}".`);
    case 'error:negated': return out(okCard(c.clear), `The page reports no problem ("${c.clear}").`);
    case 'error:loading': return out(busy(c.checking), `The page is still checking ("${c.checking}"); no error is shown.`);
    case 'error:quoted_in_help': { const t = g.helpErr(c.e1); return out(note(t), `The words appear only as an example in a tip ("${t}"); no error is shown.`); }
    case 'results:wrong_entity': return out(resultsBlock(lang, c.q2, c.rows2), `The results listed are for "${c.q2}"; none is for ${c.q}.`);
    case 'results:negated': { const t = g.noResults(c.q); return out(note(t), `The search for "${c.q}" found nothing ("${t}").`); }
    case 'results:loading': { const t = g.searching(c.q); return out(busy(t), `The search is still running ("${t}"); no results are listed.`); }
    case 'total:wrong_entity': return out(totalBlock(c.label, c.near), `The total shown is ${c.near}, not ${c.val}.`);
    case 'total:loading': return out(totalPending(c.label, c.pending), `The total is not computed yet ("${c.label}: ${c.pending}").`);
    default: throw new Error(`no concrete false ${cat}:${cond}`);
  }
}
