# presence_false

Frozen 2026-10-15. File: `presence_false.jsonl` (sha256 `ed46f10685ffef52fdbfe3c96a0f717c9887bb976a14f79266e042f52daa7c0f`),
pages in `presence_false/pages/001.html`-`040.html`.

## What it measures

The `presence` site (`wait-for --expect` with no `--text` or `--url`): given an expectation and the page's URL and
body text, is what the wait expects visibly there now. The set leans on false presents: 24 pages show something
close to the expectation that is not it, and 16 show it in other words, another language or number format, so code
could not settle it by a literal. Gold is `true` or `false`; the Noul's yes edge is what the fit reads.

Conditions, gold `false` (24): loading, queued, empty state, wrong entity (order A-1043 for A-1042), wrong query,
an error instead, partial upload, a negation ("were not saved"), help text that names the result, a sync still in
progress, scheduled not sent, draft not published, pending review, a sign-in page, a bot check, a translated
loading / processing / no-results page (uk, de, es), a count mismatch, a failed deploy, a toast for another action,
an example on a help page, a disabled download while processing, and an older entry beside today's that is still
preparing.

Conditions, gold `true` (16): a paraphrase, translated confirmations (uk, de, es, fr), a German number format, a
table under another heading, a ready export, a complete upload, a status badge, a successful deploy, the right
order id, a finished report, a translated list, a toast among unrelated cards, a confirmation beside a cookie
banner.

## Counts

- 40 items kept, 0 dropped, 0 changed. All synthetic, every brand made up; e-mail addresses use `.example`.
- Gold: `false` 24, `true` 16. Langs: en 31, uk 3, de 3, es 2, fr 1.

## Agreement before adjudication

The author wrote each page with its gold and reason. The blind labeller (b) saw only the expectation and the page
(`condition`, gold and reason removed) and matched the author on 39 of 40 items, all at high confidence.

## Adjudicated

The adjudicator opened every page, ruled on the one disagreement and looked for items two careful people could
label two ways. It found none: 40 kept, 0 changed, 0 dropped.

| Item | Author | b | Decision |
|---|---|---|---|
| pf-030 (last month's invoices) | `true` | `false`, high | Kept `true`. The page shows the September 2026 invoices and says today is 15 October 2026. b's own note agrees that last month is September, so its label is a slip, not an ambiguity. |
