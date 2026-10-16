// Generic N7 wording per page language: greetings, search states, help-text frames, a loading page.
// Chrome (header, footer) comes from n5-lang.mjs through n5-shell.mjs; scenario wording lives in n7-tpl-*.mjs.

export const G = {
  en: {
    greet: [(v) => `Welcome back, ${v}`, (v) => `Good morning, ${v}`, (v) => `Hi ${v}, good to see you again`, (v) => `Hello, ${v}!`],
    loadingPage: ['Loading your account…', 'Just a moment, getting things ready…', 'Loading…'],
    resultsFor: (q, n) => `${n} results for “${q}”`,
    noResults: (q) => `No results for “${q}”. Check the spelling or try a broader term.`,
    searching: (q) => `Searching for “${q}”…`,
    resultsMention: 'Type a word or phrase above and press Enter. Matching items will be listed here.',
    searchDown: 'Search is temporarily unavailable. Please try again in a few minutes.',
    helpOk: (t) => `Tip: once it is done, you will see “${t}” at the top of this page.`,
    helpErr: (t) => `Tip: if something is wrong, you will see a message such as “${t}” next to the form.`,
    searchLabel: 'Search',
  },
  uk: {
    greet: [(v) => `З поверненням, ${v}!`, (v) => `Доброго ранку, ${v}!`, (v) => `Вітаємо, ${v}!`, (v) => `Привіт, ${v}! Раді вас бачити`],
    loadingPage: ['Завантажуємо ваш кабінет…', 'Хвилинку, готуємо сторінку…', 'Завантаження…'],
    resultsFor: (q, n) => `Знайдено ${n} за запитом «${q}»`,
    noResults: (q) => `За запитом «${q}» нічого не знайдено. Перевірте написання або спробуйте ширший запит.`,
    searching: (q) => `Шукаємо «${q}»…`,
    resultsMention: 'Введіть слово чи фразу вгорі й натисніть Enter. Тут з’явиться перелік знайденого.',
    searchDown: 'Пошук тимчасово недоступний. Спробуйте ще раз за кілька хвилин.',
    helpOk: (t) => `Підказка: коли все буде готово, вгорі цієї сторінки з’явиться «${t}».`,
    helpErr: (t) => `Підказка: якщо щось не так, біля форми з’явиться повідомлення на кшталт «${t}».`,
    searchLabel: 'Пошук',
  },
  de: {
    greet: [(v) => `Willkommen zurück, ${v}`, (v) => `Guten Morgen, ${v}`, (v) => `Hallo ${v}, schön, dass Sie wieder da sind`, (v) => `Hallo, ${v}!`],
    loadingPage: ['Ihr Konto wird geladen…', 'Einen Moment, die Seite wird vorbereitet…', 'Wird geladen…'],
    resultsFor: (q, n) => `${n} Treffer für „${q}“`,
    noResults: (q) => `Keine Treffer für „${q}“. Prüfen Sie die Schreibweise oder suchen Sie allgemeiner.`,
    searching: (q) => `Suche nach „${q}“ läuft…`,
    resultsMention: 'Geben Sie oben einen Begriff ein und drücken Sie Enter. Passende Einträge werden hier aufgelistet.',
    searchDown: 'Die Suche ist vorübergehend nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut.',
    helpOk: (t) => `Tipp: Sobald alles erledigt ist, sehen Sie oben auf dieser Seite „${t}“.`,
    helpErr: (t) => `Tipp: Wenn etwas nicht stimmt, erscheint neben dem Formular eine Meldung wie „${t}“.`,
    searchLabel: 'Suche',
  },
  es: {
    greet: [(v) => `Hola de nuevo, ${v}`, (v) => `Buenos días, ${v}`, (v) => `¡Hola, ${v}! Qué bueno verte otra vez`, (v) => `¡Te damos la bienvenida, ${v}!`],
    loadingPage: ['Cargando tu cuenta…', 'Un momento, estamos preparando la página…', 'Cargando…'],
    resultsFor: (q, n) => `${n} resultados para «${q}»`,
    noResults: (q) => `No hay resultados para «${q}». Revisa la ortografía o prueba con un término más general.`,
    searching: (q) => `Buscando «${q}»…`,
    resultsMention: 'Escribe una palabra o frase arriba y pulsa Intro. Aquí aparecerá la lista de coincidencias.',
    searchDown: 'La búsqueda no está disponible en este momento. Inténtalo de nuevo en unos minutos.',
    helpOk: (t) => `Consejo: cuando termine, verás «${t}» en la parte superior de esta página.`,
    helpErr: (t) => `Consejo: si algo no está bien, verás junto al formulario un mensaje como «${t}».`,
    searchLabel: 'Buscar',
  },
};

// English nouns for the `why` sentences, one per category.
export const NOUN = {
  greeting: 'greeting', confirmation: 'confirmation', error: 'error message', results: 'search results', total: 'total amount',
};

// Abstract expectations: a kind of content, never its words (2.5's "a greeting", "a confirmation", "an error message").
export const ABSTRACT = {
  greeting: ['a greeting', 'a welcome message', 'a greeting'],
  confirmation: ['a confirmation', 'a confirmation message', 'a success message'],
  error: ['an error message', 'an error message', 'an error'],
  results: ['search results', 'a list of search results', 'search results'],
  total: ['a total amount', 'a total price', 'a total amount'],
};
