// Template bank-transfer: a payment form with saved payees; the step sends money to one payee.
import { esc, fill, money } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Harbourline Bank', 'Corvid Savings', 'Larchmere Building Society'], nav: ['Accounts', 'Payments', 'Cards', 'Savings', 'Help'], cur: 'GBP', amt: [40, 900],
    users: ['Mara Quint', 'Owen Strick', 'Priya Calder'], payees: [['Ilse Brandvold', 'Ilse Brandt'], ['Tom Okafor', 'Tom Okoro'], ['Greenway Lettings', 'Greenway Lighting'], ['Marta Ruiz', 'Marta Ruiz-Vela']],
    h: 'Pay someone', from: 'From', acct: 'Everyday Account ••4417', payee: 'Payee', amount: 'Amount', ref: 'Reference', refs: ['Rent October', 'Dinner split', 'Invoice 2291', 'Deposit'], send: 'Send payment', later: 'Schedule for later',
    bal: 'Available balance', recent: 'Recent activity', today: 'Today', old: [['Card payment, Fenwick Grocers', 23.4], ['Salary, Westbrook Ltd', -2140], ['Direct debit, Calder Water', 31.2]],
    note: 'Payments to new payees can take up to 2 hours. Check the details before you send.',
    ok: 'Payment of {a} sent to {p}', bad: 'Payment of {a} sent to {w}', invalid: 'Reference can only contain letters, numbers and spaces.',
    intent: 'send {a} to {p}', confirm: 'Send {a} to {p}?', receipt: 'Payment receipt', status: 'Status', done: 'Completed', txid: 'Transaction ID',
    noop: ['No payment was made.', 'Fill in the payment details to continue.'],
  },
  uk: {
    brands: ['Дніпровий Банк', 'Ощадна Каса Поділля', 'Банк Карпатський Двір'], nav: ['Рахунки', 'Платежі', 'Картки', 'Заощадження', 'Допомога'], cur: 'UAH', amt: [500, 9000],
    users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук'], payees: [['Оксана Гребінь', 'Оксана Гребенюк'], ['Тарас Мельничук', 'Тарас Мельник'], ['ОСББ Липова 12', 'ОСББ Липова 21'], ['ФОП Ярема В. С.', 'ФОП Ярема В. Є.']],
    h: 'Переказ', from: 'З рахунку', acct: 'Поточний рахунок ••4417', payee: 'Отримувач', amount: 'Сума', ref: 'Призначення', refs: ['Оренда жовтень', 'За вечерю', 'Рахунок 2291', 'Завдаток'], send: 'Надіслати переказ', later: 'Запланувати',
    bal: 'Доступний залишок', recent: 'Останні операції', today: 'Сьогодні', old: [['Оплата карткою, Сільпос Маркет', 412], ['Зарплата, ТОВ Вербена', -38200], ['Комунальні, Водоканал', 690]],
    note: 'Перекази новим отримувачам можуть тривати до 2 годин. Перевірте реквізити перед відправленням.',
    ok: 'Переказ {a} надіслано: {p}', bad: 'Переказ {a} надіслано: {w}', invalid: 'Призначення може містити лише літери, цифри та пробіли.',
    intent: 'переказати {a} отримувачу {p}', confirm: 'Надіслати {a} отримувачу {p}?', receipt: 'Квитанція', status: 'Статус', done: 'Виконано', txid: 'Номер операції',
    noop: ['Переказ не виконано.', 'Заповніть реквізити, щоб продовжити.'],
  },
  de: {
    brands: ['Hafenstadt Bank', 'Sparkasse Lindgrund', 'Volkskasse Moorbach'], nav: ['Konten', 'Überweisungen', 'Karten', 'Sparen', 'Hilfe'], cur: 'EUR', amt: [40, 900],
    users: ['Lena Brückner', 'Jonas Hellwig', 'Mia Kessler'], payees: [['Hausverwaltung Kranz', 'Hausverwaltung Kranich'], ['Paul Wendel', 'Paula Wendel'], ['Anke Störmer', 'Anke Stürmer']],
    h: 'Überweisung', from: 'Von', acct: 'Girokonto ••4417', payee: 'Empfänger', amount: 'Betrag', ref: 'Verwendungszweck', refs: ['Miete Oktober', 'Abendessen', 'Rechnung 2291', 'Kaution'], send: 'Überweisung senden', later: 'Terminieren',
    bal: 'Verfügbarer Betrag', recent: 'Letzte Umsätze', today: 'Heute', old: [['Kartenzahlung, Feldmarkt', 23.4], ['Gehalt, Nordwerk GmbH', -2140], ['Lastschrift, Stadtwerke Moorbach', 31.2]],
    note: 'Überweisungen an neue Empfänger können bis zu 2 Stunden dauern. Bitte prüfen Sie die Angaben.',
    ok: '{a} an {p} überwiesen', bad: '{a} an {w} überwiesen', invalid: 'Der Verwendungszweck darf nur Buchstaben, Ziffern und Leerzeichen enthalten.',
    intent: '{a} an {p} überweisen', confirm: '{a} an {p} überweisen?', receipt: 'Überweisungsbeleg', status: 'Status', done: 'Ausgeführt', txid: 'Transaktionsnummer',
    noop: ['Es wurde keine Überweisung ausgeführt.'],
  },
  pl: {
    brands: ['Bank Nadwiślański', 'Kasa Lipowa', 'Bank Ziemi Kłodzkiej'], nav: ['Rachunki', 'Przelewy', 'Karty', 'Oszczędności', 'Pomoc'], cur: 'PLN', amt: [80, 3000],
    users: ['Zofia Wrzos', 'Kacper Lisowski', 'Ewa Brzezińska'], payees: [['Spółdzielnia Lipowa 12', 'Spółdzielnia Lipowa 21'], ['Marek Sowa', 'Marek Sowiński'], ['Hanna Grab', 'Hanna Grabska']],
    h: 'Przelew', from: 'Z rachunku', acct: 'Konto osobiste ••4417', payee: 'Odbiorca', amount: 'Kwota', ref: 'Tytuł', refs: ['Czynsz październik', 'Za kolację', 'Faktura 2291', 'Kaucja'], send: 'Wyślij przelew', later: 'Zaplanuj',
    bal: 'Dostępne środki', recent: 'Ostatnie operacje', today: 'Dziś', old: [['Płatność kartą, Sklep Pod Lipą', 48.2], ['Wynagrodzenie, Mostek sp. z o.o.', -6400], ['Polecenie zapłaty, Wodociągi', 92.5]],
    note: 'Przelewy do nowych odbiorców mogą trwać do 2 godzin. Sprawdź dane przed wysłaniem.',
    ok: 'Wysłano przelew {a} do: {p}', bad: 'Wysłano przelew {a} do: {w}', invalid: 'Tytuł może zawierać tylko litery, cyfry i spacje.',
    intent: 'wysłać {a} do: {p}', confirm: 'Wysłać {a} do: {p}?', receipt: 'Potwierdzenie przelewu', status: 'Status', done: 'Zrealizowany', txid: 'Numer transakcji',
    noop: ['Przelew nie został wykonany.'],
  },
};

