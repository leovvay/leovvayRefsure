// Template shop-checkout: an online shop's checkout review page. Categories: greeting, confirmation (order
// placed), error (card payment), total. The page lists items and quantities but no money outside the total slot.
import { esc } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';
import { amounts, nearRef, people, refDigits } from './n7-lib.mjs';

const V = {
  en: {
    brands: ['Pebblemart', 'Hearthware', 'Copperleaf Home'], nav: ['Kitchen', 'Garden', 'Lighting', 'Sale'], cur: 'USD',
    users: [['Mara', 'Mara Quint'], ['Owen', 'Owen Strick'], ['Priya', 'Priya Calder'], ['Tobias', 'Tobias Fenwick']],
    h: 'Review your order', crumbs: ['Basket', 'Delivery', 'Review'],
    goods: ['Enamel kettle, sage', 'Linen tea towels (set of 3)', 'Oak chopping board', 'Glass storage jars', 'Ceramic pour-over set', 'Cast iron skillet 26 cm'],
    qty: 'Qty', ship: 'Delivery', shipTo: 'Ship to', ways: ['Standard, 3–5 working days', 'Next working day'], pay: 'Payment', card: 'Card ending', place: 'Place order', back: 'Back to basket',
    side: ['Need help?', 'Returns within 30 days', 'Track an order', 'Contact us'], note: 'Items are reserved for 20 minutes while you check out.',
    street: ['14 Fennel Row, Ashbury', '3 Quarry Lane, Millbrook', '27 Tannery Court, Westhollow'],
    ok: 'Order {r} confirmed', neg: 'Order {r} could not be placed. Your card was not charged.',
    pending: 'Placing your order… please don’t close this page.', mention: 'Your order confirmation will appear here as soon as the payment clears.',
    e1: 'Payment failed: your card was declined by the bank.', e2: 'Payment failed: the card has expired.',
    clear: 'Your payment details look good. No problems found.', checking: 'Checking your payment details…', emention: 'If there is a problem with the payment, the reason is shown here.',
    total: 'Order total', tpending: 'calculating…', tmention: 'shown once you choose a delivery option',
  },
  uk: {
    brands: ['Глечик', 'Затишна Хата', 'Мідний Лист'], nav: ['Кухня', 'Сад', 'Освітлення', 'Знижки'], cur: 'UAH',
    users: [['Ірина', 'Ірина Коваль', 'Ірино'], ['Богдан', 'Богдан Савчин', 'Богдане'], ['Дарина', 'Дарина Ліщук', 'Дарино'], ['Остап', 'Остап Дячук', 'Остапе']],
    h: 'Перевірте замовлення', crumbs: ['Кошик', 'Доставка', 'Перевірка'],
    goods: ['Емальований чайник, оливковий', 'Лляні рушники (3 шт.)', 'Дубова дошка для нарізання', 'Скляні банки для зберігання', 'Керамічний набір для заварювання', 'Чавунна сковорода 26 см'],
    qty: 'К-сть', ship: 'Доставка', shipTo: 'Адреса', ways: ['Стандартна, 3–5 робочих днів', 'Наступного робочого дня'], pay: 'Оплата', card: 'Картка, що закінчується на', place: 'Оформити замовлення', back: 'Назад до кошика',
    side: ['Потрібна допомога?', 'Повернення протягом 30 днів', 'Відстежити замовлення', 'Зв’язатися з нами'], note: 'Товари зарезервовано на 20 хвилин, поки ви оформлюєте замовлення.',
    street: ['вул. Липова, 12, Вишневе', 'вул. Гончарна, 3, Ставище', 'пров. Кленовий, 27, Боровиця'],
    ok: 'Замовлення {r} підтверджено', neg: 'Не вдалося оформити замовлення {r}. Кошти з картки не списано.',
    pending: 'Оформлюємо замовлення… не закривайте цю сторінку.', mention: 'Підтвердження замовлення з’явиться тут, щойно пройде оплата.',
    e1: 'Оплата не пройшла: банк відхилив вашу картку.', e2: 'Оплата не пройшла: строк дії картки минув.',
    clear: 'Платіжні дані в порядку. Проблем не виявлено.', checking: 'Перевіряємо платіжні дані…', emention: 'Якщо з оплатою виникне проблема, причину буде показано тут.',
    total: 'Разом до сплати', tpending: 'рахуємо…', tmention: 'з’явиться, коли ви оберете спосіб доставки',
  },
};

export const shopCheckout = {
  id: 'shop-checkout', kind: 'shop', langs: ['en', 'uk'], cats: ['greeting', 'confirmation', 'error', 'total'],
  make(rng, lang) {
    const v = V[lang];
    const brand = rng.pick(v.brands);
    const p = people(rng, v.users);
    const r = refDigits(rng, 6);
    const near = nearRef(rng, r);
    const goods = rng.shuffle(v.goods).slice(0, 2 + rng.int(3));
    const m = amounts(rng, lang, v.cur);
    const card = 1000 + rng.int(9000);
    const street = rng.pick(v.street);
    const way = rng.pick(v.ways);
    return {
      kind: 'shop', brand, title: `${v.h} · ${brand}`, at: '/checkout/review', host: 'shop', nav: v.nav, slug: 'shop', ...p, crumbs: v.crumbs,
      body(slot, ui) {
        const rows = goods.map((g) => `<tr><td>${esc(g)}</td><td>${esc(v.qty)} ${1 + (g.length % 2)}</td></tr>`).join('');
        return `<h1>${esc(v.h)}</h1>${slot}<table><tbody>${rows}</tbody></table>
<div class="cols"><div><h2>${esc(v.ship)}</h2><p>${esc(v.shipTo)}: ${esc(p.user)}, ${esc(street)}</p><p>${esc(way)}</p></div><div><h2>${esc(v.pay)}</h2><p>${esc(v.card)} ${card}</p></div></div>
<p>${ui.btn(v.place, { pri: true })} ${ui.a(v.back, '/basket')}</p><p class="muted">${esc(v.note)}</p>`;
      },
      aside(ui) { return box(v.side[0], list(v.side.slice(1).map((x) => ui.a(x, '/help')))); },
      cats: {
        confirmation: { ok: v.ok.replace('{r}', r), wrong: v.ok.replace('{r}', near), neg: v.neg.replace('{r}', r), pending: v.pending, mention: v.mention, spec: `a confirmation that order ${r} was placed` },
        error: { e1: v.e1, e2: v.e2, clear: v.clear, checking: v.checking, mention: v.emention, spec: 'an error saying the card was declined' },
        total: { label: v.total, val: m.val, near: m.near, pending: v.tpending, mention: v.tmention, spec: m.spec },
      },
    };
  },
};
