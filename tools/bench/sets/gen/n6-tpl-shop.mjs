// Template shop-order: an order page in a web shop (items, total, delivery, tracking). Result: the tracking number.
import { common, esc, list, box, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Fernhill Supply', 'Larkspur Home', 'Quayside Outfitters'], nav: ['New in', 'Home', 'Garden', 'Sale', 'Orders'], cur: 'GBP', amt: [24, 980],
    h: 'Order', cust: 'Customer', total: 'Order total', ship: 'Delivery to', addr: '14 Wren Lane, Ashby Vale', goods: ['Stoneware mug set (4)', 'Linen tea towel', 'Bamboo chopping board', 'Wool throw, slate'],
    ladder: ['Order received', 'Packed', 'Shipped', 'Delivered'], neg: ['Cancelled', 'Order {ref} was cancelled and will not be shipped. Your payment has been refunded.'],
    trk: 'Tracking number', track: 'Track parcel', pend: 'A tracking number will appear here once the courier scans the parcel.', queued: 'Order {ref} is waiting in the processing queue. We will email you when it moves.',
    help: 'Questions about this order?', ret: 'Returns are free within 30 days.', mine: 'Your recent orders',
    E: { main: 'Confirmation that order {ref} was placed', res: 'The courier tracking number for order {ref}', num: 'Order {ref} with a total of {num}', status: 'Order {ref} has left the warehouse' },
  },
  uk: {
    brands: ['Крамниця Ліщина', 'Дім і Сад Верес', 'Майстерня Поділ'], nav: ['Новинки', 'Дім', 'Сад', 'Знижки', 'Замовлення'], cur: 'UAH', amt: [350, 18000],
    h: 'Замовлення', cust: 'Покупець', total: 'Сума замовлення', ship: 'Доставка', addr: 'вул. Липова, 14, Вербоград', goods: ['Набір керамічних чашок (4)', 'Лляний рушник', 'Бамбукова дошка', 'Вовняний плед'],
    ladder: ['Прийнято', 'Зібрано', 'Відправлено', 'Доставлено'], neg: ['Скасовано', 'Замовлення {ref} скасовано, його не буде відправлено. Кошти повернено.'],
    trk: 'Номер ТТН', track: 'Відстежити посилку', pend: 'Номер ТТН з’явиться тут, щойно перевізник прийме посилку.', queued: 'Замовлення {ref} у черзі на обробку. Ми напишемо вам, коли воно рушить.',
    help: 'Питання щодо замовлення?', ret: 'Повернення безкоштовне протягом 30 днів.', mine: 'Ваші останні замовлення',
    E: { main: 'Підтвердження, що замовлення {ref} оформлено', res: 'Номер для відстеження посилки за замовленням {ref}', num: 'Замовлення {ref} на суму {num}', status: 'Замовлення {ref} вже виїхало зі складу' },
  },
  de: {
    brands: ['Lindgrund Versand', 'Haus Moorbach', 'Kranich & Söhne'], nav: ['Neu', 'Wohnen', 'Garten', 'Sale', 'Bestellungen'], cur: 'EUR', amt: [24, 980],
    h: 'Bestellung', cust: 'Kunde', total: 'Gesamtbetrag', ship: 'Lieferung an', addr: 'Lindenweg 14, Moorbach', goods: ['Steingut-Becher (4er-Set)', 'Leinen-Geschirrtuch', 'Bambus-Schneidebrett', 'Wolldecke, Schiefer'],
    ladder: ['Eingegangen', 'Verpackt', 'Versendet', 'Zugestellt'], neg: ['Storniert', 'Bestellung {ref} wurde storniert und wird nicht versendet. Der Betrag wurde erstattet.'],
    trk: 'Sendungsnummer', track: 'Sendung verfolgen', pend: 'Die Sendungsnummer erscheint hier, sobald der Paketdienst das Paket scannt.', queued: 'Bestellung {ref} wartet in der Bearbeitungswarteschlange. Wir melden uns per E-Mail.',
    help: 'Fragen zur Bestellung?', ret: 'Rücksendungen sind 30 Tage kostenlos.', mine: 'Ihre letzten Bestellungen',
    E: { main: 'Bestätigung, dass Bestellung {ref} aufgegeben wurde', res: 'Die Sendungsverfolgungsnummer für Bestellung {ref}', num: 'Bestellung {ref} über {num}', status: 'Bestellung {ref} hat das Lager verlassen' },
  },
  es: {
    brands: ['Almacén Ribera', 'Casa Lozana', 'Tienda El Olivar'], nav: ['Novedades', 'Hogar', 'Jardín', 'Rebajas', 'Pedidos'], cur: 'EUR', amt: [24, 980],
    h: 'Pedido', cust: 'Cliente', total: 'Importe total', ship: 'Entrega en', addr: 'Calle del Olmo 14, Valdeluz', goods: ['Juego de tazas de gres (4)', 'Paño de lino', 'Tabla de bambú', 'Manta de lana, pizarra'],
    ladder: ['Recibido', 'Preparado', 'Enviado', 'Entregado'], neg: ['Cancelado', 'El pedido {ref} se ha cancelado y no se enviará. Te hemos devuelto el importe.'],
    trk: 'Número de seguimiento', track: 'Seguir envío', pend: 'El número de seguimiento aparecerá aquí cuando la empresa de transporte escanee el paquete.', queued: 'El pedido {ref} está en la cola de procesamiento. Te avisaremos por correo.',
    help: '¿Dudas sobre el pedido?', ret: 'Devoluciones gratis durante 30 días.', mine: 'Tus pedidos recientes',
    E: { main: 'La confirmación de que el pedido {ref} se ha realizado', res: 'El número de seguimiento del pedido {ref}', num: 'El pedido {ref} por un total de {num}', status: 'El pedido {ref} ya ha salido del almacén' },
  },
  pl: {
    brands: ['Sklep Pod Lipą', 'Dom Wrzos', 'Skład Nadwiślański'], nav: ['Nowości', 'Dom', 'Ogród', 'Wyprzedaż', 'Zamówienia'], cur: 'PLN', amt: [60, 3800],
    h: 'Zamówienie', cust: 'Klient', total: 'Wartość zamówienia', ship: 'Dostawa do', addr: 'ul. Lipowa 14, Wrzosowo', goods: ['Zestaw kubków (4)', 'Lniana ściereczka', 'Deska bambusowa', 'Wełniany koc, grafit'],
    ladder: ['Przyjęte', 'Spakowane', 'Wysłane', 'Doręczone'], neg: ['Anulowane', 'Zamówienie {ref} zostało anulowane i nie zostanie wysłane. Zwróciliśmy płatność.'],
    trk: 'Numer przesyłki', track: 'Śledź paczkę', pend: 'Numer przesyłki pojawi się tutaj, gdy kurier zeskanuje paczkę.', queued: 'Zamówienie {ref} czeka w kolejce do realizacji. Damy znać e-mailem.',
    help: 'Pytania o zamówienie?', ret: 'Zwroty bezpłatne przez 30 dni.', mine: 'Twoje ostatnie zamówienia',
    E: { main: 'Potwierdzenie złożenia zamówienia {ref}', res: 'Numer śledzenia przesyłki dla zamówienia {ref}', num: 'Zamówienie {ref} o wartości {num}', status: 'Zamówienie {ref} opuściło magazyn' },
  },
};

