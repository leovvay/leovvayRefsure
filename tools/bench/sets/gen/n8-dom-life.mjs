// Domains `frequency`, `cabin`, `meal`, `doctype`, `marital`: labels and paraphrases (desc) in en|uk|de|es|pl.
import { T } from './n8-lib.mjs';

const D = (v, names, desc, near = []) => ({ v, l: T(names), desc: T(desc), near });

export const frequency = {
  id: 'frequency',
  label: T('How often|Як часто|Wie oft|Frecuencia|Jak często'),
  concepts: [
    D('daily', 'Every day|Щодня|Täglich|Cada día|Codziennie', 'once each morning, weekends included|раз щоранку, включно з вихідними|einmal jeden Morgen, auch am Wochenende|una vez cada mañana, fines de semana incluidos|raz każdego ranka, także w weekendy'),
    D('weekly', 'Once a week|Раз на тиждень|Einmal pro Woche|Una vez por semana|Raz w tygodniu', 'every Monday and no other day|щопонеділка і більше ніколи|jeden Montag und an keinem anderen Tag|todos los lunes y ningún otro día|w każdy poniedziałek i w żaden inny dzień', ['biweekly']),
    D('biweekly', 'Every two weeks|Раз на два тижні|Alle zwei Wochen|Cada dos semanas|Co dwa tygodnie', 'every other Friday|кожну другу п’ятницю|jeden zweiten Freitag|un viernes sí y otro no|co drugi piątek', ['weekly', 'monthly']),
    D('monthly', 'Once a month|Раз на місяць|Einmal im Monat|Una vez al mes|Raz w miesiącu', 'on the first day of each month|першого числа кожного місяця|am Ersten jedes Monats|el día uno de cada mes|pierwszego dnia każdego miesiąca', ['biweekly']),
    D('quarterly', 'Every three months|Раз на три місяці|Alle drei Monate|Cada tres meses|Co trzy miesiące', 'four times a year, at the start of each quarter|чотири рази на рік, на початку кожного кварталу|viermal im Jahr, zu Beginn jedes Quartals|cuatro veces al año, al inicio de cada trimestre|cztery razy w roku, na początku każdego kwartału'),
    D('never', 'Never|Ніколи|Nie|Nunca|Nigdy', 'stop sending these to me altogether|зовсім перестати мені це надсилати|mir das gar nicht mehr schicken|dejar de enviármelo por completo|przestać mi to w ogóle wysyłać'),
  ],
};

export const cabin = {
  id: 'cabin',
  label: T('Cabin class|Клас обслуговування|Reiseklasse|Clase|Klasa podróży'),
  concepts: [
    D('eco', 'Economy|Економ|Economy|Turista|Ekonomiczna', 'the cheapest seats at the back|найдешевші місця в хвості|die günstigsten Plätze hinten|los asientos más baratos, al fondo|najtańsze miejsca z tyłu', ['prem']),
    D('prem', 'Premium economy|Преміум-економ|Premium Economy|Turista prémium|Ekonomiczna premium', 'a bit more legroom than the cheapest seats, but not a lie-flat bed|трохи більше місця для ніг, ніж у найдешевших, але без ліжка|etwas mehr Beinfreiheit als die günstigsten Plätze, aber kein Liegebett|algo más de espacio para las piernas que lo más barato, sin cama|trochę więcej miejsca na nogi niż najtańsze, ale bez łóżka', ['eco', 'bus']),
    D('bus', 'Business|Бізнес|Business|Business|Biznesowa', 'a seat that turns into a flat bed, with lounge access|крісло, що розкладається в ліжко, з доступом до лаунжу|ein Sitz, der zum flachen Bett wird, mit Lounge-Zugang|un asiento que se convierte en cama, con acceso a sala VIP|fotel rozkładany do łóżka, z dostępem do saloniku', ['prem', 'first']),
    D('first', 'First|Перший клас|First|Primera|Pierwsza', 'the private suite at the very front|приватний люкс у самому носі літака|die private Suite ganz vorne|la suite privada en la parte delantera|prywatny apartament na samym przodzie', ['bus']),
  ],
};

