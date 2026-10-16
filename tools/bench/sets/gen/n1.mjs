// Set N1 (benchmark protocol 3.5): held-out `locate` items. A recorded element on a "before" page, the candidates
// on a drifted "after" page of the same synthetic site (edited copy, moved, translated, rehashed ids, removed).
// Deterministic: plain Node, no dependencies, fixed seed. Run: node tools/bench/sets/gen/n1.mjs
// Writes tools/bench/sets/n1/pages/BBB/{before,after}.html (one pair per base) and tools/bench/sets/n1.draft.jsonl.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = 'refsure-bench-n1-20261016';
const SETS = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PAGES = join(SETS, 'n1', 'pages');
const OUT_ITEMS = join(SETS, 'n1.draft.jsonl');
const LANGS = ['en', 'uk', 'de', 'es', 'pl'];
const LANG_NAME = { en: 'English', uk: 'Ukrainian', de: 'German', es: 'Spanish', pl: 'Polish' };

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
// A text in five languages: 'en|uk|de|es|pl'; each part may carry an edited variant after '~'.
function L(s) {
  const parts = s.split('|');
  if (parts.length !== LANGS.length) throw new Error(`need ${LANGS.length} languages: ${s}`);
  const out = {};
  LANGS.forEach((lang, i) => { const [orig, edited] = parts[i].split('~'); out[lang] = { orig: orig.trim(), edited: (edited ?? '').trim() || null }; });
  return out;
}
// An element: key, role, risk ('w' write / 'r' read), names, and the key of a near look-alike on the same site.
const E = (key, role, risk, names, near = null) => ({ key, role, risk: risk === 'w' ? 'write' : 'read', names: L(names), near });
// A section: key, heading, one sentence of copy, elements; `form` names a form wrapper.
const S = (key, heading, copy, els, form = null) => ({ key, heading: heading ? L(heading) : null, copy: copy ? L(copy) : null, els, form: form ? L(form) : null });

const TEMPLATES = [];
const T = (t) => TEMPLATES.push(t);

