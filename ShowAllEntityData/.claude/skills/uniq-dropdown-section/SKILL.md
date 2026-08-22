---
name: uniq-dropdown-section
description: Add a new section (or a new entry family within an existing section) to ShowAllEntityData's unique-values dropdown (the 📊 column-header filter panel). Use this whenever the user asks to add a new filterable/selectable value type to the dropdown — a new "Cell structure" state, a new synthetic entry family (roles, attributes, flags, entity info, relationship icons, etc.), or a request to split an existing section into sub-sections. Trigger on phrases like "add a section to the unique-values dropdown", "make X filterable in the 📊 dropdown", "add a new entry type to the column filter panel", or any request describing a new kind of selectable/checkable value that should appear when a user clicks a column's 📊 button.
---

# Unique-values dropdown: new section workflow

ShowAllEntityData's 📊 unique-values dropdown has grown a new named section
roughly every few versions (Structure, Flags, Credit details, Entity info,
Roles, Relationship icons, Country/Format/Catalog details, …). Every one of
these additions touches the same handful of places in
`ShowAllEntityData.user.js`, in the same order, and skipping one of them
produces the same handful of recurring bugs (silently dead entries, entries
invisible to quickfilter, entries that survive one filter pass and then
corrupt on the second). This skill is the checklist that shortens that
instruction cycle to "describe the new section" instead of re-deriving the
wiring from scratch each time.

## Before writing any code

Ask (or infer from the conversation) these four things — they determine
which of the steps below are needed:

1. **What triggers a match?** A DOM shape already present in MusicBrainz's
   native markup (e.g. `.artist-roles` list, `.comment` span), or something
   this script already computes/injects (e.g. `addCAA` presence, a
   multi-row cell's collapsed state)?
2. **Is it a single fixed set of values** (e.g. 5 known cell-structure
   states) **or an open set derived from cell content** (e.g. one entry per
   distinct role word actually present on the page)?
3. **Does an existing section already fit**, or does this need a new
   top-level section? (Check `SYN_SECTION_META` first — sections have been
   split before, e.g. "Credit details" → "- Attribute"/"- Task"/etc., and
   "Structure" → "Structure"/"Structure - Inline artwork". Prefer extending
   an existing section over inventing a new icon/header unless the values
   are genuinely a different topic.)
4. **Does this need to be gated behind a setting?** Anything with
   non-trivial per-cell DOM work at render time has historically shipped
   behind a `sa_enable_…` toggle (e.g. flag icons, inline artwork
   observers) so it's opt-in on large tables. Cheap query-time-only
   extractors (most of the Roles/Entity-info family) have shipped on by
   default.

## The eight touch points

Work through these in order. Every one of them has bitten a past version
when skipped — see "Known failure modes" below for the specific bug each
step prevents.

1. **`SYN_SECTION_META`** — add (or reuse) the section's icon, label, and
   sort order. Follow the established `"Topic"` / `"Topic - Subtopic"`
   naming convention (capitalized subtopic, single dash, e.g.
   `"Credit details - Attribute"`). New independent sections get their own
   emoji distinct from every existing one.

2. **`MB_UNIQ_KIND_TO_SECTION`** — map the new entry "kind" string(s) to
   the section from step 1.

3. **Extractor function** — `_findCellXxx()`. Pull candidate value(s) from
   a live `<td>`. Reuse an existing extraction technique where the DOM
   shape matches one already handled (direct-text-node-children walk for
   role-style lists, TreeWalker segment walk for icon-prefixed values,
   etc.) rather than inventing a new one.
   ⚠️ **Must also recognize its own highlight wrapper.** If a
   `_highlightXxxMatch()` (step 5) wraps a matched substring in
   `<span class="mb-column-filter-highlight">`, the extractor will run
   again on re-filter/reopen and must not silently drop that node — read
   through it. (This is exactly the class of bug fixed in v9.99.889 and a
   related one in v9.99.899: a text-node-only walk skipped content it had
   itself wrapped in a highlight span on the previous pass.)

4. **Structure-mode matcher** — wire the new kind into
   `_cellMatchesStructureMode()` (or, for an open/derived set, a new
   `something:` compound prefix mode alongside the existing `name:` /
   `comment:` / `alias:` / `role:` family). This is what makes checking the
   entry actually filter rows.

5. **Highlight function** — `_highlightXxxMatch()`, wired into
   `testRowMatch()`'s highlight dispatch, so a checked entry visually marks
   the matching text in the cell (and so the multi-row collapse toggle's
   hidden-match tint (`_COLLAPSE_MATCH_SEL`) picks it up for collapsed
   rows).

6. **Render into the dropdown** — in `openUniqDrop()`, call
   `getOrCreateSynSection()` for the section from step 1 and append the new
   entries as checkbox rows, each carrying `dataset.mbUniqSynLabel` (see
   next point) and, on the value it filters to, whatever kind marker
   `_cellMatchesStructureMode()`/the compound-mode dispatcher expects.

7. **Quickfilter wiring** — confirm the new entries have
   `dataset.mbUniqSynLabel` set. `_applySynBoxQuickFilter()` only sees
   entries carrying this attribute; the "Relationship icons" section
   shipped for several versions with a live gap here (fixed v9.99.832)
   because its entries were built through a different code path than
   everything else and nobody added the dataset attribute.

8. **Changelog + version** — per project convention, add a `"🚀 Feature"`
   (or `"✨ Improve"` for an addition to an existing family) entry to
   `ShowAllEntityData_CHANGELOG.json`, naming the new section/kind and the
   extractor/matcher/highlighter function names it introduced, and bump
   the script version. Also apply the user's standing source-code
   preferences on any touched code: untabify tab stops, strip trailing
   whitespace, add a standardized JSDoc block to every new function.

## Known failure modes (why the order matters)

- **Silently dead entries**: section/kind added to the dropdown (step 6)
  but never wired into `_cellMatchesStructureMode()` (step 4) — checking
  the box does nothing.
- **Invisible to search**: entry rendered without `dataset.mbUniqSynLabel`
  (step 7) — works fine until someone types in the quickfilter bar, then
  vanishes along with everything else in its section.
- **Self-corrupting on second filter pass**: extractor doesn't recognize
  its own highlight wrapper (step 3's warning) — works the first time,
  breaks the second time a filter is applied or the dropdown is reopened.
- **Missing header/cell alignment**: for a section applied at the *table*
  level rather than per-row (rare, but see the `extractMainColumn`
  header-count-mismatch bugs in v9.99.884), make sure any per-group
  `<thead>` rebuild path (`renderGroupedTable`'s grouped tables, not just
  the single-table path) also picks up the new column — a fix applied to
  only one of the two rendering paths reappears as a bug report a few
  versions later.
- **Section too flat once it grows**: if a section accumulates many
  unrelated value families over time, split it into `"Topic - Subtopic"`
  sub-sections (precedent: v9.99.894 split six sections this way) rather
  than leaving one long undifferentiated list.

## How to drive this skill

Describe the new section like you would a feature request — name the
column(s) it applies to, what should become selectable, and paste (or
point at) a sample cell's DOM if the shape isn't a well-known one already
in the file (native `.artist-roles`, `.comment`, etc.). Example prompt:

> "Add a unique-values dropdown section for the 'Packaging' column — one
> entry per packaging type (Jewel Case, Digipak, None, …), same pattern as
> the existing Format info section."

Claude Code will search the actual file for the nearest existing precedent
(e.g. the Format-info section for this example), then work through the
eight touch points above against the real code, and finish with the
changelog entry and version bump before showing you the diff.
