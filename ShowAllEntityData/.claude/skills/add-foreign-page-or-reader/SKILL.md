---
name: add-foreign-page-or-reader
description: Support a new page or a new kind of link on a NON-MusicBrainz site in ShowAllEntityData — a pageType on discogs.com or a Springsteen site (dg-*, sl-*, jl-*, bs-*, bb-*), and/or a link-preview reader in `_EXT_READERS` (card on hover, window on Space, links opening inside the window with Back). Use whenever the user hands you a `debug/<site>-*.html` snapshot of a foreign page and wants it supported ("add a Discogs X pageType", "support discogs.com/user/…", "make the submissions page work"), asks for a detail popup / hover card / reader for some link ("render the history in the popup", "add a reader for support.discogs.com", "user links should open in the popup"), says links in an open popup should "stay inside the popup" / "resolve inline with Back", or says a click on a table link "tries to leave the page". For a MusicBrainz page use add-pagetype-from-html instead.
---

# A foreign page or a link reader, end to end

Distilled from the 2026-10-18 Discogs rounds (`dg-submissions`, `dg-user`,
readers `dghistory`, `dguser`, `dgsearch`, `dgsupport`, full-size images,
in-window links). Every step below was needed at least once; every trap in
"Known traps" was hit.

Read first: `CLAUDE.md` ("Scope: one table engine, MusicBrainz first"),
`docs/claude/<site>.md` (discogs.md for Discogs), and for readers
`docs/claude/detail-pages.md` ("Links to other sites", "Readers of known
sites", "A Discogs release's edit history"). Grep DEBUG-NOTES.md for the site.

## 1. Snapshot, then probe — never design from memory

- Ask for the page saved from the user's own browser into `debug/` (initial
  page, IP; plus the final rendered page, FRP, for a popup bug). Note in the
  answer whether it was saved logged in (`data-page-cfg` `isLoggedIn`).
- Read its skeleton before anything else: is there React's `#app`, or is it
  an older server-rendered page (`#main_wrapper` holding header AND
  `#page > #page_content`)? Where is the list, and does it carry ids (the
  submissions browser view's rows are `javascript:void(0)` — no ids, so the
  flat view had to be read instead)? Is there a pager, and where is the
  total ("1 – 100 of 1,140", a "Jump to" `max`)?
