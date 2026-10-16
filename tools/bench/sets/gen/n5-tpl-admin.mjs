// Template admin-role: a members table in an admin console with a role picker and "Save" on every row; the step
// saves a new role for one member. Wrong item: a near-twin member (same name, other email) changes. Invalid: no
// seats left for the role. The acted "Save" button carries its ordinal.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Ledgerline Admin', 'Northwind Console', 'Pinecrest Workspace'], nav: ['Dashboard', 'Members', 'Groups', 'Billing', 'Audit log'], users: ['Mara Quint', 'Owen Strick'],
    people: [['Alex Morgan', 'alex.morgan@', 'a.morgan@'], ['Sam Okafor', 'sam.okafor@', 'sam.okafor2@'], ['Jordan Lee', 'jordan.lee@', 'jlee@'], ['Robin Hale', 'robin.hale@', 'robin.h@']],
    fillers: [['Nadia Brook', 'nadia.brook@'], ['Theo Marsh', 'theo.marsh@'], ['Ivy Chen', 'ivy.chen@']], roles: ['Owner', 'Admin', 'Editor', 'Viewer'],
    h: 'Members', name: 'Name', email: 'Email', role: 'Role', save: 'Save', invite: 'Invite member', seats: 'Seats', seatTxt: 'Team plan · billed yearly · renews 1 March', audit: 'Recent changes',
    ok: 'Role updated: {p} is now {r}', bad: 'Role updated: {p} ({w}) is now {r}', invalid: 'No {r} seats left on your plan. Free a seat or add seats in Billing.',
    intent: 'give {p} ({e}) the {r} role', confirm: 'Change the role of {p} to {r}?', ago: ['Ivy Chen added · 2 days ago', 'Theo Marsh: Viewer → Editor · last week'],
  },
  uk: {
    brands: ['Облік Адмін', 'Консоль Північ', 'Сосновий простір'], nav: ['Огляд', 'Учасники', 'Групи', 'Оплата', 'Журнал дій'], users: ['Ірина Коваль', 'Богдан Савчин'],
    people: [['Олександр Мороз', 'o.moroz@', 'oleksandr.moroz@'], ['Софія Ткач', 'sofia.tkach@', 's.tkach@'], ['Юрій Лісовий', 'yurii.lisovyi@', 'y.lisovyi@'], ['Марта Гай', 'marta.hai@', 'm.hai@']],
    fillers: [['Надія Брід', 'nadia.brid@'], ['Тимофій Болото', 'tymofii.b@'], ['Інна Чен', 'inna.chen@']], roles: ['Власник', 'Адміністратор', 'Редактор', 'Читач'],
    h: 'Учасники', name: 'Ім’я', email: 'Пошта', role: 'Роль', save: 'Зберегти', invite: 'Запросити', seats: 'Місця', seatTxt: 'Тариф «Команда» · оплата щороку · поновлення 1 березня', audit: 'Останні зміни',
    ok: 'Роль змінено: {p} тепер {r}', bad: 'Роль змінено: {p} ({w}) тепер {r}', invalid: 'У вашому тарифі не залишилося місць для ролі «{r}». Звільніть місце або додайте місця в розділі «Оплата».',
    intent: 'призначити {p} ({e}) роль «{r}»', confirm: 'Змінити роль {p} на «{r}»?', ago: ['Додано Інну Чен · 2 дні тому', 'Тимофій Болото: Читач → Редактор · минулого тижня'],
  },
  de: {
    brands: ['Kontor Admin', 'Nordwind Konsole', 'Kiefernweg Workspace'], nav: ['Übersicht', 'Mitglieder', 'Gruppen', 'Abrechnung', 'Protokoll'], users: ['Lena Brückner', 'Jonas Hellwig'],
    people: [['Alex Wagner', 'alex.wagner@', 'a.wagner@'], ['Sanne Ott', 'sanne.ott@', 's.ott@'], ['Jan Lehmann', 'jan.lehmann@', 'j.lehmann@'], ['Romy Hahn', 'romy.hahn@', 'r.hahn@']],
    fillers: [['Nadja Bach', 'nadja.bach@'], ['Theo Marx', 'theo.marx@'], ['Ina Chen', 'ina.chen@']], roles: ['Inhaber', 'Admin', 'Bearbeiter', 'Betrachter'],
    h: 'Mitglieder', name: 'Name', email: 'E-Mail', role: 'Rolle', save: 'Speichern', invite: 'Mitglied einladen', seats: 'Plätze', seatTxt: 'Team-Tarif · jährliche Abrechnung · Verlängerung am 1. März', audit: 'Letzte Änderungen',
    ok: 'Rolle geändert: {p} ist jetzt {r}', bad: 'Rolle geändert: {p} ({w}) ist jetzt {r}', invalid: 'Keine freien {r}-Plätze in Ihrem Tarif. Geben Sie einen Platz frei oder buchen Sie Plätze unter Abrechnung.',
    intent: '{p} ({e}) zur Rolle {r} machen', confirm: 'Rolle von {p} auf {r} ändern?', ago: ['Ina Chen hinzugefügt · vor 2 Tagen', 'Theo Marx: Betrachter → Bearbeiter · letzte Woche'],
  },
};