// ---------- templates (site kinds) ----------
T({
  id: 'shop', kind: 'online shop, product page', layout: 'right', theme: ['#fbfaf7', '#1d1d1f', '#c2410c', 'Georgia, serif'],
  title: L('Trail running jacket|Бігова куртка для трейлу|Trailrunning-Jacke|Chaqueta de trail running|Kurtka do biegania w terenie'),
  intro: L('Lightweight, packable and windproof, with taped seams for wet mornings.|Легка, компактна й вітрозахисна, з проклеєними швами для вологого ранку.|Leicht, packbar und winddicht, mit verklebten Nähten für nasse Morgen.|Ligera, plegable y cortavientos, con costuras selladas para mañanas húmedas.|Lekka, składana i wiatroszczelna, z klejonymi szwami na mokre poranki.'),
  head: [
    E('search', 'searchbox', 'r', 'Search products~Search the shop|Пошук товарів~Шукати в магазині|Produkte suchen~Im Shop suchen|Buscar productos~Buscar en la tienda|Szukaj produktów~Szukaj w sklepie'),
    E('cart', 'link', 'r', 'Cart~Basket|Кошик~Мій кошик|Warenkorb~Einkaufswagen|Carrito~Cesta|Koszyk~Mój koszyk', 'wish'),
  ],
  nav: [
    E('women', 'link', 'r', 'Women~Womenswear|Жінкам~Для жінок|Damen~Für Damen|Mujer~Moda mujer|Kobiety~Dla kobiet', 'men'),
    E('men', 'link', 'r', 'Men~Menswear|Чоловікам~Для чоловіків|Herren~Für Herren|Hombre~Moda hombre|Mężczyźni~Dla mężczyzn', 'women'),
    E('sale', 'link', 'r', 'Sale~Offers|Розпродаж~Знижки|Sale~Angebote|Rebajas~Ofertas|Wyprzedaż~Promocje'),
  ],
  main: [
    S('buy', 'Choose your size~Size and colour|Оберіть розмір~Розмір і колір|Größe wählen~Größe und Farbe|Elige tu talla~Talla y color|Wybierz rozmiar~Rozmiar i kolor',
      'Fits true to size; if you are between sizes, take the larger one.|Розмір відповідає стандартному; якщо сумніваєтеся, беріть більший.|Fällt normal aus; zwischen zwei Größen lieber die größere nehmen.|Talla normal; si dudas entre dos, elige la mayor.|Rozmiar standardowy; w razie wątpliwości wybierz większy.', [
        E('addcart', 'button', 'w', 'Add to cart~Add to basket|Додати в кошик~Покласти в кошик|In den Warenkorb~Zum Warenkorb hinzufügen|Añadir al carrito~Añadir a la cesta|Dodaj do koszyka~Włóż do koszyka', 'buynow'),
        E('buynow', 'button', 'w', 'Buy now~Buy it now|Купити зараз~Купити одразу|Jetzt kaufen~Sofort kaufen|Comprar ahora~Comprar ya|Kup teraz~Kup od razu', 'addcart'),
        E('wish', 'button', 'w', 'Add to wishlist~Save to wishlist|Додати в обране~Зберегти в обране|Auf die Wunschliste~Auf die Merkliste|Añadir a favoritos~Guardar en favoritos|Dodaj do ulubionych~Zapisz w ulubionych', 'addcart'),
        E('gift', 'checkbox', 'w', 'This is a gift~Gift wrap this item|Це подарунок~Запакувати як подарунок|Als Geschenk~Als Geschenk verpacken|Es un regalo~Envolver para regalo|To prezent~Zapakuj na prezent'),
      ]),
    S('info', 'Details~Product details|Деталі~Опис товару|Details~Produktdetails|Detalles~Detalles del producto|Szczegóły~Szczegóły produktu',
      'Recycled shell fabric, two zip pockets and a reflective trim at the back.|Тканина з переробленого волокна, дві кишені на блискавці та світловідбивна смуга ззаду.|Obermaterial aus Recyclingfasern, zwei Reißverschlusstaschen und Reflexstreifen hinten.|Tejido reciclado, dos bolsillos con cremallera y ribete reflectante en la espalda.|Tkanina z recyklingu, dwie kieszenie na zamek i odblask z tyłu.', [
        E('sizeguide', 'link', 'r', 'Size guide~Sizing chart|Таблиця розмірів~Розмірна сітка|Größentabelle~Größenberater|Guía de tallas~Tabla de tallas|Tabela rozmiarów~Przewodnik po rozmiarach', 'care'),
        E('care', 'link', 'r', 'Care instructions~How to wash it|Догляд за виробом~Як прати|Pflegehinweise~Waschanleitung|Instrucciones de cuidado~Cómo lavarla|Instrukcja prania~Jak prać', 'sizeguide'),
        E('reviews', 'link', 'r', 'Read reviews~Customer reviews|Читати відгуки~Відгуки покупців|Bewertungen lesen~Kundenbewertungen|Leer opiniones~Opiniones de clientes|Przeczytaj opinie~Opinie klientów', 'writereview'),
        E('writereview', 'button', 'w', 'Write a review~Review this product|Написати відгук~Залишити відгук|Bewertung schreiben~Produkt bewerten|Escribir una opinión~Valorar este producto|Napisz opinię~Oceń produkt', 'reviews'),
      ]),
    S('delivery', 'Delivery~Shipping and returns|Доставка~Доставка і повернення|Lieferung~Versand und Rückgabe|Envío~Envíos y devoluciones|Dostawa~Dostawa i zwroty',
      'Orders placed before 2 pm leave the warehouse the same day.|Замовлення до 14:00 відправляємо того ж дня.|Bestellungen vor 14 Uhr verlassen das Lager am selben Tag.|Los pedidos antes de las 14:00 salen el mismo día.|Zamówienia złożone przed 14:00 wysyłamy tego samego dnia.', [
        E('checkdel', 'button', 'r', 'Check delivery date~See delivery options|Перевірити дату доставки~Варіанти доставки|Liefertermin prüfen~Lieferoptionen ansehen|Ver fecha de entrega~Ver opciones de envío|Sprawdź termin dostawy~Zobacz opcje dostawy', 'returns'),
        E('returns', 'link', 'r', 'Returns policy~Free returns|Умови повернення~Безкоштовне повернення|Rückgaberecht~Kostenlose Rücksendung|Política de devoluciones~Devoluciones gratis|Zasady zwrotów~Darmowe zwroty', 'checkdel'),
      ]),
  ],
  aside: S('also', 'Customers also viewed~You may also like|Також переглядали~Вам може сподобатися|Kunden sahen auch~Das könnte dir gefallen|Otros clientes vieron~También te puede gustar|Klienci oglądali też~Może ci się spodobać', null, [
    E('alsoA', 'link', 'r', 'Rain shell~Packable rain shell|Дощовик~Компактний дощовик|Regenjacke~Packbare Regenjacke|Chubasquero~Chubasquero plegable|Kurtka przeciwdeszczowa~Składana kurtka przeciwdeszczowa', 'alsoB'),
    E('alsoB', 'link', 'r', 'Merino base layer~Merino long sleeve|Термобілизна з мериносу~Мериносовий лонгслів|Merino-Funktionsshirt~Merino-Langarmshirt|Camiseta térmica de merino~Camiseta de merino de manga larga|Koszulka termoaktywna merino~Koszulka merino z długim rękawem', 'alsoA'),
  ]),
  foot: S('help', 'Help~Customer service|Допомога~Служба підтримки|Hilfe~Kundenservice|Ayuda~Atención al cliente|Pomoc~Obsługa klienta', null, [
    E('contact', 'link', 'r', 'Contact us~Get in touch|Зв’язатися з нами~Напишіть нам|Kontakt~Schreib uns|Contacto~Escríbenos|Kontakt~Napisz do nas'),
    E('newsletter', 'button', 'w', 'Subscribe to the newsletter~Get our emails|Підписатися на розсилку~Отримувати листи|Newsletter abonnieren~E-Mails erhalten|Suscribirse al boletín~Recibir correos|Zapisz się do newslettera~Otrzymuj e-maile'),
  ]),
  extra: S('bundle', 'Complete the look~Bundle and save|Доповніть образ~Комплект зі знижкою|Komplettiere den Look~Im Set sparen|Completa el look~Ahorra con el pack|Uzupełnij zestaw~Kup w zestawie taniej', null, [
    E('addbundle', 'button', 'w', 'Add both to cart~Add the set to cart|Додати обидва в кошик~Додати комплект у кошик|Beide in den Warenkorb~Set in den Warenkorb|Añadir ambos al carrito~Añadir el pack al carrito|Dodaj oba do koszyka~Dodaj zestaw do koszyka', 'addcart'),
  ]),
});
T({
  id: 'bank', kind: 'bank-like account dashboard', layout: 'left', theme: ['#f3f6f9', '#0f2233', '#0b6e4f', 'Verdana, sans-serif'],
  title: L('Your accounts|Ваші рахунки|Ihre Konten|Tus cuentas|Twoje konta'),
  intro: L('Balances update every few minutes. Card payments may take a day to appear.|Залишки оновлюються щокілька хвилин. Платежі карткою можуть з’явитися наступного дня.|Salden werden alle paar Minuten aktualisiert. Kartenzahlungen erscheinen oft erst am Folgetag.|Los saldos se actualizan cada pocos minutos. Los pagos con tarjeta pueden tardar un día.|Salda odświeżają się co kilka minut. Płatności kartą mogą pojawić się po dniu.'),
  head: [
    E('messages', 'link', 'r', 'Messages~Inbox|Повідомлення~Вхідні|Nachrichten~Postfach|Mensajes~Buzón|Wiadomości~Skrzynka'),
    E('logout', 'button', 'w', 'Log out~Sign out|Вийти~Завершити сеанс|Abmelden~Ausloggen|Cerrar sesión~Salir|Wyloguj~Wyloguj się'),
  ],
  nav: [
    E('accounts', 'link', 'r', 'Accounts~My accounts|Рахунки~Мої рахунки|Konten~Meine Konten|Cuentas~Mis cuentas|Konta~Moje konta'),
    E('payments', 'link', 'r', 'Payments~Payments and transfers|Платежі~Платежі та перекази|Zahlungen~Zahlungen und Überweisungen|Pagos~Pagos y transferencias|Płatności~Płatności i przelewy', 'cards'),
    E('cards', 'link', 'r', 'Cards~Debit and credit cards|Картки~Дебетові та кредитні картки|Karten~Debit- und Kreditkarten|Tarjetas~Tarjetas de débito y crédito|Karty~Karty debetowe i kredytowe', 'payments'),
    E('support', 'link', 'r', 'Support~Help centre|Підтримка~Довідковий центр|Support~Hilfe-Center|Soporte~Centro de ayuda|Wsparcie~Centrum pomocy'),
  ],
  main: [
    S('current', 'Current account~Everyday account|Поточний рахунок~Рахунок для щоденних витрат|Girokonto~Alltagskonto|Cuenta corriente~Cuenta del día a día|Konto osobiste~Konto na co dzień',
      'Available balance 2,418.60. Overdraft limit 500.00.|Доступний залишок 2 418,60. Ліміт овердрафту 500,00.|Verfügbarer Saldo 2.418,60. Dispositionsrahmen 500,00.|Saldo disponible 2.418,60. Límite de descubierto 500,00.|Dostępne saldo 2 418,60. Limit debetu 500,00.', [
        E('transfer', 'button', 'w', 'Transfer money~Send money|Переказати кошти~Надіслати гроші|Geld überweisen~Geld senden|Transferir dinero~Enviar dinero|Przelej pieniądze~Wyślij pieniądze', 'paybill'),
        E('paybill', 'button', 'w', 'Pay a bill~Pay bills|Оплатити рахунок~Оплата послуг|Rechnung bezahlen~Rechnungen zahlen|Pagar una factura~Pagar recibos|Zapłać rachunek~Opłać rachunki', 'transfer'),
        E('txns', 'link', 'r', 'View transactions~Recent activity|Переглянути операції~Останні операції|Umsätze ansehen~Letzte Umsätze|Ver movimientos~Actividad reciente|Zobacz transakcje~Ostatnie operacje', 'statement'),
        E('statement', 'link', 'r', 'Download statement~Get monthly statement|Завантажити виписку~Отримати місячну виписку|Kontoauszug herunterladen~Monatsauszug abrufen|Descargar extracto~Obtener extracto mensual|Pobierz wyciąg~Pobierz wyciąg miesięczny', 'txns'),
      ]),
    S('card', 'Debit card ending 4417~Card ending 4417|Дебетова картка *4417~Картка *4417|Debitkarte mit Endziffern 4417~Karte ****4417|Tarjeta de débito terminada en 4417~Tarjeta ****4417|Karta debetowa kończąca się na 4417~Karta ****4417',
      'Contactless and online payments are switched on.|Безконтактні та онлайн-платежі увімкнено.|Kontaktlose und Online-Zahlungen sind aktiviert.|Los pagos sin contacto y en línea están activados.|Płatności zbliżeniowe i internetowe są włączone.', [
        E('freeze', 'button', 'w', 'Freeze card~Temporarily lock card|Заморозити картку~Тимчасово заблокувати картку|Karte sperren~Karte vorübergehend sperren|Congelar tarjeta~Bloquear tarjeta temporalmente|Zamroź kartę~Tymczasowo zablokuj kartę', 'pin'),
        E('pin', 'button', 'r', 'Show PIN~View PIN|Показати PIN~Переглянути PIN|PIN anzeigen~PIN ansehen|Mostrar PIN~Ver PIN|Pokaż PIN~Wyświetl PIN', 'freeze'),
      ]),
    S('payees', 'Saved payees~Recipients|Збережені отримувачі~Отримувачі|Gespeicherte Empfänger~Empfänger|Beneficiarios guardados~Destinatarios|Zapisani odbiorcy~Odbiorcy',
      'Three payees saved. New payees need a one-time code.|Збережено трьох отримувачів. Новому отримувачу потрібен одноразовий код.|Drei Empfänger gespeichert. Neue Empfänger brauchen einen Einmalcode.|Tres beneficiarios guardados. Los nuevos necesitan un código de un solo uso.|Zapisano trzech odbiorców. Nowy odbiorca wymaga kodu jednorazowego.', [
        E('addpayee', 'button', 'w', 'Add payee~New recipient|Додати отримувача~Новий отримувач|Empfänger hinzufügen~Neuer Empfänger|Añadir beneficiario~Nuevo destinatario|Dodaj odbiorcę~Nowy odbiorca', 'removepayee'),
        E('removepayee', 'button', 'w', 'Remove a payee~Delete payee|Видалити отримувача~Прибрати отримувача|Empfänger entfernen~Empfänger löschen|Eliminar beneficiario~Borrar destinatario|Usuń odbiorcę~Skasuj odbiorcę', 'addpayee'),
      ]),
  ],
  aside: S('tools', 'Tools~Quick links|Інструменти~Швидкі посилання|Werkzeuge~Schnellzugriff|Herramientas~Accesos rápidos|Narzędzia~Szybkie linki', null, [
    E('rates', 'link', 'r', 'Exchange rates~Currency rates|Курси валют~Валютні курси|Wechselkurse~Devisenkurse|Tipos de cambio~Cotización de divisas|Kursy walut~Notowania walut'),
    E('alerts', 'checkbox', 'w', 'Text me large payments~SMS alerts for large payments|SMS про великі платежі~SMS-сповіщення про великі платежі|SMS bei großen Zahlungen~SMS-Hinweis bei großen Zahlungen|SMS por pagos grandes~Avisos SMS de pagos grandes|SMS o dużych płatnościach~Alerty SMS o dużych płatnościach'),
  ]),
  foot: S('legal', 'Legal~Legal information|Правова інформація~Юридична інформація|Rechtliches~Rechtliche Hinweise|Aviso legal~Información legal|Informacje prawne~Nota prawna', null, [
    E('privacy', 'link', 'r', 'Privacy notice~How we use your data|Повідомлення про конфіденційність~Як ми використовуємо дані|Datenschutzhinweis~Wie wir Daten nutzen|Aviso de privacidad~Cómo usamos tus datos|Informacja o prywatności~Jak używamy danych', 'fees'),
    E('fees', 'link', 'r', 'Fees and charges~Price list|Тарифи та комісії~Перелік тарифів|Gebühren und Entgelte~Preisverzeichnis|Comisiones y gastos~Lista de precios|Opłaty i prowizje~Cennik', 'privacy'),
  ]),
  extra: S('goals', 'Savings goals~Your goals|Цілі заощаджень~Ваші цілі|Sparziele~Deine Ziele|Metas de ahorro~Tus metas|Cele oszczędnościowe~Twoje cele', null, [
    E('newgoal', 'button', 'w', 'Create a goal~New goal|Створити ціль~Нова ціль|Ziel anlegen~Neues Ziel|Crear una meta~Nueva meta|Utwórz cel~Nowy cel'),
    E('movegoal', 'button', 'w', 'Move money to goal~Top up goal|Перевести кошти на ціль~Поповнити ціль|Geld aufs Ziel buchen~Ziel aufstocken|Mover dinero a la meta~Recargar meta|Przenieś środki na cel~Zasil cel', 'transfer'),
  ]),
});
T({
  id: 'saas', kind: 'SaaS workspace settings', layout: 'none', theme: ['#ffffff', '#18181b', '#4f46e5', 'system-ui, sans-serif'],
  title: L('Workspace settings|Налаштування робочого простору|Workspace-Einstellungen|Ajustes del espacio de trabajo|Ustawienia przestrzeni roboczej'),
  intro: L('Changes apply to everyone in this workspace.|Зміни застосовуються до всіх у цьому просторі.|Änderungen gelten für alle in diesem Workspace.|Los cambios se aplican a todos en este espacio.|Zmiany dotyczą wszystkich w tej przestrzeni.'),
  head: [
    E('account', 'link', 'r', 'My account~Account|Мій акаунт~Акаунт|Mein Konto~Konto|Mi cuenta~Cuenta|Moje konto~Konto'),
    E('docs', 'link', 'r', 'Help~Documentation|Довідка~Документація|Hilfe~Dokumentation|Ayuda~Documentación|Pomoc~Dokumentacja'),
  ],
  nav: [
    E('dash', 'link', 'r', 'Dashboard~Overview|Панель~Огляд|Dashboard~Übersicht|Panel~Resumen|Pulpit~Przegląd'),
    E('projects', 'link', 'r', 'Projects~All projects|Проєкти~Усі проєкти|Projekte~Alle Projekte|Proyectos~Todos los proyectos|Projekty~Wszystkie projekty'),
    E('team', 'link', 'r', 'Team~Members|Команда~Учасники|Team~Mitglieder|Equipo~Miembros|Zespół~Członkowie', 'billing'),
    E('billing', 'link', 'r', 'Billing~Plan and billing|Оплата~Тариф і оплата|Abrechnung~Tarif und Abrechnung|Facturación~Plan y facturación|Płatności~Plan i rozliczenia', 'team'),
  ],
  main: [
    S('profile', 'General~Workspace profile|Загальне~Профіль простору|Allgemein~Workspace-Profil|General~Perfil del espacio|Ogólne~Profil przestrzeni',
      'The name appears in invitations and on shared links.|Назва показується в запрошеннях і на спільних посиланнях.|Der Name erscheint in Einladungen und geteilten Links.|El nombre aparece en invitaciones y enlaces compartidos.|Nazwa pojawia się w zaproszeniach i udostępnionych linkach.', [
        E('wsname', 'textbox', 'w', 'Workspace name~Name of workspace|Назва простору~Назва робочого простору|Workspace-Name~Name des Workspace|Nombre del espacio~Nombre del espacio de trabajo|Nazwa przestrzeni~Nazwa przestrzeni roboczej'),
        E('saveprofile', 'button', 'w', 'Save changes~Save|Зберегти зміни~Зберегти|Änderungen speichern~Speichern|Guardar cambios~Guardar|Zapisz zmiany~Zapisz', 'savenotif'),
      ]),
    S('notif', 'Notifications~Email notifications|Сповіщення~Сповіщення електронною поштою|Benachrichtigungen~E-Mail-Benachrichtigungen|Notificaciones~Notificaciones por correo|Powiadomienia~Powiadomienia e-mail',
      'We send at most one digest a day.|Ми надсилаємо не більше одного дайджесту на день.|Wir senden höchstens eine Zusammenfassung pro Tag.|Enviamos como máximo un resumen al día.|Wysyłamy najwyżej jedno podsumowanie dziennie.', [
        E('digest', 'checkbox', 'w', 'Daily digest~Send me a daily summary|Щоденний дайджест~Надсилати щоденний підсумок|Tägliche Zusammenfassung~Tägliche Übersicht senden|Resumen diario~Enviarme un resumen diario|Codzienne podsumowanie~Wysyłaj codzienne podsumowanie'),
        E('savenotif', 'button', 'w', 'Save preferences~Update preferences|Зберегти налаштування~Оновити налаштування|Einstellungen speichern~Einstellungen aktualisieren|Guardar preferencias~Actualizar preferencias|Zapisz preferencje~Zaktualizuj preferencje', 'saveprofile'),
      ]),
    S('security', 'Security~Sign-in and security|Безпека~Вхід і безпека|Sicherheit~Anmeldung und Sicherheit|Seguridad~Inicio de sesión y seguridad|Bezpieczeństwo~Logowanie i bezpieczeństwo',
      'Two-step sign-in is required for admins from next month.|З наступного місяця двоетапний вхід обов’язковий для адміністраторів.|Ab nächstem Monat ist die Zwei-Faktor-Anmeldung für Admins Pflicht.|A partir del próximo mes, el acceso en dos pasos será obligatorio para administradores.|Od przyszłego miesiąca logowanie dwuetapowe jest obowiązkowe dla administratorów.', [
        E('twostep', 'button', 'w', 'Turn on two-step sign-in~Enable 2-step verification|Увімкнути двоетапний вхід~Увімкнути двоетапну перевірку|Zwei-Faktor-Anmeldung aktivieren~2-Schritt-Bestätigung einschalten|Activar acceso en dos pasos~Activar verificación en 2 pasos|Włącz logowanie dwuetapowe~Włącz weryfikację dwuetapową', 'sessions'),
        E('sessions', 'link', 'r', 'View active sessions~Where you are signed in|Активні сеанси~Де виконано вхід|Aktive Sitzungen ansehen~Wo du angemeldet bist|Ver sesiones activas~Dónde has iniciado sesión|Zobacz aktywne sesje~Gdzie jesteś zalogowany', 'twostep'),
        E('audit', 'link', 'r', 'Audit log~Activity log|Журнал аудиту~Журнал дій|Audit-Protokoll~Aktivitätsprotokoll|Registro de auditoría~Registro de actividad|Dziennik audytu~Dziennik aktywności'),
      ]),
    S('danger', 'Danger zone~Delete or export|Небезпечна зона~Видалення та експорт|Gefahrenbereich~Löschen oder exportieren|Zona de peligro~Eliminar o exportar|Strefa zagrożenia~Usuń lub eksportuj',
      'Deleting a workspace removes every project in it after 30 days.|Видалення простору через 30 днів прибирає всі проєкти в ньому.|Das Löschen entfernt nach 30 Tagen alle Projekte darin.|Al eliminar el espacio se borran todos sus proyectos a los 30 días.|Usunięcie przestrzeni po 30 dniach kasuje wszystkie jej projekty.', [
        E('export', 'button', 'r', 'Export all data~Download an export|Експортувати всі дані~Завантажити експорт|Alle Daten exportieren~Export herunterladen|Exportar todos los datos~Descargar una exportación|Eksportuj wszystkie dane~Pobierz eksport'),
        E('leave', 'button', 'w', 'Leave workspace~Leave this workspace|Покинути простір~Вийти з цього простору|Workspace verlassen~Diesen Workspace verlassen|Abandonar el espacio~Salir de este espacio|Opuść przestrzeń~Wyjdź z tej przestrzeni', 'delete'),
        E('delete', 'button', 'w', 'Delete workspace~Permanently delete workspace|Видалити простір~Остаточно видалити простір|Workspace löschen~Workspace endgültig löschen|Eliminar espacio~Eliminar el espacio para siempre|Usuń przestrzeń~Trwale usuń przestrzeń', 'leave'),
      ]),
  ],
  aside: null,
  foot: S('foot', 'Product~About the product|Продукт~Про продукт|Produkt~Über das Produkt|Producto~Sobre el producto|Produkt~O produkcie', null, [
    E('status', 'link', 'r', 'System status~Service status|Стан системи~Стан сервісу|Systemstatus~Dienststatus|Estado del sistema~Estado del servicio|Status systemu~Status usługi', 'changelog'),
    E('changelog', 'link', 'r', 'What’s new~Changelog|Що нового~Журнал змін|Neuigkeiten~Änderungsprotokoll|Novedades~Registro de cambios|Co nowego~Lista zmian', 'status'),
  ]),
  extra: S('apikeys', 'API keys~Developer keys|Ключі API~Ключі розробника|API-Schlüssel~Entwicklerschlüssel|Claves de API~Claves de desarrollador|Klucze API~Klucze deweloperskie', null, [
    E('newkey', 'button', 'w', 'Create key~New API key|Створити ключ~Новий ключ API|Schlüssel erstellen~Neuer API-Schlüssel|Crear clave~Nueva clave de API|Utwórz klucz~Nowy klucz API'),
    E('delkey', 'button', 'w', 'Delete key~Revoke key|Видалити ключ~Відкликати ключ|Schlüssel löschen~Schlüssel widerrufen|Eliminar clave~Revocar clave|Usuń klucz~Unieważnij klucz', 'delete'),
  ]),
});
T({
  id: 'news', kind: 'news article', layout: 'right', theme: ['#ffffff', '#111111', '#b91c1c', '"Times New Roman", serif'],
  title: L('City council approves a new tram line to the river port|Міська рада схвалила нову трамвайну лінію до річкового порту|Stadtrat genehmigt neue Straßenbahnlinie zum Flusshafen|El ayuntamiento aprueba una nueva línea de tranvía al puerto fluvial|Rada miasta zatwierdza nową linię tramwajową do portu rzecznego'),
  intro: L('Construction is due to start in spring and the first trams should run within three years, officials said.|Будівництво має розпочатися навесні, а перші трамваї — поїхати протягом трьох років, кажуть посадовці.|Der Bau soll im Frühjahr beginnen, die ersten Bahnen sollen binnen drei Jahren fahren, hieß es.|Las obras empezarán en primavera y los primeros tranvías circularán en tres años, según fuentes municipales.|Budowa ma ruszyć wiosną, a pierwsze tramwaje pojadą w ciągu trzech lat – podali urzędnicy.'),
  head: [
    E('search', 'searchbox', 'r', 'Search news~Search articles|Пошук новин~Пошук статей|Nachrichten suchen~Artikel suchen|Buscar noticias~Buscar artículos|Szukaj wiadomości~Szukaj artykułów'),
    E('subscribe', 'button', 'w', 'Subscribe~Become a subscriber|Передплатити~Оформити передплату|Abonnieren~Abonnent werden|Suscribirse~Hazte suscriptor|Subskrybuj~Zostań subskrybentem', 'signin'),
    E('signin', 'link', 'r', 'Sign in~Log in|Увійти~Вхід|Anmelden~Einloggen|Iniciar sesión~Entrar|Zaloguj się~Logowanie', 'subscribe'),
  ],
  nav: [
    E('world', 'link', 'r', 'World~International|Світ~У світі|Welt~International|Mundo~Internacional|Świat~Ze świata'),
    E('business', 'link', 'r', 'Business~Economy|Бізнес~Економіка|Wirtschaft~Finanzen|Economía~Negocios|Biznes~Gospodarka', 'tech'),
    E('tech', 'link', 'r', 'Technology~Tech|Технології~Техно|Technik~Digital|Tecnología~Tecno|Technologie~Tech', 'business'),
    E('sport', 'link', 'r', 'Sport~Sports|Спорт~Спортивні новини|Sport~Sportnachrichten|Deportes~Noticias deportivas|Sport~Wiadomości sportowe'),
  ],
  main: [
    S('tools', 'Share this story~Share and save|Поділитися новиною~Поділитися і зберегти|Artikel teilen~Teilen und merken|Comparte esta noticia~Compartir y guardar|Udostępnij artykuł~Udostępnij i zapisz',
      'The vote passed 31 to 9 after a four-hour debate.|Рішення ухвалили 31 голосом проти 9 після чотиригодинних дебатів.|Die Abstimmung endete nach vier Stunden Debatte mit 31 zu 9.|La votación terminó 31 a 9 tras cuatro horas de debate.|Głosowanie zakończyło się wynikiem 31 do 9 po czterech godzinach debaty.', [
        E('listen', 'button', 'r', 'Listen to this article~Play audio version|Прослухати статтю~Увімкнути аудіоверсію|Artikel anhören~Audioversion abspielen|Escuchar este artículo~Reproducir versión en audio|Posłuchaj artykułu~Odtwórz wersję audio'),
        E('save', 'button', 'w', 'Save for later~Bookmark article|Зберегти на потім~Додати в закладки|Für später merken~Artikel merken|Guardar para después~Guardar artículo|Zapisz na później~Dodaj do zakładek', 'share'),
        E('share', 'button', 'w', 'Share by email~Email this story|Поділитися поштою~Надіслати поштою|Per E-Mail teilen~Artikel mailen|Compartir por correo~Enviar por correo|Udostępnij e-mailem~Wyślij e-mailem', 'save'),
      ]),
    S('comments', 'Comments~Reader comments|Коментарі~Коментарі читачів|Kommentare~Leserkommentare|Comentarios~Comentarios de los lectores|Komentarze~Komentarze czytelników',
      'Comments are reviewed before they appear.|Коментарі з’являються після перевірки.|Kommentare werden vor der Veröffentlichung geprüft.|Los comentarios se revisan antes de publicarse.|Komentarze są sprawdzane przed publikacją.', [
        E('showcomments', 'link', 'r', 'Show all 48 comments~Read the comments|Показати всі 48 коментарів~Читати коментарі|Alle 48 Kommentare zeigen~Kommentare lesen|Ver los 48 comentarios~Leer los comentarios|Pokaż wszystkie 48 komentarzy~Czytaj komentarze', 'postcomment'),
        E('postcomment', 'button', 'w', 'Post a comment~Add your comment|Написати коментар~Додати коментар|Kommentar schreiben~Eigenen Kommentar hinzufügen|Publicar un comentario~Añade tu comentario|Dodaj komentarz~Napisz komentarz', 'showcomments'),
      ]),
    S('more', 'More on this story~Related coverage|Більше на цю тему~Пов’язані матеріали|Mehr zum Thema~Weitere Berichte|Más sobre este tema~Cobertura relacionada|Więcej na ten temat~Powiązane artykuły', null, [
        E('rel1', 'link', 'r', 'Map of the planned route~Where the new line will run|Мапа запланованого маршруту~Де пролягатиме нова лінія|Karte der geplanten Strecke~Wo die neue Linie fährt|Mapa del trazado previsto~Por dónde irá la nueva línea|Mapa planowanej trasy~Którędy pobiegnie nowa linia', 'rel2'),
        E('rel2', 'link', 'r', 'How the project is funded~Who pays for the tram|Як фінансують проєкт~Хто платить за трамвай|Wie das Projekt finanziert wird~Wer die Bahn bezahlt|Cómo se financia el proyecto~Quién paga el tranvía|Jak finansowany jest projekt~Kto płaci za tramwaj', 'rel1'),
      ]),
  ],
  aside: S('mostread', 'Most read~Trending now|Найпопулярніше~Зараз читають|Meistgelesen~Gerade beliebt|Lo más leído~Tendencias|Najczęściej czytane~Teraz popularne', null, [
    E('mr1', 'link', 'r', 'Heatwave warning for the weekend~Weekend heat alert|Попередження про спеку на вихідні~Спека на вихідних|Hitzewarnung fürs Wochenende~Hitzealarm am Wochenende|Aviso por calor el fin de semana~Alerta de calor para el finde|Ostrzeżenie przed upałem na weekend~Alert upałowy na weekend', 'mr2'),
    E('mr2', 'link', 'r', 'Library extends opening hours~Longer library hours|Бібліотека подовжує години роботи~Довші години бібліотеки|Bibliothek verlängert Öffnungszeiten~Längere Öffnungszeiten der Bibliothek|La biblioteca amplía su horario~Más horas de biblioteca|Biblioteka wydłuża godziny otwarcia~Dłuższe godziny biblioteki', 'mr1'),
  ]),
  foot: S('about', 'About us~About this site|Про нас~Про видання|Über uns~Über diese Seite|Quiénes somos~Sobre este sitio|O nas~O serwisie', null, [
    E('corrections', 'link', 'r', 'Corrections~Corrections and clarifications|Виправлення~Виправлення та уточнення|Korrekturen~Korrekturen und Klarstellungen|Correcciones~Correcciones y aclaraciones|Sprostowania~Sprostowania i wyjaśnienia', 'advertise'),
    E('advertise', 'link', 'r', 'Advertise with us~Advertising|Реклама в нас~Реклама|Werben bei uns~Werbung|Anúnciate con nosotros~Publicidad|Reklama u nas~Reklama', 'corrections'),
  ]),
  extra: S('live', 'Live updates~Latest updates|Онлайн-оновлення~Останні оновлення|Liveticker~Neueste Meldungen|Última hora~Actualizaciones recientes|Relacja na żywo~Najnowsze informacje', null, [
    E('follow', 'button', 'w', 'Follow this story~Get updates on this story|Стежити за темою~Отримувати оновлення теми|Thema folgen~Updates zum Thema erhalten|Seguir esta noticia~Recibir novedades de esta noticia|Obserwuj temat~Otrzymuj aktualizacje tematu', 'save'),
  ]),
});
T({
  id: 'travel', kind: 'travel booking, flight results', layout: 'left', theme: ['#eef4fb', '#102a43', '#0369a1', 'Arial, sans-serif'],
  title: L('Flights to Porto, 14 March~|Рейси до Порту, 14 березня|Flüge nach Porto, 14. März|Vuelos a Oporto, 14 de marzo|Loty do Porto, 14 marca'),
  intro: L('2 adults, economy. Prices include taxes and one cabin bag.|2 дорослих, економ. Ціни з податками та однією ручною поклажею.|2 Erwachsene, Economy. Preise inkl. Steuern und einem Handgepäck.|2 adultos, turista. Precios con tasas y un equipaje de mano.|2 dorosłych, ekonomiczna. Ceny z opłatami i jednym bagażem podręcznym.'),
  head: [
    E('trips', 'link', 'r', 'My trips~My bookings|Мої подорожі~Мої бронювання|Meine Reisen~Meine Buchungen|Mis viajes~Mis reservas|Moje podróże~Moje rezerwacje'),
    E('help', 'link', 'r', 'Help~Customer help|Допомога~Підтримка клієнтів|Hilfe~Kundenhilfe|Ayuda~Atención al viajero|Pomoc~Pomoc dla klientów'),
  ],
  nav: [
    E('flights', 'link', 'r', 'Flights~Air tickets|Авіаквитки~Рейси|Flüge~Flugtickets|Vuelos~Billetes de avión|Loty~Bilety lotnicze'),
    E('hotels', 'link', 'r', 'Hotels~Places to stay|Готелі~Житло|Hotels~Unterkünfte|Hoteles~Alojamiento|Hotele~Noclegi', 'cars'),
    E('cars', 'link', 'r', 'Car rental~Rent a car|Оренда авто~Орендувати авто|Mietwagen~Auto mieten|Alquiler de coches~Alquilar un coche|Wynajem aut~Wynajmij auto', 'hotels'),
  ],
  main: [
    S('search', 'Your search~Search details|Ваш пошук~Параметри пошуку|Ihre Suche~Suchdetails|Tu búsqueda~Detalles de la búsqueda|Twoje wyszukiwanie~Szczegóły wyszukiwania',
      'Lisbon to Porto, one way, Friday 14 March.|Лісабон — Порту, в один бік, п’ятниця, 14 березня.|Lissabon nach Porto, einfach, Freitag, 14. März.|Lisboa a Oporto, solo ida, viernes 14 de marzo.|Lizbona – Porto, w jedną stronę, piątek 14 marca.', [
        E('changesearch', 'button', 'r', 'Change search~Edit search|Змінити пошук~Редагувати пошук|Suche ändern~Suche bearbeiten|Cambiar búsqueda~Editar búsqueda|Zmień wyszukiwanie~Edytuj wyszukiwanie'),
        E('pricealert', 'checkbox', 'w', 'Get price alerts for this route~Track prices|Сповіщати про ціни на цей маршрут~Стежити за цінами|Preisalarm für diese Strecke~Preise beobachten|Alertas de precio para esta ruta~Seguir precios|Alerty cenowe dla tej trasy~Śledź ceny'),
      ]),
    S('r1', 'Departs 07:40, direct~07:40, nonstop|Виліт о 07:40, без пересадок~07:40, прямий|Abflug 07:40, direkt~07:40, Nonstop|Salida 07:40, directo~07:40, sin escalas|Wylot 07:40, bezpośredni~07:40, bez przesiadek',
      'Arrives 08:35. From 64.00 per person.|Приліт о 08:35. Від 64,00 з особи.|Ankunft 08:35. Ab 64,00 pro Person.|Llega a las 08:35. Desde 64,00 por persona.|Przylot 08:35. Od 64,00 za osobę.', [
        E('select1', 'button', 'w', 'Select this flight~Choose this fare|Обрати цей рейс~Обрати цей тариф|Diesen Flug wählen~Diesen Tarif wählen|Elegir este vuelo~Elegir esta tarifa|Wybierz ten lot~Wybierz tę taryfę', 'select2'),
        E('fare1', 'link', 'r', 'Fare details~What’s included|Деталі тарифу~Що входить|Tarifdetails~Was enthalten ist|Detalles de la tarifa~Qué incluye|Szczegóły taryfy~Co obejmuje', 'fare2'),
      ]),
    S('r2', 'Departs 11:15, one stop~11:15, via Madrid|Виліт об 11:15, одна пересадка~11:15, через Мадрид|Abflug 11:15, ein Stopp~11:15, über Madrid|Salida 11:15, una escala~11:15, vía Madrid|Wylot 11:15, jedna przesiadka~11:15, przez Madryt',
      'Arrives 15:50. From 41.00 per person.|Приліт о 15:50. Від 41,00 з особи.|Ankunft 15:50. Ab 41,00 pro Person.|Llega a las 15:50. Desde 41,00 por persona.|Przylot 15:50. Od 41,00 za osobę.', [
        E('select2', 'button', 'w', 'Book this option~Reserve this flight|Забронювати цей варіант~Забронювати рейс|Diese Option buchen~Diesen Flug reservieren|Reservar esta opción~Reservar este vuelo|Zarezerwuj tę opcję~Zarezerwuj ten lot', 'select1'),
        E('fare2', 'link', 'r', 'Baggage rules~Baggage allowance|Правила багажу~Норми багажу|Gepäckregeln~Freigepäck|Normas de equipaje~Equipaje permitido|Zasady bagażu~Limit bagażu', 'fare1'),
      ]),
  ],
  aside: S('filters', 'Filters~Refine results|Фільтри~Уточнити результати|Filter~Ergebnisse eingrenzen|Filtros~Afinar resultados|Filtry~Zawęź wyniki', null, [
    E('direct', 'checkbox', 'r', 'Direct flights only~Nonstop only|Лише прямі рейси~Тільки без пересадок|Nur Direktflüge~Nur Nonstop|Solo vuelos directos~Solo sin escalas|Tylko loty bezpośrednie~Tylko bez przesiadek'),
    E('apply', 'button', 'r', 'Apply filters~Show results|Застосувати фільтри~Показати результати|Filter anwenden~Ergebnisse anzeigen|Aplicar filtros~Mostrar resultados|Zastosuj filtry~Pokaż wyniki', 'clear'),
    E('clear', 'button', 'r', 'Clear filters~Reset all|Скинути фільтри~Скинути все|Filter zurücksetzen~Alle zurücksetzen|Borrar filtros~Restablecer todo|Wyczyść filtry~Resetuj wszystko', 'apply'),
  ]),
  foot: S('company', 'Company~About us|Компанія~Про нас|Unternehmen~Über uns|Empresa~Sobre nosotros|Firma~O nas', null, [
    E('terms', 'link', 'r', 'Terms of travel~Booking conditions|Умови подорожі~Умови бронювання|Reisebedingungen~Buchungsbedingungen|Condiciones de viaje~Condiciones de reserva|Warunki podróży~Warunki rezerwacji', 'cookies'),
    E('cookies', 'link', 'r', 'Cookie settings~Manage cookies|Налаштування cookie~Керувати cookie|Cookie-Einstellungen~Cookies verwalten|Configuración de cookies~Gestionar cookies|Ustawienia cookie~Zarządzaj cookie', 'terms'),
  ]),
  extra: S('stay', 'Add a hotel~Stay and save|Додайте готель~Житло зі знижкою|Hotel hinzufügen~Mit Hotel sparen|Añade un hotel~Ahorra con alojamiento|Dodaj hotel~Nocleg taniej', null, [
    E('addhotel', 'button', 'w', 'Add hotel to trip~Add a stay|Додати готель до подорожі~Додати житло|Hotel zur Reise hinzufügen~Unterkunft hinzufügen|Añadir hotel al viaje~Añadir alojamiento|Dodaj hotel do podróży~Dodaj nocleg', 'select1'),
    E('browsehotels', 'link', 'r', 'Browse hotels in Porto~Hotels near the centre|Готелі в Порту~Готелі біля центру|Hotels in Porto ansehen~Hotels nahe dem Zentrum|Ver hoteles en Oporto~Hoteles cerca del centro|Przeglądaj hotele w Porto~Hotele blisko centrum', 'hotels'),
  ]),
});
const PERMIT = 'Parking permit application|Заява на дозвіл на паркування|Antrag auf Parkausweis|Solicitud de permiso de aparcamiento|Wniosek o abonament parkingowy';
T({
  id: 'gov', kind: 'government-style service form', layout: 'none', theme: ['#ffffff', '#0b0c0c', '#1d70b8', 'Arial, sans-serif'],
  title: L('Apply for a residential parking permit|Подати заяву на дозвіл для паркування мешканців|Bewohnerparkausweis beantragen|Solicitar un permiso de aparcamiento para residentes|Złóż wniosek o abonament parkingowy dla mieszkańców'),
  intro: L('It takes about 10 minutes. You will need your vehicle registration document.|Це займе близько 10 хвилин. Знадобиться свідоцтво про реєстрацію авто.|Das dauert etwa 10 Minuten. Sie brauchen den Fahrzeugschein.|Tarda unos 10 minutos. Necesitará el permiso de circulación.|To zajmie około 10 minut. Potrzebny będzie dowód rejestracyjny.'),
  head: [
    E('signin', 'link', 'r', 'Sign in~Your account|Увійти~Ваш кабінет|Anmelden~Ihr Konto|Acceder~Su cuenta|Zaloguj się~Twoje konto'),
    E('access', 'link', 'r', 'Accessibility~Accessibility statement|Доступність~Заява про доступність|Barrierefreiheit~Erklärung zur Barrierefreiheit|Accesibilidad~Declaración de accesibilidad|Dostępność~Deklaracja dostępności'),
  ],
  nav: [
    E('services', 'link', 'r', 'Services~All services|Послуги~Усі послуги|Leistungen~Alle Leistungen|Servicios~Todos los servicios|Usługi~Wszystkie usługi'),
    E('forms', 'link', 'r', 'Forms and permits~Permits|Форми та дозволи~Дозволи|Formulare und Genehmigungen~Genehmigungen|Formularios y permisos~Permisos|Formularze i zezwolenia~Zezwolenia'),
    E('contact', 'link', 'r', 'Contact the council~Contact us|Зв’язатися з радою~Контакти|Kontakt zur Stadt~Kontakt|Contactar con el ayuntamiento~Contacto|Kontakt z urzędem~Kontakt'),
  ],
  main: [
    S('applicant', 'Your details~About you|Ваші дані~Про вас|Ihre Angaben~Angaben zur Person|Sus datos~Sobre usted|Twoje dane~O tobie', null, [
      E('fullname', 'textbox', 'w', 'Full name~Your full name|Повне ім’я~Ваше повне ім’я|Vollständiger Name~Ihr vollständiger Name|Nombre completo~Su nombre completo|Imię i nazwisko~Twoje imię i nazwisko'),
      E('regno', 'textbox', 'w', 'Vehicle registration number~Registration plate|Номерний знак авто~Реєстраційний номер|Amtliches Kennzeichen~Kfz-Kennzeichen|Matrícula del vehículo~Número de matrícula|Numer rejestracyjny pojazdu~Tablica rejestracyjna'),
    ], PERMIT),
    S('docs', 'Supporting documents~Upload documents|Підтвердні документи~Завантажте документи|Nachweise~Dokumente hochladen|Documentos justificativos~Subir documentos|Dokumenty potwierdzające~Prześlij dokumenty', null, [
      E('uploadaddr', 'button', 'w', 'Upload proof of address~Add proof of address|Завантажити підтвердження адреси~Додати підтвердження адреси|Adressnachweis hochladen~Adressnachweis hinzufügen|Subir justificante de domicilio~Añadir justificante de domicilio|Prześlij potwierdzenie adresu~Dodaj potwierdzenie adresu', 'uploadveh'),
      E('uploadveh', 'button', 'w', 'Upload vehicle document~Add vehicle registration|Завантажити документ на авто~Додати техпаспорт|Fahrzeugschein hochladen~Zulassung hinzufügen|Subir documento del vehículo~Añadir permiso de circulación|Prześlij dokument pojazdu~Dodaj dowód rejestracyjny', 'uploadaddr'),
    ], PERMIT),
    S('finish', 'Check and send~Review and submit|Перевірте й надішліть~Перегляд і подання|Prüfen und absenden~Überprüfen und senden|Revisar y enviar~Comprobar y presentar|Sprawdź i wyślij~Przejrzyj i złóż', null, [
      E('saveforlater', 'button', 'w', 'Save and continue later~Save as draft|Зберегти й продовжити пізніше~Зберегти чернетку|Speichern und später fortfahren~Als Entwurf speichern|Guardar y continuar más tarde~Guardar borrador|Zapisz i dokończ później~Zapisz wersję roboczą', 'submit'),
      E('submit', 'button', 'w', 'Submit application~Send application|Подати заяву~Надіслати заяву|Antrag absenden~Antrag einreichen|Enviar solicitud~Presentar solicitud|Złóż wniosek~Wyślij wniosek', 'saveforlater'),
      E('back', 'link', 'r', 'Back to previous step~Previous step|Назад до попереднього кроку~Попередній крок|Zurück zum vorherigen Schritt~Vorheriger Schritt|Volver al paso anterior~Paso anterior|Wróć do poprzedniego kroku~Poprzedni krok'),
    ], PERMIT),
    S('guidance', 'Guidance~Before you apply|Роз’яснення~Перш ніж подати заяву|Hinweise~Vor dem Antrag|Orientación~Antes de solicitar|Wskazówki~Zanim złożysz wniosek',
      'Permits are issued for one vehicle at one address.|Дозвіл видається на одне авто за однією адресою.|Ausweise gelten für ein Fahrzeug an einer Adresse.|El permiso es para un vehículo en un domicilio.|Abonament obejmuje jeden pojazd pod jednym adresem.', [
        E('eligible', 'link', 'r', 'Who can apply~Eligibility rules|Хто може подати заяву~Умови отримання|Wer antragsberechtigt ist~Voraussetzungen|Quién puede solicitarlo~Requisitos|Kto może złożyć wniosek~Warunki', 'fees'),
        E('fees', 'link', 'r', 'Permit fees~How much it costs|Вартість дозволу~Скільки це коштує|Gebühren~Was es kostet|Tasas del permiso~Cuánto cuesta|Opłaty za abonament~Ile to kosztuje', 'eligible'),
      ]),
  ],
  aside: null,
  foot: S('govfoot', 'Council services~About this service|Послуги ради~Про цю послугу|Leistungen der Stadt~Über diesen Dienst|Servicios municipales~Sobre este servicio|Usługi urzędu~O tej usłudze', null, [
    E('privacy', 'link', 'r', 'Privacy~Privacy notice|Конфіденційність~Повідомлення про конфіденційність|Datenschutz~Datenschutzerklärung|Privacidad~Aviso de privacidad|Prywatność~Polityka prywatności'),
    E('feedback', 'link', 'r', 'Give feedback on this page~Report a problem with this page|Відгук про сторінку~Повідомити про проблему на сторінці|Feedback zu dieser Seite~Problem mit dieser Seite melden|Opinar sobre esta página~Informar de un problema en esta página|Oceń tę stronę~Zgłoś problem z tą stroną'),
  ]),
  extra: S('pay', 'Pay for your permit~Payment|Оплата дозволу~Оплата|Ausweis bezahlen~Zahlung|Pagar el permiso~Pago|Opłać abonament~Płatność', null, [
    E('paypermit', 'button', 'w', 'Pay the permit fee~Pay now|Сплатити за дозвіл~Сплатити зараз|Gebühr bezahlen~Jetzt bezahlen|Pagar la tasa~Pagar ahora|Zapłać za abonament~Zapłać teraz', 'submit'),
  ]),
});
T({
  id: 'forum', kind: 'community forum thread', layout: 'right', theme: ['#f4f1ea', '#2b2b2b', '#6b4f2a', 'Tahoma, sans-serif'],
  title: L('Best way to descale an espresso machine?|Як найкраще видалити накип з еспресо-машини?|Wie entkalkt man eine Espressomaschine am besten?|¿Cuál es la mejor forma de descalcificar una cafetera espresso?|Jak najlepiej odkamienić ekspres do espresso?'),
  intro: L('Started by a member in Home appliances · 23 replies · 1.4k views|Тему створив учасник у розділі «Побутова техніка» · 23 відповіді · 1,4 тис. переглядів|Gestartet in Haushaltsgeräte · 23 Antworten · 1,4 Tsd. Aufrufe|Iniciado en Electrodomésticos · 23 respuestas · 1,4 mil visitas|Wątek w dziale AGD · 23 odpowiedzi · 1,4 tys. wyświetleń'),
  head: [
    E('search', 'searchbox', 'r', 'Search the forum~Search threads|Пошук на форумі~Пошук тем|Forum durchsuchen~Themen suchen|Buscar en el foro~Buscar hilos|Szukaj na forum~Szukaj wątków'),
    E('alerts', 'link', 'r', 'Notifications~Alerts|Сповіщення~Оповіщення|Benachrichtigungen~Hinweise|Notificaciones~Avisos|Powiadomienia~Alerty'),
  ],
  nav: [
    E('forums', 'link', 'r', 'Forums~All forums|Форуми~Усі форуми|Foren~Alle Foren|Foros~Todos los foros|Fora~Wszystkie fora'),
    E('newposts', 'link', 'r', 'New posts~Latest activity|Нові дописи~Остання активність|Neue Beiträge~Neueste Aktivität|Mensajes nuevos~Actividad reciente|Nowe posty~Najnowsza aktywność'),
    E('members', 'link', 'r', 'Members~Member list|Учасники~Список учасників|Mitglieder~Mitgliederliste|Miembros~Lista de miembros|Użytkownicy~Lista użytkowników'),
    E('rules', 'link', 'r', 'Forum rules~Community guidelines|Правила форуму~Правила спільноти|Forenregeln~Community-Richtlinien|Normas del foro~Normas de la comunidad|Regulamin forum~Zasady społeczności'),
  ],
  main: [
    S('thread', 'Original post~First post|Перший допис~Початковий допис|Erster Beitrag~Ursprünglicher Beitrag|Mensaje original~Primer mensaje|Pierwszy post~Post otwierający',
      'My machine is three years old and the water has been hard. Vinegar or a proper descaler?|Машині три роки, вода жорстка. Оцет чи спеціальний засіб?|Meine Maschine ist drei Jahre alt, das Wasser ist hart. Essig oder richtiger Entkalker?|Mi cafetera tiene tres años y el agua es dura. ¿Vinagre o un descalcificador?|Ekspres ma trzy lata, woda jest twarda. Ocet czy porządny odkamieniacz?', [
        E('reply', 'button', 'w', 'Reply~Post a reply|Відповісти~Написати відповідь|Antworten~Antwort schreiben|Responder~Escribir respuesta|Odpowiedz~Napisz odpowiedź', 'quote'),
        E('quote', 'button', 'w', 'Quote~Reply with quote|Цитувати~Відповісти з цитатою|Zitieren~Mit Zitat antworten|Citar~Responder citando|Cytuj~Odpowiedz z cytatem', 'reply'),
        E('like', 'button', 'w', 'Like~Like this post|Подобається~Вподобати допис|Gefällt mir~Beitrag liken|Me gusta~Me gusta este mensaje|Lubię to~Polub post', 'helpful'),
        E('report', 'button', 'w', 'Report post~Report to moderators|Поскаржитися~Повідомити модераторам|Beitrag melden~An Moderatoren melden|Denunciar mensaje~Avisar a los moderadores|Zgłoś post~Zgłoś moderatorom'),
      ]),
    S('answer', 'Accepted answer~Best answer|Прийнята відповідь~Найкраща відповідь|Akzeptierte Antwort~Beste Antwort|Respuesta aceptada~Mejor respuesta|Zaakceptowana odpowiedź~Najlepsza odpowiedź',
      'Use citric acid, run two full tanks of clean water after, and never use vinegar on the boiler.|Лимонна кислота, потім два повні баки чистої води; оцет для бойлера не використовуйте.|Zitronensäure nehmen, danach zwei volle Tanks Wasser durchlaufen lassen, nie Essig in den Boiler.|Usa ácido cítrico, luego dos depósitos de agua limpia, y nunca vinagre en la caldera.|Kwasek cytrynowy, potem dwa pełne zbiorniki czystej wody; nigdy octu do bojlera.', [
        E('helpful', 'button', 'w', 'Mark as helpful~This helped me|Позначити як корисне~Це мені допомогло|Als hilfreich markieren~Hat mir geholfen|Marcar como útil~Me ha ayudado|Oznacz jako pomocne~To mi pomogło', 'like'),
        E('permalink', 'link', 'r', 'Link to this answer~Permalink|Посилання на відповідь~Постійне посилання|Link zu dieser Antwort~Permalink|Enlace a esta respuesta~Enlace permanente|Link do tej odpowiedzi~Stały link'),
      ]),
    S('pages', 'Page 1 of 3~More replies|Сторінка 1 з 3~Більше відповідей|Seite 1 von 3~Weitere Antworten|Página 1 de 3~Más respuestas|Strona 1 z 3~Więcej odpowiedzi', null, [
      E('next', 'link', 'r', 'Next page~Older replies|Наступна сторінка~Старіші відповіді|Nächste Seite~Ältere Antworten|Página siguiente~Respuestas anteriores|Następna strona~Starsze odpowiedzi', 'last'),
      E('last', 'link', 'r', 'Last page~Newest replies|Остання сторінка~Найновіші відповіді|Letzte Seite~Neueste Antworten|Última página~Respuestas más recientes|Ostatnia strona~Najnowsze odpowiedzi', 'next'),
    ]),
  ],
  aside: S('tools', 'Thread tools~Options|Інструменти теми~Параметри|Themen-Werkzeuge~Optionen|Herramientas del hilo~Opciones|Narzędzia wątku~Opcje', null, [
    E('follow', 'button', 'w', 'Follow thread~Watch thread|Стежити за темою~Відстежувати тему|Thema folgen~Thema beobachten|Seguir hilo~Vigilar hilo|Obserwuj wątek~Śledź wątek', 'mute'),
    E('mute', 'button', 'w', 'Mute thread~Ignore thread|Вимкнути сповіщення теми~Ігнорувати тему|Thema stummschalten~Thema ignorieren|Silenciar hilo~Ignorar hilo|Wycisz wątek~Ignoruj wątek', 'follow'),
  ]),
  foot: S('community', 'Community~About the forum|Спільнота~Про форум|Community~Über das Forum|Comunidad~Sobre el foro|Społeczność~O forum', null, [
    E('mods', 'link', 'r', 'Contact the moderators~Moderation team|Написати модераторам~Команда модераторів|Moderatoren kontaktieren~Moderationsteam|Contactar con moderación~Equipo de moderación|Kontakt z moderatorami~Zespół moderatorów', 'termsuse'),
    E('termsuse', 'link', 'r', 'Terms of use~Site terms|Умови використання~Умови сайту|Nutzungsbedingungen~Seitenbedingungen|Condiciones de uso~Términos del sitio|Warunki korzystania~Regulamin serwisu', 'mods'),
  ]),
  extra: S('similar', 'Similar threads~Related discussions|Схожі теми~Пов’язані обговорення|Ähnliche Themen~Verwandte Diskussionen|Hilos similares~Debates relacionados|Podobne wątki~Powiązane dyskusje', null, [
    E('sim1', 'link', 'r', 'Descaling with citric acid: how much?~Citric acid dosage|Скільки лимонної кислоти для накипу?~Дозування лимонної кислоти|Wie viel Zitronensäure zum Entkalken?~Dosierung Zitronensäure|¿Cuánto ácido cítrico para descalcificar?~Dosis de ácido cítrico|Ile kwasku cytrynowego do odkamieniania?~Dawka kwasku', 'permalink'),
    E('newthread', 'button', 'w', 'Start a new thread~New topic|Створити нову тему~Нова тема|Neues Thema starten~Neues Thema|Abrir un hilo nuevo~Nuevo tema|Załóż nowy wątek~Nowy temat', 'reply'),
  ]),
});
T({
  id: 'docs', kind: 'developer documentation', layout: 'left', theme: ['#fcfcfd', '#1f2328', '#0f766e', 'ui-monospace, monospace'],
  title: L('Getting started with the client library|Початок роботи з клієнтською бібліотекою|Erste Schritte mit der Client-Bibliothek|Primeros pasos con la biblioteca cliente|Pierwsze kroki z biblioteką klienta'),
  intro: L('This guide installs the client, signs a first request and shows how errors come back.|Цей посібник встановлює клієнт, підписує перший запит і показує, як повертаються помилки.|Diese Anleitung installiert den Client, signiert eine erste Anfrage und zeigt Fehlerantworten.|Esta guía instala el cliente, firma una primera petición y muestra cómo llegan los errores.|Ten przewodnik instaluje klienta, podpisuje pierwsze żądanie i pokazuje zwracane błędy.'),
  head: [
    E('search', 'searchbox', 'r', 'Search docs~Search documentation|Пошук у документації~Шукати в документації|Doku durchsuchen~Dokumentation durchsuchen|Buscar en la documentación~Buscar en los documentos|Szukaj w dokumentacji~Przeszukaj dokumentację'),
    E('changelog', 'link', 'r', 'Changelog~Release notes|Журнал змін~Примітки до випусків|Änderungsprotokoll~Versionshinweise|Registro de cambios~Notas de la versión|Dziennik zmian~Informacje o wydaniu'),
  ],
  nav: [
    E('guides', 'link', 'r', 'Guides~Tutorials|Посібники~Інструкції|Anleitungen~Tutorials|Guías~Tutoriales|Przewodniki~Samouczki', 'apiref'),
    E('apiref', 'link', 'r', 'API reference~Reference|Довідник API~Довідник|API-Referenz~Referenz|Referencia de la API~Referencia|Dokumentacja API~Referencja', 'guides'),
    E('sdks', 'link', 'r', 'SDKs~Client libraries|SDK~Клієнтські бібліотеки|SDKs~Client-Bibliotheken|SDK~Bibliotecas cliente|SDK~Biblioteki klienta'),
    E('status', 'link', 'r', 'Status~Service status|Статус~Стан сервісу|Status~Dienststatus|Estado~Estado del servicio|Status~Stan usługi'),
  ],
  main: [
    S('install', 'Install the client~Installation|Встановлення клієнта~Встановлення|Client installieren~Installation|Instalar el cliente~Instalación|Instalacja klienta~Instalacja',
      'Run the install command in your project folder. Node 20 or newer is required.|Виконайте команду встановлення в теці проєкту. Потрібен Node 20 або новіший.|Führe den Installationsbefehl im Projektordner aus. Node 20 oder neuer ist nötig.|Ejecuta el comando de instalación en la carpeta del proyecto. Se requiere Node 20 o superior.|Uruchom polecenie instalacji w folderze projektu. Wymagany Node 20 lub nowszy.', [
        E('copycmd', 'button', 'r', 'Copy command~Copy to clipboard|Копіювати команду~Копіювати в буфер|Befehl kopieren~In die Zwischenablage|Copiar comando~Copiar al portapapeles|Kopiuj polecenie~Kopiuj do schowka', 'download'),
        E('download', 'link', 'r', 'Download the archive~Download zip|Завантажити архів~Завантажити zip|Archiv herunterladen~Zip herunterladen|Descargar el archivo~Descargar zip|Pobierz archiwum~Pobierz zip', 'copycmd'),
      ]),
    S('auth', 'Authenticate~Authentication|Автентифікація~Перевірка доступу|Authentifizieren~Authentifizierung|Autenticarse~Autenticación|Uwierzytelnianie~Autoryzacja',
      'Every request carries a token in the Authorization header. Tokens expire after 90 days.|Кожен запит містить токен у заголовку Authorization. Токени діють 90 днів.|Jede Anfrage trägt ein Token im Authorization-Header. Tokens laufen nach 90 Tagen ab.|Cada petición lleva un token en la cabecera Authorization. Caducan a los 90 días.|Każde żądanie ma token w nagłówku Authorization. Tokeny wygasają po 90 dniach.', [
        E('createtoken', 'button', 'w', 'Create a token~Generate token|Створити токен~Згенерувати токен|Token erstellen~Token generieren|Crear un token~Generar token|Utwórz token~Wygeneruj token', 'scopes'),
        E('scopes', 'link', 'r', 'Token scopes reference~Scopes|Довідник областей токена~Області доступу|Token-Bereiche~Scopes|Referencia de ámbitos~Ámbitos|Zakresy tokenów~Zakresy', 'createtoken'),
      ]),
    S('feedback', 'Was this page helpful?~Rate this page|Чи була сторінка корисною?~Оцініть сторінку|War diese Seite hilfreich?~Seite bewerten|¿Te ha sido útil esta página?~Valora esta página|Czy ta strona była pomocna?~Oceń stronę', null, [
      E('yes', 'button', 'w', 'Yes, it helped~Helpful|Так, допомогла~Корисно|Ja, hilfreich~Hat geholfen|Sí, me ayudó~Útil|Tak, pomogła~Pomocna', 'no'),
      E('no', 'button', 'w', 'No, it did not~Not helpful|Ні, не допомогла~Некорисно|Nein, nicht hilfreich~Hat nicht geholfen|No, no me ayudó~No es útil|Nie, nie pomogła~Niepomocna', 'yes'),
      E('edit', 'link', 'w', 'Edit this page~Suggest an edit|Редагувати сторінку~Запропонувати правку|Seite bearbeiten~Änderung vorschlagen|Editar esta página~Sugerir un cambio|Edytuj stronę~Zaproponuj zmianę'),
    ]),
  ],
  aside: S('toc', 'On this page~Contents|На цій сторінці~Зміст|Auf dieser Seite~Inhalt|En esta página~Contenido|Na tej stronie~Spis treści', null, [
    E('tocinstall', 'link', 'r', 'Installation~Install|Встановлення~Інсталяція|Installation~Einrichten|Instalación~Instalar|Instalacja~Instalowanie', 'tocauth'),
    E('tocauth', 'link', 'r', 'Authentication~Tokens|Автентифікація~Токени|Authentifizierung~Tokens|Autenticación~Tokens|Uwierzytelnianie~Tokeny', 'tocinstall'),
    E('tocerrors', 'link', 'r', 'Handling errors~Errors|Обробка помилок~Помилки|Fehlerbehandlung~Fehler|Gestión de errores~Errores|Obsługa błędów~Błędy'),
  ]),
  foot: S('resources', 'Resources~More resources|Ресурси~Більше ресурсів|Ressourcen~Weitere Ressourcen|Recursos~Más recursos|Zasoby~Więcej zasobów', null, [
    E('community', 'link', 'r', 'Community forum~Ask the community|Форум спільноти~Запитати спільноту|Community-Forum~Community fragen|Foro de la comunidad~Pregunta a la comunidad|Forum społeczności~Zapytaj społeczność'),
    E('tos', 'link', 'r', 'Terms of service~Legal terms|Умови надання послуг~Юридичні умови|Nutzungsbedingungen~Rechtliche Bedingungen|Términos del servicio~Condiciones legales|Warunki usługi~Warunki prawne'),
  ]),
  extra: S('nextsteps', 'Next steps~Continue reading|Наступні кроки~Читати далі|Nächste Schritte~Weiterlesen|Próximos pasos~Seguir leyendo|Następne kroki~Czytaj dalej', null, [
    E('nextpage', 'link', 'r', 'Next: Pagination~Continue to pagination|Далі: пагінація~Перейти до пагінації|Weiter: Paginierung~Zur Paginierung|Siguiente: paginación~Ir a paginación|Dalej: paginacja~Przejdź do paginacji', 'tocerrors'),
    E('prevpage', 'link', 'r', 'Previous: Quick start~Back to quick start|Назад: швидкий старт~Повернутися до швидкого старту|Zurück: Schnellstart~Zum Schnellstart|Anterior: inicio rápido~Volver al inicio rápido|Wstecz: szybki start~Wróć do szybkiego startu', 'nextpage'),
  ]),
});
T({
  id: 'admin', kind: 'admin table (orders back office)', layout: 'none', theme: ['#f6f7f9', '#111827', '#7c3aed', 'Segoe UI, sans-serif'],
  title: L('Orders|Замовлення|Bestellungen|Pedidos|Zamówienia'),
  intro: L('Showing 2 of 318 orders from the last 30 days.|Показано 2 з 318 замовлень за останні 30 днів.|2 von 318 Bestellungen der letzten 30 Tage.|Mostrando 2 de 318 pedidos de los últimos 30 días.|Wyświetlono 2 z 318 zamówień z ostatnich 30 dni.'),
  head: [
    E('storeset', 'link', 'r', 'Store settings~Settings|Налаштування магазину~Налаштування|Shop-Einstellungen~Einstellungen|Ajustes de la tienda~Ajustes|Ustawienia sklepu~Ustawienia'),
    E('signout', 'button', 'w', 'Sign out~Log out|Вийти~Вихід|Abmelden~Ausloggen|Salir~Cerrar sesión|Wyloguj~Wyloguj się'),
  ],
  nav: [
    E('orders', 'link', 'r', 'Orders~All orders|Замовлення~Усі замовлення|Bestellungen~Alle Bestellungen|Pedidos~Todos los pedidos|Zamówienia~Wszystkie zamówienia'),
    E('products', 'link', 'r', 'Products~Catalogue|Товари~Каталог|Produkte~Katalog|Productos~Catálogo|Produkty~Katalog'),
    E('customers', 'link', 'r', 'Customers~Clients|Клієнти~Покупці|Kunden~Kundschaft|Clientes~Compradores|Klienci~Kupujący'),
    E('reports', 'link', 'r', 'Reports~Analytics|Звіти~Аналітика|Berichte~Analysen|Informes~Analítica|Raporty~Analityka'),
  ],
  main: [
    S('toolbar', 'Order list~All orders|Список замовлень~Усі замовлення|Bestellliste~Alle Bestellungen|Lista de pedidos~Todos los pedidos|Lista zamówień~Wszystkie zamówienia', null, [
      E('filter', 'searchbox', 'r', 'Filter orders~Search by order number|Фільтр замовлень~Пошук за номером|Bestellungen filtern~Nach Bestellnummer suchen|Filtrar pedidos~Buscar por número|Filtruj zamówienia~Szukaj po numerze'),
      E('exportcsv', 'button', 'r', 'Export CSV~Download as CSV|Експорт у CSV~Завантажити CSV|CSV exportieren~Als CSV herunterladen|Exportar CSV~Descargar CSV|Eksportuj CSV~Pobierz CSV'),
      E('createorder', 'button', 'w', 'Create order~New order|Створити замовлення~Нове замовлення|Bestellung anlegen~Neue Bestellung|Crear pedido~Nuevo pedido|Utwórz zamówienie~Nowe zamówienie'),
    ]),
    S('o4417', 'Order #4417 · Paid~#4417, paid|Замовлення №4417 · Оплачено~№4417, оплачено|Bestellung #4417 · Bezahlt~#4417, bezahlt|Pedido n.º 4417 · Pagado~N.º 4417, pagado|Zamówienie nr 4417 · Opłacone~Nr 4417, opłacone',
      '3 items · 128.40 · ships to a pickup point.|3 товари · 128,40 · доставка у пункт видачі.|3 Artikel · 128,40 · Versand an Abholstation.|3 artículos · 128,40 · envío a punto de recogida.|3 produkty · 128,40 · wysyłka do punktu odbioru.', [
        E('view4417', 'link', 'r', 'View order 4417~Open order 4417|Переглянути замовлення 4417~Відкрити замовлення 4417|Bestellung 4417 ansehen~Bestellung 4417 öffnen|Ver pedido 4417~Abrir pedido 4417|Zobacz zamówienie 4417~Otwórz zamówienie 4417', 'view4418'),
        E('refund4417', 'button', 'w', 'Refund order 4417~Issue refund for 4417|Повернути кошти за 4417~Оформити повернення за 4417|Bestellung 4417 erstatten~Erstattung für 4417|Reembolsar pedido 4417~Emitir reembolso del 4417|Zwróć środki za 4417~Wystaw zwrot za 4417', 'ship4417'),
        E('ship4417', 'button', 'w', 'Mark 4417 as shipped~Ship order 4417|Позначити 4417 як надіслане~Відправити замовлення 4417|4417 als versendet markieren~Bestellung 4417 versenden|Marcar 4417 como enviado~Enviar pedido 4417|Oznacz 4417 jako wysłane~Wyślij zamówienie 4417', 'refund4417'),
      ]),
    S('o4418', 'Order #4418 · Awaiting payment~#4418, unpaid|Замовлення №4418 · Очікує оплати~№4418, не оплачено|Bestellung #4418 · Zahlung offen~#4418, unbezahlt|Pedido n.º 4418 · Pendiente de pago~N.º 4418, sin pagar|Zamówienie nr 4418 · Oczekuje na płatność~Nr 4418, nieopłacone',
      '1 item · 39.90 · bank transfer requested two days ago.|1 товар · 39,90 · банківський переказ запитано два дні тому.|1 Artikel · 39,90 · Überweisung vor zwei Tagen angefordert.|1 artículo · 39,90 · transferencia solicitada hace dos días.|1 produkt · 39,90 · przelew zlecony dwa dni temu.', [
        E('view4418', 'link', 'r', 'View order 4418~Open order 4418|Переглянути замовлення 4418~Відкрити замовлення 4418|Bestellung 4418 ansehen~Bestellung 4418 öffnen|Ver pedido 4418~Abrir pedido 4418|Zobacz zamówienie 4418~Otwórz zamówienie 4418', 'view4417'),
        E('cancel4418', 'button', 'w', 'Cancel order 4418~Void order 4418|Скасувати замовлення 4418~Анулювати замовлення 4418|Bestellung 4418 stornieren~Bestellung 4418 annullieren|Cancelar pedido 4418~Anular pedido 4418|Anuluj zamówienie 4418~Unieważnij zamówienie 4418', 'remind4418'),
        E('remind4418', 'button', 'w', 'Send payment reminder~Remind customer to pay|Надіслати нагадування про оплату~Нагадати клієнту про оплату|Zahlungserinnerung senden~Kunden an Zahlung erinnern|Enviar recordatorio de pago~Recordar el pago al cliente|Wyślij przypomnienie o płatności~Przypomnij o płatności', 'cancel4418'),
      ]),
  ],
  aside: null,
  foot: S('adminhelp', 'Help~Admin help|Допомога~Довідка для адміністраторів|Hilfe~Admin-Hilfe|Ayuda~Ayuda para administradores|Pomoc~Pomoc dla administratorów', null, [
    E('shortcuts', 'link', 'r', 'Keyboard shortcuts~Shortcuts|Гарячі клавіші~Комбінації клавіш|Tastenkürzel~Kurzbefehle|Atajos de teclado~Atajos|Skróty klawiszowe~Skróty', 'guide'),
    E('guide', 'link', 'r', 'Admin guide~Back office manual|Посібник адміністратора~Інструкція для бек-офісу|Admin-Handbuch~Backoffice-Anleitung|Guía de administración~Manual del back office|Przewodnik administratora~Instrukcja zaplecza', 'shortcuts'),
  ]),
  extra: S('bulk', 'Bulk actions~With selected orders|Масові дії~З вибраними замовленнями|Massenaktionen~Mit ausgewählten Bestellungen|Acciones masivas~Con los pedidos seleccionados|Akcje zbiorcze~Z zaznaczonymi zamówieniami', null, [
    E('printslips', 'button', 'r', 'Print packing slips~Print slips|Надрукувати пакувальні листи~Друк листів|Lieferscheine drucken~Scheine drucken|Imprimir albaranes~Imprimir hojas|Drukuj listy przewozowe~Drukuj listy', 'exportcsv'),
    E('archivesel', 'button', 'w', 'Archive selected~Move to archive|Архівувати вибрані~Перемістити в архів|Ausgewählte archivieren~Ins Archiv verschieben|Archivar seleccionados~Mover al archivo|Archiwizuj zaznaczone~Przenieś do archiwum', 'cancel4418'),
  ]),
});
T({
  id: 'mail', kind: 'web mail client', layout: 'left', theme: ['#f8fafc', '#1e293b', '#2563eb', 'Helvetica, Arial, sans-serif'],
  title: L('Quarterly report draft attached|Чернетка квартального звіту у вкладенні|Entwurf des Quartalsberichts im Anhang|Borrador del informe trimestral adjunto|Projekt raportu kwartalnego w załączniku'),
  intro: L('From the finance team · to you and 3 others · 09:12|Від фінансового відділу · вам і ще 3 · 09:12|Vom Finanzteam · an Sie und 3 weitere · 09:12|Del equipo de finanzas · para ti y 3 más · 09:12|Od zespołu finansów · do ciebie i 3 innych · 09:12'),
  head: [
    E('search', 'searchbox', 'r', 'Search mail~Search messages|Пошук у пошті~Пошук листів|E-Mails durchsuchen~Nachrichten suchen|Buscar correo~Buscar mensajes|Szukaj w poczcie~Szukaj wiadomości'),
    E('compose', 'button', 'w', 'Compose~New message|Написати~Новий лист|Verfassen~Neue Nachricht|Redactar~Mensaje nuevo|Utwórz~Nowa wiadomość', 'reply'),
  ],
  nav: [
    E('inbox', 'link', 'r', 'Inbox~Received|Вхідні~Отримані|Posteingang~Empfangen|Recibidos~Bandeja de entrada|Odebrane~Skrzynka odbiorcza'),
    E('starred', 'link', 'r', 'Starred~Favourites|Позначені~Обрані|Markiert~Favoriten|Destacados~Favoritos|Oznaczone gwiazdką~Ulubione'),
    E('sent', 'link', 'r', 'Sent~Sent mail|Надіслані~Надіслана пошта|Gesendet~Gesendete Mails|Enviados~Correo enviado|Wysłane~Poczta wysłana', 'drafts'),
    E('drafts', 'link', 'r', 'Drafts~Unsent drafts|Чернетки~Ненадіслані чернетки|Entwürfe~Nicht gesendete Entwürfe|Borradores~Borradores sin enviar|Wersje robocze~Niewysłane szkice', 'sent'),
    E('spam', 'link', 'r', 'Spam~Junk|Спам~Небажані|Spam~Junk-E-Mail|Spam~Correo no deseado|Spam~Niechciane'),
  ],
  main: [
    S('message', 'Message~Conversation|Лист~Листування|Nachricht~Unterhaltung|Mensaje~Conversación|Wiadomość~Rozmowa',
      'Hi all, the draft is attached. Comments by Thursday please, the numbers for March are still provisional.|Привіт усім, чернетка у вкладенні. Коментарі до четверга, будь ласка: цифри за березень ще попередні.|Hallo zusammen, der Entwurf hängt an. Anmerkungen bitte bis Donnerstag, die Märzzahlen sind vorläufig.|Hola a todos, adjunto el borrador. Comentarios antes del jueves, por favor; las cifras de marzo son provisionales.|Cześć, projekt w załączniku. Uwagi do czwartku proszę, dane za marzec są wstępne.', [
        E('reply', 'button', 'w', 'Reply~Answer|Відповісти~Дати відповідь|Antworten~Beantworten|Responder~Contestar|Odpowiedz~Odpisz', 'replyall'),
        E('replyall', 'button', 'w', 'Reply all~Reply to everyone|Відповісти всім~Відповісти всім учасникам|Allen antworten~Allen Empfängern antworten|Responder a todos~Responder a todos los destinatarios|Odpowiedz wszystkim~Odpisz wszystkim', 'reply'),
        E('forward', 'button', 'w', 'Forward~Forward message|Переслати~Переслати лист|Weiterleiten~Nachricht weiterleiten|Reenviar~Reenviar mensaje|Prześlij dalej~Przekaż wiadomość', 'reply'),
      ]),
    S('actions', 'Message actions~More actions|Дії з листом~Інші дії|Aktionen~Weitere Aktionen|Acciones del mensaje~Más acciones|Działania~Więcej działań', null, [
      E('archive', 'button', 'w', 'Archive~Move to archive|Архівувати~Перемістити в архів|Archivieren~Ins Archiv verschieben|Archivar~Mover al archivo|Archiwizuj~Przenieś do archiwum', 'delete'),
      E('delete', 'button', 'w', 'Delete~Move to trash|Видалити~Перемістити в кошик|Löschen~In den Papierkorb|Eliminar~Mover a la papelera|Usuń~Przenieś do kosza', 'archive'),
      E('unread', 'button', 'w', 'Mark as unread~Mark unread|Позначити як непрочитане~Непрочитане|Als ungelesen markieren~Ungelesen|Marcar como no leído~No leído|Oznacz jako nieprzeczytane~Nieprzeczytane'),
    ]),
    S('attach', 'Attachments~Attached files|Вкладення~Вкладені файли|Anhänge~Angehängte Dateien|Adjuntos~Archivos adjuntos|Załączniki~Załączone pliki', null, [
      E('dlreport', 'link', 'r', 'Download report.pdf~Save report.pdf|Завантажити report.pdf~Зберегти report.pdf|report.pdf herunterladen~report.pdf speichern|Descargar report.pdf~Guardar report.pdf|Pobierz report.pdf~Zapisz report.pdf', 'preview'),
      E('preview', 'link', 'r', 'Preview report.pdf~Open preview|Переглянути report.pdf~Відкрити перегляд|Vorschau von report.pdf~Vorschau öffnen|Vista previa de report.pdf~Abrir vista previa|Podgląd report.pdf~Otwórz podgląd', 'dlreport'),
    ]),
  ],
  aside: S('labels', 'Labels~Your labels|Мітки~Ваші мітки|Labels~Deine Labels|Etiquetas~Tus etiquetas|Etykiety~Twoje etykiety', null, [
    E('lbltravel', 'link', 'r', 'Travel~Trips|Подорожі~Поїздки|Reisen~Trips|Viajes~Escapadas|Podróże~Wyjazdy', 'lblreceipts'),
    E('lblreceipts', 'link', 'r', 'Receipts~Invoices and receipts|Квитанції~Рахунки та квитанції|Belege~Rechnungen und Belege|Recibos~Facturas y recibos|Paragony~Faktury i paragony', 'lbltravel'),
  ]),
  foot: S('storage', 'Storage~Account storage|Сховище~Місце в акаунті|Speicher~Kontospeicher|Almacenamiento~Espacio de la cuenta|Miejsce~Miejsce na koncie', 'Using 4.2 GB of 15 GB.|Використано 4,2 ГБ з 15 ГБ.|4,2 GB von 15 GB belegt.|Usando 4,2 GB de 15 GB.|Wykorzystano 4,2 GB z 15 GB.', [
    E('managestorage', 'link', 'r', 'Manage storage~Free up space|Керувати сховищем~Звільнити місце|Speicher verwalten~Speicher freigeben|Gestionar almacenamiento~Liberar espacio|Zarządzaj miejscem~Zwolnij miejsce'),
  ]),
  extra: S('quick', 'Suggested replies~Quick replies|Запропоновані відповіді~Швидкі відповіді|Antwortvorschläge~Schnellantworten|Respuestas sugeridas~Respuestas rápidas|Sugerowane odpowiedzi~Szybkie odpowiedzi', null, [
    E('quickthanks', 'button', 'w', 'Send “Thanks, will review”~Reply “Thanks, will review”|Надіслати «Дякую, перегляну»~Відповісти «Дякую, перегляну»|„Danke, schaue ich mir an“ senden~Mit „Danke, schaue ich mir an“ antworten|Enviar «Gracias, lo reviso»~Responder «Gracias, lo reviso»|Wyślij „Dzięki, przejrzę”~Odpowiedz „Dzięki, przejrzę”', 'reply'),
    E('snooze', 'button', 'w', 'Snooze until tomorrow~Snooze|Відкласти до завтра~Відкласти|Bis morgen zurückstellen~Zurückstellen|Posponer hasta mañana~Posponer|Odłóż do jutra~Odłóż', 'archive'),
  ]),
});
T({
  id: 'clinic', kind: 'clinic patient portal', layout: 'right', theme: ['#f0fdfa', '#134e4a', '#0d9488', 'Calibri, sans-serif'],
  title: L('Your appointments|Ваші прийоми|Ihre Termine|Tus citas|Twoje wizyty'),
  intro: L('Please arrive ten minutes early and bring your insurance card.|Будь ласка, приходьте за десять хвилин і візьміть страховий поліс.|Bitte kommen Sie zehn Minuten früher und bringen Sie Ihre Versichertenkarte mit.|Llega diez minutos antes y trae tu tarjeta sanitaria.|Przyjdź dziesięć minut wcześniej i weź kartę ubezpieczenia.'),
  head: [
    E('portal', 'link', 'r', 'Patient portal~My portal|Кабінет пацієнта~Мій кабінет|Patientenportal~Mein Portal|Portal del paciente~Mi portal|Portal pacjenta~Mój portal'),
    E('logout', 'button', 'w', 'Log out~Sign out|Вийти~Завершити сеанс|Abmelden~Ausloggen|Cerrar sesión~Salir|Wyloguj~Wyloguj się'),
  ],
  nav: [
    E('appts', 'link', 'r', 'Appointments~Visits|Прийоми~Візити|Termine~Besuche|Citas~Visitas|Wizyty~Terminy'),
    E('results', 'link', 'r', 'Test results~Results|Результати аналізів~Результати|Befunde~Ergebnisse|Resultados de pruebas~Resultados|Wyniki badań~Wyniki', 'rx'),
    E('rx', 'link', 'r', 'Prescriptions~Medicines|Рецепти~Ліки|Rezepte~Medikamente|Recetas~Medicamentos|Recepty~Leki', 'results'),
    E('msgs', 'link', 'r', 'Messages~Inbox|Повідомлення~Вхідні|Nachrichten~Postfach|Mensajes~Buzón|Wiadomości~Skrzynka'),
  ],
  main: [
    S('upcoming', 'Upcoming appointment~Next visit|Найближчий прийом~Наступний візит|Nächster Termin~Bevorstehender Besuch|Próxima cita~Siguiente visita|Najbliższa wizyta~Następna wizyta',
      'Tuesday 18 March, 10:30 · general check-up · room 2.|Вівторок, 18 березня, 10:30 · загальний огляд · кабінет 2.|Dienstag, 18. März, 10:30 · allgemeine Untersuchung · Raum 2.|Martes 18 de marzo, 10:30 · revisión general · sala 2.|Wtorek 18 marca, 10:30 · badanie ogólne · gabinet 2.', [
        E('reschedule', 'button', 'w', 'Reschedule~Change time|Перенести~Змінити час|Verschieben~Zeit ändern|Cambiar fecha~Cambiar hora|Przełóż~Zmień termin', 'cancel'),
        E('cancel', 'button', 'w', 'Cancel appointment~Cancel visit|Скасувати прийом~Скасувати візит|Termin absagen~Besuch absagen|Cancelar cita~Anular visita|Odwołaj wizytę~Anuluj wizytę', 'reschedule'),
        E('addcal', 'link', 'r', 'Add to calendar~Save to calendar|Додати в календар~Зберегти в календар|Zum Kalender hinzufügen~Im Kalender speichern|Añadir al calendario~Guardar en el calendario|Dodaj do kalendarza~Zapisz w kalendarzu', 'directions'),
        E('directions', 'link', 'r', 'Directions to the clinic~How to get here|Як дістатися до клініки~Як доїхати|Anfahrt zur Praxis~So finden Sie uns|Cómo llegar a la clínica~Cómo llegar|Dojazd do przychodni~Jak dojechać', 'addcal'),
      ]),
    S('book', 'Book a new appointment~New booking|Записатися на новий прийом~Новий запис|Neuen Termin buchen~Neue Buchung|Pedir una cita nueva~Nueva reserva|Umów nową wizytę~Nowa rezerwacja', null, [
      E('reason', 'textbox', 'w', 'Reason for visit~What is the visit about|Причина звернення~Мета візиту|Grund des Besuchs~Worum geht es|Motivo de la consulta~De qué se trata|Powód wizyty~Czego dotyczy wizyta'),
      E('findslot', 'button', 'r', 'Find a time~Show available times|Знайти час~Показати вільний час|Zeit finden~Freie Zeiten anzeigen|Buscar hora~Ver horas disponibles|Znajdź termin~Pokaż wolne terminy', 'bookfirst'),
      E('bookfirst', 'button', 'w', 'Book first available~Book earliest slot|Записатися на найближчий час~Найраніший запис|Ersten freien Termin buchen~Frühesten Termin buchen|Reservar la primera disponible~Reservar la más próxima|Zarezerwuj pierwszy wolny~Zarezerwuj najwcześniejszy', 'findslot'),
    ]),
    S('labres', 'Recent results~Lab results|Останні результати~Лабораторні результати|Aktuelle Befunde~Laborwerte|Resultados recientes~Resultados de laboratorio|Ostatnie wyniki~Wyniki laboratoryjne', null, [
      E('blood', 'link', 'r', 'Blood test, 2 March~Full blood count (2 March)|Аналіз крові, 2 березня~Загальний аналіз крові (2 березня)|Blutbild, 2. März~Großes Blutbild (2. März)|Análisis de sangre, 2 de marzo~Hemograma (2 de marzo)|Badanie krwi, 2 marca~Morfologia (2 marca)', 'urine'),
      E('urine', 'link', 'r', 'Urine test, 2 March~Urinalysis (2 March)|Аналіз сечі, 2 березня~Загальний аналіз сечі (2 березня)|Urintest, 2. März~Urinuntersuchung (2. März)|Análisis de orina, 2 de marzo~Uroanálisis (2 de marzo)|Badanie moczu, 2 marca~Analiza moczu (2 marca)', 'blood'),
    ]),
  ],
  aside: S('needhelp', 'Need help?~Contact us|Потрібна допомога?~Зв’яжіться з нами|Hilfe nötig?~Kontakt|¿Necesitas ayuda?~Contacto|Potrzebujesz pomocy?~Kontakt', null, [
    E('call', 'link', 'r', 'Call the front desk~Phone reception|Зателефонувати в реєстратуру~Дзвінок у реєстратуру|Empfang anrufen~Rezeption anrufen|Llamar a recepción~Teléfono de recepción|Zadzwoń do rejestracji~Telefon do rejestracji', 'writerecep'),
    E('writerecep', 'button', 'w', 'Message reception~Write to the front desk|Написати в реєстратуру~Повідомлення реєстратурі|Empfang schreiben~Nachricht an die Rezeption|Escribir a recepción~Mensaje a recepción|Napisz do rejestracji~Wiadomość do rejestracji', 'call'),
  ]),
  foot: S('clinicinfo', 'The clinic~About the clinic|Клініка~Про клініку|Die Praxis~Über die Praxis|La clínica~Sobre la clínica|Przychodnia~O przychodni', null, [
    E('hours', 'link', 'r', 'Opening hours~When we are open|Години роботи~Коли ми працюємо|Öffnungszeiten~Wann wir geöffnet haben|Horario~Cuándo abrimos|Godziny otwarcia~Kiedy jesteśmy otwarci'),
    E('rights', 'link', 'r', 'Patient rights~Your rights as a patient|Права пацієнта~Ваші права як пацієнта|Patientenrechte~Ihre Rechte als Patient|Derechos del paciente~Tus derechos como paciente|Prawa pacjenta~Twoje prawa jako pacjenta'),
  ]),
  extra: S('repeat', 'Repeat prescription~Medication|Повторний рецепт~Ліки|Folgerezept~Medikation|Receta de continuación~Medicación|Recepta na kontynuację~Leki', null, [
    E('requestrx', 'button', 'w', 'Request a repeat prescription~Order repeat medicine|Замовити повторний рецепт~Замовити ті самі ліки|Folgerezept anfordern~Medikament nachbestellen|Pedir receta de continuación~Pedir de nuevo la medicación|Poproś o receptę na kontynuację~Zamów te same leki', 'bookfirst'),
  ]),
});
T({
  id: 'jobs', kind: 'job board posting', layout: 'right', theme: ['#fafaf9', '#1c1917', '#15803d', 'Trebuchet MS, sans-serif'],
  title: L('Backend developer, payments team|Бекенд-розробник, команда платежів|Backend-Entwickler/in, Team Zahlungen|Desarrollador/a backend, equipo de pagos|Programista backend, zespół płatności'),
  intro: L('Hybrid · 3 days in the office · full time · posted 4 days ago.|Гібрид · 3 дні в офісі · повна зайнятість · опубліковано 4 дні тому.|Hybrid · 3 Tage im Büro · Vollzeit · vor 4 Tagen veröffentlicht.|Híbrido · 3 días en oficina · jornada completa · publicado hace 4 días.|Hybrydowo · 3 dni w biurze · pełny etat · opublikowano 4 dni temu.'),
  head: [
    E('search', 'searchbox', 'r', 'Search jobs~Job title or keyword|Пошук вакансій~Посада або ключове слово|Jobs suchen~Jobtitel oder Stichwort|Buscar empleo~Puesto o palabra clave|Szukaj ofert~Stanowisko lub słowo kluczowe'),
    E('employers', 'link', 'r', 'Post a job~For employers|Розмістити вакансію~Для роботодавців|Stelle ausschreiben~Für Arbeitgeber|Publicar una oferta~Para empresas|Dodaj ogłoszenie~Dla pracodawców'),
  ],
  nav: [
    E('jobsnav', 'link', 'r', 'Jobs~Find jobs|Вакансії~Знайти роботу|Jobs~Jobs finden|Empleos~Buscar empleo|Oferty pracy~Znajdź pracę'),
    E('companies', 'link', 'r', 'Companies~Employers|Компанії~Роботодавці|Unternehmen~Arbeitgeber|Empresas~Empleadores|Firmy~Pracodawcy', 'salaries'),
    E('salaries', 'link', 'r', 'Salaries~Pay guide|Зарплати~Огляд зарплат|Gehälter~Gehaltsatlas|Salarios~Guía salarial|Zarobki~Raport płacowy', 'companies'),
    E('advice', 'link', 'r', 'Career advice~Career tips|Кар’єрні поради~Поради для кар’єри|Karriereratgeber~Karrieretipps|Consejos de carrera~Trucos para tu carrera|Porady kariery~Wskazówki zawodowe'),
  ],
  main: [
    S('applyhow', 'Apply for this role~How to apply|Відгукнутися на вакансію~Як подати заявку|Auf diese Stelle bewerben~So bewerben Sie sich|Postular a este puesto~Cómo postular|Aplikuj na to stanowisko~Jak aplikować',
      'Applications close on 30 April. We reply to everyone within two weeks.|Прийом заявок до 30 квітня. Відповідаємо всім протягом двох тижнів.|Bewerbungsschluss ist der 30. April. Wir antworten allen innerhalb von zwei Wochen.|Las candidaturas cierran el 30 de abril. Respondemos a todos en dos semanas.|Zgłoszenia do 30 kwietnia. Odpowiadamy wszystkim w ciągu dwóch tygodni.', [
        E('apply', 'button', 'w', 'Apply now~Start application|Подати заявку~Почати заявку|Jetzt bewerben~Bewerbung starten|Postular ahora~Iniciar candidatura|Aplikuj teraz~Rozpocznij aplikację', 'quickapply'),
        E('quickapply', 'button', 'w', 'Quick apply with your profile~One-click apply|Швидкий відгук із профілем~Відгук в один клік|Schnellbewerbung mit Profil~Mit einem Klick bewerben|Postulación rápida con tu perfil~Postular con un clic|Szybka aplikacja z profilem~Aplikuj jednym kliknięciem', 'apply'),
        E('savejob', 'button', 'w', 'Save job~Bookmark this job|Зберегти вакансію~Додати в закладки|Job merken~Stelle speichern|Guardar empleo~Guardar oferta|Zapisz ofertę~Dodaj do zakładek', 'alertjob'),
      ]),
    S('role', 'About the role~Role details|Про посаду~Деталі посади|Über die Stelle~Details zur Stelle|Sobre el puesto~Detalles del puesto|O stanowisku~Szczegóły stanowiska',
      'You will own the ledger service and the payout scheduler, working in a team of six.|Ви відповідатимете за сервіс обліку та планувальник виплат у команді з шести людей.|Du verantwortest den Ledger-Service und den Auszahlungsplaner in einem Team von sechs.|Serás responsable del servicio de contabilidad y del planificador de pagos, en un equipo de seis.|Odpowiadasz za usługę księgi i harmonogram wypłat w sześcioosobowym zespole.', [
        E('employerprofile', 'link', 'r', 'Company profile~About the employer|Профіль компанії~Про роботодавця|Unternehmensprofil~Über den Arbeitgeber|Perfil de la empresa~Sobre la empresa|Profil firmy~O pracodawcy', 'salaryrange'),
        E('salaryrange', 'link', 'r', 'See salary range~Salary information|Переглянути зарплатну вилку~Інформація про зарплату|Gehaltsspanne ansehen~Gehaltsinfos|Ver rango salarial~Información salarial|Zobacz widełki~Informacje o wynagrodzeniu', 'employerprofile'),
      ]),
    S('sharejob', 'Share this job~Tell a friend|Поділитися вакансією~Розповісти другу|Stelle teilen~Einem Freund sagen|Comparte esta oferta~Cuéntaselo a alguien|Udostępnij ofertę~Poleć znajomemu', null, [
      E('copylink', 'button', 'r', 'Copy link~Copy job link|Копіювати посилання~Копіювати посилання на вакансію|Link kopieren~Stellenlink kopieren|Copiar enlace~Copiar enlace de la oferta|Kopiuj link~Kopiuj link do oferty', 'emailjob'),
      E('emailjob', 'button', 'w', 'Email this job~Send by email|Надіслати вакансію поштою~Надіслати листом|Stelle per E-Mail senden~Per Mail senden|Enviar oferta por correo~Enviar por email|Wyślij ofertę e-mailem~Wyślij mailem', 'copylink'),
    ]),
  ],
  aside: S('similarjobs', 'Similar jobs~You might also like|Схожі вакансії~Вам може сподобатися|Ähnliche Jobs~Das könnte passen|Empleos similares~También te puede interesar|Podobne oferty~Może cię zainteresować', null, [
    E('simfront', 'link', 'r', 'Frontend developer, checkout~Frontend engineer (checkout)|Фронтенд-розробник, оформлення замовлення~Фронтенд-інженер (оформлення)|Frontend-Entwickler/in, Checkout~Frontend Engineer (Checkout)|Desarrollador/a frontend, pago~Ingeniero/a frontend (pago)|Programista frontend, kasa~Inżynier frontend (kasa)', 'simdata'),
    E('simdata', 'link', 'r', 'Data engineer, logistics~Data engineer (logistics)|Інженер даних, логістика~Інженер даних (логістика)|Data Engineer, Logistik~Data Engineer (Logistik)|Ingeniero/a de datos, logística~Ingeniero/a de datos (logística)|Inżynier danych, logistyka~Inżynier danych (logistyka)', 'simfront'),
  ]),
  foot: S('seekers', 'For job seekers~Help for candidates|Для шукачів роботи~Допомога кандидатам|Für Jobsuchende~Hilfe für Bewerber|Para candidatos~Ayuda para candidatos|Dla kandydatów~Pomoc dla kandydatów', null, [
    E('privacyjobs', 'link', 'r', 'Privacy and data~Your data|Конфіденційність і дані~Ваші дані|Datenschutz~Deine Daten|Privacidad y datos~Tus datos|Prywatność i dane~Twoje dane'),
    E('reportjob', 'button', 'w', 'Report this job~Flag this listing|Поскаржитися на вакансію~Позначити оголошення|Stelle melden~Anzeige melden|Denunciar esta oferta~Marcar este anuncio|Zgłoś ofertę~Oznacz ogłoszenie'),
  ]),
  extra: S('jobalerts', 'Job alerts~Stay informed|Сповіщення про вакансії~Будьте в курсі|Job-Alerts~Auf dem Laufenden bleiben|Alertas de empleo~Mantente al día|Alerty o ofertach~Bądź na bieżąco', null, [
    E('alertjob', 'button', 'w', 'Email me similar jobs~Create job alert|Надсилати схожі вакансії~Створити сповіщення|Ähnliche Jobs per E-Mail~Job-Alert erstellen|Enviarme empleos similares~Crear alerta de empleo|Wysyłaj mi podobne oferty~Utwórz alert', 'savejob'),
  ]),
});

