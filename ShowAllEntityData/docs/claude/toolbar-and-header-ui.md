<!-- Split out of ShowAllEntityData/CLAUDE.md on 2026-09-27, verbatim (section headings unchanged). This file is the authority for its topic; CLAUDE.md keeps only a digest and the doc map. -->

# Toolbar, header controls and pills

## Column-header toggle family (`.mb-col-hdr-flex` slot)

**Eight** controls share that slot and that visual language. Seven share **one
CSS rule**; the eighth — the `⇅ ▲ ▼` sort group — cannot, and the reason matters
before anyone "finishes the job" by adding it to the selector list: the family
rule styles **one element as one pill**, and the sort glyphs are **three sibling
`span.sort-icon-btn`** that must read as one pill. Applying the family rule to
them gives three pills. They are drawn as a segmented pill instead — see "The
sort group" below — and the two share values through custom properties
(`--mb-hdr-pill-*`) so they cannot drift apart.

**The tokens are declared on `table.tbl thead`, not on `.mb-col-hdr-flex`,
deliberately.** `.mb-picard-col-hdr-btn` is inserted straight into its `<th>`
because the Picard header is the one header with no `.mb-col-hdr-flex` at all;
scoping the tokens to the flex row leaves that one control resolving `var()` to
nothing — silently unstyled while everything else looks fine. Custom properties
resolve through inheritance at computed-value time, so consuming rules may sit
earlier in the stylesheet than the declaration.

The seven that do share the rule, six of them since 9.99.1060:
`.mb-caa-col-hdr-btn` (▶🖼 + a real 16px thumbnail `<img>`, not an emoji),
`.mb-ms-col-hdr-btn` (▶⏱), `.mb-picard-col-hdr-btn` (▶♪),
`.mb-rel-col-hdr-btn` (▶🔗), `.mb-col-collapse-hdr-btn` (▶N▤),
`.mb-col-uniq-wrap` (`N 📊`) and `.mb-re-col-hdr-btn` (⚠/⏳, added for
org/503-handling.org F4 — see the Release-events section below). They were six
near-identical copies of the same declarations; grouping them means "these are
the same kind of control" is structural rather than something six blocks have
to keep agreeing on. The seventh was added by extending the three selector
lists, which is how to add an eighth — never by copying a block.