export const shopOrder = {
  id: 'shop-order', kind: 'shop', langs: ['en', 'uk', 'de', 'es', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `A-${1000 + r.int(9000)}`, spec: { type: 'money' } });
    const v = c.v;
    const trk = `TRK ${100 + rng.int(900)} ${1000 + rng.int(9000)} ${10 + rng.int(90)}`;
    const goods = rng.shuffle(v.goods).slice(0, 2);
    return {
      ...c, kind: 'shop', nav: v.nav, slug: 'shop', crumbs: [v.nav[4]], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${v.h} ${x.ref} | ${c.brand}`, at: (ref) => `/account/orders/${ref}`, resText: trk, loadTitle: v.h,
      en: { thing: 'order', res: 'tracking number', num: 'order total' },
      main(x, ui) {
        const res = `<div class="card"><strong>${esc(v.trk)}:</strong> ${esc(trk)} · ${ui.a(v.track, `/track/${trk.replace(/ /g, '')}`)}</div>`;
        return `<h1>${esc(v.h)} ${esc(x.ref)}</h1><p>${stageBadge(x)}</p>${rows([[v.cust, esc(x.who)], [v.total, `<strong>${esc(x.num)}</strong>`], [v.ship, esc(v.addr)]])}
${list(goods.map(esc))}${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside(x, ui) {
        const other = x.ref === c.f.ref ? c.f.ref2 : `A-${1000 + ((Number(c.f.ref.slice(2)) * 7) % 9000)}`;
        return box(v.mine, list([`${ui.a(other, `/account/orders/${other}`)} · ${esc(v.ladder[3])}`])) + box(v.help, `<p>${esc(v.ret)}</p>`);
      },
    };
  },
};