export const bankTransfer = {
  id: 'bank-transfer', kind: 'bank', langs: ['en', 'uk', 'de', 'pl'],
  make(rng, lang, il) {
    const v = V[lang];
    const [lo, hi] = v.amt;
    const amount = Math.round((lo + rng.next() * (hi - lo)) / 5) * 5;
    const pair = rng.pick(v.payees);
    const [p, w] = rng.chance(0.5) ? pair : [pair[1], pair[0]];
    const others = v.payees.filter((x) => x !== pair).map((x) => x[0]);
    const payees = rng.shuffle([p, w, ...others]);
    const a = money(lang, v.cur, amount);
    const balance = amount + 300 + rng.int(4000) + (v.cur === 'UAH' ? 20000 : 0) + 0.37;
    const refText = rng.pick(v.refs);
    const user = rng.pick(v.users);
    const brand = rng.pick(v.brands);
    const vars = { a, p, w };
    const tx = `TX${100000 + rng.int(899999)}`;
    return {
      kind: 'bank', brand, title: `${v.h} | ${brand}`, at: '/payments/new', nav: v.nav, slug: 'bank', user,
      crumbs: [v.nav[1], v.h], intent: fill(V[il].intent, vars), noop: v.noop,
      main(state, ui) {
        const err = state === 'invalid' ? fill(v.invalid, vars) : '';
        return `<h1>${esc(v.h)}</h1>${ui.select(v.from, [v.acct], v.acct)}${ui.select(v.payee, payees, p)}${ui.input(v.amount, a)}${ui.input(v.ref, refText + (state === 'invalid' ? ' #' : ''), { err })}
<p>${ui.btn(v.send, { pri: true, acted: true })} ${ui.btn(v.later)}</p><p class="muted">${esc(v.note)}</p>`;
      },
      aside(state, ui) {
        const moved = state === 'done' || state === 'wrong';
        const rows = v.old.map(([t, x]) => `${esc(t)}: ${x < 0 ? '+' : '−'}${money(lang, v.cur, Math.abs(x))}`);
        if (moved) rows.unshift(`<strong>${esc(v.today)}: ${esc(state === 'done' ? p : w)}, ${esc(refText)}: −${a}</strong>`);
        const bal = money(lang, v.cur, moved ? balance - amount : balance);
        return box(v.bal, `<p><strong>${bal}</strong><br><span class="muted">${esc(v.acct)}</span></p>`) + box(v.recent, list(rows)) + box(v.nav[4], `<p>${ui.a(v.nav[2], '/cards')}</p>`);
      },
      ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: fill(v.invalid, vars), confirmQ: fill(v.confirm, vars),
      confirm: {
        at: `/payments/${tx.toLowerCase()}`, title: `${v.receipt} | ${brand}`,
        main(ui) {
          const rows = [[v.payee, p], [v.amount, a], [v.ref, refText], [v.status, v.done], [v.txid, tx]];
          return `<h1>${esc(v.receipt)}</h1><table>${rows.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('')}</table><p>${ui.a(v.nav[0], '/accounts')}</p>`;
        },
      },
      errAt: '/payments/confirm',
      why: {
        change: `recent activity now starts with ${a} to ${p} and the available balance dropped by ${a}`,
        wrong: `recent activity shows ${a} sent to ${w}, a different payee from ${p}`,
        unchanged: `the balance and recent activity are as before, with no payment to ${p}`,
        confirm: `is a receipt for ${a} to ${p} with status "${v.done}"`,
      },
    };
  },
};
