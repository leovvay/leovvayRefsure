// Set N2 (benchmark protocol 3.5, row N2): held-out `find` items per risk class. consent, auth, money and
// irreversible 120 each (100 gold candidate + 20 `none`), write and read 60 each (50 + 10 `none`). Every item is
// one of three hard cases: `decoy` (look-alike controls that do something else), `near_twin` (the same control
// under two near-identical headings; only the heading the intent names is right) and `translated` (page and intent
// in different languages). Deterministic: plain Node, no dependencies, fixed seed.
// Run: node tools/bench/sets/gen/n2.mjs
// Writes tools/bench/sets/n2/pages/NNN.html and tools/bench/sets/n2.draft.jsonl.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = 'refsure-bench-n2-20261016';
const SETS = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(SETS, 'n2');
const OUT_ITEMS = join(SETS, 'n2.draft.jsonl');
const LANGS = ['en', 'uk', 'de', 'es', 'pl'];

// ---------- deterministic randomness ----------
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngOf = (label) => mulberry(fnv(`${SEED}:${label}`));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- vocabulary helpers ----------
// One text in five languages, 'en|uk|de|es|pl'. A text with no '|' is the same in every language (codes, numbers).
function L(s) {
  const parts = s.split('|');
  if (parts.length === 1) return Object.fromEntries(LANGS.map((l) => [l, s.trim()]));
  if (parts.length !== LANGS.length) throw new Error(`need ${LANGS.length} languages: ${s}`);
  return Object.fromEntries(LANGS.map((l, i) => [l, parts[i].trim()]));
}
// A control: role (button, link, switch, checkbox) and its name in five languages; `on` for a switch's state.
const C = (role, names, on = null) => ({ role, names: L(names), on });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- chrome every template shares ----------
const SHARED = {
  foot: [
    C('link', 'Privacy notice|Повідомлення про конфіденційність|Datenschutzhinweis|Aviso de privacidad|Informacja o prywatności'),
    C('link', 'Terms of use|Умови використання|Nutzungsbedingungen|Condiciones de uso|Warunki korzystania'),
    C('link', 'Help centre|Довідковий центр|Hilfe-Center|Centro de ayuda|Centrum pomocy'),
  ],
  footHead: L('About this service|Про сервіс|Über diesen Dienst|Sobre este servicio|O serwisie'),
  rights: L('All figures and names on this page are examples.|Усі цифри та імена на цій сторінці є прикладами.|Alle Zahlen und Namen auf dieser Seite sind Beispiele.|Todas las cifras y nombres de esta página son ejemplos.|Wszystkie liczby i nazwy na tej stronie są przykładowe.'),
  skip: L('Skip to content|Перейти до вмісту|Zum Inhalt springen|Saltar al contenido|Przejdź do treści'),
  on: L('On|Увімкнено|An|Activado|Włączone'),
  off: L('Off|Вимкнено|Aus|Desactivado|Wyłączone'),
};

// ---------- templates (site kinds): chrome, a filler section and a sidebar ----------
// nav: 4 links. filler: a second main section with two controls that no task asks for. aside: 3 links.
const TEMPLATES = [];
const T = (t) => TEMPLATES.push({ ...t, nav: t.nav.map(L), h1: L(t.h1), intro: L(t.intro), fillHead: L(t.fillHead), fillCopy: L(t.fillCopy), asideHead: L(t.asideHead), aside: t.aside.map(L) });

T({ id: 'shop', kind: 'online shop, customer account', brand: 'Bramblecart', theme: ['#fbfaf7', '#1d1d1f', '#c2410c', 'Georgia, serif'], layout: 'right',
  nav: ['Women|Жінкам|Damen|Mujer|Kobiety', 'Men|Чоловікам|Herren|Hombre|Mężczyźni', 'Home and garden|Дім і сад|Haus und Garten|Hogar y jardín|Dom i ogród', 'Sale|Розпродаж|Sale|Rebajas|Wyprzedaż'],
  h1: 'My account|Мій акаунт|Mein Konto|Mi cuenta|Moje konto',
  intro: 'Track parcels, manage returns and keep your details up to date. Orders placed before 2 pm ship the same day.|Відстежуйте посилки, оформлюйте повернення й оновлюйте свої дані. Замовлення до 14:00 відправляємо того ж дня.|Pakete verfolgen, Rücksendungen verwalten und Daten aktuell halten. Bestellungen vor 14 Uhr gehen am selben Tag raus.|Sigue tus paquetes, gestiona devoluciones y mantén tus datos al día. Los pedidos antes de las 14:00 salen el mismo día.|Śledź paczki, zarządzaj zwrotami i aktualizuj dane. Zamówienia przed 14:00 wysyłamy tego samego dnia.',
  fillHead: 'Recent orders|Останні замовлення|Letzte Bestellungen|Pedidos recientes|Ostatnie zamówienia',
  fillCopy: 'Order 48213 left the warehouse on Tuesday and is with the courier.|Замовлення 48213 виїхало зі складу у вівторок і вже в кур’єра.|Bestellung 48213 hat das Lager am Dienstag verlassen und ist beim Kurier.|El pedido 48213 salió del almacén el martes y está con el mensajero.|Zamówienie 48213 opuściło magazyn we wtorek i jest u kuriera.',
  fill: [C('link', 'Track parcel|Відстежити посилку|Sendung verfolgen|Seguir el envío|Śledź przesyłkę'), C('link', 'Start a return|Оформити повернення|Rücksendung starten|Iniciar una devolución|Rozpocznij zwrot')],
  asideHead: 'Account|Акаунт|Konto|Cuenta|Konto',
  aside: ['Orders|Замовлення|Bestellungen|Pedidos|Zamówienia', 'Addresses|Адреси|Adressen|Direcciones|Adresy', 'Wishlist|Обране|Wunschliste|Favoritos|Ulubione'] });

T({ id: 'bank', kind: 'bank-like account dashboard', brand: 'Tallow Savings', theme: ['#f3f6f9', '#0f2233', '#0b6e4f', 'Verdana, sans-serif'], layout: 'left',
  nav: ['Accounts|Рахунки|Konten|Cuentas|Rachunki', 'Payments|Платежі|Zahlungen|Pagos|Płatności', 'Cards|Картки|Karten|Tarjetas|Karty', 'Messages|Повідомлення|Nachrichten|Mensajes|Wiadomości'],
  h1: 'Account overview|Огляд рахунків|Kontoübersicht|Resumen de cuentas|Przegląd rachunków',
  intro: 'Available balance 2,418.60. The last sign-in was today at 08:14 from a known device.|Доступний залишок 2 418,60. Останній вхід сьогодні о 08:14 з відомого пристрою.|Verfügbarer Saldo 2.418,60. Letzte Anmeldung heute um 08:14 von einem bekannten Gerät.|Saldo disponible 2.418,60. Último acceso hoy a las 08:14 desde un dispositivo conocido.|Dostępne saldo 2 418,60. Ostatnie logowanie dziś o 08:14 ze znanego urządzenia.',
  fillHead: 'Statements|Виписки|Kontoauszüge|Extractos|Wyciągi',
  fillCopy: 'Monthly statements are kept for seven years.|Місячні виписки зберігаються сім років.|Monatsauszüge werden sieben Jahre aufbewahrt.|Los extractos mensuales se guardan siete años.|Wyciągi miesięczne przechowujemy siedem lat.',
  fill: [C('link', 'View September statement|Виписка за вересень|Auszug September ansehen|Ver extracto de septiembre|Zobacz wyciąg za wrzesień'), C('button', 'Download as CSV|Завантажити як CSV|Als CSV herunterladen|Descargar en CSV|Pobierz jako CSV')],
  asideHead: 'Quick links|Швидкі посилання|Schnellzugriff|Accesos rápidos|Szybkie linki',
  aside: ['Exchange rates|Курси валют|Wechselkurse|Tipos de cambio|Kursy walut', 'Branches|Відділення|Filialen|Oficinas|Oddziały', 'Security tips|Поради з безпеки|Sicherheitstipps|Consejos de seguridad|Porady bezpieczeństwa'] });

T({ id: 'saas', kind: 'SaaS workspace settings', brand: 'Stackwell', theme: ['#ffffff', '#18181b', '#4f46e5', 'system-ui, sans-serif'], layout: 'left',
  nav: ['Projects|Проєкти|Projekte|Proyectos|Projekty', 'Members|Учасники|Mitglieder|Miembros|Członkowie', 'Billing|Оплата|Abrechnung|Facturación|Rozliczenia', 'Settings|Налаштування|Einstellungen|Ajustes|Ustawienia'],
  h1: 'Workspace settings|Налаштування робочого простору|Workspace-Einstellungen|Ajustes del espacio de trabajo|Ustawienia przestrzeni roboczej',
  intro: 'Changes here apply to all 14 members of the workspace. Owners can undo most changes for 30 days.|Зміни тут діють для всіх 14 учасників простору. Власники можуть скасувати більшість змін упродовж 30 днів.|Änderungen gelten für alle 14 Mitglieder. Inhaber können die meisten Änderungen 30 Tage lang rückgängig machen.|Los cambios afectan a los 14 miembros. Los propietarios pueden deshacer casi todo durante 30 días.|Zmiany dotyczą wszystkich 14 członków. Właściciele mogą cofnąć większość zmian przez 30 dni.',
  fillHead: 'General|Загальне|Allgemein|General|Ogólne',
  fillCopy: 'Workspace name and default time zone (UTC+02:00).|Назва простору й часовий пояс за замовчуванням (UTC+02:00).|Name des Workspace und Standardzeitzone (UTC+02:00).|Nombre del espacio y zona horaria (UTC+02:00).|Nazwa przestrzeni i domyślna strefa czasowa (UTC+02:00).',
  fill: [C('button', 'Rename workspace|Перейменувати простір|Workspace umbenennen|Renombrar espacio|Zmień nazwę przestrzeni'), C('link', 'Change time zone|Змінити часовий пояс|Zeitzone ändern|Cambiar zona horaria|Zmień strefę czasową')],
  asideHead: 'Settings|Налаштування|Einstellungen|Ajustes|Ustawienia',
  aside: ['Integrations|Інтеграції|Integrationen|Integraciones|Integracje', 'API tokens|API-токени|API-Token|Tokens de API|Tokeny API', 'Audit log|Журнал аудиту|Prüfprotokoll|Registro de auditoría|Dziennik audytu'] });

T({ id: 'news', kind: 'news site, reader account', brand: 'The Daily Pennant', theme: ['#ffffff', '#111111', '#b91c1c', '"Times New Roman", serif'], layout: 'right',
  nav: ['World|Світ|Welt|Mundo|Świat', 'Business|Бізнес|Wirtschaft|Economía|Biznes', 'Culture|Культура|Kultur|Cultura|Kultura', 'Opinion|Думки|Meinung|Opinión|Opinie'],
  h1: 'Your reader account|Ваш акаунт читача|Ihr Leserkonto|Tu cuenta de lector|Twoje konto czytelnika',
  intro: 'Saved articles sync across devices. Today: the harbour bridge reopens after two years of repairs.|Збережені статті синхронізуються між пристроями. Сьогодні: міст у гавані знову відкрили після двох років ремонту.|Gespeicherte Artikel werden synchronisiert. Heute: Die Hafenbrücke öffnet nach zwei Jahren Sanierung.|Los artículos guardados se sincronizan. Hoy: el puente del puerto reabre tras dos años de obras.|Zapisane artykuły synchronizują się. Dziś: most portowy otwarty po dwóch latach remontu.',
  fillHead: 'Saved for later|Збережене на потім|Für später gespeichert|Guardado para después|Zapisane na później',
  fillCopy: 'Three articles are waiting, the oldest from last week.|На вас чекають три статті, найстаріша з минулого тижня.|Drei Artikel warten, der älteste von letzter Woche.|Tienes tres artículos, el más antiguo de la semana pasada.|Czekają trzy artykuły, najstarszy z zeszłego tygodnia.',
  fill: [C('link', 'Harbour bridge reopens|Міст у гавані відкрито|Hafenbrücke wieder offen|Reabre el puente del puerto|Most portowy znów otwarty'), C('link', 'Read the morning briefing|Читати ранковий огляд|Morgenbriefing lesen|Leer el resumen matinal|Czytaj poranny przegląd')],
  asideHead: 'Most read|Найпопулярніше|Meistgelesen|Lo más leído|Najczęściej czytane',
  aside: ['Rail strike ends|Страйк залізничників завершено|Bahnstreik beendet|Termina la huelga de trenes|Koniec strajku kolejarzy', 'Grain prices fall|Ціни на зерно падають|Getreidepreise fallen|Bajan los precios del grano|Ceny zboża spadają', 'Letters to the editor|Листи до редакції|Leserbriefe|Cartas al director|Listy do redakcji'] });

T({ id: 'travel', kind: 'travel booking management', brand: 'Wayfarer Lane', theme: ['#eef4fb', '#102a43', '#0369a1', 'Arial, sans-serif'], layout: 'left',
  nav: ['Flights|Авіаквитки|Flüge|Vuelos|Loty', 'Hotels|Готелі|Hotels|Hoteles|Hotele', 'Car hire|Оренда авто|Mietwagen|Alquiler de coches|Wynajem aut', 'My trips|Мої поїздки|Meine Reisen|Mis viajes|Moje podróże'],
  h1: 'Manage booking|Керування бронюванням|Buchung verwalten|Gestionar reserva|Zarządzaj rezerwacją',
  intro: 'Booking reference QX7R2L, two adults, departing 14 November at 06:40. Check-in opens 24 hours before departure.|Код бронювання QX7R2L, двоє дорослих, виліт 14 листопада о 06:40. Реєстрація відкривається за 24 години.|Buchungscode QX7R2L, zwei Erwachsene, Abflug am 14. November um 06:40. Check-in ab 24 Stunden vorher.|Reserva QX7R2L, dos adultos, salida el 14 de noviembre a las 06:40. La facturación abre 24 horas antes.|Rezerwacja QX7R2L, dwie osoby dorosłe, wylot 14 listopada o 06:40. Odprawa od 24 godzin przed wylotem.',
  fillHead: 'Your flights|Ваші рейси|Ihre Flüge|Tus vuelos|Twoje loty',
  fillCopy: 'Outbound WL 482, return WL 489. Seats are not yet chosen.|Туди WL 482, назад WL 489. Місця ще не обрані.|Hinflug WL 482, Rückflug WL 489. Sitze noch nicht gewählt.|Ida WL 482, vuelta WL 489. Aún sin asientos.|Wylot WL 482, powrót WL 489. Miejsca jeszcze niewybrane.',
  fill: [C('link', 'Flight details|Деталі рейсу|Flugdetails|Detalles del vuelo|Szczegóły lotu'), C('link', 'Baggage allowance|Норми багажу|Freigepäck|Equipaje permitido|Limit bagażu')],
  asideHead: 'Travel help|Допомога в подорожі|Reisehilfe|Ayuda de viaje|Pomoc w podróży',
  aside: ['Entry requirements|Умови в’їзду|Einreisebestimmungen|Requisitos de entrada|Wymogi wjazdowe', 'Airport guides|Путівники аеропортами|Flughafeninfos|Guías de aeropuertos|Przewodniki po lotniskach', 'Travel insurance|Страхування подорожей|Reiseversicherung|Seguro de viaje|Ubezpieczenie podróżne'] });

T({ id: 'gov', kind: 'government-style service portal', brand: 'Civic Services Portal', theme: ['#ffffff', '#0b0c0c', '#1d70b8', 'Arial, sans-serif'], layout: 'none',
  nav: ['Benefits|Виплати|Leistungen|Prestaciones|Świadczenia', 'Tax|Податки|Steuern|Impuestos|Podatki', 'Vehicles|Транспорт|Fahrzeuge|Vehículos|Pojazdy', 'Your applications|Ваші заяви|Ihre Anträge|Tus solicitudes|Twoje wnioski'],
  h1: 'Your service account|Ваш обліковий запис послуг|Ihr Servicekonto|Tu cuenta de servicios|Twoje konto usług',
  intro: 'Application 2026-0918-44 is being reviewed. Most decisions are sent within 20 working days.|Заява 2026-0918-44 на розгляді. Більшість рішень надсилаємо протягом 20 робочих днів.|Antrag 2026-0918-44 wird geprüft. Die meisten Bescheide kommen innerhalb von 20 Arbeitstagen.|La solicitud 2026-0918-44 está en revisión. La mayoría se resuelve en 20 días hábiles.|Wniosek 2026-0918-44 jest rozpatrywany. Większość decyzji wysyłamy w ciągu 20 dni roboczych.',
  fillHead: 'Documents|Документи|Dokumente|Documentos|Dokumenty',
  fillCopy: 'Upload scans in PDF or JPG, up to 10 MB each.|Завантажуйте скани у PDF або JPG, до 10 МБ кожен.|Scans als PDF oder JPG hochladen, je bis 10 MB.|Sube escaneos en PDF o JPG, hasta 10 MB cada uno.|Prześlij skany w PDF lub JPG, do 10 MB każdy.',
  fill: [C('link', 'View submitted documents|Переглянути подані документи|Eingereichte Dokumente ansehen|Ver documentos enviados|Zobacz złożone dokumenty'), C('link', 'Check processing times|Перевірити терміни розгляду|Bearbeitungszeiten prüfen|Consultar plazos|Sprawdź terminy rozpatrzenia')],
  asideHead: 'Related services|Пов’язані послуги|Verwandte Dienste|Servicios relacionados|Powiązane usługi',
  aside: ['Report a change of address|Повідомити про зміну адреси|Adressänderung melden|Comunicar cambio de domicilio|Zgłoś zmianę adresu', 'Request a copy of a certificate|Замовити копію довідки|Kopie einer Bescheinigung anfordern|Pedir copia de un certificado|Zamów kopię zaświadczenia', 'Contact an adviser|Зв’язатися з консультантом|Beratung kontaktieren|Contactar con un asesor|Skontaktuj się z doradcą'] });

T({ id: 'forum', kind: 'community forum, member profile', brand: 'Kettlewick Forums', theme: ['#f4f1ea', '#2b2b2b', '#6b4f2a', 'Tahoma, sans-serif'], layout: 'right',
  nav: ['Latest|Нові|Neueste|Recientes|Najnowsze', 'Categories|Категорії|Kategorien|Categorías|Kategorie', 'Members|Учасники|Mitglieder|Miembros|Członkowie', 'Rules|Правила|Regeln|Normas|Zasady'],
  h1: 'Profile and preferences|Профіль і вподобання|Profil und Einstellungen|Perfil y preferencias|Profil i preferencje',
  intro: 'Member since 2019, 412 posts. Your signature shows under every reply.|Учасник з 2019 року, 412 дописів. Ваш підпис видно під кожною відповіддю.|Mitglied seit 2019, 412 Beiträge. Ihre Signatur steht unter jeder Antwort.|Miembro desde 2019, 412 mensajes. Tu firma aparece bajo cada respuesta.|Członek od 2019 r., 412 postów. Twój podpis widać pod każdą odpowiedzią.',
  fillHead: 'Your threads|Ваші теми|Ihre Themen|Tus hilos|Twoje wątki',
  fillCopy: 'Descaling a kettle with citric acid has 38 replies.|Тема про чищення чайника лимонною кислотою має 38 відповідей.|Wasserkocher mit Zitronensäure entkalken hat 38 Antworten.|Descalcificar el hervidor con ácido cítrico tiene 38 respuestas.|Odkamienianie czajnika kwaskiem ma 38 odpowiedzi.',
  fill: [C('link', 'Descaling with citric acid|Чистка лимонною кислотою|Entkalken mit Zitronensäure|Descalcificar con ácido cítrico|Odkamienianie kwaskiem'), C('button', 'Edit signature|Редагувати підпис|Signatur bearbeiten|Editar firma|Edytuj podpis')],
  asideHead: 'Community|Спільнота|Community|Comunidad|Społeczność',
  aside: ['Badges|Значки|Abzeichen|Insignias|Odznaki', 'Moderators|Модератори|Moderatoren|Moderadores|Moderatorzy', 'Meetups|Зустрічі|Treffen|Quedadas|Spotkania'] });

