# Calibration harness

The tools that turn labelled browser Decisions into the thresholds in `src/questions/calibration/calibration.json`
(spec §9, steps 0, 1 and 2). This is an evaluation tool, not a test suite. It is not part of the npm package. The
only data committed is the small synthetic sets written for refsure under `sets/` (spec §9 allows them); every other
input path is an argument, and every output belongs outside the repo.

| Tool | Step | Does |
|---|---|---|
| `parity.ts` | 0 | Sends frozen requests, byte for byte, through refsure's Jev provider and compares the answers with the ones stored for the same requests. Pass: ≥90 % of Choice answers pick the same key. |
| `convert-v1.ts` | 1 | Turns a labelled set into refsure site inputs, every element line in line format v1. |
| `run.ts` | 1 | Builds each item through refsure's own site, approves it through the egress pipeline and asks Jev, once per salt. |
| `orca-native.ts` | 2 | Serves a set's stored pages on 127.0.0.1, opens them in an isolated Orca profile, snapshots each through refsure's Orca adapter and builds the input its command would send; gold is mapped by role, name and ordinal. |
| `fit.ts` | 1, 2 | Fits each site on every replay given for it, pooled, and with `--write` updates its Jev entry in `calibration.json`. |

## Build and run

```sh
npx tsc --noEmit -p tools/calibrate                     # typecheck the harness with src
for t in parity convert-v1 orca-native run fit; do
  npx esbuild tools/calibrate/$t.ts --bundle --platform=node --format=esm --target=node22 --outfile="$OUT/bin/$t.mjs"
done
```

The harness reads the same config, key sources and consent as refsure. Use a dedicated config and state directory,
grant consent there once, and put the key in the environment:

```sh
export XDG_CONFIG_HOME="$OUT/xdg/config" XDG_STATE_HOME="$OUT/xdg/state"
REFSURE_OPENROUTER_KEY=… node dist/refsure.mjs setup     # type: send page text to openrouter.ai
```

Harness calls are not written to `egress.log` and do not count toward its caps; `run --max-usd` (default 1) stops a
run instead. A rerun of `run` skips the (item, salt) pairs already answered, so a killed run resumes. A second
replay of the same salts goes to its own `--out` file; the fit pools every file it is given for a site.

```sh
node $OUT/bin/parity.mjs --in parity-items.jsonl --out parity-runs.jsonl
node $OUT/bin/convert-v1.mjs --set browser_locate.jsonl --out conv-locate.jsonl      # also writes conv-locate.jsonl.meta.json
node $OUT/bin/run.mjs --in conv-locate.jsonl --out a/runs-locate.jsonl --salts s1,s2,s3
node $OUT/bin/run.mjs --in conv-locate.jsonl --out b/runs-locate.jsonl --salts s1,s2,s3
node $OUT/bin/run.mjs --in conv-locate.jsonl --out c/runs-locate.jsonl --salts s4,s5,s6
node $OUT/bin/fit.mjs --runs a/runs-locate.jsonl,b/runs-locate.jsonl,c/runs-locate.jsonl,… \
  --metas conv-locate.jsonl.meta.json,… --write src/questions/calibration/calibration.json
```

## Inputs

- **Labelled set** (JSONL): `{id, base, task, lang, source, condition, gold, alt?, request}` per line. `task` is
  `browser_locate`, `browser_dismiss`, `browser_page_state` or `browser_outcome`. `gold` is a candidate index or
  `none`, a state key, or `true`/`false`. `request` holds `recorded`, `intent`, `candidates`, `risk` (locate),
  `overlay`, `candidates` (dismiss), `pageUrl`, `page`, `states` (page state), or `intent`, `before`, `after`
  (outcome). `convert-v1 --sources` keeps only the listed public and synthetic sources; `--drop` removes items by id.
- **Parity item** (JSONL): `{id, site, question, state, questions, stored, storedRepeats?, storedModel?}`, where
  `state` and `questions` are exactly the body sent before and `stored` is the answer it got.

## Conversion to line format v1

