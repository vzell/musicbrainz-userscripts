Hi majkinetor,

I dug into this together with the rest of String Theory's interplay with my script,
[ShowAllEntityData](https://github.com/vzell/mb-userscripts) (SAED). I think the race in this issue
now has a clear cause and a small fix, and there are a few related points. All of them are small, and
all are opt-in through attributes SAED would set, so nothing changes for anyone who doesn't run SAED.

Measured with String Theory **2026.11.06.130902** (from the `main` "latest" link, commit `1df6193`;
Event Horizon and ISRC Scout 2026.11.06.170000) in a browser harness on real musicbrainz.org pages.

## The race in this issue

- `showTrackData()` removes **every** `.ii-col` in the document and refills.
- The `MutationObserver` that runs `fillTrackData()` adds bare cells to any table that has a row whose
  `id` is a track MBID. That includes SAED's re-rendered copy of the tracklist: it keeps `tr.subh` and the
  row ids.
- It also bumps `thead th[colspan]` there.

So whichever finishes last wins. When SAED renders first, ISRC Scout later wipes SAED's cells and adds
plain ones without SAED's sort and filter controls. To answer the question at the end of the issue: no
real API is needed, one marker is enough (point 1).

## Requests

1. **Regions rendered by other scripts** (fixes this issue). SAED would put `data-mbu-foreign="saed"` on
   its rendered section and tables. Could ISRC Scout's `fillTrackData()` / `showTrackData()` skip tables
   inside such an element, and could `mbuTip` skip `[data-tip]` inside it? SAED already copies your ISRC
   and Links cells from the native rows.
2. **ISRC Scout link icons.** Since 2026.11.06 the platform name exists only in the `data-tip` text (no
   `title` any more). Could each `a.ii-trk-ln` also carry `data-ii-platform` (and `data-ii-ended`)? SAED
   filters and sorts by platform, and would then no longer depend on the tip format. Until then I parse
   both `title` and `data-tip`.
3. **Keys.** Event Horizon's bare-letter commands also fire on SAED's page: `h` jumps to `/edits` and the
   rendered table is gone. SAED can call `preventDefault()`, which EH already honours, and I'll do that
   either way. An `<html data-mbu-keys-off>` mark that EH honours would be clearer for any other app too.
4. **Corner.** While SAED's table is shown, SAED would set `<html data-mbu-quiet>`. Could `mbuDock` /
   `mbRestackCorner` hide the launchers and the dock then, as Mission Control does for itself? On a
   release page there are eight launchers over the table.
5. **A way back.** While EH shows (the default after install), SAED's buttons exist but sit in
   MusicBrainz's hidden body. SAED would set `<html data-saed="VERSION" data-saed-page="TYPE">` where it
   supports a page. Would an "Open in SAED" action in EH's header be welcome? It would do what V does.
   Until then SAED adds its own `[data-mb-corner]` launcher.
6. **Request gate.** SAED isn't in `mbu:mb-gate` yet, and it shows. With SAED fetching an artist's 31
   pages next to EH, the only 503s were on **EH's** gated `release-group?query=arid:…` search (three,
   retried); SAED's requests never got one. SAED takes the budget and your scripts back off. I'd like
   SAED to book its ws/2 there. Can we treat the format in `dev/net/mb-gate.mjs` as a stable protocol
   (a version field, a heads-up before changes)?
7. **For #926.** SAED is on the wiki list. It is a viewer and analysis tool (see the appendix), so
   "Complementary" on your report's scale would fit.

The attribute names are only suggestions; whatever you prefer is fine, and I'll follow it.

## What I fix on my side anyway

- SAED's tooltips and panels die when SAED starts while EH shows and EH is then switched off. That one is
  mine: they were appended to `document.body`, which is EH's body at that moment.
- `preventDefault()` for EH's bare keys while SAED's table is shown. Ctrl+L, which is SAED's "load from
  disk", is also your "forward".
- Reading the ISRC Scout platform from `data-tip`, and the `is:counts-changed` event as a hook.
- Pacing SAED's ws/2 through your gate once the format is settled.

<details>
<summary><b>Appendix A — Event Horizon's data views and SAED, compared</b></summary>

<br>

They overlap less than it looks. EH is a redesigned **viewer**: fast, good-looking, navigating without
reloads. SAED is an **analysis** tool: it keeps MusicBrainz's own layout and puts *all* the data of a
paginated list into one table to slice. I use both.