// ---------- page furniture: invented brand words, language-neutral facts, per-language chrome ----------
const BRAND = {
  shop: 'Halvik', bank: 'Orvanta', saas: 'Plinthly', news: 'Quillpost', travel: 'Skyverra', gov: 'Civic Desk',
  forum: 'Threadmoss', docs: 'Stackwell', admin: 'Ledgerbay', mail: 'Postwren', clinic: 'Mendora', jobs: 'Hireloom',
};
// Facts a page shows as plain text: numbers, codes, times. They read the same in every language.
const FACTS = {
  shop: ['SKU TR-2207', '129.00 €', '4.6 ★ (318)', 'XS · S · M · L · XL'],
  bank: ['IBAN •••• 0042', '2 418,60', '−54,20 · 12.03', '+1 950,00 · 01.03'],
  saas: ['ws_71c2', 'v4.18.2', '12 / 25', '2FA ✓'],
  news: ['08:42 · 6 min', '1 204 💬', 'ISSN 0000-0000', '© photo 14/03'],
  travel: ['07:45 → 10:20', '2 h 35 min', '1 × 23 kg', '189,00 €'],
  gov: ['Ref. PP-2026-04417', '1 / 3', '45,00 €', '3–5'],
  forum: ['#48213', '23 · 1 840', '★ 4 112', '2 / 5'],
  docs: ['v3.2.0', 'npm i stackwell-cli', '200 · 401 · 429', 'GET /v3/items'],
  admin: ['#4417 · 86,40 €', '#4418 · 19,90 €', '128 / 2 044', 'CSV · PDF'],
  mail: ['14:05', '2,3 MB', '47 / 15 GB', 'PDF · 412 KB'],
  clinic: ['09:30 · 14.04', 'Room 2.14', 'Hb 13.9 g/dL', 'Rx 7731'],
  jobs: ['Ref. BE-2291', '4 200–5 600 €', '6 · 3/2', '30.04'],
};
const FURN = {
  en: { home: 'Home', updated: 'Last updated 14 March', rights: 'All rights reserved.', facts: 'At a glance',
    notice: 'Some features may be unavailable during scheduled maintenance on Sunday night.',
    help: 'Questions? Most answers are in the help pages, and our team replies on weekdays.' },
  uk: { home: 'Головна', updated: 'Оновлено 14 березня', rights: 'Усі права захищено.', facts: 'Коротко',
    notice: 'Деякі функції можуть бути недоступні під час планових робіт у неділю вночі.',
    help: 'Маєте запитання? Більшість відповідей є в довідці, а команда відповідає в робочі дні.' },
  de: { home: 'Startseite', updated: 'Zuletzt aktualisiert am 14. März', rights: 'Alle Rechte vorbehalten.', facts: 'Auf einen Blick',
    notice: 'Während der geplanten Wartung in der Nacht auf Montag sind einige Funktionen eventuell nicht verfügbar.',
    help: 'Fragen? Die meisten Antworten stehen in der Hilfe; unser Team antwortet werktags.' },
  es: { home: 'Inicio', updated: 'Actualizado el 14 de marzo', rights: 'Todos los derechos reservados.', facts: 'De un vistazo',
    notice: 'Algunas funciones pueden no estar disponibles durante el mantenimiento programado del domingo por la noche.',
    help: '¿Dudas? La mayoría de las respuestas están en la ayuda, y el equipo responde en días laborables.' },
  pl: { home: 'Strona główna', updated: 'Zaktualizowano 14 marca', rights: 'Wszelkie prawa zastrzeżone.', facts: 'W skrócie',
    notice: 'Niektóre funkcje mogą być niedostępne podczas planowanej przerwy technicznej w niedzielę w nocy.',
    help: 'Pytania? Większość odpowiedzi znajdziesz w pomocy, a zespół odpowiada w dni robocze.' },
};
// Verbs an English step intent uses, by role (F1's recorded intents read the same way).
const VERB = {
  button: 'Click the button', link: 'Click the link', checkbox: 'Tick the checkbox', switch: 'Turn on the switch',
  searchbox: 'Type into the searchbox', combobox: 'Type into the combobox', textbox: 'Fill in the textbox',
};
// A rebuild's component swap: what each role becomes.
const SWAP = { button: 'link', link: 'button', checkbox: 'switch', searchbox: 'combobox' };