A descriptor line `<tag role=R> name="N" … in="a > b#id > c.cls" under_heading="H" box=…` becomes
`R "N" in="<path>"`, the name `norm`ed and cut at 90 characters:
- the role is `role=`, else the tag's implicit role (`a` link, `button` button, `select` combobox, …);
- the name is `name=`, else `text=`, `alt=`, `title=`, `placeholder=`, and `value=` only for a button (an
  `<input type=submit>` is labelled by its value; a textbox's, checkbox's or radio's value is data, never a name);
- the path keeps the `in=` segments that name a place (`dialog`, `nav` → `navigation`, `main`, `form`, or a
  `[role=…]` of dialog, alertdialog, navigation, main, form or region), outer to inner and unnamed, then
  `heading "H"`; with neither it is `""`. Classes, ids, hrefs, boxes and values never reach a line.

Locate's recorded line and candidates, and dismiss candidates, are converted. Page-state and outcome inputs pass
unchanged; page state keeps the research state set, so its rows measure the wording `state --expect` sends. The meta
file counts `overlayLines`, the converted lines placed in a dialog, alertdialog or region, where every live dismiss
candidate sits.

## Fit

- Points are the answers a site would act on: a candidate or a state (never `none`), scored by confidence; a Noul
  is scored by its probability against `gold`. Each call is one point, and every call given for a site is pooled,
  over sets and replays: a row fitted on one replay sits just above that replay's highest wrong answer, so another
  replay moves it. The report line carries each replay's rows beside the pooled ones.
- **All labelled evidence for a key.** refsure reads one entry per site, wording, line format, model family and
  provider, so a site is `measured` only when the fit on every labelled call for that key ships a row. Converted
  (step 1) and Orca-native (step 2) runs of a site pool, and so do the calls on visual-only items: refsure cannot
  tell such a page apart at run time. With `--write`, the fit refuses a site unless every set that
  `calibration.json` (the `--write` and `--floor` files) already names for its key is given.
- `isotonic` (the default) is the method of the author's earlier decision reports: pool-adjacent-violators of
  "right" on score, then the lowest score whose calibrated precision is at least `--target` (0.99) with at least
  `--min-points` (10) points beyond it. `--method cumulative` reads precision over every answer at or above the
  threshold instead; it ships looser rows and is kept for comparison.
- A fit that only certainty reaches (a row of 1.0) is not a row: one confident wrong answer below 1.0 puts it
  there and one at 1.0 removes it, and with a second provider configured a Jev row of 1.0 sends most calls to that
  provider's unmeasured row.
- Every row is max(fitted, starting row): calibration never loosens the starting rows, and `--floor` raises them
  to the entries already shipped. Locate and find fit a row per risk label the set carries, but only from a real
  sample: a label with fewer than `--min-items` (10) distinct pages, or with no wrong answer, reads the all-points
  fit. With nothing wrong, a label's own fit is just its lowest score; it bounds nothing, and the next replay moves
  it. The rows never decrease along the risk order (see Results). A Noul's "no" edge only ever tightens.
- Items are distinct pages: a page-state page asked with PII masks on and off counts once, and `masks` counts the
  pages asked in each mode.
- **What is written.** A site whose pooled fit ships a row gets a `measured` entry; `provenance.native` holds the
  Orca-native reading, and `provenance.native.textOnly` the same fit without the visual-only calls (a reading,
  never what ships). A site with no row, or held for an owner ruling (dismiss), gets a record under `held` in
  `calibration.json`: what refsure uses instead (its declared maturity and rows), why, the pooled reading, the
  native one, and the entry it replaced. refsure reads only `entries`; `lib/calibration-provenance.ts` and
  `lib/held-record.ts` type the rest.

## Results, 2026-10-15 (Jev `jev-1.13-20260917` via openrouter.ai)

Parity, run twice on 50 frozen requests: every body unchanged by the egress pipeline; Choice 39/40 and 40/40 same
key, Noul 10/10 same side; mean |Δ confidence| 0.02 (Choice), 0.002 (Noul), max 0.10.

Step 1 pools three replays per site, 9 calls per item over 6 orders: salts s1-s3 twice and s4-s6 once ($0.28 in
all). The fitted row below is the all-points isotonic fit before the starting rows; every answer at or above it was
right on both line formats. The earlier descriptor lines are the stored answers of the same sets (locate and
dismiss in 5 shuffled orders, page state and outcome in 3 repeats), fitted the same way.

| Site | v1 lines: calls, accuracy | Fitted row, coverage | Descriptor lines: calls, accuracy | Fitted row, coverage |
|---|---|---|---|---|
| locate | 3852, 83.6 % | 0.89, 52.3 % | 2140, 96.1 % | 0.79, 78.1 % |
| dismiss | 531, 83.6 % | 0.75, 55.7 % | 295, 93.2 % | 0.62, 68.5 % |
| page-state (inputs unchanged) | 1053, 94.8 % | 1.0 only, 53.4 % | 351, 94.9 % | 0.99, 60.7 % |
| outcome (inputs unchanged) | 1287, 95.8 % | yes ≥ 0.93, 34.7 % | 429, 95.1 % | yes ≥ 0.93, 34.7 % |

Thinning to v1 costs locate 26 points of coverage and dismiss 13. Page state and outcome send the same inputs on
both sides, so their difference is sampling alone.

What step 1 shipped (step 2 below refits every site on step 1 and step 2 pooled):

| Site | Maturity | Rows | Acted, right (coverage) | Rows per replay alone |
|---|---|---|---|---|
| locate | measured | 0.89 at every risk | 2013, 2013 (52.3 %) | 0.87, 0.88, 0.89 |
| outcome | measured | yes ≥ 0.93, no ≤ 0.15 | 447, 447 (34.7 %) | 0.93 each |
| dismiss | inherited (held) | 0.6 with the close/reject lexicon | 335, 331 at 0.6 alone | 0.68, 0.76, 0.75 |
| page-state | inherited (no row below 1.0) | 0.8 | 909, 899 (86.3 %) | none, 0.99, none |

Open for the owner before 0.1:
- **Page state.** One bot-check page read as an error page holds 9 of the 10 wrong answers at 0.8 or more
  (0.94-0.99, both states stop the agent), so no score below 1.0 reaches 0.99. A row of 1.0 abstains on intended
  pages answered at 0.96-0.98, never answers `unexpected_page` (its highest score is 0.94), and with both keys sends
  about half of the calls to OpenAI. The choices: the cumulative 0.82 (904 acted, 895 right, 99.0 %), per-state
  rows (a change in how `state` reads its row), or the declared 0.8 it keeps until then.
- **Locate's write row.** The plan's rule, max(fitted, starting row) per label, would ship write at 0.8 (545 of
  545 right, 58.2 % of write calls) under read at 0.89 (474 of 474 at 0.89, 50.6 %). `--risk` is the caller's claim
  and the page can only raise it, so a write row under the read row lets `--risk write` act on a read pick at 0.8,
  where read-labelled answers are 8 of 198 wrong between 0.80 and 0.89. The rows stay non-decreasing until the
  owner rules.
- **Dismiss.** The converted candidates carry no overlay place (0 of 175 lines) and live ones always do. Its only
  wrong picks at 0.6 or more are one accept-only wall answered "Manage choices", which the code veto refuses.

OpenAI arms were not run: the vault OpenAI key returns 401 until the owner refreshes it.

## Step 2: the Orca-native replay

```sh
export ORCA_WORKTREE_ID=…                                  # an Orca terminal sets it
P=<isolated profile id>                                     # never the default profile: it carries real cookies
node $OUT/bin/orca-native.mjs --set sets/presence_false.jsonl --out cap/presence_false.jsonl --profile $P
node $OUT/bin/run.mjs --in cap/presence_false.jsonl --out a/presence_false.jsonl --salts s1,s2,s3
node $OUT/bin/run.mjs --in cap/presence_false.jsonl --out b/presence_false.jsonl --salts s4,s5,s6
node $OUT/bin/fit.mjs --runs <step 1 runs>,a/…,b/… --metas <step 1 metas>,cap/….meta.json,… \
  --floor <step 1 calibration.json> --write src/questions/calibration/calibration.json
```

- **Capture.** One tab in the named profile moves from page to page with `goto`. The replay refuses before any tab
  opens unless `orca tab profile list` reports that profile with scope `isolated`, and refuses again unless `tab
  profile show` reports exactly that profile for the new tab; refsure's own adapter takes `tab show`, the snapshot and the body text. The input is built as
  the command builds it: `locate --intent [--within]` (`find`), `locate --recorded` (`locate`, the recorded line is
  refsure's own line for the element on the recording page), one `dismiss` level, one `wait-for` poll, `state` in
  each PII mask mode the set asks for. In the live proof 32 of 32 inputs built this way (8 from each set in
  `sets/`) equalled the body `refsure <verb> --dry-run` printed for the same page.
- **Gold.** A set names its gold as role, name and ordinal (and path when it has one); a frozen item's descriptor
  index becomes the same, the ordinal counted in the list's own order. The gold maps to the offered line of its
  twin group. A gold on the page but on no offered line scores only `none` as right; a gold not on the page drops
  the item. What code settles (an exact name, the recorded line, no overlay, the veto, a dialog) is written to
  `<out>.rows.jsonl`, scored, and never fitted; a code pick that still has twins stops at the twin rule.
- **Fit.** Every set of a site pools, step 1's converted runs included (see Fit above). `--floor` raises each
  starting row to the step 1 entry, so step 2 never ships looser than step 1. The native reading goes into
  `provenance.native` (or the held record), with `textOnly`: the fit without the calls on items their set marks
  visual-only (the answer is only in the picture). Each report line carries the Wilson 95 % lower bound of the
  precision, over calls.

### Results, 2026-10-15 (Jev `jev-1.13-20260917` via openrouter.ai)

Sets: the four in `sets/` (locate_native 40, dismiss_injected 40, pii_masks 29 in two mask modes, presence_false
40) and the frozen benchmark items that keep their stored page (vision_locate 96, vision_dismiss 50,
vision_page_state 64, vision_presence 68; all synthetic, none dropped for privacy). Two replays (salts s1-s3 and
s4-s6), 2,064 calls, $0.054, no failures. The fit pools each site's step 1 runs (three replays) with its step 2
runs. Acted and right are counted at the rows, over calls; the calls of one page are correlated, so the page count
is the honest sample size.

| Site | Pages | Calls | Ships | Acted, right | Coverage | Wilson 95 % low |
|---|---|---|---|---|---|---|
| locate | 452 | 3996 | measured: 0.89 at every risk | 2056, 2056 | 51.5 % | 0.998 |
| find | 40 | 240 | measured: read 0.61, write 0.8, consent and up 0.85 | 185, 185 (31 pages) | 77.1 % | 0.980 |
| outcome | 143 | 1287 | measured: yes ≥ 0.93, no ≤ 0.15 (step 1 only) | 447, 447 | 34.7 % | 0.992 |
| page-state | 210 | 1785 | held: inherited 0.8 | no row: no score below 1.0 reaches 0.99 | | |
| presence | 108 | 648 | held: inherited yes ≥ 0.85, no ≤ 0.15 | no row: no yes edge reaches 0.99 | | |
| dismiss | 109 | 831 | held: inherited 0.6, close/reject lexicon | 244, 244 at the fit's 0.97 | 29.4 % | 0.985 |

- **find.** No risk label has 10 pages with a wrong answer among them (read 7 pages, write 10 with none wrong,
  irreversible 6, money 4, auth 3, consent 2), so each reads the all-points fit, 0.61 (above the one wrong pick, at
  0.55), raised to its starting row. A call without `--risk` reads the strictest row, 0.85: 176 of 240 calls act,
  all right. The earlier per-label rows (consent and auth 0.99) were each label's lowest score from 2 and 3 pages;
  they bounded nothing, and live they abstained on plain search boxes and Save buttons answered at 0.98.
- **page-state.** On all its evidence no score below 1.0 reaches 0.99. At the declared 0.8: step 1 is 899 right of
  909 acted (the open question above), the native text pages 357 of 357 (42 pages, 36 acted), and the visual-only
  pages 131 of 275, with 76 wrong at 1.0, every one `expected` on a page whose gold (an error or blocked page) is
  drawn only in pixels. The text-only reading stays in `held[].native.textOnly`. PII masks on and off agree on 28
  of 29 pages; masks on were right on 173 of 174 calls, off on 168.
- **presence.** Text pages: 126 of 126 at 0.92 (at the declared 0.85, presence_false had one false present, at
  0.86). Visual-only pages: 18 false presents of 36 acted at both 0.85 and 0.92, such as a toast faded to opacity
  0 that the text still carries. wait-for keeps its inherited 0.85 band.
- **locate.** Pooled with vision_locate the rows stay 0.89; the native calls alone are 43 right of 43 acted.
- **Code.** vision_dismiss: dismiss finds no overlay on 32 of 50 pages (27 of them have a control to dismiss);
  those overlays are plain elements with no dialog role and no consent wording. vision_locate: 51 of 96 recorded
  lines match several identical elements, so the twin rule stops them, and one matched a button the page had
  faded out (gold none).
- **Not replayed:** vision_outcome (an outcome needs the act between two reads; 47 of 59 items are visual-only).
  Outcome keeps its step 1 entry.

Open for the owner:
- **Dismiss.** Counting every pick, the pooled row is 0.97, and live it abstains on a plain cookie wall ("Reject
  all" at 0.95). Every wrong pick at 0.6 or more is "Manage settings" on one injected wall (dj-040, 0.89-0.96),
  which the never-click veto refuses before any click; leaving vetoed picks out, 187 of 187 native picks at 0.6
  were right. Dismiss stays inherited (0.6 with the close/reject lexicon) until a row is chosen. Known limit of the
  veto: it refuses the French "Continuer sans accepter" (continue without accepting) as an accept, because
  "accepter" matches the accept lexicon, so `dismiss` refuses the dj-016 wall although a safe close exists.
- **A text-only scope.** page-state and presence qualify only on pages whose text carries the answer (rows 0.8 and
  yes ≥ 0.92 there). refsure cannot tell a visual-only page apart, so they stay held. Shipping them needs the
  owner's ruling on that scope, a provenance flag, and a stated limit in the README and the skill ("measured on
  pages whose text carries the answer; a page that fails only visually reads as expected or present"); the fit has
  no switch for it yet.
- **Page state's step 1 question** (above) is still open: the cumulative 0.82, per-state rows, or the declared 0.8.

OpenAI arms were not run: the vault OpenAI key returns 401 until the owner refreshes it.
