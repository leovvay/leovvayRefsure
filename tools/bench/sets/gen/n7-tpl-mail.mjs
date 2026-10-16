// Template mail-compose: a webmail client's compose view with folders and a mail search box. Categories:
// greeting, confirmation (message sent), error (message not sent), results (mail search). No message list.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { people } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Postbird', 'Inkwell Mail', 'Swiftletter'], nav: ['Mail', 'Contacts', 'Calendar', 'Files'],
    users: [['Greta', 'Greta Holm'], ['Ivan', 'Ivan Rusk'], ['Lorna', 'Lorna Pike'], ['Ravi', 'Ravi Menon']],
    h: 'New message', crumbs: ['Mail', 'Compose'], to: 'To', subj: 'Subject', body: 'Message', send: 'Send', discard: 'Discard draft',
    subjects: ['Quarterly garden club newsletter', 'Minutes from Tuesday', 'Photos from the harvest fair'], text: 'Attached are the notes we talked about. Let me know if anything is missing.',
    folders: ['Inbox (12)', 'Starred', 'Sent', 'Drafts (2)', 'Archive', 'Spam'], fold: 'Folders', search: 'Search mail', ph: 'Search mail',
    ok: 'Message sent to {to}', neg: 'Your message to {to} was not sent. It is saved in Drafts.', pending: 'Sending…', mention: 'A confirmation appears here once the message has left your outbox.',
    e1: 'Message not sent: the attachment is larger than 25 MB.', e2: 'Message not sent: the address {to} does not exist.',
    clear: 'Recipients and attachments checked. No problems found.', checking: 'Checking recipients and attachments…', emention: 'If a message cannot be sent, the reason is shown above the editor.',
    errSpec: 'an error saying the attachment is larger than 25 MB',
    q: ['invoice', 'allotment', 'choir'], rows: { invoice: ['Invoice 2291 from Brightwatt Energy · 2 Oct', 'Re: invoice for September · 28 Sep', 'Your invoice is ready · 1 Sep'], allotment: ['Allotment rota for October · 30 Sep', 'Re: allotment shed keys · 12 Sep'], choir: ['Choir practice moved to Thursday · 3 Oct', 'Choir concert tickets · 21 Sep', 'Re: choir folders · 9 Sep'] },
  },
  uk: {
    brands: ['Голубка', 'Чорнильниця', 'Швидколист'], nav: ['Пошта', 'Контакти', 'Календар', 'Файли'],
    users: [['Леся', 'Леся Мороз', 'Лесю'], ['Іван', 'Іван Руденко', 'Іване'], ['Галина', 'Галина Пилип', 'Галино'], ['Максим', 'Максим Гордій', 'Максиме']],
    h: 'Новий лист', crumbs: ['Пошта', 'Написати'], to: 'Кому', subj: 'Тема', body: 'Повідомлення', send: 'Надіслати', discard: 'Видалити чернетку',
    subjects: ['Квартальний бюлетень садового клубу', 'Протокол зі вівторка', 'Фото з ярмарку врожаю'], text: 'Додаю нотатки, про які ми говорили. Напишіть, якщо чогось бракує.',
    folders: ['Вхідні (12)', 'Із зірочкою', 'Надіслані', 'Чернетки (2)', 'Архів', 'Спам'], fold: 'Папки', search: 'Пошук у пошті', ph: 'Пошук у пошті',
    ok: 'Лист надіслано на {to}', neg: 'Лист на {to} не надіслано. Його збережено в чернетках.', pending: 'Надсилаємо…', mention: 'Підтвердження з’явиться тут, щойно лист залишить вихідні.',
    e1: 'Лист не надіслано: вкладення більше за 25 МБ.', e2: 'Лист не надіслано: адреси {to} не існує.',
    clear: 'Отримувачів і вкладення перевірено. Проблем не виявлено.', checking: 'Перевіряємо отримувачів і вкладення…', emention: 'Якщо лист не вдасться надіслати, причину буде показано над редактором.',
    errSpec: 'an error saying the attachment is larger than 25 MB',
    q: ['рахунок', 'город', 'хор'], rows: { 'рахунок': ['Рахунок 2291 від Світлосвіт · 2 жовт.', 'Re: рахунок за вересень · 28 вер.', 'Ваш рахунок готовий · 1 вер.'], 'город': ['Графік чергувань на городі, жовтень · 30 вер.', 'Re: ключі від сарайчика на городі · 12 вер.'], 'хор': ['Репетицію хору перенесено на четвер · 3 жовт.', 'Квитки на концерт хору · 21 вер.', 'Re: нотні папки для хору · 9 вер.'] },
  },
};

const TO = ['club.secretary', 'r.oduya', 'events.desk', 'm.tallis', 'k.brandt', 'n.ferris'];

export const mailCompose = {
  id: 'mail-compose', kind: 'mail', langs: ['en', 'uk'], cats: ['greeting', 'confirmation', 'error', 'results'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const [t1, t2] = rng.shuffle(TO);
    const to = `${t1}@example.test`;
    const to2 = `${t2}@example.test`;
    const subject = rng.pick(v.subjects);
    const [q, q2] = rng.shuffle(Object.keys(v.rows));
    return {
      kind: 'mail', brand, title: `${v.h} · ${brand}`, at: '/mail/compose', host: 'mail', nav: v.nav, slug: 'mail', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        return `<p><input type="search" value="" placeholder="${esc(v.ph)}"></p>${slot}<h1>${esc(v.h)}</h1>${ui.input(v.to, to)}${ui.input(v.subj, subject)}${ui.input(v.body, v.text, { area: true })}
<p>${ui.btn(v.send, { pri: true })} ${ui.btn(v.discard)}</p>`;
      },
      aside(ui) { return box(v.fold, list(v.folders.map((x) => ui.a(x, '/mail')))); },
      cats: {
        confirmation: { ok: v.ok.replace('{to}', to), wrong: v.ok.replace('{to}', to2), neg: v.neg.replace('{to}', to), pending: v.pending, mention: v.mention, spec: `a confirmation that the message to ${to} was sent` },
        error: { e1: v.e1, e2: v.e2.replace('{to}', to), clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
        results: { q, q2, rows: v.rows[q], rows2: v.rows[q2] },
      },
    };
  },
};