T({ id: 'docs', kind: 'developer documentation and API console', brand: 'Quillmere Docs', theme: ['#fcfcfd', '#1f2328', '#0f766e', 'ui-monospace, monospace'], layout: 'left',
  nav: ['Guides|Посібники|Anleitungen|Guías|Przewodniki', 'API reference|Довідник API|API-Referenz|Referencia de la API|Dokumentacja API', 'SDKs|SDK|SDKs|SDK|SDK', 'Changelog|Журнал змін|Änderungsprotokoll|Registro de cambios|Lista zmian'],
  h1: 'Developer console|Консоль розробника|Entwicklerkonsole|Consola de desarrollo|Konsola dewelopera',
  intro: 'Requests today: 18,204 of 50,000. Rate limits reset at midnight UTC; webhooks retry five times.|Запитів сьогодні: 18 204 з 50 000. Ліміти скидаються опівночі UTC; вебхуки повторюються п’ять разів.|Anfragen heute: 18.204 von 50.000. Limits werden um Mitternacht UTC zurückgesetzt; Webhooks wiederholen fünfmal.|Peticiones hoy: 18.204 de 50.000. Los límites se reinician a medianoche UTC; los webhooks reintentan cinco veces.|Żądania dziś: 18 204 z 50 000. Limity zerują się o północy UTC; webhooki ponawiają pięć razy.',
  fillHead: 'Quick start|Швидкий старт|Schnellstart|Inicio rápido|Szybki start',
  fillCopy: 'Install the client, set the token as an environment variable and call the ping endpoint.|Встановіть клієнт, задайте токен як змінну середовища і викличте ping.|Client installieren, Token als Umgebungsvariable setzen und den Ping-Endpunkt aufrufen.|Instala el cliente, define el token como variable de entorno y llama a ping.|Zainstaluj klienta, ustaw token jako zmienną środowiskową i wywołaj ping.',
  fill: [C('link', 'Authentication guide|Посібник з автентифікації|Leitfaden Authentifizierung|Guía de autenticación|Przewodnik uwierzytelniania'), C('button', 'Copy example request|Копіювати приклад запиту|Beispielanfrage kopieren|Copiar petición de ejemplo|Kopiuj przykładowe żądanie')],
  asideHead: 'On this page|На цій сторінці|Auf dieser Seite|En esta página|Na tej stronie',
  aside: ['Pagination|Пагінація|Paginierung|Paginación|Paginacja', 'Errors|Помилки|Fehler|Errores|Błędy', 'Webhooks|Вебхуки|Webhooks|Webhooks|Webhooki'] });

T({ id: 'admin', kind: 'admin panel, user table', brand: 'Backroom Admin', theme: ['#f7f7f8', '#1c1917', '#a16207', 'Segoe UI, sans-serif'], layout: 'left',
  nav: ['Dashboard|Панель|Dashboard|Panel|Pulpit', 'Users|Користувачі|Benutzer|Usuarios|Użytkownicy', 'Roles|Ролі|Rollen|Roles|Role', 'Reports|Звіти|Berichte|Informes|Raporty'],
  h1: 'User administration|Адміністрування користувачів|Benutzerverwaltung|Administración de usuarios|Administracja użytkownikami',
  intro: '238 active users, 6 pending invitations. Bulk changes are written to the audit log with your name.|238 активних користувачів, 6 запрошень очікують. Масові зміни записуються в журнал аудиту з вашим ім’ям.|238 aktive Benutzer, 6 offene Einladungen. Massenänderungen landen mit Ihrem Namen im Prüfprotokoll.|238 usuarios activos, 6 invitaciones pendientes. Los cambios masivos quedan en el registro con tu nombre.|238 aktywnych użytkowników, 6 oczekujących zaproszeń. Zmiany zbiorcze trafiają do dziennika z Twoim nazwiskiem.',
  fillHead: 'Filters|Фільтри|Filter|Filtros|Filtry',
  fillCopy: 'Showing users active in the last 90 days, sorted by last sign-in.|Показано користувачів, активних за 90 днів, за датою останнього входу.|Benutzer der letzten 90 Tage, sortiert nach letzter Anmeldung.|Usuarios activos en 90 días, por último acceso.|Użytkownicy aktywni w ostatnich 90 dniach, wg ostatniego logowania.',
  fill: [C('button', 'Export user list|Експортувати список|Benutzerliste exportieren|Exportar lista de usuarios|Eksportuj listę użytkowników'), C('link', 'Clear filters|Скинути фільтри|Filter zurücksetzen|Quitar filtros|Wyczyść filtry')],
  asideHead: 'Administration|Адміністрування|Verwaltung|Administración|Administracja',
  aside: ['Groups|Групи|Gruppen|Grupos|Grupy', 'Single sign-on|Єдиний вхід|Single Sign-on|Inicio de sesión único|Logowanie jednokrotne', 'Retention rules|Правила зберігання|Aufbewahrungsregeln|Reglas de retención|Zasady przechowywania'] });

T({ id: 'mail', kind: 'web mail client', brand: 'Postbridge Mail', theme: ['#f6f8fc', '#1f1f1f', '#2563eb', 'Helvetica, Arial, sans-serif'], layout: 'left',
  nav: ['Inbox|Вхідні|Posteingang|Bandeja de entrada|Odebrane', 'Sent|Надіслані|Gesendet|Enviados|Wysłane', 'Drafts|Чернетки|Entwürfe|Borradores|Wersje robocze', 'Archive|Архів|Archiv|Archivo|Archiwum'],
  h1: 'Mail settings|Налаштування пошти|E-Mail-Einstellungen|Ajustes del correo|Ustawienia poczty',
  intro: 'Storage used: 3.1 GB of 15 GB. Messages in Trash are removed after 30 days.|Використано 3,1 ГБ з 15 ГБ. Листи з кошика видаляються через 30 днів.|Speicher: 3,1 GB von 15 GB. Papierkorb wird nach 30 Tagen geleert.|Almacenamiento: 3,1 GB de 15 GB. La papelera se vacía a los 30 días.|Zajęte miejsce: 3,1 GB z 15 GB. Kosz opróżniamy po 30 dniach.',
  fillHead: 'Signature|Підпис|Signatur|Firma|Podpis',
  fillCopy: 'Your signature is added to new messages, not to replies.|Підпис додається до нових листів, не до відповідей.|Die Signatur steht unter neuen Nachrichten, nicht unter Antworten.|La firma se añade a mensajes nuevos, no a respuestas.|Podpis dodajemy do nowych wiadomości, nie do odpowiedzi.',
  fill: [C('button', 'Edit signature|Змінити підпис|Signatur ändern|Editar firma|Zmień podpis'), C('link', 'Keyboard shortcuts|Гарячі клавіші|Tastenkürzel|Atajos de teclado|Skróty klawiszowe')],
  asideHead: 'Labels|Мітки|Labels|Etiquetas|Etykiety',
  aside: ['Receipts|Квитанції|Belege|Recibos|Rachunki', 'Family|Родина|Familie|Familia|Rodzina', 'Travel|Подорожі|Reisen|Viajes|Podróże'] });

T({ id: 'health', kind: 'patient portal of a clinic', brand: 'Meadowgate Clinic', theme: ['#f5fbf8', '#12261e', '#0f766e', 'Trebuchet MS, sans-serif'], layout: 'right',
  nav: ['Appointments|Прийоми|Termine|Citas|Wizyty', 'Test results|Результати аналізів|Befunde|Resultados|Wyniki badań', 'Prescriptions|Рецепти|Rezepte|Recetas|Recepty', 'Messages|Повідомлення|Nachrichten|Mensajes|Wiadomości'],
  h1: 'Patient portal|Кабінет пацієнта|Patientenportal|Portal del paciente|Portal pacjenta',
  intro: 'Next appointment: Thursday 09:30, general check-up, room 2.14. Bring your insurance card.|Наступний прийом: четвер 09:30, загальний огляд, кабінет 2.14. Візьміть страховий поліс.|Nächster Termin: Donnerstag 09:30, Check-up, Raum 2.14. Bitte Versichertenkarte mitbringen.|Próxima cita: jueves 09:30, revisión general, sala 2.14. Trae tu tarjeta sanitaria.|Następna wizyta: czwartek 09:30, badanie ogólne, gabinet 2.14. Zabierz kartę ubezpieczenia.',
  fillHead: 'Upcoming|Найближче|Demnächst|Próximamente|Nadchodzące',
  fillCopy: 'Blood test results from 2 October are ready to view.|Результати аналізу крові від 2 жовтня готові.|Blutwerte vom 2. Oktober liegen vor.|Los resultados del análisis del 2 de octubre están listos.|Wyniki badania krwi z 2 października są gotowe.',
  fill: [C('link', 'Directions to the clinic|Як дістатися до клініки|Anfahrt zur Praxis|Cómo llegar a la clínica|Dojazd do przychodni'), C('link', 'Opening hours|Години роботи|Öffnungszeiten|Horario|Godziny otwarcia')],
  asideHead: 'Your care team|Ваша команда лікарів|Ihr Behandlungsteam|Tu equipo médico|Twój zespół opieki',
  aside: ['Find a doctor|Знайти лікаря|Arzt finden|Buscar médico|Znajdź lekarza', 'Vaccinations|Щеплення|Impfungen|Vacunas|Szczepienia', 'Patient rights|Права пацієнта|Patientenrechte|Derechos del paciente|Prawa pacjenta'] });

T({ id: 'stream', kind: 'video streaming subscription', brand: 'Reelhaven', theme: ['#101014', '#f4f4f5', '#e11d48', 'Helvetica, Arial, sans-serif'], layout: 'none',
  nav: ['Home|Головна|Start|Inicio|Start', 'Series|Серіали|Serien|Series|Seriale', 'Films|Фільми|Filme|Películas|Filmy', 'My list|Мій список|Meine Liste|Mi lista|Moja lista'],
  h1: 'Account and viewing|Акаунт і перегляд|Konto und Wiedergabe|Cuenta y reproducción|Konto i oglądanie',
  intro: 'Standard plan, two screens at once, renews on 3 November. Downloads are kept for 48 hours offline.|Стандартний план, два екрани одночасно, поновлення 3 листопада. Завантаження зберігаються 48 годин.|Standard-Abo, zwei Bildschirme gleichzeitig, Verlängerung am 3. November. Downloads bleiben 48 Stunden.|Plan estándar, dos pantallas a la vez, se renueva el 3 de noviembre. Las descargas duran 48 horas.|Plan standard, dwa ekrany naraz, odnowienie 3 listopada. Pobrane pliki działają 48 godzin.',
  fillHead: 'Continue watching|Продовжити перегляд|Weiterschauen|Seguir viendo|Oglądaj dalej',
  fillCopy: 'Season 2, episode 5 of The Lantern Keepers, 23 minutes left.|Сезон 2, серія 5 «Хоронителів ліхтарів», лишилося 23 хвилини.|Staffel 2, Folge 5 von Die Laternenwächter, noch 23 Minuten.|Temporada 2, episodio 5 de Los guardianes del farol, quedan 23 minutos.|Sezon 2, odcinek 5 Strażników latarni, zostało 23 minuty.',
  fill: [C('link', 'Resume episode 5|Продовжити серію 5|Folge 5 fortsetzen|Reanudar episodio 5|Wznów odcinek 5'), C('link', 'Viewing history|Історія переглядів|Wiedergabeverlauf|Historial de visionado|Historia oglądania')],
  asideHead: 'Profiles|Профілі|Profile|Perfiles|Profile',
  aside: ['Mira|Міра|Mira|Mira|Mira', 'Kids|Діти|Kinder|Niños|Dzieci', 'Guest|Гість|Gast|Invitado|Gość'] });

T({ id: 'cloud', kind: 'cloud file storage', brand: 'Driftbox', theme: ['#fafafa', '#202124', '#0b57d0', 'Roboto, Arial, sans-serif'], layout: 'left',
  nav: ['My files|Мої файли|Meine Dateien|Mis archivos|Moje pliki', 'Shared|Спільні|Geteilt|Compartidos|Udostępnione', 'Recent|Нещодавні|Zuletzt|Recientes|Ostatnie', 'Trash|Кошик|Papierkorb|Papelera|Kosz'],
  h1: 'Storage and sharing|Сховище і доступ|Speicher und Freigaben|Almacenamiento y uso compartido|Miejsce i udostępnianie',
  intro: '41.7 GB used of 100 GB. Version history keeps 30 days of changes for every file.|Використано 41,7 ГБ зі 100 ГБ. Історія версій зберігає зміни за 30 днів.|41,7 GB von 100 GB belegt. Der Versionsverlauf speichert 30 Tage.|41,7 GB de 100 GB usados. El historial guarda 30 días de cambios.|Zajęte 41,7 GB ze 100 GB. Historia wersji obejmuje 30 dni.',
  fillHead: 'Recent files|Нещодавні файли|Zuletzt geöffnet|Archivos recientes|Ostatnie pliki',
  fillCopy: 'budget-2027.xlsx was edited 2 hours ago.|budget-2027.xlsx змінено 2 години тому.|budget-2027.xlsx wurde vor 2 Stunden bearbeitet.|budget-2027.xlsx se editó hace 2 horas.|budget-2027.xlsx edytowano 2 godziny temu.',
  fill: [C('link', 'Open budget-2027.xlsx|Відкрити budget-2027.xlsx|budget-2027.xlsx öffnen|Abrir budget-2027.xlsx|Otwórz budget-2027.xlsx'), C('button', 'Upload files|Завантажити файли|Dateien hochladen|Subir archivos|Prześlij pliki')],
  asideHead: 'Storage|Сховище|Speicher|Almacenamiento|Miejsce',
  aside: ['Large files|Великі файли|Große Dateien|Archivos grandes|Duże pliki', 'Devices|Пристрої|Geräte|Dispositivos|Urządzenia', 'Get more space|Отримати більше місця|Mehr Speicher|Más espacio|Więcej miejsca'] });

T({ id: 'social', kind: 'social network, privacy settings', brand: 'Chatterwell', theme: ['#f0f2f5', '#1c1e21', '#7c3aed', 'Verdana, sans-serif'], layout: 'right',
  nav: ['Feed|Стрічка|Feed|Inicio|Aktualności', 'Friends|Друзі|Freunde|Amigos|Znajomi', 'Groups|Групи|Gruppen|Grupos|Grupy', 'Events|Події|Veranstaltungen|Eventos|Wydarzenia'],
  h1: 'Settings and privacy|Налаштування і приватність|Einstellungen und Privatsphäre|Ajustes y privacidad|Ustawienia i prywatność',
  intro: 'Your posts are visible to friends. 3 people asked to follow you this week.|Ваші дописи бачать друзі. Цього тижня 3 людини попросили підписатися.|Ihre Beiträge sehen Freunde. Diese Woche wollten Ihnen 3 Personen folgen.|Tus publicaciones las ven tus amigos. Esta semana 3 personas pidieron seguirte.|Twoje posty widzą znajomi. W tym tygodniu 3 osoby chciały Cię obserwować.',
  fillHead: 'Profile|Профіль|Profil|Perfil|Profil',
  fillCopy: 'Your cover photo was updated in August.|Обкладинку оновлено в серпні.|Ihr Titelbild wurde im August geändert.|Tu foto de portada se cambió en agosto.|Zdjęcie w tle zmieniono w sierpniu.',
  fill: [C('button', 'Change cover photo|Змінити обкладинку|Titelbild ändern|Cambiar foto de portada|Zmień zdjęcie w tle'), C('link', 'View as a visitor|Переглянути як гість|Als Besucher ansehen|Ver como visitante|Zobacz jako gość')],
  asideHead: 'Shortcuts|Ярлики|Verknüpfungen|Accesos directos|Skróty',
  aside: ['Saved posts|Збережені дописи|Gespeicherte Beiträge|Publicaciones guardadas|Zapisane posty', 'Memories|Спогади|Erinnerungen|Recuerdos|Wspomnienia', 'Pages you follow|Сторінки, за якими ви стежите|Seiten, denen Sie folgen|Páginas que sigues|Obserwowane strony'] });

T({ id: 'telecom', kind: 'mobile operator self-service', brand: 'Ninebar Mobile', theme: ['#fffaf2', '#231f20', '#ea580c', 'Arial, sans-serif'], layout: 'right',
  nav: ['Plans|Тарифи|Tarife|Tarifas|Taryfy', 'Phones|Телефони|Handys|Móviles|Telefony', 'Roaming|Роумінг|Roaming|Roaming|Roaming', 'Support|Підтримка|Hilfe|Soporte|Pomoc'],
  h1: 'My line|Мій номер|Mein Anschluss|Mi línea|Mój numer',
  intro: 'Data left this month: 7.4 GB of 20 GB. Your bill is issued on the 5th of every month.|Залишок трафіку: 7,4 ГБ з 20 ГБ. Рахунок виставляється 5 числа щомісяця.|Datenvolumen übrig: 7,4 GB von 20 GB. Die Rechnung kommt am 5. jedes Monats.|Datos restantes: 7,4 GB de 20 GB. La factura se emite el día 5 de cada mes.|Pozostało danych: 7,4 GB z 20 GB. Rachunek wystawiamy 5. dnia miesiąca.',
  fillHead: 'Usage|Використання|Verbrauch|Consumo|Zużycie',
  fillCopy: 'Calls and texts are unlimited on this plan.|Дзвінки та SMS у цьому тарифі безлімітні.|Anrufe und SMS sind in diesem Tarif unbegrenzt.|Llamadas y SMS ilimitados en esta tarifa.|Rozmowy i SMS-y bez limitu w tej taryfie.',
  fill: [C('link', 'Usage details|Деталі використання|Verbrauchsdetails|Detalle de consumo|Szczegóły zużycia'), C('link', 'Compare plans|Порівняти тарифи|Tarife vergleichen|Comparar tarifas|Porównaj taryfy')],
  asideHead: 'Help|Допомога|Hilfe|Ayuda|Pomoc',
  aside: ['Coverage map|Карта покриття|Netzabdeckung|Mapa de cobertura|Mapa zasięgu', 'Set up eSIM|Налаштувати eSIM|eSIM einrichten|Configurar eSIM|Skonfiguruj eSIM', 'Store finder|Пошук магазинів|Shopsuche|Buscar tienda|Znajdź salon'] });

// ---------- tasks: one intent per risk class, its gold control, two decoys, and a near-twin form ----------
// head/note: the task's own section. gold: the control the intent asks for. decoys: look-alikes that do something
// else. twin: two sections with near-identical headings (a is the one the intent names) that both carry `gold`;
// `decoy` sits next to it in each. gw/dw: English, what each control does (the item's `why`).
const TASKS = [];
const ALL = TEMPLATES.map((t) => t.id);
const K = (t) => TASKS.push({
  ...t, head: L(t.head), note: L(t.note), intent: L(t.intent),
  twin: { ...t.twin, a: L(t.twin.a), b: L(t.twin.b), intent: L(t.twin.intent) },
});

