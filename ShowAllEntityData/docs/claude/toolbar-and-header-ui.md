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

## The h1 toolbar is two pull-down menus plus two pinned buttons

`org/action-button-redesign.org`. The bar used to be one flat run of up to 13
controls, nine of them labelled. It is now:

| Order | Element                                | Present                                                                               |
|-------|----------------------------------------|---------------------------------------------------------------------------------------|
| 1     | `🧮N …` fetch buttons                  | always                                                                                |
| 2     | `#mb-stop-btn`                         | always (hidden outside a fetch)                                                       |
| 3     | `#mb-button-divider-initial`           | always — the only surviving `\|`                                                      |
| 4     | `#mb-disc-menu-btn` `📀 Discography ▾` | `artist-releasegroups`, post-render                                                   |
| 5     | `#mb-data-menu-btn` `📦 Data ▾`        | from the initial render                                                               |
| 6     | `#mb-view-menu-btn` `🛠 View ▾`         | from the initial render (🎹 seeds it)                                                 |
| 7     | `#mb-settings-btn` `⚙️`                 | always, pinned — left half of the ⚙️❓ pill                                            |
| 8     | `#mb-app-help-btn` `❓`                | always, pinned — right half of the ⚙️❓ pill                                           |
| 8a    | `#mb-button-divider-findings`          | always in the DOM; shown only while a findings menu is attached                       |
| 8b    | `#mb-findings-warn-menu-btn` `⚠️ WARNING (N) ▾` | post-render, only when the page has a warning (docs/claude/findings.md)        |
| 8c    | `#mb-findings-error-menu-btn` `❌ ERROR (N) ▾`  | post-render, only when the page has an error                                   |
| 9     | `#mb-fetch-progress-wrap`              | always (hidden outside a fetch) — trails everything, `org/action-button-redesign.org` |

`_TOOLBAR_TAIL_ORDER` declares 3-9 and `_orderToolbar()` asserts it; anything
not named there keeps whatever position it was appended at. The progress bar
sits LAST rather than beside `#mb-stop-btn` deliberately — it used to sit
between the fetch buttons and Stop, which read as if Stop belonged to the
menus/pill that followed it rather than to the fetch buttons that preceded it.

**7 and 8 are drawn as ONE segmented pill** — a fourth run alongside the three
in "The h2/h3 control runs are segmented pills" below, and built the same way,
so read that section's rules first. Three things are specific to this one:

- **Selected by the class `.mb-toolbar-pinned-btn`, not an id prefix**, because
  these two ids share none. The caps use the run-relative pair
  (`:not(.c + .c)` / `:not(:has(+ .c))`) — `:first-of-type`/`:last-of-type` are
  wrong here for exactly the reason they are wrong for the sort group: they
  count elements of the same TAG, and these `<button>`s are neither the first
  nor the last button among their siblings.
- **A class, never a wrapper element.** They must stay DIRECT children of
  `#mb-show-all-controls-container`: `_TOOLBAR_TAIL_ORDER` re-appends them
  there, and `toolbar-menus.spec.js` reads the container's own children to
  assert that only the findings divider and menus (rows 8a-8c) follow them —
  `#mb-fetch-progress-wrap` (present but `display:none` outside a fetch) is the
  true last child, per row 9 above. The findings menus are NOT part of the
  pill: they carry no `.mb-toolbar-pinned-btn`, and the divider keeps them
  visibly apart from ❓.
- **It cancels the flex gap, and the margin sits on the LEFT half.** The bar is
  `display:inline-flex` with a gap between every pair of children, and a flex
  gap cannot be suppressed for one pair — so one segment pulls back by exactly
  one `--mb-toolbar-gap`, a custom property both sides read so the pill cannot
  split open if that number is retuned. **Which side carries it is the
  load-bearing part.** The bar is also `flex-wrap: wrap`, and at some widths the
  two halves land on different lines — measured at 1040-1080px and 550-590px,
  ordinary window territory. With the pull on the RIGHT half, ❓ then started
  8px past the bar's own left edge: content outside its container. On the LEFT
  half the same pull merely shortens a line that has nothing after it, so a
  split degrades to a square left edge. The split itself is not preventable
  without a wrapper, and a wrapper costs the direct-children contract above.

