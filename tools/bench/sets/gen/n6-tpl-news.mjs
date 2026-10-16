// Template news-comment: a reader's comment under a news article. Result: the newsroom's reply to it.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['The Ashby Courier', 'Northvale Daily', 'Harbour Evening Post'], nav: ['News', 'Local', 'Business', 'Opinion', 'Sport'],
    h: 'Your comment', art: 'On the article', arts: ['Council approves new cycle lanes on Mill Road', 'Ferry timetable to change from November', 'Library extends weekend opening hours'], cid: 'Comment', posted: 'Posted on', author: 'Name',
    ladder: ['Submitted', 'In moderation', 'Published'], neg: ['Rejected', 'Comment {ref} was not published because it breaks our community guidelines.'],
    reply: 'Reply from the newsroom', replies: ['Thanks for flagging this. We have corrected the date in the article.', 'Good point. Our transport reporter is following this up.'],
    pend: 'An editor has read comment {ref}; the newsroom has not replied yet.', queued: 'Comment {ref} is in the moderation queue at position 12.',
    trend: 'Most read', reads: ['Storm warning for the coast this weekend', 'New bakery opens on Quay Street'],
    E: { main: 'Comment {ref} by {who} under the article', res: 'A reply from the editors to comment {ref}', num: 'Comment {ref} posted on {num}', status: 'Comment {ref} can now be seen by all readers' },
  },
  uk: {
    brands: ['Вісник Поділля', 'Північна Газета', 'Вечірній Порт'], nav: ['Новини', 'Місто', 'Бізнес', 'Думки', 'Спорт'],
    h: 'Ваш коментар', art: 'До статті', arts: ['Міськрада схвалила велосмуги на вулиці Млинній', 'З листопада зміниться розклад порома', 'Бібліотека працюватиме довше у вихідні'], cid: 'Коментар', posted: 'Опубліковано', author: 'Ім’я',
    ladder: ['Надіслано', 'На модерації', 'Опубліковано'], neg: ['Відхилено', 'Коментар {ref} не опубліковано, бо він порушує правила спільноти.'],
    reply: 'Відповідь редакції', replies: ['Дякуємо, що помітили. Ми виправили дату в статті.', 'Слушно. Наш кореспондент уже з’ясовує деталі.'],
    pend: 'Редактор прочитав коментар {ref}; редакція ще не відповіла.', queued: 'Коментар {ref} у черзі на модерацію, позиція 12.',
    trend: 'Найпопулярніше', reads: ['Штормове попередження на вихідні', 'На Портовій відкрилася пекарня'],
    E: { main: 'Коментар {ref} під статтею (автор: {who})', res: 'Відповідь редакції на коментар {ref}', num: 'Коментар {ref}, опублікований {num}', status: 'Коментар {ref} тепер бачать усі читачі' },
  },
  es: {
    brands: ['El Correo de Valdeluz', 'Diario del Norte', 'La Gaceta del Puerto'], nav: ['Noticias', 'Local', 'Economía', 'Opinión', 'Deportes'],
    h: 'Tu comentario', art: 'En el artículo', arts: ['El pleno aprueba carriles bici en la calle del Molino', 'Cambia el horario del ferry desde noviembre', 'La biblioteca amplía su horario de fin de semana'], cid: 'Comentario', posted: 'Publicado el', author: 'Nombre',
    ladder: ['Enviado', 'En moderación', 'Publicado'], neg: ['Rechazado', 'El comentario {ref} no se ha publicado porque incumple las normas de la comunidad.'],
    reply: 'Respuesta de la redacción', replies: ['Gracias por el aviso. Hemos corregido la fecha en el artículo.', 'Buena observación. Nuestra redactora de transporte lo está siguiendo.'],
    pend: 'Un editor ha leído el comentario {ref}; la redacción aún no ha respondido.', queued: 'El comentario {ref} está en la cola de moderación, posición 12.',
    trend: 'Lo más leído', reads: ['Aviso por temporal en la costa', 'Abre una panadería en la calle del Muelle'],
    E: { main: 'El comentario {ref} de {who} bajo el artículo', res: 'Una respuesta de la redacción al comentario {ref}', num: 'El comentario {ref} publicado el {num}', status: 'El comentario {ref} ya es visible para todos los lectores' },
  },
  pl: {
    brands: ['Kurier Wrzosowa', 'Dziennik Północny', 'Wieczór Portowy'], nav: ['Wiadomości', 'Region', 'Biznes', 'Opinie', 'Sport'],
    h: 'Twój komentarz', art: 'Pod artykułem', arts: ['Rada zatwierdziła pas rowerowy na Młyńskiej', 'Od listopada zmienia się rozkład promu', 'Biblioteka wydłuża godziny w weekendy'], cid: 'Komentarz', posted: 'Opublikowano', author: 'Imię',
    ladder: ['Wysłany', 'W moderacji', 'Opublikowany'], neg: ['Odrzucony', 'Komentarz {ref} nie został opublikowany, bo narusza zasady społeczności.'],
    reply: 'Odpowiedź redakcji', replies: ['Dziękujemy za uwagę. Poprawiliśmy datę w artykule.', 'Słuszna uwaga. Nasz reporter to sprawdza.'],
    pend: 'Redaktor przeczytał komentarz {ref}; redakcja jeszcze nie odpowiedziała.', queued: 'Komentarz {ref} czeka w kolejce moderacji na pozycji 12.',
    trend: 'Najczęściej czytane', reads: ['Ostrzeżenie przed sztormem na wybrzeżu', 'Nowa piekarnia na Portowej'],
    E: { main: 'Komentarz {ref} pod artykułem (autor: {who})', res: 'Odpowiedź redakcji na komentarz {ref}', num: 'Komentarz {ref} opublikowany {num}', status: 'Komentarz {ref} widzą już wszyscy czytelnicy' },
  },
};

export const newsComment = {
  id: 'news-comment', kind: 'news', langs: ['en', 'uk', 'es', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `#${48000 + r.int(9000)}`, spec: { type: 'date' } });
    const v = c.v;
    const art = rng.pick(v.arts);
    const reply = rng.pick(v.replies);
    return {
      ...c, kind: 'news', nav: v.nav, slug: 'news', crumbs: [v.nav[0], v.h], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: () => `${v.h} | ${c.brand}`, at: (ref) => `/account/comments/${ref.slice(1)}`, resText: reply, loadTitle: v.h,
      en: { thing: 'comment', res: 'reply from the newsroom', num: 'posting date' },
      main(x, ui) {
        const res = `<div class="card"><strong>${esc(v.reply)}</strong><p>${esc(reply)}</p></div>`;
        return `<h1>${esc(v.h)}</h1><p>${esc(v.art)}: ${ui.a(art, '/news/local')}</p>${rows([[v.cid, esc(x.ref)], [v.author, esc(x.who)], [v.posted, esc(x.num)], ['', stageBadge(x)]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: (x, ui) => box(v.trend, list(v.reads.map((t) => ui.a(t, '/news')))),
    };
  },
};
