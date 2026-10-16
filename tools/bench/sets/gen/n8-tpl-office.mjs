// Templates mail-settings (a webmail client: folders, message list, settings pane), calendar-event (new event
// form beside a month view) and tasks-board (a task's detail panel over a kanban board).
import { T, esc } from './n8-lib.mjs';
import { box, h, list, p, table } from './n8-page.mjs';

const MA = {
  en: { brands: ['Postwick Mail', 'Swiftlark'], folders: ['Inbox (12)', 'Starred', 'Sent', 'Drafts', 'Spam'], nav: ['Mail', 'Contacts', 'Calendar', 'Settings'], h1: 'Settings', sec: 'General',
    sig: 'Signature', away: 'Out-of-office reply', awayV: 'I am away until Monday.', save: 'Save', cancel: 'Cancel', compose: 'New message', to: 'To', subj: 'Subject', send: 'Send',
    msgs: [['Rina Vale', 'Minutes from Tuesday'], ['Delivery desk', 'Your parcel is on its way'], ['Tomo Hart', 'Re: venue for the picnic']] },
  uk: { brands: ['Поштовий двір', 'Стрімкий жайвір'], folders: ['Вхідні (12)', 'Із зірочкою', 'Надіслані', 'Чернетки', 'Спам'], nav: ['Пошта', 'Контакти', 'Календар', 'Налаштування'], h1: 'Налаштування', sec: 'Загальні',
    sig: 'Підпис', away: 'Автовідповідь', awayV: 'Мене не буде до понеділка.', save: 'Зберегти', cancel: 'Скасувати', compose: 'Новий лист', to: 'Кому', subj: 'Тема', send: 'Надіслати',
    msgs: [['Рина Вале', 'Протокол із вівторка'], ['Служба доставки', 'Ваша посилка в дорозі'], ['Томо Гарт', 'Re: місце для пікніка']] },
  de: { brands: ['Postwick Mail', 'Flinklerche'], folders: ['Posteingang (12)', 'Markiert', 'Gesendet', 'Entwürfe', 'Spam'], nav: ['Mail', 'Kontakte', 'Kalender', 'Einstellungen'], h1: 'Einstellungen', sec: 'Allgemein',
    sig: 'Signatur', away: 'Abwesenheitsnotiz', awayV: 'Ich bin bis Montag nicht im Büro.', save: 'Speichern', cancel: 'Abbrechen', compose: 'Neue Nachricht', to: 'An', subj: 'Betreff', send: 'Senden',
    msgs: [['Rina Vale', 'Protokoll von Dienstag'], ['Versandteam', 'Ihr Paket ist unterwegs'], ['Tomo Hart', 'AW: Ort fürs Picknick']] },
  es: { brands: ['Correo Postwick', 'Alondra Veloz'], folders: ['Recibidos (12)', 'Destacados', 'Enviados', 'Borradores', 'Spam'], nav: ['Correo', 'Contactos', 'Calendario', 'Ajustes'], h1: 'Ajustes', sec: 'General',
    sig: 'Firma', away: 'Respuesta de ausencia', awayV: 'Estoy fuera hasta el lunes.', save: 'Guardar', cancel: 'Cancelar', compose: 'Mensaje nuevo', to: 'Para', subj: 'Asunto', send: 'Enviar',
    msgs: [['Rina Vale', 'Acta del martes'], ['Envíos', 'Tu paquete está en camino'], ['Tomo Hart', 'Re: sitio para el pícnic']] },
  pl: { brands: ['Poczta Postwick', 'Zwinny Skowronek'], folders: ['Odebrane (12)', 'Oznaczone', 'Wysłane', 'Robocze', 'Spam'], nav: ['Poczta', 'Kontakty', 'Kalendarz', 'Ustawienia'], h1: 'Ustawienia', sec: 'Ogólne',
    sig: 'Podpis', away: 'Autoodpowiedź', awayV: 'Jestem nieobecny do poniedziałku.', save: 'Zapisz', cancel: 'Anuluj', compose: 'Nowa wiadomość', to: 'Do', subj: 'Temat', send: 'Wyślij',
    msgs: [['Rina Vale', 'Protokół z wtorku'], ['Dział wysyłek', 'Twoja paczka jest w drodze'], ['Tomo Hart', 'Re: miejsce na piknik']] },
};

