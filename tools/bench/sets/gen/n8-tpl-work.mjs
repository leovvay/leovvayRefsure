// Templates saas-settings (workspace settings: profile, billing, members), admin-users (a user table with filters
// and a per-row role editor) and storage-share (a file-sharing dialog over a file list).
import { T, esc } from './n8-lib.mjs';
import { box, h, list, p, table } from './n8-page.mjs';

const SA = {
  en: { brands: ['Quillmark', 'Brightpane'], nav: ['Home', 'Projects', 'Reports', 'Settings'], users: ['Mara Quint', 'Owen Strick'], side: ['Profile', 'Notifications', 'Billing', 'Members', 'Security'],
    h1: 'Workspace settings', pro: 'Profile', name: 'Display name', bill: 'Billing', billP: 'Your next invoice is issued on 1 December. Seats are prorated.', mem: 'Invite a member', email: 'E-mail address', save: 'Save changes', invite: 'Send invite', plan: 'Current usage', planT: '7 of 10 seats used · 38 GB of 100 GB' },
  uk: { brands: ['Перо й Мітка', 'Ясна Шибка'], nav: ['Головна', 'Проєкти', 'Звіти', 'Налаштування'], users: ['Марта Квінт', 'Олесь Стрик'], side: ['Профіль', 'Сповіщення', 'Оплата', 'Учасники', 'Безпека'],
    h1: 'Налаштування простору', pro: 'Профіль', name: 'Ім’я для показу', bill: 'Оплата', billP: 'Наступний рахунок буде виставлено 1 грудня. Місця оплачуються пропорційно.', mem: 'Запросити учасника', email: 'Електронна пошта', save: 'Зберегти зміни', invite: 'Надіслати запрошення', plan: 'Використання', planT: 'Зайнято 7 з 10 місць · 38 ГБ зі 100 ГБ' },
  de: { brands: ['Federmark', 'Hellscheibe'], nav: ['Start', 'Projekte', 'Berichte', 'Einstellungen'], users: ['Mara Quast', 'Oskar Streich'], side: ['Profil', 'Benachrichtigungen', 'Abrechnung', 'Mitglieder', 'Sicherheit'],
    h1: 'Arbeitsbereich-Einstellungen', pro: 'Profil', name: 'Anzeigename', bill: 'Abrechnung', billP: 'Die nächste Rechnung wird am 1. Dezember erstellt. Plätze werden anteilig berechnet.', mem: 'Mitglied einladen', email: 'E-Mail-Adresse', save: 'Änderungen speichern', invite: 'Einladung senden', plan: 'Aktuelle Nutzung', planT: '7 von 10 Plätzen belegt · 38 GB von 100 GB' },
  es: { brands: ['Plumamarca', 'Cristal Claro'], nav: ['Inicio', 'Proyectos', 'Informes', 'Ajustes'], users: ['Mara Quintana', 'Óscar Estrada'], side: ['Perfil', 'Notificaciones', 'Facturación', 'Miembros', 'Seguridad'],
    h1: 'Ajustes del espacio', pro: 'Perfil', name: 'Nombre visible', bill: 'Facturación', billP: 'La próxima factura se emite el 1 de diciembre. Las plazas se prorratean.', mem: 'Invitar a un miembro', email: 'Correo electrónico', save: 'Guardar cambios', invite: 'Enviar invitación', plan: 'Uso actual', planT: '7 de 10 plazas usadas · 38 GB de 100 GB' },
  pl: { brands: ['Piórko', 'Jasna Szyba'], nav: ['Start', 'Projekty', 'Raporty', 'Ustawienia'], users: ['Marta Kwiecień', 'Olek Strzelec'], side: ['Profil', 'Powiadomienia', 'Rozliczenia', 'Członkowie', 'Bezpieczeństwo'],
    h1: 'Ustawienia przestrzeni', pro: 'Profil', name: 'Nazwa wyświetlana', bill: 'Rozliczenia', billP: 'Następna faktura zostanie wystawiona 1 grudnia. Miejsca są rozliczane proporcjonalnie.', mem: 'Zaproś członka', email: 'Adres e-mail', save: 'Zapisz zmiany', invite: 'Wyślij zaproszenie', plan: 'Bieżące użycie', planT: 'Zajęte 7 z 10 miejsc · 38 GB ze 100 GB' },
};

