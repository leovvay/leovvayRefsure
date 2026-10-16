// Template saas-timezone: personal settings in a SaaS workspace; the step saves a new personal time zone.
// Wrong item: the workspace default changes instead. Invalid: another field on the form blocks the save.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const ZONES = ['Europe/Lisbon (UTC+00:00)', 'Europe/Warsaw (UTC+01:00)', 'Europe/Kyiv (UTC+02:00)', 'Asia/Tbilisi (UTC+04:00)', 'Asia/Dubai (UTC+04:00)', 'America/New_York (UTC−05:00)', 'America/Toronto (UTC−05:00)', 'Asia/Kolkata (UTC+05:30)'];

const V = {
  en: {
    brands: ['Taskloom', 'Quillery', 'Brightpane', 'Orbitdesk'], nav: ['Home', 'Projects', 'Reports', 'Settings'], users: ['Mara Quint', 'Owen Strick', 'Priya Calder', 'Tobias Fenwick'],
    side: ['Profile', 'Notifications', 'Security', 'Connected apps', 'Billing'], h: 'Profile', name: 'Display name', tz: 'Time zone', lang: 'Language', langs: ['English (UK)', 'English (US)'],
    save: 'Save changes', cancel: 'Discard', sum: 'Current settings', mine: 'Your time zone', ws: 'Workspace default time zone', help: 'Times in reports, reminders and due dates use your time zone.',
    ok: 'Profile saved', bad: 'Workspace default time zone updated to {z}', invalid: 'The time zone was not recognised. Choose one from the list.',
    intent: 'change my time zone to {z}', confirm: 'Change your time zone to {z}?', sec: 'Two-step sign-in is on.', plan: 'Team plan · 14 seats',
  },
  uk: {
    brands: ['Робосад', 'Планівка', 'Ясновид'], nav: ['Головна', 'Проєкти', 'Звіти', 'Налаштування'], users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук', 'Остап Дячук'],
    side: ['Профіль', 'Сповіщення', 'Безпека', 'Підключені застосунки', 'Оплата'], h: 'Профіль', name: 'Ім’я для показу', tz: 'Часовий пояс', lang: 'Мова', langs: ['Українська', 'English (UK)'],
    save: 'Зберегти зміни', cancel: 'Скасувати', sum: 'Поточні налаштування', mine: 'Ваш часовий пояс', ws: 'Часовий пояс робочого простору', help: 'Час у звітах, нагадуваннях і термінах показано у вашому часовому поясі.',
    ok: 'Профіль збережено', bad: 'Часовий пояс робочого простору змінено на {z}', invalid: 'Часовий пояс не розпізнано. Оберіть його зі списку.',
    intent: 'змінити мій часовий пояс на {z}', confirm: 'Змінити ваш часовий пояс на {z}?', sec: 'Двоетапний вхід увімкнено.', plan: 'Тариф «Команда» · 14 місць',
  },
  de: {
    brands: ['Werkraum', 'Taktwerk', 'Klarblick'], nav: ['Start', 'Projekte', 'Berichte', 'Einstellungen'], users: ['Lena Brückner', 'Jonas Hellwig', 'Mia Kessler'],
    side: ['Profil', 'Benachrichtigungen', 'Sicherheit', 'Verbundene Apps', 'Abrechnung'], h: 'Profil', name: 'Anzeigename', tz: 'Zeitzone', lang: 'Sprache', langs: ['Deutsch', 'English (UK)'],
    save: 'Änderungen speichern', cancel: 'Verwerfen', sum: 'Aktuelle Einstellungen', mine: 'Ihre Zeitzone', ws: 'Standard-Zeitzone des Arbeitsbereichs', help: 'Zeiten in Berichten, Erinnerungen und Fristen richten sich nach Ihrer Zeitzone.',
    ok: 'Profil gespeichert', bad: 'Standard-Zeitzone des Arbeitsbereichs auf {z} geändert', invalid: 'Die Zeitzone wurde nicht erkannt. Bitte wählen Sie eine aus der Liste.',
    intent: 'meine Zeitzone auf {z} ändern', confirm: 'Ihre Zeitzone auf {z} ändern?', sec: 'Zwei-Faktor-Anmeldung ist aktiv.', plan: 'Team-Tarif · 14 Plätze',
  },
};

export const saasTimezone = {
  id: 'saas-timezone', kind: 'saas', langs: ['en', 'uk', 'de'],
  make(rng, lang, il) {
    const v = V[lang];
    const [oldZ, z, wsZ] = rng.shuffle(ZONES).slice(0, 3);
    const user = rng.pick(v.users);
    const brand = rng.pick(v.brands);
    const vars = { z };
    const shown = (state) => ({ mine: state === 'done' ? z : oldZ, ws: state === 'wrong' ? z : wsZ });
    return {
      kind: 'saas', brand, title: `${v.h} · ${brand}`, at: '/settings/profile', nav: v.nav, slug: 'app', user,
      crumbs: [v.nav[3], v.h], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const nameVal = user;
        const err = state === 'invalid' ? v.invalid : '';
        const s = shown(state);
        return `<h1>${esc(v.h)}</h1><div class="card"><h2>${esc(v.sum)}</h2>${list([`${esc(v.mine)}: <strong>${esc(s.mine)}</strong>`, `${esc(v.ws)}: ${esc(s.ws)}`])}</div>
${ui.input(v.name, nameVal)}${ui.select(v.tz, ZONES, z)}${err ? `<p class="err" role="alert">${esc(err)}</p>` : ''}${ui.select(v.lang, v.langs, v.langs[0])}<p class="muted">${esc(v.help)}</p><p>${ui.btn(v.save, { pri: true, acted: true })} ${ui.btn(v.cancel)}</p>`;
      },
      aside(state, ui) {
        return `<section>${list(v.side.map((x) => ui.a(x, '/settings')))}</section>${box(v.side[2], `<p>${esc(v.sec)}</p>`)}${box(v.side[4], `<p>${esc(v.plan)}</p>`)}`;
      },
      ok: v.ok, bad: fill(v.bad, vars), invalid: v.invalid, confirmQ: fill(v.confirm, vars),
      confirm: {
        at: '/settings/profile?saved=1', title: `${v.h} · ${brand}`,
        main(ui) {
          return `<h1>${esc(v.h)}</h1><div class="card" role="status"><strong>${esc(v.ok)}</strong></div><div class="card"><h2>${esc(v.sum)}</h2>${list([`${esc(v.mine)}: <strong>${esc(z)}</strong>`, `${esc(v.ws)}: ${esc(wsZ)}`])}</div><p>${ui.a(v.nav[0], '/')}</p>`;
        },
      },
      errAt: '/settings/profile',
      why: {
        change: `the current settings now list ${z} as the personal time zone (it was ${oldZ})`,
        wrong: `the workspace default time zone became ${z} while the personal time zone stayed ${oldZ}`,
        unchanged: `the personal time zone still reads ${oldZ}`,
        confirm: `shows "${v.ok}" and the personal time zone ${z}`,
      },
    };
  },
};