export const meal = {
  id: 'meal',
  label: T('Meal preference|Харчування|Essenswunsch|Preferencia de comida|Preferencje posiłku'),
  concepts: [
    D('std', 'Standard meal|Стандартне меню|Standardmenü|Menú estándar|Posiłek standardowy', 'whatever the regular menu is, I eat everything|що є в звичайному меню, я їм усе|das normale Menü, ich esse alles|lo del menú normal, como de todo|cokolwiek jest w zwykłym menu, jem wszystko'),
    D('veg', 'Vegetarian (with dairy and eggs)|Вегетаріанське (з молочним і яйцями)|Vegetarisch (mit Milch und Ei)|Vegetariano (con lácteos y huevo)|Wegetariańskie (z nabiałem i jajkami)', 'no meat or fish, but cheese and eggs are fine|без м’яса й риби, але сир і яйця можна|kein Fleisch oder Fisch, aber Käse und Eier sind okay|nada de carne ni pescado, pero queso y huevos sí|bez mięsa i ryb, ale ser i jajka mogą być'),
    D('vegan', 'Vegan|Веганське|Vegan|Vegano|Wegańskie', 'nothing that comes from an animal at all, not even honey or milk|нічого тваринного походження взагалі, навіть меду чи молока|gar nichts Tierisches, nicht einmal Honig oder Milch|nada de origen animal, ni siquiera miel o leche|nic pochodzenia zwierzęcego, nawet miodu ani mleka'),
    D('gf', 'Gluten-free|Без глютену|Glutenfrei|Sin gluten|Bezglutenowe', 'I have coeliac disease, so no wheat, barley or rye|у мене целіакія, тож без пшениці, ячменю й жита|ich habe Zöliakie, also kein Weizen, keine Gerste, kein Roggen|soy celíaca, así que nada de trigo, cebada ni centeno|mam celiakię, więc bez pszenicy, jęczmienia i żyta'),
    D('halal', 'Halal|Халяль|Halal|Halal|Halal', 'prepared according to Islamic dietary law|приготоване за ісламськими харчовими правилами|nach islamischen Speisevorschriften zubereitet|preparado según las normas alimentarias islámicas|przygotowane zgodnie z islamskimi zasadami żywienia'),
    D('kosher', 'Kosher|Кошерне|Koscher|Kosher|Koszerne', 'prepared according to Jewish dietary law|приготоване за юдейськими харчовими приписами|nach jüdischen Speisegesetzen zubereitet|preparado según las leyes alimentarias judías|przygotowane zgodnie z żydowskimi zasadami żywienia'),
    D('child', 'Child meal|Дитяче меню|Kindermenü|Menú infantil|Posiłek dziecięcy', 'something simple for my four-year-old|щось просте для моєї чотирирічної доньки|etwas Einfaches für meine Vierjährige|algo sencillo para mi hija de cuatro años|coś prostego dla mojej czterolatki'),
    D('diab', 'Diabetic meal|Діабетичне меню|Diabetikermenü|Menú para diabéticos|Posiłek dla diabetyków', 'low in sugar because I manage my blood glucose|з малим вмістом цукру, бо я стежу за рівнем глюкози|zuckerarm, weil ich meinen Blutzucker einstellen muss|bajo en azúcar porque controlo mi glucosa|z małą ilością cukru, bo pilnuję poziomu glukozy'),
  ],
};

