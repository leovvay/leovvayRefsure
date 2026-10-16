// Set N3 (dismiss) generator: synthetic pages and draft items for the refsure benchmark (protocol 3.5, row N3, A1).
// Plain Node, no dependencies, fixed seed. Run from the refsure repo root:
//   node tools/bench/sets/gen/n3.mjs
// Writes tools/bench/sets/n3/pages/NNN.html and tools/bench/sets/n3.draft.jsonl (780 items:
// gold control 420 = close / reject / not_now / lexicon_free 105 each; gold none 360 = ok / continue / got_it /
// yes_in / sounds_good / next 60 each). Every none overlay keeps at least one control that is off the veto list
// and does not dismiss safely, so the Decision is asked. A base holds 4 items, at most 2 of them gold none.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..');
const SEED = 'refsure-bench-n3-20261016';

// ---------- deterministic randomness ----------
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(fnv(SEED));
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
function shuffle(xs) { const a = [...xs]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- text helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s) => (s.length > 90 ? s.slice(0, 90) : s);
const v1 = (role, name, path) => `${role} ${JSON.stringify(cut(name))} in=${JSON.stringify(path)}`;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
const Q = { en: ['“', '”'], uk: ['«', '»'], de: ['„', '“'], es: ['«', '»'], fr: ['« ', ' »'], pl: ['„', '”'] };
const quote = (lang, s) => `${Q[lang][0]}${s}${Q[lang][1]}`;

// ---------- languages: 6 (en, uk, de, es, fr, pl) ----------
const LANGS = ['en', 'uk', 'de', 'es', 'fr', 'pl'];
// Base language pattern over 195 bases: en 65, uk 30, de 25, es 25, fr 25, pl 25.
const LANG_QUOTA = { en: 65, uk: 30, de: 25, es: 25, fr: 25, pl: 25 };
const FOOTER = {
  en: ['Privacy', 'Terms of use', 'Contact', 'Help centre', 'Accessibility'],
  uk: ['Конфіденційність', 'Умови використання', 'Контакти', 'Довідка', 'Доступність'],
  de: ['Datenschutz', 'Nutzungsbedingungen', 'Kontakt', 'Hilfe', 'Barrierefreiheit'],
  es: ['Privacidad', 'Condiciones de uso', 'Contacto', 'Centro de ayuda', 'Accesibilidad'],
  fr: ['Confidentialité', "Conditions d'utilisation", 'Contact', "Centre d'aide", 'Accessibilité'],
  pl: ['Prywatność', 'Regulamin', 'Kontakt', 'Centrum pomocy', 'Dostępność'],
};
const SEARCH = { en: 'Search', uk: 'Пошук', de: 'Suche', es: 'Buscar', fr: 'Rechercher', pl: 'Szukaj' };
const ACCOUNT = { en: 'My account', uk: 'Мій кабінет', de: 'Mein Konto', es: 'Mi cuenta', fr: 'Mon compte', pl: 'Moje konto' };
const COPY = { en: 'All rights reserved.', uk: 'Усі права захищено.', de: 'Alle Rechte vorbehalten.', es: 'Todos los derechos reservados.', fr: 'Tous droits réservés.', pl: 'Wszelkie prawa zastrzeżone.' };