- Probe the data source with a `scripts/probe-<site>-<what>.py` (stdlib
  urllib, User-Agent, no token, prints status/content type/keys/first row).
  Prefer an API over the HTML. **Record where the docs were wrong**: Discogs'
  docs say `database/search` needs authentication — it answered 200 without
  a token; support.discogs.com pages are behind Cloudflare (403 "Just a
  moment…") but its Zendesk API `/api/v2/help_center/articles/<id>.json`
  answers. A page you cannot fetch from here (Cloudflare) needs another
  saved snapshot from the user, e.g. a `?diff=N` variant.
- Stamp every probe result: `TZ=Europe/Berlin date +%FT%T%:z`, host, "n/a"
  browser.

## 2. Mockup first (LAF), and settle the questions

New visible UI (a window section, a card line, a button group, a new view)
gets an interactive HTML mockup published as an Artifact BEFORE code
(~/.claude/CLAUDE.md "UI look and feel"; memory `ui-mockups-first`). Use the
probe's real data. Put open questions in the mockup's side notes AND ask
them with AskUserQuestion — typical ones: which links/kinds, "History first
or release first", token or not, how many results per request, hide or keep
an empty button, read from MusicBrainz too (anonymous request, may meet the
browser check). Republish the same file for a v2 (same URL). Record the link
in `docs/claude/<site>.md` and the plan. Build exactly what was approved;
anything the mockup left out is a question, and anything that had to differ
(placement, a label) is reported, not slipped in.

## 3. A pageType on the foreign host

Touch points (grep the anchors, never line numbers):

1. `@include` line (one per page family) + a case in
   `tests/fixtures/sl-include-regex.spec.js` (pages AND near-misses).
   Discogs language prefixes include `pt_BR` (underscore).
2. A path regex constant near `_isDgHost` if the gate needs it.
3. **The gates**: opt-in (`sa_enable_<site>`) first; then on Discogs the
   `#app` gate (Cloudflare's check has no `#app`). An older page has no
   `#app` either — allow it by path AND `#page_content` (the check has
   neither); keep `dg-challenge.html` at the new URL in a spec.
4. `pageDefinitions` entry with `host:`; `features.pageRequest` (+
   `pageCountAsync`). Rows from an API: `fetchText()` through
   `_dgFetchText()`/`_extGet()` (gate, headers, token). Rows from the site's
   own pages: no `fetchText` → `fetchHtml()` same-origin with the session;
   force the URL form that carries the data (`view=flat`). The engine never
   reuses the live document for a `pageRequest` pageType: page 1 is fetched.
   A page count the live page states costs no request.
5. Converter `toHtml()` → `table.tbl` with `data-mb-col-headers`
   (`_dgTableHtml()`); multi-table via `<h3>` + `groupByH3`. Unlabelled
   cells exist (Discogs' flat row has a 4th, the matched artist).
6. Buttons: `description` getter for the cost; `showIf()` reading the LIVE
   page to hide a button whose list is empty or private (no request before
   the press).
7. **Placement** (`_dgPrepareLivePage()`): before `#app` on React pages;
   on older pages FIRST in `<body>` — never inside `#main_wrapper`, or the
   sticky headers (`_sphCollectTargets()` pins every `<body>` child but
   `_sphPageEl()`) pin the whole site. Toolbar name from the page's own h1,
   else the document title (which may be just "Discogs").
8. Links our tables write: `_DG_NEW_TAB` (`target="_blank"`), and a plain
   click opens the preview window (`_dgTableClickOpens()` in the popup
   engine's click handler) — otherwise the script's own "You are about to
   leave this page" fires.

## 4. A link-preview reader

1. Test + path regex; **order in `_EXT_READERS` matters**: a broader path
   pattern may already take the link (`_EXT_DISCOGS_PATH_RE` ends in
   `(?:[-/]|$)` and took `/release/<id>/history`) — put the specific reader
   first, a host-specific one before `generic`.
2. `keyUrl(u)`: a canonical cache URL (no slug, language, `#section`), so
   two links to one thing share one request; a target built by hand
   (`_extDgHistTarget()`) uses the same key.
3. `version`: `_EXT_IDB_VERSION * 100 + <own constant>`; bump the constant
   whenever the parsed output changes (history: 1 → 2 when `rev` was added).
4. `load(t, wanted)`: one request; API via `_extGet()` (+
   `_extDiscogsHeaders()`), an HTML page of the site itself via a helper
   like `_extDgHistGet()` — same-origin `fetch()` with the session on that
   site, `_extGet()` (anonymous) elsewhere. `_extApiOutcome()` turns
   404/429/5xx/bot checks into records; a parse that finds nothing is
   `{ok: false, detail}`. Facts for the card (`cardFacts`), `rec.<own>` for
   the window.
5. `windowOnly: true` for anything scraped from HTML or costly: the card
   says "Space reads it", only the window asks. A same-origin host is
   "known" (`_extHostKnown()`), no Tampermonkey prompt text.
6. `window(t, rec, {start, force, repaint})` → `{left, right, full, top?}`
   (`top` = above the columns). Sections via `_extDgSection(id, …)`
   (collapse state shared by id). A secondary request inside the window
   (activity, a revision's diff, list pages): `_mbLoad(key, …)` started ONLY
   with `start` or by a click, `wanted` = the window shows the target;
   `_extLoad(t, {wanted})` when the caller is not the card/window of `t`.
7. `onAreaClick`: controls first (`data-mb-<x>-act`), then
   `_extDgFamilyClick(e)` — section heads, "Load more", in-article anchors,
   and `_extDgDrill()` (every link a reader takes opens in the same window,
   the current view on the Back stack). On discogs.com a same-host link only
   gets a target if `_extDgSiteTest()` admits its path — extend it.
8. CSS in the popup stylesheet, `.mb-dp-dialog`-scoped, Liner-notes tokens;
   no backtick in a `GM_addStyle` comment.

## 5. Tests, mutations, suite

- Fixtures: extend `scripts/build-discogs-fixtures.py` (or the site's
  builder) — trimmed shell + the parts the script READS; whitespace
  squeezed, no trailing spaces. API answers as `ext-<site>-*.json`.
- Spec per feature (`tests/fixtures/<site>-*.spec.js`): request log (route
  handlers for same-origin pages, `__gmXhrLog` for GM requests, `anonymous`
  flag), no request before the press / on hover, the rows' links and cells,
  the window's sections and controls, Back, failure states, MusicBrainz side
  when the reader runs there. Plus a `.mobile.spec.js` tap test.
- Mutations in `scripts/mutations/<site>-<feature>.json`, one per guard;
  `python3 scripts/mutation-check.py <file>` — all must fail, file restored.
- `python3 scripts/lint-summary.py --check`, then
  `python3 scripts/run-test-full.py --log <scratchpad>/test-full.log`
  (announce it; shared code changed → MusicBrainz must stay green).

## 6. Docs and bookkeeping (feature branch: no version bump)

`<project>_CHANGELOG.wip.json` (WIP.N, user words, mockup link); HELP
(the site's `<details>` section, the settings row, "Link previews");
`docs/claude/<site>.md` (pageType table row, a section, tests table, known
differences from the mockup); `docs/claude/detail-pages.md` (reader
section, any new reader option); `PAGETYPES-TESTING-REFERENCE.org` (roster
row, coverage row, details); CLAUDE.md doc-map rows; a dated DEBUG-NOTES.md
entry with the Env stamp and the `test:full` result. Don't commit or merge
without the user's go-ahead; offer `git diff`.

## Known traps

- `loadUserscriptPage()` routes the fixture URL last, so it beats a spec's
  logging route for the SAME URL: load the fixture at a URL that differs
  from page 1's fetch URL (drop `page=`).
- A `cell(table, 'Changed')` helper with prefix matching hits "Changed by":
  exact header name first.
- Press Space only after the card is visible, or the keydown finds no card.
- `waitForTimeout` raises the lint count: wait for a visible state instead.
- `_extGet()`'s requests are `anonymous`; from MusicBrainz Discogs' HTML
  pages may answer with Cloudflare's check — say so in the window and link
  the page; never switch to cookies without the user's consent.
- Discogs compares a revision with the previous one that CHANGED data
  ("Old (revision: 8)" for 10): take labels from the page, never compute.
- A secondary request inside a window must start on `start` OR while its key
  has no state yet (`_extDgListStart()`'s rule): after a drill-down the
  target's own record arrives on a repaint, which is not a `start` render,
  and a `start`-only section stays at "Reading…" for ever. A spec that hovers
  first (the card loads the record) hides this — test the drill-down path.
- Parsing a page with nested tables (Discogs' diff cells hold the whole
  release page, tracklist included): anchor every selector with `:scope >`.
- A capture of a long list can be ~600 KB a page: keep the first and last
  pages and serve the first for the middle ones in the spec — but make the
  pages DIFFER where the converter groups rows (serve the last page as a
  middle one too), or a per-page grouping bug never shows (dg-user's
  Submissions split into "Releases, Labels, Releases, …"; the engine's fix is
  `features.groupMergeByName`).
- Sub-tables with DIFFERENT columns and a `columnExtractors` entry: the
  fetch loop re-resolves extractor columns per sub-table only for the
  pageTypes on its list ("Per-table extractor colIdx resolution") — add the
  new pageType there, or the first table's column index is reused on the
  next (dg-history's date/time split ran on the Diff table's Section). Test
  cells-per-row against headers, not only row counts.
- Never wait with `until ! pgrep -f "<script>"; do sleep 5; done`: `pgrep
  -f` matches the loop's own command line and it never ends (stray `sleep 5`
  processes for days). Use a background task's completion notice.
- The host's own CSS reaches our elements: Discogs' older pages load
  `discogs.css`, whose `input[type=search]{box-sizing:content-box}` beat
  `.mb-col-filter-input` (filters ~86 px past their columns). Measure a saved
  FRP WITH the site's stylesheets served (a script that blocks remote CSS
  shows a layout the user never sees), and pin the site's exact rule in a
  spec (`page.addStyleTag`).
