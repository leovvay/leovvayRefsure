// Template mail-send: a web mail client with a draft open; the step sends it. The folder list shows Drafts and a
// "Sent" panel lists the latest sent subjects. Wrong item: another draft with a near-twin subject is sent.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Postlark Mail', 'Quillbox', 'Harbour Mail'], nav: ['Mail', 'Contacts', 'Calendar', 'Settings'], users: ['Mara Quint', 'Owen Strick', 'Priya Calder'],
    mails: [['Re: Venue for the spring meetup', 'Re: Venue for the summer meetup', 'juno.partridge@example.test', 'The hall on Fen Street works for us. Can we have it from 6 pm?'], ['Quote for the kitchen tiles', 'Quote for the bathroom tiles', 'orders@tilehouse.example.test', 'Could you send a quote for 14 m² of the grey hexagon tiles?'], ['Minutes – board meeting 12 October', 'Minutes – board meeting 12 September', 'board@residents.example.test', 'Attached are the minutes. Please send corrections by Friday.']],
    folders: ['Inbox', 'Drafts', 'Sent', 'Archive', 'Spam'], to: 'To', subj: 'Subject', send: 'Send', discard: 'Discard', sentBox: 'Recently sent',
    sentOld: ['Your library loans', 'Re: Saturday football rota', 'Photos from the trip'], inbox: ['Delivery update for your parcel', 'Choir practice moved to Wednesday', 'Your water bill is ready'],
    ok: 'Message sent', bad: 'Message sent: "{w}"', invalid: 'Attachments can’t be larger than 25 MB in total. Remove one or share a link instead.', att: 'Attachment',
    intent: 'send the email "{s}" to {t}', confirm: 'Send "{s}" to {t}?', sentTitle: 'Sent', unread: '{n} unread',
  },
  uk: {
    brands: ['Жайвір Пошта', 'Скринька', 'Гавань Мейл'], nav: ['Пошта', 'Контакти', 'Календар', 'Налаштування'], users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук'],
    mails: [['Re: Зала для весняної зустрічі', 'Re: Зала для літньої зустрічі', 'yuna.kuropatva@example.test', 'Зала на Болотяній нам підходить. Чи можна з 18:00?'], ['Кошторис на плитку для кухні', 'Кошторис на плитку для ванної', 'orders@plytka.example.test', 'Надішліть, будь ласка, кошторис на 14 м² сірої шестикутної плитки.'], ['Протокол засідання правління 12 жовтня', 'Протокол засідання правління 12 вересня', 'board@osbb.example.test', 'Додаю протокол. Правки надсилайте до п’ятниці.']],
    folders: ['Вхідні', 'Чернетки', 'Надіслані', 'Архів', 'Спам'], to: 'Кому', subj: 'Тема', send: 'Надіслати', discard: 'Видалити чернетку', sentBox: 'Нещодавно надіслані',
    sentOld: ['Ваші книжки з бібліотеки', 'Re: Графік футболу в суботу', 'Фото з поїздки'], inbox: ['Оновлення доставки посилки', 'Репетицію хору перенесено на середу', 'Рахунок за воду готовий'],
    ok: 'Лист надіслано', bad: 'Лист надіслано: «{w}»', invalid: 'Розмір вкладень не може перевищувати 25 МБ. Видаліть файл або надішліть посилання.', att: 'Вкладення',
    intent: 'надіслати лист «{s}» на {t}', confirm: 'Надіслати «{s}» на {t}?', sentTitle: 'Надіслані', unread: '{n} непрочитаних',
  },
  pl: {
    brands: ['Skowronek Poczta', 'Skrzynka', 'Przystań Mail'], nav: ['Poczta', 'Kontakty', 'Kalendarz', 'Ustawienia'], users: ['Zofia Wrzos', 'Kacper Lisowski', 'Ewa Brzezińska'],
    mails: [['Re: Sala na wiosenne spotkanie', 'Re: Sala na letnie spotkanie', 'juna.kuropatwa@example.test', 'Sala przy Bagiennej nam pasuje. Czy możemy od 18:00?'], ['Wycena płytek do kuchni', 'Wycena płytek do łazienki', 'zamowienia@plytki.example.test', 'Proszę o wycenę 14 m² szarych płytek heksagonalnych.'], ['Protokół z zarządu 12 października', 'Protokół z zarządu 12 września', 'zarzad@wspolnota.example.test', 'W załączniku protokół. Poprawki proszę przesłać do piątku.']],
    folders: ['Odebrane', 'Wersje robocze', 'Wysłane', 'Archiwum', 'Spam'], to: 'Do', subj: 'Temat', send: 'Wyślij', discard: 'Odrzuć', sentBox: 'Ostatnio wysłane',
    sentOld: ['Twoje wypożyczenia', 'Re: Grafik piłki w sobotę', 'Zdjęcia z wyjazdu'], inbox: ['Aktualizacja dostawy paczki', 'Próba chóru przeniesiona na środę', 'Rachunek za wodę jest gotowy'],
    ok: 'Wiadomość wysłana', bad: 'Wysłano wiadomość: „{w}”', invalid: 'Załączniki nie mogą przekraczać łącznie 25 MB. Usuń plik lub wyślij link.', att: 'Załącznik',
    intent: 'wysłać e-mail „{s}” do {t}', confirm: 'Wysłać „{s}” do {t}?', sentTitle: 'Wysłane', unread: '{n} nieprzeczytanych',
  },
};

