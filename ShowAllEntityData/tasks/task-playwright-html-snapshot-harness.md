# Task: HTML snapshot regression harness (pilot: artist-releasegroups, release-tracks)

## Context

Goal: for a given pageType, capture the rendered page's HTML before and after
a specific script change, so we can see at a glance whether that change
altered anything beyond what it was meant to — and separately, whether
MusicBrainz itself changed the underlying page layout (which would explain a
diff that has nothing to do with our script).

**Infra correction**: an earlier version of this doc assumed a repo-root
`falcon/test/` and `discogs_credits/test/` (persistent-context login,
`--only=`/`--headed` CLI conventions) and a top-level `ShowAllEntityData/
test/` (singular) tree with its own `harness.mjs`. **None of that exists in
this checkout** — grepping git history and `~/git` siblings confirms
`falcon/`/`discogs_credits/` were never part of this repo. What actually
exists and works is `ShowAllEntityData/tests/` (**plural**):

- `tests/support/loadPage.js` — `loadUserscriptPage(page, {url,
  fixtureFile})`. Plain CommonJS, so it's callable from a standalone Node
  script (this task's `capture-snapshots` runner), not just from
  `@playwright/test` specs. Injects the GM stub, then loads iro → pako →
  `lib/VZ_MBLibrary.user.js` → `ShowAllEntityData.user.js` in the
  userscript's own `@require` order.
- `tests/support/gmStubs.js` — `buildGmStubsScript(initialValues)`, the
  `seedGMValue`-equivalent mechanism this task needs (e.g. to seed
  `sa_enable_release_tracks` for the `release-tracks` pilot pageType).
- `tests/support/auth-setup.js` + `npm run auth:login` — real interactive
  login saved as Playwright `storageState` to `playwright/.auth/vzell.json`
  (gitignored). Reuse this for the capture runner's auth instead of a
  separate persistent-context profile: launch a plain `chromium.launch()` +
  `browser.newContext({storageState: AUTH_FILE})` if that file exists — the
  same conditional pattern `playwright.config.js` already uses for the
  `chromium-live` project.
- No `diff`/`jsdiff` devDependency exists anywhere in the repo — `diffSummary`
  (Part 1 below) needs a small hand-rolled line-diff.

See the sibling `task-playwright-test-infra-expansion.md` for the `__saTest`
debug hook, and — most relevantly to this doc's Part 1 `scrub()` limitation
below — its **Part 6, disk-based fixture loading**, which is the actual fix
for this doc's live-data-drift problem on the *rendered* side.

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
   setting** — the harness must seed this via `buildGmStubsScript`'s
   `initialValues` *before* the script's init runs, or the "Show all Tracks
   for Release" button never appears. tableMode `multi`, non-paginated. Uses
   the bespoke `applyExtractTrackTitleData()` AR-column engine (not the
   generic columnExtractor pipeline — see `CLAUDE.md`'s "release-tracks:
   dynamic AR-column classification" section before touching anything here).
   Exercises the largest single feature list in the reference doc: DOM
   decluttering (Yomo widget/work-button/settings-icon/medium-toolbox
   removal), inline credits, overflow-track loading, medium tracklist
   normalization, column eraser on Length, numeric #/Length/Rating, and
   collapsible ARs/Streaming/AcoustIDs/ISRCs/engineer-role/Mixed-at/
   Phonographic-copyright/Produced-for/Recorded-at/Recorded-in/Performer/
   Instruments/Vocals columns.

## Part 1 — `lib/snapshot.js`

Export (place under `tests/support/snapshot.js`):

- **`captureRaw(page, url)`** — navigates to `url`, waits for
  `domcontentloaded`, returns the page's `document.documentElement.outerHTML`
  *before* any userscript code runs. This is MB's own page, unmodified.

- **`captureRendered(page)`** — assumes the script has already been injected,
  triggered, and its render pipeline has completed (wait on the same
  completion signal identified for the uniq-dropdown test — check
  `startFetchingProcess`/`finalCleanup`, or reuse
  `assertGroupedRenderCompleted`'s `#mb-filter-container` visibility signal
  from `tests/support/liveAssertions.js`, rather than a fixed timeout);
  returns `document.documentElement.outerHTML` at that point.

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

  **Live-data-drift limitation, and its actual fix**: MB data changing
  between two capture runs (an editor adding a release group) still shows up
  as a real content diff unrelated to any script change — for `raw.html`
  (MB's own unmodified page) this is unavoidable by definition, since that
  capture has to come from a live fetch. For `rendered.html`, though, this is
  now *solved*, not just deferred: `task-playwright-test-infra-expansion.md`'s
  Part 6 documents that the script's own Load-from-disk feature is fully
  Playwright-automatable (a real hidden `<input type="file">`, not an OS
  picker). Capture a `.json.gz` fixture once via Save-to-disk, commit it to
  `tests/fixtures/saved-data/<pageType>.json.gz`, and have
  `captureRendered()` (or a sibling `captureRenderedFromFixture()`) drive
  `loadFromDiskFixture()` instead of a live "Show all" click when a fixture
  exists for that pageType — this replays through the script's real render
  pipeline (`_hydrateAndRenderFromSnapshotData()`) with byte-for-byte
  identical input every run, eliminating drift for the rendered-HTML
  comparison specifically. Wire this in as this pilot's primary mechanism,
  not a deferred future task — the older idea of `page.route()`-intercepting
  a captured `raw.html` on re-capture is no longer necessary now that the
  disk-fixture path exists and exercises real render code instead of a raw
  network mock.

- **`diffSummary(before, after)`** — thin wrapper (a small hand-rolled
  line-diff is fine, confirmed no `diff`/`jsdiff` package exists yet)
  returning whether the two are identical and, if not, a short
  line-count/preview summary for the console — the actual diff detail
  belongs to `git diff` on the committed snapshot files, not to this
  function's return value.

### Implementation notes — empirically corrected (read before touching `scrub()`)

`tests/support/snapshot.js` is implemented. Four things were found — not by
inspection of a single capture, but by (a) actually opening a saved file in
a real browser, and (b) capturing the SAME unchanged page **twice in a row**
and diffing. Neither method would have surfaced what the other found.

1. **A real, more severe bug, found by opening a saved `rendered.html`
   directly in a browser (reported by Volker, not caught by anything in
   this module's own automated checks):** `captureRendered()`/`captureRaw()`
   used to serialize `outerHTML` verbatim, including the `<script>` tags
   `page.addScriptTag()` injects containing this userscript's own ~800KB+
   source. A `<script>` element's raw text content is serialized completely
   unescaped, and that much source almost certainly contains a literal
   `</script` substring somewhere in a comment or string. Re-opening the
   *saved* file in a real browser ends the script tag right there and dumps
   the rest of the userscript's own source as literal page text —
   corrupting everything after it. `tests/support/test.js`'s own
   `SAVE_HTML` fixture-saving mechanism had already solved this exact
   problem (strip `<script>` before serializing, plus insert a `<base>` tag
   so the saved file's own relative asset URLs resolve when opened via
   `file://`); this module just hadn't been given the same treatment.
   Fixed via `_serializeWithoutScripts()` — DOM manipulation (clone,
   `querySelectorAll('script').forEach(el => el.remove())`, insert
   `<base>`) run *inside* `page.evaluate()`, **not** a string-regex
   post-process on the already-serialized HTML — a regex-based
   `<script>...</script>` removal on the string has the exact same
   literal-`</script`-inside-content footgun this fix exists to avoid.
2. **A side effect of fix #1 that eliminated a whole prior scrub category.**
   An earlier version of this module found that MusicBrainz's own embedded
   `<script type="application/json">`/`"application/ld+json">`/
   `window.__MB__` bootstrap blocks have non-deterministic *object key*
   order per request (confirmed by parsing both captures' JSON-LD blocks,
   sorting keys, and finding the results byte-identical — values unchanged,
   only order; almost certainly Perl hash-iteration-order randomization on
   MusicBrainz's own Catalyst backend, a deliberate anti-hash-flooding
   measure, not a bug), and added `_canonicalizeJsonBlocks()`/
   `_scrubMbBootstrapScript()` to normalize it. Once fix #1 strips every
   `<script>` element unconditionally, those blocks — and their key-order
   noise — are gone entirely before `scrub()` ever runs. Removed the
   now-dead canonicalization code rather than leave it as unreachable
   complexity.
3. **`captureRaw()`'s `domcontentloaded` wait (this doc's own original
   spec) is insufficient — some of MusicBrainz's own native page JS mutates
   the DOM shortly after that event fires.** Found the same way as #2 — two
   back-to-back captures of the unchanged `artist-releasegroups` page
   differed at exactly one spot: a Wikipedia-extract widget's
   `wikipedia-extract-collapsed`/`wikipedia-extract-collapse` class (and
   the presence/absence of its own "Show more..." toggle link), which
   native MB JS toggles once it's finished running — a genuine capture-
   timing race, not real MB data drift, confirmed by a precise
   character-position diff finding exactly those two related spots and
   nothing else. Fixed by switching `page.goto()` to `waitUntil: 'load'`
   (all resources fetched, not just initial HTML parsed) instead of
   `'domcontentloaded'`, giving that native JS a real chance to have
   already run and settled.
4. **This script's OWN self-reported wall-clock timing text.** Once
   rendered: `#mb-global-status-display`'s "Fetching: X.XXs, Rendering:
   X.XXs, 📐Measuring: X.XXs" summary (PLUS further appended pieces —
   "🎨CAA: X.Xs", "🔗Rels: X.Xs" — via `_sdAppend()`), `#mb-info-display-caa`/
   `-rel`'s own "🎨CAA: X.Xs"/"🔗Rels: X.Xs" (plus their `data-mbtt` tooltips'
   "Total load time: X.Xs" line), `#mb-info-display-generic`'s auto-resize
   "...in X.XXs" message, and the hidden-but-still-serialized
   `#mb-fetch-progress-label`'s stale "...  - X.Xs left" estimate.
   **First attempt scrubbed by element id** (find `id="ID"`, blank up to
   the first `<`) and was insufficient — `#mb-global-status-display`
   contains a NESTED `<span title="...">🎨CAA: 51ms</span>` from
   `_sdAppend()`, which a "blank up to the first `<`" match doesn't reach.
   Fixed by switching to **content-pattern matching** instead
   (`_scrubTimingAfterLabel()`: match a known label text — e.g. `'Fetching:
   '`, `'🎨CAA: '`, `'Total load time: '` — immediately followed by a
   number+unit, regardless of which element or how deeply nested it is).
   Verified safe against false positives (this label-anchored approach
   won't touch inline-style `transition: ... 0.1s` CSS values, which never
   have one of these literal label strings immediately before the number).

Checked and explicitly **ruled out** (real, stable data, not scrubbed): ISO
`creation_date` timestamps on annotation/entity records, and "N edit(s)"-
shaped substrings that turned out to be a false-positive regex match
against a stable list title ("...2021 edition") rather than a real edit
counter. Also checked and none found on either pilot page: CSRF/nonce,
"N alerts", relative timestamps, session identifiers — logged out, no
personalized banners exist to find.

Verified fully deterministic end-to-end (not just via targeted unit
checks): captured both pilot pageTypes' raw+rendered snapshots via the real
`capture-snapshots.js` runner **five** times in a row across the full fix
sequence above — `unchanged` on every re-run after the first — and
confirmed directly (`grep -c '<script'` on the committed files, and a
`<!DOCTYPE html>`/`<base href="...">`-prefixed file that opens correctly in
a real browser) that fix #1's script-stripping actually took effect.

## Part 2 — `tests/support/browser.js` additions (or reuse from `loadPage.js`)

- A `seedGMValue`-equivalent: `tests/support/gmStubs.js`'s
  `buildGmStubsScript(initialValues)` already covers this — pass
  `{ sa_enable_release_tracks: true }` for the `release-tracks` pilot rather
  than writing a new helper.
- A `waitForRenderComplete(page)` helper wrapping whatever completion hook
  Part 1 needs — shared by both `captureRendered` calls and any future
  pageType added to this harness. Check whether
  `tests/support/liveAssertions.js`'s existing `#mb-filter-container`
  visibility check is sufficient before writing a new one.

## Part 3 — `capture-snapshots.mjs` (runner)

Place at `tests/support/capture-snapshots.mjs` (or `.js` — match whatever
module style the rest of `tests/support/` uses; `loadPage.js`/`gmStubs.js`
are CommonJS, so plain `.js` with `require()` is the path of least friction
for importing them directly). Runs as a standalone Node script *outside* the
Playwright test runner (`chromium.launch()` + `newContext()` directly, with
the `storageState` conditional described in Context above) — this is a data
capture tool, not a pass/fail assertion suite, so it doesn't need to live
inside the `chromium-fixtures`/`chromium-live` project split.

CLI, using Playwright's/Node's own arg parsing (no need to invent
`--only=`/`--headed` conventions from a nonexistent reference — a plain
`process.argv` check is enough):

```
node tests/support/capture-snapshots.mjs                    # capture all registered pageTypes
node tests/support/capture-snapshots.mjs --only=release-tracks
node tests/support/capture-snapshots.mjs --headed            # debugging
```

For each selected pageType (initially just the two above — read them from a
small local `tests/pagetypes.json` fixture list, `{ pageType, url,
tableMode, seedGmValues }`, not hardcoded in the runner, so adding pageType
#3 later is a data change, not a code change):

1. Launch via `chromium.launch()` + `newContext()` (with `storageState` when
   `playwright/.auth/vzell.json` exists).
2. `captureRaw()` → scrub → write to `tests/snapshots/<pageType>/raw.html`.
3. Seed any required GM values (e.g. `sa_enable_release_tracks` for
   release-tracks) via `buildGmStubsScript`.
4. Inject the script, trigger the relevant button, wait for render
   completion.
5. `captureRendered()` → scrub → write to
   `tests/snapshots/<pageType>/rendered.html`.
6. Print a one-line status per pageType (`unchanged` / `raw.html changed —
   check if MB updated the page` / `rendered.html changed — check if this
   was an intended script change`) by running `diffSummary` against
   whatever was already on disk *before* this run overwrote it (diff
   before you overwrite, not after).

Commit the resulting `tests/snapshots/**/*.html` files to git as the new
baseline once you've confirmed a diff is intentional — the diff itself is
just `git diff tests/snapshots/`, no custom tooling needed for that part.

### Implementation notes — empirically corrected

Implemented as `tests/support/capture-snapshots.js` (plain `.js`, CommonJS —
matches `loadPage.js`/`gmStubs.js`) + `tests/pagetypes.json`. Three
corrections found by actually running it, not by inspection alone:

1. **The status-print logic had a real gap**: comparing "did BOTH raw and
   rendered not exist before" as one combined flag silently misreports a
   genuinely-first-ever `rendered.html` write as `"unchanged"` if `raw.html`
   happened to already exist from an earlier, partially-failed run (raw is
   written before the render step even starts, so a mid-run crash after
   that point leaves the two files in different "have I been captured
   before" states). Fixed by tracking first-capture status **per file**,
   independently.
2. **`artist-releasegroups`' real CAA queue didn't finish even after a
   10-minute wait** for this artist's 2142 rows — not a bug: it scales
   roughly linearly from the small `releasegroup-releases` pilot's own
   ~0.56s/row CAA baseline (`task-playwright-test-infra-expansion.md`'s
   Part 3), which projects to ~20 minutes for 2142 rows. Waiting that long
   on every capture run isn't practical. **Pragmatic fix**: this pageType's
   `tests/pagetypes.json` entry seeds `sa_enable_caa_pics: false` and
   `sa_enable_relationships_column: false` (and sets `hasCaaOrEaa`/
   `hasRelationships` to `false` so `waitForRenderComplete()` doesn't try to
   wait for either) — a deliberate, documented coverage trade-off: this
   pilot's CAA/Relationships rendering isn't exercised by the snapshot
   baseline, in exchange for a capture that finishes in ~20-30s instead of
   ~20+ minutes. `release-tracks` doesn't have this feature at all, so
   isn't affected.
3. Added a per-pageType `renderTimeout` config override (`tests/
   pagetypes.json`, defaults to 90000ms) — needed while diagnosing #2
   above, before landing on the seed-them-off fix; left in as a general
   escape hatch for a future pageType that's just slow to fetch/render (not
   CAA-specific) without needing a code change.

## Part 4 — `registry.org`

An org-mode table at `tests/snapshots/registry.org`, one row per pageType:

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
  function). Read these back via
  `page.evaluate(() => performance.getEntriesByType('measure'))` after
  `waitForRenderComplete()` resolves.

  **No sort-phase-done stage exists** — checked by reading the function
  rather than assuming, per the instruction above: grepping for
  `sortLargeArray(` calls inside `startFetchingProcess()` finds none.
  Sorting never happens during the initial fetch/render; it's a separate,
  user-triggered action wired up later by `makeTableSortableUnified()`
  (confirmed in `task-playwright-test-infra-expansion.md`'s own Part 5 —
  clicking a column's sort-icon button — which is a wholly different code
  path this function never calls). `startFetchingProcess()`'s own pipeline
  is just fetch → render.

  Marks added at the exact boundaries the script's OWN pre-existing
  internal timing variables already use (`fetchingTimeStart`/
  `totalFetchingTime`, `renderingTimeStart`/`totalRenderingTime` — the same
  values that feed the "Fetching: X.XXs..." status text Part 1's `scrub()`
  neutralizes), guaranteeing the new marks agree with what the page already
  visibly reports: `sa-fetch-phase-start`/`-done` and
  `sa-render-phase-start`/`-done`, each paired with a
  `performance.measure()` call producing `'sa-fetch-phase'`/
  `'sa-render-phase'` entries. Verified live: both measures appear with
  sane durations via `page.evaluate(() => performance.getEntriesByType
  ('measure'))`.
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

Commit `tests/snapshots/artist-releasegroups/perf-baseline.json`:

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
  does exercise CAA, but tie that specifically to a future CAA queue
  concurrency test rather than duplicating it here. This turned out to be
  the right call independent of scope-minimalism: CAA/Relationships are
  seeded OFF entirely for this pilot's captures (see Part 3's
  implementation notes) specifically because CAA didn't finish even after
  a 10-minute wait for this artist's 2142 rows — so this non-goal was
  correct in hindsight for a reason beyond "keep the pilot small."

### Verified

Real committed baseline (`tests/snapshots/artist-releasegroups/perf-baseline.json`):
2142 items, median wall ~21.7-22.1s across two separate 5-sample runs
(fetch ~15.2-15.7s, render ~0.49-0.50s) — consistent within noise between
runs, script version `9.99.936+2026-08-23`. Both threshold branches
exercised directly: a genuinely-unchanged re-run correctly printed `ok`;
temporarily swapping in a synthetic baseline with an artificially low
`medianWallMs` correctly printed `FAIL (>3x baseline)` and exited non-zero.

## Project conventions (apply to all touched code)

- Untabify tab stops; strip trailing whitespace.
- Standardized JSDoc block on every new function.
- This is test tooling, not the userscript itself — no
  `ShowAllEntityData_CHANGELOG.json` entry or version bump needed for
  `tests/` files, matching the same rule from the sibling
  `task-playwright-test-infra-expansion.md`.