// consent
K({ key: 'c-promo', risk: 'consent', fits: ALL,
  head: 'Marketing preferences|Маркетингові налаштування|Werbeeinstellungen|Preferencias de marketing|Preferencje marketingowe',
  note: 'We send at most two offers a week. Service emails about your account cannot be switched off.|Надсилаємо не більше двох пропозицій на тиждень. Службові листи про акаунт вимкнути не можна.|Höchstens zwei Angebote pro Woche. Service-E-Mails zum Konto lassen sich nicht abschalten.|Enviamos como máximo dos ofertas por semana. Los correos de servicio no se pueden desactivar.|Wysyłamy najwyżej dwie oferty tygodniowo. E-maili serwisowych nie można wyłączyć.',
  gold: C('switch', 'Promotional emails|Рекламні листи|Werbe-E-Mails|Correos promocionales|E-maile promocyjne', true),
  decoys: [C('switch', 'Account and order emails|Листи про акаунт і замовлення|E-Mails zu Konto und Bestellungen|Correos de cuenta y pedidos|E-maile o koncie i zamówieniach', true), C('link', 'How we use your email address|Як ми використовуємо вашу адресу|Wie wir Ihre E-Mail-Adresse nutzen|Cómo usamos tu correo|Jak używamy Twojego adresu e-mail')],
  intent: 'stop getting advertising by email|припинити отримувати рекламу електронною поштою|keine Werbung mehr per E-Mail bekommen|dejar de recibir publicidad por correo|przestać dostawać reklamy mailem',
  gw: 'switches promotional emails off', dw: ['controls service emails about the account and orders, not advertising', 'only explains how the address is used'],
  twin: { a: 'Weekly deals newsletter|Розсилка «Тижневі знижки»|Newsletter Wochenangebote|Boletín de ofertas semanales|Newsletter z cotygodniowymi okazjami',
    b: 'Weekly digest newsletter|Розсилка «Тижневий дайджест»|Newsletter Wochenrückblick|Boletín de resumen semanal|Newsletter z cotygodniowym podsumowaniem',
    gold: C('button', 'Unsubscribe|Відписатися|Abbestellen|Darse de baja|Wypisz się'), decoy: C('link', 'Preview the latest issue|Переглянути останній випуск|Letzte Ausgabe ansehen|Ver el último número|Zobacz ostatnie wydanie'),
    intent: 'stop the weekly deals newsletter|відписатися від розсилки з тижневими знижками|den Newsletter mit den Wochenangeboten abbestellen|darme de baja del boletín de ofertas semanales|wypisać się z newslettera z cotygodniowymi okazjami' } });

K({ key: 'c-partners', risk: 'consent', fits: ALL,
  head: 'Data sharing|Обмін даними|Datenweitergabe|Datos compartidos|Udostępnianie danych',
  note: 'Selected partners may receive usage data to tailor their offers to you.|Обрані партнери можуть отримувати дані про використання, щоб підбирати пропозиції.|Ausgewählte Partner können Nutzungsdaten für passende Angebote erhalten.|Algunos socios pueden recibir datos de uso para adaptar sus ofertas.|Wybrani partnerzy mogą otrzymywać dane o korzystaniu, by dopasować oferty.',
  gold: C('switch', 'Share usage data with partners|Передавати дані партнерам|Nutzungsdaten mit Partnern teilen|Compartir datos de uso con socios|Udostępniaj dane partnerom', true),
  decoys: [C('switch', 'Send crash reports to us|Надсилати нам звіти про збої|Absturzberichte an uns senden|Enviarnos informes de errores|Wysyłaj nam raporty o awariach', true), C('link', 'List of partners|Список партнерів|Liste der Partner|Lista de socios|Lista partnerów')],
  intent: 'stop handing my usage data to outside companies|припинити передавати мої дані стороннім компаніям|meine Nutzungsdaten nicht mehr an fremde Firmen geben|dejar de dar mis datos de uso a otras empresas|przestać przekazywać moje dane innym firmom',
  gw: 'turns off the data passed to partners', dw: ['sends crash reports to the service itself, not to partners', 'only lists the partners'],
  twin: { a: 'Advertising partners|Рекламні партнери|Werbepartner|Socios publicitarios|Partnerzy reklamowi',
    b: 'Analytics partners|Аналітичні партнери|Analysepartner|Socios de analítica|Partnerzy analityczni',
    gold: C('button', 'Withdraw consent|Відкликати згоду|Einwilligung widerrufen|Retirar consentimiento|Wycofaj zgodę'), decoy: C('link', 'Partner details|Про партнерів|Partnerdetails|Detalles de socios|Szczegóły partnerów'),
    intent: 'take back my consent for the advertising partners|відкликати згоду для рекламних партнерів|meine Einwilligung für die Werbepartner zurücknehmen|retirar mi consentimiento a los socios publicitarios|cofnąć zgodę dla partnerów reklamowych' } });

K({ key: 'c-cookies', risk: 'consent', fits: ALL,
  head: 'Cookie settings|Налаштування cookie|Cookie-Einstellungen|Configuración de cookies|Ustawienia plików cookie',
  note: 'Essential cookies keep you signed in. Optional cookies measure visits and personalise offers.|Необхідні cookie тримають вас у системі. Додаткові вимірюють відвідування й персоналізують пропозиції.|Notwendige Cookies halten Sie angemeldet. Optionale messen Besuche und personalisieren Angebote.|Las cookies esenciales mantienen la sesión. Las opcionales miden visitas y personalizan ofertas.|Niezbędne pliki cookie utrzymują logowanie. Opcjonalne mierzą wizyty i personalizują oferty.',
  gold: C('button', 'Reject optional cookies|Відхилити додаткові cookie|Optionale Cookies ablehnen|Rechazar cookies opcionales|Odrzuć opcjonalne pliki cookie'),
  decoys: [C('button', 'Accept all cookies|Прийняти всі cookie|Alle Cookies akzeptieren|Aceptar todas las cookies|Akceptuj wszystkie pliki cookie'), C('link', 'Cookie policy|Політика cookie|Cookie-Richtlinie|Política de cookies|Polityka plików cookie')],
  intent: 'refuse every cookie that is not strictly necessary|відмовитися від усіх cookie, крім суворо необхідних|alle nicht unbedingt nötigen Cookies verweigern|rechazar toda cookie que no sea estrictamente necesaria|odmówić wszystkich plików cookie poza niezbędnymi',
  gw: 'rejects the optional cookies', dw: ['accepts every cookie, the opposite', 'only shows the policy text'],
  twin: { a: 'Analytics cookies|Аналітичні cookie|Analyse-Cookies|Cookies analíticas|Pliki cookie analityczne',
    b: 'Advertising cookies|Рекламні cookie|Werbe-Cookies|Cookies publicitarias|Pliki cookie reklamowe',
    gold: C('switch', 'Allow|Дозволити|Zulassen|Permitir|Zezwalaj', false), decoy: C('link', 'Details|Докладніше|Details|Detalles|Szczegóły'),
    intent: 'let the site measure visits with analytics cookies|дозволити сайту вимірювати відвідування аналітичними cookie|der Seite Analyse-Cookies zur Besuchsmessung erlauben|permitir que el sitio mida visitas con cookies analíticas|pozwolić stronie mierzyć wizyty analitycznymi plikami cookie' } });

K({ key: 'c-terms', risk: 'consent', fits: ALL,
  head: 'Updated terms|Оновлені умови|Neue Bedingungen|Condiciones actualizadas|Zaktualizowany regulamin',
  note: 'Our terms changed on 1 October. You can keep using the service for 30 days while you decide.|Умови змінилися 1 жовтня. Ви можете користуватися сервісом ще 30 днів, поки вирішуєте.|Unsere Bedingungen gelten neu ab 1. Oktober. Sie haben 30 Tage Bedenkzeit.|Las condiciones cambiaron el 1 de octubre. Tienes 30 días para decidir.|Regulamin zmienił się 1 października. Masz 30 dni na decyzję.',
  gold: C('button', 'I agree to the new terms|Я погоджуюся з новими умовами|Ich stimme den neuen Bedingungen zu|Acepto las nuevas condiciones|Akceptuję nowy regulamin'),
  decoys: [C('link', 'Read the new terms|Прочитати нові умови|Neue Bedingungen lesen|Leer las nuevas condiciones|Przeczytaj nowy regulamin'), C('button', 'Remind me later|Нагадати пізніше|Später erinnern|Recordármelo más tarde|Przypomnij później')],
  intent: 'accept the revised terms of service|прийняти оновлені умови користування|die geänderten Nutzungsbedingungen annehmen|aceptar las condiciones de servicio revisadas|zaakceptować zmieniony regulamin',
  gw: 'records agreement to the new terms', dw: ['only opens the text', 'postpones the decision'],
  twin: { a: 'Terms of service, version 4.2|Умови користування, версія 4.2|Nutzungsbedingungen, Version 4.2|Condiciones de servicio, versión 4.2|Regulamin, wersja 4.2',
    b: 'Terms of service, version 4.1|Умови користування, версія 4.1|Nutzungsbedingungen, Version 4.1|Condiciones de servicio, versión 4.1|Regulamin, wersja 4.1',
    gold: C('button', 'Agree|Погодитися|Zustimmen|Aceptar|Zgadzam się'), decoy: C('link', 'What changed|Що змінилося|Was ist neu|Qué ha cambiado|Co się zmieniło'),
    intent: 'agree to version 4.2 of the terms|погодитися з версією 4.2 умов|der Version 4.2 der Bedingungen zustimmen|aceptar la versión 4.2 de las condiciones|zgodzić się na wersję 4.2 regulaminu' } });

K({ key: 'c-location', risk: 'consent', fits: ['shop', 'travel', 'health', 'stream', 'social', 'telecom', 'cloud', 'news'],
  head: 'Location|Геолокація|Standort|Ubicación|Lokalizacja',
  note: 'Precise location finds the nearest pickup point. Approximate location only sets your region.|Точна геолокація знаходить найближчий пункт видачі. Приблизна лише визначає регіон.|Der genaue Standort findet die nächste Abholstelle, der ungefähre nur die Region.|La ubicación precisa encuentra el punto más cercano; la aproximada solo fija la región.|Dokładna lokalizacja znajduje najbliższy punkt; przybliżona ustala tylko region.',
  gold: C('switch', 'Use precise location|Використовувати точну геолокацію|Genauen Standort verwenden|Usar ubicación precisa|Używaj dokładnej lokalizacji', false),
  decoys: [C('switch', 'Use approximate location|Використовувати приблизну геолокацію|Ungefähren Standort verwenden|Usar ubicación aproximada|Używaj przybliżonej lokalizacji', true), C('link', 'Location history|Історія місцезнаходжень|Standortverlauf|Historial de ubicaciones|Historia lokalizacji')],
  intent: 'let the site use my exact position|дозволити сайту бачити моє точне місцеперебування|der Seite meine exakte Position erlauben|dejar que el sitio use mi posición exacta|pozwolić stronie znać moje dokładne położenie',
  gw: 'turns on precise location', dw: ['is approximate location, already on', 'only lists past locations'],
  twin: { a: 'Location on this device|Геолокація на цьому пристрої|Standort auf diesem Gerät|Ubicación en este dispositivo|Lokalizacja na tym urządzeniu',
    b: 'Location on your other devices|Геолокація на інших пристроях|Standort auf Ihren anderen Geräten|Ubicación en tus otros dispositivos|Lokalizacja na innych urządzeniach',
    gold: C('button', 'Turn on|Увімкнути|Einschalten|Activar|Włącz'), decoy: C('link', 'Manage devices|Керувати пристроями|Geräte verwalten|Gestionar dispositivos|Zarządzaj urządzeniami'),
    intent: 'share location from this device only|ділитися геолокацією лише з цього пристрою|den Standort nur von diesem Gerät teilen|compartir la ubicación solo desde este dispositivo|udostępniać lokalizację tylko z tego urządzenia' } });

K({ key: 'c-research', risk: 'consent', fits: ['health', 'gov', 'social', 'saas', 'stream', 'telecom'],
  head: 'Research participation|Участь у дослідженнях|Teilnahme an Forschung|Participación en estudios|Udział w badaniach',
  note: 'Anonymised records help researchers. You can change your choice at any time.|Знеособлені записи допомагають дослідникам. Вибір можна змінити будь-коли.|Anonymisierte Daten helfen der Forschung. Sie können Ihre Wahl jederzeit ändern.|Los datos anonimizados ayudan a investigar. Puedes cambiar de opinión cuando quieras.|Zanonimizowane dane pomagają naukowcom. Decyzję możesz zmienić w każdej chwili.',
  gold: C('checkbox', 'I allow my anonymised data to be used for research|Дозволяю використовувати мої знеособлені дані для досліджень|Ich erlaube die Nutzung meiner anonymisierten Daten für Forschung|Permito usar mis datos anonimizados para investigación|Zezwalam na użycie moich zanonimizowanych danych do badań'),
  decoys: [C('checkbox', 'Send me news about new studies|Надсилати новини про нові дослідження|Mir Neuigkeiten zu Studien senden|Enviarme noticias sobre estudios|Wysyłaj mi informacje o nowych badaniach'), C('link', 'About the research programme|Про дослідницьку програму|Über das Forschungsprogramm|Sobre el programa de investigación|O programie badawczym')],
  intent: 'give permission for my anonymised records to be used in studies|дати дозвіл на використання моїх знеособлених записів у дослідженнях|erlauben, dass meine anonymisierten Daten in Studien genutzt werden|autorizar el uso de mis datos anonimizados en estudios|zgodzić się na wykorzystanie moich zanonimizowanych danych w badaniach',
  gw: 'gives that permission', dw: ['subscribes to news about studies, a different consent', 'only describes the programme'],
  twin: { a: 'Sleep study 2026|Дослідження сну 2026|Schlafstudie 2026|Estudio del sueño 2026|Badanie snu 2026',
    b: 'Sleep study 2025|Дослідження сну 2025|Schlafstudie 2025|Estudio del sueño 2025|Badanie snu 2025',
    gold: C('button', 'Join|Приєднатися|Teilnehmen|Participar|Dołącz'), decoy: C('link', 'Study details|Деталі дослідження|Studiendetails|Detalles del estudio|Szczegóły badania'),
    intent: 'sign up for the 2026 sleep study|записатися на дослідження сну 2026 року|mich für die Schlafstudie 2026 anmelden|apuntarme al estudio del sueño de 2026|zapisać się do badania snu 2026' } });

K({ key: 'c-ads', risk: 'consent', fits: ['news', 'social', 'stream', 'shop', 'mail', 'telecom', 'forum', 'cloud'],
  head: 'Ad preferences|Налаштування реклами|Werbeeinstellungen|Preferencias de anuncios|Preferencje reklam',
  note: 'You will see the same number of ads either way; this only changes how they are chosen.|Кількість реклами не зміниться; змінюється лише спосіб її добору.|Die Zahl der Anzeigen bleibt gleich; nur die Auswahl ändert sich.|Verás los mismos anuncios en número; solo cambia cómo se eligen.|Liczba reklam się nie zmieni; zmienia się tylko sposób ich doboru.',
  gold: C('switch', 'Personalised ads|Персоналізована реклама|Personalisierte Werbung|Anuncios personalizados|Spersonalizowane reklamy', true),
  decoys: [C('button', 'Hide this ad|Приховати цю рекламу|Diese Anzeige ausblenden|Ocultar este anuncio|Ukryj tę reklamę'), C('link', 'Why am I seeing ads?|Чому я бачу рекламу?|Warum sehe ich Werbung?|¿Por qué veo anuncios?|Dlaczego widzę reklamy?')],
  intent: 'stop ads being tailored to what I do on the site|щоб реклама більше не підлаштовувалася під мої дії|Werbung nicht mehr auf mein Verhalten zuschneiden lassen|que los anuncios dejen de basarse en lo que hago|żeby reklamy nie były dopasowane do mojej aktywności',
  gw: 'turns personalised ads off', dw: ['hides one ad and leaves targeting on', 'only explains ads'],
  twin: { a: 'Activity on other websites|Активність на інших сайтах|Aktivität auf anderen Websites|Actividad en otros sitios|Aktywność na innych stronach',
    b: 'Activity on this website|Активність на цьому сайті|Aktivität auf dieser Website|Actividad en este sitio|Aktywność na tej stronie',
    gold: C('switch', 'Use for ads|Використовувати для реклами|Für Werbung nutzen|Usar para anuncios|Używaj do reklam', true), decoy: C('link', 'See examples|Приклади|Beispiele ansehen|Ver ejemplos|Zobacz przykłady'),
    intent: 'stop my browsing on other websites being used for ads|заборонити використовувати для реклами мої дії на інших сайтах|mein Surfen auf anderen Websites nicht mehr für Werbung nutzen|que no usen para anuncios lo que hago en otros sitios|zakazać używania do reklam mojej aktywności na innych stronach' } });

K({ key: 'c-calls', risk: 'consent', fits: ['telecom', 'bank', 'shop', 'travel', 'health', 'stream'],
  head: 'Contact permissions|Дозволи на контакт|Kontakterlaubnis|Permisos de contacto|Zgody na kontakt',
  note: 'We only call about faults or orders unless you say otherwise.|Ми телефонуємо лише щодо збоїв чи замовлень, якщо ви не дозволите інше.|Wir rufen nur wegen Störungen oder Bestellungen an, sofern Sie nichts anderes erlauben.|Solo llamamos por averías o pedidos, salvo que digas lo contrario.|Dzwonimy tylko w sprawie awarii lub zamówień, chyba że zgodzisz się na więcej.',
  gold: C('checkbox', 'You may call me with offers|Можете телефонувати мені з пропозиціями|Sie dürfen mich mit Angeboten anrufen|Podéis llamarme con ofertas|Możecie dzwonić do mnie z ofertami'),
  decoys: [C('checkbox', 'Call me about service faults|Телефонуйте щодо збоїв послуг|Rufen Sie mich bei Störungen an|Llamadme por averías|Dzwońcie w sprawie awarii'), C('link', 'Change phone number|Змінити номер телефону|Telefonnummer ändern|Cambiar número de teléfono|Zmień numer telefonu')],
  intent: 'agree to receive sales calls|погодитися на дзвінки з комерційними пропозиціями|Verkaufsanrufen zustimmen|aceptar recibir llamadas comerciales|zgodzić się na telefony handlowe',
  gw: 'is the permission for sales calls', dw: ['covers fault calls only', 'edits the number, not the permission'],
  twin: { a: 'Number ending 31|Номер, що закінчується на 31|Nummer mit Endung 31|Número acabado en 31|Numer kończący się na 31',
    b: 'Number ending 13|Номер, що закінчується на 13|Nummer mit Endung 13|Número acabado en 13|Numer kończący się na 13',
    gold: C('checkbox', 'Offers by phone|Пропозиції телефоном|Angebote per Telefon|Ofertas por teléfono|Oferty telefonicznie'), decoy: C('link', 'Edit number|Редагувати номер|Nummer bearbeiten|Editar número|Edytuj numer'),
    intent: 'allow offer calls to the number that ends in 31|дозволити дзвінки з пропозиціями на номер, що закінчується на 31|Angebotsanrufe an die Nummer mit Endung 31 erlauben|permitir llamadas con ofertas al número acabado en 31|zezwolić na telefony z ofertami na numer kończący się na 31' } });