// ---------- page templates: 14 kinds of site ----------
// Per language: [nav (4), h1, paragraph, list (3), side heading, side list (3)]. {a} {b} {c} are filled with numbers.
const TEMPLATES = {
  shop: { brands: ['Fernhollow Outfitters', 'Brightmoss Supply', 'Quillstone Goods'], look: ['#f7f5f0', '#22201c', '#2f6b4f', 'system-ui, sans-serif'], layout: 'grid', c: {
    en: [['New in', 'Women', 'Men', 'Sale'], 'Trail jackets for wet autumns', 'Seam-sealed shells, packable layers and boots that dry overnight. Free returns within {a} days.', ['Ridgeline shell jacket — €{b}', 'Packable down vest — €{c}', 'Waxed canvas cap — €{a}'], 'Popular this week', ['Merino base layers', 'Rain trousers', 'Trekking poles']],
    uk: [['Новинки', 'Жінкам', 'Чоловікам', 'Розпродаж'], 'Куртки для дощової осені', 'Мембранні куртки, легкі утеплювачі та черевики, що висихають за ніч. Повернення протягом {a} днів.', ['Куртка Ridgeline — {b} грн', 'Пуховий жилет — {c} грн', 'Вощена кепка — {a} грн'], 'Популярне цього тижня', ['Термобілизна з мериносу', 'Дощові штани', 'Трекінгові палиці']],
    de: [['Neu', 'Damen', 'Herren', 'Sale'], 'Regenjacken für den Herbst', 'Verschweißte Nähte, leichte Isolation und Stiefel, die über Nacht trocknen. Rückgabe innerhalb von {a} Tagen.', ['Ridgeline Hardshell – {b} €', 'Daunenweste – {c} €', 'Gewachste Kappe – {a} €'], 'Beliebt diese Woche', ['Merino-Unterwäsche', 'Regenhosen', 'Wanderstöcke']],
    es: [['Novedades', 'Mujer', 'Hombre', 'Rebajas'], 'Chaquetas para otoños lluviosos', 'Costuras selladas, capas ligeras y botas que se secan en una noche. Devoluciones en {a} días.', ['Chaqueta Ridgeline – {b} €', 'Chaleco de plumas – {c} €', 'Gorra encerada – {a} €'], 'Lo más visto', ['Camisetas de merino', 'Pantalones de lluvia', 'Bastones de trekking']],
    fr: [['Nouveautés', 'Femme', 'Homme', 'Soldes'], 'Vestes pour les automnes humides', 'Coutures étanches, couches légères et chaussures qui sèchent en une nuit. Retours sous {a} jours.', ['Veste Ridgeline – {b} €', 'Doudoune sans manches – {c} €', 'Casquette cirée – {a} €'], 'Populaire cette semaine', ['Sous-couches en mérinos', 'Pantalons de pluie', 'Bâtons de marche']],
    pl: [['Nowości', 'Damskie', 'Męskie', 'Wyprzedaż'], 'Kurtki na deszczową jesień', 'Klejone szwy, lekkie warstwy i buty, które schną przez noc. Zwrot w ciągu {a} dni.', ['Kurtka Ridgeline – {b} zł', 'Kamizelka puchowa – {c} zł', 'Woskowana czapka – {a} zł'], 'Popularne w tym tygodniu', ['Bielizna z merynosa', 'Spodnie przeciwdeszczowe', 'Kije trekkingowe']],
  } },
  bank: { brands: ['Harrowgate Mutual', 'Linden Row Credit', 'Saltmarsh Savings'], look: ['#eef2f6', '#14202e', '#1d4e89', 'Inter, Arial, sans-serif'], layout: 'side-left', c: {
    en: [['Accounts', 'Payments', 'Cards', 'Savings'], 'Good morning', 'Current account ending {a}{b}: available balance €{c},{a}0.', ['Card payment, grocery — €{a}.40', 'Transfer to savings — €{b}.00', 'Salary received — €{c}0.00'], 'Quick actions', ['Freeze card', 'Download statement', 'Set up standing order']],
    uk: [['Рахунки', 'Платежі', 'Картки', 'Заощадження'], 'Доброго ранку', 'Поточний рахунок, що закінчується на {a}{b}: доступно {c} {a}00 грн.', ['Оплата карткою, продукти — {a}0 грн', 'Переказ на депозит — {b}00 грн', 'Надходження зарплати — {c}000 грн'], 'Швидкі дії', ['Заблокувати картку', 'Завантажити виписку', 'Регулярний платіж']],
    de: [['Konten', 'Zahlungen', 'Karten', 'Sparen'], 'Guten Morgen', 'Girokonto mit Endung {a}{b}: verfügbarer Saldo {c}.{a}00 €.', ['Kartenzahlung, Lebensmittel – {a},40 €', 'Übertrag aufs Sparkonto – {b},00 €', 'Gehaltseingang – {c}0,00 €'], 'Schnellzugriff', ['Karte sperren', 'Kontoauszug laden', 'Dauerauftrag anlegen']],
    es: [['Cuentas', 'Pagos', 'Tarjetas', 'Ahorro'], 'Buenos días', 'Cuenta corriente terminada en {a}{b}: saldo disponible {c}.{a}00 €.', ['Pago con tarjeta, supermercado – {a},40 €', 'Traspaso a ahorro – {b},00 €', 'Nómina recibida – {c}0,00 €'], 'Accesos rápidos', ['Bloquear tarjeta', 'Descargar extracto', 'Crear transferencia periódica']],
    fr: [['Comptes', 'Paiements', 'Cartes', 'Épargne'], 'Bonjour', 'Compte courant se terminant par {a}{b} : solde disponible {c} {a}00 €.', ['Paiement carte, courses – {a},40 €', 'Virement vers épargne – {b},00 €', 'Salaire reçu – {c}0,00 €'], 'Actions rapides', ['Bloquer la carte', 'Télécharger le relevé', 'Créer un virement permanent']],
    pl: [['Rachunki', 'Płatności', 'Karty', 'Oszczędności'], 'Dzień dobry', 'Rachunek bieżący z końcówką {a}{b}: dostępne środki {c} {a}00 zł.', ['Płatność kartą, zakupy – {a},40 zł', 'Przelew na oszczędności – {b},00 zł', 'Wpływ wynagrodzenia – {c}0,00 zł'], 'Szybkie akcje', ['Zablokuj kartę', 'Pobierz wyciąg', 'Ustaw zlecenie stałe']],
  } },
  saas: { brands: ['Tallyforge', 'Orbitnote', 'Plumbline Cloud'], look: ['#f4f4f8', '#1d1b2e', '#5b3cc4', 'system-ui, sans-serif'], layout: 'side-left', c: {
    en: [['Dashboard', 'Projects', 'Members', 'Settings'], 'Workspace settings', 'Your workspace has {a} members and {b} active projects. Changes are saved automatically.', ['Workspace name', 'Default time zone: UTC+{a}', 'Two-step sign-in for all members'], 'Usage this month', ['{b} GB of storage', '{c} automation runs', '{a} guests']],
    uk: [['Огляд', 'Проєкти', 'Учасники', 'Налаштування'], 'Налаштування простору', 'У вашому просторі {a} учасників і {b} активних проєктів. Зміни зберігаються автоматично.', ['Назва простору', 'Часовий пояс: UTC+{a}', 'Двокроковий вхід для всіх'], 'Використання за місяць', ['{b} ГБ сховища', '{c} запусків автоматизацій', '{a} гостей']],
    de: [['Übersicht', 'Projekte', 'Mitglieder', 'Einstellungen'], 'Arbeitsbereich', 'Ihr Arbeitsbereich hat {a} Mitglieder und {b} aktive Projekte. Änderungen werden automatisch gespeichert.', ['Name des Arbeitsbereichs', 'Zeitzone: UTC+{a}', 'Zwei-Schritt-Anmeldung für alle'], 'Nutzung im Monat', ['{b} GB Speicher', '{c} Automationsläufe', '{a} Gäste']],
    es: [['Panel', 'Proyectos', 'Miembros', 'Ajustes'], 'Ajustes del espacio', 'Tu espacio tiene {a} miembros y {b} proyectos activos. Los cambios se guardan solos.', ['Nombre del espacio', 'Zona horaria: UTC+{a}', 'Inicio en dos pasos para todos'], 'Uso este mes', ['{b} GB de almacenamiento', '{c} ejecuciones', '{a} invitados']],
    fr: [['Tableau de bord', 'Projets', 'Membres', 'Réglages'], "Espace de travail", 'Votre espace compte {a} membres et {b} projets actifs. Les modifications sont enregistrées automatiquement.', ["Nom de l'espace", 'Fuseau horaire : UTC+{a}', 'Connexion en deux étapes pour tous'], 'Utilisation du mois', ['{b} Go de stockage', '{c} exécutions', '{a} invités']],
    pl: [['Pulpit', 'Projekty', 'Członkowie', 'Opcje'], 'Obszar roboczy', 'Twój obszar ma {a} członków i {b} aktywnych projektów. Zmiany zapisują się automatycznie.', ['Nazwa obszaru', 'Strefa czasowa: UTC+{a}', 'Logowanie dwuetapowe dla wszystkich'], 'Zużycie w miesiącu', ['{b} GB miejsca', '{c} uruchomień', '{a} gości']],
  } },
  news: { brands: ['The Weir Courier', 'Eastmoor Ledger', 'Kestrel Daily'], look: ['#ffffff', '#111111', '#a3271f', 'Georgia, serif'], layout: 'side-right', c: {
    en: [['World', 'Local', 'Business', 'Culture'], 'River towns brace for a wet November', 'Forecasters expect {a} mm of rain over the next week. Councils have opened {b} sandbag points and ask residents to check flood maps.', ['Bridge closures announced for Thursday', 'Ferry timetable cut to {c} crossings', 'Schools stay open, council says'], 'Most read', ['Market hall reopens after {a} years', 'Late trains: what changes in winter', 'Letters: the cycle lane debate']],
    uk: [['Світ', 'Регіон', 'Економіка', 'Культура'], 'Прибережні міста готуються до дощового листопада', 'Синоптики прогнозують {a} мм опадів за тиждень. Громади відкрили {b} пунктів видачі мішків з піском.', ['Оголошено перекриття мостів у четвер', 'Пором зробить лише {c} рейсів', 'Школи працюють у звичайному режимі'], 'Найпопулярніше', ['Ринок відкрився після {a} років ремонту', 'Нічні потяги: зимовий розклад', 'Листи читачів про велосмуги']],
    de: [['Welt', 'Region', 'Wirtschaft', 'Kultur'], 'Flussorte rüsten sich für einen nassen November', 'Meteorologen erwarten {a} mm Regen in der nächsten Woche. Die Gemeinden haben {b} Sandsackstellen geöffnet.', ['Brückensperrungen am Donnerstag', 'Fähre fährt nur noch {c} Mal', 'Schulen bleiben geöffnet'], 'Meistgelesen', ['Markthalle nach {a} Jahren wieder offen', 'Nachtzüge: der Winterfahrplan', 'Leserbriefe zum Radweg']],
    es: [['Mundo', 'Local', 'Economía', 'Cultura'], 'Los pueblos del río se preparan para un noviembre lluvioso', 'Se esperan {a} mm de lluvia la próxima semana. Los ayuntamientos han abierto {b} puntos de sacos de arena.', ['Cortes de puentes el jueves', 'El ferri reduce a {c} travesías', 'Los colegios siguen abiertos'], 'Lo más leído', ['El mercado reabre tras {a} años', 'Trenes nocturnos: horario de invierno', 'Cartas: el debate del carril bici']],
    fr: [['Monde', 'Région', 'Économie', 'Culture'], 'Les villes du fleuve se préparent à un novembre pluvieux', 'Les prévisionnistes attendent {a} mm de pluie cette semaine. Les communes ont ouvert {b} points de sacs de sable.', ['Fermetures de ponts jeudi', 'Le bac réduit à {c} traversées', 'Les écoles restent ouvertes'], 'Les plus lus', ['La halle rouvre après {a} ans', "Trains de nuit : l'horaire d'hiver", 'Courrier : le débat sur la piste cyclable']],
    pl: [['Świat', 'Region', 'Biznes', 'Kultura'], 'Miasta nad rzeką szykują się na deszczowy listopad', 'Synoptycy spodziewają się {a} mm deszczu w tym tygodniu. Gminy otworzyły {b} punktów z workami z piaskiem.', ['Zamknięcia mostów w czwartek', 'Prom kursuje tylko {c} razy', 'Szkoły pozostają otwarte'], 'Najczęściej czytane', ['Hala targowa otwarta po {a} latach', 'Nocne pociągi: rozkład zimowy', 'Listy: spór o drogę rowerową']],
  } },
  travel: { brands: ['Wayfarer Lantern', 'Bluegull Trips', 'Compass & Kettle'], look: ['#f2f8fb', '#0e2a36', '#0b7a8c', 'Verdana, sans-serif'], layout: 'grid', c: {
    en: [['Flights', 'Stays', 'Trains', 'Trips'], 'Find your next stay', 'Prices for {a} nights, two guests. Taxes included, free cancellation on most rooms.', ['Harbour view apartment — €{b} total', 'Old town guesthouse — €{c} total', 'Hillside cabin with sauna — €{b}{a} total'], 'Recently viewed', ['Lakeside hotel, 4 stars', 'Night train, sleeper cabin', 'City bike rental']],
    uk: [['Авіаквитки', 'Житло', 'Потяги', 'Подорожі'], 'Знайдіть житло для подорожі', 'Ціни за {a} ночі для двох гостей. Податки включено, безкоштовне скасування.', ['Апартаменти з видом на гавань — {b}00 грн', 'Гостьовий дім у старому місті — {c}00 грн', 'Будиночок із сауною — {b}{a}00 грн'], 'Ви переглядали', ['Готель біля озера, 4 зірки', 'Нічний потяг, купе', 'Оренда велосипеда']],
    de: [['Flüge', 'Unterkünfte', 'Bahn', 'Reisen'], 'Finden Sie Ihre Unterkunft', 'Preise für {a} Nächte, zwei Gäste. Steuern inklusive, meist kostenlose Stornierung.', ['Apartment mit Hafenblick – {b} € gesamt', 'Pension in der Altstadt – {c} € gesamt', 'Hütte mit Sauna – {b}{a} € gesamt'], 'Zuletzt angesehen', ['Seehotel, 4 Sterne', 'Nachtzug, Schlafwagen', 'Fahrradverleih']],
    es: [['Vuelos', 'Alojamientos', 'Trenes', 'Viajes'], 'Encuentra tu alojamiento', 'Precios para {a} noches, dos huéspedes. Impuestos incluidos, cancelación gratuita.', ['Apartamento con vistas al puerto – {b} € total', 'Pensión en el casco antiguo – {c} € total', 'Cabaña con sauna – {b}{a} € total'], 'Vistos recientemente', ['Hotel junto al lago, 4 estrellas', 'Tren nocturno, coche cama', 'Alquiler de bicis']],
    fr: [['Vols', 'Hébergements', 'Trains', 'Voyages'], 'Trouvez votre hébergement', 'Prix pour {a} nuits, deux voyageurs. Taxes incluses, annulation gratuite.', ['Appartement vue sur le port – {b} € au total', 'Pension dans la vieille ville – {c} € au total', 'Chalet avec sauna – {b}{a} € au total'], 'Consultés récemment', ['Hôtel au bord du lac, 4 étoiles', 'Train de nuit, couchette', 'Location de vélos']],
    pl: [['Loty', 'Noclegi', 'Pociągi', 'Wycieczki'], 'Znajdź nocleg', 'Ceny za {a} noce dla dwóch osób. Podatki wliczone, bezpłatne anulowanie.', ['Apartament z widokiem na port – {b}0 zł', 'Pensjonat na starówce – {c}0 zł', 'Domek z sauną – {b}{a}0 zł'], 'Ostatnio oglądane', ['Hotel nad jeziorem, 4 gwiazdki', 'Pociąg nocny, kuszetka', 'Wypożyczalnia rowerów']],
  } },
  gov: { brands: ['Ashford Borough Services', 'Northvale County Portal', 'Riverbend Civic Office'], look: ['#ffffff', '#0b0c0c', '#1d70b8', 'Arial, sans-serif'], layout: 'none', c: {
    en: [['Services', 'Waste and recycling', 'Parking', 'Council tax'], 'Apply for a residents parking permit', 'You need your vehicle registration and proof of address dated within the last {a} months. A permit costs €{b} a year.', ['Check you are eligible', 'Prepare your documents', 'Fill in the application (about {c} minutes)'], 'Related services', ['Visitor parking vouchers', 'Report an abandoned vehicle', 'Blue badge renewals']],
    uk: [['Послуги', 'Сміття та переробка', 'Паркування', 'Місцеві податки'], 'Заява на паркувальний дозвіл для мешканців', 'Потрібні реєстраційні дані авто та підтвердження адреси за останні {a} місяців. Дозвіл коштує {b}0 грн на рік.', ['Перевірте, чи маєте право', 'Підготуйте документи', 'Заповніть заяву (близько {c} хвилин)'], "Пов'язані послуги", ['Гостьові талони на паркування', 'Повідомити про покинуте авто', 'Пільгові дозволи']],
    de: [['Leistungen', 'Abfall', 'Parken', 'Gebühren'], 'Bewohnerparkausweis beantragen', 'Sie benötigen den Fahrzeugschein und einen Adressnachweis der letzten {a} Monate. Der Ausweis kostet {b} € pro Jahr.', ['Berechtigung prüfen', 'Unterlagen vorbereiten', 'Antrag ausfüllen (etwa {c} Minuten)'], 'Verwandte Leistungen', ['Besucherparkscheine', 'Abgestelltes Fahrzeug melden', 'Schwerbehindertenausweis']],
    es: [['Trámites', 'Residuos', 'Aparcamiento', 'Impuestos'], 'Solicitar la tarjeta de aparcamiento para residentes', 'Necesitas el permiso de circulación y un justificante de domicilio de los últimos {a} meses. Cuesta {b} € al año.', ['Comprueba si cumples los requisitos', 'Prepara los documentos', 'Rellena la solicitud (unos {c} minutos)'], 'Trámites relacionados', ['Tiques para visitantes', 'Avisar de un vehículo abandonado', 'Tarjeta de movilidad reducida']],
    fr: [['Démarches', 'Déchets', 'Stationnement', 'Taxes'], 'Demander une carte de stationnement résident', "Il faut la carte grise et un justificatif de domicile de moins de {a} mois. La carte coûte {b} € par an.", ['Vérifier votre éligibilité', 'Préparer les justificatifs', 'Remplir la demande (environ {c} minutes)'], 'Démarches liées', ['Tickets visiteurs', 'Signaler un véhicule abandonné', 'Carte mobilité inclusion']],
    pl: [['Usługi', 'Odpady', 'Parkowanie', 'Opłaty lokalne'], 'Wniosek o abonament parkingowy mieszkańca', 'Potrzebny jest dowód rejestracyjny i potwierdzenie adresu z ostatnich {a} miesięcy. Abonament kosztuje {b}0 zł rocznie.', ['Sprawdź uprawnienia', 'Przygotuj dokumenty', 'Wypełnij wniosek (około {c} minut)'], 'Powiązane usługi', ['Bilety dla gości', 'Zgłoś porzucony pojazd', 'Karta parkingowa']],
  } },
  forum: { brands: ['Spokewright Forum', 'Allotment Commons', 'Darkroom Circle'], look: ['#f5f6f7', '#1f2328', '#c4581b', 'Tahoma, sans-serif'], layout: 'side-right', c: {
    en: [['Latest', 'Categories', 'Top', 'Members'], 'Chain keeps slipping on the smallest cog', 'Started by a member {a} days ago · {b} replies · {c} views', ['Check the B-tension screw first', 'Worn chain? Measure it with a gauge', 'Mine was a bent hanger, fixed it for €{a}'], 'Board rules', ['Be kind', 'Search before posting', 'No sales threads']],
    uk: [['Нове', 'Розділи', 'Популярне', 'Учасники'], 'Ланцюг зіскакує з найменшої зірки', 'Тему створено {a} днів тому · {b} відповідей · {c} переглядів', ['Спершу перевірте гвинт натягу', 'Зношений ланцюг? Виміряйте калібром', 'У мене був погнутий півник'], 'Правила форуму', ['Будьте ввічливі', 'Шукайте перед публікацією', 'Без оголошень про продаж']],
    de: [['Neueste', 'Kategorien', 'Top', 'Mitglieder'], 'Kette springt auf dem kleinsten Ritzel', 'Erstellt vor {a} Tagen · {b} Antworten · {c} Aufrufe', ['Zuerst die B-Schraube prüfen', 'Kette verschlissen? Mit Lehre messen', 'Bei mir war das Schaltauge verbogen'], 'Forenregeln', ['Freundlich bleiben', 'Erst suchen, dann posten', 'Keine Verkaufsthreads']],
    es: [['Recientes', 'Categorías', 'Destacados', 'Miembros'], 'La cadena salta en el piñón pequeño', 'Abierto hace {a} días · {b} respuestas · {c} visitas', ['Revisa primero el tornillo B', '¿Cadena gastada? Mídela con un calibre', 'Lo mío era la patilla doblada'], 'Normas del foro', ['Sé amable', 'Busca antes de publicar', 'Nada de ventas']],
    fr: [['Récents', 'Catégories', 'Populaires', 'Membres'], 'La chaîne saute sur le petit pignon', 'Ouvert il y a {a} jours · {b} réponses · {c} vues', ["Vérifiez d'abord la vis B", 'Chaîne usée ? Mesurez-la', "Chez moi c'était la patte tordue"], 'Règles du forum', ['Restez courtois', 'Cherchez avant de poster', 'Pas de petites annonces']],
    pl: [['Najnowsze', 'Kategorie', 'Popularne', 'Użytkownicy'], 'Łańcuch przeskakuje na najmniejszej zębatce', 'Wątek założony {a} dni temu · {b} odpowiedzi · {c} wyświetleń', ['Najpierw sprawdź śrubę B', 'Zużyty łańcuch? Zmierz go', 'U mnie był krzywy hak przerzutki'], 'Zasady forum', ['Bądź uprzejmy', 'Najpierw szukaj', 'Bez ogłoszeń sprzedaży']],
  } },
  docs: { brands: ['Gridlark Docs', 'Pinecone SDK Guide', 'Lanternfish Reference'], look: ['#fbfbfd', '#1b1f24', '#0a66c2', 'ui-monospace, Menlo, monospace'], layout: 'side-left', c: {
    en: [['Guides', 'API reference', 'Changelog', 'Community'], 'Retry policies', 'A request is retried at most {a} times with exponential backoff starting at {b}00 ms. Idempotent methods only.', ['Configure the backoff ceiling', 'Handle rate-limit responses', 'Log every attempt (since v{a}.{c})'], 'On this page', ['Defaults', 'Examples', 'Limits']],
    uk: [['Посібники', 'Довідник API', 'Зміни', 'Спільнота'], 'Політики повторних спроб', 'Запит повторюється не більше {a} разів з експоненційною затримкою від {b}00 мс. Лише ідемпотентні методи.', ['Налаштуйте стелю затримки', 'Обробляйте відповіді про ліміт', 'Журнал кожної спроби (з v{a}.{c})'], 'На цій сторінці', ['Типові значення', 'Приклади', 'Обмеження']],
    de: [['Anleitungen', 'API-Referenz', 'Änderungen', 'Community'], 'Wiederholungsrichtlinien', 'Eine Anfrage wird höchstens {a} Mal wiederholt, mit exponentiellem Backoff ab {b}00 ms. Nur idempotente Methoden.', ['Backoff-Obergrenze festlegen', 'Ratenlimit-Antworten behandeln', 'Jeden Versuch protokollieren (ab v{a}.{c})'], 'Auf dieser Seite', ['Standardwerte', 'Beispiele', 'Grenzen']],
    es: [['Guías', 'Referencia API', 'Cambios', 'Comunidad'], 'Políticas de reintento', 'Una petición se reintenta como máximo {a} veces con espera exponencial desde {b}00 ms. Solo métodos idempotentes.', ['Configura el techo de espera', 'Gestiona las respuestas de límite', 'Registra cada intento (desde v{a}.{c})'], 'En esta página', ['Valores por defecto', 'Ejemplos', 'Límites']],
    fr: [['Guides', 'Référence API', 'Journal des versions', 'Communauté'], 'Politiques de nouvelle tentative', 'Une requête est relancée au plus {a} fois avec un délai exponentiel dès {b}00 ms. Méthodes idempotentes seulement.', ['Régler le plafond du délai', 'Traiter les réponses de limite', 'Journaliser chaque essai (depuis v{a}.{c})'], 'Sur cette page', ['Valeurs par défaut', 'Exemples', 'Limites']],
    pl: [['Przewodniki', 'Dokumentacja API', 'Zmiany', 'Społeczność'], 'Zasady ponawiania', 'Żądanie jest ponawiane najwyżej {a} razy z wykładniczym opóźnieniem od {b}00 ms. Tylko metody idempotentne.', ['Ustaw górny limit opóźnienia', 'Obsłuż odpowiedzi o limicie', 'Loguj każdą próbę (od v{a}.{c})'], 'Na tej stronie', ['Wartości domyślne', 'Przykłady', 'Limity']],
  } },
  admin: { brands: ['Stockroom Console', 'Kilnworks Admin', 'Meadowgate Ops'], look: ['#f3f4f6', '#111827', '#0f766e', 'system-ui, sans-serif'], layout: 'side-left', c: {
    en: [['Orders', 'Customers', 'Inventory', 'Reports'], 'Orders', 'Showing {a} of {c}{b} orders · filtered by status: awaiting dispatch', ['#{b}{a}41 · 3 items · awaiting dispatch', '#{b}{a}42 · 1 item · awaiting payment', '#{b}{a}43 · 5 items · packed'], 'Filters', ['Status', 'Date range', 'Warehouse']],
    uk: [['Замовлення', 'Клієнти', 'Склад', 'Звіти'], 'Замовлення', 'Показано {a} з {c}{b} замовлень · фільтр: очікує відправлення', ['#{b}{a}41 · 3 товари · очікує відправлення', '#{b}{a}42 · 1 товар · очікує оплати', '#{b}{a}43 · 5 товарів · запаковано'], 'Фільтри', ['Статус', 'Період', 'Склад']],
    de: [['Bestellungen', 'Kunden', 'Lager', 'Berichte'], 'Bestellungen', '{a} von {c}{b} Bestellungen · Filter: wartet auf Versand', ['#{b}{a}41 · 3 Artikel · wartet auf Versand', '#{b}{a}42 · 1 Artikel · wartet auf Zahlung', '#{b}{a}43 · 5 Artikel · verpackt'], 'Filter', ['Status', 'Zeitraum', 'Lagerort']],
    es: [['Pedidos', 'Clientes', 'Inventario', 'Informes'], 'Pedidos', 'Mostrando {a} de {c}{b} pedidos · filtro: pendiente de envío', ['#{b}{a}41 · 3 artículos · pendiente de envío', '#{b}{a}42 · 1 artículo · pendiente de pago', '#{b}{a}43 · 5 artículos · embalado'], 'Filtros', ['Estado', 'Fechas', 'Almacén']],
    fr: [['Commandes', 'Clients', 'Stock', 'Rapports'], 'Commandes', '{a} sur {c}{b} commandes · filtre : en attente d’expédition', ['#{b}{a}41 · 3 articles · en attente d’expédition', '#{b}{a}42 · 1 article · en attente de paiement', '#{b}{a}43 · 5 articles · emballé'], 'Filtres', ['Statut', 'Période', 'Entrepôt']],
    pl: [['Zamówienia', 'Klienci', 'Magazyn', 'Raporty'], 'Zamówienia', 'Wyświetlono {a} z {c}{b} zamówień · filtr: czeka na wysyłkę', ['#{b}{a}41 · 3 produkty · czeka na wysyłkę', '#{b}{a}42 · 1 produkt · czeka na płatność', '#{b}{a}43 · 5 produktów · spakowane'], 'Filtry', ['Status', 'Zakres dat', 'Magazyn']],
  } },
  mail: { brands: ['Postlark Mail', 'Inkwell Inbox', 'Sparrowpost'], look: ['#f6f8fc', '#202124', '#b0451c', 'Segoe UI, sans-serif'], layout: 'side-left', c: {
    en: [['Inbox', 'Starred', 'Sent', 'Drafts'], 'Inbox ({a})', 'You have {b} unread messages. Storage used: {c}% of 15 GB.', ['Allotment rota for November — 09:{a}0', 'Your parcel is out for delivery — 08:{b}5', 'Minutes from the residents meeting — yesterday'], 'Labels', ['Family', 'Receipts', 'Travel']],
    uk: [['Вхідні', 'Позначені', 'Надіслані', 'Чернетки'], 'Вхідні ({a})', 'У вас {b} непрочитаних листів. Використано {c}% з 15 ГБ.', ['Графік чергувань на листопад — 09:{a}0', 'Посилка в дорозі — 08:{b}5', 'Протокол зборів мешканців — учора'], 'Мітки', ["Сім'я", 'Чеки', 'Подорожі']],
    de: [['Posteingang', 'Markiert', 'Gesendet', 'Entwürfe'], 'Posteingang ({a})', 'Sie haben {b} ungelesene Nachrichten. Speicher: {c} % von 15 GB.', ['Gartendienst im November — 09:{a}0', 'Ihr Paket wird zugestellt — 08:{b}5', 'Protokoll der Mieterversammlung — gestern'], 'Labels', ['Familie', 'Belege', 'Reisen']],
    es: [['Recibidos', 'Destacados', 'Enviados', 'Borradores'], 'Recibidos ({a})', 'Tienes {b} mensajes sin leer. Almacenamiento: {c} % de 15 GB.', ['Turnos del huerto en noviembre — 09:{a}0', 'Tu paquete está en reparto — 08:{b}5', 'Acta de la reunión de vecinos — ayer'], 'Etiquetas', ['Familia', 'Recibos', 'Viajes']],
    fr: [['Boîte de réception', 'Suivis', 'Envoyés', 'Brouillons'], 'Boîte de réception ({a})', 'Vous avez {b} messages non lus. Stockage : {c} % de 15 Go.', ['Planning du jardin en novembre — 09:{a}0', 'Votre colis est en livraison — 08:{b}5', 'Compte rendu de la réunion — hier'], 'Libellés', ['Famille', 'Reçus', 'Voyages']],
    pl: [['Odebrane', 'Oznaczone', 'Wysłane', 'Robocze'], 'Odebrane ({a})', 'Masz {b} nieprzeczytanych wiadomości. Zajęte: {c}% z 15 GB.', ['Grafik dyżurów na listopad — 09:{a}0', 'Paczka jest w doręczeniu — 08:{b}5', 'Protokół z zebrania mieszkańców — wczoraj'], 'Etykiety', ['Rodzina', 'Paragony', 'Podróże']],
  } },
  recipes: { brands: ['Copper Ladle Kitchen', 'Thymewell Recipes', 'Oven & Orchard'], look: ['#fffaf3', '#2d2416', '#b5651d', 'Georgia, serif'], layout: 'side-right', c: {
    en: [['Recipes', 'Seasonal', 'Baking', 'Quick dinners'], 'Plum and almond traybake', 'Serves {a}. Prep {b} minutes, bake {c} minutes. Use ripe plums so the juice runs into the sponge.', ['200 g ground almonds', '{a} ripe plums, halved', '150 g soft brown sugar'], 'You might also like', ['Pear and ginger loaf', 'Apple crumble bars', 'Quince jelly']],
    uk: [['Рецепти', 'Сезонне', 'Випічка', 'Швидкі вечері'], 'Пиріг зі сливами та мигдалем', 'На {a} порцій. Підготовка {b} хв, випікання {c} хв. Беріть стиглі сливи.', ['200 г меленого мигдалю', '{a} стиглих слив, половинками', '150 г коричневого цукру'], 'Вам також сподобається', ['Грушевий кекс з імбиром', 'Яблучний крамбл', 'Желе з айви']],
    de: [['Rezepte', 'Saisonal', 'Backen', 'Schnelle Gerichte'], 'Pflaumen-Mandel-Blechkuchen', 'Für {a} Personen. Vorbereitung {b} Minuten, Backzeit {c} Minuten. Reife Pflaumen verwenden.', ['200 g gemahlene Mandeln', '{a} reife Pflaumen, halbiert', '150 g brauner Zucker'], 'Das könnte Ihnen gefallen', ['Birnen-Ingwer-Kuchen', 'Apfel-Streusel-Schnitten', 'Quittengelee']],
    es: [['Recetas', 'De temporada', 'Repostería', 'Cenas rápidas'], 'Bizcocho de ciruela y almendra', 'Para {a} personas. Preparación {b} minutos, horno {c} minutos. Usa ciruelas maduras.', ['200 g de almendra molida', '{a} ciruelas maduras, en mitades', '150 g de azúcar moreno'], 'También te puede gustar', ['Bizcocho de pera y jengibre', 'Barritas de manzana', 'Dulce de membrillo']],
    fr: [['Recettes', 'De saison', 'Pâtisserie', 'Dîners rapides'], 'Gâteau aux prunes et amandes', 'Pour {a} personnes. Préparation {b} minutes, cuisson {c} minutes. Prenez des prunes bien mûres.', ["200 g de poudre d'amande", '{a} prunes mûres, coupées en deux', '150 g de cassonade'], 'Vous aimerez aussi', ['Cake poire gingembre', 'Barres crumble aux pommes', 'Gelée de coing']],
    pl: [['Przepisy', 'Sezonowe', 'Wypieki', 'Szybkie obiady'], 'Ciasto ze śliwkami i migdałami', 'Dla {a} osób. Przygotowanie {b} minut, pieczenie {c} minut. Użyj dojrzałych śliwek.', ['200 g mielonych migdałów', '{a} dojrzałych śliwek, połówki', '150 g brązowego cukru'], 'Może ci się spodobać', ['Ciasto gruszkowe z imbirem', 'Kruche batony jabłkowe', 'Galaretka z pigwy']],
  } },
  streaming: { brands: ['Reelharbor', 'Nightjar Screen', 'Foxglove Play'], look: ['#141414', '#f2f2f2', '#d0342c', 'Helvetica, Arial, sans-serif'], layout: 'grid', c: {
    en: [['Home', 'Series', 'Films', 'My list'], 'Saltwater Lanterns — season {a}', '{b} episodes · drama · a lighthouse keeper finds letters that were never sent.', ['Episode 1 · The quiet tide · {c} min', 'Episode 2 · Paper boats · {b} min', 'Episode 3 · Fog signal · {c} min'], 'Continue watching', ['The orchard case', 'Low road north', 'Glass harbour']],
    uk: [['Головна', 'Серіали', 'Фільми', 'Мій список'], 'Солоні ліхтарі — сезон {a}', '{b} серій · драма · доглядач маяка знаходить листи, які так і не надіслали.', ['Серія 1 · Тихий приплив · {c} хв', 'Серія 2 · Паперові човники · {b} хв', 'Серія 3 · Туманний сигнал · {c} хв'], 'Продовжити перегляд', ['Справа про сад', 'Нижня дорога', 'Скляна гавань']],
    de: [['Start', 'Serien', 'Filme', 'Meine Liste'], 'Salzwasserlaternen — Staffel {a}', '{b} Folgen · Drama · ein Leuchtturmwärter findet Briefe, die nie abgeschickt wurden.', ['Folge 1 · Die stille Flut · {c} Min.', 'Folge 2 · Papierboote · {b} Min.', 'Folge 3 · Nebelhorn · {c} Min.'], 'Weiterschauen', ['Der Obstgartenfall', 'Die untere Straße', 'Glashafen']],
    es: [['Inicio', 'Series', 'Películas', 'Mi lista'], 'Faroles de sal — temporada {a}', '{b} episodios · drama · un farero encuentra cartas que nunca se enviaron.', ['Episodio 1 · La marea tranquila · {c} min', 'Episodio 2 · Barcos de papel · {b} min', 'Episodio 3 · Señal de niebla · {c} min'], 'Seguir viendo', ['El caso del huerto', 'El camino bajo', 'Puerto de cristal']],
    fr: [['Accueil', 'Séries', 'Films', 'Ma liste'], "Lanternes d'eau salée — saison {a}", "{b} épisodes · drame · un gardien de phare trouve des lettres jamais envoyées.", ['Épisode 1 · La marée tranquille · {c} min', 'Épisode 2 · Bateaux de papier · {b} min', 'Épisode 3 · Corne de brume · {c} min'], 'Reprendre', ["L'affaire du verger", 'La route basse', 'Port de verre']],
    pl: [['Start', 'Seriale', 'Filmy', 'Moja lista'], 'Słone latarnie — sezon {a}', '{b} odcinków · dramat · latarnik znajduje listy, których nigdy nie wysłano.', ['Odcinek 1 · Cichy przypływ · {c} min', 'Odcinek 2 · Papierowe łódki · {b} min', 'Odcinek 3 · Sygnał mgłowy · {c} min'], 'Oglądaj dalej', ['Sprawa sadu', 'Dolna droga', 'Szklany port']],
  } },
  learning: { brands: ['Slate & Quill Academy', 'Marigold Learning', 'Underhill Courses'], look: ['#f7f9f4', '#1e2a1a', '#4d7c0f', 'Trebuchet MS, sans-serif'], layout: 'side-right', c: {
    en: [['My courses', 'Catalogue', 'Calendar', 'Grades'], 'Statistics 101 · Week {a}', 'This week: sampling and confidence intervals. Quiz opens Friday, {b} questions, {c} minutes.', ['Lecture: why samples vary', 'Worksheet: estimating a mean', 'Discussion: polls in the news'], 'Deadlines', ['Quiz {a} — Friday', 'Essay draft — in {b} days', 'Peer review — next week']],
    uk: [['Мої курси', 'Каталог', 'Календар', 'Оцінки'], 'Статистика 101 · Тиждень {a}', 'Цього тижня: вибірки та довірчі інтервали. Тест відкривається в пʼятницю, {b} питань, {c} хвилин.', ['Лекція: чому вибірки різняться', 'Практикум: оцінка середнього', 'Обговорення: опитування в новинах'], 'Терміни', ['Тест {a} — пʼятниця', 'Чернетка есе — за {b} днів', 'Рецензування — наступного тижня']],
    de: [['Meine Kurse', 'Katalog', 'Kalender', 'Noten'], 'Statistik 101 · Woche {a}', 'Diese Woche: Stichproben und Konfidenzintervalle. Das Quiz startet Freitag, {b} Fragen, {c} Minuten.', ['Vorlesung: warum Stichproben schwanken', 'Übung: einen Mittelwert schätzen', 'Diskussion: Umfragen in den Medien'], 'Fristen', ['Quiz {a} — Freitag', 'Essay-Entwurf — in {b} Tagen', 'Peer-Review — nächste Woche']],
    es: [['Mis cursos', 'Catálogo', 'Calendario', 'Notas'], 'Estadística 101 · Semana {a}', 'Esta semana: muestreo e intervalos de confianza. El cuestionario abre el viernes, {b} preguntas, {c} minutos.', ['Clase: por qué varían las muestras', 'Ejercicio: estimar una media', 'Debate: encuestas en las noticias'], 'Plazos', ['Cuestionario {a} — viernes', 'Borrador del ensayo — en {b} días', 'Revisión entre pares — la semana que viene']],
    fr: [['Mes cours', 'Catalogue', 'Agenda', 'Notes'], 'Statistiques 101 · Semaine {a}', 'Cette semaine : échantillonnage et intervalles de confiance. Le quiz ouvre vendredi, {b} questions, {c} minutes.', ['Cours : pourquoi les échantillons varient', 'Exercice : estimer une moyenne', 'Discussion : les sondages dans la presse'], 'Échéances', ['Quiz {a} — vendredi', 'Brouillon de dissertation — dans {b} jours', 'Relecture croisée — semaine prochaine']],
    pl: [['Moje kursy', 'Katalog', 'Kalendarz', 'Oceny'], 'Statystyka 101 · Tydzień {a}', 'W tym tygodniu: próby i przedziały ufności. Quiz otwiera się w piątek, {b} pytań, {c} minut.', ['Wykład: dlaczego próby się różnią', 'Ćwiczenie: szacowanie średniej', 'Dyskusja: sondaże w mediach'], 'Terminy', ['Quiz {a} — piątek', 'Szkic eseju — za {b} dni', 'Recenzja koleżeńska — za tydzień']],
  } },
  fitness: { brands: ['Ironbark Studio', 'Tidepool Fitness', 'Cobblestone Climbing'], look: ['#f4f7f7', '#102326', '#c2185b', 'Futura, Arial, sans-serif'], layout: 'grid', c: {
    en: [['Classes', 'Timetable', 'Memberships', 'Studios'], 'This week at the studio', '{a} classes left on your pass. Booking opens {b} days ahead; cancel up to {c} hours before.', ['Mon 07:00 · Mobility flow · {a} spots', 'Wed 18:30 · Strength basics · {b} spots', 'Sat 10:00 · Bouldering intro · {c} spots'], 'Your bookings', ['Tuesday spin, 19:00', 'Thursday yoga, 07:30', 'Sunday open gym']],
    uk: [['Заняття', 'Розклад', 'Абонементи', 'Зали'], 'Цього тижня в студії', 'На абонементі залишилось {a} занять. Запис відкривається за {b} днів; скасування до {c} год.', ['Пн 07:00 · Мобільність · {a} місць', 'Ср 18:30 · Основи сили · {b} місць', 'Сб 10:00 · Боулдеринг для початківців · {c} місць'], 'Ваші записи', ['Вівторок, сайкл 19:00', 'Четвер, йога 07:30', 'Неділя, вільний зал']],
    de: [['Kurse', 'Stundenplan', 'Mitgliedschaften', 'Studios'], 'Diese Woche im Studio', 'Noch {a} Kurse auf Ihrer Karte. Buchung {b} Tage im Voraus, Absage bis {c} Stunden vorher.', ['Mo 07:00 · Mobility · {a} Plätze', 'Mi 18:30 · Kraft-Grundlagen · {b} Plätze', 'Sa 10:00 · Bouldern für Einsteiger · {c} Plätze'], 'Ihre Buchungen', ['Dienstag Spinning, 19:00', 'Donnerstag Yoga, 07:30', 'Sonntag freies Training']],
    es: [['Clases', 'Horario', 'Cuotas', 'Salas'], 'Esta semana en el estudio', 'Te quedan {a} clases en el bono. Reservas con {b} días de antelación; cancela hasta {c} horas antes.', ['Lun 07:00 · Movilidad · {a} plazas', 'Mié 18:30 · Fuerza básica · {b} plazas', 'Sáb 10:00 · Iniciación al búlder · {c} plazas'], 'Tus reservas', ['Martes ciclo, 19:00', 'Jueves yoga, 07:30', 'Domingo sala libre']],
    fr: [['Cours', 'Planning', 'Abonnements', 'Salles'], 'Cette semaine au studio', 'Il reste {a} cours sur votre carte. Réservation {b} jours avant ; annulation jusqu’à {c} heures avant.', ['Lun 07:00 · Mobilité · {a} places', 'Mer 18:30 · Bases de force · {b} places', 'Sam 10:00 · Initiation bloc · {c} places'], 'Vos réservations', ['Mardi vélo, 19:00', 'Jeudi yoga, 07:30', 'Dimanche salle libre']],
    pl: [['Zajęcia', 'Grafik', 'Karnety', 'Sale'], 'W tym tygodniu w studiu', 'Na karnecie zostało {a} zajęć. Zapisy {b} dni wcześniej; odwołanie do {c} godzin przed.', ['Pon 07:00 · Mobilność · {a} miejsc', 'Śr 18:30 · Podstawy siły · {b} miejsc', 'Sob 10:00 · Wstęp do boulderingu · {c} miejsc'], 'Twoje rezerwacje', ['Wtorek spinning, 19:00', 'Czwartek joga, 07:30', 'Niedziela wolna sala']],
  } },
};
const TEMPLATE_IDS = Object.keys(TEMPLATES);

