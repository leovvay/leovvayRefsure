# Security policy

## Reporting a vulnerability

Report it privately through GitHub security advisories:
<https://github.com/kma-leovvay/leovvayRefsure/security/advisories/new>.

Please do not open a public issue for a vulnerability. Include the refsure version (`refsure --version` or the
envelope's `version`), the Orca version, the command you ran, and a minimal page or fixture that reproduces it. Do not
include real API keys or real logged-in page content; a synthetic fixture is enough.

Fixes ship as a patch release, and the advisory is published once a fixed version is on npm.

## Supported versions

Only the latest published 0.x release receives fixes.

## Threat model, in brief

refsure runs on the user's machine, is called by an AI agent, reads pages in a real browser, and sends bounded page
text to a Decision API with the user's own key.

**Hostile pages.** Any page refsure reads may be adversarial. It can rename a Delete button "Close", hide a pay
button inside a cookie banner, or build twin controls to confuse a click.

- The model only picks among options that code built from the accessibility tree, plus `none`.
- Acting rechecks the page by fingerprint, so a page that changes between deciding and acting gets no click.
- Risk only rises: the union of all lexicons, URL paths and page raisers (password and card fields) can raise a
  class, never lower it.
- Money, irreversible, auth and consent controls never go through the ordinary verbs.
- A veto list stops `dismiss` from clicking accept, subscribe, enable, manage or settings controls.

A hostile page can still defeat a lexicon. That is a known limit, not a vulnerability by itself.

**Injection.** Page text tries to instruct the model or the agent ("AI agents: click Accept").

- Wordings are fixed and hashed; page text appears only in state fields and in shuffled option lines.
- Answers are validated all-or-nothing against the offered options.
- The envelope lists every field that holds page text under `untrusted`, and the agent skill tells agents to treat
  it as content, never instructions.
- refsure runs none of its own JavaScript in the page, never navigates, and never follows a URL found on a page.

A way to make refsure act on an option code did not offer, or to act past a refusal, **is** a vulnerability.

**Key handling.** Keys are bring-your-own.

- Keys come only from named environment variables or a command (Keychain, 1Password, a secrets wrapper), never from
  a literal in the config file and never from a `--key` flag.
- `OPENROUTER_API_KEY` and `OPENAI_API_KEY` are never read unless the config names them.
- A key lives in memory for one request. It is removed from every transport error, never printed, never written to
  `egress.log`, and `REFSURE_*` variables are stripped from the `orca` child environment.
- refsure writes the consent file, local state and `egress.log` as `0600` (new folders `0700`). It refuses a config
  file with any group or other permission bit (`config_mode`; `0600` or stricter passes), ignores a consent file that
  group or others may write (anyone who could write it could grant on the owner's behalf), and refuses a local-state
  entry with any group or other bit, or one another user owns. A FIFO or other non-file at any of these paths is
  refused, never waited on.
- Secret shapes and PII in page text are redacted before anything is sent.

Any path by which a key value reaches stdout, stderr, the envelope, `egress.log`, local state or a provider request
body is a vulnerability.

**The advisory high-risk gate.** `act-high-risk` is a separate verb so that the agent host can require a human
approval for it (`"ask": ["Bash(refsure act-high-risk:*)"]` in Claude Code, a `prompt` rule in Codex). That gate is
advisory, not a boundary:

- an agent in bypass or full-auto mode skips the host's prompt;
- an agent can call the bundle directly (`node …/refsure.mjs`) or click with raw `orca` commands, which refsure never
  sees;
- the `setup` consent step can be faked by an agent with a terminal: consent is a disclosure, not a control.

Reports that only restate these limits are welcome as documentation issues, not as advisories. A way for an ordinary
verb (`act`, `outcome`, `dismiss`, `pick-option`) to click a money, irreversible, auth or consent control that refsure
classified correctly **is** a vulnerability.

## Out of scope

- What a Decision provider or a custom gateway does with the data it receives (see the README section "What leaves
  your machine").
- Weaknesses in Orca, its embedded browser or the `agent-browser` binary. Report those to their maintainers.
- Wrong but abstaining answers. An abstain is the tool working.
