// n5 page chrome: one stylesheet, a look per site kind, the shell (header, navigation, sidebar, footer), the
// control helper that hands out neutral ids, and the generic after-page pieces (toast, banner, busy strip,
// blocking overlays, error pages). Wording comes from n5-lang.mjs; scenario wording from n5-tpl-*.mjs.
import { esc, idPool } from './n5-lib.mjs';
import { L } from './n5-lang.mjs';

// Per kind: accent colour, header background, whether the sidebar sits left, a font stack.
const LOOK = {
  shop: ['#c2410c', '#fff7ed', false, 'system-ui, sans-serif'],
  bank: ['#0f4c81', '#0b2540', false, 'Georgia, serif'],
  saas: ['#5b21b6', '#ffffff', true, 'Inter, system-ui, sans-serif'],
  news: ['#9f1239', '#ffffff', false, 'Georgia, "Times New Roman", serif'],
  travel: ['#0e7490', '#ecfeff', false, 'system-ui, sans-serif'],
  gov: ['#1d3557', '#1d3557', false, 'Arial, Helvetica, sans-serif'],
  forum: ['#3f6212', '#f7fee7', false, 'Verdana, sans-serif'],
  docs: ['#334155', '#f8fafc', true, 'system-ui, sans-serif'],
  admin: ['#1f2937', '#111827', true, 'ui-sans-serif, system-ui, sans-serif'],
  mail: ['#2563eb', '#eff6ff', true, 'system-ui, sans-serif'],
  calendar: ['#b45309', '#fffbeb', true, 'system-ui, sans-serif'],
  tasks: ['#0f766e', '#f0fdfa', true, 'system-ui, sans-serif'],
  storage: ['#4338ca', '#eef2ff', true, 'system-ui, sans-serif'],
  support: ['#be123c', '#fff1f2', false, 'system-ui, sans-serif'],
};
const DARK_HEAD = new Set(['bank', 'gov', 'admin']);

function css(kind) {
  const [accent, head, , font] = LOOK[kind];
  const ink = DARK_HEAD.has(kind) ? '#fff' : '#111';
  return `*{box-sizing:border-box}body{margin:0;font:14px/1.45 ${font};color:#1f2328;background:#f6f7f9}
a{color:${accent}}header.top{display:flex;gap:18px;align-items:center;padding:10px 20px;background:${head};color:${ink};border-bottom:3px solid ${accent}}
header.top a{color:${ink};text-decoration:none}.brand{font-weight:700;font-size:18px}nav.main{display:flex;gap:14px;flex:1}
.user{font-size:12px;opacity:.85}.wrap{display:flex;gap:20px;max-width:1080px;margin:16px auto;padding:0 16px}
.wrap.left{flex-direction:row-reverse}main{flex:1;background:#fff;border:1px solid #e3e5e8;border-radius:6px;padding:16px 20px}
aside{width:230px;font-size:13px}aside section{background:#fff;border:1px solid #e3e5e8;border-radius:6px;padding:10px 12px;margin-bottom:12px}
aside h3{margin:0 0 6px;font-size:13px}aside ul{margin:0;padding-left:16px}.crumbs{font-size:12px;color:#667;margin-bottom:6px}
h1{font-size:22px;margin:4px 0 12px}h2{font-size:16px;margin:14px 0 8px}.muted{color:#667;font-size:12px}
.btn{padding:6px 12px;border:1px solid #c9ccd1;background:#fff;border-radius:4px;cursor:pointer;font:inherit}
.pri{background:${accent};border-color:${accent};color:#fff}.btn[disabled]{opacity:.55}
label{display:block;font-weight:600;margin:10px 0 3px}input,select,textarea{font:inherit;padding:5px 8px;border:1px solid #b9bdc3;border-radius:4px;width:100%;max-width:380px}
.err{color:#b42318}.field-err input{border-color:#b42318}.errsum{border:2px solid #b42318;padding:8px 12px;margin:8px 0;background:#fff5f5}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eceef1;font-size:13px}
.card{border:1px solid #e3e5e8;border-radius:6px;padding:10px 12px;margin:8px 0}.badge{display:inline-block;padding:1px 7px;border-radius:9px;background:#eef0f3;font-size:12px}
.toast{position:fixed;right:20px;bottom:20px;background:#1f2328;color:#fff;padding:10px 14px;border-radius:6px;max-width:340px}
.toast.bad{background:#7a1d16}.banner{padding:8px 20px;font-size:13px;background:#fff8db;border-bottom:1px solid #f0d97a}
.busy{padding:8px 12px;margin:8px 0;border-radius:4px;background:#eef4ff;border:1px solid #c7d7fe}
.bar{height:6px;background:#dde3ee;border-radius:3px;overflow:hidden}.bar i{display:block;height:6px;background:${accent}}
.scrim{position:fixed;inset:0;background:rgba(15,20,30,.55)}.modal{position:fixed;top:18%;left:50%;transform:translateX(-50%);width:420px;background:#fff;border-radius:8px;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.3)}
.cols{display:flex;gap:12px}.cols>div{flex:1;background:#f3f4f6;border-radius:6px;padding:8px}.row-hl{background:#fffbe6}
footer{max-width:1080px;margin:20px auto;padding:12px 16px;font-size:12px;color:#667;border-top:1px solid #e3e5e8}footer a{margin-right:12px}`;
}

