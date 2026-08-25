---
name: run-perf-comparison
description: Run or interpret ShowAllEntityData's performance-comparison instrumentation (tests/support/capture-interaction-perf.js, capture-snapshots.js --perf, perf-baseline.json) to measure a change's real impact, or compare timings across branches (e.g. main vs perf-steps-1-4). Use this whenever the user asks to "run a perf comparison", "capture a perf baseline", "check if this change made things faster/slower", "compare perf between branches", or references PERFORMANCE.org's Steps and their measured impact.
---

# Running/interpreting the perf-comparison harness

There are two independent, purpose-built perf tools — don't conflate them:

| Tool | Measures | Scope |
|---|---|---|
| `node tests/support/capture-snapshots.js --perf` | Initial "Show all" fetch+render wall time (fetch/render stage split via `performance.mark()`) | `artist-releasegroups` only by default (its pilot pageType — pass `--only=<pageType>` to target another) |
| `node tests/support/capture-interaction-perf.js --pageType=artist-events` | Interaction latency: global filter, column filter, sort, uniq-dropdown open (cold vs warm) | `artist-events` only — hardcoded, not read from `tests/pagetypes.json` |

Both are standalone Node scripts (not Playwright tests) — run them
directly, not via `npm test`/`npm run test:live`.

## Non-goals (read before treating either as a gate)

Per `PERFORMANCE.org` and `tasks/task-playwright-html-snapshot-harness.md`'s
own "Explicit non-goals": **no CI integration, no automated pass/fail gate
blocking anything.** This is a manual, human-triggered measurement — at
least until the thresholds below have proven themselves not to be flaky
across enough real runs. Don't wire either script into a required check.

## Capturing a baseline / re-running for comparison

```
node tests/support/capture-snapshots.js --perf
```
Runs 5 samples, takes the median of wall/fetch/render time, writes
`tests/snapshots/artist-releasegroups/perf-baseline.json`, and prints a
verdict against whatever baseline was already committed:
- `ok` — within 25% of the committed baseline.
- `WARN (>25% slower than baseline)`.
- `FAIL (>3x baseline)` — also sets a non-zero exit code.

These thresholds are a starting point, not tuned (few real runs exist yet)
— treat a `WARN`/`FAIL` as "go look," not as ground truth on its own.

```
node tests/support/capture-interaction-perf.js --pageType=artist-events
```
Runs each interaction fresh per sample (no shared page state between
samples) via the committed `tests/fixtures/saved-data/artist-events.json.gz`
disk fixture — deterministic, no live 42-page fetch. Writes
`tests/snapshots/artist-events/interaction-perf-<branch>.json`, where
`<branch>` is auto-detected from the current git branch — **kept side by
side per branch, never overwritten** — so a `main` run and a
`perf-steps-1-4` run can be diffed directly.

## Comparing branches (the actual A/B workflow)

1. On `main`: `git checkout main` (confirm `git status` is clean first —
   see the repo-wide "before any command that could discard uncommitted
   work" convention), run
   `node tests/support/capture-interaction-perf.js --pageType=artist-events`.
   Confirms/produces `tests/snapshots/artist-events/interaction-perf-main.json`.
2. On the perf branch: `git checkout perf-steps-1-4`, run the same command.
   Produces `interaction-perf-perf-steps-1-4.json` alongside, not
   overwriting step 1's file.
3. Diff the two JSON files directly (`globalFilter`/`columnFilter`/`sort`/
   `uniqDropCold`/`uniqDropWarm` fields) — this is the actual "did the perf
   branch move the needle" answer. `PERFORMANCE.org`'s "Ranked areas +
   estimated impact" table gives the *predicted* magnitude per step
   (engineering estimates from operation-count analysis, not measured
   profiles) to sanity-check the real numbers against.
4. For the initial-fetch (not interaction) side, do the same with
   `capture-snapshots.js --perf`'s `perf-baseline.json` — but note it's a
   single mutable file per pageType (not branch-suffixed like the
   interaction-perf files), so capture `main`'s number and record it
   manually (or copy the file aside) before switching branches to re-run.

## Adding a new perf-comparison target pageType

Only do this if the target has a real, distinct performance question to
answer (large row count, a specific slow path) — `artist-events` was
deliberately picked as "42 native pages, 4174 rows, single-table" for
exactly this reason (see `tests/snapshots/registry.org`'s row for it).
Adding a second target means: a disk fixture (`capture-fixture.js`), a
shared-constants file mirroring `tests/support/artistEventsFixture.js`
(URL, fixture path, canonical filter/sort/uniq-drop targets — shared
between the interaction spec and both capture scripts so they can't drift
apart), and extending `capture-interaction-perf.js`'s currently-hardcoded
`--pageType=artist-events` handling to branch on the new target.

## How to drive this skill

> "Compare filter/sort perf between main and perf-steps-1-4 for
> artist-events."

Claude Code will run the interaction-perf capture on both branches (after
confirming git status is clean before each checkout), diff the resulting
JSON files, and report the deltas against `PERFORMANCE.org`'s predicted
impact per step — without treating either result as a pass/fail gate.
