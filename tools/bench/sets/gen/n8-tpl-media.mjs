// Templates news-account (a newspaper's reader account: newsletters, edition, subscription), forum-thread (a
// community board: thread list with sort, new-topic form) and docs-page (a developer guide with a version picker).
import { T, esc } from './n8-lib.mjs';
import { box, h, list, p } from './n8-page.mjs';

const NE = {
  en: { brands: ['The Morning Ledger', 'Riverside Courier'], nav: ['World', 'Business', 'Culture', 'Opinion'], h1: 'Your account', news: 'Newsletters', newsP: 'Pick how often the Weekend Reads digest reaches your inbox.',
    sub: 'Subscription', subP: 'Your digital subscription renews on 3 January.', ed: 'Edition', edP: 'Choose the language of the front page and the morning briefing.', save: 'Save preferences',
    top: 'Most read', heads: ['River ferry returns after a decade', 'Council approves new cycle lanes', 'Interview: the last lighthouse keeper'], com: 'Comments', comP: '214 comments on today’s editorial' },
  uk: { brands: ['Ранковий вісник', 'Прибережний кур’єр'], nav: ['Світ', 'Бізнес', 'Культура', 'Думки'], h1: 'Ваш акаунт', news: 'Розсилки', newsP: 'Оберіть, як часто дайджест «Читання на вихідні» приходитиме на пошту.',
    sub: 'Передплата', subP: 'Ваша цифрова передплата поновиться 3 січня.', ed: 'Випуск', edP: 'Оберіть мову головної сторінки й ранкового огляду.', save: 'Зберегти налаштування',
    top: 'Найпопулярніше', heads: ['Річковий пором повернувся через десять років', 'Міськрада схвалила нові велосмуги', 'Інтерв’ю з останнім доглядачем маяка'], com: 'Коментарі', comP: '214 коментарів до сьогоднішньої редакційної статті' },
  de: { brands: ['Morgenblatt', 'Uferbote'], nav: ['Welt', 'Wirtschaft', 'Kultur', 'Meinung'], h1: 'Ihr Konto', news: 'Newsletter', newsP: 'Wählen Sie, wie oft der Wochenend-Lesetipp in Ihrem Postfach landet.',
    sub: 'Abonnement', subP: 'Ihr Digital-Abo verlängert sich am 3. Januar.', ed: 'Ausgabe', edP: 'Wählen Sie die Sprache der Titelseite und des Morgenbriefings.', save: 'Einstellungen speichern',
    top: 'Meistgelesen', heads: ['Flussfähre fährt nach zehn Jahren wieder', 'Stadtrat beschließt neue Radwege', 'Interview: der letzte Leuchtturmwärter'], com: 'Kommentare', comP: '214 Kommentare zum heutigen Leitartikel' },
  es: { brands: ['El Diario de la Mañana', 'Correo de la Ribera'], nav: ['Mundo', 'Economía', 'Cultura', 'Opinión'], h1: 'Tu cuenta', news: 'Boletines', newsP: 'Elige cada cuánto llega a tu correo el resumen Lecturas de fin de semana.',
    sub: 'Suscripción', subP: 'Tu suscripción digital se renueva el 3 de enero.', ed: 'Edición', edP: 'Elige el idioma de la portada y del resumen matinal.', save: 'Guardar preferencias',
    top: 'Lo más leído', heads: ['Vuelve el ferri del río tras una década', 'El pleno aprueba nuevos carriles bici', 'Entrevista: el último farero'], com: 'Comentarios', comP: '214 comentarios en el editorial de hoy' },
  pl: { brands: ['Poranny Kurier', 'Gazeta Nadbrzeżna'], nav: ['Świat', 'Biznes', 'Kultura', 'Opinie'], h1: 'Twoje konto', news: 'Newslettery', newsP: 'Wybierz, jak często przegląd Lektury na weekend ma trafiać do skrzynki.',
    sub: 'Prenumerata', subP: 'Twoja prenumerata cyfrowa odnowi się 3 stycznia.', ed: 'Wydanie', edP: 'Wybierz język strony głównej i porannego przeglądu.', save: 'Zapisz ustawienia',
    top: 'Najczęściej czytane', heads: ['Prom rzeczny wraca po dekadzie', 'Rada miasta przyjęła nowe pasy rowerowe', 'Wywiad z ostatnim latarnikiem'], com: 'Komentarze', comP: '214 komentarzy pod dzisiejszym artykułem wstępnym' },
};

