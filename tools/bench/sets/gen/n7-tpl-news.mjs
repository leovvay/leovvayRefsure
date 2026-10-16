// Template news-search: a regional news site's search and newsletter page. Categories: results (article search),
// confirmation (newsletter subscription), error (subscription refused), greeting. A "Most read" box is a decoy list.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { people } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['The Valley Ledger', 'Riverside Courier', 'Hollow Bay Post'], nav: ['Local', 'Business', 'Culture', 'Sport', 'Opinion'],
    users: [['Clara', 'Clara Webb'], ['Daniel', 'Daniel Ashe'], ['Rosa', 'Rosa Kim'], ['Peter', 'Peter Dunmore']],
    h: 'Search the archive', crumbs: ['Home', 'Search'], ph: 'Search articles', go: 'Search', since: 'Archive covers stories from 2009 onwards.',
    nl: 'Morning Briefing newsletter', nlBody: 'The day’s top local stories, every weekday at 7am.', sub: 'Subscribe', most: 'Most read',
    reads: ['Council approves new cycle lanes on Mill Road', 'Harvest fair returns to the common this weekend', 'Library extends evening hours'],
    ok: 'You’re subscribed to {n}', neg: 'Your subscription to {n} did not go through.', pending: 'Signing you up…', mention: 'We’ll show a confirmation here once your subscription is active.',
    e1: 'Subscription failed: this email address has been unsubscribed and must be re-confirmed by email first.', e2: 'Subscription failed: the newsletter is paused during the holidays.',
    clear: 'Your email address is valid. No problems found.', checking: 'Checking your email address…', emention: 'If we cannot sign you up, the reason will be shown here.',
    errSpec: 'an error saying the address must be re-confirmed by email first', nls: ['Morning Briefing', 'Weekend Reads', 'Business Daily'],
    q: ['bridge repairs', 'school budget', 'flood barrier'], rows: {
      'bridge repairs': ['Bridge repairs to close Ferry Street for six weeks', 'Opinion: the bridge repairs were overdue', 'Traffic plan published for bridge repairs'],
      'school budget': ['School budget gap narrows after county grant', 'Parents question school budget cuts at meeting'],
      'flood barrier': ['Flood barrier tested ahead of winter', 'Residents back plan for second flood barrier', 'Flood barrier costs rise by a fifth'],
    },
  },
  es: {
    brands: ['El Diario del Valle', 'Gaceta Ribereña', 'Crónica de la Bahía'], nav: ['Local', 'Economía', 'Cultura', 'Deportes', 'Opinión'],
    users: [['Lucía', 'Lucía Pardo'], ['Mateo', 'Mateo Ruiz'], ['Carmen', 'Carmen Soler'], ['Diego', 'Diego Navas']],
    h: 'Buscar en la hemeroteca', crumbs: ['Portada', 'Buscar'], ph: 'Buscar artículos', go: 'Buscar', since: 'La hemeroteca incluye noticias desde 2009.',
    nl: 'Boletín Primera Hora', nlBody: 'Las noticias locales del día, cada mañana laborable a las 7.', sub: 'Suscribirme', most: 'Lo más leído',
    reads: ['El pleno aprueba nuevos carriles bici en la calle del Molino', 'Vuelve la feria de la cosecha este fin de semana', 'La biblioteca amplía su horario de tarde'],
    ok: 'Te has suscrito a {n}', neg: 'Tu suscripción a {n} no se ha completado.', pending: 'Tramitando tu suscripción…', mention: 'Aquí verás una confirmación cuando tu suscripción esté activa.',
    e1: 'No se pudo suscribir: esta dirección se dio de baja y antes debe confirmarse de nuevo por correo.', e2: 'No se pudo suscribir: el boletín está en pausa durante las fiestas.',
    clear: 'Tu correo es válido. No hay ningún problema.', checking: 'Comprobando tu correo…', emention: 'Si no podemos suscribirte, aquí verás el motivo.',
    errSpec: 'an error saying the address must be re-confirmed by email first', nls: ['Primera Hora', 'Lecturas de Fin de Semana', 'Economía al Día'],
    q: ['obras del puente', 'presupuesto escolar', 'barrera contra inundaciones'], rows: {
      'obras del puente': ['Las obras del puente cortarán la calle del Barquero seis semanas', 'Opinión: las obras del puente llegaban tarde', 'Publicado el plan de tráfico por las obras del puente'],
      'presupuesto escolar': ['Se reduce el déficit del presupuesto escolar tras una ayuda provincial', 'Las familias cuestionan los recortes del presupuesto escolar'],
      'barrera contra inundaciones': ['Prueban la barrera contra inundaciones antes del invierno', 'Los vecinos apoyan una segunda barrera contra inundaciones', 'El coste de la barrera contra inundaciones sube un 20 %'],
    },
  },
};

export const newsSearch = {
  id: 'news-search', kind: 'news', langs: ['en', 'es'], cats: ['results', 'confirmation', 'error', 'greeting'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const [n, n2] = rng.shuffle(v.nls);
    const [q, q2] = rng.shuffle(Object.keys(v.rows));
    return {
      kind: 'news', brand, title: `${v.h} · ${brand}`, at: '/search', host: 'news', nav: v.nav, slug: 'news', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        return `<h1>${esc(v.h)}</h1><p><input type="search" value="" placeholder="${esc(v.ph)}"> ${ui.btn(v.go, { pri: true })}</p>${slot}<p class="muted">${esc(v.since)}</p>
<div class="card"><h2>${esc(v.nl)}</h2><p>${esc(v.nlBody)}</p>${ui.btn(v.sub)}</div>`;
      },
      aside(ui) { return box(v.most, list(v.reads.map((x) => ui.a(x, '/story')))); },
      cats: {
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
        confirmation: { ok: v.ok.replace('{n}', n), wrong: v.ok.replace('{n}', n2), neg: v.neg.replace('{n}', n), pending: v.pending, mention: v.mention, spec: `a confirmation of the subscription to ${n}` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
      },
    };
  },
};
