<p align="center">
  <img src="docs/art/hero.png" width="100%" alt="refsure, drawn as a stage floor: it finds the Search button on a page in a hidden Orca tab, holds the Accept all button, and does the whole step, click included, in 2.6 seconds while your screen stays put">
</p>

<h3 align="center">Browser judgment for coding agents. Fast, and never on your screen.</h3>

<p align="center">
  <a href="LICENSE"><img alt="licence: MIT" src="https://img.shields.io/badge/licence-MIT-1f7a36?style=flat-square&labelColor=0d0d10"></a>
  <img alt="node: 22 or newer" src="https://img.shields.io/badge/node-22%2B-2a5fc4?style=flat-square&labelColor=0d0d10">
  <a href="#calibration-status"><img alt="status: 0.x" src="https://img.shields.io/badge/status-0.x-b8231d?style=flat-square&labelColor=0d0d10"></a>
  <a href="https://github.com/leovvay/leovvayRefsure/actions/workflows/ci.yml"><img alt="ci" src="https://img.shields.io/github/actions/workflow/status/leovvay/leovvayRefsure/ci.yml?branch=master&style=flat-square&label=ci&labelColor=0d0d10&color=1f7a36"></a>
</p>

`refsure` is a command-line tool plus an agent skill. Claude Code, Codex and other agents running in [Orca](https://github.com/stablyai/orca)
terminals, or beside an `agent-browser` session, call it while they work in a browser tab. It answers the questions
agents most often get wrong, or burn tokens on: which control means X, how to get past a banner, what state the page
is in, whether a click landed, whether the page now shows what they wait for.

```sh
git clone https://github.com/leovvay/leovvayRefsure && cd leovvayRefsure
npm ci && npm run build && npm i -g .
refsure doctor
```

<sub>Once the npm release is out, <code>npm i -g @leovvay/refsure</code> does the same.</sub>

One call does a whole step, in the agent's own tab:

```sh
refsure do --page <id> --fill "Search=invoice" --click "Search button" --expect "search results for invoice"
```

- **Fast.** In the author's agent benchmark (12 tasks, 72 runs per arm), agents with refsure needed 3.8x (Opus 5.5)
  and 3.4x (Sonnet 5.5) less total time than with the plain Orca CLI, in 3-4 turns instead of 7-10. Most of that is
  one task where refsure reports a stall in under a minute; per task it is about 2x and 1.4x.
  [Results](tools/bench/agent/RESULTS-fast-path-2026-10-17.md).
- **In the background.** It works in the agent's own Orca tab and paints a hidden page before input: a whole `do`
  step took 2.6 s and the click landed, where Orca alone answers ok and nothing is clicked. Your view never moves.
  [Measured](#the-problem-measured).
- **Small answers.** One JSON envelope of about 1 KB instead of a 50-540 KB accessibility tree.
- **Right, or it holds.** The model only picks among options that code built. `locate` was right 2,056 of 2,056
  times it acted, and below its threshold it answers none instead of guessing. [Calibration](#calibration-status).

You bring your own API key (BYOK). Nothing runs as a service, and there is no account.

> **Status: 0.x.** Three Decision sites are `measured` on Jev: `locate`, `find` and `outcome`. `dismiss`, `page-state`
> and `presence` still run on starting thresholds carried over from the author's earlier decision code,
> `pick-option` is experimental, and no OpenAI answer is measured. See [Calibration status](#calibration-status).

**Contents:** [Why](#why) · [How it works](#how-it-works) · [One call](#run-a-task-in-one-call) ·
[`run`](#hand-over-a-multi-step-task-refsure-run) · [Install](#install) · [Setup](#setup) ·
[What leaves your machine](#what-leaves-your-machine) · [Commands](#commands) · [Envelope](#the-envelope) ·
[Exit codes](#exit-codes) · [Safety and limits](#safety-model-and-honest-limits) ·
[Calibration](#calibration-status) · [Skill](#agent-skill-install) · [Orca hook](#orca-hook-input-in-hidden-tabs) ·
[Contributing](#contributing-and-security)

## Why

- **Fewer tokens.** One JSON envelope of about 1 KB (up to ~1.3 KB when two providers answer) instead of a 50-540 KB
  accessibility tree.
- **Fewer wrong clicks.** The model only picks among candidates that code built from the page. Acting re-derives the
  element from a fresh snapshot by fingerprint, and if the page changed, nothing is clicked.
- **Fewer stuck loops.** Overlays, sign-in walls, rate limits and bot checks are named, and every answer carries a
  structured `next` step.
- **Verified effects.** `outcome` and `wait-for` say when an action landed or when text appeared. They never claim
  "failed" or "absent"; they say what they could not confirm.
- **Guarded risk.** Money, irreversible, sign-in and consent controls never go through the ordinary verbs.

## How it works

<img src="docs/art/how-it-works.png" width="100%" alt="How refsure acts, as five cues: read the page, code builds candidates, a Decision picks or holds, a fresh recheck by fingerprint, then one act on a single-use ticket; when unsure it holds, and when the page changed nothing is clicked">

Every answer is a classify-or-select call to a Decision API:

- **Jev** via OpenRouter, or
- **OpenAI Decisions**.

The model always chooses among options that code built, plus `none`. Answers are validated all-or-nothing, and below
a calibrated confidence threshold refsure abstains instead of guessing. Deciding never acts: acting goes through a
single-use ticket and a fresh recheck of the page, or through your own ref with a name check.

Where code can settle a question (an exact name match, an error page, a dialog in the tree, a literal text match),
no Decision is made and nothing leaves your machine.

The decision layer (wordings, candidate shuffling, answer validation and starting thresholds) is ported from the
author's earlier work.

## Run a task in one call

`refsure do` runs a whole browser task in one process, so an agent spends one turn instead of five to ten:

```text
refsure do --page <id> --fill "Search=invoice" --click "Search button" --expect "search results for invoice"
```

1. It reads the page as the baseline, then runs one `dismiss` level unless `--no-dismiss` (an abstain or a veto
   leaves the banner and goes on).
2. It finds every step's target on one snapshot, in parallel: code first, else one Decision per step, at risk
   `write`. The Decision reads the field's description, never the value after `=`.
3. It acts in command-line order (`--fill`, `--select`, `--check`, `--uncheck`, `--click`, at most 8), each through
   `act`'s ticket path: claim, recheck on a fresh snapshot, guard, one typed act. A step not found up front, or whose
   element moved before anything was sent, is found again once at its turn. Any refusal stops the run; a write is
   never sent twice, and high risk still goes only through `act-high-risk`.
4. With `--expect`, it waits as `wait-for` does, but judges only the text that is new since step 1, with typed and
   filled text cut, so neither text that was on the page before (an injected "999 rows" box) nor the page echoing a
   filled value can fake success. A line the page removes and shows again counts as new. `--text` is the code rule,
   matched on that cut text, so it may not hold a filled value. The wait ends at `present`, at `--timeout` (default
   60s, `not_seen`), or once neither the page text nor the URL changed for `--stall` (default 10s, `stalled`). When
   the Decision was unsure (its answer inside the band: under the `present` edge, above the clear-no edge), that
   window is 2s from that ask while the page stays as it read it, and the detail says so: the text it read is all
   there is, and `result.new_text` shows it. A clear no keeps the whole window, since the page may still be loading.
   The Decision is asked at most once a poll, and no call cap ends the wait sooner.

`result.verdict` is `done`, `seen`, `not_seen`, `stalled` or `stopped`; `result.steps` says what each step found and
did, and `result.new_text` holds up to 8 new lines (untrusted), each cut at 200 characters. When there were more,
`result.new_text_more` says how many (absent otherwise): the lines shown are only the first ones. Once anything
acted, the exit is only 0 or 30, with the reason in `result.unconfirmed`, also when a browser call fails after an act.
`next` is `state` after `not_seen`, and `stop` after `stalled` (or a fresh look when the new text was withheld from
the Decision). After either, read `result.new_text`: if the page asks for one more thing (a confirm field), `do`
only the steps still to do. A stall is the answer, also on a task said to take a while: keep the default and report
it. To wait again for a time the human named, `wait-for --expect "…" --timeout <longer> --stall <longer>` gives the same stall rule to a
plain wait (off by default; it judges the whole page, not only new text). `--stall` must be shorter than `--timeout`. The
stall clock is the page's: a wait that starts within 2 minutes of an earlier one on the same page, with the page as
that one left it, counts from the page's last change, and the detail says so. Only a hash of the URL and text is kept.

## Hand over a multi-step task: `refsure run`

`do` runs steps the agent already knows. When it does not know them up front (a suggestion to pick from a list, a
date picker, a second page), `refsure run` takes the whole sub-task on one site and returns one envelope:

```text
refsure run --page <id> --goal "Search one-way flights from Warsaw to Brussels on 20 November 2026 for 1 adult in economy and stop at the results." \
  --fill "origin=Warsaw" --fill "destination=Brussels" --fill "date=20 November 2026" --expect "a list of flight results with prices"
```

Each step is one look, one Jev Decision and at most one act:

1. **Look.** One snapshot and the tab, read together. The element table is the page's candidates, numbered in page
   order, each with its value or state; a long list of look-alikes (a calendar's days, a list of results) keeps the
   rows that name the most of the goal, and the table is cut to the questions bound, dialogs first. An element the
   page made clickable with no role, name or control in or around it (a calendar day) is a row named by its text and
   the caption above it (`generic "20 listopada 2026"`). The page text comes off the same snapshot, with nothing
   typed in it; the new text is its lines the page did not show when the run began (after the blocker level).
2. **One Decision, site `step`** (Jev only, experimental). One request asks the operation (`CLICK`, `TYPE`,
   `SELECT`, `PRESS_ENTER` after a `TYPE` until another act or another URL, `SCROLL_DOWN`, `WAIT`, `DONE`,
   `BLOCKED`, as the page allows), a target for each operation that takes one (the element table; field × `--fill`
   value pairs; select × option pairs), and with `--expect` a done Noul over the new text. Progress over certainty,
   as jev-ultrafast acts:
   - The step is the most likely operation other than `DONE` and `BLOCKED`, which end the run only at 0.5.
   - Its target is the most likely row of that operation's own head, when it has at least 0.3 and more than
     `none` (`PRESS_ENTER`, whose field code picks, needs 0.3 itself). A row already in the state asked of it (a
     selected date or tab or a checked radio the goal names, a field holding its `--fill` value, the option a
     select shows; never a toggle, nor a highlighted suggestion) gives way to the runner-up when that one passes too
     and acts on another control: never to another option of the same select, list, calendar or radio group. Two
     rows that read the same as sent are twins and stop.
   - CLICK and TYPE leading on one field read as TYPE (typing focuses the field as the click would). When the
     leading head finds no target it is sure of (a click aimed at a field that waits for a value, which CLICK does
     not offer then), the next operation with a target head of its own stands in, if it holds at least 0.05; a twin
     pick or a missing answer stops as it is.
   - `low_confidence` is left only when nothing passes. The safety line is the guard (step 4), not the probability:
     a wrong low-risk act costs a step, and the stop rules end a loop.
3. **End checks.** `--text` in the new text ends it `seen` by code; the done Noul at 0.85 ends it `seen` whatever
   operation leads; `DONE` at 0.5 without that is `done_unconfirmed`; `BLOCKED` at 0.5 is `blocked`.
4. **Guard, as `act` guards a ticket.** Right before the act: a fresh snapshot on the same URL and tab, the element
   found again by its fingerprint (role, name, path, ordinal in an unchanged twin group; a twin still in the row the
   table told it apart by), else nothing is sent and the step is looked at again; the never-click veto on what a
   click presses (accept, subscribe, enable…), refused; the risk read on the fresh tree (lexicon, confirm dialog,
   URL, page raisers for a click, field raisers for a fill or select, Enter as a click on the field and its form's
   buttons), at least write, and money, irreversible, auth or consent refused with `act-high-risk` in `next`
   whatever the probability; the pick held to its row (0.3). Then one act on the fresh ref. A sent act is never sent
   again by this code, and an act that may not have landed stops the run (exit 30). A click agent-browser finds
   covered by another element sends nothing (step verdict `covered`), and the run looks again. A pick on the
   never-click list inside a pop-up that showed after the start (an Accept) is not sent either (`vetoed`): one
   dismiss level runs on that pop-up, as `dismiss` would, at most 2 per run, listed in `result.blockers`; when it
   does not close the pop-up, the run stops on the veto; when its pick had gone or moved by its click, nothing is
   sent and the step is `stale` (once per pop-up). On Orca a click goes through Orca's own mouse (press and release
   at the element's centre, no move: 7-11 ms, where a move waits up to a second for a frame) once a read-only hit
   check finds the element with that very box at that point (or its own label there), in view, with nothing else
   drawn over it (a control, a plain element, one with the same box), carrying the name the guard read; any doubt,
   an element in a frame, and a second try of the same act, use agent-browser's click. Before any act, a tab that has drawn
   no frame for 2 s has its page painted if it never was (see [Backends](#backends)), and the act goes on; refsure
   never shows or focuses a tab. `PRESS_ENTER` is offered only
   where what Enter does can be read (a field in a form the page names, a search or suggestion box), and the field
   is focused before the key. On Orca, a `TYPE` on a page where the count taken while the Decision was asked found
   no editable region and no input that takes no typed text (a date, time, range, colour or file input), into a
   field in no frame that the tree does not mark editable, goes as agent-browser's own fill in one call, which
   replaces the field's text with the input events typing fires; elsewhere Orca's `fill`. Either way the field is
   focused on its own 50 ms before the text goes in, so a typeahead whose focus opens its list and clears the field
   keeps the value; a field gone after its focus wrote no text, and the step counts as a try. A field that then shows
   its old text with the value added (an editor in a shadow root, which the count cannot see) stops the run
   (exit 30).
5. **Settle and look.** On Orca, until the page has drawn a frame and no finite animation runs (up to 1.2 s; one
   read-only `eval` that reads a frame and an animation count, never page text; after two waits in a row hit the
   cap, animations that never stop or a tab drawing about once a second, each wait is for one frame; after a `TYPE`
   into a combobox, a frame only; once a wait of 1 s or more saw no frame, as in a hidden tab, which draws none even
   once painted, each wait is for one frame, up to 50 ms, until a frame shows); elsewhere 50 ms. Then the next look, taken again while it
   shows the page as it was (up to 600 ms); after an act that opens or closes something (a click on an option, a
   menu item, a combobox or in a dialog, Enter, or any act after which a dialog or a tooltip came or went), one more
   look. A look a navigating page refuses is taken again for up to a second. After a `TYPE` into a combobox the look
   is taken again while its options are those shown before (up to 700 ms), and before 250 ms while none of them
   names the typed value. `WAIT` looks until the page changes, up to 800 ms. The `recent` line of a `TYPE` says
   whether suggestions showed (options, or new buttons or links that hold the value) and whether the page emptied
   the field. An unsure
   Decision is asked again as soon as the page shows something else, looked at four times a second for up to a
   second (twice at most per step), and not at all when it does not.
6. **Stop rules.** `--max-steps` (25) or `--timeout` (90s) end it `budget` (the `--text` rule still reads the last
   look); three acts or scrolls in a row that change nothing, or the same act on the same element on one page a
   third time, end it `no_progress`.

`run` types only `--fill` values; Jev picks which value goes into which field, and a value a field already shows is
offered no `TYPE`. The values reach the provider (see [What leaves your machine](#what-leaves-your-machine)), so
never put a secret in `--goal` or `--fill`. `result.verdict` is `seen`, `done_unconfirmed`, `blocked`,
`no_progress`, `budget`, `refused`, `low_confidence`, `decision_unavailable` or `stopped` (the browser failed, or an
act may not have landed). `result.steps` lists each step (`n`, `op`, `element` as a v1 line, `value` as the
`--fill` key and never the value, `p`, `risk`, `page_changed`, `ms`, and `verdict` when a step did not run as
picked: `stale`, `covered`, `vetoed`, `unknown`, `stopped`); `blockers` lists the dismiss levels after the start, when
any ran; `new_text` (up to 8 new lines, with `new_text_more`, how many more there were, when there were), `url`,
`elapsed_ms` and `decisions` follow. `seen` is exit 0; anything else after an act is `effect_unknown` (exit 30) with the cause in
`result.unconfirmed`; with nothing acted it is the cause's own exit. When a run ends short of `seen`, other than
`decision_unavailable` (an unanswered Decision, or `proposed_only`: no model's read of the table was used), and the
table its last step Decision read was cut, `why.detail` ends with one clause saying so, such as `; the step's table
cut 24 look-alike rows (refsure snap lists them)`, or `… 241 rows to fit the request …`, or `… 24 look-alike rows and
256 more to fit the request …`: a control you expected may be among them. Only the envelope says it; the Decision
request is the same either way. `steps`, `dismissed`, `blockers`, `new_text`, `url` and `why.detail` are untrusted. One
Decision per step adds up: a step `decisionsPerMinute` (30 by default) refuses waits until the cap has room again,
within `--timeout`.

Write the goal as a person would ask it, and give every value the task names as a `--fill`, dates included (many
date pickers take a typed date, confirmed with Enter). For a field that suggests as you type, the value is one word
of the site's own name or a code (`Charleroi`, `WAW`), never two words the site joins with a hyphen (`Bruksela
Charleroi` matches nothing in `Bruksela-Charleroi`). `REFSURE_RUN_TIMING=1` writes one line per step to stderr:
the time by phase (decide, paint, recheck, raisers, act, settle, look, blocker), each page call, the provider's ms
and how each click went (`native` or `fallback:<why>`), with no page text. The first line also has `warm`: when the
connection to the provider was opened (`at`, ms into the run), when TLS was up (`tls`) and when the first Decision
took it (`taken`), both ms after that, and how long the Decision waited for TLS (`waited`). Known limits,
as jev-ultrafast's: frames, canvas, uploads, new tabs and keyboard-only widgets; a hidden Orca tab draws no animation
frame, so a menu or dialog that waits for one can get stuck; a date the picker has not rendered yet takes its Next
button, step by step.

The next-step rules of the `step` wording follow those of
[browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) (MIT), reworded in refsure's style; the
loop, the element table and the guard are refsure's own.

## Install

Requires Node 22 or newer.

```sh
npm i -g @leovvay/refsure
refsure doctor
```

Install it globally. Agents call refsure many times per task, and `npx` adds package resolution time to every call.

It runs on macOS and on Windows (checked on Windows 11 with Orca 1.4.224 and agent-browser). On Windows, keep the key
in a user environment variable and restart Orca once so its terminals see it, then run `refsure setup` in a terminal
(it reads the console there):

```powershell
$key = Read-Host 'OpenRouter key' -AsSecureString
[Environment]::SetEnvironmentVariable('REFSURE_OPENROUTER_KEY', [Net.NetworkCredential]::new('', $key).Password, 'User')
```

The painting of hidden Orca tabs is measured on macOS only, and the [Orca hook](#orca-hook-input-in-hidden-tabs) is
macOS only.

### Backends

refsure drives one of two browser backends. `refsure doctor` names the one it chose, and why.

| Backend | Chosen when | The page (`--page`) |
|---|---|---|
| Orca's embedded browser, through the typed verbs of the `orca` CLI | by default in an Orca terminal (`ORCA_WORKTREE_ID`), or `REFSURE_BACKEND=orca` | a browser page id, the agent's own tab; else `REFSURE_PAGE`, else this worktree's current tab |
| A standalone `agent-browser` session | `REFSURE_BACKEND=agent-browser`, or by default outside an Orca terminal when an `agent-browser` binary is found | a session name; else `REFSURE_PAGE`, else `bg-<first 8 characters of $ORCA_TERMINAL_HANDLE without term_>` in an Orca terminal, else the session `default` |

In an Orca terminal the agent works in its own tab of Orca's browser. It opens one with `orca tab create`, which
does not switch to it, and passes the `browserPageId` it gets as `--page`:

```sh
orca tab create --worktree "id:$ORCA_WORKTREE_ID" --url https://example.com --json
refsure state --page <browserPageId> --expect "the example home page"
```

Without `--page` or `REFSURE_PAGE`, refsure drives the worktree's current tab, which can be the one the human is
looking at. refsure never shows, focuses or switches to a tab, so the agent's tab usually stays hidden. The skill
tells the agent to leave its tab open when done, so the human can open it from the worktree's tab strip. A page loaded
in a hidden tab never paints, and then Orca answers `ok` to a click or a key that never reaches the page, or holds a
check for about 5.5 s (Orca 1.4.230). So before the inputs such a page would drop or hold (a click, double click,
check, uncheck, Enter, and a fill that goes as agent-browser's own), refsure asks the page how many paint entries it has
(one read-only `eval` of `performance.getEntriesByType('paint').length` and the document's time origin). When the
answer is 0, it paints the page once with a quality-1 JPEG screenshot through Orca, which paints the page for the
capture without showing the tab. The file goes to a new temporary folder that is deleted at once; refsure never reads
it and never sends it. Each call has a 5 s limit, and a probe or capture that fails leaves the page as it was. The
[Orca hook](#orca-hook-input-in-hidden-tabs) does the same for the agent's own `orca` commands. Set
`REFSURE_BACKEND=agent-browser` to drive an agent-browser session instead.

- **Orca:** refsure looks for the binary in `$ORCA_CLI_BIN_DIR/orca`, then `orca` on `PATH`, then
  `/Applications/Orca.app/Contents/Resources/bin/orca` (an executable file; a directory of that name does not
  count). On Windows the name is `orca.exe`, and the app's copy is
  `%LOCALAPPDATA%\Programs\orca\resources\bin\orca.exe`. Page commands outside an Orca terminal answer
  `not_in_orca_terminal` (exit 24); the worktree guard has no fallback.
- **Orca transport:** each call goes over Orca's runtime socket, the one the `orca` CLI itself uses (found through
  `orca-runtime.json` in `$ORCA_USER_DATA_PATH`, else Orca's default user-data folder), as the same method and
  params the CLI would send. That saves a process per call (a snapshot takes about 0.17 s instead of 0.4 s). refsure
  spawns the CLI instead when the metadata is missing, holds no runtime token, or names no unix socket (or Windows
  named pipe), when the socket refuses the connection, when `ORCA_PAIRING_CODE`, `ORCA_REMOTE_PAIRING`,
  `ORCA_ENVIRONMENT` or `ORCA_SSH_BRIDGE_CREDENTIAL` sends the CLI elsewhere, for a call the map does not cover
  (`status`, or a worktree the CLI resolves from its own folder), and always with `REFSURE_ORCA_TRANSPORT=cli`. The
  runtime token goes only to that socket.
  `refsure doctor` names the transport in its `orca_transport` check.
- **agent-browser:** refsure uses `agent-browser` on `PATH` first, then the copy Orca bundles
  (`/Applications/Orca.app/Contents/Resources/agent-browser-<platform>-<arch>`, on Windows
  `%LOCALAPPDATA%\Programs\orca\resources\agent-browser-win32-x64.exe`; an npm install there puts only
  `agent-browser.cmd` on `PATH`, so refsure runs the native build in its package). A node wrapper on `PATH` (Homebrew's
  `agent-browser` is one) is read as the native build kept beside its real file, `agent-browser-<platform>-<arch>`:
  the same version, without about 50 ms of node start per call. It drives only a session you opened yourself, and
  acts on that session's active tab:

  ```sh
  agent-browser --session work open https://example.com
  refsure state --page work --expect "the example home page"
  ```

  With no `--page` or `REFSURE_PAGE`, the session in an Orca terminal (with `REFSURE_BACKEND=agent-browser`) is
  `bg-<first 8 characters of the handle without term_>` (the prefix of the background-browsing skill's
  `bg-<id>-<rand>-<task>` names), so agents in parallel terminals never share one; elsewhere it is `default`.
  Parallel agents in one terminal each pass their own `--page`. A session that is not running answers `no_tab` with
  `next: {do: "open_session", argv: [<the absolute binary refsure drives>, "--session", <name>, "open", "<url>"]}`:
  the agent runs it with its own URL. It names the very binary refsure spawns, because a daemon started by another
  agent-browser version restarts (and loses its browser) when this one reaches it. refsure itself still never opens
  or navigates anything.

  agent-browser launches a browser for any page command on a session that has none, and its reply does not say
  so. So before every page call refsure checks that the session's browser is running, with two calls that never
  launch one (`session list`, then `stream status`); when it is not (closed, crashed), the command answers `no_tab`
  (exit 20) and no browser is started. The call itself runs as one `batch` that repeats that check: if the browser
  went away in the instant between, agent-browser starts a new one to answer, and refsure discards the answer
  (`no_tab`, or `effect_unknown` for an act that may have reached it). A session closed a moment before refsure's
  check or call can make agent-browser start a new daemon for it. refsure sets that daemon no idle timeout: from
  0.33, a call that carries `AGENT_BROWSER_IDLE_TIMEOUT_MS` other than a running daemon's own restarts that daemon and
  closes its browser, so refsure never sends one. Such a daemon lives by agent-browser's own default (none on 0.27,
  1 h from 0.33); your next `open` on that session reuses it, and `agent-browser --session <name> close` ends it.
  The check needs `stream status` (agent-browser 0.27). Each page call costs two agent-browser round trips (about
  0.3 s on 0.27, far less from 0.27.2). The capabilities come from `agent-browser --help`.

  agent-browser also sends launch settings (a profile, headed, a CDP target, auto-connect, a proxy) with every
  command, and a daemon whose session was launched with other values relaunches its browser to match. So refsure
  passes `--config` with an empty file of its own (no `~/.agent-browser/config.json`, no `./agent-browser.json` from
  its working directory) and none of agent-browser's environment (`AGENT_BROWSER_*` apart from the socket directory,
  `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, the idle timeout). It sends no launch setting, so it never
  relaunches a session with other ones, and a browser started in the race above gets agent-browser's defaults
  (headless, a fresh profile) or, in a daemon of yours, that daemon's own settings.
- With neither (no Orca terminal, no `agent-browser` binary), refsure falls back to Orca, which answers
  `not_in_orca_terminal`.
- `refsure doctor` asks only the session a page command would drive (`--page`, `REFSURE_PAGE`, the default). Other
  listed sessions are named, never sent a command, so doctor cannot disturb another agent's browser.
- `REFSURE_BACKEND` set to anything but `orca` or `agent-browser` chooses no backend: page commands answer
  `backend_unknown` (not_set_up, exit 23), and `doctor` shows only that failed check.

## Setup

Three steps: name a key, optionally write a config file, then grant consent yourself.

### Keys (bring your own)

refsure needs at least one Decision provider key. Which verbs each provider unlocks is in
[Who may answer](#who-may-answer).

| Variable | Provider |
|---|---|
| `REFSURE_OPENROUTER_KEY` | Jev via OpenRouter (`https://openrouter.ai/api/v1/systemone`, model `jev-1.13`) |
| `REFSURE_OPENAI_KEY` | OpenAI Decisions (`https://api.openai.com/v1/decisions`, model `gpt-6-luna`, public beta) |
| `REFSURE_GATEWAY_URL` + `REFSURE_GATEWAY_KEY` | your own gateway; the config file still names its paths and models (see [Custom gateway](#custom-gateway)) |

`OPENROUTER_API_KEY` and `OPENAI_API_KEY` are **never read** unless your config file names them, for example
`{"env": "OPENROUTER_API_KEY"}`. A key you exported for another tool is not silently reused.

### Config file

`$XDG_CONFIG_HOME/refsure/config.json` (default `~/.config/refsure/config.json`). Only you may read or write it:
any group or other permission bit (`0640`, `0644`, `0660`…) is refused with `config_mode` (`not_set_up`). `0600` is
the mode to use; a stricter one such as `0400` also passes. Windows has no mode bits (NTFS permissions keep your
profile private), so there refsure skips this check, and the same check on its consent and state files.

```sh
mkdir -p ~/.config/refsure && touch ~/.config/refsure/config.json && chmod 600 ~/.config/refsure/config.json
```

A key is named, never stored. Each entry under `keys` is either `{"env": "<VARIABLE>"}` or
`{"command": [argv…]}`. A command runs without a shell, with a 5 s timeout; its trimmed stdout is the key, and it is
never echoed. On Windows a bare name is looked up on `PATH` only, as `<name>.exe`, never in the working directory.

```json
{
  "keys": {
    "openrouter": { "command": ["security", "find-generic-password", "-s", "refsure-openrouter", "-w"] },
    "openai": { "env": "REFSURE_OPENAI_KEY" }
  },
  "allowOrigins": [],
  "denyOrigins": ["https://mail.example.com"],
  "piiMasks": true,
  "requireIsolatedProfile": false,
  "limits": { "decisionsPerMinute": 30, "usdPerDay": 0.5 }
}
```

- **macOS Keychain:** store the key once with
  `security add-generic-password -s refsure-openrouter -a "$USER" -w`, then use the `security find-generic-password`
  argv above.
- **1Password:** `"openrouter": { "command": ["op", "read", "op://Private/OpenRouter/credential"] }`. Use the
  `op://<vault>/<item>/<field>` reference of the item that holds the key.
- **A secrets wrapper:** if your secret manager injects values into one child process (a
  `secrets run NAME -- cmd` style tool), keep the default `env` source and run refsure through it:
  `secrets run REFSURE_OPENROUTER_KEY -- refsure state --expect "…"`. If the stored name differs, map it:
  `secrets run MY_KEY -- sh -c 'REFSURE_OPENROUTER_KEY="$MY_KEY" refsure doctor'`. The key then exists only in
  refsure's own process, not in the agent's shell.

Rules:

- **No literal keys.** A string where a key source belongs, or any field other than `env` or `command`, is refused.
- **No `--key` flag.** Command-line arguments leak into shell history and `ps`.
- Keys live in memory for one request. Provider error bodies are classified, never printed. `REFSURE_*` variables
  are stripped from the environment of the `orca` and `agent-browser` child processes.

Other fields: `allowOrigins` and `denyOrigins` (both empty by default; `denyOrigins` wins; entries are exact origins
or `https://*.example.com`; a trailing dot on a host is dropped on both sides, so `bank.example.` stays denied if
`bank.example` is), `piiMasks` (on by default), `requireIsolatedProfile` (off by default; when on, pages in
Orca's default profile are refused with `origin_denied`), and `limits`.

### Custom gateway

`REFSURE_GATEWAY_URL` (or `gateway.url`, which wins when both are set) points refsure at your own proxy. The URL
alone routes nothing: refsure ships **no default paths, models or headers** for a gateway, so the config file's
`gateway` object must spell them out, with or without its own `url`:

```json
{
  "keys": { "gateway": { "env": "REFSURE_GATEWAY_KEY" } },
  "gateway": {
    "url": "https://gateway.example.com",
    "jevPath": "/api/v1/systemone",
    "jevModel": "jev-1.13",
    "openaiPath": "/v1/decisions",
    "openaiModel": "gpt-6-luna",
    "headers": {}
  }
}
```

- Leave out `"url"` to take it from `REFSURE_GATEWAY_URL`; then the env variable must be set.
- A provider goes through the gateway only when both its path and its model are named (`jevPath` + `jevModel`,
  `openaiPath` + `openaiModel`). It then uses the gateway key.
- HTTPS is required, except on a loopback host: `localhost` and `*.localhost`, `127.0.0.0/8` and `::1`.
- A gateway does whatever its operator does with your data.

### Consent

Run this yourself, in your own terminal:

```sh
refsure setup
```

`setup` prints the disclosure from [What leaves your machine](#what-leaves-your-machine). Then, for each configured
provider host, it asks you to type the exact phrase `send page text to <host>`, for example
`send page text to openrouter.ai`. Any other answer revokes that host's grant. It reads from `/dev/tty`, never asks
for a key, and writes the grants to `$XDG_CONFIG_HOME/refsure/consent.json` (mode `0600`). A consent file that group or others can write is ignored, as
if you had granted nothing, because anyone who can write it could grant on your behalf.

- A Decision runs only with a grant that matches its provider, its host and the current disclosure text. If the
  disclosure text changes in a new release, or you point a provider at a different gateway host, refsure answers
  `not_set_up` (exit 23) until you run `setup` again.
- A provider without a grant counts as not configured. With two keys and one grant, refsure quietly uses the one
  provider you granted.
- `refsure privacy` prints the disclosure, its hash, your grants and which key source each provider uses (by name,
  never by value).
- `refsure doctor` checks Node, the chosen browser backend and where the choice came from (the `orca` or
  `agent-browser` binary, and the one session a page command would drive), keys (by name), consent, the config file
  mode, model drift and the installed skill. On Orca, its
  `orca_terminal` check reports the worktree (`ORCA_WORKTREE_ID`) on its own: a terminal outside Orca fails that
  check, and `orca_running` still reports Orca itself; `orca_transport` says whether calls take the runtime socket
  or spawn the CLI, and why. `refsure doctor --ping` sends one synthetic Decision per configured provider.

Consent is a disclosure, not a security control: an agent with a terminal could fake the typed step. The point is
that you, the human, have read what is sent before anything is.

## What leaves your machine

Per Decision, refsure sends only the following, after redaction:

| Command | Sent |
|---|---|
| `state` | URL (≤300 chars), title, headings, dialogs, alerts, page text (≤1,500 chars) |
| `locate`, `verify-target` | ≤20 candidate lines of ≤600 chars, plus your intent (≤300 chars) |
| `pick-option` | the field's line (≤600 chars), what you want (≤300 chars), and every option's label (≤90 chars each) |
| `dismiss` | the overlay's text (≤1,000 chars), plus ≤12 control lines |
| `outcome` | your intent, the acted element (≤300 chars), page text before and after (≤4,000 chars each) |
| `wait-for` | your expectation (≤500 chars), plus page text (≤6,000 chars) |
| `run` | per step: your goal (≤600 chars), every `--fill` key **and value** (≤200 chars each), your expectation, the URL, title, page text (≤4,000 chars), new text (≤2,000 chars), the last 8 steps, and the element table (rows of ≤600 chars, with each field's current value and each control's state), as the target options too |

A candidate line is `<role> "<name>" in="<section path>"`: no attributes, no values, no element ids.

`run` also opens the connection to the provider once its route is approved (consent, provider, origin policy, caps),
before the first look: for an `https:` endpoint, a DNS lookup, then the TCP and TLS handshakes with its host, once per
process. No request, key, header, body or page text goes on that connection until the first Decision's own request.
Never under `--dry-run`, and not when Node's `fetch` already has a dispatcher that Node did not make for refsure: a
proxy, or an `Agent` with its own DNS, CA or address. It opens nothing then, and every request goes through that one.

**Size caps.** State ≤24,000 bytes and questions ≤12,000 bytes. Anything larger is refused as `oversize` before any
call is made. The one exception is a list of options that code built (`locate`, `dismiss`, `verify-target`,
`pick-option`): lines past the questions bound are cut from the end of the list, where a ranked list keeps its
weakest, so those verbs never refuse `oversize` for their own options. `pick-option` ranks its options first, so
the likeliest stay, and `--open` is never followed by an `oversize` refusal once it has clicked the list open.

**Never sent:** cookies, local or session storage, screenshots, API keys, values you typed or filled, textbox
values, console and network bodies. The one exception is `run`: it sends its `--fill` values (so Jev can pair each
with a field) and the current value of each field in its element table (so Jev can see what is filled), both
through the same redaction and masks; an editable region's text is never sent, only that it holds text, and a field
the tree cannot tell apart from one (a `role="textbox"` editor) shows its value only once a count finds no editable
region on the page. `do` never
sends a value. Text in an editable region (`contenteditable`: a comment box, a rich editor)
shows in the page text, so `state`, `outcome`, `act --verify`, `wait-for`, `do` and `mark` read each such region (up
to 16) without a snapshot and cut its text out; `state` also cuts what its snapshot shows. `do` also cuts every value
it filled or selected from its new text, and sends only the page's origin as its URL once a value shows in it (a
search form's `?q=`). With more regions, or a backend that cannot read them one by one, the page text is withheld
from the Decision (note `typed_text_withheld`). So it is when a typed text too short to cut out without cutting
words (one or two characters: `42`, `OK`, one code cell) shows in the page text as a word; for `do`, a short
`--fill` value counts, a short `--select` option label (page text already) does not. `state` then asks over the URL, title, headings, dialogs and alerts, with a
placeholder for the text. No other Decision is asked on a withheld text alone, and nothing is spent: `wait-for`
keeps polling until a poll it can read (with no `--text` or `--url`, a wait whose every poll was withheld ends
`not_seen` and says nothing judged the page), and `outcome`, `act --verify` and `outcome --mark` answer
`effect_unknown` (exit 30) when a side is withheld and the URL did not change; when the URL changed, the Decision
sees both URLs, titles and the placeholder. `wait-for --text` and `outcome -- … --expect-text` still match the whole
page text, locally. `outcome --mark` compares the mark's text, cut the same way, so its `--expect-text` settles
nothing when either side's text was withheld. The acted element that `outcome` and `act --verify` send has its name
cut the same way: a region with no label, which goes by its own text, is named by its placeholder or title, or by
its role alone. Any element whose name is part of a typed line and shows nowhere else in the page text is named by
its role alone: a link or chip inside a region, and an icon-only "Send" button too when the region holds "send".
When the regions cannot be read, any element is named by its role alone.

**Local only.** On Orca, refsure may take one screenshot of a page that has never painted, only to paint it (see
[Backends](#backends)): a quality-1 JPEG in a new temporary folder, deleted right after the capture. refsure never
reads it, logs it or sends it.

**Before anything is sent:**

- secret shapes (cloud, VCS, payment, messaging and AI provider keys, JWTs, private keys, `Bearer` tokens,
  credentials in URLs, `password=…`-style pairs) are replaced by `[redacted:<family>]`;
- PII masks replace e-mail addresses, phone numbers, card numbers (Luhn-valid) and IBANs (checksum-valid) with
  `[email]`, `[phone]`, `[card]` and `[iban]`. They are on by default (`piiMasks`). Text that a cut shortens
  (a name over 90 characters, a heading, a dialog, an alert, a bounded line, an overlay) is redacted and masked
  *before* the cut, with the masks on even when `piiMasks` is off: the stub a cut leaves of an e-mail or a card no
  longer matches its shape. `--within` row text is the exception: it stays as the page shows it, because only you
  read it and type it back;
- the page origin is checked against `allowOrigins` and `denyOrigins` (both empty by default);
- the spend caps are checked: 30 Decisions per minute and $0.50 per day by default (`spend_limit`, exit 22). A call
  whose provider reports no cost (OpenAI publishes none, and a gateway may report none) counts toward the daily cap at
  $0.0001, unless it failed in transport or was refused with an HTTP error status.

**The disclosure** (also shown by `refsure privacy` and `refsure setup`):

- Orca's default browser profile carries your imported Chrome cookies, so the pages refsure reads are usually
  logged in. What they show is what gets summarised and sent.
- Outside Orca, refsure reads whatever agent-browser session it is pointed at. A session opened with `--profile`,
  `--auto-connect` or `--cdp` can be your real, logged-in browser, and refsure cannot tell.
- Jev requests go to TypeSafe via OpenRouter (US, early access). refsure asks for zero data retention
  (`provider: { zdr: true, data_collection: "deny" }`). That is a request preference refsure cannot verify.
- OpenAI `/v1/decisions` is a public beta with no retention control in the request body.
- A custom gateway does whatever its operator does.

**See it before it happens.** Add `--dry-run` to any command: it prints the exact redacted request body for each
provider and sends nothing, and it never clicks. It saves and removes nothing of its own either: `mark` returns
`mark: null`, and `forget` removes nothing and reports `would_remove` (entries that expired more than 10 minutes ago
are still purged, as on every call).

**See it after it happened.** Every envelope lists `egress: [{host, bytes}]` (or `null` when nothing was sent). A
local log at `$XDG_STATE_HOME/refsure/egress.log` (default `~/.local/state/refsure/egress.log`, mode `0600`) records
the time, command, provider, host, byte count, digest, status and cost of every call. It never records content. A call
is written down before it is sent and settled after, so two refsure processes share the same caps, and a call that
was killed mid-flight still counts. A call that never left the machine (no key, interrupted first) counts nowhere and
shows no `egress`.

## Commands

Every command prints exactly one JSON envelope on stdout, except `skill print`, which prints the skill file itself.
This reference is generated from `refsure commands --json` and `refsure causes --json`; run them, or
`refsure <command> --help`, for the installed version.

Global options, accepted by every command:

- `--page <value>`: Orca page id (your own tab), or agent-browser session name; else REFSURE_PAGE, else the worktree's current tab (agent-browser: bg-<first 8 of the Orca terminal handle>, else default)
- `--dry-run`: Print the exact redacted request; send nothing, do nothing
- `--help, -h`: Show this command's options
- `--json`: Accepted and ignored: output is one JSON envelope (skill print: the file itself)

### Core

| Command | Acts | What it does |
|---|---|---|
| `state` | never | Say which state the page is in: expected, login_wall, bot_challenge, error_page, blocking_modal, rate_limited or unexpected_page |
| `do` | ticket | Run a whole task in one call: dismiss, fill, select, check, click in order, then wait for what should show *(experimental)* |
| `run` | recheck | Hand over a multi-step task on one site: Jev picks each step, refsure acts on it guarded, until it is done *(experimental)* |
| `locate` | never | Find the element an intent (or a recorded line) means; returns a single-use ticket for act |
| `act` | ticket | Act on a ticket from locate, dismiss --propose or pick-option: claim, recheck, guard, then one typed act |
| `dismiss` | ticket | Close a cookie wall or pop-up by its reject or close control, guarded; or propose one with a ticket |
| `outcome` | own-ref | Run your own act on a live ref, guarded, and say whether its intent landed (or check since a mark) |
| `wait-for` | never | Wait until the page shows what you describe: present, or not_seen at the timeout (never "absent") |

### Expanded

| Command | Acts | What it does |
|---|---|---|
| `setup` | never | Read the disclosure and grant consent per provider host (a human, at a terminal) |
| `privacy` | never | Show what leaves your machine, where it goes, and the consent grants on file |
| `doctor` | never | Check Node, the browser backend (Orca or agent-browser), keys, consent, config, model drift and the installed skill; --ping asks each provider once |
| `mark` | never | Remember the page as it is now, for a later outcome --mark or triage --since |
| `snap` | never | Print compact element lines: line format v1 plus #<ordinal>/<twins> @eN |
| `guard` | never | Classify the risk of clicking an element (by ref or ticket): read, write, consent, auth, money or irreversible |
| `verify-target` | never | A second look: an independent find must name the same element as your ref, else it refuses (veto only) *(experimental)* |
| `pick-option` | own-ref | Find the dropdown option that means what you want ("Ukraine" → "Україна"); returns a ticket for act *(experimental)* |
| `act-high-risk` | high-risk | Act on a money, irreversible, auth or consent control: class check, highlight, one act; no Decision confirms *(experimental)* |
| `triage` | never | List console errors, failed requests (status ≥400 or 0) and the load error, optionally since a mark |
| `forget` | never | Clear this page's marks, tickets and stall clock, or every page's with --all |
| `commands` | never | Describe every command: options, page and capability needs, Decision sites, whether it acts |
| `causes` | never | List every why.cause with its status and exit code, and every next.do |
| `skill` | never | Print the agent skill (SKILL.md) bundled with this version, as the file itself, not an envelope |

`Acts` is what a command may do in the page: `never`; `ticket`, only through a claimed single-use ticket after a
fresh recheck; `recheck`, a Decision's pick found again by fingerprint on a fresh snapshot and guarded as `act`
guards a ticket, with no ticket in between; `own-ref`, your own ref after a name and risk check; `high-risk`, the one
path for money, irreversible, auth and consent controls.

Never shipped: an unbounded or unguarded goal loop (`run` is bounded by steps and time, and every act passes the
guard), login, 2FA or CAPTCHA automation, screenshots or vision, a "failed" or "absent" verdict,
or a Decision that confirms money or an irreversible action.

### Options by command

**`setup`** (no Decision)

```text
refsure setup
```

**`privacy`** (no Decision)

```text
refsure privacy
```

**`doctor`** (Decision sites: presence)

```text
refsure doctor [--ping]
```

- `--ping`: Ask each configured provider one synthetic presence Decision (consent needed)

**`state`** (runs on a page; Decision sites: page-state)

```text
refsure state --expect "<what the intended page is>"
refsure state --state key="<when the page is in it>" --state key2="<…>" … [--expect "<…>"]
```

- `--expect <value>`: What the intended page is, in a few words (required without --state)
- `--state <value>`: A custom state, key="<when the page is in it>"; two or more replace the research set (experimental; only research keys get a next) (repeatable)

**`do`** (runs on a page; Decision sites: dismiss, locate, find, presence)

```text
refsure do [--fill "<field>=<value>"] [--select "<field>=<option>"] [--check "<box>"] [--uncheck "<box>"] [--click "<control>"] ... (up to 8 steps, run in the order given) [--expect "<what should show after>"] [--text <literal>] [--timeout 60s] [--stall 10s] [--no-dismiss]
```

- `--fill <value>`: A step: fill a text field, "<field>=<value>" (split at the first =) (repeatable)
- `--select <value>`: A step: choose a native select option by its label, "<field>=<option>" (repeatable)
- `--check <value>`: A step: check a box, "<box>" (repeatable)
- `--uncheck <value>`: A step: uncheck a box, "<box>" (repeatable)
- `--click <value>`: A step: click a control, "<control>" (repeatable)
- `--expect <value>`: What should show after the steps; judged on text new since the start only
- `--text <value>`: A literal that settles it by code once it is in the new text (needs --expect)
- `--timeout <value>`: How long to wait for --expect, from 1s to 10m (default 60s)
- `--stall <value>`: End the wait (stalled) once the page text and URL stop changing this long (default 10s)
- `--no-dismiss`: Leave any cookie banner or pop-up alone

**`run`** (runs on a page; Decision sites: dismiss, step)

```text
refsure run --goal "<what to get done on this site>" [--fill "<what it is>=<value>"]... (up to 8) [--expect "<what shows when it is done>"] [--text <literal>] [--max-steps 25] [--timeout 90s] [--no-dismiss]
```

- `--goal <value>`: What to get done on this site, in a sentence or two (required); sent to the provider
- `--fill <value>`: A value run may type, "<what it is>=<value>" (at most 8); the only text it types; sent to the provider (repeatable)
- `--expect <value>`: What shows once it is done; judged on text new since the start only
- `--text <value>`: A literal that ends it by code once it is in the new text
- `--max-steps <value>`: The most steps, 1 to 60 (default 25)
- `--timeout <value>`: How long it may take, from 5s to 10m (default 90s)
- `--no-dismiss`: Leave any cookie banner or pop-up alone at the start

**`locate`** (runs on a page; Decision sites: locate, find)

```text
refsure locate --intent "<what the element is for>" [--risk r] [--within "<row text>"] [--first] [--top N]
refsure locate --recorded '<role> "<name>" in="<path>"' [--intent "<step intent>"] [--risk r] [--within "<row text>"] [--first]
```

- `--intent <value>`: What the element is for, in a few words
- `--recorded <value>`: A v1 line recorded earlier (from snap), matched verbatim first
- `--risk <value>`: The risk row: read, write, consent, auth, money or irreversible; the page can only raise it. Without it: at least write, at the strictest threshold
- `--within <value>`: Only elements whose row contains this text (e.g. "Invoice 1042")
- `--first`: Take the first of identical twins (never at money or irreversible)
- `--top <value>`: Also list up to N presented candidates by the model's ranking (1-20)

**`act`** (Decision sites: outcome)

```text
refsure act --ticket T [--action click|dblclick|fill|select|check|uncheck] [--value v] [--verify "<what should happen>"]
```

- `--ticket <value>`: The ticket id (t_…) from locate, dismiss or pick-option (required)
- `--action <value>`: click, dblclick, fill, select, check, uncheck; default: the ticket's own, else click
- `--value <value>`: The text to fill or the option to select (fill and select only); never logged
- `--verify <value>`: What should happen; after the act the outcome Decision must say landed, else exit 30

**`dismiss`** (runs on a page; Decision sites: dismiss)

```text
refsure dismiss [--propose] [--agree] [--depth 1..3]
```

- `--propose`: Never click: propose the control with a ticket for act
- `--agree`: Both providers must pick the same control (needs both set up)
- `--depth <value>`: Nested overlays to dismiss in turn, 1 to 3 (default: 1)

**`outcome`** (runs on a page; Decision sites: outcome)

```text
refsure outcome --intent "<what should happen>" --expect-name "<name you saw>" [--expect-url g] [--expect-text t] [--risk r] -- <click|dblclick|fill|select|check|uncheck> --element @eN [--value v]
refsure outcome --intent "<what should happen>" --mark M [--expect-url g] [--expect-text t]
```

- `--intent <value>`: What should happen, in a few words (required)
- `--expect-name <value>`: The name you saw on the element; the live ref must still show it (wrapped act)
- `--expect-url <value>`: Landed by code when the URL newly matches this glob (* = any run); with --mark, without the query
- `--expect-text <value>`: Landed by code when this text was absent before and is present after
- `--risk <value>`: Raise the risk class: read, write, consent, auth, money or irreversible
- `--mark <value>`: Check against a mark from `refsure mark` instead of wrapping an act

**`wait-for`** (runs on a page; Decision sites: presence)

```text
refsure wait-for --expect "<what should appear>" [--text <literal>] [--url <glob>] [--timeout 30s] [--interval 2s] [--max-decisions 10] [--agree] [--stall 10s]
```

- `--expect <value>`: What should appear, described in a few words (required)
- `--text <value>`: A literal that settles it by code once it is on the page
- `--url <value>`: A URL glob (* = any run) that settles it by code once the tab matches it
- `--timeout <value>`: How long to wait, as 10s, 90s or 2m; from 1s to 10m (default: 30s)
- `--interval <value>`: Time between polls, as 1s or 1500ms; from 1s to 5m (default: 2s)
- `--max-decisions <value>`: Provider calls the wait may make; 0 waits by code only (with --text or --url) (default: 10)
- `--agree`: Both providers must say present (needs both set up)
- `--stall <value>`: End early (stalled) once the page text and URL stop changing this long, as 10s; off by default

**`mark`** (runs on a page; no Decision)

```text
refsure mark [--label L]
```

- `--label <value>`: A label to show with the mark, up to 80 characters (display only)

**`snap`** (runs on a page; no Decision)

```text
refsure snap [--max-chars 4000] [--scope dialog|main|form] [--all]
```

- `--max-chars <value>`: Cut the lines at a line boundary past this many characters; left out, a list up to twice the default prints whole (default: 4000)
- `--scope <value>`: Only elements inside a dialog, main or form
- `--interactive`: Only interactive elements with a ref (default: true)
- `--all`: Every named node, not only interactive ones (overrides --interactive)

Lines are cut whole, never split. Without `--max-chars`, a list that fits in twice the default (8,000 characters,
about 2,000 tokens) prints whole: a second snap costs the agent a turn, which costs far more than those lines. A
`--max-chars` you pass is a hard cap, whatever the list's length. A cut list ends with the footer
`N lines dropped (~T tokens): --max-chars=<total> shows all`, inside the budget: T is the dropped lines' characters
over 4, and `<total>` the whole list's length (at most 1,000,000, the flag's limit). On a cut, `next` is that same
call: `snapshot` with argv `refsure snap --max-chars=<total>`, plus the `--scope` and `--all` given and the pinned
`--page`.

**`guard`** (no Decision)

```text
refsure guard --ref @eN
refsure guard --ticket T
```

- `--ref <value>`: The element, as @eN from the latest snapshot
- `--ticket <value>`: A ticket from locate, dismiss or pick-option: rechecked on its page, not spent

**`verify-target`** (runs on a page; Decision sites: find)

```text
refsure verify-target --ref @eN --intent "<what the element is for>" [--risk r]
```

- `--ref <value>`: Your element, @eN from your latest snapshot (required)
- `--intent <value>`: What the element is for, in a few words (required)
- `--risk <value>`: The threshold row: read, write, consent, auth, money or irreversible; only raised

**`pick-option`** (runs on a page; Decision sites: option-map)

```text
refsure pick-option --field @eN --want "<the option you mean>" [--open --expect-name "<the name you saw on the field>"]
```

- `--field <value>`: The dropdown, @eN from your latest snapshot (required)
- `--want <value>`: The option you mean, in any wording or language (required)
- `--open`: Click the field first, for a dropdown that lists its options only once open
- `--expect-name <value>`: With --open (required): the name you saw on the field; the live ref must still show it

**`act-high-risk`** (no Decision; capabilities: highlight)

```text
refsure act-high-risk --class money|irreversible --ticket T --action <a> [--value v] [--risk r] --intent "<what the human asked for>"
refsure act-high-risk --class money|irreversible|auth|consent --ref @eN --expect-name "<name you saw>" --action <a> [--value v] [--risk r] --intent "<what the human asked for>"
```

- `--class <value>`: money, irreversible, auth or consent: must equal the class a fresh read gives (required)
- `--ticket <value>`: A ticket picked at ≥0.85 or by code, with no twins (money and irreversible only)
- `--ref <value>`: Your own ref, @eN from your latest snapshot (needs --expect-name)
- `--expect-name <value>`: The name you saw on the element; the live ref must still show it, as whole words
- `--action <value>`: click, dblclick, fill, select, check, uncheck (required)
- `--value <value>`: The text to fill or the option to select (fill and select only); never logged
- `--intent <value>`: What the human asked for, in a few words (required)
- `--risk <value>`: Raise the class a fresh read gives, as the step that refused did: read … irreversible

**`triage`** (runs on a page; no Decision; capabilities: console, network)

```text
refsure triage [--since M]
```

- `--since <value>`: Only lines after this mark (from `refsure mark`); console lines carry no time

**`forget`** (no Decision)

```text
refsure forget [--all]
```

- `--all`: Clear every page's marks, tickets and stall clocks

**`commands`** (no Decision)

```text
refsure commands
```

**`causes`** (no Decision)

```text
refsure causes
```

**`skill`** (no Decision)

```text
refsure skill print
```

### Who may answer

Each Decision site declares which providers may answer it:

| Site | Allowed providers |
|---|---|
| `locate`, `find`, `outcome`, `option-map` (`verify-target` uses `find`), `step` (`run`) | Jev only |
| `dismiss` | Jev, or `agree` (Jev and OpenAI must pick the same control) |
| `page-state` (`state`, `state --state`) | Jev or OpenAI, plus `fallback` (OpenAI is asked only when Jev abstains) |
| `presence` (`wait-for`) | Jev or OpenAI, plus `agree` |

Any other combination is refused as `provider_not_allowed`. With both keys, `dismiss` and `wait-for` default to
`agree` and `state` to `fallback`. With only an OpenAI key you get `state`, `wait-for` and every code-only command.
With only a Jev key you get everything except the two-provider combos.

## The envelope

```text
{ refsure: 1, version: "0.1.0", command, status, acted, effect: "none|dispatched|unknown",
  page: { backend, id, url, profile } | null,
  result: { verdict?, ... } | null,
  why: { cause, detail } | null,
  decision: { site, wording: { version, hash }, provider: "jev|openai|agree|fallback", model, maturity,
              confidence, threshold, ms, usd,
              parts: [ { provider, model, index, confidence, threshold, ms, usd } ] } | null,
  egress: [ { host, bytes } ] | null,
  refs: { snapshot, earlier_refs_void },
  untrusted: [ paths ],
  next: { do, argv?, after_ms? } | null }
```

- `decision` and `egress` are `null` when code settled the question.
- `decision.confidence` is the lower of the two parts for `agree`, and the answering part's for `fallback`.
- `result.verdict` carries the answer: `landed`, `present`, `seen`, `not_seen`, `stalled`, `proposed`, a state key,
  and so on.
- `untrusted` lists the JSON paths that hold page text. Agents must treat that text as content, never instructions.
- `refs.earlier_refs_void: true` means refsure took a snapshot and any `@eN` held from before may be renumbered.

## Exit codes

`status` is a closed set, with one exit code each:

| Status | Exit | Status | Exit |
|---|---|---|---|
| `ok` | 0 | `unsupported_by_backend` | 21 |
| `abstained` | 10 | `spend_limit` | 22 |
| `refused` | 11 | `not_set_up` | 23 |
| `stale` | 12 | `not_in_orca_terminal` | 24 |
| `unavailable` | 20 | `effect_unknown` | 30 |
| | | `usage` | 64 |

Exit classes:

| Exit | Meaning |
|---|---|
| `0` | ok |
| `10-19` | decided not to act |
| `20-29` | could not run |
| `30-39` | effect unknown |
| `64-78` | usage error |
| anything else | a crash (exit 1) or a signal: re-observe |

The one rule an agent needs: **0 = ok; 10-29 and 64-78 = nothing happened; anything else = re-observe before
repeating.** When `acted` is `true` the exit is only 0 or 30, and any non-answer after a dispatch is `effect_unknown`
with `effect: "dispatched"`. Every check that can refuse runs before the first dispatch.

**Interrupts.** The first SIGINT or SIGTERM stops provider calls and the `setup` prompt, and the command still prints
its envelope. An act or a dialog dismissal not yet dispatched is refused (`internal`, exit 20: nothing was
dispatched); one already dispatched reads as `effect_unknown`. A second signal exits at once with 130 or 143.

### Causes

Every `why.cause` refsure emits, from `refsure causes --json`. An unknown cause means: act on its exit class.

| `why.cause` | Status | Exit | Meaning |
|---|---|---|---|
| `none_chosen` | `abstained` | 10 | The Decision picked none of the offered options. |
| `low_confidence` | `abstained` | 10 | The answer was below the threshold for this site, risk and provider. |
| `twins` | `abstained` | 10 | The pick has identical twins; narrow it with --within or --first. |
| `proposed_only` | `abstained` | 10 | The ticket only proposes at this risk; it may not act. |
| `disagree` | `abstained` | 10 | The two providers did not pick the same option. |
| `not_seen` | `abstained` | 10 | wait-for did not see it within its timeout; never a claim that it is absent. |
| `stalled` | `abstained` | 10 | Not seen, and the page text and URL stopped changing for the --stall time; report it. |
| `done_unconfirmed` | `abstained` | 10 | run: the Decision said the goal is done, and nothing (--expect, --text) confirmed it. |
| `blocked` | `abstained` | 10 | run: no offered operation can make progress (a sign-in, a bot check, a missing value). |
| `no_progress` | `abstained` | 10 | run: acts or scrolls changed nothing three times in a row, or the same act came a third time on one page. |
| `budget` | `abstained` | 10 | run: --max-steps or --timeout ran out before the goal showed. |
| `veto` | `refused` | 11 | The control is on the never-click list (accept, subscribe, settings, ...). |
| `high_risk_class` | `refused` | 11 | Money, irreversible, auth or consent: refused on this path. |
| `oversize` | `refused` | 11 | The request was over the egress byte bounds. |
| `provider_not_allowed` | `refused` | 11 | That provider or combination is not allowed at this site. |
| `origin_denied` | `refused` | 11 | The page origin or profile is outside the configured origin policy. |
| `ambiguous_option` | `refused` | 11 | Two options read the same once folded; refsure will not pick. |
| `page_changed` | `stale` | 12 | The page moved on since the ticket: a different URL or element. |
| `ticket_expired` | `stale` | 12 | The ticket or mark is past its time to live, or no such mark is kept. |
| `ticket_used` | `stale` | 12 | The ticket was already claimed; tickets are single use. |
| `ref_gone` | `stale` | 12 | The element is no longer on the page; take a fresh snapshot. |
| `expect_name_mismatch` | `stale` | 12 | The live ref shows another name than --expect-name; nothing was done. |
| `provider_timeout` | `unavailable` | 20 | The provider did not answer within its time budget. |
| `provider_error` | `unavailable` | 20 | The provider failed or answered invalidly. |
| `no_tab` | `unavailable` | 20 | No browser tab: none is current, the page id is unknown, or the agent-browser session is closed (next.argv then opens it, headless). |
| `orca_not_running` | `unavailable` | 20 | Orca is not running, or its CLI could not be reached. |
| `browser_timeout` | `unavailable` | 20 | A browser call timed out before anything was dispatched. |
| `browser_error` | `unavailable` | 20 | The browser backend failed before anything was dispatched. |
| `internal` | `unavailable` | 20 | refsure hit an unexpected error before acting. |
| `unsupported` | `unsupported_by_backend` | 21 | The browser backend lacks a capability this command needs, or cannot send this input; a retry will not help. |
| `spend_limit` | `spend_limit` | 22 | The per-minute Decision cap or the daily spend cap was reached. |
| `not_set_up` | `not_set_up` | 23 | A key or a consent grant is missing; a human runs `refsure setup`. |
| `config_mode` | `not_set_up` | 23 | The config file is readable or writable by group or others; chmod 600 it. |
| `literal_key` | `not_set_up` | 23 | The config holds a literal key; name an env variable or a command. |
| `gateway_insecure` | `not_set_up` | 23 | The gateway URL is neither https nor localhost. |
| `config_invalid` | `not_set_up` | 23 | The config file could not be read as a refsure config. |
| `backend_unknown` | `not_set_up` | 23 | REFSURE_BACKEND names no backend; a human sets it to orca or agent-browser. |
| `not_in_orca_terminal` | `not_in_orca_terminal` | 24 | The Orca backend needs an Orca terminal (ORCA_WORKTREE_ID); elsewhere, use an agent-browser session. |
| `effect_unknown` | `effect_unknown` | 30 | An act was dispatched and its effect is unconfirmed; re-observe first. |
| `dry_run` | `ok` | 0 | Dry run: the exact redacted requests are shown; nothing was sent or done. |
| `usage` | `usage` | 64 | The command line was not valid; nothing was done. |

`next.do` is one of `act`, `act_high_risk`, `dismiss`, `state`, `wait` (with `after_ms`), `snapshot`,
`retry_within`, `open_session`, `needs_human` or `stop`; `causes --json` lists the installed version's values as
`next_do`. `argv[0]` is `refsure` or `orca`, or for `open_session` the absolute `agent-browser` binary refsure drives
(the agent puts its URL in place of `<url>`). Free text in an `argv` (an expectation, a name, an intent) is one `--flag=<text>` token,
as in `--expect=-5% off`: the parser refuses a separate value that starts with `-`. Pass such text the same way.

**Compatibility.** `refsure` in the envelope is the schema major. Within a major, fields are only added, never renamed
or retyped, and no status or cause moves between exit classes. `why.cause` and `next.do` are open sets: new values
arrive in minor releases and appear in `causes --json` (as `causes` and `next_do`). Treat an unknown cause by its exit
class, and an unknown `next.do` as `needs_human`. A major bump keeps `--envelope <previous major>` for one minor
release.

## Safety model and honest limits

These rules live in code, not in the agent skill:

1. A Decision only picks among code's options plus `none`, and answers are validated all-or-nothing.
2. Deciding never acts. Acting rechecks the page first.
3. Every non-answer before a dispatch is `acted: false` with a named cause. A refusal quotes the option the model
   leaned to, by its text and never by its shuffled key, and the threshold it missed.
4. Risk only rises: it is the highest of `--risk`, the lexicon match and the page raisers.
5. Money, irreversible, auth and consent controls never go through `act`, `outcome`, `dismiss`, `pick-option` or
   `run`.
6. No Decision says "failed" or "absent", and no Decision confirms money or an irreversible action.
7. A group of identical controls (twins) is resolved by code (`--within`, `--first`) or refsure stops.
8. Nothing leaves your machine without a matching consent grant. `--dry-run` works everywhere.
9. Decision inputs come only from the accessibility tree, tab info, page text, element attributes and element
   counts. refsure runs none of its own JavaScript in the page, never navigates and never follows a page URL.
10. The authority to act depends on how well a site is calibrated (see below).

**Risk classes.**

| Class | Examples | Route |
|---|---|---|
| read | links, tabs, expanders, close | `act`, at the site's read row (0.6-0.89, see [Calibration status](#calibration-status)) |
| write | fields, toggles, a plain submit | `act`, at the site's write row (0.8-0.89) |
| money | pay, buy, order, checkout, top up; card, CVV and IBAN forms; `checkout`, `payment`, `billing` paths | `act-high-risk` only |
| irreversible | delete, remove, send, publish, revoke; "cancel" next to subscription, order, account or booking; the confirming button of a confirm dialog (never its own Cancel or No); `delete`, `close-account` paths | `act-high-risk` only |
| auth | sign in, password, 2FA, authorize, switch account; password forms; OAuth consent (`oauth`, `authorize` paths); never a click whose whole name defers or skips an account entry (`Log in later`, `Continue as guest`, `Zaloguj się później`), unless a password input is on the page | `act-high-risk` only |
| consent | accept, agree, allow cookies, opt in | `act-high-risk` only |

Names are matched against the union of all lexicons (English, Ukrainian, Russian, German, Spanish, French and
Polish), whatever the page language. Typographic apostrophes fold to a straight one (`J’accepte` reads as
`j'accepte`), and an `<input>` button with no text is named by its `value` (an image button by its `alt`), as the
snapshot names it. A name only ever lowers a control's class when it is, as a whole, a close, cancel or reject word
(`Close`, `Close dialog`, `No, cancel`): `Close project` and `Yes, cancel` keep their class. Likewise an auth term
counts for no click whose whole name, in every reading, puts off or skips an account entry (`Log in later`, `Skip
sign-up`, `Später anmelden`): `Log in later (recommended)`, `Sign in as guest` and `Not now, sign in` stay auth, and
`Pay later` stays money. An element the page made clickable with no role (a `div "Tak"`) confirms a confirm dialog as
a button does. The path rules read the
URL's path and fragment and raise every control on the page, whatever its name: an OAuth consent screen names its
buttons neutrally, so on an `oauth` or `authorize` route a plain `Continue` reads auth, and so does its `Cancel`.

**Tickets.** `locate`, `dismiss` (when it proposes rather than clicks) and `pick-option` issue a single-use ticket
that lives 120 s and stores the element's fingerprint (role, name, section path, ordinal among twins), never its ref
number. `act` claims it, checks the URL, takes a fresh snapshot, finds the same element again, re-reads its risk, and
acts at once. If anything moved, nothing is clicked (`stale`). Two agents racing one ticket: exactly one wins, the
other gets `ticket_used`. Tickets and marks (a mark lives 15 minutes) are kept under `$XDG_STATE_HOME/refsure/`
(mode `0600`). Every call, even `--help`, `--version`, a usage error or `--dry-run`, first purges entries that
expired more than 10 minutes ago, so a late claim still reads `ticket_expired`.

**Your own refs.** `outcome` and `act-high-risk --ref` take no snapshot, so your refs survive. `pick-option --open`
clicks your ref with no snapshot first, then takes one to read the options it lists (`earlier_refs_void: true`). All
three take `--expect-name`, and for `pick-option` it is required with `--open`: it must match the element's live text
(or its `aria-label`, `placeholder`, `title`, or an `<input>` button's `value`), and page raisers (a password field,
card fields) lift the risk class. Money, irreversible, auth and consent still refuse before the click, `--open`
included, and the refusal's `act-high-risk` command carries the full name the ref shows (`Save and send` where you
passed `Save`). `outcome` reads the page before the act after all of that, so it then checks the URL and tab again
and reads the ref's names again (its text, `aria-label`, `placeholder`, `title` and labels, so an icon button too):
a page that moved is `page_changed`, a ref that no longer shows `--expect-name` is `expect_name_mismatch`, a ref
whose new name reads money, irreversible, auth or consent ("Save" renamed "Save and send", or an icon button's
`aria-label` changed to "Save and send") is `high_risk_class` with no command offered, and nothing is clicked. A confirm
dialog that opens, or a password or card field that appears, in that window, which can last seconds on Orca, is not
seen. A page that renames the element after refsure's last re-read and before the click (up to about two seconds on
Orca, whose reads run one after another; under a second on agent-browser) is still clicked, as with any tool that checks and then acts: an agent cannot close that race without the page's
cooperation.

**Dismiss.** The overlay is found by code (the last `dialog` or `alertdialog` on the page, or else a cookie region
with at least two buttons; never a page `banner`). A veto list (accept, agree, allow, subscribe, buy, trial, enable,
upgrade, manage, settings, preferences, customize, in every lexicon) is never overridable. A negation right before an
accept term (`without`, `sans`, `ohne`, `sin`, `bez`, `без`) turns it into a reject, so `Continuer sans accepter`
(continue without accepting) can be clicked; it never turns a money, irreversible or auth term. Before the click,
`dismiss` finds its pick again on a fresh snapshot by fingerprint, on the same URL and tab, and reads the veto and the
risk again on the fresh element: if anything changed, nothing is clicked. After a click, the overlay must be gone,
else the result is `effect_unknown`. With `agree` (`--agree`, or the default when both providers are set up), Jev's
pick meets the veto, the twin rule and the risk read before the two answers are compared, so a vetoed, twinned or
high-risk pick names that cause (`veto`, `twins` or `high_risk_class`), never `disagree`. A high-risk pick only Jev
made goes to a human (`next.do: needs_human`) with no `act-high-risk` command: one provider's pick is not a control
to hand on. A high-risk pick both providers agreed on, or the one provider asked, names its `act-high-risk` command.

**Run.** `run` holds no ticket: its pick is acted on in the same process, right after a fresh snapshot finds the
element again by fingerprint, as `act` finds a ticket's, with the same risk read, refusals and single send. Its
`step` site is experimental, so a ticket would carry only `read` authority below 0.85 with corroboration; `run`
instead acts on the most likely step, at the `step` floor (0.3, above `none`), on what the agent handed over with
`--goal`, which is why every act is floored at write, high risk still goes only to `act-high-risk` whatever the
probability, and the veto still refuses accept, subscribe and enable. Its rows are numbered in page order (no shuffle: the goal is a route, not a recorded element), and two rows
that read the same but for their number are twins the model could not tell apart, so a pick of one stops.

**Injection.** Wordings are fixed and hashed. Page text appears only in state fields and in option lines (shuffled,
except `run`'s numbered table), and the envelope lists it under `untrusted`.

### Honest limits

- **A hostile page can lie.** It can label a Delete button "Close". The lexicons, raisers, veto list and agreement
  gates make that harder, not impossible.
- **The high-risk gate is advisory, not a boundary.** `act-high-risk` is a separate verb so that your agent host can
  ask you before it runs. Configure that:
  - Claude Code, in `settings.json`:
    ```json
    { "permissions": { "ask": ["Bash(refsure act-high-risk:*)"] } }
    ```
  - Codex, in a rules file such as `~/.codex/rules/default.rules`:
    ```starlark
    prefix_rule(
        pattern = ["refsure", "act-high-risk"],
        decision = "prompt",
        justification = "refsure act-high-risk clicks money, irreversible, auth or consent controls",
    )
    ```

  An agent in bypass or full-auto mode, or one that calls the bundle directly (`node …/refsure.mjs act-high-risk …`),
  skips that prompt. So can an agent that clicks with raw `orca click` or `agent-browser click`, which refsure never
  sees.
- **Consent is a disclosure, not a control.** An agent can fake the typed `setup` step.
- **Redaction is pattern-based.** It catches common secret shapes and PII, not every secret a page can show. Use
  `denyOrigins`, `requireIsolatedProfile` and `--dry-run` for sensitive sites.
- **Provider retention is out of refsure's hands.** See the disclosure above.
- **The agent-browser backend knows less about a page.**
  - It reports no browser profile, so `requireIsolatedProfile` refuses every Decision there (`origin_denied`): refsure
    cannot prove the session runs in an isolated profile. Open sessions without `--profile`, which gives a fresh one.
  - It reports no load error or certificate failure, so `triage` and `state` see only what the page shows.
  - It acts on the session's active tab. A ticket records that tab's id: if another tab is active by the time you
    `act`, even one with the same URL, `act` answers `page_changed` (exit 12) and clicks nothing. A mark records no
    tab, so `outcome --mark` compares whatever tab is active.
  - A `fill` or `select` value travels inside a `batch` command's JSON argv, which agent-browser takes literally, so
    a value that starts with `-` is filled as typed.

## Calibration status

refsure is **0.x**. Every envelope that carries a Decision reports the site's `maturity`:

| Maturity | Meaning | Authority to act |
|---|---|---|
| `measured` | a `calibration.json` entry matches this site, provider, wording hash, line format 1 and model family | `write` |
| `inherited` | the wording was measured before, but not on refsure's input shape or this model | `write` for `locate --recorded`; for `dismiss`, only when the close/reject lexicon also matches the pick (or with `agree`) |
| `experimental` | a wording no release has measured yet (`pick-option`, a custom `state --state` set) | `write` only at confidence ≥0.85 **and** code corroboration; otherwise `read` |

**Where it stands in 0.1.0.** Measured on 2026-10-15 with Jev `jev-1.13-20260917` through OpenRouter, on the
wordings this release ships. Two kinds of evidence were pooled:

- **Converted:** labelled sets from the author's earlier work (not published), reshaped to refsure's line format.
- **Orca-native:** stored pages served locally in an isolated Orca profile and read through refsure's own adapter.
  The four refsure-authored sets (`locate_native`, `dismiss_injected`, `pii_masks`, `presence_false`) live in
  `tools/calibrate/sets/` with their pages and labelling notes.

A row is the lowest confidence whose fitted precision is at least 0.99 with at least 10 answers above it, and it is
never looser than the starting row. "Right of acted" counts calls at the shipped row (or, for a held site, the row it
reads instead), with the Wilson 95 % lower bound in brackets. Several calls ask the same page, so the page count is
the honest sample size.

| Site | Asked by | Maturity | Threshold | Pages per set | Calls | Right of acted (Wilson low) | Coverage |
|---|---|---|---|---|---|---|---|
| `locate` | `locate --recorded` | `measured` | 0.89 at every risk | browser_locate 428 (converted); vision_locate 96, of which 24 reached the model | 3996 | 2056 of 2056 (0.998) | 51.5 % |
| `find` | `locate --intent`, `verify-target` | `measured` | read 0.61, write 0.8, consent, auth, money and irreversible 0.85; 0.85 without `--risk` | locate_native 40 | 240 | 185 of 185 (0.980) | 77.1 % |
| `outcome` | `outcome`, `act --verify` | `measured` | yes at ≥0.93, no at ≤0.15 | browser_outcome 143 (converted) | 1287 | 447 of 447 (0.992) | 34.7 % |
| `dismiss` | `dismiss` | `inherited` (held) | 0.6, with the close/reject lexicon or `agree` | browser_dismiss 59 (converted); dismiss_injected 40 and vision_dismiss 50, of which 35 and 15 reached the model | 831 | no row ships; at 0.6, 331 of 335 converted (0.970) | |
| `page-state` | `state --expect` | `inherited` (held) | 0.8 | browser_page_state 117 (converted); pii_masks 29, each asked with masks on and off; vision_page_state 64 | 1785 | no row ships; at 0.8, 899 of 909 converted (0.980), 357 of 357 on Orca pages whose text carries the answer (0.989), 131 of 275 on pages that show it only in pixels (0.418) | |
| `presence` | `wait-for`, `doctor --ping` | `inherited` (held) | yes at ≥0.85, no at ≤0.15 | presence_false 40; vision_presence 68 | 648 | no row ships; on text pages 126 of 126 at yes ≥0.92 (0.970); on pixel-only pages 18 of 36 (0.345) | |
| `option-map` | `pick-option` | `experimental` | 0.8 | none | 0 | not measured | |
| `step` | `run` | `experimental` | the most likely operation (DONE and BLOCKED at 0.5); its target the most likely row at ≥0.3 and above none, at read and write alike (every act is at least write; high risk refuses whatever the probability); done yes at ≥0.85 | none | 0 | not measured | |

OpenAI (`gpt-6-luna`), which may answer `state` and `wait-for`, was not measured in this pass: its answers run at
the declared maturity on the starting rows. A new model family gets no authority at all: its answers are reported as
`proposed` until a release re-measures it. A complete answer that names no model counts as a new family too, reported
as `unnamed`. A new dated snapshot within the same family keeps its maturity, adds
`model_changed` to the envelope and raises a `doctor` warning.

**What blocks 1.0.** refsure becomes 1.0 when every site passes an Orca-native replay. Per site:

- `locate`: nothing in its numbers. Most of its evidence is converted; the Orca-native part is 24 pages, 43 of 43
  right (0.918). A lower write row (0.8) is an open question, so every risk uses 0.89 until it is settled.
- `find`: passes, but on 40 synthetic pages. A Wilson low of 0.980 is under the 0.99 target, so the set is too
  small to prove it. No risk class has 10 pages with a wrong answer, so only the read row is fitted; the others are
  the starting rows.
- `outcome`: blocks 1.0. Its shipped row comes from converted inputs only; the stored vision set was not replayed
  (an outcome needs the action between two reads, and 47 of its 59 items fail only visually). On refsure's
  Orca-native outcome set N5 (`tools/bench`: each step's before and after pages read through refsure's Orca adapter
  in an isolated profile, built into the input `outcome` sends), Jev's yes ≥0.93 row holds at a precision target of
  0.95 only, not 0.99. So outcome has no row at P=0.99 on Orca pages; its converted entry still ships for 0.x.
- `dismiss`: held for a maintainer decision on the row. The fit gives 0.97, because it counts picks that the
  never-click veto refuses before any click: every wrong pick at 0.6 or more is "Manage settings" on one injected
  wall, and leaving vetoed picks out, 187 of 187 native picks at 0.6 were right. At 0.97 it abstains on a plain
  cookie wall ("Reject all" at 0.95). One code limit showed up: the overlay finder misses overlays with no dialog
  role and no consent wording (32 of the 50 vision pages). The veto's refusal of the French "Continuer sans
  accepter", also found in this pass, is fixed: a negation right before an accept term now reads as a reject.
- `page-state`: no score below 1.0 reaches 0.99. One bot-check page read as an error page holds 9 of the 10
  converted wrong answers at 0.8 or more. On pages whose error or block shows only in pixels, the text reads as
  `expected`, 76 times at confidence 1.0. The choice left: a stated text-only scope, the cumulative row 0.82, or
  per-state rows. PII masks on and off agree on 28 of 29 pages.
- `presence`: no yes edge reaches 0.99. On pixel-only pages it reports false presents, for example a toast faded to
  opacity 0 that the text still carries. It needs the same text-only scope decision as `page-state`. refsure cannot
  tell a pixel-only page apart at run time today.
- `option-map`: no labelled set yet.
- OpenAI answers at `page-state` and `presence`: not measured.

Each `calibration.json` entry carries its provenance: site, set sha256, wording hash, line format, model family,
provider, threshold, the number of items, coverage and precision at P=0.99, the Wilson bound, and date. A site with
no shipped row has a `held` record there instead, with the reason and both readings; refsure reads only `entries`.
The four refsure-authored sets were labelled blind and matched the frozen gold on 40 of 40 (`locate_native`), 40 of
40 (`dismiss_injected`), 29 of 29 (`pii_masks`) and 39 of 40 (`presence_false`, one labeller slip, kept as
authored). The calibration harness lives in `tools/calibrate/` and is not part of the npm package. No third-party
dataset is committed.

## Agent skill install

The skill teaches an agent when to call which verb and how to read the envelope. Install it for Claude Code and
Codex with the community skills CLI, the same version Orca 1.4.230 uses for its own skills:

```sh
npx --yes skills@1.7.2 add https://github.com/leovvay/leovvayRefsure --skill refsure --global --agent claude-code --agent codex -y
```

Or print the copy bundled with your installed binary and put it where your agent loads skills. `skill print` writes
the file itself, byte for byte, not an envelope:

```sh
mkdir -p ~/.claude/skills/refsure && refsure skill print > ~/.claude/skills/refsure/SKILL.md
```

Teams on Orca can also share it with `orca skills share`.

The skill's frontmatter carries `refsure-skill: 1`, the envelope major. `refsure doctor` reads every installed copy
under `~/.claude/skills/refsure/`, `~/.codex/skills/refsure/` and `~/.agents/skills/refsure/` and reports it in its
`skill_stale` check:

- a copy with the same major passes;
- a copy with another major, none in its frontmatter, or a value that is not a whole number fails the check
  (`result.failed` lists `skill_stale`). The detail names each stale copy and why, and ends with one command that
  refreshes every stale copy a write can reach (`refsure skill print > <path>`, or
  `refsure skill print | tee <path> <path> > /dev/null`). A FIFO or folder at a skill path is reported, never read, and
  left out of that command (a redirect into a FIFO blocks, into a folder fails); remove it, then refresh;
- no copy at all passes: the skill is optional.

Minor details come from `refsure commands --json` at run time, so a skill installed from the repository and a pinned
npm binary can drift safely.

## Orca hook: input in hidden tabs

refsure paints a hidden page itself before its own acts (see [Backends](#backends)). An agent that also drives Orca's
browser with its own `orca` commands meets the same problem: when its tab is not on screen, some of its clicks and
keys silently do nothing, and a few commands hang the tab. The usual way out, `orca tab switch --focus`, takes the
human's view with it. The repository ships a hook for Claude Code and Codex, `orca-hidden-tab-input`, that makes that
input land in a tab nobody is looking at. It adds behaviour and takes nothing away: it never blocks or rewrites a
command.

Upstream tracks the problem as [stablyai/orca#27309](https://github.com/stablyai/orca/issues/27309), with a proposed
fix in [#27310](https://github.com/stablyai/orca/pull/27310). The hook is a stopgap until Orca fixes it. When that
happens, the hook only costs its 0.2 s check.

### The problem, measured

<img src="docs/art/hidden-tab.png" width="100%" alt="Orca alone: a page loaded in a hidden tab, a click, ok true, the page saw 0 clicks after 5.5 seconds. With refsure: the page is painted once, the click lands in 0.3 seconds, and the tab never comes on screen">

<sub>Measured on Orca 1.4.230, 2026-10-20, with <code>tools/orca-hidden-tab/repro.sh</code>. The paint is one tiny
screenshot, deleted at once.</sub>

refsure's own commands paint the page the same way. On a page loaded in a hidden tab, `refsure do --click "Press"`
took 2.6 s for the whole step (read, find, paint, click) and the click landed; the build before the paint step answered
`done` after 7.4 s while the page saw no click (Orca 1.4.230, 2026-10-20).

Orca hides browser tabs that are off screen with `display:none`. A page that loads while its tab is hidden (any new
page load; measured after `orca goto`) is never painted. Chromium drops, delays or stalls input sent to a page that
has never painted, and Orca usually still answers `ok: true`.

Measured on Orca 1.4.230 (macOS) for each input command, on a page loaded in a hidden tab. Each row held in two runs
(`select-all`: one valid run without a paint; `mouse wheel`: one run after a paint); the right column was painted
with `orca screenshot`. A final run in which the hook itself painted the page gave the same right column for every
command the hook handles except `uncheck` and `download`, which that run did not include:

| Command | Page never painted, no hook | After one paint |
| --- | --- | --- |
| `click`, `dblclick`, `find ... --action click`, `exec "click ..."` | `ok: true` after about 5.5 s; the page sees a `mouseover` but no `mousedown` or `click` | lands in about 0.3 s |
| `mouse move` / `down` / `up` | `ok: true` after about 5.5 s, no `mousedown` | lands |
| `type`, `inserttext`, `keypress`, `select-all` | `ok: true` at once, no key reaches the page | lands |
| `hover`, `check`, `uncheck` | lands, but takes about 5.5 s | lands in about 0.3-0.6 s |
| `drag`, `mouse wheel`, `download` | no answer within 15 s, and the next command for that tab timed out too; one tab was still stuck after 8 minutes and recovered only when closed | `drag` and `mouse wheel` land in under 0.7 s; `download` returns in about 1.3-1.5 s* |
| `focus`, `fill`, `select`, `clear`, `scroll`, `scrollintoview`, `upload` | work | not needed; the hook leaves these alone |

\* In these runs Orca 1.4.230 then reported "Downloaded file not found" for both a `data:` and an `http:` link. That
is a separate Orca problem the hook does not fix.

A page that painted before its tab was hidden (for example, the first page of a tab made by `orca tab create`, which
Orca keeps painting for its first 10 s) is not affected.

### What the hook runs

Before an `orca` command from the first five rows of the table (`click`, `dblclick`, `hover`, `check`, `uncheck`,
`type`, `inserttext`, `keypress`, `select-all`, `mouse`, `drag`, `find`, `download`, `exec`), up to three per Bash
call, the hook asks the target page how many paint entries it has. If the page has never painted, it takes one small
screenshot through Orca, which paints the page for the capture without showing the tab, and the agent's command that
follows lands. The screenshot goes to a temporary file that the hook deletes. Each page load is painted at most once.

Hooks run before your permission prompt, so this one runs only two Orca commands, against the page and worktree the
agent's command names:

- `orca eval --expression "performance.getEntriesByType('paint').length+' '+performance.timeOrigin"`
- `orca exec --command "screenshot <temporary file> --screenshot-format jpeg --screenshot-quality 1"`, only when the
  first answers 0

It uses the `orca` on your `PATH` or the one inside `/Applications/Orca.app`, never a file the agent's command names
by path unless it is that same `orca`. It sends nothing over the network. It keeps a list of the last 200 documents
it painted (the `--page` id, or the worktree selector or working directory when there is none, plus the document's
time origin) in a private directory under `$TMPDIR`. It prints nothing and exits 0 whatever happens. Measured cost
per Bash call: under 0.01 s for a command that does not run `orca`, about 0.05 s for an `orca` command that sends no
input, about 0.2 s for an input command on a page that has painted, and about 0.5 s when the hook paints the page.

It needs macOS (tested on macOS 27 with Orca 1.4.230, Claude Code 2.1.304 and Codex CLI 0.162.1; on other systems
the hook does nothing), `python3` 3.8 or newer, and agents running in Orca terminals, where `orca` is on `PATH`.

### Install the hook

**Claude Code, as a plugin.** This repository is also a plugin marketplace, `refsure`:

```
/plugin marketplace add https://github.com/leovvay/leovvayRefsure.git
/plugin install orca-hidden-tab-input@refsure
```

From a shell: `claude plugin marketplace add https://github.com/leovvay/leovvayRefsure.git`, then
`claude plugin install orca-hidden-tab-input@refsure` (`-s user|project|local` picks the scope). Claude Code 2.1.275
or later also takes one step: `/plugin install orca-hidden-tab-input --marketplace leovvay/leovvayRefsure`. Start a
new session afterwards. The plugin adds a `PreToolUse` hook on `Bash`.

**Claude Code, by hand.** The hook ships in the npm package: after `npm i -g @leovvay/refsure` it is in
`$(npm root -g)/@leovvay/refsure/plugins/orca-hidden-tab-input/hooks/` (`orca-hidden-tab-input.sh`,
`orca_hidden_tab_input.py`, `hooks.json`), or in `plugins/orca-hidden-tab-input/hooks/` of a clone. Merge this entry
into the `hooks.PreToolUse` list in `~/.claude/settings.json` (keep your other hooks), with your path:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash \"/path/to/orca-hidden-tab-input/hooks/orca-hidden-tab-input.sh\"", "timeout": 10 }
        ]
      }
    ]
  }
}
```

**Codex.**

1. Copy the two files from that `hooks/` folder (the `.sh` and the `.py`) into one directory, for example
   `~/.codex/hooks/orca-hidden-tab-input/`. Keep them together. The `.sh` finds the `.py` beside its real file, so a
   symlink to it works too.
2. Merge this entry into the `hooks.PreToolUse` list in `~/.codex/hooks.json` (create the file if it does not exist;
   keep the hooks already there):

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "^Bash$",
           "hooks": [
             { "type": "command", "command": "bash \"/Users/you/.codex/hooks/orca-hidden-tab-input/orca-hidden-tab-input.sh\"", "timeout": 10 }
           ]
         }
       ]
     }
   }
   ```

3. Codex runs a new hook only after you trust it. Start `codex`, open `/hooks` and trust this one.
4. Restart the Codex panes in Orca. Orca copies `~/.codex/hooks.json` and your trust decisions into the Codex homes it
   manages when it launches a pane.

Changing the hook's path, matcher or timeout in `hooks.json` asks for trust again; changing the script does not.

### Check it on your machine

In an Orca terminal, from a clone of this repository:

```sh
tools/orca-hidden-tab/repro.sh
```

It opens one tab in the current worktree without switching to it, loads a page while the tab is hidden, clicks
without the hook and then with it, and closes the tab. Expected output: the first click takes about 5.5 s and the page
sees 0 clicks; after the hook the click takes under a second and the page sees 1.

`repro.sh` runs the hook from the clone, so it shows that the hook works with your Orca, not that your agent runs it.
To check that, open `/hooks` in Claude Code or Codex and look for the `PreToolUse` entry (Codex must show it as
trusted). Or start the agent with `ORCA_HIDDEN_TAB_INPUT_LOG=/tmp/orca-hidden-tab-input.log` and let it click
something in an Orca tab: the file gets one line per check (the page id, the worktree selector and the paint count,
never page content).

### Turn it off, update, uninstall

- **Off:** `ORCA_HIDDEN_TAB_INPUT=off` in the agent's environment disables the hook without uninstalling it.
- **Update the plugin:** `claude plugin marketplace update refsure`, then
  `claude plugin update orca-hidden-tab-input@refsure`, and start a new session. Claude Code updates the plugin when
  the `version` in its `plugin.json` changes.
- **Update by hand:** update refsure (`npm i -g @leovvay/refsure`) or `git pull` your clone. For Codex, copy both
  files again; Codex does not ask for trust again, because the entry in `hooks.json` did not change.
- **Uninstall:** `claude plugin uninstall orca-hidden-tab-input@refsure` (in a session,
  `/plugin uninstall orca-hidden-tab-input@refsure`), and `claude plugin marketplace remove refsure` to forget the
  marketplace too; or remove the `PreToolUse` entries you added. Start new sessions, then delete any files you copied.
  Deleting them first can make sessions that are still running report a hook error on Bash calls until they restart.

### Limitations

- **One shell call, one page state.** The hook runs before the whole command. In `orca goto ... && orca click ...` it
  prepares the page that was there before `goto`, not the one `goto` loads. Run navigation and the input that follows
  as separate tool calls.
- **Only what the agent types.** The hook reads the agent's Bash command. It does not see `orca` calls made inside a
  script the agent runs (refsure paints for its own calls), it skips a command whose `--page` it cannot know in
  advance (`--page "$(...)"`) entirely, and it prepares at most three pages per Bash call within a 7 s budget.
- **Pass `--page`.** Without it, Orca picks the active tab of the worktree that contains the current directory. The
  hook follows `cd` in the same command, but not a working directory Codex sets outside the command.
- **A missed command can still hang a tab.** If the hook does not see a `drag`, `mouse wheel` or `download` (see the
  two points above) and the page has never painted, that tab stops answering. Close it with
  `orca tab close --page <id>`.
- **Animations still stall.** After the one paint the tab is hidden again and does not run animation frames. Users
  report that menus with exit animations and some dialogs get stuck in hidden tabs (see
  [stablyai/orca#27309](https://github.com/stablyai/orca/issues/27309)). The hook does not change that.
- **It relies on Orca internals.** It depends on a screenshot painting a hidden page (Orca's capture paint hold,
  added in [stablyai/orca#22534](https://github.com/stablyai/orca/pull/22534)) and on `orca exec` passing a command
  to agent-browser. A new Orca version can change either. refsure's own paint step depends on the same two.
- **It does not stop agents from switching your view.** `orca tab switch --focus` and similar commands still do
  what they do in Orca.

## Contributing and security

- [CONTRIBUTING.md](CONTRIBUTING.md): add a Decision site, a verb or a language.
- [SECURITY.md](SECURITY.md): report a vulnerability privately.

## Licence

MIT. Copyright (c) 2026 Vladyslav Leonchyk. See [LICENSE](LICENSE).
