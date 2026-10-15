# pii_masks

Frozen 2026-10-15. File: `pii_masks.jsonl` (sha256 `9cfb2d48715d6b039afe32ba1eac1f6f0c773ad08313cd2c5aa5c14c5c8737af`),
pages in `pii_masks/pages/001.html`-`030.html` (`027.html` unused).

## What it measures

Whether turning PII masks on changes the `page-state` Decision (`refsure state --expect`, research state set).
Every item is one synthetic page. It is asked twice: with masks off (secrets redacted) and on (secrets redacted, and
e-mail, IBAN, card and phone replaced by `[email]`/`[iban]`/`[card]`/`[phone]`, in page text and percent-encoded URL
queries). Gold is the same in both modes for every item (`mask_changes_gold: false`). The masks hit only contact
values, account numbers and tokens, never the heading, item id, error or status wording that names the state. So
a gold miss with masks on that is right with masks off is a cost of the masks, not of the page.

Masking was checked with the repo's own `cleanEgressText` on each page's text and URL, masks off and on. Every
declared PII kind is replaced, and no state-naming text is: invoice, order and ticket numbers, member and customer
names, and error codes all survive.

`page` paths are relative to `sets/pii_masks/`. Fields are the draft's own, unchanged.

## Counts

- 30 drafted, **29 kept**, 1 dropped.
- Gold: expected 9, unexpected_page 5, login_wall 4, error_page 3, blocking_modal 3, rate_limited 3,
  bot_challenge 2.
- Languages: en 20, es 3, de 3, uk 3. Conditions: pii_prose 15, pii_table 5, pii_code_block 4, pii_url_query 4,
  pii_dense_table 1. Five items carry PII in the URL query.

## Agreement before adjudication

The author's gold and labeller B's blind labels matched on **30 of 30 items (100 %, Cohen's κ 1.0)**. They also
matched on whether masks change gold (no change on all 30). B marked 29 labels high confidence and 1 low.

**Not blind on its own.** B's file kept `condition`, `pii` and `mask_changes_gold: false`. So the 29 kept items were
labelled again on 2026-10-15 from a file carrying only the page, the research states with the item's expectation,
and one question on whether replacing e-mails, IBANs, cards, phones and tokens by placeholders would change the
answer, by a labeller of another model family that saw nothing else. It matched the frozen gold on **29 of 29**
items, all high confidence, and answered "no change" on all 29.

## Changed or dropped items

- **pii-027 dropped.** The Statements page shell, heading and "Paying from" card render, but the statements area
  shows "We couldn't load your statements. Error E-4471". It fits `error_page` ("an app error message instead of
  content") and `expected` ("it is the intended page") equally well. B labelled it `error_page` at low confidence
  and called `expected` arguable, so it is ambiguous and dropped rather than forced. `pages/027.html` stays on
  disk, and no item uses it.

No gold was changed.
