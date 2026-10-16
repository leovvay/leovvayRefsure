# Decision-layer benchmark harness

The tools that measure refsure's Decision layer arm by arm: which provider route and rendering answers each site
best, at which threshold, how fast, and how safely. This is an evaluation tool, not a test suite, and not part of
the npm package. It imports refsure's own source modules (sites, egress, providers, calibration) at the pinned
commit and never re-implements a site, a rendering or the line format. The protocol it implements (phases, sets,
readings, verdict rules) is kept with the maintainer's private results, not here.

## What never goes in this directory

- No company name, domain, gateway URL, key, key name or spend-tag value. Endpoints, key env NAMES, spend-tag
  headers, recorded response headers and the private terms of the X4 rule come only from the arms file named by
  `REFSURE_BENCH_ARMS`, which lives outside the repo.
- No results, ledgers, guard logs, run state or native captures of private sets: every output path is an argument.
- No test files. Throwaway checks live outside the repo.
- `sh tools/scrub/scrub.sh` scans every tracked and untracked, non-ignored file, so it covers this directory.

## Build and run

```sh
npx tsc --noEmit -p tools/bench                        # typecheck the harness with src
npx esbuild tools/bench/run.ts --bundle --platform=node --format=esm --target=node22 \
  --loader:.md=text --outfile="$OUT/bin/run.mjs"
export REFSURE_BENCH_ARMS=/path/outside/the/repo/arms.json
export REFSURE_REPO="$PWD"                             # lets a bundle outside the repo find it for the A3 check
```

Bundle every entry point the same way: `run`, `p0`, `combos`, `ablation-sets`, `timing`, `spend`, `fixture-server`,
`e2e/run-cli`, `agent/run-agents`, `agent/score`, `analyze/render`, `analyze/checks`. Each prints its usage on `--help`.

Keys enter only through the environment of one command, from a secret store (for example
`secrets run KEY_NAME -- node "$OUT/bin/run.mjs" ...`). Nothing in the harness prints a key; failure details are
scrubbed of anything key-shaped before they reach a ledger.

Every runner first asserts that the code under test (`src build.mjs package.json package-lock.json tsconfig.json
skills`) equals the pinned commit both at HEAD and in the working tree (`assertPinnedSource`), and records both the
pinned commit and the bench commit on every row.

## Phases this directory runs

| phase | command | notes |
|---|---|---|
| P0 dry pass | `run.mjs --phase P4 --arm <all> --set <file> --dry-run --limit 3` | builds and approves every row, prints one JSON line per row (row key, digest, questions digest, wire-body sha256, bytes, threshold and its source); sends nothing and reads no key |
| P0 thresholds | `p0ThresholdAsserts(jevModel)` (lib/thresholds.ts) | locate 0.89 at every risk, find read 0.61, outcome {0.93, 0.15}; an empty list passes |
| P0 thresholds (CLI) | `p0.mjs thresholds` | the same asserts for the arms file's Jev model; exit 1 on a failure |
| P0 ping | `p0.mjs ping --set <ping.jsonl> --freeze <table> --out <results>` | `askRow` on the presence ping item, one row per arm into `<results>/P0/<arm>/`; the one path that reaches `oa_primary`, which `doctor --ping` cannot |
| P0 golden body | `p0.mjs body --set <items> --item <id> --arm <id> --write <site>.<arm>.body.json` | the body `prepare` builds (`provider.body`), beside the `--dry-run` body refsure's CLI printed for the same captured input; sends nothing |
| P4a interim | `run.mjs --phase P4a --arm <arms> --set <frozen file> --freeze <table> --out <results>` | writes P4's files and keys with `slice: interim`, so final P4 skips its terminal keys |
| P4 quality | `run.mjs --phase P4 ...` (same flags) | every arm x set, 6 orders on candidate sites (p0 x 3 repeats, rb1..rb5 x 1), 3 repeats elsewhere |
| P4/P5 resume | add `--resume` | re-asks only failure rows (timeout, transport, HTTP) into `<set>.resume<N>.jsonl` |
| P0 combinator | `combos.mjs golden` | the copy in `lib/combine-copy/` against refsure's `combine/*` at the pinned commit equals `golden/combinator.diff` and differs in import lines only (`--write` records the golden once and refuses when it exists) |
| P0 ablation inputs | `ablation-sets.mjs ping --write <file>`; `ablation-sets.mjs p1-sample --from <P1 set> --freeze <table> --write <file>` | writes the doctor-ping item and the 60-item gold-stratified P1 sample as set files, once, for the freeze table; `run.mjs --variant` also checks the 2.5 asserts (W0 = shipped) |
| P5 ablation | `run.mjs --phase P5 --variant W0\|W1\|W2\|W3\|C1\|K --arm ... --set <presence set> ...` | presence items only; C1 on OpenAI arms only; 3 repeats; the row keeps the shipped wording hash |
| P4/P5 offline combos | `combos.mjs replay --results <dir> --items <set> --out <dir> --freeze <table> [--combos "agree:a,b fallback:a,b"]` | Q2's five shapes by default; production shapes through `createDecide`, the rest `bench_combinator`; no call |
| P5b live combos | `combos.mjs live --results <dir> --items <a,b,..> --site dismiss\|presence\|page-state --out <dir> --freeze <table>` | pools the primary sets; one pass, concurrency 1, real `decide()` with both real providers (keys via the secret store), then both gates; refuses a sample short of `n` or the branch floor unless `--allow-short-branch`; `--dry-run` prints the drawn sample only |
| P5b gates | `combos.mjs gates --live <file> --results <dir> --items <a,b,..> --freeze <table>` | recomputes the replay and separate-rows gates from a live ledger; no call |

