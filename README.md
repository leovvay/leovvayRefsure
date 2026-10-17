# refsure

Decision-backed browser judgment for AI agents that drive the embedded browser of the Orca ADE, or a standalone
`agent-browser` session.

`refsure` is a command-line tool plus an agent skill. Claude Code, Codex and other agents running in Orca terminals,
or beside an `agent-browser` session, call it while they work in a browser tab. It answers the questions agents most
often get wrong, or burn tokens on:

- Which control on this page means X?
- How do I get past this cookie banner or pop-up?
- What state is the page in: the page I wanted, a sign-in wall, a rate limit, an error?
- Did my click or form submit actually land?
- Does the page now show what I am waiting for?

You bring your own API key (BYOK). Nothing runs as a service, and there is no account.

> **Status: 0.x.** Three Decision sites are `measured` on Jev: `locate`, `find` and `outcome`. `dismiss`, `page-state`
> and `presence` still run on starting thresholds carried over from the author's earlier decision code,
> `pick-option` is experimental, and no OpenAI answer is measured. See [Calibration status](#calibration-status).

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

## Install

Requires Node 22 or newer.

```sh
npm i -g @leovvay/refsure
refsure doctor
```

Install it globally. Agents call refsure many times per task, and `npx` adds package resolution time to every call.

### Backends

refsure drives one of two browser backends. `refsure doctor` names the one it chose, and why.

| Backend | Chosen when | The page (`--page`) |
|---|---|---|
| Orca's embedded browser, through the typed verbs of the `orca` CLI | `ORCA_WORKTREE_ID` is set (an Orca terminal), or `REFSURE_BACKEND=orca` | a browser page id; else `REFSURE_PAGE`, else this worktree's current tab |
| A standalone `agent-browser` session | `REFSURE_BACKEND=agent-browser`, or outside an Orca terminal when an `agent-browser` binary is found | a session name; else `REFSURE_PAGE`, else the session `default` |

- **Orca:** refsure looks for the binary in `$ORCA_CLI_BIN_DIR/orca`, then `orca` on `PATH`, then
  `/Applications/Orca.app/Contents/Resources/bin/orca` (an executable file; a directory of that name does not
  count). Page commands outside an Orca terminal answer `not_in_orca_terminal` (exit 24); the worktree guard has no
  fallback.
- **agent-browser:** refsure uses `agent-browser` on `PATH` first, then the copy Orca bundles
  (`/Applications/Orca.app/Contents/Resources/agent-browser-<platform>-<arch>`). It drives only a session you opened
  yourself, and acts on that session's active tab:

  ```sh
  agent-browser --session work open https://example.com
  refsure state --page work --expect "the example home page"
  ```

  agent-browser launches a browser for any page command on a session that has none, and its reply does not say
  so. So before every page call refsure checks that the session's browser is running, with two calls that never
  launch one (`session list`, then `stream status`); when it is not (closed, crashed), the command answers `no_tab`
  (exit 20) and no browser is started. The call itself runs as one `batch` that repeats that check: if the browser
  went away in the instant between, agent-browser starts a new one to answer, and refsure discards the answer
  (`no_tab`, or `effect_unknown` for an act that may have reached it). A session closed a moment before refsure's
  check or call can make agent-browser start a new daemon for it; a daemon refsure's call starts has a 0.5 s idle
  timeout, so that one exits by itself (open the session again a second later, not at once, or your `open` lands in
  it and ends with it). A daemon of yours whose browser died in that instant keeps the new browser; close it with
  `agent-browser --session <name> close`. The check needs `stream status` (agent-browser 0.27). Each
  page call costs two agent-browser round trips (about 0.3 s). The capabilities come from `agent-browser --help`.

  agent-browser also sends launch settings (a profile, headed, a CDP target, auto-connect, a proxy) with every
  command, and a daemon whose session was launched with other values relaunches its browser to match. So refsure
  passes `--config` with an empty file of its own (no `~/.agent-browser/config.json`, no `./agent-browser.json` from
  its working directory) and none of agent-browser's environment (`AGENT_BROWSER_*` apart from the socket directory,
  `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`). It sends no launch setting, so it never relaunches a
  session with other ones, and a browser started in the race above gets agent-browser's defaults (headless, a fresh
  profile) or, in a daemon of yours, that daemon's own settings.
- With neither (no Orca terminal, no `agent-browser` binary), refsure falls back to Orca, which answers
  `not_in_orca_terminal`.
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
the mode to use; a stricter one such as `0400` also passes.

```sh
mkdir -p ~/.config/refsure && touch ~/.config/refsure/config.json && chmod 600 ~/.config/refsure/config.json
```

