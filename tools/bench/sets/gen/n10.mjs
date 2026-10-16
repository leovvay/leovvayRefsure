#!/usr/bin/env node
/*
  N10: PII masks (benchmark protocol 3.5, row N10; question Q11). 90 PII-heavy pages, 30 each for find, dismiss
  and presence; every item is asked with PII masks on and off. Mask class of the evidence, fixed: email 20,
  IBAN (mod-97 valid) 15, card (Luhn valid) 15, phone 15, and `unmasked` 25 (names and postal addresses, which
  refsure never masks), reported apart. 75 items are `must_not_move` (the masks must not change the gold); 15 are
  `evidence_removed` (the only evidence is a masked value, so with masks on the right answer is `none` for
  find/dismiss and not-present for presence), drawn only from the masked classes.

    node tools/bench/sets/gen/n10.mjs        (writes tools/bench/sets/n10/pages and n10.draft.jsonl)

  Plain Node, no dependencies, fixed seed. Everything is synthetic: brands, people, streets and numbers are made
  up; e-mail domains end in .example.test; links are `#` or relative; pages load nothing from outside.
*/
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SETS = join(HERE, '..');
const OUT = join(SETS, 'n10');
const SEED = 'refsure-bench-n10-20261016';

// ---------- seeded randomness ----------
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(fnv1a(SEED));
const digit = () => String(Math.floor(rand() * 10));
const digits = (n) => Array.from({ length: n }, digit).join('');
function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- PII values (valid shapes, so refsure's masks must catch every one) ----------
function mod97(numeric) {
  let rest = 0;
  for (const ch of numeric) rest = (rest * 10 + Number(ch)) % 97;
  return rest;
}
const letterNum = (s) => [...s].map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c)).join('');
const BBAN = { DE: () => digits(18), GB: () => 'BKRW' + digits(14), NL: () => 'RVBK' + digits(10),
  ES: () => digits(20), FR: () => digits(23), PL: () => digits(24), UA: () => '3' + digits(24) };
/** A mod-97 valid IBAN, printed in groups of four. */
function iban(cc) {
  const bban = BBAN[cc]();
  const check = String(98 - mod97(letterNum(bban + cc + '00'))).padStart(2, '0');
  return (cc + check + bban).replace(/(.{4})/g, '$1 ').trim();
}
/** A Luhn valid 16-digit card number with the given prefix, printed in groups of four. */
function card(prefix) {
  const body = prefix + digits(15 - prefix.length);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (body + String((10 - (sum % 10)) % 10)).replace(/(.{4})/g, '$1 ').trim();
}
const last4 = (c) => c.replace(/\D/g, '').slice(-4);
const PHONES = {
  uk: () => `+44 7700 9${digits(5)}`, de: () => `+49 151 ${digits(4)} ${digits(4)}`,
  ua: () => `+380 67 ${digits(3)} ${digits(2)} ${digits(2)}`, es: () => `+34 6${digits(2)} ${digits(3)} ${digits(3)}`,
  pl: () => `+48 5${digits(2)} ${digits(3)} ${digits(3)}`, us: () => `(555) 01${digit()}-${digits(4)}`,
};
const phone = (kind) => PHONES[kind]();

