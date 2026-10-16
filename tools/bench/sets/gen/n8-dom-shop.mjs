// Domains `delivery`, `plan` and `sort`: labels, paraphrases (desc) and official-style aliases in en|uk|de|es|pl.
import { T } from './n8-lib.mjs';

const D = (v, names, desc, extra = {}) => ({ v, l: T(names), desc: T(desc), near: [], ...extra });

export const delivery = {
  id: 'delivery',
  label: T('Delivery method|Спосіб доставки|Versandart|Método de envío|Sposób dostawy'),
  concepts: [
    D('std', 'Standard delivery (3–5 working days)|Звичайна доставка (3–5 робочих днів)|Standardversand (3–5 Werktage)|Envío estándar (3–5 días laborables)|Dostawa standardowa (3–5 dni roboczych)',
      'the ordinary shipping that takes most of a week|звичайне відправлення, яке йде майже тиждень|der normale Versand, der fast eine Woche dauert|el envío normal que tarda casi una semana|zwykła wysyłka, która trwa prawie tydzień'),
    D('exp', 'Express delivery (next working day)|Експрес-доставка (наступного робочого дня)|Expressversand (nächster Werktag)|Envío exprés (siguiente día laborable)|Dostawa ekspresowa (następny dzień roboczy)',
      'have it by tomorrow when I order on a Tuesday|отримати вже завтра, якщо замовляю у вівторок|es morgen haben, wenn ich an einem Dienstag bestelle|tenerlo mañana si lo pido un martes|mieć to jutro, gdy zamawiam we wtorek'),
    D('locker', 'Parcel locker|Поштомат|Packstation|Taquilla de paquetes|Paczkomat',
      'a self-service box where I open a door with a code|скринька самообслуговування, яку відкриваю кодом|ein Selbstbedienungsfach, das ich mit einem Code öffne|un casillero de autoservicio que abro con un código|skrytka samoobsługowa, którą otwieram kodem'),
    D('store', 'Click & collect in store|Самовивіз із магазину|Abholung in der Filiale|Recogida en tienda|Odbiór osobisty w sklepie',
      'pick it up myself at one of your shops|забрати самому в одному з ваших магазинів|es selbst in einer Ihrer Filialen holen|recogerlo yo en una de vuestras tiendas|odebrać samemu w jednym z waszych sklepów'),
    D('same', 'Same-day courier|Кур’єр того ж дня|Kurier am selben Tag|Mensajero en el mismo día|Kurier tego samego dnia',
      'have it brought to my door this evening|щоб привезли до дверей уже сьогодні ввечері|es mir heute Abend an die Tür bringen lassen|que me lo traigan a casa esta misma tarde|żeby przywieźli pod drzwi jeszcze dziś wieczorem'),
  ],
};

const tier = {
  solo: T('Solo · 1 user|Соло · 1 користувач|Solo · 1 Nutzer|Solo · 1 usuario|Solo · 1 użytkownik'),
  team: T('Team · up to 10 users|Команда · до 10 користувачів|Team · bis 10 Nutzer|Equipo · hasta 10 usuarios|Zespół · do 10 użytkowników'),
  biz: T('Business · up to 50 users|Бізнес · до 50 користувачів|Business · bis 50 Nutzer|Empresa · hasta 50 usuarios|Firma · do 50 użytkowników'),
};
const per = { m: T('monthly|щомісяця|monatlich|mensual|miesięcznie'), y: T('yearly|щороку|jährlich|anual|rocznie') };
const planLabel = (t, p) => Object.fromEntries(Object.keys(per.m).map((l) => [l, `${tier[t][l]} · ${per[p][l]}`]));
const PL = (t, p, desc, alias) => ({ v: `${t}-${p}`, l: planLabel(t, p), desc: T(desc), alias: T(alias), near: [`${t}-${p === 'm' ? 'y' : 'm'}`] });