A key is named, never stored. Each entry under `keys` is either `{"env": "<VARIABLE>"}` or
`{"command": [argv…]}`. A command runs without a shell, with a 5 s timeout; its trimmed stdout is the key, and it is
never echoed.

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
- `refsure doctor` checks Node, the chosen browser backend (the `orca` or `agent-browser` binary, and its open
  sessions), keys (by name), consent, the config file mode, model drift and the installed skill. On Orca, its
  `orca_terminal` check reports the worktree (`ORCA_WORKTREE_ID`) on its own: a terminal outside Orca fails that
  check, and `orca_running` still reports Orca itself. `refsure doctor --ping` sends one synthetic Decision per
  configured provider.

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

A candidate line is `<role> "<name>" in="<section path>"`: no attributes, no values, no element ids.

**Size caps.** State ≤24,000 bytes and questions ≤12,000 bytes. Anything larger is refused as `oversize` before any
call is made. The one exception is a list of options that code built (`locate`, `dismiss`, `verify-target`,
`pick-option`): lines past the questions bound are cut from the end of the list, where a ranked list keeps its
weakest, so those verbs never refuse `oversize` for their own options. `pick-option` ranks its options first, so
the likeliest stay, and `--open` is never followed by an `oversize` refusal once it has clicked the list open.

**Never sent:** cookies, local or session storage, screenshots, API keys, values you typed or filled, textbox
values, console and network bodies. Text in an editable region (`contenteditable`: a comment box, a rich editor)
shows in the page text, so `outcome`, `act --verify`, `wait-for` and `mark` read each such region (up to 16) without
a snapshot and cut its text out; `state` cuts it by its snapshot. With more regions, or a backend that cannot read
them one by one, the page text is withheld from the Decision (note `typed_text_withheld`). So it is, `state`'s too,
when a typed text too short to cut out without cutting words (one or two characters: `42`, `OK`, one code cell)
shows in the page text as a word. `wait-for --text` and `outcome -- … --expect-text` still match the whole page
text, locally. `outcome --mark` compares the mark's text, cut the same way, so its `--expect-text` settles nothing
when either side's text was withheld.

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
provider and sends nothing, and it never clicks. It saves nothing locally either: `mark` returns `mark: null`, and
`forget` removes nothing and reports `would_remove`.

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

- `--page <value>`: Orca page id, or agent-browser session name; else REFSURE_PAGE, else the worktree's current tab (agent-browser: the session default)
- `--dry-run`: Print the exact redacted request; send nothing, do nothing
- `--help, -h`: Show this command's options
- `--json`: Accepted and ignored: output is one JSON envelope (skill print: the file itself)

### Core

| Command | Acts | What it does |
|---|---|---|
| `state` | never | Say which state the page is in: expected, login_wall, bot_challenge, error_page, blocking_modal, rate_limited or unexpected_page |
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
| `forget` | never | Clear this page's marks and tickets, or every page's with --all |
| `commands` | never | Describe every command: options, page and capability needs, Decision sites, whether it acts |
| `causes` | never | List every why.cause with its status and exit code, and every next.do |
| `skill` | never | Print the agent skill (SKILL.md) bundled with this version, as the file itself, not an envelope |

`Acts` is what a command may do in the page: `never`; `ticket`, only through a claimed single-use ticket after a
fresh recheck; `own-ref`, your own ref after a name and risk check; `high-risk`, the one path for money,
irreversible, auth and consent controls.

