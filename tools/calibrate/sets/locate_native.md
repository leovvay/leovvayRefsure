# locate_native

Frozen 2026-10-15. File: `locate_native.jsonl` (sha256 `3cae50ae200e107bc9a639eb5934c4437f5b52184d9fce9007428a38bec5fdf6`),
pages in `locate_native/pages/001.html`-`040.html`.

## What it measures

The `find` site (`locate --intent`): given an intent and the page's candidates as v1 lines, pick the line that is the
element the intent describes, or `none` when no line is. The lines were taken from each page through refsure's own
Orca adapter, the same way `locate --intent` builds them: `--within` filter, one line per twin group, ranked, top 20.
`gold` is a line index and `gold_ref` names the element (role, name, path, its ordinal and the size of its twin
group). Scoring counts `gold` and every `alt` as right (`run.ts`).

Conditions: near decoys next to the right control, high-risk actions (irreversible, money, auth, consent), translated
pages, and twins. A `twins_row` item scopes to one table row with `within`. A `twins_heading` item has the same button
under several headings, and only the heading tells them apart.

## Counts

- 40 items kept, 0 dropped, 1 changed (an alt added, gold unchanged).
- Conditions: high_risk 14, decoy 9, translated 7, twins_row 5, twins_heading 5. Langs: en 20, uk 7, de 7, es 6.
  All synthetic.
- Risk labels: write 10, read 9, irreversible 8, money 6, auth 5, consent 2.
- Gold: a line in 32 items, `none` in 8 (decoy 5, high_risk 2, translated 1; read 2, money 2, auth 2,
  irreversible 2). Line indices run 0-10. They follow the ranker's order, not page order, and a shuffled replay
  hides that order from the model.
- One item has an alt: ln-027, `alt: ["8"]`.

## Agreement before adjudication

The blind labeller (b) matched the author's gold on 40 of 40 items (100 %, Cohen's κ 1.0), all at high confidence.
b gave role, name and ordinal, not a line index, so each label was mapped to a line:

- 30 labels name a role and name that only one line carries, or `none`. All match.
- 5 `twins_heading` labels (ln-003, 017, 025, 032, 040) name a button carried by 2-4 lines. b's page-order ordinal,
  and its note naming the heading, pick the same element as the draft.
- 5 `twins_row` labels (ln-002, 011, 021, 026, 033) give ordinal 0 within the row, and the page-wide ordinal in the
  note is the draft's `gold_ref.ordinal` minus 1 in every case.

**Not blind on its own.** b's file kept `condition` (for example `decoy`, which 5 of 9 times has gold `none`), `risk`,
`source` and `lang`. So the set was labelled again on 2026-10-15 from a file carrying only the page, the intent, the
offered lines (by index) and refsure's own `find` question, by a labeller of another model family that saw nothing
else. It matched the frozen gold (gold or alt) on **40 of 40** items, 6 of them marked low confidence.

## Adjudicated

No label disagreed. Every page was still opened, to look for an item two careful humans could label two ways.

| Item | Change | Reason |
|---|---|---|
| ln-027 (next page of results) | gold 10 `Next` kept, alt `["8"]` (link `2`) added | The results are on page 1, and `2` has the same target as `Next` (`#p2`), so it also reaches the following page. b noted this too. |

Checked and kept as they were. The 8 `none` items have no control that does the intent: ln-016 is already the
mailbox page, and `Compare plans` (ln-030), `Ayuda` (ln-022) and `Zur Prüfung einreichen` (ln-039) only lead toward
the goal or stop short of it. In ln-029, the toolbar `Delete` sits behind the open alertdialog and only opened it.

## Note for the code, not the labels

- Items are `site: "find"`. `orca-native.ts` snapshots each page, builds the `find` input the way `locate --intent`
  does and maps `gold_ref` onto the offered lines; `run.ts` replays it like any other choice site.
- The page classifier gave a different risk class from the set's label on 4 items: ln-018 consent (classifier:
  write), ln-025 read (write), ln-031 auth (consent), ln-040 money (write). The labels stay as authored, because
  `--risk` is the caller's claim.
