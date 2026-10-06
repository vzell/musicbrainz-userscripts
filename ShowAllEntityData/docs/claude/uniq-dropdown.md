<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# Unique-values dropdown (📊)

## Unique-values dropdown: `SYN_SECTION_META` section-splitting

The per-column unique-values filter dropdown (`openUniqDrop()`) renders
collapsible sections inside a `synBox`, driven by three module-level tables
(defined together, just above `openUniqDrop()` itself):

- **`SYN_SECTION_META`** — `{ key: { label, glyph|markerClass } }`, the
  display metadata (name + icon) for every possible section.
- **`MB_UNIQ_MODE_TO_SECTION`** — maps a `makeSynItem()` "mode" string (a
  fixed structural/flag state, e.g. `empty`/`collapsed`/`title-mismatch`/
  `multi-medium`) to a `SYN_SECTION_META` key.
- **`MB_UNIQ_KIND_TO_SECTION`** — maps a `makeValueSynItem()` "kind" string
  (a dynamic per-value entry, e.g. `attr`/`date`/`formatsize`/`role`) to a
  `SYN_SECTION_META` key.

`getOrCreateSynSection(key)` lazily creates each section's DOM (header +
collapsible items box) on first use and caches it — sections render in
`synBox` purely in first-requested order, driven by the fixed call sequence
of `makeSynItem()`/`makeValueSynItem()` calls inside `openUniqDrop()`, not
by `SYN_SECTION_META`'s own object-key order (which just mirrors it for
readability).

Two kinds bypass the static `MB_UNIQ_KIND_TO_SECTION` table entirely and
resolve their target section dynamically inside `makeValueSynItem()`'s own
`sectionKey` ternary, because a static kind→section map can't express a
target that depends on data outside the kind string itself:
- `'name'` → routes to `` `entity_${entityType}` `` (falls back to
  `entity_other`), keyed by the entry's own `entityType`.
- `'arttype'`/`'artcomment'` → route to `caaInfoType`/`caaInfoComment` or
  `eaaInfoType`/`eaaInfoComment`, keyed by BOTH which column is actually
  open (`_caaOrEaaColName`) AND the kind itself.

One caveat: `makeInlineArtItem()` (inline-artwork-presence entries) is a
bespoke sibling function that bypasses `MB_UNIQ_MODE_TO_SECTION` altogether
and hardcodes its target section (`structureInlineArt`) directly — don't
assume every mode in that table is actually routed through it; check the
mode's real caller first.

**Naming convention**: every section label follows `"Topic - Capitalized
subtopic"` (a dash, capitalizing only the first word after the dash — e.g.
`'Credit details - Attribute'`, `'Release events - Country'`). This is the
single convention in force as of this file's latest revision; two earlier
deviations (`'Release events - country'` lowercase, and `'Country name
details'`/`'Country code details'` with no dash at all) were normalized to
match it. Any new section should follow this convention.

**Recognizing a split candidate**: when a `SYN_SECTION_META` key is fed by
2+ semantically distinct `kind`/`mode` strings — grep both lookup tables for
every value pointing at the same key — that's the same shape as every split
below. To split it: give each kind/mode its own `SYN_SECTION_META` key (or
extend the dynamic `sectionKey` branch in `makeValueSynItem()` if the
target genuinely depends on runtime data, not just the kind/mode string),
then update whichever lookup table(s) fed the old flat key. No other code
needs to change — `getOrCreateSynSection()`, `_applySynBoxQuickFilter()`
(iterates `_synSections` generically), and `MB_UNIQ_SECTION_COLLAPSE_KEY`
persistence (a plain string-keyed object, no fixed-key validation) all key
off the section key generically already. Not every multi-kind bucket is a
split candidate, though — `structure`'s own five cell-shape modes
(`empty`/`single`/`collapsed`/`expanded`/`any`) and `catalogPresence`'s
three prefix-flags stay merged deliberately: each group is genuinely one
topic (mutually-exclusive facets of one question), unlike the buckets
below, which mixed unrelated topics under one header.

**Split history**, for context:

| Version                                 | What split                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|-----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v9.99.872                               | "Entity info" → one sub-section per entity type (`entity_*`) plus Comment/Alias                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| v9.99.873                               | New sections carved out: Format info, Release events (country/date/weekday), Country name/code details, Tracks info, Catalog info                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| v9.99.882                               | New "Event info" section (event dates on native tag-value listings)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| v9.99.886                               | "Event info" renamed to "Event info - Event date"; new sibling "Event info - Event cancelled"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| v9.99.893                               | "Credit details" → `creditAttr`/`creditTask`/`creditDate`/`creditInstrument`/`creditAltName`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| next                                    | Structure/Flags/Format info/Tracks info/Catalog info/CAA info/EAA info each split further; "Release events"/"Country details" labels normalized to the current naming convention (see `// @version` header for the exact version)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| v9.99.1156-1164                         | Additions, not splits: `tracksTotal` (kind `trackstotal`), `lengthMs` (three flag modes `length-ms-*`), `timeOfDay` (kind `timeofday`, buckets in `_TIME_OF_DAY_BUCKETS`), `relTypeCredit` (kind `reltypecredit`, ONE static section with the type as an entry prefix rather than a runtime-created section per type). Also `_workAttrTypeLabels()`: "Attributes - Identifier type" now offers the parts of a slash-joined type (`BUMA/STEMRA ID` → `BUMA`, `STEMRA ID`) beside the compound.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| next (feature/video-medium-flag)        | Additions, not splits, and the first two sections driven purely by a `<td>` ATTRIBUTE rather than cell text: `lengthMismatch` ("Length info - Track vs recording", modes `lenflag-severe`/`lenflag-warn`, reads `data-mb-len-flag` via `_findCellLenFlag()`) and `videoMedium` ("Video info - Medium format", modes `videomedium-mismatch`/`videomedium-ok`, reads `data-mb-video-flag` via `_findCellVideoMediumFlag()`). Not column-gated — only the cells that carry the attribute ever count — and deliberately never highlighted (no text to mark; the cell's own tint is the mark). On the Video column these counts are the ONLY synthetic entries, so they must also be in both `makeSynItem` render gates, not just the render blocks (`scripts/mutations/video-medium-flag.json`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| next (feature/uvd-title-sections)       | Additions: ten "Title info - …" sections on EVERY "Title" column AND every column named in `sa_uvd_title_info_columns` (default `Name, Recording, Release, Release group, Release groups, Work`; `isTitleInfoCol`, `_uvdTitleInfoColumns()`; MB-Name deliberately left out — it duplicates the original column on 88 PTs). On every one of them a cell counts only when `_findCellTitleEl()`'s first entity link matches `_TITLE_ENTITY_HREF_RE` (recording/release/release-group/work/track), so artist/label/CD-stub names never do. After https://musicbrainz.org/doc/Style/Titles — `titleMedley`, `titleMulti`, `titleCount` (kind `titlecount`), `titlePart` (kind `titlepart`), `titleWork`, `titleEti` (mode `title-eti` + kind `titleeti`), and four behind `sa_enable_uvd_title_*` settings: `titleSubtitle`, `titleSeries` (+ kind `titleseries`), `titleFormat` (kind `titleformat`), `titleStyle` (`title-truncated`/`-ocremix`/`-allcaps`). Plus `ratingPresence` ("Rating info - Presence", `rating-has`/`rating-none`) on every "Rating" column. All Title entries come from ONE pure parser, `_parseTitleAnatomy()`, over `_findCellTitleEl()`'s text; ETI is a trailing `(…)`/`[…]` starting lowercase, except when that word is an article/conjunction/preposition ("Nancy (with the Laughing Face)" is a title). `titleWork` reads the SAME row's "Recording of work" cell and exists only where that column does (`_findRecOfWorkColIdx()`). Built once into `_titleRatingItems` and replayed by `_renderTitleAndRatingItems()` from both render blocks; `_titleRatingItems.length` is in both render gates — an unrated Rating cell also counts as "○ empty cells", which hid a missing gate until the all-rated spec (`scripts/mutations/uvd-title-sections.json`). Only `title-medley` and the value kinds are highlighted, scoped to the title element (`_highlightTitleAnatomyMatch()`). |
| next (feature/uvd-live-titles)          | Additions: seven "Live title info - …" sections on the same Title-info columns, but counting only cells whose title links a RELEASE or RELEASE GROUP (`_findCellLiveTitle()`, `_LIVE_ENTITY_HREF_RE`) — the two entities https://musicbrainz.org/doc/Style/Specific_types_of_releases/Live_bootlegs covers. One pure parser, `_parseLiveTitle()`: `valid`/`invalid` (month or day out of range, leap years honoured)/`nearmiss` (date-led per `_LIVE_DATE_LED_RE` but not "DATE[, info]: Venue, City, …"), or `null` for anything not date-led — a bare year never triggers, so "1984 Revisited" is not a live title. `liveValidity` (`live-valid`/`live-invalid`, plus the status of a status sub-table via `_tableReleaseStatus()`, which strips releasegroup-releases' " release" suffix), `liveNearMiss`, `liveDate` (`live-complete`/`live-partial` + kind `liveshape`), `liveExtra` (`live-extra` + kind `liveextra`), and `liveSepUnicode`/`liveSepAscii`/`liveSepMixed`: 3 × 5 `live-sep-<kind>-<facet>` modes filled into `MB_UNIQ_MODE_TO_SECTION` by a loop below it, not listed by hand. A YYYY-only date has no separator and sits in none of the three. Replayed through `_titleRatingItems`, so both render gates already cover them; behind `sa_enable_uvd_live_titles`. Never text-highlighted — the cell tint is the mark: `data-mb-live-flag` (`error` red ❌ / `warn` yellow ⚠️, `_liveTitleFlag()`), stamped ONCE per fetch/disk load by `stampLiveTitleFlags()` onto live AND master rows, so filter/sort re-renders carry it by `cloneNode(true)` (`tests/fixtures/uvd-live-titles.spec.js`, `scripts/mutations/uvd-live-titles.json`).                                                                                                                                                                                                                                                      |
| next (feature/findings-menus)           | Addition: `findingsWarn`/`findingsError` ("Findings - Warning"/"Findings - Error"), one fixed entry per `FINDINGS` registry entry present in the open column, mode `finding-<id>`, routed by a loop over `FINDINGS` below `MB_UNIQ_MODE_TO_SECTION` and labelled/tooltipped from the registry. Read off the `data-mb-findings` attribute `stampFindings()` writes, so not column-gated here (the stamp applied each finding's own column gate) and never text-highlighted (the cell tint is the mark). Counted into `findingCounts` in the per-row loop, replayed through `_titleRatingItems` so both render blocks and both render gates cover it. These are the entries the ⚠️ WARNING / ❌ ERROR h1 menus tick (docs/claude/findings.md); the finer per-family sections (Length info, Live title info, ISRC/ISWC/Barcode - Validity, …) stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| next (feature/uvd-event-names)          | Additions: `liveLoc` ("Live title info - Location completeness", kind `liveloc`, value = `_liveLocLabel()` of `_parseLiveTitle()`'s new `locParts`), and eleven "Event name info - …" sections on every column in `_uvdEventNameColumns()` ("Event" + `sa_uvd_event_name_columns`), counting only cells whose first non-comment `<bdi>` links `/event/<mbid>` (`_findCellEventName()`). One pure parser, `_parseEventName()`: the live form first (its `_parseLiveTitle()` verdict rides along as `live`), then the https://musicbrainz.org/doc/Style/Event forms in the order at → festival edition → tour, then the `_EVENT_STYLE_NEAR_MISSES` list, else free form. `evForm` (`evform-<form>`), `evStyleNearMiss` (`evform-nearmiss` + kind `evstylemiss`), `evFestEdition` (kind `evedition`), and `evLive*` — the live sections again: **their modes are the live modes with an `ev` prefix, and `_eventNameMatchesMode()` strips it and calls `_liveTitleMatchesMode()`**, so a new live facet reaches events by adding its `ev` row to the two lookup tables, never by copying matcher code. Counting shares `_countLiveVerdict()`/`_newLiveCounts()`, rendering `_pushLiveSections(prefix, counts, sfx)`. Behind `sa_enable_uvd_event_names`; never text-highlighted. Events reuse the `data-mb-live-flag` tint via `_findCellAnyLiveTitle()` in `_stampLiveTitleRow()` (`tests/fixtures/uvd-event-names.spec.js`, `scripts/mutations/uvd-event-names.json`).                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| next (feature/uvd-recording-comments)   | Additions: twelve "Recording comment info - …" sections (`rcForm`, `rcType`, `rcNearMiss`, `rcMultiDay`, `rcInfo`, and `rcLive*` = the live sections with an `rc` mode prefix, same rule as `ev`) on every column `_recCommentColumnKind()` names: `'link'` = Title + `_uvdTitleInfoColumns()` (reads the `.comment` of a `/recording/<mbid>` link), `'plain'` = `sa_uvd_recording_comment_columns` (default "Disambiguation", the cell text). The synthetic "Comment" column is deliberately neither. One pure parser, `_parseRecordingComment()`, built on `_liveVerdictFromMatch()` (split out of `_parseLiveTitle()`, no behaviour change) and `_LIVE_DATE_ONLY_RE`; `EVENT_TYPE_KEYWORDS` is now one module-level constant shared with `eventParts()`, longest first, with "rehearsal" added. Location completeness for the dateless `location` form is counted from the verdict's own `locParts`, outside `_countLiveVerdict()`, and matched by an `rcliveloc:` branch that does not need a live verdict. Also three eventParts sections: `eventPartsCountryForm` (`evcountry-abbr/full`), `eventPartsDetail`/`eventPartsAddInfo` (`evdetail-*`/`evaddinfo-*` presence counted only on rows with an Event-Type, plus kinds `eventdetail`/`eventaddinfo`). All ride `_titleRatingItems` (`tests/fixtures/uvd-recording-comments.spec.js`, `scripts/mutations/uvd-recording-comments.json`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| next (feature/uvd-grouped-sections)     | Not a split: a second level ABOVE the sections. Every section now sits in a topic group derived from its label (see "Grouped topics and prefix hoisting" below), and a one-section topic is merged into one header line. No `SYN_SECTION_META` key changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| next (fix/live-multidate-and-retry-dup) | Additions: `liveMulti`/`evLiveMulti`/`rcLiveMulti` ("… - Multiple dates", modes `live-multi-days`/`live-multi-dates` with the usual `ev`/`rc` prefixes), counted by `_countLiveVerdict()` from `_parseLiveTitle()`'s new `multi` field and matched by `_liveTitleMatchesMode()`. The parser now accepts several dates per title (`_parseMultiDateLiveTitle()`: "DATE/DD/DD: Loc", "DATE: Loc / DATE: Loc", "DATE / DATE: Loc"), each date judged by `_parseLiveTitleWithDays()`; a single-date title never leaves the old path (`'/'` pre-check). (`tests/fixtures/uvd-live-titles.spec.js` with `releasegroup-releases-live-multidate.html`, `scripts/mutations/live-multidate-retry-dup.json`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Grouped topics and prefix hoisting

Since `feature/uvd-grouped-sections` (`sa_uvd_grouped_sections`, default on)
every section is rendered inside a TOPIC group. Mockups and the user's
decisions: `org/UVD-redesign.org`.

- **The topic comes from the label, not from new metadata.**
  `_uvdSectionTopic()` splits a `SYN_SECTION_META` label at its first `" - "`.
  That is why the naming convention above is now load-bearing: a new section
  labelled "Foo details - Bar" lands in a topic called "Foo details", and a
  typo in the topic part makes a second, separate group. `UVD_TOPIC_TOOLTIPS`
  holds an optional one-sentence tooltip per topic. A missing one falls back
  to the sub-section list.
- **Labels keep their full textContent.** The section label is three spans
  (`.mb-uniq-section-topic`/`-sep`/`-sub`) and the entry label puts the hidden
  part in `.mb-uniq-syn-prefix`. What the user sees is decided by CSS
  (`display:none`, `::before "» "`, `::after ":"`, `" › "`), and pseudo-element
  content is not text. About 50 specs and `__saTest.getUniqDropSections()` read
  `"Date info - Month"` and `"» month: February"`, and they keep passing for
  that reason. Never "simplify" this into rewriting the text.
- **Hoisting is data-driven and conservative.** `makeValueSynItem()` stores the
  prefix it built in `dataset.mbUniqSynPrefix`. `_uvdFinalizeSynGroups()` hides
  it only when every prefixed entry of the section shares the same `» …`
  prefix. Otherwise it hides only the leading `» `, because then the prefix is
  what tells the entries apart. It never guesses a prefix from the text: a
  value may itself contain `": "`.
- **Everything count-dependent waits for `_uvdFinalizeSynGroups()`**, called
  right before `appendSynDivider()`: merging a one-section topic
  (`.mb-uniq-group-merged`), hoisting, entry counts, and the state each
  section opens in. `getOrCreateSynSection()` can only apply the stored state,
  because the entry count is not known yet.
- **Collapse state** stays in the one `MB_UNIQ_SECTION_COLLAPSE_KEY` object.
  Section keys hold `true`/`false`, topic groups hold `"group:<topic>"`, and
  `__v` is `MB_UNIQ_SECTION_COLLAPSE_VERSION` (2). A missing section key means
  "auto": collapsed when it has more entries than
  `sa_uvd_autocollapse_threshold`. A plain click stores its result. A Ctrl+Click
  EXPAND does not: it removes a stored `true` and opens the section for this
  open only (`_uvdSessionExpanded`). The v1→v2 migration drops every stored
  `false`, because before grouping `false` meant only "not collapsed".
- **Ctrl+Click scopes**: a main header, or a merged section standing in for one,
  applies to every main header (`_uvdSetAllTopLevel()`). A nested sub-heading
  applies to the sub-sections of its own topic. The flat layout keeps "every
  section".
- **The quick filter forces both levels.** A section or group with a match is
  opened and shows `(N)`, and one without is hidden. Matching runs against the
  FULL label, so a match can sit entirely in a hidden prefix ("month"). Clearing
  repaints from `_uvdSectionCollapsed()`/`_uvdGroupCollapsed()`, not from the
  raw stored value, or auto-collapse would be lost.

Pinned by `tests/fixtures/uvd-grouped-sections.spec.js` and
`scripts/mutations/uvd-grouped-sections.json`.

## Flags in the dropdown: two third-party shapes, and what "hollow" means

`hasFlagIcons` is a column-NAME whitelist and `iconSel` is a SHAPE selector.
Both have to recognise a column before any flag reaches the 📊 panel, and each
has been the sole reason a column showed none.

**"Right Side Flags Everywhere" has TWO shapes and picks by whether the `.flag`
element wraps an `a[href*="/area/"]`.** This is the whole of the double-flag
story and is not obvious from the script's name:

- **With an anchor** — it neutralizes the sprite in place and puts its `<img>`
  in a sibling `span.mfe-flag-wrapper`. Excluded by `iconSel` since the Israel
  fix.
- **Without one** — `el.appendChild(img)` puts the `<img>` INSIDE the flag
  element and leaves the hollow element in the DOM. Both then matched
  `iconSel`, so one cell icon rendered as two dropdown icons, one before the
  name and one after.

Anything this script BUILDS is the anchorless case unless it emits a real
`<a>`, which is why the injected "Release country" column hit it and native
markup never did.

**Never infer "a userscript neutralized this flag" from the absence of a
paintable background.** They are different facts, and conflating them breaks a
working guarantee: a native flag paints from MusicBrainz's sprite stylesheet,
which is **absent in every fixture** and briefly absent on a slow real page, so
`resolveFlagVisual()` legitimately returns null for a perfectly good flag.
Keyed on that absence alone, `_bakeFlagIconNode()` stripped the trailing flag
from every "Entity info - Area name" entry — caught by
`uniq-drop-area-name-flag-position.spec.js`. Key on the userscript's own
`data-hq-processed` marker instead.

**A release event's country and date need an explicit gap, in TWO places.**
MusicBrainz's own markup puts `.release-country` and `.release-date` adjacent
with no whitespace, and this script's injected column reproduces that exactly.
Once a flag userscript replaces the sprite with a real `<img>`, the date ends up
against the flag on EVERY release-event column, native ones included. The gap
goes on `.release-date` (a stylesheet rule), never on the image — that script
sets its margins inline WITH `!important`, which no stylesheet rule can outrank.
CSS alone is not enough: the 📊 panel rebuilds an entry from `flagIconMap`
segments and never clones `.release-date`, so it needs `spaceAfter` on the icon
segment. Scoped to an icon inside a `.release-country`, because elsewhere an
icon decorates the text that FOLLOWS it and a blanket space would push every
flag away from its own name.

**A real flag NEVER goes in a dropdown entry's leading marker slot.** That slot
holds a generic entity glyph (`arealink` and friends); the flag is appended
AFTER the label, so an entry reads `[glyph] » area name: Spain [flag]`. This
was settled once for `'name'` entries and then drifted, because `'revcountry'`/
`'countrycode'` arrive by a different route — they pass their flag as a CLASS
STRING in `glyphClass` while `'name'` passes a baked NODE in `flagNode`, and the
marker slot rendered whatever `glyphClass` held. One panel showed both
conventions at once. A new flag-bearing kind must pick the trailing slot.

**Every `.flag` clone BAKED FROM A CELL carries `data-hq-skip`.** The class-only
glyph spans above deliberately do not: they have no inline background to
protect and are painted by the page's own stylesheet or by the flag userscript
itself, so opting them out would leave an empty span. RSFE's own rule
`.flag:not([data-hq-processed]):not([data-hq-skip]) { background-image: none
!important }` beats a normal-priority inline background (author `!important`
outranks normal inline in the cascade), and its MutationObserver watches
`document.documentElement` while the panel is appended to `document.body` — so
an unmarked clone is blanked and then redecorated with a foreign image.

**`iconSel` and the bake guard cover for each other, in both directions.**
Mutating either one alone leaves `uniq-drop-hollow-flag-double-icon.spec.js`
green; only removing both reproduces the defect, and
`scripts/mutations/release-events-native-markup.json` records that as one
combined entry plus two `expect: "pass"` singles. Do not "tidy" either guard
away on the evidence that its own mutation passes.

## Resizing: one shared panel, a grip rebuilt on every open

The dropdown is ONE element (`getUniqDropEl()`) reused by every column, and
`openUniqDrop()` empties it with `drop.innerHTML = ''` on each open. Two
consequences for the corner grip (`_wireUvdResizeGrip()`):

- The grip is re-appended on every open — it is not part of the element's
  one-time setup.
- The positioning block clears `style.width`/`style.height` and the
  `data-mb-uvd-sized` marker BEFORE applying this column's stored size
  (`sa_uniq_dropdown_geometry`, `{pageType: {columnName: {w, h}}}`).
  Without that reset a column with no stored size inherits the last resized
  column's size.

The size is stored as the rendered border-box size, so a sized panel is
`box-sizing: border-box` (CSS keyed on `[data-mb-uvd-sized]`); as content-box
every reopen grew it by border + padding. Staying open after a release outside
the panel rests on three things in the grip, not on the outside-mousedown
close handler: `preventDefault()` on `pointerdown`, pointer capture, and a
one-shot capture-phase `click` swallower. All of this is pinned by
`tests/fixtures/uniq-drop-resize.spec.js` and
`scripts/mutations/uniq-drop-resize.json`.

## The quick filter is focused on open, except on touch (`_autoFocusInput()`)

`openUniqDrop()` focuses `.mb-uniq-qf-input` one animation frame after the
panel is positioned, and the quick filter's × re-focuses it after clearing.
Both go through `_autoFocusInput()`: a plain `focus()` with a mouse, nothing on
a touch-primary device, where a focus raises the on-screen keyboard over the
panel (org/mobile.org). Keyboard navigation of the list is wired to the quick
filter's `keydown`. A touch device has no keyboard for it, so nothing is lost.
Specs: the 📊 cases in `filter-autofocus.spec.js` /
`filter-autofocus.mobile.spec.js`. A trap when testing it on a desktop: the
post-render global-filter focus fires 150 ms after the render. Opening 📊
before it lands lets it take focus from the quick filter, and that closes the
panel. `openSeries()` waits it out.