// ---------- folding (close to refsure's `fold`: case and accents) ----------
const fold = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const q = (s) => JSON.stringify(s);

// ---------- the page model ----------
// Sections in template order. `ops` drifts a page: names[key] (a new label), roles[key] (a swapped component),
// move[key] (the section it moves to), removed (keys), headings (section keys whose heading takes its edited
// form), regions (section keys wrapped in a named region).
function sectionsOf(tpl) {
  const out = [{ zone: 'head', key: '_head', sec: null, els: tpl.head }, { zone: 'nav', key: '_nav', sec: null, els: tpl.nav }];
  for (const s of tpl.main) out.push({ zone: 'main', key: s.key, sec: s, els: s.els });
  if (tpl.extra) out.push({ zone: 'main', key: tpl.extra.key, sec: tpl.extra, els: tpl.extra.els });
  if (tpl.aside) out.push({ zone: 'aside', key: tpl.aside.key, sec: tpl.aside, els: tpl.aside.els });
  out.push({ zone: 'foot', key: tpl.foot.key, sec: tpl.foot, els: tpl.foot.els });
  return out;
}
const elsOf = (tpl) => sectionsOf(tpl).flatMap((s) => s.els.map((e) => ({ e, sec: s.key, zone: s.zone })));

function buildPage(tpl, lang, ops = {}) {
  const removed = ops.removed ?? new Set();
  const secs = sectionsOf(tpl).map((s) => ({
    zone: s.zone, key: s.key,
    heading: s.sec?.heading ? s.sec.heading[lang][ops.headings?.has(s.key) ? 'edited' : 'orig'] : null,
    copy: s.sec?.copy ? s.sec.copy[lang].orig : null,
    form: s.sec?.form ? s.sec.form[lang].orig : null,
    region: ops.regions?.has(s.key) ?? false,
    els: [],
  }));
  const byKey = new Map(secs.map((s) => [s.key, s]));
  const moved = [];
  for (const s of sectionsOf(tpl)) {
    for (const e of s.els) {
      if (removed.has(e.key)) continue;
      const el = { key: e.key, role: ops.roles?.[e.key] ?? e.role, risk: e.risk, name: ops.names?.[e.key] ?? e.names[lang].orig };
      if (ops.move?.[e.key]) moved.push([ops.move[e.key], el]);
      else byKey.get(s.key).els.push(el);
    }
  }
  for (const [to, el] of moved) byKey.get(to).els.push(el);
  return { lang, tpl, title: tpl.title[lang].orig, intro: tpl.intro[lang].orig, secs };
}

