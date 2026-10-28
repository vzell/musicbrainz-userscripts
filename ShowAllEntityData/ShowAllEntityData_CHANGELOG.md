# ShowAllEntityData — Full development log

Every version, newest first, with the technical details behind each change. For what changed for you in each published release, in plain words, see [What's new](ShowAllEntityData_RELEASES.md).

**Months:** [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

This page shows the newest 100 of 1660 versions; the month pages hold all of them.

---

## 9.99.1489 — 2026-10-28

**🐛 Fix**

- With jesus2099's "mb. FUNKEY ILLUSTRATED RECORDS" active, its big picture strip could still show after a render, between the script's own big image strip and the table (a release group's Relationships, debug/mb-rg-funky-final.html). That script decorates the page once, 600 ms after it has loaded; when the render started earlier — a second press reloads the page and presses the button again at once, a quick press, a load from disk — it found the script's own tables. Its strip is now removed whenever it arrives after a press or a disk load.


## 9.99.1488 — 2026-10-28

**✨ Improve**

- On the initial page, the images of jesus2099's "mb. FUNKEY ILLUSTRATED RECORDS" big picture strip — above a release group's releases, in its Relationships, on a tag's release groups and releases, on an editor's ratings, in a release's Credits — behave like the script's own artwork: a hover shows the artwork card of that release or release group (every image, Space for all of them), a click opens the artwork viewer on the page, Ctrl-click still opens the release (group) page. Until now they only had their plain title.


## 9.99.1487 — 2026-10-28

**🚀 Feature**

- A Discogs window — a release, a master, an artist or a label — has "✎ Editing history" (or H), without the ▾ MusicBrainz's has (org/POH-headerline.org item 4, vzell). It shows that entity's edit history page from discogs.com in the window: every change with its user, kind and note, "View changes" for a revision's diff, the latest change's diff. Until now only a release's history could be read, and only from a link to it.
- A long history spans pages of about 50 changes on Discogs. The window shows the newest page and says which pages it shows; "Load the N earlier pages" reads the others one request at a time (Stop ends it, a failed page can be tried again), and they join the same list, so the filter and the order work on all of it.
- On a discogs.com release, master, artist or label page the ☰ SAED menu has "✎ Edit history" (Editing history group), before and after a render: that entity's Discogs edit history in the window. Ctrl-click opens Discogs' own page.

**🐛 Fix**

- A Discogs history page read with murdos' "Import Discogs releases to MusicBrainz" active in the browser carries that script's MusicBrainz link and icon first in its heading; the window no longer takes them for the entity's name and picture.
- In a Discogs history window a long kind ("Edit Master Release") ran into the note beside it; the kind column is wider, and a longer kind is cut with its whole name on a hover.
- On discogs.com the MusicBrainz icon murdos' importer puts in front of the page's name in the script's own heading shows its MusicBrainz card on a hover, as the importer's icons in Discogs' content do.


## 9.99.1486 — 2026-10-28

**✨ Improve**

- On discogs.com a MusicBrainz window (from the MusicBrainz column or murdos' importer's icons) has what it has on MusicBrainz: "✎ Editing history ▾" (and H) and "Live page". Both are MusicBrainz pages, which answer a script's anonymous request with their browser check, so they are read with your musicbrainz.org cookies — the browser's own session, as when you open the page in a tab (org/POH-headerline.org item 3, by consent). If MusicBrainz still asks the browser to verify itself, open the page once in a tab and press ⟳.
- In such a window every MusicBrainz link a MusicBrainz card knows opens in the window and shows its card on a hover, as on MusicBrainz — a genre's tag, an edit, an editor, a documentation page — not only an entity (vzell: "Genres -&gt; tags link do not open inside the same window and do not have a hover window"). The path's glyph reads MusicBrainz's documentation in the window there too, instead of opening a new tab.

**🐛 Fix**

- A release or event window's cover strip that said "The archive did not answer." stayed so for the session: ⟳ read the failure back instead of asking the archive again. ⟳ asks again now (a release with no images is not asked again).


## 9.99.1485 — 2026-10-28

**🐛 Fix**

- A window filter's matches (a Discogs window's versions, a collection's entries) lost their colour when "Column Filter Highlight Color" was saved empty: the tables fall back to red there, the window fell back to the text's own colour. Both fall back to red now (found by the settings audit, scripts/audit-config-defaults.py).


## 9.99.1484 — 2026-10-28

**🚀 Feature**

- The preview window's path (org/POH-headerline.org, vzell): following links inside the window builds a path in its title bar, and now every step of it has its glyph — MusicBrainz's own entity glyph, or for Discogs 💿 master, 📄 release, 🏷️ label, 👤 artist, 💬 user (the Discogs mark for a search, a help article, images or a history) — and is a way back: click a step and the window shows it again, from memory, the steps after it dropped. The earlier steps behind "…" are a menu of the whole path. Resting on a step shows that step's own card (no Ctrl, nothing asked; Space goes back to it); resting on its glyph shows its kind's documentation — MusicBrainz's /doc/&lt;Kind&gt; page, its style guide named in the card's foot, or Discogs' Database Guidelines article — and a click reads it in the window. A narrow window keeps two steps instead of three.
- New setting "In the window's title, each step of the path reads": its name (the default, e.g. "The Angel") or its kind ("Recording", the path as it was). A view — an editing history, a documentation page, a Discogs search — always reads its kind.

**🐛 Fix**

- On discogs.com a MusicBrainz card and window (the MusicBrainz column, murdos' importer's icons) had no entity glyph: it was only drawn for MusicBrainz's own pages, and its address named discogs.com. It is musicbrainz.org's now (org/POH-headerline.org item 3).

**✨ Improve**

- A Discogs card's kind line carries its kind's emoji too, as the window's path does.


## 9.99.1483 — 2026-10-28

**✨ Improve**

- YouTube in place (9.99.1479, 9.99.1480), after vzell's live test: a YouTube link in a MusicBrainz page's own Relationships list ("stream video for free" on a recording) gets its "Play here" tile on the page as it loads, before any button; it plays in a row under that relationship, and the Relationships render still builds its own tile, just one. The Discogs window's Videos line up in three columns — tile, title, length — instead of running together.


## 9.99.1482 — 2026-10-28

**📝 Docs**

- Help: "Playing a YouTube video where it is listed" under the link previews — where the tiles are (URLs table, sidebar, annotations, a YouTube link's window, Discogs' Videos, a Brucebase show's window), Esc and ■ Stop, one video at a time, the two settings, and what happens where a site refuses the player; the Discogs release page's Videos sub-table and the master window's videos (9.99.1478–9.99.1481).


## 9.99.1481 — 2026-10-28

**🚀 Feature**

- YouTube in place on Brucebase (9.99.1478's tile): a show's window (an Event link's preview, Space) gets a Media section from the page's Media tab — its embedded YouTube player as a link to the video or playlist, with a "Play here" tile that plays it in the section — and a tile after every YouTube link in the other sections (the Recording tab's audience video, for one). A Media tab that is only a player now counts in the card's "On the page". Cached show pages are read again once.

**🐛 Fix**

- A detail window's Live page turned an embedded YouTube PLAYLIST (Brucebase's Media tab, its 4th of July song page) into a broken "watch?v=videoseries" link; it now links the playlist.


## 9.99.1480 — 2026-10-28

**🚀 Feature**

- YouTube in place on Discogs (9.99.1478's tile): the Discogs release window's Videos section puts a small "Play here" tile in front of each YouTube video, and the player opens in a slot above the list, which stays as it was. A Discogs master's window now has its Videos section too (its cached answers are read again once). discogs.com's release page gets a "Videos" sub-table (Play, Title, Length, URL) from the release's own answer, no extra request; a tile plays in a row under its row. Without 'Play YouTube videos in place' the windows' Videos are as before and the sub-table has no Play column. Where discogs.com's frame policy refuses YouTube's player, the video opens on YouTube in a new tab instead, and the tiles say so (9.99.1478).


## 9.99.1479 — 2026-10-28

**🚀 Feature**

- YouTube in place on MusicBrainz (9.99.1478's tile): a "Play here" tile under a YouTube link in the URLs table of a Relationships render (it plays in a row under the row), a small one under the sidebar's "Play on YouTube" (it plays under it, as wide as the sidebar), and one after every YouTube link of the page's annotation and of an Annotation column (reports, annotation search results). A link inside an annotation heading gets its tile after the heading, so the heading reads as before. The YouTube link's window (Space) shows the tile under its title, in place of the thumbnail, and plays in the window; a video YouTube no longer has is shown as unavailable there at once, and asks nothing when clicked. Filtering for the link, sorting and the 📊 values are as before: the tile's words are none of them. With 'Play YouTube videos in place' off nothing changes on any page.


## 9.99.1478 — 2026-10-28

**🚀 Feature**

- YouTube in place (org/youtube.org), the shared part: a "Play here" tile for a YouTube link — a still frame (or a plain frame) with ▶, the title and "Play here · 4:30" — that plays the video where it is listed, in YouTube's privacy-enhanced player (youtube-nocookie.com). Nothing is asked from the player before a click. In a table the player opens in a full-width row under the row, in a list's box in a slot above the list, elsewhere right under the tile; it is as wide as its column, at most 640 px, 16:9. One video plays at a time. Esc stops it before anything else sees the key (the next Esc closes the card or window as before); "■ Stop" does the same. A video YouTube no longer has shows "This video is not available on YouTube any more." with a red Unavailable pill. Where a page's frame policy refuses the player, the video opens on YouTube in a new tab, and every tile of that page says "Opens on YouTube (new tab)" from then on. A player that plays in a link's window keeps playing while the window repaints. The tile's text never reaches filtering, sorting or the 📊 dropdown.

**✨ Improve**

- Two new settings in 🔎 EXTERNAL LINK PREVIEWS, both on by default: 'Play YouTube videos in place (a click asks youtube-nocookie.com)' (off: no tiles at all) and 'Show the videos' still frames (asks i.ytimg.com as they come into view)' (off: plain frames, so no request to YouTube before a click). A playlist always has a plain frame with "≡ list".


## 9.99.1477 — 2026-10-28

**🚀 Feature**

- Links to a Discogs release's Images page and its image editor ("Image history") get their own window instead of the plain release window: Image history lists every image in a table (\#, the image, Primary or Secondary, who uploaded it, when, its own width × height and file size, every column sortable); Images shows a gallery with each image's size and uploader, the uploaders on the left, and a click opens the artwork viewer.
- The image editor's data is the only place with the uploader, the date and the image's own size, and it comes only with the Discogs login, so it is read with your Discogs session — also from MusicBrainz (the one link preview that sends cookies, to discogs.com only). Signed out, the window keeps the images and their types from Discogs' API, says why the rest is missing and marks the size as the one Discogs serves.
- On discogs.com itself, a release's Images page and its image editor get a "Show every image" button: one table of every image (\#, image with its hover card and the viewer, type, uploaded by with the user's picture, date and time in your time zone, W × H, size in KB), the same on both pages.
- Performance: link-preview windows and two new discogs.com pageTypes only; no change to MusicBrainz's tables. An images window costs two requests (the API and the editor), on Space only.


## 9.99.1476 — 2026-10-28

**🚀 Feature**

- CD stub links get a card and a window, read from the stub's page: title, artist, track count, length and how often it was looked up; the window lists its facts (barcode, disc ID, added, last modified) and its tracklist as a table with a filter and sorting.
- Documentation links (/doc/…) get a card and a window: the card shows the page's title, its status ("official style guideline") and first paragraph; the window shows its contents on the left and the whole text on the right, its headings kept, and a link to another documentation page opens that page in the window.
- A documentation search link (/search?…&type=doc) gets a card and a window too. MusicBrainz's own search page is Google's and has no results in it, so they come from the MusicBrainz wiki's search: the card says how many pages match and names the first ones, the window lists up to 50 of them as a table (page, snippet, last updated) with a filter, chips and sorting, and a page opens in the window.
- The userscript header lists wiki.musicbrainz.org under @connect, so Tampermonkey does not ask before the first documentation search.
- Performance: link-preview windows only; no change to the page tables' filter, sort or render path. A documentation search asks the wiki once (one request per search, at most one a second), then answers from memory and the browser's cache.


## 9.99.1475 — 2026-10-28

**✨ Improve**

- A release's window shows its tracklist as one table per medium, under a header that folds it ("CD 2 · 8 tracks · 52:09"): \#, title (opening its recording in the window), the artist where a track's credit is not the release's, length; one filter above all the mediums, which marks what it matched and says per medium how many tracks match.
- An event's window shows its setlist as a table: \#, the song, and the rest of its line (guests, a remark) in a column of its own, with a filter and sorting.
- A series' window shows each item's kind with MusicBrainz's own icon before its name.
- Performance: link-preview windows only; no change to the page tables' filter, sort or render path, and no new request.


## 9.99.1474 — 2026-10-28

**✨ Improve**

- The smaller lists in the MusicBrainz windows are tables now, with a filter (when there are more than 25 rows; it marks what it matched), sorting by any column (ascending, descending, back to MusicBrainz's order) and 25 rows a page: an entity's links (site, relationship, address) in the artist, release group, place and label windows (a label's from eleven links on), a work's codes, an event's "Recorded here" (its releases and its recordings, two tables), an instrument's aliases (with locale, type and whether primary) and related instruments, an area's related areas, a genre's related genres (one table per relationship; its links moved to the left), an editor's edits, tags and genres, ratings (one table per kind), an ISRC's recordings, an ISWC's works, a disc ID's releases and an annotation's versions.
- A label's window lists its aliases one per line, as an artist's does.
- Performance: link-preview windows only; no change to the page tables' filter, sort or render path, and no new request.


## 9.99.1473 — 2026-10-28

**✨ Improve**

- A tag's window and an editor's tag window list the tagged entities themselves: a click on a kind under "By kind" lists that kind (the biggest one at first), read from MusicBrainz's page of that kind 100 at a time with "Load N more pages", most votes first, with a filter and the three-way sort. Until now each kind showed its first ten and a "See all" link to the site.
- A link to one kind's page of a tag or of an editor's tag (/tag/rock/artist, /user/…/tag/live/release) now has the tag's card, and its window opens on that kind.
- Ctrl-click on a tag or genre link in a window (a genre in the facts, a tag's own genre) opens YOUR own tag of that name in the window, when you are logged in; Shift- or middle-click still opens a new tab. The line at the window's foot says so on such a link, and names the key at rest whenever the window holds one.
- A collection's window lists its entries in a table with a filter (which marks what it matched, inside links too), the three-way sort and, for a release group collection, type chips; its first 100 come with the card, "Load N more pages" reads the rest. It replaces the 25-row slices behind ◀ ▶.
- A label's and an artist's window list their genres one per line, most votes first, each opening its tag, as a release group's does; an artist's aliases are one per line too, each with its type and locale.
- Performance: link-preview windows only; no change to the page tables' filter, sort or render path. A tag's and an editor's tag's window read one more page when they open (the first kind's list); a collection's none.


## 9.99.1472 — 2026-10-28

**🐛 Fix**

- A series of release groups: a click on one of its items in the window opened a broken page in a new tab (/release\_group/…); it now opens the release group in the window.
- Hovering a catalog number whose label MusicBrainz could not load no longer asks for that label again and again while the card shows; as everywhere else, ⟳ or a new hover tries again.

**✨ Improve**

- The MusicBrainz windows of a recording, a place and an artist list everything, as a work's window does since the last version: 100 when the window opens, then "Load N more pages" with Stop and "Try again", a filter, chips and the three-way sort. A recording's window shows all of its releases (with covers and status chips) instead of the first 25; a place's all of its events (type chips) instead of the first 100; an artist's its release groups themselves instead of a count per type: a segment per type (Album, Single, EP, Broadcast, Other) with its total, each its own list, chips for Live, Compilation and the like, and the covers, loaded as you scroll.
- These lists start sorted by date: MusicBrainz returns them in an order that is neither by date nor by title.
- The release-group window's releases have a filter and format chips too, and a release without a cover keeps an empty square, so every row is as high.
- In the release-group window, each credited artist opens in the window, and the genres are listed one per line, each opening its tag.
- Performance: link-preview windows only; no change to the page tables' filter, sort or render path. A recording's window makes the same number of requests as before (its releases instead of a count); an artist's one more (its first 100 release groups) and asks the Cover Art Archive for the covers of the rows you scroll to.


## 9.99.1471 — 2026-10-27

**✨ Improve**

- A MusicBrainz work's window lists its recordings as the Discogs label window lists its releases: 100 when it opens, then "Load 5 more pages" (500 recordings, about 6 s), with Stop, a progress bar and "Try again" for a page that failed; a filter over title and artist, a chip per artist credit (Ctrl-click adds one, "+N more" past ten) and the three-way sort. What is loaded is kept in the browser like the card, so a later window shows it without asking again. Until now the window showed the first 100 and sent you to the work's page for the rest.
- A Discogs label's releases: Ctrl-click on a format chip adds a second format, "+N more" shows formats past the first ten, and a release without a picture keeps an empty square so every row is as high.
- Performance: link-preview windows only; no change to the page tables' filter, sort or render path.

**🔧 Refactor**

- The windows' tables are two shared components with one click handler for every window (org/MB-POH-sync-withDiscogs.org, Phase 2): a Compact table (a Discogs label's sublabels) and a List table (a label's releases, a work's recordings), plus a paged loader for MusicBrainz lists that the other MusicBrainz windows will use next.


## 9.99.1470 — 2026-10-27

**✨ Improve**

- Every sortable table in a Discogs window (an artist's discography, a label's releases and sublabels, a master's versions) and the release-group window's releases table now has three sort states: ascending, descending, and a third click back to the order the site gives. A heading in that initial order shows a faint ⇅ (the release-group window's ↕ became ⇅ too), and its hover text says what the next click does.
- A Discogs artist's Have heading now also sorts the other way on the second click (fewest first) before returning to Discogs' order; until now its second click went straight back.
- Performance: link-preview windows only; no change to the page tables' filter, sort or render path.


## 9.99.1469 — 2026-10-26

**🚀 Feature**

- Ready-made views of an entity's edits: All edits, Own edits, Edits by others, Open edits, Open edits by others, jesus2099's searches from SUPER MIND CONTROL Ⅱ X TURBO (only this entity's edits, pure edits, on a release without art and art only, relationship edits with Post-NGS and Pre-NGS, effective edits, edits I have not voted on) and the Annotation history. Each opens in the preview window, titled after itself; Ctrl-click or middle-click opens MusicBrainz's own page.
- The ☰ SAED menu has a new 'Editing history' group on a page about one entity: '✎ Entity history ▸' lists those views, and '📝 Annotation history' opens the annotation's versions.
- The window's '✎ Editing history' button is now a button with a menu: the button opens all edits as before (or H), its ▾ lists the same views. An editor's window keeps the plain button.


## 9.99.1468 — 2026-10-26

**🐛 Fix**

- An editor's collections page with a 'Collaborative collections' section: those collections were drawn under 'My collections' with one cell too many, so from the Privacy column on every value stood under the wrong header. The page now shows one 'Collections' section: each collaborative collection joins the sub-table of its kind, and every sub-table has a Privacy column ('Private' for the editor's own collections, MusicBrainz's own value such as 'Public' for the collaborative ones).
- The same page: every sub-table showed the first one's column names, so the count column read 'Artists' everywhere. Each sub-table now has its own (Recordings, Releases, Release groups, Series).


## 9.99.1467 — 2026-10-26

**✨ Improve**

- Brucebase year pages: the 📊 list of the Media column now shows each name's icon after it (Photo, Setlist, Ticket, …), the same icon the table shows. An entry for a cell with several icons stays text only.


## 9.99.1466 — 2026-10-26

**✨ Improve**

- The non-MusicBrainz site settings are now on by default: springsteenlyrics.com, jungleland.it, brucespringsteen.it, Brucebase (song list and year pages) and discogs.com are switched on, and so are the detail previews of the four Springsteen sites, the compact category and filter bar on springsteenlyrics.com, and 'In the window, read a link ahead while the pointer rests on it'. 'Show the Brucebase side bar on the right' and the '… on touch devices' settings stay off. A profile that still holds the old off value from the old default is moved to the new one once, as with earlier default changes; switch a site off again in ⚙️ Settings if you do not want it.


## 9.99.1465 — 2026-10-26

**✨ Improve**

- The Discogs search and user windows swap their sides like the other Discogs windows: the search's Results and a user's Recent activity are on the right; Link, "Discogs says" and the user's pages on Discogs are on the left.
- Typing in a Discogs window's filter (a master's versions, a discography, a label's releases or sublabels) marks the matched text in every row it keeps, in the colours of the tables' filter highlight.
- On a Discogs artist, master or label page, the thumbnails of Discogs' own list get our image card: a rest shows every image of that release or master (one request for that row), a click or Space opens the viewer, and Shift+← → steps through the list. "Image column: all images of a row on hover" turns the card off.

**🐛 Fix**

- On a Discogs submissions list (flat view), Discogs' own table gets a "Matched artist" heading on its last column, and that artist's name (linked by name, not id) now shows the card of a Discogs search for that artist.
- On Discogs label pages, Discogs' own artist hover card no longer opens on top of our preview. It also came through the importer's icons beside the name and when the pointer moved in from a neighbouring cell.


## 9.99.1464 — 2026-10-26

**✨ Improve**

- Discogs windows (release, master, artist, label) swap their sides. The left column now holds the information: title and pictures, the link, "Discogs says" and, for a release, the companies, credits, identifiers and videos. The wider right column (0.7 : 1.3) holds the content: tracklist and notes, a master's versions, an artist's discography, a label's releases. The lists are no longer a full-width block below the columns. On a narrow screen it stays one column, information first.
- A master's version chips (Format, Country, Released): Ctrl-click (⌘-click) adds a value or takes it out again. A plain click still shows only that value. Values of one kind combine with "or", different kinds with "and", and a line above the table says what is chosen.
- A Discogs label's sublabels are a table now (Name, Status) with 25 a page, ‹ › to turn the pages, a filter and sorting, instead of a list with "+N more".
- The MusicBrainz label card and window show Founded and Defunct, the label code, rating and ISNI. The window also has the sort name and a "People, places and series" section (founders, recording contracts, owned places, series), up to 12 of each kind and then "+N more". These come from one more lookup, in the window only.

**🐛 Fix**

- On discogs.com, a MusicBrainz link inside a window (a label's or artist's sites, a release's notes, a link in a MusicBrainz window) shows MusicBrainz's card on a hover and opens in the same window on a click, instead of a new tab. Back returns; Ctrl-click still opens a new tab.
- On discogs.com, Discogs' own hover box on an artist name no longer appears on top of our link preview while the previews are on.


## 9.99.1463 — 2026-10-26

**🚀 Feature**

- New 🗄️ Script storage window (SAED menu → View, right below 💾 Browser cache, and in the Tampermonkey menu). It lists every key the script keeps in Tampermonkey's storage, with its kind (setting, workspace state, "Show single-table" hand-off, orphaned key, other), type, size and value. Chips and a search box narrow the list. A key's value opens as JSON: edit and Save it (invalid JSON is refused), reset a setting to its default, delete it, or copy it. Every change asks first. "Delete leftovers" removes the orphaned keys and old hand-offs, and "Export JSON…" saves every key in one file. The Discogs token is shown as dots and is never copied or exported. The window moves and resizes like the Browser cache window.


## 9.99.1462 — 2026-10-26

**✨ Improve**

- 💾 Browser cache: drag the window by its title bar to move it, and drag its lower-right corner to resize it. It opens where you left it, at that size. Its contents now scroll inside the window, between the title bar and the buttons at the bottom.


## 9.99.1461 — 2026-10-26

**✨ Improve**

- Relationships column: a release group icon ("single from", e.g. on a tag's release groups) now gets the link preview card on hover, and the window on Space, like the column's links to other sites. The card shows the release group's title from the icon, and the icon's own box sits in its note stack. The icon's link is now a full address (https://musicbrainz.org/release-group/…). Its filter key stays the bare path, so the 📊 "Relationship icons" entries and the "links to one site more than once" warning are unchanged.


## 9.99.1460 — 2026-10-26

**🐛 Fix**

- Sidebar cover: hovering the cover of a release, release group or event in the sidebar shows the card of all its images again. MusicBrainz puts an image with an empty title inside the cover link, and the hover card stopped at that empty title before it reached the link. Any element with an empty title is now passed over.


## 9.99.1459 — 2026-10-26

**🐛 Fix**

- Link previews: in a preview window, pointing at a link that opens inside the window (e.g. a label in the LABEL-CAT\# column of a release group's versions) no longer makes the value and its column header jump sideways and back. The small ↳ that appeared after such a link on hover is gone: it widened the link and so the whole column. Such links keep their dotted underline, the foot line still says "↳ Opens here", and links that open a new tab keep their ↗.


## 9.99.1458 — 2026-10-26

**🚀 Feature**

- Genre pages (/genre/&lt;mbid&gt;): a new "Show all Relationships for Genre" button shows the genre's relationships as tables, like on place, area and instrument pages: its parent genres, subgenres and influences in one Genres table (with the relationship as a column), and its external links in a URLs table. The "Associated tags" and the Wikipedia text stay as MusicBrainz shows them.
- Link previews: pointing at a genre link (the "Genre" of a tag page, a genre collection's rows, a genre in any relationship list) shows a genre card: its primary tag, the genres it is a subgenre of, its subgenres and influences, how many collections hold it and the start of its Wikipedia text, read from the genre's page in one request. Space opens its window, with every related genre linked so it opens its own card, the external links, the collections link and the whole Wikipedia text. A genre's "Found in N user collections", "Editing history" and "Open edits" links get their cards too.


## 9.99.1457 — 2026-10-25

**🐛 Fix**

- discogs.com: the headings of Discogs' own page under the script's tables (Tracklist, Credits, Videos, …) now fold and open their part on a click, and a Ctrl+click folds or opens all of Discogs' parts at once without touching the script's own headings. A click used to change only the ▲/▼ and hid Discogs' own show/hide button instead. The "Label:" and "Format:" lines of the release's info table no longer get a ▲.


## 9.99.1456 — 2026-10-25

**✨ Improve**

- discogs.com: pointing at a MusicBrainz icon shows that entity's MusicBrainz card, read from musicbrainz.org, and Space opens its window. This works in the MusicBrainz column of the script's tables and for the icons murdos' "Import Discogs releases to MusicBrainz" puts beside the names on Discogs' own page, right away. A click on an icon in the MusicBrainz column now opens the window, like every other link in those tables; Ctrl-click still opens MusicBrainz in a new tab.


## 9.99.1455 — 2026-10-25

**🐛 Fix**

- discogs.com: Discogs' own links in the page (artists, labels, releases, masters, users) now show their preview card on hover right away, before any of the script's buttons is pressed. Only the links in the script's own tables did before. The older Discogs pages (submissions, a release's history, a user's ratings) are covered too.

**✨ Improve**

- discogs.com: a link to a Brucebase show, venue or person in Discogs' content (a release's notes, for example) shows Brucebase's own card, as on Brucebase, instead of a plain web page card.


## 9.99.1454 — 2026-10-25

**✨ Improve**

- Collection preview windows: the covers of a release or release group collection are now the table's first column, next to their rows, as in a release group's window, instead of a strip above the table.
- Pointing at a cover in a collection window or a release group window (each release's, and the group's own) shows every image of that release or release group, and a click or Space opens them in the artwork viewer. Ctrl-click still opens its page.


## 9.99.1453 — 2026-10-25

**✨ Improve**

- Preview windows: Space on an image opens the full-screen viewer at that image, the same as a click, in Brucebase, Discogs and MusicBrainz windows alike. It used to do nothing. Esc closes the viewer and leaves the window open.
- Discogs windows: the small pictures in a master's versions, an artist's discography and a label's releases now work like the Image column on Discogs pages. Pointing at one shows every image of that release (one request to Discogs, kept), and a click or Space opens the viewer on them, with Shift+← → to step through the rows. A click on the picture no longer opens that release in the window instead.


## 9.99.1452 — 2026-10-24

**🐛 Fix**

- Opening a preview window with Space, or stepping through rows in it, no longer scrolls a wide table sideways. On a Brucebase year table the MB-Event column used to slide halfway under the Event column (with the side bar shown, almost all of it). The window still scrolls the page up or down to show its row.


## 9.99.1451 — 2026-10-24

**✨ Improve**

- Brucebase year table: pointing at a Venue shows the VENUE's card, no longer the show's. It names the region, how often Springsteen played there, the first and last show and the venue's description. Space opens a window with every show there (each linked), the cancelled shows and other appearances, a street view link where the wiki has one, and the venue's photos; ← → step from venue to venue.
- Venue pages get a card and window of their own wherever they are linked on Brucebase (a show's Venue link, a person's page, …).


## 9.99.1450 — 2026-10-24

**✨ Improve**

- The SAED menu: View has a new row, 💾 Browser cache, between Statistics and Keyboard Shortcuts. It opens the browser cache overview (what the script keeps in your browser, how old it is, and what to delete) without a trip through ⚙️ Settings or the Statistics panel.


## 9.99.1449 — 2026-10-24

**✨ Improve**

- Brucebase windows: a Ctrl+click (⌘+click on a Mac) on a section's heading folds or opens every section at once. A plain click still folds just that one.


## 9.99.1448 — 2026-10-24

**🐛 Fix**

- The 🖼 images gallery: dragging it by its title bar no longer makes it grow to its whole list (on a Discogs master with many versions it reached past the bottom of the screen, its resize corner out of reach). Dragged or reopened, it now always stays inside the browser window.
- Pressing on the gallery's resize corner no longer scrolls the list inside it: the list's scrollbar used to reach into that corner.


## 9.99.1447 — 2026-10-24

**✨ Improve**

- Brucebase: "Collabsable sidebar" (⚙️ Settings → 📚 Brucebase) is now on by default, so the wiki's side bar gets its show/hide handle and starts hidden while "Start with sidebar collapsed" is on. If you never changed it, it switches on with this version.


## 9.99.1446 — 2026-10-24

**🚀 Feature**

- Brucebase year table: pointing at a found MB-Event glyph (with Ctrl held, unless every preview shows on a plain hover) shows the MusicBrainz event's card: its name, type, date, place and line-up. Under it, the card says how the event was found and whether its Brucebase link is this entry's. Space pins it into a window with the event's links.
- Two new findings check that link. ❌ "MB-Event: the Brucebase link differs": the MusicBrainz event links another Brucebase entry, or this entry's anchor is linked from another event; the card shows both links. ⚠️ "MB-Event: no Brucebase link": the event has none. They appear in the ❌ / ⚠️ menus, filter the table and tint the cell as the other findings do, and fill in while the column looks the events up. Each has its own switch in ⚙️ Settings → ⚠️ Findings, plus one for the tint.


## 9.99.1445 — 2026-10-24

**✨ Improve**

- Brucebase windows (the one Space opens on an event or a song): every section on the right — On stage, Setlist, Performances, Credits, … — folds with a click on its heading and stays folded for the next page you open.
- The people on stage, the songs of a setlist, the other shows at the venue and a song's credits are now links. A click opens them in the same window (Backspace goes back), and pointing at one shows its card. People and venue pages preview too, on every Brucebase page.
- The images on the left are grouped by kind (Setlist, Ticket, News, Memorabilia, …), photos last, and the viewer steps through them in that order.
- A song's window lists its performances (folded at first), each show linked.


## 9.99.1444 — 2026-10-24

**🚀 Feature**

- Brucebase year table: a new second column, MB-Event, shows a glyph for the entry's kind (gig, no gig, recording, rehearsal, interview, no Bruce) and links it to the entry's event on MusicBrainz once found. After the table renders, the column looks the events up by itself: first by the entry's Brucebase link (100 entries a request), then the year's events by date, then by name for the rest, about one request a second, shown in the background jobs popup with Stop. A "?" means MusicBrainz has no event (a click searches it), ⚠ that it did not answer (a click asks again). Answers are kept 90 days ("no event" 7 days), so a second visit asks nothing. New setting "MB-Event column: look the events up on MusicBrainz" (on by default); off, the ▶ MB button in the column's header runs the lookup.


## 9.99.1443 — 2026-10-24

**🚀 Feature**

- Brucebase: on every Brucebase page, resting the pointer (with Ctrl held, unless every preview shows on a plain hover) on a link to an event's page — a gig, no gig, recording, rehearsal, interview or "no Bruce" page — shows a card of that page. This includes the year table's Event and Venue columns, Notes, Recent changes and the wiki's own lists. The card shows when it was scheduled, who was on stage, the setlist and the page's images. Space pins it into a window with the whole setlist, the other shows at that venue, the recording, the stories and the eyewitness accounts, and its "Live page" view shows the wiki's own page. ← → step through the rows. New setting "Preview event pages on hover" (on by default), independent of the song preview. The Media icons keep their image cards.


## 9.99.1442 — 2026-10-24

**🚀 Feature**

- Brucebase year table: a new first column, Event, holds each entry's whole name, for example "1985-01-13 - Carolina Coliseum, Columbia, SC", linked to the entry's page. Venue, city and country are written the way their own columns write them, and pointing at the name shows it as the wiki writes it. Event is now the column that stays in view when you scroll sideways (Date was before), and it always shows the whole name on one line.


## 9.99.1441 — 2026-10-24

**✨ Improve**

- The 🖼 gallery on Discogs, the Springsteen sites and Brucebase can now be moved by its title bar (by touch too) and resized from its lower-right corner, like the window Space opens. It reopens where you left it, at that size, kept inside the browser window. Until you have moved or resized it once, it still opens under its 🖼 button. Its position and size go with the config export, as the other panels' do.


## 9.99.1440 — 2026-10-24

**✨ Improve**

- Brucebase year table: the Media column is now the second column, right after Date. Before, it came after Notes at the far right, so you had to scroll sideways to see an entry's icons.


## 9.99.1439 — 2026-10-24

**✨ Improve**

- Space on a hovered image now does what a click does: it opens the artwork viewer, instead of scrolling the page under the card. This works on Discogs' Image column, the Springsteen sites' image cells and Brucebase's Media icons, and on MusicBrainz's artwork icons, relationship-list covers, the images of an expanded cell and the sidebar cover. It works even when the card is switched off or still loading. On a card with more images than it shows, Space still shows them all first, as before. Space keeps its usual meaning while you type into a field, or with Shift, Ctrl, Alt or ⌘ held.
- The image card says so: its bottom line reads "Click or Space: viewer". On a card with more images than it shows, it stays "Click: viewer", because there Space shows the rest of the images.


## 9.99.1438 — 2026-10-24

**🐛 Fix**

- Brucebase year table: the Setlist icon in the Media column is now ringed like Photo, Ticket, News and Memorabilia when the entry has a page of its own. Pointing at it shows the handwritten setlists from that page (two on 1985-01-13, Columbia, SC), and a click opens them in the viewer. Before, the icon stayed plain, and the page's setlist images were counted as "Other".
- A ringed Media icon no longer shows the browser's own name tooltip on top of its image card. With the card switched off, the icon's name still shows on hover.


## 9.99.1437 — 2026-10-23

**🚀 Feature**

- Inside the preview window (the one Space opens), resting the pointer on a link now says what a click does. The window's bottom line names it — "Opens here: Label · Columbia" ("read before, no request" when it is), "New tab: …" for a link that leaves the page, "Viewer: Back · image 2 of 8" for an image — and links are marked at rest: a dotted underline for one that opens in the window, ↗ for one that leaves it, a ring for an image.
- A link that opens in the window shows its card there, as on the page (with Ctrl held unless "Show every preview on a plain hover" is on); Space opens it in the window, as a click does. An image shows large after a short rest on the picture itself (not on the space beside it), Shift larger, a click opens the viewer. ← Back and ‹ › say where they go.
- New setting "In the window, read a link ahead while the pointer rests on it" (off by default): a short rest on a MusicBrainz link reads it, so the click shows it at once; such links get a small green dot. Links to other sites are never read ahead.
- On a phone, a tap in the window stays a click; a long press shows the link's card or the image.


## 9.99.1436 — 2026-10-23

**🚀 Feature**

- A 🖼 gallery on the other sites' tables (springsteenlyrics.com, jungleland.it, brucespringsteen.it, Brucebase, discogs.com), as on MusicBrainz: the 🖼 after a table's row count opens a window with every image of the rows already read — by a hover, a click, or an earlier visit (read from this browser, no request). For the others it offers one button that says what it costs ("Load the other 32 (about 35 s)"; on Discogs without a token also what it would cost with one); a run over five minutes asks first, Stop or closing the window ends it, and the rows read stay read. A progress bar, counts and a Recent log show how it goes; a row that failed offers Try again. Type chips (Front, Back, Booklet; Photo, Ticket, News; primary, secondary …) narrow the images, "Compare two" puts two rows side by side, and a click on an image opens the artwork viewer, Shift+← → through the gallery's rows.

**🔧 Refactor**

- The foreign-image providers gained `peekSaved()`, `spacingS()`, `tokenSpacingS()`, `kept()` and their gallery words; `_fiDpPeek()` is the render sweep's saved-page read, now shared with the gallery; `_fiColIdx()` reads a table's column names once per header row. MusicBrainz: `updateH2Count()` re-anchors one more id prefix (`mb-fgal-btn-`), and `_fgalAfterRender()` beside `_dgMbAfterRender()` returns at once off the foreign hosts.


## 9.99.1435 — 2026-10-23

**🚀 Feature**

- springsteenlyrics.com lyrics index: a small 🖼 after each title stands for the song page's pictures (the covers of the albums a song is on, now and then a hand-written sheet). It is dashed until that page has been read, then shows how many there are, or disappears when there are none. Pointing at it shows them (a single picture large), a click opens the artwork viewer (Ctrl-click: the song's page). It follows the setting "Cover column: every image of an item on hover"; songs read before show their count at once, with no request.


## 9.99.1434 — 2026-10-23

**🚀 Feature**

- Brucebase song list: the same 🖼 after each title for the song page's graph and lyric sheets: dashed until read, then the count, gone when the page has none; a card on hover, the viewer on a click. Songs read before show their count at once, with no request.

**✨ Improve**

- The Brucebase song preview (card and window) now shows the song page's images too: the graph and the lyric sheets, which open the artwork viewer from the window. Pages saved before are read again once, because what is kept of a page has changed (the springsteenlyrics.com, jungleland.it and brucespringsteen.it pages too).


## 9.99.1433 — 2026-10-23

**🚀 Feature**

- Brucebase year pages: in the Media column the Photo, Ticket, News and Memorabilia icons are ringed and open what they announce. Pointing at one shows a card with those images from the entry's own page (photos, tickets, passes, newspaper clippings); a click opens the artwork viewer on them, every other kind one ← → away, and Shift+← → go to the previous or next row (Ctrl-click: the page). The page is read on that first hover or click only, one request for that row, kept 30 days. Works for every entry with a page of its own (shows, rehearsals, recordings …), on a year page and on "all years". New setting "Media icons and song glyphs: the page's images on hover" (on by default, the card only).

**🔧 Refactor**

- The foreign sites' image click (`_fiClick()`) builds a row when the viewer first shows it, not every row of the table up front, and a row with several triggers (a year row's Media icons) is one stop for Shift+← →. On a 10,348-row year table (four years cloned, Playwright Chromium) a click takes about 0.17 s after the first.


## 9.99.1432 — 2026-10-23

**🚀 Feature**

- jungleland.it list: a new Art column. Each row shows a dashed tile until its artwork page has been read, then the front scan and the number of scans. Pointing at it shows a card with every scan, typed as on MusicBrainz (Front ★, Back, Medium for a CD, Booklet), and a click opens the artwork viewer on them (Ctrl-click: the entry's page). The page is read on that first hover or click only, one request for that row. New setting "Art column: every scan of an entry on hover" (on by default, the card only).
- brucespringsteen.it records: a new Photo column, the same way: a dashed tile until the record's page has been read, then its photo or "no photo" (many records have none; a photo the site hides as missing counts as none). Pointing at it shows the photo large; a click opens the viewer. New setting "Photo column: the record's photo on hover" (on by default, the card only).
- On both sites, rows read before keep their picture: after the table appears, one read of the saved pages paints them, with no request to the site. Sorting by the Art/Photo column puts the rows with a picture first.

**✨ Improve**

- jungleland.it and brucespringsteen.it now keep a page they read for half a year instead of 30 days (the preview and the new columns share it): these sites barely change. springsteenlyrics.com and Brucebase keep 30 days.

**🔧 Refactor**

- The springsteenlyrics.com, jungleland.it and brucespringsteen.it image cards are built by one function (`_fiDpProvider()`) over the detail preview's page reader. `_sortCellText()` also reads the new hidden `.mb-fi-sort-key`: one more class in its one lookup; the MusicBrainz sort timing was compared before and after.


## 9.99.1431 — 2026-10-23

**🚀 Feature**

- springsteenlyrics.com lists (collection, latest additions, bootlegs, CD and vinyl bootlegs): pointing at a cover shows a card with the cover and every artwork scan of that item, as the Cover Art column does on MusicBrainz (Space: every image, Shift: bigger tiles). The scans are read from the item's own page on that first hover, one request for that row only, kept 30 days and shared with the item preview; moving on before its turn asks nothing, and a bootleg the list marks as having no artwork is never asked. New setting "Cover column: every image of an item on hover" (on by default, inside the site's own switch).
- A click on a cover opens the artwork viewer on that item's cover and scans: ← → through its images, Shift+← → through the rows the filter left, an "Item page" button. Ctrl-click (or a middle click) still opens the item page.

**🔧 Refactor**

- Discogs' Image column card and viewer click now run on one shared path for every non-MusicBrainz site (`_fiCardHtml()`, `_fiClick()`, `_fiLoad()`, a provider per site), which the jungleland.it, brucespringsteen.it and Brucebase tables will use next. Its click listens on the window instead of the document. Unchanged on Discogs, except that a row with no other image now shows its thumbnail beside the note. Nothing changes on MusicBrainz, and nothing new runs while a table renders.


## 9.99.1430 — 2026-10-23

**🚀 Feature**

- An entity's Open edits page (the sidebar's "Open edits", e.g. /artist/&lt;id&gt;/open\_edits or /recording/&lt;id&gt;/open\_edits) gets a "Show all Open Edits" button: every open edit as one row of a filterable, sortable table, the same as the entity's Edits page already gets.
- The sidebar's "Open edits" link now has a preview like "Editing history" beside it: hover for a card (how many edits, how many open, the latest, the commonest types), press Space for the window listing them, titled "Open edits".


## 9.99.1429 — 2026-10-23

**✨ Improve**

- A fetch now runs inside the button you pressed. It fills blue page by page and reads "■ Stop · 3 / 40"; the line under the heading says which page, how many rows so far and about how long is left. Click it again to stop (or Ctrl+M then O): the page under way finishes and what has arrived is shown, and the status line says "Stopped by you after page n of N … — the rest was not loaded" instead of reading like a complete run. While the rows are being built it is striped (the stripes move only if your system allows motion), then it is the button it was. The other fetch buttons wait meanwhile. The separate red Stop button and the long progress bar beside the heading are gone, and so is the "Stop button colors" setting (its stored value is removed by itself).
- A fetch that could not load every page now leaves a red "🔄 N ▾" on the SAED button, N being the pages missing, also listed under "Needs attention" in the ☰ menu. Its list says which page failed and why, and "↻ Load the N missing pages" carries on from there, keeping the rows you have — what the "↻ Load remaining pages" button at the end of the status line did. It goes away when that load starts, when you press a fetch button again, or when you load a file from disk.

**🐛 Fix**

- On a phone, the ☰ SAED menu could open below the bottom of the screen on a page wider than the screen (a release group's releases, for example); it now opens within what you see, above the button when there is no room below. On a phone the fetch buttons are always in that menu, under "Load", because MusicBrainz pages are laid out at the phone's width.


## 9.99.1428 — 2026-10-23

**🚀 Feature**

- One button in the page heading: the SAED button. Everything the script adds there is now ONE segmented button with up to four parts, each doing its own thing: the page's fetch buttons as before ("🧮¹ Artist \| 🧮² Various Artists"), 📀 Discography with the view it shows (release groups of an artist only), one part per thing that needs your attention (❌ 1 ▾ for errors, ⚠️ 43 ▾ for warnings, each opening its list right under it), and ☰ SAED ▾, the script's menu. 📦 Data ▾, 🛠 View ▾, the ⚙️ and ❓ buttons and the separate WARNING / ERROR buttons are gone into it.
- The ☰ SAED menu has groups with a rule between them: Needs attention (the same lists as the parts on the bar), Data (Save to Disk, Load from Disk, Export ▸), View (Density, Statistics, Keyboard Shortcuts), Help (Settings, Help ↗) and Changelog (What's new ↗, Full development log ↗), with the installed version at its foot. Before anything is loaded there is nothing to view, so View is left out and Keyboard Shortcuts sits under Help. Export ▸ opens its four formats beside the menu when the pointer rests on it (or with → or a click); on a phone or a narrow window they open in place under the row. ↑ ↓ move, → opens, ← or Escape goes back, a second Escape closes the menu.
- Hovering ☰ SAED shows a card with the script's full name, version, library version, script manager and its version, browser, author, and that it was written with AI help from Claude (Anthropic).
- The menu's name is a setting: ⚙️ Settings → 🖌️ ELEMENT UI STYLES → "Name of the ☰ menu" (default "SAED"). The button's colours are "SAED button colors" there (formerly "Toolbar menu button colors").
- On a narrow window (520 px or less) the fetch buttons leave the bar and head the menu as a "Load" group, so the button stays one line.
- Help and the changelog open on GitHub, in a new tab. ❓ Help ↗ (and Ctrl+M then H) opens the help page; Shift-click no longer renders it inside the page. The changelog is two pages: "What's new", the changes of each published version in plain words, and the "Full development log" with every version and its technical details, one page per month. The Tampermonkey menu's "📜 ChangeLog" opens the SAED menu on these two (on the pages the script works on).

**⚡ Performance**

- The changelog is no longer downloaded, stored and read on every page. The library used to fetch the whole changelog (1.75 MB) about once an hour, keep it in the script's storage — which Tampermonkey hands to every page the script runs on — and read it on every page for a dialog most visits never opened: about 9 ms (34 ms on a slow computer) before a page settled and about 6.5 MiB of memory per tab. The stored copies of the changelog and of the help text are deleted when a page starts.

**🔧 Refactor**

- Retired settings: the colours of the Settings ⚙️, Help ❓, Save and Load buttons and the "\|" divider style. Those controls are rows of one menu in one look now; anyone who had chosen their own colours there loses them. Their stored values are deleted when a page starts.


## 9.99.1427 — 2026-10-23

**⚡ Performance**

- Values the script stored once and nothing reads any more are now deleted when a page starts (a moment after it settles, so the page is not slowed). Tampermonkey hands everything a script has stored to every page it runs on, before the script starts, so a leftover is paid for on every page view. Two kinds go: the old plain-text help cache (replaced by the Markdown help in 9.99.1148, up to 50 kB), and the hand-off copies of a table that "Show single-table" leaves behind when the new tab was blocked or closed before it loaded, which can be megabytes each; one older than an hour is deleted, a younger one is kept for a tab that may still be loading. Settings are not touched.


## 9.99.1426 — 2026-10-22

**🚀 Feature**

- An editor's other edit lists get a button too: the accepted, auto-edits, applied, rejected, failed and cancelled edits (/user/&lt;name&gt;/edits/&lt;status&gt;) and the edits they voted on (/user/&lt;name&gt;/votes), the "view" links of a profile's Statistics. Each one loads every page into one table, the way "Show all Edits for User" already did for their edits and open edits.


## 9.99.1425 — 2026-10-22

**✨ Improve**

- Brucebase recent changes: the Flags column is a multi-row column now. A change with two flags ("content source text changed" and "title changed") shows the first one with a ▶ toggle to open the other, and the column header can open or close them all and counts them, like MusicBrainz's list columns.


## 9.99.1424 — 2026-10-22

**🚀 Feature**

- Link previews: an artist's, label's, series' or collection's sidebar "Subscribers" link now has a card and a window, like an editor's subscribers: how many are subscribed, how many anonymously, and their names. The "Found in N user collections" link of any entity has one too: how many collections hold it, how many of them are private, and the first few by name and owner; the window lists every public collection with its owner, and a click on either opens their card.


## 9.99.1423 — 2026-10-22

**🐛 Fix**

- Release and release group collections: the "plus N other private collections" row no longer comes back as a table row after a sort or filter; it stays folded into the line above the table. An entity in no collection no longer offers a Collections button with nothing to show, and neither does a subscribers page without subscribers.


## 9.99.1422 — 2026-10-22

**🚀 Feature**

- New pages: the "Found in N user collections" page of an area, artist, event, instrument, label, place, recording, series or work (the link in its sidebar) becomes a filterable Collection \| Editor table, like a release's. The "Subscribers" page of an artist, label, series or collection becomes a table of its subscribers, like an editor's, with the anonymous subscribers counted in the line above it.


## 9.99.1421 — 2026-10-21

**🚀 Feature**

- Link previews: an editor's own tag (the links of /user/&lt;name&gt;/tags, e.g. /user/vzell/tag/acoustic%20rock) now has a card and a window, read from its page: what that editor tagged with it, how many entities and of which kinds, the first few on the card; in the window each kind's first entries, its "See all" page, and "Everyone's" to open the tag's own card. Works on the tags page as it loads and after its table render.


## 9.99.1420 — 2026-10-21

**✨ Improve**

- Link previews: every box stacked above a hover card now opens with a kind line and a thin line under it, as the card does since 9.99.1418: "Finding", "Note", "Track ≠ recording", "Link title", "Link" (a link's own card, a Relationships icon) or "Filter".


## 9.99.1419 — 2026-10-21

**🚀 Feature**

- Release tracklist: hovering a live track's "\#" cell now also shows the event the track was recorded at, in a card stacked right above the release group card: its name, type, date, place, tour, line-up and the start of its setlist, as the event link's own preview shows them. With the kind line of 9.99.1418, the two cards read "Event" and "Release group". The first hover on a track of an event asks MusicBrainz once, after the release group search and at the same one-a-second pace; the answer is kept like the other previews. A track whose event is only named in its comment shows no event card. New setting "Show the track's event above the "\#" release group card" (💿 RELEASE TRACKLIST), on by default.


## 9.99.1418 — 2026-10-21

**✨ Improve**

- Link previews: every hover card now opens with a kind line, the entity's icon and its kind ("Recording", "Release group", "Event"), the same words as the window's title bar, so the card says what Space will open. Cards of other sites get it too ("Discogs release", "Wikipedia"), without an icon. The icon moved out of the title into that line; the loading and failed cards no longer repeat the kind under the title.
- The release page's release-group cards (the subheader link and the "\#" cell of a live track) now carry MusicBrainz's release-group icon, in the card and in the window's title bar.


## 9.99.1417 — 2026-10-21

**✨ Improve**

- The Length column's header tooltip now follows the ⏱ millisecond toggle. On a release tracklist it used to say "rounded to the nearest second, so 4:50 can be anything from 4:49.500 to 4:50.499" even while the column showed milliseconds. With ⏱ on it now says the value is shown with milliseconds, the precision MusicBrainz keeps, and that ⏱ switches back to whole seconds; the Recording length tooltip says the same. On the other pages with a ⏱ button, the Length description (9.99.1406) changes from "minutes and seconds" to "minutes, seconds and milliseconds" in the same way.


## 9.99.1416 — 2026-10-21

**🐛 Fix**

- Since 9.99.1406, on pages where MusicBrainz marks the Length column itself (an ISRC page, the relationship overviews), the first filter keystroke removed MusicBrainz's own class from the Length header and its new tooltip with it. The jesus2099 clean-up took that tooltip for the "SUPER MIND CONTROL" plugin's, because only one older kind of the script's own tooltips counted as ours. Every tooltip the script writes now counts, so both stay.


## 9.99.1415 — 2026-10-21

**🚀 Feature**

- New page type: one version of an annotation ("View this version" on an annotation history, or "View current revision") gets a "Compare with the current version" button. It shows who wrote the version and when, and a table with one row per paragraph or heading: this version's text, the current version's text, and whether it is the same, changed, only in this version or only in the current version. Point at "changed" to see both texts with the difference marked. Both are read from the page itself.


## 9.99.1414 — 2026-10-21

**✨ Improve**

- The sidebar picture and its copy beside the name now show the same hover card as an image in a CAA/EAA column, instead of a one-line tooltip: an artist's photo, a label's logo or a place's picture from Wikimedia Commons, and an instrument's IROMBOOK drawing, with the picture, where it comes from and its file name.
- Release, release group and event pages: pointing at the cover beside the name, or at the sidebar's own cover, shows the CAA/EAA column's card of every image of the release (or the event's event art), asked for on that first hover; Space shows them all, Shift bigger. A click on either opens them all in the artwork viewer, starting at the front, instead of MusicBrainz's own window; Ctrl-click on the sidebar's cover still opens MusicBrainz's. Event pages now get the cover beside the name too.


## 9.99.1413 — 2026-10-21

**🐛 Fix**

- MusicBrainz's own pop-up windows, such as the one a click on the sidebar's cover opens on release, release group and event pages, now cover the whole page. The script's buttons beside the title, the headings that stay at the top while scrolling and the sidebar handle no longer show through them.


## 9.99.1412 — 2026-10-21

**✨ Improve**

- The live near misses get the rich comparison card: a recording comment that "almost follows 'live, YYYY-MM-DD: Venue, City, …'", and a release, release group title or event name that starts with a date but is not quite in the live form, now show the text over the form it almost has, the difference marked ("live, 1993-4-21: …" over "live, 1993‐04‐21: …", "Live, …" over "live, …", "1975‐02‐05 The Main Point, …" over "1975‐02‐05: The Main Point, …"). Only a fix that cannot be read two ways is proposed, and only when the result is itself in the live form; when there is no single answer ("05.02.1975": which part is the day?), the text shows in one row with the part to rewrite marked.


## 9.99.1411 — 2026-10-21

**✨ Improve**

- Release tracklist: the hover card of a "Live credit without a date" cell now names the date the credit is most likely from: the recording's own "live recording of" date, which the credit was checked against ("⚠️ Live credit without a date: probably 1988-04-27, …"). It stays there after filtering, sorting and loading the page from disk.


## 9.99.1410 — 2026-10-21

**✨ Improve**

- Link previews for annotations: "View annotation history" (under an annotation and in the sidebar, on every kind of page that has one) shows how many versions the annotation has and the latest one's date, editor, changelog and first lines; its window lists every version, newest first, and a version opens its own card. MusicBrainz shows the history only to a logged-in editor, and logged out the card says so. "View this version" and "View current revision" show that version's date, editor, changelog and text. An annotation is copied as plain text, never as markup.


## 9.99.1409 — 2026-10-21

**✨ Improve**

- Release and release group pages: the front cover from the sidebar now also appears at the start of the page heading, as an artist's photo, a label's logo or an instrument's drawing already did, so it stays in sight with the sidebar closed. A click, Enter or Space on it opens all of the release's Cover Art Archive images in the artwork viewer, starting at the front cover; they are asked for on that click only. The sidebar's own cover keeps MusicBrainz's link. Switches: "Sidebar picture: hover card and viewer" and "Sidebar picture beside the name".


## 9.99.1408 — 2026-10-21

**✨ Improve**

- Link previews on an editor's profile, "Tags and ratings": the "view" beside Tags upvoted shows how many tags and genres they voted for and with how many votes, the most used first; a tag opens its own tag card. The "view" beside Ratings shows their ratings as their ratings page does, a few per kind with their stars; an entity opens its own card. The stars on MusicBrainz's page are links that change a rating, and the window never copies them. Downvoted tags have no preview.


## 9.99.1407 — 2026-10-21

**✨ Improve**

- Link previews on an editor's profile: every "view", "N%" and "View all" link of the statistics now has a card and a window. An editor's Open, Accepted, Auto-edits, Applied, Rejected, Failed and Cancelled edits, their Votes, and every edit search ("Last 24 hours", the edit types' percentages) open in the editing-history window, titled by what they list. An edit search is read again on every page load. The two "view list" links show the editor's subscribers (names, and how many are anonymous; a name opens that editor's card) and your authorized and registered applications (name, access, last token, digest authentication). An application's OAuth client ID or secret and its "Revoke access" link are never shown, and that page is never kept after a page load.


## 9.99.1406 — 2026-10-21

**✨ Improve**

- Column header tooltips name their column in bold, with the explanation below it. This applies to every column the script adds (derived, extracted and injected columns such as Event-Date, MB-Name, Recording of), and "Work" / "Perf." (9.99.1404) show their full names there.
- MusicBrainz's own columns now have a header tooltip too, saying what the column holds: Artist, Title, Catalog\#, Country/Date, Format, Tracks, ISRCs, Rating and about 60 more. Where a name means different things the text fits the table: "Type" on an artist's Events page is the kind of event, on a release-group list the primary and secondary types. New setting "Explain MusicBrainz columns in header tooltips" (🎨 UI FEATURES, on). Not on other sites, whose columns these texts do not describe. A pageType can add or override texts with features.columnDescriptions.


## 9.99.1405 — 2026-10-21

**🐛 Fix**

- Fixed a test flake in discogs-links.spec.js ("in the history window: … a support link with its section"): it failed about 1 run in 28 when many tests ran in parallel. The help-centre window asks for the site's icon after the article answers. Under load that icon request (support.discogs.com/favicon.ico) arrived before the check that only the article was requested. The check now leaves the icon request out; icons have their own tests in popup-ext.spec.js. The userscript is unchanged.


## 9.99.1404 — 2026-10-21

**✨ Improve**

- Recording lists: the "Recording of" and "Performance attributes" column headers now read "Work" and "Perf.", so the two columns take less width. Hover a header to see its full name. Menus, the 📊 drop-down, exports and the Default Hidden Columns table still use the full names. To get the full names back in the headers, turn off the new setting "Short column header labels" (🎨 UI FEATURES, on by default).
- Short header labels work for any column. A pageType gets its own with features.columnLabels; the built-in ones are in \_COLUMN\_LABELS. A saved table keeps each labelled column's name, so Load from Disk restores it.


## 9.99.1403 — 2026-10-21

**✨ Improve**

- The sidebar's ◀/▶ handle is there as soon as a supported MusicBrainz page opens, before any button is pressed, with the sidebar open and the page laid out exactly as MusicBrainz draws it. Once a button has rendered the table, "Start with sidebar collapsed" closes it as before. New settings: "Sidebar handle before a button is pressed" (on) and "Start with sidebar collapsed before a button is pressed" (off).


## 9.99.1402 — 2026-10-21

**🚀 Feature**

- Two new switches for the link previews (⚙️ → 🔎 LINK PREVIEWS ON MUSICBRAINZ, both on by default): "Link previews (hover card and Space window)" turns every hover card and Space window off at once, and the script then adds nothing for them to the page; "Link previews also before a button is pressed", off, keeps a supported page as MusicBrainz draws it until a button has rendered the table.


## 9.99.1401 — 2026-10-21

**✨ Improve**

- The Relationships column's ⚠️ WARNING "Several Discogs links in Relationships" is now "Several links to one site in Relationships": two or more different links to ANY one site (two Discogs pages, two amazon.de products, two pages of one Bandcamp artist, …) flag the cell. A site is the host without "www.", so amazon.de and amazon.com, or music.apple.com and itunes.apple.com, stay one link each and never flag. The cell's tooltip and the icon's popup name every site involved with its links. Its two switches keep their saved values; the new setting "Sites allowed more than one link in Relationships" lists hosts that never count.


## 9.99.1400 — 2026-10-21

**🐛 Fix**

- Relationships column: hovering a cell's ⚠️ (several Discogs links) no longer replaces it with the reload ⟳ at the cell's right edge. The ⚠️ stays at the right edge, the ⟳ appears right after the icons as on any other cell, and the cell's tooltip keeps the warning above the reload hint instead of losing it.
- Relationships column: the popup of an icon in such a cell now starts with the warning itself, with the links involved and the icon you point at marked, under a link preview card as well as without one. Only the ⚠️ WARNING menu showed it before.


## 9.99.1399 — 2026-10-20

**✨ Improve**

- A collection's link preview now reads the collection's own page instead of the Web Service, which knows only its name, type, size and owner. The card shows the type, size and number of pages, whether it is public, the owner and the collaborators, the first two lines of the description and the first eight entries. It is still one request, through the same once-a-second gate.
- The collection window (Space) shows the whole description with its links, and the entries 25 at a time with the page's own columns (without the rating stars) and ◀ ▶ to page through them. MusicBrainz shows 100 entries a page, so the next page is read only when the pager gets there. A release or release group collection also shows those 25 entries' covers from the Cover Art Archive. A release group collection's page splits its entries into one table per type; the window lists them together with the type as a column.
- When a collection cannot be read (someone else's private one, or one that was removed), the card says it may be private or no longer exist, and the next hover asks again. Other userscripts' additions to a collection page are never read.


## 9.99.1398 — 2026-10-20

**🚀 Feature**

- Editor profiles (/user/&lt;name&gt;) get a Profile button. It reads the page you are on, nothing is fetched, and shows General information, Edits, Votes, Added entities and, when the profile has it, Tags and ratings as sub-tables under one Profile heading, with the usual filters, sorting and 📊 dropdowns. Counts sort as numbers; a count's share and its "view" link have their own columns; the bio is clamped with a more toggle.
- Blocks other userscripts add to a profile (an Edit Notes list, highlights, flags) stay where they are and are never copied into the tables.


## 9.99.1397 — 2026-10-20

**✨ Improve**

- Pressing an action button a second time still reloads the page (that is what keeps the column filters working), but the reloaded page now runs the same button by itself: no more "⚠️ Page Reloaded" dialog to dismiss and button to press again. A short note beside the status line ("↻ Page reloaded — re-running …") says what is happening and fades after about 3 seconds. The dialog remains only as a fallback when the button cannot be found again.
- The reload now happens before anything else a press does. It used to come after the other sections had already been removed from the visible page and, on an artist's release groups, after a whole pass of page requests for the official headers, all of which the reload then threw away.


## 9.99.1396 — 2026-10-20

**✨ Improve**

- Three more warnings show the rich comparison card instead of a sentence only. "Live title date uses "-"" (release and release group titles, event names, recording comments): the text over the same text with "‐" in its date, only the date's hyphens marked — a hyphen in the venue stays. "Extra title information starts uppercase": the title over the same title with its keywords in lower case, "(Live in Asbury Park 2009)" over "(live in Asbury Park 2009)". "Title truncated with "…"": the title in one row with the "…" marked, since the full title is not on the page. The cards also show in the note box above a link preview.


## 9.99.1395 — 2026-10-20

**🚀 Feature**

- MusicBrainz pages: "Aa Check title style (MB guidelines)" at the top of the ⚠️ WARNING menu checks every title on the page against the MusicBrainz style guide and adds five warnings: "Title not in MB title case" ("Prayer For The Weary" → "Prayer for the Weary"), "ASCII punctuation in title" ("Don't" → "Don’t", " - " → " – ", "..." → "…"), "Series number without comma" ("Broadcasts Vol. 5" → "Broadcasts, Vol. 5"), "Featured artist in title" and "Extra title information to remove" ("(bonus track)", "\[… Cover\]"). Each filters the page from the menu and from the column's 📊 Findings - Warning section, and the hover card shows the title over its MusicBrainz style with only what differs marked. Only certain cases are flagged: titles in another language or in sentence case, live bootleg titles, phrasal "Take On Me", "& The E Street Band", lower-case words in "(…)" and anything in "\[…\]" are left alone.
- The check runs only when asked for, since it costs about 0.2 s per 10,000 different titles; it then stays on for the page until a reload, and the menu row shows how many titles it checked and how long that took. ⚙️ Settings → ⚠️ Findings → "Check title style automatically" (off by default) runs it on every load; each of the five warnings and their tint have their own switches there. The WARNING menu now shows on every MusicBrainz page with titles, to offer the check.

**🔧 Refactor**

- scripts/check-mb-title-case.js --mb-sample runs the checker over the MusicBrainz titles of the snapshots and times it; scripts/mutations/foreign-titles.json: one entry's anchor followed the rename to \_mbSiteTitleTip().


## 9.99.1394 — 2026-10-20

**🐛 Fix**

- Event pages: after "Show all Relationships for Event" the read-only "Sidebar" section now sits above the Relationships tables, as it does above the data on every other page, instead of below all the event tables. On an event page "Relationships" is the table itself, which the placement mistook for a side section.


## 9.99.1393 — 2026-10-20

**🚀 Feature**

- Link preview window: a new "✎ Editing history" button (or press H) shows the entity's editing history in the same window, laid out like a Discogs release's history. Every entity with an MBID has one (not a collection), and so does an editor. The list has one row per edit (date, editor, a coloured type pill, what changed with the editor's note, votes or status), with chips for category and status and a Newest/Oldest switch. Click a row (or use ↑ ↓) to see that edit below: old and new values side by side with MusicBrainz's red/green marks, an edit medium's tracklist split into its old and new halves, a merge as Merge \| Into, an addition or removal in one column, then the edit notes. "Only what changed" is on by default. Cover and event art open in the artwork viewer, "Edit \#…" opens the edit's own card in the window, and ← Back returns.
- "Load page 2 of 7" reads the next 50 edits. A busy entity only says "at least 500", so its footer has no last page. Each page is one request and selecting a row asks for nothing. A page with an open edit is read again next time, because its votes change. Logged out, the window says that MusicBrainz hides editors and notes.
- The sidebar's "Editing history" link and an editor window's "Their edits" link now have a card of their own and open the same window.

**🐛 Fix**

- A dialog no longer closes when a button inside it is pressed with the keyboard (Enter on a focused chip in a Discogs history window, for example) and the button redraws its part of the dialog.

**✨ Improve**

- An edit, editor or tag card that gets MusicBrainz's "Verifying your browser" page instead now says so: open the page once in a tab, then press ⟳.


## 9.99.1392 — 2026-10-20

**🚀 Feature**

- CAA/EAA artwork card: press Space while it shows to see every image, not just the first 12 and a "+N" (Space again goes back to 12). The card cannot scroll, so it shrinks its tiles until it fits the window. Space keeps its usual meaning when nothing is cut off, while you type into a field, and while a link preview card shows.
- CAA/EAA artwork card: hold Shift to draw its tiles bigger (new setting "Tile size in the artwork card while Shift is held", 150 px). This also works when Shift is already down as the pointer reaches the icon, and it combines with Space. The tiles are the thumbnails the card already loads, so this costs no request.
- The same Space and Shift keys work on the artwork cards of the relationship-list covers and of discogs.com's Image column.


## 9.99.1391 — 2026-10-20

**✨ Improve**

- Instrument pages: the IROMBOOK drawing MusicBrainz shows at the top of the sidebar now works like an artist's or label's sidebar picture — a hover card, a click (or Enter/Space) opens it in the artwork viewer, and a small copy leads the page heading on every instrument tab, before and after the table is loaded. The copy shows the whole drawing instead of cropping it, and the viewer bar has no Commons link (a drawing has no Commons page). Same switches: 'Sidebar picture: hover card and viewer' and 'Sidebar picture beside the name'.


## 9.99.1390 — 2026-10-20

**🚀 Feature**

- The "Recording of" and "Performance attributes" columns, so far only on an artist's Recordings page, are now on every list with one recording per row: recording search results, an instrument's Recordings, a series or collection of recordings, an ISRC page, an area's Recordings, a place's Performances, a work's recordings, tagged recordings (yours or everyone's), your rated recordings and an artist credit's recordings. They follow that page's own recording column (Name, Title or Recording) and load only when you click a cell's 🎼 or the header's ▶🎼, as before. A work page and a collection load many rows with one request where that is cheaper; every other page looks up one row per request. Work suggestions stay on the artist's Recordings page, the only list with a single artist. Each page group has its own checkbox under ⚙️ Settings → 🎼 RECORDING OF COLUMN (all on by default), and the first checkbox still turns the columns off everywhere.


---

**Older versions:** [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

*Generated from ShowAllEntityData_CHANGELOG.json by scripts/build-changelog-pages.py — do not edit by hand.*
