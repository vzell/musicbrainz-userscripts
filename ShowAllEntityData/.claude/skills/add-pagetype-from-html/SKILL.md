---
name: add-pagetype-from-html
description: Register a brand-new MusicBrainz page as a `pageType` entry in ShowAllEntityData.user.js's `pageDefinitions` array, starting from a raw HTML snapshot of that page saved under `debug/`. Use this whenever the user hands you a `debug/*.html` file (or asks you to save one) and wants the page supported — phrases like "add a new page type", "register this page", "here's the HTML for a new MusicBrainz page", "make ShowAllEntityData work on <url>", or "this page isn't consolidated yet, can you add it". Also trigger when the user pastes a MusicBrainz URL that has no matching `pageDefinitions` entry and asks for it to be added.
---

# Adding a pageType from an HTML snapshot

Every existing `pageDefinitions` entry started the same way: someone looked
at a raw MusicBrainz page, worked out its DOM shape, and translated that
shape into a handful of flags. `ShowAllEntityData/CLAUDE.md`'s "Adding a new
page type" checklist names the eight touch points, but the actual work is
almost entirely in step 3 — reading the snapshot correctly. Get that reading
right and the rest of the entry writes itself by analogy to a neighboring
pageType; get it wrong and you end up chasing exactly the two bugs this
project has already hit twice (container re-root, headings crammed
together — see "Known failure modes" below).

## 0. Get a snapshot to work from

If the user gave you a live URL instead of a file, ask them to save the
page's HTML (Ctrl+S / "View Page Source" after the page has fully loaded —
not a partial fetch) into `debug/` with a descriptive name, e.g.
`debug/label-relationships-filtered.html`. Don't guess at DOM structure from
memory of "how MusicBrainz pages usually look" — every existing entry in
`CLAUDE.md`'s pitfalls list exists because a snapshot showed something the
generic assumption missed (no `div#content`, an h2 crammed next to an h1,
two `<dl>` siblings instead of one). If a snapshot already exists under
`debug/` for this page, read it in full before writing anything; don't
skim.

## 1. Read the snapshot for the seven load-bearing facts

Open the HTML file and answer these, in this order — each answer feeds
directly into a `features` flag or a `pageDefinitions` field below. Use
`grep -n` for the tag names rather than eyeballing a 3MB dump.

1. **Does `div#content` exist?** `grep -c 'id="content"'`. If not, you're in
   `user-tags` territory — the container will need to re-root off
   `targetHeader.parentNode`. Note what actually wraps the table/list
   instead (a `div#page`? a bare list container like `div#all-tags`?).
2. **What headings exist, and in what tag?** `grep -n '<h[123]'`. Three
   shapes recur:
   - A real `<h1>` plus zero or more `<h2>` — no pre-processing needed.
   - Only `<h2>`s, no `<h1>` at all — needs `renameH2ToH1` on the first one
     **plus** `insertH2` for a fresh section title, per the checklist (see
     `applyRenameH2ToH1`'s JSDoc and the `debug/NOTES.md` entry titled
     "user-edits/user-open-edits cram everything onto one heading" for what
     goes wrong if you only do the rename half).
   - Native `<h2>`s that are actually sub-section headers under a synthetic
     top-level heading you're about to inject — needs `renameH2ToH3`.
3. **One table, or several?** `grep -c 'class="tbl"'` and check whether each
   table sits under its own heading (→ `tableMode: 'multi'`,
   `renderGroupedTable`) or there's exactly one logical list to accumulate
   across pages (→ `tableMode: 'single'`, `renderFinalTable`). A `<ul>`
   instead of a `<table>` (tags, genres) means `listToTable` needs to name
   the `<ul id="…">` to convert.
4. **Where does the table sit relative to the heading?** — sibling,
   descendant, or somewhere `renderGroupedTable`'s cleanup pass won't reach
   without a re-root. This is the single question the "Things to check
   before any DOM-related fix" section in `CLAUDE.md` is built around;
   answer it now, not after the entry is half-written.
5. **Is there pagination?** `grep -n 'class="pagination"'` — confirms this
   is a normal paginated `GM_xmlhttpRequest` loop, no special handling
   needed. Its absence on a page that clearly has >50 rows (report pages
   sometimes render everything in one response) tells you the fetch loop
   needs no `page=N` param at all.
6. **What do the columns actually look like?** For each `<th>`, look at 2-3
   `<td>` samples: plain text, a link, a list (`<ul><li>`), a nested `<dl>`
   of relationships, an icon-prefixed value? This determines the column
   pipeline (§3) — don't guess from the header text alone; MusicBrainz
   reuses ambiguous header labels ("Type", "Name") across very different
   cell shapes.
7. **Does the page belong to an existing entity-driven family?** — i.e. is
   this a new sub-tab of something `resolveEntityFeaturesFromH2` already
   handles (`series-releases`, `collections-releases`,
   `user-ratings-type`-style pages), where `entityFeatures` per `<h2>` is
   the right mechanism instead of a flat `features` object? If the page has
   multiple `<h2>` sections each needing *different* column treatment, this
   is very likely the case — check `entityFeatures` usage on the nearest
   existing entity-family entry before writing a flat one.

## 2. Find the nearest neighbor and place the entry