export const mailSend = {
  id: 'mail-send', kind: 'mail', langs: ['en', 'uk', 'pl'],
  make(rng, lang, il) {
    const v = V[lang];
    const k = rng.int(v.mails.length);
    const [a, b, t, body] = v.mails[k];
    const [s, w] = rng.chance(0.5) ? [a, b] : [b, a];
    const file = `${['scan', 'photos', 'plan', 'notes'][rng.int(4)]}-${10 + rng.int(89)}.${['pdf', 'zip'][rng.int(2)]} (${26 + rng.int(20)} MB)`;
    const drafts = 2 + rng.int(4);
    const unread = 1 + rng.int(9);
    const user = rng.pick(v.users);
    const brand = rng.pick(v.brands);
    const vars = { s, w, t };
    const sentRows = (state) => [...(state === 'done' ? [s] : state === 'wrong' ? [w] : []), ...v.sentOld];
    const folders = (state, ui) => list(v.folders.map((f, i) => {
      const n = i === 0 ? ` (${fill(v.unread, { n: unread })})` : i === 1 ? ` (${state === 'done' || state === 'wrong' ? drafts - 1 : drafts})` : '';
      return `${ui.a(f, '/mail/f')}${esc(n)}`;
    }));
    return {
      kind: 'mail', brand, title: `${s} – ${brand}`, at: `/mail/drafts/${3000 + rng.int(6000)}`, nav: v.nav, slug: 'mail', user,
      crumbs: [v.folders[1]], intent: fill(V[il].intent, vars),
      main(state, ui) {
        if (state === 'done' || state === 'wrong') {
          return `<h1>${esc(v.folders[1])}</h1><table>${[w, s].filter((x) => x !== (state === 'done' ? s : w)).concat(v.inbox.slice(0, drafts - 2)).map((x) => `<tr><td>${esc(x)}</td></tr>`).join('')}</table>`;
        }
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(v.invalid)}</p>` : '';
        return `<h1>${esc(s)}</h1>${ui.input(v.to, t)}${ui.input(v.subj, s)}${ui.input('', body, { area: true })}<p>${esc(v.att)}: ${esc(file)}</p>${err}<p>${ui.btn(v.send, { pri: true, acted: true })} ${ui.btn(v.discard)}</p>`;
      },
      aside(state, ui) {
        return `<section>${folders(state, ui)}</section>` + box(v.sentBox, list(sentRows(state).map(esc)));
      },
      drafty: true, ok: v.ok, bad: fill(v.bad, vars), invalid: v.invalid, confirmQ: fill(v.confirm, vars),
      confirm: {
        at: '/mail/sent', title: `${v.sentTitle} – ${brand}`,
        main(ui) {
          return `<h1>${esc(v.sentTitle)}</h1><table>${sentRows('done').map((x, i) => `<tr${i === 0 ? ' class="row-hl"' : ''}><td>${i === 0 ? esc(t) : ''}</td><td>${esc(x)}</td></tr>`).join('')}</table><p class="muted">${esc(v.ok)}</p>`;
        },
      },
      errAt: '/mail/send',
      why: {
        change: `"${s}" now heads the recently sent list and Drafts went from ${drafts} to ${drafts - 1}`,
        wrong: `the draft "${w}" was sent instead and "${s}" is still a draft`,
        unchanged: `"${s}" is still an open draft and Drafts still shows ${drafts}`,
        confirm: `is the Sent folder with "${s}" to ${t} at the top`,
      },
    };
  },
};
