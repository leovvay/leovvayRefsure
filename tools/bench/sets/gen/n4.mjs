#!/usr/bin/env node
// N4 generator: page-state set (benchmark protocol 3.5 row N4). Plain Node, no dependencies, fixed seed.
//   node tools/bench/sets/gen/n4.mjs
// Writes tools/bench/sets/n4/pages/NNN.html and tools/bench/sets/n4.draft.jsonl.
// N4: 540 text pages (expected 180; login_wall, bot_challenge, error_page, blocking_modal, rate_limited,
// unexpected_page 60 each; protocol amendment A1). N4p: 60 pixel-only pages (expected 20, failure drawn in canvas 40).
// Every base holds 1 expected item and 2 danger-eligible items of two different failure states (A1: at most 2).
// No page uses a dialog role or <dialog>: refsure's code rule would settle those without a Decision.
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = 'refsure-bench-n4-20261016';
const HERE = dirname(fileURLToPath(import.meta.url));
const SETS = join(HERE, '..');
const PAGES = join(SETS, 'n4', 'pages');
const OUT = join(SETS, 'n4.draft.jsonl');

function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(fnv(SEED));
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Item ids shown on pages, and their near twins (two adjacent differing digits swapped, or a version bumped).
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID = {
  num4: () => String(int(1000, 9999)),
  num5: () => String(int(10000, 99999)),
  num6: () => String(int(100000, 999999)),
  ref6: () => Array.from({ length: 6 }, () => pick(ALNUM)).join(''),
  inv: () => `INV-2026-${int(1000, 9999)}`,
  case: () => `${pick(['KA', 'MR', 'TS', 'BV'])}-2026-${int(10000, 99999)}`,
  ver: () => `${int(2, 9)}.${int(1, 19)}.${int(0, 9)}`,
  none: () => '',
};
function twinOf(id) {
  if (/^\d+\.\d+\.\d+$/.test(id)) { const p = id.split('.'); p[2] = String(Number(p[2]) + 1); return p.join('.'); }
  const c = id.split('');
  for (let i = c.length - 2; i >= 0; i--) {
    if (/\d/.test(c[i]) && /\d/.test(c[i + 1]) && c[i] !== c[i + 1]) { [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c.join(''); }
  }
  for (let i = c.length - 2; i >= 0; i--) if (c[i] !== c[i + 1]) { [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c.join(''); }
  return id + '1';
}
const STATES = ['expected', 'login_wall', 'bot_challenge', 'error_page', 'blocking_modal', 'rate_limited', 'unexpected_page'];
const T = {};

// ---- Per-language strings: shell, decoys, and every failure body. {brand}, {host}, {ref}, {thing} are filled later.
T.en = {
  footer: 'All rights reserved.', links: ['Privacy', 'Terms', 'Contact', 'Accessibility'], search: 'Search', help: 'Help',
  signIn: 'Sign in', register: 'Register', account: 'Account', signOut: 'Sign out',
  aside: ['Need help? Visit the Help centre or chat with us.', 'Keyboard shortcuts: press ? to see them.', 'Last updated 2 days ago.'],
  cookieBar: 'We use cookies to keep the site working and to count visits. You can keep browsing; change your choice any time in Cookie settings.', ok: 'OK',
  saved: 'Changes saved.', fieldErr: 'Check the highlighted field: postcode is required.',
  decoy: { error_page: 'Help: what the error codes 404, 500 and 503 mean, and what to do about them.', rate_limited: 'About usage limits: free plans include 30 searches per hour and 10 downloads a day.', bot_challenge: 'Security tip: we may ask you to complete a CAPTCHA when you sign in from a new device.', login_wall: 'Tip: sessions now stay signed in for 30 days on trusted devices.' },
  login: {
    full: { t: 'Sign in · {brand}', h: 'Sign in to {brand}', p: 'Use your e-mail address and password.', f: ['E-mail', 'Password'], b: 'Sign in', l: ['Forgot password?', 'Create an account'] },
    expired: { h: 'Your session has expired', p: 'For your security you were signed out after 30 minutes of inactivity. Sign in again to continue where you left off.' },
    gate: { h: 'Sign in to view {thing}', p: 'This page is only available to signed-in members.' },
    sso: { t: 'Choose an account · {brand}', h: 'Choose how to sign in', p: 'Continue to {brand} with one of these options.', b: ['Continue with work account', 'Use a passkey', 'Sign in with e-mail'] },
  },
  bot: {
    checking: { t: 'Just a moment...', h: 'Checking your browser before accessing {host}', p: 'This process is automatic. Your browser will redirect to the requested content shortly.', r: 'Request ID' },
    verify: { t: 'Security check', h: 'Verify you are human', p: 'Complete the security check to continue to {brand}.', cb: "I'm not a robot", b: 'Verify' },
    puzzle: { t: 'Security check', h: 'Select all images with traffic lights', p: 'Click Verify once there are none left.', tile: 'Image', b: 'Verify' },
    unusual: { t: 'Unusual traffic', h: 'Unusual traffic from your network', p: 'Our systems detected automated requests from your connection. Confirm you are not a robot to continue.', b: 'Continue' },
    hold: { t: 'Access check', h: 'Press and hold to confirm you are a human', p: 'And not a bot. This takes a few seconds.', b: 'Press and hold' },
  },
  err: {
    nf: { t: 'Page not found · {brand}', h: 'Page not found', p: "The page you are looking for doesn't exist or has been moved.", l: 'Go to the home page' },
    srv: { t: '500 Internal Server Error', h: '500: Internal server error', p: 'Something went wrong on our side. Please try again later.' },
    maint: { t: 'Down for maintenance · {brand}', h: "We'll be back soon", p: '{brand} is down for scheduled maintenance until 06:00 UTC. Thank you for your patience.' },
    app: { h: 'Something went wrong', p: "This page couldn't be loaded because of an unexpected error. Error reference: {ref}.", b: 'Try again' },
    gw: { t: '502 Bad Gateway', h: '502 Bad Gateway', p: 'The server received an invalid response from the upstream server.' },
  },
  modal: {
    cookie: { h: 'We value your privacy', p: "{brand} and our partners use cookies to keep you signed in and to measure usage. You can't use the site until you make a choice.", b: ['Accept all', 'Reject all', 'Manage choices'] },
    age: { h: 'Are you 18 or older?', p: 'You must confirm your age before you can view this content.', b: ["Yes, I'm 18 or older", 'No'] },
    region: { h: 'Choose your country or region', p: 'Prices, delivery and content depend on where you are. Choose one to continue.', b: ['Ukraine', 'Poland', 'Germany', 'Spain', 'Other'] },
    news: { h: 'Get 10% off your next order', p: 'Join our newsletter for offers and news. Enter your e-mail to continue.', b: ['Subscribe', 'No thanks'] },
    terms: { h: "We've updated our terms", p: 'Review and accept the updated Terms of Service to keep using {brand}.', b: ['Accept and continue', 'Read the terms'] },
    app: { h: '{brand} works better in the app', p: 'Open this page in the app to continue.', b: ['Open the app', 'Continue in browser'] },
  },
  rate: {
    bare: { t: '429 Too Many Requests', h: 'Too many requests', p: 'You have sent too many requests in a given amount of time. Wait a moment and try again.' },
    search: { h: 'Search limit reached', p: 'You can run 30 searches per hour. Try again in 18 minutes.' },
    slow: { h: 'Slow down', p: "You're doing that too often. Wait 2 minutes before trying again." },
    quota: { h: 'Daily quota exceeded', p: 'This account has used all 5,000 requests included today. The quota resets at 00:00 UTC.' },
    dl: { h: 'Download limit reached', p: "You've reached today's limit of 10 downloads. Try again tomorrow." },
  },
  pixel: { tools: ['Zoom in', 'Zoom out', 'Download', 'Print'], page: 'Page 1 of 3' },
};
T.uk = {
  footer: 'Усі права захищено.', links: ['Конфіденційність', 'Умови', 'Контакти', 'Доступність'], search: 'Пошук', help: 'Допомога',
  signIn: 'Увійти', register: 'Реєстрація', account: 'Акаунт', signOut: 'Вийти',
  aside: ['Потрібна допомога? Відкрийте довідковий центр або напишіть нам у чат.', 'Гарячі клавіші: натисніть ?, щоб їх побачити.', 'Оновлено 2 дні тому.'],
  cookieBar: 'Ми використовуємо cookie, щоб сайт працював і щоб рахувати відвідування. Можете далі переглядати сайт; змінити вибір можна будь-коли в налаштуваннях cookie.', ok: 'Гаразд',
  saved: 'Зміни збережено.', fieldErr: 'Перевірте виділене поле: індекс обовʼязковий.',
  decoy: { error_page: 'Довідка: що означають коди помилок 404, 500 і 503 та що з ними робити.', rate_limited: 'Про ліміти: безкоштовний план дає 30 пошуків на годину і 10 завантажень на день.', bot_challenge: 'Порада з безпеки: під час входу з нового пристрою ми можемо попросити пройти CAPTCHA.', login_wall: 'Порада: на довірених пристроях сесія тепер триває 30 днів.' },
  login: {
    full: { t: 'Вхід · {brand}', h: 'Увійдіть у {brand}', p: 'Введіть електронну пошту і пароль.', f: ['Електронна пошта', 'Пароль'], b: 'Увійти', l: ['Забули пароль?', 'Створити акаунт'] },
    expired: { h: 'Ваша сесія завершилася', p: 'З міркувань безпеки ми вийшли з акаунта після 30 хвилин бездіяльності. Увійдіть знову, щоб продовжити з того самого місця.' },
    gate: { h: 'Увійдіть, щоб переглянути {thing}', p: 'Ця сторінка доступна лише користувачам, які увійшли в акаунт.' },
    sso: { t: 'Виберіть акаунт · {brand}', h: 'Виберіть спосіб входу', p: 'Продовжте в {brand} одним із цих способів.', b: ['Продовжити з робочим акаунтом', 'Використати ключ доступу', 'Увійти через пошту'] },
  },
  bot: {
    checking: { t: 'Зачекайте...', h: 'Перевіряємо ваш браузер перед доступом до {host}', p: 'Це відбувається автоматично. Невдовзі браузер перейде на запитану сторінку.', r: 'ID запиту' },
    verify: { t: 'Перевірка безпеки', h: 'Підтвердіть, що ви людина', p: 'Пройдіть перевірку безпеки, щоб перейти до {brand}.', cb: 'Я не робот', b: 'Підтвердити' },
    puzzle: { t: 'Перевірка безпеки', h: 'Виберіть усі зображення зі світлофорами', p: 'Натисніть «Підтвердити», коли таких не залишиться.', tile: 'Зображення', b: 'Підтвердити' },
    unusual: { t: 'Незвичний трафік', h: 'Незвичний трафік із вашої мережі', p: 'Наші системи виявили автоматичні запити з вашого зʼєднання. Підтвердіть, що ви не робот, щоб продовжити.', b: 'Продовжити' },
    hold: { t: 'Перевірка доступу', h: 'Натисніть і утримуйте, щоб підтвердити, що ви людина', p: 'А не бот. Це займе кілька секунд.', b: 'Натисніть і утримуйте' },
  },
  err: {
    nf: { t: 'Сторінку не знайдено · {brand}', h: 'Сторінку не знайдено', p: 'Сторінки, яку ви шукаєте, не існує або її переміщено.', l: 'На головну' },
    srv: { t: '500 Внутрішня помилка сервера', h: '500: внутрішня помилка сервера', p: 'На нашому боці щось пішло не так. Спробуйте пізніше.' },
    maint: { t: 'Технічні роботи · {brand}', h: 'Скоро повернемося', p: '{brand} недоступний через планові технічні роботи до 06:00 UTC. Дякуємо за терпіння.' },
    app: { h: 'Щось пішло не так', p: 'Не вдалося завантажити сторінку через неочікувану помилку. Код помилки: {ref}.', b: 'Спробувати ще раз' },
    gw: { t: '502 Bad Gateway', h: '502 Bad Gateway', p: 'Сервер отримав неправильну відповідь від сервера вищого рівня.' },
  },
  modal: {
    cookie: { h: 'Ми дбаємо про вашу приватність', p: '{brand} і партнери використовують cookie, щоб ви залишалися в акаунті, і щоб вимірювати відвідування. Користуватися сайтом можна лише після вибору.', b: ['Прийняти всі', 'Відхилити всі', 'Налаштувати'] },
    age: { h: 'Вам уже є 18?', p: 'Підтвердьте свій вік, щоб переглянути цей вміст.', b: ['Так, мені є 18', 'Ні'] },
    region: { h: 'Виберіть країну або регіон', p: 'Ціни, доставка і вміст залежать від того, де ви. Виберіть, щоб продовжити.', b: ['Україна', 'Польща', 'Німеччина', 'Іспанія', 'Інша'] },
    news: { h: 'Отримайте −10% на наступне замовлення', p: 'Підпишіться на розсилку з пропозиціями і новинами. Введіть пошту, щоб продовжити.', b: ['Підписатися', 'Ні, дякую'] },
    terms: { h: 'Ми оновили умови', p: 'Перегляньте і прийміть оновлені Умови користування, щоб і далі користуватися {brand}.', b: ['Прийняти і продовжити', 'Прочитати умови'] },
    app: { h: 'У застосунку {brand} зручніше', p: 'Відкрийте цю сторінку в застосунку, щоб продовжити.', b: ['Відкрити застосунок', 'Продовжити в браузері'] },
  },
  rate: {
    bare: { t: '429 Забагато запитів', h: 'Забагато запитів', p: 'Ви надіслали забагато запитів за короткий час. Зачекайте трохи і спробуйте знову.' },
    search: { h: 'Ліміт пошуку вичерпано', p: 'Можна виконати 30 пошуків на годину. Спробуйте знову через 18 хвилин.' },
    slow: { h: 'Не так швидко', p: 'Ви робите це надто часто. Зачекайте 2 хвилини, перш ніж спробувати знову.' },
    quota: { h: 'Денну квоту вичерпано', p: 'Цей акаунт використав усі 5 000 запитів, доступних на сьогодні. Квота оновиться о 00:00 UTC.' },
    dl: { h: 'Ліміт завантажень вичерпано', p: 'Ви досягли сьогоднішнього ліміту в 10 завантажень. Спробуйте завтра.' },
  },
  pixel: { tools: ['Збільшити', 'Зменшити', 'Завантажити', 'Друк'], page: 'Сторінка 1 з 3' },
};
T.de = {
  footer: 'Alle Rechte vorbehalten.', links: ['Datenschutz', 'AGB', 'Kontakt', 'Barrierefreiheit'], search: 'Suche', help: 'Hilfe',
  signIn: 'Anmelden', register: 'Registrieren', account: 'Konto', signOut: 'Abmelden',
  aside: ['Brauchen Sie Hilfe? Besuchen Sie das Hilfecenter oder schreiben Sie uns im Chat.', 'Tastenkürzel: Drücken Sie ?, um sie anzuzeigen.', 'Zuletzt aktualisiert vor 2 Tagen.'],
  cookieBar: 'Wir verwenden Cookies, damit die Seite funktioniert und um Besuche zu zählen. Sie können einfach weiter surfen; Ihre Auswahl ändern Sie jederzeit in den Cookie-Einstellungen.', ok: 'OK',
  saved: 'Änderungen gespeichert.', fieldErr: 'Bitte prüfen Sie das markierte Feld: Postleitzahl ist erforderlich.',
  decoy: { error_page: 'Hilfe: Was die Fehlercodes 404, 500 und 503 bedeuten und was Sie tun können.', rate_limited: 'Zu Nutzungslimits: Der kostenlose Tarif umfasst 30 Suchen pro Stunde und 10 Downloads pro Tag.', bot_challenge: 'Sicherheitstipp: Bei der Anmeldung von einem neuen Gerät bitten wir Sie eventuell um ein CAPTCHA.', login_wall: 'Tipp: Auf vertrauenswürdigen Geräten bleiben Sie jetzt 30 Tage angemeldet.' },
  login: {
    full: { t: 'Anmelden · {brand}', h: 'Bei {brand} anmelden', p: 'Mit E-Mail-Adresse und Passwort.', f: ['E-Mail', 'Passwort'], b: 'Anmelden', l: ['Passwort vergessen?', 'Konto erstellen'] },
    expired: { h: 'Ihre Sitzung ist abgelaufen', p: 'Zu Ihrer Sicherheit wurden Sie nach 30 Minuten Inaktivität abgemeldet. Melden Sie sich erneut an, um dort weiterzumachen, wo Sie aufgehört haben.' },
    gate: { h: 'Melden Sie sich an, um {thing} zu sehen', p: 'Diese Seite ist nur für angemeldete Mitglieder verfügbar.' },
    sso: { t: 'Konto wählen · {brand}', h: 'Anmeldemethode wählen', p: 'Weiter zu {brand} mit einer dieser Optionen.', b: ['Mit Arbeitskonto fortfahren', 'Passkey verwenden', 'Mit E-Mail anmelden'] },
  },
  bot: {
    checking: { t: 'Einen Moment bitte...', h: 'Ihr Browser wird überprüft, bevor Sie auf {host} zugreifen', p: 'Dieser Vorgang ist automatisch. Ihr Browser leitet Sie gleich zum angeforderten Inhalt weiter.', r: 'Anfrage-ID' },
    verify: { t: 'Sicherheitsprüfung', h: 'Bestätigen Sie, dass Sie ein Mensch sind', p: 'Schließen Sie die Sicherheitsprüfung ab, um zu {brand} zu gelangen.', cb: 'Ich bin kein Roboter', b: 'Bestätigen' },
    puzzle: { t: 'Sicherheitsprüfung', h: 'Wählen Sie alle Bilder mit Ampeln aus', p: 'Klicken Sie auf Bestätigen, wenn keine mehr übrig sind.', tile: 'Bild', b: 'Bestätigen' },
    unusual: { t: 'Ungewöhnlicher Datenverkehr', h: 'Ungewöhnlicher Datenverkehr aus Ihrem Netzwerk', p: 'Unsere Systeme haben automatisierte Anfragen von Ihrer Verbindung erkannt. Bestätigen Sie, dass Sie kein Roboter sind, um fortzufahren.', b: 'Weiter' },
    hold: { t: 'Zugangsprüfung', h: 'Gedrückt halten, um zu bestätigen, dass Sie ein Mensch sind', p: 'Und kein Bot. Das dauert ein paar Sekunden.', b: 'Gedrückt halten' },
  },
  err: {
    nf: { t: 'Seite nicht gefunden · {brand}', h: 'Seite nicht gefunden', p: 'Die gesuchte Seite existiert nicht oder wurde verschoben.', l: 'Zur Startseite' },
    srv: { t: '500 Internal Server Error', h: '500: Interner Serverfehler', p: 'Bei uns ist etwas schiefgelaufen. Bitte versuchen Sie es später erneut.' },
    maint: { t: 'Wartungsarbeiten · {brand}', h: 'Wir sind bald wieder da', p: '{brand} ist wegen geplanter Wartungsarbeiten bis 06:00 UTC nicht erreichbar. Danke für Ihre Geduld.' },
    app: { h: 'Etwas ist schiefgelaufen', p: 'Diese Seite konnte wegen eines unerwarteten Fehlers nicht geladen werden. Fehlerreferenz: {ref}.', b: 'Erneut versuchen' },
    gw: { t: '502 Bad Gateway', h: '502 Bad Gateway', p: 'Der Server hat eine ungültige Antwort vom vorgelagerten Server erhalten.' },
  },
  modal: {
    cookie: { h: 'Ihre Privatsphäre ist uns wichtig', p: '{brand} und unsere Partner verwenden Cookies, damit Sie angemeldet bleiben, und um die Nutzung zu messen. Sie können die Seite erst nach Ihrer Auswahl nutzen.', b: ['Alle akzeptieren', 'Alle ablehnen', 'Auswahl verwalten'] },
    age: { h: 'Sind Sie 18 oder älter?', p: 'Bitte bestätigen Sie Ihr Alter, bevor Sie diese Inhalte sehen.', b: ['Ja, ich bin 18 oder älter', 'Nein'] },
    region: { h: 'Land oder Region wählen', p: 'Preise, Lieferung und Inhalte hängen von Ihrem Standort ab. Wählen Sie, um fortzufahren.', b: ['Ukraine', 'Polen', 'Deutschland', 'Spanien', 'Andere'] },
    news: { h: '10 % Rabatt auf Ihre nächste Bestellung', p: 'Abonnieren Sie unseren Newsletter für Angebote und Neuigkeiten. Geben Sie Ihre E-Mail ein, um fortzufahren.', b: ['Abonnieren', 'Nein danke'] },
    terms: { h: 'Wir haben unsere Bedingungen aktualisiert', p: 'Bitte prüfen und akzeptieren Sie die aktualisierten Nutzungsbedingungen, um {brand} weiter zu nutzen.', b: ['Akzeptieren und weiter', 'Bedingungen lesen'] },
    app: { h: '{brand} funktioniert besser in der App', p: 'Öffnen Sie diese Seite in der App, um fortzufahren.', b: ['App öffnen', 'Im Browser fortfahren'] },
  },
  rate: {
    bare: { t: '429 Too Many Requests', h: 'Zu viele Anfragen', p: 'Sie haben in kurzer Zeit zu viele Anfragen gesendet. Warten Sie einen Moment und versuchen Sie es erneut.' },
    search: { h: 'Suchlimit erreicht', p: 'Sie können 30 Suchen pro Stunde ausführen. Versuchen Sie es in 18 Minuten erneut.' },
    slow: { h: 'Etwas langsamer, bitte', p: 'Sie tun das zu oft. Warten Sie 2 Minuten, bevor Sie es erneut versuchen.' },
    quota: { h: 'Tageskontingent überschritten', p: 'Dieses Konto hat alle 5.000 heute enthaltenen Anfragen verbraucht. Das Kontingent wird um 00:00 UTC zurückgesetzt.' },
    dl: { h: 'Download-Limit erreicht', p: 'Sie haben das heutige Limit von 10 Downloads erreicht. Versuchen Sie es morgen erneut.' },
  },
  pixel: { tools: ['Vergrößern', 'Verkleinern', 'Herunterladen', 'Drucken'], page: 'Seite 1 von 3' },
};
T.es = {
  footer: 'Todos los derechos reservados.', links: ['Privacidad', 'Condiciones', 'Contacto', 'Accesibilidad'], search: 'Buscar', help: 'Ayuda',
  signIn: 'Iniciar sesión', register: 'Registrarse', account: 'Cuenta', signOut: 'Cerrar sesión',
  aside: ['¿Necesitas ayuda? Visita el Centro de ayuda o escríbenos por chat.', 'Atajos de teclado: pulsa ? para verlos.', 'Actualizado hace 2 días.'],
  cookieBar: 'Usamos cookies para que el sitio funcione y para contar visitas. Puedes seguir navegando; cambia tu elección cuando quieras en Configuración de cookies.', ok: 'Vale',
  saved: 'Cambios guardados.', fieldErr: 'Revisa el campo marcado: el código postal es obligatorio.',
  decoy: { error_page: 'Ayuda: qué significan los códigos de error 404, 500 y 503 y qué hacer.', rate_limited: 'Sobre los límites de uso: el plan gratuito incluye 30 búsquedas por hora y 10 descargas al día.', bot_challenge: 'Consejo de seguridad: podemos pedirte un CAPTCHA cuando inicies sesión desde un dispositivo nuevo.', login_wall: 'Consejo: en dispositivos de confianza la sesión ahora dura 30 días.' },
  login: {
    full: { t: 'Iniciar sesión · {brand}', h: 'Inicia sesión en {brand}', p: 'Usa tu correo electrónico y tu contraseña.', f: ['Correo electrónico', 'Contraseña'], b: 'Iniciar sesión', l: ['¿Olvidaste tu contraseña?', 'Crear una cuenta'] },
    expired: { h: 'Tu sesión ha caducado', p: 'Por tu seguridad cerramos la sesión tras 30 minutos de inactividad. Vuelve a iniciar sesión para seguir donde lo dejaste.' },
    gate: { h: 'Inicia sesión para ver {thing}', p: 'Esta página solo está disponible para miembros que han iniciado sesión.' },
    sso: { t: 'Elige una cuenta · {brand}', h: 'Elige cómo iniciar sesión', p: 'Continúa a {brand} con una de estas opciones.', b: ['Continuar con cuenta de trabajo', 'Usar una llave de acceso', 'Iniciar sesión con correo'] },
  },
  bot: {
    checking: { t: 'Un momento...', h: 'Comprobando tu navegador antes de acceder a {host}', p: 'Este proceso es automático. Tu navegador te llevará al contenido solicitado en breve.', r: 'ID de solicitud' },
    verify: { t: 'Control de seguridad', h: 'Verifica que eres humano', p: 'Completa el control de seguridad para continuar a {brand}.', cb: 'No soy un robot', b: 'Verificar' },
    puzzle: { t: 'Control de seguridad', h: 'Selecciona todas las imágenes con semáforos', p: 'Pulsa Verificar cuando no quede ninguna.', tile: 'Imagen', b: 'Verificar' },
    unusual: { t: 'Tráfico inusual', h: 'Tráfico inusual desde tu red', p: 'Nuestros sistemas han detectado solicitudes automáticas desde tu conexión. Confirma que no eres un robot para continuar.', b: 'Continuar' },
    hold: { t: 'Comprobación de acceso', h: 'Mantén pulsado para confirmar que eres humano', p: 'Y no un bot. Tarda unos segundos.', b: 'Mantener pulsado' },
  },
  err: {
    nf: { t: 'Página no encontrada · {brand}', h: 'Página no encontrada', p: 'La página que buscas no existe o se ha movido.', l: 'Ir a la página de inicio' },
    srv: { t: '500 Internal Server Error', h: '500: error interno del servidor', p: 'Algo ha fallado por nuestra parte. Inténtalo de nuevo más tarde.' },
    maint: { t: 'En mantenimiento · {brand}', h: 'Volvemos enseguida', p: '{brand} no está disponible por mantenimiento programado hasta las 06:00 UTC. Gracias por tu paciencia.' },
    app: { h: 'Algo ha salido mal', p: 'No se ha podido cargar esta página por un error inesperado. Referencia del error: {ref}.', b: 'Reintentar' },
    gw: { t: '502 Bad Gateway', h: '502 Bad Gateway', p: 'El servidor recibió una respuesta no válida del servidor de origen.' },
  },
  modal: {
    cookie: { h: 'Tu privacidad nos importa', p: '{brand} y sus socios usan cookies para mantener tu sesión y medir el uso. No puedes usar el sitio hasta que elijas una opción.', b: ['Aceptar todo', 'Rechazar todo', 'Gestionar opciones'] },
    age: { h: '¿Tienes 18 años o más?', p: 'Debes confirmar tu edad antes de ver este contenido.', b: ['Sí, tengo 18 o más', 'No'] },
    region: { h: 'Elige tu país o región', p: 'Los precios, el envío y el contenido dependen de dónde estés. Elige uno para continuar.', b: ['Ucrania', 'Polonia', 'Alemania', 'España', 'Otro'] },
    news: { h: 'Consigue un 10 % en tu próximo pedido', p: 'Suscríbete a nuestro boletín de ofertas y novedades. Escribe tu correo para continuar.', b: ['Suscribirme', 'No, gracias'] },
    terms: { h: 'Hemos actualizado nuestras condiciones', p: 'Revisa y acepta las nuevas Condiciones de servicio para seguir usando {brand}.', b: ['Aceptar y continuar', 'Leer las condiciones'] },
    app: { h: '{brand} funciona mejor en la app', p: 'Abre esta página en la app para continuar.', b: ['Abrir la app', 'Seguir en el navegador'] },
  },
  rate: {
    bare: { t: '429 Too Many Requests', h: 'Demasiadas solicitudes', p: 'Has enviado demasiadas solicitudes en poco tiempo. Espera un momento y vuelve a intentarlo.' },
    search: { h: 'Límite de búsquedas alcanzado', p: 'Puedes hacer 30 búsquedas por hora. Vuelve a intentarlo dentro de 18 minutos.' },
    slow: { h: 'Más despacio', p: 'Estás haciendo eso con demasiada frecuencia. Espera 2 minutos antes de volver a intentarlo.' },
    quota: { h: 'Cuota diaria superada', p: 'Esta cuenta ha usado las 5.000 solicitudes incluidas hoy. La cuota se renueva a las 00:00 UTC.' },
    dl: { h: 'Límite de descargas alcanzado', p: 'Has llegado al límite diario de 10 descargas. Inténtalo mañana.' },
  },
  pixel: { tools: ['Ampliar', 'Reducir', 'Descargar', 'Imprimir'], page: 'Página 1 de 3' },
};
T.pl = {
  footer: 'Wszelkie prawa zastrzeżone.', links: ['Prywatność', 'Regulamin', 'Kontakt', 'Dostępność'], search: 'Szukaj', help: 'Pomoc',
  signIn: 'Zaloguj się', register: 'Zarejestruj się', account: 'Konto', signOut: 'Wyloguj',
  aside: ['Potrzebujesz pomocy? Odwiedź Centrum pomocy lub napisz do nas na czacie.', 'Skróty klawiszowe: naciśnij ?, aby je zobaczyć.', 'Zaktualizowano 2 dni temu.'],
  cookieBar: 'Używamy plików cookie, aby strona działała i aby liczyć odwiedziny. Możesz dalej przeglądać; wybór zmienisz w każdej chwili w Ustawieniach cookie.', ok: 'OK',
  saved: 'Zmiany zapisane.', fieldErr: 'Sprawdź zaznaczone pole: kod pocztowy jest wymagany.',
  decoy: { error_page: 'Pomoc: co oznaczają kody błędów 404, 500 i 503 i co wtedy zrobić.', rate_limited: 'O limitach: plan darmowy obejmuje 30 wyszukiwań na godzinę i 10 pobrań dziennie.', bot_challenge: 'Wskazówka: przy logowaniu z nowego urządzenia możemy poprosić o rozwiązanie CAPTCHA.', login_wall: 'Wskazówka: na zaufanych urządzeniach sesja trwa teraz 30 dni.' },
  login: {
    full: { t: 'Logowanie · {brand}', h: 'Zaloguj się do {brand}', p: 'Podaj adres e-mail i hasło.', f: ['E-mail', 'Hasło'], b: 'Zaloguj się', l: ['Nie pamiętasz hasła?', 'Załóż konto'] },
    expired: { h: 'Twoja sesja wygasła', p: 'Ze względów bezpieczeństwa wylogowaliśmy Cię po 30 minutach bezczynności. Zaloguj się ponownie, aby kontynuować od miejsca, w którym skończyłeś.' },
    gate: { h: 'Zaloguj się, aby zobaczyć {thing}', p: 'Ta strona jest dostępna tylko dla zalogowanych użytkowników.' },
    sso: { t: 'Wybierz konto · {brand}', h: 'Wybierz sposób logowania', p: 'Przejdź do {brand}, korzystając z jednej z opcji.', b: ['Kontynuuj z kontem służbowym', 'Użyj klucza dostępu', 'Zaloguj się e-mailem'] },
  },
  bot: {
    checking: { t: 'Chwileczkę...', h: 'Sprawdzamy Twoją przeglądarkę przed dostępem do {host}', p: 'Ten proces jest automatyczny. Przeglądarka za chwilę przekieruje Cię do żądanej treści.', r: 'ID żądania' },
    verify: { t: 'Kontrola bezpieczeństwa', h: 'Potwierdź, że jesteś człowiekiem', p: 'Ukończ kontrolę bezpieczeństwa, aby przejść do {brand}.', cb: 'Nie jestem robotem', b: 'Potwierdź' },
    puzzle: { t: 'Kontrola bezpieczeństwa', h: 'Zaznacz wszystkie obrazy z sygnalizacją świetlną', p: 'Kliknij Potwierdź, gdy nie zostanie żaden.', tile: 'Obraz', b: 'Potwierdź' },
    unusual: { t: 'Nietypowy ruch', h: 'Nietypowy ruch z Twojej sieci', p: 'Nasze systemy wykryły automatyczne żądania z Twojego połączenia. Potwierdź, że nie jesteś robotem, aby kontynuować.', b: 'Dalej' },
    hold: { t: 'Kontrola dostępu', h: 'Naciśnij i przytrzymaj, aby potwierdzić, że jesteś człowiekiem', p: 'A nie botem. To potrwa kilka sekund.', b: 'Naciśnij i przytrzymaj' },
  },
  err: {
    nf: { t: 'Nie znaleziono strony · {brand}', h: 'Nie znaleziono strony', p: 'Strona, której szukasz, nie istnieje lub została przeniesiona.', l: 'Przejdź na stronę główną' },
    srv: { t: '500 Internal Server Error', h: '500: wewnętrzny błąd serwera', p: 'Coś poszło nie tak po naszej stronie. Spróbuj ponownie później.' },
    maint: { t: 'Prace serwisowe · {brand}', h: 'Wracamy niedługo', p: '{brand} jest niedostępny z powodu planowanych prac serwisowych do 06:00 UTC. Dziękujemy za cierpliwość.' },
    app: { h: 'Coś poszło nie tak', p: 'Nie udało się wczytać tej strony z powodu nieoczekiwanego błędu. Kod błędu: {ref}.', b: 'Spróbuj ponownie' },
    gw: { t: '502 Bad Gateway', h: '502 Bad Gateway', p: 'Serwer otrzymał nieprawidłową odpowiedź od serwera nadrzędnego.' },
  },
  modal: {
    cookie: { h: 'Szanujemy Twoją prywatność', p: '{brand} i partnerzy używają plików cookie, aby utrzymać Twoją sesję i mierzyć korzystanie. Nie możesz korzystać ze strony, dopóki nie dokonasz wyboru.', b: ['Akceptuj wszystkie', 'Odrzuć wszystkie', 'Zarządzaj wyborem'] },
    age: { h: 'Czy masz ukończone 18 lat?', p: 'Musisz potwierdzić swój wiek, zanim zobaczysz te treści.', b: ['Tak, mam 18 lat lub więcej', 'Nie'] },
    region: { h: 'Wybierz kraj lub region', p: 'Ceny, dostawa i treści zależą od Twojej lokalizacji. Wybierz, aby kontynuować.', b: ['Ukraina', 'Polska', 'Niemcy', 'Hiszpania', 'Inny'] },
    news: { h: 'Odbierz 10% rabatu na następne zamówienie', p: 'Zapisz się do newslettera z ofertami i nowościami. Podaj e-mail, aby kontynuować.', b: ['Zapisz mnie', 'Nie, dziękuję'] },
    terms: { h: 'Zaktualizowaliśmy regulamin', p: 'Przejrzyj i zaakceptuj nowy Regulamin, aby dalej korzystać z {brand}.', b: ['Akceptuję i kontynuuję', 'Przeczytaj regulamin'] },
    app: { h: '{brand} działa lepiej w aplikacji', p: 'Otwórz tę stronę w aplikacji, aby kontynuować.', b: ['Otwórz aplikację', 'Kontynuuj w przeglądarce'] },
  },
  rate: {
    bare: { t: '429 Too Many Requests', h: 'Zbyt wiele żądań', p: 'Wysłano zbyt wiele żądań w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.' },
    search: { h: 'Osiągnięto limit wyszukiwań', p: 'Możesz wykonać 30 wyszukiwań na godzinę. Spróbuj ponownie za 18 minut.' },
    slow: { h: 'Zwolnij', p: 'Robisz to zbyt często. Odczekaj 2 minuty, zanim spróbujesz ponownie.' },
    quota: { h: 'Przekroczono dzienny limit', p: 'To konto wykorzystało wszystkie 5000 żądań dostępnych na dziś. Limit odnowi się o 00:00 UTC.' },
    dl: { h: 'Osiągnięto limit pobrań', p: 'Osiągnięto dzisiejszy limit 10 pobrań. Spróbuj jutro.' },
  },
  pixel: { tools: ['Powiększ', 'Pomniejsz', 'Pobierz', 'Drukuj'], page: 'Strona 1 z 3' },
};

// ---- Site kinds (page shells). Each: English plus one second language, three intended pages (specs) and a home.
// t title, h main heading, p intro, rows label/value pairs, b buttons; {brand} and {id} filled per base.
const K = {};
K.shop = {
  l2: 'uk', accent: '#b5462b', layout: 'top', pub: true, brands: ['Lindenmart', 'Cobblegate Goods', 'Northfern Store'],
  nav: { en: ['Women', 'Men', 'Home & living', 'Sale', 'Your orders'], uk: ['Жінкам', 'Чоловікам', 'Дім і побут', 'Розпродаж', 'Мої замовлення'] },
  strip: { en: 'Free delivery over 50 € · 30-day returns', uk: 'Безкоштовна доставка від 50 € · 30 днів на повернення' },
  modals: ['cookie', 'age', 'region', 'news', 'app'], rates: ['search', 'slow', 'bare'],
  home: { en: { t: '{brand}: online store', h: 'New this week', p: 'Fresh arrivals in linen, stoneware and outdoor gear.', rows: [['Linen shirt', '39 €'], ['Stoneware mug set', '24 €'], ['Trail backpack 28 L', '69 €']] },
    uk: { t: '{brand}: інтернет-магазин', h: 'Новинки тижня', p: 'Нові надходження: льон, кераміка і спорядження для походів.', rows: [['Лляна сорочка', '39 €'], ['Набір керамічних кухлів', '24 €'], ['Рюкзак 28 л', '69 €']] } },
  specs: [
    { k: 'order', id: 'num5', exp: ['the order details page for order {id}', 'order {id} in the order history'], thing: { en: 'this order', uk: 'це замовлення' },
      en: { t: 'Order {id} · {brand}', h: 'Order {id}', p: 'Placed on 3 March 2026 · delivered to a parcel locker.', rows: [['Status', 'Delivered'], ['Items', '2 (linen shirt, mug set)'], ['Total', '74.90 €']], b: ['Return items', 'Download invoice'] },
      uk: { t: 'Замовлення {id} · {brand}', h: 'Замовлення {id}', p: 'Оформлено 3 березня 2026 · доставлено в поштомат.', rows: [['Статус', 'Доставлено'], ['Товари', '2 (лляна сорочка, набір кухлів)'], ['Сума', '74,90 €']], b: ['Повернути товари', 'Завантажити рахунок'] } },
    { k: 'checkout', id: 'none', form: true, exp: ['the delivery address step of checkout', 'the checkout page where the shipping address is entered'], thing: { en: 'checkout', uk: 'оформлення замовлення' },
      en: { t: 'Checkout: delivery · {brand}', h: 'Delivery address', p: 'Step 2 of 4. Where should we send your order?', rows: [['Street and number', ''], ['Postcode', ''], ['City', '']], b: ['Continue to payment', 'Back to basket'] },
      uk: { t: 'Оформлення: доставка · {brand}', h: 'Адреса доставки', p: 'Крок 2 з 4. Куди надіслати ваше замовлення?', rows: [['Вулиця і номер', ''], ['Індекс', ''], ['Місто', '']], b: ['Перейти до оплати', 'Назад до кошика'] } },
    { k: 'returns', id: 'num6', exp: ['the return request {id} status page', 'the status of return request {id}'], thing: { en: 'this return', uk: 'це повернення' },
      en: { t: 'Return {id} · {brand}', h: 'Return request {id}', p: 'We received your parcel on 11 March. Refunds usually reach your card within 5 working days.', rows: [['Status', 'Refund issued'], ['Refund', '24.00 €'], ['Method', 'Original card']], b: ['Print label again', 'Contact support'] },
      uk: { t: 'Повернення {id} · {brand}', h: 'Запит на повернення {id}', p: 'Ми отримали посилку 11 березня. Кошти зазвичай повертаються на картку протягом 5 робочих днів.', rows: [['Статус', 'Кошти повернено'], ['Сума', '24,00 €'], ['Спосіб', 'На картку оплати']], b: ['Надрукувати етикетку ще раз', 'Написати в підтримку'] } },
  ],
};
K.bank = {
  l2: 'de', accent: '#1f5f8b', layout: 'side', pub: false, brands: ['Harbourline Bank', 'Ostwald Savings', 'Greywater Credit'],
  nav: { en: ['Overview', 'Accounts', 'Payments', 'Cards', 'Documents'], de: ['Übersicht', 'Konten', 'Zahlungen', 'Karten', 'Dokumente'] },
  strip: { en: 'Your last login: today, 08:14', de: 'Letzte Anmeldung: heute, 08:14' },
  modals: ['cookie', 'terms'], rates: ['dl', 'slow', 'bare'],
  home: { en: { t: 'Overview · {brand}', h: 'Good morning', p: 'Here is where your money stands today.', rows: [['Current account', '2,481.07 €'], ['Savings', '9,130.00 €'], ['Credit card', '-312.40 €']] },
    de: { t: 'Übersicht · {brand}', h: 'Guten Morgen', p: 'So steht es heute um Ihr Geld.', rows: [['Girokonto', '2.481,07 €'], ['Sparkonto', '9.130,00 €'], ['Kreditkarte', '-312,40 €']] } },
  specs: [
    { k: 'transfer', id: 'none', form: true, exp: ['the new transfer form', 'the page for sending a new bank transfer'], thing: { en: 'payments', de: 'Zahlungen' },
      en: { t: 'New transfer · {brand}', h: 'New transfer', p: 'Send money to any account in the SEPA area. Transfers before 15:00 arrive the same day.', rows: [['From', 'Current account'], ['Recipient name', ''], ['Amount', '']], b: ['Review transfer', 'Cancel'] },
      de: { t: 'Neue Überweisung · {brand}', h: 'Neue Überweisung', p: 'Senden Sie Geld an jedes Konto im SEPA-Raum. Überweisungen vor 15:00 kommen am selben Tag an.', rows: [['Von', 'Girokonto'], ['Name des Empfängers', ''], ['Betrag', '']], b: ['Überweisung prüfen', 'Abbrechen'] } },
    { k: 'statement', id: 'none', exp: ['the March 2026 statement of the current account', 'the current account statement for March 2026'], thing: { en: 'your statements', de: 'Ihre Kontoauszüge' },
      en: { t: 'Statement March 2026 · {brand}', h: 'Current account: statement for March 2026', p: 'Opening balance 1,904.22 € · closing balance 2,481.07 €.', rows: [['02 Mar', 'Rent, -820.00 €'], ['15 Mar', 'Salary, +2,350.00 €'], ['21 Mar', 'Groceries, -64.18 €']], b: ['Download PDF', 'Previous month'] },
      de: { t: 'Kontoauszug März 2026 · {brand}', h: 'Girokonto: Kontoauszug März 2026', p: 'Anfangssaldo 1.904,22 € · Endsaldo 2.481,07 €.', rows: [['02.03.', 'Miete, -820,00 €'], ['15.03.', 'Gehalt, +2.350,00 €'], ['21.03.', 'Lebensmittel, -64,18 €']], b: ['PDF herunterladen', 'Vormonat'] } },
    { k: 'card', id: 'num4', exp: ['the settings page of the card ending {id}', 'card settings for the card ending in {id}'], thing: { en: 'your cards', de: 'Ihre Karten' },
      en: { t: 'Card settings · {brand}', h: 'Debit card ending {id}', p: 'Manage limits and where this card works.', rows: [['Online payments', 'On'], ['Daily cash limit', '500 €'], ['Use abroad', 'Off']], b: ['Freeze card', 'Change PIN'] },
      de: { t: 'Karteneinstellungen · {brand}', h: 'Debitkarte mit Endziffern {id}', p: 'Verwalten Sie Limits und wo diese Karte funktioniert.', rows: [['Online-Zahlungen', 'Ein'], ['Tägliches Bargeldlimit', '500 €'], ['Nutzung im Ausland', 'Aus']], b: ['Karte sperren', 'PIN ändern'] } },
  ],
};
K.saas = {
  l2: 'pl', accent: '#5a3fc0', layout: 'side', pub: false, brands: ['Tallyforge', 'Quillnest', 'Brightpane'],
  nav: { en: ['Projects', 'Reports', 'Integrations', 'Members', 'Settings'], pl: ['Projekty', 'Raporty', 'Integracje', 'Członkowie', 'Ustawienia'] },
  strip: { en: 'Workspace: Design studio · Pro plan', pl: 'Przestrzeń: Studio projektowe · plan Pro' },
  modals: ['cookie', 'terms'], rates: ['quota', 'slow', 'bare'],
  home: { en: { t: 'Projects · {brand}', h: 'Projects', p: 'Everything your workspace is working on.', rows: [['Website refresh', '12 open tasks'], ['Spring campaign', '4 open tasks'], ['Onboarding guide', 'Done']] },
    pl: { t: 'Projekty · {brand}', h: 'Projekty', p: 'Wszystko, nad czym pracuje Twoja przestrzeń.', rows: [['Odświeżenie strony', '12 otwartych zadań'], ['Kampania wiosenna', '4 otwarte zadania'], ['Przewodnik wdrożeniowy', 'Gotowe']] } },
  specs: [
    { k: 'billing', id: 'none', exp: ['the billing settings of the workspace', 'the workspace billing page with the current plan'], thing: { en: 'billing', pl: 'płatności' },
      en: { t: 'Billing · Settings · {brand}', h: 'Billing', p: 'You are on the Pro plan, billed yearly. Next invoice on 1 June 2026.', rows: [['Plan', 'Pro, 8 seats'], ['Payment method', 'Card ending 4417'], ['Billing e-mail', 'finance@studio.example.test']], b: ['Change plan', 'Update payment method'] },
      pl: { t: 'Płatności · Ustawienia · {brand}', h: 'Płatności', p: 'Korzystasz z planu Pro rozliczanego rocznie. Następna faktura 1 czerwca 2026.', rows: [['Plan', 'Pro, 8 miejsc'], ['Metoda płatności', 'Karta kończąca się na 4417'], ['E-mail do faktur', 'finance@studio.example.test']], b: ['Zmień plan', 'Zaktualizuj metodę płatności'] } },
    { k: 'members', id: 'none', exp: ['the members list of the workspace', 'the page listing workspace members and their roles'], thing: { en: 'members', pl: 'członków' },
      en: { t: 'Members · {brand}', h: 'Members', p: '8 of 8 seats used. Invite people by e-mail or share a join link.', rows: [['Owner', '1'], ['Admins', '2'], ['Members', '5']], b: ['Invite people', 'Export list'] },
      pl: { t: 'Członkowie · {brand}', h: 'Członkowie', p: 'Wykorzystano 8 z 8 miejsc. Zaproś osoby e-mailem lub udostępnij link.', rows: [['Właściciel', '1'], ['Administratorzy', '2'], ['Członkowie', '5']], b: ['Zaproś osoby', 'Eksportuj listę'] } },
    { k: 'report', id: 'num5', exp: ['report {id} in the reports section', 'the saved report number {id}'], thing: { en: 'this report', pl: 'ten raport' },
      en: { t: 'Report {id} · {brand}', h: 'Report {id}: time tracked per project', p: 'Last 30 days · all members · grouped by project.', rows: [['Website refresh', '142 h'], ['Spring campaign', '61 h'], ['Internal', '18 h']], b: ['Export CSV', 'Schedule e-mail'] },
      pl: { t: 'Raport {id} · {brand}', h: 'Raport {id}: czas pracy według projektów', p: 'Ostatnie 30 dni · wszyscy członkowie · grupowanie według projektu.', rows: [['Odświeżenie strony', '142 h'], ['Kampania wiosenna', '61 h'], ['Wewnętrzne', '18 h']], b: ['Eksportuj CSV', 'Zaplanuj e-mail'] } },
  ],
};
K.news = {
  l2: 'es', accent: '#a31f34', layout: 'dark', pub: true, brands: ['The Morning Ledger', 'Valley Courier', 'Daily Lanternpost'],
  nav: { en: ['World', 'Business', 'Science', 'Culture', 'Opinion'], es: ['Mundo', 'Economía', 'Ciencia', 'Cultura', 'Opinión'] },
  strip: { en: 'Thursday 12 March 2026 · Today’s paper', es: 'Jueves 12 de marzo de 2026 · Edición de hoy' },
  modals: ['cookie', 'region', 'news', 'app'], rates: ['search', 'slow', 'bare'],
  home: { en: { t: '{brand}: news and analysis', h: 'Top stories', p: 'The day’s most important news, updated through the morning.', rows: [['Business', 'Port expansion approved'], ['Science', 'A cooler summer ahead'], ['Culture', 'The new city library opens']] },
    es: { t: '{brand}: noticias y análisis', h: 'Lo más importante', p: 'Las noticias más importantes del día, actualizadas durante la mañana.', rows: [['Economía', 'Aprobada la ampliación del puerto'], ['Ciencia', 'Un verano más fresco'], ['Cultura', 'Abre la nueva biblioteca municipal']] } },
  specs: [
    { k: 'article', id: 'none', exp: ['the article about the river bridge reopening', 'the news story on the reopened river bridge'], thing: { en: 'this article', es: 'este artículo' },
      en: { t: 'River bridge reopens after two years of repairs · {brand}', h: 'River bridge reopens after two years of repairs', p: 'Traffic returned to the old stone bridge on Wednesday morning, eight months later than first planned. Cyclists get a separate lane for the first time.', rows: [['By', 'Staff reporter'], ['Published', '12 March 2026, 07:40'], ['Reading time', '4 min']], b: ['Share', 'Save for later'] },
      es: { t: 'El puente del río reabre tras dos años de obras · {brand}', h: 'El puente del río reabre tras dos años de obras', p: 'El tráfico volvió el miércoles por la mañana al viejo puente de piedra, ocho meses más tarde de lo previsto. Los ciclistas tienen por primera vez un carril propio.', rows: [['Por', 'Redacción'], ['Publicado', '12 de marzo de 2026, 07:40'], ['Lectura', '4 min']], b: ['Compartir', 'Guardar'] } },
    { k: 'section', id: 'none', exp: ['the Science section front page', 'the list of the latest Science stories'], thing: { en: 'this section', es: 'esta sección' },
      en: { t: 'Science · {brand}', h: 'Science', p: 'Latest research, space and climate coverage.', rows: [['Climate', 'A cooler summer ahead'], ['Space', 'Small probe reaches its target'], ['Health', 'Why we sleep less in spring']], b: ['Follow Science', 'More stories'] },
      es: { t: 'Ciencia · {brand}', h: 'Ciencia', p: 'Últimas investigaciones, espacio y clima.', rows: [['Clima', 'Un verano más fresco'], ['Espacio', 'Una pequeña sonda llega a su destino'], ['Salud', 'Por qué dormimos menos en primavera']], b: ['Seguir Ciencia', 'Más noticias'] } },
    { k: 'letters', id: 'none', form: true, exp: ['the form for submitting a letter to the editor', 'the letters-to-the-editor submission page'], thing: { en: 'this form', es: 'este formulario' },
      en: { t: 'Write to the editor · {brand}', h: 'Write a letter to the editor', p: 'Letters of up to 250 words may be edited for length. We publish a selection every Saturday.', rows: [['Your name', ''], ['Town', ''], ['Your letter', '']], b: ['Send letter', 'Read our guidelines'] },
      es: { t: 'Cartas al director · {brand}', h: 'Escribe una carta al director', p: 'Las cartas de hasta 250 palabras pueden ser recortadas. Publicamos una selección cada sábado.', rows: [['Tu nombre', ''], ['Localidad', ''], ['Tu carta', '']], b: ['Enviar carta', 'Leer las normas'] } },
  ],
};
K.travel = {
  l2: 'es', accent: '#0f7a6c', layout: 'top', pub: true, brands: ['Larkway Travel', 'Tidewind Journeys', 'Compass Meadow Trips'],
  nav: { en: ['Flights', 'Hotels', 'Trains', 'Car hire', 'My trips'], es: ['Vuelos', 'Hoteles', 'Trenes', 'Alquiler de coches', 'Mis viajes'] },
  strip: { en: 'Prices include taxes and fees · Free cancellation on most hotels', es: 'Precios con tasas incluidas · Cancelación gratuita en la mayoría de hoteles' },
  modals: ['cookie', 'region', 'news', 'app'], rates: ['search', 'slow', 'bare'],
  home: { en: { t: '{brand}: flights, hotels and trains', h: 'Where to next?', p: 'Compare flights, hotels and trains in one search.', rows: [['Lisbon', 'from 89 €'], ['Kraków', 'from 54 €'], ['Valencia', 'from 71 €']] },
    es: { t: '{brand}: vuelos, hoteles y trenes', h: '¿Adónde vamos?', p: 'Compara vuelos, hoteles y trenes en una sola búsqueda.', rows: [['Lisboa', 'desde 89 €'], ['Cracovia', 'desde 54 €'], ['Valencia', 'desde 71 €']] } },
  specs: [
    { k: 'booking', id: 'ref6', exp: ['the booking confirmation for reservation {id}', 'trip {id} under My trips'], thing: { en: 'this booking', es: 'esta reserva' },
      en: { t: 'Booking {id} · {brand}', h: 'Your trip is booked: {id}', p: 'Hotel Alameda, Valencia · 3 nights · 14 to 17 May 2026.', rows: [['Guests', '2 adults'], ['Room', 'Double, city view'], ['Paid', '312.00 €']], b: ['Manage booking', 'Add to calendar'] },
      es: { t: 'Reserva {id} · {brand}', h: 'Tu viaje está reservado: {id}', p: 'Hotel Alameda, Valencia · 3 noches · del 14 al 17 de mayo de 2026.', rows: [['Huéspedes', '2 adultos'], ['Habitación', 'Doble, vista a la ciudad'], ['Pagado', '312,00 €']], b: ['Gestionar reserva', 'Añadir al calendario'] } },
    { k: 'results', id: 'none', exp: ['the flight search results from Lisbon to Kraków on 22 May', 'flight results for Lisbon to Kraków, 22 May'], thing: { en: 'flight results', es: 'los resultados de vuelos' },
      en: { t: 'Lisbon to Kraków · Flights · {brand}', h: 'Lisbon → Kraków, Fri 22 May', p: '38 results · sorted by best value · 1 adult, economy.', rows: [['06:10 to 12:45', '1 stop · 142 €'], ['09:30 to 14:05', 'Direct · 198 €'], ['17:20 to 23:55', '1 stop · 131 €']], b: ['Filter results', 'Set price alert'] },
      es: { t: 'Lisboa a Cracovia · Vuelos · {brand}', h: 'Lisboa → Cracovia, vie 22 de mayo', p: '38 resultados · ordenados por mejor precio · 1 adulto, turista.', rows: [['06:10 a 12:45', '1 escala · 142 €'], ['09:30 a 14:05', 'Directo · 198 €'], ['17:20 a 23:55', '1 escala · 131 €']], b: ['Filtrar resultados', 'Crear alerta de precio'] } },
    { k: 'passengers', id: 'none', form: true, exp: ['the passenger details step of the flight booking', 'the form for entering passenger names before paying'], thing: { en: 'this booking step', es: 'este paso de la reserva' },
      en: { t: 'Passenger details · {brand}', h: 'Who is travelling?', p: 'Step 2 of 3. Enter names exactly as they appear on the passport.', rows: [['First name', ''], ['Last name', ''], ['Date of birth', '']], b: ['Continue to payment', 'Back to flights'] },
      es: { t: 'Datos de pasajeros · {brand}', h: '¿Quién viaja?', p: 'Paso 2 de 3. Escribe los nombres tal como aparecen en el pasaporte.', rows: [['Nombre', ''], ['Apellidos', ''], ['Fecha de nacimiento', '']], b: ['Continuar al pago', 'Volver a vuelos'] } },
  ],
};
K.gov = {
  l2: 'uk', accent: '#2d4a7a', layout: 'top', pub: true, brands: ['Velmora City Services', 'Harrowfield County Council', 'Brennmoor Municipality'],
  nav: { en: ['Services', 'Permits', 'Taxes', 'Parking', 'Contact'], uk: ['Послуги', 'Дозволи', 'Податки', 'Паркування', 'Контакти'] },
  strip: { en: 'Official website of the municipality · Office hours Mon to Fri 08:00 to 16:00', uk: 'Офіційний сайт громади · Прийом пн–пт 08:00–16:00' },
  modals: ['cookie', 'terms'], rates: ['search', 'slow', 'bare'],
  home: { en: { t: '{brand}', h: 'Online services', p: 'Apply, pay and book appointments without visiting the office.', rows: [['Parking permits', 'Apply online'], ['Waste collection', 'Calendar 2026'], ['Property tax', 'Pay or check'], ] },
    uk: { t: '{brand}', h: 'Онлайн-послуги', p: 'Подавайте заяви, сплачуйте і записуйтеся без візиту до офісу.', rows: [['Дозволи на паркування', 'Подати онлайн'], ['Вивезення сміття', 'Графік 2026'], ['Податок на майно', 'Сплатити або перевірити']] } },
  specs: [
    { k: 'permit', id: 'none', form: true, exp: ['the residential parking permit application form', 'the online form to apply for a resident parking permit'], thing: { en: 'this application', uk: 'цю заяву' },
      en: { t: 'Apply for a resident parking permit · {brand}', h: 'Apply for a resident parking permit', p: 'A permit costs 60 € a year and covers one vehicle in your zone. Have your registration certificate ready.', rows: [['Vehicle registration number', ''], ['Address in the zone', ''], ['Permit start date', '']], b: ['Continue', 'Save and finish later'] },
      uk: { t: 'Заява на дозвіл для паркування мешканця · {brand}', h: 'Заява на дозвіл для паркування мешканця', p: 'Дозвіл коштує 60 € на рік і діє для одного авто у вашій зоні. Підготуйте свідоцтво про реєстрацію.', rows: [['Номерний знак', ''], ['Адреса в зоні', ''], ['Дата початку дії', '']], b: ['Продовжити', 'Зберегти й завершити пізніше'] } },
    { k: 'case', id: 'case', exp: ['the status page of application {id}', 'case {id} in my applications'], thing: { en: 'this application', uk: 'цю заяву' },
      en: { t: 'Application {id} · {brand}', h: 'Application {id}', p: 'Building permit for a garden shed · submitted 2 February 2026.', rows: [['Status', 'Under review'], ['Officer', 'Planning department'], ['Decision expected', 'by 30 April 2026']], b: ['Add a document', 'Withdraw application'] },
      uk: { t: 'Заява {id} · {brand}', h: 'Заява {id}', p: 'Дозвіл на будівництво садового сарая · подано 2 лютого 2026.', rows: [['Статус', 'На розгляді'], ['Виконавець', 'Відділ планування'], ['Рішення очікується', 'до 30 квітня 2026']], b: ['Додати документ', 'Відкликати заяву'] } },
    { k: 'waste', id: 'none', exp: ['the waste collection calendar for 2026', 'the 2026 bin collection schedule'], thing: { en: 'the calendar', uk: 'графік' },
      en: { t: 'Waste collection calendar 2026 · {brand}', h: 'Waste collection calendar 2026', p: 'Bins go out by 06:30 on the collection day. Holiday changes are marked.', rows: [['General waste', 'Every Tuesday'], ['Paper', '1st and 3rd Thursday'], ['Garden waste', 'Fridays, April to November']], b: ['Download PDF', 'Get reminders'] },
      uk: { t: 'Графік вивезення сміття 2026 · {brand}', h: 'Графік вивезення сміття 2026', p: 'Виставляйте контейнери до 06:30 у день вивезення. Зміни у святкові дні позначено.', rows: [['Змішані відходи', 'Щовівторка'], ['Папір', '1-й і 3-й четвер'], ['Садові відходи', 'Пʼятниці, з квітня до листопада']], b: ['Завантажити PDF', 'Отримувати нагадування'] } },
  ],
};
K.forum = {
  l2: 'pl', accent: '#6b4f1d', layout: 'top', pub: true, brands: ['Gearchain Forum', 'Fernhollow Community', 'Spokewright Board'],
  nav: { en: ['Latest', 'Categories', 'Top', 'Members', 'Rules'], pl: ['Najnowsze', 'Kategorie', 'Popularne', 'Użytkownicy', 'Zasady'] },
  strip: { en: '1,204 members online · Be kind, stay on topic', pl: '1 204 osoby online · Bądź uprzejmy, trzymaj się tematu' },
  modals: ['cookie', 'news', 'app'], rates: ['search', 'slow', 'bare'],
  home: { en: { t: '{brand}', h: 'Latest topics', p: 'Questions, builds and repair stories from the community.', rows: [['Chain skips under load', '23 replies'], ['First wheel build', '41 replies'], ['Winter storage tips', '9 replies']] },
    pl: { t: '{brand}', h: 'Najnowsze wątki', p: 'Pytania, projekty i historie napraw od społeczności.', rows: [['Łańcuch przeskakuje pod obciążeniem', '23 odpowiedzi'], ['Moje pierwsze koło', '41 odpowiedzi'], ['Przechowywanie zimą', '9 odpowiedzi']] } },
  specs: [
    { k: 'thread', id: 'num5', exp: ['thread {id} about the chain skipping under load', 'the discussion thread number {id} on chain skipping'], thing: { en: 'this thread', pl: 'ten wątek' },
      en: { t: 'Chain skips under load (#{id}) · {brand}', h: 'Chain skips under load', p: 'Thread #{id} · started by gravelpaul · 23 replies. New chain, old cassette: is that the cause?', rows: [['marta_rides', 'A worn cassette is the usual cause. Measure it first.'], ['gravelpaul', 'Replaced the cassette, all good now. Thanks!'], ['Status', 'Solved']], b: ['Reply', 'Follow thread'] },
      pl: { t: 'Łańcuch przeskakuje pod obciążeniem (#{id}) · {brand}', h: 'Łańcuch przeskakuje pod obciążeniem', p: 'Wątek #{id} · założony przez gravelpaul · 23 odpowiedzi. Nowy łańcuch, stara kaseta: czy to przyczyna?', rows: [['marta_rides', 'Zużyta kaseta to najczęstsza przyczyna. Najpierw ją zmierz.'], ['gravelpaul', 'Wymieniłem kasetę, wszystko działa. Dzięki!'], ['Status', 'Rozwiązany']], b: ['Odpowiedz', 'Obserwuj wątek'] } },
    { k: 'newtopic', id: 'none', form: true, exp: ['the form for starting a new topic in the Repairs category', 'the new-topic page of the Repairs board'], thing: { en: 'this form', pl: 'ten formularz' },
      en: { t: 'New topic in Repairs · {brand}', h: 'Start a new topic in Repairs', p: 'Search first: most questions have been answered. Add photos if you can.', rows: [['Title', ''], ['Your question', ''], ['Tags', '']], b: ['Post topic', 'Save draft'] },
      pl: { t: 'Nowy wątek w Naprawach · {brand}', h: 'Nowy wątek w kategorii Naprawy', p: 'Najpierw poszukaj: na większość pytań są już odpowiedzi. Dodaj zdjęcia, jeśli możesz.', rows: [['Tytuł', ''], ['Twoje pytanie', ''], ['Tagi', '']], b: ['Opublikuj', 'Zapisz szkic'] } },
    { k: 'profile', id: 'none', exp: ['the public profile of the member marta_rides', 'marta_rides’s member profile'], thing: { en: 'member profiles', pl: 'profile użytkowników' },
      en: { t: 'marta_rides · {brand}', h: 'marta_rides', p: 'Member since 2019 · Wheel builder · 2,418 posts.', rows: [['Solutions', '312'], ['Likes received', '5,904'], ['Last seen', '2 hours ago']], b: ['Message', 'Follow'] },
      pl: { t: 'marta_rides · {brand}', h: 'marta_rides', p: 'Na forum od 2019 · Buduje koła · 2 418 postów.', rows: [['Rozwiązania', '312'], ['Polubienia', '5 904'], ['Ostatnio', '2 godziny temu']], b: ['Wiadomość', 'Obserwuj'] } },
  ],
};
K.docs = {
  l2: 'de', accent: '#2a6f3e', layout: 'side', pub: true, brands: ['Pipewren Docs', 'Knotwork SDK', 'Tessellate Developer Docs'],
  nav: { en: ['Guides', 'API reference', 'Examples', 'Changelog', 'Status'], de: ['Anleitungen', 'API-Referenz', 'Beispiele', 'Änderungen', 'Status'] },
  strip: { en: 'Version {ver} · Edit this page', de: 'Version {ver} · Diese Seite bearbeiten' },
  modals: ['cookie', 'news'], rates: ['quota', 'slow', 'bare'],
  home: { en: { t: '{brand}', h: 'Documentation', p: 'Everything you need to build with the SDK.', rows: [['Quickstart', '5 minutes'], ['Authentication', 'Tokens and scopes'], ['Webhooks', 'Events and retries']] },
    de: { t: '{brand}', h: 'Dokumentation', p: 'Alles, was Sie zum Entwickeln mit dem SDK brauchen.', rows: [['Schnellstart', '5 Minuten'], ['Authentifizierung', 'Tokens und Berechtigungen'], ['Webhooks', 'Ereignisse und Wiederholungen']] } },
  specs: [
    { k: 'retry', id: 'none', exp: ['the guide page on retry policies', 'the Retry policies guide'], thing: { en: 'this guide', de: 'diese Anleitung' },
      en: { t: 'Retry policies · Guides · {brand}', h: 'Retry policies', p: 'Requests that fail with a timeout or a 503 are retried with exponential backoff. A 429 response is retried after the Retry-After header.', rows: [['maxAttempts', 'Default 3'], ['baseDelayMs', 'Default 200'], ['retryOn', '408, 429, 500, 502, 503, 504']], b: ['Copy example', 'Next: Timeouts'] },
      de: { t: 'Wiederholungsrichtlinien · Anleitungen · {brand}', h: 'Wiederholungsrichtlinien', p: 'Anfragen, die mit einem Timeout oder 503 fehlschlagen, werden mit exponentiellem Backoff wiederholt. Eine 429-Antwort wird nach dem Retry-After-Header wiederholt.', rows: [['maxAttempts', 'Standard 3'], ['baseDelayMs', 'Standard 200'], ['retryOn', '408, 429, 500, 502, 503, 504']], b: ['Beispiel kopieren', 'Weiter: Timeouts'] } },
    { k: 'apiref', id: 'none', exp: ['the API reference entry for the createWebhook method', 'createWebhook in the API reference'], thing: { en: 'the API reference', de: 'die API-Referenz' },
      en: { t: 'createWebhook · API reference · {brand}', h: 'createWebhook(options)', p: 'Registers an endpoint that receives signed event payloads. Returns the webhook id and its signing secret once.', rows: [['url', 'string, required'], ['events', 'string[], required'], ['active', 'boolean, default true']], b: ['Try it', 'View source'] },
      de: { t: 'createWebhook · API-Referenz · {brand}', h: 'createWebhook(options)', p: 'Registriert einen Endpunkt, der signierte Ereignisse empfängt. Gibt die Webhook-ID und einmalig das Signaturgeheimnis zurück.', rows: [['url', 'string, erforderlich'], ['events', 'string[], erforderlich'], ['active', 'boolean, Standard true']], b: ['Ausprobieren', 'Quelltext ansehen'] } },
    { k: 'changelog', id: 'ver', exp: ['the changelog entry for release {id}', 'the release notes of version {id}'], thing: { en: 'the changelog', de: 'das Änderungsprotokoll' },
      en: { t: 'Release {id} · Changelog · {brand}', h: 'Release {id}', p: 'Released 9 March 2026. This release drops support for Node 18.', rows: [['Added', 'Streaming uploads'], ['Fixed', 'Webhook retries no longer duplicate events'], ['Changed', 'Default timeout is now 10 s']], b: ['Upgrade guide', 'All releases'] },
      de: { t: 'Release {id} · Änderungen · {brand}', h: 'Release {id}', p: 'Veröffentlicht am 9. März 2026. Diese Version unterstützt Node 18 nicht mehr.', rows: [['Neu', 'Streaming-Uploads'], ['Behoben', 'Webhook-Wiederholungen erzeugen keine doppelten Ereignisse mehr'], ['Geändert', 'Standard-Timeout ist jetzt 10 s']], b: ['Upgrade-Anleitung', 'Alle Releases'] } },
  ],
};
K.admin = {
  l2: 'uk', accent: '#3b3b3b', layout: 'side', pub: false, brands: ['Quarry Admin', 'Bramblebase Console', 'Inkstone Back Office'],
  nav: { en: ['Dashboard', 'Orders', 'Customers', 'Products', 'Audit log'], uk: ['Панель', 'Замовлення', 'Клієнти', 'Товари', 'Журнал дій'] },
  strip: { en: 'Signed in as operator · Store: Riverside outlet', uk: 'Ви увійшли як оператор · Магазин: Riverside outlet' },
  modals: ['cookie', 'terms'], rates: ['quota', 'slow', 'bare'],
  home: { en: { t: 'Dashboard · {brand}', h: 'Dashboard', p: 'Today so far, compared with last Thursday.', rows: [['Orders', '184 (+12%)'], ['Refunds', '3'], ['Open tickets', '17']] },
    uk: { t: 'Панель · {brand}', h: 'Панель', p: 'Сьогодні порівняно з минулим четвергом.', rows: [['Замовлення', '184 (+12%)'], ['Повернення', '3'], ['Відкриті звернення', '17']] } },
  specs: [
    { k: 'customer', id: 'num6', exp: ['the admin record of customer {id}', 'customer {id} in the customers table'], thing: { en: 'customer records', uk: 'картки клієнтів' },
      en: { t: 'Customer {id} · {brand}', h: 'Customer {id}', p: 'Created 14 Jan 2025 · 23 orders · last order 2 days ago.', rows: [['Segment', 'Returning'], ['Lifetime value', '1,942.30 €'], ['Marketing consent', 'No']], b: ['Edit customer', 'View orders'] },
      uk: { t: 'Клієнт {id} · {brand}', h: 'Клієнт {id}', p: 'Створено 14 січня 2025 · 23 замовлення · останнє 2 дні тому.', rows: [['Сегмент', 'Постійний'], ['Сума покупок', '1 942,30 €'], ['Згода на розсилку', 'Ні']], b: ['Редагувати клієнта', 'Переглянути замовлення'] } },
    { k: 'audit', id: 'none', exp: ['the audit log filtered to failed sign-ins', 'the audit log view of failed sign-in attempts'], thing: { en: 'the audit log', uk: 'журнал дій' },
      en: { t: 'Audit log · {brand}', h: 'Audit log: failed sign-ins', p: 'Showing 3 of 41 events in the last 24 hours. Filter: event = sign_in_failed.', rows: [['09:12', 'sign_in_failed · 401 · wrong password'], ['08:47', 'sign_in_failed · 429 · too many attempts'], ['07:03', 'sign_in_failed · 403 · account locked']], b: ['Export CSV', 'Clear filter'] },
      uk: { t: 'Журнал дій · {brand}', h: 'Журнал дій: невдалі входи', p: 'Показано 3 з 41 події за останні 24 години. Фільтр: event = sign_in_failed.', rows: [['09:12', 'sign_in_failed · 401 · неправильний пароль'], ['08:47', 'sign_in_failed · 429 · забагато спроб'], ['07:03', 'sign_in_failed · 403 · акаунт заблоковано']], b: ['Експорт CSV', 'Скинути фільтр'] } },
    { k: 'product', id: 'num5', form: true, exp: ['the edit form of product {id}', 'the product editor for item {id}'], thing: { en: 'products', uk: 'товари' },
      en: { t: 'Edit product {id} · {brand}', h: 'Edit product {id}: Stoneware mug, sand', p: 'Changes go live after you save. Stock syncs every 5 minutes.', rows: [['Price', '12.00 €'], ['Stock', '214'], ['Visibility', 'Online store']], b: ['Save product', 'Discard changes'] },
      uk: { t: 'Редагування товару {id} · {brand}', h: 'Редагування товару {id}: керамічний кухоль, пісочний', p: 'Зміни зʼявляться після збереження. Залишки синхронізуються кожні 5 хвилин.', rows: [['Ціна', '12,00 €'], ['Залишок', '214'], ['Видимість', 'Інтернет-магазин']], b: ['Зберегти товар', 'Скасувати зміни'] } },
  ],
};
K.mail = {
  l2: 'uk', accent: '#b0412e', layout: 'side', pub: false, brands: ['Postwick Mail', 'Swallowbox', 'Kestrel Mail'],
  nav: { en: ['Inbox', 'Starred', 'Sent', 'Drafts', 'Archive'], uk: ['Вхідні', 'Із зірочкою', 'Надіслані', 'Чернетки', 'Архів'] },
  strip: { en: 'Storage: 2.1 GB of 15 GB used', uk: 'Сховище: використано 2,1 ГБ із 15 ГБ' },
  modals: ['cookie', 'terms', 'app'], rates: ['slow', 'quota', 'bare'],
  home: { en: { t: 'Inbox (3) · {brand}', h: 'Inbox', p: '3 unread conversations.', rows: [['Lena Hart', 'Photos from Saturday'], ['Building office', 'Water off on Monday'], ['Book club', 'Next meeting: 2 April']] },
    uk: { t: 'Вхідні (3) · {brand}', h: 'Вхідні', p: '3 непрочитані розмови.', rows: [['Олена Гарт', 'Фото з суботи'], ['Управитель будинку', 'У понеділок не буде води'], ['Книжковий клуб', 'Наступна зустріч: 2 квітня']] } },
  specs: [
    { k: 'compose', id: 'none', form: true, exp: ['the compose window for a new message', 'the new e-mail editor'], thing: { en: 'your mailbox', uk: 'вашу пошту' },
      en: { t: 'New message · {brand}', h: 'New message', p: 'Draft saved automatically.', rows: [['To', ''], ['Subject', ''], ['Message', '']], b: ['Send', 'Discard draft'] },
      uk: { t: 'Новий лист · {brand}', h: 'Новий лист', p: 'Чернетку збережено автоматично.', rows: [['Кому', ''], ['Тема', ''], ['Повідомлення', '']], b: ['Надіслати', 'Видалити чернетку'] } },
    { k: 'sent', id: 'none', exp: ['the Sent folder', 'the list of sent messages'], thing: { en: 'your mailbox', uk: 'вашу пошту' },
      en: { t: 'Sent · {brand}', h: 'Sent', p: 'Messages you sent in the last 30 days.', rows: [['To: Lena Hart', 'Re: Photos from Saturday'], ['To: Building office', 'Meter reading for March'], ['To: Book club', 'I can bring the tea']], b: ['Select all', 'Refresh'] },
      uk: { t: 'Надіслані · {brand}', h: 'Надіслані', p: 'Листи, надіслані за останні 30 днів.', rows: [['Кому: Олена Гарт', 'Re: Фото з суботи'], ['Кому: Управитель будинку', 'Показники лічильника за березень'], ['Кому: Книжковий клуб', 'Я принесу чай']], b: ['Вибрати всі', 'Оновити'] } },
    { k: 'filters', id: 'none', exp: ['the mail filters settings page', 'the settings page listing mail filters'], thing: { en: 'settings', uk: 'налаштування' },
      en: { t: 'Filters · Settings · {brand}', h: 'Filters and blocked addresses', p: 'Filters run on new mail as it arrives.', rows: [['From: newsletters', 'Skip inbox, label Reading'], ['Subject has: invoice', 'Label Bills'], ['Blocked', '2 addresses']], b: ['Create filter', 'Import filters'] },
      uk: { t: 'Фільтри · Налаштування · {brand}', h: 'Фільтри і заблоковані адреси', p: 'Фільтри застосовуються до нових листів одразу після надходження.', rows: [['Від: розсилки', 'Пропускати вхідні, мітка «Читати»'], ['Тема містить: рахунок', 'Мітка «Рахунки»'], ['Заблоковано', '2 адреси']], b: ['Створити фільтр', 'Імпортувати фільтри'] } },
  ],
};
K.learning = {
  l2: 'es', accent: '#7a3d8f', layout: 'side', pub: false, brands: ['Studyloom', 'Marrowfield College Portal', 'Acorn Academy Online'],
  nav: { en: ['My courses', 'Calendar', 'Grades', 'Messages', 'Library'], es: ['Mis cursos', 'Calendario', 'Calificaciones', 'Mensajes', 'Biblioteca'] },
  strip: { en: 'Spring term 2026 · Week 7', es: 'Semestre de primavera 2026 · Semana 7' },
  modals: ['cookie', 'terms', 'app'], rates: ['dl', 'slow', 'bare'],
  home: { en: { t: 'My courses · {brand}', h: 'My courses', p: 'You have 2 assignments due this week.', rows: [['Statistics 101', 'Quiz 4 due Friday'], ['Academic writing', 'Essay draft due Monday'], ['Spanish B1', 'No tasks']] },
    es: { t: 'Mis cursos · {brand}', h: 'Mis cursos', p: 'Tienes 2 tareas para esta semana.', rows: [['Estadística 101', 'Cuestionario 4 el viernes'], ['Escritura académica', 'Borrador del ensayo el lunes'], ['Español B1', 'Sin tareas']] } },
  specs: [
    { k: 'grades', id: 'none', exp: ['the grades page of the Statistics 101 course', 'my Statistics 101 grades'], thing: { en: 'your grades', es: 'tus calificaciones' },
      en: { t: 'Grades · Statistics 101 · {brand}', h: 'Statistics 101: grades', p: 'Current average 84% · 3 of 6 graded items.', rows: [['Quiz 1', '9 / 10'], ['Quiz 2', '7 / 10'], ['Midterm', '41 / 50']], b: ['Download report', 'Ask the tutor'] },
      es: { t: 'Calificaciones · Estadística 101 · {brand}', h: 'Estadística 101: calificaciones', p: 'Media actual 84 % · 3 de 6 actividades calificadas.', rows: [['Cuestionario 1', '9 / 10'], ['Cuestionario 2', '7 / 10'], ['Parcial', '41 / 50']], b: ['Descargar informe', 'Preguntar al tutor'] } },
    { k: 'submit', id: 'none', form: true, exp: ['the submission page of the essay draft assignment', 'the upload form for the Academic writing essay draft'], thing: { en: 'this assignment', es: 'esta tarea' },
      en: { t: 'Essay draft · Academic writing · {brand}', h: 'Submit: essay draft', p: 'Due Monday 23:59. Word or PDF, up to 20 MB. You can resubmit until the deadline.', rows: [['File', ''], ['Comment for the tutor', ''], ['Originality statement', '']], b: ['Submit assignment', 'Save draft'] },
      es: { t: 'Borrador del ensayo · Escritura académica · {brand}', h: 'Entregar: borrador del ensayo', p: 'Fecha límite el lunes a las 23:59. Word o PDF, hasta 20 MB. Puedes volver a entregar hasta la fecha límite.', rows: [['Archivo', ''], ['Comentario para el tutor', ''], ['Declaración de originalidad', '']], b: ['Entregar tarea', 'Guardar borrador'] } },
    { k: 'lesson', id: 'num4', exp: ['lesson {id} of the Statistics 101 course', 'the lecture page for lesson {id}'], thing: { en: 'this lesson', es: 'esta lección' },
      en: { t: 'Lesson {id}: Confidence intervals · {brand}', h: 'Lesson {id}: Confidence intervals', p: 'Video 18 min · slides · practice set of 8 questions.', rows: [['Video', 'Watched 40%'], ['Slides', 'PDF, 2.4 MB'], ['Practice set', 'Not started']], b: ['Resume video', 'Mark as done'] },
      es: { t: 'Lección {id}: Intervalos de confianza · {brand}', h: 'Lección {id}: Intervalos de confianza', p: 'Vídeo de 18 min · diapositivas · ejercicios de 8 preguntas.', rows: [['Vídeo', 'Visto 40 %'], ['Diapositivas', 'PDF, 2,4 MB'], ['Ejercicios', 'Sin empezar']], b: ['Seguir viendo', 'Marcar como hecha'] } },
  ],
};
K.jobs = {
  l2: 'pl', accent: '#1d6fa3', layout: 'top', pub: true, brands: ['Hireharbor', 'Workglen', 'Jobwillow'],
  nav: { en: ['Find jobs', 'Companies', 'Salaries', 'Saved jobs', 'Applications'], pl: ['Oferty', 'Firmy', 'Zarobki', 'Zapisane', 'Aplikacje'] },
  strip: { en: '18,402 open roles · updated hourly', pl: '18 402 oferty · aktualizowane co godzinę' },
  modals: ['cookie', 'news', 'app', 'region'], rates: ['search', 'slow', 'bare'],
  home: { en: { t: '{brand}: find your next job', h: 'Find your next job', p: 'Search by role, skill or city.', rows: [['Warehouse lead', 'Gdańsk · full time'], ['Frontend developer', 'Remote'], ['Pastry chef', 'Kraków']] },
    pl: { t: '{brand}: znajdź kolejną pracę', h: 'Znajdź kolejną pracę', p: 'Szukaj według stanowiska, umiejętności lub miasta.', rows: [['Kierownik magazynu', 'Gdańsk · pełny etat'], ['Frontend developer', 'Zdalnie'], ['Cukiernik', 'Kraków']] } },
  specs: [
    { k: 'posting', id: 'num6', exp: ['job posting {id} for a warehouse shift lead', 'the warehouse shift lead vacancy, offer {id}'], thing: { en: 'this job', pl: 'tę ofertę' },
      en: { t: 'Warehouse shift lead (offer {id}) · {brand}', h: 'Warehouse shift lead', p: 'Offer {id} · Gdańsk · full time · 5,800 to 6,600 PLN gross.', rows: [['Shifts', 'Two shifts, Mon to Fri'], ['Experience', '2 years in logistics'], ['Posted', '3 days ago']], b: ['Apply now', 'Save job'] },
      pl: { t: 'Kierownik zmiany w magazynie (oferta {id}) · {brand}', h: 'Kierownik zmiany w magazynie', p: 'Oferta {id} · Gdańsk · pełny etat · 5 800 – 6 600 zł brutto.', rows: [['Zmiany', 'Dwie zmiany, pon.–pt.'], ['Doświadczenie', '2 lata w logistyce'], ['Dodano', '3 dni temu']], b: ['Aplikuj', 'Zapisz ofertę'] } },
    { k: 'apps', id: 'none', exp: ['the list of my job applications', 'my applications page'], thing: { en: 'your applications', pl: 'swoje aplikacje' },
      en: { t: 'My applications · {brand}', h: 'My applications', p: 'You applied to 3 jobs in the last 30 days.', rows: [['Warehouse shift lead', 'Viewed by employer'], ['Stock controller', 'Interview on 18 March'], ['Forklift operator', 'Closed']], b: ['Withdraw', 'Update CV'] },
      pl: { t: 'Moje aplikacje · {brand}', h: 'Moje aplikacje', p: 'W ciągu ostatnich 30 dni aplikowałeś na 3 oferty.', rows: [['Kierownik zmiany w magazynie', 'Wyświetlone przez pracodawcę'], ['Specjalista ds. zapasów', 'Rozmowa 18 marca'], ['Operator wózka widłowego', 'Zamknięte']], b: ['Wycofaj', 'Zaktualizuj CV'] } },
    { k: 'apply', id: 'none', form: true, exp: ['the application form for the warehouse shift lead job', 'the apply page of the warehouse shift lead vacancy'], thing: { en: 'this application', pl: 'tę aplikację' },
      en: { t: 'Apply: Warehouse shift lead · {brand}', h: 'Apply for Warehouse shift lead', p: 'It takes about 3 minutes. The employer sees your CV and answers.', rows: [['Full name', ''], ['CV (PDF)', ''], ['Earliest start date', '']], b: ['Send application', 'Cancel'] },
      pl: { t: 'Aplikuj: Kierownik zmiany w magazynie · {brand}', h: 'Aplikuj: Kierownik zmiany w magazynie', p: 'To zajmie około 3 minut. Pracodawca zobaczy Twoje CV i odpowiedzi.', rows: [['Imię i nazwisko', ''], ['CV (PDF)', ''], ['Najwcześniejsza data rozpoczęcia', '']], b: ['Wyślij aplikację', 'Anuluj'] } },
  ],
};
K.clinic = {
  l2: 'de', accent: '#0b6e8a', layout: 'top', pub: false, brands: ['Elmbrook Clinic', 'Sorrel Health Centre', 'Quayside Medical'],
  nav: { en: ['Appointments', 'Test results', 'Prescriptions', 'Messages', 'Profile'], de: ['Termine', 'Befunde', 'Rezepte', 'Nachrichten', 'Profil'] },
  strip: { en: 'Patient portal · In an emergency call 112', de: 'Patientenportal · Im Notfall 112 anrufen' },
  modals: ['cookie', 'terms'], rates: ['slow', 'dl', 'bare'],
  home: { en: { t: 'Patient portal · {brand}', h: 'Welcome back', p: 'Nothing needs your attention today.', rows: [['Next appointment', '24 March, 10:20'], ['New results', 'None'], ['Repeat prescriptions', '1 ready to request']] },
    de: { t: 'Patientenportal · {brand}', h: 'Willkommen zurück', p: 'Heute ist nichts zu erledigen.', rows: [['Nächster Termin', '24. März, 10:20'], ['Neue Befunde', 'Keine'], ['Folgerezepte', '1 kann angefordert werden']] } },
  specs: [
    { k: 'book', id: 'none', form: true, exp: ['the page for booking a GP appointment', 'the appointment booking form with free time slots'], thing: { en: 'appointments', de: 'Termine' },
      en: { t: 'Book an appointment · {brand}', h: 'Book a GP appointment', p: 'Choose a free slot. Cancel at least 24 hours ahead if you cannot come.', rows: [['Tue 24 March', '09:40 · 10:20 · 15:00'], ['Wed 25 March', '08:20 · 11:00'], ['Reason for visit', '']], b: ['Book slot', 'Video call instead'] },
      de: { t: 'Termin buchen · {brand}', h: 'Hausarzttermin buchen', p: 'Wählen Sie einen freien Termin. Sagen Sie mindestens 24 Stunden vorher ab, wenn Sie nicht kommen können.', rows: [['Di 24. März', '09:40 · 10:20 · 15:00'], ['Mi 25. März', '08:20 · 11:00'], ['Grund des Besuchs', '']], b: ['Termin buchen', 'Lieber Videosprechstunde'] } },
    { k: 'result', id: 'num5', exp: ['test result {id}, the blood count from 3 March', 'the lab result {id} in Test results'], thing: { en: 'your results', de: 'Ihre Befunde' },
      en: { t: 'Result {id} · {brand}', h: 'Full blood count (result {id})', p: 'Sample taken 3 March 2026 · reviewed by your doctor · no action needed.', rows: [['Haemoglobin', '138 g/L (normal)'], ['White cells', '6.1 (normal)'], ['Platelets', '255 (normal)']], b: ['Download PDF', 'Message your doctor'] },
      de: { t: 'Befund {id} · {brand}', h: 'Blutbild (Befund {id})', p: 'Probe vom 3. März 2026 · ärztlich geprüft · nichts zu tun.', rows: [['Hämoglobin', '138 g/L (normal)'], ['Leukozyten', '6,1 (normal)'], ['Thrombozyten', '255 (normal)']], b: ['PDF herunterladen', 'Nachricht an Ihre Ärztin'] } },
    { k: 'rx', id: 'none', exp: ['the repeat prescriptions page', 'the list of repeat prescriptions I can request'], thing: { en: 'prescriptions', de: 'Rezepte' },
      en: { t: 'Repeat prescriptions · {brand}', h: 'Repeat prescriptions', p: 'Requests sent before 12:00 are usually ready the next working day.', rows: [['Salbutamol inhaler', 'Ready to request'], ['Vitamin D 1,000 IU', 'Requested 2 March'], ['Cetirizine 10 mg', 'Review due in April']], b: ['Request selected', 'Change pharmacy'] },
      de: { t: 'Folgerezepte · {brand}', h: 'Folgerezepte', p: 'Anfragen vor 12:00 sind meist am nächsten Werktag fertig.', rows: [['Salbutamol-Spray', 'Kann angefordert werden'], ['Vitamin D 1.000 IE', 'Angefordert am 2. März'], ['Cetirizin 10 mg', 'Überprüfung im April fällig']], b: ['Auswahl anfordern', 'Apotheke ändern'] } },
  ],
};
K.rentals = {
  l2: 'es', accent: '#9a5b13', layout: 'top', pub: true, brands: ['Nestlane Rentals', 'Roomquarry', 'Halcyon Lets'],
  nav: { en: ['Rent', 'Share', 'Short stays', 'Saved', 'Messages'], es: ['Alquilar', 'Compartir', 'Estancias cortas', 'Guardados', 'Mensajes'] },
  strip: { en: 'Verified listings only · No agency fees', es: 'Solo anuncios verificados · Sin comisiones de agencia' },
  modals: ['cookie', 'region', 'app', 'news'], rates: ['search', 'slow', 'bare'],
  home: { en: { t: '{brand}: flats and rooms to rent', h: 'Find a place to live', p: '4,120 listings in 12 cities.', rows: [['Valencia', '612 flats'], ['Porto', '388 flats'], ['Gdańsk', '297 flats']] },
    es: { t: '{brand}: pisos y habitaciones en alquiler', h: 'Encuentra dónde vivir', p: '4.120 anuncios en 12 ciudades.', rows: [['Valencia', '612 pisos'], ['Oporto', '388 pisos'], ['Gdansk', '297 pisos']] } },
  specs: [
    { k: 'listing', id: 'num6', exp: ['listing {id}, the two-bedroom flat on Alder Street', 'the Alder Street two-bedroom flat, ad {id}'], thing: { en: 'this listing', es: 'este anuncio' },
      en: { t: '2-bedroom flat, Alder Street (ad {id}) · {brand}', h: '2-bedroom flat, Alder Street', p: 'Ad {id} · 68 m² · 3rd floor with lift · available from 1 May.', rows: [['Rent', '940 € / month'], ['Deposit', '2 months'], ['Pets', 'Allowed']], b: ['Contact the owner', 'Save'] },
      es: { t: 'Piso de 2 dormitorios, calle Alder (anuncio {id}) · {brand}', h: 'Piso de 2 dormitorios, calle Alder', p: 'Anuncio {id} · 68 m² · 3.ª planta con ascensor · disponible desde el 1 de mayo.', rows: [['Alquiler', '940 € / mes'], ['Fianza', '2 meses'], ['Mascotas', 'Permitidas']], b: ['Contactar al propietario', 'Guardar'] } },
    { k: 'search', id: 'none', exp: ['the search results for flats in Valencia under 1,000 €', 'Valencia rentals below 1,000 € a month'], thing: { en: 'search results', es: 'los resultados' },
      en: { t: 'Flats in Valencia under 1,000 € · {brand}', h: 'Flats to rent in Valencia', p: '214 results · max 1,000 € · sorted by newest.', rows: [['Ruzafa, 1 bedroom', '780 €'], ['Benimaclet, 2 bedrooms', '890 €'], ['El Carmen, studio', '650 €']], b: ['Save search', 'Map view'] },
      es: { t: 'Pisos en Valencia hasta 1.000 € · {brand}', h: 'Pisos en alquiler en Valencia', p: '214 resultados · máx. 1.000 € · más recientes primero.', rows: [['Ruzafa, 1 dormitorio', '780 €'], ['Benimaclet, 2 dormitorios', '890 €'], ['El Carmen, estudio', '650 €']], b: ['Guardar búsqueda', 'Ver mapa'] } },
    { k: 'viewing', id: 'none', form: true, exp: ['the form to request a viewing of the Alder Street flat', 'the viewing request page for the Alder Street flat'], thing: { en: 'this listing', es: 'este anuncio' },
      en: { t: 'Request a viewing · {brand}', h: 'Request a viewing: Alder Street', p: 'The owner usually replies within a day. Pick up to 3 times that suit you.', rows: [['Preferred dates', ''], ['Phone', ''], ['Message to the owner', '']], b: ['Send request', 'Back to the ad'] },
      es: { t: 'Solicitar visita · {brand}', h: 'Solicitar visita: calle Alder', p: 'El propietario suele responder en un día. Elige hasta 3 horarios que te vengan bien.', rows: [['Fechas preferidas', ''], ['Teléfono', ''], ['Mensaje al propietario', '']], b: ['Enviar solicitud', 'Volver al anuncio'] } },
  ],
};

// ================================ rendering ================================
const KINDS = Object.keys(K);
const hostOf = (brand) => `${slug(brand)}.example.test`;
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
const F = (s, v) => esc(fill(s, v));

function css(kind, layout) {
  const a = K[kind].accent, dark = layout === 'dark', side = layout === 'side';
  return `*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d1d1f;background:${dark ? '#f4f1ea' : '#f5f6f8'}}`
    + `a{color:${a}}header{display:flex;flex-wrap:wrap;gap:18px;align-items:center;padding:10px 24px;background:${dark ? '#161616' : '#fff'};color:${dark ? '#f2f2f2' : '#1d1d1f'};border-bottom:1px solid #ddd}`
    + `.logo{font-weight:700;font-size:18px;color:${dark ? '#fff' : a};text-decoration:none}header nav a{margin-right:14px;color:inherit;text-decoration:none}`
    + `header input{padding:5px 8px;border:1px solid #bbb;border-radius:4px}.acct{margin-left:auto}.strip{background:${a};color:#fff;font-size:13px;padding:4px 24px}`
    + `.wrap{display:grid;grid-template-columns:${side ? '210px 1fr' : '1fr 250px'};gap:24px;max-width:1120px;margin:20px auto;padding:0 24px}`
    + `main{grid-column:${side ? 2 : 1};grid-row:1;background:#fff;border:1px solid #e2e2e2;border-radius:8px;padding:20px 26px;min-height:320px}`
    + `aside{grid-column:${side ? 1 : 2};grid-row:1;font-size:13px;color:#555}aside p{background:#fff;border:1px solid #e6e6e6;border-radius:6px;padding:10px}`
    + `.row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #eee}.row input{flex:0 0 55%;padding:6px;border:1px solid #bbb;border-radius:4px}`
    + `.btn{display:inline-block;margin:14px 10px 0 0;padding:8px 16px;border-radius:6px;border:1px solid ${a};background:#fff;color:${a};font:inherit;cursor:pointer}.btn.pri{background:${a};color:#fff}`
    + `.crumb{font-size:13px;color:#777;margin-bottom:6px}.note{background:#fff7e0;border:1px solid #ecd9a0;border-radius:6px;padding:8px 12px;font-size:14px}`
    + `.card{max-width:420px;margin:60px auto;background:#fff;border:1px solid #ddd;border-radius:10px;padding:28px}.card label{display:block;margin-top:12px}.card input{width:100%;padding:8px;margin-top:4px;border:1px solid #bbb;border-radius:4px}`
    + `.big{font-size:56px;font-weight:800;color:${a};margin:0}.ov{position:fixed;inset:0;background:rgba(20,20,20,.62);display:flex;align-items:center;justify-content:center;z-index:50}`
    + `.ovb{background:#fff;max-width:480px;border-radius:12px;padding:26px}.bar{position:fixed;left:0;right:0;bottom:0;background:#222;color:#eee;padding:10px 24px;font-size:13px}`
    + `.toast{position:fixed;top:14px;right:14px;background:#1e7f4f;color:#fff;padding:8px 14px;border-radius:6px}.err{color:#a4161a;font-size:14px}.tiles{display:grid;grid-template-columns:repeat(3,90px);gap:6px;margin:12px 0}.tiles div{height:80px;background:#cdd5dc;font-size:11px;padding:4px}`
    + `footer{max-width:1120px;margin:30px auto 70px;padding:14px 24px;border-top:1px solid #ddd;font-size:13px;color:#666}footer a{margin-right:14px;color:#666}`;
}

function doc(lang, title, kind, layout, body) {
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title><style>${css(kind, layout)}</style></head>\n<body>\n${body}\n</body></html>\n`;
}

function header(c, L, minimal) {
  const k = K[c.kind], t = T[L];
  if (minimal) return `<header><a class="logo" href="#">${esc(c.brand)}</a></header>`;
  const nav = k.nav[L].map((n) => `<a href="#">${esc(n)}</a>`).join('');
  const search = k.pub ? `<input type="search" aria-label="${esc(t.search)}" placeholder="${esc(t.search)}">` : '';
  const acct = k.pub ? `<a class="acct" href="#">${esc(t.signIn)}</a>` : `<span class="acct">${esc(t.account)} · <a href="#">${esc(t.signOut)}</a></span>`;
  return `<header><a class="logo" href="#">${esc(c.brand)}</a><nav>${nav}</nav>${search}${acct}</header>\n<div class="strip">${F(k.strip[L], c.v)}</div>`;
}

function footer(c, L) {
  const t = T[L];
  return `<footer>${t.links.map((x) => `<a href="#">${esc(x)}</a>`).join('')}<br>© 2026 ${esc(c.brand)}. ${esc(t.footer)} · ${esc(hostOf(c.brand))}</footer>`;
}

function asideOf(c, L, extra) {
  const t = T[L], k = K[c.kind];
  const rel = k.home[L].rows.slice(0, 2).map((r) => `<a href="#">${esc(r[0])}</a>`).join('<br>');
  return `<aside><p>${esc(t.aside[c.asideIx])}</p>${extra || ''}<p><b>${esc(k.home[L].h)}</b><br>${rel}</p><p>${esc(t.aside[2])}</p></aside>`;
}

// A page in the site's own frame: header, strip, main, sidebar, footer. pre/post go before the header / before the footer.
function shell(c, L, mainHtml, o = {}) {
  const layout = o.layout || K[c.kind].layout;
  const body = `${o.pre || ''}${header(c, L, o.minimal)}\n<div class="wrap"><main>\n${mainHtml}\n</main>\n${o.noAside ? '' : asideOf(c, L, o.asideExtra)}</div>\n${o.post || ''}${footer(c, L)}`;
  return doc(L, o.title, c.kind, layout, body);
}

// The intended page (or any normal page of the site): heading, intro, rows (inputs when a form field is empty), buttons.
function pageMain(c, L, spec, id, o = {}) {
  const v = { ...c.v, id }, s = spec[L] || spec;
  const rows = s.rows.map(([label, val]) => `<div class="row"><span>${F(label, v)}</span>${val === '' && spec.form
    ? `<input aria-label="${F(label, v)}">` : `<b>${F(val, v)}</b>`}</div>`).join('\n');
  const btns = (s.b || []).map((b, i) => `<button class="btn${i === 0 ? ' pri' : ''}">${F(b, v)}</button>`).join('');
  const crumb = spec.k === 'home' ? '' : `<div class="crumb">${esc(c.brand)} › ${esc(fill(s.t, v).split(' · ')[0])}</div>`;
  return `${crumb}<h1>${F(s.h, v)}</h1>\n${o.top || ''}<p>${F(s.p, v)}</p>\n${rows}\n${btns}${o.bottom || ''}`;
}
const titleOf = (c, L, spec, id) => fill((spec[L] || spec).t, { ...c.v, id });
const homeSpec = (kind, L) => ({ k: 'home', id: 'none', ...K[kind].home[L] });

function fields(t, names) {
  return names.map((n, i) => `<label>${esc(n)}<input${i === 1 ? ' type="password"' : ''} aria-label="${esc(n)}"></label>`).join('');
}

// Each failure renderer returns { html, h } where h is the text that names the state (checked against the 1,500-char cut).
const FAIL = {
  login_wall: {
    full: (c, L) => { const x = T[L].login.full, v = c.v;
      return { h: fill(x.h, v), html: shell(c, L, `<div class="card"><input type="hidden" name="csrf" value="${hex(24)}"><h1>${F(x.h, v)}</h1><p>${F(x.p, v)}</p>${fields(T[L], x.f)}<button class="btn pri">${esc(x.b)}</button><p><a href="#">${esc(x.l[0])}</a> · <a href="#">${esc(x.l[1])}</a></p></div>`, { title: fill(x.t, v), minimal: true, noAside: true }) }; },
    expired: (c, L, it) => { const x = T[L].login.expired, f = T[L].login.full;
      return { h: x.h, html: shell(c, L, `<h1>${esc(x.h)}</h1><p>${esc(x.p)}</p><div class="card" style="margin:16px 0">${fields(T[L], f.f)}<button class="btn pri">${esc(f.b)}</button></div>`, { title: it.title }) }; },
    gate: (c, L, it) => { const x = T[L].login.gate, v = { ...c.v, thing: c.spec.thing[L] };
      return { h: fill(x.h, v), html: shell(c, L, `<h1>${F(x.h, v)}</h1><p>${F(x.p, v)}</p><a class="btn pri" href="#">${esc(T[L].signIn)}</a><a class="btn" href="#">${esc(T[L].register)}</a>`, { title: it.title }) }; },
    sso: (c, L) => { const x = T[L].login.sso, v = c.v;
      return { h: fill(x.h, v), html: shell(c, L, `<div class="card"><input type="hidden" name="csrf" value="${hex(24)}"><h1>${F(x.h, v)}</h1><p>${F(x.p, v)}</p>${x.b.map((b, i) => `<button class="btn${i === 0 ? ' pri' : ''}" style="display:block;width:100%">${esc(b)}</button>`).join('')}</div>`, { title: fill(x.t, v), minimal: true, noAside: true }) }; },
  },
  bot_challenge: {},
  error_page: {
    nf: (c, L) => { const x = T[L].err.nf, v = c.v, home = homeSpec(c.kind, L);
      const pop = home.rows.map((r) => `<div class="row"><a href="#">${esc(r[0])}</a><span>${esc(r[1])}</span></div>`).join('');
      return { h: x.h, html: shell(c, L, `<p class="big">404</p><h1>${esc(x.h)}</h1><p>${esc(x.p)}</p><a class="btn pri" href="#">${esc(x.l)}</a><h2>${esc(home.h)}</h2>${pop}`, { title: fill(x.t, v) }) }; },
    srv: (c, L) => bare(c, L, T[L].err.srv),
    gw: (c, L) => bare(c, L, T[L].err.gw),
    maint: (c, L) => { const x = T[L].err.maint, v = c.v;
      return { h: x.h, html: shell(c, L, `<div class="card"><h1>${esc(x.h)}</h1><p>${F(x.p, v)}</p></div>`, { title: fill(x.t, v), minimal: true, noAside: true }) }; },
    app: (c, L, it) => { const x = T[L].err.app, v = { ...c.v, ref: `ERR-${hex(8).toUpperCase()}` };
      return { h: x.h, html: shell(c, L, `<h1>${esc(x.h)}</h1><p>${F(x.p, v)}</p><button class="btn pri">${esc(x.b)}</button>`, { title: it.title }) }; },
  },
  blocking_modal: {},
  rate_limited: {},
};

// A bare server page: no site frame at all.
function bare(c, L, x) {
  const body = `<h1>${esc(x.h)}</h1>\n<p>${esc(fill(x.p, c.v))}</p>\n<hr>\n<p>${esc(hostOf(c.brand))} · ${hex(12)}</p>`;
  return { h: x.h, html: `<!doctype html>\n<html lang="${L}"><head><meta charset="utf-8"><title>${esc(fill(x.t, c.v))}</title><style>body{font-family:serif;margin:40px}</style></head>\n<body>\n${body}\n</body></html>\n` };
}

// Bot checks are served by a protection layer in front of the site: no site frame, a neutral card.
function botPage(c, L, x, widget) {
  const v = { ...c.v }, rid = `${T[L].bot.checking.r}: ${hex(16)}`;
  const body = `<div class="card"><h1>${F(x.h, v)}</h1>\n<p>${F(x.p, v)}</p>\n${widget}\n<p style="font-size:12px;color:#777">${esc(rid)}<br>${esc(hostOf(c.brand))}</p></div>`;
  return { h: fill(x.h, v), html: doc(L, fill(x.t, v), c.kind, 'top', body) };
}
Object.assign(FAIL.bot_challenge, {
  checking: (c, L) => botPage(c, L, T[L].bot.checking, '<p style="font-size:28px">· · ·</p>'),
  verify: (c, L) => { const x = T[L].bot.verify; return botPage(c, L, x, `<label><input type="checkbox"> ${esc(x.cb)}</label><br><button class="btn pri">${esc(x.b)}</button>`); },
  puzzle: (c, L) => { const x = T[L].bot.puzzle;
    return botPage(c, L, x, `<div class="tiles">${Array.from({ length: 9 }, (_, i) => `<div>${esc(x.tile)} ${i + 1}</div>`).join('')}</div><button class="btn pri">${esc(x.b)}</button>`); },
  unusual: (c, L) => { const x = T[L].bot.unusual; return botPage(c, L, x, `<button class="btn pri">${esc(x.b)}</button>`); },
  hold: (c, L) => { const x = T[L].bot.hold; return botPage(c, L, x, `<button class="btn pri" style="width:100%;padding:16px">${esc(x.b)}</button>`); },
});

// A blocking overlay over the full intended page. A plain div (no dialog role, no <dialog>), so the Decision is asked.
function overlay(c, L, m) {
  const x = T[L].modal[m], v = c.v;
  const input = m === 'news' ? `<input aria-label="${esc(T[L].login.full.f[0])}" style="width:100%;padding:8px;margin:6px 0">` : '';
  const btns = x.b.map((b, i) => `<button class="btn${i === 0 ? ' pri' : ''}">${F(b, v)}</button>`).join('');
  return { h: fill(x.h, v), html: `<div class="ov"><div class="ovb"><h2>${F(x.h, v)}</h2><p>${F(x.p, v)}</p>${input}${btns}</div></div>\n` };
}
for (const m of ['cookie', 'age', 'region', 'news', 'terms', 'app']) {
  FAIL.blocking_modal[m] = (c, L, it) => {
    const o = overlay(c, L, m);
    const at = c.overlayLast ? { post: o.html } : { pre: o.html };
    return { h: o.h, html: shell(c, L, pageMain(c, L, c.spec, c.id), { title: it.title, ...at }) };
  };
}

for (const r of ['bare', 'search', 'slow', 'quota', 'dl']) {
  FAIL.rate_limited[r] = r === 'bare' ? (c, L) => bare(c, L, T[L].rate.bare) : (c, L, it) => {
    const x = T[L].rate[r];
    const title = c.keepTitle ? it.title : `${x.h} · ${c.brand}`;
    return { h: x.h, html: shell(c, L, `<h1>${esc(x.h)}</h1>\n<p class="note">${esc(x.p)}</p>\n<a class="btn" href="#">${esc(T[L].help)}</a>`, { title }) };
  };
}

// A normal working page that is not the intended one.
FAIL.unexpected_page = {
  twin: (c, L) => { const id = twinOf(c.id), t = titleOf(c, L, c.spec, id);
    return { h: fill(c.spec[L].h, { ...c.v, id }), other: id, html: shell(c, L, pageMain(c, L, c.spec, id), { title: t }) }; },
  sibling: (c, L) => { const sp = c.sibling, id = sp.id === 'none' ? '' : (sp.id === c.spec.id ? c.id : ID[sp.id]());
    return { h: fill(sp[L].h, { ...c.v, id }), html: shell(c, L, pageMain(c, L, sp, id), { title: titleOf(c, L, sp, id) }) }; },
  home: (c, L) => { const sp = homeSpec(c.kind, L);
    return { h: sp.h, html: shell(c, L, pageMain(c, L, sp, ''), { title: fill(sp.t, c.v) }) }; },
  other_site: (c, L) => { const o = { ...c, kind: c.otherKind, brand: c.otherBrand, v: { ...c.v, brand: c.otherBrand, host: hostOf(c.otherBrand) } };
    const L2 = K[o.kind].nav[L] ? L : 'en', sp = homeSpec(o.kind, L2);
    return { h: sp.h, html: shell(o, L2, pageMain(o, L2, sp, ''), { title: fill(sp.t, o.v) }) }; },
};

const FIELD_ERR = { en: 'Check the highlighted field: {f} is required.', uk: 'Перевірте виділене поле: «{f}» — обовʼязкове.', de: 'Bitte prüfen Sie das markierte Feld: „{f}“ ist erforderlich.',
  es: 'Revisa el campo marcado: «{f}» es obligatorio.', pl: 'Sprawdź zaznaczone pole: „{f}” jest wymagane.' };
// The intended page, plain or with a fair decoy that must not move the answer.
function expectedPage(c, L, variant, it) {
  const t = T[L], main = (o) => pageMain(c, L, c.spec, c.id, o);
  switch (variant) {
    case 'decoy': return shell(c, L, main(), { title: it.title, asideExtra: `<p><b>${esc(t.help)}</b><br>${esc(t.decoy[c.decoyKey])}</p>` });
    case 'cookie_bar': return shell(c, L, main(), { title: it.title, post: `<div class="bar">${esc(t.cookieBar)} <button class="btn">${esc(t.ok)}</button></div>\n` });
    case 'toast': return shell(c, L, main(), { title: it.title, post: `<div class="toast" role="status">${esc(t.saved)}</div>\n` });
    case 'field_error': { // names the form's own first empty field
      const rows = c.spec[L].rows, f = (rows.find((r) => r[1] === '') || rows[0])[0];
      return shell(c, L, main({ top: `<p class="err" role="alert">${esc(fill(FIELD_ERR[L], { f }))}</p>\n` }), { title: it.title }); }
    case 'layout': return shell(c, L, main(), { title: it.title, layout: K[c.kind].layout === 'side' ? 'top' : 'side' });
    default: return shell(c, L, main(), { title: it.title });
  }
}

// ---- N4p: the page text is the same for every item of a base; the state is only drawn in a canvas.
function sceneOf(c, L, state) {
  const t = T[L], v = { ...c.v, id: c.id }, s = c.spec[L];
  const page = (sp, id) => { const x = sp[L] || sp, w = { ...c.v, id };
    return [['bar', `${c.brand}    ${K[c.kind].nav[L].join('   ')}`], ['h', fill(x.h, w)], ['p', fill(x.p, w)],
      ...x.rows.map(([a, b]) => ['row', fill(a, w), fill(b, w) || '________']), ...(x.b || []).slice(0, 2).map((b) => ['btn', fill(b, w)])]; };
  switch (state) {
    case 'expected': return page(c.spec, c.id);
    case 'login_wall': { const x = t.login.full; return [['bar', c.brand], ['h', fill(x.h, v)], ['p', x.p], ['input', x.f[0]], ['input', x.f[1]], ['btn', x.b]]; }
    case 'bot_challenge': { const x = t.bot.verify; return [['h', x.h], ['p', fill(x.p, v)], ['check', x.cb], ['btn', x.b], ['p', `${t.bot.checking.r}: ${hex(16)}`]]; }
    case 'error_page': { const x = t.err.nf; return [['bar', c.brand], ['big', '404'], ['h', x.h], ['p', x.p], ['btn', x.l]]; }
    case 'blocking_modal': { const x = t.modal.cookie; return [...page(c.spec, c.id), ['dim'], ['h', x.h], ['p', fill(x.p, v)], ...x.b.map((b) => ['btn', b])]; }
    case 'rate_limited': { const x = t.rate.bare; return [['bar', c.brand], ['big', '429'], ['h', x.h], ['p', x.p]]; }
    case 'unexpected_page': return c.spec.id !== 'none' ? page(c.spec, twinOf(c.id)) : page(homeSpec(c.kind, L), '');
  }
  throw new Error(state + s);
}

const DRAW = `const g=document.getElementById('v').getContext('2d'),A=document.body.dataset.a;let y=40,X=40,W=900;`
  + `g.fillStyle='#fff';g.fillRect(0,0,1000,680);function f(z,b){g.font=(b?'bold ':'')+z+'px sans-serif'}`
  + `function wrap(t,lh){let l='';for(const w of t.split(' ')){const n=l?l+' '+w:w;if(g.measureText(n).width>W&&l){g.fillText(l,X,y);y+=lh;l=w}else l=n}g.fillText(l,X,y);y+=lh}`
  + `for(const[k,s,u]of S){g.fillStyle='#1d1d1f';if(k==='bar'){g.fillStyle=A;g.fillRect(0,0,1000,48);g.fillStyle='#fff';f(17,1);g.fillText(s,20,30);y=96}`
  + `else if(k==='h'){f(28,1);wrap(s,36);y+=4}else if(k==='p'){f(16);wrap(s,24);y+=8}else if(k==='big'){f(72,1);g.fillStyle=A;g.fillText(s,X,y+50);y+=96}`
  + `else if(k==='row'){f(15);g.fillText(s,X,y);g.fillText(u,X+W*0.6,y);g.fillStyle='#ddd';g.fillRect(X,y+10,W,1);y+=34}`
  + `else if(k==='input'){f(14);g.fillText(s,X,y);g.strokeStyle='#999';g.strokeRect(X,y+8,Math.min(W,420),34);y+=64}`
  + `else if(k==='check'){g.strokeStyle='#555';g.strokeRect(X,y-16,22,22);f(16);g.fillText(s,X+34,y);y+=40}`
  + `else if(k==='btn'){f(15,1);const w=g.measureText(s).width+32;g.fillStyle=A;g.fillRect(X,y-6,w,36);g.fillStyle='#fff';g.fillText(s,X+16,y+17);y+=48}`
  + `else if(k==='dim'){g.fillStyle='rgba(20,20,20,.62)';g.fillRect(0,0,1000,680);g.fillStyle='#fff';g.fillRect(220,150,560,400);X=250;W=500;y=200}}`;

function pixelPage(c, L, tpl, scene) {
  const t = T[L], a = K[c.kind].accent;
  const chrome = tpl === 'pixel_viewer'
    ? `<div style="display:flex;gap:14px;padding:8px 16px;background:#2b2b2b;color:#eee;font:14px sans-serif"><b>${esc(c.brand)}</b>${t.pixel.tools.map((x) => `<span>${esc(x)}</span>`).join('')}<span style="margin-left:auto">${esc(t.pixel.page)}</span></div>`
    : '';
  const body = `${chrome}\n<canvas id="v" width="1000" height="680" style="display:block;margin:${chrome ? '16px auto' : '0 auto'};box-shadow:0 1px 6px #0003"></canvas>\n`
    + `<script>const S=${JSON.stringify(scene).replace(/</g, '\\u003c')};${DRAW}</script>`;
  return `<!doctype html>\n<html lang="${L}"><head><meta charset="utf-8"><title>${esc(c.brand)}</title><style>body{margin:0;background:${tpl === 'pixel_viewer' ? '#444' : '#eef0f3'}}</style></head>\n<body data-a="${a}" data-build="${hex(12)}">\n${body}\n</body></html>\n`;
}

// ================================ plan ================================
const FAILS = STATES.slice(1);
const LANG_NAME = { en: 'English', uk: 'Ukrainian', de: 'German', es: 'Spanish', pl: 'Polish' };
const VARIANTS = {
  login_wall: ['full', 'expired', 'gate', 'sso'], bot_challenge: ['checking', 'verify', 'puzzle', 'unusual', 'hold'],
  error_page: ['nf', 'app', 'srv', 'maint', 'gw'], blocking_modal: null, rate_limited: null, unexpected_page: null,
};
const EXP_VARIANTS = ['plain', 'paraphrase', 'decoy', 'cookie_bar', 'toast', 'layout'];
const DECOY_KEYS = ['error_page', 'rate_limited', 'bot_challenge', 'login_wall'];
const counters = {};
const next = (key, list) => { counters[key] = (counters[key] ?? -1) + 1; return list[counters[key] % list.length]; };
const variantsFor = (state, c) => {
  if (state === 'blocking_modal') return K[c.kind].modals;
  if (state === 'rate_limited') return K[c.kind].rates;
  if (state === 'unexpected_page') return c.spec.id !== 'none' ? ['twin', 'sibling', 'home', 'other_site'] : ['sibling', 'home', 'other_site'];
  return VARIANTS[state];
};

// Pairs of failure states, so every base holds exactly 2 danger-eligible items of two different states.
function pairs(times, extra = []) {
  const all = [];
  for (let i = 0; i < FAILS.length; i++) for (let j = i + 1; j < FAILS.length; j++) all.push([FAILS[i], FAILS[j]]);
  const out = [];
  for (let n = 0; n < times; n++) out.push(...all);
  return shuffle([...out, ...extra]);
}

function context(kind, L, n, spec) {
  const k = K[kind], brand = pick(k.brands);
  const id = ID[spec.id]();
  const others = KINDS.filter((x) => x !== kind && (L === 'en' || K[x].l2 === L));
  const otherKind = pick(others.length ? others : KINDS.filter((x) => x !== kind));
  return {
    kind, brand, spec, id, n, v: { brand, host: hostOf(brand), ver: ID.ver(), id },
    navIx: int(1, 4), asideIx: int(0, 1), sibling: pick(k.specs.filter((s) => s !== spec)),
    otherKind, otherBrand: pick(K[otherKind].brands), decoyKey: next('decoy', DECOY_KEYS),
    overlayLast: rnd() < 0.5, keepTitle: rnd() < 0.5,
  };
}

// ================================ why ================================
const DECOY_TOPIC = { error_page: 'error codes', rate_limited: 'usage limits', bot_challenge: 'CAPTCHA checks', login_wall: 'session length' };
const MODAL_KIND = { cookie: 'a cookie-consent wall', age: 'an age gate', region: 'a country chooser', news: 'a newsletter wall', terms: 'an updated-terms gate', app: 'an open-in-app interstitial' };
function whyOf(state, variant, c, L, r, expect) {
  const h = `"${r.h}"`;
  const tr = L === 'en' ? '' : ` The page is in ${LANG_NAME[L]}, the expectation in English.`;
  const W = {
    expected: {
      plain: `It shows ${h}, the intended page (${expect}), and nothing covers it.`,
      paraphrase: `It shows ${h}, the intended page; the expectation only words it differently.`,
      decoy: `It is the intended page ${h}; the sidebar help note about ${DECOY_TOPIC[c.decoyKey]} is general advice, not the page's state.`,
      cookie_bar: `It is the intended page ${h}; the cookie bar at the bottom says browsing can go on, so nothing blocks it.`,
      toast: `It is the intended page ${h}; the "${T[L].saved}" toast is a status message, not a failure.`,
      field_error: `It is the intended form ${h}; the inline message only asks to fix one field, the page itself works.`,
      layout: `It is the intended page ${h}, only in a different layout (the sidebar moved).`,
    },
    login_wall: {
      full: `A sign-in form (${h}) with e-mail and password replaces ${expect}: a login wall.`,
      expired: `The site frame and the tab title still name the intended page, but the content says ${h} and asks for e-mail and password: a login wall.`,
      gate: `The content area only says ${h} with Sign in and Register buttons; none of the intended content is shown: a login wall.`,
      sso: `A sign-in method chooser (${h}) is shown instead of ${expect}: a login wall.`,
    },
    bot_challenge: {
      checking: `A browser-check page (${h}) with a request id replaces the site: a bot challenge.`,
      verify: `A "verify you are human" check with a robot checkbox replaces the site: a bot challenge.`,
      puzzle: `An image-selection CAPTCHA (${h}) replaces the site: a bot challenge.`,
      unusual: `An "unusual traffic" page asks to confirm the visitor is not a robot: a bot challenge.`,
      hold: `A press-and-hold human check (${h}) replaces the site: a bot challenge.`,
    },
    error_page: {
      nf: `A 404 page (${h}) inside the site frame, with suggested links, instead of ${expect}: an error page.`,
      app: `The tab title still names the intended page, but the content is replaced by ${h} with an error reference and Try again: an app error page.`,
      srv: `A bare 500 Internal Server Error page with no site content: an error page.`,
      maint: `A maintenance page (${h}) instead of any content: an error page.`,
      gw: `A bare 502 Bad Gateway page with no site content: an error page.`,
    },
    blocking_modal: `The intended page is underneath, but a full-screen overlay ${h} (${MODAL_KIND[variant]}) must be answered first; it is a plain div with no dialog role.`,
    rate_limited: variant === 'bare' ? `A bare "429 Too Many Requests" page: rate limited.`
      : `The content area says ${h}, a usage-limit message, instead of the intended page: rate limited.`,
    unexpected_page: {
      twin: `It is a working page for ${r.other}, not ${c.id} as expected: a different item.`,
      sibling: `It is a working page of the same site, ${h}, but not ${expect}.`,
      home: `It is the site's home page (${h}), not ${expect}.`,
      other_site: `It is the home page of a different site, ${c.otherBrand} (${h}), not ${expect}.`,
    },
  };
  const w = W[state];
  return (typeof w === 'string' ? w : w[variant]) + tr;
}
const PIXEL_DESC = {
  expected: 'the intended page itself', login_wall: 'a sign-in form', bot_challenge: 'a "verify you are human" check',
  error_page: 'a 404 page', blocking_modal: 'the page under a full-screen cookie wall', rate_limited: 'a 429 Too Many Requests page',
  unexpected_page: 'a different item or the home page',
};