Never shipped: a goal loop, login, 2FA or CAPTCHA automation, screenshots or vision, a "failed" or "absent" verdict,
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
refsure wait-for --expect "<what should appear>" [--text <literal>] [--url <glob>] [--timeout 30s] [--interval 2s] [--max-decisions 10] [--agree]
```

- `--expect <value>`: What should appear, described in a few words (required)
- `--text <value>`: A literal that settles it by code once it is on the page
- `--url <value>`: A URL glob (* = any run) that settles it by code once the tab matches it
- `--timeout <value>`: How long to wait, as 10s, 90s or 2m; from 1s to 10m (default: 30s)
- `--interval <value>`: Time between polls, as 1s or 1500ms; from 1s to 5m (default: 2s)
- `--max-decisions <value>`: Provider calls the wait may make; 0 waits by code only (with --text or --url) (default: 10)
- `--agree`: Both providers must say present (needs both set up)

**`mark`** (runs on a page; no Decision)

```text
refsure mark [--label L]
```

- `--label <value>`: A label to show with the mark, up to 80 characters (display only)

**`snap`** (runs on a page; no Decision)

```text
refsure snap [--max-chars 4000] [--scope dialog|main|form] [--all]
```

- `--max-chars <value>`: Cut the lines at a line boundary past this many characters (default: 4000)
- `--scope <value>`: Only elements inside a dialog, main or form
- `--interactive`: Only interactive elements with a ref (default: true)
- `--all`: Every named node, not only interactive ones (overrides --interactive)

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

- `--all`: Clear every page's marks and tickets

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
| `locate`, `find`, `outcome`, `option-map` (`verify-target` uses `find`) | Jev only |
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
- `result.verdict` carries the answer: `landed`, `present`, `not_seen`, `proposed`, a state key, and so on.
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
| `no_tab` | `unavailable` | 20 | No browser tab: none is current, the page id is unknown, or the agent-browser session is closed. |
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
`retry_within`, `needs_human` or `stop`; `causes --json` lists the installed version's values as `next_do`. `argv[0]` is
always `refsure` or `orca`.

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
5. Money, irreversible, auth and consent controls never go through `act`, `outcome`, `dismiss` or `pick-option`.
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
| auth | sign in, password, 2FA, authorize, switch account; password forms; OAuth consent (`oauth`, `authorize` paths) | `act-high-risk` only |
| consent | accept, agree, allow cookies, opt in | `act-high-risk` only |

Names are matched against the union of all lexicons (English, Ukrainian, Russian, German, Spanish, French and
Polish), whatever the page language. Typographic apostrophes fold to a straight one (`J’accepte` reads as
`j'accepte`), and an `<input>` button with no text is named by its `value` (an image button by its `alt`), as the
snapshot names it. A name only ever lowers a control's class when it is, as a whole, a close, cancel or reject word
(`Close`, `Close dialog`, `No, cancel`): `Close project` and `Yes, cancel` keep their class. The path rules read the
URL's path and fragment and raise every control on the page, whatever its name: an OAuth consent screen names its
buttons neutrally, so on an `oauth` or `authorize` route a plain `Continue` reads auth, and so does its `Cancel`.

**Tickets.** `locate`, `dismiss` (when it proposes rather than clicks) and `pick-option` issue a single-use ticket
that lives 120 s and stores the element's fingerprint (role, name, section path, ordinal among twins), never its ref
number. `act` claims it, checks the URL, takes a fresh snapshot, finds the same element again, re-reads its risk, and
acts at once. If anything moved, nothing is clicked (`stale`). Two agents racing one ticket: exactly one wins, the
other gets `ticket_used`. Tickets and marks (a mark lives 15 minutes) are kept under `$XDG_STATE_HOME/refsure/`
(mode `0600`), and every call purges the expired ones first, even `--help`, `--version` or a usage error.

**Your own refs.** `outcome` and `act-high-risk --ref` take no snapshot, so your refs survive. `pick-option --open`
clicks your ref with no snapshot first, then takes one to read the options it lists (`earlier_refs_void: true`). All
three take `--expect-name`, and for `pick-option` it is required with `--open`: it must match the element's live text
(or its `aria-label`, `placeholder`, `title`, or an `<input>` button's `value`), and page raisers (a password field,
card fields) lift the risk class. Money, irreversible, auth and consent still refuse before the click, `--open`
included.

**Dismiss.** The overlay is found by code (the last `dialog` or `alertdialog` on the page, or else a cookie region
with at least two buttons; never a page `banner`). A veto list (accept, agree, allow, subscribe, buy, trial, enable,
upgrade, manage, settings, preferences, customize, in every lexicon) is never overridable. A negation right before an
accept term (`without`, `sans`, `ohne`, `sin`, `bez`, `без`) turns it into a reject, so `Continuer sans accepter`
(continue without accepting) can be clicked; it never turns a money, irreversible or auth term. Before the click,
`dismiss` finds its pick again on a fresh snapshot by fingerprint, on the same URL and tab, and reads the veto and the
risk again on the fresh element: if anything changed, nothing is clicked. After a click, the overlay must be gone,
else the result is `effect_unknown`. With `agree` (`--agree`, or the default when both providers are set up), Jev's
pick meets the veto, the twin rule and the risk read before the two answers are compared, so a vetoed, twinned or
high-risk pick names that cause (`veto`, `twins` or `high_risk_class`), never `disagree`.

**Injection.** Wordings are fixed and hashed. Page text appears only in state fields and in shuffled option lines,
and the envelope lists it under `untrusted`.

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
Codex:

```sh
npx --yes skills add https://github.com/kma-leovvay/leovvayRefsure --skill refsure --global --agent claude-code --agent codex -y
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

## Contributing and security

- [CONTRIBUTING.md](CONTRIBUTING.md): add a Decision site, a verb or a language.
- [SECURITY.md](SECURITY.md): report a vulnerability privately.

## Licence

MIT. Copyright (c) 2026 Vladyslav Leonchyk. See [LICENSE](LICENSE).
