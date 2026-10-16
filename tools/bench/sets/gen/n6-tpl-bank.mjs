// Template bank-transfer: one outgoing transfer in an online bank. Result: the downloadable payment confirmation.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Harbourline Bank', 'Corvid Savings', 'Larchmere Building Society'], nav: ['Accounts', 'Payments', 'Cards', 'Savings', 'Help'], cur: 'GBP', amt: [40, 4200],
    h: 'Payment details', payee: 'Payee', amount: 'Amount', from: 'From', acct: 'Everyday Account ••4417', id: 'Payment ID', ladder: ['Created', 'Processing', 'Completed'],
    neg: ['Rejected', 'Payment {ref} was rejected by the receiving bank. No money left your account.'], doc: 'Download payment confirmation (PDF)',
    pend: 'The payment confirmation can be downloaded after the end of the banking day.', queued: 'Payment {ref} is waiting in the outgoing queue for the next processing window.',
    bal: 'Available balance', safe: 'We will never ask for your PIN by phone or email.',
    E: { main: 'A record of payment {ref} to {who}', res: 'A downloadable confirmation for payment {ref}', num: 'Payment {ref} for {num}', status: 'Payment {ref} has gone through' },
  },
  uk: {
    brands: ['Дніпровий Банк', 'Ощадна Каса Поділля', 'Банк Карпатський Двір'], nav: ['Рахунки', 'Платежі', 'Картки', 'Заощадження', 'Допомога'], cur: 'UAH', amt: [600, 90000],
    h: 'Деталі платежу', payee: 'Отримувач', amount: 'Сума', from: 'З рахунку', acct: 'Поточний рахунок ••4417', id: 'Номер платежу', ladder: ['Створено', 'В обробці', 'Виконано'],
    neg: ['Відхилено', 'Платіж {ref} відхилив банк отримувача. Кошти не списано.'], doc: 'Завантажити квитанцію (PDF)',
    pend: 'Квитанцію можна буде завантажити після закриття операційного дня.', queued: 'Платіж {ref} чекає в черзі на наступне вікно обробки.',
    bal: 'Доступний залишок', safe: 'Ми ніколи не питаємо PIN-код телефоном чи поштою.',
    E: { main: 'Запис про платіж {ref} (отримувач: {who})', res: 'Квитанція до платежу {ref}, яку можна завантажити', num: 'Платіж {ref} на суму {num}', status: 'Платіж {ref} успішно проведено' },
  },
  de: {
    brands: ['Hafenstadt Bank', 'Sparkasse Lindgrund', 'Volkskasse Moorbach'], nav: ['Konten', 'Zahlungen', 'Karten', 'Sparen', 'Hilfe'], cur: 'EUR', amt: [40, 4200],
    h: 'Zahlungsdetails', payee: 'Empfänger', amount: 'Betrag', from: 'Von', acct: 'Girokonto ••4417', id: 'Zahlungs-ID', ladder: ['Erstellt', 'In Bearbeitung', 'Ausgeführt'],
    neg: ['Abgelehnt', 'Zahlung {ref} wurde von der Empfängerbank abgelehnt. Es wurde nichts abgebucht.'], doc: 'Zahlungsbestätigung herunterladen (PDF)',
    pend: 'Die Zahlungsbestätigung steht nach Ende des Bankarbeitstags zum Download bereit.', queued: 'Zahlung {ref} wartet in der Ausgangswarteschlange auf das nächste Verarbeitungsfenster.',
    bal: 'Verfügbarer Betrag', safe: 'Wir fragen niemals per Telefon oder E-Mail nach Ihrer PIN.',
    E: { main: 'Ein Eintrag zur Zahlung {ref} an {who}', res: 'Eine herunterladbare Bestätigung für Zahlung {ref}', num: 'Zahlung {ref} über {num}', status: 'Zahlung {ref} ist durchgegangen' },
  },
  pl: {
    brands: ['Bank Nadwiślański', 'Kasa Lipowa', 'Bank Ziemi Kłodzkiej'], nav: ['Rachunki', 'Płatności', 'Karty', 'Oszczędności', 'Pomoc'], cur: 'PLN', amt: [80, 16000],
    h: 'Szczegóły płatności', payee: 'Odbiorca', amount: 'Kwota', from: 'Z rachunku', acct: 'Konto osobiste ••4417', id: 'ID płatności', ladder: ['Utworzona', 'W realizacji', 'Zrealizowana'],
    neg: ['Odrzucona', 'Płatność {ref} została odrzucona przez bank odbiorcy. Środki nie zostały pobrane.'], doc: 'Pobierz potwierdzenie płatności (PDF)',
    pend: 'Potwierdzenie płatności będzie można pobrać po zakończeniu dnia roboczego banku.', queued: 'Płatność {ref} czeka w kolejce na najbliższą sesję rozliczeniową.',
    bal: 'Dostępne środki', safe: 'Nigdy nie prosimy o PIN przez telefon ani e-mail.',
    E: { main: 'Zapis płatności {ref} (odbiorca: {who})', res: 'Potwierdzenie płatności {ref} do pobrania', num: 'Płatność {ref} na kwotę {num}', status: 'Płatność {ref} przeszła pomyślnie' },
  },
};

export const bankTransfer = {
  id: 'bank-transfer', kind: 'bank', langs: ['en', 'uk', 'de', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `P${48000000 + r.int(1900000)}`, spec: { type: 'money' } });
    const v = c.v;
    const docName = `confirmation-${c.f.ref.toLowerCase()}.pdf`;
    const bal = `${Math.round(c.f.n * 3 + 1200 + rng.int(9000)).toLocaleString('en-US').replace(/,/g, lang === 'en' ? ',' : ' ')}`;
    return {
      ...c, kind: 'bank', nav: v.nav, slug: 'bank', crumbs: [v.nav[1], v.h], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${v.h} | ${c.brand}`, at: (ref) => `/payments/${ref.toLowerCase()}`, resText: v.doc, loadTitle: v.h,
      en: { thing: 'payment', res: 'payment confirmation download', num: 'amount' },
      main(x, ui) {
        const res = `<p>${ui.a(v.doc, `/payments/${x.ref.toLowerCase()}/${docName}`)}</p>`;
        return `<h1>${esc(v.h)}</h1>${rows([[v.id, esc(x.ref)], [v.payee, esc(x.who)], [v.amount, `<strong>${esc(x.num)}</strong>`], [v.from, esc(v.acct)], ['', stageBadge(x)]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: () => box(v.bal, `<p><strong>${esc(bal)}</strong><br><span class="muted">${esc(v.acct)}</span></p>`) + box(v.nav[4], `<p>${esc(v.safe)}</p>`),
    };
  },
};
