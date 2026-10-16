// Template bank-payment: an online-banking dashboard, "New standing order" / account details form beside the
// accounts list. Hosts currency, frequency (repeat), doctype (identity check) and country (tax residence).
import { T } from './n8-lib.mjs';
import { box, h, list, p, table } from './n8-page.mjs';

const V = {
  en: { brands: ['Harbourline Bank', 'Northfield Mutual'], nav: ['Accounts', 'Payments', 'Cards', 'Savings'], users: ['Ada Wren', 'Felix Morrow'],
    h1: 'New standing order', intro: 'Set up a regular payment from your current account. You can change or cancel it at any time before the next run date.',
    from: 'From account', fromV: 'Everyday account ·· 4418', payee: 'Payee name', iban: 'Payee IBAN', amount: 'Amount', ref: 'Reference', start: 'First payment', idh: 'Identity check', idp: 'For orders above €5,000 we ask for one identity document.',
    go: 'Continue', cancel: 'Cancel', acc: 'Your accounts', accs: [['Everyday ·· 4418', '€2,310.54'], ['Savings ·· 9027', '€8,940.00']], sec: 'Security tip', secT: 'We will never ask for your card PIN by phone or e-mail.' },
  uk: { brands: ['Банк Гавань', 'Північне Поле'], nav: ['Рахунки', 'Платежі', 'Картки', 'Заощадження'], users: ['Ада Вербицька', 'Фелікс Мороз'],
    h1: 'Новий регулярний платіж', intro: 'Налаштуйте регулярний переказ із поточного рахунку. Змінити чи скасувати його можна будь-коли до наступної дати списання.',
    from: 'З рахунку', fromV: 'Поточний рахунок ·· 4418', payee: 'Отримувач', iban: 'IBAN отримувача', amount: 'Сума', ref: 'Призначення', start: 'Перший платіж', idh: 'Перевірка особи', idp: 'Для платежів понад 200 000 ₴ просимо один документ, що посвідчує особу.',
    go: 'Далі', cancel: 'Скасувати', acc: 'Ваші рахунки', accs: [['Поточний ·· 4418', '23 410,54 ₴'], ['Депозит ·· 9027', '89 400,00 ₴']], sec: 'Порада з безпеки', secT: 'Ми ніколи не питаємо PIN-код картки телефоном чи поштою.' },
  de: { brands: ['Hafenbank', 'Nordfeld Bank'], nav: ['Konten', 'Zahlungen', 'Karten', 'Sparen'], users: ['Ada Wendt', 'Felix Morgen'],
    h1: 'Neuer Dauerauftrag', intro: 'Richten Sie eine regelmäßige Zahlung von Ihrem Girokonto ein. Sie können sie bis zum nächsten Ausführungstag jederzeit ändern oder löschen.',
    from: 'Von Konto', fromV: 'Girokonto ·· 4418', payee: 'Empfänger', iban: 'IBAN des Empfängers', amount: 'Betrag', ref: 'Verwendungszweck', start: 'Erste Ausführung', idh: 'Identitätsprüfung', idp: 'Bei Aufträgen über 5.000 € benötigen wir ein Ausweisdokument.',
    go: 'Weiter', cancel: 'Abbrechen', acc: 'Ihre Konten', accs: [['Girokonto ·· 4418', '2.310,54 €'], ['Tagesgeld ·· 9027', '8.940,00 €']], sec: 'Sicherheitshinweis', secT: 'Wir fragen niemals per Telefon oder E-Mail nach Ihrer Karten-PIN.' },
  es: { brands: ['Banco del Muelle', 'Caja Campo Norte'], nav: ['Cuentas', 'Pagos', 'Tarjetas', 'Ahorro'], users: ['Ada Robles', 'Félix Moral'],
    h1: 'Nueva transferencia periódica', intro: 'Programa un pago regular desde tu cuenta corriente. Puedes cambiarlo o cancelarlo antes de la siguiente fecha de cargo.',
    from: 'Cuenta de origen', fromV: 'Cuenta corriente ·· 4418', payee: 'Beneficiario', iban: 'IBAN del beneficiario', amount: 'Importe', ref: 'Concepto', start: 'Primer pago', idh: 'Verificación de identidad', idp: 'Para órdenes de más de 5.000 € pedimos un documento de identidad.',
    go: 'Continuar', cancel: 'Cancelar', acc: 'Tus cuentas', accs: [['Corriente ·· 4418', '2.310,54 €'], ['Ahorro ·· 9027', '8.940,00 €']], sec: 'Consejo de seguridad', secT: 'Nunca te pediremos el PIN de la tarjeta por teléfono ni por correo.' },
  pl: { brands: ['Bank Przystań', 'Północne Pole'], nav: ['Rachunki', 'Płatności', 'Karty', 'Oszczędności'], users: ['Ada Wierzba', 'Feliks Mróz'],
    h1: 'Nowe zlecenie stałe', intro: 'Ustaw regularny przelew z rachunku bieżącego. Możesz go zmienić lub anulować w dowolnym momencie przed kolejną datą realizacji.',
    from: 'Z rachunku', fromV: 'Konto osobiste ·· 4418', payee: 'Odbiorca', iban: 'IBAN odbiorcy', amount: 'Kwota', ref: 'Tytuł przelewu', start: 'Pierwsza płatność', idh: 'Weryfikacja tożsamości', idp: 'Przy zleceniach powyżej 20 000 zł prosimy o jeden dokument tożsamości.',
    go: 'Dalej', cancel: 'Anuluj', acc: 'Twoje rachunki', accs: [['Osobiste ·· 4418', '9 310,54 zł'], ['Oszczędnościowe ·· 9027', '36 940,00 zł']], sec: 'Wskazówka', secT: 'Nigdy nie prosimy o PIN karty telefonicznie ani e-mailem.' },
};

