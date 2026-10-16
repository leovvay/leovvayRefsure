// Template docs-portal: a developer documentation page with doc search and a "Was this page helpful?" form.
// Categories: results (doc search), confirmation (feedback sent), error (feedback refused), greeting.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { nearRef, people, refDigits } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Fernhook Docs', 'Lumen API Reference', 'Tidepool Developer Hub'], nav: ['Guides', 'API reference', 'SDKs', 'Changelog'],
    users: [['Iris', 'Iris Novak'], ['Leo', 'Leo Brandt'], ['Maya', 'Maya Osei'], ['Noah', 'Noah Pell']],
    h: 'Paginating list endpoints', crumbs: ['Guides', 'Working with lists'], toc: ['Overview', 'Cursor parameters', 'Page size', 'Ordering'],
    p1: 'List endpoints return at most 100 objects per page. Pass the cursor from the previous response to fetch the next page.',
    p2: 'Objects are ordered by creation time, newest first, unless you set the order parameter.', code: 'GET /v2/invoices?limit=50&cursor=eyJpZCI6IDQwfQ',
    fb: 'Was this page helpful?', fbText: 'The cursor example helped, thanks.', send: 'Send feedback', search: 'Search docs', ph: 'Search the documentation',
    ok: 'Feedback {r} sent. Thank you!', neg: 'Your feedback was not sent.', pending: 'Sending your feedback…', mention: 'After you send feedback, a confirmation with its number appears here.',
    e1: 'Feedback not sent: the comment is longer than 500 characters.', e2: 'Feedback not sent: please choose Yes or No first.',
    clear: 'Your comment is within the limits. No problems found.', checking: 'Checking your comment…', emention: 'If your feedback cannot be sent, the reason appears below the box.',
    errSpec: 'an error saying the comment is longer than 500 characters',
    q: ['webhooks', 'rate limits', 'idempotency'], rows: { webhooks: ['Webhooks: receiving events', 'Verifying webhook signatures', 'Retrying failed webhooks'], 'rate limits': ['Rate limits and quotas', 'Handling 429 responses'], idempotency: ['Idempotent requests', 'Idempotency keys in the SDKs', 'Replaying a request safely'] },
  },
  uk: {
    brands: ['Документація Ліхтар', 'Довідник API Папороть', 'Портал розробника Хвиля'], nav: ['Посібники', 'Довідник API', 'SDK', 'Журнал змін'],
    users: [['Марта', 'Марта Гнатюк', 'Марто'], ['Олег', 'Олег Бондар', 'Олеже'], ['Софія', 'Софія Литвин', 'Софіє'], ['Юрій', 'Юрій Пасічник', 'Юрію']],
    h: 'Посторінкове отримання списків', crumbs: ['Посібники', 'Робота зі списками'], toc: ['Огляд', 'Параметри курсора', 'Розмір сторінки', 'Порядок'],
    p1: 'Ендпоінти списків повертають не більше 100 об’єктів на сторінку. Щоб отримати наступну сторінку, передайте курсор із попередньої відповіді.',
    p2: 'Записи впорядковано за часом створення, від нових до старих, якщо не задано параметр order.', code: 'GET /v2/invoices?limit=50&cursor=eyJpZCI6IDQwfQ',
    fb: 'Чи була ця сторінка корисною?', fbText: 'Приклад із курсором допоміг, дякую.', send: 'Надіслати відгук', search: 'Пошук у документації', ph: 'Шукати в документації',
    ok: 'Відгук {r} надіслано. Дякуємо!', neg: 'Ваш відгук не надіслано.', pending: 'Надсилаємо відгук…', mention: 'Після надсилання тут з’явиться підтвердження з номером відгуку.',
    e1: 'Відгук не надіслано: коментар довший за 500 символів.', e2: 'Відгук не надіслано: спершу оберіть «Так» або «Ні».',
    clear: 'Коментар у межах ліміту. Проблем не виявлено.', checking: 'Перевіряємо коментар…', emention: 'Якщо відгук не вдасться надіслати, причину буде показано під полем.',
    errSpec: 'an error saying the comment is longer than 500 characters',
    q: ['вебхуки', 'ліміти запитів', 'ідемпотентність'], rows: { 'вебхуки': ['Вебхуки: отримання подій', 'Перевірка підписів вебхуків', 'Повторна доставка вебхуків'], 'ліміти запитів': ['Ліміти запитів і квоти', 'Обробка відповідей 429'], 'ідемпотентність': ['Ідемпотентні запити', 'Ключі ідемпотентності в SDK', 'Безпечне повторення запиту'] },
  },
};

export const docsPortal = {
  id: 'docs-portal', kind: 'docs', langs: ['en', 'uk'], cats: ['results', 'confirmation', 'error', 'greeting'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const r = `FB-${refDigits(rng, 5)}`;
    const near = nearRef(rng, r);
    const [q, q2] = rng.shuffle(Object.keys(v.rows));
    return {
      kind: 'docs', brand, title: `${v.h} · ${brand}`, at: '/guides/pagination', host: 'docs', nav: v.nav, slug: 'docs', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        return `<p><input type="search" value="" placeholder="${esc(v.ph)}"></p>${slot}<h1>${esc(v.h)}</h1><p>${esc(v.p1)}</p><pre><code>${esc(v.code)}</code></pre><p>${esc(v.p2)}</p>
<div class="card"><h2>${esc(v.fb)}</h2>${ui.input('', v.fbText, { area: true })}<p>${ui.btn(v.send, { pri: true })}</p></div>`;
      },
      aside(ui) { return box(lang === 'en' ? 'On this page' : 'На цій сторінці', list(v.toc.map((x) => ui.a(x, '#')))); },
      cats: {
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
        confirmation: { ok: v.ok.replace('{r}', r), wrong: v.ok.replace('{r}', near), neg: v.neg, pending: v.pending, mention: v.mention, spec: `a confirmation that feedback ${r} was sent` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
      },
    };
  },
};