// auth
K({ key: 'a-sessions', risk: 'auth', fits: ALL,
  head: 'Where you are signed in|Де ви увійшли|Wo Sie angemeldet sind|Dónde has iniciado sesión|Gdzie jesteś zalogowany',
  note: 'Four devices are signed in. Signing out elsewhere does not end this session.|Увійдено на чотирьох пристроях. Вихід деінде не завершує цей сеанс.|Vier Geräte sind angemeldet. Die Abmeldung anderswo beendet diese Sitzung nicht.|Hay cuatro dispositivos con sesión. Cerrar en otros no cierra esta.|Zalogowano na czterech urządzeniach. Wylogowanie innych nie kończy tej sesji.',
  gold: C('button', 'Sign out of all other devices|Вийти на всіх інших пристроях|Auf allen anderen Geräten abmelden|Cerrar sesión en los demás dispositivos|Wyloguj ze wszystkich innych urządzeń'),
  decoys: [C('button', 'Sign out|Вийти|Abmelden|Cerrar sesión|Wyloguj'), C('link', 'Recent sign-in activity|Нещодавні входи|Letzte Anmeldungen|Actividad de inicio de sesión|Ostatnie logowania')],
  intent: 'end every session except the one I am using now|завершити всі сеанси, крім поточного|alle Sitzungen außer der aktuellen beenden|cerrar todas las sesiones menos la actual|zakończyć wszystkie sesje poza bieżącą',
  gw: 'ends the other sessions and keeps this one', dw: ['ends this session only, the opposite', 'only lists sign-ins'],
  twin: { a: 'Tablet, last active 2 days ago|Планшет, активний 2 дні тому|Tablet, zuletzt aktiv vor 2 Tagen|Tableta, activa hace 2 días|Tablet, aktywny 2 dni temu',
    b: 'Tablet, last active 2 hours ago|Планшет, активний 2 години тому|Tablet, zuletzt aktiv vor 2 Stunden|Tableta, activa hace 2 horas|Tablet, aktywny 2 godziny temu',
    gold: C('button', 'Sign out|Вийти|Abmelden|Cerrar sesión|Wyloguj'), decoy: C('link', 'Rename|Перейменувати|Umbenennen|Renombrar|Zmień nazwę'),
    intent: 'sign out the tablet that was last used two days ago|вийти з планшета, яким востаннє користувалися два дні тому|das Tablet abmelden, das vor zwei Tagen zuletzt aktiv war|cerrar la sesión de la tableta usada hace dos días|wylogować tablet używany ostatnio dwa dni temu' } });

K({ key: 'a-2step', risk: 'auth', fits: ALL,
  head: 'Sign-in security|Безпека входу|Anmeldesicherheit|Seguridad del acceso|Bezpieczeństwo logowania',
  note: 'Your password was last changed 14 months ago. A second step protects you if it leaks.|Пароль востаннє змінено 14 місяців тому. Другий крок захистить, якщо він витече.|Ihr Passwort wurde vor 14 Monaten geändert. Ein zweiter Schritt schützt bei einem Leck.|Cambiaste la contraseña hace 14 meses. Un segundo paso te protege si se filtra.|Hasło zmieniono 14 miesięcy temu. Drugi krok chroni, gdy wycieknie.',
  gold: C('button', 'Turn on two-step verification|Увімкнути двоетапну перевірку|Bestätigung in zwei Schritten aktivieren|Activar la verificación en dos pasos|Włącz weryfikację dwuetapową'),
  decoys: [C('button', 'Change password|Змінити пароль|Passwort ändern|Cambiar contraseña|Zmień hasło'), C('link', 'What is two-step verification?|Що таке двоетапна перевірка?|Was ist die Bestätigung in zwei Schritten?|¿Qué es la verificación en dos pasos?|Czym jest weryfikacja dwuetapowa?')],
  intent: 'require a code from my phone in addition to the password when logging in|вимагати під час входу ще й код із телефона, а не лише пароль|beim Einloggen zusätzlich zum Passwort einen Code vom Handy verlangen|pedir un código del móvil además de la contraseña al entrar|wymagać przy logowaniu kodu z telefonu oprócz hasła',
  gw: 'adds the second sign-in step', dw: ['changes the password only', 'only explains the feature'],
  twin: { a: 'Authenticator app|Застосунок-автентифікатор|Authenticator-App|Aplicación de autenticación|Aplikacja uwierzytelniająca',
    b: 'Codes by text message|Коди в SMS|Codes per SMS|Códigos por SMS|Kody SMS',
    gold: C('button', 'Set up|Налаштувати|Einrichten|Configurar|Skonfiguruj'), decoy: C('link', 'Learn more|Докладніше|Mehr erfahren|Más información|Dowiedz się więcej'),
    intent: 'set up sign-in codes from an authenticator app|налаштувати коди входу із застосунку-автентифікатора|Anmeldecodes über eine Authenticator-App einrichten|configurar códigos de acceso con una app de autenticación|skonfigurować kody logowania z aplikacji uwierzytelniającej' } });

K({ key: 'a-apppass', risk: 'auth', fits: ALL,
  head: 'Password|Пароль|Passwort|Contraseña|Hasło',
  note: 'Use at least 12 characters. Changing it signs out your other devices.|Щонайменше 12 символів. Зміна пароля виконає вихід на інших пристроях.|Mindestens 12 Zeichen. Eine Änderung meldet andere Geräte ab.|Al menos 12 caracteres. Cambiarla cierra la sesión en otros dispositivos.|Co najmniej 12 znaków. Zmiana wyloguje inne urządzenia.',
  gold: C('button', 'Change password|Змінити пароль|Passwort ändern|Cambiar contraseña|Zmień hasło'),
  decoys: [C('button', 'Change username|Змінити ім’я користувача|Benutzernamen ändern|Cambiar nombre de usuario|Zmień nazwę użytkownika'), C('link', 'Password rules|Вимоги до пароля|Passwortregeln|Requisitos de contraseña|Zasady haseł')],
  intent: 'replace my current login secret with a new one|замінити мій теперішній секрет для входу на новий|mein bisheriges Login-Geheimnis durch ein neues ersetzen|sustituir mi clave de acceso actual por una nueva|zastąpić obecny sekret logowania nowym',
  gw: 'changes the password', dw: ['changes the username, not the secret', 'only lists the rules'],
  twin: { a: 'App password: desktop sync|Пароль застосунку: синхронізація ПК|App-Passwort: Desktop-Sync|Contraseña de app: sincronización de escritorio|Hasło aplikacji: synchronizacja komputera',
    b: 'App password: mobile sync|Пароль застосунку: синхронізація телефона|App-Passwort: Mobil-Sync|Contraseña de app: sincronización móvil|Hasło aplikacji: synchronizacja telefonu',
    gold: C('button', 'Regenerate|Створити новий|Neu erzeugen|Regenerar|Wygeneruj ponownie'), decoy: C('link', 'Last used|Востаннє використано|Zuletzt verwendet|Último uso|Ostatnie użycie'),
    intent: 'issue a fresh app password for desktop sync|видати новий пароль застосунку для синхронізації ПК|ein neues App-Passwort für den Desktop-Sync ausstellen|emitir una contraseña de app nueva para el escritorio|wydać nowe hasło aplikacji dla synchronizacji komputera' } });

K({ key: 'a-login', risk: 'auth', fits: ALL,
  head: 'Welcome back|З поверненням|Willkommen zurück|Hola de nuevo|Witaj ponownie',
  note: 'Your session expired after 30 minutes without activity. Your basket is saved.|Сеанс завершився після 30 хвилин бездіяльності. Ваші дані збережено.|Ihre Sitzung ist nach 30 Minuten Inaktivität abgelaufen. Ihre Daten sind gespeichert.|Tu sesión caducó tras 30 minutos sin actividad. Tus datos están guardados.|Sesja wygasła po 30 minutach bezczynności. Twoje dane są zapisane.',
  gold: C('link', 'Log in|Увійти|Anmelden|Iniciar sesión|Zaloguj się'),
  decoys: [C('link', 'Create an account|Створити акаунт|Konto erstellen|Crear una cuenta|Załóż konto'), C('button', 'Continue as guest|Продовжити як гість|Als Gast fortfahren|Continuar como invitado|Kontynuuj jako gość')],
  intent: 'get back into my existing account|повернутися до свого наявного акаунта|wieder in mein bestehendes Konto kommen|volver a entrar en mi cuenta existente|wrócić na moje istniejące konto',
  gw: 'opens sign-in for the existing account', dw: ['makes a new account', 'goes on without an account'],
  twin: { a: 'Business customers|Бізнес-клієнти|Geschäftskunden|Clientes empresa|Klienci biznesowi',
    b: 'Personal customers|Приватні клієнти|Privatkunden|Clientes particulares|Klienci indywidualni',
    gold: C('link', 'Log in|Увійти|Anmelden|Iniciar sesión|Zaloguj się'), decoy: C('link', 'Open an account|Відкрити рахунок|Konto eröffnen|Abrir una cuenta|Otwórz konto'),
    intent: 'sign in as a business customer|увійти як бізнес-клієнт|mich als Geschäftskunde anmelden|entrar como cliente de empresa|zalogować się jako klient biznesowy' } });

K({ key: 'a-passkey', risk: 'auth', fits: ALL,
  head: 'Passkeys|Ключі доступу|Passkeys|Llaves de acceso|Klucze dostępu',
  note: 'A passkey lets you sign in with your fingerprint, face or screen lock instead of a password.|Ключ доступу дозволяє входити відбитком, обличчям чи блокуванням екрана замість пароля.|Mit einem Passkey melden Sie sich per Fingerabdruck, Gesicht oder Displaysperre an.|Una llave de acceso te deja entrar con huella, cara o bloqueo de pantalla.|Klucz dostępu pozwala logować się odciskiem palca, twarzą lub blokadą ekranu.',
  gold: C('button', 'Create a passkey|Створити ключ доступу|Passkey erstellen|Crear una llave de acceso|Utwórz klucz dostępu'),
  decoys: [C('button', 'Add a recovery email|Додати резервну пошту|Wiederherstellungs-E-Mail hinzufügen|Añadir correo de recuperación|Dodaj e-mail odzyskiwania'), C('link', 'Passkey questions|Питання про ключі доступу|Fragen zu Passkeys|Preguntas sobre llaves|Pytania o klucze dostępu')],
  intent: 'make it possible to log in with my fingerprint instead of typing a password|зробити вхід за відбитком пальця замість введення пароля|die Anmeldung per Fingerabdruck statt Passwort einrichten|poder entrar con la huella en vez de escribir la contraseña|umożliwić logowanie odciskiem palca zamiast hasła',
  gw: 'creates a passkey for fingerprint sign-in', dw: ['adds a recovery address, not a sign-in method', 'only answers questions'],
  twin: { a: 'Phone passkey, created in March|Ключ телефона, створений у березні|Handy-Passkey, erstellt im März|Llave del móvil, creada en marzo|Klucz telefonu, utworzony w marcu',
    b: 'Phone passkey, created in May|Ключ телефона, створений у травні|Handy-Passkey, erstellt im Mai|Llave del móvil, creada en mayo|Klucz telefonu, utworzony w maju',
    gold: C('button', 'Remove|Видалити|Entfernen|Quitar|Usuń'), decoy: C('link', 'Rename|Перейменувати|Umbenennen|Renombrar|Zmień nazwę'),
    intent: 'delete the phone passkey made in March|видалити ключ телефона, створений у березні|den im März erstellten Handy-Passkey löschen|borrar la llave del móvil creada en marzo|usunąć klucz telefonu utworzony w marcu' } });

K({ key: 'a-token', risk: 'auth', fits: ['docs', 'saas', 'admin', 'cloud'],
  head: 'Access tokens|Токени доступу|Zugriffstoken|Tokens de acceso|Tokeny dostępu',
  note: 'Token ci-deploy was created 210 days ago and last used yesterday.|Токен ci-deploy створено 210 днів тому, востаннє використано вчора.|Token ci-deploy wurde vor 210 Tagen erstellt, zuletzt gestern genutzt.|El token ci-deploy se creó hace 210 días y se usó ayer.|Token ci-deploy utworzono 210 dni temu, ostatnio użyto wczoraj.',
  gold: C('button', 'Revoke token|Відкликати токен|Token widerrufen|Revocar token|Unieważnij token'),
  decoys: [C('button', 'Copy token ID|Копіювати ID токена|Token-ID kopieren|Copiar ID del token|Kopiuj ID tokenu'), C('link', 'Token scopes|Області дії токенів|Token-Berechtigungen|Ámbitos del token|Zakresy tokenów')],
  intent: 'cut off the ci-deploy credential so it stops working|відключити облікові дані ci-deploy, щоб вони перестали працювати|die Zugangsdaten ci-deploy sperren, damit sie nicht mehr gehen|anular la credencial ci-deploy para que deje de funcionar|odciąć poświadczenie ci-deploy, żeby przestało działać',
  gw: 'revokes the token', dw: ['copies its identifier and leaves it working', 'only documents scopes'],
  twin: { a: 'Token: deploy-ci|Токен: deploy-ci|Token: deploy-ci|Token: deploy-ci|Token: deploy-ci',
    b: 'Token: deploy-cli|Токен: deploy-cli|Token: deploy-cli|Token: deploy-cli|Token: deploy-cli',
    gold: C('button', 'Revoke|Відкликати|Widerrufen|Revocar|Unieważnij'), decoy: C('button', 'Copy ID|Копіювати ID|ID kopieren|Copiar ID|Kopiuj ID'),
    intent: 'revoke the deploy-ci token|відкликати токен deploy-ci|das Token deploy-ci widerrufen|revocar el token deploy-ci|unieważnić token deploy-ci' } });

K({ key: 'a-recovery', risk: 'auth', fits: ['bank', 'mail', 'cloud', 'saas', 'social', 'telecom', 'docs'],
  head: 'Account recovery|Відновлення доступу|Kontowiederherstellung|Recuperación de la cuenta|Odzyskiwanie konta',
  note: 'You have 3 unused backup codes left. Each code works once.|Залишилося 3 невикористані резервні коди. Кожен діє один раз.|Sie haben noch 3 unbenutzte Backup-Codes. Jeder gilt einmal.|Te quedan 3 códigos de respaldo sin usar. Cada uno sirve una vez.|Zostały 3 niewykorzystane kody zapasowe. Każdy działa raz.',
  gold: C('button', 'Generate new backup codes|Створити нові резервні коди|Neue Backup-Codes erzeugen|Generar nuevos códigos de respaldo|Wygeneruj nowe kody zapasowe'),
  decoys: [C('button', 'Download backup codes|Завантажити резервні коди|Backup-Codes herunterladen|Descargar códigos de respaldo|Pobierz kody zapasowe'), C('link', 'Lost your phone?|Загубили телефон?|Handy verloren?|¿Perdiste el móvil?|Zgubiony telefon?')],
  intent: 'replace my recovery codes with a fresh set|замінити мої коди відновлення новим набором|meine Wiederherstellungscodes durch einen neuen Satz ersetzen|sustituir mis códigos de recuperación por otros nuevos|zastąpić moje kody odzyskiwania nowym zestawem',
  gw: 'makes a new set and voids the old one', dw: ['saves the same old codes', 'is a help page for a lost phone'],
  twin: { a: 'Recovery phone ending 45|Резервний номер, що закінчується на 45|Wiederherstellungsnummer mit Endung 45|Teléfono de recuperación acabado en 45|Telefon odzyskiwania kończący się na 45',
    b: 'Recovery phone ending 54|Резервний номер, що закінчується на 54|Wiederherstellungsnummer mit Endung 54|Teléfono de recuperación acabado en 54|Telefon odzyskiwania kończący się na 54',
    gold: C('button', 'Remove|Видалити|Entfernen|Quitar|Usuń'), decoy: C('button', 'Send a test code|Надіслати тестовий код|Testcode senden|Enviar código de prueba|Wyślij kod testowy'),
    intent: 'take off the recovery phone that ends in 45|прибрати резервний номер, що закінчується на 45|die Wiederherstellungsnummer mit Endung 45 entfernen|quitar el teléfono de recuperación acabado en 45|usunąć telefon odzyskiwania kończący się na 45' } });

K({ key: 'a-reset', risk: 'auth', fits: ['admin', 'saas', 'cloud', 'forum', 'docs'],
  head: 'Member access|Доступ учасника|Zugang des Mitglieds|Acceso del miembro|Dostęp członka',
  note: 'User 1042 reported a suspicious sign-in from a new country on Monday.|Користувач 1042 у понеділок повідомив про підозрілий вхід з нової країни.|Benutzer 1042 meldete am Montag eine verdächtige Anmeldung aus einem neuen Land.|El usuario 1042 avisó el lunes de un acceso sospechoso desde otro país.|Użytkownik 1042 zgłosił w poniedziałek podejrzane logowanie z nowego kraju.',
  gold: C('button', 'Require a password reset|Вимагати скидання пароля|Passwort-Reset erzwingen|Exigir restablecer la contraseña|Wymuś reset hasła'),
  decoys: [C('button', 'Resend invitation|Надіслати запрошення ще раз|Einladung erneut senden|Reenviar invitación|Wyślij zaproszenie ponownie'), C('link', 'Sign-in history|Історія входів|Anmeldeverlauf|Historial de accesos|Historia logowań')],
  intent: 'force this member to choose a new password at next login|змусити учасника обрати новий пароль під час наступного входу|das Mitglied zwingen, beim nächsten Login ein neues Passwort zu wählen|obligar al miembro a elegir otra contraseña al entrar|zmusić członka do wybrania nowego hasła przy logowaniu',
  gw: 'forces the reset', dw: ['sends the invitation again', 'only shows the history'],
  twin: { a: 'User 1042 (Editor)|Користувач 1042 (редактор)|Benutzer 1042 (Bearbeiter)|Usuario 1042 (editor)|Użytkownik 1042 (edytor)',
    b: 'User 1024 (Editor)|Користувач 1024 (редактор)|Benutzer 1024 (Bearbeiter)|Usuario 1024 (editor)|Użytkownik 1024 (edytor)',
    gold: C('button', 'Reset password|Скинути пароль|Passwort zurücksetzen|Restablecer contraseña|Resetuj hasło'), decoy: C('button', 'Edit role|Змінити роль|Rolle bearbeiten|Editar rol|Edytuj rolę'),
    intent: 'make user 1042 set a new password|змусити користувача 1042 встановити новий пароль|Benutzer 1042 ein neues Passwort setzen lassen|hacer que el usuario 1042 ponga otra contraseña|zmusić użytkownika 1042 do ustawienia nowego hasła' } });

