---
name: split-ar-peer-column
description: Make a release-tracks AR column split a single native `<dd>` crediting MULTIPLE distinct entities of the same kind (comma/"and"-joined `<span class="{kind}link">` markers, e.g. multiple series/works/artists in one relationship) into one `<li>` row per entity, instead of one unsplit blob. Use this whenever the user reports an AR column (fixed or dynamic-fallback) glues several credited entities together in a single row/cell when it should be multi-row like "Phonographic copyright (℗) by artist" already is, asks to "split column X by <kind>", "make <column> multi-row", "add <kind> to PEER_SPLIT_KINDS", or shows a `<dd>` with 2+ same-kind link markers separated by ", "/" and " that currently render as one line.
---

# Splitting an AR column's multi-target `<dd>` into peer rows

`release-tracks` doesn't use the generic `columnExtractors` pipeline for its
"ARs" data (see `add-column-extractor` for that, unrelated mechanism) — it
has its own bespoke system built on `_buildKindSplitListTd()`
(`grep -n 'function _buildKindSplitListTd'`), shared by every fixed handler
("Phonographic copyright (℗) by artist/label", "Recorded at place", …) and
the dynamic-fallback discovery (`_classifyArDt`/`_dynamicRoleColumns`) for
roles with no dedicated handler.

That function segments a `<dd>`'s children on each `<span class="{kind}
link">` marker it finds — but only for kinds listed in `PEER_SPLIT_KINDS`
(`grep -n 'const PEER_SPLIT_KINDS'`, currently `['artist', 'label',
'recording', 'series']`). A kind NOT in that list falls through to the
`kinds.size === 0` branch: the whole `<dd>` gets cloned verbatim into ONE
`<li>`, separators and all — this is the bug shape the skill exists to fix.

## 1. Confirm this is genuinely PEER-shaped, not CHAIN-shaped — don't skip this

`PEER_SPLIT_KINDS`'s own JSDoc documents the load-bearing distinction (read
it in full before touching anything):

- **Peer-shaped** (safe to add): repeated `{kind}link` markers within one
  `<dd>` always mean multiple DISTINCT credited entities — comma/"and"-joined
  artists, labels, source recordings, or (as of this skill's own precedent
  fix) series.