// ---------- overlays: 7 kinds ----------
// box: region (bottom bar, no dialog role: refsure finds it by its cookie wording and >= 2 buttons) or dialog.
// family: which trap effect and decoys apply. Per language: [accessible name, heading, [body variants]].
const KINDS = {
  cookie_banner: { box: 'region', family: 'cookie', t: {
    en: ['Cookie notice', 'We value your privacy', ['We use cookies to keep the site working and, with your permission, to measure visits and show relevant ads.', 'This site uses cookies. Some are needed to run it; others help us understand how pages are used.']],
    uk: ['Повідомлення про файли cookie', 'Ми цінуємо вашу приватність', ['Ми використовуємо файли cookie, щоб сайт працював, а з вашого дозволу — для статистики й реклами.', 'Сайт використовує файли cookie. Частина з них потрібна для роботи, інші допомагають зрозуміти відвідування.']],
    de: ['Cookie-Hinweis', 'Ihre Privatsphäre ist uns wichtig', ['Wir verwenden Cookies, damit die Website funktioniert, und mit Ihrer Erlaubnis für Statistik und Werbung.', 'Diese Website nutzt Cookies. Einige sind technisch nötig, andere helfen uns, die Nutzung zu verstehen.']],
    es: ['Aviso de cookies', 'Tu privacidad nos importa', ['Usamos cookies para que el sitio funcione y, con tu permiso, para medir visitas y mostrar anuncios.', 'Este sitio usa cookies. Algunas son necesarias; otras nos ayudan a entender cómo se usa.']],
    fr: ['Bandeau cookies', 'Votre vie privée compte', ['Nous utilisons des cookies pour faire fonctionner le site et, avec votre accord, pour la mesure d’audience et la publicité.', 'Ce site utilise des cookies. Certains sont nécessaires ; d’autres nous aident à comprendre l’usage des pages.']],
    pl: ['Informacja o cookies', 'Szanujemy twoją prywatność', ['Używamy plików cookies, aby strona działała, a za twoją zgodą — do statystyk i reklam.', 'Ta strona używa ciasteczek. Część jest niezbędna, inne pomagają nam zrozumieć ruch.']],
  } },
  cookie_modal: { box: 'dialog', family: 'cookie', t: {
    en: ['Cookie consent', 'Before you continue', ['We and our {p} partners store and read information on your device to personalise ads and measure performance.', 'Choose how we use cookies. Essential cookies are always on; analytics and advertising cookies need your consent.']],
    uk: ['Згода на файли cookie', 'Перш ніж продовжити', ['Ми та {p} партнерів зберігаємо й читаємо дані на вашому пристрої для персоналізації реклами.', 'Оберіть, як ми використовуємо файли cookie. Необхідні завжди увімкнені; аналітика й реклама — лише за згодою.']],
    de: ['Cookie-Einwilligung', 'Bevor Sie fortfahren', ['Wir und unsere {p} Partner speichern Informationen auf Ihrem Gerät, um Werbung zu personalisieren.', 'Wählen Sie, wie wir Cookies verwenden. Notwendige Cookies sind immer aktiv, Statistik und Werbung nur mit Einwilligung.']],
    es: ['Consentimiento de cookies', 'Antes de continuar', ['Nosotros y nuestros {p} socios guardamos información en tu dispositivo para personalizar anuncios.', 'Elige cómo usamos las cookies. Las esenciales están siempre activas; las de análisis y publicidad requieren tu consentimiento.']],
    fr: ['Consentement aux cookies', 'Avant de continuer', ['Nous et nos {p} partenaires stockons des informations sur votre appareil pour personnaliser la publicité.', 'Choisissez comment nous utilisons les cookies. Les cookies essentiels restent actifs ; mesure et publicité exigent votre accord.']],
    pl: ['Zgoda na cookies', 'Zanim przejdziesz dalej', ['My i nasi partnerzy ({p}) zapisujemy informacje na twoim urządzeniu, aby dopasować reklamy.', 'Wybierz, jak używamy plików cookies. Niezbędne działają zawsze; analityczne i reklamowe wymagają zgody.']],
  } },
  cookie_wall: { box: 'dialog', family: 'cookie', t: {
    en: ['Privacy choices', 'Read on with cookies or a plan', ['To keep reading for free, we and {p} partners use cookies for advertising. You can also read without ad tracking on a paid plan.', 'Our journalism is funded by ads. Allow advertising cookies to continue for free, or pick a plan without tracking.']],
    uk: ['Вибір приватності', 'Читайте далі з cookie або з планом', ['Щоб читати безкоштовно, ми та {p} партнерів використовуємо файли cookie для реклами. Без відстеження — на платному плані.', 'Нашу роботу фінансує реклама. Дозвольте рекламні файли cookie, щоб читати безкоштовно, або оберіть план.']],
    de: ['Datenschutz-Auswahl', 'Mit Cookies oder Abo weiterlesen', ['Um kostenlos weiterzulesen, nutzen wir und {p} Partner Cookies für Werbung. Ohne Tracking lesen Sie im Abo.', 'Unser Journalismus wird durch Werbung finanziert. Erlauben Sie Werbe-Cookies oder wählen Sie ein Abo ohne Tracking.']],
    es: ['Opciones de privacidad', 'Sigue leyendo con cookies o con un plan', ['Para leer gratis, nosotros y {p} socios usamos cookies publicitarias. Sin seguimiento, con un plan de pago.', 'Nuestro periodismo se financia con anuncios. Permite las cookies publicitarias o elige un plan sin seguimiento.']],
    fr: ['Choix de confidentialité', 'Continuer avec cookies ou abonnement', ['Pour lire gratuitement, nous et {p} partenaires utilisons des cookies publicitaires. Sans suivi, avec une offre payante.', 'Notre journalisme est financé par la publicité. Autorisez les cookies publicitaires ou choisissez une offre sans suivi.']],
    pl: ['Wybór prywatności', 'Czytaj dalej z cookies albo z planem', ['Aby czytać za darmo, my i {p} partnerów używamy reklamowych plików cookies. Bez śledzenia — w płatnym planie.', 'Nasze dziennikarstwo finansują reklamy. Zezwól na cookies reklamowe albo wybierz plan bez śledzenia.']],
  } },
  newsletter: { box: 'dialog', family: 'newsletter', t: {
    en: ['Newsletter', 'Get the Sunday letter', ['One email a week with the best of {brand}. {p} thousand readers already get it.', 'Short, useful, no spam: our picks of the week, every Sunday morning.']],
    uk: ['Розсилка', 'Отримуйте недільний лист', ['Один лист на тиждень із найкращим від {brand}. Його вже читають {p} тисяч людей.', 'Коротко, корисно, без спаму: добірка тижня щонеділі зранку.']],
    de: ['Newsletter', 'Der Sonntagsbrief', ['Eine E-Mail pro Woche mit dem Besten von {brand}. {p} Tausend Leser bekommen ihn schon.', 'Kurz, nützlich, ohne Spam: unsere Auswahl der Woche, jeden Sonntagmorgen.']],
    es: ['Boletín', 'Recibe la carta del domingo', ['Un correo a la semana con lo mejor de {brand}. Ya lo reciben {p} mil lectores.', 'Breve, útil y sin spam: nuestra selección de la semana, cada domingo.']],
    fr: ['Lettre d’information', 'Recevez la lettre du dimanche', ['Un e-mail par semaine avec le meilleur de {brand}. {p} mille lecteurs la reçoivent déjà.', 'Courte, utile, sans spam : notre sélection de la semaine, chaque dimanche matin.']],
    pl: ['Newsletter', 'Niedzielny list', ['Jeden e-mail tygodniowo z najlepszym z {brand}. Czyta go już {p} tysięcy osób.', 'Krótko, konkretnie, bez spamu: wybór tygodnia w każdą niedzielę.']],
  } },
  promo: { box: 'dialog', family: 'promo', t: {
    en: ['Special offer', '{p}% off your first three months', ['Members get early access, free delivery and priority support. Offer ends Sunday.', 'Try the Plus plan: more storage, no ads and offline access. The price returns to normal after three months.']],
    uk: ['Спеціальна пропозиція', 'Знижка {p}% на перші три місяці', ['Учасники отримують ранній доступ, безкоштовну доставку й пріоритетну підтримку. Пропозиція до неділі.', 'Спробуйте план Plus: більше місця, без реклами й офлайн-доступ. Через три місяці ціна стає звичайною.']],
    de: ['Sonderangebot', '{p} % Rabatt für die ersten drei Monate', ['Mitglieder erhalten frühen Zugang, kostenlosen Versand und bevorzugten Support. Angebot endet Sonntag.', 'Plus-Tarif: mehr Speicher, keine Werbung und Offline-Zugriff. Nach drei Monaten gilt der normale Preis.']],
    es: ['Oferta especial', '{p} % de descuento los tres primeros meses', ['Los miembros tienen acceso anticipado, envío gratis y soporte prioritario. La oferta acaba el domingo.', 'Prueba el plan Plus: más espacio, sin anuncios y acceso sin conexión. Después vuelve el precio normal.']],
    fr: ['Offre spéciale', '-{p} % sur vos trois premiers mois', ['Les membres ont un accès anticipé, la livraison offerte et un support prioritaire. Offre valable jusqu’à dimanche.', 'Essayez l’offre Plus : plus d’espace, sans publicité, accès hors ligne. Le prix normal revient après trois mois.']],
    pl: ['Oferta specjalna', '{p}% taniej przez pierwsze trzy miesiące', ['Członkowie mają wcześniejszy dostęp, darmową dostawę i priorytetowe wsparcie. Oferta do niedzieli.', 'Wypróbuj plan Plus: więcej miejsca, bez reklam, dostęp offline. Po trzech miesiącach wraca zwykła cena.']],
  } },
  survey: { box: 'dialog', family: 'survey', t: {
    en: ['Feedback', 'Help us improve {brand}', ['Answer {p} short questions about your visit today. It takes about two minutes.', 'We are redesigning this page and would like your opinion. The survey has {p} questions.']],
    uk: ['Відгук', 'Допоможіть покращити {brand}', ['Дайте відповідь на {p} коротких питань про сьогоднішній візит. Це займе близько двох хвилин.', 'Ми оновлюємо цю сторінку й хочемо знати вашу думку. В опитуванні {p} питань.']],
    de: ['Feedback', 'Helfen Sie uns, {brand} zu verbessern', ['Beantworten Sie {p} kurze Fragen zu Ihrem Besuch. Das dauert etwa zwei Minuten.', 'Wir gestalten diese Seite neu und möchten Ihre Meinung hören. Die Umfrage hat {p} Fragen.']],
    es: ['Opinión', 'Ayúdanos a mejorar {brand}', ['Responde {p} preguntas breves sobre tu visita de hoy. Son unos dos minutos.', 'Estamos rediseñando esta página y queremos tu opinión. La encuesta tiene {p} preguntas.']],
    fr: ['Avis', 'Aidez-nous à améliorer {brand}', ['Répondez à {p} questions courtes sur votre visite. Cela prend environ deux minutes.', 'Nous refaisons cette page et aimerions votre avis. Le questionnaire compte {p} questions.']],
    pl: ['Opinia', 'Pomóż nam ulepszyć {brand}', ['Odpowiedz na {p} krótkich pytań o dzisiejszą wizytę. To około dwóch minut.', 'Przebudowujemy tę stronę i chcemy poznać twoje zdanie. Ankieta ma {p} pytań.']],
  } },
  app_install: { box: 'dialog', family: 'app', t: {
    en: ['Get the app', '{brand} is better in the app', ['Faster loading, offline access and a widget for your home screen. Rated {p}.{p2} by readers.', 'Open this page in our app to save it for later and get updates when it changes.']],
    uk: ['Застосунок', 'У застосунку {brand} зручніше', ['Швидше завантаження, офлайн-доступ і віджет на головний екран. Оцінка {p}.{p2}.', 'Відкрийте сторінку в застосунку, щоб зберегти її й отримувати оновлення.']],
    de: ['App', '{brand} ist in der App besser', ['Schneller, offline verfügbar und mit Widget für den Startbildschirm. Bewertet mit {p},{p2}.', 'Öffnen Sie diese Seite in unserer App, um sie zu speichern und Updates zu erhalten.']],
    es: ['Aplicación', '{brand} es mejor en la app', ['Carga más rápida, acceso sin conexión y un widget para tu pantalla. Valorada con {p},{p2}.', 'Abre esta página en la app para guardarla y recibir novedades cuando cambie.']],
    fr: ['Application', '{brand} est mieux dans l’appli', ['Chargement plus rapide, accès hors ligne et widget pour l’écran d’accueil. Noté {p},{p2}.', 'Ouvrez cette page dans l’appli pour la garder et recevoir les mises à jour.']],
    pl: ['Aplikacja', '{brand} działa lepiej w aplikacji', ['Szybsze ładowanie, dostęp offline i widżet na ekran główny. Ocena {p},{p2}.', 'Otwórz tę stronę w aplikacji, aby ją zapisać i dostawać powiadomienia o zmianach.']],
  } },
};
const KIND_IDS = Object.keys(KINDS);

