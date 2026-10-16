// Template docs-rename: a team wiki page with its settings panel; the step renames the page.
// Wrong item: a sibling page with a near-twin title is renamed. Invalid: a co-editor holds the page.
import { esc, fill } from './n5-lib.mjs';
import { box, list } from './n5-shell.mjs';

const V = {
  en: {
    brands: ['Pagewell', 'Inkstone Wiki', 'Knotbook'], nav: ['Spaces', 'Recent', 'Starred', 'Templates'], users: ['Mara Quint', 'Owen Strick', 'Priya Calder', 'Tobias Fenwick'],
    spaces: ['Support handbook', 'Engineering', 'Field operations'],
    pages: [['Refund policy (draft)', 'Refund policy (old)', 'Refund policy 2027'], ['On-call rota', 'On-call rota (archive)', 'On-call rota and escalation'], ['Van checklist', 'Van checklist (winter)', 'Vehicle checklist']],
    body: 'This page is owned by the team leads. Ask in the team channel before changing the process it describes.', h2: 'Page settings', label: 'Page title', rename: 'Rename page', cancel: 'Cancel',
    meta: 'Last edited {d} by {u}', d: '3 days ago', now: 'just now', you: 'you', tree: 'Pages in this space', watch: 'Watch', share: 'Share',
    ok: 'Page renamed to "{n}"', bad: 'Page "{s}" renamed to "{n}"', invalid: '{x} is editing this page right now. Try again when they have finished.',
    intent: 'rename the page "{o}" to "{n}"', confirm: 'Rename "{o}" to "{n}"? Links to this page will keep working.',
  },
  uk: {
    brands: ['Сторінник', 'Чорнильниця', 'Вузлик'], nav: ['Простори', 'Нещодавні', 'Обрані', 'Шаблони'], users: ['Ірина Коваль', 'Богдан Савчин', 'Дарина Ліщук', 'Остап Дячук'],
    spaces: ['Довідник підтримки', 'Розробка', 'Виїзні роботи'],
    pages: [['Політика повернень (чернетка)', 'Політика повернень (стара)', 'Політика повернень 2027'], ['Графік чергувань', 'Графік чергувань (архів)', 'Графік чергувань і ескалація'], ['Чек-лист фургона', 'Чек-лист фургона (зима)', 'Чек-лист транспорту']],
    body: 'Сторінкою опікуються керівники команди. Перш ніж змінювати описаний процес, запитайте в командному каналі.', h2: 'Налаштування сторінки', label: 'Назва сторінки', rename: 'Перейменувати', cancel: 'Скасувати',
    meta: 'Востаннє редагував(-ла) {u}, {d}', d: '3 дні тому', now: 'щойно', you: 'ви', tree: 'Сторінки простору', watch: 'Стежити', share: 'Поділитися',
    ok: 'Сторінку перейменовано на «{n}»', bad: 'Сторінку «{s}» перейменовано на «{n}»', invalid: '{x} зараз редагує цю сторінку. Спробуйте, коли закінчить.',
    intent: 'перейменувати сторінку «{o}» на «{n}»', confirm: 'Перейменувати «{o}» на «{n}»? Посилання на сторінку працюватимуть.',
  },
  pl: {
    brands: ['Kartownia', 'Atrament Wiki', 'Supełek'], nav: ['Przestrzenie', 'Ostatnie', 'Oznaczone', 'Szablony'], users: ['Zofia Wrzos', 'Kacper Lisowski', 'Ewa Brzezińska'],
    spaces: ['Podręcznik wsparcia', 'Inżynieria', 'Prace terenowe'],
    pages: [['Zasady zwrotów (szkic)', 'Zasady zwrotów (stare)', 'Zasady zwrotów 2027'], ['Grafik dyżurów', 'Grafik dyżurów (archiwum)', 'Grafik dyżurów i eskalacje'], ['Lista kontrolna busa', 'Lista kontrolna busa (zima)', 'Lista kontrolna pojazdu']],
    body: 'Właścicielami strony są liderzy zespołu. Zanim zmienisz opisany proces, zapytaj na kanale zespołu.', h2: 'Ustawienia strony', label: 'Tytuł strony', rename: 'Zmień nazwę', cancel: 'Anuluj',
    meta: 'Ostatnio edytowane {d} przez: {u}', d: '3 dni temu', now: 'przed chwilą', you: 'Ty', tree: 'Strony w przestrzeni', watch: 'Obserwuj', share: 'Udostępnij',
    ok: 'Zmieniono nazwę strony na „{n}”', bad: 'Zmieniono nazwę strony „{s}” na „{n}”', invalid: '{x} edytuje teraz tę stronę. Spróbuj ponownie, gdy skończy.',
    intent: 'zmienić nazwę strony „{o}” na „{n}”', confirm: 'Zmienić nazwę „{o}” na „{n}”? Linki do strony będą działać.',
  },
};