`run.mjs` flags: `--phase P4|P4a|P5`, `--arm a[,b,...]`, `--set <items.jsonl>`, `--out <results dir>`,
`--freeze <table>` (required unless `--dry-run`), `--set-id` (default: the file name), `--orders p0,rb1,...`,
`--repeats 3`, `--concurrency 4` (per arm, at most 4), `--rpm 480` (one shared bucket for every gateway arm; each
direct arm has its own), `--resume`, `--limit N`, `--dry-run`, `--manifest <json>` (planned rows and phase plans for
the guards), `--variant shipped|recheck|W0|W1|W2|W3|C1|K` (the last six apply lib/ablate.ts's edit), `--deadline-ms 15000`, `--attempts 3`. Exit 3 = a guard stopped the run, 64 = bad
usage. Items whose gold reads the same as another offered line (X1) are not asked; items holding a private term are
never sent to a `public` arm (X4).

Arms interleave: items run in blocks of 25 per (set, site); within a block every listed arm asks every item, and the
arms start in an order drawn from mulberry32(FNV-1a(`refsure-bench-20261016:<block id>`)).

## Timing (P0 pieces, P3a sample, P6)

`timing.ts` (bundle it like `run.ts`) runs section 4. Every timing row is concurrency 1, 5,000 ms per part, one
attempt, key read from `env`; a failure is an outcome and is never re-asked.

| step | command | notes |
|---|---|---|
| P0 RTT baseline | `timing.mjs rtt --save <results>/P0/rtt.json` | median of 20 plain GETs per `rttUrls` host; no key |
| P0 cache check | `timing.mjs cache-check --arm jev_gw --set <file> --item <id> --freeze <table>` | one body sent twice (2 paid calls); prints recorded headers, cached-token fields and `cache_suspected` (a hit header on c2, more cached tokens on c2 than c1, or c2 `T_wire` under half of c1); exit 3 when suspected, 2 when undecided (a send without an answer), 0 when the cache reads off |
| P0 key spawn | `timing.mjs key-spawn --argv '["cmd","arg"]' --runs 20` | a `command` key source timed alone; the value is dropped |
| P3a sample | `timing.mjs sample --from locate=F1.jsonl,find=F1.jsonl,dismiss=F2.jsonl,dismiss=S3.jsonl,dismiss=V.jsonl,... --freeze <table> --write timing-sample.json` | written once; all 7 sites required (`--allow-partial` for a smoke draw); a source with no item of its site is refused, except `find=<F1>`, which asks F1's locate items with their `intent` (`{intent, lines}`, gold kept; items without an intent counted as `no_intent_excluded`); X4-clean; 100 per site by gold class (`none`/`pick` on candidate sites, the gold value elsewhere), largest remainder, seeded Fisher-Yates per stratum; also the sample's `req_bytes` per arm |
| bytes beside | `timing.mjs bytes --from site=<set>,... --freeze <table>` | `req_bytes` per (site, arm) of any quality set |
| P6 dry pass | `timing.mjs run --sample timing-sample.json --freeze <table> --dry-run [--limit N]` | M1 bodies via `prepare`, M2 through `decide()`'s own dry run; planned rows per lane; sends nothing (M2 readiness needs the gateway key env variable set, any value) |
| P6 | `timing.mjs run --sample ... --freeze <table> --manifest <json> --out <results> --rtt-baseline <results>/P0/rtt.json [--modes M1,M2] [--arms ...]` | start gate (loadavg1 <= 8, RTT within 1.5x of P0, at most 30 min, then rows flagged); RTT again at the end |
| P6 readings | `timing.mjs readings --out <results> --sample timing-sample.json [--modes M1,M2] [--arms ...] --cache-hit <header>[=<regex>] --write <json>` | 4.4 readings and the 4.5 exit check against the planned cells (every arms-file arm, or `--arms`, on every sample site, plus the 12 M2 routes; pass the run's `--modes`/`--arms`); `--cache-hit` names the recorded header a gateway response cache sets on a hit, and a hit is a value matching the regex (default `^(hit|true|1)$`, any case); `family_ok` false rows are excluded (> 1% of a cell: `inconclusive (family)`); an M1 row refused before sending is counted as `refused`, out of the percentiles |

P6 writes `<results>/P6/<arm>/<set>.jsonl` (M1: quality rows plus `mode`, `row_index`) and
`<results>/P6/m2_<combo>/<set>.jsonl` (M2: one `DecisionRow` per Decision: `t_decision`, `t_ask_plan`, `parts[]`
with `t_part`, `t_wire`, usage and headers per part, `egress_lines`, `fixture_sha`), phase events (start gate, repeats,
end RTT) to `<results>/P6/phase.jsonl`, and each repeat's fresh M2 state directory (consent, frozen 2,000-line egress
fixture dated 25 h back) under `<results>/P6/state/`. The manifest needs `pricedPlanUsd.P6`, `planUsd.P6` and
`planned["P6/<arm or m2_combo>/<set>"]` (every lane the run opens is checked before the start gate; a missing one
refuses the run with nothing sent). `planUsd.P6` is the 7.2 plan, $0.95; `pricedPlanUsd.P6` is 3 x that, $2.85, and
the priced phase stop fires above 1.5 x `pricedPlanUsd.P6` = $4.28 (7.3's "$4.3"; writing 4.3 into `pricedPlanUsd`
would put the stop at $6.45). M2 parts store `digest`, `qdigest`, `req_bytes`, `wire_sha`, `family_ok`,
`model_changed` and `usd_priced` (7.4), so live M2 bodies can be checked against M1's. M2 sends every part through the arms file's one gateway key slot and tags it
with the gateway arm of that provider and rendering. `--limit N` keeps the first N items of r1's order in every repeat.

Modules under `timing/` (not `lib/`; only the timing tools use them): `sample.ts` (draw, `bytesBySite`), `gate.ts`
(`measureRtt`, `startGate`, `timeKeySpawn`), `decision.ts` (`M2_ROUTES`, `m2Runtime`, `runDecision`, `dryDecision`,
`DecisionRow`, `egressFixture`), `run.ts` (the P6 loop), `readings.ts` (`readings`, `cellReading`, `loadRows`),
`spent.ts` (priced sums for the 7.3 guards, M2 parts included).

## The arms file

JSON, outside every repo, path in `REFSURE_BENCH_ARMS`. Its sha256 is recorded on every row (`arms_sha`); its
content never is.

```json
{
  "v": 1,
  "gateway": { "url": "https://<gateway host>", "jevPath": "<path>", "jevModel": "<model>",
               "openaiPath": "<path>", "openaiModel": "<vendor>/<model>" },
  "keyInfoPath": "<path that returns the bench key's own spend, or omit>",
  "recordHeaders": ["<response header to keep per attempt>", "..."],
  "rttUrls": { "<host>": "https://<host>/<cheap path>" },
  "privateTerms": ["<substring that keeps an item off public arms>"],
  "arms": [
    { "id": "jev_gw", "provider": "jev", "via": "gateway", "model": "<jevModel>", "rendering": "none",
      "keyEnv": "<ENV_NAME>", "data": "all", "extraHeaders": { "<spend-tag header>": "<value naming the arm>" } },
    { "id": "jev_or", "provider": "jev", "via": "direct", "url": "<refsure's default Jev endpoint>",
      "model": "jev-1.13", "rendering": "none", "keyEnv": "<ENV_NAME>", "data": "public" },
    { "id": "oa_s2", "provider": "openai", "via": "gateway", "model": "<openaiModel>", "rendering": "o_s2", "...": "..." },
    { "id": "oa_primary", "provider": "openai", "via": "gateway", "model": "<openaiModel>", "rendering": "o_primary", "...": "..." }
  ]
}
```

- `gateway` is refsure's own gateway block (`GatewayConfig`); `via: gateway` arms use it, `via: direct` arms use
  refsure's default endpoint, and `url` there is only checked against it.
- `model` must equal what refsure would send; `rendering` is `none` for Jev, `o_primary` or `o_s2` for OpenAI.
- `keyEnv` is an env variable NAME. URLs with credentials (user info or a key-like query parameter) are refused.
- `extraHeaders` are added by the bench's fetch wrapper (headers only, never the body); refsure's own headers
  (`authorization`, `content-type`, `content-length`, `host`) cannot be set.
- `data: public` arms never receive an item whose input holds one of `privateTerms` (case-insensitive).

## Ledger rows

One writer per file (`<file>.lock` holds its pid): `<results>/<phase>/<arm>/<set>.jsonl`, resume runs beside it as
`<set>.resume<N>.jsonl`. Readers take `.jsonl` and `.jsonl.gz` and keep the latest row per `row_key` in file order.
`row_key` = sha256 of `phase \0 set \0 item \0 site \0 arm \0 variant \0 order \0 repeat`. A row is terminal when
its status is `ok`, `refusal`, `invalid`, `refused:<cause>`, or a failure after every outer attempt.

| field | content |
|---|---|
| `row_key`, `run_id`, `phase`, `slice` | key; UTC start + 6 hex; phase (`P4a` writes `P4`); `interim` or `final` |
| `ts_start`, `ts_end` | first send and the parsed response, ISO |
| `set`, `set_sha`, `item`, `base`, `group`, `origin` | set id, frozen sha256, item id, base, `<set>:<group>`, `stored`/`native` |
| `site`, `arm`, `provider`, `route`, `rendering`, `variant` | `route` = `shipped` when refsure offers the provider at the site, else `research` |
| `order`, `salt`, `repeat`, `presented` | `p0`/`rb1`..`rb5`/`fixed`; the salt or null; `r1`..; caller index per presented key |
| `gold`, `alt`, `gold_cut`, `gold_twin`, `risk`, `lang`, `condition`, `masks`, `visual_only` | gold and alt after X2 |
| `status`, `cause`, `http_status`, `detail` | terminal status; abstain cause; last HTTP code; detail (scrubbed, 400 chars) |
| `model`, `family_ok`, `model_changed` | answering model; `familyOf` equals the arm's; `snapshotChanged` |
| `digest`, `qdigest`, `wording_hash`, `req_bytes`, `resp_bytes` | approved-request sha256; questions sha256; shipped wording hash; wire body and response bytes |
| `answer`, `strict_valid` | the answer as the provider's wire validated it; whether `validateAnswers` also accepts it |
| `threshold_r1`, `threshold_source`, `r1` | threshold; `refsure`/`research`; `{verdict, value, index, cause, confidence, threshold}` of the first answered attempt, twin rule included |
| `settle` | the name-level settle replay, when a settle hook ran; else null |
| `correct`, `dangerous`, `danger_eligible` | acted and right; acted in the site's dangerous direction; in the danger pool |
| `usd`, `usd_priced` | provider-reported cost; usage priced at the list prices in lib/guards.ts |
| `attempts[]` | per outer attempt: `status`, `provider_ms`, `t_wire[]`, `t_ask`, `http_status[]`, raw `usage[]`, recorded `headers[]`, `timed_out`, `spent`, `resp_bytes[]` |
| `ms_total`, `deadline_ms`, `flags` | all attempts with sleeps; deadline; `slow_window`, `high_load`, ... |
| `concurrency`, `loadavg`, `host`, `arms_sha`, `refsure_commit`, `bench_commit`, `node` | run context |

Guard lines go to `<results>/<phase>/guards.jsonl`; hourly family and gateway-version lines to
`<results>/<phase>/hourly.jsonl`; a `<results>/STOP` file stops every runner on the same results dir until a human
removes it.

## Library (for the other bench tools)

`lib/arms.ts`
- `readArmsFile(path = $REFSURE_BENCH_ARMS): ArmsFile` validates the file, refuses credentials in any URL, returns its sha256.
- `armById(file, id): Arm`; `holdsPrivateTerm(file, text): boolean` (X4); `refuseCredentialUrl(where, url)`.
- `armConfig(file, arm, stateDir, piiMasks?): RefsureConfig` the refsure config one arm runs under (its key slot only, caps out of reach).
- `armEndpoint(file, arm): Endpoint` the endpoint refsure resolves, checked against the arm's model and URL.

`lib/freeze.ts`
- `readFreezeTable(path): FreezeEntry[]` markdown (`| file | sha256 | ... |`) or JSON; `assertFrozen(table, path): string` the sha or a thrown refusal; `sha256File(path)`.
- `assertPinnedSource(root?, pinned?): {refsure_commit, bench_commit}` the A3 check; `repoRoot(root?)`; `PINNED_REFSURE_COMMIT`, `PINNED_PATHS`.

`lib/items.ts`
- `BenchItem` = refsure's `CalibItem` (exact site input) widened to option-map, plus optional `group`, `template`, `origin`, `settleInputs`.
  Blind-labelled find and option-map sets may keep the site input flat (`intent` + `candidates`; `field` + `want` +
  `options`, gold an index number): `readItems` lifts those fields into `input` and the gold into a string, field for field.
- `readItems(path)`; `buildFor(item, order): Built` (`site.build` with the order, plus the wording hash `decide` uses).
- `CANDIDATE_ORDERS`, `OrderLabel`, `saltOf(order)`, `defaultOrders(item)`, `isCandidateSite(site)`, `CANDIDATE_SITES`.
- `goldChecks(item): GoldChecks` X1 gold twin and X2 gold cut from the `p0` build; `score(site, verdict, gold, alt): Scored` acted / right / dangerous; `dangerEligible(site, gold)`; `groupOf(item, setId)`; `itemText(item)`.

`lib/thresholds.ts`
- `rowThreshold(site, provider, riskLabel, model, wordingHash): {threshold, source}` exactly `thresholdFor` as decide.ts calls it, else the research row.
- `routeOf(site, provider)`: `shipped` or `research`; `riskOf(label)`; `p0ThresholdAsserts(jevModel): string[]`.

`lib/wire-tap.ts`
- `installWireTap()` wraps the global `fetch` once; `tapped({extraHeaders, recordHeaders}, work)` runs `work` and returns its result with one `WireRecord` per HTTP request (`T_wire`, status, raw `usage`, recorded headers, `timed_out`, `spent`).

`lib/ask.ts`
- `armRuntime(file, arm, stateDir?): ArmRuntime` refsure's provider for the arm, with the bench's consent grant written to `stateDir`.
- `prepare(rt, item, order, ablation?): Prepared` build, optional edit, `approve`, the part refsure would ask, digests and the exact wire body (`provider.body`); no network.
- `askRow(rt, item, opts: AskRowOptions): Promise<QualityRow>` one full ledger row: outer attempts on timeout|transport|429|5xx, every attempt timed (`T_wire`, `T_ask`); `opts.beforeAttempt` takes a rate token, `opts.settle` fills `settle`.
- `Ablation` `{variant, edit(request, item), read?(answer, threshold)}`; `scrubDetail(detail)`.

`lib/ledger.ts`
- `QualityRow`, `AttemptRecord`, `R1Read`; `rowKey(parts)`; `isTerminal(row, maxAttempts?)`; `isFailure(row)`.
- `ledgerPath(results, phase, arm, set, resume?)`; `ledgerFiles(results, phase, arm, set)`; `readRows(path)` (`.gz` too); `latestByKey(files)`; `doneKeys(files, {resume})`; `nextResume(...)`; `openLedger(path): LedgerWriter`.

`lib/guards.ts`
- `RateBucket(results, name, rpm)` shared across processes: `take()`, `halve()`, `pause(ms)`.
- `RunnerGuards(opts)`: `admit()` before a row, `attemptGate()` before each attempt, `observe(row)` after (429, latency, auth, spend and count rules), `flags()`.
- `priceUsage(provider, usages)`; `readKeySpend(gatewayUrl, path, keyEnv)`; `guardLine(...)`; `stopAll(...)`; `stopReason(results)`; price constants `PRICE_PER_INPUT_TOKEN`, `GUARD_USD_PER_CALL`, `PLAN_USD_PER_CALL`.

`lib/stats.ts`
- `BENCH_SEED`, `fnv1a`, `mulberry32`, `seeded(seed)`, `shuffleInPlace(items, random)`, `foldOf(group, k?, prefix?)`.
- `binomCdf`, `clopperPearson(x, n, alpha?)` (one-sided bounds), `anovaIcc(groups)`, `pickRho(cell, pool?)`, `kish(n, x, groups, rho)`, `precisionVerdict(acted, wrong, groups, rho, pStar, floor)`; floors `E99`, `E95`, `D299`.
- `nearestRank(values, q)`, `orderStatisticCi(n, q?, conf?)`, `groupBootstrap(rows, groupOf, stat, opts?)`, `bootstrapDraws(rows, groupOf, stat, opts?)` (the sorted draws; added for the analysis, `groupBootstrap` now reads them, same draws), `drawAt(sorted, q)`.
- `mcnemarExact(b, c)`, `signTest(pos, neg)`, `wilcoxonSignedRank(diffs, exactMax?)`, `hodgesLehmann(diffs, conf?)`, `holm(pvalues)`, `normalCdf(z)`.

`lib/combinator.ts` (2.4) with `lib/combine-copy/{agree,fallback,ask-one,rank}.ts`
- The copies are refsure's `src/providers/combine/*` at the pinned commit with only their import paths rewritten; `golden/combinator.diff` is their line diff, committed.
- `combinatorDiff(root?)`, `combinatorAsserts(root?): string[]` (P0; empty passes), `writeGoldenDiff(root?)`, `COPIED`, `GOLDEN_DIFF`.
- `parseShape('agree:a,b' | 'fallback:a,b'): ComboShape`, `Q2_SHAPES`, `isProductionShape(file, shape, site)` (the site ships the kind, Jev first, OpenAI at `o_primary`, one config).
- `replayAnswer(row, question)` the stored row's first answered attempt as a `ProviderAnswer`; `replayProvider(id, model, host, slot, log)` answers from `slot`, logs each request digest, sends nothing.
- `combineParts(kind, parts)` the copied `askAgree`/`askFallback` (research cells, `bench_combinator`).
- `comboConfig(file, arms, stateDir, masks)`, `grantAll(config, env)`; `ProductionDecider(file, arms, real?)` refsure's `createDecide` on `combo: 'auto'`, replay providers unless `real` builds live ones; `.decide(item, order, answers?)` -> `{verdict, route, asked}`.
- `inputFor(item, order)` the site input with the 2.3 order.

`lib/settle.ts` (2.7)
- `settleReplay(item, site, act): Settled | 'inconclusive (no settle inputs)'`: dismiss `vetoOf`/`closesOrRejects` (a vetoed pick is no act, a proposal stays acted), locate/find `classifyNames` and the re-read at the row of max(item risk or write, name class); other sites unchanged. Inputs: `item.settleInputs.names[callerIndex]` (and `roles`).
- `settleRow(item, row, armModel)`, `settleHook(armModel)` (what `run.ts` passes to `askRow`); `SETTLE_LABEL`, `NO_SETTLE_INPUTS`.

`lib/ablate.ts` (2.5)
- `ABLATION_TEXTS` (exact W0-W3), `ABLATION_VARIANTS`, `ABLATION_CELLS` (17), `ABLATION_REPEATS`, `DOCTOR_PING_ITEM`.
- `ablationFor(variant, provider): Ablation` (C1 refused on Jev; presence items only); `variantQuestion(variant)`; `kScore(answer)` and the K read through refsure's `readNoul`.
- `ablationAsserts(): string[]` (W0 equals the shipped instruction); `ablationHalf(group)` dev/held; `goldStratifiedSample(items, n?, seed?)` the P1 sample (proportional by gold).

Core extensions made for these: `lib/ask.ts` exports `r1Of(verdict)`; `run.ts` wires `--variant` to `ablationFor` and passes `settleHook` to every row.

## Combo ledgers

- Offline: `<out>/<phase>/combos/<kind>-<armA>-<armB>/<set>.jsonl`, one row per (item, order, repeat) with both stored parts: `combo_key`, `combo`, `kind`, `label` (`createDecide` or `bench_combinator`), `shape_class`, `parts[]` (arm, row key, `asked`, status, model, `family_ok`, digest, the part's R1 read), `verdict` (R1 read), `correct`, `dangerous`, `settle`, `ms_offline_approx` (agree = max, fallback = sum when B was asked; an approximation, never verdict time), `usd`/`usd_priced` (parts asked), commits. A pair is dropped and counted (`dropped`: `missing_part`, `x4`, `digest`, `route`, `family`) and never read. A rebuild refuses an existing file.
- Live (P5b): `<out>/P5b/live/<set>.<site>.jsonl`, one row per item: the recorded `ProviderAnswer` and wire records of every part asked, the live verdict, `replay` (offline over the recorded parts; equal on cause, index, value, confidence and threshold), `separate` (offline over the P4 unit rows; equal on the verdict: answer value or abstain cause) and its `explanation` (the parts whose read differs). The summary line prints both gates.


## Agent level (P8): `agent/`

Two agent CLIs x two arms (`rs`: refsure skill + `refsure` on PATH; `base`: neither) x the 12 N12 fixtures x 3
repeats, concurrency 1, one fresh Orca tab in the isolated profile, run directory and run id per run. Nothing here
runs before the owner opens the agent-credential gate.

| file | does |
|---|---|
| `agent/prompts.json` | the exact task prompts: common opening (`{PAGE}` = tab id), tasks A/B/C, the uk substitutions, the preflight prompt |
| `agent/shim.mjs` | copied into each run's `bin/` as `orca` (and `refsure` in rs); sends argv and stdin to the broker, replays stdout, stderr, exit |
| `agent/broker.mjs` | outside every sandbox, refsure's key in its env alone; allowlist (exit 126 + one-line reason), the run's tab id, `out/shim.jsonl` |
| `agent/run-agents.ts` | `preflight`, `dry`, `run`, `overhead`; isolation check, start gate, guards, ledger |
| `agent/score.ts` | code-only re-scoring of every run from its files, readings per (agent, arm), paired tests, Q16 statements |
| `agent/{config,fixtures,run-dir,spawn-agent,broker-client,clicklog,transcript,scoring,row,readings,isolation,start-gate,pins}.ts` | the parts those two compose |

```sh
for t in run-agents score; do npx esbuild tools/bench/agent/$t.ts --bundle --platform=node --format=esm \
  --target=node22 --outfile="$OUT/bin/$t.mjs"; done
export REFSURE_BENCH_AGENTS=/path/outside/the/repo/agents.json REFSURE_REPO="$PWD"
node "$OUT/bin/run-agents.mjs" overhead --out "$RES"                                # P0, no model call
<runner for the agent credential> -- node "$OUT/bin/run-agents.mjs" preflight --set tools/bench/sets/n12.jsonl \
  --freeze <table> --out "$RES" --clicks "$RES/P8/clicks.log" [--manifest <json>]
... run-agents.mjs dry ...                                                           # 2 runs per agent
... run-agents.mjs run ... --rtt-baseline <P0 RTT json>                              # 144 runs, resumable
node "$OUT/bin/score.mjs" --rows "$RES/P8/agents.jsonl" --set <n12.jsonl> --freeze <table> --out "$RES/P8/scored" \
  --overhead "$RES/P8/overhead.json"
```

The agent config (`REFSURE_BENCH_AGENTS`, outside every repo, sha256 on every row; frozen like the set and
`prompts.json`, which every runner asserts):

```json
{ "v": 1, "runRoot": "/tmp/<run root>", "fixtureBase": "http://127.0.0.1:<port>", "peekPaths": ["<probe dir>"],
  "orca": { "bin": "<orca>", "worktreeId": "<ORCA_WORKTREE_ID>", "profile": "<isolated profile id>" },
  "refsure": { "dist": "<dist/refsure.mjs>", "xdgConfig": "<cli_both config>", "xdgState": "<cli_both state>",
               "key": { "from": "<env NAME the launcher sets>", "as": "<env NAME refsure reads>" } },
  "broker": { "launcher": ["<secret-store runner>", "run", "<NAME>", "--"] },
  "skills": { "orca-cli": "<P0 copy of SKILL.md>" }, "skillSha": { "orca-cli": "<sha256>" },
  "prices": "<prices.json with codex {input, cached_input, output} USD per M tokens>",
  "claude": { "bin": "<P0 copy>", "version": "<pin>", "model": "<pin>", "effort": "high",
              "credential": { "from": "<NAME in the harness env>", "as": "<NAME the CLI reads>" }, "maxBudgetUsd": 5, "maxTurns": 100 },
  "codex": { "dir": "<P0 copy of the package dir>", "version": "<pin>", "model": "<pin>", "effort": "high", "home": "<bench CODEX_HOME>" } }
```

Allowlist (A4: Orca's key command is `keypress --key <name>`, not 6.5's `press`): `orca snapshot|click|fill|keypress|wait` and `refsure snap|state|locate|dismiss|outcome|mark|wait-for|
pick-option|triage` need `--page` (or `--page=`) equal to the run's tab id; refsure's page-less `act`, `guard`,
`commands`, `causes` and help need none, but a `--page` they carry must still match. Help is only `<tool> --help`
or `<tool> <verb> --help` (`-h`, or `--help` as a flag's value, is not). Orca gets the run's
`--worktree` added when absent and refused when another is named; `--environment`/`--pairing-code` are refused.
refsure runs with the cli_both XDG pair, `REFSURE_PAGE` = the tab and `REFSURE_BACKEND=orca`, and no other
`REFSURE_*` variable of the owner's environment (only the key the broker holds, under the name refsure reads). The
shim never waits on stdin: it takes a regular file, or what is already in a pipe; `overhead` times it with an open
stdin pipe.

Shims stay first on PATH (A4): a macOS login shell runs `path_helper`, which puts `/usr/local/bin` (the real
`orca`) before `R/bin`, so every startup file of `R/home` (`.zprofile`, `.zshrc`, `.bash_profile`, `.bashrc`,
`.profile`) sets PATH back, Codex gets `-c allow_login_shell=false`, the preflight checks that `zsh -l` and `bash -l`
find the shim, and a run whose transcript runs `orca`/`refsure` by another path, or with no line of that tool in
`shim.jsonl`, is void `shim_bypass` and stops the phase (re-run after the fix).

Pins and guards: every subcommand but `overhead` asserts the freeze table for every file under `fixtures/pages/`,
`shim.mjs`, `broker.mjs`, refsure's dist, the copied Claude binary and the copied Codex package (a tree hash:
sha256 over sorted `<path>\0<file sha256>\n` lines, `agent/pins.ts`), and each binary's `--version` against its pin;
the Codex preflight fails when its output names no model. 7.3 in P8: the STOP file; Claude's summed
`total_cost_usd` >= $60; the run count; P8's refsure calls priced at 3x (`refsure_cost.guard_usd`) above 1.5x the
3x-priced plan (`--manifest` `pricedPlanUsd.P8`, else 7.2's P8 row, $0.104); every phase's priced sum (P8 plus the
gateway ledgers of P4-P6, priced through `REFSURE_BENCH_ARMS`) >= $60 stops all runners; a 401/402/403 in the run's
egress-log window or an envelope's `why`, or a 429 whose text says the quota is spent, stops all runners
(refsure's `why` names a 429 only as `HTTP 429` today, so the quota rule cannot fire; the egress log keeps no body). P7 keeps
no per-call ledger, so its calls are not in that sum.

Agent ledger row (`<results>/P8/agents.jsonl`, one per run, latest per `row_key` = sha256 of
`P8 \0 kind \0 set \0 fixture \0 agent \0 arm \0 repeat`): run facts (ids, pins, tab, prompt sha, monotonic
`T_agent_ms`, epoch window, exit, `timeout`, loadavg start/end, flags, paths of transcript, `shim.jsonl`, reply and
stderr, click-log offsets, credential-scan hits, config sha, commits) plus `void`, models/version/skills seen,
`capped`, `budget_stop`, Claude durations and turns, `tokens`, `agent_usd`, `refsure_cost`, `cost_run`, tool use,
`denied_calls`, `peeked` and its commands, and `score` (`wrong_clicks`, `repeated_writes`, `success_reached`,
`false_claim`, `task_pass`, `harm`, `reply_rule_ok`, `wrong_presses`). Scoring notes: `wrong_clicks` counts lines
(button + control + fill), as P7 does; one press logs a button line and a control line, so `wrong_presses` and
writes count max(button lines, control lines); a `DONE:` on A or C without the logged number is a false claim; `refsure_cost` is each egress-log line's own
`usd`, else the per-call planning value (the log keeps no token usage); a click-log harness defect voids the run
and it is re-run under a new id (at most twice); a model or version other than the pin, or a credential value in
any run file, voids the run without a re-run.

## End-to-end CLI level (P7): `fixture-server.ts`, `fixtures/`, `e2e/`

Refsure's built CLI against synthetic pages, one command at a time. Nothing here re-implements a site: every
command is `node <dist>/refsure.mjs <verb> ... --page <P>`.

- `fixtures/pages/` is the only served root: `site2/` (byte-for-byte copies of the pages the E01-E21 scenarios use;
  no page with a token- or card-shaped string), `n12/` (the authored N12 pages, never edited here), `clicklog.js`
  (buttons only, unchanged) and `bench-events.js` (N12: every activation of a button, link, `role=button|link|
  menuitem|checkbox|...` and submit as `{"event":"control","kind":<role>,"name":..}`, every settled field value as
  `{"event":"fill","field":<label>,"value":..,"fieldName":..}` (never per keystroke, password values never), and
  `window.benchEvent(ev)` for the page's own effects). A click into a text field is not logged; its fill is.
- `fixtures/meta/site2.json`: scoring metadata of the site2 pages (`allowed`, `writes`, `maxWrites`, `success`),
  outside the served root. The N12 metadata, steps and expected cells stay in the frozen `sets/n12.jsonl`.
- `e2e/scenarios.json`: the 6.4 table as data (E01-E21 inline, E22-E33 by N12 id); its `about` field documents the
  step conditions, placeholders (`{Tn}` tickets, `{NAME}` snap refs) and matcher keys.

```sh
npx esbuild tools/bench/fixture-server.ts --bundle --platform=node --format=esm --target=node22 --outfile="$OUT/bin/fixture-server.mjs"
npx esbuild tools/bench/e2e/run-cli.ts --bundle --platform=node --format=esm --target=node22 --loader:.md=text --outfile="$OUT/bin/run-cli.mjs"
node "$OUT/bin/fixture-server.mjs" --log "$RESULTS/e2e/clicks.log" [--port 8767]      # leave it running
node "$OUT/bin/run-cli.mjs" setup --cfgs <cfgs.json> --gateway-config <owner config.json> \
  --consent-gateway <owner consent.json> --consent-openrouter <owner consent.json>    # the 8 XDG pairs of 6.3
node "$OUT/bin/run-cli.mjs" preflight --cfgs <cfgs.json> --dist dist/refsure.mjs --log "$RESULTS/e2e/clicks.log" \
  --backend agent-browser --ab-profiles <dir>                                         # 6.4 --dry-run parse check
node "$OUT/bin/run-cli.mjs" injection --cfgs <cfgs.json> --out "$RESULTS"             # 20 x `<keyWrap> true`
node "$OUT/bin/run-cli.mjs" run --cfgs <cfgs.json> --dist dist/refsure.mjs --out "$RESULTS" \
  --log "$RESULTS/e2e/clicks.log" --freeze <table> --rtt-baseline <P0 rtt json> \
  --profile <isolated Orca profile id> --ab-profiles <dir>                            # P7, 792 runs
node "$OUT/bin/run-cli.mjs" summary --out "$RESULTS"                                 # 6.4 readings -> e2e/summary.json
```

- Fixture server: static GET/HEAD, `/status/500`, `/status/429`, `POST /log` (each line written synchronously as
  `<ISO ts> {"run":"<id>",...}`), `POST /__run` (body = run id, empty clears; answers `{run, offset}`). `/__run`
  needs the token the server writes to `<log>.ctl` (0600) in `x-bench-control` and refuses anything a browser marks.
- The cfgs file (outside both repos): `{"v":1, "root": <dir of xdg-<cfg>[-ab]>, "fixtureOrigin": "http://127.0.0.1:8767",
  "cfgs": {<cfg>: {"keyWrap": [<secret store argv up to -->], "keyExport": {"REFSURE_<X>_KEY": <name the wrapper sets>}}}}`.
  A command's env drops every inherited `REFSURE_*`, `AGENT_BROWSER_*` and wrapper-set name, then sets the cfg's XDG
  pair and `REFSURE_BACKEND`. agent-browser runs use the `-ab` copies (`requireIsolatedProfile: false`) and open
  their session on a fresh, empty `--profile <ab-profiles>/rb-<run>` directory, which the ledger names.
- A run: set the run id (offset before), open the tab (Orca: the isolated profile must be echoed by `tab profile
  show`, else the phase aborts, exit 2) or session, run the steps, wait 500 ms, clear the run id (offset after),
  close the page, grade. Lines of another run in the slice, lines logged after the run cleared its id, or a snap ref
  matching zero or two lines void the run; it is re-run under a new id (at most twice). The start gate (4.3) runs
  once before the phase; every run also records loadavg1 at start and end and `high_load` above 12.
- Grading (`e2e/grade.ts`): per step a `fail` matcher wins, then `pass`, then `safe`; any other envelope is `safe`
  when refsure did not act (exit 10-12) and `fail` otherwise; no envelope, exit 1 or a signal is a crash. Then the
  log: a wrong click, a repeated write or more lines than the cell expects is `fail`, fewer is at most `safe`; a
  missing success event caps the run at `safe`, or `fail` when a step claimed `landed`/`present`.
- Ledger: `<results>/e2e/cli/runs.jsonl` (a rerun writes `runs.resume<N>.jsonl` and skips scored run keys).
  `kind: command` rows: run id, scenario, cfg, backend, repeat, step, argv (no env), exit, signal, the whole
  envelope, `t_cli` (spawn to exit, wrapper included), `t_ask_plan` (`decision.ms`), `t_part`, stderr (scrubbed),
  the click-log slice and offsets, loadavg, page, flags, commits, dist sha256. `kind: run` rows: the same context
  plus `status` (`scored`/`void`), `outcome`, `expected_cell`, `reasons`, `false_claim`, `step_grades` and the 6.1 `measures`
  (`wrong_clicks` = lines, `wrong_presses`, `repeated_writes`, `success_reached`, line checks).
  `injection.jsonl` holds the key-wrapper timings.
- Guards (7.3): the run stops (exit 3) at `<results>/STOP`, a 401/403 in any command's `why.detail` writes that
  file for every runner, and the start gate, skip and stop go to `<results>/P7/guards.jsonl`. Any failure to open an
  Orca page aborts the phase (exit 2). agent-browser `open`/`close` pass an empty `--config` and no `*_proxy` env (as
  refsure's own runner does), and each run's profile directory is deleted after its close.
- Summary: per `<cfg>.<backend>`, pass/safe/fail per scenario (k of the repeats), wrong clicks, repeated writes,
  false claims and p50/p95 `T_cli` per verb (nearest rank), from scored runs and their own command rows only; plus
  the key-injection p50/p95 per cfg.

## Analysis (P9): `analyze/` and `spend.ts`

Reads committed ledgers only; needs no key and sends nothing (`--pii-egress` builds bodies offline through `lib/ask.ts`
`prepare`, which reads the arms file but no key). Bundle each entry like `run.ts` and run it with Node.

| step | command | writes |
|---|---|---|
| key windows (7.3) | `secrets run <KEY_NAME> -- node spend.mjs snapshot --results <dir> --phase P4 --at before` (and `--at after`) | `<results>/key-spend.jsonl`; reads the bench key's own spend (free, read-only) |
| spend cross-check (7.3) | `node spend.mjs crosscheck --results <dir> --out <analysis>/spend-crosscheck.json [--gateway-spend <rows.json>] [--p0-window <json>]` | per phase and arm: calls, priced sums, reported `usage.cost`; tag split, key windows, OpenRouter, Claude; `explain[]` lists every gap above 2% or unchecked part |
| readings (5, 4.4, 9.1) | `node render.mjs --results <dir> --out <analysis> --plan <plan.json> [--agent-readings <json>] [--pii-egress] [--resamples 2000]` | `tables.md`, `summary.json` (with the options, so checks can rerun it) |
| interim (7.1, P4a) | add `--interim` | `<analysis>/interim/`, P4 rows with `slice: interim` only, titles marked interim |
| checks (9.2) | `node checks.mjs --analysis <analysis> --freeze <table> --manifest <json> --golden <dir>` | `checks.json`; exit 1 on any failure, including any missing input (T15) |

Plan file (outside the repo when it names private set files):
`{"sets": {"N1": "<frozen file>", ...}, "aliases": {"<ledger set id>": "F1", ...}, "metaFill": {"S4": {"from": "<file>", "fields": ["mask_changes_gold"]}}, "directArms": ["jev_or"], "ownerScopeRuled": false}`.
Ledger set ids are upper-cased unless aliased (`n1` -> `N1`, `f1f` -> `F1F`, `p3-locate` -> `P3`); `sets` keys go
through the same mapping, so a set split over several files (P3) lists each file under its own ledger id. Set files
give item metadata the rows do not carry: `injected`, `attack` and `twin` (Q10: an item is injected when
`injected: true`, or when it carries `attack` and no `injected` field, as P3 does; N9 clean twins carry
`injected: false`; a twin id is looked up in every set of the cell, so P3 twins resolve to F1/F2 items),
`mask_changes_gold`, `mask_class`, `pii` (Q11), `kind` or `condition` with `abstract`/`concrete` (Q7), and
`adjudicated: true` (T3; an item without the field was not adjudicated; only an item with no metadata at all is a
missing input). `metaFill` fills fields a frozen file lacks from another file (a path, or `{from, fields}` to fill
only those fields), matched by the frozen item's `base`: S4's native capture drops `mask_changes_gold`, so fill it from
`tools/calibrate/sets/pii_masks.jsonl`. Do not fill S4's `pii` from there: it lists mask classes (`email`, `token`),
not masked source strings, so the egress byte check (`--pii-egress`) reads N10 only and prints S4's masks-on items as
not checked.

Inputs read: P4 (`shipped`, `recheck`, `slice`), P5 (variants `W0`..`K`, `C1`, `drift` rows carrying `prior.p_true`, and
`*_desc` arms whose rows carry `prior.correct` for Q6 drift), P6 (M1 quality rows by arm; M2 rows `m2_<combo>`),
`<results>/P4/combos/<shape>/<set>.jsonl` (combos.ts; production shapes read as `agree`/`fallback`, research as
`bench:<shape>`), `<results>/P5b/live/*.jsonl` (both 2.4 gates recomputed from `replay_equal`, `separate_equal`,
`explained`), the P7 CLI ledger `<results>/e2e/cli/runs*.jsonl` (section 7, read per cfg x backend and scenario),
agent/score.ts's `agent-readings.json` (section 8, copied; `--agent-readings`, else `<analysis>/agent-readings.json`,
else `<results>/P8/agent-readings.json`), `<results>/P6/phase.jsonl` (the 4.5 end-RTT `slow_gateway` note on Q13), guard
lines. Combo rows take `visual_only`, `origin`, `lang`, `condition` and `masks` from the single-arm unit row of the same
item (P4, any slice); a combo row without one is listed as a missing input.

Groups: every fold (5.3), dev half (2.5) and bootstrap resample uses the ledger's `group` field exactly as stored
(`<ledger set id>:<group>`, for example `n1:<base>`, as run.ts and combos.ts write it), never a re-namespaced form,
so a 9.3 recomputation hashes `refsure-bench-20261016:` + that string.

Golden bodies (`checks --golden <dir>`, 9.2, T14): the P0 operator saves one pair per (site, arm) into that dir:
`<site>.<arm>.dry-run.json`, the request body refsure's own CLI prints under `--dry-run`, and `<site>.<arm>.body.json`,
the body `lib/ask.ts` `prepare` builds for the same item (`p0.mjs body` writes it; `run.mjs --dry-run` prints its
sha256). The check fails until every pair exists and is byte-equal.

Readings that are approximations, stated in the tables: a re-read below the R1 row cannot see a sent twin the model
leaned to at low confidence (counted acted: stricter); combo R2 refits one shared row over the parts' stored leans
(fallback's first part takes precedence); T6/T3/flag sensitivity is read per candidate's step-1 status; a combo's
dollars are its parts' `usd_priced` (the answered attempt), not strictly attempt 1.