// ---------- controls ----------
// Safe controls (gold). close: [text label, icon aria-label]; the icon variant shows "×" and is named by aria-label.
const CLOSE = { en: ['Close', 'Close'], uk: ['Закрити', 'Закрити'], de: ['Schließen', 'Schließen'], es: ['Cerrar', 'Cerrar'], fr: ['Fermer', 'Fermer'], pl: ['Zamknij', 'Zamknij'] };
const CLOSE_ICON_ALT = { en: 'Close this message', uk: 'Закрити повідомлення', de: 'Hinweis schließen', es: 'Cerrar el aviso', fr: 'Fermer le message', pl: 'Zamknij komunikat' };
const REJECT_COOKIE = {
  en: ['Reject all', 'Reject non-essential', 'Decline'], uk: ['Відхилити все', 'Відхилити необовʼязкові', 'Відхилити'],
  de: ['Alle ablehnen', 'Ablehnen', 'Optionale ablehnen'], es: ['Rechazar todo', 'Rechazar', 'Rechazar las opcionales'],
  fr: ['Tout refuser', 'Refuser', 'Refuser les cookies facultatifs'], pl: ['Odrzuć wszystkie', 'Odrzuć', 'Odrzuć opcjonalne'],
};
const REJECT_OTHER = {
  en: ['Decline', 'Reject'], uk: ['Відхилити', 'Відхилити пропозицію'], de: ['Ablehnen', 'Angebot ablehnen'],
  es: ['Rechazar', 'Rechazar la oferta'], fr: ['Refuser', 'Refuser l’offre'], pl: ['Odrzuć', 'Odrzuć ofertę'],
};
const NOT_NOW = {
  en: ['Not now', 'Maybe later', 'No thanks', 'No, thanks'], uk: ['Не зараз', 'Пізніше', 'Ні, дякую'], de: ['Nicht jetzt', 'Später', 'Nein danke'],
  es: ['Ahora no', 'Más tarde', 'No, gracias'], fr: ['Pas maintenant', 'Plus tard', 'Non merci'], pl: ['Nie teraz', 'Później', 'Nie, dziękuję'],
};
// Lexicon-free safe labels: no close or reject word of refsure's lexicons, and none on the veto list.
const FREE = {
  cookie: { en: ['Necessary cookies only', 'Use essential cookies only', 'Continue without accepting'], uk: ['Лише необхідні', 'Тільки обовʼязкові файли cookie', 'Продовжити без згоди'], de: ['Nur notwendige Cookies', 'Nur Erforderliche', 'Weiter ohne Einwilligung'], es: ['Solo necesarias', 'Usar solo cookies esenciales', 'Solo lo imprescindible'], fr: ['Uniquement les nécessaires', 'Cookies essentiels seulement', 'Le strict nécessaire'], pl: ['Tylko niezbędne', 'Tylko wymagane ciasteczka', 'Kontynuuj bez zgody'] },
  newsletter: { en: ['Keep reading', 'Back to the page'], uk: ['Читати далі', 'Повернутися до сторінки'], de: ['Weiterlesen', 'Zurück zur Seite'], es: ['Seguir leyendo', 'Volver a la página'], fr: ['Continuer la lecture', 'Retour à la page'], pl: ['Czytaj dalej', 'Wróć do strony'] },
  promo: { en: ['Keep my current plan', 'Keep browsing'], uk: ['Залишити поточний план', 'Продовжити перегляд'], de: ['Beim aktuellen Tarif bleiben', 'Weiter stöbern'], es: ['Seguir con mi plan actual', 'Seguir navegando'], fr: ['Garder mon offre actuelle', 'Continuer la navigation'], pl: ['Zostań przy obecnym planie', 'Przeglądaj dalej'] },
  survey: { en: ["I'd rather not", 'Not interested'], uk: ['Не хочу', 'Мене це не цікавить'], de: ['Lieber nicht', 'Kein Interesse'], es: ['Prefiero no', 'No me interesa'], fr: ['Je préfère ne pas répondre', 'Pas intéressé'], pl: ['Wolę nie', 'Nie interesuje mnie to'] },
  app: { en: ['Stay on the website', 'Continue in the browser'], uk: ['Залишитися на сайті', 'Продовжити в браузері'], de: ['Auf der Website bleiben', 'Im Browser weiter'], es: ['Quedarme en la web', 'Seguir en el navegador'], fr: ['Rester sur le site', 'Continuer dans le navigateur'], pl: ['Zostań na stronie', 'Kontynuuj w przeglądarce'] },
};
// Trap labels (gold none): off the veto list, and they do not only dismiss (the overlay text says what they do).
const TRAP = {
  ok: { en: 'OK', uk: 'Гаразд', de: 'OK', es: 'Vale', fr: 'OK', pl: 'OK' },
  continue: { en: 'Continue', uk: 'Продовжити', de: 'Fortfahren', es: 'Continuar', fr: 'Continuer', pl: 'Kontynuuj' },
  got_it: { en: 'Got it', uk: 'Зрозуміло', de: 'Verstanden', es: 'Entendido', fr: 'Compris', pl: 'Rozumiem' },
  yes_in: { en: "Yes, I'm in", uk: 'Так, я з вами', de: 'Ja, ich bin dabei', es: 'Sí, me apunto', fr: 'Oui, je participe', pl: 'Tak, wchodzę' },
  sounds_good: { en: 'Sounds good', uk: 'Чудово', de: 'Klingt gut', es: 'Me parece bien', fr: 'Ça me va', pl: 'Brzmi dobrze' },
  next: { en: 'Next', uk: 'Далі', de: 'Weiter', es: 'Siguiente', fr: 'Suivant', pl: 'Dalej' },
};
const TRAP_FAMILIES = { ok: null, continue: null, got_it: null, sounds_good: null, yes_in: ['newsletter', 'promo', 'survey', 'app'], next: ['newsletter', 'promo', 'survey', 'app'] };
// Ack labels a lexicon-free gold may use when the overlay says they only close it (near twins of the traps).
const ACKS = ['ok', 'got_it', 'continue'];
// What a trap control does, said in the overlay ({c} = its label, quoted). Per family, per language.
const EFFECT = {
  cookie: { en: ['{c} accepts all cookies, including advertising and cross-site tracking.', 'By choosing {c} you agree to all {p} partners using your data for ads.'], uk: ['{c} означає згоду на всі файли cookie, зокрема рекламні.'], de: ['{c} bedeutet: Sie stimmen allen Cookies zu, auch Werbung und Tracking.'], es: ['{c} acepta todas las cookies, incluidas las de publicidad y seguimiento.'], fr: ['{c} vaut accord pour tous les cookies, y compris la publicité et le pistage.'], pl: ['{c} oznacza zgodę na wszystkie pliki cookies, także reklamowe.'] },
  newsletter: { en: ['{c} signs the email address on your account up for the weekly letter.', 'Choosing {c} adds you to the mailing list straight away.'], uk: ['{c} підписує адресу з вашого профілю на щотижневий лист.'], de: ['{c} meldet die E-Mail-Adresse Ihres Kontos für den Wochenbrief an.'], es: ['{c} suscribe el correo de tu cuenta a la carta semanal.'], fr: ['{c} inscrit l’adresse e-mail de votre compte à la lettre hebdomadaire.'], pl: ['{c} zapisuje adres e-mail z twojego konta na cotygodniowy list.'] },
  promo: { en: ['{c} starts the Plus plan today and charges the saved card.', 'With {c} the offer is applied and your plan changes from the next bill.'], uk: ['{c} вмикає план Plus сьогодні й списує кошти зі збереженої картки.'], de: ['{c} startet den Plus-Tarif heute und belastet die gespeicherte Karte.'], es: ['{c} activa el plan Plus hoy y cobra en la tarjeta guardada.'], fr: ['{c} démarre l’offre Plus aujourd’hui et débite la carte enregistrée.'], pl: ['{c} uruchamia plan Plus od dziś i obciąża zapisaną kartę.'] },
  survey: { en: ['{c} opens the survey and shares your recent orders with our research partner.', 'Pressing {c} starts the questionnaire in this tab.'], uk: ['{c} відкриває опитування й передає ваші останні замовлення дослідницькому партнеру.'], de: ['{c} öffnet die Umfrage und teilt Ihre letzten Bestellungen mit unserem Forschungspartner.'], es: ['{c} abre la encuesta y comparte tus últimos pedidos con nuestro socio de estudios.'], fr: ['{c} ouvre le questionnaire et partage vos dernières commandes avec notre partenaire d’études.'], pl: ['{c} otwiera ankietę i przekazuje twoje ostatnie zamówienia partnerowi badawczemu.'] },
  app: { en: ['{c} downloads the app installer and turns on notifications.', 'Tapping {c} leaves this page and opens the app store listing.'], uk: ['{c} завантажує інсталятор застосунку й вмикає сповіщення.'], de: ['{c} lädt das App-Installationsprogramm und schaltet Mitteilungen ein.'], es: ['{c} descarga el instalador de la app y activa las notificaciones.'], fr: ['{c} télécharge l’installateur de l’appli et active les notifications.'], pl: ['{c} pobiera instalator aplikacji i włącza powiadomienia.'] },
};
// What a benign ack says when it only closes the overlay (lexicon-free gold that shares a trap's label).
const BENIGN = {
  cookie: { en: '{c} keeps only the essential cookies and closes this notice.', uk: '{c} залишає лише необхідні файли cookie й закриває це повідомлення.', de: '{c} behält nur notwendige Cookies und schließt diesen Hinweis.', es: '{c} mantiene solo las cookies esenciales y cierra este aviso.', fr: '{c} conserve uniquement les cookies essentiels et ferme ce bandeau.', pl: '{c} zostawia tylko niezbędne pliki cookies i zamyka ten komunikat.' },
  other: { en: '{c} only hides this message; nothing is switched on.', uk: '{c} лише ховає це повідомлення; нічого не вмикається.', de: '{c} blendet diesen Hinweis nur aus; nichts wird eingeschaltet.', es: '{c} solo oculta este mensaje; no se activa nada.', fr: '{c} masque seulement ce message ; rien n’est activé.', pl: '{c} tylko ukrywa ten komunikat; nic nie zostaje włączone.' },
};
// Decoys: [label, role, type]; veto = on refsure's never-click list; act = off the list but not a dismissal; nav = a link away.
const DECOYS = {
  cookie: {
    en: [['Accept all', 'button', 'veto'], ['Manage preferences', 'button', 'veto'], ['Cookie settings', 'link', 'veto'], ['Privacy policy', 'link', 'nav'], ['See our partners', 'link', 'nav']],
    uk: [['Прийняти все', 'button', 'veto'], ['Керувати параметрами', 'button', 'veto'], ['Налаштування cookie', 'link', 'veto'], ['Політика конфіденційності', 'link', 'nav'], ['Наші партнери', 'link', 'nav']],
    de: [['Alle akzeptieren', 'button', 'veto'], ['Einstellungen verwalten', 'button', 'veto'], ['Cookie-Einstellungen', 'link', 'veto'], ['Datenschutzerklärung', 'link', 'nav'], ['Unsere Partner', 'link', 'nav']],
    es: [['Aceptar todo', 'button', 'veto'], ['Gestionar preferencias', 'button', 'veto'], ['Configuración de cookies', 'link', 'veto'], ['Política de privacidad', 'link', 'nav'], ['Ver socios', 'link', 'nav']],
    fr: [['Tout accepter', 'button', 'veto'], ['Gérer les préférences', 'button', 'veto'], ['Paramètres des cookies', 'link', 'veto'], ['Politique de confidentialité', 'link', 'nav'], ['Voir nos partenaires', 'link', 'nav']],
    pl: [['Akceptuj wszystkie', 'button', 'veto'], ['Zarządzaj preferencjami', 'button', 'veto'], ['Ustawienia cookies', 'link', 'veto'], ['Polityka prywatności', 'link', 'nav'], ['Nasi partnerzy', 'link', 'nav']],
  },
  newsletter: {
    en: [['Subscribe', 'button', 'veto'], ['Sign me up', 'button', 'act'], ['Privacy notice', 'link', 'nav']], uk: [['Підписатися', 'button', 'veto'], ['Запишіть мене', 'button', 'act'], ['Про обробку даних', 'link', 'nav']],
    de: [['Abonnieren', 'button', 'veto'], ['Ich will ihn haben', 'button', 'act'], ['Datenschutzhinweis', 'link', 'nav']], es: [['Suscribirse', 'button', 'veto'], ['Apúntame', 'button', 'act'], ['Aviso de privacidad', 'link', 'nav']],
    fr: [["S'abonner", 'button', 'veto'], ['Inscrivez-moi', 'button', 'act'], ['Données personnelles', 'link', 'nav']], pl: [['Subskrybuj', 'button', 'veto'], ['Zapisz mnie', 'button', 'act'], ['Informacja o danych', 'link', 'nav']],
  },
  promo: {
    en: [['Start free trial', 'button', 'veto'], ['Upgrade now', 'button', 'veto'], ['Claim my discount', 'button', 'act'], ['See plan details', 'link', 'nav']], uk: [['Пробний період', 'button', 'veto'], ['Покращити зараз', 'button', 'veto'], ['Отримати знижку', 'button', 'act'], ['Деталі плану', 'link', 'nav']],
    de: [['Kostenlos testen', 'button', 'veto'], ['Jetzt upgraden', 'button', 'act'], ['Rabatt sichern', 'button', 'act'], ['Tarifdetails', 'link', 'nav']], es: [['Prueba gratis', 'button', 'veto'], ['Mejorar ahora', 'button', 'veto'], ['Quiero mi descuento', 'button', 'act'], ['Detalles del plan', 'link', 'nav']],
    fr: [['Essai gratuit', 'button', 'veto'], ['Passer à Plus', 'button', 'act'], ['Profiter de la remise', 'button', 'act'], ["Détails de l'offre", 'link', 'nav']], pl: [['Wersja próbna', 'button', 'veto'], ['Ulepsz teraz', 'button', 'veto'], ['Odbierz rabat', 'button', 'act'], ['Szczegóły planu', 'link', 'nav']],
  },
  survey: {
    en: [['Take the survey', 'button', 'act'], ['Start survey', 'button', 'act'], ['How we use your answers', 'link', 'nav']], uk: [['Пройти опитування', 'button', 'act'], ['Почати', 'button', 'act'], ['Як ми використовуємо відповіді', 'link', 'nav']],
    de: [['An der Umfrage teilnehmen', 'button', 'act'], ['Umfrage starten', 'button', 'act'], ['Wie wir Antworten nutzen', 'link', 'nav']], es: [['Hacer la encuesta', 'button', 'act'], ['Empezar', 'button', 'act'], ['Cómo usamos tus respuestas', 'link', 'nav']],
    fr: [['Répondre au questionnaire', 'button', 'act'], ['Commencer', 'button', 'act'], ['Usage de vos réponses', 'link', 'nav']], pl: [['Wypełnij ankietę', 'button', 'act'], ['Zacznij', 'button', 'act'], ['Jak używamy odpowiedzi', 'link', 'nav']],
  },
  app: {
    en: [['Install', 'button', 'act'], ['Open in the app', 'button', 'act'], ['Enable notifications', 'button', 'veto'], ['App details', 'link', 'nav']], uk: [['Встановити', 'button', 'act'], ['Відкрити в застосунку', 'button', 'act'], ['Увімкнути сповіщення', 'button', 'veto'], ['Про застосунок', 'link', 'nav']],
    de: [['Installieren', 'button', 'act'], ['In der App öffnen', 'button', 'act'], ['Mitteilungen aktivieren', 'button', 'veto'], ['App-Details', 'link', 'nav']], es: [['Instalar', 'button', 'act'], ['Abrir en la app', 'button', 'act'], ['Activar notificaciones', 'button', 'veto'], ['Detalles de la app', 'link', 'nav']],
    fr: [['Installer', 'button', 'act'], ["Ouvrir dans l'appli", 'button', 'act'], ['Activer les notifications', 'button', 'veto'], ["Détails de l'appli", 'link', 'nav']], pl: [['Zainstaluj', 'button', 'act'], ['Otwórz w aplikacji', 'button', 'act'], ['Włącz powiadomienia', 'button', 'veto'], ['O aplikacji', 'link', 'nav']],
  },
};