| | Event Horizon | SAED |
|---|---|---|
| Purpose | A modern MusicBrainz viewer for everyday browsing | Power-user analysis: see and check *all* the data of a list in one place |
| Layout | Its own body (`#app`), cards and sections, grid or table | MusicBrainz's native page, re-rendered as tables in place |
| Pages covered | Home and all 12 entity types; many subpages; search, tag, user, edits | ~150 page types: almost every MusicBrainz list (artist/label/RG releases, recordings, works, events, relationships, tags, collections, edits, …) plus Discogs, setlist.fm, archive.org and four Springsteen sites |
| Getting the data | ws/2 browses, 100 rows at a time, "Load more" / auto infinite scroll | Fetches **every** page of a paginated list (with resume after a failed page, thresholds for huge lists, save and load to disk) |
| Navigation | `pushState` inside its own view, no reloads; kept answers in IndexedDB, rechecked in the background | One page; a re-render on demand |
| Filtering | One box per table with a real query language: `column:value`, `-term`, `OR`, brackets, year ranges; named saved filters | A filter per column (case, regex and exclude modes), a global filter, per-sub-table filters, filter history and pins; **no boolean query language yet** (yours is better there, and I plan to borrow its syntax so both mean the same) |
| Value analysis | — | 📊 per column: every unique value with counts, cell-structure states, derived values (roles, attributes, flags, platforms, …), filter by ticking |
| Data checks | Pending-edit marks | "Findings" menus: title style, typography, length mismatches, invalid barcodes and ISRCs, duplicate links, missing works or artwork, …, each filterable page-wide |
| Sorting | Click a column | Multi-column sort on any column, synthetic columns included |
| Columns | Chooser with drag reorder, resize-to-content, named column sets | Show/hide, resize, sticky first column, collapsible multi-row cells, synthetic columns split out of native cells |
| Artwork | Covers in grid/header, Art Station gallery | CAA/EAA columns with presence sorting/filtering, a cover-art section, a full-screen viewer |
| Other scripts' additions | Draws from ws/2, so additions to MusicBrainz's DOM don't reach it | Reads the native page, so other scripts' columns (yours, jesus2099's, …) become filterable, sortable columns |
| Export | — | CSV, JSON, HTML or Org-Mode export; save and load the rendered table to disk |
| Look | Themes, light/dark, hexagon backgrounds | MusicBrainz's own look |

In short: EH for reading MusicBrainz, SAED for checking it. Ideas I'd like to take from EH for SAED: the
filter language, named column sets, stale-while-revalidate caching, and the shared request gate.

</details>

<details>
<summary><b>Appendix B — How I keep SAED in step with your scripts</b></summary>

<br>

Your toolset moves fast, so I set up a repeatable check rather than a one-off look:

- **A coexistence harness.** Playwright opens real musicbrainz.org pages with String Theory (or Event
  Horizon or ISRC Scout alone) injected next to SAED. A probe then walks fixed scenarios and records what
  it sees:
  - EH on at load, and V;
  - SAED's table, then V/V;
  - navigating inside EH, then V;
  - keys on SAED's table;
  - requests per second and which ones got 503s;
  - how ISRC Scout's Links are labelled.
- **Code anchors.** A list of 34 places in your code and mine that my notes rely on (e.g. `setOn()`'s
  body swap, `KEY_CMDS`, the gate key, ISRC Scout's link markup), each tied to the statement and the
  to-do item it backs. A check reports which still hold, which moved and which changed. It also detects
  when one of the conventions above appears in your code, so I notice when you've adopted one.
- **A refresh routine**, run whenever you ship. It pulls `main` (the same "latest" String Theory link I
  install from), takes String Theory, Event Horizon and ISRC Scout from the same commit, re-runs the probe
  and the anchor check, and updates my notes and to-do list. Most of the routine is automated with an AI
  coding assistant; I review the results.
- **Who fixes what.** Every interop item on my list says whether it's mine, yours, or a shared
  convention. I only bring you the ones where a small change on your side beats a workaround on mine, and
  I keep a defensive fix on my side for users on an older String Theory.

So I'll stay up to date with your latest implementations and tell you early when something between the
two scripts breaks, from either side.

</details>

Thanks!
Volker
