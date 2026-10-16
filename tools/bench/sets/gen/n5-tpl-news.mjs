// Template news-newsletter: an article page with a newsletter block of near-twin names; the step subscribes the
// reader to one of them. Every row has its own "Subscribe" button, so the acted element carries an ordinal.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['The Ledger Post', 'Fenmouth Herald', 'Northgate Courier'], nav: ['News', 'Business', 'Science', 'Culture', 'Sport'], users: ['Mara Quint', 'Owen Strick', 'Priya Calder'],
    letters: [['Morning Briefing', 'Weekday mornings'], ['Weekend Briefing', 'Saturdays'], ['Evening Briefing', 'Weeknights'], ['Climate Desk', 'Thursdays'], ['Climate Desk Weekly', 'Mondays'], ['Money Matters', 'Fridays']],
    arts: [['Tidal barrier tested ahead of winter storms', 'Engineers ran the gates through a full cycle on Tuesday, the first test since the barrier was extended last spring.'], ['Night buses return to the harbour routes', 'The council confirmed three routes will run again from November after a two-year pause.'], ['Seed library lends its ten-thousandth packet', 'Volunteers say tomatoes and runner beans remain the most borrowed seeds.']],
    filler: 'Residents who attended the open evening asked about noise during the works and how long the closures would last. A full timetable is due next month.',
    nl: 'Newsletters', email: 'Email', sub: 'Subscribe', unsub: 'Unsubscribe', on: 'Subscribed', most: 'Most read', by: 'By our local desk',
    ok: 'You’re subscribed to {n}', bad: 'You’re subscribed to {w}', invalid: 'Tick the box to agree to the newsletter terms.', agree: 'I agree to the newsletter terms and privacy notice',
    intent: 'subscribe to the {n} newsletter', confirm: 'Subscribe {e} to {n}?', thanks: 'Thanks for subscribing', thanksBody: '{n} will arrive in your inbox ({f}). You can change this in your account at any time.',
  },
  uk: {
    brands: ['Вісник Надбужжя', 'Міська Хвиля', 'Поштовий Голос'], nav: ['Новини', 'Економіка', 'Наука', 'Культура', 'Спорт'], users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук'],
    letters: [['Ранковий дайджест', 'щобудня зранку'], ['Дайджест вихідного дня', 'щосуботи'], ['Вечірній дайджест', 'щобудня ввечері'], ['Клімат', 'щочетверга'], ['Клімат щотижня', 'щопонеділка'], ['Гроші', 'щоп’ятниці']],
    arts: [['Захисну дамбу випробували перед зимовими штормами', 'Інженери провели повний цикл роботи затворів у вівторок, уперше після розширення дамби навесні.'], ['Нічні автобуси повертаються на портові маршрути', 'Міська рада підтвердила, що з листопада знову курсуватимуть три маршрути.'], ['Бібліотека насіння видала десятитисячний пакетик', 'Волонтери кажуть, що найчастіше беруть насіння томатів і квасолі.']],
    filler: 'Мешканці, які прийшли на зустріч, питали про шум під час робіт і про те, скільки триватимуть перекриття. Повний графік оприлюднять наступного місяця.',
    nl: 'Розсилки', email: 'Електронна пошта', sub: 'Підписатися', unsub: 'Відписатися', on: 'Ви підписані', most: 'Найпопулярніше', by: 'Автор: міська редакція',
    ok: 'Ви підписалися на розсилку «{n}»', bad: 'Ви підписалися на розсилку «{w}»', invalid: 'Позначте, що погоджуєтеся з умовами розсилки.', agree: 'Погоджуюся з умовами розсилки і політикою конфіденційності',
    intent: 'підписатися на розсилку «{n}»', confirm: 'Підписати {e} на «{n}»?', thanks: 'Дякуємо за підписку', thanksBody: '«{n}» надходитиме на вашу пошту ({f}). Змінити це можна в акаунті будь-коли.',
  },
  pl: {
    brands: ['Kurier Nadodrzański', 'Gazeta Przystań', 'Głos Doliny'], nav: ['Wiadomości', 'Biznes', 'Nauka', 'Kultura', 'Sport'], users: ['Zofia Wrzos', 'Kacper Lisowski', 'Ewa Brzezińska'],
    letters: [['Poranny przegląd', 'w dni robocze rano'], ['Weekendowy przegląd', 'w soboty'], ['Wieczorny przegląd', 'w dni robocze wieczorem'], ['Klimat', 'w czwartki'], ['Klimat co tydzień', 'w poniedziałki'], ['Pieniądze', 'w piątki']],
    arts: [['Zapora przeciwpowodziowa przetestowana przed zimą', 'Inżynierowie przeprowadzili we wtorek pełny cykl pracy zasuw, pierwszy od rozbudowy zapory.'], ['Nocne autobusy wracają na trasy portowe', 'Rada miasta potwierdziła, że od listopada znów pojadą trzy linie.'], ['Biblioteka nasion wypożyczyła dziesięciotysięczną paczkę', 'Wolontariusze mówią, że najczęściej wypożyczane są nasiona pomidorów i fasoli.']],
    filler: 'Mieszkańcy pytali na spotkaniu o hałas podczas prac i o to, jak długo potrwają utrudnienia. Pełny harmonogram ma się ukazać w przyszłym miesiącu.',
    nl: 'Newslettery', email: 'E-mail', sub: 'Zapisz się', unsub: 'Wypisz się', on: 'Zapisano', most: 'Najczęściej czytane', by: 'Redakcja miejska',
    ok: 'Zapisano Cię do newslettera „{n}”', bad: 'Zapisano Cię do newslettera „{w}”', invalid: 'Zaznacz, że akceptujesz regulamin newslettera.', agree: 'Akceptuję regulamin newslettera i politykę prywatności',
    intent: 'zapisać się do newslettera „{n}”', confirm: 'Zapisać {e} do „{n}”?', thanks: 'Dziękujemy za zapis', thanksBody: '„{n}” będzie trafiać na Twoją skrzynkę ({f}). Możesz to zmienić w koncie w każdej chwili.',
  },
};