export const saasSettings = {
  id: 'saas-settings', kind: 'saas',
  hosts: { language: null, timezone: null, plan: null, role: null, country: T('Billing country|Країна для рахунків|Rechnungsland|País de facturación|Kraj rozliczenia') },
  make(rng, lang, domId) {
    const v = SA[lang];
    const brand = rng.pick(v.brands);
    const sec = domId === 'plan' || domId === 'country' ? 'bill' : domId === 'role' ? 'mem' : 'pro';
    return {
      kind: 'saas', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'app', user: rng.pick(v.users), crumbs: [v.nav[3], v[sec]],
      main(field, ui) {
        if (sec === 'bill') return `${h(1, v.h1)}${h(2, v.bill)}${p(v.billP)}${field}<p>${ui.btn(v.save, { pri: true })}</p>`;
        if (sec === 'mem') return `${h(1, v.h1)}${h(2, v.mem)}${ui.input(v.email, '')}${field}<p>${ui.btn(v.invite, { pri: true })}</p>`;
        return `${h(1, v.h1)}${h(2, v.pro)}${ui.input(v.name, rng.pick(v.users))}${field}<p>${ui.btn(v.save, { pri: true })}</p>`;
      },
      aside: (ui) => `<section>${list(v.side.map((s) => ui.a(s, '/settings')))}</section>${box(v.plan, p(v.planT))}`,
    };
  },
};

const AD = {
  en: { brands: ['Opsboard', 'Gridkeep'], nav: ['Dashboard', 'Users', 'Groups', 'Audit log'], h1: 'Users', edit: 'Edit user', who: 'Selected: {u}', show: 'Showing 1–10 of 248',
    cols: ['Name', 'E-mail', 'Last active'], save: 'Apply', reset: 'Reset filters', tip: 'Role changes take effect at the next sign-in.', people: ['Lia Brandt', 'Tomas Vey', 'Rena Okafor', 'Ivo Marsh'] },
  uk: { brands: ['Панель Опс', 'Сітка'], nav: ['Огляд', 'Користувачі', 'Групи', 'Журнал аудиту'], h1: 'Користувачі', edit: 'Редагувати користувача', who: 'Обрано: {u}', show: 'Показано 1–10 із 248',
    cols: ['Ім’я', 'Пошта', 'Остання активність'], save: 'Застосувати', reset: 'Скинути фільтри', tip: 'Зміна ролі діє з наступного входу.', people: ['Лія Бранд', 'Тома Вей', 'Рена Окафор', 'Іво Марш'] },
  de: { brands: ['Opsbrett', 'Rasterwacht'], nav: ['Übersicht', 'Benutzer', 'Gruppen', 'Protokoll'], h1: 'Benutzer', edit: 'Benutzer bearbeiten', who: 'Ausgewählt: {u}', show: '1–10 von 248',
    cols: ['Name', 'E-Mail', 'Zuletzt aktiv'], save: 'Übernehmen', reset: 'Filter zurücksetzen', tip: 'Rollenänderungen gelten ab der nächsten Anmeldung.', people: ['Lia Brandt', 'Tomas Vey', 'Rena Okafor', 'Ivo Marsch'] },
  es: { brands: ['Panel Ops', 'Rejilla'], nav: ['Panel', 'Usuarios', 'Grupos', 'Registro'], h1: 'Usuarios', edit: 'Editar usuario', who: 'Seleccionado: {u}', show: 'Mostrando 1–10 de 248',
    cols: ['Nombre', 'Correo', 'Última actividad'], save: 'Aplicar', reset: 'Restablecer filtros', tip: 'Los cambios de rol se aplican en el próximo inicio de sesión.', people: ['Lía Brando', 'Tomás Vega', 'Rena Ocaña', 'Iván Marín'] },
  pl: { brands: ['Panel Ops', 'Siatka'], nav: ['Pulpit', 'Użytkownicy', 'Grupy', 'Dziennik'], h1: 'Użytkownicy', edit: 'Edytuj użytkownika', who: 'Wybrano: {u}', show: 'Wyświetlono 1–10 z 248',
    cols: ['Imię i nazwisko', 'E-mail', 'Ostatnia aktywność'], save: 'Zastosuj', reset: 'Wyczyść filtry', tip: 'Zmiana roli działa od następnego logowania.', people: ['Lia Brandt', 'Tomasz Wej', 'Renata Okoń', 'Iwo Marsz'] },
};

export const adminUsers = {
  id: 'admin-users', kind: 'admin',
  hosts: { role: null, rows: null, sort: null },
  make(rng, lang, domId) {
    const v = AD[lang];
    const brand = rng.pick(v.brands);
    const u = rng.pick(v.people);
    const rowsT = v.people.map((n, i) => [n, `${n.split(' ')[0].toLowerCase()}@example.test`, `${i + 2} h`]);
    return {
      kind: 'admin', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'admin', user: null, crumbs: [v.nav[0], v.h1],
      main(field, ui) {
        const tbl = table(v.cols, rowsT);
        if (domId === 'role') return `${h(1, v.h1)}${tbl}${h(2, v.edit)}${p(v.who.replace('{u}', u))}${field}${p(v.tip, 'muted')}<p>${ui.btn(v.save, { pri: true })}</p>`;
        return `${h(1, v.h1)}${field}<p>${ui.btn(v.save)} ${ui.btn(v.reset)}</p>${tbl}${p(v.show, 'muted')}`;
      },
      aside: (ui) => `<section>${list(v.nav.map((n) => ui.a(n, '/admin')))}</section>`,
    };
  },
};

