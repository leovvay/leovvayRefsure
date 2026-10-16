// Domain `country`: ISO codes, dialling code, names in en|uk|de|es|pl, the endonym, official-style aliases for
// the countries used as fold-near golds, and the fold-near pairs (names a reader can confuse at a glance).
import { T } from './n8-lib.mjs';

const ROWS = `
AT|AUT|+43|Austria|Австрія|Österreich|Austria|Austria|Österreich
AU|AUS|+61|Australia|Австралія|Australien|Australia|Australia|Australia
SK|SVK|+421|Slovakia|Словаччина|Slowakei|Eslovaquia|Słowacja|Slovensko
SI|SVN|+386|Slovenia|Словенія|Slowenien|Eslovenia|Słowenia|Slovenija
IS|ISL|+354|Iceland|Ісландія|Island|Islandia|Islandia|Ísland
IE|IRL|+353|Ireland|Ірландія|Irland|Irlanda|Irlandia|Éire
NE|NER|+227|Niger|Нігер|Niger|Níger|Niger|Niger
NG|NGA|+234|Nigeria|Нігерія|Nigeria|Nigeria|Nigeria|Nigeria
SE|SWE|+46|Sweden|Швеція|Schweden|Suecia|Szwecja|Sverige
CH|CHE|+41|Switzerland|Швейцарія|Schweiz|Suiza|Szwajcaria|Schweiz
LV|LVA|+371|Latvia|Латвія|Lettland|Letonia|Łotwa|Latvija
LT|LTU|+370|Lithuania|Литва|Litauen|Lituania|Litwa|Lietuva
KR|KOR|+82|South Korea|Південна Корея|Südkorea|Corea del Sur|Korea Południowa|Hanguk
KP|PRK|+850|North Korea|Північна Корея|Nordkorea|Corea del Norte|Korea Północna|Chosŏn
IR|IRN|+98|Iran|Іран|Iran|Irán|Iran|Īrān
IQ|IRQ|+964|Iraq|Ірак|Irak|Irak|Irak|al-ʿIrāq
DM|DMA|+1767|Dominica|Домініка|Dominica|Dominica|Dominika|Dominica
DO|DOM|+1809|Dominican Republic|Домініканська Республіка|Dominikanische Republik|República Dominicana|Dominikana|República Dominicana
ML|MLI|+223|Mali|Малі|Mali|Malí|Mali|Mali
MT|MLT|+356|Malta|Мальта|Malta|Malta|Malta|Malta
UA|UKR|+380|Ukraine|Україна|Ukraine|Ucrania|Ukraina|Україна
PL|POL|+48|Poland|Польща|Polen|Polonia|Polska|Polska
DE|DEU|+49|Germany|Німеччина|Deutschland|Alemania|Niemcy|Deutschland
ES|ESP|+34|Spain|Іспанія|Spanien|España|Hiszpania|España
PT|PRT|+351|Portugal|Португалія|Portugal|Portugal|Portugalia|Portugal
FR|FRA|+33|France|Франція|Frankreich|Francia|Francja|France
IT|ITA|+39|Italy|Італія|Italien|Italia|Włochy|Italia
NL|NLD|+31|Netherlands|Нідерланди|Niederlande|Países Bajos|Holandia|Nederland
BE|BEL|+32|Belgium|Бельгія|Belgien|Bélgica|Belgia|België
CZ|CZE|+420|Czechia|Чехія|Tschechien|Chequia|Czechy|Česko
HU|HUN|+36|Hungary|Угорщина|Ungarn|Hungría|Węgry|Magyarország
RO|ROU|+40|Romania|Румунія|Rumänien|Rumanía|Rumunia|România
MD|MDA|+373|Moldova|Молдова|Moldau|Moldavia|Mołdawia|Moldova
GR|GRC|+30|Greece|Греція|Griechenland|Grecia|Grecja|Elláda
HR|HRV|+385|Croatia|Хорватія|Kroatien|Croacia|Chorwacja|Hrvatska
FI|FIN|+358|Finland|Фінляндія|Finnland|Finlandia|Finlandia|Suomi
NO|NOR|+47|Norway|Норвегія|Norwegen|Noruega|Norwegia|Norge
DK|DNK|+45|Denmark|Данія|Dänemark|Dinamarca|Dania|Danmark
EE|EST|+372|Estonia|Естонія|Estland|Estonia|Estonia|Eesti
GE|GEO|+995|Georgia|Грузія|Georgien|Georgia|Gruzja|Sakartvelo
AL|ALB|+355|Albania|Албанія|Albanien|Albania|Albania|Shqipëria
JP|JPN|+81|Japan|Японія|Japan|Japón|Japonia|Nihon
CA|CAN|+1|Canada|Канада|Kanada|Canadá|Kanada|Canada
MX|MEX|+52|Mexico|Мексика|Mexiko|México|Meksyk|México
BR|BRA|+55|Brazil|Бразилія|Brasilien|Brasil|Brazylia|Brasil
EG|EGY|+20|Egypt|Єгипет|Ägypten|Egipto|Egipt|Miṣr
TR|TUR|+90|Türkiye|Туреччина|Türkei|Turquía|Turcja|Türkiye
IN|IND|+91|India|Індія|Indien|India|Indie|Bhārat
`;

