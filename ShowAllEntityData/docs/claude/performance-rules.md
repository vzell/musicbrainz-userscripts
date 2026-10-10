<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# Performance rules

## Performance is a priority

**Performance is a gate, not an afterthought. If a change would make filtering,
sorting, rendering, or artwork throughput worse, flag it BEFORE implementing and
let the user decide** — including when the change is otherwise correct and the
regression is the price of correctness. Say what gets slower, by roughly how
much, and what the alternative would be.

- `PERFORMANCE.org` holds the measurements and the numbered Steps. Its
  TODO/DONE keyword tracks "landed on `main`", not effort.
- **Re-read `PERFORMANCE.org` for what your change made FALSE — when you
  implement, and again when you merge — and fix what it says, not just the
  keyword.** The file is written as prediction and plan, so landing a Step
  routinely invalidates prose several sections away that nothing will flag: a
  sibling Step's prerequisite, a "still TODO" aside, a stated blocker, a
  prediction about which primitive you would reuse. Merging 9.99.1049 (Steps 3
  and 22) falsified six such statements — Step 8 became fully DONE by
  construction, Step 6's scope narrowed to a single caller, and Step 4's "Step 3
  will key off the same primitive" turned out backwards, since Step 3 needs an
  order-INDEPENDENT key and Step 4 cannot have one. None of that surfaces from
  flipping a keyword.
- **Derive the "DONE set is exactly Steps …" sentence from the keywords, never
  by hand.** It has drifted twice, in both directions. `scripts/audit-docs.py`
  derives it and fails on a mismatch, so run that rather than counting; it also
  catches a step whose keyword reads DONE while its body still says "Still TODO
  on `main`", and an "IN PROGRESS" section naming a branch that is gone. It is
  the mechanical half of the re-read only — a step whose bug description is no
  longer true reads perfectly well to a script (Step 25 did, for four commits
  after 9.99.1100 fixed it).
- **`PERFORMANCE.org` carries NO `~:NNNNN~` line references, and
  `audit-docs.py` fails if one reappears.** It used to carry 118, and a survey
  on 2026-09-20 found them all pointing at unrelated code — measurably so for
  the 32 that paired a symbol with a number, of which **0** still resolved
  within ±2 lines. The file
  had even recorded that conclusion for one paragraph of Step 30 on its own
  ("already ~600 lines stale before they were removed") without generalising
  it. This is the same rule, and the same reason, as the File-structure table
  above: the userscript grows on nearly every commit, so a number is stale
  within days and is worse than nothing, because it reads as precise. Name the
  symbol; where a pointer cannot be recovered, rewrite the sentence to stand
  without one rather than guess an anchor. `scripts/strip-perf-line-refs.py`
  did the conversion and records which shapes were mechanical and which needed
  a judgement call.