const FAMILIES = [[0, 1, 2], [3, 4]];

export const newsNewsletter = {
  id: 'news-newsletter', kind: 'news', langs: ['en', 'uk', 'pl'],
  make(rng, lang, il) {
    const v = V[lang];
    const fam = rng.shuffle(rng.pick(FAMILIES));
    const [ti, wi] = fam;
    const other = [0, 1, 2, 3, 4, 5].filter((i) => !fam.includes(i));
    const rows = rng.shuffle([ti, wi, rng.pick(other)]);
    const n = v.letters[ti][0];
    const w = v.letters[wi][0];
    const [head, lede] = rng.pick(v.arts);
    const user = rng.pick(v.users);
    const e = `reader${100 + rng.int(900)}@example.test`;
    const brand = rng.pick(v.brands);
    const vars = { n, w, e, f: v.letters[ti][1] };
    const most = v.arts.filter((x) => x[0] !== head).map((x) => x[0]);
    const slug = `/${2026}/10/${10 + rng.int(18)}/${String(1000 + rng.int(9000))}`;
    return {
      kind: 'news', brand, title: `${head} – ${brand}`, at: slug, nav: v.nav, slug: 'news', user,
      crumbs: [v.nav[0]], intent: fill(V[il].intent, { n }),
      main(state, ui) {
        const on = state === 'done' ? ti : state === 'wrong' ? wi : -1;
        const rowsHtml = rows.map((i) => {
          const [name, freq] = v.letters[i];
          const act = i === on ? `<span class="badge">✓ ${esc(v.on)}</span> ${ui.btn(v.unsub)}` : ui.btn(v.sub, { acted: i === ti });
          return `<tr><td><strong>${esc(name)}</strong><br><span class="muted">${esc(freq)}</span></td><td>${act}</td></tr>`;
        }).join('');
        const err = state === 'invalid' ? v.invalid : '';
        return `<article><h1>${esc(head)}</h1><p class="muted">${esc(v.by)}</p><p><strong>${esc(lede)}</strong></p><p>${esc(v.filler)}</p></article>
<div class="card"><h2>${esc(v.nl)}</h2>${ui.input(v.email, e)}<p><label class="muted"><input type="checkbox" style="width:auto"> ${esc(v.agree)}</label></p>${err ? `<p class="err" role="alert">${esc(err)}</p>` : ''}<table>${rowsHtml}</table></div>`;
      },
      aside(state, ui) {
        return box(v.most, list(most.map((m) => ui.a(m, '/news')))) + box(v.nav[3], `<p>${esc(v.filler.split('. ')[1] ?? '')}</p>`);
      },
      ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: v.invalid, confirmQ: fill(v.confirm, vars),
      noop: null,
      confirm: {
        at: '/newsletters/thanks', title: `${v.thanks} – ${brand}`,
        main(ui) {
          return `<h1>${esc(v.thanks)}</h1><p>${esc(fill(v.thanksBody, vars))}</p><p class="muted">${esc(e)}</p><p>${ui.a(head, slug)}</p>`;
        },
      },
      errAt: '/newsletters/subscribe',
      why: {
        change: `the ${n} row now shows "${v.on}" with an unsubscribe button`,
        wrong: `the ${w} row became subscribed, while ${n} still offers "${v.sub}"`,
        unchanged: `${n} still offers "${v.sub}" and no newsletter shows as subscribed`,
        confirm: `thanks the reader for subscribing to ${n}`,
      },
    };
  },
};