export const bankPayment = {
  id: 'bank-payment', kind: 'bank',
  hosts: {
    currency: T('Payment currency|Валюта платежу|Zahlungswährung|Divisa del pago|Waluta płatności'),
    frequency: T('Repeat|Повторювати|Wiederholen|Repetir|Powtarzaj'),
    doctype: T('Identity document|Документ, що посвідчує особу|Ausweisdokument|Documento de identidad|Dokument tożsamości'),
    country: T('Country of tax residence|Країна податкового резидентства|Steuerlicher Wohnsitz (Land)|País de residencia fiscal|Kraj rezydencji podatkowej'),
  },
  make(rng, lang, domId) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    return {
      kind: 'bank', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'ib', user: rng.pick(v.users), crumbs: [v.nav[1], v.h1],
      main(field, ui) {
        const base = `${ui.input(v.from, v.fromV)}${ui.input(v.payee, '')}${ui.input(v.iban, '')}${ui.input(v.amount, '')}`;
        const late = domId === 'doctype' || domId === 'country';
        const tail = late ? `${h(2, v.idh)}${p(v.idp, 'muted')}${field}` : '';
        return `${h(1, v.h1)}${p(v.intro)}${base}${late ? '' : field}${ui.input(v.ref, '')}${ui.input(v.start, '')}${tail}<p>${ui.btn(v.go, { pri: true })} ${ui.btn(v.cancel)}</p>`;
      },
      aside: (ui) => `${box(v.acc, table(['', ''], v.accs))}${box(v.sec, p(v.secT))}<section>${list(v.nav.slice(2).map((n) => ui.a(n, '/ib')))}</section>`,
    };
  },
};