// ================================ build ================================
const CUT = 1450; // refsure sends visible_text cut to 1,500 characters; the evidence must sit inside it with margin.
function approxText(html) {
  return html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
const seen = new Set();
const USED = {};
const items = [];
function evidenceOk(html, ev) { const i = approxText(html).indexOf(ev.replace(/\s+/g, ' ').trim()); return i >= 0 && i + ev.length <= CUT; }

const bytes = new Set();
function push(it, html, sig) {
  if (seen.has(sig) || bytes.has(html)) return false;
  seen.add(sig); bytes.add(html); items.push({ ...it, html }); return true;
}

function textBase(n, kind, L, pair) {
  const spec = next(`spec:${kind}`, K[kind].specs), base = `b${String(n).padStart(3, '0')}`;
  // Re-roll brand, ids and frame details until the expected page is unlike every page so far.
  let c, ev, expect0, h0, html0, title, sig;
  for (let t = 0; ; t++) {
    if (t > 40) throw new Error(`${base}: no unique expected page`);
    c = context(kind, L, n, spec); title = titleOf(c, L, spec, c.id);
    if (t === 0) ev = spec.form && next('form', [true, false]) ? 'field_error' : next('exp', EXP_VARIANTS);
    expect0 = fill(spec.exp[ev === 'paraphrase' ? 1 : 0], { id: c.id }); h0 = fill(spec[L].h, { ...c.v, id: c.id });
    html0 = expectedPage(c, L, ev, { title }); sig = approxText(html0) + title + expect0;
    if (!seen.has(sig)) break;
  }
  const common = { site: 'page-state', slice: 'N4', states: 'research', masks: ['on'], lang: L, source: 'synthetic', base, template: kind, alt: [] };
  const tr = L === 'en' ? '' : '+translated';
  const ex = (i) => fill(spec.exp[i], { id: c.id });
  if (!evidenceOk(html0, h0)) throw new Error(`${base} expected: heading past the cut`);
  const codes = ['retry', 'audit'].includes(spec.k) ? '+codes_in_content' : ''; // the content itself lists HTTP error codes
  if (!push({ ...common, expect: expect0, condition: `expected/${ev}${codes}${tr}`, variant: ev, gold: 'expected', danger_eligible: false, visual_only: false,
    why: whyOf('expected', ev, c, L, { h: h0 }, expect0) }, html0, sig)) throw new Error(`${base}: duplicate expected page`);
  // two failure states
  pair.forEach((state, j) => {
    // Least-used variant of this state first, so variants spread evenly although kinds offer different lists.
    const used = (USED[state] ??= {}), list = shuffle([...new Set(variantsFor(state, c))]).sort((a, b) => (used[a] ?? 0) - (used[b] ?? 0));
    const expect = ex((n + j) % 2);
    for (let t = 0; t < list.length; t++) {
      const variant = list[t];
      let r = FAIL[state][variant](c, L, { title });
      if (state === 'blocking_modal' && !evidenceOk(r.html, r.h)) { c.overlayLast = false; r = FAIL[state][variant](c, L, { title }); }
      if (!evidenceOk(r.html, r.other || r.h)) throw new Error(`${base} ${state}/${variant}: evidence past the cut`);
      const query = state === 'login_wall' && rnd() < 0.67 ? `?return_to=${encodeURIComponent(`/${spec.k}${c.id ? `/${c.id}` : ''}`)}` : undefined;
      const it = { ...common, expect, condition: `${state}/${variant}${tr}`, variant, gold: state, danger_eligible: true, visual_only: false,
        why: whyOf(state, variant, c, L, r, expect), ...(query ? { query } : {}) };
      if (push(it, r.html, approxText(r.html) + expect + (query || ''))) { used[variant] = (used[variant] ?? 0) + 1; return; }
    }
    throw new Error(`${base} ${state}: no unique variant left`);
  });
}

function pixelBase(n, kind, L, pair, tpl) {
  const c = context(kind, L, n, next(`pspec:${kind}`, K[kind].specs)), base = `p${String(n).padStart(3, '0')}`, expect = fill(c.spec.exp[0], { id: c.id });
  const common = { site: 'page-state', slice: 'N4p', states: 'research', masks: ['on'], lang: L, source: 'synthetic', base, template: tpl, expect, alt: [] };
  const shown = tpl === 'pixel_viewer' ? 'a viewer toolbar' : 'nothing (the whole app is a canvas)';
  ['expected', ...pair].forEach((state) => {
    const html = pixelPage(c, L, tpl, sceneOf(c, L, state));
    const ok = push({ ...common, condition: `pixel/${state}`, variant: tpl, gold: state, danger_eligible: state !== 'expected', visual_only: true,
      why: `Pixel only: the page text is ${shown}, the same for every page of this base; the canvas draws ${PIXEL_DESC[state]}${state === 'expected' ? ` (${expect})` : ''}.` }, html, html);
    if (!ok) throw new Error(`${base}: duplicate pixel page`);
  });
}

// ================================ main ================================
const textPairs = pairs(12); // 15 pairs x 12 = 180 bases; each failure state 60 times
textPairs.forEach((pair, i) => {
  const kind = KINDS[i % KINDS.length];
  textBase(i + 1, kind, next(`lang:${kind}`, ['en', 'en', K[kind].l2]), pair);
});
// N4p: 20 bases; 15 pairs plus 5 so the 40 failures split 7/7/7/7/6/6.
const pixelPairs = pairs(1, [['login_wall', 'bot_challenge'], ['error_page', 'blocking_modal'], ['login_wall', 'error_page'], ['bot_challenge', 'blocking_modal'], ['rate_limited', 'unexpected_page']]);
pixelPairs.forEach((pair, i) => {
  const kind = KINDS[(i * 3) % KINDS.length];
  pixelBase(i + 1, kind, i % 4 === 3 ? K[kind].l2 : 'en', pair, i % 2 ? 'pixel_viewer' : 'pixel_canvas_app');
});

const order = shuffle(items);
if (existsSync(join(SETS, 'n4'))) rmSync(join(SETS, 'n4'), { recursive: true });
mkdirSync(PAGES, { recursive: true });
const lines = order.map((it, i) => {
  const nnn = String(i + 1).padStart(3, '0');
  writeFileSync(join(PAGES, `${nnn}.html`), it.html);
  const { html, site, slice, states, expect, masks, query, ...rest } = it;
  return JSON.stringify({ id: `n4-${nnn}`, page: `pages/${nnn}.html`, site, slice, states, expect, input: { expect, states }, masks,
    ...(query ? { query } : {}), ...rest });
});
writeFileSync(OUT, lines.join('\n') + '\n');
const tally = {};
for (const it of order) tally[`${it.slice} ${it.gold}`] = (tally[`${it.slice} ${it.gold}`] || 0) + 1;
process.stderr.write(`${order.length} items, ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(', ')}\n`);
