// Template storage-share: a file-storage sharing panel for one folder; the step shares it with one person.
// Wrong item: a near-twin folder is shared instead (shown in the activity list). Invalid: an outside-domain rule.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Boxwell Drive', 'Cloudberry Files', 'Stashpoint'], nav: ['My files', 'Shared with me', 'Recent', 'Trash'], users: ['Mara Quint', 'Owen Strick', 'Priya Calder'],
    folders: [['Invoices 2026', 'Invoices 2025'], ['Wedding photos – edited', 'Wedding photos – raw'], ['Lease documents', 'Lease documents (old flat)'], ['Thesis drafts', 'Thesis drafts – backup']],
    people: [['Juno Partridge', 'juno.partridge'], ['Ilse Brandvold', 'ilse.b'], ['Tom Okafor', 'tom.okafor']], files: ['scan-0412.pdf', 'IMG_2231.jpg', 'notes.txt', 'budget.xlsx'],
    h: 'Share "{f}"', who: 'People with access', owner: 'Owner', add: 'Add people by email', perm: 'Permission', perms: ['Can view', 'Can edit'], share: 'Share', copy: 'Copy link', act: 'Activity', you: 'You',
    ok: 'Shared with {p}', bad: '"{w}" shared with {p}', invalid: 'Sharing outside your organisation is turned off for this folder. Ask an admin to allow it.',
    intent: 'share the folder "{f}" with {p} ({e})', confirm: 'Share "{f}" with {p}? They will get an email.', shared: 'You shared "{x}" with {p}', older: ['You uploaded 4 files · yesterday', 'You renamed "Taxes" · last week'],
    storage: 'Storage', used: '41.6 GB of 100 GB used',
  },
  uk: {
    brands: ['Скринька Диск', 'Хмарка Файли', 'Схованка'], nav: ['Мої файли', 'Доступні мені', 'Нещодавні', 'Кошик'], users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук'],
    folders: [['Рахунки 2026', 'Рахунки 2025'], ['Весільні фото – оброблені', 'Весільні фото – оригінали'], ['Документи оренди', 'Документи оренди (стара квартира)'], ['Чернетки дисертації', 'Чернетки дисертації – копія']],
    people: [['Юна Куропатва', 'yuna.k'], ['Ольга Бранд', 'olha.brand'], ['Тарас Окань', 'taras.okan']], files: ['skan-0412.pdf', 'IMG_2231.jpg', 'notatky.txt', 'biudzhet.xlsx'],
    h: 'Поділитися «{f}»', who: 'Мають доступ', owner: 'Власник', add: 'Додати людей за адресою', perm: 'Дозвіл', perms: ['Може переглядати', 'Може редагувати'], share: 'Поділитися', copy: 'Копіювати посилання', act: 'Дії', you: 'Ви',
    ok: 'Надано доступ: {p}', bad: 'Доступ до «{w}» надано: {p}', invalid: 'Для цієї папки вимкнено доступ для людей поза організацією. Попросіть адміністратора дозволити.',
    intent: 'поділитися папкою «{f}» з {p} ({e})', confirm: 'Поділитися «{f}» з {p}? Вони отримають лист.', shared: 'Ви поділилися «{x}» з {p}', older: ['Ви завантажили 4 файли · учора', 'Ви перейменували «Податки» · минулого тижня'],
    storage: 'Сховище', used: 'Використано 41,6 ГБ зі 100 ГБ',
  },
  pl: {
    brands: ['Skrzynka Dysk', 'Chmurka Pliki', 'Schowek'], nav: ['Moje pliki', 'Udostępnione dla mnie', 'Ostatnie', 'Kosz'], users: ['Zofia Wrzos', 'Kacper Lisowski', 'Ewa Brzezińska'],
    folders: [['Faktury 2026', 'Faktury 2025'], ['Zdjęcia ze ślubu – obrobione', 'Zdjęcia ze ślubu – surowe'], ['Dokumenty najmu', 'Dokumenty najmu (stare mieszkanie)'], ['Szkice pracy dyplomowej', 'Szkice pracy dyplomowej – kopia']],
    people: [['Juna Kuropatwa', 'juna.k'], ['Ola Brand', 'ola.brand'], ['Tomasz Okoń', 'tomasz.okon']], files: ['skan-0412.pdf', 'IMG_2231.jpg', 'notatki.txt', 'budzet.xlsx'],
    h: 'Udostępnij „{f}”', who: 'Osoby z dostępem', owner: 'Właściciel', add: 'Dodaj osoby po adresie e-mail', perm: 'Uprawnienia', perms: ['Może wyświetlać', 'Może edytować'], share: 'Udostępnij', copy: 'Kopiuj link', act: 'Aktywność', you: 'Ty',
    ok: 'Udostępniono: {p}', bad: 'Udostępniono „{w}”: {p}', invalid: 'Udostępnianie poza organizację jest wyłączone dla tego folderu. Poproś administratora o zgodę.',
    intent: 'udostępnić folder „{f}” osobie {p} ({e})', confirm: 'Udostępnić „{f}” osobie {p}? Dostanie e-mail.', shared: 'Udostępniono „{x}” osobie {p}', older: ['Przesłano 4 pliki · wczoraj', 'Zmieniono nazwę „Podatki” · w zeszłym tygodniu'],
    storage: 'Miejsce', used: 'Użyto 41,6 GB ze 100 GB',
  },
};

