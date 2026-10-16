// Template gov-permit: a permit application on a public-services portal. Result: the signed permit document.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Ashby Vale District Services', 'Northvale Civic Portal', 'Larchmere Borough Online'], nav: ['Services', 'Applications', 'Payments', 'Messages', 'Contact'], cur: 'GBP', amt: [18, 640],
    h: 'Application status', kinds: ['Street party road closure', 'Market stall licence', 'Residents parking permit'], type: 'Type', no: 'Application number', app: 'Applicant', fee: 'Fee paid',
    ladder: ['Submitted', 'Under review', 'Approved'], neg: ['Refused', 'Application {ref} was not approved. The reasons are set out in the decision letter in your Messages.'], doc: 'Signed permit (PDF)', dl: 'Download',
    pend: 'A decision has been made. The signed permit document will be issued within 5 working days.', queued: 'Application {ref} is in the queue for review. Average waiting time is 9 working days.',
    notice: 'This service is provided by the district office. Opening hours: Monday to Friday, 9:00 to 17:00.', faq: 'How long does a review take?',
    E: { main: 'Application {ref} filed by {who}', res: 'The permit document for application {ref}', num: 'Application {ref} with a fee of {num} paid', status: 'Application {ref} has been granted' },
  },
  uk: {
    brands: ['Портал послуг Вербоградської громади', 'Цифрова ратуша Ясенева', 'Громадські сервіси Заріччя'], nav: ['Послуги', 'Заяви', 'Платежі', 'Повідомлення', 'Контакти'], cur: 'UAH', amt: [85, 4200],
    h: 'Стан заяви', kinds: ['Тимчасове перекриття вулиці для свята', 'Дозвіл на торгове місце', 'Паркувальний дозвіл мешканця'], type: 'Вид', no: 'Номер заяви', app: 'Заявник', fee: 'Сплачений збір',
    ladder: ['Подано', 'На розгляді', 'Схвалено'], neg: ['Відмовлено', 'Заяву {ref} не схвалено. Причини наведено в листі-рішенні у ваших повідомленнях.'], doc: 'Підписаний дозвіл (PDF)', dl: 'Завантажити',
    pend: 'Рішення ухвалено. Підписаний дозвіл буде видано протягом 5 робочих днів.', queued: 'Заява {ref} у черзі на розгляд. Середній час очікування — 9 робочих днів.',
    notice: 'Послугу надає ЦНАП громади. Графік: понеділок–п’ятниця, 9:00–17:00.', faq: 'Скільки триває розгляд?',
    E: { main: 'Заява {ref}, яку подав(ла) {who}', res: 'Документ дозволу за заявою {ref}', num: 'Заява {ref} зі сплаченим збором {num}', status: 'Заяву {ref} задоволено' },
  },
  de: {
    brands: ['Bürgerportal Moorbach', 'Kreisverwaltung Lindgrund Online', 'Serviceportal Stadt Kranichsee'], nav: ['Leistungen', 'Anträge', 'Zahlungen', 'Postfach', 'Kontakt'], cur: 'EUR', amt: [18, 640],
    h: 'Antragsstatus', kinds: ['Straßensperrung für ein Straßenfest', 'Genehmigung für einen Marktstand', 'Bewohnerparkausweis'], type: 'Art', no: 'Antragsnummer', app: 'Antragsteller(in)', fee: 'Gezahlte Gebühr',
    ladder: ['Eingereicht', 'In Prüfung', 'Genehmigt'], neg: ['Abgelehnt', 'Antrag {ref} wurde nicht genehmigt. Die Gründe stehen im Bescheid in Ihrem Postfach.'], doc: 'Unterschriebene Genehmigung (PDF)', dl: 'Herunterladen',
    pend: 'Die Entscheidung ist gefallen. Die unterschriebene Genehmigung wird innerhalb von 5 Werktagen ausgestellt.', queued: 'Antrag {ref} wartet auf die Prüfung. Die durchschnittliche Wartezeit beträgt 9 Werktage.',
    notice: 'Dieser Dienst wird vom Bürgeramt bereitgestellt. Sprechzeiten: Montag bis Freitag, 9:00 bis 17:00 Uhr.', faq: 'Wie lange dauert die Prüfung?',
    E: { main: 'Antrag {ref}, gestellt von {who}', res: 'Das Genehmigungsdokument zu Antrag {ref}', num: 'Antrag {ref} mit bezahlter Gebühr von {num}', status: 'Antrag {ref} wurde bewilligt' },
  },
  pl: {
    brands: ['e-Urząd Gminy Wrzosowo', 'Portal Mieszkańca Lipowa', 'Usługi Miejskie Nadwiśle'], nav: ['Usługi', 'Wnioski', 'Płatności', 'Wiadomości', 'Kontakt'], cur: 'PLN', amt: [20, 900],
    h: 'Status wniosku', kinds: ['Zamknięcie ulicy na festyn', 'Zezwolenie na stoisko targowe', 'Karta parkingowa mieszkańca'], type: 'Rodzaj', no: 'Numer wniosku', app: 'Wnioskodawca', fee: 'Opłata wniesiona',
    ladder: ['Złożony', 'W rozpatrzeniu', 'Zatwierdzony'], neg: ['Odmowa', 'Wniosek {ref} nie został zatwierdzony. Uzasadnienie znajdziesz w decyzji w Wiadomościach.'], doc: 'Podpisane zezwolenie (PDF)', dl: 'Pobierz',
    pend: 'Decyzja zapadła. Podpisane zezwolenie zostanie wydane w ciągu 5 dni roboczych.', queued: 'Wniosek {ref} czeka w kolejce do rozpatrzenia. Średni czas oczekiwania to 9 dni roboczych.',
    notice: 'Usługę prowadzi urząd gminy. Godziny pracy: poniedziałek–piątek, 9:00–17:00.', faq: 'Jak długo trwa rozpatrzenie?',
    E: { main: 'Wniosek {ref} (wnioskodawca: {who})', res: 'Dokument zezwolenia do wniosku {ref}', num: 'Wniosek {ref} z wniesioną opłatą {num}', status: 'Wniosek {ref} został rozpatrzony pozytywnie' },
  },
};

export const govPermit = {
  id: 'gov-permit', kind: 'gov', langs: ['en', 'uk', 'de', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `PRM-${41000 + r.int(58000)}`, spec: { type: 'money' } });
    const v = c.v;
    const kind = rng.pick(v.kinds);
    return {
      ...c, kind: 'gov', nav: v.nav, slug: 'services', crumbs: [v.nav[1], v.h], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: () => `${v.h} - ${c.brand}`, at: (ref) => `/applications/${ref.toLowerCase()}`, resText: v.doc, loadTitle: v.h,
      en: { thing: 'application', res: 'permit document', num: 'fee paid' },
      main(x, ui) {
        const res = `<div class="card">${esc(v.doc)} · ${ui.a(v.dl, `/applications/${x.ref.toLowerCase()}/permit.pdf`)}</div>`;
        return `<h1>${esc(v.h)}</h1>${rows([[v.no, esc(x.ref)], [v.type, esc(kind)], [v.app, esc(x.who)], [v.fee, esc(x.num)], ['', stageBadge(x)]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}<p class="muted">${esc(v.notice)}</p>`;
      },
      aside: (x, ui) => box(v.nav[4], `<p>${ui.a(v.faq, '/help/review-times')}</p>`),
    };
  },
};
