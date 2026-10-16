// Templates gov-form (a municipal e-services application: personal details, documents, appointment) and
// support-contact (a help centre's contact form with article suggestions).
import { T, esc } from './n8-lib.mjs';
import { box, h, list, p } from './n8-page.mjs';

const GV = {
  en: { brands: ['City of Eastmere e-Services', 'Westholm Civic Portal'], nav: ['Services', 'Permits', 'Taxes', 'Contact'], h1: 'Apply for a residents’ parking permit', step: 'Section 2 of 4: About you',
    first: 'Given name(s)', last: 'Surname', pid: 'Personal identification number', doc: 'Proof of identity', appt: 'Book an appointment', apptP: 'Bring the original documents to the Civic Centre, desk 4.',
    next: 'Next section', save: 'Save draft', help: 'Help with this form', helpT: 'Fields marked * are required. Your answers are kept for 30 days.', other: 'Other services', oth: ['Register a birth', 'Report a pothole', 'Waste collection days'] },
  uk: { brands: ['Е-послуги міста Східне Озеро', 'Портал громади Західний Горб'], nav: ['Послуги', 'Дозволи', 'Податки', 'Контакти'], h1: 'Заява на паркувальний дозвіл мешканця', step: 'Розділ 2 з 4: Про вас',
    first: 'Ім’я', last: 'Прізвище', pid: 'Податковий номер', doc: 'Підтвердження особи', appt: 'Запис на прийом', apptP: 'Принесіть оригінали документів до ЦНАП, вікно 4.',
    next: 'Наступний розділ', save: 'Зберегти чернетку', help: 'Допомога з формою', helpT: 'Поля із * обов’язкові. Відповіді зберігаються 30 днів.', other: 'Інші послуги', oth: ['Реєстрація народження', 'Повідомити про яму', 'Графік вивезення сміття'] },
  de: { brands: ['Bürgerservice Ostmeer', 'Stadtportal Westholm'], nav: ['Leistungen', 'Genehmigungen', 'Steuern', 'Kontakt'], h1: 'Bewohnerparkausweis beantragen', step: 'Abschnitt 2 von 4: Angaben zur Person',
    first: 'Vorname(n)', last: 'Familienname', pid: 'Steuer-Identifikationsnummer', doc: 'Identitätsnachweis', appt: 'Termin vereinbaren', apptP: 'Bringen Sie die Originale ins Bürgeramt, Schalter 4.',
    next: 'Nächster Abschnitt', save: 'Entwurf speichern', help: 'Hilfe zum Formular', helpT: 'Mit * markierte Felder sind Pflicht. Ihre Angaben werden 30 Tage gespeichert.', other: 'Weitere Leistungen', oth: ['Geburt anmelden', 'Schlagloch melden', 'Abfuhrtermine'] },
  es: { brands: ['Sede electrónica de Lagoeste', 'Portal Ciudadano de Villaoeste'], nav: ['Trámites', 'Permisos', 'Impuestos', 'Contacto'], h1: 'Solicitar la tarjeta de aparcamiento para residentes', step: 'Apartado 2 de 4: Tus datos',
    first: 'Nombre', last: 'Apellidos', pid: 'Número de identificación fiscal', doc: 'Acreditación de identidad', appt: 'Pedir cita', apptP: 'Trae los documentos originales a la Oficina de Atención Ciudadana, mesa 4.',
    next: 'Siguiente apartado', save: 'Guardar borrador', help: 'Ayuda con el formulario', helpT: 'Los campos con * son obligatorios. Guardamos tus respuestas 30 días.', other: 'Otros trámites', oth: ['Inscribir un nacimiento', 'Avisar de un bache', 'Días de recogida'] },
  pl: { brands: ['e-Urząd Miasta Wschodnie Jezioro', 'Portal Mieszkańca Zachodni Gród'], nav: ['Usługi', 'Zezwolenia', 'Podatki', 'Kontakt'], h1: 'Wniosek o abonament parkingowy mieszkańca', step: 'Część 2 z 4: Dane osobowe',
    first: 'Imię (imiona)', last: 'Nazwisko', pid: 'Numer identyfikacyjny', doc: 'Potwierdzenie tożsamości', appt: 'Umów wizytę', apptP: 'Przynieś oryginały dokumentów do Biura Obsługi, stanowisko 4.',
    next: 'Następna część', save: 'Zapisz wersję roboczą', help: 'Pomoc w wypełnianiu', helpT: 'Pola oznaczone * są wymagane. Odpowiedzi przechowujemy 30 dni.', other: 'Inne usługi', oth: ['Rejestracja urodzenia', 'Zgłoś dziurę w jezdni', 'Harmonogram wywozu'] },
};

export const govForm = {
  id: 'gov-form', kind: 'gov',
  hosts: {
    marital: null, doctype: null, timeslot: T('Appointment time|Час прийому|Uhrzeit des Termins|Hora de la cita|Godzina wizyty'),
    country: T('Citizenship|Громадянство|Staatsangehörigkeit|Nacionalidad|Obywatelstwo'), language: T('Language for letters|Мова листування|Sprache für Schreiben|Idioma de las cartas|Język korespondencji'),
  },
  make(rng, lang, domId) {
    const v = GV[lang];
    const brand = rng.pick(v.brands);
    const sect = domId === 'timeslot' ? v.appt : domId === 'doctype' ? v.doc : null;
    return {
      kind: 'gov', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'eservices', user: null, crumbs: [v.nav[0], v.nav[1], v.h1],
      main(field, ui) {
        const who = `${ui.input(`${v.first} *`, '')}${ui.input(`${v.last} *`, '')}${ui.input(v.pid, '')}`;
        const tail = sect ? `${h(2, sect)}${domId === 'timeslot' ? p(v.apptP) : ''}${field}` : '';
        return `${h(1, v.h1)}${p(v.step, 'muted')}${who}${sect ? '' : field}${tail}<p>${ui.btn(v.next, { pri: true })} ${ui.btn(v.save)}</p>`;
      },
      aside: (ui) => `${box(v.help, p(v.helpT))}${box(v.other, list(v.oth.map((o) => ui.a(o, '/eservices'))))}`,
    };
  },
};

