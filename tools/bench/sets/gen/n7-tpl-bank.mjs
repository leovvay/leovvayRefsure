// Template bank-payments: an online banking payments page. Categories: greeting, confirmation (transfer sent),
// error (transfer refused), results (transaction search). No transaction list appears outside the slot.
import { esc } from './n5-lib.mjs';
import { box } from './n5-shell.mjs';
import { nearRef, people, refCode } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Harbourline Bank', 'Northgate Savings', 'Kestrel Mutual'], nav: ['Accounts', 'Payments', 'Cards', 'Savings', 'Help'],
    users: [['Helen', 'Helen Varga'], ['Marcus', 'Marcus Lyle'], ['Nadia', 'Nadia Orr'], ['Samuel', 'Samuel Pike']],
    h: 'Payments', crumbs: ['Payments', 'Transfers'], acc: ['Everyday account ••4417', 'Bills account ••0932', 'Rainy-day saver ••7781'],
    from: 'From account', search: 'Search transactions', ph: 'payee, reference or amount', go: 'Search', newT: 'New transfer', standing: 'Standing orders', limits: 'Daily transfer limit applies to new payees.',
    side: ['Security', 'We will never ask for your full PIN.', 'Report a lost card'],
    ok: 'Transfer {r} sent', neg: 'Transfer {r} was not sent. No money has left your account.',
    pending: 'Sending your transfer… this can take up to a minute.', mention: 'A confirmation with the transfer reference will appear here once the bank accepts it.',
    e1: 'Transfer refused: the payee’s account number is not valid.', e2: 'Transfer refused: it exceeds your daily limit for new payees.',
    clear: 'Payee details checked. Everything is in order.', checking: 'Checking the payee’s details…', emention: 'If a transfer cannot be made, the reason is shown here.',
    q: ['rent', 'electricity', 'gym'], rows: { rent: ['Rent, Elm Court lettings, 1 Oct', 'Rent, Elm Court lettings, 1 Sep', 'Rent, Elm Court lettings, 1 Aug'], electricity: ['Electricity, Brightwatt Energy, 28 Sep', 'Electricity, Brightwatt Energy, 29 Aug'], gym: ['Gym membership, Ironvale Fitness, 15 Sep', 'Gym membership, Ironvale Fitness, 15 Aug', 'Gym day pass, Ironvale Fitness, 3 Aug'] },
  },
  uk: {
    brands: ['Банк Карпатський Двір', 'Ощадна Гавань', 'Банк Сокіл'], nav: ['Рахунки', 'Платежі', 'Картки', 'Заощадження', 'Допомога'],
    users: [['Ірина', 'Ірина Коваль', 'Ірино'], ['Тарас', 'Тарас Мельничук', 'Тарасе'], ['Оксана', 'Оксана Гребінь', 'Оксано'], ['Андрій', 'Андрій Ткач', 'Андрію']],
    h: 'Платежі', crumbs: ['Платежі', 'Перекази'], acc: ['Поточний рахунок ••4417', 'Рахунок для комунальних ••0932', 'Скарбничка ••7781'],
    from: 'З рахунку', search: 'Пошук операцій', ph: 'отримувач, призначення або сума', go: 'Знайти', newT: 'Новий переказ', standing: 'Регулярні платежі', limits: 'Для нових отримувачів діє добовий ліміт переказів.',
    side: ['Безпека', 'Ми ніколи не просимо ваш PIN-код повністю.', 'Повідомити про втрату картки'],
    ok: 'Переказ {r} надіслано', neg: 'Переказ {r} не надіслано. Кошти не списано з рахунку.',
    pending: 'Надсилаємо переказ… це може тривати до хвилини.', mention: 'Підтвердження з номером переказу з’явиться тут, щойно банк його прийме.',
    e1: 'Переказ відхилено: номер рахунку отримувача недійсний.', e2: 'Переказ відхилено: перевищено добовий ліміт для нових отримувачів.',
    clear: 'Дані отримувача перевірено. Усе гаразд.', checking: 'Перевіряємо дані отримувача…', emention: 'Якщо переказ неможливий, причину буде показано тут.',
    q: ['оренда', 'світло', 'спортзал'], rows: { 'оренда': ['Оренда, ОСББ Липова 12, 1 жовт.', 'Оренда, ОСББ Липова 12, 1 вер.', 'Оренда, ОСББ Липова 12, 1 серп.'], 'світло': ['Світло, Світлосвіт, 28 вер.', 'Світло, Світлосвіт, 29 серп.'], 'спортзал': ['Абонемент, спортзал «Залізо», 15 вер.', 'Абонемент, спортзал «Залізо», 15 серп.', 'Разове відвідування, спортзал «Залізо», 3 серп.'] },
  },
};

export const bankPayments = {
  id: 'bank-payments', kind: 'bank', langs: ['en', 'uk'], cats: ['greeting', 'confirmation', 'error', 'results'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const r = `TR-${refCode(rng, 6)}`;
    const near = nearRef(rng, r);
    const [q, q2] = rng.shuffle(v.q);
    return {
      kind: 'bank', brand, title: `${v.h} · ${brand}`, at: '/payments', host: 'bank', nav: v.nav, slug: 'online', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        const accs = v.acc.map((a) => `<option>${esc(a)}</option>`).join('');
        return `<h1>${esc(v.h)}</h1>${slot}<div class="cols"><div><h2>${esc(v.newT)}</h2><label>${esc(v.from)}</label><select>${accs}</select><p>${ui.btn(v.newT, { pri: true })}</p></div>
<div><h2>${esc(v.search)}</h2><input type="search" value="" placeholder="${esc(v.ph)}"><p>${ui.btn(v.go)}</p></div></div><p>${ui.a(v.standing, '/payments/standing')}</p><p class="muted">${esc(v.limits)}</p>`;
      },
      aside(ui) { return box(v.side[0], `<p>${esc(v.side[1])}</p><p>${ui.a(v.side[2], '/cards/lost')}</p>`); },
      cats: {
        confirmation: { ok: v.ok.replace('{r}', r), wrong: v.ok.replace('{r}', near), neg: v.neg.replace('{r}', r), pending: v.pending, mention: v.mention, spec: `a confirmation that transfer ${r} was sent` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: 'an error saying the payee’s account number is not valid' },
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
      },
    };
  },
};
