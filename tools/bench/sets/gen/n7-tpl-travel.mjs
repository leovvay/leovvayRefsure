// Template travel-booking: a rail and coach booking site's trip summary page. Categories: confirmation (booking),
// error (seat or payment problem), total (fare), greeting. No price appears outside the slot.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { amounts, nearRef, people, refCode } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Railwise', 'Brightway Coaches', 'Meridian Rail'], nav: ['Trains', 'Coaches', 'Railcards', 'My trips'], cur: 'EUR',
    users: [['Alice', 'Alice Moran'], ['Ben', 'Ben Hartley'], ['Chloe', 'Chloe Ennis'], ['Victor', 'Victor Hale']],
    h: 'Your trip', crumbs: ['Search', 'Seats', 'Summary'], route: [['Porto Campanhã', 'Coimbra-B'], ['Valencia Nord', 'Alicante'], ['Lyon Part-Dieu', 'Grenoble']],
    out: 'Outbound', pax: 'Passengers', paxN: ['1 adult', '2 adults', '1 adult, 1 child'], seat: 'Seats', seats: ['Coach 4, seats 31–32', 'Coach 7, seat 12', 'Coach 2, seats 5–6'], times: ['08:12 → 09:20', '13:45 → 15:31', '17:05 → 18:14'],
    book: 'Book and pay', change: 'Change seats', side: ['Travel help', 'Luggage allowance', 'Accessibility assistance', 'Delays and refunds'],
    ok: 'Booking {r} confirmed', neg: 'Booking {r} was not completed. You have not been charged.', pending: 'Confirming your seats with the operator…', mention: 'Your booking confirmation will appear here once the operator accepts it.',
    e1: 'We couldn’t book this trip: the seats you chose were just taken.', e2: 'We couldn’t book this trip: the service has been cancelled by the operator.',
    clear: 'Your seats are still available. No problems found.', checking: 'Checking seat availability…', emention: 'If there is a problem with your booking, the reason is shown here.',
    errSpec: 'an error saying the chosen seats were taken', total: 'Total fare', tpending: 'updating…', tmention: 'shown after you choose seats',
  },
  es: {
    brands: ['Rielia', 'Autocares Horizonte', 'Meridiana Tren'], nav: ['Trenes', 'Autocares', 'Tarjetas', 'Mis viajes'], cur: 'EUR',
    users: [['Lucía', 'Lucía Pardo'], ['Mateo', 'Mateo Ruiz'], ['Carmen', 'Carmen Soler'], ['Diego', 'Diego Navas']],
    h: 'Tu viaje', crumbs: ['Búsqueda', 'Asientos', 'Resumen'], route: [['Valencia Nord', 'Alicante'], ['Sevilla Santa Justa', 'Córdoba'], ['Zaragoza Delicias', 'Huesca']],
    out: 'Ida', pax: 'Viajeros', paxN: ['1 adulto', '2 adultos', '1 adulto, 1 niño'], seat: 'Asientos', seats: ['Coche 4, asientos 31–32', 'Coche 7, asiento 12', 'Coche 2, asientos 5–6'], times: ['08:12 → 09:20', '13:45 → 15:31', '17:05 → 18:14'],
    book: 'Reservar y pagar', change: 'Cambiar asientos', side: ['Ayuda al viajero', 'Equipaje permitido', 'Asistencia y accesibilidad', 'Retrasos y reembolsos'],
    ok: 'Reserva {r} confirmada', neg: 'La reserva {r} no se ha completado. No se te ha cobrado nada.', pending: 'Confirmando tus asientos con el operador…', mention: 'Aquí aparecerá la confirmación de tu reserva cuando el operador la acepte.',
    e1: 'No hemos podido reservar este viaje: los asientos elegidos acaban de ocuparse.', e2: 'No hemos podido reservar este viaje: el operador ha cancelado el servicio.',
    clear: 'Tus asientos siguen disponibles. No hay ningún problema.', checking: 'Comprobando la disponibilidad…', emention: 'Si hay algún problema con tu reserva, aquí verás el motivo.',
    errSpec: 'an error saying the chosen seats were taken', total: 'Precio total', tpending: 'actualizando…', tmention: 'se mostrará cuando elijas asientos',
  },
};

export const travelBooking = {
  id: 'travel-booking', kind: 'travel', langs: ['en', 'es'], cats: ['confirmation', 'total', 'error', 'greeting'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const r = refCode(rng, 6);
    const near = nearRef(rng, r);
    const k = rng.int(3);
    const [a, b] = v.route[k];
    const m = amounts(rng, lang, v.cur);
    return {
      kind: 'travel', brand, title: `${v.h} · ${brand}`, at: '/trip/summary', host: 'tickets', nav: v.nav, slug: 'travel', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        return `<h1>${esc(v.h)}</h1>${slot}<table><tbody><tr><th>${esc(v.out)}</th><td>${esc(a)} → ${esc(b)}, ${esc(v.times[k])}</td></tr>
<tr><th>${esc(v.pax)}</th><td>${esc(v.paxN[(k + 1) % 3])}</td></tr><tr><th>${esc(v.seat)}</th><td>${esc(v.seats[(k + 2) % 3])}</td></tr></tbody></table>
<p>${ui.btn(v.book, { pri: true })} ${ui.btn(v.change)}</p>`;
      },
      aside(ui) { return box(v.side[0], list(v.side.slice(1).map((x) => ui.a(x, '/help')))); },
      cats: {
        confirmation: { ok: v.ok.replace('{r}', r), wrong: v.ok.replace('{r}', near), neg: v.neg.replace('{r}', r), pending: v.pending, mention: v.mention, spec: `a confirmation of booking ${r}` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: v.errSpec },
        total: { label: v.total, val: m.val, near: m.near, pending: v.tpending, mention: v.tmention, spec: m.spec },
      },
    };
  },
};