const ST = {
  en: { brands: ['Boxwell', 'Cloudcask'], nav: ['My files', 'Shared', 'Recent', 'Trash'], h1: 'My files', files: [['Q3 budget.xlsx', '2.1 MB'], ['Team photo.jpg', '4.8 MB'], ['Notes.txt', '3 KB']], cols: ['Name', 'Size'],
    share: 'Share “Q3 budget.xlsx”', with: 'Add people', link: 'Anyone with the link can view.', send: 'Share', storage: 'Storage', used: '38 GB of 100 GB used', upgrade: 'Change plan' },
  uk: { brands: ['Скринька', 'Хмарна Бочка'], nav: ['Мої файли', 'Спільні', 'Нещодавні', 'Кошик'], h1: 'Мої файли', files: [['Бюджет Q3.xlsx', '2,1 МБ'], ['Фото команди.jpg', '4,8 МБ'], ['Нотатки.txt', '3 КБ']], cols: ['Назва', 'Розмір'],
    share: 'Поділитися «Бюджет Q3.xlsx»', with: 'Додати людей', link: 'Будь-хто з посиланням може переглядати.', send: 'Поділитися', storage: 'Сховище', used: 'Використано 38 ГБ зі 100 ГБ', upgrade: 'Змінити тариф' },
  de: { brands: ['Kistenwerk', 'Wolkenfass'], nav: ['Meine Dateien', 'Geteilt', 'Zuletzt', 'Papierkorb'], h1: 'Meine Dateien', files: [['Budget Q3.xlsx', '2,1 MB'], ['Teamfoto.jpg', '4,8 MB'], ['Notizen.txt', '3 KB']], cols: ['Name', 'Größe'],
    share: '„Budget Q3.xlsx“ teilen', with: 'Personen hinzufügen', link: 'Alle mit dem Link können ansehen.', send: 'Teilen', storage: 'Speicher', used: '38 GB von 100 GB belegt', upgrade: 'Tarif ändern' },
  es: { brands: ['Cajón', 'Barril Nube'], nav: ['Mis archivos', 'Compartidos', 'Recientes', 'Papelera'], h1: 'Mis archivos', files: [['Presupuesto T3.xlsx', '2,1 MB'], ['Foto equipo.jpg', '4,8 MB'], ['Notas.txt', '3 KB']], cols: ['Nombre', 'Tamaño'],
    share: 'Compartir «Presupuesto T3.xlsx»', with: 'Añadir personas', link: 'Cualquiera con el enlace puede ver.', send: 'Compartir', storage: 'Almacenamiento', used: '38 GB de 100 GB usados', upgrade: 'Cambiar plan' },
  pl: { brands: ['Skrzynka', 'Chmurna Beczka'], nav: ['Moje pliki', 'Udostępnione', 'Ostatnie', 'Kosz'], h1: 'Moje pliki', files: [['Budżet Q3.xlsx', '2,1 MB'], ['Zdjęcie zespołu.jpg', '4,8 MB'], ['Notatki.txt', '3 KB']], cols: ['Nazwa', 'Rozmiar'],
    share: 'Udostępnij „Budżet Q3.xlsx”', with: 'Dodaj osoby', link: 'Każdy z linkiem może wyświetlać.', send: 'Udostępnij', storage: 'Miejsce', used: 'Zajęte 38 GB ze 100 GB', upgrade: 'Zmień plan' },
};

export const storageShare = {
  id: 'storage-share', kind: 'storage',
  hosts: { role: T('Permission|Дозвіл|Berechtigung|Permiso|Uprawnienia'), plan: null, rows: null, sort: null },
  make(rng, lang, domId) {
    const v = ST[lang];
    const brand = rng.pick(v.brands);
    return {
      kind: 'storage', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'drive', user: null, crumbs: [v.nav[0]],
      main(field, ui) {
        const files = table(v.cols, v.files);
        if (domId === 'role') return `${h(1, v.h1)}${files}<section class="card">${h(2, v.share)}${ui.input(v.with, '')}${field}${p(v.link, 'muted')}<p>${ui.btn(v.send, { pri: true })}</p></section>`;
        if (domId === 'plan') return `${h(1, v.storage)}${p(v.used)}${field}<p>${ui.btn(v.upgrade, { pri: true })}</p>${files}`;
        return `${h(1, v.h1)}${field}${files}`;
      },
      aside: (ui) => `<section>${list(v.nav.map((n) => ui.a(n, '/drive')))}</section>${box(v.storage, `<p>${esc(v.used)}</p>`)}`,
    };
  },
};
