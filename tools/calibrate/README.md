# Calibration harness

The tools that turn labelled browser Decisions into the thresholds in `src/questions/calibration/calibration.json`
(spec §9, steps 0 and 1). This is an evaluation tool, not a test suite. It is not part of the npm package, and no
dataset is committed: every input path is an argument, and every output belongs outside the repo.

| Tool | Step | Does |
|---|---|---|
| `parity.ts` | 0 | Sends frozen requests, byte for byte, through refsure's Jev provider and compares the answers with the ones stored for the same requests. Pass: ≥90 % of Choice answers pick the same key. |
| `convert-v1.ts` | 1 | Turns a labelled set into refsure site inputs, every element line in line format v1. |
| `run.ts` | 1 | Builds each item through refsure's own site, approves it through the egress pipeline and asks Jev, once per salt. |
| `fit.ts` | 1 | Fits each site's rows and, with `--write`, replaces its Jev entry in `calibration.json`. |

## Build and run

```sh
npx tsc --noEmit -p tools/calibrate                     # typecheck the harness with src
for t in parity convert-v1 run fit; do
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
run instead. A rerun of `run` skips the (item, salt) pairs already answered, so a killed run resumes.

```sh
node $OUT/bin/parity.mjs --in parity-items.jsonl --out parity-runs.jsonl
node $OUT/bin/convert-v1.mjs --set browser_locate.jsonl --out conv-locate.jsonl      # also writes conv-locate.jsonl.meta.json
node $OUT/bin/run.mjs --in conv-locate.jsonl --out runs-locate.jsonl --salts s1,s2,s3
node $OUT/bin/fit.mjs --runs runs-locate.jsonl,… --metas conv-locate.jsonl.meta.json,… --write src/questions/calibration/calibration.json
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
- the name is `name=`, else `text=`, `alt=`, `title=`, `placeholder=`, and `value=` only for non-text roles;
- the path keeps the `in=` segments that name a place (`dialog`, `nav` → `navigation`, `main`, `form`, or a
  `[role=…]` of dialog, alertdialog, navigation, main, form or region), outer to inner and unnamed, then
  `heading "H"`; with neither it is `""`. Classes, ids, hrefs, boxes and values never reach a line.

Locate's recorded line and candidates, and dismiss candidates, are converted. Page-state and outcome inputs pass
unchanged; page state keeps the research state set, so its rows measure the wording `state --expect` sends.

## Fit

- Points are the answers a site would act on: a candidate or a state (never `none`), scored by confidence; a Noul
  is scored by its probability against `gold`. Each salt is one point, as each order is a different request.
- `isotonic` (the default) is the method of the author's earlier decision reports: pool-adjacent-violators of
  "right" on score, then the lowest score whose calibrated precision is at least `--target` (0.99) with at least
  `--min-points` (10) points beyond it. `--method cumulative` reads precision over every answer at or above the
  threshold instead; it ships looser rows and is kept for comparison.
- Every row is max(fitted, starting row): calibration never loosens the starting rows. Locate fits a row per risk
  label the set carries; a label with too few points uses the all-points fit, and the rows never decrease along
  the risk order. A Noul's "no" edge only ever tightens (min with the starting edge).
- A site whose fit finds no qualifying score gets no entry and keeps its declared maturity.

## Results, 2026-10-15 (Jev `jev-1.13-20260917` via openrouter.ai)

Parity: 50 frozen requests, every body unchanged by the egress pipeline; Choice 39/40 same key (97.5 %), Noul
10/10 same side; |Δ confidence| mean 0.021 (Choice), 0.001 (Noul), max 0.10. The one change is a page-state item
the stored answers themselves split on, at confidence 0.48.

| Site | Items × orders | Accuracy | Starting row: acted, right | Shipped row | Acted, right (coverage) |
|---|---|---|---|---|---|
| locate | 428 × 3 | 83.3 % | 845, 816 | 0.87 at every risk | 695, 695 (54.1 %) |
| dismiss | 59 × 3 | 83.6 % | 108, 107 | 0.68 | 104, 104 (58.8 %) |
| page-state | 117 × 3 repeats | 94.9 % | 302, 299 | 1.0 | 186, 186 (53.0 %) |
| outcome | 143 × 3 repeats | 95.6 % | 160, 157 | yes ≥ 0.93, no ≤ 0.15 | 147, 147 (34.3 %) |

Page state ships at 1.0 because one bot-check page is read as an error page at 0.94–0.99; `--method cumulative`
would ship 0.81 (302 acted, 299 right, 99.0 %). OpenAI arms were not run: they need a working, approved OpenAI key.
