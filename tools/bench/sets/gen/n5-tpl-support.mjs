// Template support-request: a help-centre "new request" form with the member's open requests beside it; the step
// submits a new request. Wrong item: the text lands as a reply on an older request about the same product.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Kettlewise Help Centre', 'Brightline Support', 'Homefix Care'], nav: ['Help centre', 'My requests', 'Community', 'Status'], users: ['Mara Quint', 'Owen Strick', 'Priya Calder'],
    issues: [['Router keeps dropping Wi-Fi at night', 'Router: slow Wi-Fi upstairs', 'Since Monday the connection drops every night around 1 am and only a restart brings it back.'], ['Washing machine shows error E21', 'Washing machine: door seal leaking', 'The drum fills but the programme stops with E21 after ten minutes.'], ['Charged twice for the October invoice', 'October invoice: wrong address', 'My card shows two payments of the same amount for the October invoice.']],
    h: 'Submit a request', subj: 'Subject', desc: 'Description', prod: 'Product', prods: ['Home internet', 'Appliances', 'Billing'], submit: 'Submit request', cancel: 'Cancel',
    mine: 'My open requests', open: 'Open', upd: 'Updated just now', ago: 'updated 4 days ago', tip: 'Most requests get a first reply within one working day.',
    ok: 'Request #{n} submitted', bad: 'Your message was added to request #{o}', invalid: 'Add your account or order number to the description so we can find you.',
    intent: 'submit a support request about "{s}"', confirm: 'Submit the request "{s}"?', cTitle: 'Request #{n} received', cBody: 'Thanks. We have emailed you a copy. You can follow the request under My requests.',
  },
  uk: {
    brands: ['Центр допомоги Чайничок', 'Світлолінія Підтримка', 'Домолад Сервіс'], nav: ['Допомога', 'Мої звернення', 'Спільнота', 'Стан сервісів'], users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук'],
    issues: [['Роутер щоночі втрачає Wi-Fi', 'Роутер: повільний Wi-Fi на другому поверсі', 'З понеділка зв’язок щоночі зникає близько першої і повертається лише після перезапуску.'], ['Пральна машина показує помилку E21', 'Пральна машина: протікає ущільнювач дверцят', 'Барабан набирає воду, але через десять хвилин програма зупиняється з E21.'], ['Подвійне списання за жовтневий рахунок', 'Жовтневий рахунок: неправильна адреса', 'На картці два однакові платежі за жовтневий рахунок.']],
    h: 'Нове звернення', subj: 'Тема', desc: 'Опис', prod: 'Продукт', prods: ['Домашній інтернет', 'Побутова техніка', 'Рахунки'], submit: 'Надіслати звернення', cancel: 'Скасувати',
    mine: 'Мої відкриті звернення', open: 'Відкрите', upd: 'Оновлено щойно', ago: 'оновлено 4 дні тому', tip: 'Зазвичай перша відповідь надходить протягом робочого дня.',
    ok: 'Звернення №{n} надіслано', bad: 'Ваше повідомлення додано до звернення №{o}', invalid: 'Додайте до опису номер договору або замовлення, щоб ми могли вас знайти.',
    intent: 'надіслати звернення в підтримку щодо «{s}»', confirm: 'Надіслати звернення «{s}»?', cTitle: 'Звернення №{n} отримано', cBody: 'Дякуємо. Копію надіслано на вашу пошту. Стежити за зверненням можна в розділі «Мої звернення».',
  },
  es: {
    brands: ['Centro de ayuda Tetera', 'Soporte Líneaclara', 'Hogarfix Atención'], nav: ['Ayuda', 'Mis solicitudes', 'Comunidad', 'Estado'], users: ['Lucía Varela', 'Diego Montaño', 'Carmen Ibarra'],
    issues: [['El router pierde el wifi por la noche', 'Router: wifi lento en la planta de arriba', 'Desde el lunes la conexión se cae cada noche hacia la 1 y solo vuelve al reiniciar.'], ['La lavadora muestra el error E21', 'Lavadora: pierde agua por la goma de la puerta', 'El tambor se llena pero el programa se para con E21 a los diez minutos.'], ['Me habéis cobrado dos veces la factura de octubre', 'Factura de octubre: dirección incorrecta', 'En la tarjeta aparecen dos cargos iguales por la factura de octubre.']],
    h: 'Enviar una solicitud', subj: 'Asunto', desc: 'Descripción', prod: 'Producto', prods: ['Internet en casa', 'Electrodomésticos', 'Facturación'], submit: 'Enviar solicitud', cancel: 'Cancelar',
    mine: 'Mis solicitudes abiertas', open: 'Abierta', upd: 'Actualizada ahora', ago: 'actualizada hace 4 días', tip: 'La mayoría de las solicitudes reciben respuesta en un día laborable.',
    ok: 'Solicitud n.º {n} enviada', bad: 'Tu mensaje se ha añadido a la solicitud n.º {o}', invalid: 'Añade tu número de cliente o de pedido en la descripción para que podamos encontrarte.',
    intent: 'enviar una solicitud de soporte sobre «{s}»', confirm: '¿Enviar la solicitud «{s}»?', cTitle: 'Solicitud n.º {n} recibida', cBody: 'Gracias. Te hemos enviado una copia por correo. Puedes seguirla en Mis solicitudes.',
  },
  pl: {
    brands: ['Centrum pomocy Czajnik', 'Jasna Linia Wsparcie', 'Domofix Serwis'], nav: ['Pomoc', 'Moje zgłoszenia', 'Społeczność', 'Status usług'], users: ['Zofia Wrzos', 'Kacper Lisowski', 'Ewa Brzezińska'],
    issues: [['Router co noc gubi Wi-Fi', 'Router: wolne Wi-Fi na piętrze', 'Od poniedziałku połączenie znika co noc około pierwszej i wraca dopiero po restarcie.'], ['Pralka pokazuje błąd E21', 'Pralka: cieknie uszczelka drzwi', 'Bęben się napełnia, ale po dziesięciu minutach program staje z błędem E21.'], ['Podwójne obciążenie za fakturę październikową', 'Faktura październikowa: zły adres', 'Na karcie widzę dwie takie same płatności za fakturę z października.']],
    h: 'Nowe zgłoszenie', subj: 'Temat', desc: 'Opis', prod: 'Produkt', prods: ['Internet domowy', 'AGD', 'Rozliczenia'], submit: 'Wyślij zgłoszenie', cancel: 'Anuluj',
    mine: 'Moje otwarte zgłoszenia', open: 'Otwarte', upd: 'Zaktualizowano przed chwilą', ago: 'zaktualizowano 4 dni temu', tip: 'Większość zgłoszeń dostaje odpowiedź w ciągu jednego dnia roboczego.',
    ok: 'Wysłano zgłoszenie nr {n}', bad: 'Twoja wiadomość została dodana do zgłoszenia nr {o}', invalid: 'Dopisz w opisie numer klienta lub zamówienia, abyśmy mogli Cię znaleźć.',
    intent: 'wysłać zgłoszenie do pomocy w sprawie „{s}”', confirm: 'Wysłać zgłoszenie „{s}”?', cTitle: 'Otrzymaliśmy zgłoszenie nr {n}', cBody: 'Dziękujemy. Kopię wysłaliśmy e-mailem. Zgłoszenie znajdziesz w sekcji Moje zgłoszenia.',
  },
};