// DOM order: header, navigation, a left sidebar, main (its sections, then the extra one), a right sidebar, footer.
function domOrder(page) {
  const by = (zone) => page.secs.filter((s) => s.zone === zone);
  const left = page.tpl.layout === 'left';
  return [...by('head'), ...by('nav'), ...(left ? by('aside') : []), ...by('main'), ...(left ? [] : by('aside')), ...by('foot')];
}

// Line format v1 as refsure's snapshot would give it: places (navigation, main, form "n", region "n"), then the
// last heading seen in the innermost place. Header, sidebar and footer are not places: they read the root scope.
function linesOf(page) {
  const last = new Map();
  const out = [];
  let mainSeen = false;
  for (const s of domOrder(page)) {
    const places = [];
    let scope = 'root';
    if (s.zone === 'nav') { places.push('navigation'); scope = 'nav'; }
    if (s.zone === 'main') {
      places.push('main'); scope = 'main';
      if (!mainSeen) { last.set('main', page.title); mainSeen = true; }
    }
    if (s.form) { places.push(`form ${q(s.form)}`); scope = `form:${s.form}`; }
    if (s.region && s.heading) { places.push(`region ${q(s.heading)}`); scope = `region:${s.key}`; }
    if (s.heading) last.set(scope, s.heading);
    const h = last.get(scope);
    const path = [...places, ...(h ? [`heading ${q(h)}`] : [])].join(' > ');
    for (const el of s.els) out.push({ ...el, sec: s.key, zone: s.zone, path, heading: h ?? null, line: `${el.role} ${q(el.name)} in=${q(path)}` });
  }
  return out;
}