// Official-style names: never the list label, so the code path cannot settle them.
const ALIAS = {
  AT: T('Republic of Austria|Австрійська Республіка|Republik Österreich|República de Austria|Republika Austrii'),
  SK: T('Slovak Republic|Словацька Республіка|Slowakische Republik|República Eslovaca|Republika Słowacka'),
  SI: T('Republic of Slovenia|Республіка Словенія|Republik Slowenien|República de Eslovenia|Republika Słowenii'),
  IS: T('Republic of Iceland|Республіка Ісландія|Republik Island|República de Islandia|Republika Islandii'),
  IE: T('Republic of Ireland|Республіка Ірландія|Republik Irland|República de Irlanda|Republika Irlandii'),
  NG: T('Federal Republic of Nigeria|Федеративна Республіка Нігерія|Bundesrepublik Nigeria|República Federal de Nigeria|Federalna Republika Nigerii'),
  NE: T('Republic of the Niger|Республіка Нігер|Republik Niger|República del Níger|Republika Nigru'),
  SE: T('Kingdom of Sweden|Королівство Швеція|Königreich Schweden|Reino de Suecia|Królestwo Szwecji'),
  CH: T('Swiss Confederation|Швейцарська Конфедерація|Schweizerische Eidgenossenschaft|Confederación Suiza|Konfederacja Szwajcarska'),
  LV: T('Republic of Latvia|Латвійська Республіка|Republik Lettland|República de Letonia|Republika Łotewska'),
  LT: T('Republic of Lithuania|Литовська Республіка|Republik Litauen|República de Lituania|Republika Litewska'),
  KR: T('Republic of Korea|Республіка Корея|Republik Korea|República de Corea|Republika Korei'),
  IR: T('Islamic Republic of Iran|Ісламська Республіка Іран|Islamische Republik Iran|República Islámica de Irán|Islamska Republika Iranu'),
  IQ: T('Republic of Iraq|Республіка Ірак|Republik Irak|República de Irak|Republika Iraku'),
  DM: T('Commonwealth of Dominica|Співдружність Домініки|Commonwealth Dominica|Mancomunidad de Dominica|Wspólnota Dominiki'),
  ML: T('Republic of Mali|Республіка Малі|Republik Mali|República de Malí|Republika Mali'),
  MT: T('Republic of Malta|Республіка Мальта|Republik Malta|República de Malta|Republika Malty'),
  AU: T('Commonwealth of Australia|Австралійський Союз|Australischer Bund|Mancomunidad de Australia|Związek Australijski'),
};

const NEAR = [['AT', 'AU'], ['SK', 'SI'], ['IS', 'IE'], ['NE', 'NG'], ['SE', 'CH'], ['LV', 'LT'], ['KR', 'KP'], ['IR', 'IQ'], ['DM', 'DO'], ['ML', 'MT']];

export const country = {
  id: 'country',
  label: T('Country|Країна|Land|País|Kraj'),
  concepts: ROWS.trim().split('\n').map((line) => {
    const [iso2, iso3, phone, en, uk, de, es, pl, endo] = line.split('|');
    const near = NEAR.filter((p) => p.includes(iso2)).flat().filter((x) => x !== iso2);
    return { v: iso2, l: { en, uk, de, es, pl }, code: [iso2, iso3], phone, endo, alias: ALIAS[iso2], near };
  }),
};
