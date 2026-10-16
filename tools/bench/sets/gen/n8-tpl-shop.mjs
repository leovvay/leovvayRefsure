// Templates shop-checkout (the checkout form of a home-goods shop) and shop-catalog (a coffee and tea product
// list with a sort control and a product page with a pack-size picker).
import { T, esc } from './n8-lib.mjs';
import { box, h, list, p, table } from './n8-page.mjs';

const CO = {
  en: { brands: ['Linden & Loom', 'Copperkettle Home'], nav: ['New in', 'Kitchen', 'Bedroom', 'Sale'], h1: 'Checkout', step: 'Step 2 of 3 · Delivery and payment',
    addr: 'Delivery address', name: 'Full name', street: 'Street and number', city: 'City', zip: 'Postcode', pay: 'Payment', note: 'Orders placed before 2 pm ship the same day. Customs fees may apply outside the EU.',
    sum: 'Order summary', items: [['Linen napkins, set of 4', '1', '€24.00'], ['Enamel mug, sage', '2', '€19.80']], total: 'Total: €43.80', place: 'Place order', back: 'Back to basket', help: 'Need help? Call us Mon–Fri 9:00–17:00.' },
  uk: { brands: ['Лляна хата', 'Мідний чайник'], nav: ['Новинки', 'Кухня', 'Спальня', 'Розпродаж'], h1: 'Оформлення замовлення', step: 'Крок 2 з 3 · Доставка й оплата',
    addr: 'Адреса доставки', name: 'Повне ім’я', street: 'Вулиця й номер будинку', city: 'Місто', zip: 'Поштовий індекс', pay: 'Оплата', note: 'Замовлення до 14:00 відправляємо того ж дня. За межами ЄС можливе мито.',
    sum: 'Ваше замовлення', items: [['Лляні серветки, 4 шт.', '1', '980 ₴'], ['Емальована чашка, шавлія', '2', '790 ₴']], total: 'Разом: 1 770 ₴', place: 'Підтвердити замовлення', back: 'Повернутися до кошика', help: 'Потрібна допомога? Телефонуйте пн–пт 9:00–17:00.' },
  de: { brands: ['Leinen & Lehm', 'Kupferkessel Wohnen'], nav: ['Neu', 'Küche', 'Schlafzimmer', 'Sale'], h1: 'Kasse', step: 'Schritt 2 von 3 · Versand und Zahlung',
    addr: 'Lieferadresse', name: 'Vollständiger Name', street: 'Straße und Hausnummer', city: 'Ort', zip: 'PLZ', pay: 'Zahlung', note: 'Bestellungen bis 14 Uhr verlassen das Lager am selben Tag. Außerhalb der EU können Zollgebühren anfallen.',
    sum: 'Bestellübersicht', items: [['Leinenservietten, 4er-Set', '1', '24,00 €'], ['Emaillebecher, Salbei', '2', '19,80 €']], total: 'Gesamt: 43,80 €', place: 'Zahlungspflichtig bestellen', back: 'Zurück zum Warenkorb', help: 'Fragen? Mo–Fr 9–17 Uhr erreichbar.' },
  es: { brands: ['Lino y Barro', 'Casa Cazo de Cobre'], nav: ['Novedades', 'Cocina', 'Dormitorio', 'Rebajas'], h1: 'Finalizar compra', step: 'Paso 2 de 3 · Envío y pago',
    addr: 'Dirección de entrega', name: 'Nombre completo', street: 'Calle y número', city: 'Ciudad', zip: 'Código postal', pay: 'Pago', note: 'Los pedidos hechos antes de las 14:00 salen el mismo día. Fuera de la UE puede haber aranceles.',
    sum: 'Resumen del pedido', items: [['Servilletas de lino, 4 uds.', '1', '24,00 €'], ['Taza esmaltada, salvia', '2', '19,80 €']], total: 'Total: 43,80 €', place: 'Realizar pedido', back: 'Volver a la cesta', help: '¿Dudas? Llámanos de lunes a viernes, de 9:00 a 17:00.' },
  pl: { brands: ['Len i Glina', 'Miedziany Czajnik Dom'], nav: ['Nowości', 'Kuchnia', 'Sypialnia', 'Wyprzedaż'], h1: 'Kasa', step: 'Krok 2 z 3 · Dostawa i płatność',
    addr: 'Adres dostawy', name: 'Imię i nazwisko', street: 'Ulica i numer', city: 'Miasto', zip: 'Kod pocztowy', pay: 'Płatność', note: 'Zamówienia złożone do 14:00 wysyłamy tego samego dnia. Poza UE mogą obowiązywać opłaty celne.',
    sum: 'Podsumowanie', items: [['Lniane serwetki, 4 szt.', '1', '99,00 zł'], ['Kubek emaliowany, szałwia', '2', '79,80 zł']], total: 'Razem: 178,80 zł', place: 'Zamawiam i płacę', back: 'Wróć do koszyka', help: 'Pytania? Dzwoń pn–pt 9:00–17:00.' },
};

