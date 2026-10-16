// Domains `role` (access level), `priority` and `category` (help-desk topic): labels and paraphrases.
import { T } from './n8-lib.mjs';

const D = (v, names, desc, near = []) => ({ v, l: T(names), desc: T(desc), near });

export const role = {
  id: 'role',
  label: T('Role|Роль|Rolle|Rol|Rola'),
  concepts: [
    D('viewer', 'Viewer|Глядач|Betrachter|Lector|Przeglądający', 'can look at everything, but cannot edit or even comment|може все бачити, але не може ні редагувати, ні навіть коментувати|darf alles ansehen, aber weder bearbeiten noch kommentieren|puede verlo todo, pero no editar ni comentar|może wszystko oglądać, ale nie może edytować ani nawet komentować', ['commenter']),
    D('commenter', 'Commenter|Коментатор|Kommentator|Comentarista|Komentujący', 'can read and leave remarks, but not edit the content|може читати й залишати зауваження, але не редагувати|darf lesen und Anmerkungen hinterlassen, aber nicht bearbeiten|puede leer y dejar observaciones, pero no editar|może czytać i zostawiać uwagi, ale nie edytować', ['viewer', 'editor']),
    D('editor', 'Editor|Редактор|Bearbeiter|Editor|Edytor', 'can change the content but not manage who has access|може змінювати вміст, але не керувати доступом|darf Inhalte ändern, aber nicht verwalten, wer Zugriff hat|puede cambiar el contenido pero no gestionar quién tiene acceso|może zmieniać treść, ale nie zarządzać dostępem', ['commenter', 'admin']),
    D('admin', 'Administrator|Адміністратор|Administrator|Administrador|Administrator', 'can invite and remove people, but cannot delete the workspace|може запрошувати й видаляти людей, але не може видалити простір|darf Leute einladen und entfernen, aber den Arbeitsbereich nicht löschen|puede invitar y quitar personas, pero no eliminar el espacio|może zapraszać i usuwać osoby, ale nie może usunąć przestrzeni', ['editor', 'owner']),
    D('billing', 'Billing manager|Менеджер з оплати|Abrechnungsverwalter|Gestor de facturación|Menedżer rozliczeń', 'handles invoices and the payment card, nothing else|займається рахунками та платіжною карткою, і більше нічим|kümmert sich um Rechnungen und die Zahlungskarte, sonst nichts|se ocupa de las facturas y la tarjeta de pago, nada más|zajmuje się fakturami i kartą płatniczą, niczym więcej'),
    D('owner', 'Owner|Власник|Inhaber|Propietario|Właściciel', 'the one person who can delete the whole workspace|єдина людина, яка може видалити весь простір|die eine Person, die den ganzen Arbeitsbereich löschen kann|la única persona que puede eliminar todo el espacio|jedyna osoba, która może usunąć całą przestrzeń', ['admin']),
  ],
};

export const priority = {
  id: 'priority',
  label: T('Priority|Пріоритет|Priorität|Prioridad|Priorytet'),
  concepts: [
    D('low', 'Low|Низький|Niedrig|Baja|Niski', 'whenever someone has a spare moment, no rush|коли в когось буде вільна хвилина, без поспіху|wenn jemand mal Zeit hat, keine Eile|cuando alguien tenga un rato libre, sin prisa|kiedy ktoś znajdzie wolną chwilę, bez pośpiechu', ['normal']),
    D('normal', 'Normal|Звичайний|Normal|Normal|Normalny', 'the usual queue, nothing special|звичайна черга, нічого особливого|die übliche Reihenfolge, nichts Besonderes|la cola habitual, nada especial|zwykła kolejka, nic szczególnego', ['low', 'high']),
    D('high', 'High|Високий|Hoch|Alta|Wysoki', 'ahead of normal work, but nothing is down|раніше за звичайну роботу, але нічого не впало|vor der normalen Arbeit, aber nichts ist ausgefallen|antes que el trabajo normal, pero no hay nada caído|przed zwykłą pracą, ale nic nie leży', ['normal', 'urgent']),
    D('urgent', 'Urgent – service down|Терміново – сервіс не працює|Dringend – Dienst ausgefallen|Urgente – servicio caído|Pilne – usługa nie działa', 'nobody can log in right now and customers are waiting|зараз ніхто не може увійти, а клієнти чекають|gerade kann sich niemand anmelden und Kunden warten|ahora mismo nadie puede entrar y hay clientes esperando|teraz nikt nie może się zalogować, a klienci czekają', ['high']),
  ],
};

export const category = {
  id: 'category',
  label: T('Topic|Тема|Thema|Tema|Temat'),
  concepts: [
    D('billing', 'Billing and payments|Рахунки й оплата|Rechnungen und Zahlungen|Facturación y pagos|Rozliczenia i płatności', 'my card was charged twice for one order|з моєї картки двічі списали гроші за одне замовлення|meine Karte wurde für eine Bestellung zweimal belastet|me cobraron dos veces en la tarjeta por un pedido|z mojej karty pobrano dwa razy za jedno zamówienie'),
    D('login', 'Signing in and passwords|Вхід і паролі|Anmeldung und Passwörter|Acceso y contraseñas|Logowanie i hasła', 'the reset link never arrives and I am locked out|посилання для скидання не приходить, і я не можу увійти|der Link zum Zurücksetzen kommt nie an und ich bin ausgesperrt|el enlace para restablecer nunca llega y no puedo entrar|link do resetu nie przychodzi i nie mogę się zalogować'),
    D('shipping', 'Delivery and tracking|Доставка й відстеження|Lieferung und Sendungsverfolgung|Envío y seguimiento|Dostawa i śledzenie', 'the parcel has shown “in transit” for nine days|посилка вже дев’ять днів має статус «у дорозі»|das Paket steht seit neun Tagen auf „unterwegs“|el paquete lleva nueve días “en tránsito”|paczka od dziewięciu dni ma status „w drodze”'),
    D('returns', 'Returns and refunds|Повернення й відшкодування|Rücksendungen und Erstattungen|Devoluciones y reembolsos|Zwroty i refundacje', 'the shoes do not fit and I want my money back|черевики не підійшли, і я хочу повернути гроші|die Schuhe passen nicht und ich will mein Geld zurück|los zapatos no me quedan y quiero que me devuelvan el dinero|buty nie pasują i chcę odzyskać pieniądze'),
    D('privacy', 'Privacy and personal data|Конфіденційність і персональні дані|Datenschutz und persönliche Daten|Privacidad y datos personales|Prywatność i dane osobowe', 'I want a copy of everything you store about me|хочу копію всього, що ви про мене зберігаєте|ich möchte eine Kopie von allem, was Sie über mich speichern|quiero una copia de todo lo que guardáis sobre mí|chcę kopię wszystkiego, co o mnie przechowujecie'),
    D('bug', 'Something is not working|Щось не працює|Etwas funktioniert nicht|Algo no funciona|Coś nie działa', 'the export button shows a blank page every time|кнопка експорту щоразу показує порожню сторінку|der Export-Knopf zeigt jedes Mal eine leere Seite|el botón de exportar muestra una página en blanco siempre|przycisk eksportu za każdym razem pokazuje pustą stronę'),
  ],
};
