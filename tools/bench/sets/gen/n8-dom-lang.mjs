// Domains `language` (interface or content language, tag + names) and `timezone` (offset + city).
import { T } from './n8-lib.mjs';

const LANG_ROWS = `
en-GB|English (UK)|Англійська (Велика Британія)|Englisch (Vereinigtes Königreich)|Inglés (Reino Unido)|Angielski (Wielka Brytania)|English (UK)
en-US|English (US)|Англійська (США)|Englisch (USA)|Inglés (Estados Unidos)|Angielski (USA)|English (US)
pt-PT|Portuguese (Portugal)|Португальська (Португалія)|Portugiesisch (Portugal)|Portugués (Portugal)|Portugalski (Portugalia)|Português (Portugal)
pt-BR|Portuguese (Brazil)|Португальська (Бразилія)|Portugiesisch (Brasilien)|Portugués (Brasil)|Portugalski (Brazylia)|Português (Brasil)
zh-Hans|Chinese (Simplified)|Китайська (спрощена)|Chinesisch (vereinfacht)|Chino (simplificado)|Chiński (uproszczony)|简体中文
zh-Hant|Chinese (Traditional)|Китайська (традиційна)|Chinesisch (traditionell)|Chino (tradicional)|Chiński (tradycyjny)|繁體中文
uk|Ukrainian|Українська|Ukrainisch|Ucraniano|Ukraiński|Українська
de|German|Німецька|Deutsch|Alemán|Niemiecki|Deutsch
es|Spanish|Іспанська|Spanisch|Español|Hiszpański|Español
pl|Polish|Польська|Polnisch|Polaco|Polski|Polski
fr|French|Французька|Französisch|Francés|Francuski|Français
it|Italian|Італійська|Italienisch|Italiano|Włoski|Italiano
nl|Dutch|Нідерландська|Niederländisch|Neerlandés|Niderlandzki|Nederlands
sv|Swedish|Шведська|Schwedisch|Sueco|Szwedzki|Svenska
fi|Finnish|Фінська|Finnisch|Finés|Fiński|Suomi
cs|Czech|Чеська|Tschechisch|Checo|Czeski|Čeština
sk|Slovak|Словацька|Slowakisch|Eslovaco|Słowacki|Slovenčina
sl|Slovenian|Словенська|Slowenisch|Esloveno|Słoweński|Slovenščina
hu|Hungarian|Угорська|Ungarisch|Húngaro|Węgierski|Magyar
ro|Romanian|Румунська|Rumänisch|Rumano|Rumuński|Română
el|Greek|Грецька|Griechisch|Griego|Grecki|Ελληνικά
tr|Turkish|Турецька|Türkisch|Turco|Turecki|Türkçe
ja|Japanese|Японська|Japanisch|Japonés|Japoński|日本語
ko|Korean|Корейська|Koreanisch|Coreano|Koreański|한국어
he|Hebrew|Іврит|Hebräisch|Hebreo|Hebrajski|עברית
ar|Arabic|Арабська|Arabisch|Árabe|Arabski|العربية
da|Danish|Данська|Dänisch|Danés|Duński|Dansk
nb|Norwegian (Bokmål)|Норвезька (букмол)|Norwegisch (Bokmål)|Noruego (bokmål)|Norweski (bokmål)|Norsk bokmål
`;

const LANG_ALIAS = {
  'en-GB': T('British English|британська англійська|britisches Englisch|inglés británico|brytyjski angielski'),
  'en-US': T('American English|американська англійська|amerikanisches Englisch|inglés estadounidense|amerykański angielski'),
  'pt-PT': T('European Portuguese|європейська португальська|europäisches Portugiesisch|portugués europeo|europejski portugalski'),
  'pt-BR': T('Brazilian Portuguese|бразильська португальська|brasilianisches Portugiesisch|portugués brasileño|brazylijski portugalski'),
  'zh-Hans': T('Chinese in simplified characters|китайська спрощеними ієрогліфами|Chinesisch in Kurzzeichen|chino con caracteres simplificados|chiński w znakach uproszczonych'),
  'zh-Hant': T('Chinese in traditional characters|китайська традиційними ієрогліфами|Chinesisch in Langzeichen|chino con caracteres tradicionales|chiński w znakach tradycyjnych'),
  sk: T('the language of Slovakia|мова Словаччини|die Sprache der Slowakei|el idioma de Eslovaquia|język Słowacji'),
  sl: T('the language of Slovenia|мова Словенії|die Sprache Sloweniens|el idioma de Eslovenia|język Słowenii'),
};
const LANG_NEAR = [['en-GB', 'en-US'], ['pt-PT', 'pt-BR'], ['zh-Hans', 'zh-Hant'], ['sk', 'sl']];