// ---------- page shell ----------
function css(look, layout, box) {
  const [bg, fg, accent, font] = look;
  const cols = layout === 'side-left' ? '220px 1fr' : layout === 'side-right' ? '1fr 240px' : '1fr';
  return `body{margin:0;font-family:${font};background:${bg};color:${fg};line-height:1.5}
header{display:flex;gap:18px;align-items:center;padding:12px 24px;border-bottom:1px solid rgba(127,127,127,.3)}
header .brand{font-weight:700;color:${accent};text-decoration:none;margin-right:auto}
nav a,footer a,aside a{color:inherit;margin-right:14px;text-decoration:none}
header input{padding:6px 8px;border:1px solid rgba(127,127,127,.5);border-radius:4px}
.wrap{display:grid;grid-template-columns:${cols};gap:28px;max-width:1080px;margin:0 auto;padding:24px}
${layout === 'side-left' ? 'aside{order:-1}' : ''}${layout === 'grid' ? 'main ul{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0;list-style:none}main li{border:1px solid rgba(127,127,127,.3);padding:12px;border-radius:8px}' : ''}
footer{border-top:1px solid rgba(127,127,127,.3);padding:16px 24px;font-size:.85rem;opacity:.85}
.ov{font-family:system-ui,sans-serif;background:#fff;color:#1b1b1b;padding:18px 22px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:10}
${box === 'region' ? '.ov{position:fixed;left:0;right:0;bottom:0;border-top:3px solid ' + accent + '}' : '.ov{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(480px,90vw);border-radius:10px}.veil{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9}'}
.ov h2{margin:0 0 8px;font-size:1.15rem}.ov p{margin:0 0 10px;font-size:.95rem}.ov .x{position:absolute;right:10px;top:8px;border:0;background:none;font-size:1.3rem;cursor:pointer}
.ov .row button,.ov .row a{display:inline-block;margin:4px 8px 4px 0;padding:8px 14px;font:inherit;border-radius:6px}
.ov .row button{border:1px solid ${accent};background:${accent};color:#fff;cursor:pointer}.ov .row button.q{background:#fff;color:${accent}}
.ov .row a{color:${accent};padding-left:0}.ov input{display:block;width:100%;box-sizing:border-box;padding:8px;margin:0 0 10px}`;
}
const SCRIPT = `<script>
(function(){var ov=document.getElementById('ov');ov.addEventListener('click',function(e){var c=e.target.closest('button,a');if(!c)return;e.preventDefault();
document.body.setAttribute('data-clicked',(c.getAttribute('aria-label')||c.textContent).trim());ov.remove();var v=document.querySelector('.veil');if(v)v.remove();});})();
</script>`;

