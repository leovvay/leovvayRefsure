// Template calendar-move: a day agenda with an event editor open; the step saves a new start time for one event.
// Wrong item: a near-twin event (same name, other team) moves instead. Invalid: the room is taken.
import { esc, fill, fmtClock } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Dayplot', 'Hourglass Calendar', 'Brightweek'], nav: ['Day', 'Week', 'Month', 'Tasks'], users: ['Mara Quint', 'Owen Strick', 'Priya Calder'],
    events: [['Team sync', 'Team sync – design'], ['Budget review', 'Budget review (draft)'], ['Dentist', 'Dentist – Lily'], ['Supplier call', 'Supplier call – packaging']],
    fill: ['Lunch with Ana', 'Focus time', 'School pickup'], day: 'Thursday 23 October', agenda: 'Agenda', edit: 'Edit event', start: 'Starts', end: 'Ends', room: 'Room', rooms: ['Atlas', 'Birch', 'Cedar'],
    save: 'Save', cancel: 'Cancel', mini: 'October 2026', soon: 'Coming up', soonTxt: 'Quarterly planning · Monday 09:30',
    ok: '"{e}" moved to {t}', bad: '"{w}" moved to {t}', invalid: 'Room {r} is booked from {t}. Pick another room or time.',
    intent: 'move "{e}" to start at {t}', confirm: 'Move "{e}" to {t}? Guests will be notified.', dTitle: 'Event details', guests: 'Guests notified of the new time',
  },
  uk: {
    brands: ['Розклад', 'Пісочний годинник', 'Світлий тиждень'], nav: ['День', 'Тиждень', 'Місяць', 'Завдання'], users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук'],
    events: [['Синк команди', 'Синк команди – дизайн'], ['Огляд бюджету', 'Огляд бюджету (чернетка)'], ['Стоматолог', 'Стоматолог – Ліля'], ['Дзвінок постачальнику', 'Дзвінок постачальнику – пакування']],
    fill: ['Обід з Анною', 'Час для зосередження', 'Забрати зі школи'], day: 'Четвер, 23 жовтня', agenda: 'Порядок дня', edit: 'Редагувати подію', start: 'Початок', end: 'Кінець', room: 'Кімната', rooms: ['Атлас', 'Береза', 'Кедр'],
    save: 'Зберегти', cancel: 'Скасувати', mini: 'Жовтень 2026', soon: 'Найближче', soonTxt: 'Квартальне планування · понеділок 09:30',
    ok: '«{e}» перенесено на {t}', bad: '«{w}» перенесено на {t}', invalid: 'Кімнату «{r}» заброньовано з {t}. Оберіть іншу кімнату або час.',
    intent: 'перенести «{e}» на {t}', confirm: 'Перенести «{e}» на {t}? Учасників буде сповіщено.', dTitle: 'Подробиці події', guests: 'Учасників сповіщено про новий час',
  },
  de: {
    brands: ['Tagplan', 'Sanduhr Kalender', 'Hellwoche'], nav: ['Tag', 'Woche', 'Monat', 'Aufgaben'], users: ['Lena Brückner', 'Jonas Hellwig', 'Mia Kessler'],
    events: [['Team-Sync', 'Team-Sync – Design'], ['Budgetrunde', 'Budgetrunde (Entwurf)'], ['Zahnarzt', 'Zahnarzt – Lilli'], ['Lieferantentermin', 'Lieferantentermin – Verpackung']],
    fill: ['Mittagessen mit Ana', 'Fokuszeit', 'Kita abholen'], day: 'Donnerstag, 23. Oktober', agenda: 'Tagesplan', edit: 'Termin bearbeiten', start: 'Beginn', end: 'Ende', room: 'Raum', rooms: ['Atlas', 'Birke', 'Zeder'],
    save: 'Speichern', cancel: 'Abbrechen', mini: 'Oktober 2026', soon: 'Demnächst', soonTxt: 'Quartalsplanung · Montag 09:30',
    ok: '„{e}“ auf {t} verschoben', bad: '„{w}“ auf {t} verschoben', invalid: 'Raum {r} ist ab {t} belegt. Wählen Sie einen anderen Raum oder eine andere Zeit.',
    intent: '„{e}“ auf {t} Uhr verschieben', confirm: '„{e}“ auf {t} verschieben? Teilnehmende werden benachrichtigt.', dTitle: 'Termindetails', guests: 'Teilnehmende über die neue Zeit benachrichtigt',
  },
};