**Their backgrounds are settings, not pill CSS.** `sa_ui_settings_btn_style`
and `sa_ui_help_btn_style` kept their own keys and had their DEFAULTS changed
to match `sa_ui_toolbar_menu_btn_style`, with `_SETTINGS_MIGRATIONS` entries
naming the old slate values — so the pill reads as one control by default while
a user who chose their own colours keeps them. Forcing one ground in the
stylesheet would silently override that choice.
`ensureSettingsButtonIsLast()` is a back-compat alias, still called from ~7
sites, and no longer does anything else. Two of the three old divider spans
(`.mb-button-divider-after-load`, `.mb-button-divider-before-shortcuts`) are
gone — they separated groups that no longer exist.

**The menus ADOPT the existing buttons; they do not replace them.** (One
exception, by necessity: the ⚠️ WARNING / ❌ ERROR findings menus have no
existing buttons to adopt — each row is a finding with a live count — so
`_buildFindingMenuRows()` builds `menuitemcheckbox` rows and still passes each
through `adopt()` for the keyboard, close and focus behaviour. Their look lives
in `.mb-findings-menu-item` CSS; see docs/claude/findings.md.) A menu row
IS the button that used to sit in the bar — same id, same `title`, same
`onclick`, same colour setting, same `ctrlMFunctionMap` entry — moved into a
panel by `adopt()` and restyled as a full-width row. That is the rule to carry
forward: build a new toolbar control the way every other one is built, then
adopt it. Row order inside a panel comes from `_TOOLBAR_MENU_ROW_ORDER`, not
from the sequence the render tail happens to adopt in — 🎹 is adopted on the
INITIAL render and would otherwise head the 🛠 View list.

Seven things are load-bearing, and every one of them fails silently:

- **A panel must FIT the window: it is `position: fixed`, and the page can
  never scroll it into view.** `open()` puts it below its button when it fits
  there, else above when there is more room above, and caps it to the room it
  opens into (`max-height`, scrolling inside). Until 9.99.1262 it always opened
  below: with the toolbar near the window's bottom the rows were off-screen,
  and a click on one retried until the test timed out. That was
  `event-overview.spec.js`'s intermittent "Save to Disk" failure, whose
  unstyled fixture puts the toolbar at the bottom of the 720 px window, and the
  reason `clickToolbarItem()` grew a `force` option. Same rule as
  springsteenlyrics.com's scope bar (`_slPlaceScopePop()`). Specs:
  `toolbar-menus.spec.js` "toolbar menus fit in the window".

- **A row in a CLOSED panel has a ZERO bounding rect.** Density's and Export's
  own pull-downs, and `showLoadFilterDialog()`, all position themselves from a
  rect. So **every programmatic activation goes through `_toolbarInvoke()`**,
  which opens the host menu first and degrades to a plain click for a control
  that was never adopted; and **anything wanting an ANCHOR asks
  `_toolbarAnchorFor()`** for the menu BUTTON, never the row. A bare
  `.click()` opens the sub-menu pinned to the top-left corner of the viewport.
  The seven `isShortcutEvent()` arms, the `ctrlMFunctionMap` entries, the four
  export-dialog `triggerButton:` sites and `showSaveDialog()`'s anchor all go
  through one or the other.
- **The row-activation close listener is CAPTURE phase.** `densityBtn.onclick`
  and `exportBtn.onclick` both open with `e.stopPropagation()` — they must, or
  their own document-level outside-click handler would close the pull-down they
  just opened — so a bubble listener never fires for exactly the two rows that
  need it. Found by `toolbar-menus.spec.js` on its first run.