export const newsAccount = {
  id: 'news-account', kind: 'news',
  hosts: { frequency: null, language: null, plan: null, payment: null, sort: T('Sort comments|Сортувати коментарі|Kommentare sortieren|Ordenar comentarios|Sortuj komentarze') },
  make(rng, lang, domId) {
    const v = NE[lang];
    const brand = rng.pick(v.brands);
    const [hh, pp] = domId === 'frequency' ? [v.news, v.newsP] : domId === 'language' ? [v.ed, v.edP] : domId === 'sort' ? [v.com, v.comP] : [v.sub, v.subP];
    return {
      kind: 'news', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'news', user: null, crumbs: [v.h1, hh],
      main: (field, ui) => `${h(1, v.h1)}${h(2, hh)}${p(pp)}${field}<p>${ui.btn(v.save, { pri: true })}</p>`,
      aside: (ui) => box(v.top, list(v.heads.map((x) => ui.a(x, '/news/story')))),
    };
  },
};

const FO = {
  en: { brands: ['Tinkerers’ Porch', 'Allotment Talk'], nav: ['Latest', 'Categories', 'Members', 'Rules'], h1: 'Watering and irrigation', threads: [['Drip lines clogging every spring', '42 replies'], ['Rain barrel overflow ideas', '17 replies'], ['Timer stops after power cut', '8 replies']],
    newT: 'Start a new topic', title: 'Title', body: 'Your question', post: 'Post topic', prefs: 'E-mail me about replies', rules: 'Be kind. No selling. Search before you post.', about: 'About this board' },
  uk: { brands: ['Ґанок майстрів', 'Розмови на ділянці'], nav: ['Нове', 'Розділи', 'Учасники', 'Правила'], h1: 'Полив і зрошення', threads: [['Крапельна стрічка забивається щовесни', '42 відповіді'], ['Як відводити воду з бочки', '17 відповідей'], ['Таймер зупиняється після вимкнення світла', '8 відповідей']],
    newT: 'Нова тема', title: 'Заголовок', body: 'Ваше питання', post: 'Опублікувати', prefs: 'Писати мені про відповіді', rules: 'Будьте ввічливі. Без продажів. Шукайте, перш ніж питати.', about: 'Про форум' },
  de: { brands: ['Bastlerveranda', 'Schrebergarten-Forum'], nav: ['Neu', 'Kategorien', 'Mitglieder', 'Regeln'], h1: 'Gießen und Bewässerung', threads: [['Tropfschlauch verstopft jedes Frühjahr', '42 Antworten'], ['Ideen für den Regentonnen-Überlauf', '17 Antworten'], ['Zeitschaltuhr steht nach Stromausfall', '8 Antworten']],
    newT: 'Neues Thema', title: 'Titel', body: 'Deine Frage', post: 'Thema erstellen', prefs: 'Per E-Mail über Antworten informieren', rules: 'Freundlich bleiben. Kein Verkauf. Erst suchen, dann fragen.', about: 'Über das Forum' },
  es: { brands: ['El Porche del Manitas', 'Charlas de Huerto'], nav: ['Recientes', 'Categorías', 'Miembros', 'Normas'], h1: 'Riego', threads: [['El goteo se atasca cada primavera', '42 respuestas'], ['Ideas para el rebose del bidón', '17 respuestas'], ['El temporizador se para tras un apagón', '8 respuestas']],
    newT: 'Nuevo tema', title: 'Título', body: 'Tu pregunta', post: 'Publicar tema', prefs: 'Avisarme por correo de las respuestas', rules: 'Sé amable. Nada de ventas. Busca antes de preguntar.', about: 'Sobre el foro' },
  pl: { brands: ['Ganek Majsterkowiczów', 'Rozmowy Działkowe'], nav: ['Najnowsze', 'Kategorie', 'Członkowie', 'Zasady'], h1: 'Podlewanie i nawadnianie', threads: [['Linia kroplująca zatyka się co wiosnę', '42 odpowiedzi'], ['Pomysły na przelew z beczki', '17 odpowiedzi'], ['Wyłącznik czasowy staje po zaniku prądu', '8 odpowiedzi']],
    newT: 'Nowy temat', title: 'Tytuł', body: 'Twoje pytanie', post: 'Opublikuj', prefs: 'Powiadamiaj mnie o odpowiedziach', rules: 'Bądź uprzejmy. Bez sprzedaży. Najpierw szukaj.', about: 'O forum' },
};

export const forumThread = {
  id: 'forum-thread', kind: 'forum',
  hosts: { sort: null, frequency: T('E-mail me about replies|Писати мені про відповіді|Per E-Mail über Antworten|Avisarme por correo|Powiadamiaj e-mailem'), category: null, language: T('Post language|Мова допису|Sprache des Beitrags|Idioma de la publicación|Język wpisu') },
  make(rng, lang, domId) {
    const v = FO[lang];
    const brand = rng.pick(v.brands);
    return {
      kind: 'forum', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'forum', user: null, crumbs: [v.nav[1], v.h1],
      main(field, ui) {
        const ts = list(v.threads.map(([t, r]) => `${ui.a(t, '/forum/t')} <span class="muted">${esc(r)}</span>`));
        if (domId === 'sort') return `${h(1, v.h1)}${field}${ts}`;
        return `${h(1, v.h1)}${ts}${h(2, v.newT)}${ui.input(v.title, '')}${ui.input(v.body, '', { area: true })}${field}<p>${ui.btn(v.post, { pri: true })}</p>`;
      },
      aside: () => box(v.about, p(v.rules)),
    };
  },
};

