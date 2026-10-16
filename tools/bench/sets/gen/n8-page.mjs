// n8 page pieces: the target field (a native select, or a custom combobox with an open listbox), noise text and
// noise controls, and the page itself through N5's shell (same chrome, looks and footer wording per language).
import { esc } from './n5-lib.mjs';
import { box, list, makeUi, shell } from './n5-shell.mjs';

export { box, list, makeUi };

const LBX = '<style>.cbx{border:1px solid #b9bdc3;border-radius:4px;padding:5px 8px;max-width:380px;background:#fff}'
  + '.lbx{list-style:none;margin:2px 0 8px;padding:4px 0;border:1px solid #b9bdc3;border-radius:4px;max-width:380px;max-height:240px;overflow:auto;background:#fff}'
  + '.lbx li{padding:3px 10px}.lbx li[aria-selected=true]{background:#eef2ff}</style>';

/**
 * The field the item asks about. `opts` are { v, text }; `placeholder` (text or null) is offered first with an
 * empty value, as real forms do. `selected` is the value shown as current (never the gold: the generator checks).
 */
export function targetField({ id, label, opts, placeholder, widget, help, selected }) {
  const all = placeholder ? [{ v: '', text: placeholder }, ...opts] : opts;
  const cur = all.find((o) => o.v === selected) ?? all[0];
  const helpHtml = help ? `<p class="muted">${esc(help)}</p>` : '';
  if (widget === 'select') {
    const o = all.map((x) => `<option value="${esc(x.v)}"${x === cur && selected !== undefined ? ' selected' : ''}>${esc(x.text)}</option>`).join('');
    return `<div><label for="${id}">${esc(label)}</label><select id="${id}" name="${id}">${o}</select>${helpHtml}</div>`;
  }
  const li = all.map((x) => `<li role="option" data-value="${esc(x.v)}" aria-selected="${x === cur}">${esc(x.text)}</li>`).join('');
  return `${LBX}<div><label id="${id}-l">${esc(label)}</label><div role="combobox" id="${id}" tabindex="0" class="cbx" aria-labelledby="${id}-l" aria-expanded="true" aria-controls="${id}-lb">${esc(cur.text)} ▾</div>`
    + `<ul role="listbox" id="${id}-lb" class="lbx" aria-labelledby="${id}-l">${li}</ul>${helpHtml}</div>`;
}

/** A small read-only table, for noise (recent orders, members, invoices). */
export function table(head, rows) {
  const th = head.map((h) => `<th>${esc(h)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

export const p = (text, cls) => `<p${cls ? ` class="${cls}"` : ''}>${esc(text)}</p>`;
export const h = (n, text) => `<h${n}>${esc(text)}</h${n}>`;

/** The whole page: N5's shell with this template's chrome; `S.main(field, ui)` and `S.aside(ui)` give the body. */
export function page(S, lang, field, ui) {
  return shell({
    kind: S.kind, lang, brand: S.brand, title: S.title, nav: S.nav, slug: S.slug ?? 'app', user: S.user, crumbs: S.crumbs,
    ui, main: S.main(field, ui), aside: S.aside ? S.aside(ui, field) : '', banner: S.banner,
  });
}
