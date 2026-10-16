// n6 generic wording per language: loading states, the sign-in page, record labels and page noise.
// Chrome, error pages and decoy notices come from n5-lang.mjs; record wording from each n6-tpl-*.mjs.

export const W = {
  en: {
    loading: ['Loading…', 'Loading details…', 'Fetching the latest information…', 'Just a moment, getting things ready…'],
    loadNote: ['This usually takes a few seconds.', 'Still working on it. Please keep this tab open.'],
    status: 'Status', ref: 'Reference', updated: 'Last updated', progress: 'Progress', recent: 'Recently viewed',
    loginTitle: 'Sign in to continue', loginBody: 'You need to be signed in to view this page.', email: 'Email address',
    forgot: 'Forgot your password?', newHere: 'New here? Create an account', remember: 'Keep me signed in',
    tip: ['Tip: you can switch the language at the bottom of every page.', 'Need help? Our help centre is open around the clock.', 'Shortcuts: press / to search.'],
  },
  uk: {
    loading: ['Завантаження…', 'Завантажуємо деталі…', 'Отримуємо актуальні дані…', 'Хвилинку, готуємо сторінку…'],
    loadNote: ['Зазвичай це триває кілька секунд.', 'Ще працюємо. Не закривайте цю вкладку.'],
    status: 'Статус', ref: 'Номер', updated: 'Оновлено', progress: 'Хід виконання', recent: 'Нещодавно переглянуті',
    loginTitle: 'Увійдіть, щоб продовжити', loginBody: 'Щоб переглянути цю сторінку, потрібно увійти.', email: 'Електронна пошта',
    forgot: 'Забули пароль?', newHere: 'Вперше тут? Створіть обліковий запис', remember: 'Не виходити з облікового запису',
    tip: ['Порада: мову можна змінити внизу будь-якої сторінки.', 'Потрібна допомога? Довідковий центр працює цілодобово.', 'Скорочення: натисніть /, щоб шукати.'],
  },
  de: {
    loading: ['Wird geladen…', 'Details werden geladen…', 'Aktuelle Daten werden abgerufen…', 'Einen Moment, die Seite wird vorbereitet…'],
    loadNote: ['Das dauert meist nur wenige Sekunden.', 'Wir arbeiten noch daran. Bitte lassen Sie diesen Tab geöffnet.'],
    status: 'Status', ref: 'Nummer', updated: 'Zuletzt aktualisiert', progress: 'Fortschritt', recent: 'Zuletzt angesehen',
    loginTitle: 'Anmelden, um fortzufahren', loginBody: 'Bitte melden Sie sich an, um diese Seite zu sehen.', email: 'E-Mail-Adresse',
    forgot: 'Passwort vergessen?', newHere: 'Neu hier? Konto erstellen', remember: 'Angemeldet bleiben',
    tip: ['Tipp: Die Sprache können Sie unten auf jeder Seite ändern.', 'Fragen? Unser Hilfe-Center ist rund um die Uhr da.', 'Kurzbefehl: / öffnet die Suche.'],
  },
  es: {
    loading: ['Cargando…', 'Cargando los detalles…', 'Obteniendo la información más reciente…', 'Un momento, preparando la página…'],
    loadNote: ['Suele tardar unos segundos.', 'Seguimos trabajando. No cierres esta pestaña.'],
    status: 'Estado', ref: 'Referencia', updated: 'Última actualización', progress: 'Progreso', recent: 'Vistos recientemente',
    loginTitle: 'Inicia sesión para continuar', loginBody: 'Debes iniciar sesión para ver esta página.', email: 'Correo electrónico',
    forgot: '¿Olvidaste tu contraseña?', newHere: '¿Eres nuevo? Crea una cuenta', remember: 'Mantener la sesión iniciada',
    tip: ['Consejo: puedes cambiar el idioma al pie de cada página.', '¿Necesitas ayuda? El centro de ayuda atiende a todas horas.', 'Atajo: pulsa / para buscar.'],
  },
  pl: {
    loading: ['Ładowanie…', 'Wczytujemy szczegóły…', 'Pobieramy najnowsze dane…', 'Chwileczkę, przygotowujemy stronę…'],
    loadNote: ['Zwykle trwa to kilka sekund.', 'Nadal pracujemy. Nie zamykaj tej karty.'],
    status: 'Status', ref: 'Numer', updated: 'Ostatnia aktualizacja', progress: 'Postęp', recent: 'Ostatnio oglądane',
    loginTitle: 'Zaloguj się, aby kontynuować', loginBody: 'Aby zobaczyć tę stronę, musisz się zalogować.', email: 'Adres e-mail',
    forgot: 'Nie pamiętasz hasła?', newHere: 'Pierwszy raz? Załóż konto', remember: 'Nie wylogowuj mnie',
    tip: ['Wskazówka: język zmienisz na dole każdej strony.', 'Potrzebujesz pomocy? Centrum pomocy działa całą dobę.', 'Skrót: naciśnij /, aby szukać.'],
  },
};

// Near-twin people per language: [name, near twin]. All invented.
export const PEOPLE = {
  en: [['Mara Quint', 'Mara Quinn'], ['Tom Okafor', 'Tom Okoro'], ['Priya Calder', 'Priya Colder'], ['Owen Strick', 'Owen Stricker'], ['Ilse Brandvold', 'Ilse Brandt'], ['Nadia Ferrow', 'Nadia Farrow']],
  uk: [['Оксана Гребінь', 'Оксана Гребенюк'], ['Тарас Мельничук', 'Тарас Мельник'], ['Ірина Коваль', 'Ірина Ковальчук'], ['Богдан Савчин', 'Богдан Савчук'], ['Дарина Ліщук', 'Дарина Лищак']],
  de: [['Lena Brückner', 'Lena Brückmann'], ['Paul Wendel', 'Paula Wendel'], ['Anke Störmer', 'Anke Stürmer'], ['Jonas Hellwig', 'Jonas Hellweg']],
  es: [['Lucía Ferrán', 'Lucía Ferrer'], ['Mateo Lozada', 'Mateo Lozano'], ['Inés Barral', 'Inés Berral'], ['Diego Urquiza', 'Diego Urquijo']],
  pl: [['Zofia Wrzos', 'Zofia Wrzosek'], ['Marek Sowa', 'Marek Sowiński'], ['Hanna Grab', 'Hanna Grabska'], ['Kacper Lisowski', 'Kacper Lisiecki']],
};