// money
K({ key: 'm-invoice', risk: 'money', fits: ['saas', 'telecom', 'shop', 'gov', 'health', 'cloud', 'docs', 'stream'],
  head: 'Open invoice|Неоплачений рахунок|Offene Rechnung|Factura pendiente|Nieopłacona faktura',
  note: 'Invoice 2026-0921 for 48.00 is due on 25 October. Card ending 4417 is on file.|Рахунок 2026-0921 на 48,00 треба сплатити до 25 жовтня. Збережено картку з закінченням 4417.|Rechnung 2026-0921 über 48,00 ist am 25. Oktober fällig. Hinterlegt ist die Karte mit Endung 4417.|La factura 2026-0921 de 48,00 vence el 25 de octubre. Tarjeta guardada acabada en 4417.|Faktura 2026-0921 na 48,00 jest płatna do 25 października. Zapisana karta kończy się na 4417.',
  gold: C('button', 'Pay now|Сплатити зараз|Jetzt bezahlen|Pagar ahora|Zapłać teraz'),
  decoys: [C('button', 'Download invoice|Завантажити рахунок|Rechnung herunterladen|Descargar factura|Pobierz fakturę'), C('link', 'Set up automatic payments|Налаштувати автоплатежі|Automatische Zahlung einrichten|Configurar pagos automáticos|Ustaw płatności automatyczne')],
  intent: 'settle the outstanding bill today|погасити неоплачений рахунок сьогодні|die offene Rechnung heute begleichen|liquidar hoy la factura pendiente|uregulować dziś zaległą fakturę',
  gw: 'pays the open invoice', dw: ['only saves the PDF', 'sets up future payments and leaves this bill unpaid'],
  twin: { a: 'Invoice 2026-0921, 48.00|Рахунок 2026-0921, 48,00|Rechnung 2026-0921, 48,00|Factura 2026-0921, 48,00|Faktura 2026-0921, 48,00',
    b: 'Invoice 2026-0912, 48.00|Рахунок 2026-0912, 48,00|Rechnung 2026-0912, 48,00|Factura 2026-0912, 48,00|Faktura 2026-0912, 48,00',
    gold: C('button', 'Pay|Сплатити|Bezahlen|Pagar|Zapłać'), decoy: C('button', 'Download PDF|Завантажити PDF|PDF herunterladen|Descargar PDF|Pobierz PDF'),
    intent: 'pay invoice 2026-0921|сплатити рахунок 2026-0921|Rechnung 2026-0921 bezahlen|pagar la factura 2026-0921|zapłacić fakturę 2026-0921' } });

K({ key: 'm-upgrade', risk: 'money', fits: ['saas', 'stream', 'cloud', 'news', 'mail', 'social', 'docs'],
  head: 'Your plan|Ваш тариф|Ihr Tarif|Tu plan|Twój plan',
  note: 'You are on the free plan. Premium removes limits and is billed today.|У вас безкоштовний тариф. Преміум знімає обмеження, оплата сьогодні.|Sie nutzen den Gratis-Tarif. Premium hebt Limits auf und wird heute berechnet.|Estás en el plan gratuito. Premium quita límites y se cobra hoy.|Masz plan darmowy. Premium znosi limity i jest płatny od dziś.',
  gold: C('button', 'Upgrade to Premium|Перейти на Преміум|Auf Premium upgraden|Pasar a Premium|Przejdź na Premium'),
  decoys: [C('button', 'Start a 14-day trial|Почати 14-денний пробний період|14 Tage testen|Probar 14 días|Rozpocznij 14-dniowy okres próbny'), C('link', 'Compare plans|Порівняти тарифи|Tarife vergleichen|Comparar planes|Porównaj plany')],
  intent: 'move to the paid Premium plan straight away|одразу перейти на платний тариф Преміум|sofort in den bezahlten Premium-Tarif wechseln|cambiar ya al plan Premium de pago|od razu przejść na płatny plan Premium',
  gw: 'buys Premium now', dw: ['starts a trial, not the paid plan now', 'only compares'],
  twin: { a: 'Premium monthly, 12.99|Преміум щомісяця, 12,99|Premium monatlich, 12,99|Premium mensual, 12,99|Premium miesięcznie, 12,99',
    b: 'Premium yearly, 129.90|Преміум щороку, 129,90|Premium jährlich, 129,90|Premium anual, 129,90|Premium rocznie, 129,90',
    gold: C('button', 'Choose|Обрати|Auswählen|Elegir|Wybierz'), decoy: C('link', 'What is included|Що входить|Was enthalten ist|Qué incluye|Co zawiera'),
    intent: 'pick Premium billed every month|обрати Преміум з оплатою щомісяця|Premium mit monatlicher Abrechnung wählen|elegir Premium con pago mensual|wybrać Premium płatne co miesiąc' } });

K({ key: 'm-transfer', risk: 'money', fits: ['bank', 'gov', 'travel', 'health', 'telecom'],
  head: 'Payment ready to send|Платіж готовий до відправлення|Zahlung bereit zum Senden|Pago listo para enviar|Płatność gotowa do wysłania',
  note: '250.00 to account ending 9036, reference HALL-RENT. It arrives within one working day.|250,00 на рахунок із закінченням 9036, призначення HALL-RENT. Надійде протягом робочого дня.|250,00 an Konto mit Endung 9036, Verwendungszweck HALL-RENT. Eingang innerhalb eines Werktags.|250,00 a la cuenta acabada en 9036, concepto HALL-RENT. Llega en un día hábil.|250,00 na rachunek kończący się na 9036, tytuł HALL-RENT. Dotrze w jeden dzień roboczy.',
  gold: C('button', 'Confirm and send|Підтвердити й надіслати|Bestätigen und senden|Confirmar y enviar|Potwierdź i wyślij'),
  decoys: [C('button', 'Save as template|Зберегти як шаблон|Als Vorlage speichern|Guardar como plantilla|Zapisz jako szablon'), C('link', 'Edit payment|Редагувати платіж|Zahlung bearbeiten|Editar pago|Edytuj płatność')],
  intent: 'send the prepared 250.00 payment|відправити підготовлений платіж на 250,00|die vorbereitete Zahlung über 250,00 abschicken|enviar el pago preparado de 250,00|wysłać przygotowaną płatność 250,00',
  gw: 'sends the payment', dw: ['stores it without sending', 'reopens the form'],
  twin: { a: 'Rent instalment due 1 November, 250.00|Внесок за оренду до 1 листопада, 250,00|Mietrate fällig 1. November, 250,00|Cuota de alquiler 1 de noviembre, 250,00|Rata czynszu na 1 listopada, 250,00',
    b: 'Rent instalment due 1 December, 250.00|Внесок за оренду до 1 грудня, 250,00|Mietrate fällig 1. Dezember, 250,00|Cuota de alquiler 1 de diciembre, 250,00|Rata czynszu na 1 grudnia, 250,00',
    gold: C('button', 'Pay now|Сплатити зараз|Jetzt zahlen|Pagar ahora|Zapłać teraz'), decoy: C('button', 'Skip this one|Пропустити цей|Diese überspringen|Saltar esta|Pomiń tę'),
    intent: 'pay the November rent instalment now|сплатити листопадовий внесок за оренду зараз|die Novemberrate der Miete jetzt zahlen|pagar ya la cuota de alquiler de noviembre|zapłacić teraz listopadową ratę czynszu' } });

K({ key: 'm-topup', risk: 'money', fits: ['telecom', 'bank', 'stream', 'travel', 'cloud', 'docs'],
  head: 'Prepaid balance|Передплачений баланс|Guthaben|Saldo prepago|Saldo przedpłacone',
  note: 'Balance 3.40. Services pause when the balance reaches zero.|Баланс 3,40. Послуги зупиняються, коли баланс сягає нуля.|Guthaben 3,40. Dienste pausieren bei null.|Saldo 3,40. Los servicios se pausan al llegar a cero.|Saldo 3,40. Usługi wstrzymujemy przy zerowym saldzie.',
  gold: C('button', 'Top up 20.00|Поповнити на 20,00|20,00 aufladen|Recargar 20,00|Doładuj 20,00'),
  decoys: [C('link', 'Top-up history|Історія поповнень|Aufladeverlauf|Historial de recargas|Historia doładowań'), C('button', 'Set a spending limit|Встановити ліміт витрат|Ausgabelimit festlegen|Fijar un límite de gasto|Ustaw limit wydatków')],
  intent: 'add twenty to my prepaid credit|додати двадцять до мого передплаченого балансу|zwanzig auf mein Guthaben laden|añadir veinte a mi saldo prepago|dodać dwadzieścia do salda przedpłaconego',
  gw: 'charges 20.00 onto the balance', dw: ['only lists past top-ups', 'caps spending and adds nothing'],
  twin: { a: 'Line ending 0732|Номер із закінченням 0732|Anschluss mit Endung 0732|Línea acabada en 0732|Numer kończący się na 0732',
    b: 'Line ending 0723|Номер із закінченням 0723|Anschluss mit Endung 0723|Línea acabada en 0723|Numer kończący się na 0723',
    gold: C('button', 'Top up|Поповнити|Aufladen|Recargar|Doładuj'), decoy: C('link', 'Usage|Використання|Verbrauch|Consumo|Zużycie'),
    intent: 'put credit on the line ending 0732|поповнити номер із закінченням 0732|Guthaben auf den Anschluss mit Endung 0732 laden|recargar la línea acabada en 0732|doładować numer kończący się na 0732' } });

K({ key: 'm-checkout', risk: 'money', fits: ['shop', 'travel', 'health', 'gov', 'stream', 'cloud'],
  head: 'Checkout|Оформлення замовлення|Kasse|Finalizar compra|Kasa',
  note: 'Two items, 64.20 including delivery. Your card is charged when you place the order.|Два товари, 64,20 з доставкою. Картку буде списано після оформлення.|Zwei Artikel, 64,20 inklusive Versand. Die Karte wird bei der Bestellung belastet.|Dos artículos, 64,20 con envío. Se cobra al realizar el pedido.|Dwa produkty, 64,20 z dostawą. Karta zostanie obciążona przy zamówieniu.',
  gold: C('button', 'Place order and pay|Оформити й оплатити|Kaufen und bezahlen|Realizar pedido y pagar|Zamów i zapłać'),
  decoys: [C('button', 'Save basket for later|Зберегти кошик на потім|Warenkorb für später speichern|Guardar la cesta para después|Zapisz koszyk na później'), C('link', 'Apply a voucher|Застосувати ваучер|Gutschein einlösen|Aplicar un cupón|Użyj kuponu')],
  intent: 'complete the purchase of what is in my basket|завершити купівлю того, що в кошику|den Kauf meines Warenkorbs abschließen|completar la compra de lo que hay en la cesta|sfinalizować zakup tego, co mam w koszyku',
  gw: 'places and pays the order', dw: ['keeps the basket without buying', 'only adds a discount code'],
  twin: { a: 'Deliver to home address|Доставка на домашню адресу|Lieferung an Privatadresse|Entrega en casa|Dostawa na adres domowy',
    b: 'Deliver to work address|Доставка на робочу адресу|Lieferung an Arbeitsadresse|Entrega en el trabajo|Dostawa na adres służbowy',
    gold: C('button', 'Buy now|Купити зараз|Jetzt kaufen|Comprar ahora|Kup teraz'), decoy: C('link', 'Change address|Змінити адресу|Adresse ändern|Cambiar dirección|Zmień adres'),
    intent: 'buy it with delivery to my home|купити з доставкою додому|mit Lieferung nach Hause kaufen|comprar con entrega en casa|kupić z dostawą do domu' } });

K({ key: 'm-donate', risk: 'money', fits: ['news', 'forum', 'docs', 'social', 'stream', 'health'],
  head: 'Support our work|Підтримайте нас|Unterstützen Sie uns|Apoya nuestro trabajo|Wesprzyj nas',
  note: 'Readers fund 70% of our budget. Gifts are charged once unless you choose monthly.|Читачі фінансують 70% бюджету. Внесок списується один раз, якщо не обрати щомісячний.|Leser finanzieren 70 % des Budgets. Spenden werden einmalig belastet, außer monatlich.|Los lectores financian el 70 %. Se cobra una vez salvo que elijas mensual.|Czytelnicy finansują 70% budżetu. Wpłata jest jednorazowa, chyba że wybierzesz miesięczną.',
  gold: C('button', 'Give 5.00 once|Внести 5,00 один раз|Einmalig 5,00 geben|Donar 5,00 una vez|Wpłać jednorazowo 5,00'),
  decoys: [C('button', 'Give 5.00 every month|Вносити 5,00 щомісяця|Monatlich 5,00 geben|Donar 5,00 cada mes|Wpłacaj 5,00 co miesiąc'), C('link', 'Where the money goes|Куди йдуть гроші|Wohin das Geld geht|Adónde va el dinero|Na co idą pieniądze')],
  intent: 'make a single five donation, nothing recurring|зробити одноразовий внесок у п’ять, без повторів|einmalig fünf spenden, nichts Wiederkehrendes|hacer una sola donación de cinco, sin repetir|wpłacić jednorazowo pięć, bez powtórzeń',
  gw: 'charges 5.00 once', dw: ['sets up a monthly charge', 'only explains spending'],
  twin: { a: 'Gift to the local news fund|Внесок до фонду місцевих новин|Spende an den Lokalnachrichtenfonds|Donación al fondo de noticias locales|Wpłata na fundusz wiadomości lokalnych',
    b: 'Gift to the local arts fund|Внесок до фонду місцевого мистецтва|Spende an den Lokalkunstfonds|Donación al fondo de artes locales|Wpłata na fundusz sztuki lokalnej',
    gold: C('button', 'Give 10.00|Внести 10,00|10,00 geben|Donar 10,00|Wpłać 10,00'), decoy: C('link', 'Annual report|Річний звіт|Jahresbericht|Informe anual|Raport roczny'),
    intent: 'donate ten to the local news fund|пожертвувати десять до фонду місцевих новин|zehn an den Lokalnachrichtenfonds spenden|donar diez al fondo de noticias locales|przekazać dziesięć na fundusz wiadomości lokalnych' } });

K({ key: 'm-autopay', risk: 'money', fits: ['telecom', 'bank', 'saas', 'stream', 'cloud', 'health', 'gov'],
  head: 'Billing preferences|Налаштування оплати|Zahlungseinstellungen|Preferencias de pago|Preferencje płatności',
  note: 'Your monthly bill is about 19.00. Without automatic payment you pay each bill by hand.|Місячний рахунок близько 19,00. Без автоплатежу ви сплачуєте кожен рахунок вручну.|Ihre Monatsrechnung liegt bei etwa 19,00. Ohne automatische Zahlung zahlen Sie jede selbst.|Tu factura mensual ronda 19,00. Sin pago automático pagas cada una a mano.|Miesięczny rachunek to około 19,00. Bez płatności automatycznej płacisz każdy ręcznie.',
  gold: C('switch', 'Pay bills automatically|Сплачувати рахунки автоматично|Rechnungen automatisch bezahlen|Pagar facturas automáticamente|Opłacaj rachunki automatycznie', false),
  decoys: [C('switch', 'Paperless bills|Електронні рахунки|Papierlose Rechnungen|Facturas sin papel|Rachunki elektroniczne', true), C('link', 'Payment methods|Способи оплати|Zahlungsmethoden|Métodos de pago|Metody płatności')],
  intent: 'have each monthly bill charged to my card without me doing anything|щоб кожен місячний рахунок списувався з картки без моєї участі|jede Monatsrechnung ohne mein Zutun von der Karte abbuchen lassen|que cada factura mensual se cargue a mi tarjeta sin hacer nada|żeby każdy rachunek był pobierany z karty bez mojego udziału',
  gw: 'turns on automatic charging', dw: ['changes how bills are delivered, not how they are paid', 'only lists the cards'],
  twin: { a: 'Card ending 4417|Картка із закінченням 4417|Karte mit Endung 4417|Tarjeta acabada en 4417|Karta kończąca się na 4417',
    b: 'Card ending 4471|Картка із закінченням 4471|Karte mit Endung 4471|Tarjeta acabada en 4471|Karta kończąca się na 4471',
    gold: C('button', 'Use for automatic payments|Використовувати для автоплатежів|Für automatische Zahlungen nutzen|Usar para pagos automáticos|Używaj do płatności automatycznych'), decoy: C('link', 'Card details|Дані картки|Kartendetails|Datos de la tarjeta|Dane karty'),
    intent: 'charge automatic payments to the card ending 4417|списувати автоплатежі з картки із закінченням 4417|automatische Zahlungen von der Karte mit Endung 4417 abbuchen|cargar los pagos automáticos a la tarjeta acabada en 4417|pobierać płatności automatyczne z karty kończącej się na 4417' } });

K({ key: 'm-renew', risk: 'money', fits: ['saas', 'docs', 'cloud', 'admin', 'stream', 'news', 'mail', 'social'],
  head: 'Licence|Ліцензія|Lizenz|Licencia|Licencja',
  note: 'Your licence ends on 30 October. Renewing now charges 89.00 for another year.|Ліцензія закінчується 30 жовтня. Продовження зараз коштує 89,00 за рік.|Ihre Lizenz endet am 30. Oktober. Eine Verlängerung kostet jetzt 89,00 für ein Jahr.|Tu licencia termina el 30 de octubre. Renovar ahora cuesta 89,00 por un año.|Licencja wygasa 30 października. Odnowienie teraz kosztuje 89,00 za rok.',
  gold: C('button', 'Renew for one year|Продовжити на рік|Um ein Jahr verlängern|Renovar un año|Odnów na rok'),
  decoys: [C('switch', 'Renew automatically next time|Наступного разу продовжити автоматично|Nächstes Mal automatisch verlängern|Renovar automáticamente la próxima vez|Następnym razem odnów automatycznie', false), C('link', 'Licence terms|Умови ліцензії|Lizenzbedingungen|Términos de la licencia|Warunki licencji')],
  intent: 'pay today to extend my licence by twelve months|заплатити сьогодні, щоб подовжити ліцензію на дванадцять місяців|heute zahlen, um die Lizenz um zwölf Monate zu verlängern|pagar hoy para ampliar la licencia doce meses|zapłacić dziś za przedłużenie licencji o dwanaście miesięcy',
  gw: 'renews and charges now', dw: ['only changes what happens at the next renewal', 'only shows the terms'],
  twin: { a: 'Team licence, 5 seats|Командна ліцензія, 5 місць|Teamlizenz, 5 Plätze|Licencia de equipo, 5 puestos|Licencja zespołowa, 5 stanowisk',
    b: 'Team licence, 50 seats|Командна ліцензія, 50 місць|Teamlizenz, 50 Plätze|Licencia de equipo, 50 puestos|Licencja zespołowa, 50 stanowisk',
    gold: C('button', 'Renew|Продовжити|Verlängern|Renovar|Odnów'), decoy: C('link', 'Assign seats|Розподілити місця|Plätze zuweisen|Asignar puestos|Przydziel stanowiska'),
    intent: 'renew the five-seat team licence|продовжити командну ліцензію на п’ять місць|die Teamlizenz mit fünf Plätzen verlängern|renovar la licencia de equipo de cinco puestos|odnowić licencję zespołową na pięć stanowisk' } });