export const plan = {
  id: 'plan',
  label: T('Plan|Тариф|Tarif|Plan|Plan'),
  concepts: [
    PL('solo', 'm', 'just me, paying month by month|лише я, з оплатою щомісяця|nur ich, mit monatlicher Zahlung|solo yo, pagando mes a mes|tylko ja, z płatnością co miesiąc',
      'Solo plan, billed every month|тариф «Соло» з помісячною оплатою|Solo-Tarif mit monatlicher Abrechnung|plan Solo con facturación mensual|plan Solo z rozliczeniem co miesiąc'),
    PL('solo', 'y', 'a single seat for myself, renewed once a year|одне місце для себе, продовження раз на рік|ein einzelner Platz für mich, einmal im Jahr verlängert|una sola plaza para mí, renovada una vez al año|jedno miejsce dla siebie, odnawiane raz w roku',
      'Solo plan, billed annually|тариф «Соло» з річною оплатою|Solo-Tarif mit jährlicher Abrechnung|plan Solo con facturación anual|plan Solo z rozliczeniem rocznym'),
    PL('team', 'm', 'a group of eight colleagues, charged every month|група з восьми колег, оплата щомісяця|eine Gruppe von acht Kollegen, jeden Monat abgerechnet|un grupo de ocho compañeros, con cargo cada mes|grupa ośmiu współpracowników, opłata co miesiąc',
      'Team plan, billed every month|тариф «Команда» з помісячною оплатою|Team-Tarif mit monatlicher Abrechnung|plan Equipo con facturación mensual|plan Zespół z rozliczeniem co miesiąc'),
    PL('team', 'y', 'six of us, with one payment a year|нас шестеро, один платіж на рік|wir sind zu sechst, mit einer Zahlung pro Jahr|somos seis, con un solo pago al año|jest nas sześcioro, jedna płatność na rok',
      'Team plan, billed annually|тариф «Команда» з річною оплатою|Team-Tarif mit jährlicher Abrechnung|plan Equipo con facturación anual|plan Zespół z rozliczeniem rocznym'),
    PL('biz', 'm', 'about thirty people, billed month to month|близько тридцяти людей, рахунок щомісяця|etwa dreißig Personen, Monat für Monat abgerechnet|unas treinta personas, facturado mes a mes|około trzydziestu osób, rozliczenie co miesiąc',
      'Business plan, billed every month|тариф «Бізнес» з помісячною оплатою|Business-Tarif mit monatlicher Abrechnung|plan Empresa con facturación mensual|plan Firma z rozliczeniem co miesiąc'),
    PL('biz', 'y', 'forty staff, paid annually in one go|сорок працівників, оплата за рік одним платежем|vierzig Mitarbeitende, jährlich auf einmal bezahlt|cuarenta empleados, pago anual de una vez|czterdziestu pracowników, płatność roczna jednorazowo',
      'Business plan, billed annually|тариф «Бізнес» з річною оплатою|Business-Tarif mit jährlicher Abrechnung|plan Empresa con facturación anual|plan Firma z rozliczeniem rocznym'),
  ],
};

const S = (v, names, desc, alias, near) => ({ v, l: T(names), desc: T(desc), alias: T(alias), near });

export const sort = {
  id: 'sort',
  label: T('Sort by|Сортувати за|Sortieren nach|Ordenar por|Sortuj według'),
  concepts: [
    S('price-asc', 'Price: low to high|Ціна: від низької до високої|Preis: aufsteigend|Precio: de menor a mayor|Cena: od najniższej',
      'cheapest first|спочатку найдешевші|die günstigsten zuerst|primero los más baratos|najpierw najtańsze',
      'price ascending|за зростанням ціни|Preis, kleinster zuerst|precio ascendente|cena rosnąco', ['price-desc']),
    S('price-desc', 'Price: high to low|Ціна: від високої до низької|Preis: absteigend|Precio: de mayor a menor|Cena: od najwyższej',
      'most expensive first|спочатку найдорожчі|die teuersten zuerst|primero los más caros|najpierw najdroższe',
      'price descending|за спаданням ціни|Preis, größter zuerst|precio descendente|cena malejąco', ['price-asc']),
    S('new', 'Newest first|Спочатку нові|Neueste zuerst|Más recientes primero|Od najnowszych',
      'the latest additions at the top|найсвіжіші додані вгорі|was zuletzt dazukam, oben|lo último añadido arriba|ostatnio dodane na górze',
      'date added, most recent on top|дата додавання, найновіші вгорі|Datum, jüngstes oben|fecha, lo más reciente arriba|data dodania, najnowsze na górze', ['old']),
    S('old', 'Oldest first|Спочатку старі|Älteste zuerst|Más antiguos primero|Od najstarszych',
      'the earliest ones at the top|найдавніші вгорі|die frühesten oben|los más antiguos arriba|najwcześniejsze na górze',
      'date added, earliest on top|дата додавання, найдавніші вгорі|Datum, ältestes oben|fecha, lo más antiguo arriba|data dodania, najstarsze na górze', ['new']),
    S('rating', 'Highest rated|Найвищий рейтинг|Beste Bewertung|Mejor valorados|Najwyżej oceniane',
      'the ones with the most stars on top|ті, що мають найбільше зірок, угорі|die mit den meisten Sternen oben|los que tienen más estrellas arriba|te z największą liczbą gwiazdek na górze',
      'by rating, best first|за оцінкою, найкращі спершу|nach Bewertung, beste zuerst|por valoración, los mejores primero|według oceny, najlepsze najpierw', []),
    S('az', 'Name: A to Z|Назва: від А до Я|Name: A bis Z|Nombre: de la A a la Z|Nazwa: od A do Z',
      'alphabetical order|в алфавітному порядку|alphabetisch|por orden alfabético|alfabetycznie',
      'name ascending|назва за зростанням|Name aufsteigend|nombre ascendente|nazwa rosnąco', ['za']),
    S('za', 'Name: Z to A|Назва: від Я до А|Name: Z bis A|Nombre: de la Z a la A|Nazwa: od Z do A',
      'reverse alphabetical order|у зворотному алфавітному порядку|umgekehrt alphabetisch|orden alfabético inverso|odwrotnie alfabetycznie',
      'name descending|назва за спаданням|Name absteigend|nombre descendente|nazwa malejąco', ['az']),
  ],
};