// ---------- markup helpers ----------
// Interactive elements get neutral ids at the end: %ID% any, %GOLD% the gold, %ALT% an acceptable alternative.
const G = { id: '%GOLD%' };
const A = { id: '%ALT%' };
const attrs = (o) => `${o.cls ? ` class="${o.cls}"` : ''}${o.aria ? ` aria-label="${esc(o.aria)}"` : ''}${o.title ? ` title="${esc(o.title)}"` : ''}`;
const btn = (label, o = {}) => `<button id="${o.id ?? '%ID%'}" type="button"${attrs(o)}>${esc(label)}</button>`;
const lnk = (label, o = {}) => `<a id="${o.id ?? '%ID%'}" href="${o.href ?? '#'}"${attrs(o)}>${esc(label)}</a>`;
const p = (text, cls) => `<p${cls ? ` class="${cls}"` : ''}>${esc(text)}</p>`;
const h1 = (t) => `<h1>${esc(t)}</h1>`;
const h2 = (t) => `<h2>${esc(t)}</h2>`;
const card_ = (inner) => `<div class="card">${inner}</div>`;
/** A table; a cell is plain text or `{ html }` for markup (buttons, links). */
const table = (head, rows) => `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
  + rows.map((r) => `<tr>${r.map((c) => `<td>${typeof c === 'object' ? c.html : esc(c)}</td>`).join('')}</tr>`).join('') + '</table>';
const dl = (pairs) => `<dl>${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${typeof v === 'object' ? v.html : esc(v)}</dd>`).join('')}</dl>`;
const H = (html) => ({ html });
const dialog = (label, body) => `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}">${body}</div>`;
const row = (...controls) => `<div class="row">${controls.join('')}</div>`;

const THEMES = [
  { accent: '#1d4ed8', bg: '#f5f7fb', ink: '#1b2430', font: 'system-ui, sans-serif' },
  { accent: '#0f766e', bg: '#f4f8f7', ink: '#14231f', font: '"Segoe UI", Arial, sans-serif' },
  { accent: '#9a3412', bg: '#fbf7f3', ink: '#2a1d16', font: 'Georgia, serif' },
  { accent: '#6d28d9', bg: '#f7f5fc', ink: '#221b33', font: 'Helvetica, Arial, sans-serif' },
  { accent: '#be123c', bg: '#fdf6f7', ink: '#2b1a1e', font: 'Verdana, sans-serif' },
  { accent: '#334155', bg: '#f8fafc', ink: '#0f172a', font: 'Tahoma, sans-serif' },
  { accent: '#a16207', bg: '#fefcf3', ink: '#292524', font: '"Trebuchet MS", sans-serif' },
];

function css(t, layout) {
  const side = layout === 'right' ? 'flex-direction:row-reverse;' : '';
  return `*{box-sizing:border-box}body{margin:0;font:14px/1.45 ${t.font};color:${t.ink};background:${t.bg}}`
    + `header{display:flex;align-items:center;gap:18px;padding:10px 22px;background:#fff;border-bottom:1px solid #dde2ea}`
    + `header b{color:${t.accent};font-size:18px}nav a{margin-right:14px;color:${t.ink};text-decoration:none}`
    + `nav a[aria-current]{color:${t.accent};font-weight:600}.wrap{display:flex;${side}gap:22px;padding:20px 22px;max-width:1080px}`
    + `aside{width:190px;font-size:13px;color:#4b5563}aside a{display:block;margin:4px 0;color:${t.accent}}`
    + `main{flex:1;min-width:0}h1{font-size:22px;margin:0 0 12px}h2{font-size:16px;margin:18px 0 8px}`
    + `.card{background:#fff;border:1px solid #dde2ea;border-radius:8px;padding:12px 14px;margin-bottom:10px}`
    + `table{border-collapse:collapse;width:100%;background:#fff}td,th{border-bottom:1px solid #e5e7eb;padding:7px 8px;text-align:left}`
    + `dl{display:grid;grid-template-columns:170px 1fr;gap:6px 12px}dt{color:#6b7280}dd{margin:0}`
    + `button{font:inherit;padding:5px 11px;border-radius:6px;border:1px solid #c7ced9;background:#fff;cursor:pointer;margin:2px}`
    + `button.pri{background:${t.accent};color:#fff;border-color:${t.accent}}.muted{color:#6b7280;font-size:12px}`
    + `.ok{color:#047857}.bad{color:#b91c1c}.warn{color:#b45309}.strip{background:${t.accent};color:#fff;padding:6px 22px;font-size:12px}`
    + `footer{padding:14px 22px;border-top:1px solid #dde2ea;font-size:12px;color:#6b7280}footer a{color:#6b7280;margin-right:12px}`
    + `.scrim{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center}`
    + `.modal{background:#fff;max-width:460px;border-radius:10px;padding:18px 20px;box-shadow:0 10px 30px rgba(0,0,0,.25)}`
    + `.modal h2{margin-top:0}.modal .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}`;
}

/** One page. `sk` is the template skin, `v` its vocabulary in the page language. */
function shell(sk, lang, o) {
  const v = sk.vocab[lang] ?? sk.vocab.en;
  const nav = v.nav.map((label, i) => (i === (o.current ?? 0)
    ? `<a id="%ID%" href="#" aria-current="page">${esc(label)}</a>` : lnk(label))).join('');
  const aside = sk.layout === 'top' || !v.aside ? '' : `<aside><p class="muted">${esc(v.asideTitle ?? '')}</p>${v.aside.map((l) => lnk(l)).join('')}</aside>`;
  const strip = v.strip ? `<div class="strip">${esc(v.strip)}</div>` : '';
  const foot = v.foot.map((label) => lnk(label)).join('');
  const overlay = o.overlay ? `<div class="scrim">${o.overlay}</div>` : '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(o.title)}</title>`
    + `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css(sk.theme, sk.layout)}</style></head>`
    + `<body>${strip}<header><b>${esc(sk.brand)}</b><nav aria-label="${esc(v.navLabel ?? 'Main')}">${nav}</nav></header>`
    + `<div class="wrap">${aside}<main>${o.main}</main></div>`
    + `<footer>${foot}<p>${esc(v.fine)}</p></footer>${overlay}</body></html>`;
}

// ---------- template skins (14 page kinds; chrome vocabulary per page language) ----------
const SKINS = {
  mail: { brand: 'Quillpost', theme: THEMES[0], layout: 'side', vocab: {
    en: { nav: ['Inbox', 'Sent', 'Drafts', 'Spam review', 'Contacts'], asideTitle: 'Labels', aside: ['Starred', 'Receipts', 'Travel'],
      foot: ['Help', 'Privacy', 'Terms'], fine: 'Quillpost Mail. Storage used: 3.1 GB of 15 GB.' },
    uk: { nav: ['Вхідні', 'Надіслані', 'Чернетки', 'Перевірка спаму', 'Контакти'], asideTitle: 'Мітки', aside: ['Із зірочкою', 'Чеки', 'Подорожі'],
      foot: ['Довідка', 'Конфіденційність', 'Умови'], fine: 'Quillpost Mail. Використано 3,1 ГБ із 15 ГБ.' } } },
  bank: { brand: 'Fernbank', theme: THEMES[1], layout: 'side', vocab: {
    en: { nav: ['Overview', 'Payments', 'Cards', 'Savings', 'Profile'], asideTitle: 'Quick links', aside: ['Statements', 'Limits', 'Help centre'],
      foot: ['Security', 'Fees', 'Accessibility'], fine: 'Fernbank is a fictional bank used for testing. Deposits are not real.', strip: 'Never share your one-time codes, not even with us.' },
    uk: { nav: ['Огляд', 'Платежі', 'Картки', 'Заощадження', 'Профіль'], asideTitle: 'Швидкі посилання', aside: ['Виписки', 'Ліміти', 'Довідка'],
      foot: ['Безпека', 'Тарифи', 'Доступність'], fine: 'Fernbank: вигаданий банк для тестування.', strip: 'Нікому не повідомляйте одноразові коди.' },
    de: { nav: ['Übersicht', 'Zahlungen', 'Karten', 'Sparen', 'Profil'], asideTitle: 'Schnellzugriff', aside: ['Kontoauszüge', 'Limits', 'Hilfe'],
      foot: ['Sicherheit', 'Preise', 'Barrierefreiheit'], fine: 'Fernbank ist eine fiktive Testbank.', strip: 'Geben Sie Einmalcodes niemals weiter.' } } },
  shop: { brand: 'Pebble & Pine', theme: THEMES[2], layout: 'top', vocab: {
    en: { nav: ['Home', 'Living', 'Kitchen', 'Garden', 'My account'], foot: ['Delivery', 'Returns', 'Contact'], fine: 'Prices include VAT. Free delivery over 60.00.' },
    es: { nav: ['Inicio', 'Salón', 'Cocina', 'Jardín', 'Mi cuenta'], foot: ['Envíos', 'Devoluciones', 'Contacto'], fine: 'Precios con IVA. Envío gratis a partir de 60,00.' },
    pl: { nav: ['Start', 'Salon', 'Kuchnia', 'Ogród', 'Moje konto'], foot: ['Dostawa', 'Zwroty', 'Kontakt'], fine: 'Ceny zawierają VAT. Darmowa dostawa od 60,00.' } } },
  saas: { brand: 'Tallyboard', theme: THEMES[3], layout: 'side', vocab: {
    en: { nav: ['Projects', 'Reports', 'Settings', 'Billing'], asideTitle: 'Settings', aside: ['General', 'Members', 'Notifications', 'Security'],
      foot: ['Status', 'Docs', 'Changelog'], fine: 'Workspace: Northgate Studio. Plan: Team (12 seats).' },
    pl: { nav: ['Projekty', 'Raporty', 'Ustawienia', 'Płatności'], asideTitle: 'Ustawienia', aside: ['Ogólne', 'Członkowie', 'Powiadomienia', 'Bezpieczeństwo'],
      foot: ['Status', 'Dokumentacja', 'Zmiany'], fine: 'Przestrzeń: Northgate Studio. Plan: Team (12 miejsc).' } } },
  crm: { brand: 'Ledgerline CRM', theme: THEMES[5], layout: 'side', vocab: {
    en: { nav: ['Contacts', 'Deals', 'Tasks', 'Imports', 'Admin'], asideTitle: 'Segments', aside: ['All contacts', 'Customers', 'Leads'],
      foot: ['API', 'Data retention', 'Audit log'], fine: 'Ledgerline CRM admin console. 2,418 contacts.' } } },
  travel: { brand: 'Skylark Trips', theme: THEMES[0], layout: 'top', vocab: {
    en: { nav: ['Flights', 'Hotels', 'Trains', 'My trips'], foot: ['Help', 'Baggage rules', 'Privacy'], fine: 'Fares shown per person, taxes included.' },
    de: { nav: ['Flüge', 'Hotels', 'Bahn', 'Meine Reisen'], foot: ['Hilfe', 'Gepäckregeln', 'Datenschutz'], fine: 'Preise pro Person inklusive Steuern.' } } },
  gov: { brand: 'Civic Services Portal', theme: THEMES[5], layout: 'top', vocab: {
    en: { nav: ['Services', 'Applications', 'Payments', 'Messages'], foot: ['Accessibility', 'Cookies', 'Contact the office'], fine: 'An official-style demo portal. No real records are held.', strip: 'Demo service: this is not a real public authority.' },
    de: { nav: ['Leistungen', 'Anträge', 'Zahlungen', 'Postfach'], foot: ['Barrierefreiheit', 'Cookies', 'Kontakt zur Behörde'], fine: 'Ein Demo-Portal. Es werden keine echten Daten gespeichert.', strip: 'Demo-Dienst: keine echte Behörde.' },
    pl: { nav: ['Usługi', 'Wnioski', 'Płatności', 'Wiadomości'], foot: ['Dostępność', 'Pliki cookie', 'Kontakt z urzędem'], fine: 'Portal demonstracyjny. Nie przechowuje prawdziwych danych.', strip: 'Usługa demonstracyjna: to nie jest prawdziwy urząd.' } } },
  forum: { brand: 'Kettle Circle', theme: THEMES[6], layout: 'right', vocab: {
    en: { nav: ['Latest', 'Categories', 'Members', 'My profile'], asideTitle: 'Board rules', aside: ['Code of conduct', 'Moderators'],
      foot: ['About', 'Guidelines', 'Contact'], fine: 'Kettle Circle: a community for home cooks and tea people.' } } },
  news: { brand: 'The Harbour Ledger', theme: THEMES[2], layout: 'top', vocab: {
    en: { nav: ['World', 'Local', 'Business', 'Sport', 'Opinion'], foot: ['About us', 'Corrections', 'Contact'], fine: 'The Harbour Ledger. Independent local news since 1921 (fictional).' },
    uk: { nav: ['Світ', 'Місто', 'Бізнес', 'Спорт', 'Думки'], foot: ['Про нас', 'Виправлення', 'Контакти'], fine: 'The Harbour Ledger: вигадане місцеве видання.' } } },
  docs: { brand: 'Brightpath Help', theme: THEMES[3], layout: 'side', vocab: {
    en: { nav: ['Guides', 'API', 'Contact support', 'Status'], asideTitle: 'On this page', aside: ['Getting started', 'Account', 'Billing questions'],
      foot: ['Terms', 'Privacy', 'Community'], fine: 'Brightpath Help Center. Answers updated weekly.' } } },
  telecom: { brand: 'Wavelet Mobile', theme: THEMES[4], layout: 'side', vocab: {
    en: { nav: ['My plan', 'Usage', 'Lines', 'Bills', 'Support'], asideTitle: 'Account', aside: ['Add-ons', 'Roaming', 'Devices'],
      foot: ['Coverage map', 'Fair use', 'Privacy'], fine: 'Wavelet Mobile. Usage figures update every hour.' },
    uk: { nav: ['Мій тариф', 'Використання', 'Номери', 'Рахунки', 'Підтримка'], asideTitle: 'Акаунт', aside: ['Послуги', 'Роумінг', 'Пристрої'],
      foot: ['Карта покриття', 'Чесне користування', 'Конфіденційність'], fine: 'Wavelet Mobile. Дані оновлюються щогодини.' },
    es: { nav: ['Mi tarifa', 'Consumo', 'Líneas', 'Facturas', 'Ayuda'], asideTitle: 'Cuenta', aside: ['Extras', 'Roaming', 'Dispositivos'],
      foot: ['Cobertura', 'Uso razonable', 'Privacidad'], fine: 'Wavelet Mobile. El consumo se actualiza cada hora.' } } },
  parcel: { brand: 'Parcelwise', theme: THEMES[6], layout: 'top', vocab: {
    en: { nav: ['Track', 'Send a parcel', 'Pickup points', 'Account'], foot: ['Prohibited items', 'Claims', 'Contact'], fine: 'Parcelwise tracking. Times are local to the delivery address.' },
    uk: { nav: ['Відстежити', 'Надіслати', 'Пункти видачі', 'Акаунт'], foot: ['Заборонені речі', 'Претензії', 'Контакти'], fine: 'Parcelwise. Час указано за місцем доставки.' } } },
  payroll: { brand: 'Ridgeway People', theme: THEMES[1], layout: 'side', vocab: {
    en: { nav: ['Payslips', 'Time off', 'Expenses', 'Personal details'], asideTitle: 'HR', aside: ['Policies', 'Benefits', 'Org chart'],
      foot: ['HR help', 'Privacy notice'], fine: 'Ridgeway People. Payroll closes on the 20th of each month.' },
    de: { nav: ['Lohnabrechnungen', 'Urlaub', 'Spesen', 'Persönliche Daten'], asideTitle: 'Personal', aside: ['Richtlinien', 'Leistungen', 'Organigramm'],
      foot: ['HR-Hilfe', 'Datenschutzhinweis'], fine: 'Ridgeway People. Abrechnungsschluss ist der 20. jedes Monats.' } } },
  market: { brand: 'Stallhaven', theme: THEMES[4], layout: 'side', vocab: {
    en: { nav: ['Dashboard', 'Listings', 'Orders', 'Payouts', 'Messages'], asideTitle: 'Seller tools', aside: ['Shipping profiles', 'Promotions', 'Reviews'],
      foot: ['Seller policy', 'Fees', 'Help'], fine: 'Stallhaven seller hub. Payouts run every Tuesday.' },
    es: { nav: ['Panel', 'Anuncios', 'Pedidos', 'Cobros', 'Mensajes'], asideTitle: 'Herramientas', aside: ['Envíos', 'Promociones', 'Reseñas'],
      foot: ['Política', 'Comisiones', 'Ayuda'], fine: 'Stallhaven. Los cobros se pagan cada martes.' } } },
};

// ---------- items ----------
/** Per-item PII collector: every maskable value placed on a page goes through it, so `pii` lists them all. */
function pc() {
  const list = [];
  const keep = (s) => { if (!list.includes(s)) list.push(s); return s; };
  return { list, e: (addr) => keep(addr), i: (cc) => keep(iban(cc)), c: (prefix) => keep(card(prefix)), ph: (kind) => keep(phone(kind)) };
}
const SPECS = [];
/*
  One item spec: site, t (skin), lang, base (group within the set), cls (mask class of the evidence), ev (true:
  masks remove the evidence), kase (the hard case), title, cur (current nav entry), main (page body; the gold
  control carries G), overlay (dismiss), intent (find) | expectation (presence), risk (find), gold ('el' | 'none' |
  'true' | 'false', with masks off), pii (collector list), evidence (non-PII strings that decide the gold and
  must survive the masks; for `ev` items the PII that decides it), why.
*/
const find = (s) => SPECS.push({ site: 'find', ...s });
const dismiss = (s) => SPECS.push({ site: 'dismiss', ...s });
const presence = (s) => SPECS.push({ site: 'presence', ...s });

// ================= find: email (7; evidence removed 2) =================
{
  const P = pc();
  const a = P.e('lettings@harbourflats.example.test'), b = P.e('deposits@harbourflats.example.test');
  const msg = (from, subj, prev, o) => card_(`${lnk(`${subj}`, o)}<p class="muted">${esc(from)}: ${esc(prev)}</p>`);
  const main = h1('Inbox') + `<p>${btn('Archive')}${btn('Mark as read')}${btn('Delete')}</p>`
    + msg(P.e('n.adeyemi@mail.example.test'), 'Re: dinner on Friday', 'Works for me, 7pm at the usual place?')
    + msg(b, 'Your deposit protection certificate', 'Attached is the certificate for your tenancy deposit.')
    + msg(a, 'Deposit refund approved', 'Good news: the full deposit will be returned within 5 working days.', G)
    + msg(P.e('billing@streamly.example.test'), 'Your receipt for October', 'Thanks for your payment of 9.99.')
    + msg(P.e('alerts@parcelgo.example.test'), 'Parcel out for delivery', 'Your parcel will arrive today between 10:00 and 14:00.');
  find({ t: 'mail', lang: 'en', base: 'mail-1', cls: 'email', ev: false, kase: 'near_twin', risk: 'read', title: 'Inbox - Quillpost', main,
    intent: 'open the email saying my flat deposit will be refunded', gold: 'el', pii: P.list, evidence: ['Deposit refund approved'],
    why: 'Only the "Deposit refund approved" message is about getting the deposit back; the same landlord\'s certificate e-mail is a near twin, and sender addresses are not needed.' });
}
{
  const P = pc();
  const s0 = P.e('o.marsh@post.example.test'), s1 = P.e('o.marsh.files@mail.example.test');
  const s2 = P.e('promo@deals-hub.example.test'), s3 = P.e('no-reply@shipfast.example.test');
  const rel = (s, t, o = {}) => btn('Release', { aria: `Release message from ${s} (held ${t})`, ...o });
  const main = h1('Spam review') + p('Messages held by the filter are deleted after 30 days. Release a message to move it to your inbox.')
    + table(['Subject', 'Held', ''], [['Last chance: 70% off', '09:47', H(rel(s2, '09:47'))], ['Invoice 4471', '08:12', H(rel(s0, '08:12', G))],
      ['Delivery update', '13:30', H(rel(s3, '13:30'))], ['Shared folder', '11:03', H(rel(s1, '11:03'))]]) + `<p>${btn('Delete all held')}</p>`;
  find({ t: 'mail', lang: 'en', base: 'mail-1', cls: 'email', ev: true, kase: 'pii_only_key', risk: 'write', title: 'Spam review - Quillpost', cur: 3, main,
    intent: `release the held message sent by ${s0}`, gold: 'el', pii: P.list, evidence: [s0],
    why: `The Release button named for ${s0} is the one (o.marsh.files@ is a near twin). With masks on the intent and every Release line read [email] and differ only by the hold time, which the intent does not give: none.` });
}
{
  const P = pc();
  const a = P.e('ivanna.koval@mail.example.test'), b = P.e('i.koval.home@post.example.test'), c = P.e('ivanna.k@studio.example.test');
  const main = h1('Адреси пошти') + p('Основна адреса отримує всі листи й сповіщення про безпеку.')
    + table(['Адреса', 'Статус', ''], [[a, 'Основна', ''], [b, 'Резервна, підтверджена', H(btn('Зробити основною', { aria: `Зробити основною ${b}`, ...G }) + btn('Видалити', { aria: `Видалити ${b}` }))],
      [c, 'Не підтверджена', H(btn('Надіслати лист підтвердження', { aria: `Надіслати підтвердження на ${c}` }) + btn('Видалити', { aria: `Видалити ${c}` }))]]);
  find({ t: 'mail', lang: 'uk', base: 'mail-2', cls: 'email', ev: false, kase: 'translated', risk: 'write', title: 'Налаштування - Quillpost', cur: 4, main,
    intent: 'зробити мою резервну адресу основною', gold: 'el', pii: P.list, evidence: ['Зробити основною', 'Резервна'],
    why: 'Only the backup (Резервна) row has a "make primary" (Зробити основною) button; the verb decides it in both mask modes.' });
}
{
  const P = pc();
  const rows = [['Rowan Pelling', P.e('r.pelling@coldharbour.example.test'), 'Lead'], ['Imke Sauer', P.e('imke@sauer-bau.example.test'), 'Customer'],
    ['Dov Arenson', P.e('dov.arenson@mail.example.test'), 'Lead']];
  const main = h1('Contacts') + `<p>${btn('Export contacts (CSV)')}${btn('Merge duplicates')}${btn('New contact', { cls: 'pri' })}</p>`
    + table(['Name', 'E-mail', 'Stage', ''], rows.map(([n, e, st]) => [n, e, st, H(btn('Copy e-mail', { aria: `Copy ${e}` }))]))
    + p('Deleting a contact is only possible from Admin → Data retention.', 'muted');
  find({ t: 'crm', lang: 'en', base: 'crm-1', cls: 'email', ev: false, kase: 'no_fit', risk: 'irreversible', title: 'Contacts - Ledgerline CRM', main,
    intent: 'delete the lead Rowan Pelling from the CRM', gold: 'none', pii: P.list, evidence: ['Deleting a contact is only possible from Admin'],
    why: 'No control on this page deletes a contact (the note says deleting happens elsewhere); Copy, Export and Merge do not delete: none.' });
}
{
  const P = pc();
  const d = P.e('mina.oyelaran@northgate.example.test'), an = P.e('paul.brede@northgate.example.test');
  const m1 = P.e('lena.voss@northgate.example.test'), m2 = P.e('k.ito@northgate.example.test');
  const main = h1('Members') + p('12 of 12 seats used. Pending invitations hold a seat until they are accepted or revoked.')
    + h2('Pending invitations') + table(['Invited', 'Role', 'Sent', ''], [
      [an, 'Analyst', '2 days ago', H(btn('Resend', { aria: `Resend invite to ${an}` }) + btn('Revoke', { aria: `Revoke invite (Analyst) ${an}` }))],
      [d, 'Designer', '5 days ago', H(btn('Resend', { aria: `Resend invite to ${d}` }) + btn('Revoke', { aria: `Revoke invite (Designer) ${d}`, ...G }))]])
    + h2('Active members') + table(['Member', 'Role', ''], [[m1, 'Admin', H(btn('Remove', { aria: `Remove ${m1}` }))], [m2, 'Designer', H(btn('Remove', { aria: `Remove ${m2}` }))]]);
  find({ t: 'saas', lang: 'en', base: 'saas-1', cls: 'email', ev: false, kase: 'decoy', risk: 'write', title: 'Members - Tallyboard', cur: 2, main,
    intent: 'cancel the pending invitation for the designer', gold: 'el', pii: P.list, evidence: ['Revoke invite (Designer)'],
    why: 'The Designer invitation\'s Revoke cancels it; Resend keeps it, and the active Designer\'s Remove is a member, not an invitation. The role words survive masking.' });
}
{
  const P = pc();
  const a = P.e('lena.voss@northgate.example.test'), b = P.e('lena.voss.design@northgate.example.test'), c = P.e('k.ito@northgate.example.test');
  const main = h1('Members') + p('Removing a member signs them out everywhere and frees a seat.')
    + table(['Member', 'Role', 'Last active', ''], [[b, 'Member', 'today', H(btn('Remove', { aria: `Remove ${b}` }))],
      [c, 'Member', 'yesterday', H(btn('Remove', { aria: `Remove ${c}` }))], [a, 'Member', '3 weeks ago', H(btn('Remove', { aria: `Remove ${a}`, ...G }))]]);
  find({ t: 'saas', lang: 'en', base: 'saas-1', cls: 'email', ev: true, kase: 'pii_only_key', risk: 'write', title: 'Members - Tallyboard', cur: 2, main,
    intent: `remove the member ${a} from the workspace`, gold: 'el', pii: P.list, evidence: [a],
    why: `Remove for ${a} is the one (lena.voss.design@ is a near twin). With masks on the three Remove lines all read "Remove [email]" (twins) and the intent names only [email]: none.` });
}
{
  const P = pc();
  const a = P.e('accounts@tidewell.example.test'), b = P.e('j.ferreira.old@work.example.test');
  const main = h1('Forwarding and filters') + p('Rules run from top to bottom. A forwarded copy stays in your inbox too.')
    + table(['Rule', 'Action', ''], [['From contains "invoice"', `Forward to ${a}`, H(btn('Delete rule', { aria: 'Delete rule: invoices' }) + btn('Edit', { aria: 'Edit rule: invoices' }))],
      ['All incoming mail', `Forward to ${b} (old work address)`, H(btn('Delete rule', { aria: 'Delete rule: all incoming mail', ...G }) + btn('Edit', { aria: 'Edit rule: all incoming mail' }))],
      ['Newsletters', 'Skip inbox, label Reading', H(btn('Delete rule', { aria: 'Delete rule: newsletters' }))]]) + `<p>${btn('New rule', { cls: 'pri' })}</p>`;
  find({ t: 'mail', lang: 'en', base: 'mail-3', cls: 'email', ev: false, kase: 'misleading', risk: 'write', title: 'Filters - Quillpost', cur: 0, main,
    intent: 'stop forwarding all my mail to another address', gold: 'el', pii: P.list, evidence: ['Delete rule: all incoming mail'],
    why: 'The "All incoming mail" rule is the one forwarding everything; deleting it stops that. The invoices rule forwards only invoices; Edit does not stop it.' });
}

// ================= find: IBAN (5; evidence removed 1) =================
{
  const P = pc();
  const payees = [['Hollis Joinery', P.i('GB'), 'Kitchen worktop'], ['Marsh Lane Dental', P.i('GB'), 'Check-up and clean'], ['Ostrava Flat Share', P.i('NL'), 'Rent split']];
  const main = h1('Saved payees') + p('Payments to saved payees skip the confirmation of payee step.')
    + table(['Payee', 'IBAN', 'Last reference', ''], payees.map(([n, ib, ref], i) => [n, ib, ref,
      H(btn('Pay', { aria: `Pay ${n}`, ...(i === 1 ? G : {}) }) + btn('Edit', { aria: `Edit ${n}` }))])) + `<p>${btn('Add payee', { cls: 'pri' })}</p>`;
  find({ t: 'bank', lang: 'en', base: 'bank-1', cls: 'iban', ev: false, kase: 'semantic', risk: 'money', title: 'Payees - Fernbank', cur: 1, main,
    intent: 'send money to my dentist', gold: 'el', pii: P.list, evidence: ['Pay Marsh Lane Dental'],
    why: 'Marsh Lane Dental is the dentist (reference "Check-up and clean"); its Pay button is the one. IBANs play no part.' });
}
{
  const P = pc();
  const a = P.i('DE'), b = P.i('DE'), c = P.i('NL');
  const pay = (ib, o = {}) => btn('Überweisen', { aria: `Überweisen an ${ib}`, ...o });
  const main = h1('Gespeicherte Empfänger') + p('Für Überweisungen an gespeicherte Empfänger ist keine TAN erforderlich.')
    + table(['Name', 'IBAN', ''], [['Jonas Albrecht', b, H(pay(b))], ['Jonas Albrecht', a, H(pay(a, G))], ['Hausverwaltung Kerber', c, H(pay(c))]]);
  find({ t: 'bank', lang: 'de', base: 'bank-1', cls: 'iban', ev: true, kase: 'pii_only_key', risk: 'money', title: 'Empfänger - Fernbank', cur: 1, main,
    intent: `Geld an das Konto ${a} überweisen`, gold: 'el', pii: P.list, evidence: [a],
    why: `Both Jonas Albrecht payees differ only by IBAN; the button for ${a} is the one. With masks on all three lines read "Überweisen an [iban]" (twins) and the intent names only [iban]: none.` });
}
{
  const P = pc();
  const ib = P.i('GB');
  const main = h1('Personal details') + h2('Bank account for salary')
    + dl([['Account holder', 'Sabine Achterberg'], ['IBAN', ib], ['Used since', 'March 2024']])
    + `<p>${btn('Replace salary account', G)}${btn('Add a second account for expenses')}</p>`
    + h2('Payslips') + `<p>${btn('Download September payslip')}${btn('Download P60 for last year')}</p>`
    + p('Changes made after the 20th apply from next month\'s payroll.', 'muted');
  find({ t: 'payroll', lang: 'en', base: 'payroll-1', cls: 'iban', ev: false, kase: 'decoy', risk: 'money', title: 'Personal details - Ridgeway People', cur: 3, main,
    intent: 'change the account my salary is paid into', gold: 'el', pii: P.list, evidence: ['Replace salary account'],
    why: 'Replace salary account changes where salary goes; the second account is only for expenses.' });
}
{
  const P = pc();
  const ib = P.i('ES');
  const main = h1('Cobros') + p('Tu próximo cobro de 412,80 se enviará el martes.')
    + dl([['Cuenta de cobro', ib], ['Titular', 'Talleres Ondarra'], ['Frecuencia', 'Semanal']])
    + `<p>${btn('Ver extracto de cobros')}${btn('Cambiar cuenta de cobro', G)}${btn('Solicitar cobro anticipado')}</p>`
    + h2('Historial') + table(['Fecha', 'Importe', 'Estado'], [['07/10', '388,10', 'Pagado'], ['30/09', '295,00', 'Pagado']]);
  find({ t: 'market', lang: 'es', base: 'market-1', cls: 'iban', ev: false, kase: 'translated', risk: 'money', title: 'Cobros - Stallhaven', cur: 3, main,
    intent: 'change the bank account my payouts go to', gold: 'el', pii: P.list, evidence: ['Cambiar cuenta de cobro'],
    why: 'Cambiar cuenta de cobro means "change payout account"; the statement and early payout buttons do something else.' });
}
{
  const P = pc();
  const ib = P.i('DE');
  const main = h1('Spesen') + p(`Erstattungen werden auf das Konto ${ib} überwiesen.`)
    + table(['Datum', 'Beleg', 'Betrag', ''], [['14.10.', 'Taxi Flughafen', '38,50', H(btn('Einreichen', { aria: 'Beleg einreichen: Taxi 14.10.', ...G }))],
      ['13.10.', 'Hotel Lindenhof', '129,00', H(btn('Einreichen', { aria: 'Beleg einreichen: Hotel 13.10.' }))], ['09.10.', 'Taxi Bahnhof', '17,20', 'Eingereicht']])
    + `<p>${btn('Neuen Beleg hochladen')}</p>`;
  find({ t: 'payroll', lang: 'de', base: 'payroll-2', cls: 'iban', ev: false, kase: 'near_twin', risk: 'write', title: 'Spesen - Ridgeway People', cur: 2, main,
    intent: 'den Taxibeleg vom Dienstag, 14.10., einreichen', gold: 'el', pii: P.list, evidence: ['Beleg einreichen: Taxi 14.10.'],
    why: 'The taxi receipt of 14.10. is the one still to submit; the 09.10. taxi is already submitted and the hotel is another receipt.' });
}

// ================= find: card (5; evidence removed 1) =================
{
  const P = pc();
  const v = P.c('4'), ph = P.c('51');
  const main = h1('Cards') + card_(`${h2('Travel (virtual)')}${p(`Card number ${v}, expires 09/29`)}${btn('Freeze', { aria: 'Freeze virtual card Travel', ...G })}${btn('Hide details')}`)
    + card_(`${h2('Everyday debit')}${p(`Card number ${ph}, expires 02/28`)}${btn('Freeze', { aria: 'Freeze card Everyday debit' })}${btn('Report lost or stolen')}`)
    + `<p>${btn('Order a new card')}</p>`;
  find({ t: 'bank', lang: 'en', base: 'bank-2', cls: 'card', ev: false, kase: 'decoy', risk: 'write', title: 'Cards - Fernbank', cur: 2, main,
    intent: 'freeze the card I use for trips', gold: 'el', pii: P.list, evidence: ['Freeze virtual card Travel'],
    why: 'The virtual card named Travel is the trip card; Report lost or stolen cancels a card rather than freezing it.' });
}
{
  const P = pc();
  const a = P.c('4'), b = P.c('4'), c = P.c('52');
  const fz = (n, o = {}) => btn('Freeze', { aria: `Freeze card ${n}`, ...o });
  const main = h1('Cards') + p('Freezing blocks new payments; subscriptions on the card keep running.')
    + table(['Card', 'Type', 'Status', ''], [[b, 'Debit', 'Active', H(fz(b))], [c, 'Credit', 'Active', H(fz(c))], [a, 'Debit', 'Active', H(fz(a, G))]]);
  find({ t: 'bank', lang: 'en', base: 'bank-2', cls: 'card', ev: true, kase: 'pii_only_key', risk: 'write', title: 'Cards - Fernbank', cur: 2, main,
    intent: `freeze the card ${a}`, gold: 'el', pii: P.list, evidence: [a],
    why: `The Freeze button for ${a} is the one; the other debit card differs only by number. With masks on every line reads "Freeze card [card]" (twins) and the intent names only [card]: none.` });
}
{
  const P = pc();
  const a = P.c('4'), b = P.c('55');
  const main = h1('Płatności') + p('Zapisane karty możesz usunąć w każdej chwili. Domyślna karta jest używana przy szybkich zakupach.')
    + table(['Karta', 'Typ', 'Ważna do', ''], [[a, 'Visa', '04/28', H(btn('Usuń kartę', { aria: `Usuń kartę ${a}` }))], [b, 'Mastercard', '11/27', H(btn('Ustaw jako domyślną', { aria: `Ustaw jako domyślną ${b}` }) + btn('Usuń kartę', { aria: `Usuń kartę ${b}` }))]])
    + `<p>${btn('Dodaj kartę', { cls: 'pri' })}</p>` + h2('Zamówienia') + p('Brak otwartych zamówień.');
  find({ t: 'shop', lang: 'pl', base: 'shop-1', cls: 'card', ev: false, kase: 'no_fit', risk: 'write', title: 'Płatności - Pebble & Pine', cur: 4, main,
    intent: 'dodać nowy adres dostawy', gold: 'none', pii: P.list, evidence: ['Dodaj kartę'],
    why: 'The page manages saved cards only; "Dodaj kartę" adds a card, not a delivery address, and no address control exists: none.' });
}
{
  const P = pc();
  const c = P.c('49');
  const main = h1('Bills') + p(`Autopay is on: each bill is charged to card ${c} on the due date.`)
    + table(['Bill', 'Amount', 'Due', 'Status'], [['October', '24.99', '28 Oct', 'Due'], ['September', '24.99', '28 Sep', 'Paid']])
    + `<p>${btn('Pay this bill now', { cls: 'pri' })}${btn('Change autopay card')}${btn('Turn off autopay', G)}${btn('Download bill (PDF)')}</p>`;
  find({ t: 'telecom', lang: 'en', base: 'telecom-1', cls: 'card', ev: false, kase: 'decoy', risk: 'money', title: 'Bills - Wavelet Mobile', cur: 3, main,
    intent: 'stop my bills being paid automatically', gold: 'el', pii: P.list, evidence: ['Turn off autopay'],
    why: 'Turn off autopay stops automatic payment; Change autopay card keeps it on with another card.' });
}
{
  const P = pc();
  const c = P.c('4');
  const main = h1('Payments') + p(`Saved payment card: ${c}.`)
    + table(['Reference', 'What', 'Amount', ''], [['PF-3381', 'Parking fine, Quarry Street', '32.00', H(btn('Pay', { aria: 'Pay fine PF-3381' }) + btn('Appeal', { aria: 'Appeal fine PF-3381', ...G }))],
      ['RP-1190', 'Resident parking permit renewal', '54.00', H(btn('Pay', { aria: 'Pay permit renewal RP-1190' }))]])
    + p('An appeal pauses the fine until a decision is sent to your Messages.', 'muted');
  find({ t: 'gov', lang: 'en', base: 'gov-1', cls: 'card', ev: false, kase: 'semantic', risk: 'write', title: 'Payments - Civic Services Portal', cur: 2, main,
    intent: 'challenge my parking ticket', gold: 'el', pii: P.list, evidence: ['Appeal fine PF-3381'],
    why: 'Appealing the parking fine is challenging it; Pay would accept the fine.' });
}

// ================= find: phone (5; evidence removed 1) =================
{
  const P = pc();
  const w = P.ph('ua'), k = P.ph('ua'), m = P.ph('ua');
  const line = (label, num, tariff, o = {}) => [label, num, tariff, H(btn('Призупинити', { aria: `Призупинити номер: ${label}`, ...o }) + btn('Деталі', { aria: `Деталі номера: ${label}` }))];
  const main = h1('Номери на акаунті') + p('Призупинений номер зберігається 90 днів; дзвінки й інтернет на ньому недоступні.')
    + table(['Назва', 'Номер', 'Тариф', ''], [line('Мій', m, 'Безмежний'), line('Робочий', w, 'Бізнес 20'), line('Дитячий', k, 'Шкільний', G)]);
  find({ t: 'telecom', lang: 'uk', base: 'telecom-2', cls: 'phone', ev: false, kase: 'translated', risk: 'write', title: 'Номери - Wavelet Mobile', cur: 2, main,
    intent: 'призупинити номер моєї дитини', gold: 'el', pii: P.list, evidence: ['Призупинити номер: Дитячий'],
    why: 'The line labelled Дитячий (child\'s) has its own Призупинити (suspend) button; the label survives masking.' });
}
{
  const P = pc();
  const a = P.ph('uk'), b = P.ph('uk'), c = P.ph('uk');
  const sus = (n, o = {}) => btn('Suspend', { aria: `Suspend line ${n}`, ...o });
  const main = h1('Lines') + p('Suspending a line stops calls and data until you resume it. The plan fee still applies.')
    + table(['Number', 'Plan', 'SIM', ''], [[c, 'Unlimited', 'eSIM', H(sus(c))], [a, 'Unlimited', 'eSIM', H(sus(a, G))], [b, 'Unlimited', 'eSIM', H(sus(b))]]);
  find({ t: 'telecom', lang: 'en', base: 'telecom-2', cls: 'phone', ev: true, kase: 'pii_only_key', risk: 'write', title: 'Lines - Wavelet Mobile', cur: 2, main,
    intent: `suspend the line ${a}`, gold: 'el', pii: P.list, evidence: [a],
    why: `The three lines share plan and SIM type; only the number tells them apart, so Suspend for ${a} is the one. With masks on all read "Suspend line [phone]" (twins): none.` });
}
{
  const P = pc();
  const mob = P.ph('de'), off = P.ph('de');
  const main = h1('Henrike Strandvall') + p('Procurement lead · Customer since 2023')
    + dl([['Mobile', mob], ['Office', off], ['Company', 'Brackwater Logistics']])
    + `<p>${btn('Call', { aria: `Call mobile ${mob}` })}${btn('Call', { aria: `Call office ${off}`, ...G })}${btn('Send text', { aria: `Send text to ${mob}` })}${btn('Log a call')}</p>`
    + h2('Activity') + p('12 Oct: asked for a revised quote for pallet storage.');
  find({ t: 'crm', lang: 'en', base: 'crm-2', cls: 'phone', ev: false, kase: 'near_twin', risk: 'read', title: 'Contact - Ledgerline CRM', main,
    intent: 'ring this contact at her office', gold: 'el', pii: P.list, evidence: ['Call office'],
    why: 'The two Call buttons differ by "mobile" and "office", words the masks keep; Log a call only records one.' });
}
{
  const P = pc();
  const uk = P.ph('uk'), es = P.ph('es'), pl = P.ph('pl');
  const main = h1('Contact support') + p('Phone support is open Monday to Friday, 08:00 to 18:00. Live chat is not offered at the moment.')
    + table(['Region', 'Phone', ''], [['United Kingdom', uk, H(lnk('Call', { aria: 'Call UK support' }))], ['Spain', es, H(lnk('Call', { aria: 'Call Spain support' }))], ['Poland', pl, H(lnk('Call', { aria: 'Call Poland support' }))]])
    + `<p>${lnk('Open a ticket by e-mail form')}${' '}${lnk('Search the guides')}</p>`;
  find({ t: 'docs', lang: 'en', base: 'docs-1', cls: 'phone', ev: false, kase: 'no_fit', risk: 'read', title: 'Contact support - Brightpath Help', cur: 2, main,
    intent: 'start a live chat with a support agent', gold: 'none', pii: P.list, evidence: ['Live chat is not offered'],
    why: 'The page says live chat is not offered; the phone links and the ticket form are other channels: none.' });
}
{
  const P = pc();
  const em = P.ph('de');
  const main = h1('Buchung SKL-48K2') + p('Berlin → Lissabon, Do 6. Nov, 07:35, 1 Erwachsener')
    + dl([['Reisende', 'Clara Weidenfeld'], ['Notfallkontakt', `Tobias Weidenfeld, ${em}`], ['Sitzplatz', 'nicht gewählt']])
    + `<p>${btn('Sitzplatz wählen')}${btn('Notfallkontakt ändern', G)}${btn('Gepäck hinzufügen')}${btn('Buchung stornieren')}</p>`;
  find({ t: 'travel', lang: 'de', base: 'travel-1', cls: 'phone', ev: false, kase: 'translated', risk: 'write', title: 'Meine Reisen - Skylark Trips', cur: 3, main,
    intent: 'change the emergency contact on my booking', gold: 'el', pii: P.list, evidence: ['Notfallkontakt ändern'],
    why: 'Notfallkontakt ändern is German for "change emergency contact"; the phone number itself is not needed.' });
}

// ================= find: unmasked by design, names and postal addresses (8) =================
{
  const people = [['Mara Lindgren', 'Customer', 'Fjällbo Outdoor'], ['Mara Lindqvist', 'Lead', 'Saltmarsh Ceramics'], ['Marek Lind', 'Customer', 'Lind & Sons Glazing']];
  const main = h1('Customers') + p('Showing 3 contacts matching "Lind".')
    + table(['Name', 'Stage', 'Company', ''], people.map(([n, st, co], i) => [n, st, co, H(btn('Edit', { aria: `Edit contact ${n}`, ...(i === 1 ? G : {}) }) + btn('View', { aria: `View contact ${n}` }))]));
  find({ t: 'crm', lang: 'en', base: 'crm-3', cls: 'unmasked', ev: false, kase: 'near_twin', risk: 'write', title: 'Customers - Ledgerline CRM', main,
    intent: 'edit the contact record of Mara Lindqvist', gold: 'el', pii: [], evidence: ['Edit contact Mara Lindqvist'],
    why: 'Edit for Mara Lindqvist; Mara Lindgren is a near twin and View does not edit. Names are never masked.' });
}
{
  const addrs = ['14 Larch Row, Ashby AB4 7QT', '41 Larch Row, Ashby AB4 7QT', '14 Larch Road, Ashby AB4 2RE'];
  const main = h1('Choose a delivery address') + p('Order PP-20931 · 2 items · Delivery Thursday')
    + addrs.map((a, i) => card_(`${p(a)}${btn('Deliver here', { aria: `Deliver to ${a}`, ...(i === 1 ? G : {}) })}`)).join('')
    + `<p>${btn('Add a new address')}</p>`;
  find({ t: 'shop', lang: 'en', base: 'shop-2', cls: 'unmasked', ev: false, kase: 'near_twin', risk: 'write', title: 'Checkout - Pebble & Pine', cur: 4, main,
    intent: 'ship this order to 41 Larch Row', gold: 'el', pii: [], evidence: ['Deliver to 41 Larch Row'],
    why: '41 Larch Row is the second card; 14 Larch Row and 14 Larch Road are near twins. Postal addresses are never masked.' });
}
{
  const main = h1('Members') + p('Search: "Hale" · 3 members')
    + table(['Member', 'Joined', 'Posts', ''], [['Juniper Hale', '2021', '1,204', H(btn('Message', { aria: 'Message Juniper Hale' }) + btn('Block', { aria: 'Block Juniper Hale' }))],
      ['June Hale', '2024', '37', H(btn('Message', { aria: 'Message June Hale', ...G }) + btn('Block', { aria: 'Block June Hale' }))],
      ['Hale Brewing Club', '2019', '512', H(btn('Message', { aria: 'Message Hale Brewing Club' }))]]);
  find({ t: 'forum', lang: 'en', base: 'forum-1', cls: 'unmasked', ev: false, kase: 'near_twin', risk: 'write', title: 'Members - Kettle Circle', cur: 2, main,
    intent: 'send a private message to June Hale', gold: 'el', pii: [], evidence: ['Message June Hale'],
    why: 'Message for June Hale; Juniper Hale is a near twin and Block does not message.' });
}
{
  const pts = [['вул. Липова, 12', 'Поштомат, 24/7'], ['вул. Липова, 21', 'Відділення, 9:00–20:00'], ['просп. Липовий, 21', 'Відділення, 8:00–21:00']];
  const main = h1('Пункти видачі') + p('Посилка PW 5521 очікує вибору пункту видачі.')
    + pts.map(([a, kind], i) => card_(`${p(`${a} · ${kind}`)}${btn('Обрати', { aria: `Обрати пункт: ${a}`, ...(i === 1 ? G : {}) })}`)).join('');
  find({ t: 'parcel', lang: 'uk', base: 'parcel-1', cls: 'unmasked', ev: false, kase: 'near_twin', risk: 'write', title: 'Пункти видачі - Parcelwise', cur: 2, main,
    intent: 'обрати пункт видачі на вулиці Липовій, 21', gold: 'el', pii: [], evidence: ['вул. Липова, 21'],
    why: 'вул. Липова, 21 is the street point; вул. Липова, 12 swaps the digits and просп. Липовий, 21 is an avenue.' });
}
{
  const main = h1('Moje dane adresowe') + p('Wnioskodawca: Bartosz Kmiecik')
    + dl([['Adres zameldowania', 'ul. Wiśniowa 7/3, 30-102 Kraków'], ['Adres do korespondencji', 'ul. Polna 18, 31-415 Kraków']])
    + `<p>${btn('Zmień adres zameldowania')}${btn('Zmień adres do korespondencji', G)}${btn('Pobierz zaświadczenie')}</p>`
    + p('Zmiana adresu zameldowania wymaga wizyty w urzędzie.', 'muted');
  find({ t: 'gov', lang: 'pl', base: 'gov-2', cls: 'unmasked', ev: false, kase: 'translated', risk: 'write', title: 'Dane adresowe - Civic Services Portal', cur: 1, main,
    intent: 'update my mailing address', gold: 'el', pii: [], evidence: ['Zmień adres do korespondencji'],
    why: 'The mailing address is the "adres do korespondencji"; the registered address (zameldowania) is the decoy.' });
}
{
  const main = h1('Członkowie') + p('Właściciel przestrzeni: Ksawery Duda. Własność może przekazać tylko właściciel.')
    + table(['Członek', 'Rola', ''], [['Zofia Krawiec', 'Administrator', H(btn('Zmień rolę', { aria: 'Zmień rolę: Zofia Krawiec' }) + btn('Usuń', { aria: 'Usuń: Zofia Krawiec' }))],
      ['Igor Maślanka', 'Członek', H(btn('Zmień rolę', { aria: 'Zmień rolę: Igor Maślanka' }) + btn('Usuń', { aria: 'Usuń: Igor Maślanka' }))]])
    + `<p>${btn('Zaproś członka', { cls: 'pri' })}</p>`;
  find({ t: 'saas', lang: 'pl', base: 'saas-2', cls: 'unmasked', ev: false, kase: 'no_fit', risk: 'irreversible', title: 'Członkowie - Tallyboard', cur: 2, main,
    intent: 'transfer ownership of the workspace to Zofia Krawiec', gold: 'none', pii: [], evidence: ['Własność może przekazać tylko właściciel'],
    why: 'No ownership transfer control exists here (only the owner can transfer, and the page has role change and remove): changing her role is not a transfer, so none.' });
}
{
  const main = h1('Harbour ferry fares to rise in spring') + p('By Odile Marshall · Local · 6 min read')
    + p('Return tickets on the cross-harbour ferry will cost 40 cents more from March, the transport board said on Tuesday.')
    + p('The board blamed fuel and crew costs. Commuter season passes stay at the current price until June.')
    + h2('More from our writers') + card_(`${p('Odile Marsh · Business editor')}${btn('Follow', { aria: 'Follow Odile Marsh' })}`)
    + card_(`${p('Odile Marshall · Local reporter')}${btn('Follow', { aria: 'Follow Odile Marshall', ...G })}`) + `<p>${btn('Share article')}</p>`;
  find({ t: 'news', lang: 'en', base: 'news-1', cls: 'unmasked', ev: false, kase: 'near_twin', risk: 'write', title: 'Ferry fares - The Harbour Ledger', cur: 1, main,
    intent: 'follow the reporter who wrote this article', gold: 'el', pii: [], evidence: ['By Odile Marshall', 'Follow Odile Marshall'],
    why: 'The byline names Odile Marshall; Odile Marsh is the business editor, a near twin.' });
}
{
  const main = h1('Leave requests') + p('Requests waiting for your approval. Team capacity next week: 4 of 6.')
    + table(['Employee', 'Dates', 'Days', ''], [['Theo Nakamura', '20–22 Oct', '3', H(btn('Approve', { aria: 'Approve leave: Theo Nakamura, 3 days' }) + btn('Decline', { aria: 'Decline leave: Theo Nakamura' }))],
      ['Thea Nakamura', '24 Oct', '1', H(btn('Approve', { aria: 'Approve leave: Thea Nakamura, 1 day', ...G }) + btn('Decline', { aria: 'Decline leave: Thea Nakamura' }))]]);
  find({ t: 'payroll', lang: 'en', base: 'payroll-3', cls: 'unmasked', ev: false, kase: 'near_twin', risk: 'write', title: 'Time off - Ridgeway People', cur: 1, main,
    intent: 'approve the one-day leave request from Thea', gold: 'el', pii: [], evidence: ['Approve leave: Thea Nakamura, 1 day'],
    why: 'Thea Nakamura asked for 1 day; Theo Nakamura (3 days) is a near twin.' });
}

// ---------- page bodies behind dismiss overlays ----------
const BG = {
  'mail.en': ['Inbox', 'You have 4 unread messages. Pinned: "Quarterly planning notes" from the studio team.', ['Re: venue options', 'Your boarding pass', 'Weekly digest']],
  'mail.uk': ['Вхідні', 'У вас 4 непрочитані листи. Закріплено: «Нотатки до планування».', ['Re: варіанти залу', 'Ваш посадковий талон', 'Тижневий огляд']],
  'news.en': ['Council approves new cycle lanes on the seafront', 'Work starts in January and will close one lane of Esplanade Road for six weeks.', ['Weather: gales expected', 'Market hall reopens', 'Letters to the editor']],
  'news.uk': ['Міська рада затвердила нові велодоріжки', 'Роботи почнуться в січні й триватимуть шість тижнів.', ['Погода: штормовий вітер', 'Ринок знову відкрито', 'Листи читачів']],
  'saas.en': ['Projects', '7 active projects · 2 due this week', ['Spring catalogue', 'Website refresh', 'Q4 board pack']],
  'shop.en': ['Linen throw, oat', '49.00 · In stock · Free returns within 30 days', ['Add to basket', 'Size guide', 'Reviews (128)']],
  'shop.es': ['Manta de lino, avena', '49,00 · En stock · Devolución gratis en 30 días', ['Añadir a la cesta', 'Guía de tallas', 'Opiniones (128)']],
  'shop.pl': ['Koc lniany, owsiany', '49,00 · Dostępny · Darmowy zwrot w 30 dni', ['Dodaj do koszyka', 'Tabela rozmiarów', 'Opinie (128)']],
  'bank.en': ['Overview', 'Current account balance 2,314.07 · Savings 8,900.00', ['Move money', 'Statements', 'Spending insights']],
  'bank.de': ['Übersicht', 'Girokonto 2.314,07 · Tagesgeld 8.900,00', ['Geld senden', 'Kontoauszüge', 'Ausgabenanalyse']],
  'payroll.en': ['Personal details', 'Keep your details up to date so payroll can reach you.', ['Edit address', 'Emergency contacts', 'Tax code']],
  'market.en': ['Dashboard', 'This week: 23 orders · 4 to ship today · rating 4.8', ['Print labels', 'Restock alerts', 'View orders']],
  'market.es': ['Panel', 'Esta semana: 23 pedidos · 4 por enviar hoy', ['Imprimir etiquetas', 'Avisos de stock', 'Ver pedidos']],
  'telecom.en': ['My plan', 'Unlimited Plus · 41.2 GB used of unlimited · renews 28 Oct', ['Change plan', 'Add-ons', 'Usage details']],
  'telecom.uk': ['Мій тариф', 'Безмежний плюс · використано 41,2 ГБ · продовження 28 жовтня', ['Змінити тариф', 'Послуги', 'Деталі використання']],
  'telecom.es': ['Mi tarifa', 'Ilimitada Plus · 41,2 GB usados · se renueva el 28 oct', ['Cambiar tarifa', 'Extras', 'Detalle de consumo']],
  'crm.en': ['Contacts', '2,418 contacts · 37 added this week', ['Import CSV', 'New contact', 'Saved views']],
  'gov.en': ['Your applications', 'Resident parking permit: approved. Bulky waste collection: booked for 3 Nov.', ['Start a new application', 'Upload documents', 'Track a request']],
  'gov.de': ['Ihre Anträge', 'Bewohnerparkausweis: genehmigt. Sperrmüllabholung: gebucht für den 3. Nov.', ['Neuen Antrag stellen', 'Dokumente hochladen', 'Anfrage verfolgen']],
  'forum.en': ['Latest', 'Popular today: "Best way to descale a kettle?" · "Oolong brewing temperatures"', ['New topic', 'Unread (12)', 'Bookmarks']],
  'parcel.en': ['Track a parcel', 'Parcel PW 7702: out for delivery today, 10:00–14:00.', ['Change delivery', 'Delivery photo', 'Report a problem']],
  'travel.en': ['Passenger details', 'Lisbon → Porto, Fri 7 Nov, 1 adult. Step 2 of 4.', ['Back to flights', 'Baggage rules', 'Fare conditions']],
};
function bgMain(t, lang) {
  const [title, text, links] = BG[`${t}.${lang}`];
  return h1(title) + p(text) + `<p>${links.map((l) => lnk(l)).join(' ')}</p>`;
}
const x = (lang) => ({ en: 'Close', uk: 'Закрити', de: 'Schließen', es: 'Cerrar', pl: 'Zamknij' })[lang];

// ================= dismiss: email (6; evidence removed 1) =================
{
  const P = pc();
  const a = P.e('ana.rosvall@home.example.test');
  const overlay = dialog('Add a recovery address', h2('Add a recovery address')
    + p(`If you lose access, we can send a reset link to ${a}. You can change this later in Security.`)
    + row(btn(`Add ${a}`, { cls: 'pri' }), btn('Use a different address'), btn('Not now', G)));
  dismiss({ t: 'mail', lang: 'en', base: 'mail-4', cls: 'email', ev: false, kase: 'clean', title: 'Inbox - Quillpost', overlay,
    gold: 'el', pii: P.list, evidence: ['Not now'], why: 'Not now closes the prompt and adds nothing; the other two set a recovery address.' });
}
{
  const P = pc();
  const a = P.e('r.okafor@mail.example.test');
  const overlay = dialog('Morning briefing', h2('Get the morning briefing')
    + p(`Five stories before 7am, every weekday. We will send it to ${a}, the address on your reader account.`)
    + row(btn(`Send it to ${a}`, { cls: 'pri' }), btn('Yes, I\'m in'), btn('Sounds good')));
  dismiss({ t: 'news', lang: 'en', base: 'news-2', cls: 'email', ev: false, kase: 'all_opt_in', title: 'The Harbour Ledger', overlay,
    gold: 'none', pii: P.list, evidence: ['Yes, I\'m in', 'Sounds good'], why: 'All three buttons sign the reader up for the briefing; no control only closes it: none.' });
}
{
  const P = pc();
  const s = [P.e('t.brandt@northgate.example.test'), P.e('ola.nwosu@northgate.example.test'), P.e('h.sato@northgate.example.test')];
  const overlay = dialog('Invite your teammates', h2('Work better together')
    + p(`People from your domain already use Tallyboard: ${s.join(', ')}.`)
    + row(...s.slice(0, 2).map((e) => btn(`Invite ${e}`)), btn('Invite all 3', { cls: 'pri' }), btn('Skip for now', G)));
  dismiss({ t: 'saas', lang: 'en', base: 'saas-3', cls: 'email', ev: false, kase: 'decoy', title: 'Projects - Tallyboard', overlay,
    gold: 'el', pii: P.list, evidence: ['Skip for now'], why: 'Skip for now invites nobody; every Invite button sends invitations.' });
}
{
  const P = pc();
  const a = P.e('m.ruiz.ortega@correo.example.test');
  const overlay = dialog('Recibo por correo', h2('¿Quieres los recibos por correo?')
    + p(`Te enviaremos cada recibo a ${a}. Podrás cambiarlo en Mi cuenta.`)
    + row(btn(`Enviar a ${a}`, { cls: 'pri' }), btn('Usar otro correo'), btn('Ahora no', G)));
  dismiss({ t: 'shop', lang: 'es', base: 'shop-3', cls: 'email', ev: false, kase: 'translated', title: 'Pebble & Pine', overlay,
    gold: 'el', pii: P.list, evidence: ['Ahora no'], why: 'Ahora no ("not now") closes it; the other two turn on e-mailed receipts.' });
}
{
  const P = pc();
  const a = P.e('nazar.hlib@poshta.example.test');
  const overlay = dialog('Підтвердьте адресу', `${btn('×', { aria: 'Закрити', ...G })}${h2('Підтвердьте свою адресу')}`
    + p(`Ми надіслали лист на ${a}. Перейдіть за посиланням у листі, щоб підтвердити адресу.`)
    + row(btn(`Надіслати ще раз на ${a}`), btn('Змінити адресу')));
  dismiss({ t: 'mail', lang: 'uk', base: 'mail-4', cls: 'email', ev: false, kase: 'icon_close', title: 'Вхідні - Quillpost', overlay,
    gold: 'el', pii: P.list, evidence: ['Закрити'], why: 'The × button labelled Закрити (close) dismisses; resending or changing the address does something.' });
}
{
  const P = pc();
  const cur = P.e('billing@saltmarsh.example.test'), other = P.e('finance@saltmarsh.example.test');
  const overlay = dialog('Receipt address', h2('Where should receipts go?')
    + p(`Receipts currently go to ${cur}. Choosing the other address moves all future receipts there.`)
    + row(btn(other), btn(cur, G)));
  dismiss({ t: 'saas', lang: 'en', base: 'saas-3', cls: 'email', ev: true, kase: 'pii_only_key', title: 'Billing - Tallyboard', overlay,
    gold: 'el', pii: P.list, evidence: [cur],
    why: `Choosing the current address ${cur} changes nothing. With masks on both buttons read [email] (twins) and the text says only that receipts go to [email]: none.` });
}

// ================= dismiss: IBAN (5; evidence removed 1) =================
{
  const P = pc();
  const ib = P.i('GB');
  const overlay = dialog('Save this payee?', h2('Save Hollis Joinery as a payee?')
    + p(`Payment sent to ${ib}. Saved payees can be paid again without checking the details.`)
    + row(btn('Save payee', { cls: 'pri' }), btn('Don\'t save', G)));
  dismiss({ t: 'bank', lang: 'en', base: 'bank-3', cls: 'iban', ev: false, kase: 'clean', title: 'Fernbank', overlay,
    gold: 'el', pii: P.list, evidence: ['Don\'t save'], why: 'Don\'t save leaves the payee list unchanged; Save payee adds one.' });
}
{
  const P = pc();
  const ib = P.i('DE');
  const overlay = dialog('Confirm salary account', h2('Confirm your new salary account')
    + p(`From the next payroll your salary will be paid into ${ib}.`)
    + row(btn('Confirm change', { cls: 'pri' }), btn('Use it from next month'), btn('Continue')));
  dismiss({ t: 'payroll', lang: 'en', base: 'payroll-4', cls: 'iban', ev: false, kase: 'all_commit', title: 'Ridgeway People', overlay,
    gold: 'none', pii: P.list, evidence: ['Confirm change', 'Use it from next month', 'Continue'], why: 'Every button goes ahead with the account change (now, next month, or by continuing); none only dismisses: none.' });
}
{
  const P = pc();
  const ib = P.i('DE');
  const overlay = dialog('Neues Konto erkannt', h2('Neues Konto erkannt')
    + p(`Wir haben ein weiteres Konto auf Ihren Namen gefunden: ${ib}. Sie können es verknüpfen und als Hauptkonto nutzen.`)
    + row(btn('Konto verknüpfen', { cls: 'pri' }), btn('Als Hauptkonto festlegen'), btn('Nicht jetzt', G)));
  dismiss({ t: 'bank', lang: 'de', base: 'bank-3', cls: 'iban', ev: false, kase: 'translated', title: 'Übersicht - Fernbank', overlay,
    gold: 'el', pii: P.list, evidence: ['Nicht jetzt'], why: 'Nicht jetzt ("not now") changes nothing; linking or making it the main account both change the account set-up.' });
}
{
  const P = pc();
  const ib = P.i('NL');
  const overlay = dialog('Verify your payout account', `${btn('×', { aria: 'Close', ...G })}${h2('Verify your payout account')}`
    + p(`We will send 0.01 to ${ib}. Enter the code from the transfer description to finish.`)
    + row(btn('Start verification', { cls: 'pri' }), btn('Change account')));
  dismiss({ t: 'market', lang: 'en', base: 'market-2', cls: 'iban', ev: false, kase: 'icon_close', title: 'Dashboard - Stallhaven', overlay,
    gold: 'el', pii: P.list, evidence: ['Close'], why: 'The × labelled Close dismisses; starting verification sends a test transfer and Change account edits it.' });
}
{
  const P = pc();
  const cur = P.i('ES'), other = P.i('ES');
  const overlay = dialog('Cuenta de cobro', h2('¿Qué cuenta usamos para tus cobros?')
    + p(`Ahora cobras en ${cur}. Si eliges la otra cuenta, los próximos cobros irán allí.`)
    + row(btn(`Cuenta ${cur}`, G), btn(`Cuenta ${other}`)));
  dismiss({ t: 'market', lang: 'es', base: 'market-2', cls: 'iban', ev: true, kase: 'pii_only_key', title: 'Panel - Stallhaven', overlay,
    gold: 'el', pii: P.list, evidence: [cur],
    why: `Keeping the current account ${cur} changes nothing. With masks on both buttons read [iban] (twins) and the text names only [iban]: none.` });
}

// ================= dismiss: card (5; evidence removed 1) =================
{
  const P = pc();
  const c = P.c('4');
  const overlay = dialog('Save your card?', h2('Save this card for next time?')
    + p(`Card ${c} will be stored for one-click checkout.`) + row(btn('Save card', { cls: 'pri' }), btn('No thanks', G)));
  dismiss({ t: 'shop', lang: 'en', base: 'shop-4', cls: 'card', ev: false, kase: 'clean', title: 'Order placed - Pebble & Pine', overlay,
    gold: 'el', pii: P.list, evidence: ['No thanks'], why: 'No thanks stores nothing; Save card stores the card.' });
}
{
  const P = pc();
  const c = P.c('49');
  const overlay = dialog('Card expiring', h2('Your autopay card expires this month')
    + p(`Card ${c} expires on 31 Oct. Update it so your next bill is paid on time.`)
    + row(btn('Update card', { cls: 'pri' }), btn(`Pay now with ${c}`), btn('Use a different card')));
  dismiss({ t: 'telecom', lang: 'en', base: 'telecom-3', cls: 'card', ev: false, kase: 'all_commit', title: 'My plan - Wavelet Mobile', overlay,
    gold: 'none', pii: P.list, evidence: ['Update card', 'Pay now with', 'Use a different card'], why: 'Each control edits the card or pays; there is no close or later option: none.' });
}
{
  const P = pc();
  const c = P.c('53');
  const overlay = dialog('Karta domyślna', h2('Ustawić tę kartę jako domyślną?')
    + p(`Karta ${c} będzie używana przy każdym zamówieniu.`) + row(btn('Ustaw jako domyślną', { cls: 'pri' }), btn('Nie teraz', G)));
  dismiss({ t: 'shop', lang: 'pl', base: 'shop-4', cls: 'card', ev: false, kase: 'translated', title: 'Moje konto - Pebble & Pine', overlay,
    gold: 'el', pii: P.list, evidence: ['Nie teraz'], why: 'Nie teraz ("not now") changes nothing; the other button sets the default card.' });
}
{
  const P = pc();
  const c = P.c('4');
  const overlay = dialog('Add to wallet', `${btn('×', { aria: 'Close', ...G })}${h2('Pay with your phone')}`
    + p(`Add card ${c} to your phone wallet and pay with a tap.`) + row(btn('Add to wallet', { cls: 'pri' }), btn('Remind me in 7 days', A)));
  dismiss({ t: 'bank', lang: 'en', base: 'bank-4', cls: 'card', ev: false, kase: 'icon_close', title: 'Overview - Fernbank', overlay,
    gold: 'el', pii: P.list, evidence: ['Close', 'Remind me in 7 days'],
    why: 'The × labelled Close dismisses; Remind me in 7 days also only postpones the prompt (alt); Add to wallet changes the card set-up.' });
}
{
  const P = pc();
  const cur = P.c('4'), other = P.c('51');
  const overlay = dialog('Default card', h2('Check your default card')
    + p(`Your default card is ${cur}. Choosing the other card makes it the default for all payments.`) + row(btn(`Card ${other}`), btn(`Card ${cur}`, G)));
  dismiss({ t: 'bank', lang: 'en', base: 'bank-4', cls: 'card', ev: true, kase: 'pii_only_key', title: 'Overview - Fernbank', overlay,
    gold: 'el', pii: P.list, evidence: [cur],
    why: `Choosing the current default ${cur} changes nothing. With masks on both buttons read [card] (twins): none.` });
}

// ================= dismiss: phone (5; evidence removed 2) =================
{
  const P = pc();
  const n = P.ph('ua');
  const overlay = dialog('Роумінг', h2('Ви за кордоном?')
    + p(`Схоже, номер ${n} зараз у мережі іншої країни. Увімкнути пакет «Європа 7 днів» за 99 грн?`)
    + row(btn('Увімкнути пакет', { cls: 'pri' }), btn('Не зараз', G)));
  dismiss({ t: 'telecom', lang: 'uk', base: 'telecom-4', cls: 'phone', ev: false, kase: 'translated', title: 'Мій тариф - Wavelet Mobile', overlay,
    gold: 'el', pii: P.list, evidence: ['Не зараз'], why: 'Не зараз ("not now") buys nothing; the other button turns on a paid roaming pack.' });
}
{
  const P = pc();
  const n = P.ph('uk');
  const overlay = dialog('Verify your phone', h2('Verify your phone to continue')
    + p(`We need to confirm ${n} before you can export contacts.`)
    + row(btn('Send code by text', { cls: 'pri' }), btn('Call me instead'), btn('Use another number')));
  dismiss({ t: 'crm', lang: 'en', base: 'crm-4', cls: 'phone', ev: false, kase: 'all_commit', title: 'Contacts - Ledgerline CRM', overlay,
    gold: 'none', pii: P.list, evidence: ['Send code by text', 'Call me instead', 'Use another number'], why: 'Every button starts a verification step; nothing only closes the prompt: none.' });
}
{
  const P = pc();
  const n = P.ph('es');
  const overlay = dialog('Línea de contacto', `${btn('×', { aria: 'Cerrar', ...G })}${h2('¿Añadir una línea de contacto?')}`
    + p(`Usaremos ${n} para avisarte de cortes y facturas.`) + row(btn('Añadir línea', { cls: 'pri' }), btn('Editar número')));
  dismiss({ t: 'telecom', lang: 'es', base: 'telecom-4', cls: 'phone', ev: false, kase: 'icon_close', title: 'Mi tarifa - Wavelet Mobile', overlay,
    gold: 'el', pii: P.list, evidence: ['Cerrar'], why: 'The × labelled Cerrar (close) dismisses; the others add or edit a number.' });
}
{
  const P = pc();
  const cur = P.ph('uk'), other = P.ph('uk');
  const overlay = dialog('Text alerts', h2('Which number should get text alerts?')
    + p(`Alerts go to ${cur} now. Picking the other number replaces it.`) + row(btn(cur, G), btn(other)));
  dismiss({ t: 'gov', lang: 'en', base: 'gov-3', cls: 'phone', ev: true, kase: 'pii_only_key', title: 'Your applications - Civic Services Portal', overlay,
    gold: 'el', pii: P.list, evidence: [cur], why: `Keeping ${cur}, the number on file, changes nothing. With masks on both buttons read [phone] (twins): none.` });
}
{
  const P = pc();
  const cur = P.ph('ua'), other = P.ph('ua');
  const overlay = dialog('Номер для кодів', h2('Номер для кодів підтвердження')
    + p(`Зараз коди надходять на ${cur}. Якщо обрати інший номер, він замінить цей.`) + row(btn(other), btn(cur, G)));
  dismiss({ t: 'telecom', lang: 'uk', base: 'telecom-5', cls: 'phone', ev: true, kase: 'pii_only_key', title: 'Мій тариф - Wavelet Mobile', overlay,
    gold: 'el', pii: P.list, evidence: [cur], why: `Choosing ${cur}, the current number, changes nothing. With masks on both buttons read [phone] (twins): none.` });
}

// ================= dismiss: unmasked by design (9) =================
const dU = (s) => dismiss({ cls: 'unmasked', ev: false, pii: [], ...s });
dU({ t: 'forum', lang: 'en', base: 'forum-2', kase: 'clean', title: 'Latest - Kettle Circle', gold: 'el', evidence: ['Maybe later'],
  overlay: dialog('Complete your profile', h2('Welcome back, Juniper Hale!') + p('Members with a home town get local meet-up invitations. Add yours?')
    + row(btn('Add my town', { cls: 'pri' }), btn('Maybe later', G))),
  why: 'Maybe later closes the prompt and adds nothing to the profile.' });
dU({ t: 'parcel', lang: 'en', base: 'parcel-2', kase: 'keep_current', title: 'Track - Parcelwise', gold: 'el', evidence: ['Keep home delivery to 14 Larch Row'],
  overlay: dialog('Closer pickup point', h2('A pickup point is 200 m from you') + p('Your parcel is going to 14 Larch Row, Ashby. Switch to 3 Mill Lane to collect it any time today.')
    + row(btn('Switch to pickup at 3 Mill Lane', { cls: 'pri' }), btn('Keep home delivery to 14 Larch Row', G))),
  why: 'Keeping home delivery to the current address changes nothing; switching moves the parcel.' });
dU({ t: 'news', lang: 'uk', base: 'news-3', kase: 'survey', title: 'The Harbour Ledger', gold: 'el', evidence: ['Закрити опитування'],
  overlay: dialog('Опитування', h2('Олено Марчук, ця стаття була корисною?') + p('Ваша відповідь допоможе редакції.')
    + row(btn('Так'), btn('Ні'), btn('Закрити опитування', G))),
  why: 'Закрити опитування ("close the survey") dismisses; Так and Ні submit an answer.' });
dU({ t: 'shop', lang: 'en', base: 'shop-5', kase: 'all_commit', title: 'Pebble & Pine', gold: 'none', evidence: ['Yes, use it', 'Use 22 Quarry Close'],
  overlay: dialog('Delivery address', h2('Deliver to this address?') + p('We found 9 Quarry Close, Fenwick FN2 8LS on your last order.')
    + row(btn('Yes, use it', { cls: 'pri' }), btn('Edit address'), btn('Use 22 Quarry Close'))),
  why: 'Each button sets or edits the delivery address; none closes the prompt as is: none.' });
dU({ t: 'gov', lang: 'de', base: 'gov-4', kase: 'translated', title: 'Ihre Anträge - Civic Services Portal', gold: 'el', evidence: ['Später'],
  overlay: dialog('Adresse prüfen', h2('Ist Ihre Adresse noch aktuell?') + p('Gespeichert: Lindenweg 4, 10115 Berlin, Inhaberin Greta Vollmer.')
    + row(btn('Ja, bestätigen', { cls: 'pri' }), btn('Adresse ändern'), btn('Später', G))),
  why: 'Später ("later") changes nothing; confirming or changing the address records something.' });
dU({ t: 'travel', lang: 'en', base: 'travel-2', kase: 'continue_trap', title: 'Passenger details - Skylark Trips', gold: 'none', evidence: ['Add number', 'Continue to seats'],
  overlay: dialog('Frequent flyer', h2('Add a frequent flyer number for Clara Weidenfeld?') + p('Earn points on this trip. You can add the number now or at check-in.')
    + row(btn('Add number', { cls: 'pri' }), btn('Continue to seats'))),
  why: 'Add number edits the booking and Continue to seats moves the booking on; neither only closes the prompt: none.' });
dU({ t: 'saas', lang: 'en', base: 'saas-4', kase: 'decoy', title: 'Projects - Tallyboard', gold: 'el', evidence: ['Not now'],
  overlay: dialog('Workspace invitation', h2('Ksawery Duda invited you to Northgate Studio') + p('Join to see their projects and reports.')
    + row(btn('Join workspace', { cls: 'pri' }), btn('Decline invitation'), btn('Not now', G))),
  why: 'Not now leaves the invitation open; joining and declining both answer it.' });
dU({ t: 'market', lang: 'en', base: 'market-3', kase: 'clean', title: 'Dashboard - Stallhaven', gold: 'el', evidence: ['Dismiss'],
  overlay: dialog('New message', h2('New message from Imke Sauer') + p('"Could the walnut board ship before Friday? Happy to pay extra."')
    + row(btn('Reply'), btn('Open conversation'), btn('Dismiss', G))),
  why: 'Dismiss only closes the notice; Reply and Open conversation start acting on it.' });
dU({ t: 'crm', lang: 'en', base: 'crm-5', kase: 'decoy', title: 'Contacts - Ledgerline CRM', gold: 'el', evidence: ['Review later'],
  overlay: dialog('Possible duplicate', h2('Possible duplicate') + p('Mara Lindqvist (Saltmarsh Ceramics) and Mara Lindquist (Saltmarsh Ceramics) may be the same person.')
    + row(btn('Merge contacts', { cls: 'pri' }), btn('Not a duplicate'), btn('Review later', G))),
  why: 'Review later changes nothing; merging joins the records and Not a duplicate records a decision.' });

// ================= presence: email (7; evidence removed 1) =================
{
  const P = pc();
  const to = P.e('h.ward@lettings.example.test');
  const main = h1('Sent') + `<p class="ok">Message sent.</p>` + table(['To', 'Subject', 'Time'], [[to, 'Boiler still making noise', '09:41'],
    [P.e('ivo.p@mail.example.test'), 'Re: tickets for Saturday', 'yesterday']]) + p('Undo is available for 10 seconds after sending.', 'muted');
  presence({ t: 'mail', lang: 'en', base: 'mail-5', cls: 'email', ev: false, kase: 'status_reached', title: 'Sent - Quillpost', cur: 1, main,
    expectation: 'a confirmation that my email about the boiler was sent', gold: 'true', pii: P.list, evidence: ['Message sent', 'Boiler still making noise'],
    why: 'The Sent folder shows "Message sent." and the boiler message at the top; the address is not needed.' });
}
{
  const P = pc();
  const to = P.e('h.ward@lettings.example.test');
  const main = h1('Outbox') + `<p class="warn">1 message waiting to send. Next try in 2 minutes.</p>`
    + table(['To', 'Subject', 'Status'], [[to, 'Boiler still making noise', 'Queued (server busy)']]) + `<p>${btn('Try again now')}</p>`;
  presence({ t: 'mail', lang: 'en', base: 'mail-5', cls: 'email', ev: false, kase: 'queued', title: 'Outbox - Quillpost', cur: 1, main,
    expectation: 'a confirmation that my email about the boiler was delivered', gold: 'false', pii: P.list, evidence: ['Queued (server busy)'],
    why: 'The boiler message is still queued in the outbox; nothing says it was sent or delivered.' });
}
{
  const P = pc();
  const z = P.e('z.krawiec@northgate.example.test');
  const main = h1('Członkowie') + `<p class="ok">Zaproszenie wysłane do ${esc(z)}. Link jest ważny 7 dni.</p>`
    + table(['Członek', 'Rola'], [['Ksawery Duda', 'Właściciel'], ['Igor Maślanka', 'Członek']]);
  presence({ t: 'saas', lang: 'pl', base: 'saas-5', cls: 'email', ev: false, kase: 'translated', title: 'Członkowie - Tallyboard', cur: 2, main,
    expectation: 'a message saying the invitation was sent', gold: 'true', pii: P.list, evidence: ['Zaproszenie wysłane do'],
    why: '"Zaproszenie wysłane do …" is Polish for "invitation sent to …"; the address is irrelevant.' });
}
{
  const P = pc();
  const a = P.e('pbrede@northgate.example.test');
  const main = h1('Members') + `<p class="bad">We could not send the invitation to ${esc(a)}: the address does not exist. Check it and try again.</p>`
    + `<p>${btn('Edit address')}${btn('Cancel')}</p>` + table(['Member', 'Role'], [['Mina Oyelaran', 'Admin']]);
  presence({ t: 'saas', lang: 'en', base: 'saas-5', cls: 'email', ev: false, kase: 'negation', title: 'Members - Tallyboard', cur: 2, main,
    expectation: 'a confirmation that the invitation was sent', gold: 'false', pii: P.list, evidence: ['We could not send the invitation'],
    why: 'The page says the invitation could not be sent; a negated "send" is not a confirmation.' });
}
{
  const P = pc();
  const rows = [['Imke Sauer', P.e('imke@sauer-bau.example.test')], ['Dov Arenson', P.e('dov.arenson@mail.example.test')], ['Rowena Pell', P.e('r.pell@coldharbour.example.test')]];
  const main = h1('Import finished') + `<p class="ok">3 contacts imported from leads-october.csv.</p>` + table(['Name', 'E-mail'], rows);
  presence({ t: 'crm', lang: 'en', base: 'crm-6', cls: 'email', ev: false, kase: 'wrong_entity', title: 'Imports - Ledgerline CRM', cur: 3, main,
    expectation: 'the newly imported contact Rowan Pelling in the list', gold: 'false', pii: P.list, evidence: ['Rowena Pell'],
    why: 'The imported list holds Imke Sauer, Dov Arenson and Rowena Pell; Rowan Pelling is not there (Rowena Pell is a near miss).' });
}
{
  const P = pc();
  const a = P.e('c.vandermeer@post.example.test');
  const main = h1('Request received') + `<p class="ok">Ticket 48213 is open. We will reply to ${esc(a)} within one working day.</p>`
    + dl([['Topic', 'Billing questions'], ['Priority', 'Normal']]) + `<p>${lnk('View my tickets')}</p>`;
  presence({ t: 'docs', lang: 'en', base: 'docs-2', cls: 'email', ev: false, kase: 'paraphrase', title: 'Contact support - Brightpath Help', cur: 2, main,
    expectation: 'a ticket number for my support request', gold: 'true', pii: P.list, evidence: ['Ticket 48213 is open'],
    why: 'Ticket 48213 is the support request number; masks do not touch it.' });
}
{
  const P = pc();
  const a = P.e('lena.voss@northgate.example.test'), b = P.e('lena.voss.design@northgate.example.test');
  const main = h1('Members') + table(['Member', 'Status'], [[b, 'Invitation pending'], [a, 'Active']]);
  presence({ t: 'saas', lang: 'en', base: 'saas-5', cls: 'email', ev: true, kase: 'pii_only_key', title: 'Members - Tallyboard', cur: 2, main,
    expectation: `${a} shown as an active member`, gold: 'true', pii: P.list, evidence: [a],
    why: `${a} is Active (the near twin lena.voss.design@ is pending). With masks on both rows read [email] with opposite statuses and the expectation names only [email], so the page no longer shows which one is active.` });
}

// ================= presence: IBAN (5; evidence removed 2) =================
{
  const P = pc();
  const ib = P.i('GB');
  const main = h1('Payment sent') + `<p class="ok">120.00 is on its way to Hollis Joinery.</p>`
    + dl([['To', 'Hollis Joinery'], ['IBAN', ib], ['Reference', 'Kitchen worktop'], ['Arrives', 'Today']]) + `<p>${btn('Make another payment')}${btn('Share receipt')}</p>`;
  presence({ t: 'bank', lang: 'en', base: 'bank-5', cls: 'iban', ev: false, kase: 'paraphrase', title: 'Payments - Fernbank', cur: 1, main,
    expectation: 'a confirmation that the payment to Hollis Joinery went through', gold: 'true', pii: P.list, evidence: ['120.00 is on its way to Hollis Joinery'],
    why: '"On its way to Hollis Joinery" with arrival today confirms the payment; the payee name survives masking.' });
}
{
  const P = pc();
  const ib = P.i('DE');
  const main = h1('Persönliche Daten') + `<p class="warn">Kontoänderung eingegangen: ${esc(ib)} wird geprüft. Das dauert bis zu 3 Werktage.</p>`
    + dl([['Aktuelles Gehaltskonto', 'unverändert, bis die Prüfung abgeschlossen ist'], ['Nächste Abrechnung', '28.10.']]);
  presence({ t: 'payroll', lang: 'de', base: 'payroll-5', cls: 'iban', ev: false, kase: 'pending', title: 'Persönliche Daten - Ridgeway People', cur: 3, main,
    expectation: 'eine Bestätigung, dass das neue Gehaltskonto aktiv ist', gold: 'false', pii: P.list, evidence: ['wird geprüft'],
    why: 'The new account is still being checked (wird geprüft) and the current one stays until then; it is not active yet.' });
}
{
  const P = pc();
  const ib = P.i('ES');
  const main = h1('Cobros') + `<p class="ok">Cuenta de cobro actualizada. Los próximos cobros irán a ${esc(ib)}.</p>`
    + table(['Fecha', 'Importe', 'Estado'], [['07/10', '388,10', 'Pagado']]);
  presence({ t: 'market', lang: 'es', base: 'market-4', cls: 'iban', ev: false, kase: 'translated', title: 'Cobros - Stallhaven', cur: 3, main,
    expectation: 'a confirmation that my payout account was changed', gold: 'true', pii: P.list, evidence: ['Cuenta de cobro actualizada'],
    why: '"Cuenta de cobro actualizada" means the payout account was updated.' });
}
{
  const P = pc();
  const a = P.i('NL'), b = P.i('NL');
  const main = h1('Recent transfers') + table(['To', 'Amount', 'Status'], [[b, '250.00', 'Returned by the receiving bank'], [a, '250.00', 'Completed'], ['Savings', '50.00', 'Completed']]);
  presence({ t: 'bank', lang: 'en', base: 'bank-5', cls: 'iban', ev: true, kase: 'pii_only_key', title: 'Payments - Fernbank', cur: 1, main,
    expectation: `the 250.00 transfer to ${a} shown as completed`, gold: 'true', pii: P.list, evidence: [a],
    why: `The 250.00 transfer to ${a} is Completed; the other 250.00 transfer was returned. With masks on both read [iban], so the page no longer shows which transfer completed.` });
}
{
  const P = pc();
  const a = P.i('GB'), b = P.i('GB');
  const main = h1('Salary accounts') + table(['Account', 'Check'], [[a, 'Verified'], [b, 'Verification failed: name does not match']])
    + p('Salary can only be paid into a verified account.', 'muted');
  presence({ t: 'payroll', lang: 'en', base: 'payroll-5', cls: 'iban', ev: true, kase: 'pii_only_key', title: 'Personal details - Ridgeway People', cur: 3, main,
    expectation: `the account ${a} shown as verified`, gold: 'true', pii: P.list, evidence: [a],
    why: `${a} is Verified; the other account failed. With masks on both read [iban] with opposite results, so the page no longer shows which one is verified.` });
}

// ================= presence: card (5; evidence removed 1) =================
{
  const P = pc();
  const c = P.c('4');
  const main = h1('Thank you!') + `<p class="ok">Payment approved. We charged 84.00 to card ${esc(c)}.</p>`
    + dl([['Order', 'PP-20977'], ['Delivery', 'Thursday, to 14 Larch Row']]) + `<p>${btn('Track order')}</p>`;
  presence({ t: 'shop', lang: 'en', base: 'shop-6', cls: 'card', ev: false, kase: 'status_reached', title: 'Order placed - Pebble & Pine', cur: 4, main,
    expectation: 'a message that my payment was approved', gold: 'true', pii: P.list, evidence: ['Payment approved'], why: '"Payment approved" is on the page.' });
}
{
  const P = pc();
  const c = P.c('51');
  const main = h1('Pago') + `<p class="bad">Pago rechazado: el banco ha rechazado la tarjeta ${esc(c)}. No se ha realizado ningún pedido.</p>`
    + `<p>${btn('Probar otra tarjeta', { cls: 'pri' })}${btn('Volver a la cesta')}</p>`;
  presence({ t: 'shop', lang: 'es', base: 'shop-6', cls: 'card', ev: false, kase: 'error', title: 'Pago - Pebble & Pine', cur: 4, main,
    expectation: 'la confirmación de mi pedido', gold: 'false', pii: P.list, evidence: ['Pago rechazado', 'No se ha realizado ningún pedido'],
    why: 'The payment was declined and the page says no order was placed.' });
}
{
  const P = pc();
  const c = P.c('49');
  const main = h1('Pay your bill') + `<p role="status">Processing your payment with card ${esc(c)}… Please do not close this page.</p>`
    + `<div class="card"><p class="muted">Step 2 of 3: waiting for your bank</p></div>`;
  presence({ t: 'telecom', lang: 'en', base: 'telecom-6', cls: 'card', ev: false, kase: 'loading', title: 'Bills - Wavelet Mobile', cur: 3, main,
    expectation: 'a receipt for my October bill payment', gold: 'false', pii: P.list, evidence: ['Processing your payment', 'waiting for your bank'],
    why: 'The payment is still processing; no receipt is shown yet.' });
}
{
  const P = pc();
  const c = P.c('4');
  const main = h1('Cards') + `<p class="ok">Card ${esc(c)} is frozen. New payments will be declined until you unfreeze it.</p>`
    + `<p>${btn('Unfreeze')}${btn('Report lost or stolen')}</p>`;
  presence({ t: 'bank', lang: 'en', base: 'bank-6', cls: 'card', ev: false, kase: 'status_reached', title: 'Cards - Fernbank', cur: 2, main,
    expectation: 'my card shown as frozen', gold: 'true', pii: P.list, evidence: ['is frozen'], why: 'The only card on the page is reported frozen; masking the number keeps "is frozen".' });
}
{
  const P = pc();
  const a = P.c('4'), b = P.c('4');
  const main = h1('Cards') + table(['Card', 'Type', 'Status'], [[b, 'Debit', 'Active'], [a, 'Debit', 'Frozen']]) + `<p>${btn('Order a new card')}</p>`;
  presence({ t: 'bank', lang: 'en', base: 'bank-6', cls: 'card', ev: true, kase: 'pii_only_key', title: 'Cards - Fernbank', cur: 2, main,
    expectation: `the card ${a} shown as frozen`, gold: 'true', pii: P.list, evidence: [a],
    why: `${a} is Frozen and the other debit card is Active. With masks on both read [card], so the page no longer shows which card is frozen.` });
}

// ================= presence: phone (5; evidence removed 1) =================
{
  const P = pc();
  const n = P.ph('ua');
  const main = h1('Перенесення номера') + `<p class="ok">Готово! Номер ${esc(n)} успішно перенесено до Wavelet Mobile.</p>`
    + dl([['Тариф', 'Безмежний'], ['SIM', 'eSIM активна']]);
  presence({ t: 'telecom', lang: 'uk', base: 'telecom-7', cls: 'phone', ev: false, kase: 'translated', title: 'Номери - Wavelet Mobile', cur: 2, main,
    expectation: 'повідомлення, що мій номер перенесено', gold: 'true', pii: P.list, evidence: ['успішно перенесено'], why: '"Номер … успішно перенесено" says the number was moved.' });
}
{
  const P = pc();
  const n = P.ph('de');
  const main = h1('Henrike Strandvall') + h2('Call log')
    + table(['When', 'Number', 'Result'], [['Today 10:12', n, 'No answer'], ['Today 09:58', n, 'Busy']]) + `<p>${btn('Log a call')}</p>`;
  presence({ t: 'crm', lang: 'en', base: 'crm-7', cls: 'phone', ev: false, kase: 'negation', title: 'Contact - Ledgerline CRM', main,
    expectation: 'a log entry showing my call to Henrike was answered', gold: 'false', pii: P.list, evidence: ['No answer', 'Busy'],
    why: 'Both calls are logged as No answer and Busy; none was answered.' });
}
{
  const P = pc();
  const n = P.ph('pl');
  const main = h1('Potwierdzenie tożsamości') + `<p class="ok">Kod wysłaliśmy SMS-em na numer ${esc(n)}. Kod jest ważny 5 minut.</p>`
    + `<p>${btn('Wyślij kod ponownie')}</p>`;
  presence({ t: 'gov', lang: 'pl', base: 'gov-5', cls: 'phone', ev: false, kase: 'translated', title: 'Wnioski - Civic Services Portal', cur: 1, main,
    expectation: 'a confirmation that the text message code was sent', gold: 'true', pii: P.list, evidence: ['Kod wysłaliśmy SMS-em'], why: '"Kod wysłaliśmy SMS-em" means the code was sent by text.' });
}
{
  const P = pc();
  const n = P.ph('us');
  const main = h1('Parcel PW 7702') + `<p class="warn">Delivery attempt failed at 11:20: we could not reach you on ${esc(n)}.</p>`
    + p('We will try again tomorrow, or you can collect it from 3 Mill Lane after 16:00.') + `<p>${btn('Change delivery')}</p>`;
  presence({ t: 'parcel', lang: 'en', base: 'parcel-3', cls: 'phone', ev: false, kase: 'error', title: 'Track - Parcelwise', cur: 0, main,
    expectation: 'my parcel shown as delivered', gold: 'false', pii: P.list, evidence: ['Delivery attempt failed'], why: 'The delivery attempt failed; the parcel is not delivered.' });
}
{
  const P = pc();
  const a = P.ph('uk'), b = P.ph('uk');
  const main = h1('Lines') + table(['Number', 'Plan', 'Status'], [[b, 'Unlimited', 'Active'], [a, 'Unlimited', 'Suspended']]) + `<p>${btn('Add a line')}</p>`;
  presence({ t: 'telecom', lang: 'en', base: 'telecom-6', cls: 'phone', ev: true, kase: 'pii_only_key', title: 'Lines - Wavelet Mobile', cur: 2, main,
    expectation: `the line ${a} shown as suspended`, gold: 'true', pii: P.list, evidence: [a],
    why: `${a} is Suspended and the other line is Active. With masks on both read [phone], so the page no longer shows which line is suspended.` });
}

// ================= presence: unmasked by design (8) =================
const pU = (s) => presence({ cls: 'unmasked', ev: false, pii: [], ...s });
pU({ t: 'forum', lang: 'en', base: 'forum-3', kase: 'status_reached', title: 'Descaling a kettle - Kettle Circle', cur: 0, gold: 'true', evidence: ['June Hale · just now'],
  main: h1('Best way to descale a kettle?') + card_(p('Juniper Hale · 2 days ago') + p('Citric acid, one spoon, boil and leave for an hour.'))
    + card_(p('June Hale · just now') + p('Vinegar works too, but rinse it three times or your tea will taste odd.')) + `<p>${btn('Reply')}</p>`,
  expectation: 'my reply in the thread, posted as June Hale', why: 'A post by June Hale, "just now", is in the thread (Juniper Hale\'s older post is a near twin).' });
pU({ t: 'payroll', lang: 'en', base: 'payroll-6', kase: 'near_miss', title: 'Time off - Ridgeway People', cur: 1, gold: 'false', evidence: ['Theo Nakamura, 20–22 Oct'],
  main: h1('Leave requests') + `<p class="ok">Leave approved: Theo Nakamura, 20–22 Oct (3 days).</p>` + table(['Employee', 'Dates', 'Status'], [['Thea Nakamura', '24 Oct', 'Waiting for approval']]),
  expectation: 'Thea Nakamura\'s leave shown as approved', why: 'Theo Nakamura\'s leave was approved; Thea Nakamura\'s is still waiting.' });
pU({ t: 'parcel', lang: 'uk', base: 'parcel-4', kase: 'translated', title: 'Відстежити - Parcelwise', cur: 0, gold: 'true', evidence: ['Доставлено: вул. Липова, 21'],
  main: h1('Посилка PW 5521') + `<p class="ok">Доставлено: вул. Липова, 21, поштомат. Отримувач: Остап Гребінь.</p>` + table(['Час', 'Подія'], [['10:41', 'Доставлено'], ['08:15', 'Передано кур\'єру']]),
  expectation: 'посилку доставлено на вулицю Липову, 21', why: 'The parcel was delivered to вул. Липова, 21.' });
pU({ t: 'shop', lang: 'en', base: 'shop-7', kase: 'near_miss', title: 'My orders - Pebble & Pine', cur: 4, gold: 'false', evidence: ['Delivered to 14 Larch Row'],
  main: h1('Order PP-20931') + `<p class="ok">Delivered to 14 Larch Row, Ashby AB4 7QT at 12:05.</p>` + table(['Item', 'Qty'], [['Linen throw, oat', '1'], ['Stoneware mug', '2']]),
  expectation: 'my order delivered to 41 Larch Row', why: 'It went to 14 Larch Row, not 41 Larch Row: a digit swap.' });
pU({ t: 'gov', lang: 'de', base: 'gov-6', kase: 'translated', title: 'Ihre Anträge - Civic Services Portal', cur: 1, gold: 'true', evidence: ['Ummeldung abgeschlossen'],
  main: h1('Ummeldung') + `<p class="ok">Ummeldung abgeschlossen. Neue Anschrift: Lindenweg 4, 10115 Berlin.</p>` + dl([['Antragstellerin', 'Greta Vollmer'], ['Aktenzeichen', 'UM-2026-4471']]),
  expectation: 'a confirmation that my change of address to Lindenweg 4 is complete', why: '"Ummeldung abgeschlossen" with the new address Lindenweg 4 confirms it.' });
pU({ t: 'news', lang: 'en', base: 'news-4', kase: 'paraphrase', title: 'Ferry fares - The Harbour Ledger', cur: 1, gold: 'true', evidence: ['misspelled the name of our reporter Odile Marshall'],
  main: h1('Harbour ferry fares to rise in spring') + p('By Odile Marshall') + `<p class="muted">Correction: an earlier version of this article misspelled the name of our reporter Odile Marshall.</p>`
    + p('Return tickets on the cross-harbour ferry will cost 40 cents more from March.'),
  expectation: 'a correction note about how the reporter\'s name was spelled', why: 'The correction line says an earlier version misspelled the reporter\'s name.' });
pU({ t: 'crm', lang: 'en', base: 'crm-8', kase: 'wrong_entity', title: 'Contacts - Ledgerline CRM', gold: 'false', evidence: ['Mara Lindgren was merged into Mara Lindqvist'],
  main: h1('Merge complete') + `<p class="ok">Mara Lindgren was merged into Mara Lindqvist. 4 deals moved.</p>` + table(['Name', 'Company'], [['Mara Lindqvist', 'Saltmarsh Ceramics'], ['Mara Lindquist', 'Saltmarsh Ceramics']]),
  expectation: 'Mara Lindquist merged into Mara Lindqvist', why: 'The merge joined Mara Lindgren, not Mara Lindquist, who is still listed separately.' });
pU({ t: 'travel', lang: 'en', base: 'travel-3', kase: 'status_reached', title: 'Seats - Skylark Trips', cur: 3, gold: 'true', evidence: ['Seat 14C confirmed for Clara Weidenfeld'],
  main: h1('Choose seats') + `<p class="ok">Seat 14C confirmed for Clara Weidenfeld.</p>` + p('Lisbon → Porto, Fri 7 Nov. Seat changes are free until check-in.') + `<p>${btn('Continue to payment', { cls: 'pri' })}</p>`,
  expectation: 'a confirmed seat for Clara Weidenfeld', why: 'Seat 14C is confirmed for Clara Weidenfeld.' });

// ---------- ids, names, output ----------
const decode = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** Every button and link in page order, with its role and accessible name (aria-label, else its text). */
function controls(html) {
  const out = [];
  const re = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    const id = /\bid="([^"]+)"/.exec(m[2])?.[1] ?? null;
    const aria = /\baria-label="([^"]*)"/.exec(m[2])?.[1];
    out.push({ id, role: m[1] === 'a' ? 'link' : 'button', name: aria !== undefined ? decode(aria) : decode(m[3]) });
  }
  return out;
}
/** Replaces the id markers with neutral, shuffled `c<n>` ids; returns where the gold and alt markers landed. */
function finalize(html) {
  const count = (html.match(/%(ID|GOLD|ALT)%/g) ?? []).length;
  const pool = shuffled(Array.from({ length: count * 3 }, (_, i) => 10 + i)).slice(0, count);
  let k = 0;
  const marks = { GOLD: [], ALT: [] };
  const out = html.replace(/%(ID|GOLD|ALT)%/g, (_, kind) => {
    const id = `c${pool[k++]}`;
    if (kind !== 'ID') marks[kind].push(id);
    return id;
  });
  return { html: out, marks };
}
function refOf(html, id) {
  const all = controls(html);
  const index = all.findIndex((c) => c.id === id);
  if (index < 0) throw new Error(`no control ${id}`);
  const el = all[index];
  const ordinal = all.filter((c, i) => c.role === el.role && c.name === el.name && i <= index).length;
  return { sel: { selector: `#${id}`, name: el.name }, ref: { role: el.role, name: el.name, ordinal } };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'pages'), { recursive: true });