`pageDefinitions` is ordered by entity class in MusicBrainz's own tab
ordering, not alphabetically (confirm the current ordering by grepping
`type: '` inside the array — as of now it runs
taglookup/cdtoc → artist-credit → subscriptions/tags/ratings-family →
reports/edits/collections → then per-entity blocks: instrument-*,
area-*, place-*, series-*, label-*, work-*, artist-*, …). Identify which
entity class the new page belongs to (its URL's `/​<entity>/<mbid>/…`
segment) and which existing sibling it's the closest cousin of — e.g. a new
`label-recordings` filtered variant belongs next to `label-relationships`/
`label-releases`, not appended at the end of the file. Insert there, copying
that sibling's `match()`/`buttons`/`tableMode` shape as your starting point
rather than writing from a blank template.

`match(path, params)` should key off the URL's literal path segment (and any
disambiguating query param, e.g. `filter=0` vs no filter) exactly the way
the neighboring entry does — check whether the neighbor distinguishes a
"-filtered" variant via a query param and mirror that if this page has the
same filter toggle.

## 3. Column pipeline

For each column identified in step 1.6:

- **Plain text / a single link** → usually needs no extractor; the default
  cell text is fine.
- **A shape another pageType already extracts** (an artist-credit cell, a
  format+count cell, a country+date cell, a relationship-icon cell) → reuse
  that `ColumnDataExtractor` entry by name in `columnExtractors`. Grep the
  extractor registry for the closest existing name before writing a new
  one — nearly every "new" column shape on a new page turns out to be a
  shape another page already handles.
- **A genuinely new shape** → add a new function to `ColumnDataExtractor`
  with a JSDoc block, reference it by name in `features.columnExtractors`,
  and add its header string(s) to `syntheticColumns`. If it emits a hidden
  sort-key span (anything not meant to show up in filter text), add that
  span's class to `_CLEAN_STRIP_SEL` in the same change — this is the one
  step that has no visible symptom until someone filters the column and
  gets matches against invisible sentinel text.
- **A list-shaped or prose-shaped cell that should collapse** → add the
  column's header name to `features.collapsableColumns`; no other wiring
  needed; `_findCellListItems()`/`_classifyCollapseCell()` handle
  classification automatically (see `CLAUDE.md`'s `collapsableColumns`
  section if the cell shape is ambiguous between list and prose).

Don't invent a bespoke pipeline (à la `release-tracks`) unless the page
genuinely needs in-place DOM surgery the generic extractor pipeline can't
express — that's a large, page-specific mechanism, not something to
reach for by default.

## 4. Verify against the render pipeline

Before considering the entry done, trace it through
`startFetchingProcess()`'s actual sequence once:
`resolveEntityFeaturesFromH2` (only if step 1.7 applies) → merge with
`baseDef.features` → `buildActive*` helpers → DOM pre-processing
(`applyRenameH2ToH3`/`applyInsertH2`/`applyListToTable`, in that order) →
fetch loop → `renderFinalTable` or `renderGroupedTable`. If `tableMode` is
`'multi'` and `div#content` was absent (step 1.1), re-read the
"user-tags container re-root" section of `CLAUDE.md` and confirm
`targetHeader` ends up inside whatever `container` resolves to after
cleanup — don't just assume it works because the code compiles.

## 5. Document the snapshot

If the HTML file under `debug/` isn't already named descriptively, rename
it to `<pagetype>.html` (or `<pagetype>-original.html` if you expect to also
capture a `-final.html` post-render snapshot later). Add an entry to
`debug/NOTES.md` in the same style as the existing ones (see the
`## 2026-07-01 — report pages` entry for the level of detail expected: has
`div#content`?, heading shape, table/list shape, column count, pagination,
row-count estimate). This is what saves the next session from re-deriving
the same DOM facts from scratch.

## 6. Version bump + changelog

Mandatory, same session, no exceptions per project convention:

1. Bump `// @version` in the `==UserScript==` header — format
   `M.MM.NNN+YYYY-MM-DD`, read the current value first, don't assume it.
2. Prepend an entry to `ShowAllEntityData_CHANGELOG.json` labeled
   `"🚀 Feature"`, naming the new pageType and, briefly, what it consolidates
   (paginated tables → single filterable view, or similar, matching the
   phrasing style of existing 🚀 Feature entries).
3. New functions get JSDoc blocks; 4-space indentation; no trailing
   whitespace — the same baseline as every other change in this project.

## Known failure modes

- **Container re-root skipped**: `tableMode: 'multi'` on a page with no
  `div#content` renders h3/table pairs outside the real container —
  master-toggle finds nothing, tables look "invisible" even though they're
  in the DOM. Always re-check step 1.1/step 4 together.
- **Everything crammed onto one heading**: a page whose only heading is a
  native `<h2>` gets `renameH2ToH1` without a paired `insertH2` — the
  page-load button toolbar and the post-render filter/count UI both end up
  jammed onto the same line. Always pair those two flags.
- **Silent filter-text leakage**: a new extractor emits a sort-key span but
  nobody adds its class to `_CLEAN_STRIP_SEL` — filtering the column starts
  matching against invisible sentinel text with no visible cause.
- **Wrong tableMode from a quick skim**: a page with 2-3 `<h2>` sections
  that all happen to look similar in a quick read gets `tableMode: 'single'`
  when it's actually entity-driven (`entityFeatures` per `<h2>`, `multi` at
  runtime for at least one sub-entity) — re-check step 1.7 specifically
  when the page has more than one heading, even if the first two look
  alike.

## How to drive this skill

Point at the file and say what the page is, e.g.:

> "Here's `debug/label-recordings-filtered.html` — add a pageType for it,
> should behave like `label-relationships-filtered` but for recordings."

Claude Code will read the snapshot, walk through the seven facts in step 1,
find the nearest neighbor in `pageDefinitions`, and write the entry plus the
version bump and changelog line before showing the diff.
