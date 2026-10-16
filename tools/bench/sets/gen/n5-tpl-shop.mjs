// Template shop-cart: a product page; the step adds one size of the product to the bag.
import { esc, fill, money } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Northpine Outfitters', 'Fieldmark Supply', 'Harrow & Vale'], nav: ['Women', 'Men', 'Kids', 'Outdoor', 'Sale'], cur: 'USD',
    products: [['Trail Runner 2', 89, ['40', '41', '42', '43', '44']], ['Coastline Rain Jacket', 129, ['S', 'M', 'L', 'XL']], ['Merino Crew Base Layer', 64, ['S', 'M', 'L', 'XL']], ['Canvas Field Trousers', 69, ['30', '32', '34', '36']]],
    owned: ['Wool Hiking Socks (2 pack)', 'Packable Sun Hat', 'Insulated Bottle 750 ml', 'Fleece Neck Gaiter'],
    size: 'Size', qty: 'Quantity', add: 'Add to bag', wish: 'Save to wishlist', bag: 'Your bag', empty: 'Your bag is empty.', sub: 'Subtotal', checkout: 'Go to checkout', recent: 'Recently viewed',
    desc: 'Breathable upper, recycled lining and a grippy outsole for wet trails. Free returns within 30 days.',
    deliv: 'Free delivery on orders over $60. Order by 3 pm for next-day dispatch.', rev: 'Customer reviews',
    revs: ['“Fits true to size, very comfortable on long walks.” – A. R.', '“Good grip, but the laces are a bit short.” – M. T.'],
    ok: 'Added to your bag: {p}, size {s}', bad: 'Added to your bag: {p}, size {w}', invalid: 'Size {s} is out of stock. Choose another size.',
    intent: 'add {p} in size {s} to the bag', confirm: 'Add {p} (size {s}) to your bag?',
    noop: ['Your bag is unchanged.'],
  },
  uk: {
    brands: ['Смерекова крамниця', 'Полонина Спорт', 'Вереск і Ко'], nav: ['Жінкам', 'Чоловікам', 'Дітям', 'Туризм', 'Розпродаж'], cur: 'UAH',
    products: [['Кросівки Стежка 2', 3290, ['40', '41', '42', '43', '44']], ['Дощовик Узбережжя', 4750, ['S', 'M', 'L', 'XL']], ['Термофутболка з мериносу', 2190, ['S', 'M', 'L', 'XL']], ['Штани польові', 2490, ['30', '32', '34', '36']]],
    owned: ['Шкарпетки трекінгові (2 пари)', 'Панама складана', 'Термопляшка 750 мл', 'Баф флісовий'],
    size: 'Розмір', qty: 'Кількість', add: 'Додати в кошик', wish: 'В обране', bag: 'Ваш кошик', empty: 'Кошик порожній.', sub: 'Разом', checkout: 'Оформити замовлення', recent: 'Ви переглядали',
    desc: 'Дихаючий верх, підкладка з переробленого матеріалу і чіпка підошва для мокрих стежок. Повернення протягом 30 днів.',
    deliv: 'Безкоштовна доставка від 1 500 ₴. Замовлення до 15:00 відправляємо наступного дня.', rev: 'Відгуки',
    revs: ['«Розмір відповідає, зручно в довгих походах.» – А. Р.', '«Добре тримає, але шнурки закороткі.» – М. Т.'],
    ok: 'Додано в кошик: {p}, розмір {s}', bad: 'Додано в кошик: {p}, розмір {w}', invalid: 'Розміру {s} немає в наявності. Оберіть інший розмір.',
    intent: 'додати {p} розміру {s} у кошик', confirm: 'Додати {p} (розмір {s}) у кошик?',
    noop: ['Кошик не змінився.'],
  },
  de: {
    brands: ['Bergfink Ausrüstung', 'Talwerk Outdoor', 'Kranich & Moos'], nav: ['Damen', 'Herren', 'Kinder', 'Outdoor', 'Sale'], cur: 'EUR',
    products: [['Trailschuh Pfad 2', 94.95, ['40', '41', '42', '43', '44']], ['Regenjacke Küste', 139, ['S', 'M', 'L', 'XL']], ['Merino-Funktionsshirt', 59.9, ['S', 'M', 'L', 'XL']], ['Feldhose Canvas', 74.5, ['46', '48', '50', '52']]],
    owned: ['Wandersocken (2er-Pack)', 'Faltbarer Sonnenhut', 'Thermoflasche 750 ml', 'Fleece-Schlauchschal'],
    size: 'Größe', qty: 'Menge', add: 'In den Warenkorb', wish: 'Merken', bag: 'Ihr Warenkorb', empty: 'Ihr Warenkorb ist leer.', sub: 'Zwischensumme', checkout: 'Zur Kasse', recent: 'Zuletzt angesehen',
    desc: 'Atmungsaktives Obermaterial, Futter aus recyceltem Material und eine griffige Sohle für nasse Wege. 30 Tage Rückgaberecht.',
    deliv: 'Kostenloser Versand ab 60 €. Bis 15 Uhr bestellt, am nächsten Tag versandt.', rev: 'Kundenbewertungen',
    revs: ['„Passt genau, sehr bequem auf langen Touren.“ – A. R.', '„Guter Halt, die Schnürsenkel sind etwas kurz.“ – M. T.'],
    ok: 'Zum Warenkorb hinzugefügt: {p}, Größe {s}', bad: 'Zum Warenkorb hinzugefügt: {p}, Größe {w}', invalid: 'Größe {s} ist nicht vorrätig. Bitte wählen Sie eine andere Größe.',
    intent: '{p} in Größe {s} in den Warenkorb legen', confirm: '{p} (Größe {s}) in den Warenkorb legen?',
    noop: ['Ihr Warenkorb ist unverändert.'],
  },
  es: {
    brands: ['Pinar Aventura', 'Sendero Norte', 'Brezo y Roca'], nav: ['Mujer', 'Hombre', 'Niños', 'Montaña', 'Rebajas'], cur: 'EUR',
    products: [['Zapatilla Senda 2', 89.95, ['40', '41', '42', '43', '44']], ['Chubasquero Costa', 119, ['S', 'M', 'L', 'XL']], ['Camiseta térmica de merino', 54.9, ['S', 'M', 'L', 'XL']], ['Pantalón de lona', 64.5, ['38', '40', '42', '44']]],
    owned: ['Calcetines de montaña (pack de 2)', 'Gorro plegable', 'Botella térmica 750 ml', 'Braga de cuello polar'],
    size: 'Talla', qty: 'Cantidad', add: 'Añadir a la cesta', wish: 'Guardar', bag: 'Tu cesta', empty: 'Tu cesta está vacía.', sub: 'Subtotal', checkout: 'Tramitar pedido', recent: 'Vistos recientemente',
    desc: 'Parte superior transpirable, forro reciclado y suela con buen agarre para senderos mojados. Devoluciones gratis en 30 días.',
    deliv: 'Envío gratis a partir de 60 €. Pide antes de las 15:00 y lo enviamos al día siguiente.', rev: 'Opiniones',
    revs: ['«Talla bien, muy cómoda en rutas largas.» – A. R.', '«Buen agarre, aunque los cordones son algo cortos.» – M. T.'],
    ok: 'Añadido a tu cesta: {p}, talla {s}', bad: 'Añadido a tu cesta: {p}, talla {w}', invalid: 'La talla {s} está agotada. Elige otra talla.',
    intent: 'añadir {p} en talla {s} a la cesta', confirm: '¿Añadir {p} (talla {s}) a la cesta?',
    noop: ['Tu cesta no ha cambiado.'],
  },
  pl: {
    brands: ['Świerk Outdoor', 'Hala Sport', 'Wrzos i Skała'], nav: ['Kobiety', 'Mężczyźni', 'Dzieci', 'Góry', 'Wyprzedaż'], cur: 'PLN',
    products: [['Buty Ścieżka 2', 389, ['40', '41', '42', '43', '44']], ['Kurtka przeciwdeszczowa Brzeg', 549, ['S', 'M', 'L', 'XL']], ['Koszulka termoaktywna merino', 249, ['S', 'M', 'L', 'XL']], ['Spodnie płócienne', 289, ['30', '32', '34', '36']]],
    owned: ['Skarpety trekkingowe (2 pary)', 'Kapelusz składany', 'Butelka termiczna 750 ml', 'Komin polarowy'],
    size: 'Rozmiar', qty: 'Ilość', add: 'Dodaj do koszyka', wish: 'Do ulubionych', bag: 'Twój koszyk', empty: 'Koszyk jest pusty.', sub: 'Suma', checkout: 'Przejdź do kasy', recent: 'Ostatnio oglądane',
    desc: 'Oddychająca cholewka, podszewka z recyklingu i przyczepna podeszwa na mokre szlaki. Zwrot do 30 dni.',
    deliv: 'Darmowa dostawa od 250 zł. Zamów do 15:00, wyślemy następnego dnia.', rev: 'Opinie klientów',
    revs: ['„Rozmiar się zgadza, wygodne na długie trasy.” – A. R.', '„Dobra przyczepność, ale sznurówki trochę krótkie.” – M. T.'],
    ok: 'Dodano do koszyka: {p}, rozmiar {s}', bad: 'Dodano do koszyka: {p}, rozmiar {w}', invalid: 'Rozmiar {s} jest niedostępny. Wybierz inny rozmiar.',
    intent: 'dodać {p} w rozmiarze {s} do koszyka', confirm: 'Dodać {p} (rozmiar {s}) do koszyka?',
    noop: ['Koszyk bez zmian.'],
  },
};

