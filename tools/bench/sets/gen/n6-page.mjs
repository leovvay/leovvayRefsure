// n6 page pieces shared by the templates: a key/value table, a status badge, a progress timeline, the result
// slot, the loading and sign-in mains, and the page wrapper over n5's shell (chrome, sidebar, footer).
import { esc } from './n5-lib.mjs';
import { box, shell } from './n5-shell.mjs';
import { fill } from './n5-lib.mjs';
import { someDate, twinRef } from './n6-fmt.mjs';
import { PEOPLE, W } from './n6-lang.mjs';

export { box, list } from './n5-shell.mjs';
export { esc, fill } from './n5-lib.mjs';

const TONE = { ok: '#e6f4ea', wait: '#fff4d6', bad: '#fde8e8' };

export const badge = (label, tone = 'ok') => `<span class="badge" style="background:${TONE[tone]}">${esc(label)}</span>`;

/** A key/value table; values are already HTML (escape text with esc first). */
export const rows = (pairs) => `<table>${pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;

/** A progress list: steps up to `idx` ticked, the rest open; idx -1 ticks nothing. */
export function timeline(lang, ladder, idx) {
  const li = ladder.map((s, i) => `<li>${i <= idx ? '✓' : '○'} ${esc(s)}</li>`).join('');
  return `<h2>${esc(W[lang].progress)}</h2><ol style="list-style:none;padding-left:0">${li}</ol>`;
}

/** The result area: `html` when the view has its result, else the note that stands in for it. */
export const slot = (v, html) => (v.hasResult ? html : v.note ? `<p class="busy" role="status">${esc(v.note)}</p>` : '');

/** The status of a view as a badge. */
export const stageBadge = (v) => badge(v.stage, v.tone);

export function loadingMain(lang, h1, rng) {
  const T = W[lang];
  const sk = '<div style="height:12px;background:#eceef1;border-radius:4px;margin:8px 0;width:{w}%"></div>';
  const bars = [70, 45, 85, 60].map((w) => sk.replace('{w}', String(w))).join('');
  const text = rng.pick(T.loading);
  return {
    html: `<h1>${esc(h1)}</h1><div class="busy" role="status" aria-busy="true"><strong>${esc(text)}</strong> ${esc(rng.pick(T.loadNote))}</div>${bars}`,
    text,
  };
}

export function loginMain(lang, ui, L5) {
  const T = W[lang];
  return `<h1>${esc(T.loginTitle)}</h1><p>${esc(T.loginBody)}</p>${ui.input(T.email, '')}${ui.input(L5.password, '', { type: 'password' })}
<p><label style="font-weight:400"><input type="checkbox" style="width:auto"> ${esc(T.remember)}</label></p>
<p>${ui.btn(L5.signIn, { pri: true, submit: true })} ${ui.a(T.forgot, '/password/reset')}</p><p class="muted">${ui.a(T.newHere, '/signup')}</p>`;
}

/** A whole page for scenario S and view v; `extra` may carry main/aside/title overrides, a banner or a toast. */
export function page(S, lang, v, ui, extra = {}) {
  const main = extra.main ?? S.main(v, ui);
  const aside = extra.aside !== undefined ? extra.aside : S.aside(v, ui) + box(W[lang].updated, `<p>${esc(extra.stamp ?? '')}</p>`);
  return shell({
    kind: S.kind, lang, brand: S.brand, title: extra.title ?? S.title(v), nav: S.nav, slug: S.slug,
    user: extra.noUser ? null : S.user, crumbs: extra.crumbs === null ? null : S.crumbs, ui, main, aside,
    toast: extra.toast, banner: extra.banner, overlay: extra.overlay,
  });
}

/**
 * What every template shares: its language table, a brand, a signed-in user, the record's facts (ref and its
 * near twin, a person and a near twin, the number value) and the expectation writer over all languages.
 * `o`: { ref(rng), spec, max (count) }; money ranges come from the language table's `amt`.
 */
export function common(V, lang, rng, o) {
  const v = V[lang];
  const people = rng.shuffle(PEOPLE[lang]);
  const [who, who2] = rng.chance(0.5) ? people[0] : [people[0][1], people[0][0]];
  const ref = o.ref(rng);
  const spec = o.spec.type === 'money' ? { type: 'money', cur: v.cur } : o.spec;
  let n;
  if (spec.type === 'date') n = someDate(rng);
  else if (spec.type === 'count') n = 1200 + rng.int(o.max ?? 40000);
  else n = Math.round((v.amt[0] + rng.next() * (v.amt[1] - v.amt[0])) * 100) / 100;
  return {
    v, spec, brand: rng.pick(v.brands), user: people[1][0], other: people[2] ? people[2][0] : people[1][1],
    f: { ref, ref2: twinRef(ref, rng), who, who2, n },
    exp: (eLang, kind, vars) => fill(V[eLang].E[kind], vars),
  };
}
