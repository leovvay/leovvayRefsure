// Template forum-topic: a "new topic" form on a hobby forum with near-twin categories; the step posts the topic.
// Wrong item: the topic lands in the neighbouring category. Invalid: the board's title rule.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Spokes & Chains', 'The Allotment Board', 'Lensfield Forum'], nav: ['Forums', 'Latest', 'Members', 'Rules', 'Search'], users: ['quintm', 'owen_s', 'pcalder', 'fenwick_t'],
    cats: [['Road bike repairs', 'Road bikes'], ['Tomatoes and peppers', 'Tomatoes and potatoes'], ['Film cameras: repairs', 'Film cameras: buy and sell']],
    titles: ['Rear derailleur skips on the 3rd cog', 'Blossom end rot on the second truss', 'Shutter sticks at 1/500 after cleaning'], bodies: ['I replaced the cable last week and indexed it twice, but it still jumps under load.', 'Watering every evening, grow bags in a greenhouse, liquid feed once a week.', 'Cleaned the blades with naphtha, slow speeds are fine, only the fastest sticks.'],
    h: 'New topic', cat: 'Category', title: 'Title', body: 'Message', post: 'Post topic', preview: 'Preview', latest: 'Latest topics', just: 'just now', by: 'by', in: 'in',
    old: ['Tubeless sealant in winter?', 'Best mulch for raised beds', 'Lens fungus: worth fixing?'], rules: 'Be kind, stay on topic, and search before posting.',
    ok: 'Your topic was posted in {c}', bad: 'Your topic was posted in {w}', invalid: 'Add at least one tag so others can find your topic.',
    intent: 'post the topic "{t}" in {c}', confirm: 'Post "{t}" in {c}?', replies: '0 replies', views: '1 view',
  },
  uk: {
    brands: ['Спиці й ланцюги', 'Город онлайн', 'Плівка і світло'], nav: ['Форуми', 'Нове', 'Учасники', 'Правила', 'Пошук'], users: ['koval_i', 'bohdan_s', 'daryna_l', 'ostap.d'],
    cats: [['Ремонт шосейних велосипедів', 'Шосейні велосипеди'], ['Томати і перець', 'Томати і картопля'], ['Плівкові камери: ремонт', 'Плівкові камери: купівля і продаж']],
    titles: ['Задній перемикач перескакує на третій зірці', 'Вершинна гниль на другій китиці', 'Затвор залипає на 1/500 після чистки'], bodies: ['Тиждень тому замінив трос і двічі налаштовував, але під навантаженням він стрибає.', 'Поливаю щовечора, мішки в теплиці, підживлення раз на тиждень.', 'Почистив ламелі бензином, повільні витримки в нормі, залипає лише найшвидша.'],
    h: 'Нова тема', cat: 'Розділ', title: 'Заголовок', body: 'Повідомлення', post: 'Опублікувати тему', preview: 'Попередній перегляд', latest: 'Нові теми', just: 'щойно', by: 'автор', in: 'у розділі',
    old: ['Безкамерний герметик узимку?', 'Яка мульча краща для грядок', 'Грибок на лінзі: чи варто лагодити?'], rules: 'Будьте ввічливі, пишіть по темі й шукайте перед публікацією.',
    ok: 'Тему опубліковано в розділі «{c}»', bad: 'Тему опубліковано в розділі «{w}»', invalid: 'Додайте хоча б один тег, щоб іншим було легше знайти тему.',
    intent: 'опублікувати тему «{t}» у розділі «{c}»', confirm: 'Опублікувати «{t}» у розділі «{c}»?', replies: '0 відповідей', views: '1 перегляд',
  },
  es: {
    brands: ['Radios y Cadenas', 'Foro del Huerto', 'Grano y Luz'], nav: ['Foros', 'Recientes', 'Miembros', 'Normas', 'Buscar'], users: ['lvarela', 'diego_m', 'cibarra', 'hugo.v'],
    cats: [['Reparación de bicis de carretera', 'Bicis de carretera'], ['Tomates y pimientos', 'Tomates y patatas'], ['Cámaras de carrete: reparación', 'Cámaras de carrete: compraventa']],
    titles: ['El desviador trasero salta en el tercer piñón', 'Podredumbre apical en el segundo ramillete', 'El obturador se queda en 1/500 tras limpiarlo'], bodies: ['Cambié el cable la semana pasada y lo ajusté dos veces, pero salta al hacer fuerza.', 'Riego cada tarde, sacos de cultivo en invernadero, abono líquido semanal.', 'Limpié las láminas con nafta; las velocidades lentas van bien, solo falla la más rápida.'],
    h: 'Nuevo tema', cat: 'Categoría', title: 'Título', body: 'Mensaje', post: 'Publicar tema', preview: 'Vista previa', latest: 'Temas recientes', just: 'ahora mismo', by: 'por', in: 'en',
    old: ['¿Líquido tubeless en invierno?', 'Mejor acolchado para bancales', 'Hongos en el objetivo: ¿vale la pena?'], rules: 'Sé amable, no te salgas del tema y busca antes de publicar.',
    ok: 'Tu tema se ha publicado en {c}', bad: 'Tu tema se ha publicado en {w}', invalid: 'Añade al menos una etiqueta para que otros encuentren tu tema.',
    intent: 'publicar el tema «{t}» en {c}', confirm: '¿Publicar «{t}» en {c}?', replies: '0 respuestas', views: '1 visita',
  },
};

