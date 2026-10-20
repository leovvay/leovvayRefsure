# Agents with and without refsure: the fast path, 2026-10-17

The question: does a coding agent finish browser tasks faster with refsure than the same agent with the plain Orca
CLI? Measured by the author with this harness (`tools/bench/agent`, see `tools/bench/README.md`).

## Setup

- Two arms: `base` (the agent with the plain `orca` CLI) and `rs` (the same agent with the refsure skill and `refsure`
  on PATH).
- Two agents: Claude Code with Opus 5.5 and with Sonnet 5.5, effort high.
- The 12 fixture tasks of the N12 set, 2 repeats per arm and agent in each round: 24 runs per arm and agent per round.
- A fresh Orca tab per run, 8 runs at once, a 600 s limit per run.
- Decisions: Jev through OpenRouter.
- Reading: the agent's wall time per run, from its transcript's first entry to its reply. Scoring is code-only.
- refsure at `ac638d8` (rounds 7 and 8) and `a0b110e` (round 9).

## Result

Over rounds 7-9 pooled, 72 runs per arm and agent:

| | Opus 5.5 | Sonnet 5.5 |
| --- | --- | --- |
| total time, base / rs | 5802 s / 1516 s: **3.83x** | 4119 s / 1202 s: **3.43x** |
| each round, base / rs | 4.30x, 3.99x, 3.23x | 3.23x, 3.56x, 3.52x |
| median per task, the stuck task left out | about 2.2-2.3x | about 1.4x |
| tasks passed, base / rs | 70/72 / 70/72 | 71/72 / 72/72 |
| median agent turns per run, base / rs (each round) | 10 / 3.5-4 | 7-7.5 / 3 |
| median input tokens per run, base / rs (each round) | 0.67-0.68 M / 0.23-0.26 M | 0.49-0.52 M / 0.20 M |

Read it with these caveats:

- **Most of the total comes from one task.** One fixture is an export that never finishes. With refsure the agent
  reports the stall in 29-57 s; without it the agent polls for 4-10 minutes, and three Opus runs hit the 600 s limit.
- **Per task the gain is smaller:** about 2x on Opus and 1.4x on Sonnet. Sonnet without refsure is already fast on
  simple pages (17-20 s per task).
- **No wrong answer** in either arm. Two `rs` runs in round 8 failed the scoring rule that the first integer of the
  reply is the answer; the skill line added for round 9 ("report the answer first") took that to 0.
- The Jev Decisions cost about $0.0005 per 24 runs.
- Rounds 1-6, at earlier builds, came out at 2.71-3.62x (Opus) and 2.07-3.20x (Sonnet).
