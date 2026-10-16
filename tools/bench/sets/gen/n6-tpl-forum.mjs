// Template forum-topic: a question topic on a hobby forum. Result: the accepted answer.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Bramblewood Makers Forum', 'The Sourdough Circle', 'Kestrel Radio Club'], nav: ['Latest', 'Categories', 'Top', 'Members', 'Rules'],
    qs: ['Starter smells like nail polish after a week', 'Glue joint keeps cracking on oak stool', 'Antenna tuner hums at night'], topic: 'Topic', by: 'Started by', views: 'Views', unit: 'views',
    ladder: ['Open', 'Answered', 'Solved'], neg: ['Closed', 'Topic {ref} was closed by a moderator as a duplicate and will get no answer here.'],
    acc: 'Accepted answer', ans: ['Feed it twice a day for three days and keep it warmer; the smell goes away.', 'Use a slower-setting glue and clamp it overnight; oak needs the time.'],
    pend: 'The author marked topic {ref} solved; the accepted answer is still waiting for a moderator to approve it.', queued: 'Topic {ref} is waiting for moderator approval before it appears on the forum.',
    rules: 'Be kind. Search before you post.', online: 'Members online: 37',
    E: { main: 'Forum topic {ref} started by {who}', res: 'The accepted answer in topic {ref}', num: 'Topic {ref} with {num} views', status: 'Topic {ref} has been marked as solved' },
  },
  uk: {
    brands: ['Форум майстрів Ожина', 'Коло закваски', 'Радіоклуб Боривітер'], nav: ['Нове', 'Розділи', 'Топ', 'Учасники', 'Правила'],
    qs: ['Закваска пахне ацетоном через тиждень', 'Клейовий шов тріскається на дубовому стільці', 'Антенний тюнер гуде вночі'], topic: 'Тема', by: 'Автор', views: 'Перегляди', unit: 'переглядів',
    ladder: ['Відкрита', 'Є відповідь', 'Вирішено'], neg: ['Закрита', 'Тему {ref} закрив модератор як дублікат, відповіді тут не буде.'],
    acc: 'Прийнята відповідь', ans: ['Годуйте її двічі на день три дні поспіль і тримайте в теплі — запах зникне.', 'Візьміть клей із довшим схоплюванням і затисніть на ніч; дубу потрібен час.'],
    pend: 'Автор позначив тему {ref} як вирішену; прийнята відповідь ще чекає схвалення модератора.', queued: 'Тема {ref} чекає схвалення модератора, перш ніж з’явиться на форумі.',
    rules: 'Будьте ввічливі. Шукайте, перш ніж писати.', online: 'Учасників онлайн: 37',
    E: { main: 'Тема {ref} на форумі, яку створив(ла) {who}', res: 'Прийнята відповідь у темі {ref}', num: 'Тема {ref}, яка має {num} переглядів', status: 'Тему {ref} позначено як вирішену' },
  },
  es: {
    brands: ['Foro Taller Zarzal', 'Círculo de la Masa Madre', 'Radioclub Cernícalo'], nav: ['Últimos', 'Categorías', 'Top', 'Miembros', 'Normas'],
    qs: ['La masa madre huele a quitaesmalte tras una semana', 'La junta encolada del taburete de roble se agrieta', 'El acoplador de antena zumba de noche'], topic: 'Tema', by: 'Iniciado por', views: 'Visitas', unit: 'visitas',
    ladder: ['Abierto', 'Respondido', 'Resuelto'], neg: ['Cerrado', 'Un moderador cerró el tema {ref} por duplicado; aquí no recibirá respuesta.'],
    acc: 'Respuesta aceptada', ans: ['Aliméntala dos veces al día durante tres días y tenla en un sitio más cálido; el olor desaparece.', 'Usa una cola de fraguado lento y deja la pieza apretada toda la noche.'],
    pend: 'El autor marcó el tema {ref} como resuelto; la respuesta aceptada espera la aprobación de un moderador.', queued: 'El tema {ref} espera la aprobación de un moderador antes de aparecer en el foro.',
    rules: 'Sé amable. Busca antes de publicar.', online: 'Miembros conectados: 37',
    E: { main: 'El tema {ref} del foro iniciado por {who}', res: 'La respuesta aceptada en el tema {ref}', num: 'El tema {ref} con {num} visitas', status: 'El tema {ref} se ha marcado como resuelto' },
  },
  pl: {
    brands: ['Forum Majsterkowiczów Jeżyna', 'Krąg Zakwasu', 'Klub Radiowy Pustułka'], nav: ['Najnowsze', 'Kategorie', 'Top', 'Członkowie', 'Zasady'],
    qs: ['Zakwas po tygodniu pachnie zmywaczem', 'Klejone złącze dębowego stołka pęka', 'Tuner antenowy buczy w nocy'], topic: 'Wątek', by: 'Autor', views: 'Wyświetlenia', unit: 'wyświetleń',
    ladder: ['Otwarty', 'Z odpowiedzią', 'Rozwiązany'], neg: ['Zamknięty', 'Moderator zamknął wątek {ref} jako duplikat; odpowiedzi tu nie będzie.'],
    acc: 'Zaakceptowana odpowiedź', ans: ['Dokarmiaj go dwa razy dziennie przez trzy dni i trzymaj w cieple; zapach zniknie.', 'Użyj kleju o dłuższym czasie wiązania i ściśnij na noc.'],
    pend: 'Autor oznaczył wątek {ref} jako rozwiązany; zaakceptowana odpowiedź czeka na zatwierdzenie przez moderatora.', queued: 'Wątek {ref} czeka na zatwierdzenie przez moderatora, zanim pojawi się na forum.',
    rules: 'Bądź uprzejmy. Szukaj, zanim napiszesz.', online: 'Członków online: 37',
    E: { main: 'Wątek {ref} na forum (autor: {who})', res: 'Zaakceptowana odpowiedź w wątku {ref}', num: 'Wątek {ref} z {num} wyświetleniami', status: 'Wątek {ref} oznaczono jako rozwiązany' },
  },
};

export const forumTopic = {
  id: 'forum-topic', kind: 'forum', langs: ['en', 'uk', 'es', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `#${5200 + r.int(4700)}`, spec: { type: 'count' }, max: 30000 });
    const v = c.v;
    const q = rng.pick(v.qs);
    const ans = rng.pick(v.ans);
    return {
      ...c, kind: 'forum', nav: v.nav, slug: 'forum', crumbs: [v.nav[1], q], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: () => `${q} - ${c.brand}`, at: (ref) => `/t/${ref.slice(1)}`, resText: ans, loadTitle: v.nav[0],
      en: { thing: 'topic', res: 'accepted answer', num: 'view count' },
      main(x) {
        const res = `<div class="card"><strong>✔ ${esc(v.acc)}</strong> · ${esc(c.other)}<p>${esc(ans)}</p></div>`;
        return `<h1>${esc(q)}</h1><p>${stageBadge(x)}</p>${rows([[v.topic, esc(x.ref)], [v.by, esc(x.who)], [v.views, `${esc(x.num)} ${esc(v.unit)}`]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: () => box(v.nav[4], `<p>${esc(v.rules)}</p><p class="muted">${esc(v.online)}</p>`),
    };
  },
};