// irreversible
K({ key: 'i-account', risk: 'irreversible', fits: ALL,
  head: 'Leave the service|Вихід із сервісу|Dienst verlassen|Dejar el servicio|Rezygnacja z usługi',
  note: 'Deleting removes your history and cannot be undone. Deactivating hides you until you sign in again.|Видалення стирає історію без можливості відновлення. Деактивація приховує вас до наступного входу.|Löschen entfernt Ihren Verlauf endgültig. Deaktivieren blendet Sie bis zur nächsten Anmeldung aus.|Eliminar borra tu historial sin vuelta atrás. Desactivar te oculta hasta que vuelvas a entrar.|Usunięcie kasuje historię bez możliwości cofnięcia. Dezaktywacja ukrywa Cię do następnego logowania.',
  gold: C('button', 'Delete account permanently|Видалити акаунт назавжди|Konto endgültig löschen|Eliminar la cuenta para siempre|Usuń konto na zawsze'),
  decoys: [C('button', 'Deactivate for now|Тимчасово деактивувати|Vorerst deaktivieren|Desactivar por ahora|Dezaktywuj na razie'), C('link', 'Download your data|Завантажити свої дані|Ihre Daten herunterladen|Descargar tus datos|Pobierz swoje dane')],
  intent: 'erase my account for good, with no way back|стерти мій акаунт остаточно, без вороття|mein Konto für immer löschen, ohne Rückweg|borrar mi cuenta para siempre, sin vuelta atrás|skasować konto na dobre, bez odwrotu',
  gw: 'deletes the account for good', dw: ['only hides it until the next sign-in', 'exports data and deletes nothing'],
  twin: { a: 'Profile: Kids|Профіль: Діти|Profil: Kinder|Perfil: Niños|Profil: Dzieci',
    b: 'Profile: Kids TV|Профіль: Дитяче ТБ|Profil: Kinder-TV|Perfil: Niños TV|Profil: Dziecięca TV',
    gold: C('button', 'Delete profile|Видалити профіль|Profil löschen|Eliminar perfil|Usuń profil'), decoy: C('link', 'Edit|Редагувати|Bearbeiten|Editar|Edytuj'),
    intent: 'permanently remove the profile called Kids|остаточно видалити профіль під назвою Діти|das Profil namens Kinder endgültig entfernen|eliminar para siempre el perfil llamado Niños|trwale usunąć profil o nazwie Dzieci' } });

K({ key: 'i-trash', risk: 'irreversible', fits: ['mail', 'cloud', 'admin', 'saas', 'docs', 'social'],
  head: 'Trash|Кошик|Papierkorb|Papelera|Kosz',
  note: '128 items, 2.3 GB. Items in the trash can still be restored until it is emptied.|128 елементів, 2,3 ГБ. Їх ще можна відновити, доки кошик не очищено.|128 Elemente, 2,3 GB. Bis zum Leeren lässt sich alles wiederherstellen.|128 elementos, 2,3 GB. Se pueden restaurar hasta vaciar la papelera.|128 elementów, 2,3 GB. Można je przywrócić, dopóki kosz nie zostanie opróżniony.',
  gold: C('button', 'Empty trash|Очистити кошик|Papierkorb leeren|Vaciar papelera|Opróżnij kosz'),
  decoys: [C('button', 'Restore all|Відновити все|Alles wiederherstellen|Restaurar todo|Przywróć wszystko'), C('link', 'Trash settings|Налаштування кошика|Papierkorb-Einstellungen|Ajustes de la papelera|Ustawienia kosza')],
  intent: 'wipe everything in the bin so it can never be recovered|стерти все з кошика без можливості відновлення|alles im Papierkorb unwiderruflich vernichten|borrar todo lo de la papelera sin poder recuperarlo|wymazać wszystko z kosza bez możliwości odzyskania',
  gw: 'empties it for good', dw: ['brings the items back, the opposite', 'only opens settings'],
  twin: { a: 'Trash of the shared folder|Кошик спільної папки|Papierkorb des geteilten Ordners|Papelera de la carpeta compartida|Kosz folderu udostępnionego',
    b: 'Trash of your own folder|Кошик вашої папки|Papierkorb Ihres eigenen Ordners|Papelera de tu carpeta|Kosz Twojego folderu',
    gold: C('button', 'Empty|Очистити|Leeren|Vaciar|Opróżnij'), decoy: C('button', 'Restore|Відновити|Wiederherstellen|Restaurar|Przywróć'),
    intent: 'empty the trash of the shared folder for good|остаточно очистити кошик спільної папки|den Papierkorb des geteilten Ordners endgültig leeren|vaciar para siempre la papelera de la carpeta compartida|na dobre opróżnić kosz folderu udostępnionego' } });

K({ key: 'i-booking', risk: 'irreversible', fits: ['travel', 'health', 'gov', 'shop', 'telecom'],
  head: 'Cancel or change|Скасування або зміна|Stornieren oder ändern|Cancelar o cambiar|Anuluj lub zmień',
  note: 'This booking is non-refundable. A cancelled booking cannot be restored.|Це бронювання без повернення коштів. Скасоване бронювання не відновити.|Diese Buchung ist nicht erstattbar. Eine Stornierung lässt sich nicht rückgängig machen.|Esta reserva no es reembolsable. Una reserva cancelada no se puede recuperar.|Ta rezerwacja jest bezzwrotna. Anulowanej rezerwacji nie da się przywrócić.',
  gold: C('button', 'Cancel this booking|Скасувати це бронювання|Diese Buchung stornieren|Cancelar esta reserva|Anuluj tę rezerwację'),
  decoys: [C('button', 'Change the date|Змінити дату|Datum ändern|Cambiar la fecha|Zmień datę'), C('link', 'Cancellation policy|Умови скасування|Stornobedingungen|Política de cancelación|Zasady anulowania')],
  intent: 'call off the reservation entirely|повністю відмовитися від бронювання|die Reservierung ganz absagen|anular la reserva por completo|całkowicie odwołać rezerwację',
  gw: 'cancels the booking for good', dw: ['moves it and keeps it', 'only shows the rules'],
  twin: { a: 'Room 1: double with harbour view|Номер 1: двомісний з видом на гавань|Zimmer 1: Doppelzimmer mit Hafenblick|Habitación 1: doble con vistas al puerto|Pokój 1: dwuosobowy z widokiem na port',
    b: 'Room 2: twin with harbour view|Номер 2: дві кровати з видом на гавань|Zimmer 2: Zweibett mit Hafenblick|Habitación 2: dos camas con vistas al puerto|Pokój 2: dwa łóżka z widokiem na port',
    gold: C('button', 'Cancel room|Скасувати номер|Zimmer stornieren|Cancelar habitación|Anuluj pokój'), decoy: C('button', 'Change dates|Змінити дати|Daten ändern|Cambiar fechas|Zmień daty'),
    intent: 'cancel the double room with the harbour view|скасувати двомісний номер з видом на гавань|das Doppelzimmer mit Hafenblick stornieren|cancelar la habitación doble con vistas al puerto|anulować pokój dwuosobowy z widokiem na port' } });

K({ key: 'i-project', risk: 'irreversible', fits: ['saas', 'docs', 'cloud', 'admin'],
  head: 'Danger zone|Небезпечна зона|Gefahrenbereich|Zona de peligro|Strefa zagrożenia',
  note: 'Project atlas holds 312 files and 9 automations. Archived projects can be reopened; deleted ones cannot.|Проєкт atlas містить 312 файлів і 9 автоматизацій. Архівні проєкти можна відкрити знову, видалені ні.|Projekt atlas enthält 312 Dateien und 9 Automationen. Archivierte lassen sich wieder öffnen, gelöschte nicht.|El proyecto atlas tiene 312 archivos y 9 automatizaciones. Lo archivado se puede reabrir; lo eliminado no.|Projekt atlas ma 312 plików i 9 automatyzacji. Zarchiwizowane można przywrócić, usuniętych nie.',
  gold: C('button', 'Delete project|Видалити проєкт|Projekt löschen|Eliminar proyecto|Usuń projekt'),
  decoys: [C('button', 'Archive project|Архівувати проєкт|Projekt archivieren|Archivar proyecto|Zarchiwizuj projekt'), C('link', 'Export project|Експортувати проєкт|Projekt exportieren|Exportar proyecto|Eksportuj projekt')],
  intent: 'destroy the project and all its data for good|знищити проєкт і всі його дані назавжди|das Projekt samt allen Daten endgültig vernichten|destruir el proyecto y todos sus datos para siempre|zniszczyć projekt i wszystkie jego dane na zawsze',
  gw: 'deletes it for good', dw: ['archives it, which can be undone', 'copies it out'],
  twin: { a: 'Project: atlas|Проєкт: atlas|Projekt: atlas|Proyecto: atlas|Projekt: atlas',
    b: 'Project: atlas-staging|Проєкт: atlas-staging|Projekt: atlas-staging|Proyecto: atlas-staging|Projekt: atlas-staging',
    gold: C('button', 'Delete|Видалити|Löschen|Eliminar|Usuń'), decoy: C('button', 'Archive|Архівувати|Archivieren|Archivar|Zarchiwizuj'),
    intent: 'permanently delete project atlas|остаточно видалити проєкт atlas|Projekt atlas endgültig löschen|eliminar definitivamente el proyecto atlas|trwale usunąć projekt atlas' } });

K({ key: 'i-wipe', risk: 'irreversible', fits: ['cloud', 'telecom', 'admin', 'mail'],
  head: 'Lost device|Загублений пристрій|Verlorenes Gerät|Dispositivo perdido|Zgubione urządzenie',
  note: 'Laptop LT-0447 was last seen 3 days ago. Erasing removes all data on it and cannot be undone.|Ноутбук LT-0447 востаннє був онлайн 3 дні тому. Стирання видаляє всі дані без відновлення.|Laptop LT-0447 war vor 3 Tagen zuletzt online. Löschen entfernt alle Daten unwiderruflich.|El portátil LT-0447 se vio hace 3 días. Borrarlo elimina todos sus datos sin vuelta atrás.|Laptop LT-0447 był widziany 3 dni temu. Wymazanie usuwa wszystkie dane bezpowrotnie.',
  gold: C('button', 'Erase device remotely|Віддалено стерти пристрій|Gerät aus der Ferne löschen|Borrar el dispositivo a distancia|Wymaż urządzenie zdalnie'),
  decoys: [C('button', 'Lock device|Заблокувати пристрій|Gerät sperren|Bloquear dispositivo|Zablokuj urządzenie'), C('button', 'Play a sound|Відтворити звук|Ton abspielen|Reproducir un sonido|Odtwórz dźwięk')],
  intent: 'wipe all data from the lost laptop from here|стерти всі дані із загубленого ноутбука звідси|alle Daten auf dem verlorenen Laptop von hier aus vernichten|borrar desde aquí todos los datos del portátil perdido|usunąć stąd wszystkie dane z zgubionego laptopa',
  gw: 'erases the device', dw: ['locks it and keeps the data', 'only rings it'],
  twin: { a: 'Laptop LT-0447|Ноутбук LT-0447|Laptop LT-0447|Portátil LT-0447|Laptop LT-0447',
    b: 'Laptop LT-0474|Ноутбук LT-0474|Laptop LT-0474|Portátil LT-0474|Laptop LT-0474',
    gold: C('button', 'Erase|Стерти|Löschen|Borrar|Wymaż'), decoy: C('button', 'Lock|Заблокувати|Sperren|Bloquear|Zablokuj'),
    intent: 'remotely erase laptop LT-0447|віддалено стерти ноутбук LT-0447|Laptop LT-0447 aus der Ferne löschen|borrar a distancia el portátil LT-0447|zdalnie wymazać laptop LT-0447' } });

K({ key: 'i-withdraw', risk: 'irreversible', fits: ['gov', 'health', 'travel', 'bank'],
  head: 'Your application|Ваша заява|Ihr Antrag|Tu solicitud|Twój wniosek',
  note: 'A withdrawn application is closed for good; you would have to apply again from the start.|Відкликана заява закривається остаточно; доведеться подавати все спочатку.|Ein zurückgezogener Antrag ist endgültig geschlossen; Sie müssten neu beginnen.|Una solicitud retirada se cierra para siempre; habría que empezar de nuevo.|Wycofany wniosek zamykamy na stałe; trzeba by składać go od nowa.',
  gold: C('button', 'Withdraw application|Відкликати заяву|Antrag zurückziehen|Retirar la solicitud|Wycofaj wniosek'),
  decoys: [C('button', 'Save and come back later|Зберегти й повернутися пізніше|Speichern und später fortfahren|Guardar y volver más tarde|Zapisz i wróć później'), C('link', 'Change your answers|Змінити відповіді|Antworten ändern|Cambiar tus respuestas|Zmień odpowiedzi')],
  intent: 'pull my application back so it is never processed|відкликати мою заяву, щоб її не розглядали|meinen Antrag zurücknehmen, damit er nie bearbeitet wird|retirar mi solicitud para que no se tramite|wycofać wniosek, żeby nie był rozpatrywany',
  gw: 'withdraws it for good', dw: ['keeps it as a draft', 'edits it and keeps it'],
  twin: { a: 'Application 2026-0918-44|Заява 2026-0918-44|Antrag 2026-0918-44|Solicitud 2026-0918-44|Wniosek 2026-0918-44',
    b: 'Application 2026-0918-47|Заява 2026-0918-47|Antrag 2026-0918-47|Solicitud 2026-0918-47|Wniosek 2026-0918-47',
    gold: C('button', 'Withdraw|Відкликати|Zurückziehen|Retirar|Wycofaj'), decoy: C('link', 'View|Переглянути|Ansehen|Ver|Zobacz'),
    intent: 'withdraw application 2026-0918-44|відкликати заяву 2026-0918-44|Antrag 2026-0918-44 zurückziehen|retirar la solicitud 2026-0918-44|wycofać wniosek 2026-0918-44' } });

K({ key: 'i-conversation', risk: 'irreversible', fits: ['mail', 'social', 'forum', 'health', 'bank', 'telecom'],
  head: 'Conversation with support|Розмова з підтримкою|Unterhaltung mit dem Support|Conversación con soporte|Rozmowa z pomocą',
  note: '14 messages since 3 October. Archived conversations stay searchable; deleted ones are gone for both sides.|14 повідомлень з 3 жовтня. Архівні розмови можна знайти, видалені зникають для обох сторін.|14 Nachrichten seit 3. Oktober. Archivierte bleiben durchsuchbar, gelöschte sind für beide Seiten weg.|14 mensajes desde el 3 de octubre. Lo archivado se puede buscar; lo eliminado desaparece para ambos.|14 wiadomości od 3 października. Zarchiwizowane można wyszukać, usunięte znikają dla obu stron.',
  gold: C('button', 'Delete conversation|Видалити розмову|Unterhaltung löschen|Eliminar conversación|Usuń rozmowę'),
  decoys: [C('button', 'Archive conversation|Архівувати розмову|Unterhaltung archivieren|Archivar conversación|Zarchiwizuj rozmowę'), C('button', 'Mute notifications|Вимкнути сповіщення|Benachrichtigungen stummschalten|Silenciar avisos|Wycisz powiadomienia')],
  intent: 'get rid of this whole thread forever|позбутися всієї цієї переписки назавжди|diesen ganzen Verlauf für immer loswerden|deshacerme de todo este hilo para siempre|pozbyć się całego tego wątku na zawsze',
  gw: 'deletes it for both sides', dw: ['archives it, still searchable', 'only silences alerts'],
  twin: { a: 'Support chat, 3 October|Чат підтримки, 3 жовтня|Support-Chat, 3. Oktober|Chat de soporte, 3 de octubre|Czat z pomocą, 3 października',
    b: 'Support chat, 30 October|Чат підтримки, 30 жовтня|Support-Chat, 30. Oktober|Chat de soporte, 30 de octubre|Czat z pomocą, 30 października',
    gold: C('button', 'Delete|Видалити|Löschen|Eliminar|Usuń'), decoy: C('button', 'Archive|Архівувати|Archivieren|Archivar|Zarchiwizuj'),
    intent: 'permanently delete the support chat from 3 October|остаточно видалити чат підтримки від 3 жовтня|den Support-Chat vom 3. Oktober endgültig löschen|eliminar para siempre el chat de soporte del 3 de octubre|trwale usunąć czat z pomocą z 3 października' } });

K({ key: 'i-photos', risk: 'irreversible', fits: ['social', 'cloud', 'forum', 'mail'],
  head: 'Your photos|Ваші фото|Ihre Fotos|Tus fotos|Twoje zdjęcia',
  note: '1,204 photos in 18 albums. Hidden photos stay stored; deleted photos cannot be recovered.|1 204 фото у 18 альбомах. Приховані зберігаються, видалені не відновити.|1.204 Fotos in 18 Alben. Ausgeblendete bleiben gespeichert, gelöschte sind weg.|1.204 fotos en 18 álbumes. Las ocultas se guardan; las borradas no se recuperan.|1204 zdjęcia w 18 albumach. Ukryte zostają, usuniętych nie da się odzyskać.',
  gold: C('button', 'Delete all photos|Видалити всі фото|Alle Fotos löschen|Eliminar todas las fotos|Usuń wszystkie zdjęcia'),
  decoys: [C('button', 'Hide all photos|Приховати всі фото|Alle Fotos ausblenden|Ocultar todas las fotos|Ukryj wszystkie zdjęcia'), C('button', 'Download all photos|Завантажити всі фото|Alle Fotos herunterladen|Descargar todas las fotos|Pobierz wszystkie zdjęcia')],
  intent: 'remove every picture I ever uploaded, with no recovery|прибрати кожне завантажене мною зображення без відновлення|jedes je hochgeladene Bild unwiderruflich entfernen|quitar cada imagen que he subido, sin recuperación|usunąć każde wgrane zdjęcie bez możliwości odzyskania',
  gw: 'deletes every photo', dw: ['hides them and keeps them stored', 'copies them out'],
  twin: { a: 'Album: Summer 2025|Альбом: Літо 2025|Album: Sommer 2025|Álbum: Verano 2025|Album: Lato 2025',
    b: 'Album: Summer 2024|Альбом: Літо 2024|Album: Sommer 2024|Álbum: Verano 2024|Album: Lato 2024',
    gold: C('button', 'Delete album|Видалити альбом|Album löschen|Eliminar álbum|Usuń album'), decoy: C('button', 'Share|Поділитися|Teilen|Compartir|Udostępnij'),
    intent: 'erase the Summer 2025 album for good|назавжди стерти альбом Літо 2025|das Album Sommer 2025 endgültig löschen|borrar para siempre el álbum Verano 2025|na zawsze usunąć album Lato 2025' } });

// write
K({ key: 'w-save', risk: 'write', fits: ALL,
  head: 'Edit profile|Редагування профілю|Profil bearbeiten|Editar perfil|Edytuj profil',
  note: 'You changed your display name and phone number. Unsaved changes are lost when you leave.|Ви змінили ім’я та номер телефону. Незбережені зміни зникнуть, коли ви підете.|Sie haben Anzeigename und Telefonnummer geändert. Ungespeichertes geht beim Verlassen verloren.|Cambiaste tu nombre visible y tu teléfono. Lo no guardado se pierde al salir.|Zmieniono nazwę i numer telefonu. Niezapisane zmiany przepadną po wyjściu.',
  gold: C('button', 'Save changes|Зберегти зміни|Änderungen speichern|Guardar cambios|Zapisz zmiany'),
  decoys: [C('button', 'Discard changes|Скасувати зміни|Änderungen verwerfen|Descartar cambios|Odrzuć zmiany'), C('link', 'Preview profile|Попередній перегляд профілю|Profilvorschau|Vista previa del perfil|Podgląd profilu')],
  intent: 'keep the edits I just made to my profile|зберегти щойно внесені правки профілю|die eben gemachten Profiländerungen behalten|conservar los cambios que acabo de hacer en el perfil|zachować zmiany, które właśnie wprowadziłem w profilu',
  gw: 'stores the edits', dw: ['throws them away, the opposite', 'only shows a preview'],
  twin: { a: 'Billing address|Платіжна адреса|Rechnungsadresse|Dirección de facturación|Adres rozliczeniowy',
    b: 'Shipping address|Адреса доставки|Lieferadresse|Dirección de envío|Adres wysyłki',
    gold: C('button', 'Save|Зберегти|Speichern|Guardar|Zapisz'), decoy: C('button', 'Reset|Скинути|Zurücksetzen|Restablecer|Resetuj'),
    intent: 'store the changes to my billing address|зберегти зміни платіжної адреси|die Änderungen an der Rechnungsadresse speichern|guardar los cambios de la dirección de facturación|zapisać zmiany adresu rozliczeniowego' } });