const TR = {
  en: { brands: ['Skyhop Travel', 'Tern & Compass'], nav: ['Flights', 'Hotels', 'Trains', 'My trips'], h1: 'Passenger details', trip: 'Lisbon → Kraków · Fri 14 Nov · 1 stop',
    first: 'First name(s)', last: 'Last name', dob: 'Date of birth', extras: 'Extras and preferences', hotel: 'Hotel search', dates: 'Check-in and check-out', city: 'Destination', go: 'Continue to seats', search: 'Search hotels',
    fare: 'Fare summary', fareT: [['Base fare', '€184.00'], ['Taxes and fees', '€41.20']], rules: 'Changes allowed for a fee. Name changes are not allowed after booking.' },
  uk: { brands: ['Стриб Тревел', 'Крячок і Компас'], nav: ['Авіаквитки', 'Готелі', 'Потяги', 'Мої поїздки'], h1: 'Дані пасажира', trip: 'Лісабон → Краків · пт 14 лист. · 1 пересадка',
    first: 'Ім’я', last: 'Прізвище', dob: 'Дата народження', extras: 'Додатково й побажання', hotel: 'Пошук готелю', dates: 'Заїзд і виїзд', city: 'Куди', go: 'Далі: вибір місць', search: 'Шукати готелі',
    fare: 'Вартість', fareT: [['Тариф', '7 480 ₴'], ['Збори', '1 670 ₴']], rules: 'Зміни можливі за доплату. Змінити ім’я після бронювання не можна.' },
  de: { brands: ['Hüpfer Reisen', 'Seeschwalbe & Kompass'], nav: ['Flüge', 'Hotels', 'Bahn', 'Meine Reisen'], h1: 'Angaben zu den Reisenden', trip: 'Lissabon → Krakau · Fr 14. Nov. · 1 Umstieg',
    first: 'Vorname(n)', last: 'Nachname', dob: 'Geburtsdatum', extras: 'Extras und Wünsche', hotel: 'Hotelsuche', dates: 'An- und Abreise', city: 'Reiseziel', go: 'Weiter zur Sitzplatzwahl', search: 'Hotels suchen',
    fare: 'Preisübersicht', fareT: [['Flugpreis', '184,00 €'], ['Steuern und Gebühren', '41,20 €']], rules: 'Umbuchung gegen Gebühr möglich. Namensänderungen sind nach der Buchung nicht möglich.' },
  es: { brands: ['Viajes Saltamar', 'Charrán y Brújula'], nav: ['Vuelos', 'Hoteles', 'Trenes', 'Mis viajes'], h1: 'Datos del pasajero', trip: 'Lisboa → Cracovia · vie 14 nov · 1 escala',
    first: 'Nombre', last: 'Apellidos', dob: 'Fecha de nacimiento', extras: 'Extras y preferencias', hotel: 'Buscar hotel', dates: 'Entrada y salida', city: 'Destino', go: 'Continuar a asientos', search: 'Buscar hoteles',
    fare: 'Resumen de tarifa', fareT: [['Tarifa', '184,00 €'], ['Tasas', '41,20 €']], rules: 'Cambios con cargo. No se permiten cambios de nombre tras la reserva.' },
  pl: { brands: ['Podskok Podróże', 'Rybitwa i Kompas'], nav: ['Loty', 'Hotele', 'Pociągi', 'Moje podróże'], h1: 'Dane pasażera', trip: 'Lizbona → Kraków · pt 14 lis · 1 przesiadka',
    first: 'Imię', last: 'Nazwisko', dob: 'Data urodzenia', extras: 'Dodatki i preferencje', hotel: 'Szukaj hotelu', dates: 'Zameldowanie i wymeldowanie', city: 'Cel podróży', go: 'Dalej do miejsc', search: 'Szukaj hoteli',
    fare: 'Podsumowanie ceny', fareT: [['Taryfa', '784,00 zł'], ['Opłaty', '175,60 zł']], rules: 'Zmiany za opłatą. Zmiana nazwiska po rezerwacji nie jest możliwa.' },
};

export const travelBooking = {
  id: 'travel-booking', kind: 'travel',
  hosts: {
    cabin: null, meal: null, guests: null, doctype: T('Travel document|Документ для подорожі|Reisedokument|Documento de viaje|Dokument podróży'),
    country: T('Nationality|Громадянство|Staatsangehörigkeit|Nacionalidad|Obywatelstwo'), currency: T('Show prices in|Показувати ціни в|Preise anzeigen in|Mostrar precios en|Pokaż ceny w'), payment: null,
  },
  make(rng, lang, domId) {
    const v = TR[lang];
    const brand = rng.pick(v.brands);
    const hotel = domId === 'guests';
    return {
      kind: 'travel', brand, title: `${hotel ? v.hotel : v.h1} · ${brand}`, nav: v.nav, slug: 'trips', user: null, crumbs: [v.nav[hotel ? 1 : 0], hotel ? v.hotel : v.h1],
      main(field, ui) {
        if (hotel) return `${h(1, v.hotel)}${ui.input(v.city, '')}${ui.input(v.dates, '')}${field}<p>${ui.btn(v.search, { pri: true })}</p>${p(v.rules, 'muted')}`;
        const top = domId === 'country' || domId === 'doctype';
        return `${h(1, v.h1)}${p(v.trip, 'muted')}${ui.input(v.first, '')}${ui.input(v.last, '')}${ui.input(v.dob, '')}${top ? field : ''}${h(2, v.extras)}${top ? '' : field}<p>${ui.btn(v.go, { pri: true })}</p>`;
      },
      aside: () => `${box(v.fare, table(['', ''], v.fareT))}${box(v.trip, p(v.rules))}`,
    };
  },
};
