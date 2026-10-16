// Template support-ticket: a refund request in a customer help centre. Result: the support agent's reply.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Fernhill Help Centre', 'Voltwick Support', 'Marrow & Pine Care'], nav: ['Help centre', 'My requests', 'Community', 'Status', 'Contact'], cur: 'EUR', amt: [12, 560],
    h: 'Request', subj: 'Refund for a damaged item', by: 'Requester', amount: 'Refund requested', ladder: ['Open', 'Pending', 'Solved'],
    neg: ['Closed, not solved', 'Request {ref} was closed without a refund. Reply within 7 days if you want it reopened.'], agent: 'Agent reply',
    reply: 'The refund has been approved and sent to your original payment method.', pend: 'An agent has picked up request {ref}; their reply will appear here.',
    queued: 'Request {ref} is in the queue. Expected first reply: within 2 working days.', faq: 'Popular articles', faqs: ['Return a parcel', 'Change a delivery address'],
    E: { main: 'Support request {ref} opened by {who}', res: 'A written answer from support on request {ref}', num: 'Request {ref} asking for a refund of {num}', status: 'Request {ref} has been resolved' },
  },
  uk: {
    brands: ['Центр допомоги Ліщина', 'Підтримка Вольтик', 'Турбота Сосна'], nav: ['Довідка', 'Мої звернення', 'Спільнота', 'Стан сервісу', 'Контакти'], cur: 'UAH', amt: [400, 22000],
    h: 'Звернення', subj: 'Повернення коштів за пошкоджений товар', by: 'Автор', amount: 'Сума до повернення', ladder: ['Відкрите', 'Очікує', 'Вирішене'],
    neg: ['Закрите без вирішення', 'Звернення {ref} закрито без повернення коштів. Відповідайте протягом 7 днів, якщо хочете його відкрити знову.'], agent: 'Відповідь оператора',
    reply: 'Повернення схвалено, кошти надіслано на картку, якою ви платили.', pend: 'Оператор узяв звернення {ref} у роботу; відповідь з’явиться тут.',
    queued: 'Звернення {ref} у черзі. Перша відповідь — протягом 2 робочих днів.', faq: 'Популярні статті', faqs: ['Повернути посилку', 'Змінити адресу доставки'],
    E: { main: 'Звернення {ref} до підтримки (автор: {who})', res: 'Письмова відповідь підтримки на звернення {ref}', num: 'Звернення {ref} про повернення {num}', status: 'Звернення {ref} вирішено' },
  },
  de: {
    brands: ['Hilfe-Center Lindgrund', 'Voltwiek Support', 'Kiefernpflege Service'], nav: ['Hilfe', 'Meine Anfragen', 'Community', 'Status', 'Kontakt'], cur: 'EUR', amt: [12, 560],
    h: 'Anfrage', subj: 'Erstattung für einen beschädigten Artikel', by: 'Von', amount: 'Erstattung beantragt', ladder: ['Offen', 'Wartend', 'Gelöst'],
    neg: ['Geschlossen, nicht gelöst', 'Anfrage {ref} wurde ohne Erstattung geschlossen. Antworten Sie innerhalb von 7 Tagen, um sie wieder zu öffnen.'], agent: 'Antwort des Supports',
    reply: 'Die Erstattung wurde genehmigt und auf Ihr ursprüngliches Zahlungsmittel überwiesen.', pend: 'Ein Mitarbeiter bearbeitet Anfrage {ref}; seine Antwort erscheint hier.',
    queued: 'Anfrage {ref} ist in der Warteschlange. Erste Antwort innerhalb von 2 Werktagen.', faq: 'Beliebte Artikel', faqs: ['Paket zurücksenden', 'Lieferadresse ändern'],
    E: { main: 'Supportanfrage {ref} von {who}', res: 'Eine schriftliche Antwort des Supports auf Anfrage {ref}', num: 'Anfrage {ref} über eine Erstattung von {num}', status: 'Anfrage {ref} ist erledigt' },
  },
  es: {
    brands: ['Centro de ayuda Ribera', 'Soporte Voltillo', 'Atención Pino'], nav: ['Ayuda', 'Mis solicitudes', 'Comunidad', 'Estado', 'Contacto'], cur: 'EUR', amt: [12, 560],
    h: 'Solicitud', subj: 'Reembolso por un artículo dañado', by: 'Solicitante', amount: 'Reembolso solicitado', ladder: ['Abierta', 'Pendiente', 'Resuelta'],
    neg: ['Cerrada sin resolver', 'La solicitud {ref} se cerró sin reembolso. Responde en 7 días si quieres reabrirla.'], agent: 'Respuesta del agente',
    reply: 'El reembolso está aprobado y se ha enviado a tu método de pago original.', pend: 'Un agente ha tomado la solicitud {ref}; su respuesta aparecerá aquí.',
    queued: 'La solicitud {ref} está en cola. Primera respuesta en un plazo de 2 días laborables.', faq: 'Artículos populares', faqs: ['Devolver un paquete', 'Cambiar la dirección de entrega'],
    E: { main: 'La solicitud de soporte {ref} abierta por {who}', res: 'Una respuesta escrita del soporte a la solicitud {ref}', num: 'La solicitud {ref} de un reembolso de {num}', status: 'La solicitud {ref} está resuelta' },
  },
  pl: {
    brands: ['Centrum Pomocy Lipa', 'Wsparcie Woltyk', 'Opieka Sosna'], nav: ['Pomoc', 'Moje zgłoszenia', 'Społeczność', 'Status', 'Kontakt'], cur: 'PLN', amt: [40, 2400],
    h: 'Zgłoszenie', subj: 'Zwrot za uszkodzony produkt', by: 'Zgłaszający', amount: 'Kwota zwrotu', ladder: ['Otwarte', 'Oczekujące', 'Rozwiązane'],
    neg: ['Zamknięte bez rozwiązania', 'Zgłoszenie {ref} zamknięto bez zwrotu. Odpowiedz w ciągu 7 dni, jeśli chcesz je ponownie otworzyć.'], agent: 'Odpowiedź konsultanta',
    reply: 'Zwrot został zatwierdzony i wysłany na pierwotną metodę płatności.', pend: 'Konsultant przejął zgłoszenie {ref}; jego odpowiedź pojawi się tutaj.',
    queued: 'Zgłoszenie {ref} czeka w kolejce. Pierwsza odpowiedź w ciągu 2 dni roboczych.', faq: 'Popularne artykuły', faqs: ['Zwróć paczkę', 'Zmień adres dostawy'],
    E: { main: 'Zgłoszenie {ref} do pomocy (zgłaszający: {who})', res: 'Pisemna odpowiedź pomocy na zgłoszenie {ref}', num: 'Zgłoszenie {ref} o zwrot {num}', status: 'Zgłoszenie {ref} zostało rozwiązane' },
  },
};

export const supportTicket = {
  id: 'support-ticket', kind: 'support', langs: ['en', 'uk', 'de', 'es', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `#${520000 + r.int(470000)}`, spec: { type: 'money' } });
    const v = c.v;
    return {
      ...c, kind: 'support', nav: v.nav, slug: 'help', crumbs: [v.nav[1]], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${v.h} ${x.ref} – ${c.brand}`, at: (ref) => `/requests/${ref.slice(1)}`, resText: v.reply, loadTitle: v.nav[1],
      en: { thing: 'request', res: 'agent reply', num: 'refund amount' },
      main(x) {
        const res = `<div class="card"><strong>${esc(v.agent)}</strong> · ${esc(c.other)}<p>${esc(v.reply)}</p></div>`;
        return `<h1>${esc(v.h)} ${esc(x.ref)}: ${esc(v.subj)}</h1><p>${stageBadge(x)}</p>${rows([[v.by, esc(x.who)], [v.amount, esc(x.num)]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: (x, ui) => box(v.faq, list(v.faqs.map((f) => ui.a(f, '/help/articles')))),
    };
  },
};