export const calendarMove = {
  id: 'calendar-move', kind: 'calendar', langs: ['en', 'uk', 'de'],
  make(rng, lang, il) {
    const v = V[lang];
    const pair = rng.pick(v.events);
    const [e, w] = rng.chance(0.5) ? pair : [pair[1], pair[0]];
    const slots = rng.shuffle([9, 10, 11, 13, 14, 15, 16, 17]).map((h) => h * 60 + (rng.chance(0.5) ? 30 : 0));
    const [oldE, oldW, newT, f1, f2] = slots;
    const t = fmtClock(newT);
    const r = rng.pick(v.rooms);
    const brand = rng.pick(v.brands);
    const filler2 = v.fill[rng.int(2) + 1];
    const vars = { e, w, t, r };
    const agenda = (state) => [[e, state === 'done' ? newT : oldE], [w, state === 'wrong' ? newT : oldW], [v.fill[0], f1], [filler2, f2]]
      .sort((x, y) => x[1] - y[1]).map(([n, m]) => `<strong>${fmtClock(m)}–${fmtClock(m + 30)}</strong> ${esc(n)}`);
    const shownAgenda = { before: agenda('before'), done: agenda('done'), wrong: agenda('wrong') };
    return {
      kind: 'calendar', brand, title: `${e} – ${brand}`, at: `/day/2026-10-23/event/${500 + rng.int(500)}`, nav: v.nav, slug: 'cal', user: rng.pick(v.users),
      crumbs: [v.day], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const rows = shownAgenda[state] ?? shownAgenda.before;
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(fill(v.invalid, vars))}</p>` : '';
        return `<h1>${esc(v.day)}</h1><h2>${esc(v.agenda)}</h2>${list(rows)}<div class="card"><h2>${esc(v.edit)}: ${esc(e)}</h2>${ui.input(v.start, t)}${ui.input(v.end, fmtClock(newT + 30))}${ui.select(v.room, v.rooms, r)}${err}<p>${ui.btn(v.save, { pri: true, acted: true })} ${ui.btn(v.cancel)}</p></div>`;
      },
      aside(state, ui) {
        return box(v.mini, `<p>${ui.a('‹', '/m/9')} ${ui.a('›', '/m/11')}</p>`) + box(v.soon, `<p>${esc(v.soonTxt)}</p>`);
      },
      ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: fill(v.invalid, vars), confirmQ: fill(v.confirm, vars),
      confirm: {
        at: '/day/2026-10-23/event/saved', title: `${v.dTitle} – ${brand}`,
        main(ui) {
          return `<h1>${esc(e)}</h1><p>${esc(v.day)} · <strong>${t}–${fmtClock(newT + 30)}</strong> · ${esc(v.room)} ${esc(r)}</p><p class="muted">${esc(v.guests)}</p><p>${ui.a(v.nav[0], '/day')}</p>`;
        },
      },
      errAt: '/day/2026-10-23/event/save',
      why: {
        change: `the agenda now lists "${e}" at ${t} (it was at ${fmtClock(oldE)})`,
        wrong: `"${w}" moved to ${t} while "${e}" stays at ${fmtClock(oldE)}`,
        unchanged: `the agenda still lists "${e}" at ${fmtClock(oldE)}`,
        confirm: `shows "${e}" on the same day at ${t}`,
      },
    };
  },
};