const DO = {
  en: { brands: ['Pinewire SDK', 'Lumen Kit Docs'], nav: ['Guides', 'API reference', 'Examples', 'Changelog'], h1: 'Uploading files in chunks', toc: ['Install', 'Authentication', 'Uploads', 'Webhooks'],
    body: ['Large files are sent in parts of 8 MB. Each part is retried up to three times before the upload fails.', 'Call finishUpload() after the last part; the server then joins the parts in order.'], ver: 'Documentation version', note: 'Older versions are kept for reference and get no fixes.' },
  uk: { brands: ['Сосновий дріт SDK', 'Документація Люмен'], nav: ['Посібники', 'Довідник API', 'Приклади', 'Зміни'], h1: 'Завантаження файлів частинами', toc: ['Встановлення', 'Автентифікація', 'Завантаження', 'Вебхуки'],
    body: ['Великі файли надсилаються частинами по 8 МБ. Кожну частину повторюють до трьох разів, перш ніж завантаження завершиться помилкою.', 'Після останньої частини викличте finishUpload(); сервер з’єднає частини по порядку.'], ver: 'Версія документації', note: 'Старі версії збережено для довідки, виправлень вони не отримують.' },
  de: { brands: ['Kieferndraht SDK', 'Lumen-Kit-Doku'], nav: ['Anleitungen', 'API-Referenz', 'Beispiele', 'Änderungen'], h1: 'Dateien in Teilen hochladen', toc: ['Installation', 'Authentifizierung', 'Uploads', 'Webhooks'],
    body: ['Große Dateien werden in Teilen zu 8 MB gesendet. Jeder Teil wird bis zu dreimal wiederholt, bevor der Upload fehlschlägt.', 'Rufen Sie nach dem letzten Teil finishUpload() auf; der Server setzt die Teile dann zusammen.'], ver: 'Version der Dokumentation', note: 'Ältere Versionen bleiben zum Nachschlagen erhalten und bekommen keine Korrekturen.' },
  es: { brands: ['SDK Alambre de Pino', 'Docs Lumen Kit'], nav: ['Guías', 'Referencia de la API', 'Ejemplos', 'Cambios'], h1: 'Subir archivos por partes', toc: ['Instalación', 'Autenticación', 'Subidas', 'Webhooks'],
    body: ['Los archivos grandes se envían en partes de 8 MB. Cada parte se reintenta hasta tres veces antes de que falle la subida.', 'Llama a finishUpload() tras la última parte; el servidor une las partes en orden.'], ver: 'Versión de la documentación', note: 'Las versiones antiguas se conservan como referencia y no reciben correcciones.' },
  pl: { brands: ['Sosnowy Drut SDK', 'Dokumentacja Lumen'], nav: ['Przewodniki', 'Dokumentacja API', 'Przykłady', 'Zmiany'], h1: 'Wysyłanie plików w częściach', toc: ['Instalacja', 'Uwierzytelnianie', 'Wysyłanie', 'Webhooki'],
    body: ['Duże pliki są wysyłane w częściach po 8 MB. Każda część jest ponawiana do trzech razy, zanim wysyłanie się nie powiedzie.', 'Po ostatniej części wywołaj finishUpload(); serwer połączy części w kolejności.'], ver: 'Wersja dokumentacji', note: 'Starsze wersje zostają do wglądu i nie dostają poprawek.' },
};

export const docsPage = {
  id: 'docs-page', kind: 'docs',
  hosts: { version: T('Version|Версія|Version|Versión|Wersja'), language: T('Read in|Читати мовою|Lesen auf|Leer en|Czytaj w języku') },
  make(rng, lang, domId) {
    const v = DO[lang];
    const brand = rng.pick(v.brands);
    return {
      kind: 'docs', brand, title: `${v.h1} · ${brand}`, nav: v.nav, slug: 'docs', user: null, crumbs: [v.nav[0], v.h1], fieldInMain: false,
      main: () => `${h(1, v.h1)}${v.body.map((b) => p(b)).join('')}<pre><code>upload.part(file, { size: 8 * 1024 * 1024 })</code></pre>`,
      aside: (ui, field) => `<section>${domId === 'version' ? h(3, v.ver) : ''}${field}${p(v.note, 'muted')}</section><section>${list(v.toc.map((t) => ui.a(t, '/docs')))}</section>`,
    };
  },
};