export const doctype = {
  id: 'doctype',
  label: T('Document type|Тип документа|Dokumentart|Tipo de documento|Rodzaj dokumentu'),
  concepts: [
    D('passport', 'Passport|Закордонний паспорт|Reisepass|Pasaporte|Paszport', 'the booklet I show at border control abroad|книжечка, яку я показую на кордоні за кордоном|das Heft, das ich bei der Grenzkontrolle im Ausland zeige|la libreta que enseño en el control de fronteras|książeczka, którą pokazuję na granicy za granicą'),
    D('id', 'National identity card|ID-картка|Personalausweis|Documento nacional de identidad|Dowód osobisty', 'the plastic ID card issued for everyday identification at home|пластикова посвідка для щоденної ідентифікації вдома|die Plastikkarte, mit der ich mich im Alltag zu Hause ausweise|la tarjeta de plástico para identificarme en el día a día en mi país|plastikowa karta do codziennej identyfikacji w kraju'),
    D('dl', 'Driving licence|Посвідчення водія|Führerschein|Permiso de conducir|Prawo jazdy', 'the card that lets me drive a car|картка, що дозволяє керувати автомобілем|die Karte, mit der ich Auto fahren darf|la tarjeta que me permite conducir un coche|karta, która pozwala mi prowadzić samochód'),
    D('rp', 'Residence permit|Посвідка на проживання|Aufenthaltstitel|Permiso de residencia|Karta pobytu', 'the card that lets me, a foreigner, live here legally|картка, що дозволяє мені, іноземцю, законно тут жити|die Karte, mit der ich als Ausländer hier legal wohnen darf|la tarjeta que me permite vivir aquí legalmente siendo extranjero|karta, dzięki której jako cudzoziemiec mogę tu legalnie mieszkać'),
    D('birth', 'Birth certificate|Свідоцтво про народження|Geburtsurkunde|Certificado de nacimiento|Akt urodzenia', 'the paper that records when and where I was born|документ, де записано, коли й де я народився|die Urkunde, auf der steht, wann und wo ich geboren wurde|el papel que dice cuándo y dónde nací|dokument, w którym zapisano, kiedy i gdzie się urodziłem'),
  ],
};

export const marital = {
  id: 'marital',
  label: T('Marital status|Сімейний стан|Familienstand|Estado civil|Stan cywilny'),
  concepts: [
    D('single', 'Single (never married)|Неодружений / неодружена|Ledig|Soltero/a|Kawaler / panna', 'I have never been married|я ніколи не був у шлюбі|ich war nie verheiratet|nunca me he casado|nigdy nie byłem w związku małżeńskim'),
    D('married', 'Married|Одружений / заміжня|Verheiratet|Casado/a|Żonaty / zamężna', 'my wife and I wed in 2019 and are still together|ми з дружиною побралися у 2019 році й досі разом|meine Frau und ich haben 2019 geheiratet und sind noch zusammen|mi mujer y yo nos casamos en 2019 y seguimos juntos|ożeniłem się w 2019 roku i nadal jesteśmy razem'),
    D('divorced', 'Divorced|Розлучений / розлучена|Geschieden|Divorciado/a|Rozwiedziony / rozwiedziona', 'my marriage was legally ended by a court|мій шлюб було розірвано через суд|meine Ehe wurde vom Gericht aufgelöst|mi matrimonio fue disuelto por un juzgado|moje małżeństwo zostało rozwiązane przez sąd'),
    D('widowed', 'Widowed|Вдівець / вдова|Verwitwet|Viudo/a|Wdowiec / wdowa', 'my husband passed away three years ago|мій чоловік помер три роки тому|mein Mann ist vor drei Jahren gestorben|mi marido falleció hace tres años|mój mąż zmarł trzy lata temu'),
    D('partner', 'Registered partnership|Зареєстроване партнерство|Eingetragene Partnerschaft|Pareja de hecho registrada|Zarejestrowany związek partnerski', 'we registered our civil union at the town hall, not a marriage|ми зареєстрували цивільне партнерство, а не шлюб|wir haben eine Lebenspartnerschaft eintragen lassen, keine Ehe|registramos nuestra unión civil en el ayuntamiento, no un matrimonio|zarejestrowaliśmy związek partnerski w urzędzie, nie małżeństwo'),
  ],
};
