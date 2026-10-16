// Template travel-seat: manage a flight booking with two passengers; the step moves one passenger to a new seat.
// Wrong item: the other passenger is moved. Invalid: the seat rule refuses it (exit row).
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Skylark Air', 'Bluefen Airways', 'Corsair Regional'], nav: ['Book', 'Manage booking', 'Check in', 'Flight status', 'Help'],
    pax: [['Mara Quint', 'Tobias Quint'], ['Owen Strick', 'Lena Strick'], ['Priya Calder', 'Arun Calder']], routes: [['Lisbon', 'Hamburg'], ['Kraków', 'Porto'], ['Bergen', 'Valencia']],
    h: 'Manage booking', bk: 'Booking reference', flight: 'Flight', pass: 'Passenger', seat: 'Seat', pick: 'New seat', apply: 'Confirm seat', back: 'Back to booking',
    fare: 'Fare: Standard. Seat changes are free up to 24 hours before departure.', bag: 'Baggage', bagTxt: '1 cabin bag (10 kg) per passenger', extras: 'Extras', ex: ['Add priority boarding', 'Add travel insurance'],
    ok: 'Seat {s} confirmed for {p}', bad: 'Seat {s} confirmed for {o}', invalid: 'Seat {s} is in an exit row. Passengers in exit rows must be 16 or older and able to help in an emergency.',
    intent: 'move {p} to seat {s}', confirm: 'Move {p} to seat {s}?', cTitle: 'Seat change confirmed', cBody: 'We have updated your boarding passes. The new seats are below.',
  },
  uk: {
    brands: ['Жайвір Ейр', 'Синя Лінія', 'Карпати Регіон'], nav: ['Купити', 'Моє бронювання', 'Реєстрація', 'Статус рейсу', 'Допомога'],
    pax: [['Ірина Коваль', 'Максим Коваль'], ['Богдан Савчин', 'Олена Савчин'], ['Дарина Ліщук', 'Андрій Ліщук']], routes: [['Львів', 'Гданськ'], ['Київ', 'Варшава'], ['Одеса', 'Відень']],
    h: 'Моє бронювання', bk: 'Код бронювання', flight: 'Рейс', pass: 'Пасажир', seat: 'Місце', pick: 'Нове місце', apply: 'Підтвердити місце', back: 'До бронювання',
    fare: 'Тариф: Стандарт. Змінити місце можна безкоштовно до 24 годин до вильоту.', bag: 'Багаж', bagTxt: '1 ручна поклажа (10 кг) на пасажира', extras: 'Додатково', ex: ['Пріоритетна посадка', 'Страхування подорожі'],
    ok: 'Місце {s} підтверджено для пасажира {p}', bad: 'Місце {s} підтверджено для пасажира {o}', invalid: 'Місце {s} у ряду аварійного виходу. Там можуть сидіти лише пасажири від 16 років, здатні допомогти в разі небезпеки.',
    intent: 'пересадити пасажира {p} на місце {s}', confirm: 'Пересадити {p} на місце {s}?', cTitle: 'Зміну місця підтверджено', cBody: 'Ми оновили посадкові талони. Нові місця вказано нижче.',
  },
  de: {
    brands: ['Lerche Air', 'Nordfjord Airlines', 'Alpenflug Regional'], nav: ['Buchen', 'Meine Buchung', 'Check-in', 'Flugstatus', 'Hilfe'],
    pax: [['Lena Brückner', 'Felix Brückner'], ['Jonas Hellwig', 'Clara Hellwig'], ['Mia Kessler', 'Tom Kessler']], routes: [['Bremen', 'Lissabon'], ['Dresden', 'Palma'], ['Graz', 'Kopenhagen']],
    h: 'Meine Buchung', bk: 'Buchungscode', flight: 'Flug', pass: 'Reisende/r', seat: 'Sitz', pick: 'Neuer Sitz', apply: 'Sitz bestätigen', back: 'Zur Buchung',
    fare: 'Tarif: Standard. Sitzänderungen sind bis 24 Stunden vor Abflug kostenlos.', bag: 'Gepäck', bagTxt: '1 Handgepäck (10 kg) pro Person', extras: 'Extras', ex: ['Priority Boarding hinzufügen', 'Reiseversicherung hinzufügen'],
    ok: 'Sitz {s} für {p} bestätigt', bad: 'Sitz {s} für {o} bestätigt', invalid: 'Sitz {s} liegt in einer Notausgangsreihe. Dort dürfen nur Personen ab 16 Jahren sitzen, die im Notfall helfen können.',
    intent: '{p} auf Sitz {s} umsetzen', confirm: '{p} auf Sitz {s} umsetzen?', cTitle: 'Sitzänderung bestätigt', cBody: 'Wir haben Ihre Bordkarten aktualisiert. Die neuen Sitze finden Sie unten.',
  },
  es: {
    brands: ['Alondra Air', 'Bahía Azul Líneas', 'Sierra Regional'], nav: ['Reservar', 'Mi reserva', 'Facturación', 'Estado del vuelo', 'Ayuda'],
    pax: [['Lucía Varela', 'Hugo Varela'], ['Diego Montaño', 'Inés Montaño'], ['Carmen Ibarra', 'Pablo Ibarra']], routes: [['Sevilla', 'Bruselas'], ['Bilbao', 'Roma'], ['Málaga', 'Dublín']],
    h: 'Mi reserva', bk: 'Localizador', flight: 'Vuelo', pass: 'Pasajero', seat: 'Asiento', pick: 'Nuevo asiento', apply: 'Confirmar asiento', back: 'Volver a la reserva',
    fare: 'Tarifa: Estándar. Cambiar de asiento es gratis hasta 24 horas antes de la salida.', bag: 'Equipaje', bagTxt: '1 equipaje de mano (10 kg) por pasajero', extras: 'Extras', ex: ['Añadir embarque prioritario', 'Añadir seguro de viaje'],
    ok: 'Asiento {s} confirmado para {p}', bad: 'Asiento {s} confirmado para {o}', invalid: 'El asiento {s} está en una fila de salida de emergencia. Solo pueden ocuparlo mayores de 16 años capaces de ayudar en una emergencia.',
    intent: 'cambiar a {p} al asiento {s}', confirm: '¿Cambiar a {p} al asiento {s}?', cTitle: 'Cambio de asiento confirmado', cBody: 'Hemos actualizado tus tarjetas de embarque. Los nuevos asientos están abajo.',
  },
};