- **An open panel is `display:flex; flex-direction:column`, not `block`.** Flex
  items are blockified by the CSS display spec, so each row's own inline
  `display:inline-flex` computes to `flex` and lays out full-width while
  `display:none` still hides it. The three sites revealing Save to Disk had to
  move from `'inline-block'` to `'flex'`: `inline-block` blockifies to plain
  `block`, where the `::after` hint's `margin-left:auto` computes to zero.
- **The keyboard hint is CSS `::after` from `data-mb-menu-hint`, never text.**
  It keeps the hint out of the row's `textContent`, so a read of the row is its
  label alone — same rule, same reason, as the column-header family's glyphs,
  and `toolbar-menus.spec.js` asserts exactly that.
  **This entry used to give a different and false reason**: that
  `updateBarcodeHighlightBtnState()` rewrites its button's `innerHTML`
  wholesale, so an attribute survives where a `<kbd>` child would not. That
  function writes `style.background`/`borderColor`/`color` and `title` only;
  the button's content is set once at creation. Corrected in 9.99.1148 rather
  than quietly dropped, because a plausible-but-wrong reason is what licenses
  the next person to conclude "no rewrite here, so a `<kbd>` is fine".
  **And the barcode row is the one that had no hint at all** until 9.99.1148 —
  `adopt()` was called without the argument. Every row now passes one.
- **Layout lives in the `.mb-toolbar-menu-item` class with `!important`.**
  `_applyDiscButtonTints()` rewrites a row's whole `cssText` on every view
  switch; without `!important` that flattens the row back to a bar button.
- **An empty menu must not render**, and what delivers that is LAZY CREATION —
  each `_ensure*Menu()` call sits inside its own `sa_enable_*` gate, so the menu
  is never constructed. `_orderToolbar()`'s emptiness reconcile is a second line
  for a future call site that ensures a menu and then adopts nothing; no fixture
  can tell the two apart, and `scripts/mutations/toolbar-menus.json` records
  that as an honest `"expect": "pass"`.

**`tests/support/toolbarMenu.js` is where the layout knowledge lives on the test
side** — `clickToolbarItem()` reads `data-mb-menu-owner` off the DOM rather than
carrying a table of its own, so a control that moves between menus needs no
change there. Nine call sites migrated to it. A spec that hard-codes "click
`#mb-data-menu-btn`, then click the row" pins the current grouping as if it were
the behaviour under test; don't.

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

## ❓ opens GitHub; Shift-❓ renders the same file in the page

`org/action-button-redesign.org` item 2. Help is
**`ShowAllEntityData_HELP.md`**, hand-written, and the `.txt` is retired. Three
things read it and they must stay in agreement:

|                          |                                                 |
|--------------------------|-------------------------------------------------|
| `HELP_GITHUB_URL`        | the `/blob/` page — where a plain ❓ click goes |
| `REMOTE_HELP_URL`        | the same file raw — what the dialog fetches     |
| the committed `_HELP.md` | what a publish copies to the mirror             |

`openAppHelp(e)` is the button's handler and branches on `e.shiftKey` alone;
`showAppHelp()` is the dialog and is no longer wired to the button directly.
**Prefix-mode `H` stays on `showAppHelp()`**, because prefix mode refuses Shift
(`!e.shiftKey` in its own guard) — so the keyboard has one route and it is the
one a mouse-free user cannot otherwise reach. The dialog's title bar carries
`#mb-app-help-github-link` so the other destination is not lost.

**`window.open()`, never `GM_openInTab()`.** The latter needs a new `@grant`,
and a new grant re-prompts every existing Tampermonkey user on their next
update — a real cost to everyone for a tab `window.open()` already opens from a
click handler's user gesture.

Six things about the renderer (`_mdRenderInto()` / `_mdInline()` /
`_mdHeadingId()`), each of which fails quietly:

- **It is styled by `GM_addStyle` classes, not per-node inline styles** — like
  every other panel since the 9.99.736-9.99.745 CSP run, and far less code than
  setting a dozen properties on each node of a long document.
  **The CSP half of that rule is narrower than this file used to say.** What
  `/account/*`'s `style-src 'self'` blocks is `<style>` elements and `style="…"`
  written into an **`innerHTML` template**; CSSOM writes (`el.style.foo = …`)
  are not blocked, which is why the entire h1 toolbar sets its styles that way
  and renders correctly there. A node-building renderer was never in the
  blocked case. Corrected in 9.99.1149, along with the mutation that had
  recorded itself an honest `"expect": "pass"` on the strength of it — the
  stylesheet's absence IS observable, as a computed value, and is now asserted.
- **`_italic_` is deliberately unsupported; only `*italic*`.** Half the nouns
  here are snake_case settings keys, and an underscore rule renders
  `sa_enable_caa_pics` as "sa" + *enable_caa* + "pics". CommonMark refuses
  intra-word underscore emphasis for the same reason, so leaving it out makes
  this agree with GitHub on the case that occurs.
- **Nodes, never `innerHTML`.** The bytes arrive over the network at runtime;
  "it is our own file" is a fact about the repository, not about what a fetch
  returns. A link href is admitted only when `http(s)` or `#`.
- **`<details>` renders OPEN.** Collapsed content is still in the DOM, so the
  dialog's quick filter would highlight matches the reader cannot see. GitHub is
  where the sections collapse; this dialog exists to be searched.
- **An `#anchor` link scrolls the DIALOG.** It is a fixed overlay with its own
  scroll area, so following the fragment scrolls MusicBrainz's page underneath
  while the table of contents appears to do nothing. Heading ids carry an
  `mb-md-` prefix so they cannot collide with the page's own, and both the
  heading and the link resolve through `_mdHeadingId()` — which is why a table
  of contents written for GitHub's bare slug works here too.
- **The coupling runs file → renderer, not the other way.** The renderer covers
  exactly what `_HELP.md` uses; the file is written to stay inside it. The last
  test in the spec renders the REAL committed file and is what keeps that true.
- **A list item's continuation line must be INDENTED, and that is a guard.** An
  indented non-bullet line appends to the item above it; without the rule every
  wrapped bullet ends its list, and without the INDENT part a list swallows the
  heading under it. The first half shipped broken for an afternoon and no
  assertion saw it — see `scripts/probe-help-md-render.js`, and the
  DEBUG-NOTES entry on why fifteen green tests could not.

**`CACHE_KEY_HELP` was renamed to `…-remote-help-md`** because
`Lib.fetchCachedText()` keys on the cache key alone and stores no URL beside the
bytes — an upgrading user's cached plain text would otherwise be fed to the
Markdown renderer for up to a TTL. Any future format change owes the same
rename. No fixture starts with a stale cache, so this is a second
`"expect": "pass"`.

Covered by `tests/fixtures/app-help-github-and-markdown.spec.js`; mutation list
`scripts/mutations/app-help-github-and-markdown.json`.

## The h2/h3 control runs are segmented pills too — three of them, not one

A second family, distinct from the `.mb-col-hdr-flex` one above: the buttons
that sit beside a table's heading. `org/503-handling.org`, "Retry UI: one
segmented control per table". The h2's ↔️/👁️ pair (above) is deliberately NOT
part of any of these runs — it anchors past the end of them all.

**A FOURTH run now uses this idiom outside the h2/h3**: the h1 toolbar's
`⚙️`/`❓` pinned pair, selected by class rather than id prefix. The rules below
apply to it unchanged; what differs is written up under "The h1 toolbar is two
pull-down menus plus two pinned buttons" rather than repeated here.

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
  `_updateAllColHeaderCounts()`. A floor frozen at set-up is short by 4-6 px on
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
  the stash: that tooltip's plain panel shows this very title, and a stash
  would leave the panel empty. **Give any NEW floating hover tooltip's id to
  `_OTHER_RICH_TIPS`**, or its elements' own titles will draw a card on top of
  it. All three were found in a browser, not by a spec: an inline CAA
  thumbnail's "N images found" card on its own preview, a Relationships URL
  shown twice.
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
`#mb-rel-tooltip`, `#mb-rel-plain-tooltip` and `#mb-ctrl-m-tooltip`. Give a new
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