export const shopCheckout = {
  id: 'shop-checkout', kind: 'shop',
  hosts: { country: T('Ship to country|Країна доставки|Lieferland|País de envío|Kraj dostawy'), payment: null, delivery: null, currency: T('Pay in|Валюта оплати|Bezahlen in|Pagar en|Płać w walucie') },
  make(rng, lang, domId) {
    const v = CO[lang];
    const brand = rng.pick(v.brands);
    return {
      kind: 'shop', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'shop', user: null, crumbs: [v.nav[0], v.h1],
      main(field, ui) {
        const addr = `${h(2, v.addr)}${ui.input(v.name, '')}${ui.input(v.street, '')}${ui.input(v.city, '')}${ui.input(v.zip, '')}`;
        const inAddr = domId === 'country' || domId === 'delivery';
        return `${h(1, v.h1)}${p(v.step, 'muted')}${addr}${inAddr ? field : ''}${h(2, v.pay)}${inAddr ? '' : field}${p(v.note, 'muted')}<p>${ui.btn(v.place, { pri: true })} ${ui.a(v.back, '/basket')}</p>`;
      },
      aside: () => `${box(v.sum, table(['', '', ''], v.items))}<section><strong>${esc(v.total)}</strong></section><section>${esc(v.help)}</section>`,
    };
  },
};

const CA = {
  en: { brands: ['Ember & Leaf', 'Roastery Lane'], nav: ['Coffee', 'Tea', 'Brewing gear', 'Gift sets'], h1: 'Single-origin coffee', count: '24 products', filters: 'Filters', fl: ['Whole bean', 'Ground', 'Decaf', 'Organic'],
    prods: [['Hill Farm washed', '€12.90'], ['Valley honey process', '€14.50'], ['Night Owl decaf', '€11.00']], add: 'Add to basket', tip: 'Free delivery from €40. Roasted every Tuesday.', pack: 'Choose your bag', news: 'Brew guides' },
  uk: { brands: ['Жар і листя', 'Обсмажувальня на розі'], nav: ['Кава', 'Чай', 'Для заварювання', 'Подарунки'], h1: 'Кава одного походження', count: '24 товари', filters: 'Фільтри', fl: ['У зернах', 'Мелена', 'Без кофеїну', 'Органічна'],
    prods: [['Гірська ферма, мита', '420 ₴'], ['Долина, хані-обробка', '480 ₴'], ['Нічна сова без кофеїну', '390 ₴']], add: 'Додати в кошик', tip: 'Безкоштовна доставка від 1 500 ₴. Обсмажуємо щовівторка.', pack: 'Оберіть пачку', news: 'Поради із заварювання' },
  de: { brands: ['Glut & Blatt', 'Röstgasse'], nav: ['Kaffee', 'Tee', 'Zubehör', 'Geschenksets'], h1: 'Single-Origin-Kaffee', count: '24 Produkte', filters: 'Filter', fl: ['Ganze Bohne', 'Gemahlen', 'Entkoffeiniert', 'Bio'],
    prods: [['Bergfarm gewaschen', '12,90 €'], ['Tal Honey Process', '14,50 €'], ['Nachteule entkoffeiniert', '11,00 €']], add: 'In den Warenkorb', tip: 'Versandkostenfrei ab 40 €. Jeden Dienstag frisch geröstet.', pack: 'Packung wählen', news: 'Zubereitungstipps' },
  es: { brands: ['Brasa y Hoja', 'Tostadero del Callejón'], nav: ['Café', 'Té', 'Accesorios', 'Regalos'], h1: 'Café de origen único', count: '24 productos', filters: 'Filtros', fl: ['En grano', 'Molido', 'Descafeinado', 'Ecológico'],
    prods: [['Finca de la colina, lavado', '12,90 €'], ['Valle, proceso honey', '14,50 €'], ['Búho nocturno descafeinado', '11,00 €']], add: 'Añadir a la cesta', tip: 'Envío gratis desde 40 €. Tostamos cada martes.', pack: 'Elige tu bolsa', news: 'Guías de preparación' },
  pl: { brands: ['Żar i Liść', 'Palarnia przy Zaułku'], nav: ['Kawa', 'Herbata', 'Akcesoria', 'Zestawy'], h1: 'Kawa z jednego regionu', count: '24 produkty', filters: 'Filtry', fl: ['Ziarnista', 'Mielona', 'Bezkofeinowa', 'Ekologiczna'],
    prods: [['Górska farma, myta', '54,90 zł'], ['Dolina, obróbka honey', '61,50 zł'], ['Nocna sowa bezkofeinowa', '46,00 zł']], add: 'Dodaj do koszyka', tip: 'Darmowa dostawa od 160 zł. Palimy w każdy wtorek.', pack: 'Wybierz opakowanie', news: 'Poradniki parzenia' },
};

export const shopCatalog = {
  id: 'shop-catalog', kind: 'shop',
  hosts: { sort: null, weight: null },
  make(rng, lang, domId) {
    const v = CA[lang];
    const brand = rng.pick(v.brands);
    return {
      kind: 'shop', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'shop', user: null, crumbs: [v.nav[0], v.h1],
      main(field, ui) {
        const cards = v.prods.map(([n, pr]) => `<div class="card"><strong>${esc(n)}</strong> · ${esc(pr)} ${ui.btn(v.add)}</div>`).join('');
        return `${h(1, v.h1)}${p(v.count, 'muted')}${domId === 'weight' ? `${h(2, v.pack)}${field}` : field}${cards}${p(v.tip, 'muted')}`;
      },
      aside: (ui) => `${box(v.filters, list(v.fl.map((f) => ui.a(f, '/shop?f=1'))))}${box(v.news, list(v.nav.slice(1, 3).map((n) => ui.a(n, '/guides'))))}`,
    };
  },
};
