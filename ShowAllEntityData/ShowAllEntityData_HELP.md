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
- [The Recording of column](#the-recording-of-column)
- [Track lengths](#track-lengths)
- [Save and load](#save-and-load)
- [Export](#export)
- [Statistics](#statistics)
- [The browser cache](#the-browser-cache)
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
the other. A menu opens below its button, or above it when the button is near
the bottom of the window; one longer than the room available scrolls.

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

### Hover texts

Every hover text the script adds shows as a small cream card, like the insert
of a record sleeve, instead of the browser's plain grey box. That covers the
buttons, filter boxes, column headers, collapse toggles, flagged cells and 📊
dropdown entries. The first line is set as a bold title, and shortcuts appear
as keycaps (<kbd>Ctrl</kbd>+<kbd>M</kbd>, then <kbd>R</kbd>). The card appears
after a short pause, follows the pointer, and goes away when you click.

MusicBrainz's own hover texts are left alone: an artist link's sort name, the
rating stars, a country's full name. So are other userscripts' texts. The
cover-art card, the Relationships panel and the prefix-key overlay use the same
look. Turn the cards off, or change their delay, in ⚙️ Settings → 💬 TOOLTIPS.

### The progress card

A column that loads its data after the table appears — [Recording
of](#the-recording-of-column), [Relationships](#the-relationships-column) and
the ⏱ millisecond [track lengths](#track-lengths) — reports through one card in
the same look. When you start the job, it opens under the column's toggle.
Until you have started one, hovering the toggle shows its usual tooltip. The
card shows:

- what is being loaded, and a bar that also counts cache hits and failures;
- where the data comes from, and why that source was picked;
- how many requests went out and how many are left;
- the last few requests with their outcome, so an `HTTP 503` and its retry
  are visible without opening the console;
- a **💾 Cache** part: the browser store, how many records it holds, how
  long they are kept, and how this run split between memory, the browser
  cache and the network.

A **long sort** (more than half a second) opens the same card with its
progress. So does a long **filter while you type** on a table of more than
1,000 rows, in the global filter or in a column filter. The card shows what
you are filtering for (a column filter by its column, and on a page with
sub-tables by its sub-table too, e.g. “live” in Title (Album + Live)) and
which step the filter is on. First it compares rows: how many have been
compared and how many match so far. Then it prepares the matching rows for
drawing, with its own count. A column filter compares only its own sub-table,
so it spends most of its time preparing. Filtering pauses every few
milliseconds, so the page keeps responding to your keys; a key typed while it
runs starts a new pass, and the card's **Recent** list notes which one was
replaced. Hover the status line next to the filter box afterwards to see how
long the last sort and filter took: comparing, preparing and drawing the rows.
The 🔍 filter on a sub-table's heading still filters at once and does not
show the card.

<kbd>Esc</kbd> closes it, and the job keeps running. Hovering the toggle shows
it again, live; moving the pointer away closes it. You can move onto the card
to press its buttons, such as **Retry failed**. On a phone, a tap outside
closes it. Both switches are in ⚙️ Settings → 💬 TOOLTIPS.

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
  `??`. A title may also name several dates, and each date is checked on its
  own: more days of one month (`1978‐08‐21/22/23: Madison Square Garden, …`),
  separate dates each with its own location (`1978‐08‐21: … / 1979‐01‐01:
  …`), or separate dates sharing one location (`1989‐07‐04 / 1990‐04‐22:
  Park West, Chicago, IL, USA`). Such a title is valid unless one of its
  dates is impossible. Switch the sections off with "Unique-Values Dropdown:
  Live Title Info" in ⚙️ Settings.
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
  - **🗓️ Multiple dates** — titles with several days of one month, and titles
    with several separate dates.
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
| ⚠️     | Main-event track differs from the release group title           | Release tracklist: event columns            |
| ⚠️     | No state code for a USA/Canada event location                   | Event-Country                               |
| ⚠️     | Title in ALL UPPERCASE                                          | Title columns                               |
| ⚠️     | Title truncated with "…"                                        | Title columns                               |
| ⚠️     | Extra title information starts uppercase, e.g. "(Version 1)"    | Title columns                               |
| ⚠️     | Track name differs from recording name (jesus2099's "≠" marker) | Release tracklist: Title                    |
| ⚠️     | 🟠 Release has low data quality                                 | Release / Title columns                     |
| ⚠️     | Invalid ISRC / ISWC / barcode format                            | ISRCs, ISWC, Barcode                        |
| ⚠️     | Artwork has no Front image (releases with artwork only)         | CAA                                         |
| ⚠️     | Physical release artwork has no Medium image                    | CAA (needs a Format column)                 |
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
| ❌    | Recorded at event differs from the comment                      | Release tracklist: Recorded at event        |
| ❌    | Recorded at place differs from the comment venue                | Release tracklist: Recorded at place        |
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

**Scrolling down** keeps the page heading with the action buttons and the
status line ("Loaded … Fetching …") at the top of the window, from the moment
the page opens, and once the table is shown the section bar with the global
filter and the row count right under them, so you can see the counts and
filter at any point of a long table. In a window too small for all of that,
the heading scrolls away and the bars still stay. On a page with several sub-tables the bar of the
sub-table you are in (with its own filter) stays right under it, and the next
sub-table's bar takes its place as you scroll into it. The column headers stay
under the bars (*Enable Sticky Filter Bars* and *Enable Sticky Headers* in 📌
Table stickiness; with the first off, only the column headers stay). Sections
that come after the data in the page, which the script normally moves above it
(*Relocate trailing h2 sections before data table*), scroll under the bar if
that setting is off.

**Scrolling a wide table sideways** keeps the first (sticky) column and the page
around it in place: the MusicBrainz top header, the entity
header with its action bar, the tabs and every h2/h3 bar stay where they are
instead of scrolling off to the left, and so does everything else on the page
that is not a wide table: any section you have expanded, such as Credits, the
Annotation or the Wikipedia extract; the text and forms above the table, such
as an alias page's introduction or a search form; the "Loaded … Fetching …"
status line; and the big cover-art strips above a table, which wrap to the
window's width meanwhile
(*Enable Sticky Page Headers* in 📌 Table stickiness). The sticky column then
stops in line with the h2 or h3 bar above its table, not at the window's left
edge, and nothing scrolls into the strip to its left. A column in front of it,
such as "#" before "Title", stays at that line too, and the sticky column
slides over it. A table that fits in the window, such as an artist's
one-column "Artist credits" or a short sub-table next to wide ones, stays
completely in place while the page scrolls, like the bars.
This only engages while the page really is wider than the window.
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

<details>
<summary>The CAA/EAA cell: tiles, type chips, cards and the viewer</summary>

**Type chips.** After the image count, each cell shows one small letter chip
per artwork type — **F**ront, **B**ack, **Sp**ine, **M**edium, **B**oo**k**let,
**T**ray by default: filled when the release has an image of that type (with a
small number when it has several), hollow when it has none, and ⏳ when an
image is waiting for approval. So a collapsed cell already tells "front, back
and medium, no booklet". EAA cells use the event types (Poster, Banner,
Schedule, Setlist, Ticket). The letters are not text: a filter for "B" never
matches them.

**Expanded cell layouts.** Expanding a cell (▶) shows its images as a
**grid** of tiles by default, with the types and comment on each tile and ★ on
the archive's main front. **Grouped** puts the tiles under each image's first
type ("Medium ×3"); **list** is the original one-line-per-image layout. The
**▦** button in the column header switches all tables at once. Filtering is
the same in every layout: a filter such as "Medi" or "outs" still finds the
row, and the matching text is marked on the tile, which is outlined as well
(the caption is cut to one line).

**Expanding a whole column.** The ▶ of the artwork button at the left of the
column header (▶🖼) expands or collapses every artwork cell of that table. The
**▶N▤** button at the right of the header — N is the number of artwork cells
— does exactly the same, and always shows the same state. The "expand all
multi-row cells" buttons in the section headings leave artwork cells alone,
since opening all of them would load every thumbnail on the page.

**Cards.** Hovering the artwork icon or the image count shows a card with the
release's whole artwork: a tile per image (★ main front), a tally of the types,
pending images, and — while a filter matches — the images it matches, marked
the same way. Hovering one image of an expanded cell shows its card: the
preview, its types and comment, its position ("Image 6 of 10 · Medium 2 of 3"),
main front/back, the sizes the archive has and its archive id.

**The viewer.** Click an image of an expanded cell — or the artwork icon,
which opens the main front — to open the full-screen viewer (the one the
release page's **Cover art** section uses, see *Release tracklists* under
*Page-specific behaviour*). From a column it goes beyond one release: **← →**
at the last/first image continue into the next/previous row, and
**Shift+← →** jump between rows. Only the rows the filters leave visible are
stepped through. Ctrl-click (or middle-click) the icon to follow the link
instead.

**The gallery (🖼).** The 🖼 button among a table's artwork controls (after
📊), or **🖼 Open gallery** in its 📊 summary, opens a window with every image
of the releases the table currently shows — the rows the filters leave, in
their order — grouped by release, each labelled with its format, country and
date, label and catalog number. The type chips at the top show only those
images (several at once: any of them); a release without one says so ("No
Medium image"), which answers "which releases miss a disc scan?" at a glance.
**Compare two** puts two releases side by side, one line per image type, with
"none" where one has no such image. A click on an image opens the viewer,
whose Shift+← → then step through the gallery's releases. A release whose
artwork is still loading shows "loading…" and fills in while the window is
open. The window can be moved and resized and remembers where it was; Escape
or a click outside closes it (not a click in the viewer).

**Settings** (⚙️ → 🖼️ CAA/EAA ILLUSTRATED DISCOGRAPHY): the layout, tile size
and tiles per line, the ▦ button, both cards (and how many tiles the release
card shows, and the preview size), marking filter matches in the cards, the
viewer from the column and from the icon, the viewer's image size (**1200**,
or the **original** file, which can be many MB), crossing into the next row,
keeping the zoom level, the slideshow interval, how a zoomed image moves (**follow** the mouse or **drag** it), the image facts, the background, the chip types with their
letters, and the gallery (on/off, its tile size, Compare two). None of these
makes a request of its own: everything is read from the artwork records the
column has already loaded.

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
failed. There is one of each per table and one page-wide; a single-table page
shows only the page-wide `⚠⟳`, since it covers the same rows. The failed count is
computed from the captured rows, not from what is on screen, so a filter cannot
hide failures from it.

**An automatic follow-up pass** retries failures once the first load drains,
after a 30-second pause, at most twice per page, and never at all when more than
25 entities failed — that many is an outage, and hammering it is not a retry.

**The 📊 dropdown offers a Load state section** — pending / has / none / error —
so you can filter to exactly the rows that failed.

</details>

---

## The Recording of column

On an artist's **Recordings** page, two columns follow **Name**:

- **Recording of** — the work each recording performs, as a link. Its
  attributes follow in light green italics, e.g.
  *Can't Help Falling in Love (cover/live)*. A medley lists one row per work.
- **Performance attributes** — the same attributes one per row (cover, live,
  partial, instrumental, medley, …), plus the performance date.

This is what the "MusicBrainz: Batch-add 'performance of' relationships"
userscript writes under each title, as columns you can filter and sort. If
that script is installed, its own lines and its "Performance Attributes"
column are removed from the table. ShowAllEntityData only shows the data;
it never adds relationships.

**Nothing is loaded until you ask.** Each cell shows `🎼︎`: click it to load
that one row. **▶🎼** in the header loads every row, with a `done/total` badge
while it works and the [progress card](#the-progress-card) under it. When
every row is loaded it reads **▼🎼**. A cell shows `⋯` while queued, `◌` while
loading, `–` when the recording has no work, and `⚠︎` when the request
failed; click a `⚠︎` to try again.

**Few requests.** Loading every row first asks for the artist's recordings
100 at a time, and that first answer also says how big the catalogue is. If
the catalogue is much larger than the page, the rest is looked up one row
at a time instead, whichever needs fewer requests. Answers are kept in the
browser for 30 days, so a reload costs nothing.

**Suggested works.** For a recording without a work, the column suggests
the artist's work with the closest title, in orange and marked *suggested:*.
"(alternate take)" and similar endings are ignored, and so are case,
spacing and typographic quotes. The artist's work list is loaded with the
column and kept for 30 days. If the batch-add userscript already holds that
list in your browser, it is reused instead (read only). You can set how
different a title may be, or turn suggestions off.

**The 📊 dropdown** has two sections for this column: **Load state** (not
loaded / has a work / work suggested / no work / failed) and **Suggested
work** (one entry per suggested title). The attributes appear in the
existing attribute entries.

Settings: ⚙️ Settings → 🎼 RECORDING OF COLUMN.

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

## The browser cache

The script keeps what it loads in your browser so a reload costs nothing:
cover art and its lists, relationships, millisecond lengths, "Recording of"
answers, artist work lists and link previews. **💾 Browser cache** shows all of
it:

- how much space each part takes, as a chart and in numbers;
- how many entries each part holds;
- how old they are, and how many are past their keep time;
- every entry of a part, with a search box.

You can delete the expired entries of one part, clear one part, delete a single
entry, delete everything expired, delete everything older than 7, 30 or 90
days, or clear it all. Every delete asks first, inside the dialog, and
<kbd>Esc</kbd> cancels the question before it closes the dialog. Deleted
entries are loaded again when they are needed; the page you are on keeps what
it already loaded. Sizes are estimates. The site storage figure counts the
whole site, including MusicBrainz's own storage.

Open it from ⚙️ Settings → 🗄️ ART ARCHIVE INDEXEDDB CACHE, from the 📊
Statistics panel, from the Tampermonkey menu, or with **💾 Cache overview** on
any [progress card](#the-progress-card).

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

Press `Escape` instead of a letter to cancel; the overlay closes at once and a
focused filter keeps its text. Prefix mode also ends by itself after 5 seconds.

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

| Group                                           | What is in it                                                                                                                                                                                                                                                         |
|-------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 🛠️ Generic                                       | Debug logging; overflow tables in a new tab; artwork diagnostics                                                                                                                                                                                                      |
| 🔬 Experimental                                 | Collapsible sidebar                                                                                                                                                                                                                                                   |
| 🏷️ Page header and body                          | Relocating h1 alias blocks, legal names and trailing h2 sections                                                                                                                                                                                                      |
| 💬 Tooltips                                     | "Liner notes" hover cards on/off and their delay; tooltip colours                                                                                                                                                                                                     |
| 🔢 Numeric alignment                            | Digit and colon alignment on numeric and duration columns                                                                                                                                                                                                             |
| 🧮 Optional column removal                      | Drop the Tagger, Rating and checkbox columns                                                                                                                                                                                                                          |
| 🎹 Keyboard shortcuts                           | The prefix key, the direct-shortcuts master switch, and 20+ individual bindings                                                                                                                                                                                       |
| 🎨 Table filter configuration                   | Every filter colour and border state, the focus prefix and focus backgrounds                                                                                                                                                                                          |
| #₁ Unique column values drop down configuration | Badge colours, quick-filter highlight colours, flag icons, visible row count                                                                                                                                                                                          |
| Σ Threshold settings                            | Auto-expand rows, max page warning, sort progress indicator                                                                                                                                                                                                           |
| 📝 Annotation columns                           | Collapsible prose columns, clamp height, max width, nested heading colours                                                                                                                                                                                            |
| 📖 Annotation section                           | Auto-expand the native annotation section                                                                                                                                                                                                                             |
| 🔀 Annotation history                           | Open *Compare versions* in a new tab                                                                                                                                                                                                                                  |
| 🎨 Edits page                                   | Per-category edit colours, collapse defaults, diff colours, zebra striping                                                                                                                                                                                            |
| ⚡ Performance                                  | Debounce, sort chunk size, render and warning thresholds, history limit                                                                                                                                                                                               |
| 🎨 UI features                                  | Column visibility, density control, sticky headers, default hidden columns per page type                                                                                                                                                                              |
| 📌 Table stickiness                             | Sticky column and header configuration; sticky filter bars (the h2/h3 bars stay at the top while scrolling down); sticky page headers (the MB header, tabs and h2/h3 bars stay put while a wide table scrolls sideways)                                               |
| 🖌️ Element UI styles                             | Action button base style, per-button colours (including the two halves of the ⚙️❓ pill), toolbar menu button colours, dividers, filter input styles, header cell colours                                                                                              |
| 🔗 Relationships column                         | Enable, auto-collapse threshold, cell load-state glyphs, whole-page fetching                                                                                                                                                                                          |
| ↔️ Column resize                                 | Enable resizing; auto-resize on load                                                                                                                                                                                                                                  |
| 📤 Export                                       | What headers and cells carry in an export                                                                                                                                                                                                                             |
| 📊 Statistics panel                             | Enable; maximum width and height                                                                                                                                                                                                                                      |
| 💾 Load and save                                | Edit the pinned filter list                                                                                                                                                                                                                                           |
| 🔍 Expand release and release groups            | Inline ▶/▼ expanders                                                                                                                                                                                                                                                  |
| ▶️ Expand truncated cells                        | Whether a clipped cell offers an expander, and how it looks                                                                                                                                                                                                           |
| 📑 Show single-table                            | The client-side sub-table snapshot button and its colours                                                                                                                                                                                                             |
| ⚠️ Findings                                      | The ⚠️ WARNING / ❌ ERROR menus on or off; one switch per newly highlighted finding (ALL UPPERCASE, truncated, track ≠ recording name, low quality, pending edits, ISRC, ISWC, barcode, live credit dates, capitalized ETI); the extra title information keyword list  |
| 💿 Release tracklist                            | Every tracklist column family, credit colours, live-date flagging, the ARs column                                                                                                                                                                                     |
| 🔖 Barcode highlight                            | Identical-barcode highlighting                                                                                                                                                                                                                                        |
| 🔖 Barcode validation                           | GS1 format/check-digit validation, the 📊 Validity/Format/Same As sections                                                                                                                                                                                            |
| 🎨 Artist role colours                          | Main and guest performer label colours                                                                                                                                                                                                                                |
| 🖼️ CAA/EAA illustrated discography               | The whole artwork feature: icons, strips, inline thumbnails, sizes, concurrency                                                                                                                                                                                       |
| 🗄️ Art archive IndexedDB                         | The image cache: TTL, entry count, store sizes                                                                                                                                                                                                                        |
| 🎵 Picard tagger                                | The ♪ column, its collapse default, host and port range                                                                                                                                                                                                               |
| ⏱️ Track length precision                        | Millisecond lengths, the `.000` suffix, the IndexedDB cache and its TTL                                                                                                                                                                                               |
| 📅 Release events column                        | Enable the asynchronous release-events column                                                                                                                                                                                                                         |
| ⏱️ Resource timing                               | Cache-hint indicators and where they appear                                                                                                                                                                                                                           |
| 🔤 Unicode picker                               | Enable, shortcut key, and the glyph table                                                                                                                                                                                                                             |
| 🎸 springsteenlyrics.com                        | Switch on the springsteenlyrics.com collection and bootleg lists (off by default); see [Page-specific behaviour](#page-specific-behaviour)                                                                                                                            |
| 🌴 jungleland.it                                | Switch on the jungleland.it bootleg artwork list (off by default); see [Page-specific behaviour](#page-specific-behaviour)                                                                                                                                            |
| 💿 brucespringsteen.it                          | Switch on the brucespringsteen.it record database (off by default); see [Page-specific behaviour](#page-specific-behaviour)                                                                                                                                           |
| 📚 Brucebase                                    | Switch on the Brucebase song list and, separately, its year pages (both off by default); see [Page-specific behaviour](#page-specific-behaviour)                                                                                                                      |
| 🔎 Link previews on MusicBrainz                 | The cards of the links on MusicBrainz pages (on by default; on a phone or tablet off unless you tick the *… on touch devices* boxes), how long their answers are kept, the release group window's size; see [Page-specific behaviour](#page-specific-behaviour)     |
| 🔎 Every preview                                | Show the MusicBrainz link previews and the Springsteen sites' detail-page previews on a plain hover (on by default), or only while Ctrl is held                                                                                                                       |

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
- **Event pages** (`/event/<mbid>`) — the event's relationships and setlist as
  tables, and its Event Art Archive images
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
- **Not MusicBrainz:** the **springsteenlyrics.com** collection (every
  category and the entry page), bootleg lists, CD and vinyl bootleg list
  and lyrics index, the **jungleland.it**
  bootleg artwork list, the **brucespringsteen.it** record database and
  the **Brucebase** song list and year pages — each off until you switch it on, see
  [Page-specific behaviour](#page-specific-behaviour)

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
the recording date (Recording engineer, Performer, Vocals, Instruments, Recorded
at event, Recorded at place).

**Cover art without leaving the page.** After **Tracks for Release**, a
**Cover art (N)** section opens above the tracklist with every Cover Art
Archive image of the release: its types, its comment, ★ on the archive's main
front image (which is not necessarily every image typed Front), and ⏳ on an
image still pending approval. Click its heading to collapse it like any other
section. Hover a thumbnail for its card:
types, comment, a larger preview, "6 of 16 · Liner 1 of 4", and the edit that
added it. The chips above the sheet (**All 16**, **Front 1**, **Liner 4**, …)
show only the images carrying that type — an image with two types counts for
both — and **Grid / By type** groups the sheet under each image's first type.
The chips combine: click **Front** and then **Back** to see the images
carrying either type (an image with both shows once). Click a pressed chip
again to drop its type; **All**, or dropping the last one, shows every image.
**Spreads** lays the sheet out like the package itself: two images of the same
type whose comments differ only in a final "left" / "right" ("opened gatefold
cover, inside left" + "… inside right") are shown side by side as one opened
spread, the Liner and Booklet pages are turned two at a time with **◀ ▶**, and
everything else follows as single pages. The pairing goes by the comments, so
it only pairs when that is unambiguous — no image is ever hidden. The layout is
remembered, and travels with a config export.

**The viewer.** Click a thumbnail to open it full screen; it steps through the
thumbnails currently shown, in their order, so a chip or **By type** applies
(in **Spreads**, every Liner page is included, also those the pager hides).
Clicking the **Cover art (N)** tab itself opens the viewer on a grid of every
image instead of leaving the page — Ctrl-click (or middle-click) the tab, or a
thumbnail, to open the archive page or the image in a new tab as before. The
thumbnail shows at once and the 1200 px image replaces it when it arrives; the
panel on the right lists the types, comment, position, main front/back,
approval, the edit that added it and links to every size, and what is on screen (which rendition, its pixel size, and its file size when known without a request). Keys: **← →** step
(wrapping at the ends; opened from a CAA/EAA column they continue into the
next row, and **Shift+← →** change rows), **Home / End**, **↑ ↓** or the mouse
wheel zoom in and out (toward the pointer), **0** fits, **Z** or a click
toggles 2× (the image follows the mouse: move toward a side to bring that edge into view; with the *drag* setting, drag it with the mouse button held instead), **1** actual pixels (the bar shows the zoom as screen pixels per image pixel), **R** / **Shift+R** turn a quarter turn (view only; the next image starts upright), **H** / **V** mirror left-right / upside-down, as seen — for a matrix area scanned through the disc, whose numbers read backwards (also the Flip button; view only; the next image starts unflipped), **B** background (dark, light, checkerboard), **F** the browser's fullscreen, **D** download the original (named like Art Station's: position, types, comment), **P** starts or stops a slideshow,
**G** grid, **I** info panel, **O** original in a new tab, **Esc** closes (from
a grid opened with G: back to the image; in fullscreen, the first Esc leaves fullscreen). The zoom level is kept from image to
image and remembered for next time; the large image is the 1200 px one, or the
original file (both settings). On a touch
screen, tap to open and swipe sideways to step; pinch with two fingers to zoom, and drag a zoomed image with one. While the viewer is open the
page's own shortcuts are paused. It costs one request per render
— none when the record is already cached from a CAA column, none when the tab
says "Cover art (0)" — and the global filter never hides it. "No images" and
"could not be reached" are told apart; the second offers **⟳ Retry**. Setting:
*Show a "Cover art" section above the tracklist* (on by default).

**Disc labels in the medium headings.** The archive's **Medium** images (disc
and record labels) appear as small thumbnails in the heading of the medium they
show — click one for the viewer, which then steps through that medium's own
images. The archive does not say which medium an image shows, so one is placed
only when that is certain: the release has a single medium; its comment names
the medium ("disc 2", "CD 2", "LP 2", or "side C" on vinyl and cassettes, two
sides per medium); or no Medium image has a comment and there are exactly as
many of them as media, which are then taken in archive order. Everything else
is collected in one note on the first medium — e.g. *4 Medium images, 3 media,
no comments: not assigned* — that opens them in the viewer. It makes no request
of its own. Setting: *Show Medium images in each medium heading* (on by default;
needs the Cover art section).

**Live recordings from more than one event.** Each track is matched to an
event: its **Recorded at event**, else the event its recording comment names
(`live, 1996‐04‐19: Saal 1, ICC Berlin, Berlin, Germany`), else its **Recording
date**. A medium whose tracks come from two or more events gets a **🎪 N
events** badge in its heading, after the ⏳ pending-edits badge; its tooltip
lists each event with its number of tracks. The **Disambiguation** column's 📊
dropdown then has an **Event info - Events on this medium** section, one entry
per event, to filter to its tracks. Both count every track, also those a
filter hides.

**The release group and the main event.** On a release page the
`(see all versions of this release, 5 available)` link names its release
group: `(5 versions available in 1996‐04‐19: ICC Berlin, Saal 1, Berlin,
Germany)`. The name is in the page already, so this costs nothing. Hovering
it shows a card of the release group beside the link: its cover, type and
artist, and its first releases with this one marked ▸, loaded with one request
on the first hover (a failed load is tried again on the next hover). **Esc**
closes the card. **Space** pins it into a window you can move and resize:

- **Extracted** lists *every* release of the group, read 100 at a time, in a
  table you can sort by clicking a column header (again to reverse it). Each
  title opens its release in a new tab; a cover shows where the Cover Art
  Archive has one. Beside it: the group's type, first release date, artist,
  rating, genres, external links and annotation.
- **Live page** shows the release group's own page, without the site's header
  and footer.
- **⟳** reads everything again from MusicBrainz; **↗** opens the release group
  in a new tab.

What was loaded is kept for a day (⚙️ Settings → 🔎 LINK PREVIEWS ON
MUSICBRAINZ → *Keep MusicBrainz answers for (hours)*), so the card of a group
you have seen comes back at once (its foot says *saved today*). A group with
very many releases shows the first 500; *Release group window: at most this
many releases*, in the same section, changes that. These requests and the
Relationships column's share one limit of one request a second. Switch the link
and its card off in ⚙️ Settings → 💿 RELEASE TRACKLIST. On a touch screen, a
tap on the link opens the window.

When the release group title is a live title, it names the release's **main
event**, by its date. If the tracks come from two or more dates, the **#**
cell of every track from another event gets that event's own tint and a small
chip, **E1**, **E2**, … numbered by date, so the events can be told apart with
or without colour. Hovering the 🎪 badge shows the legend. Main-event tracks
whose Disambiguation, **Recorded at event** or **Recorded at place** name the
event or venue differently from the release group title get a ⚠️ warning,
with both names in the tooltip (the venue is the first part of the title's
location). When tracks carry live event data but the release group title is
not a live title, a ⚠️ after the link explains why and suggests a title from
the event with the most tracks; there is then no main event and no tint.

**The release group of each track's event.** Resting the pointer on a live
track's **#** cell shows a release group card, and for an event other than
the main one that starts its search. If you would rather move down the column
without cards or searches, switch off *Show the "#" release group card on a
plain hover (without Ctrl)* in ⚙️ Settings → 💿 RELEASE TRACKLIST: the card
then shows only with **Ctrl** held, or when you press **Ctrl** while the
pointer is on the cell. For the main event it is the release's own
release group. For any other event, a search looks for a release group named
exactly like the event: the Disambiguation without `live, ` and without a
trailing `; …`. It runs once per event, only when you ask for the card. A found group
gets the same card as the header link. Otherwise the card says so and lists
the closest titles the search returned. **Space** pins the card into the same
window as the header link's, where **←** and **→** step from one **#** cell to
the next, across the media; for an event without a release group of its own,
the window links the closest titles and the search instead. On a touch screen,
a tap on a **#** cell opens the window. Alt+click the **#** cell to open the
release group, or the search, on musicbrainz.org. In ⚙️ Settings → 💿 RELEASE
TRACKLIST you can switch the card off, search the words instead of the exact
phrase (like the website's search, with many more hits), drop the
restriction to the release's artist, and set how many closest titles to show.

**Event and place against the comment.** A **Recorded at event** cell is
marked ❌ when none of its events is named like the recording comment without
its event type: the comment `live, 1996‐04‐19: Saal 1, ICC Berlin, …` needs
the event `1996‐04‐19: Saal 1, ICC Berlin, …`. A **Recorded at place** cell is
marked ❌ when a place is not named like the venue, the first part of the
comment's location: here `Saal 1`, so the places `Internationales Congress
Centrum Berlin` and `Festhalle Frankfurt` (for `Festhalle, Frankfurt, …`) are
flagged. The tooltip shows both names. Both appear in the ❌ ERROR menu; the
tint can be switched off in ⚙️ Settings → ⚠️ Findings.

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
<summary>Event pages</summary>

An event page (`/event/<mbid>`) gains **Relationships for Event**. MusicBrainz
lists an event's relationships as short lists, one target per line; the button
turns them into tables you can filter and sort, **one table per kind of related
entity** — Artists, Places, Recordings, Releases, Series, URLs, … — each with
the columns that fit it:

- the related entity itself, as the same link MusicBrainz shows, with a **#**
  column that restores the original order;
- **Relationship** — the phrase it was listed under ("main performers",
  "held at", "recording location for", …);
- for performers, **Credits** — one row per credit ("lead vocals",
  "harmonica", …, instrument links kept) — and **Time** ("19:40 - 22:29");
  **Artist** for recordings and releases, **Area** for a place, **Details**
  for anything else on the line ("order: 150" for a series), and
  **Disambiguation** (without its parentheses) — each only when some row has
  one;
- for URLs, the **Site** and the link, with its **[info]** page.

Under "Related series", MusicBrainz also lists the relationships of the
series the event belongs to: its tour artists, its parent series, its links.
Those describe the tour, not the event, so they get their own **Via <series>**
table.

**The setlist as tables.** After the relationships come **Setlist: Line-up**
— every artist with how they are joined ("&", "with", "and") and a **Billing**
number that moves on at every joining word but "&" — and one table per part
of the setlist (**Setlist: Soundcheck**, **Setlist: Concert**, …; **Setlist:
Songs** when the setlist has no parts). A part's notes ("Scheduled: 19:30 |
Local Start Time 19:40 / End Time 22:29") sit under its heading. **Song** is a
multi-row column: a medley line ("Land of Hope and Dreams / People Get
Ready") stays one row with one list row per work. The artists of a "(with …)"
line ("This Land Is Your Land (with Trombone Shorty & the New Breed Brass Band
and all performers)") go into **Additional artists**, one row each, linked to
the artist. **Also in** names the other parts that play the same work;
**Recording** links the recording made at this event whose title is the song.
A song without a work link is kept as text.

**Event art without leaving the page.** Above the tables, an **Event art (N)**
section shows every Event Art Archive image of the event — posters, schedules,
banners, tickets, maps — with the same type chips, **Grid / By type** switch, ★
on the archive's main image, hover card and full-screen viewer as a release
page's Cover art section (see *Release tracklists*). Its layout is remembered
separately from the release page's. A plain click on the native **Event art
(N)** tab opens the viewer on a grid of every image instead of leaving the page;
Ctrl-click still opens the archive page. It costs one request per render (none
when cached, none when the tab says 0).

Every part is a setting, in ⚙️ Settings → 🎫 EVENT PAGE: the page as a whole,
*Relationships as tables*, *One table for all relationships* (off by default:
one table with a **Type** and a **From** column instead of one per kind),
*Include the related series' own relationships* (off: that section stays
as MusicBrainz shows it), *Setlist as tables*, *One table for the whole
setlist* (off by default: every song in **Setlist: All songs** with a **Part**
column), *Show an "Event art" section* and *The "Event art" tab opens the
viewer*. With both table parts off the button is not offered (the Event art
section comes with the button).

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

<details>
<summary>Link previews on MusicBrainz</summary>

With ⚙️ Settings → 🔎 LINK PREVIEWS ON MUSICBRAINZ → *Preview linked entities
on hover* switched on (it is, unless you switch it off), the links on the page
show what is behind them without opening a tab. On a **phone or tablet** that
box does nothing: there the previews are off until you tick *Preview linked
entities on touch devices*, because a tap on a link then opens the preview
window instead of the page. So far: **releases**, **release
groups**, **recordings**, **works**, **artists**, **labels**, **areas**,
**instruments**, **events**, **places**, **series**, **collections**, the
**[info]** link beside every URL, and the
codes: **ISRCs**, **ISWCs** and **disc IDs**, and **edits** and **editors**.
A **Barcode** cell has a card too: the barcode's format and the releases
carrying it. So does an entry of a column's **📊 dropdown** that names one
artist, label, area or other entity: rest the pointer on it. Pinning it with Space
closes the dropdown. A **catalog number** shows the card of the label its
release lists with that number (the window and Live page are the label's).

**Rest the pointer on a link**: a card opens beside it, and asks MusicBrainz
for its data (one request a second, shared with the Relationships column). If
you would rather move across a table without cards or requests, switch off
*Show every preview on a plain hover (without Ctrl)* under 🔎 EVERY PREVIEW:
the card then opens only when you hold **Ctrl** and rest the pointer on a
link, or rest it first and then press **Ctrl**. A release card shows the cover, status, type, format and
number of tracks, the date and country, label and catalog number, barcode,
packaging and the first tracks with their lengths. A release group card shows
the group's releases, as the release page's "versions available" link does. A
recording card shows its length, artist, ISRCs, first release date, the work
it performs and its earliest releases ("on 25+ releases" when there are more
than MusicBrainz lists at once). A work card shows its type, language, ISWC,
composer, lyricist and publishers. An artist card shows the type, area, life
span, birthplace, genres, rating, IPI and ISNI; a label card the type, label
code, area, years active and genres; an area card what it is part of and how
many parts it has; an instrument card its type, subtypes and other names; an
event card its date and time, place, what it is part of, line-up and first
songs; a place card
its address and coordinates; a series card its first items. An ISRC or ISWC
card lists the recordings or works carrying the code; a disc ID card its
tracks, length and releases; a collection card its type, size and editor
(MusicBrainz shows only public collections; a private one's card says so).
An **[info]** card (the link MusicBrainz writes after each URL of a
relationship list or a **URLs** table) shows the URL's site and address and
which entities link it, by relationship — *Setlistfm: Event: 2025‐05‐20: Co‐op
Live, …* — naming three per relationship; its window lists up to 100 per
relationship, then links MusicBrainz's own page for the URL.
An edit card shows the edit's type, status, vote tally, editor, dates and
first changes; its window every change, the entities it touches and its notes
(MusicBrainz shows the editor and the notes only when you are logged in). An
editor card shows the user type, member since and edit counts — nothing
personal. An open edit is read again on every page load, since its votes
change.
**Esc** or moving away closes it.

**Press Space** to pin it into a window:

- **Extracted**: for a release, the whole tracklist by medium (each track
  opens its recording), its release group, labels, release events, language,
  and the images in the Cover Art Archive; for a release group, every
  release in a sortable table beside the group's facts; for a recording, its
  credits (performers and their instruments, producers, engineers, where it
  was recorded and mixed — each studio with its city, state and country) and
  up to 25 of its releases with the real total;
  for a work, its writers, publishers and related works, its society codes,
  and its first 100 recordings with the total; for an artist, its area and
  birthplace named as MusicBrainz does (*Long Branch, New Jersey, United
  States*), every external link and how many release groups of each type; for
  a label, its area named the same way, the labels it owns, is owned by or is
  an imprint of, its links and its number of releases; for an area, its parts; for an instrument, the related
  instruments and every alias (its description is on the Live page); for an
  event, where it was held as MusicBrainz writes it (*OceanFirst Bank Center
  in West Long Branch, New Jersey, United States* — the window looks up the
  areas above the place, one per level, and remembers them for every other
  event there), what it is part of with its dates, its URLs by relationship
  (each with its **[info]** link), the whole setlist with every song linked to
  its work and every artist — the line-up, and the guests in a song's
  "(with …)" — linked to the artist, what was recorded there and its posters;
  for a place, its area named the same way, a map link, its links and up to
  100 of its events by date; for a
  series, every item in order. A part that could not be loaded says so, with
  **Try again**. Areas are named down from the city, as on MusicBrainz's
  own pages: the window looks up each area above, one per level, and
  remembers them for every other card; a card shows the whole line only once
  it is known. In every relationship list an instrument links its instrument
  page (*Chris Anderson (trumpet player) (trumpet)*); vocals and words such as
  *guest* stay text.
- **Live page**: the entity's own MusicBrainz page, without the site's header
  and footer, and without its scripts.
- **Click an image** (a release's front cover or its Cover art strip, an
  event's posters) to open it in the artwork viewer, the same one as the
  release page's Cover art, stepping through all of that release's or event's
  images. **Esc** returns to the window; Ctrl-click opens the image in a new
  tab instead.
- **A track named differently from its recording.** With jesus2099's
  *mb. INLINE STUFF* installed, a track whose name differs from its recording's
  carries a note with both names. The browser used to show that note in its
  own small box over the card. Now it is a box stacked just above the card,
  and once pinned, a maroon badge next to the window's title ("from track
  “…” ≠ recording “…”"). The window shows the recording, but always says which
  track it came from.
- **‹ ›** or **← →** step to the same kind of link in the **same column** of
  the next or previous row, on into the next sub-table. A row links a
  release, an artist and a label; the arrows stay with the one you started
  from.
- **⟳** asks MusicBrainz again; **↗** opens the page in a new tab.
- **Click a link inside the window** (a release in a release group's list, a
  release's release group, a label, a recording in a tracklist) to show that
  entity in the same window; the title shows the path, for example *Release
  group › Release*. **← Back**, **Backspace** or **Alt+←** return. Ctrl-click
  (or a middle click) still opens the link in a new tab.

Each card asks MusicBrainz once, and only if the pointer is still on the link
when its turn comes: the script makes at most one request a second, shared
with the Relationships column. What it got is kept in this browser for 24
hours (*Keep MusicBrainz answers for (hours)*); the card's foot says whether
it was *fetched now* or *saved today*. A card that could not load says so;
hover again to retry.

Not previewed: the artwork column's links, a link around a picture (they have
their own preview) and the Relationships column (its own tooltip). Links
outside a table are previewed while *Also preview links outside tables* is on
(same section, on by default): the header, an annotation, the sidebar and
relationship lists have cards then, but not the tabs, the page navigation or
the script's own toolbar. Switch it off and only the links in a table have
cards. On a **touch screen**, with *Preview linked entities on touch devices*
ticked, a tap on such a link opens the window instead of the page; **↗** in
the window opens the page. Links outside a table count there only with *Also
preview links outside tables on touch devices* ticked as well.

</details>

<details>
<summary>Previews of links to other sites</summary>

With ⚙️ Settings → 🔎 EXTERNAL LINK PREVIEWS → *Preview external links on
hover* switched on (it is, unless you switch it off; on a phone or tablet
*Preview external links on touch devices* decides instead, off until you tick
it), a link to **another site** shows
what is behind it: the Wikipedia article in an annotation, the review in an
event's **URLs** table, a site in the sidebar's *External links*. It works on
the links in a table, in a relationship list, in the annotation and in the
sidebar's external links; with *Also preview links outside tables* (🔎 LINK
PREVIEWS ON MUSICBRAINZ) on every other link of the page too. It is
independent of *Preview linked entities on hover*: you can have either, or
both.

**Rest the pointer on the link** (or, with *Show every preview on a plain
hover* off, hold Ctrl as you do, or press Ctrl once it rests there), as for the
MusicBrainz cards. The card shows the page's title, the
site's name, its picture and description, and what the link is on this page
— *MusicBrainz: setlist.fm of this event* when it comes from a relationship,
*in the annotation*, *in the sidebar's external links*. Its first line shows
the site — with its **icon** (*Show the sites' icons*, on by default: asked
once per site and kept for a month, without your cookies and only from the
site itself; off, or before the icon arrives, a letter stands for the site) —
and the link's **status**:

- **200** — the page is there. When the site only switched from `http` to
  `https` on the same address, a quiet *→ https* line says so; that is no move;
- **moved** — the link ends at another site or another page, shown below it
  (the relationship may want updating). Parameters a site adds on the way
  (YouTube's cookie-consent detour, for instance) do not count;
- **404 Not found** / **410 Gone** — the page is gone;
- **checked by Cloudflare** / **checked by AWS WAF** — the site answers
  scripts with a browser check (Cloudflare's "Just a moment…", AWS's "Human
  Verification"). That is **not** a broken link: ↗ opens it normally;
- **not a page** — a PDF, an image or another file, named from what the site
  says about it, without downloading it.

**Press Space** to pin it into a window: the page's details (type, language,
publication date, its own address, what kind of file it is), the link and its
status, and **Live page**: the page itself, without its scripts. **‹ ›** or
**← →** step down the same column (the URL column of a URLs table), or through
the other external links of the same list or annotation. **⟳** asks the site
again; **↗** opens the page.

On MusicBrainz the window also says **what MusicBrainz knows of this URL**:
which entities link it, by relationship, with a link to MusicBrainz's page for
the URL — or *Not in MusicBrainz*, which on an annotation link means no
relationship carries it yet. That is one request to MusicBrainz, made by the
window only, never by a hover, and through the same one-a-second turn as the
MusicBrainz cards. It is shown whatever the site answered, so a dead link's
window still says which entities point at it.

**YouTube** links (a video, a playlist, a short) get a card from YouTube's own
short description service instead of the page: the title, the channel and the
thumbnail, at once and without Tampermonkey asking first. A video or playlist
that is gone or private says so. Their window has no *Live page*: a YouTube
page shows nothing without its scripts, so ↗ is the way to watch it. A link to
a YouTube channel gets the ordinary card.

Three more sites are read through their own services instead of the page, at
once and without Tampermonkey asking first:

- **Wikipedia** articles (any language): the article's opening paragraph, its
  short description and picture, and whether it is a *disambiguation page*
  or a link that Wikipedia redirects; the window links its Wikidata item, and
  its *Live page* shows the article without Wikipedia's header and menus. A
  title Wikipedia does not have shows as *404 Not found*.
- **Wikidata** items: the item's name, description and other names, in your
  browser's language and in English, and its Wikipedia articles. An item that
  does not exist says so.
- **Discogs** releases, masters, artists and labels: for a release the
  artist, year, country, format, label and catalogue number, genres and number
  of tracks, with the cover; for an artist or a label its profile, real name,
  members or sublabels. No *Live page* (↗ opens Discogs). Discogs allows a
  card every 2.5 seconds; with your own **Discogs personal access token**
  (⚙️ Settings → 🔎 EXTERNAL LINK PREVIEWS → *Discogs personal access token*;
  on discogs.com: Settings → Developers → *Generate new token*) it allows one
  a second. The token is sent only to Discogs, shows as dots in the settings,
  is never written into a saved configuration file, and loading one leaves
  your token as it is.

Links to the four **Springsteen sites** the script supports get the same card
those sites' own lists show (no setting of those sites is needed here): a
springsteenlyrics.com bootleg, collection item or song, a jungleland.it
artwork page, a brucespringsteen.it record, a Brucebase song — with its
tracklist, fields, scans and notes, and its *Live page* trimmed as on the
site. They load on a hover from the first time, without Tampermonkey asking.
A **Brucebase date** link (the "reviews:" link of many events,
`brucebase.wikidot.com/2025#261025`) shows that one show of the year page:
venue and date, the setlist, the people, the notes, and a link to the gig
page; its *Live page* is the year page, scrolled to the show and marked. One
request reads the whole year, so other dates of that year then cost nothing —
but Brucebase is slow, and that first request can take several seconds. A
date the year page has no show for, or a show that did not take place, says
so.

**On the Springsteen sites themselves** (springsteenlyrics.com, Brucebase,
jungleland.it, brucespringsteen.it, each with its own support switched on),
the same setting previews their links to other sites: in a list's table, in
springsteenlyrics.com's page text and in Brucebase's wiki text — a Brucebase
link on springsteenlyrics.com gets Brucebase's own card. The sites' share
buttons, menus and footers do not, and neither do their links to their own
pages (those keep the site's own detail-page preview). There is nothing
from MusicBrainz in these cards: no "MusicBrainz knows this URL".

**What it sends.** A card asks the linked site for the page, once, and only if
the pointer is still on the link when its turn comes (one request a second per
site). The request carries **none of your cookies**, so the card shows the
page everyone sees (logged in somewhere, you would see more there). The site
learns that someone looked at the page, as with any visit. Pictures in the card
and the Live page load from the site as on any web page.

**The first time a site is asked, Tampermonkey asks you** whether the script may
contact it. So that this never pops up while you just move the mouse, a site
the script has never contacted is **loaded only when you press Space** (or tap
the link on a touch screen): its card says *not contacted yet* until then.
Once a site has answered, its links load on hover like any other.

What it got is kept in this browser for a week (*Keep external answers for
(hours)*); the card's foot says *fetched now* or *saved 3 days ago*. A dead
link, a browser check or a file is remembered only until you reload the page.
A card that could not reach the site says why — hover again to retry. If you
told Tampermonkey not to let the script contact a site, the window says so;
change it in Tampermonkey's settings for this script.

Not previewed: links to MusicBrainz itself and the other MetaBrainz sites, the
artwork archives, links around a picture, share buttons, and the
Relationships column.

</details>

<details>
<summary>springsteenlyrics.com collection, bootleg and lyrics lists</summary>

Not a MusicBrainz page at all, and **off until you switch it on**: ⚙️ Settings →
*🎸 springsteenlyrics.com* → *Enable on springsteenlyrics.com collection and
bootleg lists*. Settings are shared, so you can switch it on from a MusicBrainz
page or from the Tampermonkey menu on springsteenlyrics.com itself. While it is
off, the script leaves that site's pages untouched.

Once on, every **collection list** (`collection.php?cmd=list…`, any
category), the collection's **entry page** (`collection.php`, "Latest
additions"), every **bootleg list** (`bootlegs.php?cmd=list…`) and the **CD
and vinyl bootleg list** (`brucelegs.php?cmd=list…`) — with any format,
country, date, title, letter, label or other filter you picked on the site —
gets a heading with the usual toolbar and one action button: **Items** on a
collection list or the entry page, **Bootlegs** on either bootleg list. Pressing it
fetches every page of that list (100 items each), turns the item cards into
one table, and gives you the usual filters, sorting, column controls, export
and Save/Load.

The entry page holds the whole collection (over 5000 items in more than 50
pages), so the usual "many pages" and "many rows" questions come up before it
loads everything.

When the table is wider than the window, **Title** stays in view as the
sticky column, and — with *Enable Sticky Page Headers* (📌 Table stickiness,
on by default) — everything above the table stays where it is while you
scroll sideways: the site's header and breadcrumb, the toolbar, the category
and filter buttons and the list's heading bar.

**A compact category and filter bar** (off by default): ⚙️ Settings → *🎸
springsteenlyrics.com* → *Compact category and filter bar on
springsteenlyrics.com lists*. On a collection list the site's rows of
category, format, country, album, year and copies buttons become one row of
pull-down menus above the list: *Category: Official Albums ▾*, *Format: Any
▾*, and so on. On a bootleg list the category buttons become a *Category* menu,
and the four search forms become one search box (see below).

The bar also works on the **bootleg main page** (`bootlegs.php`), which lists
no items itself. There it offers *Category: Choose a list ▾*, with the era
timeline, plus the search box and *Recent*. The page has nothing to load, so
it gets no action button, and the toolbar keeps only ⚙️ and ❓. With the bar
switched off, the script leaves that page alone.

- Each menu offers exactly what that page's own buttons offer, and the current
  choice has a ✓. The Category menu is grouped (Audio, Video and Print &
  memorabilia for the collection; Live shows, Other audio and Video for the
  bootlegs).
- The Category menu shows each category's **exact number of items** once you
  have opened that list with the bar on. It is read from the list's own
  "Showing items … of N" line and kept from then on. A category you have not
  opened yet shows no number; nothing is estimated.
- On a bootleg list the Category menu starts with a **timeline of the
  live-show eras** from 1967 on. Each bar spans its era's years, and its height
  shows how many recordings there are per year. An era you have not opened yet
  is drawn dashed with a "?". The current era is outlined, and clicking a bar
  opens that era.
- Long menus (Category, Country, Album) have a search box: type part of a
  name, then Enter to go to the first match. The arrow keys move through the
  list, and Escape closes it.
- **Filters combine.** Choosing a country keeps the format you already chose,
  and choosing another format replaces it. Every choice starts again at the
  first page of the list. Changing the category keeps your filters, except the
  album, which only belongs to *Official Albums*.
- *Year* offers a from/to pair of years instead of the site's slider; press
  *Apply*.
- Each filter in use is shown as a chip after the menus. Its **×** removes just
  that filter; *Clear all* removes them all.

**The bootleg search box** stands in for the site's four forms (date, title,
version, public info). The site searches one of them at a time, so the box
does too. Pick the field with *Auto · Date · Title · Version · Public info*,
type, and press Enter or *Search*.

- *Auto* searches the date when what you typed is one, and titles otherwise.
- Dates can be typed as `1975-08-15`, `15 Aug 1975`, `15 August 1975`,
  `Aug 15, 1975` or `15.08.1975`. Slash dates such as `08/09/1975` are not read
  as dates, because they mean different days in the US and in Europe.
- A day that does not exist (`1975-02-30`) is pointed out, and *Search* stays
  off.
- The site finds **full dates only**: a month or a year (`1975-08`, `Aug 1975`,
  `1975`) finds nothing there. The box says so and offers the era list that
  covers it, where you can filter the *First date* column once the table is
  loaded, or a title search for what you typed instead.
- On a search's result page the box shows that search, so you can refine it.
- *Recent* lists your last eight searches, newest first, wherever you started
  them, including the site's own forms. *Forget these searches* empties it.

**The Format menu is also the formats guide.** Its entries are grouped into
Audio, Video and Print, and each has a second line with the guide's
abbreviation and meaning, e.g. *Cassette tape*, then *MC · Music Cassette
tape*. The search box matches those lines too, so typing `mc` finds the
cassette. Formats the site's own guide leaves out (Flexi-disc, NT Cassette,
Betamax, Betacam SP, U-matic, Blu-ray-R, Print) are explained as well, marked
*(not in the site's guide)*. The site's "Formats guide" panel is hidden along
with the format buttons.

**Once the table is loaded**, *Country*, *Year*, *Copies* and *Format* filter
the **loaded table** instead of reloading the page. They work like that
column's 📊 pick: the table narrows at once, and the chip is marked 📊. The
chip's **×** (or the column's own ✕) removes just that filter, and with only
table filters active, *Clear all* clears them in place.

- *Format* files an item under its **first** medium, as the site does:
  "CD + 2xDVD" counts as a CD, and "VHS + CD" as a VHS.
- *Album* and *Category* still open another list. Each menu says at the top
  which kind it is.
- A filter that the list was fetched with (for example *Country: USA* in the
  address) can only be changed by reloading, because the table holds nothing
  else.

The site's own buttons and forms are only hidden, so switching the setting off
brings them back. A choice that opens another list is an ordinary link:
middle-click opens it in a new tab, and with a table loaded you are asked
first, as usual.

The columns come from what each card shows — no item page is opened:

- **Collection:** Cover, Title, Version, Label, Cat. no., Format, Country,
  Release date, Original year, Copies. The site's *Label (Cat #)* and *Release
  date (Original year)* are split in two. *Copies* is 1 unless the card says
  "I have N copies". Hovering a *Format* cell explains each medium in it from
  the formats guide (e.g. "4xCD + 2xBlu-ray": CD ×4 and Blu-ray ×2), and names
  the format the site files the item under, which is its first medium.
- **Bootlegs:** Cover, Title, Label, Date, First date, Show, Location, Format,
  Duration, Lossy, Artwork, Info file, then DD, MM, YYYY, Day, Month and Place,
  Locality, Region, Country. *Date* is the site's own text ("16-17 Sep 1967",
  "16 Sep 1967, 30 Sep 1967", …); *First date* is the first of those dates as
  `1967-09-16`, so sorting it is chronological. *Show* holds the note in
  brackets after a date ("early show", "soundcheck"). *Duration* sorts as a
  time, and an unknown one (the site's "–") shows as `?:??` and stays last.
  *Lossy*, *Artwork* and *Info file* read "yes" when the card carries that note.
  - **DD … Month** split *First date* into day, month, year, weekday and
    month name: the same columns MusicBrainz event pages get. A list with a
    year only fills YYYY alone.
  - **Place … Country** split *Location* the way MusicBrainz event pages
    split theirs: "Paramount Theatre, Asbury Park, NJ" gives Paramount
    Theatre / Asbury Park / NJ / United States. The site writes no country
    after a US state or Canadian province, so it is filled in, and "USA" is
    written as United States, so one country has one value to filter on.
    Region holds a state or province only. A bootleg of several shows gets
    one line per show in each of the four columns, in the same order.
- **CD and vinyl bootlegs:** Cover, Title, Version, Label, Cat. no., Date,
  First date, Show, Location, Format, then the same DD … Month and Place …
  Country columns as the bootleg lists. *Version* is the pressing ("Limited
  Edition #200 copies numbered - Picture Disc"). The site's year spans
  ("1981 / 1984") start *First date* at their first year. A location that
  is only a description ("Various Location", "Studio / Live") stays whole in
  *Place* and leaves the other three empty. A note such as "(Early Show)" at
  the end of the location goes to *Show*. Every card says "PDF available"
  and "artwork available", so those notes get no column.

**The lyrics index** (`lyrics.php`, or any of its "Lyrics starting with"
pages) gets one button, **Lyrics**. The site lists its songs one first letter
per page. Pressing it fetches every letter, whichever page you start on, and
turns the over 3,500 song lines into one table:

- **Title** links to the song's lyrics page. **Lyrics** is ✓ when that page
  has lyrics, and ✗ when the site's plain icon says it has none.
- **Version** is the site's text in brackets, as written ("Live 30 Sep 1987
  version", "Original Roy Orbison version"). It is also read into:
  - **Type:** Live, Soundcheck, Original, Cover, Album, Other artist album,
    Official studio, Unofficial studio, Studio, Demo, Rehearsal, Outtake,
    Handwritten, Draft, Version or Other, and empty when there is no bracket.
    Filter or pick one from its 📊 list, e.g. only the Live versions.
  - **Artist:** the other artist, for "Original Roy Orbison version" or
    "Patti Scialfa's album version".
  - **Date:** any date in the text, as `1987-09-30`. A month or a year alone
    stays as `1987-09` or `1987`.
  - **Show:** the note in brackets of a live version, such as "early show".
  - **No.:** the number of "version 2", "#3" or "take #1".
- **Letter** is the first-letter page the song came from.
- **DD, MM, YYYY, Day, Month** split *Date*, the same as on the bootleg
  lists.

While loading, the progress line names the letter it is on ("Loading H (9
of 32)"). If one letter fails to load, "↻ Load remaining pages" carries on
from that letter.

Cover and Title link to the item's own page on springsteenlyrics.com;
following one asks first, as leaving any consolidated table does. To see
what that page adds without leaving the table, switch on the preview: see
*Previewing the detail pages* under [Page-specific behaviour](#page-specific-behaviour).

</details>

<details>
<summary>jungleland.it bootleg artwork list</summary>

Not a MusicBrainz page either, and **off until you switch it on**: ⚙️ Settings
→ *🌴 jungleland.it* → *Enable on the jungleland.it bootleg artwork list*.
Settings are shared, so you can switch it on from a MusicBrainz page or from
the Tampermonkey menu on jungleland.it itself. While it is off, the script
leaves that site's pages untouched.

It works on the list page **opened in its own tab**:
`https://www.jungleland.it/html/list.htm`. On the site's usual two-frame view
(`artwork.htm`), the list is the narrow left frame, and the script leaves it
as it is. To use the script, open the list address above on its own.

Once on, the page gets a heading with the usual toolbar and one action
button, **Bootlegs**. Pressing it turns the whole list into one table with
these columns:

- **Title:** the bootleg's title, without the date the site appends to it.
  It links to that bootleg's artwork page, which opens in a new tab.
- **Date:** that date as `1975-08-15`, so sorting it is chronological. It is
  empty for the undated entries the site files under "Others".
- **Year:** the date's year. Filter or pick from its 📊 list to see one year,
  which is the job the site's "Choose the year" menu did. That menu is hidden
  once the table is there.
- **Version:** which issue of that show the entry is: 1 for the first, 2
  for the site's "(Version 2)", and so on. It is read from the entry's
  link, so it is right even where the site has cut a long title off before
  its "(Version N)". Sort by it, or pick *1* from its 📊 list to see one
  entry per show.
- **DD, MM, YYYY, Day, Month:** the Date split into its parts, the same
  columns MusicBrainz event pages get, with the weekday and the month's
  name. Use them to find, say, every show on a Saturday, or every August
  show across the years. They are empty where Date is empty. On dated rows
  YYYY repeats Year; Year alone also carries the year heading of an entry
  the site files there without a date.

The list holds over 6,000 bootlegs, more than the default *Large Dataset
Threshold* (5000 rows), so the "many rows" question comes up before the table
is shown.
Everything is on that one page; nothing is fetched, unless you switch on the
preview of the artwork pages (see
*Previewing the detail pages* under [Page-specific behaviour](#page-specific-behaviour)).

</details>

<details>
<summary>brucespringsteen.it record database</summary>

Not a MusicBrainz page either, and **off until you switch it on**: ⚙️ Settings
→ *💿 brucespringsteen.it* → *Enable on the brucespringsteen.it record
database*. Settings are shared, so you can switch it on from a MusicBrainz
page or from the Tampermonkey menu on brucespringsteen.it itself. While it is
off, the script leaves that site's pages untouched.

It works on the record list **opened in its own tab**. On the site's usual
two-frame view (`Blegsdx.htm`), the list is the narrow left frame, and the
script leaves it as it is. To use the script, open one of these addresses on
its own. They are the two lists with every format ticked:

- Unofficial:
  `https://www.brucespringsteen.it/DB/records.aspx?tipe=-1,0,1,2,3,4,5,6,7,8,9,10,11&sort=0&addon=0`
- Official:
  `https://www.brucespringsteen.it/DB/records.aspx?tipe=-2,0,1,2,3,4,5,6,7,8,9,10,11&sort=0&addon=0`

Any other `records.aspx` list works too. The page gets a heading with the
usual toolbar and two buttons, **Unofficial** and **Official**, and every
format box of the site's own filter is ticked. Each button loads **every**
record of its kind, all formats, whatever the page itself was showing, and
turns them into one table:

- **Unofficial:** Title, Matrix, Format, Label, Code, Notes.
- **Official:** Title, Catalogue, Format, Country, Promo, Code, Notes.
  *Promo* reads "yes" for a promo.

*Format* is the site's own text ("2 CD-R", "1 7 in."). *Notes* is the italic
line some records carry ("Picture disc", "Lower 'Bruce Springsteen' - Little
Steven Mix"). The title links to the record's detail page, which opens in a
new tab. With the preview on, resting the pointer on a title shows the
record's tracklist and the shows its tracks come from (see
*Previewing the detail pages* under [Page-specific behaviour](#page-specific-behaviour)).

To switch from one kind to the other, press the other button. The page
reloads first, as it does whenever a second list is loaded, so press it once
more after the reload.

</details>

<details>
<summary>Brucebase song list</summary>

Not a MusicBrainz page either, and **off until you switch it on**: ⚙️ Settings
→ *📚 Brucebase* → *Enable on the Brucebase song list*. Settings are shared,
so you can switch it on from a MusicBrainz page or from the Tampermonkey menu
on Brucebase itself. While it is off, the script leaves the wiki's pages
untouched.

It works on the wiki's list of every song Bruce Springsteen is known to have
performed live or released: `https://brucebase.wikidot.com/stats:songs`. The
page gets a heading with the usual toolbar and one action button, **Songs**.
Pressing it turns the site's 28 letter tabs into one table with these
columns:

- **Title:** the song's title, as the wiki writes it. It links to that song's
  page.
- **Letter:** the tab the song is listed under: *0-9* or *A* to *Z*. Filter
  or pick from its 📊 list to see one letter, which is the job the tabs did.

Each song is one row. The wiki's *Alt.* tab lists the songs whose title starts
with a subtitle, such as "(I Can't Get No) Satisfaction", a second time; they
are not repeated, and keep the letter of their main title (*S*). The tabs are
replaced by the table; the second set of tabs further down (News, Media,
Released) stays as it was. Everything is on that one page; nothing is
fetched, unless you switch on the preview of the song pages (see
*Previewing the detail pages* under [Page-specific behaviour](#page-specific-behaviour)).

</details>

<details>
<summary>Brucebase year pages</summary>

Brucebase lists everything Bruce Springsteen did in a year (shows, studio
sessions, rehearsals, interviews, cancelled dates) on one page per year:
`https://brucebase.wikidot.com/1975`, …, `/2026`, and `/1949-64` for the years
before. These pages have a switch of their own, **off until you switch it
on**: ⚙️ Settings → *📚 Brucebase* → *Enable on the Brucebase year pages
(event lists)*. It needs *Enable on the Brucebase song list* on as well. While
either is off, the script leaves the year pages untouched.

The page gets a heading with the usual toolbar and one action button,
**Events**. Pressing it turns the year's entries into one table, one row per
entry, with these columns:

- **Date:** the entry's date, the first column, which stays in view when
  you scroll the table sideways. A day or month the wiki writes as `00` (not
  known) is left out, so `1954-10-00` reads `1954-10`. **DD**, **MM**,
  **YYYY**, **Day** and **Month** (at the end of the table) split it up as
  on MusicBrainz pages; Day stays empty when the day is not known.
- **Type:** *Gig*, *No gig* (cancelled or postponed), *Recording*,
  *Rehearsal*, *Interview* or *No Bruce*, from the kind of page the entry
  links to.
- **Venue:** the venue as written, linked to the entry's own page. A second
  part such as "SUMMER STAGE" stays with it.
- **City**, **State** and **Country:** a US state or Canadian province code
  goes in State, with USA or CANADA as the country. Elsewhere the country is
  written out, and State holds the region where the wiki gives one ("NEW SOUTH
  WALES").
- **Tour:** the tour, tour leg or band era the entry belongs to, taken from
  the wiki's "Start of …" / "Continuation of …" / "End of …" boxes. Entries
  outside any box, such as those before a year's first box, are empty.
- **Soundcheck:** the soundcheck, one song per row.
- **Setlist:** the set, one song per row, as written: bold for a tour
  premiere, "(with …)" for guests, " - " joining a medley. A recording
  session's setlist is the songs recorded. A set with its own label in the
  wiki ("Pre-show:", "With Bruce:", "with Willie Nile:") stays in this column,
  its first row tagged with that label.
- **Set note:** the wiki's note on the set: "No set details known.",
  "Incomplete setlist.", "Set details may be inaccurate.", and so on.
- **Notes:** the entry's description, paragraphs and links intact. With the
  song preview switched on, a song mentioned there opens its card like a
  title on the song list.
- **Media:** the wiki's own icons for what the entry's page has: Photo,
  Ticket, Setlist, Storyteller, News, Memorabilia, Eyewitness, Video, Audio,
  Bootleg, LiveDL, Retail, Featured. Rest the pointer on an icon for its name.
  Type a name in the column filter (e.g. "Bootleg"), or pick one from the 📊
  list, to see the entries that have it.
- **Info wanted:** *yes* where Brucebase asks for more information about the
  date (its "Help Us" icon).

The table replaces the entries and the tour boxes. The icon legend above and
the Previous / Listing / Next line below stay. Everything is on the page;
nothing is fetched.

**The side bar:** on every Brucebase page the script handles, the wiki's
side bar (Site Navigation, Gig Pages, …) stays in view while you scroll: at
the top of the window when you scroll down, and at the window's edge when
you scroll a wide table sideways. ⚙️ Settings → *📚 Brucebase* →
*Show the Brucebase side bar on the right* moves it to the right, as on
MusicBrainz. *Collabsable sidebar* in the same section (off by default, and
separate from the MusicBrainz setting of that name) gives it the same handle
as the MusicBrainz sidebar: click it (or focus it and press Enter) to show
or hide the side bar. It then starts hidden while the MusicBrainz setting
*Start with sidebar collapsed* is on, and collapses toward its own side.
When you scroll a table sideways, its Date column stays in view, lined up
under the table's heading bar, just right of the side bar.

The status line ("Loaded 1 page …") sits right under the heading with the
buttons, above the wiki's thin rule and the breadcrumbs.

**Every year at once:** on the wiki's start page,
`https://brucebase.wikidot.com`, the same switch adds a **Show all events of
all years** button after the "Brucebase — Home" heading. It reads every year
page linked under *Gig Pages* in the side bar (1949-64, 1965, …, this year),
one after the other, into one table with the columns above, at the top of
the start page. That is over sixty pages and about 5,000 rows, so it takes a
few minutes, and the script asks twice: first because the page count is
above *Max Page Warning* (50), then, when everything is in, how to show that
many rows (*Large Dataset Threshold*, 5000).

</details>

<details>
<summary>Previewing the detail pages</summary>

Each row of these tables links to a page with more detail: a bootleg's
tracklist and scans or a song's lyrics on springsteenlyrics.com, an artwork
page's scans on jungleland.it, a record's tracklist on brucespringsteen.it, a
song's history on Brucebase. The preview shows that detail without leaving
the table.

It is **off until you switch it on**, for each site separately, right under
that site's own switch in ⚙️ Settings:

| Site                   | Setting                                                  | The card shows                                                                 |
|------------------------|----------------------------------------------------------|--------------------------------------------------------------------------------|
| 🎸 springsteenlyrics.com | *Preview item and song pages on springsteenlyrics.com lists* | the tracklist by disc, the notes (lineage, edition), the artwork scans; on the lyrics index, the version, the first lines of the lyrics and the song's info |
| 🌴 jungleland.it        | *Preview artwork pages on the jungleland.it list*        | the uploader and the scans (front, back, discs, booklet)                       |
| 💿 brucespringsteen.it  | *Preview record pages in the brucespringsteen.it database* | the tracklist, the show each track comes from, the notes, the photo           |
| 📚 Brucebase           | *Preview song pages on the Brucebase song list*          | the album it comes from, how often and when last it was played live, releases |

**Rest the pointer on a title** for a moment and a card opens beside it. If
you would rather move the pointer across the table without opening cards or
reading pages, switch off *Show every preview on a plain hover (without
Ctrl)* under ⚙️ Settings → *🔎 EVERY PREVIEW* (it covers the MusicBrainz link
previews too): then **hold Ctrl and rest the pointer on a title**, or rest the
pointer on the title first and then press **Ctrl**, and the card opens at
once.
The first time, it shows "Loading the detail page…" while the page is read in
the background. The script reads at most one page a second, and a page you
have already seen comes back at once: it is kept for 30 days. The card's last
line says whether the page was fetched now or saved earlier. Moving the
pointer away closes the card, and so does **Esc**.

**Press Space** while the card is open to pin it into a window. A Space you
type into the filter box stays in the filter box. In the window:

- **‹ ›** or the **← →** keys step to the previous or next row of the table,
  in the order the table shows them.
- **Extracted** shows what the script read from the page, laid out for
  reading: the fields, the scans, the notes and the whole tracklist. Click
  the cover or a scan to open it in the artwork viewer (the same one as the
  release page's Cover art: zoom, ← → through every image of the page, grid,
  download; **Esc** returns to the window). Ctrl-click opens the image in a
  new tab instead. On Brucebase it also has the credits, the studio
  versions and the lyrics, and lists the releases one per line, the live
  releases apart; on the springsteenlyrics.com lyrics index, the
  whole lyrics and every section of the song's page (info, recording,
  releases, live history, covers, credits, the other versions).
- **Live page** shows the site's own page inside the window. *Hide the site's
  navigation* removes the site's menus, header and footer so only the content
  is left. The page's own scripts do not run there: on Brucebase every tab is
  shown, one under the other, and an embedded video is a "▶ Watch on YouTube"
  link instead of a player. A page you have just hovered opens without being
  read again.
- **⟳** reads the page again instead of using the saved copy.
- **↗** opens the page in a new tab.

Drag the window by its title bar and resize it from its lower right corner;
it reopens where you left it. **Esc**, **✕** or a click outside closes it.

On a **touch screen**, there is no pointer to rest, so tapping a title opens
the window directly. Use **↗** to go to the page itself.

</details>

---

## On a phone or tablet

The script runs in any mobile browser that runs Tampermonkey (Firefox for
Android, for example), with or without that browser's *Desktop site* mode.
MusicBrainz itself has no mobile layout, so either way you get the desktop
page, zoomed out to fit the table, and you pinch to zoom in. A few things
behave differently from a desktop, on purpose:

- **Hover tooltips do not open on a tap.** A tap would open them but nothing
  could close them again, so they would stay over the page. That covers the
  rich tooltip on the action buttons, the artwork preview and its type tooltip,
  the Relationships tooltips and every "Liner notes" hover card. The buttons
  themselves work as usual.
- **The keyboard appears only when you tap a filter.** On a desktop the
  global filter is focused after the table renders, so you can type right
  away; a filter's ✕ puts the cursor back into it; and a column's 📊 dropdown
  opens with the cursor in its quick filter. On a phone each of these would
  raise the keyboard over the page, so none of them happens there.
- **Sticky Page Headers is off.** Pinch-zoom moves what you see independently
  of what the browser pins, so the bars cannot reliably stay in view. To try it
  anyway, tick *Sticky Page Headers on touch devices* in 📌 Table stickiness.
- **A tap on a title opens the detail preview's window** on the sites where
  you switched the preview on (*Previewing the detail pages* under
  [Page-specific behaviour](#page-specific-behaviour)), instead of the page
  itself; the window's ↗ opens the page. The same goes for a link in a
  MusicBrainz table when *Preview linked entities on hover* is on (*Link
  previews on MusicBrainz* under [Page-specific behaviour](#page-specific-behaviour)),
  and for a link to another site when *Preview external links on hover* is on
  (*Previews of links to other sites*, same place).

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
