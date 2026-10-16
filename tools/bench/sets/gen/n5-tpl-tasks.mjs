// Template tasks-move: a kanban board with one card's panel open; the step moves that card to Done.
// Wrong item: a card with a near-twin title moves. Invalid: the board's rule wants a time estimate first.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Cardwell', 'Laneboard', 'Sprintly'], nav: ['Boards', 'My tasks', 'Timeline', 'Reports'], users: ['Mara Quint', 'Owen Strick', 'Priya Calder'],
    cards: [['Fix login redirect on mobile', 'Fix logout redirect on mobile'], ['Update supplier price list', 'Update supplier contact list'], ['Translate onboarding emails (uk)', 'Translate onboarding emails (pl)'], ['Book venue for Q4 offsite', 'Book catering for Q4 offsite']],
    other: ['Write release notes', 'Order new badge printer', 'Review accessibility audit', 'Clean up old feature flags'], cols: ['To do', 'In progress', 'Done'],
    board: 'Product team board', status: 'Status', move: 'Move card', close: 'Close', assignee: 'Assignee', panel: 'Card', filters: 'Filters', fl: ['Assigned to me', 'Due this week'],
    ok: 'Card moved to Done', bad: '"{w}" moved to Done', invalid: 'Add a time estimate before moving a card to Done.',
    intent: 'move the card "{c}" to Done', confirm: 'Move "{c}" to Done? Watchers will be notified.', closed: 'Completed today',
  },
  uk: {
    brands: ['Карткова', 'Доріжки', 'Спринтик'], nav: ['Дошки', 'Мої завдання', 'Хронологія', 'Звіти'], users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук'],
    cards: [['Виправити редирект після входу на мобільному', 'Виправити редирект після виходу на мобільному'], ['Оновити прайс постачальника', 'Оновити контакти постачальника'], ['Перекласти листи онбордингу (pl)', 'Перекласти листи онбордингу (en)'], ['Забронювати залу для виїзної зустрічі', 'Забронювати кейтеринг для виїзної зустрічі']],
    other: ['Написати примітки до релізу', 'Замовити принтер для бейджів', 'Переглянути аудит доступності', 'Прибрати старі прапорці функцій'], cols: ['Зробити', 'У роботі', 'Готово'],
    board: 'Дошка продуктової команди', status: 'Статус', move: 'Перемістити картку', close: 'Закрити', assignee: 'Виконавець', panel: 'Картка', filters: 'Фільтри', fl: ['Призначені мені', 'Термін цього тижня'],
    ok: 'Картку переміщено в «Готово»', bad: '«{w}» переміщено в «Готово»', invalid: 'Перш ніж переміщати картку в «Готово», додайте оцінку часу.',
    intent: 'перемістити картку «{c}» у «Готово»', confirm: 'Перемістити «{c}» у «Готово»? Спостерігачів буде сповіщено.', closed: 'Завершено сьогодні',
  },
  es: {
    brands: ['Tarjetero', 'Carriles', 'Sprintia'], nav: ['Tableros', 'Mis tareas', 'Cronograma', 'Informes'], users: ['Lucía Varela', 'Diego Montaño', 'Carmen Ibarra'],
    cards: [['Corregir redirección tras iniciar sesión en móvil', 'Corregir redirección tras cerrar sesión en móvil'], ['Actualizar tarifas del proveedor', 'Actualizar contactos del proveedor'], ['Traducir correos de bienvenida (pt)', 'Traducir correos de bienvenida (it)'], ['Reservar sala para la jornada del T4', 'Reservar catering para la jornada del T4']],
    other: ['Redactar notas de versión', 'Pedir impresora de acreditaciones', 'Revisar auditoría de accesibilidad', 'Limpiar flags antiguos'], cols: ['Pendiente', 'En curso', 'Hecho'],
    board: 'Tablero del equipo de producto', status: 'Estado', move: 'Mover tarjeta', close: 'Cerrar', assignee: 'Responsable', panel: 'Tarjeta', filters: 'Filtros', fl: ['Asignadas a mí', 'Vencen esta semana'],
    ok: 'Tarjeta movida a Hecho', bad: '«{w}» movida a Hecho', invalid: 'Añade una estimación de tiempo antes de mover una tarjeta a Hecho.',
    intent: 'mover la tarjeta «{c}» a Hecho', confirm: '¿Mover «{c}» a Hecho? Se avisará a quienes la siguen.', closed: 'Completada hoy',
  },
};

export const tasksMove = {
  id: 'tasks-move', kind: 'tasks', langs: ['en', 'uk', 'es'],
  make(rng, lang, il) {
    const v = V[lang];
    const pair = rng.pick(v.cards);
    const [c, w] = rng.chance(0.5) ? pair : [pair[1], pair[0]];
    const [o1, o2, o3, o4] = rng.shuffle(v.other);
    const user = rng.pick(v.users);
    const key = `${['PRD', 'OPS', 'WEB'][rng.int(3)]}-${100 + rng.int(800)}`;
    const brand = rng.pick(v.brands);
    const vars = { c, w };
    const cols = (state) => [
      [o1, ...(state === 'wrong' ? [] : [w])],
      [...(state === 'done' ? [] : [c]), o2],
      [...(state === 'done' ? [c] : []), ...(state === 'wrong' ? [w] : []), o3, o4],
    ];
    const board = (state) => `<div class="cols">${cols(state).map((items, i) => `<div><h2>${esc(v.cols[i])} (${items.length})</h2>${items.map((x) => `<div class="card">${esc(x)}</div>`).join('')}</div>`).join('')}</div>`;
    return {
      kind: 'tasks', brand, title: `${key} ${c} – ${brand}`, at: `/boards/7/cards/${key}`, nav: v.nav, slug: 'tasks', user,
      crumbs: [v.nav[0], v.board], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(v.invalid)}</p>` : '';
        return `<h1>${esc(v.board)}</h1>${board(state)}<div class="card"><h2>${esc(v.panel)} ${key}: ${esc(c)}</h2><p>${esc(v.assignee)}: ${esc(user)}</p>${ui.select(v.status, v.cols, v.cols[2])}${err}<p>${ui.btn(v.move, { pri: true, acted: true })} ${ui.btn(v.close)}</p></div>`;
      },
      aside(state, ui) {
        return box(v.filters, list(v.fl.map((f) => ui.a(f, '/filters')))) + box(v.nav[1], list([o2, c].map(esc)));
      },
      ok: v.ok, bad: fill(v.bad, vars), invalid: v.invalid, confirmQ: fill(v.confirm, vars),
      confirm: {
        at: `/cards/${key}`, title: `${key} ${c} – ${brand}`,
        main(ui) {
          return `<div class="crumbs">${esc(v.board)}</div><h1>${key}: ${esc(c)}</h1><p>${esc(v.status)}: <span class="badge">${esc(v.cols[2])}</span> · ${esc(v.closed)}</p><p>${esc(v.assignee)}: ${esc(user)}</p><p>${ui.a(v.board, '/boards/7')}</p>`;
        },
      },
      errAt: `/boards/7/cards/${key}/move`,
      why: {
        change: `the board now shows "${c}" in ${v.cols[2]} and no longer in ${v.cols[1]}`,
        wrong: `"${w}" moved to ${v.cols[2]} while "${c}" is still in ${v.cols[1]}`,
        unchanged: `"${c}" is still in ${v.cols[1]}`,
        confirm: `shows the card "${c}" with status ${v.cols[2]}`,
      },
    };
  },
};