export const storageShare = {
  id: 'storage-share', kind: 'storage', langs: ['en', 'uk', 'pl'],
  make(rng, lang, il) {
    const v = V[lang];
    const pair = rng.pick(v.folders);
    const [f, w] = rng.chance(0.5) ? pair : [pair[1], pair[0]];
    const [p, local] = rng.pick(v.people);
    const e = `${local}@${rng.pick(['example.test', 'mail.example.test'])}`;
    const perm = rng.pick(v.perms);
    const user = rng.pick(v.users);
    const brand = rng.pick(v.brands);
    const vars = { f, w, p, e };
    const files = rng.shuffle(v.files).slice(0, 3);
    const people = (state) => [`${esc(user)} (${esc(v.you)}) – ${esc(v.owner)}`, ...(state === 'done' ? [`${esc(p)} · ${esc(e)} – ${esc(perm)}`] : [])];
    const acts = (state) => [...(state === 'done' ? [fill(v.shared, { x: f, p })] : state === 'wrong' ? [fill(v.shared, { x: w, p })] : []), ...v.older];
    return {
      kind: 'storage', brand, title: `${f} – ${brand}`, at: `/folders/${10000 + rng.int(89999)}/share`, nav: v.nav, slug: 'drive', user,
      crumbs: [v.nav[0], f], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(v.invalid)}</p>` : '';
        return `<h1>${esc(fill(v.h, { f }))}</h1><p class="muted">${files.map(esc).join(' · ')}</p><h2>${esc(v.who)}</h2>${list(people(state))}${ui.input(v.add, e)}${ui.select(v.perm, v.perms, perm)}${err}<p>${ui.btn(v.share, { pri: true, acted: true })} ${ui.btn(v.copy)}</p>`;
      },
      aside(state, ui) {
        return box(v.act, list(acts(state).map(esc))) + box(v.storage, `<p>${esc(v.used)}</p>`);
      },
      ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: v.invalid, confirmQ: fill(v.confirm, vars),
      confirm: {
        at: '/folders/share/done', title: `${f} – ${brand}`,
        main(ui) {
          return `<h1>${esc(f)}</h1><h2>${esc(v.who)}</h2>${list(people('done'))}<p class="muted">${esc(fill(v.ok, vars))}</p><p>${ui.a(v.nav[0], '/files')}</p>`;
        },
      },
      errAt: '/folders/share',
      why: {
        change: `${p} (${e}) now appears under people with access and the activity list records the share of "${f}"`,
        wrong: `the activity list records sharing "${w}" with ${p}, and only the owner has access to "${f}"`,
        unchanged: `only the owner has access to "${f}"`,
        confirm: `lists ${p} among the people with access to "${f}"`,
      },
    };
  },
};
