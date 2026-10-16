// Template mail-message: one sent message in a webmail client. Result: the attached PDF.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Tern Mail', 'Postwick', 'Quietbox'], nav: ['Inbox', 'Sent', 'Drafts', 'Outbox', 'Archive'],
    subj: 'Invoice', to: 'To', date: 'Date', st: 'Delivery', body: 'Hello, please find the invoice attached. Payment terms are 14 days. Kind regards.',
    ladder: ['In Outbox', 'Sent', 'Delivered'], neg: ['Not delivered', 'The message about {ref} was not delivered: the recipient address does not exist.'],
    pend: 'The attachment was larger than 25 MB and was left out of this message.', queued: 'The message about {ref} is waiting in the Outbox and will be sent when you are back online.',
    folders: 'Folders', labels: ['Clients', 'Receipts', 'Travel'], quota: 'Storage: 4.1 GB of 15 GB',
    E: { main: 'The email about {ref} sent to {who}', res: 'The PDF attached to the email about {ref}', num: 'The email about {ref} sent on {num}', status: 'The email about {ref} reached {who}' },
  },
  uk: {
    brands: ['Пошта Крячок', 'Листоноша', 'Тиха Скринька'], nav: ['Вхідні', 'Надіслані', 'Чернетки', 'Вихідні', 'Архів'],
    subj: 'Рахунок', to: 'Кому', date: 'Дата', st: 'Доставка', body: 'Добрий день, рахунок у вкладенні. Строк оплати — 14 днів. З повагою.',
    ladder: ['У вихідних', 'Надіслано', 'Доставлено'], neg: ['Не доставлено', 'Лист щодо {ref} не доставлено: адреси одержувача не існує.'],
    pend: 'Вкладення було більше за 25 МБ, тому його не додано до листа.', queued: 'Лист щодо {ref} чекає у вихідних і буде надісланий, щойно з’явиться зв’язок.',
    folders: 'Папки', labels: ['Клієнти', 'Чеки', 'Подорожі'], quota: 'Сховище: 4,1 ГБ з 15 ГБ',
    E: { main: 'Лист щодо {ref} (одержувач: {who})', res: 'PDF-вкладення до листа щодо {ref}', num: 'Лист щодо {ref}, надісланий {num}', status: 'Лист щодо {ref} доставлено одержувачу ({who})' },
  },
  de: {
    brands: ['Seeschwalbe Mail', 'Postwiek', 'Stillfach'], nav: ['Posteingang', 'Gesendet', 'Entwürfe', 'Postausgang', 'Archiv'],
    subj: 'Rechnung', to: 'An', date: 'Datum', st: 'Zustellung', body: 'Guten Tag, anbei die Rechnung. Zahlungsziel 14 Tage. Mit freundlichen Grüßen.',
    ladder: ['Im Postausgang', 'Gesendet', 'Zugestellt'], neg: ['Nicht zugestellt', 'Die Nachricht zu {ref} wurde nicht zugestellt: Die Empfängeradresse existiert nicht.'],
    pend: 'Der Anhang war größer als 25 MB und wurde nicht mitgeschickt.', queued: 'Die Nachricht zu {ref} wartet im Postausgang und wird gesendet, sobald Sie wieder online sind.',
    folders: 'Ordner', labels: ['Kunden', 'Belege', 'Reisen'], quota: 'Speicher: 4,1 GB von 15 GB',
    E: { main: 'Die E-Mail zu {ref} an {who}', res: 'Das PDF im Anhang der E-Mail zu {ref}', num: 'Die E-Mail zu {ref}, gesendet am {num}', status: 'Die E-Mail zu {ref} ist bei {who} angekommen' },
  },
  es: {
    brands: ['Correo Charrán', 'Postiga', 'Buzón Sereno'], nav: ['Recibidos', 'Enviados', 'Borradores', 'Bandeja de salida', 'Archivo'],
    subj: 'Factura', to: 'Para', date: 'Fecha', st: 'Entrega', body: 'Hola, adjunto la factura. El plazo de pago es de 14 días. Un saludo.',
    ladder: ['En la bandeja de salida', 'Enviado', 'Entregado'], neg: ['No entregado', 'El mensaje sobre {ref} no se ha entregado: la dirección del destinatario no existe.'],
    pend: 'El adjunto superaba los 25 MB y no se incluyó en este mensaje.', queued: 'El mensaje sobre {ref} espera en la bandeja de salida y se enviará cuando vuelvas a tener conexión.',
    folders: 'Carpetas', labels: ['Clientes', 'Recibos', 'Viajes'], quota: 'Almacenamiento: 4,1 GB de 15 GB',
    E: { main: 'El correo sobre {ref} enviado a {who}', res: 'El PDF adjunto al correo sobre {ref}', num: 'El correo sobre {ref} enviado el {num}', status: 'El correo sobre {ref} ha llegado a {who}' },
  },
};

export const mailMessage = {
  id: 'mail-message', kind: 'mail', langs: ['en', 'uk', 'de', 'es'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `INV-${20000 + r.int(79000)}`, spec: { type: 'date' } });
    const v = c.v;
    const kb = 120 + rng.int(800);
    return {
      ...c, kind: 'mail', nav: v.nav, slug: 'mail', crumbs: [v.nav[1]], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${v.subj} ${x.ref} - ${c.brand}`, at: (ref) => `/mail/sent/${ref.toLowerCase()}`, resText: `${c.f.ref.toLowerCase()}.pdf`, loadTitle: v.nav[1],
      en: { thing: 'email', res: 'PDF attachment', num: 'sending date' },
      main(x, ui) {
        const res = `<div class="card">📎 ${ui.a(`${x.ref.toLowerCase()}.pdf`, `/mail/att/${x.ref.toLowerCase()}`)} · ${kb} KB</div>`;
        return `<h1>${esc(v.subj)} ${esc(x.ref)}</h1>${rows([[v.to, esc(x.who)], [v.date, esc(x.num)], [v.st, stageBadge(x)]])}
<p>${esc(v.body)}</p>${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: (x, ui) => box(v.folders, list(v.labels.map((l) => ui.a(l, '/mail/label')))) + `<p class="muted">${esc(v.quota)}</p>`,
    };
  },
};
