// Template forum-thread: a hobby forum thread with a reply box and a forum search. Categories: results (thread
// search), confirmation (reply posted), error (reply rejected), greeting. Posts carry no greetings.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { people, refDigits } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Spokes & Gears', 'The Potting Shed Forum', 'Darkroom Talk'], nav: ['Forums', 'New posts', 'Members', 'Rules'],
    users: [['Harriet', 'harriet_k'], ['Milo', 'milo_rides'], ['Esme', 'esme.grows'], ['Jude', 'jude_f8']],
    topic: ['Best way to store seeds over winter?', 'Squeaky disc brakes after rain', 'Fixer keeps going cloudy'], crumbs: ['Forums', 'Help and advice'],
    posts: [['moss_and_fern', 'Paper envelopes in a tin, kept somewhere cool and dry, has worked for me for years.'], ['old_tom', 'Label everything with the date. Most seeds stay fine for two or three seasons.']],
    reply: 'Your reply', draft: 'I tried the tin method last year and it worked well.', post: 'Post reply', search: 'Search forums', ph: 'keywords', side: ['Forum rules', 'Be kind', 'No selling in help threads', 'Search before you post'],
    ok: 'Your reply was posted as #{r}', neg: 'Your reply could not be posted.', pending: 'Posting your reply…', mention: 'Your reply will appear at the end of the thread once it is posted.',
    e1: 'Reply rejected: links are not allowed until you have 10 posts.', e2: 'Reply rejected: this thread is locked.',
    clear: 'Your reply meets the forum rules. No problems found.', checking: 'Checking your reply against the forum rules…', emention: 'If your reply breaks a rule, we will tell you which one here.',
    errSpec: 'an error saying links are not allowed until 10 posts',
    q: ['tomato blight', 'tubeless tyres', 'film scanner'], rows: { 'tomato blight': ['Tomato blight: is it safe to compost the plants?', 'Early signs of tomato blight (photos)', 'Blight-resistant tomato varieties for 2026'], 'tubeless tyres': ['Tubeless tyres keep losing pressure', 'Sealant recommendations for tubeless tyres'], 'film scanner': ['Which film scanner for 35 mm negatives?', 'Film scanner dust removal settings', 'Selling my old film scanner? (moved to Marketplace)'] },
  },
  de: {
    brands: ['Speichen & Zahnräder', 'Gartenlaube Forum', 'Dunkelkammer-Treff'], nav: ['Foren', 'Neue Beiträge', 'Mitglieder', 'Regeln'],
    users: [['Hanna', 'hanna_k'], ['Moritz', 'moritz_faehrt'], ['Emma', 'emma.gruen'], ['Jakob', 'jakob_f8']],
    topic: ['Saatgut über den Winter lagern?', 'Scheibenbremsen quietschen nach Regen', 'Fixierbad wird immer trüb'], crumbs: ['Foren', 'Hilfe und Rat'],
    posts: [['moos_und_farn', 'Papiertüten in einer Blechdose, kühl und trocken gelagert, funktionieren bei mir seit Jahren.'], ['alter_tom', 'Alles mit Datum beschriften. Die meisten Samen halten zwei bis drei Saisons.']],
    reply: 'Deine Antwort', draft: 'Ich habe die Dosen-Methode letztes Jahr ausprobiert, klappt gut.', post: 'Antwort senden', search: 'Foren durchsuchen', ph: 'Stichwörter', side: ['Forenregeln', 'Freundlich bleiben', 'Kein Verkauf in Hilfe-Themen', 'Erst suchen, dann posten'],
    ok: 'Deine Antwort wurde als #{r} veröffentlicht', neg: 'Deine Antwort konnte nicht veröffentlicht werden.', pending: 'Antwort wird gesendet…', mention: 'Deine Antwort erscheint am Ende des Themas, sobald sie veröffentlicht ist.',
    e1: 'Antwort abgelehnt: Links sind erst ab 10 Beiträgen erlaubt.', e2: 'Antwort abgelehnt: Dieses Thema ist geschlossen.',
    clear: 'Deine Antwort entspricht den Forenregeln. Keine Probleme gefunden.', checking: 'Antwort wird anhand der Forenregeln geprüft…', emention: 'Verstößt deine Antwort gegen eine Regel, steht hier, gegen welche.',
    errSpec: 'an error saying links are not allowed until 10 posts',
    q: ['Kraut- und Braunfäule', 'Tubeless-Reifen', 'Filmscanner'], rows: { 'Kraut- und Braunfäule': ['Kraut- und Braunfäule: Pflanzen auf den Kompost?', 'Erste Anzeichen von Kraut- und Braunfäule (Fotos)', 'Robuste Tomatensorten gegen Kraut- und Braunfäule'], 'Tubeless-Reifen': ['Tubeless-Reifen verlieren ständig Luft', 'Welche Dichtmilch für Tubeless-Reifen?'], Filmscanner: ['Welcher Filmscanner für 35-mm-Negative?', 'Staubentfernung beim Filmscanner einstellen', 'Alten Filmscanner verkaufen? (verschoben)'] },
  },
};

export const forumThread = {
  id: 'forum-thread', kind: 'forum', langs: ['en', 'de'], cats: ['results', 'confirmation', 'error', 'greeting'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const r = refDigits(rng, 5);
    const r2 = String(Number(r) + 1 + rng.int(8));
    const topic = v.topic[0]; // the posts answer this topic
    const [q, q2] = rng.shuffle(Object.keys(v.rows));
    return {
      kind: 'forum', brand, title: `${topic} · ${brand}`, at: `/t/${r.slice(0, 3)}`, host: 'forum', nav: v.nav, slug: 'forum', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        const posts = v.posts.map(([who, text]) => `<div class="card"><p class="muted">${esc(who)}</p><p>${esc(text)}</p></div>`).join('');
        return `<h1>${esc(topic)}</h1>${slot}${posts}${ui.input(v.reply, v.draft, { area: true })}<p>${ui.btn(v.post, { pri: true })}</p>`;
      },
      aside(ui) { return `<section><h3>${esc(v.search)}</h3><input type="search" value="" placeholder="${esc(v.ph)}"></section>${box(v.side[0], list(v.side.slice(1).map((x) => ui.a(x, '/rules'))))}`; },
      cats: {
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
        confirmation: { ok: v.ok.replace('{r}', r), wrong: v.ok.replace('{r}', r2), neg: v.neg, pending: v.pending, mention: v.mention, spec: `a confirmation that the reply was posted as #${r}` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
      },
    };
  },
};
