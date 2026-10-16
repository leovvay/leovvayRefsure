// Template admin-user: a user account in a workspace admin console. Result: the role assigned to the account.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Slatebridge Admin', 'Juniper Workspace', 'Cobalt Ledger Console'], nav: ['Overview', 'Users', 'Groups', 'Billing', 'Audit log'],
    h: 'User details', id: 'User ID', name: 'Name', mail: 'Email', added: 'Added on', role: 'Role', roles: ['Billing administrator', 'Read-only auditor', 'Project editor'],
    ladder: ['Invited', 'Invitation accepted', 'Active'], neg: ['Deactivated', 'Account {ref} was deactivated and can no longer sign in.'],
    pend: 'The role for {ref} is waiting for approval by a second administrator.', queued: 'The invitation for {ref} is queued and will go out with the next batch.',
    seats: 'Seats', seatTxt: '23 of 25 seats used', sso: 'Single sign-on is required for all members.',
    E: { main: 'A user account for {who} (ID {ref})', res: 'The role given to user {ref}', num: 'User {ref} added on {num}', status: 'User {ref} can now sign in and work' },
  },
  uk: {
    brands: ['Адмінка Сланцевий Міст', 'Робочий простір Ялівець', 'Консоль Кобальт'], nav: ['Огляд', 'Користувачі', 'Групи', 'Оплата', 'Журнал дій'],
    h: 'Дані користувача', id: 'ID користувача', name: 'Ім’я', mail: 'Пошта', added: 'Додано', role: 'Роль', roles: ['Адміністратор оплат', 'Аудитор лише для читання', 'Редактор проєктів'],
    ladder: ['Запрошено', 'Запрошення прийнято', 'Активний'], neg: ['Деактивовано', 'Обліковий запис {ref} деактивовано, увійти в нього більше не можна.'],
    pend: 'Роль для {ref} чекає схвалення другим адміністратором.', queued: 'Запрошення для {ref} у черзі й буде надіслане з наступною партією.',
    seats: 'Місця', seatTxt: 'Зайнято 23 з 25 місць', sso: 'Для всіх учасників обов’язковий єдиний вхід.',
    E: { main: 'Обліковий запис користувача {who} (ID {ref})', res: 'Роль, призначена користувачу {ref}', num: 'Користувач {ref}, доданий {num}', status: 'Користувач {ref} уже може входити й працювати' },
  },
  de: {
    brands: ['Schieferbrücke Admin', 'Wacholder Workspace', 'Kobalt Konsole'], nav: ['Übersicht', 'Benutzer', 'Gruppen', 'Abrechnung', 'Protokoll'],
    h: 'Benutzerdetails', id: 'Benutzer-ID', name: 'Name', mail: 'E-Mail', added: 'Hinzugefügt am', role: 'Rolle', roles: ['Abrechnungsadministrator', 'Prüfer (nur Lesen)', 'Projektbearbeiter'],
    ladder: ['Eingeladen', 'Einladung angenommen', 'Aktiv'], neg: ['Deaktiviert', 'Konto {ref} wurde deaktiviert und kann sich nicht mehr anmelden.'],
    pend: 'Die Rolle für {ref} wartet auf die Freigabe durch einen zweiten Administrator.', queued: 'Die Einladung für {ref} steht in der Warteschlange und geht mit dem nächsten Stapel raus.',
    seats: 'Lizenzen', seatTxt: '23 von 25 Lizenzen belegt', sso: 'Single Sign-on ist für alle Mitglieder Pflicht.',
    E: { main: 'Ein Benutzerkonto für {who} (ID {ref})', res: 'Die Rolle, die Benutzer {ref} erhalten hat', num: 'Benutzer {ref}, hinzugefügt am {num}', status: 'Benutzer {ref} kann sich jetzt anmelden und arbeiten' },
  },
  pl: {
    brands: ['Panel Łupkowy Most', 'Przestrzeń Jałowiec', 'Konsola Kobalt'], nav: ['Przegląd', 'Użytkownicy', 'Grupy', 'Rozliczenia', 'Dziennik zdarzeń'],
    h: 'Szczegóły użytkownika', id: 'ID użytkownika', name: 'Imię i nazwisko', mail: 'E-mail', added: 'Dodano', role: 'Rola', roles: ['Administrator rozliczeń', 'Audytor (tylko odczyt)', 'Edytor projektów'],
    ladder: ['Zaproszony', 'Zaproszenie przyjęte', 'Aktywny'], neg: ['Dezaktywowany', 'Konto {ref} zostało dezaktywowane i nie może się już logować.'],
    pend: 'Rola dla {ref} czeka na zatwierdzenie przez drugiego administratora.', queued: 'Zaproszenie dla {ref} czeka w kolejce i wyjdzie z następną partią.',
    seats: 'Licencje', seatTxt: 'Wykorzystano 23 z 25 licencji', sso: 'Logowanie jednokrotne jest wymagane dla wszystkich.',
    E: { main: 'Konto użytkownika {who} (ID {ref})', res: 'Rola nadana użytkownikowi {ref}', num: 'Użytkownik {ref} dodany {num}', status: 'Użytkownik {ref} może już się logować i pracować' },
  },
};

export const adminUser = {
  id: 'admin-user', kind: 'admin', langs: ['en', 'uk', 'de', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `U-${30000 + r.int(69000)}`, spec: { type: 'date' } });
    const v = c.v;
    const role = rng.pick(v.roles);
    return {
      ...c, kind: 'admin', nav: v.nav, slug: 'admin', crumbs: [v.nav[1], v.h], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: () => `${v.h} · ${c.brand}`, at: (ref) => `/admin/users/${ref.toLowerCase()}`, resText: role, loadTitle: v.h,
      en: { thing: 'user', res: 'role', num: 'date added' },
      main(x) {
        const mail = `${x.ref.toLowerCase().replace('-', '')}@example.test`;
        const res = `<tr><th>${esc(v.role)}</th><td><strong>${esc(role)}</strong></td></tr>`;
        const table = rows([[v.id, esc(x.ref)], [v.name, esc(x.who)], [v.mail, esc(mail)], [v.added, esc(x.num)], ['', stageBadge(x)]]);
        return `<h1>${esc(v.h)}</h1>${x.hasResult ? table.replace('</table>', `${res}</table>`) : table + slot(x, '')}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: () => box(v.seats, `<p>${esc(v.seatTxt)}</p><p class="muted">${esc(v.sso)}</p>`),
    };
  },
};