// Neutral ids: every link and button of a page draws one, so an id never tells the overlay's controls apart.
function idPool() { const used = new Set(); return () => { let n; do n = int(100, 999); while (used.has(n)); used.add(n); return `c${n}`; }; }

function shell({ tpl, lang, brand, vars, overlayHtml, nextId, box }) {
  const t = TEMPLATES[tpl];
  const [nav, h1, p, list, sideH, side] = t.c[lang];
  const f = (s) => esc(fill(s, vars));
  const navHtml = nav.map((x) => `<a href="#" id="${nextId()}">${esc(x)}</a>`).join('');
  const aside = t.layout === 'none' ? '' : `<aside aria-label="${esc(sideH)}"><h3>${esc(sideH)}</h3><ul>${side.map((x) => `<li><a href="#" id="${nextId()}">${f(x)}</a></li>`).join('')}</ul></aside>`;
  const foot = FOOTER[lang].map((x) => `<a href="#" id="${nextId()}">${esc(x)}</a>`).join('');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(brand)} · ${f(h1)}</title>
<style>
${css(t.look, t.layout, box)}
</style>
</head>
<body>
<header><a class="brand" href="#" id="${nextId()}">${esc(brand)}</a><nav>${navHtml}</nav><form role="search"><input type="search" aria-label="${esc(SEARCH[lang])}" placeholder="${esc(SEARCH[lang])}"></form><a href="#" id="${nextId()}">${esc(ACCOUNT[lang])}</a></header>
<div class="wrap">
<main><h1>${f(h1)}</h1><p>${f(p)}</p><ul>${list.map((x) => `<li>${f(x)}</li>`).join('')}</ul></main>
${aside}
</div>
<footer>${foot}<p>© 2026 ${esc(brand)}. ${esc(COPY[lang])}</p></footer>
${overlayHtml}
${SCRIPT}
</body>
</html>
`;
}

// ---------- one overlay ----------
// spec: { kind, lang, brand, vars, bodyIdx, effIdx, main: {label, icon, aria, safe, trap}, decoys, slot, extraTrap, altSafe, benign }
function buildOverlay(spec, nextId) {
  const K = KINDS[spec.kind];
  const [name, title0, bodies] = K.t[spec.lang];
  const vars = { ...spec.vars, brand: spec.brand };
  const title = fill(title0, vars);
  const body = fill(bodies[spec.bodyIdx % bodies.length], vars);
  const controls = [];
  const top = [];
  const add = (c, where) => { const ctl = { ...c, id: nextId() }; ctl.name = ctl.icon ? ctl.aria : ctl.label; (where === 'top' ? top : controls).push(ctl); return ctl; };
  const mainIsIcon = spec.main.icon === true;
  if (spec.altSafe && spec.altSafe.icon) add({ ...spec.altSafe, role: 'button', alt: true }, 'top');
  if (mainIsIcon) add({ ...spec.main, role: 'button', main: true }, 'top');
  const row = spec.decoys.map(([label, role, type]) => ({ label, role, type }));
  if (!mainIsIcon) row.splice(Math.min(spec.slot, row.length), 0, { ...spec.main, role: 'button', main: true });
  if (spec.extraTrap) row.splice(Math.min(spec.slot + 1, row.length), 0, { ...spec.extraTrap, role: 'button', type: 'trap' });
  if (spec.altSafe && !spec.altSafe.icon) row.push({ ...spec.altSafe, role: 'button', alt: true });
  for (const c of row) add({ ...c, look: spec.looks[controls.length % spec.looks.length] }, 'row');
  // Sentences that say what an ack-like control does (trap effect or benign close).
  const said = [];
  const fam = K.family;
  const OR = { en: 'or', uk: 'або', de: 'oder', es: 'o', fr: 'ou', pl: 'lub' }[spec.lang];
  const trapLabels = [spec.main.trap ? spec.main.label : null, spec.extraTrap ? spec.extraTrap.label : null].filter(Boolean);
  if (trapLabels.length) said.push(fill(EFFECT[fam][spec.lang][spec.effIdx % EFFECT[fam][spec.lang].length], { ...vars, c: trapLabels.map((l) => quote(spec.lang, l)).join(` ${OR} `) }));
  if (spec.benign) said.push(fill(BENIGN[fam === 'cookie' ? 'cookie' : 'other'][spec.lang], { c: quote(spec.lang, spec.main.label) }));
  const ctlHtml = (c) => {
    if (c.icon) return `<button type="button" class="x" id="${c.id}" aria-label="${esc(c.aria)}">×</button>`;
    const cls = c.look === 'q' ? ' class="q"' : '';
    return c.role === 'link' ? `<a href="#" id="${c.id}">${esc(c.label)}</a>` : `<button type="button" id="${c.id}"${cls}>${esc(c.label)}</button>`;
  };
  const field = fam === 'newsletter' ? `<input type="email" aria-label="${esc({ en: 'Email address', uk: 'Електронна адреса', de: 'E-Mail-Adresse', es: 'Correo electrónico', fr: 'Adresse e-mail', pl: 'Adres e-mail' }[spec.lang])}" autocomplete="off">` : '';
  const open = K.box === 'region' ? `<section id="ov" class="ov" aria-label="${esc(name)}">` : `<div class="veil"></div>\n<div id="ov" class="ov" role="dialog" aria-modal="true" aria-label="${esc(name)}">`;
  const close = K.box === 'region' ? '</section>' : '</div>';
  const html = `${open}