export const forumTopic = {
  id: 'forum-topic', kind: 'forum', langs: ['en', 'uk', 'es'],
  make(rng, lang, il) {
    const v = V[lang];
    const k = rng.int(v.cats.length);
    const [c, w] = rng.chance(0.5) ? v.cats[k] : [v.cats[k][1], v.cats[k][0]];
    const t = v.titles[k];
    const user = rng.pick(v.users);
    const brand = rng.pick(v.brands);
    const vars = { c, w, t };
    const oldRows = rng.shuffle(v.old).map((x, i) => [x, rng.pick(v.cats.flat()), `${i + 2} h`]);
    const tid = 40000 + rng.int(50000);
    const topicRow = (cat) => [`<strong>${esc(t)}</strong>`, cat, v.just];
    return {
      kind: 'forum', brand, title: `${v.h} – ${brand}`, at: `/t/new?cat=${k + 1}`, nav: v.nav, slug: 'forum', user,
      crumbs: [v.nav[0], c, v.h], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(v.invalid)}</p>` : '';
        return `<h1>${esc(v.h)}</h1>${ui.select(v.cat, [c, w], c)}${ui.input(v.title, t)}${err}${ui.input(v.body, v.bodies[k], { area: true })}<p>${ui.btn(v.post, { pri: true, acted: true })} ${ui.btn(v.preview)}</p><p class="muted">${esc(v.rules)}</p>`;
      },
      aside(state, ui) {
        const rows = oldRows.map(([x, cat, ago]) => [esc(x), cat, ago]);
        if (state === 'done') rows.unshift(topicRow(c));
        if (state === 'wrong') rows.unshift(topicRow(w));
        return box(v.latest, list(rows.map(([x, cat, ago]) => `${x}<br><span class="muted">${esc(v.in)} ${esc(cat)} · ${esc(ago)}</span>`)));
      },
      drafty: true, ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: v.invalid, confirmQ: fill(v.confirm, vars),
      confirm: {
        at: `/t/${tid}`, title: `${t} – ${brand}`,
        main(ui) {
          return `<div class="crumbs">${esc(v.nav[0])} › ${esc(c)}</div><h1>${esc(t)}</h1><p class="muted">${esc(v.by)} ${esc(user)} · ${esc(v.just)} · ${esc(v.replies)} · ${esc(v.views)}</p><div class="card">${esc(v.bodies[k])}</div><p>${ui.a(v.nav[1], '/latest')}</p>`;
        },
      },
      errAt: '/t/new',
      why: {
        change: `"${t}" now heads the latest topics, filed in ${c}`,
        wrong: `"${t}" was filed in ${w} instead of ${c}`,
        unchanged: `"${t}" does not appear among the latest topics`,
        confirm: `shows the topic "${t}" under ${c}, posted just now`,
      },
    };
  },
};