export const mailSettings = {
  id: 'mail-settings', kind: 'mail',
  hosts: { timezone: null, language: null, priority: T('Importance|Важливість|Wichtigkeit|Importancia|Ważność'), frequency: T('Summary e-mail|Лист-підсумок|Zusammenfassung per E-Mail|Correo de resumen|E-mail z podsumowaniem') },
  make(rng, lang, domId) {
    const v = MA[lang];
    const brand = rng.pick(v.brands);
    const compose = domId === 'priority';
    return {
      kind: 'mail', brand, title: `${compose ? v.compose : v.h1} · ${brand}`, nav: v.nav, slug: 'mail', user: null, crumbs: [compose ? v.compose : v.h1],
      main(field, ui) {
        const msgs = table(['', ''], v.msgs);
        if (compose) return `${msgs}${h(1, v.compose)}${ui.input(v.to, '')}${ui.input(v.subj, '')}${field}${ui.input('', '', { area: true })}<p>${ui.btn(v.send, { pri: true })}</p>`;
        return `${h(1, v.h1)}${h(2, v.sec)}${field}${ui.input(v.sig, '', { area: true })}${ui.input(v.away, v.awayV)}<p>${ui.btn(v.save, { pri: true })} ${ui.btn(v.cancel)}</p>${msgs}`;
      },
      aside: (ui) => `<section>${list(v.folders.map((f) => ui.a(f, '/mail')))}</section>`,
    };
  },
};

const CAL = {
  en: { brands: ['Daybook', 'Tidewatch Calendar'], nav: ['Day', 'Week', 'Month', 'Year'], h1: 'New event', what: 'Title', whatV: 'Dentist check-up', where: 'Location', date: 'Date', dateV: 'Thu 20 Nov 2026',
    rem: 'Reminder: 30 minutes before', save: 'Save event', disc: 'Discard', mon: 'November 2026', ev: ['Mon 17 · Team sync', 'Wed 19 · Piano lesson', 'Sat 22 · Market day'] },
  uk: { brands: ['Щоденник', 'Календар Прилив'], nav: ['День', 'Тиждень', 'Місяць', 'Рік'], h1: 'Нова подія', what: 'Назва', whatV: 'Огляд у стоматолога', where: 'Місце', date: 'Дата', dateV: 'чт, 20 лист. 2026',
    rem: 'Нагадування: за 30 хвилин', save: 'Зберегти подію', disc: 'Скасувати', mon: 'Листопад 2026', ev: ['пн 17 · Зустріч команди', 'ср 19 · Урок фортепіано', 'сб 22 · Ярмарок'] },
  de: { brands: ['Tagbuch', 'Gezeitenkalender'], nav: ['Tag', 'Woche', 'Monat', 'Jahr'], h1: 'Neuer Termin', what: 'Titel', whatV: 'Zahnarzt-Kontrolle', where: 'Ort', date: 'Datum', dateV: 'Do., 20. Nov. 2026',
    rem: 'Erinnerung: 30 Minuten vorher', save: 'Termin speichern', disc: 'Verwerfen', mon: 'November 2026', ev: ['Mo 17 · Team-Abstimmung', 'Mi 19 · Klavierstunde', 'Sa 22 · Markttag'] },
  es: { brands: ['Agenda Diaria', 'Calendario Marea'], nav: ['Día', 'Semana', 'Mes', 'Año'], h1: 'Nuevo evento', what: 'Título', whatV: 'Revisión en el dentista', where: 'Lugar', date: 'Fecha', dateV: 'jue 20 nov 2026',
    rem: 'Aviso: 30 minutos antes', save: 'Guardar evento', disc: 'Descartar', mon: 'Noviembre de 2026', ev: ['lun 17 · Reunión de equipo', 'mié 19 · Clase de piano', 'sáb 22 · Día de mercado'] },
  pl: { brands: ['Dziennik Dnia', 'Kalendarz Przypływ'], nav: ['Dzień', 'Tydzień', 'Miesiąc', 'Rok'], h1: 'Nowe wydarzenie', what: 'Tytuł', whatV: 'Kontrola u dentysty', where: 'Miejsce', date: 'Data', dateV: 'czw., 20 lis 2026',
    rem: 'Przypomnienie: 30 minut wcześniej', save: 'Zapisz wydarzenie', disc: 'Odrzuć', mon: 'Listopad 2026', ev: ['pon 17 · Spotkanie zespołu', 'śr 19 · Lekcja pianina', 'sob 22 · Dzień targowy'] },
};

export const calendarEvent = {
  id: 'calendar-event', kind: 'calendar',
  hosts: { timeslot: T('Starts at|Початок|Beginn|Empieza a las|Początek'), timezone: null, frequency: T('Repeats|Повторення|Wiederholung|Se repite|Powtarzanie') },
  make(rng, lang) {
    const v = CAL[lang];
    const brand = rng.pick(v.brands);
    return {
      kind: 'calendar', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'cal', user: null, crumbs: [v.mon, v.h1],
      main: (field, ui) => `${h(1, v.h1)}${ui.input(v.what, v.whatV)}${ui.input(v.date, v.dateV)}${field}${ui.input(v.where, '')}${p(v.rem, 'muted')}<p>${ui.btn(v.save, { pri: true })} ${ui.btn(v.disc)}</p>`,
      aside: () => box(v.mon, list(v.ev.map(esc))),
    };
  },
};

