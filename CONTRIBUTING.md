# Contributing to refsure

refsure has no runtime plugins. Extension is by pull request, and composition is by calling `refsure` from a script.
This guide has three recipes (add a Decision site, add a verb, add a language) and the rules every change follows.

## Ground rules

- **No test suites and no test files.** Changes are proven live, against local fixtures, in an isolated Orca browser
  profile (see [Proving a change](#proving-a-change)). A build is not proof.
- **Zero runtime dependencies.** One esbuild ESM bundle, `dist/refsure.mjs`, on plain Node ≥22. Dev dependencies
  are TypeScript, esbuild and `@types/node` only.
- **Domains by folder.** Each folder under `src/` is a domain, and its `index.ts` is its only import surface. A
  feature imports another feature only through that feature's `index.ts`, and only for an exported helper, never
  for a Decision site.
- **One contract per file.** Every interface or type contract sits in its own file. Files target ≤300 lines.
- **Ownership.** These are enforced by review:
  - only `src/browser/` spawns browser processes: `run-json.ts`, the child-process side both backends share, and
    `agent-browser/ab-runner.ts` for the `--version` and `--help` reads. The one other spawn is a key `command`, in
    `src/config/keys/command-key.ts`;
  - only `src/providers/transport.ts` calls `fetch`;
  - keys come only from the sources in `src/config/keys/`, and only `src/providers/read-key.ts` reads one;
  - only `src/main.ts` calls `process.exit`;
  - only `src/egress/pipeline.ts` constructs an `ApprovedRequest`, the only thing a provider accepts.
- **Never send textbox values.** The snapshot carries them after `: ` on a textbox line. They never enter a line,
  `snap` output or a Decision. Text typed into an editable region (`contenteditable`) shows in the body text
  instead, so body text never leaves with it. Every verb that sends body text reads the regions without a snapshot
  (`readTyped`) and passes the text through `withoutTyped` (`src/features/shared/`), which cuts it, or withholds
  the whole text when the regions could not be read. The snapshot alone is not enough: a `role="textbox"`
  contenteditable prints as a plain textbox, like an `<input>`. `state` runs `pageView`'s own cut on top. A typed
  text of one or two characters cannot be cut without cutting words: when it shows in the text as a word
  (`showsAsWord`), the whole text is withheld.

## Recipe 1: add a Decision site

A site is one fixed question and the rule for reading its answer. Sites live in `src/questions/sites/`, because a
wording and its thresholds are one unit and several verbs reuse the same site.

1. **Write the wording.** Add its constants to `src/questions/sites/wordings.ts`: the instructions, the `none` label
   for a choice, or the `true`/`false` criteria for a yes/no (Noul) question. Caller text never goes into a wording;
   it goes into a state field or a slot such as `{expect}`.
2. **Add the id.** Extend `SiteId` in `src/questions/site-id.ts`.
3. **Implement `DecisionSite<In, Ctx, Out>`** in `src/questions/sites/<site>.ts`:
   - `id`, `kind` (`'choice'` or `'noul'`) and `question`, the key the answer is read back by;
   - `wording: { version: 1, hash }`, from `siteWording(kind, instructions, labels)` in
     `src/questions/wording-hash.ts`, which hashes with `wordingHash` on first read (an import cycle through `egress`
     must not reach the digest early). The hash covers the kind, the instructions and the fixed labels in key order.
     Candidate lines and page text are never hashed;
   - `build(input)`, pure: returns `{ request, context }`. Bound every string with the caps in
     `src/questions/bounds.ts`. A request over 24,000 bytes of state or 12,000 bytes of questions is refused as
     `oversize`. A choice over caller lines plus `none` (`locate`, `find`, `dismiss`, `option-map`) is built by
     `candidateSite` in `src/questions/sites/candidate-site.ts` instead: you give it the lines and it cuts them from the
     end until the questions fit, so such a site never refuses `oversize` for its own options;
   - `read(answer, context, threshold)`, pure: returns a `Verdict`. A choice of `none` is `none_chosen`; below the
     threshold is `low_confidence`, with `leaned`, `confidence` and `threshold` filled in. A Noul site answers only
     on a clear yes. "No" and "unsure" are both abstains, because no verdict may say "failed" or "absent".
4. **Write its `SitePolicy`:**
   - `threshold`: one row per provider that may answer. A provider with no row is not allowed at the site
     (`provider_not_allowed`). A row is a number (choice), a band `{ yesAtLeast, noAtMost }` (Noul), or a record by
     `RiskClass` for risk-scaled sites. Start no looser than the existing rows: choice 0.8, Noul 0.85 / 0.15;
   - `combos`: `'agree'` and/or `'fallback'`, only where two providers make the site safer. `fallback` adds wrong acts
     where an answer leads to a click (`locate`, `dismiss`, `outcome`), so it is never allowed there. Where `agree`
     meets a pick, the twin rule and the guard come before the comparison: a `disagree` carries Jev's pick as
     `leanedValue`, and the verb runs those checks on it first, as `dismiss` does, so a vetoed or high-risk lean
     names its own cause;
   - `solo` (optional): the providers that may answer alone. Without it, every provider with a row may; `dismiss`
     lists only `jev`, so OpenAI answers there only through `agree`;
   - `maturity: 'experimental'`. A new wording always starts experimental. `inherited` is reserved for wordings
     measured earlier, and `measured` is never declared: it only comes from a matching `calibration.json` entry.
   - If the caller's input changes the wording (as `state --state` does), also implement `wordingFor(input)` and
     `maturityFor(input)`, so the custom wording gets its own hash and reads as `experimental`.
5. **Register it** in the `SITES` map in `src/questions/sites/registry.ts` and export it from
   `src/questions/sites/index.ts`. List it in the `needs.sites` of every command that asks it.
6. **Disclose it.** Add a row to the "What leaves your machine" table in `README.md`, and add any new cause to
   `src/output/causes.ts`.
7. **Calibrate it.** Build a labelled set written for refsure (synthetic pages, or pages you may publish). Run it
   through the harness in `tools/calibrate/`, which takes dataset paths as arguments, and fit the lowest threshold
   with precision ≥0.99 on acted items. Add a `src/questions/calibration/calibration.json` entry with its
   provenance: site, set sha256, wording hash, line format, model family, provider, coverage and precision, date.
   Never commit a dataset or stored HTML you may not publish.

**A wording change is a threshold change.** Editing one character changes the hash, so a `measured` site drops back
to its declared maturity until it is measured again. Do not tidy a measured wording.

## Recipe 2: add a verb

A verb is a `CommandSpec` in its own feature folder.

1. **Create the folder** `src/features/<verb>/` with:
   - `<verb>.args.ts`: the parsed `Args` type;
   - `<verb>.contract.ts`: the `Result` type (one contract per file);
   - `<verb>.command.ts`: the `CommandSpec<Args, Result>`;
   - `index.ts`: exports the spec, and any helper another feature may use;
   - any rule only this verb needs (as `dismiss/` holds `overlay-detect.ts` and `dismiss-veto.ts`).
2. **Fill in the `CommandSpec`:**
   - `name`, `summary`, `since` (the release that adds it) and `stability: 'experimental'` for a new verb;
   - `options`: one `OptionSpec` per flag. They feed `util.parseArgs`, `--help` and `commands --json`. `--page`,
     `--dry-run`, `--help` and `--json` are global; do not redeclare them;
   - `forms`: the invocation shapes, without `refsure <verb>`, e.g. `'--ticket T [--action a] [--value v]'`. They
     show in `--help` and `commands --json`, so an agent sees which flags go together;
   - `parse(raw)`: returns `Args`, or a `UsageError` (exit 64) for a missing or malformed flag;
   - `run(args, ctx)`: returns a `CommandOutcome`.
3. **Declare `needs` honestly.** The registry acts on it:
   - `page: 'required'` makes the registry resolve the page (`--page`, then `REFSURE_PAGE`, then the worktree's
     current tab); `'none'` skips it;
   - `capabilities`: browser features the verb needs (`highlight`, `dialog`, `console`, `network`, `count`, `attr`,
     `selector-text`). A backend without them answers `unsupported_by_backend` (21) before `run` is called;
   - `sites`: every Decision site the verb may ask;
   - `acts`: `'never'`, `'own-ref'` (the agent's ref, after a name check), `'ticket'` (a claimed ticket and a
     fingerprint recheck) or `'high-risk'`. The registry asserts that an `acts: 'never'` verb never returns
     `acted: true`.
4. **Register it** in the static `FEATURES` array in `src/features/index.ts`. There is no directory scan; the array
   order is the `--help` and `commands --json` order.

Rules for `run`:

- **Statuses never set exits.** Return `status`, `acted`, `effect`, `result`, `why` and `next`. The registry derives
  the exit code from the status. Never call `process.exit`.
- Reach the browser only through `ctx.browser` and Decisions only through `ctx.decide`. Never spawn a process and
  never call `fetch` from a feature.
- Run every check that can refuse (consent, origin, bounds, the name check, the risk policy) **before** the first
  dispatch. Once `acted` is `true`, the only statuses are `ok` and `effect_unknown`; anything that goes wrong after a
  dispatch is `effect_unknown` with `effect: 'dispatched'`.
- Never forward `type`, `keypress` or `inserttext`: keystrokes go to whatever has focus, which can be a terminal.
- Money, irreversible, auth and consent go only through `act-high-risk`. Ask `refusesHighRisk(risk.class)` from
  `src/risk/` before the first dispatch, as `act`, `outcome`, `dismiss` and `pick-option --open` do.
- Cut page text only after it is cleaned: `cutName` (names, headings, dialogs, alerts) and `boundedText` redact and
  mask a text they cut, with the masks on whatever the config says, because a cut secret or e-mail no longer matches
  its shape. Use `cleanEgressText` before `boundText` for any other cut. `cutShown` skips the cleaning and is only for
  text the agent itself reads and types back (`--within` rows), which never leaves the machine.
- Put page text in `result` only under paths you add to `ctx.trace.untrusted`.
- Honour `ctx.dryRun`: nothing is sent, nothing is clicked and nothing is saved (`mark` saves no mark and returns
  `mark: null`; `forget` clears nothing and returns `would_remove`).
- `result` is a plain JSON object. Keep the envelope about 1 KB in the common case.
- Every verb prints exactly one envelope. The one exception is a verb whose product is a file (`skill print`): it
  returns the file as `text` on an `ok` outcome, and `main.ts` prints that verbatim instead of the envelope.
- A new `why.cause` gets a row in `src/output/causes.ts`, and a new `next.do` value goes in `NEXT_DO`
  (`src/output/next-do-values.ts`); `causes --json` lists both. Either ships only in a minor release, and a cause
  never moves between exit classes.
- The envelope major and the `refsure-skill:` line in `skills/refsure/SKILL.md` move together. `npm run build`
  refuses a skill whose major differs from the binary's, since `doctor` would call the copy it prints stale.

Then update the "Commands" section of `README.md` (the tables and "Options by command") and its causes table from the
built binary's `refsure commands --json`, `refsure causes --json` and `refsure <verb> --help`, never from memory. Add
the verb to `skills/refsure/SKILL.md` if agents should reach for it unprompted, and give a new cause a row in the
skill's troubleshooting table. `npm run build` refuses a table that misses a cause from `CAUSES`, names one it does
not have, or gives one another status or exit than `exitFor`, and a skill over its 150 lines.

## Recipe 3: add a language

Risk classes and the dismiss veto come from lexicons. Every element name is matched against the union of all
lexicons, whatever the page language.

1. **Create `src/risk/lexicons/<lang>.ts`** exporting a `Lexicon`:

   | Field | Holds |
   |---|---|
   | `lang` | the language code, such as `it` |
   | `money` | pay, buy, order, checkout, top up, and similar |
   | `irreversible` | delete, remove, send, publish, revoke, and similar |
   | `auth` | sign in, log in, password, two-factor, authorize, switch account |
   | `consent` | accept, agree, allow cookies, opt in |
   | `dismissClose` | close, reject, no thanks, later, dismiss |
   | `dismissVeto` | the veto list: accept, agree, allow, subscribe, buy, trial, enable, upgrade, manage, settings, preferences, customize |
   | `cancelContext` | words that make "cancel" irreversible: subscription, order, account, booking |
   | `cancelWords` | the plain cancel / no words of a confirm dialog, which never become irreversible |
   | `confirmCue` | dialog wording that marks a confirm dialog: "are you sure", "confirm", "this cannot be undone" |
   | `cancelVerbs` | the part of `cancelWords` that means "cancel" (never a plain "no"): only these turn irreversible next to a `cancelContext` word |

2. Aim for at least eight terms per risk class. Write terms in lower case, with a straight apostrophe (`j'accepte`):
   they are matched against the folded name (NFKC, typographic apostrophes straightened, lower-cased) on Unicode word
   boundaries, and multi-word phrases are fine. Include common inflections, since matching is by whole word.
   `dismissClose` and `cancelWords` are read differently: a control reads calm only when its whole name
   is one of these terms (with filler like "this" or "dialog" beside it), so list the bare words ("close", "no
   thanks"), never a phrase that names an object ("close project" must keep its class). If the language negates an
   accept with a word before the term (`without`, `sans`, `ohne`, `sin`, `bez`, `без`), add it to `NEGATION` in
   `src/features/dismiss/dismiss-reading.ts`.
3. **Register it** in the `LEXICONS` array in `src/risk/lexicons/index.ts`, and name the language in the README's risk
   section.
4. **Check collisions.** A term that is an everyday word in another language raises the risk class on every page.
   Risk only rises, so a too-broad risk term costs refusals, not wrong clicks. A missing veto term can cost a wrong
   click, so err towards a longer `dismissVeto`.
5. **Prove it** with `guard --ref` on a fixture page in that language: a delete button reads `irreversible`, a
   confirm dialog's own cancel button does not, and `dismiss` refuses an accept-style button.

## Proving a change

There are no test suites. A change is proven by running the real command against a real page:

1. Build and typecheck. Install with `--ignore-scripts`, as CI does, so no dependency's install script runs:
   ```sh
   npm ci --ignore-scripts
   npm run typecheck
   npm run build
   ```
2. Write fixtures **outside the repo**, for example in `/tmp/refsure-probe/site/`, and serve them locally:
   ```sh
   python3 -m http.server 8765 --bind 127.0.0.1 -d /tmp/refsure-probe/site
   ```
   Use synthetic content only. A `data:` URL works for one-off pages.
3. In an Orca terminal, open the fixture in an **isolated** browser profile, never your default one (it carries your
   imported cookies):
   ```sh
   orca tab profile create --label refsure-probe --scope isolated --json
   orca tab create --url http://127.0.0.1:8765/<fixture>.html --profile <profile id> --json
   ```
4. Run the bundle against that tab and read both the envelope and the exit code:
   ```sh
   node dist/refsure.mjs <verb> --page <browserPageId> … ; echo "exit $?"
   ```
   A change that touches `src/browser/` is proven on both backends. For the agent-browser backend, outside an Orca
   terminal, open a dedicated headless session with a fresh profile (never `--profile` with a real one), pass its
   name as `--page`, and close it afterwards:
   ```sh
   agent-browser --session refsure-probe open http://127.0.0.1:8765/<fixture>.html
   env -u ORCA_WORKTREE_ID REFSURE_BACKEND=agent-browser node dist/refsure.mjs <verb> --page refsure-probe … ; echo "exit $?"
   agent-browser --session refsure-probe close
   ```
   Cover the refusal paths, not only the happy one: a twin group, a reshuffled page between `locate` and `act`, a
   wrong `--expect-name`, a high-risk control, `--dry-run`. Count clicks on the fixture (a counter on the page) to
   prove that nothing was clicked when the envelope says `acted: false`.
5. Throwaway helper scripts live outside the repo too, and are deleted afterwards.

Describe the scenarios you ran and their envelopes in the pull request. Use `--dry-run` or a localhost mock gateway
(its URL in `REFSURE_GATEWAY_URL` or `gateway.url`, and the config file's `jevPath`/`jevModel` and
`openaiPath`/`openaiModel`) when a scenario does not need a real provider.

## The scrub gate

`tools/scrub/scrub.sh` (`npm run scrub`) blocks a release that contains strings the maintainer has listed as private.
It scans, case-insensitively:

- every path from `git ls-files` (untracked files that are not ignored included), and the content of each file;
- the unpacked `npm pack` tarball;
- every author, committer and commit message in `git log --all`.

The patterns are **never committed**. CI reads them from the repository secret `REFSURE_SCRUB_PATTERNS`, and a
maintainer's machine from `~/.config/refsure-scrub/patterns` (one extended regex per line). An optional allowlist of
literal strings comes from `REFSURE_SCRUB_ALLOW` or `~/.config/refsure-scrub/allow`. A hit prints only
`<source>:<file>:<line>: pattern #<n>`, never the matched text or the pattern.

Without a pattern source the script exits 2 ("no scrub patterns configured"). That is expected on a contributor's
machine. CI runs the gate on every push and on pull requests from this repository's branches (fork pull requests get
no secrets, so the gate runs on the push that merges them), and `prepublishOnly` runs typecheck, build and the gate
before every `npm publish`. That is why the repository has no `.npmrc` with `ignore-scripts=true`: it would skip
`prepublishOnly` too, so installs pass `--ignore-scripts` on the command line instead. If CI reports a hit in your
change, the maintainer will tell you which line to change.

0.1.0 is published by hand. From 0.2, a release is a pushed `v<version>` tag that names `package.json`'s version:
`.github/workflows/release.yml` checks the tag and runs `npm publish --provenance` over OIDC (npm trusted publishing,
no stored token), and `prepublishOnly` runs the gate there with the same secrets. npm refuses a provenance publish
unless `package.json`'s `repository.url` names the GitHub repository the workflow runs in. The owner adds that field
with the GitHub account; until then the workflow stops at its `repository.url` step, before anything is built.

## Style

- TypeScript with `strict`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax`; `moduleResolution: "bundler"`,
  imports without extensions, `import type` for types.
- Two spaces, single quotes, semicolons, kebab-case file names.
- Comments explain why, not what. Provenance comments say "ported from the author's earlier decision code", or
  nothing.
- Commit subjects are scoped and imperative: `feat(locate): …`, `fix(egress): …`, `docs: …`.
- Run `npm run typecheck`, `npm run build` and `npm pack --dry-run` before you open a pull request. The tarball holds
  only `dist/`, `skills/`, `README.md`, `LICENSE`, `SECURITY.md` and `package.json`.