const ORDER = { find: 0, dismiss: 1, presence: 2 };
const specs = [...SPECS].sort((a, b) => ORDER[a.site] - ORDER[b.site]);
const lines = specs.map((s, i) => {
  const n = String(i + 1).padStart(3, '0');
  const main = s.main ?? bgMain(s.t, s.lang);
  const { html, marks } = finalize(shell(SKINS[s.t], s.lang, { title: s.title, current: s.cur, main, overlay: s.overlay }));
  writeFileSync(join(OUT, 'pages', `${n}.html`), html);
  const candidate = s.site !== 'presence';
  if (candidate && (s.gold === 'el') !== (marks.GOLD.length === 1)) throw new Error(`${n}: gold marker count ${marks.GOLD.length}`);
  const g = s.gold === 'el' ? refOf(html, marks.GOLD[0]) : null;
  const alts = marks.ALT.map((id) => refOf(html, id));
  const goldOn = s.ev ? (candidate ? 'none' : 'false') : (g ? g.sel : s.gold);
  const negative = (v) => v === 'none' || v === 'false';
  const item = {
    id: `n10-${n}`, page: `pages/${n}.html`, site: s.site, lang: s.lang, source: 'synthetic',
    condition: s.ev ? 'evidence_removed' : 'must_not_move', base: `n10-${s.base}`, template: s.t, mask_class: s.cls, case: s.kase,
    masks: ['on', 'off'], mask_changes_gold: s.ev,
    ...(s.site === 'find' ? { risk: s.risk, within: null, input: { intent: s.intent } } : {}),
    ...(s.site === 'dismiss' ? { input: {} } : {}),
    ...(s.site === 'presence' ? { expectation: s.expectation, input: { expectation: s.expectation } } : {}),
    gold: g ? g.sel : s.gold, gold_masks_on: goldOn, ...(g ? { gold_ref: g.ref } : {}),
    alt: alts.map((a) => a.sel), ...(alts.length ? { alt_ref: alts.map((a) => a.ref) } : {}),
    danger_eligible: { off: negative(g ? '' : s.gold), on: negative(typeof goldOn === 'string' ? goldOn : '') },
    pii: s.pii, evidence: s.evidence, why: s.why,
  };
  return JSON.stringify(item);
});
writeFileSync(join(SETS, 'n10.draft.jsonl'), `${lines.join('\n')}\n`);
process.stdout.write(`n10: ${lines.length} items, ${new Set(specs.map((s) => s.t)).size} templates -> ${join(SETS, 'n10.draft.jsonl')}\n`);