const LETTERS = 'ABCDEF';
const seatOf = (rng) => `${3 + rng.int(25)}${LETTERS[rng.int(6)]}`;

export const travelSeat = {
  id: 'travel-seat', kind: 'travel', langs: ['en', 'uk', 'de', 'es'],
  make(rng, lang, il) {
    const v = V[lang];
    const pair = rng.pick(v.pax);
    const [p, o] = rng.chance(0.5) ? pair : [pair[1], pair[0]];
    let s = seatOf(rng);
    const sp = seatOf(rng);
    const so = `${sp.slice(0, -1)}${LETTERS[(LETTERS.indexOf(sp.slice(-1)) + 1) % 6]}`;
    if (s === sp || s === so) s = `${Number.parseInt(sp, 10) + 2}C`;
    const [from, to] = rng.pick(v.routes);
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rng.int(32)]).join('');
    const fl = `${['SK', 'BF', 'CR'][rng.int(3)]} ${100 + rng.int(800)}`;
    const date = `${10 + rng.int(18)}.11.2026`;
    const brand = rng.pick(v.brands);
    const vars = { p, o, s };
    const seats = (state) => [[p, state === 'done' ? s : sp], [o, state === 'wrong' ? s : so]];
    const table = (rows) => `<table><tr><th>${esc(v.pass)}</th><th>${esc(v.seat)}</th></tr>${rows.map(([n, x]) => `<tr><td>${esc(n)}</td><td><strong>${esc(x)}</strong></td></tr>`).join('')}</table>`;
    return {
      kind: 'travel', brand, title: `${v.h} ${code} | ${brand}`, at: `/booking/${code}/seats`, nav: v.nav, slug: 'trip', user: null,
      crumbs: [v.nav[1], code], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(fill(v.invalid, vars))}</p>` : '';
        return `<h1>${esc(v.h)}</h1><p>${esc(v.bk)}: <strong>${code}</strong> · ${esc(v.flight)} ${fl} · ${esc(from)} → ${esc(to)} · ${date}</p>${table(seats(state))}
<h2>${esc(v.pick)}</h2>${ui.select(v.pass, [p, o], p)}${ui.input(v.pick, s)}${err}<p>${ui.btn(v.apply, { pri: true, acted: true })} ${ui.a(v.back, `/booking/${code}`)}</p><p class="muted">${esc(v.fare)}</p>`;
      },
      aside(state, ui) {
        return box(v.bag, `<p>${esc(v.bagTxt)}</p>`) + box(v.extras, list(v.ex.map((x) => ui.a(x, '/extras'))));
      },
      ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: fill(v.invalid, vars), confirmQ: fill(v.confirm, vars),
      confirm: {
        at: `/booking/${code}/seats/confirmed`, title: `${v.cTitle} | ${brand}`,
        main(ui) {
          return `<h1>${esc(v.cTitle)}</h1><p>${esc(v.cBody)}</p><p>${esc(v.bk)}: <strong>${code}</strong> · ${esc(v.flight)} ${fl}</p>${table(seats('done'))}<p>${ui.a(v.back, `/booking/${code}`)}</p>`;
        },
      },
      errAt: `/booking/${code}/seats`,
      why: {
        change: `the passenger table now gives ${p} seat ${s} (was ${sp})`,
        wrong: `seat ${s} went to ${o}, while ${p} keeps seat ${sp}`,
        unchanged: `${p} still has seat ${sp}`,
        confirm: `confirms the seat change and lists ${p} in seat ${s}`,
      },
    };
  },
};
