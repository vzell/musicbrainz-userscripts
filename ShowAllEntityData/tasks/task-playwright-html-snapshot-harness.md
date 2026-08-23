# Task: HTML snapshot regression harness (pilot: artist-releasegroups, release-tracks)

## Context

Goal: for a given pageType, capture the rendered page's HTML before and after
a specific script change, so we can see at a glance whether that change
altered anything beyond what it was meant to — and separately, whether
MusicBrainz itself changed the underlying page layout (which would explain a
diff that has nothing to do with our script).

This reuses shared infrastructure from `discogs_credits/test/`: a
**repo-root** `.pw-profile/` persistent login (see
`discogs_credits/test/login.mjs` — if `.pw-profile/` doesn't already exist at
repo root, create it via the same one-time interactive flow; do not create a
separate profile for this script) and the `lib/`-split convention (browser
driving vs. verification/diff logic in separate files).

If `ShowAllEntityData/test/harness.mjs` already exists (from the earlier
unique-values-dropdown test task), reuse its `setupPage()`/`newContext()`
helpers and `window.__SA_TEST_MODE__` gating rather than re-implementing GM_*
stubbing and dependency injection here. If it doesn't exist yet, build the
minimal equivalent inline in this task's `lib/browser.js` (GM_getValue/
GM_setValue/GM_deleteValue/GM_addStyle/GM_info stubs + injecting
VZ_MBLibrary → iro → pako → ShowAllEntityData.user.js in that order) so this
task is self-contained regardless of build order.

## Pilot scope

Two page types, chosen for contrast — one `multi` tableMode without CAA
gating complications, one `multi` tableMode with the heaviest single-page
feature set in the script:

1. **`artist-releasegroups`** (`ShowAllEntityData.user.js` pageDefinitions
   entry #79) — `https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0`
   (Bruce Springsteen, standard "🧮 Artist RGs" branch — **not** the Various
   Artists / `va=1` branch). tableMode `multi`, renders into MB's native
   h3/table structure. Exercises: column erasers on Title (▶/jesus2099), CAA
   on Title, injected Relationships, numeric Year/Releases columns,
   collapsible CAA, tooltips, sticky/main Title. Note the internal pre-fetch
   pass (`?all=0&va=0/1`) the script runs before its main fetch to resolve
   "Official" release-group counts — the snapshot must wait for the *final*
   render, not this intermediate pass.

2. **`release-tracks`** (pageDefinitions entry #87) —
   `https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897`
   ("Born to Run", US 1975). **Gated behind the `sa_enable_release_tracks`
   setting** — the harness must seed this via the GM_setValue stub *before*
   the script's init runs, or the "Show all Tracks for Release" button never
   appears. tableMode `multi`, non-paginated. Uses the bespoke
   `applyExtractTrackTitleData()` AR-column engine (not the generic
   columnExtractor pipeline — see `CLAUDE.md`'s "release-tracks: dynamic
   AR-column classification" section before touching anything here).
   Exercises the largest single feature list in the reference doc: DOM
   decluttering (Yomo widget/work-button/settings-icon/medium-toolbox
   removal), inline credits, overflow-track loading, medium tracklist
   normalization, column eraser on Length, numeric #/Length/Rating, and
   collapsible ARs/Streaming/AcoustIDs/ISRCs/engineer-role/Mixed-at/
   Phonographic-copyright/Produced-for/Recorded-at/Recorded-in/Performer/
   Instruments/Vocals columns.

## Part 1 — `lib/snapshot.js`

Export:

- **`captureRaw(page, url)`** — navigates to `url`, waits for
  `domcontentloaded`, returns the page's `document.documentElement.outerHTML`
  *before* any userscript code runs. This is MB's own page, unmodified.

- **`captureRendered(page)`** — assumes the script has already been injected,
  triggered, and its render pipeline has completed (wait on the same
  completion signal identified for the uniq-dropdown test — check
  `startFetchingProcess`/`finalCleanup` for the right hook rather than a
  fixed timeout); returns `document.documentElement.outerHTML` at that point.

- **`scrub(html, pageType)`** — strips or placeholder-replaces known-volatile
  content *before* either snapshot is compared or written to disk. Start
  with a generic scrub list (apply to every pageType) plus a
  per-`pageType` override list you populate by actually inspecting each
  target page's raw HTML for volatile elements — do not guess at selectors
  without looking. Known candidate categories to check for on real MB pages:
  CSRF/nonce hidden inputs and inline `<script nonce="...">` attributes,
  "you have N alerts"-style notification counters, relative timestamps
  ("3 hours ago"), cache-busting query strings on asset URLs
  (`?v=...`/build hashes), and any per-request session-scoped identifiers in
  the markup. Document each entry with a one-line comment saying *what*
  volatile thing it targets and *why* it would otherwise produce a false
  diff — this list is exactly the kind of thing that silently rots if
  someone can't tell why an entry is there.

  **Known limitation to note in a comment, not solve in this pilot:** live
  MB data (e.g. an editor adding a new release group between two capture
  runs) will still show up as a real content diff unrelated to any script
  change. This scrub pass only removes *per-request* volatility, not
  *data* volatility. A stronger fix — replaying a previously captured
  `raw.html` via `page.route()` interception instead of hitting live MB on
  every re-capture — is a good Part 3/future task once this pilot proves
  the approach, but is out of scope here: don't build it now.

- **`diffSummary(before, after)`** — thin wrapper (a small line-diff is
  fine; check if a diff package is already a devDependency anywhere in the
  repo before adding a new one) returning whether the two are identical and,
  if not, a short line-count/preview summary for the console — the actual
  diff detail belongs to `git diff` on the committed snapshot files, not to
  this function's return value.

## Part 2 — `lib/browser.js` additions (or reuse from `harness.mjs`)

- A `seedGMValue(page, key, value)` helper (or extend the existing
  `addInitScript` GM stub) so `release-tracks`'s
  `sa_enable_release_tracks` flag can be set before the script initializes.
- A `waitForRenderComplete(page)` helper wrapping whatever completion hook
  Part 1 needs — shared by both `captureRendered` calls and any future
  pageType added to this harness.

## Part 3 — `capture-snapshots.mjs` (runner)

CLI, modeled on `discogs_credits/test/run.mjs`'s filtering conventions:

```
node test/capture-snapshots.mjs                    # capture all registered pageTypes
node test/capture-snapshots.mjs --only=release-tracks
node test/capture-snapshots.mjs --headed            # debugging
```

For each selected pageType (initially just the two above — read them from a
small local `pagetypes.json` fixture list, `{ pageType, url, tableMode,
seedGmValues }`, not hardcoded in the runner, so adding pageType #3 later is
a data change, not a code change):

1. Launch via the shared harness/context.
2. `captureRaw()` → scrub → write to
   `test/snapshots/<pageType>/raw.html`.
3. Seed any required GM values (e.g. `sa_enable_release_tracks` for
   release-tracks).
4. Inject the script, trigger the relevant button, wait for render
   completion.
5. `captureRendered()` → scrub → write to
   `test/snapshots/<pageType>/rendered.html`.
6. Print a one-line status per pageType (`unchanged` / `raw.html changed —
   check if MB updated the page` / `rendered.html changed — check if this
   was an intended script change`) by running `diffSummary` against
   whatever was already on disk *before* this run overwrote it (diff
   before you overwrite, not after).

Commit the resulting `test/snapshots/**/*.html` files to git as the new
baseline once you've confirmed a diff is intentional — the diff itself is
just `git diff test/snapshots/`, no custom tooling needed for that part.

## Part 4 — `registry.org`

An org-mode table at `test/snapshots/registry.org`, one row per pageType:

```org
| pageType              | URL                                                                  | tableMode | script version | last captured | feature/change verified                  | notes                                  |
|-----------------------+-----------------------------------------------------------------------+-----------+-----------------+----------------+-------------------------------------------+-----------------------------------------|
| artist-releasegroups   | /artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0               | multi     | 9.99.xxx         | 2026-08-23     | pilot harness setup                        |                                         |
| release-tracks         | /release/1d404e1d-fcb6-3a52-b478-e706e893c897                        | multi     | 9.99.xxx         | 2026-08-23     | pilot harness setup                        | requires sa_enable_release_tracks=true |
```

Update this table (new "last captured"/"feature verified" row values, plus a
notes entry for any newly-discovered volatile-region scrub addition) every
time snapshots are re-captured and committed as a new baseline. This table
is a human dashboard, not the diff mechanism — don't try to make it
machine-parsed by the runner in this pilot.

## Part 5 — Performance timing (artist-releasegroups only, for this pilot)

Purpose: catch performance regressions on large paginated tables, separately
from the HTML-correctness snapshots above. Scope this to the standard
`artist-releasegroups` branch only for now — `release-tracks` is
non-paginated and a poor first target for a *pagination-scaling* signal;
extend to it later once this pattern is proven.

### What to measure

- **Wall time**, bracketed in `capture-snapshots.mjs` around the same
  `trigger → waitForRenderComplete` span already used for the HTML snapshot,
  via `Date.now()` before/after. This is the user-facing number.
- **In-page stage timings**, via `performance.mark()`/`performance.measure()`
  calls added at the boundaries of `startFetchingProcess()`'s pipeline (check
  its existing step structure first — do not assume stage names, read the
  function). At minimum: fetch-phase-done, sort-phase-done (relevant to
  `sortLargeArray()`), render-phase-done. Read these back via
  `page.evaluate(() => performance.getEntriesByType('measure'))` after
  `waitForRenderComplete()` resolves.
- **Row/item count** for the run (however the script itself counts rendered
  rows — reuse that rather than re-deriving it via a DOM query), captured
  alongside every timing number. A duration with no denominator is
  meaningless for a paginated page whose size can itself drift over time as
  Bruce Springsteen's catalogue gets edited.

### Noise handling

Live MB response times vary run to run. Do not hard-fail on a single sample:

- Repeat the capture **5 times** in one `capture-snapshots.mjs --perf`
  invocation (separate flag from the default HTML-snapshot run — this is
  slower and shouldn't run on every invocation), take the **median** wall
  time and median of each in-page stage measure.
- Compare the new median against the committed baseline (see below):
  - **> 25% slower** → printed as a warning, does not fail the run.
  - **> 3x slower** → printed as a failure, non-zero exit code.
  - These thresholds are a starting point, not tuned — say so in a comment,
    and expect to revisit once you have a few real baseline runs to look at.

### Baseline storage

Commit `test/snapshots/artist-releasegroups/perf-baseline.json`:

```json
{
  "pageType": "artist-releasegroups",
  "url": "https://musicbrainz.org/artist/70248960-cb53-4ea4-943a-edb18f7d336f?all=1&va=0",
  "capturedAt": "2026-08-23",
  "scriptVersion": "9.99.xxx",
  "itemCount": 0,
  "medianWallMs": 0,
  "stages": {
    "fetch": 0,
    "sort": 0,
    "render": 0
  },
  "samples": 5
}
```

Diffing this is the same `git diff` pattern as the HTML snapshots — no
separate history mechanism. Add a row to `registry.org`'s notes column when
a new perf baseline is committed, same as any other re-baseline.

### Explicit non-goals for this pilot

- No CI integration, no automated pass/fail gate blocking anything — this is
  a manual `--perf` run Volker triggers around specific changes, at least
  until the thresholds above have proven themselves not to be flaky.
- No CAA-queue-drain-time scaling measurement yet — `artist-releasegroups`
  does exercise CAA, but tie that specifically to the CAA queue concurrency
  test from the earlier unique-values-dropdown task rather than duplicating
  it here.

## Project conventions (apply to all touched code)

- Untabify tab stops; strip trailing whitespace.
- Standardized JSDoc block on every new function.
- This is test tooling, not the userscript itself — no
  `ShowAllEntityData_CHANGELOG.json` entry or version bump needed for
  `test/` files, matching the same rule from the uniq-dropdown harness task.
