// Template tasks-card: a task on a team task board. Result: the deliverable file attached to the task.
import { box, common, esc, list, rows, slot, stageBadge, timeline } from './n6-page.mjs';

const V = {
  en: {
    brands: ['Trellis Boards', 'Kanbrook', 'Plainsight Tasks'], nav: ['Board', 'Backlog', 'Timeline', 'Reports', 'Team'],
    titles: ['Update supplier price list', 'Prepare onboarding checklist', 'Reconcile October expenses'], key: 'Task', asg: 'Assignee', due: 'Due date', col: 'Column',
    ladder: ['To do', 'In progress', 'Done'], neg: ['Won’t do', 'Task {ref} was closed as won’t do; the work will not be carried out.'], file: 'Deliverable',
    pend: 'Moved to Done, but the deliverable file has not been attached yet.', queued: 'Task {ref} is still in the backlog and has not been started.',
    act: 'Activity', acts: ['Comment added', 'Label changed to Finance'], sprint: 'Sprint 14 ends in 3 days',
    E: { main: 'Task {ref} assigned to {who}', res: 'The finished file attached to task {ref}', num: 'Task {ref} due on {num}', status: 'The work on task {ref} is finished' },
  },
  uk: {
    brands: ['Дошки Шпалера', 'Канбрук', 'Задачі Простір'], nav: ['Дошка', 'Беклог', 'Таймлайн', 'Звіти', 'Команда'],
    titles: ['Оновити прайс постачальника', 'Підготувати чекліст адаптації', 'Звірити витрати за жовтень'], key: 'Задача', asg: 'Виконавець', due: 'Термін', col: 'Колонка',
    ladder: ['Зробити', 'В роботі', 'Готово'], neg: ['Не робитимемо', 'Задачу {ref} закрито як непотрібну; роботу не виконуватимуть.'], file: 'Результат',
    pend: 'Перенесено в Готово, але файл результату ще не додано.', queued: 'Задача {ref} досі в беклозі, роботу не розпочато.',
    act: 'Активність', acts: ['Додано коментар', 'Мітку змінено на Фінанси'], sprint: 'Спринт 14 завершиться через 3 дні',
    E: { main: 'Задача {ref} (виконавець: {who})', res: 'Готовий файл, доданий до задачі {ref}', num: 'Задача {ref} з терміном {num}', status: 'Роботу над задачею {ref} завершено' },
  },
  es: {
    brands: ['Tableros Espaldera', 'Kanarroyo', 'Tareas Llano'], nav: ['Tablero', 'Pendientes', 'Cronograma', 'Informes', 'Equipo'],
    titles: ['Actualizar la lista de precios del proveedor', 'Preparar la lista de incorporación', 'Conciliar los gastos de octubre'], key: 'Tarea', asg: 'Responsable', due: 'Fecha límite', col: 'Columna',
    ladder: ['Por hacer', 'En curso', 'Hecho'], neg: ['Descartada', 'La tarea {ref} se cerró como descartada; el trabajo no se hará.'], file: 'Entregable',
    pend: 'Movida a Hecho, pero el archivo entregable aún no se ha adjuntado.', queued: 'La tarea {ref} sigue en pendientes y no se ha empezado.',
    act: 'Actividad', acts: ['Comentario añadido', 'Etiqueta cambiada a Finanzas'], sprint: 'El sprint 14 termina en 3 días',
    E: { main: 'La tarea {ref} asignada a {who}', res: 'El archivo final adjunto a la tarea {ref}', num: 'La tarea {ref} con vencimiento el {num}', status: 'El trabajo de la tarea {ref} está terminado' },
  },
  pl: {
    brands: ['Tablice Pergola', 'Kanbród', 'Zadania Równina'], nav: ['Tablica', 'Backlog', 'Oś czasu', 'Raporty', 'Zespół'],
    titles: ['Zaktualizować cennik dostawcy', 'Przygotować listę wdrożeniową', 'Uzgodnić wydatki za październik'], key: 'Zadanie', asg: 'Wykonawca', due: 'Termin', col: 'Kolumna',
    ladder: ['Do zrobienia', 'W toku', 'Zrobione'], neg: ['Porzucone', 'Zadanie {ref} zamknięto jako porzucone; praca nie zostanie wykonana.'], file: 'Rezultat',
    pend: 'Przeniesione do Zrobione, ale plik z rezultatem nie został jeszcze dodany.', queued: 'Zadanie {ref} wciąż jest w backlogu i nie zostało rozpoczęte.',
    act: 'Aktywność', acts: ['Dodano komentarz', 'Etykieta zmieniona na Finanse'], sprint: 'Sprint 14 kończy się za 3 dni',
    E: { main: 'Zadanie {ref} (wykonawca: {who})', res: 'Gotowy plik dołączony do zadania {ref}', num: 'Zadanie {ref} z terminem {num}', status: 'Praca nad zadaniem {ref} jest skończona' },
  },
};

export const tasksCard = {
  id: 'tasks-card', kind: 'tasks', langs: ['en', 'uk', 'es', 'pl'],
  make(rng, lang) {
    const c = common(V, lang, rng, { ref: (r) => `OPS-${310 + r.int(680)}`, spec: { type: 'date' } });
    const v = c.v;
    const t = rng.pick(v.titles);
    const file = `${['pricelist', 'checklist', 'expenses'][v.titles.indexOf(t)]}-v${2 + rng.int(7)}.xlsx`;
    return {
      ...c, kind: 'tasks', nav: v.nav, slug: 'board', crumbs: [v.nav[0]], ladder: v.ladder, target: 2, neg: v.neg, pend: v.pend, queued: v.queued,
      title: (x) => `${x.ref} ${t} · ${c.brand}`, at: (ref) => `/board/task/${ref.toLowerCase()}`, resText: file, loadTitle: v.nav[0],
      en: { thing: 'task', res: 'deliverable file', num: 'due date' },
      main(x, ui) {
        const res = `<div class="card"><strong>${esc(v.file)}:</strong> ${ui.a(file, `/files/${file}`)}</div>`;
        return `<h1>${esc(x.ref)} · ${esc(t)}</h1>${rows([[v.asg, esc(x.who)], [v.due, esc(x.num)], [v.col, stageBadge(x)]])}
${slot(x, res)}${timeline(lang, v.ladder, x.si)}`;
      },
      aside: () => box(v.act, list(v.acts.map(esc))) + `<p class="muted">${esc(v.sprint)}</p>`,
    };
  },
};