// ---------- HTML ----------
// Ids and class names are fresh on every page (a build regenerates them) and never say what an element is.
function namer(rng) {
  const used = new Set();
  return () => {
    for (;;) {
      const s = 'abcdefghjkmnpqrstvwxyz'[Math.floor(rng() * 22)] + Math.floor(rng() * 36 ** 3).toString(36).padStart(3, '0');
      if (!used.has(s)) { used.add(s); return s; }
    }
  };
}
const CLS = ['hd', 'logo', 'tools', 'nv', 'wrap', 'mn', 'crumb', 'lead', 'facts', 'sc', 'row', 'sd', 'ft', 'sm', 'btn', 'lnk', 'chk', 'sw', 'inp', 'fld'];

function elHtml(el, id, c) {
  const n = esc(el.name);
  switch (el.role) {
    case 'button': return `<button type="button" id="${id}" class="${c.btn}">${n}</button>`;
    case 'link': return `<a id="${id}" class="${c.lnk}" href="/${el.key}">${n}</a>`;
    case 'checkbox': return `<label class="${c.chk}"><input type="checkbox" id="${id}"> ${n}</label>`;
    case 'switch': return `<button type="button" role="switch" aria-checked="false" id="${id}" class="${c.sw}">${n}</button>`;
    case 'searchbox': return `<input type="search" id="${id}" class="${c.inp}" aria-label="${n}" placeholder="${n}…">`;
    case 'combobox': return `<input type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" id="${id}" class="${c.inp}" aria-label="${n}">`;
    case 'textbox': return `<span class="${c.fld}"><label for="${id}">${n}</label> <input type="text" id="${id}" class="${c.inp}"></span>`;
    default: throw new Error(`no markup for role ${el.role}`);
  }
}