// Controls: every link and button takes an id from one shuffled pool (`c<n>`), fields take `f<n>`.
// `acted` marks the control the step pressed; its selector, role and name are read back by the generator.
export function makeUi(rng) {
  const id = idPool(rng);
  let field = 0;
  let acted = null;
  const ui = {
    a(text, href = '#') {
      return `<a id="${id()}" href="${esc(href)}">${esc(text)}</a>`;
    },
    btn(text, opt = {}) {
      const i = id();
      if (opt.acted) acted = { selector: `#${i}`, role: 'button', name: text };
      const cls = opt.pri ? 'btn pri' : 'btn';
      return `<button type="${opt.submit ? 'submit' : 'button'}" id="${i}" class="${cls}"${opt.disabled ? ' disabled' : ''}>${esc(text)}</button>`;
    },
    input(label, value, opt = {}) {
      field += 1;
      const f = `f${field}`;
      const err = opt.err ? `<div class="err" id="${f}-e">${esc(opt.err)}</div>` : '';
      const tag = opt.area
        ? `<textarea id="${f}" rows="3">${esc(value)}</textarea>`
        : `<input id="${f}" type="${opt.type ?? 'text'}" value="${esc(value)}">`;
      return `<div${opt.err ? ' class="field-err"' : ''}><label for="${f}">${esc(label)}</label>${err}${tag}</div>`;
    },
    select(label, options, chosen) {
      field += 1;
      const opts = options.map((o) => `<option${o === chosen ? ' selected' : ''}>${esc(o)}</option>`).join('');
      return `<div><label for="f${field}">${esc(label)}</label><select id="f${field}">${opts}</select></div>`;
    },
    actedRef: () => acted,
  };
  return ui;
}

export const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
export const box = (title, body) => `<section><h3>${esc(title)}</h3>${body}</section>`;

/** A whole page. `left` puts the sidebar left; `bare` drops the chrome (a server's own error page). */
export function shell(p) {
  const T = L[p.lang];
  const [, , left] = LOOK[p.kind];
  const ui = p.ui;
  const nav = p.nav.map((n) => ui.a(n, `/${p.slug ?? 'app'}/${encodeURIComponent(n.toLowerCase().replace(/\s+/g, '-'))}`)).join('');
  const user = p.user ? `<div class="user">${esc(T.signedIn)} ${esc(p.user)} · ${ui.a(T.signOut, '/logout')}</div>` : '';
  const head = `<header class="top"><a class="brand" id="${'b' + p.brand.length}" href="/">${esc(p.brand)}</a><nav class="main" aria-label="Main">${nav}</nav>${user}</header>`;
  const crumbs = p.crumbs ? `<div class="crumbs">${p.crumbs.map(esc).join(' › ')}</div>` : '';
  const aside = p.aside ? `<aside>${p.aside}</aside>` : '';
  const foot = `<footer>${T.footer.map((f) => ui.a(f, '/legal')).join('')}<div>© 2026 ${esc(p.brand)}. ${esc(T.rights)}</div></footer>`;
  const body = `${p.banner ?? ''}${head}<div class="wrap${left ? ' left' : ''}"><main>${crumbs}${p.main}</main>${aside}</div>${foot}${p.toast ?? ''}${p.overlay ?? ''}`;
  return `<!doctype html>\n<html lang="${p.lang}"><head><meta charset="utf-8"><title>${esc(p.title)}</title><style>${css(p.kind)}</style></head><body>${body}</body></html>\n`;
}