const SU = {
  en: { brands: ['Helpdesk · Fernbrook Energy', 'Support · Quayside Mobile'], nav: ['Help centre', 'My requests', 'Status', 'Community'], h1: 'Contact support', intro: 'Tell us what happened. We usually reply within one working day.',
    name: 'Your name', email: 'E-mail', msg: 'Describe the problem', send: 'Send request', call: 'Request a callback', sug: 'Suggested articles', arts: ['How to read your bill', 'Reset your password', 'Moving house?'], hours: 'Phone lines: Mon–Fri 8:00–20:00' },
  uk: { brands: ['Підтримка · Папоротна енергія', 'Підтримка · Набережний зв’язок'], nav: ['Довідка', 'Мої звернення', 'Стан сервісів', 'Спільнота'], h1: 'Звернутися до підтримки', intro: 'Розкажіть, що сталося. Зазвичай відповідаємо протягом одного робочого дня.',
    name: 'Ваше ім’я', email: 'Пошта', msg: 'Опишіть проблему', send: 'Надіслати звернення', call: 'Замовити дзвінок', sug: 'Корисні статті', arts: ['Як читати рахунок', 'Скинути пароль', 'Переїжджаєте?'], hours: 'Телефон: пн–пт 8:00–20:00' },
  de: { brands: ['Hilfe · Farnbach Energie', 'Support · Kaimobil'], nav: ['Hilfe', 'Meine Anfragen', 'Status', 'Community'], h1: 'Support kontaktieren', intro: 'Beschreiben Sie, was passiert ist. Wir antworten meist innerhalb eines Werktags.',
    name: 'Ihr Name', email: 'E-Mail', msg: 'Problem beschreiben', send: 'Anfrage senden', call: 'Rückruf anfordern', sug: 'Passende Artikel', arts: ['Ihre Rechnung verstehen', 'Passwort zurücksetzen', 'Umzug geplant?'], hours: 'Telefon: Mo–Fr 8–20 Uhr' },
  es: { brands: ['Ayuda · Energía Helechal', 'Soporte · Muelle Móvil'], nav: ['Centro de ayuda', 'Mis solicitudes', 'Estado', 'Comunidad'], h1: 'Contactar con soporte', intro: 'Cuéntanos qué ha pasado. Solemos responder en un día laborable.',
    name: 'Tu nombre', email: 'Correo', msg: 'Describe el problema', send: 'Enviar solicitud', call: 'Solicitar llamada', sug: 'Artículos sugeridos', arts: ['Cómo leer tu factura', 'Restablecer la contraseña', '¿Te mudas?'], hours: 'Teléfono: lun–vie 8:00–20:00' },
  pl: { brands: ['Pomoc · Paprociowa Energia', 'Wsparcie · Nabrzeże Mobile'], nav: ['Centrum pomocy', 'Moje zgłoszenia', 'Status', 'Społeczność'], h1: 'Kontakt z pomocą', intro: 'Opisz, co się stało. Zwykle odpowiadamy w ciągu jednego dnia roboczego.',
    name: 'Imię i nazwisko', email: 'E-mail', msg: 'Opisz problem', send: 'Wyślij zgłoszenie', call: 'Zamów rozmowę', sug: 'Polecane artykuły', arts: ['Jak czytać rachunek', 'Resetowanie hasła', 'Przeprowadzka?'], hours: 'Infolinia: pn–pt 8:00–20:00' },
};

export const supportContact = {
  id: 'support-contact', kind: 'support',
  hosts: {
    category: null, priority: null, timeslot: T('Call me back at|Передзвоніть мені о|Rückruf um|Llamadme a las|Oddzwońcie o'),
    language: T('Preferred language|Бажана мова|Bevorzugte Sprache|Idioma preferido|Preferowany język'), country: T('Country|Країна|Land|País|Kraj'),
  },
  make(rng, lang, domId) {
    const v = SU[lang];
    const brand = rng.pick(v.brands);
    const call = domId === 'timeslot';
    return {
      kind: 'support', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'help', user: null, crumbs: [v.nav[0], v.h1],
      main(field, ui) {
        const who = `${ui.input(v.name, '')}${ui.input(v.email, '')}`;
        if (call) return `${h(1, v.h1)}${p(v.intro)}${h(2, v.call)}${who}${field}<p>${ui.btn(v.call, { pri: true })}</p>`;
        return `${h(1, v.h1)}${p(v.intro)}${who}${field}${ui.input(v.msg, '', { area: true })}<p>${ui.btn(v.send, { pri: true })}</p>`;
      },
      aside: (ui) => `${box(v.sug, list(v.arts.map((a) => ui.a(a, '/help/a'))))}<section>${esc(v.hours)}</section>`,
    };
  },
};
