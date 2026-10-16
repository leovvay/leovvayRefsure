// Template support-request: a help centre's "Contact support" form with a help-article search. Categories:
// confirmation (request created), error (request refused), results (article search), greeting.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { nearRef, people, refDigits } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Kettlewise Help Centre', 'Brightloom Support', 'Pinecall Help'], nav: ['Help centre', 'Community', 'Status', 'My requests'],
    users: [['Elena', 'Elena Moss'], ['Frank', 'Frank Ibsen'], ['Hana', 'Hana Ruiz'], ['Owen', 'Owen Tull']],
    h: 'Contact support', crumbs: ['Help centre', 'Contact support'], topic: 'Topic', topics: ['Billing', 'Delivery', 'Account access', 'Something else'], desc: 'Describe the problem',
    text: 'The kettle base light blinks twice and the kettle does not heat.', attach: 'Add attachment', submit: 'Submit request', hours: 'Our team replies within one working day, Monday to Friday.',
    search: 'Search help articles', ph: 'Describe your question', side: ['Popular topics', 'Track a delivery', 'Reset your password', 'Warranty and repairs'],
    ok: 'Request #{r} created', neg: 'Request #{r} was not created.', pending: 'Submitting your request…', mention: 'Once you submit, your request number will be confirmed here.',
    e1: 'Request not sent: the attachment type .heic is not supported.', e2: 'Request not sent: please choose a topic.',
    clear: 'Your request is complete. No problems found.', checking: 'Checking your request…', emention: 'If something is missing from your request, it is pointed out here.',
    errSpec: 'an error saying the .heic attachment type is not supported',
    q: ['descaling', 'warranty', 'refund'], rows: { descaling: ['How to descale your kettle', 'Descaling tablets: which ones are safe?', 'White marks after descaling'], warranty: ['What the 2-year warranty covers', 'Registering a product for warranty'], refund: ['How long does a refund take?', 'Refunds for orders paid in instalments', 'Refund to an expired card'] },
  },
  uk: {
    brands: ['Центр допомоги Чайничок', 'Підтримка Світлиця', 'Довідка Смерічка'], nav: ['Центр допомоги', 'Спільнота', 'Стан сервісу', 'Мої звернення'],
    users: [['Олена', 'Олена Мосенко', 'Олено'], ['Федір', 'Федір Ігнатенко', 'Федоре'], ['Ганна', 'Ганна Руденко', 'Ганно'], ['Остап', 'Остап Тулій', 'Остапе']],
    h: 'Звернутися до підтримки', crumbs: ['Центр допомоги', 'Звернення'], topic: 'Тема', topics: ['Оплата', 'Доставка', 'Доступ до акаунта', 'Інше'], desc: 'Опишіть проблему',
    text: 'Індикатор на підставці двічі блимає, і чайник не гріє.', attach: 'Додати вкладення', submit: 'Надіслати звернення', hours: 'Відповідаємо протягом одного робочого дня, з понеділка по п’ятницю.',
    search: 'Пошук статей довідки', ph: 'Опишіть ваше питання', side: ['Популярні теми', 'Відстежити доставку', 'Скинути пароль', 'Гарантія та ремонт'],
    ok: 'Звернення №{r} створено', neg: 'Звернення №{r} не створено.', pending: 'Надсилаємо звернення…', mention: 'Після надсилання тут з’явиться підтвердження з номером звернення.',
    e1: 'Звернення не надіслано: тип вкладення .heic не підтримується.', e2: 'Звернення не надіслано: оберіть тему.',
    clear: 'Звернення заповнено повністю. Проблем не виявлено.', checking: 'Перевіряємо звернення…', emention: 'Якщо у зверненні чогось бракує, це буде вказано тут.',
    errSpec: 'an error saying the .heic attachment type is not supported',
    q: ['накип', 'гарантія', 'повернення коштів'], rows: { 'накип': ['Як очистити чайник від накипу', 'Таблетки від накипу: які безпечні?', 'Білі плями після чищення від накипу'], 'гарантія': ['Що покриває гарантія на 2 роки', 'Як зареєструвати виріб для гарантії'], 'повернення коштів': ['Скільки триває повернення коштів?', 'Повернення коштів за замовлення в розстрочку', 'Повернення коштів на прострочену картку'] },
  },
};

export const supportRequest = {
  id: 'support-request', kind: 'support', langs: ['en', 'uk'], cats: ['confirmation', 'results', 'error', 'greeting'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const r = refDigits(rng, 6);
    const near = nearRef(rng, r);
    const [q, q2] = rng.shuffle(Object.keys(v.rows));
    return {
      kind: 'support', brand, title: `${v.h} · ${brand}`, at: '/help/contact', host: 'help', nav: v.nav, slug: 'help', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        return `<div class="card"><h2>${esc(v.search)}</h2><input type="search" value="" placeholder="${esc(v.ph)}"></div>${slot}<h1>${esc(v.h)}</h1>${ui.select(v.topic, v.topics, v.topics[1])}
${ui.input(v.desc, v.text, { area: true })}<p>${ui.btn(v.attach)} ${ui.btn(v.submit, { pri: true })}</p><p class="muted">${esc(v.hours)}</p>`;
      },
      aside(ui) { return box(v.side[0], list(v.side.slice(1).map((x) => ui.a(x, '/help')))); },
      cats: {
        confirmation: { ok: v.ok.replace('{r}', r), wrong: v.ok.replace('{r}', near), neg: v.neg.replace('{r}', r), pending: v.pending, mention: v.mention, spec: `a confirmation that request #${r} was created` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
      },
    };
  },
};