export function barePage(lang, title, inner) {
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:15px/1.5 system-ui,sans-serif;margin:60px auto;max-width:560px;color:#333}h1{font-size:26px}code{background:#eee;padding:1px 4px}</style></head><body>${inner}</body></html>\n`;
}

export const toast = (text) => `<div class="toast" role="status">${esc(text)}</div>`;
export const banner = (text) => `<div class="banner">${esc(text)}</div>`;

/** Still working: a busy strip over the unchanged content, with or without a progress bar. */
export function busyStrip(lang, rng) {
  const T = L[lang];
  const pct = 20 + rng.int(60);
  const bar = rng.chance(0.5) ? `<div class="bar"><i style="width:${pct}%"></i></div>` : '';
  return `<div class="busy" role="status" aria-busy="true"><strong>${esc(rng.pick(T.busy))}</strong> ${esc(rng.pick(T.busyNote))}${bar}</div>`;
}

const CONFIRM_BODY = {
  en: 'This change applies as soon as you confirm. Review it before you continue.',
  uk: 'Зміна набуде чинності одразу після підтвердження. Перевірте її, перш ніж продовжити.',
  de: 'Die Änderung gilt, sobald Sie bestätigen. Bitte prüfen Sie sie vorher.',
  es: 'El cambio se aplica en cuanto lo confirmes. Revísalo antes de continuar.',
  pl: 'Zmiana zostanie zastosowana po potwierdzeniu. Sprawdź ją, zanim przejdziesz dalej.',
};

/**
 * What stands between the step and its effect. `kind`: session (signed out), reauth (password), code (one-time
 * code), confirm (are you sure, not yet confirmed), cookie (consent wall). Half carry a dialog role, half are a
 * plain overlay; the page underneath is the unchanged before content.
 */
export function blocker(kind, lang, ui, rng, summary = '') {
  const T = L[lang];
  let inner;
  if (kind === 'session') inner = `<h2>${esc(T.sessionTitle)}</h2><p>${esc(T.sessionBody)}</p>${ui.input(T.password, '', { type: 'password' })}<p>${ui.btn(T.signIn, { pri: true })}</p>`;
  else if (kind === 'reauth') inner = `<h2>${esc(T.reauthTitle)}</h2><p>${esc(T.reauthBody)}</p>${ui.input(T.password, '', { type: 'password' })}<p>${ui.btn(T.cont, { pri: true })} ${ui.btn(T.cancel)}</p>`;
  else if (kind === 'code') inner = `<h2>${esc(T.codeTitle)}</h2><p>${esc(T.codeBody)}</p>${ui.input('Code', '')}<p>${ui.btn(T.verify, { pri: true })} ${ui.a(T.resend)}</p>`;
  else if (kind === 'confirm') inner = `<h2>${esc(T.confirmTitle)}</h2><p>${esc(summary)}</p><p>${esc(CONFIRM_BODY[lang])}</p><p>${ui.btn(T.yesContinue, { pri: true })} ${ui.btn(T.cancel)}</p>`;
  else inner = `<h2>${esc(T.cookieTitle)}</h2><p>${esc(T.cookieBody)}</p><p>${ui.btn(T.acceptAll, { pri: true })} ${ui.btn(T.rejectAll)}</p>`;
  const role = rng.chance(0.5) ? ' role="dialog" aria-modal="true"' : '';
  return `<div class="scrim"></div><div class="modal"${role}>${inner}</div>`;
}

/** An error page's content: [code, title, text] from the language table plus a reference. */
export function errorBlock(lang, err, ref, ui) {
  const T = L[lang];
  return `<h1>${esc(err[1])}</h1><p class="muted">${esc(err[0])}</p><p>${esc(err[2])}</p><p class="muted">${esc(T.errRef)}: <code>${esc(ref)}</code></p><p>${ui.btn(T.retry, { pri: true })} ${ui.a(T.backHome, '/')}</p>`;
}

export function bareError(lang, err, ref) {
  const T = L[lang];
  return `<h1>${esc(err[0])} · ${esc(err[1])}</h1><p>${esc(err[2])}</p><p>${esc(T.errRef)}: <code>${esc(ref)}</code></p><hr><p style="font-size:12px;color:#888">edge-gw/2.4</p>`;
}