const items = (n) => `${n} item${n === 1 ? '' : 's'}`;

export const shopCart = {
  id: 'shop-cart', kind: 'shop', langs: ['en', 'uk', 'de', 'es', 'pl'],
  make(rng, lang, il) {
    const v = V[lang];
    const [p, price, sizes] = rng.pick(v.products);
    const k = 1 + rng.int(sizes.length - 2);
    const s = sizes[k];
    const w = sizes[k + (rng.chance(0.5) ? 1 : -1)];
    const owned = rng.shuffle(v.owned).slice(0, rng.int(3));
    const prices = owned.map(() => 9 + rng.int(30));
    const vars = { p, s, w };
    const slug = `p/${100000 + rng.int(899999)}`;
    const bagItems = (extra) => [...owned.map((o, i) => `${esc(o)} – ${money(lang, v.cur, prices[i])}`), ...(extra ? [`${esc(p)} · ${esc(v.size)} ${esc(extra)} – ${money(lang, v.cur, price)}`] : [])];
    const bagOf = (state) => (state === 'done' ? s : state === 'wrong' ? w : null);
    const brand = rng.pick(v.brands);
    const recent = rng.shuffle(v.products.map((x) => x[0]).filter((x) => x !== p)).slice(0, 2);
    return {
      kind: 'shop', brand, title: `${p} | ${brand}`, at: `/${slug}`, nav: v.nav, slug: 'shop', user: null,
      crumbs: [v.nav[rng.int(4)], p], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const sel = ui.select(v.size, sizes, s) + (state === 'invalid' ? `<p class="err" role="alert">${esc(fill(v.invalid, vars))}</p>` : '');
        return `<h1>${esc(p)}</h1><p><strong>${money(lang, v.cur, price)}</strong></p><p>${esc(v.desc)}</p>${sel}${ui.input(v.qty, '1', { type: 'number' })}
<p>${ui.btn(v.add, { pri: true, acted: true })} ${ui.btn(v.wish)}</p><p class="muted">${esc(v.deliv)}</p><h2>${esc(v.rev)}</h2>${list(v.revs.map(esc))}`;
      },
      aside(state, ui) {
        const items = bagItems(bagOf(state));
        const bag = items.length ? `${list(items)}<p>${ui.a(v.checkout, '/checkout')}</p>` : `<p>${esc(v.empty)}</p>`;
        return box(v.bag, bag) + box(v.recent, list(recent.map(esc)));
      },
      noop: v.noop, ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: fill(v.invalid, vars), confirmQ: fill(v.confirm, vars),
      confirm: {
        at: '/bag', title: `${v.bag} | ${brand}`,
        main(ui) {
          const items = bagItems(s);
          const total = prices.reduce((a, b) => a + b, 0) + price;
          return `<h1>${esc(v.bag)}</h1>${list(items)}<p><strong>${esc(v.sub)}: ${money(lang, v.cur, total)}</strong></p><p>${ui.btn(v.checkout, { pri: true })}</p>`;
        },
      },
      errAt: `/${slug}`,
      why: {
        change: `the bag goes from ${items(owned.length)} to ${items(owned.length + 1)} and lists ${p}, size ${s}`,
        wrong: `the bag gained ${p} in size ${w}, not size ${s}`,
        unchanged: owned.length ? `the bag still holds the same ${items(owned.length)} without ${p}` : `the bag is still empty`,
        confirm: `lists ${p}, size ${s}, among the bag items`,
      },
    };
  },
};