export const adminRole = {
  id: 'admin-role', kind: 'admin', langs: ['en', 'uk', 'de'],
  make(rng, lang, il) {
    const v = V[lang];
    const [p, ea, eb] = rng.pick(v.people);
    const dom = rng.pick(['example.test', 'staff.example.test', 'corp.example.test']);
    const [e, w] = rng.chance(0.5) ? [ea + dom, eb + dom] : [eb + dom, ea + dom];
    const r = v.roles[1 + rng.int(2)];
    const old = v.roles[3];
    const rows = rng.shuffle([[p, e, 't'], [p, w, 'w'], ...v.fillers.map(([n, m]) => [n, m + dom, 'f'])]);
    const fRoles = rows.map(() => v.roles[1 + rng.int(3)]);
    const used = 6 + rng.int(3);
    const brand = rng.pick(v.brands);
    const vars = { p, e, w, r };
    return {
      kind: 'admin', brand, title: `${v.h} – ${brand}`, at: '/admin/members', nav: v.nav, slug: 'admin', user: rng.pick(v.users),
      crumbs: [v.nav[0], v.h], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const body = rows.map(([n, m, tag], i) => {
          const changed = (tag === 't' && state === 'done') || (tag === 'w' && state === 'wrong');
          const cur = tag === 'f' ? fRoles[i] : changed ? r : old;
          const picker = tag === 't' ? ui.select(`${v.role} – ${m}`, v.roles, r) : `<span class="badge">${esc(cur)}</span>`;
          const shown = tag === 't' ? `<strong>${esc(cur)}</strong>${picker}` : picker;
          return `<tr><td>${esc(n)}</td><td>${esc(m)}</td><td>${shown}</td><td>${ui.btn(v.save, { acted: tag === 't' })}</td></tr>`;
        }).join('');
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(fill(v.invalid, vars))}</p>` : '';
        return `<h1>${esc(v.h)}</h1><p>${ui.btn(v.invite, { pri: true })}</p>${err}<table><tr><th>${esc(v.name)}</th><th>${esc(v.email)}</th><th>${esc(v.role)}</th><th></th></tr>${body}</table>`;
      },
      aside(state, ui) {
        return box(v.seats, `<p>${esc(fill(v.seatTxt, { e: used }))}</p>`) + box(v.audit, list(v.ago.map(esc))) + `<section>${ui.a(v.nav[4], '/admin/audit')}</section>`;
      },
      ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: fill(v.invalid, vars), confirmQ: fill(v.confirm, vars),
      confirm: {
        at: `/admin/members/${e.split('@')[0]}`, title: `${p} – ${brand}`,
        main(ui) {
          return `<div class="crumbs">${esc(v.h)}</div><h1>${esc(p)}</h1><table><tr><th>${esc(v.email)}</th><td>${esc(e)}</td></tr><tr><th>${esc(v.role)}</th><td><strong>${esc(r)}</strong></td></tr></table><p class="muted">${esc(fill(v.ok, vars))}</p><p>${ui.a(v.h, '/admin/members')}</p>`;
        },
      },
      errAt: '/admin/members',
      why: {
        change: `the row for ${p} (${e}) now shows the role ${r} instead of ${old}`,
        wrong: `the other ${p} (${w}) became ${r} while ${e} is still ${old}`,
        unchanged: `${p} (${e}) is still ${old}`,
        confirm: `is the member page of ${p} (${e}) with the role ${r}`,
      },
    };
  },
};
