// Template calendar-event: a meeting invitation in a web calendar. Result: the video call link.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Dayfold Calendar', 'Almanac Lane', 'Sundial Planner'], nav: ['Day', 'Week', 'Month', 'Agenda', 'Settings'],
    titles: ['Quarterly budget review', 'Kitchen renovation walkthrough', 'Volunteer rota planning'], code: 'Event code', org: 'Organiser', when: 'Date', time: '10:30–11:15', rsvp: 'Your answer',
    ladder: ['Proposed', 'Maybe', 'Going'], neg: ['Declined', 'You declined the invitation to {ref}. The event is not on your calendar.'], join: 'Join video call',
    pend: 'No call link yet: the organiser will add one before the meeting.', queued: 'The invitation to {ref} is still being sent to guests.',
    up: 'Coming up', ups: ['Dentist, 08:15', 'Team lunch, 12:30'], tz: 'Time zone: UTC+02:00',
    E: { main: 'The calendar event {ref} organised by {who}', res: 'The link to join the call for {ref}', num: 'Event {ref} scheduled for {num}', status: 'The invitation to {ref} has been accepted' },
  },
  uk: {
    brands: ['Календар Днина', 'Алманах', 'Планер Сонячний годинник'], nav: ['День', 'Тиждень', 'Місяць', 'Порядок денний', 'Налаштування'],
    titles: ['Квартальний огляд бюджету', 'Огляд ремонту кухні', 'Планування чергувань волонтерів'], code: 'Код події', org: 'Організатор', when: 'Дата', time: '10:30–11:15', rsvp: 'Ваша відповідь',
    ladder: ['Запропоновано', 'Можливо', 'Піду'], neg: ['Відхилено', 'Ви відхилили запрошення на {ref}. Події немає у вашому календарі.'], join: 'Приєднатися до відеодзвінка',
    pend: 'Посилання на дзвінок ще немає: організатор додасть його перед зустріччю.', queued: 'Запрошення на {ref} ще надсилається гостям.',
    up: 'Найближче', ups: ['Стоматолог, 08:15', 'Обід з командою, 12:30'], tz: 'Часовий пояс: UTC+02:00',
    E: { main: 'Подія {ref} у календарі (організатор: {who})', res: 'Посилання для входу на дзвінок {ref}', num: 'Подія {ref}, запланована на {num}', status: 'Запрошення на {ref} прийнято' },
  },
  de: {
    brands: ['Tagfalter Kalender', 'Almanach-Gasse', 'Sonnenuhr Planer'], nav: ['Tag', 'Woche', 'Monat', 'Agenda', 'Einstellungen'],
    titles: ['Quartalsbudget-Besprechung', 'Begehung Küchenumbau', 'Planung Helferdienste'], code: 'Termincode', org: 'Organisator(in)', when: 'Datum', time: '10:30–11:15', rsvp: 'Ihre Antwort',
    ladder: ['Vorgeschlagen', 'Vielleicht', 'Zugesagt'], neg: ['Abgesagt', 'Sie haben die Einladung zu {ref} abgelehnt. Der Termin steht nicht in Ihrem Kalender.'], join: 'Videoanruf beitreten',
    pend: 'Noch kein Anruflink: Die Organisatorin fügt ihn vor dem Termin hinzu.', queued: 'Die Einladung zu {ref} wird noch an die Gäste verschickt.',
    up: 'Demnächst', ups: ['Zahnarzt, 08:15', 'Teamessen, 12:30'], tz: 'Zeitzone: UTC+02:00',
    E: { main: 'Der Kalendertermin {ref}, organisiert von {who}', res: 'Der Link zum Videoanruf für {ref}', num: 'Termin {ref} am {num}', status: 'Die Einladung zu {ref} wurde angenommen' },
  },
  pl: {
    brands: ['Kalendarz Dzionek', 'Zaułek Almanachu', 'Planer Zegar Słoneczny'], nav: ['Dzień', 'Tydzień', 'Miesiąc', 'Agenda', 'Ustawienia'],
    titles: ['Kwartalny przegląd budżetu', 'Obchód remontu kuchni', 'Planowanie dyżurów wolontariuszy'], code: 'Kod wydarzenia', org: 'Organizator', when: 'Data', time: '10:30–11:15', rsvp: 'Twoja odpowiedź',
    ladder: ['Zaproponowane', 'Może', 'Biorę udział'], neg: ['Odrzucone', 'Odrzucono zaproszenie na {ref}. Wydarzenia nie ma w Twoim kalendarzu.'], join: 'Dołącz do rozmowy wideo',
    pend: 'Nie ma jeszcze linku do rozmowy: organizator doda go przed spotkaniem.', queued: 'Zaproszenie na {ref} jest jeszcze wysyłane do gości.',
    up: 'Wkrótce', ups: ['Dentysta, 08:15', 'Lunch zespołu, 12:30'], tz: 'Strefa czasowa: UTC+02:00',
    E: { main: 'Wydarzenie {ref} w kalendarzu (organizator: {who})', res: 'Link do rozmowy dla {ref}', num: 'Wydarzenie {ref} zaplanowane na {num}', status: 'Zaproszenie na {ref} zostało przyjęte' },
  },
};

export const calendarEvent = {
  id: 'calendar-event', kind: 'calendar', langs: ['en', 'uk', 'de', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `EV-${2100 + r.int(7800)}`, spec: { type: 'date' } });
    const v = c.v;
    const t = rng.pick(v.titles);
    const room = `${100 + rng.int(900)}-${1000 + rng.int(9000)}`;
    return {
      ...c, kind: 'calendar', nav: v.nav, slug: 'cal', crumbs: [v.nav[3]], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: () => `${t} · ${c.brand}`, at: (ref) => `/calendar/event/${ref.toLowerCase()}`, resText: room, loadTitle: v.nav[3],
      en: { thing: 'event', res: 'call link', num: 'date' },
      main(x, ui) {
        const res = `<p>${ui.a(v.join, `/call/${room}`)} <span class="muted">${room}</span></p>`;
        return `<h1>${esc(t)}</h1>${rows([[v.code, esc(x.ref)], [v.org, esc(x.who)], [v.when, `${esc(x.num)}, ${v.time}`], [v.rsvp, stageBadge(x)]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: () => box(v.up, list(v.ups.map(esc))) + `<p class="muted">${esc(v.tz)}</p>`,
    };
  },
};