export const supportRequest = {
  id: 'support-request', kind: 'support', langs: ['en', 'uk', 'es', 'pl'],
  make(rng, lang, il) {
    const v = V[lang];
    const k = rng.int(v.issues.length);
    const [s, older, body] = v.issues[k];
    const n = 48000 + rng.int(9000);
    const o = n - 300 - rng.int(2000);
    const o2 = o - 50 - rng.int(400);
    const other = v.issues[(k + 1) % v.issues.length][1];
    const user = rng.pick(v.users);
    const brand = rng.pick(v.brands);
    const vars = { s, n, o };
    const rows = (state) => [
      ...(state === 'done' ? [`<strong>#${n} ${esc(s)}</strong> · ${esc(v.open)} · ${esc(v.upd)}`] : []),
      `#${o} ${esc(older)} · ${esc(v.open)} · ${esc(state === 'wrong' ? v.upd : v.ago)}`,
      `#${o2} ${esc(other)} · ${esc(v.open)} · ${esc(v.ago)}`,
    ];
    return {
      kind: 'support', brand, title: `${v.h} – ${brand}`, at: '/requests/new', nav: v.nav, slug: 'help', user,
      crumbs: [v.nav[0], v.h], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(v.invalid)}</p>` : '';
        return `<h1>${esc(v.h)}</h1>${ui.select(v.prod, v.prods, v.prods[k])}${ui.input(v.subj, s)}${ui.input(v.desc, body, { area: true })}${err}<p>${ui.btn(v.submit, { pri: true, acted: true })} ${ui.btn(v.cancel)}</p><p class="muted">${esc(v.tip)}</p>`;
      },
      aside(state, ui) {
        return box(v.mine, list(rows(state))) + box(v.nav[3], `<p>${ui.a(v.nav[3], '/status')}</p>`);
      },
      drafty: true, ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: v.invalid, confirmQ: fill(v.confirm, vars),
      confirm: {
        at: `/requests/${n}`, title: `${fill(v.cTitle, vars)} – ${brand}`,
        main(ui) {
          return `<h1>${esc(fill(v.cTitle, vars))}</h1><p><strong>${esc(s)}</strong></p><p>${esc(v.cBody)}</p><p>${ui.a(v.nav[1], '/requests')}</p>`;
        },
      },
      errAt: '/requests',
      why: {
        change: `"${v.mine}" now starts with the new request #${n} "${s}"`,
        wrong: `the older request #${o} "${older}" was updated just now and no new request about "${s}" exists`,
        unchanged: `no request about "${s}" is listed`,
        confirm: `confirms request #${n} about "${s}" was received`,
      },
    };
  },
};
