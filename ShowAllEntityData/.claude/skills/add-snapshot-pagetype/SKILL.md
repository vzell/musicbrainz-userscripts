---
name: add-snapshot-pagetype
description: Add a new pageType to ShowAllEntityData's HTML-snapshot regression harness (tests/snapshots/) — capture a raw/rendered baseline pair against a real musicbrainz.org page and wire it into tests/pagetypes.json + tests/snapshots/registry.org. Use this whenever the user asks to "add snapshot coverage for X", "capture a baseline for this pageType", "add X to the regression harness", or references pageTypes-testing-reference.org's "Coverage clusters & representatives" backlog and wants the next `planned` row turned into `captured`.
---

# Adding a pageType to the snapshot regression harness

`tests/snapshots/<pageType>/{raw,rendered}.html` are committed baselines
diffed on every future capture run — this is how a code change to the
render/column pipeline gets caught even without a hand-written assertion.
Today only 4 of 86 pageTypes are covered
(`artist-releasegroups`, `release-tracks`, `releasegroup-releases`,
`artist-events` — see `pageTypes-testing-reference.org`'s "Coverage
clusters & representatives" section for the full cluster/representative
plan and which rows are still `planned`).

## 1. Pick the pageType and its identifier

- Find the row in `pageTypes-testing-reference.org`'s "Coverage clusters &
  representatives" table (or the "Bespoke / one-off" table) matching what
  the user asked for. If it names a representative already, use that
  identifier; if the row's notes flag it as needing a smaller substitute
  (e.g. an `ARTIST`/`INSTR_GT`-anchored *listing* page — see the "Identifier
  selection criteria" above that table), resolve a real substitute MBID via
  the MusicBrainz web service before proceeding, don't guess one.
- Apply the same criteria to anything not yet in the doc: default to Bruce
  Springsteen or a directly-connected entity (reuse an existing
  `Identifier legend` abbreviation before minting a new one); prefer the
  smallest-catalog qualifying identifier (ideally a single native MB page)
  unless pagination coverage is specifically the point, in which case use
  the minimum page count that triggers it (2 pages).
- Cross-check the pageType's actual `pageDefinitions` entry in
  `ShowAllEntityData.user.js` (re-grep `const pageDefinitions = [` — the
  line range drifts) for its exact `match()`, `buttons[].label`, `features`,
  and `tableMode` — these feed directly into the `tests/pagetypes.json`
  entry in step 3.

## 2. Run the capture

```
node tests/support/capture-snapshots.js --only=<pageType>
```

This requires an entry for `<pageType>` in `tests/pagetypes.json` to
already exist (step 3) — add that first if it's not there yet, then run
this. Add `--headed` if something looks wrong and you need to watch it
render.

**If the pageType's `features.unboundedPagination` is `true`** (`edits`,
`user-edits`, `user-open-edits`, `notes-received`) and there's enough data
to make MusicBrainz's own pagination widget "ambiguous" (an ellipsis, no
true last page), the fetch pops a custom confirm dialog
(`Lib.showCustomConfirm`) before it starts — a plain DOM `<button>OK</button>`
overlay, not a native browser dialog, so Playwright's automatic dialog
handling never sees it. `capture-snapshots.js` already calls
`tests/support/customDialog.js`'s `dismissCustomConfirmDialog()` right after
the "Show all" click to handle this — if a capture for one of these
pageTypes hangs at exactly one page's row count with no console errors and
no progress, this dialog blocking the fetch is the first thing to check
(confirmed the hard way capturing `notes-received`: it sat at 50 rows/page 1
for 5 minutes before this fix). A small result set (fits on one page, no
ellipsis) never shows it — that's why e.g. `user-open-edits` worked without
this fix.

The script writes `tests/snapshots/<pageType>/raw.html` and
`rendered.html`, scrubbing known-volatile content (`tests/support/
snapshot.js`'s `scrub()`), and prints a one-line diff status against
whatever was already on disk (`first capture` the first time).

If the page is gated behind a setting (e.g. `release-tracks` needs
`sa_enable_release_tracks`), that goes in the pagetypes.json entry's
`seedGmValues`, not as a manual pre-step — `seedGmValues()` (`tests/
support/gmStubs.js`) pre-seeds it via `GM_setValue` before the script's
init runs.

## 3. Add the `tests/pagetypes.json` entry

Match the existing entries' shape:

```json
{
    "pageType": "<pageType>",
    "url": "https://musicbrainz.org/<entity>/<mbid>/<suffix>",
    "tableMode": "single" | "multi",
    "showAllButtonSelector": "button[data-label=\"<exact button label>\"]",
    "seedGmValues": { "sa_enable_caa_pics": false, "sa_enable_relationships_column": false },
    "hasCaaOrEaa": false,
    "hasRelationships": false,
    "waitForAutoResize": true
}
```

`seedGmValues` forcing CAA/relationships OFF is the existing convention
for any capture where a real, unstubbed CAA queue or WS/2 relationships
fetch would introduce run-to-run non-determinism (purchase-link order
drift, a still-in-flight completion toast at capture time) — see
`tests/snapshots/registry.org`'s existing rows for the reasoning each time
this was hit. Only set `hasCaaOrEaa`/`hasRelationships: true` if you're
deliberately capturing that feature and have confirmed it settles
deterministically (or seed IndexedDB directly instead — see
`tests/support/capture-idb-fixture.js` and `tests/live/
idb-cache-hit-bigbox.spec.js` for that pattern).

## 4. Document it

- Add a row to `tests/snapshots/registry.org` (pageType, URL, page title,
  tableMode, script version — read `// @version` from the userscript
  header — capture date, what feature/change this capture verifies, and
  any quirks found, following the existing rows' level of detail).
- Flip the pageType's row from `planned` to `captured` in
  `pageTypes-testing-reference.org`'s "Coverage clusters & representatives"
  table.
- Commit `tests/snapshots/<pageType>/{raw,rendered}.html` alongside the
  `tests/pagetypes.json`/registry.org changes as one baseline.

## No changelog / version bump

Per project convention (`tasks/task-playwright-html-snapshot-harness.md`'s
"Project conventions"), test tooling under `tests/` doesn't touch
`ShowAllEntityData_CHANGELOG.json` or `// @version` — only a change to the
userscript itself does.

## How to drive this skill

> "Add snapshot coverage for `entity-aliases` — use the RG_BTR
> representative from the coverage-clusters doc."

Claude Code will confirm the identifier against the doc's criteria, add
the `tests/pagetypes.json` entry, run the capture, add the registry.org
row, and flip its status to `captured`.