K({ key: 'w-bookmark', risk: 'write', fits: ['news', 'shop', 'forum', 'docs', 'stream', 'travel'],
  head: 'Featured today|Рекомендоване сьогодні|Heute empfohlen|Destacado hoy|Polecane dziś',
  note: 'Long read, 14 minutes: how the night ferries kept the islands supplied through the storm.|Довге читання, 14 хвилин: як нічні пороми постачали острови під час шторму.|Lange Lektüre, 14 Minuten: wie die Nachtfähren die Inseln im Sturm versorgten.|Lectura larga, 14 minutos: cómo los ferris nocturnos abastecieron las islas.|Długi tekst, 14 minut: jak nocne promy zaopatrywały wyspy w czasie sztormu.',
  gold: C('button', 'Save for later|Зберегти на потім|Für später merken|Guardar para después|Zapisz na później'),
  decoys: [C('button', 'Share|Поділитися|Teilen|Compartir|Udostępnij'), C('link', 'Comments (12)|Коментарі (12)|Kommentare (12)|Comentarios (12)|Komentarze (12)')],
  intent: 'bookmark this piece so I can read it another time|додати цей матеріал у закладки, щоб прочитати пізніше|diesen Beitrag merken, um ihn später zu lesen|marcar este texto para leerlo en otro momento|dodać ten tekst do zakładek, żeby przeczytać później',
  gw: 'adds it to the saved list', dw: ['shares it with others', 'opens the comments'],
  twin: { a: 'Guide: setting up webhooks|Посібник: налаштування вебхуків|Leitfaden: Webhooks einrichten|Guía: configurar webhooks|Przewodnik: konfiguracja webhooków',
    b: 'Guide: securing webhooks|Посібник: захист вебхуків|Leitfaden: Webhooks absichern|Guía: proteger webhooks|Przewodnik: zabezpieczanie webhooków',
    gold: C('button', 'Bookmark|У закладки|Merken|Marcar|Zakładka'), decoy: C('link', 'Open|Відкрити|Öffnen|Abrir|Otwórz'),
    intent: 'bookmark the guide about setting up webhooks|додати в закладки посібник про налаштування вебхуків|den Leitfaden zum Einrichten von Webhooks merken|marcar la guía sobre configurar webhooks|dodać do zakładek przewodnik o konfiguracji webhooków' } });

K({ key: 'w-rename', risk: 'write', fits: ['cloud', 'mail', 'saas', 'admin', 'docs'],
  head: 'Folder: Receipts|Папка: Квитанції|Ordner: Belege|Carpeta: Recibos|Folder: Rachunki',
  note: '86 files, shared with nobody. Last change on Sunday.|86 файлів, ні з ким не поділено. Остання зміна в неділю.|86 Dateien, mit niemandem geteilt. Zuletzt am Sonntag geändert.|86 archivos, sin compartir. Último cambio el domingo.|86 plików, nieudostępniony. Ostatnia zmiana w niedzielę.',
  gold: C('button', 'Rename folder|Перейменувати папку|Ordner umbenennen|Renombrar carpeta|Zmień nazwę folderu'),
  decoys: [C('button', 'Duplicate folder|Дублювати папку|Ordner duplizieren|Duplicar carpeta|Duplikuj folder'), C('button', 'Move folder|Перемістити папку|Ordner verschieben|Mover carpeta|Przenieś folder')],
  intent: 'give this folder a different title|дати цій папці іншу назву|diesem Ordner einen anderen Titel geben|ponerle otro título a esta carpeta|nadać temu folderowi inny tytuł',
  gw: 'changes its name', dw: ['makes a copy', 'changes where it lives, not its name'],
  twin: { a: 'Folder: Invoices 2025|Папка: Рахунки 2025|Ordner: Rechnungen 2025|Carpeta: Facturas 2025|Folder: Faktury 2025',
    b: 'Folder: Invoices 2026|Папка: Рахунки 2026|Ordner: Rechnungen 2026|Carpeta: Facturas 2026|Folder: Faktury 2026',
    gold: C('button', 'Rename|Перейменувати|Umbenennen|Renombrar|Zmień nazwę'), decoy: C('button', 'Move|Перемістити|Verschieben|Mover|Przenieś'),
    intent: 'rename the 2025 invoices folder|перейменувати папку з рахунками за 2025|den Rechnungsordner 2025 umbenennen|renombrar la carpeta de facturas de 2025|zmienić nazwę folderu z fakturami za 2025' } });

K({ key: 'w-reply', risk: 'write', fits: ['forum', 'social', 'news', 'docs', 'mail', 'health'],
  head: 'Your reply|Ваша відповідь|Ihre Antwort|Tu respuesta|Twoja odpowiedź',
  note: 'Draft: "Try a 1:20 citric acid mix and rinse twice." Replies are public and show your signature.|Чернетка: «Спробуйте суміш лимонної кислоти 1:20 і промийте двічі». Відповіді публічні.|Entwurf: „Zitronensäure 1:20 mischen und zweimal spülen.“ Antworten sind öffentlich.|Borrador: «Prueba una mezcla de ácido cítrico 1:20 y aclara dos veces». Las respuestas son públicas.|Szkic: „Spróbuj kwasku 1:20 i przepłucz dwa razy.” Odpowiedzi są publiczne.',
  gold: C('button', 'Post reply|Опублікувати відповідь|Antwort veröffentlichen|Publicar respuesta|Opublikuj odpowiedź'),
  decoys: [C('button', 'Save draft|Зберегти чернетку|Entwurf speichern|Guardar borrador|Zapisz szkic'), C('button', 'Preview|Попередній перегляд|Vorschau|Vista previa|Podgląd')],
  intent: 'publish my answer in the thread|опублікувати мою відповідь у темі|meine Antwort im Thema veröffentlichen|publicar mi respuesta en el hilo|opublikować moją odpowiedź w wątku',
  gw: 'publishes the reply', dw: ['keeps it private as a draft', 'only shows how it will look'],
  twin: { a: 'Comment #18|Коментар №18|Kommentar Nr. 18|Comentario n.º 18|Komentarz nr 18',
    b: 'Comment #81|Коментар №81|Kommentar Nr. 81|Comentario n.º 81|Komentarz nr 81',
    gold: C('button', 'Reply|Відповісти|Antworten|Responder|Odpowiedz'), decoy: C('button', 'Quote|Цитувати|Zitieren|Citar|Cytuj'),
    intent: 'answer comment number 18|відповісти на коментар номер 18|auf Kommentar Nummer 18 antworten|responder al comentario número 18|odpowiedzieć na komentarz numer 18' } });

K({ key: 'w-follow', risk: 'write', fits: ALL,
  head: 'Notifications|Сповіщення|Benachrichtigungen|Notificaciones|Powiadomienia',
  note: 'You get a daily summary. Instant alerts are off for everything.|Ви отримуєте щоденний підсумок. Миттєві сповіщення вимкнені.|Sie erhalten eine Tageszusammenfassung. Sofortmeldungen sind aus.|Recibes un resumen diario. Los avisos al instante están desactivados.|Dostajesz dzienne podsumowanie. Natychmiastowe alerty są wyłączone.',
  gold: C('switch', 'Alert me when someone replies to me|Сповіщати, коли мені відповідають|Benachrichtigen, wenn mir jemand antwortet|Avisarme cuando alguien me responda|Powiadamiaj, gdy ktoś mi odpowie', false),
  decoys: [C('switch', 'Alert me about new followers|Сповіщати про нових підписників|Bei neuen Followern benachrichtigen|Avisarme de nuevos seguidores|Powiadamiaj o nowych obserwujących', false), C('link', 'Notification sounds|Звуки сповіщень|Benachrichtigungstöne|Sonidos de aviso|Dźwięki powiadomień')],
  intent: 'get pinged as soon as anyone answers me|отримувати сигнал, щойно хтось мені відповість|sofort Bescheid bekommen, wenn mir jemand antwortet|enterarme en cuanto alguien me conteste|dostać sygnał, gdy tylko ktoś mi odpowie',
  gw: 'turns on reply alerts', dw: ['alerts about followers, not replies', 'only picks sounds'],
  twin: { a: 'Thread: Winter tyres, 2026|Тема: Зимові шини, 2026|Thema: Winterreifen, 2026|Hilo: Neumáticos de invierno, 2026|Wątek: Opony zimowe, 2026',
    b: 'Thread: Winter tyres, 2025|Тема: Зимові шини, 2025|Thema: Winterreifen, 2025|Hilo: Neumáticos de invierno, 2025|Wątek: Opony zimowe, 2025',
    gold: C('button', 'Follow|Стежити|Folgen|Seguir|Obserwuj'), decoy: C('button', 'Copy link|Копіювати посилання|Link kopieren|Copiar enlace|Kopiuj link'),
    intent: 'follow the 2026 winter tyres thread|стежити за темою про зимові шини 2026|dem Thema Winterreifen 2026 folgen|seguir el hilo de neumáticos de invierno de 2026|obserwować wątek o oponach zimowych 2026' } });

K({ key: 'w-contact', risk: 'write', fits: ['mail', 'social', 'forum', 'health', 'bank'],
  head: 'Message from Quernstone Bakery|Лист від Quernstone Bakery|Nachricht von Quernstone Bakery|Mensaje de Quernstone Bakery|Wiadomość od Quernstone Bakery',
  note: 'Your weekly bread order is ready for pickup on Saturday after 8:00.|Ваше щотижневе замовлення хліба можна забрати в суботу після 8:00.|Ihre Brotbestellung liegt ab Samstag 8:00 zur Abholung bereit.|Tu pedido semanal de pan estará listo el sábado desde las 8:00.|Twoje cotygodniowe zamówienie chleba czeka w sobotę od 8:00.',
  gold: C('button', 'Add to contacts|Додати до контактів|Zu Kontakten hinzufügen|Añadir a contactos|Dodaj do kontaktów'),
  decoys: [C('button', 'Block sender|Заблокувати відправника|Absender blockieren|Bloquear remitente|Zablokuj nadawcę'), C('button', 'Reply|Відповісти|Antworten|Responder|Odpowiedz')],
  intent: 'save whoever sent this in my address book|зберегти відправника цього листа в адресній книзі|den Absender in meinem Adressbuch speichern|guardar a quien envió esto en mi agenda|zapisać nadawcę w książce adresowej',
  gw: 'saves the sender as a contact', dw: ['blocks the sender, the opposite', 'starts a reply'],
  twin: { a: 'Sender: Quernstone Bakery|Відправник: Quernstone Bakery|Absender: Quernstone Bakery|Remitente: Quernstone Bakery|Nadawca: Quernstone Bakery',
    b: 'Sender: Quernstone Bakery Deliveries|Відправник: Quernstone Bakery Deliveries|Absender: Quernstone Bakery Deliveries|Remitente: Quernstone Bakery Deliveries|Nadawca: Quernstone Bakery Deliveries',
    gold: C('button', 'Add to contacts|Додати до контактів|Zu Kontakten hinzufügen|Añadir a contactos|Dodaj do kontaktów'), decoy: C('button', 'Block|Заблокувати|Blockieren|Bloquear|Zablokuj'),
    intent: 'add the sender named exactly Quernstone Bakery to my contacts|додати до контактів відправника з назвою саме Quernstone Bakery|den Absender mit genau dem Namen Quernstone Bakery zu den Kontakten hinzufügen|añadir a contactos al remitente llamado exactamente Quernstone Bakery|dodać do kontaktów nadawcę o nazwie dokładnie Quernstone Bakery' } });

// read
K({ key: 'r-receipt', risk: 'read', fits: ['shop', 'bank', 'telecom', 'stream', 'travel', 'health', 'gov', 'saas', 'cloud'],
  head: 'Last payment|Останній платіж|Letzte Zahlung|Último pago|Ostatnia płatność',
  note: '19.00 on 12 October by card ending 4417. Refunds take up to 5 working days.|19,00 від 12 жовтня карткою із закінченням 4417. Повернення до 5 робочих днів.|19,00 am 12. Oktober mit Karte Endung 4417. Erstattungen dauern bis zu 5 Werktage.|19,00 el 12 de octubre con la tarjeta acabada en 4417. Los reembolsos tardan hasta 5 días.|19,00 z 12 października kartą kończącą się na 4417. Zwrot do 5 dni roboczych.',
  gold: C('link', 'View receipt|Переглянути квитанцію|Beleg ansehen|Ver recibo|Zobacz potwierdzenie'),
  decoys: [C('button', 'Email me the receipt|Надіслати квитанцію поштою|Beleg per E-Mail senden|Enviarme el recibo|Wyślij mi potwierdzenie'), C('button', 'Request a refund|Запросити повернення коштів|Erstattung anfordern|Solicitar reembolso|Poproś o zwrot')],
  intent: 'look at the receipt for my most recent payment here on the page|переглянути квитанцію за останній платіж тут, на сторінці|den Beleg der letzten Zahlung hier auf der Seite ansehen|ver aquí en la página el recibo de mi último pago|zobaczyć tutaj na stronie potwierdzenie ostatniej płatności',
  gw: 'opens the receipt', dw: ['sends an email instead of showing it here', 'starts a refund'],
  twin: { a: 'Payment of 12 October, 19.00|Платіж від 12 жовтня, 19,00|Zahlung vom 12. Oktober, 19,00|Pago del 12 de octubre, 19,00|Płatność z 12 października, 19,00',
    b: 'Payment of 21 October, 19.00|Платіж від 21 жовтня, 19,00|Zahlung vom 21. Oktober, 19,00|Pago del 21 de octubre, 19,00|Płatność z 21 października, 19,00',
    gold: C('link', 'Receipt|Квитанція|Beleg|Recibo|Potwierdzenie'), decoy: C('link', 'Report a problem|Повідомити про проблему|Problem melden|Informar de un problema|Zgłoś problem'),
    intent: 'open the receipt of the 12 October payment|відкрити квитанцію платежу від 12 жовтня|den Beleg der Zahlung vom 12. Oktober öffnen|abrir el recibo del pago del 12 de octubre|otworzyć potwierdzenie płatności z 12 października' } });

K({ key: 'r-help', risk: 'read', fits: ALL,
  head: 'Popular questions|Популярні запитання|Häufige Fragen|Preguntas frecuentes|Popularne pytania',
  note: 'Most answers take under two minutes to read.|Більшість відповідей читається менш ніж за дві хвилини.|Die meisten Antworten liest man in unter zwei Minuten.|La mayoría se lee en menos de dos minutos.|Większość odpowiedzi czyta się w mniej niż dwie minuty.',
  gold: C('link', 'How refunds work|Як працює повернення коштів|So funktionieren Erstattungen|Cómo funcionan los reembolsos|Jak działają zwroty pieniędzy'),
  decoys: [C('button', 'Request a refund now|Запросити повернення зараз|Jetzt Erstattung anfordern|Pedir reembolso ahora|Poproś o zwrot teraz'), C('link', 'How returns work|Як працює повернення товарів|So funktionieren Rücksendungen|Cómo funcionan las devoluciones|Jak działają zwroty towarów')],
  intent: 'read an explanation of how money is paid back|прочитати пояснення, як повертають гроші|eine Erklärung lesen, wie Geld zurückgezahlt wird|leer cómo se devuelve el dinero|przeczytać, jak oddawane są pieniądze',
  gw: 'opens the refund article', dw: ['files a refund instead of reading', 'is about sending items back, not money'],
  twin: { a: 'Refunds to a card|Повернення на картку|Erstattung auf eine Karte|Reembolsos a tarjeta|Zwroty na kartę',
    b: 'Refunds to a voucher|Повернення на ваучер|Erstattung als Gutschein|Reembolsos en cupón|Zwroty na kupon',
    gold: C('link', 'Read article|Читати статтю|Artikel lesen|Leer artículo|Czytaj artykuł'), decoy: C('button', 'Rate article|Оцінити статтю|Artikel bewerten|Valorar artículo|Oceń artykuł'),
    intent: 'read the article about refunds to a card|прочитати статтю про повернення на картку|den Artikel über Erstattungen auf eine Karte lesen|leer el artículo sobre reembolsos a tarjeta|przeczytać artykuł o zwrotach na kartę' } });

K({ key: 'r-activity', risk: 'read', fits: ALL.filter((t) => t !== 'saas'),
  head: 'Recent activity|Нещодавня активність|Letzte Aktivität|Actividad reciente|Ostatnia aktywność',
  note: 'Showing the last 5 of 63 events. The full log is kept for a year.|Показано 5 з 63 подій. Повний журнал зберігається рік.|Angezeigt werden 5 von 63 Ereignissen. Das Protokoll bleibt ein Jahr.|Se muestran 5 de 63 eventos. El registro completo se guarda un año.|Pokazano 5 z 63 zdarzeń. Pełny dziennik przechowujemy rok.',
  gold: C('link', 'View all activity|Переглянути всю активність|Alle Aktivitäten ansehen|Ver toda la actividad|Zobacz całą aktywność'),
  decoys: [C('button', 'Clear activity|Очистити активність|Aktivität löschen|Borrar actividad|Wyczyść aktywność'), C('link', 'Activity settings|Налаштування активності|Aktivitätseinstellungen|Ajustes de actividad|Ustawienia aktywności')],
  intent: 'look through the complete log of what happened on my account|переглянути повний журнал подій мого акаунта|das vollständige Protokoll meines Kontos durchsehen|revisar el registro completo de mi cuenta|przejrzeć pełny dziennik zdarzeń konta',
  gw: 'opens the full log', dw: ['deletes the log', 'opens settings, not the log'],
  twin: { a: 'Activity last month|Активність минулого місяця|Aktivität letzten Monat|Actividad del mes pasado|Aktywność w zeszłym miesiącu',
    b: 'Activity this month|Активність цього місяця|Aktivität diesen Monat|Actividad de este mes|Aktywność w tym miesiącu',
    gold: C('link', 'Show all|Показати все|Alle anzeigen|Mostrar todo|Pokaż wszystko'), decoy: C('button', 'Export|Експорт|Exportieren|Exportar|Eksportuj'),
    intent: 'see the full list of last month’s activity|побачити повний список активності за минулий місяць|die vollständige Liste der Aktivität des letzten Monats sehen|ver la lista completa de actividad del mes pasado|zobaczyć pełną listę aktywności z zeszłego miesiąca' } });

