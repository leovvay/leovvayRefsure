// Template travel-booking: a flight booking in a travel agency account. Result: the e-ticket number.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Tidewing Travel', 'Larkfield Journeys', 'Compass & Kite'], nav: ['Flights', 'Hotels', 'Trains', 'My trips', 'Help'], cur: 'EUR', amt: [60, 1400],
    h: 'Booking', pax: 'Passenger', fare: 'Total fare', route: 'Route', routes: ['Ashby Vale → Port Merrow', 'Northvale → Larchmere', 'Kestrel Bay → Wrenford'], ladder: ['Requested', 'Confirmed', 'Ticketed'],
    neg: ['Not confirmed', 'Booking {ref} could not be confirmed because the fare is no longer available. You have not been charged.'], tk: 'E-ticket number',
    pend: 'Your e-ticket number will be issued shortly and also sent by email.', queued: 'Booking {ref} is waiting for the airline to reply. This can take up to 24 hours.',
    bag: 'Baggage', bags: '1 cabin bag (8 kg) included', tips: 'Online check-in opens 48 hours before departure.',
    E: { main: 'Booking {ref} for passenger {who}', res: 'The e-ticket number for booking {ref}', num: 'Booking {ref} with a total fare of {num}', status: 'The tickets for booking {ref} have been issued' },
  },
  uk: {
    brands: ['Крило Мандрів', 'Подорожі Жайворонка', 'Компас і Змій'], nav: ['Авіа', 'Готелі', 'Потяги', 'Мої поїздки', 'Допомога'], cur: 'UAH', amt: [2400, 56000],
    h: 'Бронювання', pax: 'Пасажир', fare: 'Вартість', route: 'Маршрут', routes: ['Вербоград → Порт-Меров', 'Ясенів Брід → Ларчмір', 'Заріччя-Нове → Ренфорд'], ladder: ['Запит', 'Підтверджено', 'Квитки виписано'],
    neg: ['Не підтверджено', 'Бронювання {ref} не підтверджено: тариф більше недоступний. Кошти не списано.'], tk: 'Номер електронного квитка',
    pend: 'Номер електронного квитка буде виписано найближчим часом і надіслано поштою.', queued: 'Бронювання {ref} чекає відповіді авіакомпанії. Це може тривати до 24 годин.',
    bag: 'Багаж', bags: '1 ручна поклажа (8 кг) включена', tips: 'Онлайн-реєстрація відкривається за 48 годин до вильоту.',
    E: { main: 'Бронювання {ref} для пасажира {who}', res: 'Номер електронного квитка для бронювання {ref}', num: 'Бронювання {ref} загальною вартістю {num}', status: 'Квитки за бронюванням {ref} виписано' },
  },
  de: {
    brands: ['Gezeitenflug Reisen', 'Lerchenfeld Touristik', 'Kompass & Drachen'], nav: ['Flüge', 'Hotels', 'Bahn', 'Meine Reisen', 'Hilfe'], cur: 'EUR', amt: [60, 1400],
    h: 'Buchung', pax: 'Reisende(r)', fare: 'Gesamtpreis', route: 'Strecke', routes: ['Moorbach → Hafenstadt', 'Lindgrund → Kranichsee', 'Nordheide → Wendelstein'], ladder: ['Angefragt', 'Bestätigt', 'Ticket ausgestellt'],
    neg: ['Nicht bestätigt', 'Buchung {ref} konnte nicht bestätigt werden, da der Tarif nicht mehr verfügbar ist. Es wurde nichts belastet.'], tk: 'E-Ticket-Nummer',
    pend: 'Ihre E-Ticket-Nummer wird in Kürze ausgestellt und zusätzlich per E-Mail gesendet.', queued: 'Buchung {ref} wartet auf die Antwort der Fluggesellschaft. Das kann bis zu 24 Stunden dauern.',
    bag: 'Gepäck', bags: '1 Handgepäck (8 kg) inklusive', tips: 'Der Online-Check-in öffnet 48 Stunden vor Abflug.',
    E: { main: 'Buchung {ref} für {who}', res: 'Die E-Ticket-Nummer zur Buchung {ref}', num: 'Buchung {ref} zum Gesamtpreis von {num}', status: 'Die Tickets zur Buchung {ref} sind ausgestellt' },
  },
  es: {
    brands: ['Viajes Marea', 'Alondra Viajes', 'Brújula y Cometa'], nav: ['Vuelos', 'Hoteles', 'Trenes', 'Mis viajes', 'Ayuda'], cur: 'EUR', amt: [60, 1400],
    h: 'Reserva', pax: 'Pasajero', fare: 'Precio total', route: 'Ruta', routes: ['Valdeluz → Puerto Merino', 'Olmedilla → Lozana', 'Cabo Alcotán → Ribera'], ladder: ['Solicitada', 'Confirmada', 'Billete emitido'],
    neg: ['No confirmada', 'La reserva {ref} no se ha podido confirmar porque la tarifa ya no está disponible. No se te ha cobrado nada.'], tk: 'Número de billete electrónico',
    pend: 'El número de billete electrónico se emitirá en breve y también te llegará por correo.', queued: 'La reserva {ref} espera la respuesta de la aerolínea. Puede tardar hasta 24 horas.',
    bag: 'Equipaje', bags: '1 bulto de mano (8 kg) incluido', tips: 'La facturación online abre 48 horas antes de la salida.',
    E: { main: 'La reserva {ref} a nombre de {who}', res: 'El número de billete electrónico de la reserva {ref}', num: 'La reserva {ref} con un precio total de {num}', status: 'Los billetes de la reserva {ref} ya están emitidos' },
  },
};

export const travelBooking = {
  id: 'travel-booking', kind: 'travel', langs: ['en', 'uk', 'de', 'es'],
  make(rng, lang) {
    const L3 = 'BCDFGHJKLMNPRSTVWXZ';
    const c = common(V, lang, rng, { ref: (r) => `${L3[r.int(19)]}${L3[r.int(19)]}${4100 + r.int(5800)}`, spec: { type: 'money' } });
    const v = c.v;
    const route = rng.pick(v.routes);
    const tk = `${200 + rng.int(700)}-${4000000000 + rng.int(999999999)}`;
    return {
      ...c, kind: 'travel', nav: v.nav, slug: 'trips', crumbs: [v.nav[3], v.h], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${v.h} ${x.ref} – ${c.brand}`, at: (ref) => `/trips/${ref}`, resText: tk, loadTitle: v.nav[3],
      en: { thing: 'booking', res: 'e-ticket number', num: 'total fare' },
      main(x) {
        const res = `<div class="card"><strong>${esc(v.tk)}:</strong> ${esc(tk)}</div>`;
        return `<h1>${esc(v.h)} ${esc(x.ref)}</h1><p>${esc(route)} · ${stageBadge(x)}</p>${rows([[v.pax, esc(x.who)], [v.fare, `<strong>${esc(x.num)}</strong>`], [v.bag, esc(v.bags)]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: (x, ui) => box(v.nav[4], `<p>${esc(v.tips)}</p><p>${ui.a(v.nav[4], '/help')}</p>`),
    };
  },
};
