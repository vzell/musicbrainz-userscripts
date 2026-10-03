# ShowAllEntityData — Help

**Consolidates a paginated MusicBrainz listing into one scrollable, filterable,
sortable table.** Forty-odd pages of an artist's events become one table you can
filter three ways, sort by any column, cut down to the columns you care about,
export, and save to disk to reopen later without touching the network again.

This page is the user guide. It is written to be read top to bottom the first
time and jumped into by anchor afterwards. Reference material that most people
will never need is folded into collapsible sections.

> **Two ways to read this.** The ❓ button in the page opens this file on
> GitHub. **Shift-click ❓** renders it inside the page instead, with a
> quick-filter box across the whole text — useful when you want to search rather
> than browse. From the keyboard, the prefix key then **H** opens the in-page
> version, which carries a *📖 Open on GitHub* link of its own.

---

## Contents

- [Getting started](#getting-started)
- [When a fetch does not finish](#when-a-fetch-does-not-finish)
- [The buttons](#the-buttons)
- [Filtering](#filtering)
- [The unique-values dropdown](#the-unique-values-dropdown)
- [Warnings and errors](#warnings-and-errors)
- [Sorting](#sorting)
- [Columns](#columns)
- [Collapsing and expanding](#collapsing-and-expanding)
- [Cover art](#cover-art)
- [The Relationships column](#the-relationships-column)
- [Track lengths](#track-lengths)
- [Save and load](#save-and-load)
- [Export](#export)
- [Statistics](#statistics)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Settings](#settings)
- [Supported pages](#supported-pages)
- [Page-specific behaviour](#page-specific-behaviour)
- [On a phone or tablet](#on-a-phone-or-tablet)
- [Troubleshooting](#troubleshooting)

---

## Getting started

1. Open any supported MusicBrainz page — an artist's *Recordings* tab, a release
   group, a series, a tag listing. See [Supported pages](#supported-pages).
2. Press the action button beside the page heading. It is labelled for what it
   will fetch, for example **🧮¹ Events for Artist**. Pages that offer
   more than one listing get one button each, numbered `🧮¹ 🧮² 🧮³` so the
   keyboard can reach them.
3. A progress bar tracks the fetch, page by page. **⏹ Stop** interrupts it and
   keeps whatever has already arrived.
4. When it finishes you get one table, a filter bar, sortable headers, and the
   controls described below.

Pressing the action button a second time reloads the page first. That is
deliberate — it is the cheapest way to get back to a clean state.

---

## When a fetch does not finish

Fetching a large listing is one request per page, and MusicBrainz refuses
requests in bursts when it is busy. Two things follow.

**Refusals are retried.** A page that comes back `503 Service Unavailable` is
tried again after a pause, up to three times; if the server sends a
`Retry-After` header that wait is honoured, up to 30 seconds. Most bursts pass
without you noticing.

**A fetch that still cannot finish says so, and stops at the page that failed.**
The status line turns orange:

```
⚠️ Loaded 3 of 40 pages (287 rows) — INCOMPLETE
```

The rows that did arrive are real and usable — the table is simply smaller than
the listing. Press the action button again to start over.

<details>
<summary>The details worth knowing about an incomplete fetch</summary>

- **The count is of pages actually loaded**, not pages attempted. A run that
  failed on page 4 reports "3 of 40", not "4 of 40".
- **An unknown total says so**: when MusicBrainz's own pagination widget is
  ambiguous, the line reads "of an unknown total" rather than inventing a
  number. "1 of 1 pages" would read as a complete one-page listing.
- **Saving an incomplete fetch is allowed, and the file remembers.** Loading it
  later shows the same orange INCOMPLETE line. Files written before this marker
  existed carry no flag and load as complete, which is the only thing that can
  be assumed about them.
- **Not every warning means missing rows.** On artist release-group pages the
  Official/Non-Official split comes from a separate pre-fetch; if that part
  fails you get every row but no split, and the message says so with ⚠️ without
  calling the data incomplete.
- **Two dialogs can appear before a long fetch** — one when the page count is
  unknown, one when it is very large. Agreeing once is remembered for that run.

</details>

---

## The buttons

The controls beside the page heading are two pull-down menus plus two pinned
buttons, and — once a page has warnings or errors to show — two more menus
after a divider:

```
🧮¹ …  |  📦 Data ▾   🛠 View ▾   [ ⚙️ | ❓ ]  |  ⚠️ WARNING (12) ▾   ❌ ERROR (3) ▾
```

| Menu                          | Rows                                                                                                                                  |
|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| **📦 Data ▾**                 | 💾 Save to Disk · 📂 Load from Disk · 💾 Export                                                                                       |
| **🛠 View ▾**                  | 📏 Density · 📊 Statistics · 🎹 Keyboard Shortcuts                                                                                    |
| **⚙️ ❓**                      | Settings Manager and this help page — pinned side by side as one control, never in a menu. Shift-click ❓ reads the help in the page. |
| **⚠️ WARNING ▾ / ❌ ERROR ▾**  | One row per kind of problem found on the page, with how many rows have it. See [Warnings and errors](#warnings-and-errors).           |

Each row shows its own keyboard shortcut on the right. Open a menu with the
mouse or with that shortcut — pressing `Ctrl+D` opens **🛠 View** and then the
Density pull-down for you. Inside an open menu, ↑/↓ move between rows, Home and
End jump to the ends, Enter activates, Escape closes. Opening one menu closes
the other.

On artist release-group pages a third menu appears, **📀 Discography ▾**, whose
own label names the view you are in — *📀 Discography: Official*.

**🎹 Keyboard Shortcuts and ❓ Application Help (Shift-click) both have a
resize handle in their lower-right corner**, and remember their own position
and size — drag or resize either one and it reopens exactly where you left
it, no reload needed. Each dialog's own quick-filter input (**🔍 Filter
shortcuts…** / **🔍 Filter help text…**) highlights every match as you type;
in the ❓ dialog this searches the whole rendered page — headings, paragraphs,
lists and tables alike, not just code blocks — and never hides anything, so a
long document stays readable while you search it.

### Beside the table, not in the bar

Two controls act on one table, so they sit beside that table's heading, just
before the global filter box:

```
▼ Events (4174)   ↔️  👁️   🔍[ Global Filter… ]  ☐Cc ☐Rx ☐Ex
```

- **↔️** fits every column to its content; click again to restore. It is tinted
  green while resized, amber when only some sub-tables are.
- **👁️** shows and hides individual columns. `Alt+S` / `Alt+D` select and
  deselect all; navigate with ↑/↓, Tab and Shift-Tab.

Multi-table pages have carried exactly this pair on every sub-heading for a long
time. The page-level pair now reads identically.

---

## Filtering

Three independent levels, and they combine:

| Level         | Where                            | Scope                       |
|---------------|----------------------------------|-----------------------------|
| **Global**    | the big box at the top           | every column of every table |
| **Column**    | the filter row under each header | one column                  |
| **Sub-table** | above each sub-table             | that sub-table only         |

Every input takes plain text, and every input has three switches of its own:
**Cc** case-sensitive, **Rx** regular expression, and **Ex** exclude matches
(hide what matches instead of keeping it). A plain query is matched inside one
cell at a time, exactly like a regular expression, so it never matches the end
of one cell plus the start of the next. Highlighting works across inline
markup, so a phrase split by a link or a `<bdi>` still matches and still
highlights.

**Each level's switches apply to that level only**, and the levels still
combine — a row must pass every active filter:

| Switches                     | Apply to                                       |
|------------------------------|------------------------------------------------|
| next to the global box       | the global filter string                       |
| in a sub-table's 🔍 panel    | that sub-table's filter string                 |
| inside a column filter field | that column's filter text and its 📊 selection |

So "CDs, but no live albums" is `CD` in *Format* plus `live` with **Ex** in
*Release*; a global exclude no longer inverts a column filter.

**Column switches.** Inside each column filter field, left of its ✕, sit three
small chips. They stay faint until you hover or focus the field; one that is
switched on always shows, and **Ex** also puts a red stripe down the field's
left edge. A column narrower than 160 px shows one small mode button instead
(`Aa`, or the initials of what is on, e.g. `R·E`); click it for the same three
switches in a pop-up, plus **Apply these modes to every column in this table**.
Clearing a column (its ✕, Escape, or a *Clear* button) also switches its modes
off.

**Ctrl+Click** (Cmd+Click on a Mac) on a global or sub-table switch sets it on
every column filter it covers as well — every column of the page, or of that
sub-table.

In the 📊 panel of a column whose **Ex** is on, a red banner says that ticked
values are *hidden*; each count still says how many rows *have* the value.

Settings (🎨 TABLE FILTER CONFIGURATION): **Cc / Rx / Ex Switches On Every
Column Filter** (on by default) and **Column Filter Switches: Compact Below
(px)** (160; 0 = always the three chips). With the first one off, column
filters have no switches and follow the global switches on a single-table page
and the sub-table's on a multi-table page, as before.

A status line reports what is active and what survived, with the switches
that apply to each part in brackets:

```
✓ Filtered 55 rows [GLOBAL:"Bruce", SUB-TABLE:"vinyl"]
✓ Filtered 40 rows in 70ms [2 COLUMN FILTERS ['Release':(ex) "live", 'Format':"CD"]]
✓ Sorted by: "Year"▲ (133 rows)
```

<details>
<summary>Filter field states, focus indicators and history</summary>

**Three visual states per input** — idle (empty), active (has text), and error
(an invalid regular expression while **Rx** is on, which also writes
`⚠ Invalid regexp: …` into the status area). All three border colours are
configurable, separately for global and sub-table fields.

**Focus indicators.** A focused column filter gets a search-icon prefix
(default `🔍 `) and a light-yellow background. The prefix is decorative — it is
never part of the filter string, cannot be selected or deleted, and is removed
when the field loses focus. A field left with text keeps a persistent
"has a filter" background; a cleared one loses it entirely.

**History and pinned expressions.** Every expression typed into the global
filter or the load pre-filter is kept in an LRU history (default 50). The ▼
toggle opens a panel with two sections: **📌 Pinned**, a permanent list that
never ages out, and the recent history. Clicking an entry applies it; the ★
button pins it. Edit the pinned list from the panel (`Alt+E`) or from ⚙️
Settings.

**Hidden matches are signalled.** When a match is hidden inside a collapsed
multi-row cell, that cell's ▶ expander turns yellow with a red glyph, and so do
the sub-table and global collapse buttons. Expanding reveals the highlighted
content.

**The ⏳ pending-edits toggle** appears whenever a row credits an entity with
open edits on MusicBrainz. It filters to those rows and rings each pending
marker — a ring rather than a fill, because the thing being marked is already
MusicBrainz's own orange marker and painting over it would erase the signal you
pressed the button to find. On multi-table pages each sub-section gets its own
button and the one in the filter bar becomes a three-state master. (The
**Pending edits** row of the ⚠️ WARNING menu is a separate filter: it narrows
every sub-section, including those with no pending edits, which then show
nothing.)

**Both filter fields are resizable** via the ⋮ handle to their right.

</details>

**Useful keys:** `Ctrl+Shift+G` clears every filter. `Shift+Esc` clears only the
column filters. `Escape` clears the focused field, then removes focus.

---

## The unique-values dropdown

Every column header carries a **📊** button. It opens a panel listing every
distinct value currently visible in that column, each with a count badge, each
with a checkbox. Checking several ORs them together into one column filter.

**A checked value narrows text you already typed — it does not replace it.** If
the box already holds `bruce` and you check *» join phrase: with*, the field
shows both and the rows are the intersection. The count badge is computed
against what is currently visible, which is why it agrees with the result.

**The panel is resizable.** Drag the grip in its lower-right corner to make it
wider (for long values) or taller. The panel stays open when you let go, even
outside it. The size is remembered per page type and column, so a release
tracklist's *Title* column can be wide while its *Length* column stays narrow.
Double-click the grip to go back to the automatic size. Remembered sizes travel
with the 💾/📂 configuration file.

**Sections are grouped by topic.** Each topic (*Entity info*, *Date info*,
*Title info*, …) has one main header, and its sections sit under it as italic
sub-headings such as *» Artist name:*. Entries show only their value
(*Bruce Springsteen*, not *» artist name: Bruce Springsteen* on every line).
The quick filter still searches the full text, so typing `artist name` finds
those entries. A topic with only one section gets a single header line,
e.g. *Video info › Medium format*. Hover over a header for a description.

- **Click** a main header or a sub-heading to collapse or expand it.
- **Ctrl+Click** a main header to do the same to every main header.
- **Ctrl+Click** a sub-heading to do the same to every sub-section of its topic.

A sub-section with more entries than ⚙️ Settings → "Auto-Collapse Sub-Sections
Above" (default **15**, `0` turns it off) opens collapsed, with its entry count
on the heading. If you expand such a sub-section yourself, it stays expanded the
next time. A Ctrl+Click "expand all" is not remembered, so long lists collapse
again on the next open. Your collapse choices travel with the 💾/📂
configuration file. To get the previous flat list of "Topic - Section" headers
back, turn off ⚙️ Settings → "Group Sections By Topic".

<details>
<summary>What else is in that panel</summary>

**A quick-filter bar** at the top filters the list as you type, highlighting
matches. A collapsed section or topic auto-expands when it contains a match, a
topic without any match is hidden, and everything returns to its own state when
you clear the filter.

**Collapsible sections beyond the plain values**, generated from the cells
themselves:

- **🔠 Structure** — empty / single / collapsed / expanded multi-row cells.
- **🚩 Flags** — page-specific markers such as video, cancelled, title mismatch.
- **🖼️ Artwork presence** — "has artwork" / "no artwork", and separately
  "front-image available" for inline thumbnails. This is the only way to filter
  on artwork presence; typing `no` deliberately does not do it, because it would
  also match an image type containing the word.
- **👤 Entity info** — one sub-section per entity type, plus comments and
  aliases.
- **🔀 Join phrases** and **name variations** — the connective text between two
  credited entities.
- **🎚️ Credit details**, **🎭 Roles**, **📅 Release events**, **💿 Format
  info**, **🏷️ Catalog info**, **🔗 Relationship icons**, **⏳ Pending edits**,
  and a **Relationships — Load state** section on pages carrying that column.
- **🔢 Tracks info** — a "Tracks" column's per-medium counts, a multi-medium
  flag, and the summed **Total** (the same number as the "Total Tracks" column:
  "5 + 5 + 5" is `5` under *Tracks* and `15` under *Total*).
- **⏱ Length info** — duration buckets, deviation from the page average, live
  status and, once the ⏱ toggle has put milliseconds on the page, a
  **Milliseconds** split: `≠ .000` (real sub-second precision), `= .000` (whole
  seconds only) and *no millisecond data*. The split is not offered until some
  cell has milliseconds, and it keeps working with ⏱ switched back off, because
  the cells still carry them. On a release tracklist that also has a
  **Recording length** column (see below), that column's own 📊 dropdown
  offers the exact same sections, computed from its own values — plus
  **Track vs recording**: the tracks whose two lengths are flagged, `❌ far
  apart from the other length` and `⚠️ apart beyond the threshold`, counted
  exactly like the **(N) LENGTH** buttons.
- **🎞️ Video info - Medium format** — on a release tracklist's **Video**
  column: `❌ video on a medium that cannot carry video` and `✅ video on a
  video-capable medium` (see "Release tracklists" under "Page-specific
  behaviour").
- **Title info** — on every **Title** column, following MusicBrainz's
  [title style guide](https://musicbrainz.org/doc/Style/Titles), and on the
  columns listed in ⚙️ Settings ("Title Info On These Columns Too", by default
  **Name, Recording, Release, Release group, Release groups, Work** — e.g. an
  artist's recordings, releases and works). Only a cell whose title links a
  recording, release, release group, work or track counts, so an artist or
  label name is never read as a title:
  - **🎶 Medley** — titles starting with `Medley:`, `Medley 2:` or `Medley;`.
    Ticking it marks the `Medley N` prefix.
  - **➗ Multiple titles**, **🔟 Number of titles** and **🎼 Single title** —
    titles joining several songs with a spaced slash
    (`Volare / On an Evening in Roma`): one flag, one entry per number of
    titles, and one entry per title in them (without the medley prefix or
    extra title information). A bare slash, as in `AC/DC`, does not split.
  - **🖋️ Work** — `🚫 no associated work` and `🖋️ has an associated work`, from
    the same row's **Recording of work** column. It only appears where that
    column exists (release tracklists), where the Title cells of the "no
    work" tracks are also tinted with a ⚠️ (see "Release tracklists" under
    "Page-specific behaviour").
  - **➕ Extra title information** (ETI) — a trailing `(…)` or `[…]` whose text
    starts lowercase, such as `(single version)` or `(live)`: one flag plus one
    entry per text. A capitalized group, like `Cecilia (Does Your Mother Know
    You're Out)`, is an alternative title and does not count. Neither does a
    group starting with a lowercase article, conjunction or preposition, like
    `Nancy (with the Laughing Face)`, because title case keeps those words
    lowercase inside a title. Two exceptions come from the keyword list in
    ⚙️ Settings → ⚠️ Findings (version, single, album, live, remix, mix, edit,
    …): a group that **ends** in a keyword written lowercase is ETI whatever it
    starts with (`(Moonitor remix)`, `(U.S. remix)`, `(7” version)`), and a
    group that **starts** with a keyword written capitalized (`(Version 1)`,
    `(Live)`) is ETI too, and is also flagged as a warning (see
    [Warnings and errors](#warnings-and-errors)), because the style guide
    writes ETI in lower case. In the cells themselves, the text of every
    group that counts as ETI is shown in green italics, like a credit
    attribute such as "background" in the Vocals column (switch: ⚙️ Settings
    → ⚠️ Findings → "Show extra title information in green italics").
  - Four more, each with its own switch in ⚙️ Settings: **🪧 Subtitle**
    (`Biography: The Greatest Hits`), **🔂 Series numbering** (`, Volume 1`,
    `, vol. 2`, `, Part 3`, `, Parts I–V`, `, Pt. II`, with one entry per
    number), **📼 Format designation** (`EP`, `LP`, `CD` or `Single` in the
    title) and **🧐 Style issues** (titles cut off with `…`, OC ReMix titles,
    ALL-UPPERCASE titles).
- **🎤 Live title info** — on the same columns as **Title info**, but only for
  titles that link a **release** or a **release group**. They are checked
  against MusicBrainz's
  [live bootleg convention](https://musicbrainz.org/doc/Style/Specific_types_of_releases/Live_bootlegs)
  `YYYY-MM-DD[, early show]: Venue, City, State, Country`, for example
  `2008‐12‐17, early show: Mellon Arena, Pittsburgh, PA, USA`. Titles that
  don't start with a date are ignored, so a studio album or `1984 Revisited`
  never counts. A trailing date part may be missing (`2008‐12`, `2008`), the
  year may be missing in front (`12‐07`), and an unknown part may be written
  `??`. Switch the sections off with "Unique-Values Dropdown: Live Title
  Info" in ⚙️ Settings.
  - **Validity** — `✅ follows the live title convention` and `❌ impossible
    date` (month 13, day 42, 29 February in a non-leap year). On a release
    group's status sub-tables the status is added, e.g. `✅ follows the live
    title convention (Bootleg)`.
  - **❗ Near miss** — titles that start with a date but aren't in the live
    form: `05.02.1975: …`, `1975-2-5: …`, a missing `: ` after the date, or a
    location without `, `. These are usually data-entry errors.
  - **📅 Date completeness** — complete and incomplete dates, plus one entry
    per date shape (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `MM-DD`, `??` for an
    unknown part).
  - **🕗 Additional date info** — one flag plus one entry per text before the
    colon (`early show`, `late show`, …).
  - **📍 Location completeness** — how many `, `-separated parts the location
    after the colon has: `2 parts (Venue, City)`, `3 parts (Venue, City,
    Country)`, `4 parts (Venue, City, State, Country)` or `5+ parts`. Only
    some countries have states, so three parts can be complete too. The
    script only counts parts; it cannot tell which one a short location
    lacks.
  - **Separator ‐ only / - only / mixed** — one section per way the date's
    parts are separated: only the Unicode hyphen `‐` (U+2010, the form
    MusicBrainz normalizes to), only a plain `-`, or both. Each section repeats
    the counts for live titles, valid, impossible date, incomplete date and
    additional date information. A year-only date has no separator, so it
    appears in none of the three.

  The title cells are marked too. **Light red with ❌** means an impossible
  date or a near miss. **Light yellow with ⚠️** means a plain `-` anywhere in
  the date. Red wins over yellow, and the cell's tooltip says what is wrong.
  Each tint has its own switch in ⚙️ Settings: "Live Titles: Flag Invalid Dates
  And Near Misses" and "Live Titles: Flag ASCII Date Separators".
- **🏷️ Event name info** — on every **Event** column (artist, place and area
  events, …), for names that link an event. Add more columns with
  "Unique-Values Dropdown: Event Name Info On These Columns Too", or switch
  the sections off with "Unique-Values Dropdown: Event Name Info" in ⚙️
  Settings. Each name is checked against two conventions: the live bootleg
  form `YYYY-MM-DD[, early show]: Venue, City, State, Country` above (for
  example `2026‐10‐03: Merriweather Post Pavilion, Columbia, MD, USA`), and
  the title forms of the [event style guide](https://musicbrainz.org/doc/Style/Event).
  - **Form** — which form a name follows: `📅 live form`, `🎤 "[artist] at
    [venue]"` (`KISS at Rod Laver Arena`), `🎪 "[festival] [N/YYYY]"`
    (`Hellfest 2023, Day 1: Mainstage 01`, `Wacken Open Air 33`), `🚌
    "[tour]: [city]"` (`End of the Road World Tour: Toronto`) or `✍️ free
    form`. The live form is tried first, then "at", then the festival edition,
    then the tour form, so `KISS at Lucca Summer Festival 2023` counts as "at".
    A number after Day, Week, Night, Part, … is not an edition.
  - **🧭 Style guide near miss** — names in none of the forms that almost are
    one, with one entry per reason: `@` or `AT` for `at`, ` - ` for `: `, a
    colon without exactly one space after it (`Tour:City`, `Tour : City`), an
    abbreviated year (`Hellfest '23`) or a year glued to the name
    (`Hellfest2024`). The check is by shape only, so a typo like `Tour ar
    Estadio …` counts as free form.
  - **🎪 Festival edition** — whether a festival name gives a year or a
    running number.
  - **Live form validity, near miss, date completeness, additional date info,
    location completeness and the three Separator sections** — the same
    entries as **Live title info**, for the event names in the live form.

  The Event cells are marked like live titles: **light red with ❌** for an
  impossible date or a live-form near miss, **light yellow with ⚠️** for a
  plain `-` in the date (same two switches as live titles), and **light
  yellow with ⚠️** for a style guide near miss ("Highlight event names that
  almost follow the style guide as WARNING" in ⚙️ Settings → ⚠️ Findings).
- **🏷️ Recording comment info** — a recording's disambiguation comment, on
  the columns that show it: a recording's **Name**/**Recording** cell (the
  Title-info columns above) and a release tracklist's **Disambiguation**
  column. The synthetic **Comment** column is left alone, so the counts appear
  once. A comment counts when it starts with an event type (`live`,
  `soundcheck`, `rehearsal`, `live rehearsal`, `interview`, `audition`,
  `studio`), in one of the forms of the
  [recording style guide](https://musicbrainz.org/doc/Style/Recording#Live_recordings),
  with an optional `; …` at the end:
  `live`, `live, 2002`, `live, Los Angeles, CA, USA`, or
  `live, 2004‐10‐02[, early show]: Gund Arena, Cleveland, OH, USA[; intro]`.
  An uncertain day may be written `2001‐12‐22/23`. Switch the sections off
  with "Unique-Values Dropdown: Recording Comment Info"; name more plain comment
  columns in "… Columns Holding A Recording Comment As Text".
  - **Form** and **Event type** — which of the forms above, and which type.
  - **❗ Near miss** — one entry per reason: a date not written YYYY-MM-DD, no
    `, ` after the type (`live 2004‐10‐02: …`), no `: ` before the location
    (`live, 2004‐10‐02, Gund Arena, …`), a type in capitals (`Live, …`), or a
    live date with no type in front.
  - **Validity, date completeness, additional date info, location
    completeness and the three Separator sections** — as in **Live title
    info**; location completeness also counts `live, City, State, Country`.
  - **❔ Uncertain day** and **📝 Additional info** (the `; …` text).

  The cells are marked like live titles (same two switches): **light red with
  ❌** for an impossible date or a near miss, **light yellow with ⚠️** for a
  plain `-` in the date. On a release tracklist the **Recording date** cell is
  compared with the comment's date: **light red with ❌** when they are
  different dates, **light yellow with ⚠️** when one is less precise
  (`2004-10` vs `2004-10-02`) or only one of them has a date ("Highlight
  recording dates that disagree with the comment" in ⚙️ Settings → ⚠️
  Findings).
- **🎤 Event info** — on the **Event-*** columns split from a recording comment
  (Event-Type, Event-Country, …): **Type** and **Country** list their values;
  **🔤 Country form** tells abbreviations (`USA`, `UK`) from full names
  (`United States`, `Denmark`), so mixed spellings stand out; **Detail** (the
  text between the date and the colon, e.g. `early show`) and **Additional
  info** (the `; …` text) show has / none — counting only comments with an
  event type — and one entry per value. An **Event-Country** of USA or Canada
  whose state is not a two-letter code is tinted **light yellow with ⚠️**
  ("Highlight a missing state for USA/Canada as WARNING"): the state is
  missing (`The Roxy, West Hollywood, USA` puts the city in its place) or
  written out. The style guide's colon-less form `live, Los Angeles, CA, USA`
  is split into City/State/Country like a location after a colon: two or more
  parts after the type with no date first are a location, a single part
  (`live, early show`) stays Event-Detail.
- **🌟 Rating info - Presence** — on every **Rating** column: `🌟 has a rating`
  and `☆ no rating`.
- **🌅 Time info** — a "Time" column's start time as a part of the day: morning
  (04:00-11:59), lunch (12:00-12:59), afternoon (13:00-17:59), evening
  (18:00-23:59) or night (00:00-03:59). An empty cell stays under "empty cells".
- **📛 Relationship types - Credited as** — the `(as “…”)` credit of a
  "Relationship types" item, prefixed with its type (`» instrument as: lead
  guitar`), beside the whole-value list. **Attributes - Identifier type** also
  lists the parts of a slash-joined type separately: a `BUMA/STEMRA ID` badge
  is offered as `BUMA/STEMRA ID`, `BUMA` and `STEMRA ID`.
- **ISRC info** — one sub-section per constituent (country, registrant, year,
  designation) plus a validity flag, on any "ISRCs" column. An entry whose code
  sits only inside a **collapsed** list item carries a ▶ marker: it is still
  offered (ticking it shows the row and tints the cell's ▶ toggle), the marker
  just says why nothing on screen shows it until the cell is expanded. **ISWC info** — a
  validity flag on any "ISWC" column. See "ISRC/ISWC codes" below.
- **Barcode info** — on any "Barcode" column: a validity flag (✅/⚠️), which
  GS1 format (UPC-A/EAN-13/EAN-8/GTIN-14) a conforming entry matches, and a
  "Same As" list, one entry per group of rows sharing a barcode number
  across different textual representations (e.g. a UPC-A and its own
  zero-padded EAN-13 form), labeled with the actual values involved. See
  "Barcode validation" below.

**Keyboard**: ↑/↓/Home/End navigate, Enter or Space toggles, Escape clears the
quick filter and then closes. The panel closes on an outside click.

**Cosmetics worth knowing**: count badges use a uniform monospace width so the
numbers right-align; flag icons are on by default and can be switched off; the
visible row count before scrolling is configurable (default 30) and also drives
whether the panel flips upward.

</details>

---

## Warnings and errors

Cells with a data problem are tinted: **light yellow with ⚠️** for a warning,
**light red with ❌** for an error. Hover the cell for what is wrong.

Two menus beside the page heading, after ❓ and a divider, list every kind of
problem the page has, with how many rows have it:

```
⚠️ WARNING (12) ▾
   ⏱️ Track and recording length differ          3
   🚫 Recording has no associated work           2
   🔠 Title in ALL UPPERCASE                     1
   ⏳ Pending edits                              6
   ✗ Clear warning filters
```

**Click a row to show only the rows with that problem**, in every table and
every sub-table at once. Click it again to show everything. A ticked row is
bold with a ✓. Rows combine with each other and with any other filter you set:
two problems in the same column show rows with *either*, two in different
columns show rows with *both*. **✗ Clear warning filters** (or **✗ Clear error
filters**) removes only what that menu set. A menu is not shown at all while
the page has nothing of its kind, and the counts always describe the whole
page, not just the rows a filter leaves on screen.

Most rows work by ticking the matching entry in the column's 📊 dropdown — the
**Findings - Warning** / **Findings - Error** section — so you see it in that
column's filter box, and every way of clearing a column filter clears it too.
Problems that can sit in several different columns of one row (pending edits,
live credit dates) filter by row instead, and show a chip beside the global
filter with a ✕ to remove it.

<details>
<summary>What is checked</summary>

| Level | Problem                                                         | Where                                       |
|-------|-----------------------------------------------------------------|---------------------------------------------|
| ⚠️     | Track and recording length differ by more than the threshold    | Release tracklist: Length, Recording length |
| ⚠️     | Recording has no associated work                                | Release tracklist: Title                    |
| ⚠️     | Live title date uses a plain "-" instead of "‐" (U+2010)        | Release and release group titles            |
| ⚠️     | Event name date uses a plain "-" instead of "‐" (U+2010)        | Event columns                               |
| ⚠️     | Event name almost follows the event style guide                 | Event columns                               |
| ⚠️     | Recording comment date uses a plain "-" instead of "‐"          | Name / Recording / Disambiguation           |
| ⚠️     | Recording date and comment date differ in precision             | Release tracklist: Recording date           |
| ⚠️     | No state code for a USA/Canada event location                   | Event-Country                               |
| ⚠️     | Title in ALL UPPERCASE                                          | Title columns                               |
| ⚠️     | Title truncated with "…"                                        | Title columns                               |
| ⚠️     | Extra title information starts uppercase, e.g. "(Version 1)"    | Title columns                               |
| ⚠️     | Track name differs from recording name (jesus2099's "≠" marker) | Release tracklist: Title                    |
| ⚠️     | 🟠 Release has low data quality                                 | Release / Title columns                     |
| ⚠️     | Invalid ISRC / ISWC / barcode format                            | ISRCs, ISWC, Barcode                        |
| ⚠️     | Pending edits                                                   | any column                                  |
| ⚠️     | Live credit without a date                                      | Release tracklist: credit columns           |
| ❌    | Track and recording length far apart                            | Release tracklist: Length, Recording length |
| ❌    | Video on a medium that cannot carry video                       | Release tracklist: Video                    |
| ❌    | Live title with an impossible date                              | Release and release group titles            |
| ❌    | Title starts with a date but is not a live title                | Release and release group titles            |
| ❌    | Event name with an impossible date                              | Event columns                               |
| ❌    | Event name starts with a date but is not in the live form       | Event columns                               |
| ❌    | Recording comment with an impossible date                       | Name / Recording / Disambiguation           |
| ❌    | Recording comment almost in the live form                       | Name / Recording / Disambiguation           |
| ❌    | Recording date differs from the comment date                    | Release tracklist: Recording date           |
| ❌    | Live credit date differs from the recording date                | Release tracklist: credit columns           |

The tint of each newly highlighted problem has its own switch in ⚙️ Settings →
⚠️ Findings; turning one off keeps the problem in the menu. The menus
themselves can be switched off there too. Length, video, no-work and live-title
flags keep their existing switches in 💿 Release tracklist and the live title
settings.

</details>

---

## Sorting

Click a column header to sort ascending, again for descending, a third time to
restore the original order. The indicator goes `⇅ → ▲ → ▼`.

- **Multi-column sort**: `Ctrl+Click` ▲ or ▼ adds a column to the chain. The
  header shows its position in the chain.
- **Durations sort as durations**, not as text, and `?:??` is pinned last in
  both directions.
- **Large tables** sort through a chunked asynchronous merge sort with a
  progress indicator, so the page stays responsive.
- **On a multi-table page, sorting one sub-table rebuilds only that one.**

---

## Columns

**👁️ Visible** hides and shows columns per table, remembered per page type.
**↔️ Resize** fits every column to its content; columns can also be dragged by
their right edge, and a column can never be dragged narrower than its own
header needs.

**Scrolling a wide table sideways** keeps the first (sticky) column and the page
around it in place: the MusicBrainz top header, the entity
header with its action bar, the tabs and every h2/h3 bar stay where they are
instead of scrolling off to the left, and so does the content of any section
you have expanded above the table, such as Credits or the Annotation
(*Enable Sticky Page Headers* in 📌 Table stickiness). This only engages while the page really is wider than the window.
It stays off while the sidebar is expanded and columns are not auto-resized,
because widening the page would push the sidebar off-screen. On a phone or
tablet it is off unless you also tick *Sticky Page Headers on touch devices*
(see [On a phone or tablet](#on-a-phone-or-tablet)).

<details>
<summary>Extracted, derived and injected columns</summary>

Several page types gain columns this script builds from what is already on the
page — dates split into year/month/day, locations split into venue, city,
region and country, artist credits split from their join phrases, and so on.
They are colour-coded in the header: **extracted** columns (greenish grey) come
from splitting an existing column, **derived** ones (sandy beige) are computed.
Both colours are configurable.

Some columns are fetched rather than derived — see
[The Relationships column](#the-relationships-column) and the Release events
column, both of which load after the table appears and can be filtered and
sorted while they do.

**Default hidden columns per page type** is a table setting in ⚙️ Settings: name
a page type and the columns to start hidden there.

**Numeric columns are aligned** on their digits, and durations on their colon,
so a column of times reads as a column rather than as ragged text.

</details>

---

## Collapsing and expanding

- Click an **h2** heading to collapse its whole section; `Ctrl+2` toggles them
  all. `Ctrl+3` does the same for **h3** sub-section headings.
- The sub-headings inside **Credits** (*Release*, *Release group*) and the
  headings inside an **Annotation** collapse on a click too. `Ctrl+Click` one
  of them to do the same to every sub-heading of that section; the other
  sections are left alone. Once an Annotation is fully shown, MusicBrainz's
  own *Show less…* link under it is removed: the Annotation heading already
  collapses it.
- A cell holding several items collapses to its first, with a **▶N▤** toggle
  showing how many are hidden. The column header carries a toggle that does the
  whole column.
- Long prose cells (annotations, edit notes) clamp to a few lines with a
  *more* / *less* toggle.
- `Ctrl+Click` a prose toggle, or a column header's toggle, to force-expand —
  including any wiki headings nested inside the cell.

---

## Cover art

On pages that support it, the script pulls covers from the Cover Art Archive
(and event art from the Event Art Archive):

- a **small icon** in its own column,
- an **inline thumbnail** in the Release or Title column,
- a **big picture strip** under each sub-table heading.

<details>
<summary>How the artwork controls behave</summary>

**The big strips start collapsed** and load nothing until you press their
toggle. That is the default because a large discography is hundreds of
requests, and the archive has no bulk endpoint — it is one request per release.

**Per table and page-wide.** Each sub-table heading gets its own artwork
controls, plus a page-wide set: a toggle, a **⟳** reload, a **⚠⟳** that retries
only what failed, and a **📊** artwork summary panel for that table. They render
as one segmented control per source, so CAA and EAA never read as one group.

**The summary panel costs no requests** — it reports what has already been
fetched. While a load is still running it says so, including how deep the queue
is, because on a large listing the metadata lookups are deliberately queued
behind the images and can be a long way off.

**Failures are distinguished from absences.** "The archive has no artwork for
this release" and "the request failed" both render as no artwork, so the ⚠⟳
button's count is the only way to tell them apart. A transient failure is never
written to the cache.

**Cache-hint glyphs** (🟢/🟡/🔵/🗄️/⚠️) can be shown on icons, strip images and
inline thumbnails, reporting where each image came from. Images are cached in
IndexedDB with a configurable TTL and size.

**Sizes and concurrency** — small and big fetch sizes (250 / 500 / 1200), a
maximum display height, and a request concurrency limit — are all settings.

</details>

---

## The Relationships column

An injected column showing each row's entity relationships as icons, fetched
from the MusicBrainz web service after the table appears.

**A large table starts collapsed and fetches nothing.** The threshold is 200
distinct entities by default; set it to `0` to never auto-collapse. Press **▶🔗**
in the column header to load it. This matters: the column is one request per
entity at roughly one per second, so a 2300-row discography is about forty
minutes of trickling requests that you probably did not want.

<details>
<summary>Load states, per-row loading, and retrying</summary>

Each cell shows where it is: `🔗︎` not loaded, `⋯` queued, `◌` loading, `–` no
relationships, `⚠︎` failed, and `⟳` on hover to reload. **Clicking one cell
loads that row alone**, even in a collapsed column — useful when you want one
answer rather than the whole page. The glyphs can be switched off, which also
switches off click-to-load.

**The header toggle carries a `done/total` badge** while anything is
outstanding.

**Whole-page fetching** is used where MusicBrainz allows it — up to 100 rows per
request on artist, label, release-group, recording and area listings — and falls
back to one request per row elsewhere.

**Two retry buttons, and they mean different things.** `🔗⟳` reloads
everything, for when you believe the data is stale. `⚠⟳ N` recovers only what
failed. There is one of each per table and one page-wide. The failed count is
computed from the captured rows, not from what is on screen, so a filter cannot
hide failures from it.

**An automatic follow-up pass** retries failures once the first load drains,
after a 30-second pause, at most twice per page, and never at all when more than
25 entities failed — that many is an outage, and hammering it is not a retry.

**The 📊 dropdown offers a Load state section** — pending / has / none / error —
so you can filter to exactly the rows that failed.

</details>

---

## Track lengths

MusicBrainz renders track lengths rounded to the second. The **⏱** toggle in the
*Length* column header reveals the millisecond precision it already stores.

- On a release tracklist the values are already in the page — no network.
- On work, artist-relationship, place-performance and area-recording pages one
  lookup covers the page.
- Elsewhere the recordings are fetched in batches of 100.

The button reports what happened: `⏳` loading, yellow **retry** when something
transiently failed and is worth clicking again, yellow **partial** when some rows
arrived, and dimmed when MusicBrainz simply has no sub-second length on record.
Those last two are different facts and only one of them is worth a second click.
Answers are cached per recording in IndexedDB, so a recording seen on one page is
free on the next.

A release tracklist also gets a **Recording length** column whenever some track's
recording length disagrees with its track length, and flags the disagreements
with ⚠️ or ❌ past a configurable threshold; the ⚠️ WARNING and ❌ ERROR menus
isolate them (see [Warnings and errors](#warnings-and-errors)). Its own 📊 dropdown offers the same "Length
info" sections as **Length** (see above), computed from its own values, and
both columns' dropdowns add **Track vs recording** to pick the ❌ or the ⚠️
tracks.

---

## Barcode highlighting

On a listing with a **Barcode** column, matching barcodes are colour-coded and
clicking one toggles the merge checkboxes for the whole group. The
**▶▌█**/**▼▌█** toggle in the *Barcode* column header turns
this off and on — same idiom as the ⏱ toggle above. `Ctrl+B` (configurable)
toggles it directly, from anywhere on the page.

Separately, every Barcode column is also checked against the GS1 spec
(UPC-A/EAN-13/EAN-8/GTIN-14) — see "Barcode validation" under
"Page-specific behaviour" below.

---

## Save and load

**💾 Save to Disk** writes the whole dataset as gzip-compressed JSON
(`.json.gz`, roughly 60–80% smaller than plain JSON). Filenames are built to be
recognisable:

```
MB-<pageType>[-<detail>-]<rowCount>-<timestamp>.json.gz
```

**📂 Load from Disk** reopens one, entirely offline. The dialog is three phases —
**Load Data** (`Alt+L`), then an optional **Filter Data** (`Alt+F`) pre-filter,
then **Render Data** (`Alt+R`) — so a large file can be cut down before it is
rendered. The pre-filter accepts the same plain / regexp / exclude modes as
every other filter, keeps its own history, and highlights what it matched.

`Escape` closes the dialog at any phase.

---

## Export

**💾 Export** writes the currently visible rows — after filtering, in the current
sort order, with hidden columns omitted — as CSV, JSON or Emacs Org-Mode.

Settings control what the headers and cells carry: whether unique-value counts
and sort glyphs appear in column headers, whether artwork and title collapse
glyphs are stripped, and whether multi-row collapse icons become bracketed
counts.

---

## Statistics

**📊 Statistics** (or `Ctrl+I`) opens a panel summarising the rendered table:
row and column counts, which columns are original, extracted or derived, how
many cells are multi-row, artwork coverage, and per-column distinct-value
counts.

---

## Keyboard shortcuts

> **Direct `Ctrl`+letter shortcuts are OFF by default.** While they are off —
> the shipped default — every `Ctrl`+letter combination below is suppressed, and
> the **prefix key** is how you reach these actions. Turn them on with *Enable
> Direct Ctrl+Letter Shortcuts* in ⚙️ Settings → 🎹 KEYBOARD SHORTCUTS.
> `Ctrl+2`, `Ctrl+3`, `Ctrl+,`, `Ctrl+Shift+G` and `Ctrl+U` are never affected
> either way.

### The prefix key — always available

Press the prefix (default `Ctrl+M`), release it, then press a letter:

| Key     | Action                                         | Key | Action                                                  |
|---------|------------------------------------------------|-----|---------------------------------------------------------|
| `s`     | Save to Disk                                   | `g` | Focus global filter                                     |
| `l`     | Load from Disk                                 | `c` | Focus next column filter                                |
| `e`     | Export menu                                    | `o` | Toggle multi-row collapse — or **Stop**, during a fetch |
| `d`     | Density menu                                   | `q` | Unique-values dropdown                                  |
| `v`     | Visible menu                                   | `a` | Toggle cover art for this table                         |
| `r`     | Resize columns                                 | `k` | Keyboard shortcuts reference                            |
| `i`     | Statistics panel                               | `h` | This help, in the page                                  |
| `b`     | Barcode highlighting                           | `,` | Settings                                                |
| `1`–`9` | Action button by index (the `🧮N` superscript) |     |                                                         |

`o`, `q` and `a` act on the column filter that was last focused, so they still
work after the prefix key has taken focus away.

### Direct shortcuts

| Keys                       | Action                                                          |
|----------------------------|-----------------------------------------------------------------|
| `?` or `/`                 | Keyboard shortcuts reference (outside text inputs)              |
| `Ctrl+U`                   | Unicode character picker (when a text input is focused)         |
| `Ctrl+Shift+G`             | Clear all filters                                               |
| `Shift+Esc`                | Clear all column filters only                                   |
| `Ctrl+2` / `Ctrl+3`        | Toggle all h2 / all h3 headings                                 |
| `Ctrl+,`                   | Settings                                                        |
| `Escape`                   | Clear the focused filter, then remove focus; close open menus   |
| `Ctrl+S` `Ctrl+L` `Ctrl+E` | Save · Load · Export — each opens 📦 Data first                 |
| `Ctrl+D` `Ctrl+I`          | Density · Statistics — each opens 🛠 View first                  |
| `Ctrl+B`                   | Toggle barcode highlighting directly (no menu)                  |
| `Ctrl+R` `Ctrl+V`          | Resize columns · Visible columns                                |
| `Ctrl+K` `Ctrl+G` `Ctrl+C` | Shortcuts reference · Focus global filter · Focus column filter |

<details>
<summary>Shortcuts that act on the focused column filter, and menu navigation</summary>

**With a column filter focused:**

| Keys                | Action                                               |
|---------------------|------------------------------------------------------|
| `Ctrl+↑` / `Ctrl+↓` | Sort this column ascending / descending              |
| `Ctrl+#`            | Restore the original row order                       |
| `Ctrl+O`            | Collapse or expand this column's multi-row cells     |
| `Ctrl+Q`            | Open this column's unique-values dropdown            |
| `Ctrl+A`            | Toggle cover art for the enclosing table             |
| `Ctrl+R` / `Ctrl+V` | Resize / visible columns for the enclosing sub-table |

`Ctrl+↑`, `Ctrl+↓` and `Ctrl+#` carry no letter and always work. The rest follow
the direct-shortcuts setting; prefix-mode `o`, `q` and `a` are the alternatives.

**Inside an open menu:**

| Menu        | Keys                                                                                                     |
|-------------|----------------------------------------------------------------------------------------------------------|
| Visible     | ↑/↓ or Tab navigate · Space toggles · `Alt+S` all · `Alt+D` none · `Alt+C` apply · Enter or Escape close |
| Density     | ↑/↓ preview · Enter apply · Escape close                                                                 |
| Export      | ↑/↓ choose format · Enter export · Escape close                                                          |
| Load dialog | `Alt+L` load · `Alt+F` filter · `Alt+R` render · Escape close                                            |

**Every shortcut on this page is configurable**, including the prefix key itself
— it can be any combination such as `Ctrl+.`, `Alt+X` or `Ctrl+Shift+,`.

</details>

---

## Settings

**⚙️** (or `Ctrl+,`) opens the Settings Manager. A 🔍 field at the top filters
the whole list as you type, highlighting matches in labels and descriptions, and
a *changed only* toggle narrows it to what you have altered.

Settings are saved to your browser's userscript storage. Only values you have
actually changed are stored, so a default improved in a later version reaches
you automatically.

<details>
<summary>The setting groups</summary>

| Group                                           | What is in it                                                                                                                                                                                              |
|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 🛠️ Generic                                       | Debug logging; overflow tables in a new tab; artwork diagnostics                                                                                                                                           |
| 🔬 Experimental                                 | Collapsible sidebar                                                                                                                                                                                        |
| 🏷️ Page header and body                          | Relocating h1 alias blocks, legal names and trailing h2 sections                                                                                                                                           |
| 💬 Tooltips                                     | Rich row-count tooltips and their colours                                                                                                                                                                  |
| 🔢 Numeric alignment                            | Digit and colon alignment on numeric and duration columns                                                                                                                                                  |
| 🧮 Optional column removal                      | Drop the Tagger, Rating and checkbox columns                                                                                                                                                               |
| 🎹 Keyboard shortcuts                           | The prefix key, the direct-shortcuts master switch, and 20+ individual bindings                                                                                                                            |
| 🎨 Table filter configuration                   | Every filter colour and border state, the focus prefix and focus backgrounds                                                                                                                               |
| #₁ Unique column values drop down configuration | Badge colours, quick-filter highlight colours, flag icons, visible row count                                                                                                                               |
| Σ Threshold settings                            | Auto-expand rows, max page warning, sort progress indicator                                                                                                                                                |
| 📝 Annotation columns                           | Collapsible prose columns, clamp height, max width, nested heading colours                                                                                                                                 |
| 📖 Annotation section                           | Auto-expand the native annotation section                                                                                                                                                                  |
| 🔀 Annotation history                           | Open *Compare versions* in a new tab                                                                                                                                                                       |
| 🎨 Edits page                                   | Per-category edit colours, collapse defaults, diff colours, zebra striping                                                                                                                                 |
| ⚡ Performance                                  | Debounce, sort chunk size, render and warning thresholds, history limit                                                                                                                                    |
| 🎨 UI features                                  | Column visibility, density control, sticky headers, default hidden columns per page type                                                                                                                   |
| 📌 Table stickiness                             | Sticky column and header configuration; sticky page headers (the MB header, tabs and h2/h3 bars stay put while a wide table scrolls sideways)                                                              |
| 🖌️ Element UI styles                             | Action button base style, per-button colours (including the two halves of the ⚙️❓ pill), toolbar menu button colours, dividers, filter input styles, header cell colours                                   |
| 🔗 Relationships column                         | Enable, auto-collapse threshold, cell load-state glyphs, whole-page fetching                                                                                                                               |
| ↔️ Column resize                                 | Enable resizing; auto-resize on load                                                                                                                                                                       |
| 📤 Export                                       | What headers and cells carry in an export                                                                                                                                                                  |
| 📊 Statistics panel                             | Enable; maximum width and height                                                                                                                                                                           |
| 💾 Load and save                                | Edit the pinned filter list                                                                                                                                                                                |
| 🔍 Expand release and release groups            | Inline ▶/▼ expanders                                                                                                                                                                                       |
| ▶️ Expand truncated cells                        | Whether a clipped cell offers an expander, and how it looks                                                                                                                                                |
| 📑 Show single-table                            | The client-side sub-table snapshot button and its colours                                                                                                                                                  |
| ⚠️ Findings                                      | The ⚠️ WARNING / ❌ ERROR menus on or off; one switch per newly highlighted finding (ALL UPPERCASE, truncated, track ≠ recording name, low quality, pending edits, ISRC, ISWC, barcode, live credit dates, capitalized ETI); the extra title information keyword list  |
| 💿 Release tracklist                            | Every tracklist column family, credit colours, live-date flagging, the ARs column                                                                                                                          |
| 🔖 Barcode highlight                            | Identical-barcode highlighting                                                                                                                                                                             |
| 🔖 Barcode validation                           | GS1 format/check-digit validation, the 📊 Validity/Format/Same As sections                                                                                                                                 |
| 🎨 Artist role colours                          | Main and guest performer label colours                                                                                                                                                                     |
| 🖼️ CAA/EAA illustrated discography               | The whole artwork feature: icons, strips, inline thumbnails, sizes, concurrency                                                                                                                            |
| 🗄️ Art archive IndexedDB                         | The image cache: TTL, entry count, store sizes                                                                                                                                                             |
| 🎵 Picard tagger                                | The ♪ column, its collapse default, host and port range                                                                                                                                                    |
| ⏱️ Track length precision                        | Millisecond lengths, the `.000` suffix, the IndexedDB cache and its TTL                                                                                                                                    |
| 📅 Release events column                        | Enable the asynchronous release-events column                                                                                                                                                              |
| ⏱️ Resource timing                               | Cache-hint indicators and where they appear                                                                                                                                                                |
| 🔤 Unicode picker                               | Enable, shortcut key, and the glyph table                                                                                                                                                                  |

</details>

<details>
<summary>Saving, resetting, and moving your configuration between browsers</summary>

**The dialog header** reports how many settings exist, how many you have
changed, and the storage backend in use.

**RESET** restores every setting to its default, after a confirmation. **SAVE**
writes your changes; closing with unsaved changes — by Escape, by the close
link, or by clicking outside — asks first.

**💾 / 📂 in the settings dialog** export and import a configuration file. It
carries your settings *and* your workspace: the pinned filter list, per-page-type
and per-sub-table column visibility, filter history, panel geometry, the 📊
dropdown's collapsed sections and per-column sizes, and the dialog's own layout.

It deliberately does **not** carry install state — which version's migrations
have run — so importing someone else's file cannot disable your own upgrade
path. Importing reloads the page.

**Tables that ship built-in rows** — the Unicode glyph table, the relationship
maps, the default-hidden-columns table — receive rows added in later versions
without resurrecting rows you deleted. The file records which built-in rows you
have been offered, which is what makes the difference detectable; drop that and
an import brings your deletions back.

</details>

---

## Supported pages

<details>
<summary>The full list</summary>

- **Artist** — release groups, releases, recordings, works, events, aliases,
  relationships (including filtered relationship-type pages)
- **Release group, release, recording, work, label, series, place, area,
  instrument, event** — all supported sub-tabs, including release groups with
  MusicBrainz's own h3-grouped sub-tables
- **Release tracklists** (`/release/<mbid>`, and `/release/<mbid>/disc/<n>`) —
  the whole tracklist across every medium, consolidated
- **Collections** — your own, subscribed ones, and their entity sub-tabs
- **Tags** — entity tag pages, user tag pages, and the most-popular-tags page
- **Search results** — every entity type
- **Reports** — the `/reports` index and all 117 reports across 14 categories
- **Edit listings** — edit search, per-entity edits, your own edits, open edits,
  subscribed edits, notes received
- **Annotation history** (`/<entity>/<mbid>/annotations`) across ten entity types
- **Auto-editor elections**, **genre**, **instrument** and **edit-type** lists,
  **top CD stubs**, **ISRC**, **ISWC** and **privileged account** pages
- **Account pages** (`/account/applications`)
- Also works on the **musicbrainz.eu** mirror

</details>

---

## Page-specific behaviour

<details>
<summary>Release tracklists</summary>

A release page gains **Tracks for Release**, which consolidates every
medium into one table and unpacks each track's relationships into columns:
*Recording of work*, *Recorded at* event and place, *Recorded in area*, *Mixed
at*, *Performer*, the engineer / producer / mixer credit family, phonographic
copyright, *Instruments* and *Vocals*.

**Anything else is discovered automatically.** A relationship type with no
dedicated column gets one named after its own phrase, so a new MusicBrainz
relationship type needs no change here. Two different phrases never merge.

The recorded **work's own** relationships get their own columns too — *Work
lyricist*, *Work composer*, *Work publisher* — kept separate from the
recording's, because they are relationships of a different entity.

Also available: **AcoustIDs** and **ISRCs** columns (both off by default), a
raw **ARs** column, and a flag on live-recording credit dates that disagree with
the recording date.

**Video on a medium that cannot carry video.** When a recording marked as a
video sits on a CD, a vinyl record, a cassette, an SACD or any other format
that cannot hold video, its **Video** cell is tinted light red with a ❌ — the
same look as a far-over length mismatch — and its tooltip names the medium and
its format. Either the recording's video flag or the medium's format is wrong.
Formats that can hold video, or video files, are never flagged: DVD, Blu-ray,
VHS, LaserDisc, Video CD, but also Digital Media, Data CD, Enhanced CD and Mixed
Mode CD (whose data part is where bonus music videos live), USB sticks, SD
cards and download cards. Neither is a medium whose format is "Other" or
missing. The Video column's 📊 dropdown counts both sides under **Video info -
Medium format**. Switch the marking off in ⚙️ Settings → 💿 RELEASE TRACKLIST.

**A link to one track.** MusicBrainz links a single track as
`/release/<mbid>/disc/<n>#<track>` and highlights that track's row in pale
yellow. The consolidated tracklist keeps that highlight — through filtering and
sorting too — and scrolls the track into view once. A cell that carries a
warning (a length mismatch, a video on the wrong medium, no work) keeps its own
warning colour.

**Recording with no work.** When a track's recording is not linked to any
work, so its **Recording of work** cell is empty, its **Title** cell is tinted
like a length over the threshold, with a ⚠️ and a tooltip saying why. The Title
column's 📊 dropdown counts these tracks under **Title info - Work**. Switch
the marking off in ⚙️ Settings → 💿 RELEASE TRACKLIST ("Flag tracks whose
recording has no associated work"); the 📊 counts stay either way.

</details>

<details>
<summary>ISRC/ISWC codes</summary>

Wherever an **ISRCs** column appears (here, and on any native recordings
listing), every code is shown as `CC-XXX-YY-NNNNN` with the country and year
segments lightly tinted — regardless of whether MusicBrainz's own markup or a
third-party script produced the cell. A code that doesn't match that shape is
left as-is but gets a ⚠️ warning glyph and a tooltip explaining why.

Native **ISWC** columns (e.g. an artist's Works tab) get the same treatment:
MusicBrainz already displays these correctly, so a valid one is never touched —
only a code with the wrong shape, or a check digit that doesn't match ISO
15707's own formula, gets the ⚠️ glyph.

Both feed their own 📊 dropdown sections — see "ISRC info"/"ISWC info" above.

</details>

<details>
<summary>Barcode validation</summary>

Every native **Barcode** column is checked against the GS1 standard —
UPC-A, EAN-13, EAN-8 and GTIN-14 — including the check digit. The
displayed value is **never rewritten**, valid or invalid; an entry that
doesn't match a known length, contains non-digit characters, or has an
incorrect check digit gets a ⚠️ warning glyph and a tooltip explaining why.

This is a separate feature from Barcode *highlighting* (see "Barcode
highlighting" above) — validation checks the number itself against the
spec; highlighting groups identical barcode+Format pairs for merge
candidates.

The 📊 dropdown's "Barcode info" section (see "The unique-values dropdown"
above) also offers a **Same As** list: rows whose barcode NUMBER matches
another row's, even written differently — for example a UPC-A and its own
zero-padded EAN-13 form — are grouped into one checkable entry showing both
values, e.g. `0196587565725 / 196587565725`. This is deliberately
independent of the release's own Format column, so it can catch a match
that the highlighting feature intentionally does not group.

</details>

<details>
<summary>Multi-table pages</summary>

Pages that group their rows — artist relationships, place performances, a
series, a tag listing — render one heading and one table per group, with a
**Show/Hide all** master toggle.

Each sub-table has its own filter, its own sort, its own ↔️ and 👁️ controls and
its own artwork controls. Sorting one sub-table rebuilds only that one.

Some sub-tables are capped at 100 rows by MusicBrainz itself. The **Show
single-table** button opens such a sub-table in its own tab as a standalone
single table, entirely client-side, with no refetch.

</details>

<details>
<summary>Edit listings, annotations, elections and account pages</summary>

**Edit listings** colour the *Edit#* and *Edit action* cells by edit category and
by whether the edit is open or closed, colour old/new value differences, and
clamp the long *Edit details* and *Edit notes* columns with a *more* toggle.

**Annotation history** pages get Editor and Version-history columns, always
selectable Old/New comparison radios, and a relocated *Compare versions* button
that can open in a new tab.

**Auto-editor election** pages consolidate both the index and individual
elections.

**`/account/applications`** is served with a stricter Content-Security-Policy
than the rest of MusicBrainz. Every dialog, tooltip and panel renders correctly
there; nothing is reduced.

</details>

<details>
<summary>The Picard tagger column</summary>

Tables whose rows link a release gain a **♪** column that sends the release to a
running MusicBrainz Picard. It starts collapsed — the `<th>` and the cells are
there, but the buttons are only built when you press **▶♪** in the header.

Host and port are configurable (`127.0.0.1`, ports 8000–8010 by default). A
release's own tracklist does not get this column: its rows link recordings, not
releases.

</details>

---

## On a phone or tablet

The script runs in any mobile browser that runs Tampermonkey (Firefox for
Android, for example), with or without that browser's *Desktop site* mode.
MusicBrainz itself has no mobile layout, so either way you get the desktop
page, zoomed out to fit the table, and you pinch to zoom in. Two things behave
differently from a desktop, on purpose:

- **Hover tooltips do not open on a tap.** A tap would open them but nothing
  could close them again, so they would stay over the page. That covers the
  rich tooltip on the action buttons, the artwork preview and its type tooltip,
  and the Relationships tooltips. The buttons themselves work as usual.
- **The keyboard appears only when you tap a filter.** On a desktop the
  global filter is focused after the table renders, so you can type right
  away; a filter's ✕ puts the cursor back into it; and a column's 📊 dropdown
  opens with the cursor in its quick filter. On a phone each of these would
  raise the keyboard over the page, so none of them happens there.
- **Sticky Page Headers is off.** Pinch-zoom moves what you see independently
  of what the browser pins, so the bars cannot reliably stay in view. To try it
  anyway, tick *Sticky Page Headers on touch devices* in 📌 Table stickiness.

Keyboard shortcuts need a keyboard, and dragging a column edge to resize it
needs a mouse.

## Troubleshooting

**The action button does nothing / the table never appears.** Check whether a
dialog is waiting for you — a large listing asks before fetching, and the answer
is a plain-DOM dialog rather than a browser one, so it may be behind something.

**Filtering stopped responding after a while.** Press the action button again;
it reloads the page and starts clean. That is what the second press is for.

**The Relationships column is empty and nothing is loading.** It is collapsed —
large tables start that way on purpose. Press **▶🔗** in its header, or click a
single cell to load just that row.

**Cover art is missing for some rows.** "No artwork" and "the request failed"
look identical. The **⚠⟳** button's count tells you how many failed; pressing it
retries only those.

**A setting I changed had no effect.** A few settings only decide a *starting*
state — whether a column begins collapsed, whether strips begin closed — and do
not change a table already on screen. Reload the page.

**⚙️ Settings does nothing, and every setting seems to be back at its default.**
That is what a failed shared-library load looks like, and it is deliberately
quiet — nothing errors, the script falls back to built-in values and carries on.
The Settings Manager belongs to the library, so it is the visible symptom.
Reinstall `VZ_MBLibrary.user.js` from the same repository as this script.

---

*Found something this page gets wrong? The script's changelog is in the
Tampermonkey menu under 📜 ChangeLog, and issues belong in the
[repository](https://github.com/vzell/mb-userscripts).*