K({ key: 'r-prices', risk: 'read', fits: ['shop', 'saas', 'stream', 'travel', 'cloud', 'docs', 'news'],
  head: 'Plans for teams|Тарифи для команд|Tarife für Teams|Planes para equipos|Plany dla zespołów',
  note: 'Prices depend on the number of seats and the billing period.|Ціни залежать від кількості місць і періоду оплати.|Die Preise hängen von Plätzen und Abrechnungszeitraum ab.|Los precios dependen de puestos y periodo de facturación.|Ceny zależą od liczby stanowisk i okresu rozliczeń.',
  gold: C('link', 'See prices|Переглянути ціни|Preise ansehen|Ver precios|Zobacz ceny'),
  decoys: [C('button', 'Buy for my team|Купити для команди|Für mein Team kaufen|Comprar para mi equipo|Kup dla zespołu'), C('button', 'Set a price alert|Налаштувати сповіщення про ціну|Preisalarm setzen|Crear alerta de precio|Ustaw alert cenowy')],
  intent: 'find out what it would cost, without buying anything|дізнатися, скільки це коштуватиме, нічого не купуючи|herausfinden, was es kosten würde, ohne zu kaufen|saber cuánto costaría sin comprar nada|sprawdzić, ile by to kosztowało, nic nie kupując',
  gw: 'shows the prices', dw: ['buys, which the intent rules out', 'subscribes to alerts'],
  twin: { a: 'Basic|Базовий|Basic|Básico|Podstawowy',
    b: 'Basic Plus|Базовий плюс|Basic Plus|Básico Plus|Podstawowy Plus',
    gold: C('link', 'Price details|Деталі ціни|Preisdetails|Detalles del precio|Szczegóły ceny'), decoy: C('button', 'Select|Обрати|Auswählen|Seleccionar|Wybierz'),
    intent: 'check the price details of the plain Basic plan|переглянути деталі ціни звичайного тарифу Базовий|die Preisdetails des einfachen Basic-Tarifs ansehen|consultar el precio del plan Básico normal|sprawdzić szczegóły ceny zwykłego planu Podstawowy' } });

K({ key: 'r-status', risk: 'read', fits: ['gov', 'health', 'telecom', 'admin', 'saas', 'bank', 'travel', 'shop'],
  head: 'Support requests|Звернення до підтримки|Supportanfragen|Solicitudes de soporte|Zgłoszenia do pomocy',
  note: 'Request 5521 about a double charge was opened on Monday.|Звернення 5521 щодо подвійного списання відкрито в понеділок.|Anfrage 5521 zu einer doppelten Abbuchung wurde am Montag eröffnet.|La solicitud 5521 por un cobro doble se abrió el lunes.|Zgłoszenie 5521 w sprawie podwójnego obciążenia otwarto w poniedziałek.',
  gold: C('link', 'Check request status|Перевірити статус звернення|Status der Anfrage prüfen|Consultar el estado|Sprawdź status zgłoszenia'),
  decoys: [C('button', 'Close request|Закрити звернення|Anfrage schließen|Cerrar solicitud|Zamknij zgłoszenie'), C('link', 'Open a new request|Створити нове звернення|Neue Anfrage stellen|Abrir una nueva solicitud|Otwórz nowe zgłoszenie')],
  intent: 'find out how far along my support request is|дізнатися, на якому етапі моє звернення|herausfinden, wie weit meine Supportanfrage ist|saber en qué punto está mi solicitud de soporte|sprawdzić, na jakim etapie jest moje zgłoszenie',
  gw: 'shows where the request stands', dw: ['closes it', 'starts another one'],
  twin: { a: 'Request 5521|Звернення 5521|Anfrage 5521|Solicitud 5521|Zgłoszenie 5521',
    b: 'Request 5512|Звернення 5512|Anfrage 5512|Solicitud 5512|Zgłoszenie 5512',
    gold: C('link', 'Status|Статус|Status|Estado|Status'), decoy: C('button', 'Close|Закрити|Schließen|Cerrar|Zamknij'),
    intent: 'see the progress of request 5521|подивитися перебіг звернення 5521|den Stand von Anfrage 5521 ansehen|ver cómo va la solicitud 5521|zobaczyć postęp zgłoszenia 5521' } });

K({ key: 'r-access', risk: 'read', fits: ['cloud', 'admin', 'docs', 'mail'],
  head: 'Sharing|Спільний доступ|Freigabe|Uso compartido|Udostępnianie',
  note: 'This space is shared with 7 people; 2 of them can edit.|Цим простором поділилися з 7 людьми; 2 з них можуть редагувати.|Dieser Bereich ist mit 7 Personen geteilt; 2 dürfen bearbeiten.|Este espacio se comparte con 7 personas; 2 pueden editar.|Ta przestrzeń jest udostępniona 7 osobom; 2 mogą edytować.',
  gold: C('link', 'See who has access|Хто має доступ|Sehen, wer Zugriff hat|Ver quién tiene acceso|Zobacz, kto ma dostęp'),
  decoys: [C('button', 'Invite people|Запросити людей|Personen einladen|Invitar a personas|Zaproś osoby'), C('button', 'Stop sharing|Припинити доступ|Freigabe beenden|Dejar de compartir|Przestań udostępniać')],
  intent: 'check which people can open this space|перевірити, хто може відкрити цей простір|prüfen, welche Personen diesen Bereich öffnen können|comprobar qué personas pueden abrir este espacio|sprawdzić, kto może otworzyć tę przestrzeń',
  gw: 'lists the people with access', dw: ['adds people', 'removes access'],
  twin: { a: 'Shared drive: Marketing|Спільний диск: Маркетинг|Geteiltes Laufwerk: Marketing|Unidad compartida: Marketing|Dysk współdzielony: Marketing',
    b: 'Shared drive: Marketing archive|Спільний диск: Архів маркетингу|Geteiltes Laufwerk: Marketing-Archiv|Unidad compartida: Archivo de marketing|Dysk współdzielony: Archiwum marketingu',
    gold: C('link', 'Members|Учасники|Mitglieder|Miembros|Członkowie'), decoy: C('button', 'Invite|Запросити|Einladen|Invitar|Zaproś'),
    intent: 'list who can open the Marketing drive, not the archive|показати, хто має доступ до диска Маркетинг, а не до архіву|anzeigen, wer das Laufwerk Marketing öffnen darf, nicht das Archiv|ver quién puede abrir la unidad Marketing, no el archivo|pokazać, kto ma dostęp do dysku Marketing, nie do archiwum' } });

// ---------- composition (protocol 3.5 row N2) ----------
// Per risk class: [condition, gold-candidate items, `none` items].
const BIG = [['decoy', 34, 6], ['near_twin', 33, 7], ['translated', 33, 7]];
const SMALL = [['decoy', 17, 3], ['near_twin', 17, 3], ['translated', 16, 4]];
const CLASSES = [['consent', BIG], ['auth', BIG], ['money', BIG], ['irreversible', BIG], ['write', SMALL], ['read', SMALL]];
// Page languages per condition over the whole set (200 items each). translated: page en with a uk/de/es/pl
// intent, or a uk/de/es/pl page with an English intent.
const SAME_LANG = { en: 120, uk: 20, de: 20, es: 20, pl: 20 };
const TRANSLATED = [['en', 'uk', 10], ['en', 'de', 10], ['en', 'es', 10], ['en', 'pl', 10], ['uk', 'en', 40], ['de', 'en', 40], ['es', 'en', 40], ['pl', 'en', 40]];
const LANG_NAME = { en: 'English', uk: 'Ukrainian', de: 'German', es: 'Spanish', pl: 'Polish' };
const PER_BASE = 4;

function plan() {
  const slots = [];
  for (const [risk, rows] of CLASSES) {
    for (const [condition, nGold, nNone] of rows) {
      for (let i = 0; i < nGold; i += 1) slots.push({ risk, condition, none: false });
      for (let i = 0; i < nNone; i += 1) slots.push({ risk, condition, none: true });
    }
  }
  // languages, condition by condition
  for (const condition of ['decoy', 'near_twin', 'translated']) {
    const mine = shuffle(rngOf(`lang:${condition}`), slots.filter((s) => s.condition === condition));
    const pairs = condition === 'translated'
      ? TRANSLATED.flatMap(([page, intent, n]) => Array.from({ length: n }, () => [page, intent]))
      : Object.entries(SAME_LANG).flatMap(([l, n]) => Array.from({ length: n }, () => [l, l]));
    if (pairs.length !== mine.length) throw new Error(`${condition}: ${mine.length} slots, ${pairs.length} languages`);
    mine.forEach((s, i) => { [s.lang, s.intentLang] = pairs[i]; });
  }
  // bases: per class, shuffled slots in groups of 4, each group one (task, template) pair
  const used = Object.fromEntries(TEMPLATES.map((t) => [t.id, 0]));
  const bases = [];
  for (const [risk] of CLASSES) {
    const rng = rngOf(`base:${risk}`);
    const mine = shuffle(rng, slots.filter((s) => s.risk === risk));
    const tasks = shuffle(rng, TASKS.filter((t) => t.risk === risk));
    const taken = new Set();
    for (let b = 0; b * PER_BASE < mine.length; b += 1) {
      const task = tasks[b % tasks.length];
      const free = shuffle(rng, task.fits.filter((id) => !taken.has(`${task.key}:${id}`)));
      if (free.length === 0) throw new Error(`${task.key}: no template left`);
      free.sort((x, y) => used[x] - used[y]);
      const template = free[0];
      taken.add(`${task.key}:${template}`);
      used[template] += 1;
      const base = { id: `n2-b${String(bases.length + 1).padStart(3, '0')}`, risk, task, template: TEMPLATES.find((t) => t.id === template) };
      bases.push(base);
      for (const s of mine.slice(b * PER_BASE, (b + 1) * PER_BASE)) s.base = base;
    }
  }
  return { slots, bases };
}

// ---------- page rendering ----------
const css = ([bg, fg, accent, font], dark) => `:root{--bg:${bg};--fg:${fg};--ac:${accent};--card:${dark ? '#1c1c22' : '#ffffff'};--line:${dark ? '#33333d' : '#e2e2e6'};--mute:${dark ? '#a1a1aa' : '#5f6368'}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ${font}}
a{color:var(--ac)}header.top{display:flex;flex-wrap:wrap;gap:16px;align-items:center;padding:12px 24px;border-bottom:1px solid var(--line);background:var(--card)}
.brand{font-weight:700;font-size:18px;text-decoration:none;color:var(--fg)}nav{display:flex;gap:14px;flex-wrap:wrap}nav a{text-decoration:none}
.wrap{display:flex;gap:24px;max-width:1080px;margin:0 auto;padding:24px}.wrap.none{flex-direction:column}main{flex:1;min-width:0}
aside{width:220px;flex:none}.wrap.none aside{width:auto}aside ul{list-style:none;padding:0;margin:0}aside li{margin:6px 0}
h1{font-size:26px;margin:0 0 6px}.lede{color:var(--mute);margin:0 0 18px}h2{font-size:18px;margin:0 0 6px}h3{font-size:15px;margin:12px 0 6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:0 0 16px}.card p{margin:0 0 10px;color:var(--mute)}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}button{font:inherit;padding:7px 14px;border-radius:7px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.sw{display:inline-flex;gap:6px;align-items:center}.sw button[aria-checked=true]{border-color:var(--ac)}.st{font-size:12px;color:var(--mute)}.ck{display:flex;gap:8px;align-items:flex-start}
footer{border-top:1px solid var(--line);padding:16px 24px;font-size:13px;color:var(--mute)}footer h2{font-size:14px}footer a{margin-right:14px}`;

// One page under construction: its html parts and the interactive elements in text order (for the v1 preview).
function pageBuilder(rng) {
  const pool = shuffle(rng, Array.from({ length: 90 }, (_, i) => i + 10));
  const p = { els: [], scope: 'root', heads: { root: null, main: null } };
  p.id = () => `c${pool.pop()}`;
  p.heading = (text) => { p.heads[p.scope] = text; };
  p.path = (place) => {
    const h = p.heads[p.scope];
    const parts = place ? [place] : [];
    if (h) parts.push(`heading ${JSON.stringify(h)}`);
    return parts.join(' > ');
  };
  p.ctrl = (ctrl, lang, place) => {
    const id = p.id();
    const name = ctrl.names[lang];
    const role = ctrl.role;
    p.els.push({ id, role, name, path: p.path(place) });
    const href = `#v${Math.floor(rng() * 900) + 100}`;
    if (role === 'link') return { id, html: `<a href="${href}" id="${id}">${esc(name)}</a>` };
    if (role === 'button') return { id, html: `<button type="button" id="${id}">${esc(name)}</button>` };
    if (role === 'switch') {
      const st = ctrl.on ? SHARED.on[lang] : SHARED.off[lang];
      return { id, html: `<span class="sw"><button type="button" role="switch" aria-checked="${ctrl.on ? 'true' : 'false'}" id="${id}">${esc(name)}</button><span class="st" aria-hidden="true">${esc(st)}</span></span>` };
    }
    if (role === 'checkbox') return { id, html: `<label class="ck"><input type="checkbox" id="${id}"> <span>${esc(name)}</span></label>` };
    throw new Error(`role ${role}`);
  };
  return p;
}

// Renders one item's page. Returns { html, els, gold: element | null, why }.
function renderPage(slot, seedLabel) {
  const rng = rngOf(`page:${seedLabel}`);
  const { task, template: tp } = slot.base;
  const lang = slot.lang;
  const p = pageBuilder(rng);
  const t = (x) => x[lang];
  const out = [];
  // header and navigation (root scope, then the navigation place)
  const brandId = p.id();
  p.els.push({ id: brandId, role: 'link', name: tp.brand, path: '' });
  p.scope = 'nav';
  const navLinks = tp.nav.map((n) => p.ctrl({ role: 'link', names: n }, lang, 'navigation').html).join('');
  p.scope = 'root';
  const header = `<header class="top"><a class="brand" href="./" id="${brandId}">${esc(tp.brand)}</a><nav>${navLinks}</nav></header>`;
  const aside = () => {
    p.heading(t(tp.asideHead));
    const links = tp.aside.map((a) => `<li>${p.ctrl({ role: 'link', names: a }, lang, null).html}</li>`).join('');
    return `<aside><h2>${esc(t(tp.asideHead))}</h2><ul>${links}</ul></aside>`;
  };
  if (tp.layout === 'left') out.push(aside());
  // main
  p.scope = 'main';
  const mainParts = [];
  p.heading(t(tp.h1));
  mainParts.push(`<h1>${esc(t(tp.h1))}</h1><p class="lede">${esc(t(tp.intro))}</p>`);
  const filler = () => {
    p.heading(t(tp.fillHead));
    const ctrls = tp.fill.map((c) => p.ctrl(c, lang, 'main').html).join('');
    return `<section class="card"><h2>${esc(t(tp.fillHead))}</h2><p>${esc(t(tp.fillCopy))}</p><div class="row">${ctrls}</div></section>`;
  };
  const fillerFirst = rng() < 0.3;
  if (fillerFirst) mainParts.push(filler());
  let gold = null;
  let why;
  if (slot.condition === 'near_twin') {
    const tw = task.twin;
    const order = rng() < 0.5 ? ['a', 'b'] : ['b', 'a'];
    p.heading(t(task.head));
    const subs = order.map((k) => {
      p.heading(t(tw[k]));
      const ctrls = [];
      if (!(k === 'a' && slot.none)) ctrls.push({ c: tw.gold, isGold: k === 'a' });
      ctrls.push({ c: tw.decoy, isGold: false });
      const html = shuffle(rng, ctrls).map(({ c, isGold }) => {
        const r = p.ctrl(c, lang, 'main');
        if (isGold) gold = p.els[p.els.length - 1];
        return r.html;
      }).join('');
      return `<h3>${esc(t(tw[k]))}</h3><div class="row">${html}</div>`;
    }).join('');
    mainParts.push(`<section class="card"><h2>${esc(t(task.head))}</h2>${subs}</section>`);
    const [ga, gb, gn, dn] = [t(tw.a), t(tw.b), t(tw.gold.names), t(tw.decoy.names)];
    why = slot.none
      ? `The intent names "${ga}", whose section offers only "${dn}"; "${gn}" exists only under "${gb}", the near-twin heading, so no control does it.`
      : `The intent names "${ga}"; "${gn}" under that heading is right, while the same "${gn}" under "${gb}" acts on the near twin and "${dn}" does something else.`;
  } else {
    p.heading(t(task.head));
    const ctrls = task.decoys.map((c, i) => ({ c, i }));
    if (!slot.none) ctrls.push({ c: task.gold, i: -1 });
    const html = shuffle(rng, ctrls).map(({ c, i }) => {
      const r = p.ctrl(c, lang, 'main');
      if (i === -1) gold = p.els[p.els.length - 1];
      return r.html;
    }).join('');
    mainParts.push(`<section class="card"><h2>${esc(t(task.head))}</h2><p>${esc(t(task.note))}</p><div class="row">${html}</div></section>`);
    const [d1, d2] = task.decoys.map((c) => `"${t(c.names)}"`);
    why = slot.none
      ? `No control on the page ${task.gw}: ${d1} ${task.dw[0]}, and ${d2} ${task.dw[1]}.`
      : `"${t(task.gold.names)}" ${task.gw}; ${d1} ${task.dw[0]}, and ${d2} ${task.dw[1]}.`;
    if (slot.condition === 'translated') why += ` The page is in ${LANG_NAME[lang]} and the intent in ${LANG_NAME[slot.intentLang]}.`;
  }
  if (!fillerFirst) mainParts.push(filler());
  out.push(`<main>${mainParts.join('')}</main>`);
  p.scope = 'root';
  if (tp.layout !== 'left') out.push(aside());
  // footer (root scope)
  p.heading(t(SHARED.footHead));
  const foot = SHARED.foot.map((c) => p.ctrl(c, lang, null).html).join('');
  const dark = tp.id === 'stream';
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(t(tp.h1))} · ${esc(tp.brand)}</title><style>${css(tp.theme, dark)}</style></head><body>${header}<div class="wrap ${tp.layout}">${out.join('')}</div><footer><h2>${esc(t(SHARED.footHead))}</h2><p>${foot}</p><p>${esc(t(SHARED.rights))}</p></footer></body></html>\n`;
  return { html, els: p.els, gold, why };
}

// ---------- items ----------
const v1 = (el) => `${el.role} ${JSON.stringify(el.name.normalize('NFKC').replace(/\s+/g, ' ').trim())} in=${JSON.stringify(el.path)}`;

function main() {
  const { slots, bases } = plan();
  const ordered = shuffle(rngOf('order'), slots);
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(join(OUT_DIR, 'pages'), { recursive: true });
  const rows = ordered.map((slot, i) => {
    const n = String(i + 1).padStart(3, '0');
    const id = `n2-${n}`;
    const { task } = slot.base;
    const { html, els, gold, why } = renderPage(slot, id);
    writeFileSync(join(OUT_DIR, 'pages', `${n}.html`), html);
    const intentText = slot.condition === 'near_twin' ? task.twin.intent : task.intent;
    if (!slot.none && gold === null) throw new Error(`${id}: no gold element`);
    return {
      id, page: `pages/${n}.html`, site: 'find', lang: slot.lang, intent_lang: slot.intentLang, source: 'synthetic',
      condition: slot.condition, risk: slot.risk, base: slot.base.id, template: slot.base.template.id, task: task.key,
      within: null,
      input: { intent: intentText[slot.intentLang], lines: els.map(v1) },
      gold: slot.none ? 'none' : { selector: `#${gold.id}`, name: gold.name },
      gold_ref: slot.none ? undefined : { role: gold.role, name: gold.name, ordinal: 1, path: gold.path },
      alt: [],
      danger_eligible: slot.none,
      why,
    };
  });
  writeFileSync(OUT_ITEMS, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const count = (f) => rows.reduce((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  process.stdout.write(`${JSON.stringify({
    items: rows.length, bases: bases.length, templates: Object.keys(count((r) => r.template)).length,
    tasks: Object.keys(count((r) => r.task)).length,
    byRisk: count((r) => `${r.risk}/${r.gold === 'none' ? 'none' : 'cand'}`),
    byCondition: count((r) => `${r.condition}/${r.gold === 'none' ? 'none' : 'cand'}`),
    byLang: count((r) => r.lang), byIntentLang: count((r) => r.intent_lang), byTemplate: count((r) => r.template),
  })}\n`);
}

main();
