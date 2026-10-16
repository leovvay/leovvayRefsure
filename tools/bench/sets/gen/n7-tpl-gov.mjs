// Template gov-application: a public-services portal page for a parking permit application. Categories:
// confirmation (application received), error (form problem), results (service office search), greeting.
import { esc } from './n5-lib.mjs';
import { box } from './n5-shell.mjs';
import { nearRef, people, refDigits } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Eastmoor District Services', 'Lowfield Council Online', 'Brackenridge Public Portal'], nav: ['Services', 'Permits', 'Waste', 'Council tax', 'Contact'],
    users: [['Joanna', 'Joanna Price'], ['Kevin', 'Kevin Mallory'], ['Amira', 'Amira Saleh'], ['Rhys', 'Rhys Calloway']],
    h: 'Apply for a resident parking permit', crumbs: ['Services', 'Permits', 'Resident parking'],
    intro: 'You can apply if you live in a controlled parking zone and the vehicle is registered at your address.', fields: ['Vehicle registration', 'Postcode', 'Zone'], vals: ['KX19 PLT', 'EM4 7QD', 'Zone C'],
    submit: 'Submit application', save: 'Save and come back later', find: 'Find a service office', ph: 'town or postcode',
    side: ['Before you start', 'You will need your vehicle registration document and a proof of address issued in the last 3 months.'],
    ok: 'Application {r} received', neg: 'Application {r} was not submitted. Please try again.', pending: 'Submitting your application…', mention: 'You will see a confirmation with your application number here after you submit.',
    e1: 'There is a problem: the postcode is outside the controlled parking zones.', e2: 'There is a problem: the vehicle registration is not in the correct format.',
    clear: 'All answers checked. There are no problems with this application.', checking: 'Checking your answers…', emention: 'If an answer needs correcting, it will be marked on this page.',
    errSpec: 'an error saying the postcode is outside the parking zones',
    q: ['Ashford', 'Millbrook', 'Westhollow'], rows: { Ashford: ['Ashford Civic Centre, 2 Market Square', 'Ashford Library help point, Station Road'], Millbrook: ['Millbrook Town Hall, 14 High Street', 'Millbrook community hub, Quarry Lane', 'Millbrook Library help point, Church Walk'], Westhollow: ['Westhollow Customer Service Centre, 9 Tannery Court', 'Westhollow Library help point, Mill Road'] },
  },
  uk: {
    brands: ['Портал послуг Вербогайської громади', 'Сервіси Липецької громади', 'Цифровий центр Боровиці'], nav: ['Послуги', 'Дозволи', 'Відходи', 'Податки', 'Контакти'],
    users: [['Наталія', 'Наталія Гуменюк', 'Наталіє'], ['Василь', 'Василь Кравець', 'Василю'], ['Соломія', 'Соломія Бойко', 'Соломіє'], ['Роман', 'Роман Шевчук', 'Романе']],
    h: 'Заява на дозвіл для паркування мешканця', crumbs: ['Послуги', 'Дозволи', 'Паркування мешканців'],
    intro: 'Подати заяву можна, якщо ви мешкаєте в зоні платного паркування, а авто зареєстроване за вашою адресою.', fields: ['Номерний знак', 'Поштовий індекс', 'Зона'], vals: ['ВС 4127 КМ', '79058', 'Зона C'],
    submit: 'Подати заяву', save: 'Зберегти й повернутися пізніше', find: 'Знайти центр надання послуг', ph: 'місто або індекс',
    side: ['Перш ніж почати', 'Знадобиться свідоцтво про реєстрацію авто та документ, що підтверджує адресу, виданий не раніше ніж 3 місяці тому.'],
    ok: 'Заяву {r} прийнято', neg: 'Заяву {r} не подано. Спробуйте ще раз.', pending: 'Надсилаємо вашу заяву…', mention: 'Після подання тут з’явиться підтвердження з номером заяви.',
    e1: 'Помилка: поштовий індекс поза зонами платного паркування.', e2: 'Помилка: номерний знак указано в неправильному форматі.',
    clear: 'Усі відповіді перевірено. Проблем із заявою немає.', checking: 'Перевіряємо ваші відповіді…', emention: 'Якщо відповідь потрібно виправити, її буде позначено на цій сторінці.',
    errSpec: 'an error saying the postcode is outside the parking zones',
    q: ['Вербогай', 'Боровиця', 'Липець'], rows: { 'Вербогай': ['ЦНАП Вербогай, пл. Ринок, 2', 'Пункт допомоги в бібліотеці, вул. Вокзальна'], 'Боровиця': ['ЦНАП Боровиця, вул. Центральна, 14', 'Громадський простір, вул. Гончарна', 'Пункт допомоги в бібліотеці, вул. Церковна'], 'Липець': ['ЦНАП Липець, вул. Шкіряна, 9', 'Пункт допомоги в бібліотеці, вул. Млинова'] },
  },
};

export const govApplication = {
  id: 'gov-application', kind: 'gov', langs: ['en', 'uk'], cats: ['confirmation', 'error', 'results', 'greeting'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const r = `PP-${refDigits(rng, 7)}`;
    const near = nearRef(rng, r);
    const [q, q2] = rng.shuffle(v.q);
    return {
      kind: 'gov', brand, title: `${v.h} · ${brand}`, at: '/permits/parking/apply', host: 'services', nav: v.nav, slug: 'services', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        const fields = v.fields.map((f, i) => ui.input(f, v.vals[i])).join('');
        return `<h1>${esc(v.h)}</h1>${slot}<p>${esc(v.intro)}</p>${fields}<p>${ui.btn(v.submit, { pri: true })} ${ui.a(v.save, '/save')}</p>
<div class="card"><h2>${esc(v.find)}</h2><input type="search" value="" placeholder="${esc(v.ph)}"></div>`;
      },
      aside() { return box(v.side[0], `<p>${esc(v.side[1])}</p>`); },
      cats: {
        confirmation: { ok: v.ok.replace('{r}', r), wrong: v.ok.replace('{r}', near), neg: v.neg.replace('{r}', r), pending: v.pending, mention: v.mention, spec: `a confirmation that application ${r} was received` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
      },
    };
  },
};