export const docsRename = {
  id: 'docs-rename', kind: 'docs', langs: ['en', 'uk', 'pl'],
  make(rng, lang, il) {
    const v = V[lang];
    const k = rng.int(v.pages.length);
    const [o, s, n] = v.pages[k];
    const [user, x] = rng.shuffle(v.users);
    const space = v.spaces[k];
    const brand = rng.pick(v.brands);
    const vars = { o, s, n, x };
    const others = v.pages.filter((_, i) => i !== k).map((p) => p[0]);
    const tree = rng.shuffle([o, s, ...others]);
    const pid = 1000 + rng.int(9000);
    const shownTitle = (page, state) => (page === o && state === 'done') || (page === s && state === 'wrong') ? n : page;
    return {
      kind: 'docs', brand, title: `${o} · ${space} · ${brand}`, at: `/spaces/${k + 1}/pages/${pid}/settings`, nav: v.nav, slug: 'wiki', user,
      crumbs: [space, shownTitle(o, 'before')], intent: fill(V[il].intent, vars),
      main(state, ui) {
        const title = shownTitle(o, state);
        const meta = fill(v.meta, state === 'done' ? { d: v.now, u: v.you } : { d: v.d, u: x });
        const err = state === 'invalid' ? `<p class="err" role="alert">${esc(fill(v.invalid, vars))}</p>` : '';
        return `<h1>${esc(title)}</h1><p class="muted">${esc(meta)} · ${ui.a(v.watch)} · ${ui.a(v.share)}</p><p>${esc(v.body)}</p>
<div class="card"><h2>${esc(v.h2)}</h2>${ui.input(v.label, n)}${err}<p>${ui.btn(v.rename, { pri: true, acted: true })} ${ui.btn(v.cancel)}</p></div>`;
      },
      aside(state, ui) {
        return box(v.tree, list(tree.map((p) => ui.a(shownTitle(p, state), '/spaces/page'))));
      },
      ok: fill(v.ok, vars), bad: fill(v.bad, vars), invalid: fill(v.invalid, vars), confirmQ: fill(v.confirm, vars),
      confirm: {
        at: `/spaces/${k + 1}/pages/${pid}`, title: `${n} · ${space} · ${brand}`,
        main(ui) {
          return `<div class="crumbs">${esc(space)}</div><h1>${esc(n)}</h1><p class="muted">${esc(fill(v.meta, { d: v.now, u: v.you }))}</p><p>${esc(v.body)}</p><p>${ui.a(v.share)}</p>`;
        },
      },
      errAt: `/spaces/${k + 1}/pages/${pid}/settings`,
      why: {
        change: `the page heading and the page list now read "${n}" instead of "${o}"`,
        wrong: `the sibling page "${s}" became "${n}" while this page is still "${o}"`,
        unchanged: `the page is still called "${o}"`,
        confirm: `shows the page under its new title "${n}", edited just now`,
      },
    };
  },
};