- **Chain-shaped** (never add — `place`/`event`/`work`/`area` stay excluded
  on purpose): a SINGLE primary target accompanied by its OWN nested
  geographic/hierarchical decoration that legitimately reuses the same
  marker class repeatedly (a place's "in `<area>`, `<area>`, `<country>`"
  chain; an area crediting its own parent area). Treating a chain-shaped
  relationship as peer-splittable was a real, already-fixed regression
  twice (see `PEER_SPLIT_KINDS`'s JSDoc for both incidents) — it fragments a
  single "A&M Studios in Hollywood" credit into two columns, or drops all
  but the first link of an area chain.

**Verify structurally before deciding**, don't guess from the kind's name
alone:

1. Find every `<dt>`/`<dd>` pair for the target role across every
   `debug/*.html` snapshot that has one (a short throwaway Python script
   under `scripts/` or the scratchpad dir — never inline `python3 -c`, see
   this repo's shell-command convention — regex `<dt>([^<]*)</dt>\s*<dd
   [^>]*>(.*?)</dd>` works on these single-line dumps).
2. For every match with 2+ of the target kind's marker, read the actual
   HTML: are the repeated markers siblings at the SAME nesting depth
   (peer-shaped — see `debug/r-final.html`'s "part of:" `<dd>`s, each
   `serieslink` immediately followed by its own `<a>`/comment/parenthetical,
   comma or " and " joined, no marker nested inside another), or is one
   marker nested INSIDE another's content (chain-shaped decoration)?
3. Grep for the marker class across every `debug/*.html` and confirm it
   NEVER appears under a different `<dt>` phrase than the one you're fixing
   — adding a kind to `PEER_SPLIT_KINDS` affects every dynamic-fallback role
   that ever carries that marker, not just the one you're looking at (see
   `_filterPeerKinds`'s call sites — both the header-building and per-row
   builder pass the SAME filtered set for every role uniformly). If the
   marker also shows up under some OTHER phrase you haven't inspected,
   check that shape too before proceeding.
4. If a single `<dd>` for this role ever mixes the target kind with a
   different kind (e.g. an artist credit that also nests a place), that's
   `_splitColumnByEntityKind` territory (kind.size > 1 → separate columns
   per kind) — orthogonal to this skill, already handled generically as
   long as the mixed-in kind is itself in `KNOWN_ENTITY_LINK_KINDS`.

If the evidence is ambiguous or you only have one example, say so and ask
before changing a project-wide constant — this is exactly the kind of
"looks safe from one example, wrong on the next" call the JSDoc's incident
history warns about.

## 2. Apply the fix

One line: add the kind to `PEER_SPLIT_KINDS`'s array literal. Then update,
in the same edit, every place that documents the OLD exclusion list by name
(grep `PEER_SPLIT_KINDS` — as of this writing that's: the constant's own
JSDoc "Deliberately excludes …" paragraph, `_filterPeerKinds`'s JSDoc, and
the inline comment at the dynamic-column header-building call site) — add a
new paragraph explaining why THIS kind is safe, in the same style as the
existing `recording` paragraph (concrete debug/*.html evidence, explicit
"never nests itself as decoration" statement). A stale exclusion-list
comment is as much a defect as wrong code — this file's own JSDoc
conventions are read as documentation of intent, not just narration.

No `KNOWN_ENTITY_LINK_KINDS` change needed (the kind is presumably already
listed there, feeding both the marker-detection and the glyph-priority
order) — `PEER_SPLIT_KINDS` is a strict subset of it.

No page-definition (`pageDefinitions`) change needed for a DYNAMIC-fallback
column — `def.features.collapsableColumns` is populated at runtime the
moment the column is discovered (see the "Runtime `collapsableColumns`/
header-glyph registration" section of this project's CLAUDE.md). A FIXED
column (like "Phonographic copyright…") that newly becomes multi-row from
this change may already be a static `collapsableColumns` entry in
`pageDefinitions` — check, but it usually already is (fixed columns are
declared collapsable up front regardless of whether any given release
actually has multiple targets).

## 3. Write the regression test FIRST, prove it fails without the fix

Use `add-live-behavior-test` for the mechanics (tag `@extended` — this is a
release-tracks-specific edge case, not a shared-pipeline mechanism). Reuse
the "Born to Run" release-tracks pilot page
(`https://musicbrainz.org/release/1d404e1d-fcb6-3a52-b478-e706e893c897`,
`button[data-label="Show all Tracks for Release"]`) unless the target
column's data isn't present there — several other release-tracks live specs
already share it.

Assertion shape (see `release-tracks-part-of-series-multirow.spec.js` for
the full worked example):

```js
const cells = await page.evaluate((idx) => {
    const rows = Array.from(document.querySelectorAll('table.tbl tbody tr'));
    return rows.map((row) => {
        const td = row.cells[idx];
        if (!td) return null;
        const lis = Array.from(td.querySelectorAll(':scope > ul > li'));
        return {
            liCount: lis.length,
            liTexts: lis.map((li) => li.textContent.trim()),
            liMarkerCounts: lis.map((li) => li.querySelectorAll(`a[href^="/${KIND}/"]`).length),
            toggleText: td.querySelector('.mb-cell-collapse-toggle')?.textContent.trim() || null,
        };
    }).filter(Boolean);
}, colIdx);

const multiRow = cells.find((c) => c.liCount >= 2);
expect(multiRow, `expected a multi-${KIND} cell`).toBeTruthy();
multiRow.liMarkerCounts.forEach((n) => expect(n).toBe(1));       // no two entities fused into one row
multiRow.liTexts.forEach((text) => {                              // no leftover separator glued on
    expect(text).not.toMatch(/^(,|and)\b/i);
    expect(text).not.toMatch(/(,|and)\s*$/i);
});
expect(multiRow.toggleText).toContain(String(multiRow.liCount));  // list-cell collapse toggle picked it up
```

Run it BEFORE making the code change (or `git stash push --
ShowAllEntityData.user.js` after writing both, then `git stash pop`) —
confirm it fails with "expected a multi-`<KIND>` cell" or similar. If it
doesn't fail against unfixed code, the target `<dd>` on this pilot page
isn't actually multi-target — find a real example first (grep debug htmls
as in step 1) rather than adjusting the test to pass trivially.

## 4. Verify, document, branch, commit

1. Re-run the new test — passes.
2. Add a row to `tests/live/registry.org` (spec/pageType/URL/title/verifies/
   notes columns — copy the format of the release-tracks rows already
   there).
3. Create a feature branch first (never commit to `main` directly).
4. Add a `ShowAllEntityData_CHANGELOG.wip.json` entry (🐛 Fix, plain-language
   description of the symptom — "the `<Column>` column glued multiple
   `<kind>` credits into a single row instead of listing them separately").
   No `// @version` bump, no touching the real `CHANGELOG.json`, and no
   changelog entry at all for the test file itself — feature-branch/tests
   conventions, see this project's CLAUDE.md.
5. Commit (userscript fix + live spec + registry.org row + WIP changelog
   together), push the branch.

Merging to `main` (version bump, real changelog, WIP file deletion) only
happens when the user explicitly asks — see the Git Workflow section of
this project's CLAUDE.md for the exact steps.

## How to drive this skill

Give it the column name (or a description of the glued-together cell
content if the exact header text isn't obvious) and, if you have it, the
release/URL where the multi-target shape is visible:

> "The 'Part of series' column on
> https://musicbrainz.org/release/<mbid> glues 3 series into one line
> separated by commas and 'and' — should be 3 separate rows like
> Phonographic copyright already does for multiple labels."

If only a `debug/*.html` snapshot is available (no live URL), that's enough
too — step 1's structural verification works from the snapshot directly.