- **Record the machine and the wall-clock time. Every timing, every time.**
  `capture-interaction-perf.js` and `capture-snapshots.js` write a `machine`
  block (hostname, cores, node and Playwright versions, plus `uptimeHours` and
  `claudeResident` — host conditions that are not hardware but move timings,
  added after a same-version cross-machine arm came back 1.5-1.85x apart with
  neither box's uptime on record) plus UTC `startedAt`/`finishedAt` into their
  JSON, and every measurement that ends up in prose — a commit message,
  `PERFORMANCE.org`, `DEBUG-NOTES.md` — must name the host and when it ran. The time matters because every sample fetches its
  page shell from the live site, so "was MusicBrainz busy at that hour" is a
  standing hypothesis for any unexplained difference — one that can only be
  tested against runs that recorded when they happened. A number with no machine attached cannot be compared to a later one,
  so it is not evidence. This rule exists because a 1.5-2x gap between two
  `main` arms could not be resolved at all: nothing recorded which machine
  either ran on, so it was attributed first to machine state and then to
  concurrent load, both guesses, and the second was disproved. Mark an unknown
  host as unknown rather than inferring it — at least one archived arm is known
  to be from a different machine.
- **Filenames carry version, capture date, and hostname too, not just the
  JSON content.** `interaction-perf-<branch>-<version>-<capturedAt>[-
  <hostname>].json` and `perf-baseline-<version>-<capturedAt>[-
  <hostname>].json` (the latter written alongside the single mutable
  `perf-baseline.json` that `--perf`'s own WARN/FAIL verdict compares
  against — that one file's name stays plain since it is the comparison
  target, not an archived arm). `<hostname>` is omitted, not guessed, when
  `os.hostname()` isn't a meaningful identifier. This exists because the
  branch-only naming let a same-named file get silently overwritten by a
  later machine's run — `interaction-perf-main.json` had already lost its
  original 9.99.1045 data to a 9.99.1048 overwrite once, and had no
  `machine` block at all by the time it was finally retired.
- **`tests/MEASUREMENTS.org` is the log**: every timing, wall clock and count,
  with its host, what it was probing, and — for anything naming a page, a URL or
  a `rendered.html` — that page's pageType, `tableMode` and human title. Add a
  row there when you measure something, rather than leaving it in a commit
  message where the next person will not find it.
- The `run-perf-comparison` skill runs and interprets the instrumentation.
- Committed baselines: `tests/snapshots/artist-events/interaction-perf-*.json`
  (interaction latency) and `tests/snapshots/artist-releasegroups/perf-baseline*.json`
  (end-to-end fetch/render). Both are medians of 5 samples, kept as one file
  per arm (branch/label + version + capture date [+ hostname]).
- Current `main` reference point, on the 4174-row `artist-events` disk fixture,
  captured 2026-09-08 at 9.99.1048: global filter ~3033 ms, column filter
  ~3295 ms, sort ~6410 ms, uniq-dropdown ~45 996 ms cold / ~1676 ms warm,
  header counts ~8033 ms initial / ~12 319 ms restore. Re-measure rather than
  trusting these if a decision hinges on them. That arm is `petri`; the
  current-version one is **`NB-3641`, 9.99.1111, 2026-09-18**: global filter
  ~1759 ms, column filter ~1802 ms, sort ~3697 ms, uniq-dropdown ~30 972 ms cold
  / ~803 ms warm, header counts ~5663 ms initial / ~5501 ms restore. The two are
  DIFFERENT HOSTS and are not comparable to each other — that is the point of
  the next bullet, not an exception to it.
- **Never quote an absolute across versions or sessions — capture your own
  `main` arm alongside your branch's, in one session.** `main` measured
  1735/1730/3968/31149/863 at 9.99.1045 and roughly twice that at 9.99.1048,
  which looked like a regression across three versions. It was not: re-running
  the SAME 9.99.1045 script on `petri` produced 3117/3285/6044/42948/1640,
  within noise of 9.99.1048. The whole ~2x is environment, and the older arm
  never recorded its host, so what changed cannot now be recovered. Two things
  follow — quote only within-session A/B ratios, and **bisect before attributing
  a gap to anything, in either direction**; the environment guess happened to be
  right here, and was still a guess until it was measured. Full workings in
  `tests/MEASUREMENTS.org`.
- `capture-interaction-perf.js` also reports `headerCountsInitial` and
  `headerCountsRestore` — the column-header count scan timed directly rather
  than as main-thread pressure on a status-text poll. Both carry a ~1 s floor
  from `waitForColHeaderCountsStable()`, identical on every arm.

Note the warm uniq-dropdown figure: it was ~29 700 ms before caching landed. A
change that reverts a win that large should be impossible to make by accident,
which is the reason these baselines are committed.

**Typing is measured separately (2026-10-10).** The `globalFilter` /
`columnFilter` metrics above are SINGLE-pass numbers: they type with no delay,
so the debounce swallows every key but the last. What a person typing feels is
`capture-interaction-perf.js --only=typed` (`--typing-delays=150,400`): the
slowest keystroke (Event Timing), the longest animation frame and task, the
wait after the last key, and the passes run. 150 ms is under the debounce (one
pass), 400 ms over it (a key lands inside a running pass). Run it through
`scripts/run-perf-arms.py … -- --only=typed` (own ETA history) and tabulate
with `scripts/summarize-typed-perf.py <label>…`. To find out WHY a keystroke
is slow, `tests/support/probe-keystroke-cost.js` traces typing right after the
render and once the header counts settle and lists every slow main-thread task
with what ran in it; `--css=` / `--init=` try a remedy without touching the
userscript. That probe is how Steps 37 and 38 were found.