export const language = {
  id: 'language',
  label: T('Language|Мова|Sprache|Idioma|Język'),
  concepts: LANG_ROWS.trim().split('\n').map((line) => {
    const [v, en, uk, de, es, pl, endo] = line.split('|');
    const near = LANG_NEAR.filter((p) => p.includes(v)).flat().filter((x) => x !== v);
    return { v, l: { en, uk, de, es, pl }, code: [v], endo, alias: LANG_ALIAS[v], near };
  }),
};

// Time zones with an offset no other row shares (a format want names the offset), city per language.
const TZ_ROWS = `
Atlantic/Azores|-01:00|Azores|Азорські острови|Azoren|Azores|Azory
Europe/Lisbon|+00:00|Lisbon|Лісабон|Lissabon|Lisboa|Lizbona
Europe/Warsaw|+01:00|Warsaw|Варшава|Warschau|Varsovia|Warszawa
Europe/Kyiv|+02:00|Kyiv|Київ|Kyjiw|Kiev|Kijów
Europe/Istanbul|+03:00|Istanbul|Стамбул|Istanbul|Estambul|Stambuł
Asia/Tehran|+03:30|Tehran|Тегеран|Teheran|Teherán|Teheran
Asia/Dubai|+04:00|Dubai|Дубай|Dubai|Dubái|Dubaj
Asia/Kabul|+04:30|Kabul|Кабул|Kabul|Kabul|Kabul
Asia/Tashkent|+05:00|Tashkent|Ташкент|Taschkent|Taskent|Taszkent
Asia/Kolkata|+05:30|Kolkata|Колката|Kalkutta|Calcuta|Kalkuta
Asia/Kathmandu|+05:45|Kathmandu|Катманду|Kathmandu|Katmandú|Katmandu
Asia/Dhaka|+06:00|Dhaka|Дакка|Dhaka|Daca|Dhaka
Asia/Bangkok|+07:00|Bangkok|Бангкок|Bangkok|Bangkok|Bangkok
Asia/Singapore|+08:00|Singapore|Сінгапур|Singapur|Singapur|Singapur
Asia/Tokyo|+09:00|Tokyo|Токіо|Tokio|Tokio|Tokio
Australia/Adelaide|+09:30|Adelaide|Аделаїда|Adelaide|Adelaida|Adelaide
Australia/Sydney|+10:00|Sydney|Сідней|Sydney|Sídney|Sydney
Pacific/Auckland|+12:00|Auckland|Окленд|Auckland|Auckland|Auckland
America/Sao_Paulo|-03:00|São Paulo|Сан-Паулу|São Paulo|São Paulo|São Paulo
America/St_Johns|-03:30|St. John's|Сент-Джонс|St. John’s|San Juan de Terranova|St. John’s
America/Halifax|-04:00|Halifax|Галіфакс|Halifax|Halifax|Halifax
America/New_York|-05:00|New York|Нью-Йорк|New York|Nueva York|Nowy Jork
America/Chicago|-06:00|Chicago|Чикаго|Chicago|Chicago|Chicago
America/Denver|-07:00|Denver|Денвер|Denver|Denver|Denver
America/Los_Angeles|-08:00|Los Angeles|Лос-Анджелес|Los Angeles|Los Ángeles|Los Angeles
Pacific/Honolulu|-10:00|Honolulu|Гонолулу|Honolulu|Honolulu|Honolulu
`;

// How a person names an offset: GMT or UTC, hours without padding, minutes only when there are any.
function offsetWants(off) {
  const sign = off[0] === '-' ? '−' : '+';
  const h = Number(off.slice(1, 3));
  const m = off.slice(4);
  const short = m === '00' ? `${h}` : `${h}:${m}`;
  return [`GMT${sign}${short}`, `UTC ${off[0]}${short}`, `UTC${off[0]}${String(h).padStart(2, '0')}${m}`];
}

export const timezone = {
  id: 'timezone',
  label: T('Time zone|Часовий пояс|Zeitzone|Zona horaria|Strefa czasowa'),
  concepts: TZ_ROWS.trim().split('\n').map((line) => {
    const [v, off, en, uk, de, es, pl] = line.split('|');
    const city = { en, uk, de, es, pl };
    const l = Object.fromEntries(Object.entries(city).map(([k, c]) => [k, `(UTC${off === '+00:00' ? '' : off}) ${c}`]));
    const w = offsetWants(off);
    return { v, l, off, fmt: Object.fromEntries(Object.keys(city).map((k) => [k, w])), near: [] };
  }),
};
// Look-alike zones: offsets at most 30 minutes apart (+05:30 and +05:45, +03:00 and +03:30).
const mins = (off) => (off[0] === '-' ? -1 : 1) * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4)));
for (const z of timezone.concepts) {
  z.near = timezone.concepts.filter((o) => o !== z && Math.abs(mins(o.off) - mins(z.off)) <= 30).map((o) => o.v);
}