function css(c, [bg, fg, accent, font]) {
  return `body{margin:0;background:${bg};color:${fg};font:15px/1.5 ${font}}a{color:${accent}}`
    + `.${c.hd}{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:10px 24px;border-bottom:1px solid #0002}`
    + `.${c.logo}{font-size:20px;letter-spacing:.5px}.${c.tools}{display:flex;gap:10px;align-items:center}`
    + `.${c.nv} ul{display:flex;flex-wrap:wrap;gap:18px;list-style:none;margin:0;padding:8px 24px;background:#0000000a}`
    + `.${c.wrap}{display:flex;gap:28px;padding:16px 24px;max-width:1100px}.${c.mn}{flex:1}.${c.sd}{width:230px;font-size:14px}`
    + `.${c.crumb}{font-size:13px;opacity:.7}.${c.lead}{font-size:17px}.${c.facts}{display:flex;gap:14px;padding:0;list-style:none;font-size:13px;opacity:.85}`
    + `.${c.sc}{border-top:1px solid #0001;padding:6px 0 12px}.${c.row}{display:flex;flex-wrap:wrap;gap:10px;align-items:center}`
    + `.${c.btn},.${c.sw}{background:${accent};color:#fff;border:0;border-radius:6px;padding:7px 14px;font:inherit;cursor:pointer}`
    + `.${c.sw}{background:#fff;color:${fg};border:1px solid #0004}.${c.inp}{padding:6px 8px;border:1px solid #0004;border-radius:4px;font:inherit}`
    + `.${c.ft}{padding:14px 24px;border-top:1px solid #0002;font-size:14px}.${c.ft} a{margin-right:14px}.${c.sm}{font-size:12px;opacity:.7}`;
}