const TA = {
  en: { brands: ['Kanbrook', 'Taskwell'], nav: ['Boards', 'My tasks', 'Calendar', 'Reports'], cols: ['To do', 'In progress', 'Done'], h1: 'Fix the export of monthly reports', desc: 'Exports over 5,000 rows time out. Split them into pages.',
    assignee: 'Assignee', assV: 'Jona Pell', share: 'Share this board', email: 'E-mail', save: 'Save', act: 'Activity', actT: ['Jona moved this to In progress', 'Ivy added a checklist'] },
  uk: { brands: ['Канбрук', 'Справник'], nav: ['Дошки', 'Мої завдання', 'Календар', 'Звіти'], cols: ['Зробити', 'В роботі', 'Готово'], h1: 'Виправити експорт місячних звітів', desc: 'Експорт понад 5 000 рядків обривається за тайм-аутом. Розбийте на сторінки.',
    assignee: 'Виконавець', assV: 'Йона Пель', share: 'Поділитися дошкою', email: 'Пошта', save: 'Зберегти', act: 'Активність', actT: ['Йона перемістив у «В роботі»', 'Іва додала чек-лист'] },
  de: { brands: ['Kanbach', 'Aufgabenwerk'], nav: ['Boards', 'Meine Aufgaben', 'Kalender', 'Berichte'], cols: ['Offen', 'In Arbeit', 'Erledigt'], h1: 'Export der Monatsberichte reparieren', desc: 'Exporte über 5.000 Zeilen laufen in ein Timeout. In Seiten aufteilen.',
    assignee: 'Zuständig', assV: 'Jona Pell', share: 'Board teilen', email: 'E-Mail', save: 'Speichern', act: 'Aktivität', actT: ['Jona hat dies nach In Arbeit verschoben', 'Ivy hat eine Checkliste ergänzt'] },
  es: { brands: ['Kanarroyo', 'Tareabién'], nav: ['Tableros', 'Mis tareas', 'Calendario', 'Informes'], cols: ['Pendiente', 'En curso', 'Hecho'], h1: 'Arreglar la exportación de informes mensuales', desc: 'Las exportaciones de más de 5.000 filas agotan el tiempo. Divídelas en páginas.',
    assignee: 'Responsable', assV: 'Jona Pell', share: 'Compartir tablero', email: 'Correo', save: 'Guardar', act: 'Actividad', actT: ['Jona lo movió a En curso', 'Ivy añadió una lista'] },
  pl: { brands: ['Kanbrook', 'Zadaniownik'], nav: ['Tablice', 'Moje zadania', 'Kalendarz', 'Raporty'], cols: ['Do zrobienia', 'W toku', 'Zrobione'], h1: 'Napraw eksport raportów miesięcznych', desc: 'Eksport powyżej 5000 wierszy przekracza limit czasu. Podziel go na strony.',
    assignee: 'Wykonawca', assV: 'Jona Pell', share: 'Udostępnij tablicę', email: 'E-mail', save: 'Zapisz', act: 'Aktywność', actT: ['Jona przeniósł to do W toku', 'Ivy dodała listę kontrolną'] },
};

export const tasksBoard = {
  id: 'tasks-board', kind: 'tasks',
  hosts: { priority: null, frequency: T('Recurring|Повторюване|Wiederkehrend|Recurrente|Cykliczne'), role: T('Board access|Доступ до дошки|Board-Zugriff|Acceso al tablero|Dostęp do tablicy') },
  make(rng, lang, domId) {
    const v = TA[lang];
    const brand = rng.pick(v.brands);
    return {
      kind: 'tasks', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'tasks', user: null, crumbs: [v.nav[0], v.cols[1]],
      main(field, ui) {
        const board = `<div class="cols">${v.cols.map((c) => `<div><strong>${esc(c)}</strong></div>`).join('')}</div>`;
        if (domId === 'role') return `${board}${h(1, v.share)}${ui.input(v.email, '')}${field}<p>${ui.btn(v.save, { pri: true })}</p>`;
        return `${board}${h(1, v.h1)}${p(v.desc)}${ui.input(v.assignee, v.assV)}${field}<p>${ui.btn(v.save, { pri: true })}</p>`;
      },
      aside: () => box(v.act, list(v.actT.map(esc))),
    };
  },
};