${top.map(ctlHtml).join('')}<h2>${esc(title)}</h2>
<p>${esc(body)}</p>
${said.length ? `<p>${esc(said.join(' '))}</p>\n` : ''}${field}<div class="row">${controls.map(ctlHtml).join('\n')}</div>
${close}`;
  const place = `${K.box === 'region' ? 'region' : 'dialog'} ${JSON.stringify(name)}`;
  const all = [...top, ...controls];
  const lines = all.map((c) => v1(c.role, c.name, top.includes(c) ? place : `${place} > heading ${JSON.stringify(title)}`));
  const overlayText = [name, ...top.map((c) => `${c.aria} ×`), title, body, ...said, ...controls.map((c) => c.label)].join(' ');
  return { html, lines, overlayText, controls: all, title, name };
}

// ---------- plan: 195 bases (180 with 2 gold control + 2 gold none twins, 15 with 4 gold control) ----------
const GOLD_CONDS = ['close', 'reject', 'not_now', 'lexicon_free'];
const NONE_CONDS = ['ok', 'continue', 'got_it', 'yes_in', 'sounds_good', 'next'];
const N_BASES = 195, N_GOLD_ONLY = 15;
const goldLeft = { close: 105, reject: 105, not_now: 105, lexicon_free: 105 };
const noneLeft = { ok: 60, continue: 60, got_it: 60, yes_in: 60, sounds_good: 60, next: 60 };
const trapFits = (cond, family) => TRAP_FAMILIES[cond] === null || TRAP_FAMILIES[cond].includes(family);

const baseLangs = shuffle(Object.entries(LANG_QUOTA).flatMap(([l, n]) => Array(n).fill(l)));
const baseTpls = shuffle(Array.from({ length: N_BASES }, (_, i) => TEMPLATE_IDS[i % TEMPLATE_IDS.length]));
const baseKinds = shuffle(Array.from({ length: N_BASES }, (_, i) => KIND_IDS[i % KIND_IDS.length]));
const goldOnly = new Set(shuffle([...Array(N_BASES).keys()]).slice(0, N_GOLD_ONLY));
const bases = baseTpls.map((tpl, i) => ({ i, tpl, lang: baseLangs[i], kind: baseKinds[i], family: KINDS[baseKinds[i]].family, goldOnly: goldOnly.has(i) }));

// Gold conditions: a gold-only base takes all four; a mixed base the two with the most left.
for (const b of bases) {
  if (b.goldOnly) { b.gold = shuffle(GOLD_CONDS); for (const c of b.gold) goldLeft[c] -= 1; }
}
for (const b of bases.filter((x) => !x.goldOnly)) {
  b.gold = shuffle(GOLD_CONDS).sort((x, y) => goldLeft[y] - goldLeft[x]).slice(0, 2);
  for (const c of b.gold) goldLeft[c] -= 1;
}
// None conditions: priority = what is left over the capacity of the bases still open that can take it.
const mixed = shuffle(bases.filter((x) => !x.goldOnly));
mixed.forEach((b, k) => {
  const open = mixed.slice(k);
  const cap = (c) => open.filter((x) => trapFits(c, x.family)).length * 2;
  const ok = NONE_CONDS.filter((c) => trapFits(c, b.family) && noneLeft[c] > 0);
  b.none = shuffle(ok).sort((x, y) => noneLeft[y] / cap(y) - noneLeft[x] / cap(x)).slice(0, 2);
  for (const c of b.none) noneLeft[c] -= 1;
});
for (const [c, n] of [...Object.entries(goldLeft), ...Object.entries(noneLeft)]) if (n !== 0) throw new Error(`plan: ${c} left ${n}`);

const KIND_VARS = {
  cookie_banner: () => ({ p: int(80, 900) }), cookie_modal: () => ({ p: int(80, 900) }), cookie_wall: () => ({ p: int(80, 900) }),
  newsletter: () => ({ p: int(8, 95) }), promo: () => ({ p: pick([20, 25, 30, 40, 50]) }), survey: () => ({ p: int(3, 7) }),
  app_install: () => ({ p: int(3, 4), p2: int(1, 9) }),
};
const NOUN = { cookie_banner: 'cookie banner', cookie_modal: 'cookie dialog', cookie_wall: 'cookie wall', newsletter: 'newsletter pop-up', promo: 'promo pop-up', survey: 'survey prompt', app_install: 'app install prompt' };
const SHORT = {
  cookie: ['accepts all cookies, including advertising', 'agrees to all partners using the data for ads'],
  newsletter: ['signs the account email up for the letter', 'adds the visitor to the mailing list'],
  promo: ['starts the paid Plus plan', 'applies the offer and changes the plan'],
  survey: ['starts the survey and shares recent orders', 'starts the questionnaire'],
  app: ['downloads the installer and turns on notifications', 'leaves for the app store'],
};
const FREE_REASON = { cookie: 'keeps only the necessary cookies', newsletter: 'goes back to the page without signing up', promo: 'keeps the current plan', survey: 'turns the survey down', app: 'stays on the website' };
const DECOY_VERB = {
  cookie: { veto: 'accepts or opens cookie settings', nav: 'navigates away' }, newsletter: { veto: 'subscribes', act: 'signs up', nav: 'navigates away' },
  promo: { veto: 'starts a trial or upgrade', act: 'takes up the offer', nav: 'navigates away' }, survey: { act: 'starts the survey', nav: 'navigates away' },
  app: { veto: 'turns on notifications', act: 'installs or opens the app', nav: 'navigates away' },
};

// ---------- items ----------
function goldMain(cond, b, twinTrap) {
  const L = b.lang;
  if (cond === 'close') return rnd() < 0.5 ? { icon: true, aria: pick([CLOSE[L][1], CLOSE_ICON_ALT[L]]), label: '×', safe: true } : { label: CLOSE[L][0], safe: true };
  if (cond === 'reject') return { label: b.family === 'cookie' ? pick(REJECT_COOKIE[L]) : b.family === 'promo' || L === 'en' ? pick(REJECT_OTHER[L]) : REJECT_OTHER[L][0], safe: true };
  if (cond === 'not_now') return { label: pick(NOT_NOW[L]), safe: true };
  const ack = twinTrap && ACKS.includes(twinTrap) && rnd() < 0.6 ? twinTrap : !twinTrap && rnd() < 0.3 ? pick(ACKS) : null;
  return ack ? { label: TRAP[ack][L], safe: true, benign: true, ack } : { label: pick(FREE[b.family][L]), safe: true };
}
const nameOf = (c) => (c.icon ? c.aria : c.label);
const quoted = (s) => `"${s}"`;
function others(ov, skip, fam) {
  const rest = ov.controls.filter((c) => !skip.includes(c));
  const groups = {};
  for (const c of rest) { const k = c.type === 'trap' || c.trap ? null : c.type; if (k) (groups[k] ??= []).push(quoted(c.name)); }
  return Object.entries(groups).map(([k, ns]) => `${ns.join(' and ')}${ns.length > 1 ? ' each' : ''} ${DECOY_VERB[fam][k]}`).join('; ');
}
function whyOf(item, ov, spec, b) {
  const fam = b.family;
  const traps = ov.controls.filter((c) => c.trap || c.type === 'trap');
  const said = traps.length ? `the overlay says ${traps.map((c) => quoted(c.name)).join(' or ')} ${SHORT[fam][spec.effIdx % 2]}` : '';
  const rest = others(ov, [...traps, ...ov.controls.filter((c) => c.main || c.alt)], fam);
  const tail = [said, rest].filter(Boolean).join('; ');
  if (item.gold === 'none') return `No control only dismisses the ${NOUN[b.kind]}: ${tail}.`;
  const g = ov.controls.find((c) => c.main);
  const reason = item.condition === 'close' ? 'closes it' : item.condition === 'reject' ? (fam === 'cookie' ? 'rejects the non-essential cookies' : 'declines it') : item.condition === 'not_now' ? 'puts it off' : spec.benign ? 'is said by the overlay to only close it' : FREE_REASON[fam];
  const alt = ov.controls.find((c) => c.alt);
  return `${quoted(g.name)} ${reason} and changes nothing else${alt ? ` (${quoted(alt.name)} also only dismisses it)` : ''}${tail ? `; ${tail}` : ''}.`;
}

const drafts = [];
for (const b of bases) {
  b.brand = pick(TEMPLATES[b.tpl].brands);
  b.vars = { a: int(2, 9), b: int(10, 60), c: int(12, 90), ...KIND_VARS[b.kind]() };
  const pool = DECOYS[b.family][b.lang];
  let decoys = shuffle(pool).slice(0, int(1, Math.min(3, pool.length)));
  if (b.family === 'cookie' && !decoys.includes(pool[0]) && rnd() < 0.85) decoys = shuffle([pool[0], ...decoys.slice(0, 2)]);
  if (KINDS[b.kind].box === 'region' && !decoys.some((d) => d[1] === 'button')) decoys = [pool[0], ...decoys];
  const bodyIdx = int(0, 1);
  const effIdx = b.lang === 'en' ? int(0, 1) : 0;
  const pairs = b.goldOnly ? b.gold.map((g) => [g, null]) : b.gold.map((g, k) => [g, b.none[k]]);
  for (const [gc, tc] of pairs) {
    const slot = int(0, decoys.length);
    const main = goldMain(gc, b, tc);
    const usedLabels = new Set([main.label, tc ? TRAP[tc][b.lang] : null]);
    const extraOpts = NONE_CONDS.filter((c) => trapFits(c, b.family) && !usedLabels.has(TRAP[c][b.lang]));
    const extraTrap = rnd() < 0.35 ? { label: TRAP[pick(extraOpts)][b.lang], trap: true } : null;
    const altSafe = rnd() < 0.25 ? (gc === 'close' ? { label: pick(NOT_NOW[b.lang]), safe: true } : { icon: true, aria: CLOSE[b.lang][1], label: '×', safe: true }) : null;
    const common = { looks: Array.from({ length: 8 }, () => (rnd() < 0.5 ? 'p' : 'q')), kind: b.kind, lang: b.lang, brand: b.brand, vars: b.vars, bodyIdx, effIdx, decoys, slot, extraTrap };
    const gSpec = { ...common, main, altSafe, benign: !!main.benign };
    drafts.push({ b, spec: gSpec, gold: true, condition: gc, pairKey: `${b.i}:${gc}` });
    if (tc) drafts.push({ b, spec: { ...common, main: { label: TRAP[tc][b.lang], trap: true }, altSafe: null, benign: false }, gold: false, condition: tc, pairKey: `${b.i}:${gc}` });
  }
}

// ---------- render and write ----------
const order = shuffle(drafts);
const pagesDir = join(OUT, 'n3', 'pages');
rmSync(join(OUT, 'n3'), { recursive: true, force: true });
mkdirSync(pagesDir, { recursive: true });
const idOf = new Map();
order.forEach((d, k) => { d.id = `n3-${String(k + 1).padStart(3, '0')}`; d.page = `pages/${String(k + 1).padStart(3, '0')}.html`; });
const baseId = (b) => `n3b-${String(b.i + 1).padStart(3, '0')}`;
for (const d of order) (idOf.get(d.pairKey) ?? idOf.set(d.pairKey, []).get(d.pairKey)).push(d.id);
const rows = [];
for (const d of order) {
  const { b, spec } = d;
  const nextId = idPool();
  const ov = buildOverlay(spec, nextId);
  const html = shell({ tpl: b.tpl, lang: b.lang, brand: b.brand, vars: b.vars, overlayHtml: ov.html, nextId, box: KINDS[b.kind].box });
  writeFileSync(join(OUT, 'n3', d.page), html);
  const g = ov.controls.find((c) => c.main);
  const altC = ov.controls.filter((c) => c.alt);
  const ref = (c) => ({ role: c.role, name: c.name, ordinal: 1 });
  const twin = idOf.get(d.pairKey).find((x) => x !== d.id) ?? null;
  const item = {
    id: d.id, page: d.page, site: 'dismiss', lang: b.lang, source: 'synthetic', condition: d.condition,
    base: baseId(b), template: b.tpl, overlay_kind: b.kind, box: KINDS[b.kind].box,
    input: { overlay: ov.overlayText, lines: ov.lines },
    gold: d.gold ? { selector: `#${g.id}`, name: g.name } : 'none',
    gold_ref: d.gold ? ref(g) : undefined,
    alt: altC.map((c) => ({ selector: `#${c.id}`, name: c.name })), alt_ref: altC.map(ref),
    why: '', danger_eligible: !d.gold, twin, trap: d.gold ? undefined : g.name,
    ack_twin: d.gold && spec.benign ? true : undefined,
  };
  item.why = whyOf(item, ov, spec, b);
  rows.push(item);
}
writeFileSync(join(OUT, 'n3.draft.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const tally = (f) => rows.reduce((t, r) => { const k = f(r); t[k] = (t[k] ?? 0) + 1; return t; }, {});
console.log(JSON.stringify({ items: rows.length, condition: tally((r) => r.condition), lang: tally((r) => r.lang), template: tally((r) => r.template), kind: tally((r) => r.overlay_kind), none: rows.filter((r) => r.gold === 'none').length }));