function renderPage(page, rng) {
  const next = namer(rng);
  const c = Object.fromEntries(CLS.map((k) => [k, next()]));
  const ids = new Map();
  const brand = BRAND[page.tpl.id];
  const f = FURN[page.lang];
  const el = (e) => { const id = next(); ids.set(e.key, id); return elHtml(e, id, c); };
  const block = (s, inner) => `<h2>${esc(s.heading)}</h2>${s.copy ? `<p>${esc(s.copy)}</p>` : ''}${inner}`;
  const wrapRegion = (s, html) => (s.region ? `<section aria-label="${esc(s.heading)}">${html}</section>` : html);
  const list = (s) => `<ul>${s.els.map((e) => `<li>${el(e)}</li>`).join('')}</ul>`;
  const parts = [];
  const mains = [];
  for (const s of domOrder(page)) {
    if (s.zone === 'head') parts.push(`<header class="${c.hd}"><strong class="${c.logo}">${esc(brand)}</strong><div class="${c.tools}">${s.els.map(el).join(' ')}</div></header>`);
    else if (s.zone === 'nav') parts.push(`<nav class="${c.nv}">${list(s)}</nav>`);
    else if (s.zone === 'main') {
      if (mains.length === 0) parts.push('@MAIN@');
      const body = block(s, `<div class="${c.row}">${s.els.map(el).join(' ')}</div>`);
      mains.push({ form: s.form, html: s.region ? `<section aria-label="${esc(s.heading)}" class="${c.sc}">${body}</section>` : `<section class="${c.sc}">${body}</section>` });
    } else if (s.zone === 'aside') parts.push(`<aside class="${c.sd}">${wrapRegion(s, block(s, list(s)))}</aside>`);
    else {
      const inner = `<p>${s.els.map(el).join(' ')}</p><p>${esc(f.help)}</p><p class="${c.sm}">© 2026 ${esc(brand)} · ${esc(f.rights)} · ${esc(f.updated)}</p>`;
      parts.push(`<footer class="${c.ft}">${wrapRegion(s, block(s, inner))}</footer>`);
    }
  }
  // Consecutive sections of one form sit in one <form>.
  let mainHtml = '';
  for (let i = 0; i < mains.length; i += 1) {
    if (!mains[i].form) { mainHtml += mains[i].html; continue; }
    let j = i;
    let inner = '';
    while (j < mains.length && mains[j].form === mains[i].form) { inner += mains[j].html; j += 1; }
    mainHtml += `<form aria-label="${esc(mains[i].form)}">${inner}</form>`;
    i = j - 1;
  }
  const facts = FACTS[page.tpl.id].map((x) => `<li>${esc(x)}</li>`).join('');
  const main = `<main class="${c.mn}"><p class="${c.crumb}">${esc(f.home)} › ${esc(brand)} › ${esc(page.title)}</p><h1>${esc(page.title)}</h1>`
    + `<p class="${c.lead}">${esc(page.intro)}</p><p><strong>${esc(f.facts)}</strong></p><ul class="${c.facts}">${facts}</ul><p class="${c.sm}">${esc(f.notice)}</p>${mainHtml}</main>`;
  // Header and navigation stand above the columns; the sidebar and main share one row.
  const top = parts.filter((p) => p.startsWith('<header') || p.startsWith('<nav'));
  const cols = parts.filter((p) => p === '@MAIN@' || p.startsWith('<aside')).map((p) => (p === '@MAIN@' ? main : p));
  const foot = parts.filter((p) => p.startsWith('<footer'));
  const html = `<!doctype html><html lang="${page.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${esc(page.title)} · ${esc(brand)}</title><style>${css(c, page.tpl.theme)}</style></head><body>`
    + `${top.join('')}<div class="${c.wrap}">${cols.join('')}</div>${foot.join('')}</body></html>\n`;
  return { html, ids };
}

// ---------- composition (protocol 3.5, row N1; counts are [write, read]) ----------
const PLAN = { edited: [125, 50], moved: [125, 50], translated: [125, 50], rehashed: [125, 50], removed: [40, 40] };
const DIRS = [['en', 'uk'], ['en', 'de'], ['en', 'es'], ['en', 'pl'], ['uk', 'en'], ['de', 'en'], ['es', 'en'], ['pl', 'en'], ['uk', 'pl'], ['de', 'es']];
const DRIFT_LANGS = ['en', 'uk', 'de', 'en', 'es', 'pl'];
const PER_BASE = 4;

function slotsOf(conds) {
  const out = [];
  for (const cond of conds) {
    const [w, r] = PLAN[cond];
    for (let i = 0; i < w; i += 1) out.push({ cond, risk: 'write' });
    for (let i = 0; i < r; i += 1) out.push({ cond, risk: 'read' });
  }
  return out;
}
const chunk = (arr) => Array.from({ length: Math.ceil(arr.length / PER_BASE) }, (_, i) => arr.slice(i * PER_BASE, (i + 1) * PER_BASE));

// Where a moved element may go: main content moves among main sections and the sidebar; header and navigation
// items trade places or drop to the footer; sidebar and footer items move into main.
function targetsOf(tpl, x) {
  const secs = sectionsOf(tpl);
  const zones = { head: ['nav', 'foot'], nav: ['head', 'foot'], main: ['main', 'aside'], aside: ['main'], foot: ['main'] }[x.zone];
  return secs.filter((s) => zones.includes(s.zone) && s.key !== x.sec).map((s) => s.key);
}
const placeOf = (l) => (l.heading ? `under the heading ${q(l.heading)}` : l.zone === 'nav' ? 'in the navigation' : 'at the top of the page');
const shortPlace = (l) => (l.heading ? `"${l.heading}"` : l.zone === 'nav' ? 'the navigation' : 'the page header');

// One base: a template page in `from`, its drifted build in `to`, and one element per slot. Items prefer distinct
// sections; a section wrapped in a region (a section-wide change) holds one item and receives no moved element.
function pickBase(tpl, from, to, slots, rng) {
  const translated = from !== to;
  const els = elsOf(tpl);
  const usedSec = new Set();
  const used = new Set();
  const ops = { names: {}, roles: {}, move: {}, removed: new Set(), headings: new Set(), regions: new Set() };
  const picks = [];
  const targets = new Set();
  for (const slot of [...slots].sort((a, b) => (a.cond === 'moved' ? -1 : 0) - (b.cond === 'moved' ? -1 : 0))) {
    let cands = els.filter((x) => x.e.risk === slot.risk && !used.has(x.e.key) && !ops.regions.has(x.sec));
    const fresh = cands.filter((x) => !usedSec.has(x.sec));
    if (fresh.length > 0 && (translated || rng() < 0.9)) cands = fresh;
    if (slot.cond === 'edited') cands = cands.filter((x) => x.e.names[to].edited);
    if (slot.cond === 'moved') cands = cands.filter((x) => targetsOf(tpl, x).some((t) => !ops.regions.has(t)));
    if (slot.cond === 'rehashed') cands = cands.filter((x) => SWAP[x.e.role] || (x.zone !== 'head' && x.zone !== 'nav' && !targets.has(x.sec) && !usedSec.has(x.sec)));
    if (slot.cond === 'removed') {
      const withNear = cands.filter((x) => x.e.near && !ops.removed.has(x.e.near));
      if (withNear.length > 0 && rng() < 0.8) cands = withNear;
    }
    if (cands.length === 0) return null;
    const x = pick(rng, cands);
    const k = x.e.key;
    used.add(k);
    const shared = usedSec.has(x.sec);
    usedSec.add(x.sec);
    let variant;
    if (slot.cond === 'edited') {
      ops.names[k] = x.e.names[to].edited;
      variant = 'synonym';
    } else if (slot.cond === 'moved') {
      const t = pick(rng, targetsOf(tpl, x).filter((t2) => !ops.regions.has(t2)));
      ops.move[k] = t;
      targets.add(t);
      variant = `${x.zone}->${sectionsOf(tpl).find((s) => s.key === t).zone}`;
    } else if (slot.cond === 'translated') {
      const reword = x.e.names[to].edited && rng() < 0.25;
      if (reword) ops.names[k] = x.e.names[to].edited;
      variant = `${from}->${to}${reword ? '+reworded' : ''}`;
    } else if (slot.cond === 'rehashed') {
      const canRegion = x.zone !== 'head' && x.zone !== 'nav' && !targets.has(x.sec) && !shared;
      if (SWAP[x.e.role] && (!canRegion || rng() < 0.6)) {
        ops.roles[k] = SWAP[x.e.role];
        variant = `role:${x.e.role}->${SWAP[x.e.role]}`;
      } else {
        ops.regions.add(x.sec);
        variant = 'region';
      }
    } else {
      ops.removed.add(k);
      if (x.e.near) used.add(x.e.near);
      variant = x.e.near ? 'near-kept' : 'no-near';
    }
    picks.push({ ...slot, key: k, variant, near: x.e.near });
  }
  return { picks, ops };
}

// The drafted pair must leave every item to a Decision: the recorded line nowhere on the after page (refsure
// would settle a verbatim line by code), one element per role and name on each page, the recorded name on no
// other element after the build, at most 20 candidates (no gold cut), and a real change for each condition.
function checkBase(tpl, from, to, picked) {
  const before = buildPage(tpl, from);
  const after = buildPage(tpl, to, picked.ops);
  const bl = linesOf(before);
  const al = linesOf(after);
  if (bl.length > 20 || al.length > 20) return null;
  const uniq = (ls) => new Set(ls.map((l) => `${l.role} ${fold(l.name)}`)).size === ls.length;
  if (!uniq(bl) || !uniq(al)) return null;
  const afterLines = new Set(al.map((l) => l.line));
  const rows = [];
  for (const p of picked.picks) {
    const rec = bl.find((l) => l.key === p.key);
    if (afterLines.has(rec.line)) return null;
    const gold = p.cond === 'removed' ? null : al.find((l) => l.key === p.key);
    if (p.cond !== 'removed' && !gold) return null;
    if (al.some((l) => l !== gold && fold(l.name) === fold(rec.name))) return null;
    if ((p.cond === 'edited' || p.cond === 'translated') && fold(gold.name) === fold(rec.name)) return null;
    if ((p.cond === 'moved' || p.cond === 'rehashed') && gold.name !== rec.name) return null;
    const near = p.near ? al.find((l) => l.key === p.near) ?? null : null;
    rows.push({ p, rec, gold, near });
  }
  return { before, after, bl, al, rows };
}

function whyOf({ p, rec, gold, near }, to) {
  const decoy = near ? ` "${near.name}" is a different action.` : '';
  switch (p.cond) {
    case 'edited':
      return `The recorded ${rec.role} "${rec.name}" in ${shortPlace(rec)} now reads "${gold.name}" in ${shortPlace(gold)}: same control, edited copy.${decoy}`;
    case 'moved':
      return `The ${rec.role} "${rec.name}" left ${shortPlace(rec)} and now sits in ${shortPlace(gold)} with the same label.${decoy}`;
    case 'translated':
      return `The page is now in ${LANG_NAME[to]}; the ${rec.role} "${rec.name}" in ${shortPlace(rec)} became "${gold.name}" in ${shortPlace(gold)}.${decoy}`;
    case 'rehashed':
      return gold.role !== rec.role
        ? `The rebuild turned the ${rec.role} "${rec.name}" into a ${gold.role} with the same label in ${shortPlace(gold)}; ids and classes changed.${decoy}`
        : `The rebuild wrapped ${shortPlace(rec)} in a named region; the ${rec.role} "${rec.name}" keeps its label there; ids and classes changed.${decoy}`;
    default:
      return near
        ? `The ${rec.role} "${rec.name}" is gone from the page; "${near.name}" remains but is a different action, so no candidate is the recorded element.`
        : `The ${rec.role} "${rec.name}" is gone from the page and nothing else does its job, so no candidate is the recorded element.`;
  }
}

// ---------- generate ----------
const rngPlan = rngOf('plan');
const specs = [
  ...chunk(shuffle(rngPlan, slotsOf(['translated']))).map((slots, i) => {
    const [from, to] = DIRS[i % DIRS.length];
    return { slots, tpl: TEMPLATES[(i * 5) % TEMPLATES.length], from, to };
  }),
  ...chunk(shuffle(rngPlan, slotsOf(['edited', 'moved', 'rehashed', 'removed']))).map((slots, i) => {
    const lang = DRIFT_LANGS[Math.floor(i / TEMPLATES.length) % DRIFT_LANGS.length];
    return { slots, tpl: TEMPLATES[(i + 7) % TEMPLATES.length], from: lang, to: lang };
  }),
];
const bases = shuffle(rngPlan, specs);

rmSync(join(SETS, 'n1'), { recursive: true, force: true });
const items = [];
bases.forEach((spec, b) => {
  const bb = String(b + 1).padStart(3, '0');
  // The planned template first; when its elements cannot carry these slots, the next template in turn.
  let done = null;
  const start = TEMPLATES.indexOf(spec.tpl);
  for (let off = 0; off < TEMPLATES.length && !done; off += 1) {
    spec.tpl = TEMPLATES[(start + off) % TEMPLATES.length];
    for (let attempt = 0; attempt < 200 && !done; attempt += 1) {
      const rng = rngOf(`base:${bb}:${off}:${attempt}`);
      const picked = pickBase(spec.tpl, spec.from, spec.to, spec.slots, rng);
      done = picked && checkBase(spec.tpl, spec.from, spec.to, picked);
    }
  }
  if (!done) throw new Error(`base ${bb} (${spec.from}->${spec.to}): no valid draft`);
  const dir = join(OUT_PAGES, bb);
  mkdirSync(dir, { recursive: true });
  const before = renderPage(done.before, rngOf(`ids:${bb}:before`));
  const after = renderPage(done.after, rngOf(`ids:${bb}:after`));
  writeFileSync(join(dir, 'before.html'), before.html);
  writeFileSync(join(dir, 'after.html'), after.html);
  for (const row of done.rows) {
    const { p, rec, gold } = row;
    const none = gold === null;
    items.push({
      id: `n1-${String(items.length + 1).padStart(4, '0')}`,
      page: `pages/${bb}/after.html`,
      recorded_page: `pages/${bb}/before.html`,
      site: 'locate', lang: spec.to, recorded_lang: spec.from, source: 'synthetic',
      condition: p.cond, variant: p.variant, base: `n1-b${bb}`, template: spec.tpl.id, risk: p.risk,
      input: { recorded: rec.line, intent: `${VERB[rec.role]} ${q(rec.name)} ${placeOf(rec)}.`, lines: done.al.map((l) => l.line) },
      recorded: { selector: `#${before.ids.get(p.key)}`, name: rec.name, role: rec.role },
      recorded_ref: { kind: 'element', role: rec.role, name: rec.name, ordinal: 1, hint: rec.path },
      gold: none ? 'none' : { selector: `#${after.ids.get(p.key)}`, name: gold.name },
      gold_ref: none ? null : { role: gold.role, name: gold.name, path: gold.path, ordinal: 1 },
      alt: [],
      danger_eligible: none,
      why: whyOf(row, spec.to),
    });
  }
});
writeFileSync(OUT_ITEMS, `${items.map((x) => JSON.stringify(x)).join('\n')}\n`);

const tally = (f) => items.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
process.stdout.write(`${items.length} items, ${bases.length} bases, ${TEMPLATES.length} templates\n`);
process.stdout.write(`${JSON.stringify(tally((x) => `${x.condition}/${x.risk}`))}\n${JSON.stringify(tally((x) => x.lang))}\n${JSON.stringify(tally((x) => x.template))}\n`);