`.mb-re-col-hdr-btn` is the only member that is **not always present**: it is
painted only while the Release-events lookup is in flight or after it has
finally failed. That is deliberate, and it is what keeps a clean
`rendered.html` baseline free of new markup — only the `<style>` block moves
(`tests/snapshots/registry.org`'s "Expected drift").

`.mb-col-uniq-wrap` is the one member that is **not a toggle** — it opens the
unique-values dropdown — so it has no `aria-pressed`/`aria-expanded` arm; its
"on" state is `.mb-col-uniq-active`, which wins on specificity (two classes)
regardless of source order.

**Per-control deltas MUST sit after the family rule.** Same specificity, so
source order decides: `.mb-col-uniq-wrap`'s own block used to sit *before* it,
where the family's `margin-right: 3px` would have silently beaten the `0` it
needs as the flex row's last element.

Three per-control deltas are load-bearing and must not be "tidied" into the
family: `.mb-caa-col-hdr-btn` keeps `gap: 3px` / `margin-right: 0` for its
thumbnail; `.mb-col-uniq-wrap` keeps `gap: 0` plus `margin-left: auto` /
`margin-right: 0`; and `.mb-col-collapse-hdr-btn` keeps `margin-right: 0` because it is
NOT laid out by the family's margin — it carries an inline `margin-left: auto`
(set alongside clearing `.mb-col-uniq-wrap`'s own inline one), so both it and
the uniq wrap have `margin-left: auto` and the flex row splits the free space
between them. That split is the gap before 📊. Its state attribute is
`aria-expanded`, not `aria-pressed`, so it has its own arm in the engaged rule;
and its focus ring comes from the page-wide `:focus-visible` group (with
`!important`), which is why it is deliberately absent from the family's own.

**The resting state is a light pill, not 60% opacity on a transparent ground.**
The old style came from when these sat only on the plain `#e8e8e8` header. It
fails on an injected column: that header is `#b8b8d0` and 🔗 renders as a
*blue-grey colour emoji*, so glyph and ground were the same hue at the same
lightness — and sorting made it worse, blending `rgba(255,200,80,.60)` over the
header (`_MSCOL_HDR_TINT_RGBA`) to `rgb(227,194,131)`, i.e. a cool glyph on a
warm ground. A ground of the control's own fixes every combination including a
header the user recoloured via `sa_ui_thead_th_bg` /
`sa_ui_thead_th_injected_bg`, which no hand-picked glyph colour could.

**Two traps, both of which bit during that change.**

- **Raising the resting opacity silently merged two ⏱ states.** The settled
  "no sub-second data on record" look had *no CSS rule of its own* — it was
  dimmed purely by the family's `opacity: 0.60`, so lifting that made
  `unavailable` look identical to a normal available button, collapsing it into
  the `retry` state the millisecond feature is at pains to keep distinct (one is
  worth a second click, the other is not). It now has an explicit
  `[aria-disabled="true"]` rule, and `work-recordings-ms-length.spec.js` pins
  the dimming. **Before changing any base declaration here, check which states
  were relying on inheriting it.**
- **A state tint's alpha is relative to what is behind it.** The retry yellow
  went `0.45 → 0.55` (hover `0.65 → 0.75`) and the engaged blue `0.13 → 0.20`
  purely because they now sit over a white pill rather than over the header.
  Those exact values are asserted, deliberately.
- **`em` compounds inside these controls, and it bit the one number a user
  actually reads.** `.mb-col-collapse-count` was `0.82em` inside a `0.80em`
  button — `0.66em` of the header, i.e. the multi-row COUNT was the smallest
  thing in the header. Anything nested inside one of these buttons needs sizing
  against the button's own `font-size`, not against the header's.

**Glyph presentation differs per button, and the reason is per button:**

| Button                   | Glyph comes from                         | Text presentation                             |
|--------------------------|------------------------------------------|-----------------------------------------------|
| `.mb-rel-col-hdr-btn`    | CSS `::before`                           | 🔗 + **U+FE0E**                               |
| `.mb-picard-col-hdr-btn` | CSS `::before`                           | ♪ is already a text char — no selector needed |
| `.mb-ms-col-hdr-btn`     | **element text**, `_msUpdateColHdrBtn()` | ⏱ + **U+FE0E**, in that function's strings    |
| `.mb-caa-col-hdr-btn`    | child `<span>` + a real `<img>`          | no emoji at all                               |

U+FE0E (VARIATION SELECTOR-15) forces an emoji to render as a monochrome
outline in the header's own colour. It is why ♪ never had the legibility
problem and 🔗 did. Where a font declines to honour it the glyph falls back to
the colour emoji *on a white pill*, which is still the old problem solved — so
it degrades safely. The ⏱ one lives in JS because that glyph is element text;
the `⏳` loading glyph deliberately keeps its colour, being transient and
informative. Three fixture specs assert these glyph strings **exactly, U+FE0E
included**, so dropping it fails a test rather than quietly regressing the look.

**The CSS is inside a `GM_addStyle` template literal.** A backtick in a comment
there terminates the literal and breaks the whole script; and a CSS `\\XXXX`
escape is read as a *JS* escape first, which is why this file writes glyphs as
literal characters. **Both have now cost a debugging round three times** — the
backtick one on the very commit that first documented it, and again at
9.99.1129 — and `node --check` reports the failure at the *start of the
template*, often hundreds of lines before the real cause, which is what makes
it slow to find. Grep the region you just edited for a backtick before reaching
for anything else.

**And `node --check` does NOT always catch it.** At 9.99.1129 a comment used
backticks for four id fragments; because they BALANCED, the file stayed
syntactically valid JavaScript and `node --check` passed cleanly. What
happened instead was silent: the literal closed and reopened, so every CSS rule
after that point stopped applying. The symptom was five failing pill tests —
including four that had nothing to do with the change — which reads like a
broken feature rather than a broken string. **An even number of backticks is
the dangerous case**, because the one tool you would reach for says the file is
fine. If a CSS change makes unrelated rules stop working, grep the edited
region for a backtick before debugging anything else.

### Column display labels (`_colLabel()`, `sa_short_column_labels`)

A column's **name** is its key: `data-col-name`, `collapsableColumns`, the 📊
sections, `sa_default_hidden_columns`, the 👁️ menus, exports and saved files
all use it. A **label** is only the text the header paints: the first text node
of `.mb-col-hdr-flex`, written by `makeTableSortableUnified()`. The full name
is the bold title of the header's tooltip card, which every header's card gets
(see "Column header tooltips" below).

- **Declaring a label.** Built-in labels go in `_COLUMN_LABELS`, for columns
  on many pageTypes: "Recording of" → "Work" and "Performance attributes" →
  "Perf." (since `feat/short-column-labels`). A single pageType adds or
  overrides labels with `features.columnLabels: { '<name>': '<label>' }`, which
  `_activeColumnLabels()` merges over the built-in ones.
  `sa_short_column_labels` off returns `{}`.
- **The way back from a label is the flex, never the text.** A labelled flex
  carries `data-mb-col-key="<name>"`. Saving to disk and the "Show
  single-table" handoff store the header's `innerHTML`, which keeps that
  attribute but loses the `<th>`'s `data-col-name`. The restore in
  `loadTableDataFromDisk()` rebuilds the header as the plain name from it
  (`_colKeyOfLabelledHeader()`). **Do not add a reverse lookup by label
  text.** "Work" is also a real column on `artist-works`, and a text lookup
  would rename it.
- **Every reader resolves the name.** Use `dataset.colName` or
  `_cleanColHeaderText()`, never a decorated header's `textContent`. Three
  readers used text and were switched:
  - `syncCollapseButtonsWithColumnVisibility()`'s `isColVisible`
  - `showStatsPanel()`'s column list
  - the "invalid regexp" filter message

  Specs: `tests/fixtures/column-labels.spec.js`. Planted defects:
  `scripts/mutations/column-labels.json`.

### Column header tooltips: the name in bold, then what the column holds

Every column header's "Liner notes" card is titled with the column's name.
`_tipTextToHtml()` puts `_tipHeaderColumnName(el)` above the tip's own lines,
unless the first line already is the name. This covers a `<th>` in the first
header row of a `table.tbl` with `data-col-name`. **It is done in the card,
not in the tip text**, so it holds for every writer:
- `_synthColTooltip()`'s "Derived from …"
- an injected column's explanation
- the Relationships header's load state, which changes later
- a description

It is skipped when the tip carries comparisons (`data-mb-tip-cmp`), whose
entries are numbered by the text's own lines.

**A column MusicBrainz renders itself gets a description** as its tip, from
`_COLUMN_DESCRIPTIONS`. `makeTableSortableUnified()` sets it only when the
header has no tip of its own; the decorator runs after `cleanupHeaders()`
stamped the script's columns.
- **The value:** a string, or an object of texts per **row entity** with a
  `default`. The row entity is what one row of the table is: `_tableRowEntity()`
  reads the kind of the first MusicBrainz link in the first body row, in the
  `stickyColumn`/`extractMainColumn` column first. "Type" on an artist's
  events (rows: `event`) is the kind of event; on a release-group list it is
  the primary and secondary types.
- **Per pageType:** `features.columnDescriptions` (same shape) wins over the
  built-in texts. It is the way in for a table whose rows are no entity, such
  as elections, annotations or CD stubs.
- **A text that changes:** a text may be a function, for a column whose
  content changes under the user. Length switches between seconds and
  milliseconds with ⏱.
  - A description tip carries `data-mb-col-desc`.
    `_refreshColumnDescriptions(colName)` rewrites only those, so a header
    whose tip another writer replaced is left alone. `release-tracks`'
    `_initLengthColHeaderTooltips()` removes the marker for that reason.
  - Whatever changes the content calls it; for ⏱ that is the end of
    `_msToggleLengthPrecision()`.
  - A description is the script's own tooltip (`data-mb-tip`), so
    `_isOwnColumnTooltip()` never takes it for jesus2099's on a native
    `treleases` header (docs/claude/release-tracks-and-length.md).
- **When there is no text:** off with `sa_column_descriptions`, and always off
  on a foreign site (`_foreignHost`), whose columns these texts do not
  describe. A name with no entry gets no tip, as before.
- **Not covered yet:** the edit-detail and merge tables (Old/New tracklist,
  Into:, Track #). Their meaning was not checked, so they have no entry.

Specs: `tests/fixtures/column-descriptions.spec.js`. Planted defects:
`scripts/mutations/column-descriptions.json`. Snapshot baselines drift by the
new `title`/`data-mb-tip` on native headers (`tests/snapshots/registry.org`,
"Expected drift").

## The SAED button: the h1 toolbar is ONE segmented button

Since 2026-10-22 (approved mockup v6:
https://claude.ai/artifact/QUqoriyP6qX3D3EutjhyzX; v1–v5 and the superseded
changelog chooser https://claude.ai/artifact/Qk6RSyT5EieQxRiVnYKzUV are its
history). It replaced 📦 Data ▾, 🛠 View ▾, 📀 Discography ▾ as a button of
its own, the ⚙️❓ pill, the ⚠️ WARNING / ❌ ERROR menu buttons and every `|`
divider (`org/action-button-redesign.org` was the step before).

`#mb-saed-bar` sits first in `#mb-show-all-controls-container` and has three
AREAS (`span.mb-saed-area[data-mb-area]`), each reacting on its own. The
fourth, `attn`, is the one area of the **attention bar** `#mb-saed-attn-bar`
right after it (vzell 2026-10-29, approved mockup
https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag): the same look (class
`mb-saed-bar`, the same custom properties), its own rounded corners, and
`hidden` while it holds no segment (`_orderToolbar()`; `.mb-saed-bar[hidden]`
because the bar's `display` beats the browser's own rule). The findings show
on some pages only, so they no longer change the SAED button's shape. 🔄 sits
there too, and ⚠️ still shows at 0 on title-check pages:

| Area      | Holds                                                                 | Present                                  |
|-----------|-----------------------------------------------------------------------|------------------------------------------|
| `actions` | the `🧮N …` fetch buttons as `.mb-seg-action`; group labels as `.mb-seg-label` | always (on a narrow screen: hidden) |
| `disc`    | `#mb-disc-menu-btn` "📀 Discography: <view> ▾"                         | `artist-releasegroups`, post-render      |
| `menu`    | `#mb-saed-menu-btn` "☰ SAED ▾" (name: `sa_toolbar_menu_name`)          | always                                   |
| `attn`    | one segment per attention indicator with rows (🔄 2 ▾, ❌ 1 ▾, ⚠️ 43 ▾) | post-render, only while it has something |

Hairlines split the segments of an area, a heavier rule the areas, and the
first visible area of each bar has none (`.mb-saed-first`,
`_saedMarkFirst()`). Nothing but the attention bar follows the SAED button in
the container (`_TOOLBAR_TAIL_ORDER` is the two bars: since 2026-10-23 a
fetch's Stop and progress are in its segment, below; it MUST name the
attention bar, or the tail pass moves the SAED button after it).
Size and shape come from `sa_ui_action_btn_style`,
colours from `sa_ui_toolbar_menu_btn_style` ("SAED button colors"), both as
custom properties on the bar. The colour settings of ⚙️, ❓, Save, Load,
the divider and Stop were retired with it (`_SETTINGS_ORPHANED_KEYS`, and
`_GM_ORPHANED_VALUE_KEYS` for profiles past the migration).

**A fetch runs inside the segment that started it** (option (b) of the
approved mockup; `_saedRunStart()` … `_saedRunEnd()`, state in `_saedRun`):

- From the main pass's start (where the old Stop button appeared) the pressed
  segment is `.mb-seg-running`: a blue fill to its `--p` custom property
  (`_saedRunProgress(n, N)`, a background IMAGE, so the segment's inline
  red/orange/green `background-color` — still set per page, still shown
  after the run as before — stays under it), "■ Stop · n / N"
  (`.mb-seg-stop-glyph`), `aria-label` "Stop loading", and a card saying
  so. The other action segments are `disabled`; the running one is not.
- **A click on the running segment is Stop** (`_saedRequestStop()`: the
  action's `onclick` checks `_saedRun.btn === eb` before
  `startFetchingProcess()`; prefix-mode O calls it too). It sets
  `stopRequested`, says "Stopping…" and `aria-disabled`; the loop finishes
  the page under way, and the status line then says "Stopped by you after
  page n of N … — the rest was not loaded". There is no `#mb-stop-btn` and
  no `sa_ui_stop_btn_style` any more.
- `_saedRunRendering(rows)` before the render tail: `.mb-seg-rendering`,
  striped (moving only under `prefers-reduced-motion: no-preference`),
  disabled, "Rendering N rows…". `_saedRunEnd()` at every exit of the run
  (render tail, save-without-render, cancel, abort, catch, a cancelled
  page-count dialog) gives back the label, `title` and `data-mbtt` it had,
  enables every action, and focuses the segment only when focus fell to
  `<body>` (the render tail's global-filter focus comes later and wins).
- **The words go under the heading**: `#mb-fetch-progress-wrap`, first in
  `#mb-status-displays-container`, written by `_saedRunStatus()` —
  "Loading page n of N · R rows so far · about t s left". The pre-fetch pass
  of `artist-releasegroups` and the overflow-medium loader write it too, but
  do NOT make the segment run: Stop is honoured from the main pass on
  (`stopRequested` is reset there), so a Stop offered earlier would be a lie.
- **A failed page ends as the 🔄 indicator** (`fetch-missing`, level alert,
  first in `_SAED_INDICATORS`). `_createResumeFetchButton()` (the old name,
  kept for its call sites) syncs it to `_resumeState`: "🔄 N ▾" with N the
  pages missing (no number when the page count was never learned), a note
  (`.mb-saed-ind-note`) with the page and `_httpFailureDetail()`, and the row
  `#mb-resume-fetch-btn` "↻ Load the N missing pages", which runs
  `_resumeFetchFromFailedPage()`. It is cleared at the START of every run
  (also a resume's, so it cannot be pressed twice), and by a load from disk.
  Specs: `fetch-in-segment.spec.js`; helpers in `tests/support/stopButton.js`
  (`stopAfterPages()`, `resumeMissingPages()`).

**The ☰ SAED menu** (`_saedMenu()`, key `saed`) holds GROUPS, in this order
(`_SAED_GROUPS`): Load (narrow screens only), Needs attention, Data, View,
Editing history (on a page about one entity only: `_saedHistoryGroup()`'s
"✎ Entity history ▸" submenu `hist-presets` and "📝 Annotation history",
docs/claude/detail-pages.md, "Entity-history presets"), Help, Changelog; the
installed version is its foot. A group is NOT a menu: it
is a menu-shaped descriptor from `_saedGroup(key)` registered in
`_toolbarMenus` with `isGroup`, whose `adopt()` puts a row in the group,
whose `open()`/`close()` are the SAED menu's, and whose `btn` is the ☰ SAED
segment. That is what keeps `_ensureDataMenu()` / `_ensureViewMenu()` and
every adoption site unchanged, and `_toolbarInvoke()` / `_toolbarAnchorFor()`
working. `_saedRefreshGroups()` (on every open and every `_orderToolbar()`):

- a group with no visible row is hidden; "Load" only on a narrow screen;
- **the View rule**: Keyboard Shortcuts sits in View while View has anything
  else, and last in Help otherwise (before a render there is nothing to view);
- `only` (the Tampermonkey "📜 ChangeLog" entry, `_saedOpenChangelog()`)
  hides every other group and the foot.

**The attention indicators are one registry, `_SAED_INDICATORS`** (glyph,
level, label; declared next to `_toolbarMenus` for the TDZ reason). Each
entry is a menu made with `createToolbarMenu({ segment: true })` whose button
`_orderToolbar()` puts in the `attn` area (of the attention bar) while it has rows, ordered by the
registry (alert first), and which `_saedRefreshAttention()` also lists as a
row of "Needs attention" that opens the same list beside the menu. Today: 🔄
missing pages (above) and the two findings menus (docs/claude/findings.md).
**Adding one** = an entry in
`_SAED_INDICATORS`, a menu filled by your own code, and
`descriptor.indicatorCount` set wherever its count changes; then
`_orderToolbar()` and `_saedRefreshAttention()`. The ⚠️ segment is the one
indicator shown at zero: it is where "Check title style" is started.

**Submenus** (`createToolbarMenu()`'s `open({ parent, besideRow, focusFirst })`):
a row carrying `_mbSubOpen(focusFirst)` opens its submenu after a 150 ms rest
of the pointer, on → or on a click; beside the parent's panel, on its LEFT
first (the SAED menu is right-aligned under its segment), level with the row;
in place under the row (`.mb-toolbar-menu-inline`) on a narrow or hover-less
screen (`_toolbarSubmenuInline()`). A submenu keeps its parent open
(`_closeToolbarMenus()` spares `parentMenu()`), takes the keyboard while open
(the parent's keydown returns while `openChild()`), gives it back on ← or
Escape, and a choice in it closes both. Export ▸ (`#mb-export-sub`) and the
"Needs attention" rows are the two users.

**The hover card** of ☰ SAED (`_saedCardHtml()`, `data-mbtt`): the full name
in bold, version, library, script manager and its version, browser (from
`GM_info.platform` when the manager reports it), author, "AI help from Claude
(Anthropic)". No request. The card engine shows no card for a control whose
menu is open (`aria-expanded="true"`), and `open()` takes down one already up.

The rules that carry over from the two menus it replaced, every one silent
when broken:

- **A panel must FIT the window: it is `position: fixed`.** Below its segment
  when it fits, else above when there is more room above, capped and
  scrolling inside. "The window" is what SHOWS, `_toolbarViewBox()` (the
  visual viewport), never `window.innerWidth/innerHeight`: on a phone whose
  page is wider than the screen the layout viewport is far larger (636 × 1296
  against 412 × 839 shown on releasegroup-releases), and a panel placed by it
  opened under the bottom edge (`saed-narrow.mobile.spec.js`, 2026-10-23).
- **Every phone gets the narrow layout.** MusicBrainz sets
  `width=device-width`, so a phone lays the page out ≈412 px wide and the
  action segments are rows of ☰ → Load. A spec presses an action through
  `pressAction()` (`tests/support/toolbarMenu.js`), which takes the Load row
  when the segment is hidden; a fixture without the viewport tag (the 5 KB
  `uniq-drop-viewport-clip.html`) is laid out 980 px wide and keeps its
  segments. Without a laid-out segment (hidden, scrolled away, or
  `opts.topRight`) it opens at the window's top right — the Tampermonkey route
  on a page scrolled down.
- **A row in a CLOSED panel has a ZERO bounding rect.** Every programmatic
  activation goes through `_toolbarInvoke()`; anything wanting an ANCHOR asks
  `_toolbarAnchorFor()` (for a group's row: the ☰ SAED segment).
- **The row-activation close listener is CAPTURE phase**, deferred one task.
  A row that opens a submenu, a `menuitemcheckbox` row (findings: tick
  several in a row) and a disabled row do not close.
- **An open panel and a SAED group are column flex containers**, so a row's
  own display computes to flex while an inline `display:none` still hides it.
  The rows' look is the menu stylesheet's ("Liner notes", `!important`): no row
  carries a colour of its own any more, and 📀's active view is
  `aria-checked` on a `menuitemradio` row, not a tint.
- **The keyboard hint is CSS `::after` from `data-mb-menu-hint`, never text.**
- **An empty menu or group must not render** — lazy creation inside each
  feature gate, plus `_orderToolbar()`'s reconcile (honest `"expect": "pass"`
  in the mutation list: no fixture empties a created indicator).

**`tests/support/toolbarMenu.js` holds the layout knowledge on the test side**:
`clickToolbarItem()` reads `data-mb-menu-owner` and opens the owning menu, a
group through ☰ SAED, Export's formats through their row. A spec that
hard-codes "open ☰ SAED, then click the row" pins the grouping; don't. Specs:
`tests/fixtures/saed-toolbar.spec.js` (mutation list
`scripts/mutations/saed-toolbar.json`), `app-help-github.spec.js`,
`findings-menus.spec.js` for the indicators.

## ↔️ Resize and 👁️ Visible live in the h2, before `#mb-filter-container`

They act on ONE table, so they sit beside that table's heading — the slot the
per-sub-table `.mb-subtable-resize-btn`/`.mb-subtable-vis-btn` pair has always
occupied in every h3. `_mountH2TableControl()` puts them there and returns false
when there is no h2-hosted filter bar, in which case both callers keep their old
`controlsContainer.appendChild()`. They keep their ids; only their content
became glyph-only.

- **The count stat has a fixed-width slot; keep it that way.** Every write of
  a `.mb-row-count-stat` text, h2 or h3, goes through `_setCountStatText()`.
  That function also writes `data-mb-sizer`, the widest text the span can show
  for its total. An invisible `::after` in an `inline-grid` renders it, so
  `(20)` and `(3 of 3)/20` take the same width and nothing after the count
  moves when a filter is typed or cleared. A new writer that sets
  `textContent` directly keeps a stale sizer, which is fine until the total
  gains a digit; then the shift is back. Pass `threeTier` for the h2 of a
  multi-table page, the only place `(F of T)/A` appears. See DEBUG-NOTES.md
  2026-10-04, and `tests/fixtures/row-count-stat-fixed-width.spec.js`.
- **One WRAPPER (`span.mb-h2-table-controls`), not two loose buttons.**
  `updateH2Count()` REPLACES `.mb-row-count-stat` on every filter change and
  re-anchors a fixed selector list of direct h2 children after the new span;
  anything it does not know about is displaced to the front of the heading on
  the first keystroke — this file records the same trap for `mb-rel-retry-*`. A
  single cached wrapper makes `_reanchorH2TableControls()` one sibling test and
  one `before()` call, **with no DOM query**, in a function that runs once per
  keystroke.
- **It is NOT in that selector list, and must not be added.** That list anchors
  on the count stat, i.e. inside the artwork/Relationships control runs, which
  are drawn as segmented pills selected by id prefix — an element between two of
  them splits one pill in two. Anchoring on `#mb-filter-container` puts the pair
  past the end of every run. (Adding the wrapper to the list anyway does not
  reproduce the bug: `_reanchorH2TableControls()` runs later in the same
  function and moves it back. The guard is the anchor, not the absence.)
- **`#mb-resize-btn`'s `title` is a TEST CONTRACT.**
  `tests/support/browser.js`'s `waitForRenderComplete({ waitForAutoResize })`
  polls for a title starting with `Restore` to know the auto-resize-on-load pass
  finished. `updateResizeButtonState()` is glyph-only now, so the title is the
  only thing carrying the state; moving the wording into the glyph would hang
  every render wait in the suite rather than failing loudly.
- **The rest state RESTATES `background`/`borderColor`, it does not clear them.**
  `uiActionBtnBaseCSS()` set neither, so `''` used to fall back to the UA button
  default; `uiHeadingGlyphBtnCSS()` sets both, and `''` removes them, leaving a
  transparent borderless button. Purely visual, so no spec sees it — recorded in
  the mutation list as `"expect": "pass"` rather than left unmentioned.

Covered by `tests/fixtures/h2-table-controls-anchor.spec.js` (mutation list
`scripts/mutations/h2-table-controls-anchor.json`), which turns
`sa_enable_caa_pics` back on — `FIXTURE_SETTINGS_OVERRIDE` forces it off, and
without it the pill assertion measures an empty run and passes for the wrong
reason.

## ❓ Help and the changelog open GitHub

Since 2026-10-22, nothing about help or the changelog is fetched, cached or
rendered in the page.

| What                         | Opens                                                   | From                                       |
|------------------------------|---------------------------------------------------------|--------------------------------------------|
| ❓ Help ↗ (`#mb-app-help-btn`) | `HELP_GITHUB_URL` (`ShowAllEntityData_HELP.md`)          | the SAED menu's Help group, prefix-mode H |
| 📜 What's new ↗               | `CHANGELOG_RELEASES_URL` (`ShowAllEntityData_RELEASES.md`) | the Changelog group                       |
| 🗒 Full development log ↗     | `CHANGELOG_LOG_URL` (`ShowAllEntityData_CHANGELOG.md`)     | the Changelog group                       |

The two changelog pages are GENERATED by `scripts/build-changelog-pages.py`
(What's new from FORUM.org's release sections, the log from the JSON, one
page per month) and published with the script (CLAUDE.md, "Publishing").

- **The Tampermonkey "📜 ChangeLog" entry is this script's**, registered next
  to "💾 Browser cache", past the no-pageType gate, so on supported pages only.
  It opens the SAED menu on its Changelog group alone. VZ_MBLibrary is built
  WITHOUT `remoteConfig`: with one, the library fetches the whole changelog
  (1.75 MB) hourly, keeps it in GM storage — which Tampermonkey hands to every
  page — and parses it on every page for its own dialog
  (org/userscript-size.org 2.3).
- **The Shift-click in-page help dialog is gone.** Its renderer and quick
  filter are VZ_MBLibrary 4.5.0's `Lib.showMarkdownHelp()` now, for other
  scripts; its rules (nodes never innerHTML, `*italic*` only, `<details>`
  open, `#anchor` scrolls the dialog, text kept in memory and never in GM
  storage) are recorded and pinned there (`tests/fixtures/lib-markdown-help.spec.js`,
  `scripts/mutations/lib-markdown-help.json`).
- **`window.open()`, never `GM_openInTab()`.** Every route is a click or a key
  press, i.e. a user gesture, and a new `@grant` would re-prompt every
  existing Tampermonkey user on update. `noopener,noreferrer` keeps the GitHub
  tab from getting a `window.opener` handle back.
- **The old caches are swept**: `-remote-help-text`, `-remote-help-md`,
  `-remote-changelog`, the library's changelog dialog size and
  `sa_app_help_geometry` are in `_GM_ORPHANED_VALUE_KEYS`
  (`_sweepOrphanedGmValues()`).

Covered by `tests/fixtures/app-help-github.spec.js` and
`tests/fixtures/saed-toolbar.spec.js`.

## The h2/h3 control runs are segmented pills too — three of them, not one

A second family, distinct from the `.mb-col-hdr-flex` one above: the buttons
that sit beside a table's heading. `org/503-handling.org`, "Retry UI: one
segmented control per table". The h2's ↔️/👁️ pair (above) is deliberately NOT
part of any of these runs — it anchors past the end of them all.

**The h1 toolbar's ⚙️/❓ pinned pair used to be a FOURTH run of this idiom.**
Since 2026-10-22 the whole h1 toolbar is one segmented button built
differently (areas with their own rules, no `!important` pill CSS): see "The
SAED button: the h1 toolbar is ONE segmented button".

**Three runs, selected by ID PREFIX, and no DOM change at all.** The ids were
already prefix-consistent, so the CSS needs no class and no wrapper:

| Run           | Prefix               | Members                                                                           |
|---------------|----------------------|-----------------------------------------------------------------------------------|
| CAA artwork   | `mb-caa-toggle-btn-` | `-{i}`, `-global`, `-retry-{i}`, `-global-retry`, `-retry-failed`, `-summary-{i}` |
| EAA artwork   | `mb-eaa-toggle-btn-` | the same set                                                                      |
| Relationships | `mb-rel-retry-`      | `-{i}`, `-global`, `-failed`                                                      |

A button added later joins its pill for free **provided it keeps the naming
convention** — so do not tidy an id out of its prefix. Conversely, the three
are kept apart deliberately: one shared selector would render a page carrying
both archives as a single long pill, implying one control group where there
are three sources. That regression *looks tidier*, which is why
`tests/fixtures/control-run-segmented-pill.spec.js` asserts the CAA run keeps
its right cap and the Relationships run opens its own left cap **while the two
are adjacent siblings**.

**Every declaration needs `!important` here, unlike the sort group.** These
buttons set `border`, `border-radius`, `background` and `margin-left` INLINE
(`_artCreateOrUpdateToggleButton`, `_REL_RETRY_BTN_CSS`, and the two rel-retry
creation sites), and a normal-priority stylesheet rule cannot outrank inline.
Same cascade fact this file records for the flag userscript's margins, reached
from the other side. A middle segment computing `border-radius: 3px` is the
symptom.

**Backgrounds are deliberately NOT unified.** The `⚠⟳` segment is yellow
because it means something; flattening the run to one ground would erase that
to gain nothing. The pill here is the shared height, one hairline between
segments, and rounded caps at each run's two ends.

**`_ctlRunEnd(el, skip)` — every control must append to the END of its run.**
This is the load-bearing part, and it fixed a real ordering defect the pill
merely exposed. `_artCreateOrUpdateRetryButton()` creates the `📊` summary and
then, a few lines later, the per-table `🔗⟳` — and both used to `.after()` the
*same* artwork `⟳`. Whichever ran last took the slot, so `🔗⟳` landed between
two artwork controls and the artwork run rendered as two pills with a foreign
one wedged between them. **All four insertion sites now resolve the run's end**
(the summary's create and re-anchor paths, the per-table `🔗⟳`, and the global
`🔗⟳`), which makes both creation orders converge on the same DOM. The `skip`
argument exists so the summary cannot anchor on its own position when it
re-anchors after a filter re-creates `.mb-row-count-stat`.

Before the pill this was invisible — the buttons merely looked shuffled — so
there was nothing to notice. Do not "simplify" any of those four back to
`anchor.after(...)`.

**`_hdrCtlAnchor(header)` is the sibling rule for the OTHER direction — where a
run does not exist yet.** `_ctlRunEnd()` answers "this control belongs beside
that one"; this answers "this is the first control in that heading, where does
it go". Both are needed, and getting the second wrong is how a control ends up
outside the run entirely rather than merely mis-ordered inside it.

It queries `:scope >` only, in the order
`[id^="mb-caa-toggle-btn-"] / [id^="mb-eaa-toggle-btn-"] / [id^="mb-rel-retry-"]`
(last match) → `.mb-row-count-stat` → `.mb-toggle-icon` → `lastElementChild`
→ `null`. **Never `header.querySelector('button:last-of-type')`**, which is
what `_relRetryAnchorFor()` used and which means "the first `<button>` in
document order that is the last `<button>` among ITS OWN parent's children" —
on an `<h3>` carrying a sub-table filter that is `#mb-stf-<col>-clear`, so the
control was appended INSIDE `span.mb-stf-input-wrap`. See the Relationships
retry section for the measurement.

`.mb-row-count-stat` is the right default because it is the slot
`_artCreateOrUpdateToggleButton()` already targets (`countStat.after(btn)`), and
because `updateH2Count()` re-anchors every `:scope > [id^="mb-rel-retry-"]`
after the rebuilt stat — so an `<h2>`-hosted control survives a filter
re-render with no new hook. An `<h3>` gets no such re-anchor, but
`renderGroupedTable()` rebuilds the whole heading and the controls with it.

### The sort group — a segmented pill, with zero DOM change

`⇅ ▲ ▼` are three sibling spans drawn as one pill: shared background and
top/bottom border, one hairline between segments, rounded caps on the run's two
ends only. Four things are load-bearing.

- **No wrapper element, ever — and never the class `sort-icon-btn` on one.**
  19 spec files locate these as
  `locator('.sort-icon-btn', { hasText: '▲' }).first()`. `hasText` is a
  **substring** match, so a wrapper whose text is `⇅▲▼` matches all three
  queries and, being first in document order, wins `.first()` — every one of
  those clicks would land on the wrapper's centre instead of the glyph it named.
  A differently-classed wrapper avoids that but still costs a re-capture of 14
  snapshot baselines.
- **The dividers are borders, never a `|` character.** A literal pipe is TEXT,
  and this header's text is read by ~25 places — most stripping a fixed glyph
  set by regex, including `makeTableSortableUnified()`'s own re-derivation of
  `colName`, which feeds `th.dataset.colName` and ~65 consumers from there. It
  would also break two exact-equality readers: `_exportCleanHeaderText()`'s
  `g === '▲'` and the `_clickSortIcon(bare)` resolver behind Ctrl+↑/↓/#.
- **`:first-of-type`/`:last-of-type` are WRONG here.** They count elements of
  the same TAG, and these spans are neither the first nor the last `<span>` in
  `.mb-col-hdr-flex`: a `.mb-caa-`/`.mb-ms-`/`.mb-rel-col-hdr-btn` or a
  `.worklink` glyph can precede them, and `.mb-col-uniq-wrap` **always** follows.
  Use the run-relative pair — `:not(.sort-icon-btn + .sort-icon-btn)` for the
  first, `:not(:has(+ .sort-icon-btn))` for the last. Mutated separately to
  attribute them: `:first-of-type` breaks only PREFIXED columns,
  `:last-of-type` breaks **every** column.
  `tests/fixtures/sort-pill-segments.spec.js`'s Length-column test is the sole
  guard on the first-in-run rule.
- **Side borders start at 0 and are re-grown.** Leaving the `border` shorthand's
  right border in place pairs it with the next segment's left border and draws
  every divider twice — 2px between segments, 1px at the edges. The spec caught
  this on its first run.

`.sort-icon-active` stays a bare class with `!important` (so it also beats
`:hover`) and keeps green-on-yellow rather than the family's blue: it is a
long-standing signal and far easier to find across a wide table. It now fills
the whole segment, which is only possible because the per-span radius is 0 for
anything mid-run.

## Column resize: the drag floor must be measured LATE

`makeColumnsResizable()` stamps `th.dataset.mbResizeMin`, but the value the drag
enforces is re-measured by `_measureHeaderMinWidth()` **at every mousedown**.
Both halves matter and the reasons are easy to get backwards.

- **Measure `max-content`, never `scrollWidth`.** `scrollWidth` on an element
  that FITS returns its `clientWidth` — i.e. the current column width — so a
  floor derived from it ratchets upward once a column has been widened, and the
  column can never be narrowed again. `max-content` is independent of the
  current width, which is what makes re-measuring safe at all.
- **Measure late, because the header is not finished at set-up time.** The
  `▶🔗` / `▶🖼` / `▶⏱` toggles are injected into `.mb-col-hdr-flex` *after*
  `makeColumnsResizable()` runs, and the `.mb-col-uniq-count` /
  `.mb-col-collapse-count` digits are written later still by the idle-scheduled
  `_updateAllColHeaderCounts()` — in batches, at most every 500 ms and at the
  end of its pass (PERFORMANCE.org Step 38), so a badge can stay empty for a
  while after the render. A floor frozen at set-up is short by 4-6 px on
  a plain column and by 43-126 px on one carrying a late toggle — which let a
  column be dragged narrower than its own header and clipped the 📊 pill.
- **The fresh measurement REPLACES the stamped one; do not `max()` them.** The
  stamped value is unreliable in both directions — too small for the reason
  above, and too large wherever it was taken after auto-resize had widened the
  column (measured: a floor of 765 px for a header needing 211, i.e.
  un-narrowable).
- **`_minWidth` lives in the per-column closure scope, not inside the mousedown
  handler.** `onMouseMove` is a sibling function, not a closure inside
  mousedown, so a `const` there throws `ReferenceError` on the first drag
  movement — and `node --check` cannot see it.

**When reproducing anything in this area, check the fixture settings first.**
`loadPage.js`'s `FIXTURE_SETTINGS_OVERRIDE` forces `sa_enable_caa_pics` and
`sa_enable_relationships_column` OFF for every fixture spec — i.e. it removes
the two largest late-injected controls (it also forces
`sa_enable_release_tracks_cover_art` off, which adds no table control). The first attempt to reproduce this bug
reported **0 of 21** affected columns for exactly that reason, against **20 of
21** on the real page. A "cannot reproduce" here means nothing until that
override has been switched back on.

## Script tooltips go through `_setTip()` ("Liner notes")

Every hover text the script sets itself is shown by ONE delegated engine,
`_initStatTooltip()`, as a "Liner notes" card in `#mb-stat-tooltip`. The engine
recognises a script tooltip only by its marker, `data-mb-tip`. MusicBrainz's own
titles and other userscripts' never carry it and stay native.

**Rule: never write `el.title = …` for a tooltip of the script's own; call
`_setTip(el, text)`.** It sets the title AND stamps `data-mb-tip`, and returns
`text`, so it also works where the assignment was used as a value. In markup
built as a string, write `data-mb-tip title="…"`. `scripts/mark-own-tooltips.js`
(acorn) converted all 238 assignments and 27 attributes in one pass on
2026-10-04; re-run its dry run to list any bare `.title =` that has crept back.
It skips the two engines' own stash/restore code (`_initStatTooltip`,
`_initRelTooltipListeners`).

How it behaves, and why:
- **Nearest title wins.** The engine takes `closest('[data-mbtt], [title],
  [data-mb-tip-saved]')`, the same element the browser would take a tooltip
  from. A native MusicBrainz link inside one of our headings therefore keeps
  its native tooltip; it does not show the heading's card.
- **The title is kept**, as the fallback when `sa_rich_tooltips` is off and for
  code that reads `el.title` back. While a card shows, the title is stashed in
  `data-mb-tip-saved` and offered as `aria-description`; leaving puts it back,
  unless code set a new title meanwhile. **A test that locates an element by
  `[title*=…]` must park the pointer first** (`page.mouse.move(0, 0)`): a
  pointer resting on the element has its title stashed.
- **Delegation, not wiring.** The marker is an attribute, so it survives
  `cloneNode(true)`; nothing needs re-wiring after a re-render.
- **Live titles.** A title changed under the pointer (a button relabelling
  itself on click) is re-stashed and re-rendered on the next mousemove. A
  mousedown hides the card for the rest of that hover, like a native tooltip.
- **`_setTip()` on a stashed element writes the stash, not `title`**, and
  repaints the card if the element is hovered. A control re-tipped on a timer
  (the ⚠⟳ counts during an artwork load) under a RESTING pointer gets no
  mousemove, so a written `title` stayed exposed and the browser drew its own
  box over the card (org/live-bootleg.org 1;
  `rich-tooltips-liner.spec.js` "pointer at rest").
- **It steps aside for the other rich tooltips.** No card opens while
  `#mb-art-bigbox-tooltip`, `#mb-art-hover-preview` or `#mb-rel-tooltip`
  shows (`_OTHER_RICH_TIPS`). The title stays stashed, so no grey box appears
  either. A Relationships icon whose cell a filter matches is skipped before
  the stash: its own stack (`#mb-rel-tooltip`, the filter box and the icon
  box, `_relStackParts()`, since 2026-10-17) shows it. Without a matching
  filter the card IS the icon box (`_tipTextToHtml()` returns
  `_relLinkNoteHtml()` for a `td.mb-rel-cell a`). **Give any NEW floating hover tooltip's id to
  `_OTHER_RICH_TIPS`**, or its elements' own titles will draw a card on top of
  it. All three were found in a browser, not by a spec: an inline CAA
  thumbnail's "N images found" card on its own preview, a Relationships URL
  shown twice.
- **The link preview card (`#mb-dp-peek`) takes the card's text over**
  (WIP.1, 2026-10-16). When a preview card is due or shows for a link INSIDE
  the card's element (a finding's tip on the Title `<td>`), the own card
  gives way, `_statTipApi.yieldTo()`, and the text becomes a box of the
  preview's note stack. `_statTipApi.resume()` brings it back when the
  preview closes. Until then both showed on the same target, whichever timer
  fired first. See docs/claude/detail-pages.md, "The note stack".
- `[data-mbtt]` (ready-made HTML: row counts, action buttons) keeps its old
  path: shown at once, no delay, and not gated by `sa_rich_tooltips`.
- `_tipTextToHtml()` only infers structure from plain text and escapes first.
  First line → `.mb-tt-title` (a lone line only if 60 characters or fewer), a
  "Configurable in" line → `.mb-tt-foot`, key combos → `<kbd>`. Its rules are
  pinned through `window.__saTest.tipTextToHtml`.

**One layer.** `.mb-tt-liner` carries `z-index: 2147483500`, and the five
tooltip elements carry none of their own. The 📊 dropdown sits at 999999 and
drew over the card of its own entries while the card was at 99999. A tooltip
is the top layer; only the page-corner notice (2147483000) comes close.

**One look.** `.mb-tt-liner` in the main `GM_addStyle` block is the style of
every floating tooltip: `#mb-stat-tooltip`, `#mb-art-bigbox-tooltip`,
the boxes of `#mb-rel-tooltip` (a stack since 2026-10-17; `#mb-rel-plain-tooltip`
is gone) and `#mb-ctrl-m-tooltip`. Give a new
one that class and its row classes (`.mb-tt-title`, `-body`, `-foot`,
`-comment`, `-dim`, `-rule`, `-pill`, `-alert`). Never give it inline colours:
the old dark panel's `#cdd6f4` / `#45475a` literals were what had to be hunted
down. It uses a system serif stack on purpose: no web font request, and nothing
for MusicBrainz's CSP to block.

Specs: `tests/fixtures/rich-tooltips-liner.spec.js` and the Liner notes case in
`touch-tooltip.mobile.spec.js`; mutations in
`scripts/mutations/rich-tooltips-liner.json`.

**The artwork card's `'Annotation'` entry is the one rich-HTML row.** A
`tooltipColumns` entry named `'Annotation'` goes through
`_artTooltipAnnotation()`, never `_artTooltipCellText()`. That path flattens
every line break, cuts a one-link annotation down to the link text, and a
plain clone would carry the cell's collapsed state with it: the clamp class
and the `display:none` of collapsed nested wiki `<h2>` sections. The card
widens to 600px for it. `#mb-art-bigbox-tooltip` is a singleton, so BOTH hover
handlers (strip and inline thumbnail) reset `maxWidth` to 380px before they
render. The card cannot scroll, so both handlers call
`_fitArtTooltipToViewport()` between `display = 'block'` and their position
measurement. It shortens the `.mb-tt-annotation` block and shows its "… (more
in the cell)" foot. Spec: `tests/fixtures/search-annotation-tooltip.spec.js`;
mutations: `scripts/mutations/annotation-tooltip.json`.

## Hover tooltips must ignore a tap (`_isTouchCompatMouseEvent()`)

On a touch device a tap fires *compatibility* mouse events: `mouseover`,
`mouseenter`, …, `click`. Firefox Android sends no `mouseout`/`mouseleave`
until something else is tapped. A floating tooltip shown on hover therefore
stays on screen after a tap. That was org/mobile.org bug 1: the h1 action
button's rich `#mb-stat-tooltip` hung over the rendered page.

**Rule: any handler that SHOWS a floating tooltip or popup on hover returns
early when `_isTouchCompatMouseEvent(e)` is true.** Pass the event when you
have it, since Chromium's `sourceCapabilities.firesTouchEvents` decides it
directly. Without one (e.g. `_showArtHoverPreview()`, called from several
`mouseenter` closures), it falls back to "a touch contact within
`TOUCH_COMPAT_WINDOW_MS`", which `_installTouchInputTracker()` records from
capture-phase `pointerdown`/`touchstart`. Guarded today: `_initStatTooltip()`
(every `[data-mbtt]` and `[data-mb-tip]`), the Relationships tooltips (`_initRelTooltipListeners()`),
`_showArtHoverPreview()`, the per-image `_showLiTooltip()`, the bigbox
wrapper tooltip and the inline-thumbnail tooltip. Hover *styling* (background
tints, `mouseenter` focus moves) needs no guard: the next tap moves it.

The tracker and its constants live in the `TOUCH INPUT` section, ABOVE the
sticky-page-headers code. `_initStatTooltip()` installs the tracker from the
IIFE's top level at page init, and a `const` read before its declaration line
throws (TDZ). Every top-level statement after that point would then never
run, on a desktop too. Declaring it next to `_initStatTooltip()` did exactly
that during development: no action buttons at all.

`tests/fixtures/touch-tooltip.mobile.spec.js` (project `chromium-mobile`)
pins "a tap never SHOWS it" with a `MutationObserver` that keeps
`attributeOldValue`, not "hidden afterwards". Chromium's emulation does send a
`mouseleave` after a tap on an artwork thumbnail, because the popup opens under
the touch point, so "hidden afterwards" passed with the guard removed. The
Relationships, bigbox-wrapper and inline-thumbnail guards have no tap spec of
their own yet.

**The sibling rule for focus: the script never focuses a text input on its
own initiative on a touch-primary device; go through `_autoFocusInput()`.**
On a phone a focus raises the on-screen keyboard over the page. Covered call
sites: the post-render global-filter focus (its own `_isTouchPrimaryDevice()`
early return, since it also clears `readOnly`), the column-filter ✕, the
sub-table-filter ✕ and its 🔍 reveal, and the 📊 dropdown's quick filter on
open and after its × (see uniq-dropdown.md). Left as plain `focus()` on purpose:
restoring focus to an input the user was already typing in (the keyboard is up
anyway), dialogs the user opened to type into (Save/Load filename, quick
filters), and keyboard-shortcut paths (no keyboard, no shortcut). Because the
global filter now gets its FIRST focus from the user's own tap on touch,
`_hardenFilterInputAgainstAutofill()` also lifts its `readonly` on a trusted
`pointerdown`. A field still readonly when it takes focus would take it
without the keyboard. Specs: `filter-autofocus.spec.js` (desktop: focus IS
moved) and `filter-autofocus.mobile.spec.js` (touch: it is not), sharing their
scenarios through `tests/support/filterAutofocus.js`.

## Sticky filter bars (vertical): the data h2 and the h3 bars stay at the top

Requested 2026-10-09 (branch `feature/sticky-filter-bars`): scrolled down, only
the thead stuck (`applyStickyHeaders()`), so the global filter and the row
count were gone. `sa_enable_sticky_filter_bars` (default **on**, 📌 Table
stickiness) now pins the data h2, the h3 sub-table bars under it, and the
thead under those. Code: the STICKY FILTER BARS section right after
`applyStickyHeaders()` — `initStickyFilterBars()` (called beside it at both
render sites), `_vsbRefresh()`, `_vsbBaseOffset()`.

- **Which h2:** the one holding `#mb-filter-container`, stamped `.mb-vsb-h2`
  by `_vsbRefresh()`. NOT `.mb-toggle-h2` — that is on every h2 (sidebar,
  Credits, wiki h2s in cells). The h3 bars are `h3.mb-toggle-h3`, created only
  by `renderGroupedTable()` (Credits/Annotation h3s have their own classes).
- **Pure CSS sticky, offsets in one generated sheet** (`#mb-vsb-dyn-style`,
  rewritten only when its text changes): h2 `top: B`; h3 `top: B+H2`; every
  thead `top: B+H2`, a thead after an h3 (`h3.mb-toggle-h3 ~ table.tbl >
  thead`) `top: B+H2+H3`; `scroll-padding-top` covers bars + thead so
  `scrollIntoView` (e.g. `_scrollToTrackTarget()`) lands below them. Offsets
  are FLOORED: a bar may overlap the one above by a fraction (it paints
  under it), never leave a seam rows show through.
- **B** (`_vsbBaseOffset()`): springsteenlyrics.com's navbar
  (`--mb-sl-navbar-h`, the value its thead rule already used), or a
  `body > div.header` that is `fixed`, or `sticky` WITH a `top` (jesus2099's
  "mb. STICKY HEADER"). The "with a top" part matters: the sticky page
  headers make `div.header` `position: sticky` too, sideways only, and the
  first version took that for the userstyle — the bars landed 1,555 px down
  in the fixture (the unstyled header's height).
- **One h3 height for all.** Every passed h3 stays stuck under the current
  one (same top, same z-index, later in DOM paints on top — that is how "the
  next bar takes over" works), so a taller earlier bar would peek out under
  a shorter one. All bars get `min-height` = the tallest bar's CONTENT
  height, measured with a `Range` over its children (`_vsbH3ContentHeight()`)
  because the bar's own box includes the min-height and would hold it up
  forever. For the same reason a SHRINKING bar does not change its box, so
  the ResizeObserver never hears of it: a MutationObserver on the bars'
  content (re-armed when the set of bars changes) schedules the re-measure.
- **The h3's indent** (`margin-left: 1.5em`, the table under it sits 4 px
  further left in the fixture) is masked with a page-coloured `box-shadow`
  shifted left, so rows never show beside a stuck bar.
- **The right end: one page-coloured strip at the window edge**
  (`#mb-sph-rmask`, 2026-10-14). With the sticky page headers engaged, a
  bar is capped (`--mb-sph-maxw`) a gutter short of the window, the room it
  needs to stay pinned to the end of the scroll (`_sphRefresh()`). A wide
  table ran on past that line to the window edge, and rows scrolling under
  a stuck bar showed beside it. `_sphUpdateRightMask()` now keeps one
  `position: fixed` strip at the window's right edge, top to bottom, as
  wide as the smallest gap between a pinned h2/h3 bar and the window edge,
  in the page colour (`_sphGutterBg()`): a wide table, its rows and its
  stuck thead end on the bars' line at every scroll position, like the
  Annotation / Credits / Wikipedia bars. z-index `SPH_Z_RMASK` 102: over
  the table (thead 100, resizer 101), under a raised h3 (103), the stuck
  h2 (104), the header block and MB's sidebar (105), the MB header and
  footer (106+) and every popup; `pointer-events` stay on, so nothing
  hidden under it can be clicked. Hidden without a pinned bar (no line to
  align to) and whenever the feature is disengaged. Three earlier
  versions were rejected in the user's browser the same day, each a
  per-bar `::after`: the strip beside the bar in the bar's colour (past
  the table's end at maximum scroll), the same clamped to the content's
  end on scroll (still further right than the section bars), and the same
  in the page colour (the table itself still ran on past the line). The
  gutter had also been ~100 px too wide on MusicBrainz: under
  `#page { display: table }` a collapsed sidebar stayed a table cell as
  wide as its min-content; it is `display: none` now
  (`initSidebarCollapse()`), after the 0.3 s slide-out (a discrete
  `display` transition). The initial collapse (`sa_sidebar_collapsed`)
  runs with the transition off: otherwise a page set to open collapsed
  kept the sidebar for 0.3 s and then reflowed under a pointer already
  resting on a link (8 `popup-ext.spec.js` failures on petri, 2026-10-14;
  spec "no sidebar box from the first frame"). The fixtures carry no MB stylesheet, so
  `sticky-page-headers.spec.js` injects that layout excerpt to see it.
  Specs: "a wide table ends on the h2/h3 bars' line" (painted pixels at
  scrollX 0 and with the bars stuck), "the right-edge mask lies under
  chrome", "stop where the table ends", "collapsed sidebar takes no
  space"; mutations: `scripts/mutations/sticky-gutter-sorted-thead.json`.
- **The opened sidebar and its handle on a wide page** (2026-10-14,
  reported on a release group). Auto-resize makes `#sidebar`
  `position: sticky` with `right: 0`. It is the last cell of MB's `#page`
  table, so on a page wider than the window its own place is past the right
  edge. It used to be `left: 0`, which never applies there, so an opened
  sidebar stayed out of view and only slid in while scrolling right (the
  page-coloured right-edge mask was NOT what hid it: the sidebar's z-index,
  105, is above the mask's, 102). `initSidebarCollapse()`'s handle sits at
  the sidebar's top (at `#content`'s top while collapsed), clamped inside
  the visual viewport, instead of `top: 50%`. After a click, and whenever
  `html`'s class changes (the sticky page headers switching), `followHandle()`
  places it every frame for 400 ms: the sidebar and the content containers
  slide for 0.3 s and a single measurement landed 50 px off. Changes inside
  the sidebar keep the single rAF measurement, so a render is not slowed.
  Spec: `sidebar-collapse-handle.spec.js` (3); mutations in
  `scripts/mutations/sidebar-overhaul.json` ("handle: …").
  **On a phone** (fixed 2026-10-14, after 9.99.1347): MB's pages carry no
  viewport meta, so a phone lays them out like a desktop page and a fixed
  element lives in a viewport wider than what is shown (Pixel 7 emulation:
  `innerWidth` 964, `visualViewport` 412). `right: 0` put the handle at
  x 949, never tappable. `updateHandlePosition()` now sets `left` (the
  coordinates `getBoundingClientRect()` and a fixed box share) and clamps
  the handle inside `visualViewport` (offsetLeft/Top, width, height), and
  `visualViewport` scroll/resize events re-place it. On a desktop the visual
  viewport is the window, so nothing moves there; it also no longer uses
  `innerWidth`, which counts the scrollbar while a fixed box's offsets do
  not. Spec: `sidebar-collapse-handle.mobile.spec.js` (a real tap, also
  after a pan). A pinch-zoom cannot be tested: headless Chromium ignores
  `Input.synthesizePinchGesture`, so the listener's mutation is recorded
  `expect: "pass"`.
- **Stacking ladder:** thead 100, column resizer 101, h3 102 (raised 103),
  data h2 104 (raised 107 = `SPH_Z_RAISED`), Brucebase side bar 150. A
  raised h3 stays UNDER the h2 (an h3 sliding in under the stuck h2 must
  not cover it while hovered). Raise = hover, focus inside except a text
  field merely holding focus, or an open in-place popup — the same three
  tests as the sticky page headers, whose own raise rules exist only while
  the page overflows sideways (`html.mb-sph-on`). Under them the h3's raise
  level is set through `--mb-sph-z-raised: 103`.
- **MusicBrainz's own modal dialogs go ABOVE the whole ladder** (2026-10-21,
  9.99.1413): MusicBrainz appends a jQuery UI `div.ui-widget-overlay.ui-front` and
  `div.ui-dialog.ui-front` to `<body>` (the sidebar cover's
  `.artwork-dialog`, `debug/mb-native-sidbar-image-open.html`) at jQuery
  UI's `.ui-front { z-index: 100 }`, and the stuck header block, the h2/h3
  bars and the sidebar handle (10000) painted through it.
  `_ensureMbDialogZStyle()` (init, MusicBrainz only) sets
  `body > .ui-widget-overlay.ui-front` to `MB_JQUI_Z_OVERLAY` (10050) and
  the dialog one above: over the ladder, the handle and this script's menus
  (10000–10002), under its own modal dialogs (20000+), the artwork viewer
  and the tooltips. `body >` makes it outrank `.ui-front` by specificity.
  The page also carries a hidden `.ui-dialog` of its own before any dialog
  opens. Spec `mb-dialog-above-bars.spec.js` (what `elementFromPoint` hits
  over the toolbar, the h2 and the handle); mutations
  `scripts/mutations/mb-dialog-above-bars.json`.
- **The sticky page headers' pinned content bodies** (status line, art
  strips, group intro, the entity header) are raised to 107 on hover by
  that feature; while the bars are on they are capped at 101
  (`--mb-sph-z-raised`), or a hover on the visible part of a body sliding
  under the stuck h2 lifts all of it over the bar.
- **Content after the data tables** in the same parent would scroll under
  the stuck h2. `_relocateTrailingH2Sections()` normally moves those
  sections above the data h2; with that setting off they do scroll under it
  (accepted, said in HELP).

Tests: `tests/fixtures/sticky-filter-bars.spec.js` — geometry and hit tests,
each core case with the sticky page headers on AND off (on a page wider than
the window those make every bar `position: sticky` too, which hid a missing
`position` rule of this feature in the first mutation run); the indent mask
and the gutter checks read painted pixels (a box-shadow is invisible to hit
testing). `sl-sticky-headers.spec.js` pins B on springsteenlyrics.com.
Mutations: `scripts/mutations/sticky-filter-bars.json` (the h2's popup raise
is `"expect": "pass"`: nothing between 104 and 107 overlaps it in the
fixture). The SPH-only stacking tests in `sticky-page-headers.spec.js` run
with this setting off (`SPH_ONLY`), since it deliberately changes the
"content bars have no base z-index" rule they pin.

**The sticky page headers' content root is `_sphPageEl()`** (2026-10-18):
MusicBrainz's `#page`, except on discogs.com, where it is our own
`#mb-dg-root`. Discogs' page has a `#page` of its own inside `#app`; taken
for the content root, it made our section a `<body>`-level "chrome" target,
pinned and capped whole with its tables (see docs/claude/discogs.md).

### The header block sticks above the bars

A second request the same day: the line with the action buttons and the
status line ("Loaded … Fetching …") stick too, above the data h2, on every
pageType. `_vsbHeadBlocks()` picks them, `_vsbRefresh()` stacks them
(`.mb-vsb-head` + `data-mb-vsb-head="i"`, one `top` rule per part; the h2,
h3 and thead offsets start below them), z-index 105 (`VSB_Z_HEAD`).

- **Which block:** the parent of `#mb-show-all-controls-container`'s `<h1>`
  when that is a MusicBrainz entity header (a `<div>` with a class ending in
  `header` and no table/h2 inside: `div.artistheader`, `div.seriesheader`, …
  — it holds the h1 and the p.subheader where the status line sits), else
  the bare `<h1>`; plus the status line's own line
  (`#mb-status-displays-wrapper`) when it is not inside that block. NOT the
  bare h1 inside an entity header: a sticky element only sticks inside its
  parent, so an h1 stuck inside `div.artistheader` goes as soon as that small
  div has scrolled by, and the subheader with the status line goes with it.
- **From page init**, not only after a render: `initStickyFilterBars()` is
  also called right after the status line is placed.
- **Too tall for the window:** if heads + h2 + h3 + thead exceed
  `VSB_MAX_STACK_SHARE` (60 %) of the window height, the header block is
  not stamped and scrolls; the bars still stick.
- **The MusicBrainz top header** sits right above the block and its long
  menus open down over it. `_vsbLiftChrome()` gives a header in the flow
  `.mb-vsb-chrome` (relative, z-index 108); one a userstyle made sticky/fixed
  gets `.mb-vsb-chrome-stuck` (108 only while hovered or holding focus, its
  own z-index otherwise — `sticky-page-headers.spec.js` pins z-index 1).
  It is decided AFRESH on every refresh, after stripping both classes: the
  first version decided once at page init, when a later userstyle was not
  there yet, and its `relative` then overrode the userstyle's `sticky` (and
  hid it from `_vsbBaseOffset()`), caught by that same SPH test.
- **The backdrop, `#mb-vsb-mask`.** The block has no background and is
  narrower than the table, so what scrolled under it showed through it and
  beside it (reported the same day: artist releases, the tabs ran through
  the status line; a recording page, rows behind and right of the h1). One
  `position: fixed` element, window-wide, at the block's top and height
  (dynamic sheet), z-index 103 (`VSB_Z_MASK`: under the h2 104 and the
  block 105, under MB's sticky sidebar 105, over everything that scrolls).
  It also covers the `VSB_HEAD_GAP` (6 px) the h2 docks below the block,
  asked for so the bar does not sit glued to the stats line.
  Shown (`.mb-vsb-mask-on`) only while the block is STUCK
  (`_vsbUpdateMask()`: scrolled, and the first part at its sticky top; one
  rectangle read, at most once per frame on scroll): in its natural place
  it would cover the top of MusicBrainz's sidebar. Pinned on painted pixels
  (green rows) in `sticky-filter-bars.spec.js`.
- **Tests and the sticky constraint box:** a sticky element is held inside
  its parent's CONTENT box, so padding on `#page`/`#content` gives no room to
  scroll — `addSpacer()` in the spec appends a real element. The fixtures'
  unstyled MB header is 1,555 px tall (taller than the window, ignored as a
  base by the third-of-the-window clamp); a test that needs it as a base caps
  it at 60 px.

## Async job popup (`_asyncJobs`)

One "Liner notes" card, `#mb-async-pop`, that every background job reports
through: what is being loaded, a progress bar (from cache / loaded / failed /
queued), where the data comes from and why, the last eight requests with their
outcome, and actions such as "Retry N failed". Mockup and rules agreed on
2026-10-09 (`https://claude.ai/artifact/P8LJjFQkURd6a8fHYVwrhq`). The code is
the `ASYNC JOB POPUP (_aj*)` block right after `_initStatTooltip()`.

**A job registers a provider and reports steps; the framework owns the rest.**
`_ajRegister(key, {glyph, label, snapshot, act, anchorFor?, scopeOf?})` once;
then `_ajStart(key, scope, {user, anchor})`, `_ajLog()`, `_ajPhase()`,
`_ajChanged()`, `_ajFinish()`. `scope` is the job's `<table>` (null for a
page-wide job). `snapshot(scope, job)` returns the card's content and is called
on every repaint, so it must be O(1) — counters the job already keeps, never a
row walk. `act(scope, id)` calls the job's EXISTING functions; the card never
starts a request of its own. Returning `null` from `snapshot()` shows nothing,
and the anchor's own Liner-notes tooltip applies as before.

**Cache rows, and the one async read a card may make.** A snapshot's `cache`
(`[label, text]` pairs) renders under its own "💾 Cache" heading: the job's
IndexedDB store and TTL, records in it, this run's memory / IndexedDB /
network split, the last idle sweep — the per-job slice of what the Statistics
panel lists for all stores. A store COUNT is asynchronous and `snapshot()` is
not, so a provider may declare `onOpen(scope, repaint)`: it runs once per
opening of the card (not on a repaint, not when a job start re-shows an
already-open card), starts the read (`_artIdbCountStore()`), keeps the answer,
and calls `repaint()` — the next snapshot shows it. Until then the row reads
"counting…".

**Anchors are found by attribute or selector, never wired.** A control
carrying `data-mb-aj="<key>"` is that job's anchor — used only on NEW markup
(▶🎼, which lives on a pageType with no baseline). An EXISTING control is
named by the provider's `anchorSelector` instead (`.mb-ms-col-hdr-btn`,
`.mb-rel-col-hdr-btn`, the status spans): writing `data-mb-aj` onto it would
drift every snapshot baseline that contains it. `_ajRegister()` folds the
selectors into `_ajPop.hoverSel`, and `_ajKeyOf()` resolves a hovered element
to its key. The hover listeners are delegated on
`document` (`_ajInitHover()`, installed from `_initStatTooltip()` at page
init). The attribute survives `cloneNode(true)`, so a rebuilt `<thead>` needs
nothing. `_ajInitHover()` sits ABOVE the `_aj*` const declarations in call
order: it only adds listeners and reads no const until an event fires, which
is after the IIFE has run. Do not make it read state at install time (TDZ —
see "Hover tooltips must ignore a tap" for the time that took down every
action button).

How it behaves, and why:
- **Opens by itself only for a job the USER started** (`{user: true}`), and
  only while `sa_async_pop_auto_open` is on. A job the script starts (an
  automatic retry pass) updates the record and, if the card is open, the card.
- **Esc hides it and nothing else** — the job keeps running and keeps
  logging. The `keydown` listener exists only while the card is open
  (`_ajListen()`), on window capture, and gives way to `#mb-art-viewer`, which
  owns every key while it is open. While the card is open, Esc is the card's:
  an Esc meant for a focused filter input closes the card first.
- **Hover shows it again** after 250 ms (`_AJ_HOVER_DELAY_MS`), live; leaving
  the anchor OR the card closes it after 300 ms (`_AJ_LEAVE_GRACE_MS`), and
  moving from one to the other cancels that, so the action buttons are
  reachable. An idle anchor (no job yet) shows the provider's preview — the
  place for "this would cost N requests".
- **Repaints are free while it is closed**: `_ajChanged()` returns unless the
  card is open on THAT job, and coalesces to one repaint per animation frame.
  A job may call it on every step. `__saTest.asyncPop.repaints()` pins this.
- **One card, one layer.** It is a `.mb-tt-liner` (z-index from that rule) and
  its id is in `_OTHER_RICH_TIPS`, so the anchor's own `_setTip` card stays
  away while it shows. Its own rows are `.mb-tt-aj*` rules in the liner block
  — no inline colours, same as every other tooltip.
- **Touch**: the anchor hover handler returns on `_isTouchCompatMouseEvent()`
  (a tap would leave it hanging); a touch outside the card closes it.
- **Never in a table's text.** The card lives in `<body>`; a job's progress on
  its toggle stays `::after { content: attr() }`. It also never writes to
  `#mb-info-display-rel`, which `waitForRelationshipsComplete()` waits on.

**Providers today**: `recof` (registered at render time, shows an idle
preview), `rel` and `ms` (registered when their first user-started job
starts, and `snapshot()` answers `null` without a job — so their toggles keep
their own tooltips for anyone who never starts one). `rel` starts only from a
▶🔗 expand click (`_relAjBegin()`), logs in `_relFetchWs2()`'s network branch,
reads progress from the `table._mbRelProgress` stash `_relUpdateColHdrBtn()`
writes (no cell walk per repaint), and finishes at the Phase-2 drain with the
tier counts; a pass the script starts by itself creates no record. `ms` starts
in `_msToggleLengthPrecision()`'s fetch branch and finishes in its `finally`.
Specs: `async-pop-providers.spec.js`; mutations
`scripts/mutations/async-pop-providers.json` (5 caught, 2 recorded
`expect: "pass"`: the idle guards cannot fail while registration happens at
the first job).

**`tablework` (long sorts and filters, `_tw*`).** Sorting yields
(`sortLargeArray()` chunks above 5000 rows) and now passes its progress
callback, `_twSortProgress()`, which opens the card once a sort has run past
500 ms (`_TW_OPEN_AFTER_MS`) — never for a short one. The filter pass for
TYPING on a table over `sa_chunked_render_threshold` rows yields too
(`runFilterSliced()`, PERFORMANCE.org Step 39) and reports the same way:
`_twFilterBegin()` returns a pass record that every later
`_twFilterProgress()` / `_twFilterStale()` / `_twFilterCompared()` call
names — a stale pass notices only at its next yield, by which time its
successor may have begun, and a module-level "current pass" would let it
write into the successor's record. While it runs the card shows Running,
"Filtering for “q”" (plus "within the last result" when narrowing), rows
compared of total and matches so far; afterwards the last filter with its
query, Comparing (time, rows, slices) and Drawing; "Recent" logs a replaced
pass ("“Hom” replaced by “Home” after N of M rows", kind `dim`) and each
finished one. `_ajLog()` needs a job, so a pass too short to open the card
logs nothing. The note reads "Filtering pauses every few milliseconds so the
page keeps responding; a key typed meanwhile starts a new pass. Matching rows
are prepared for drawing in the same short steps. Drawing a large table comes
in chunks of 500 rows." Approved mockup:
https://claude.ai/artifact/GCdE1u84VHcySfj3fSiNFf (2026-10-10).
**The threshold is checked in BOTH steps of the pass** (`_twFilterMaybeOpen()`,
called from `_twFilterProgress()` while comparing and from
`_twFilterPrepProgress()` while the clones are built). It used to be checked
only while comparing, and a column filter never opened the card: its pass
compares only its own sub-table (8 ms for 2,143 rows on the release-groups
capture, the other groups being cache hits) and spends the rest, about
900 ms, preparing. `_twFilterPrepare()` switches the record to
`step: 'prepare'` and fixes `compareMs` there; `_twFilterCompared()` then
sets `prepMs`. The card shows the step line ("Comparing · Preparing", then
"Compared ✓ · Preparing", `s.steps` in `_ajRender()`), the count in
"rows prepared for drawing" during the second step, and a Preparing fact
afterwards. The pass is named by `_twFilterLabel()`: the global text, then
each column filter as `“v” in Column (Sub-table)` (the sub-table only on a
multi-table page, read from the h3's own text before its count), past three
parts counted; `all rows` when nothing is filtered. The record's `query` is
that label, quotes included, so no caller adds quotes. Mockup approved
2026-10-11: https://claude.ai/artifact/1ZBfeQbQzD3uWid1HEb7LV. The sub-table
filter (`applySubFilter`, the h3 🔍) is a separate synchronous path and never
shows the card (org/TODO.org). Every other
filter caller is the synchronous `runFilter()`, which only records its time
and rows (`_twFilterRecord()`); the draw time follows from `_renderSettled`,
and the breakdown shows when the user hovers the status line
(`#mb-sort-status-display`, `#mb-filter-status-display`). `_ajRender()` shows
an optional `s.countNote` on the right of the count line (the "match so
far"). Cost while the card is closed: one object write and one `.then()` per
filter pass, plus one object write per slice. Specs:
`async-pop-tablework.spec.js` — the auto-open path through
`__saTest.tableWork` with a fake clock, because no fixture reaches the 5000
rows the live callback needs; mutations `scripts/mutations/async-pop-tablework.json`
(5, all caught); the filter's card, through the real pass with
`__saTest.filterSlicing`: `filter-sliced.spec.js`.

`FIXTURE_SETTINGS_OVERRIDE` forces `sa_async_pop_auto_open` off: a card opened
by a toggle click sits right over the header cells a spec clicks next. Specs
that test the card seed it back on. Specs: `async-pop.spec.js` (10) and
`async-pop.mobile.spec.js` (2), driving the shipping framework with a stand-in
provider through `__saTest.asyncPop`; mutations `scripts/mutations/async-pop.json`
(15, all caught).

## 💾 Browser cache overview (`_idbo*`)

A dialog, `#mb-idb-overview`, showing the user everything the script keeps in
this browser's IndexedDB — the art cache database (six stores) and the
link-preview database (`pages`). Mockup agreed 2026-10-10
(`https://claude.ai/artifact/4UsPjhkP1gN6cb9wCnQw72`). Per part: entries, a
size estimate, an age bar (under a day / 1–7 days / older within keep time /
past keep time), the oldest entry and the keep time; a donut of the space; a
drill-down with every key (searchable, first 200 shown) and a per-entry ✕;
deletes for the expired entries of one part, one part, everything expired,
everything older than 7/30/90 days, and everything. Every delete asks inside
the dialog first; Esc cancels a pending question before it closes the dialog.

**The parts list is `_idboParts()`, a function on purpose** — it names
`_ART_IDB_NAME`/`_DP_IDB_NAME` and reads TTL settings; as a module-level const
it would read them at IIFE time. A new store belongs in that list (and in the
sweep, and in `tests/support/idbFixture.js`).

**Sizes are estimates** (`_idboBytes()`: JSON length plus any Blob's
`size`). Good enough to compare parts; the dialog says so, and shows
`navigator.storage.estimate()` for the whole origin beside it — which includes
MusicBrainz's own storage and other userscripts', so it is labelled "site
storage", never the script's.

**Deletes change IndexedDB, not this page's memory caches** (`_relWs2Cache`,
`_msBatchMemCache`, `_recOfMem`, the artwork blob URLs). The footer says "This
page keeps what it already loaded". Revoking the blob URLs would blank images
on screen, so this is deliberate.

**Five ways in.** ⚙️ Settings (`sa_fn_idb_overview`, a
`type: 'function'` entry, in `_registerSettingsIntegration()`'s
`functionRegistry`), a button under the 📊 Statistics panel's IndexedDB rows
(`#mb-stats-idb-overview-btn`), the Tampermonkey menu ("💾 Browser cache"),
an automatic "💾 Cache overview" action on every progress card whose
snapshot has `cache` rows (`_ajRender()` adds it; `__idb` is the framework's
own action id, handled before the provider's `act()`), and since 2026-10-24
(vzell: "callable from our main SAED menu too … after the Statistics entry
before the Keyboard Shortcuts in the VIEW section") the SAED menu's View
row "💾 Browser cache" (`#mb-idbo-menu-btn`, `addCacheOverviewButton()`,
`_TOOLBAR_MENU_ROW_ORDER.view`). That row was left out at first because the
menu's panel lives in `<body>`: it is added by the render tail beside
Statistics, so a page before any button is unchanged, but every RENDERED
snapshot baseline gains it at its next capture (expected drift). It has no
setting of its own, so with Density, Statistics and Keyboard Shortcuts all
off, View holds this one row. The stylesheet is injected on first open (`#mb-idbo-style`)
for the same reason. z-index 2147483200: over the settings dialog and the
Statistics panel, under the artwork viewer and every tooltip.

**Movable and resizable (2026-10-26, vzell: "make the Browser cache window
movable and resizable").** `_makeMovableResizable()` on `.mb-idbo-dlg`, with
the header (`.mb-idbo-h`) as the handle and the geometry in
`sa_idbo_geometry` (in `_CFG_WORKSPACE_GROUPS`' geometry group, so the
config file carries it). It is wired once, when the overlay is created, and
destroyed in `_idbOverviewClose()` (`_idbo.geo`). `_idboPaint()` rebuilds
the header with `innerHTML`, which is safe because the handle is found from
a delegated press, and the header's buttons never start a drag. The window
is a flex column: header and foot `flex: none`, and the body (`.mb-idbo-b`)
is the part that shrinks and scrolls (`max-height: 92vh`). A 16 px strip
under the foot holds the resize corner, as in the 🖼 gallery. Before this
change the backdrop scrolled the whole dialog instead. A window never moved
opens centred at the top, as before, and stores nothing. Its stylesheet is
shared with 🗄️ Script storage below: every rule names
`:is(#mb-idb-overview, #mb-gm-store)`.

Specs: `idb-overview.spec.js` (8, both databases seeded before the userscript
opens them, plus 3 for the geometry) and `idb-overview.mobile.spec.js`; mutations
`scripts/mutations/idb-overview.json` (12, all caught). The seed is
`seedCacheOverview()` in `tests/support/idbFixture.js`, shared with the
export/import specs below; its link-preview records have the real
`{url, v, at, data}` shape.

### Export and Import (`_idbx*`)

Two panes in the overview, opened by Export… / Import… in its header
(`data-idbx="open-export"` / `"open-import"`, `aria-pressed`), painted into
slots `_idboPaint()` leaves under the tile strip (`[data-idbx-slot]`), so a
rescan repaints them from `_idbo.x`. Mockup approved 2026-10-10:
`https://claude.ai/artifact/AsJhH3GAiNmfaDGz2ci4q6`; its four questions were
answered as recommended (`.jsonl.gz`, images unticked, a part with another
layout skipped whole, all link-preview entries exported), plus two later
decisions: **Last import** is a fifth tile (Last clean-up stays), and another
site's export is refused.

**The file** is a gzip of one JSON object per line. Line 1 is the header:
`kind: 'sa-cache-export'`, `format` (`_IDBX_FORMAT`, 1), script version,
`origin`, `written`, `browser`, `layouts` (each database name → its schema
version: `_ART_IDB_VERSION`, `_DP_IDB_VERSION`), and `parts` (id and count).
Then `{p, v}` per entry, `v` the stored record verbatim; a Blob field becomes
`{$blob: {type, b64}}`. The last line is `{kind: 'end', count}`. Without it the
file was cut short, and the import refuses it.

**Export** reads each ticked part in key order, `_IDBX_READ_BATCH` entries per
`getAll()` with a lower bound past the last key. Each batch is its own
transaction, because one held across the FileReader and gzip awaits would
auto-commit under it. Expired entries, and entries without a stored date, are
left out. Lines go through `pako.Deflate` (already `@require`d; no
`CompressionStream`), and the chunks become a Blob handed to a plain
`<a download>`. There is no filename dialog, as the mockup shows.

**Import** reads the file twice, streaming both times (`_idbxLines()`:
`file.stream()` → `pako.Inflate` → `TextDecoder` → lines; a 45 MB file is never
held as text).
- `_idbxCheck()` classifies every entry against a fresh scan's key → stamp
  maps (`_idbxClassify()`: add / upd / same / exp / bad) and writes nothing.
- `_idbxMerge()` re-reads the file, re-classifies with the SAME maps, and
  writes only add and upd, in `readwrite` transactions of
  `_IDBX_WRITE_BATCH`. A stop drops the pending batch and keeps the written
  ones.
- Refusals come from `_idbxHeader()` and the check: not an export (no header,
  or not gzip), a newer format, another origin, a cut-short file.
- A part whose `layouts[db]` differs from this browser's is skipped whole.
- The shape check, `_idbxValidate()`, requires the store's `keyPath` field (from
  `_idboParts()`, which now also carries `layout`), a stored date no more than a
  day in the future, and the store's own fields. Its reasons are the "why" list.

**Memory caches are not touched**, the same rule as deletes, and the Done text
tells the user to reload open pages. Esc: a delete's question, then the merge
question, then an open pane, then the dialog (`_idbxOnEscape()` sits between
the first and the last in `_idboOnKey()`). Closing the dialog stops a running
job and resets `_idbo.x`. The last import is stored in this origin's
`localStorage` (`_IDBX_LAST_KEY`), like the cache itself, not in GM storage,
which is shared across sites.

Timings: `tests/support/probe-idb-export-import.js` (`__saTest.idbOverview.perfRoundTrip`)
and tests/MEASUREMENTS.org, 2026-10-11. On petri, about 60,000 JSON
entries/s and 13 MB/s of images to export; the merge is bound by IndexedDB
writes. The pane's "Takes about" (`fileB / 12e6 + n / 50000` s) comes from
there. Its JSON size ratio (`_IDBX_RATIO_JSON`, 0.15) is NOT calibrated: the
synthetic cache compresses far better than a real one.

Specs: `idb-export-import.spec.js` (8) and `idb-export-import.mobile.spec.js`
(1); test hooks `__saTest.idbOverview.dump/holdAfterFlush/exportB64/perfRoundTrip`;
mutations `scripts/mutations/idb-export-import.json` (17, all caught).

## 🗄️ Script storage (`_gms*`)

A dialog, `#mb-gm-store`, showing the user every key this script has in
Tampermonkey's storage (GM storage), requested 2026-10-26. It is the GM
counterpart of the 💾 Browser cache overview: same look (it uses the
`mb-idbo-*` classes, and `_idboEnsureStyle()` names both dialogs, so only
the parts specific to it are in its own `#mb-gms-style`), same z-index, Esc
and in-dialog confirmations, and it moves and resizes the same way
(`sa_gms_geometry`, in the geometry group).

**Reading: `_gmsRead()`.** `GM_listValues()` (feature-detected, as in
`_sweepOrphanedGmValues()`), then `GM_getValue()` for each key. Without it,
only the keys that can be named are listed: `configSchema`, the fixed
workspace keys (`_configWorkspaceKeys()`) and `_GM_ORPHANED_VALUE_KEYS`.
`_gms.listed` is false then, and a notice says so. **Kinds: `_gmsKindOf()`**:
a setting (in `configSchema`, `isDefault` by `_gmsSameAsDefault()`, which
compares string-wise like the library's own `isSchemaDefault()`), a hand-off
(`_GM_SNAPSHOT_KEY_PREFIX`), orphaned (`_GM_ORPHANED_VALUE_KEYS`), workspace
(`_configWorkspaceGroupFor()`, labelled by its group), and other (install
state such as `sa_settings_migration_level`).

**Changes.** Save is `JSON.parse()` of the editor, refused with the error
inline, and asks before `GM_setValue()`. Reset to default and Delete both
call `GM_deleteValue()` (an absent key resolves to the schema default, the
library's dirty-set rule). Delete leftovers calls `_sweepOrphanedGmValues()`,
so a hand-off younger than an hour is kept. A value over `_GMS_EDIT_MAX`
characters (a hand-off payload) is shown cut short and read-only. Changes go
to storage only: `Lib.settings` of the open page is not touched, and the
foot says a changed setting takes effect after a reload.

**Secrets.** A `secret: true` setting (`sa_pop_ext_discogs_token`) is dots
in the table and in the detail. It has no editor and no Copy, the filter
never matches its value, and `_gmsExport()` leaves it out. It can only be
deleted.

**Ways in.** The SAED menu's View row "🗄️ Script storage"
(`#mb-gms-menu-btn`, `addGmStoreButton()`, right after `mb-idbo-menu-btn`
in `_TOOLBAR_MENU_ROW_ORDER.view`, added by the render tail beside it and
with no setting of its own), and the Tampermonkey menu. Test hook:
`__saTest.gmStore.open/close`.

Specs: `gm-store.spec.js` (6) and `gm-store.mobile.spec.js` (1); mutations
`scripts/mutations/gm-store.json` (11, all caught, two of them for the
Browser cache window's geometry).
