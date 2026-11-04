# ShowAllEntityData — Full development log

Every version, newest first, with the technical details behind each change. For what changed for you in each published release, in plain words, see [What's new](ShowAllEntityData_RELEASES.md).

**Months:** [November 2026](ShowAllEntityData_CHANGELOG/2026-11.md) · [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

This page shows the newest 100 of 1710 versions; the month pages hold all of them.

---

## 9.99.1539 — 2026-11-04

**🚀 Feature**

- Discogs release page: a new first button, Tracks, shows the release the way a MusicBrainz release page does, from one request. There is one table per disc or record (a vinyl record's two sides are one table, as on MusicBrainz), named like "Disc 1 · CD · 49:50" and after Discogs' heading when there is one per disc; headings inside a disc fill a Section column. The credits become columns, one line per name: Instruments, Vocals, Producer, Engineer, Mixed by, Arranged by and Other credits. A track's own credits and the release credits that name it ("A1 to A4, B2 to B4") both land on it; the credits naming no track form a Release credits table. Above the tables, as on a MusicBrainz release: "\~ Release by …", Notes (closed to start with), Details (on the left Release, External links, Genres and styles, Contributors and Community: Discogs' Statistics box with its links, and the copies for sale; the Identifiers on the right) and Images. The previous view, without its tracklist, is the second button: Credits, versions. Its labels, formats, country, year, genres and styles and the links in the notes are links, as on Discogs' page, and preview like the tables' links.


## 9.99.1538 — 2026-11-04

**✨ Improve**

- archive.org item page: the part above the tables is laid out like a MusicBrainz release page. Under the title a line "\~ Concert recording by … (date: venue)", then three sections that fold like the release page's: Description (the uploader's text, closed to start with, like a release's Annotation), Details (the facts as cards in the look of the release page's Sidebar section: Show, Item, External links, Collections, Lineage; a click on a card's heading folds it) and Pictures (the scans as tiles, like the release page's Cover art; a click opens the viewer). Typing in a filter no longer rebuilds them.


## 9.99.1537 — 2026-11-04

**✨ Improve**

- Brucebase: link previews on every page of the wiki, not only on its song list, Relations, Recent changes, the year pages and the start page. On a show, venue, person or song page, rest the pointer on a link for Brucebase's own card (or another site's, Wikipedia for example), and Space opens the window. Nothing else changes on those pages: no buttons, no toolbar.


## 9.99.1536 — 2026-11-04

**🚀 Feature**

- archive.org item pages (archive.org/details/…) get two buttons, built like MusicBrainz's release page. "Tracks" lists a show's songs in one table per disc, each named with its format and running time: \#, Title (with the item's card), Length, the file and its size, a column for each copy archive.org made (VBR MP3, …) and ▶ to play the song in archive.org's player. Above the tables: the item's pictures (a click opens the viewer) and its facts (date, venue, source, taper, running time, Brucebase and Databruce links, collections, lineage). A video item lists its video files with a "Play here" tile. "All files" lists every file of the item with its format, size, length and MD5. Both read the item in one request. Before any button, the item page's own links have cards too, its Brucebase link for example.


## 9.99.1535 — 2026-11-04

**🐛 Fix**

- setlist.fm windows, "Load all": Stop could still let one more page through. A page waiting its turn (one request a second) when you pressed Stop was read anyway, about half a second later. Now Stop finishes only the page already asked for; the next one is never asked, and "Load all" offers it again.


## 9.99.1534 — 2026-11-04

**✨ Improve**

- Link previews on other sites, before you press a button: on a Discogs search page a result's title has its card; on setlist.fm the site's own list does too (a setlist's Tour link, the venue box's website and Wikipedia links; a setlist's own link with the setlist.fm key), but not the Upcoming box's ticket links; on an archive.org search page the site's own result list does (an item's picture or title in any view, next to archive.org's own hover card; not its menu bar), although archive.org builds it in a way the previews could not reach before. On Discogs' older pages (submissions, history, images, user, ratings, sell) the MusicBrainz icons of murdos' importer get MusicBrainz's card there too.
- Inside a preview window, more links open in the window instead of a new tab: a MusicBrainz link on springsteenlyrics.com, jungleland.it, brucespringsteen.it, Brucebase and archive.org now opens MusicBrainz's own window, as on discogs.com and setlist.fm (its Live page and editing history are read with your musicbrainz.org login, as there). A Brucebase gig, venue or person page now shows Brucebase's own card and window wherever you are, on MusicBrainz too (under "Preview event, venue and people pages on hover"), so a Brucebase show window's own gig page opens in the window. On Brucebase itself, a show link of the form brucebase.wikidot.com/1985\#130185 in a window opens that show in the window.
- A Discogs window opens a clicked link in the window even before its record has loaded; until now such a click opened a new tab.

**🐛 Fix**

- "All credits on Discogs ↗" in a Discogs artist window opened the same artist again inside the window; it opens Discogs' credits page in a new tab, as its ↗ says. The same for "A table: show it on Wikipedia ↗" in a Wikipedia window, which could reopen the same article in the window when the article had been reached by a redirect or another spelling of its name.

**📝 Docs**

- The non-MusicBrainz coverage report (NON-MB-COVERAGE.html / .org, built from docs/non-mb-coverage.json) lists no open gaps: G1 to G8 of the first report are fixed. scripts/probe-ia-shadow-links.js is a console probe for archive.org's search page, to confirm the shape of its result links in a real browser.


## 9.99.1533 — 2026-11-03

**🚀 Feature**

- setlist.fm artist, venue, tour and search windows (link preview): next to "Load 20 more", "Load all N" reads every other setlist, one page a second, and "Load all with set times" reads their set times as well. Each button says how many requests that takes and about how long. While it runs, a bar per site fills, the counts say how many are loaded, how many are left and about how long it still takes, and Stop ends the run after the page under way. Pages already read are kept, so the next run only reads what is missing. After "Load all" the set times of the newly loaded rows show "·", and "Read set times for the other N" reads them.
- setlist.fm's API allows a key 1,440 requests a day. The window counts the requests the script made today (from midnight UTC), shows "API requests today: n of 1,440", and before a run that would need more than are left it says so and offers to load as many as are left instead. A run stops when the day's requests are used up.


## 9.99.1532 — 2026-11-03

**✨ Improve**

- setlist.fm setlist window: every artist (the show's own, each cover's original, each guest) is now two links: MusicBrainz's artist icon in front opens the artist on MusicBrainz (its card when you point at it, its window on a click), and the name opens the artist's setlists on setlist.fm. Both open in the same window, with Back. The same in a tour's window and in a venue window's "Artists" table. "· its setlists" after the setlist's artist is gone: the name opens that page.
- On setlist.fm itself, MusicBrainz links in the preview window now open MusicBrainz's own card and window, as on discogs.com (an artist window's "On MusicBrainz" too), instead of a new tab.


## 9.99.1531 — 2026-11-03

**🐛 Fix**

- setlist.fm: the card of a Tour cell (setlist.fm's search for an artist's tour) said "checked by AWS WAF" instead of showing the tour. setlist.fm answers its search pages only when the request carries the browser's setlist.fm cookies; the card now reads them as the page does on setlist.fm, and with your setlist.fm cookies elsewhere. A tour window's set times, which come from the same search pages, are read the same way.


## 9.99.1530 — 2026-11-03

**✨ Improve**

- setlist.fm setlist window (link preview, with your setlist.fm API key): every song has a ▶, as on setlist.fm itself. A click finds the song on YouTube (YouTube's own search for the artist and the song, its first video) and plays it in the window, above the setlist, in the same player as YouTube links and archive.org tracks; a second click stops it, and a song played once starts at once the next time. A song YouTube finds nothing for is marked, and its next click opens YouTube's search in a new tab. Follows the setting "Play YouTube videos in place"; with it off, no ▶.


## 9.99.1529 — 2026-11-03

**🚀 Feature**

- setlist.fm: a search for an artist's setlists (setlist.fm/search?artist=…, with or without a tour, country, city or venue) gets the same "Setlists" button as an artist's page: every setlist of the search as one table, named after the search's choices ("setlist.fm search: Bruce Springsteen · Land of Hope & Dreams American Tour").

**✨ Improve**

- setlist.fm links: a link to setlist.fm's search for an artist's setlists — every Tour cell of the setlist.fm tables links one — now has its card and window like the other setlist.fm links, also without an API key: they are read from setlist.fm's search page itself. The window lists the search's setlists with their set times, 10 at a time ("Load 10 more"), with the tours and venues on the left.


## 9.99.1528 — 2026-11-03

**🐛 Fix**

- setlist.fm tables: the page now scrolls sideways, so a table wider than the window can be read to its last column. setlist.fm's own stylesheet turns sideways scrolling off for the whole page.
- setlist.fm tables: a show at a stage inside a venue ("NAC Opera Hall at National Arts Centre, Ottawa") no longer repeats the venue in the Event column.


## 9.99.1527 — 2026-11-03

**🚀 Feature**

- setlist.fm: on the list of a venue's setlists (setlist.fm/venue/…) or an artist's (setlist.fm/setlists/…), a new "Setlists" button lists every setlist as one filterable, sortable table: date (linked to the setlist), artist or venue, event, tour, doors, start and end (24-hour), how many songs the list shows ("12+" when there are more) and those songs. The rows come from setlist.fm's own pages, 10 setlists each, one page after another; no API key is needed. Upcoming shows stay out of the table. With your setlist.fm API key set, the table's setlist links get their card and window on setlist.fm too. Its own switch, ⚙️ Settings → 🎤 setlist.fm → "Enable on setlist.fm", is on by default.


## 9.99.1526 — 2026-11-03

**✨ Improve**

- setlist.fm windows (link preview, with your setlist.fm API key): set times. The Setlists table of a venue, an artist or a tour has a "Set times" column (doors, and the show from start to end), and a setlist's window lists Doors, Scheduled, Start (how long after doors) and End (how long the show was). The times are on a 24-hour clock, as on MusicBrainz. setlist.fm's API has no set times, so they are read from setlist.fm's own pages: only once the window is open, never for the hover card, two pages for every 20 setlists, at most one a second. "…" means the page is still being read, "?" that it could not be (⟳ Try again), "—" that setlist.fm has none.
- setlist.fm window of a venue: what the API leaves out, read from the venue's own page with the set times: its address, when it opened (or was open), other names, its web links and how many attendances setlist.fm's users have logged.


## 9.99.1525 — 2026-11-03

**🐛 Fix**

- setlist.fm window of a venue or an artist (link preview, with your setlist.fm API key): the dates in the Setlists table no longer break onto a second line ("2026-10-20" wrapped at its hyphens).

**✨ Improve**

- setlist.fm window of a venue or an artist: "In the loaded setlists" lists the artists and tours (a venue's) or the tours and venues (an artist's) as small tables you can sort and filter, most setlists first. The number of setlists is a button: it keeps the Setlists table on the right to that artist, tour or venue, and works together with the table's text filter. A second click, or the ✕ of the "Only …" label above the table, shows them all again.
- setlist.fm windows: a tour is a link, as on setlist.fm. It goes to setlist.fm's search for that artist and tour; in the window it opens the tour's setlists (20 at a time, "Load 20 more", its venues on the left), and ← Back returns. A setlist's window links its tour the same way.


## 9.99.1524 — 2026-11-02

**✨ Improve**

- archive.org item window (link preview): a new "Images" section shows every picture the uploader added (cover, back, booklet, …), not just archive.org's tile. A click opens them in the viewer, and ← → step through all of them. A click on the cover now opens the cover itself at full size.


## 9.99.1523 — 2026-11-02

**✨ Improve**

- archive.org search table: the Collection column lists one collection per line and links each one to its archive.org page. It names them as archive.org does ("Radio Nowhere", "Recordings of Independent Origin") rather than by their ids. This costs one more request to archive.org for a page that brings new collections.


## 9.99.1522 — 2026-11-01

**🚀 Feature**

- Internet Archive (archive.org): on a search page such as everything with the subject "Bruce Springsteen" in 1975, a new "Items" button lists every item of that search as one filterable, sortable table: picture, date, title, venue, source, type, and what archive.org only shows when you rest on a tile (views, favorites, reviews, when it was added, size, collection). The rows come first by date, from the Internet Archive's search API (100 a request, one a second); archive.org's own page holds none of them. Rest on an item's picture for a card with its own pictures (the uploader's scans of the cover, back, booklet or discs, or a video's stills); a click opens them full size in the viewer, and 🖼 shows the whole table's pictures. New settings section 🏛 Internet Archive, "Enable on archive.org" and "Art column: the item's pictures on hover", on by default. Mockup: https://claude.ai/artifact/4aXkdPxudwhuzACj4Wg81C
- Link previews: a link to an archive.org item (archive.org/details/…), on MusicBrainz, Brucebase, archive.org or anywhere else previews look, has a card (date, venue, source, tracks and running time, the first songs) and a window on Space (facts, description, lineage, links to Brucebase and Databruce, the whole setlist with each song's length). A link to one track opens its show with that track marked. A video item shows its picture, thumbnails and files.
- Play in the window: each song of an archive.org show has a ▶ and a video item a "Play here" tile, which play in archive.org's own player in the window, one at a time with YouTube's; Esc or "■ Stop" ends it. New setting "Play archive.org tracks and videos in the window", on by default.

**📝 Docs**

- Help: the list of supported sites said each other site was "off until you switch it on"; every site's switch has been on by default since 2026-10-26. Now it says so.


## 9.99.1521 — 2026-10-31

**🐛 Fix**

- Link previews: the page's own title in the header (the release group's, artist's, … name) has its card and window again when jesus2099's "mb. SUPER MIND CONTROL Ⅱ X TURBO" has its option "unlink entity headers" on. That script turns the title into plain text the first time the pointer passes over it, so every later hover found no link. The title now stands for the page's own entity, also on its other tabs. As for every link outside a table, this follows "Also preview links outside tables".


## 9.99.1520 — 2026-10-31

**✨ Improve**

- The read-only "Sidebar" section shown below the Credits or Relationships section now starts closed by default; a click on its heading opens it. Setting: "… start the 'Sidebar' section closed", now on by default (off: it starts open). A profile that kept the old value only because SAVE stored it moves to the new default once.


## 9.99.1519 — 2026-10-31

**✨ Improve**

- Popup window: the last table in the right column (an artist's release groups, an event's setlist, a work's recordings, a Discogs label's releases, …) now reaches down to the window's bottom edge. A taller window shows more rows, and the right column stays where it is while the left one scrolls. A window too low to leave the table 160 px keeps the usual 460 px table.
- Popup window: every other table that scrolls has a grip under it. Drag it to change the table's height (a label shows the height and how many rows fit), use ↑/↓ on the focused grip for 20 px steps, Esc while dragging to cancel, and double-click to go back to 460 px. The height is kept for that kind of table in every later window and is part of the settings export (panel geometry). On a phone the window is one column; the grips work by touch.


## 9.99.1518 — 2026-10-30

**✨ Improve**

- The title-style check now also covers event names, for punctuation only: a new warning, "ASCII punctuation in event name" ("Max's" for "Max’s", "..." for "…", "2024-2025" for "2024–2025"). Capitalization of event names is never checked: they follow the poster. A live-form name's date and names that almost follow the event style guide keep their own warnings and are not flagged twice. Pages with events (an artist's Events, …) now get the Aa button too; its panel lists only the warnings the page can have, and counts "names" where there are only event names. New setting: ⚠️ Findings → Title style: find ASCII punctuation in event names.

**🔧 Refactor**

- FINDINGS event-typography (\_findingEventTypo(), \_findCellEventEl()), \_tableStyleCols() (was \_tableHasTitleInfo()), \_titleStylePageCols(), \_titleStyleNoun(); \_titleStyleAvail counts event-name columns. Mockup approved 2026-10-29, variant A: https://claude.ai/artifact/PB5NwvrZz61sMqju5qxFYu. Tests: findings-event-typography.spec.js (new, 6); scripts/mutations/event-typography.json (new: 6 caught, 1 recorded as not observable, with why). scripts/mutations/title-style.json: "the click does not turn the findings on" re-anchored (its find had not matched since 9.99.1516).


## 9.99.1517 — 2026-10-29

**🔧 Refactor**

- scripts/run-test-full.py --script NAME runs any test script of package.json (default test:full, the merge gate, unchanged), so a development run of npm test shows in the Claude Code status line too ("🧪 test · …"). Each script keeps its own ETA baseline (\~/.cache/sa-test-full/last-&lt;host&gt;-&lt;script&gt;.json; test:full keeps last-&lt;host&gt;.json), and the status file names the script, which \~/.claude/statusline.sh shows (a file without it reads as test:full). CLAUDE.md: every suite run goes through the wrapper.


## 9.99.1516 — 2026-10-29

**✨ Improve**

- "Check title style" is now where you see it: an Aa button next to the filters, in the filter bar after Cc / Rx / Ex on a page with one table, and in every sub-table heading on a page with several. It checks the whole page, as the ⚠️ list's row does, which stays. Afterwards each button shows its own table's result, "Aa 4 titles off-style ▾" in amber or a green "✓ Style OK". Clicking it (or resting on it) opens a small panel: titles checked, time taken, the five title-style warnings with their counts — a warning found on the page is a white box with a checkbox and its count in a pill, one found nowhere is greyed out — ticked to show only those rows in every table (the ⚠️ list shows the same tick), the table's titles struck through over their MusicBrainz style (click one to go to its row), and the "Check every page by itself" switch. Esc or a click outside closes it.
- A short hint under the first Aa button, a moment after a page with unchecked titles renders, offers the check: Check now, Always check, or Not now. It closes by itself after 14 seconds, on Esc, or on a click anywhere else; "Don’t show this again" stops it (new setting: ⚠️ Findings → Offer the title-style check in a hint).

**🔧 Refactor**

- \_updateTitleStyleControls() (tail of \_updateFindingMenus()), \_titleStyleScopes(), \_tableHasTitleInfo(), \_titleStyleOffRows() (source rows, memoized per stamp generation), \_titleStyleRequestCheck() / \_titleStyleStampNow() (shared with \_runTitleStyleCheck()), the panel \_tsPop\* (\#mb-title-style-pop, the async pop's frame and CSS, \_titleStyleProposal()), the hint \_titleStyleHint\* (\#mb-title-style-hint). New setting sa\_findings\_title\_style\_hint (default true; off for every Playwright load through the new HARNESS\_SETTINGS\_ALWAYS in tests/support/loadPage.js and realNetworkGmXhr.js). Mockup approved 2026-10-29, preset "B + C": https://claude.ai/artifact/HvdfbmeTUdcR34J4TrNycD; the panel's warning rows variant A of https://claude.ai/artifact/XFAcJ9zn5brXitDzJogXqn. Departures from the mockup, agreed: short labels and one 20 px button size everywhere (the non-wrapping global bar overflowed a 900 px window), a click outside closes the hint. Tests: findings-title-style.spec.js (+10), findings-title-style.mobile.spec.js (new), filter-bar-containers.spec.js (the button in the inventory), user-ratings-multigroup.spec.js (expands a heading by its toggle icon, not its centre, where the button sits); scripts/mutations/title-style.json (+13). docs/claude/findings.md, HELP, CLAUDE.md.


## 9.99.1515 — 2026-10-29

**🚀 Feature**

- Link previews: a Wikidata item's window (Space) shows its statements, its picture, every identifier as a link in three groups that fold (Music, Libraries and authority files, Other) with a filter, and its Wikipedia articles; a Language choice switches the names. A Wikipedia article's window shows its infobox, its opening, the other languages, and its sections, each read into the window when you open it. Links inside both open in the same window. The cards stay as quick as before. The identifiers' filter marks what it matched. In a window's path, every step on another site (Wikidata, Wikipedia, setlist.fm, Brucebase, any page; Discogs keeps its own marks) starts with that site's icon, and so does a MusicBrainz URL's ("\[info\]") step, with the icon of the site it names (the icons the cards and windows already show; a hover asks for none). Resting on such an icon shows a card: which site it is, what the step shows and how it was read (through Wikidata's, Wikipedia's or setlist.fm's API, from the page itself …), and that the icon is the site's own, asked once and kept for a month. A click on the icon opens the site's home page in a new tab (the pointer shows a finger there, as on MusicBrainz's own icons).

**🔧 Refactor**

- \_extWdWindow() / \_extWdClaims() / \_extWdNamesFor() (wbgetentities once, two SPARQL queries on query.wikidata.org: @connect, \_EXT\_CONNECT\_HOSTS), \_extWpWindow() / \_extWpLeadFor() / \_extWpSectionFor() (action=parse), \_extWpSafe() (Wikipedia's text rebuilt from a few tags), \_DP\_WIN\_ALL\_LINKS\_READERS. Probe scripts/probe-wiki-rich.py (--save: tests/fixtures/ext-wd-\*.json, ext-wp-\*.json). Tests: popup-ext.spec.js (2); scripts/mutations/wiki-setlistfm.json (+10: 9 caught, 1 recorded as not seen, with why). docs/claude/detail-pages.md (new section), HELP. \_hlEsc()/\_hlHtml() in the identifier rows; \_dpKindGlyph() gives every reader but the Discogs family, and a MusicBrainz url step (\_mbPopUrlResource()), the cached site icon (\_dpSiteIconGlyph(), \_extIcons); the URL window asks its site's icon (\_mbPopUrlIconStart(), first-contact rule kept) and draws its path again once its address is known; and \_extIconEnsure() draws the path again when an icon arrives (it is drawn on a step only). The icon's hover text: \_dpSiteIconTip() (\_DP\_SITE\_ICON\_READS per reader), set by \_dpCrumbsRender() through \_setTip(). The icon is a.mb-dp-crumb-site (href the site's home, a new tab).


## 9.99.1514 — 2026-10-29

**🚀 Feature**

- Link previews: setlist.fm links (a setlist, an artist's setlists, a venue) get a card and a window from setlist.fm's own API, with a free key of your own (new setting: setlist.fm API key, kept like the Discogs token: never exported). A setlist shows its songs by set, the encore too, covers with their original artist linked to MusicBrainz, guests, songs from tape and the show's notes; an artist's or a venue's window lists their setlists 20 at a time with "Load 20 more" and counts the tours, venues or artists of what is loaded. Links inside open in the same window. Without a key nothing changes.

**🔧 Refactor**

- The setlistfm reader in \_EXT\_READERS (\_extSfmPage(), \_extSfmLoad(), \_extSfmGet(), \_extSfmSetlist(), \_extSfmWindow(), \_extSfmFactsHtml(), \_extSfmAreaClick(), \_extSfmPageLoad()), only while sa\_pop\_ext\_setlistfm\_key is set (secret: true); @connect api.setlist.fm and \_EXT\_CONNECT\_HOSTS; setlistfm in \_DP\_WIN\_EXT\_READERS. Mockup 4: https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag. Probe scripts/probe-setlistfm-api.py (run by vzell with their key; fixtures tests/fixtures/ext-sfm-\*.json). Tests: popup-ext.spec.js "setlist.fm through its API" (4); scripts/mutations/wiki-setlistfm.json. ShowAllEntityData\_CONFIG\_DEFAULTS.json and scripts/config-default-history.json regenerated. docs/claude/detail-pages.md (new section), settings-and-config.md, HELP.


## 9.99.1513 — 2026-10-29

**✨ Improve**

- Link previews: in the window of a MusicBrainz artist, place, label, event or any other entity, a link to another site (Wikipedia, Wikidata, Discogs, YouTube, setlist.fm, any page) opens in the same window, with Back, instead of a new tab. Ctrl-click still opens a new tab.

**🔧 Refactor**

- \_dpWinExtTarget(): in a window whose source is in \_DP\_WIN\_ALL\_LINKS\_SOURCES (mb-entity, dg-mb, mb-release-group, mb-event-rg) every reader's link opens here; other windows keep \_DP\_WIN\_EXT\_READERS. Test: popup-mb.spec.js (the event window's setlist.fm link opens here, Back, Ctrl-click a new tab). docs/claude/detail-pages.md, HELP.


## 9.99.1512 — 2026-10-29

**✨ Improve**

- Link previews: in an event's window, "Recorded here" has a filter on both its tables, also when there are only a few releases (it used to appear only above 25 rows). The filter looks at the name and its comment ("live, 1988-03-28 …", "version 1"), and the heading counts what it shows ("Recordings · 3 of 40"). "Releases" and "Recordings" fold: click a heading to fold it, Ctrl-click to fold or open both; the next event you open keeps them as you left them.

**🔧 Refactor**

- \_dpFoldGroupHtml() / \_dpFoldClick() / \_dpFolded (a group that folds, Ctrl/⌘ every group of the window, from \_dpTblClick()); \_mbPopRelGroupHtml() and \_mbPopRelTableCols(); \_dpCompactTableHtml() takes filter; \_mbPopRelTableRows() rows carry comment. Mockup 2f: https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag. Tests: popup-mb.spec.js (the event window's filter and groups; a new test of the filter, the count, folding, Ctrl-click and the memory); scripts/mutations/poh-fixes.json (+6, all caught). docs/claude/detail-pages.md, HELP.


## 9.99.1511 — 2026-10-29

**🐛 Fix**

- Link previews: with "MusicBrainz Right Side Flags Everywhere" installed, a country's flag in a window no longer covers the green dot of the name after it, and no longer blinks when you click in the window. That script put its own, wider flag into the window's.

**✨ Improve**

- Link previews: the green dot in a window (the link is already loaded, so a click opens it at once) no longer pushes the text: every link that opens in the window keeps its place. When you rest on a link that has the dot, a small note above its card says what the dot means.

**🔧 Refactor**

- \_mbPopFlagHtml(): span.flag-XX.mb-pop-flag (no flag class) with data-hq-skip, the slot overflow: hidden. \_dpWinMark() puts mb-dp-dots on the area while sa\_dp\_window\_read\_ahead is on; every mb-dp-l-here link keeps the dot's ::before, transparent until mb-dp-l-read. \_dpShowPeek() records t.wasRead as the card comes up; \_dpCollectNotes() adds a kind-read box (\_dpReadNoteHtml()). Mockup 2e: https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag. Tests: popup-mb.spec.js H5 on/off (the link's box unchanged when read, the note on a dotted link's card and not on another's); pop-area-flags.spec.js gains a Right Side Flags stand-in test; scripts/mutations/poh-fixes.json (+7, all caught). DEBUG-NOTES.md, docs/claude/detail-pages.md, HELP.


## 9.99.1510 — 2026-10-29

**✨ Improve**

- Link previews: in an artist's or a label's window, the ISNI is a link to its record on isni.org (a new tab), written in groups of four as ISNI does (0000 0001 2141 8834).

**🔧 Refactor**

- \_mbPopIsniHtml() in the artist and label kinds' windowHtml; the cards keep the text. Tests: popup-mb.spec.js (the artist's ISNI; a new label test with two ISNIs, one ending in X); scripts/mutations/poh-fixes.json (+3, all caught). docs/claude/detail-pages.md, HELP.


## 9.99.1509 — 2026-10-29

**🐛 Fix**

- Link previews: with "MusicBrainz More Flags Everywhere" installed, the areas in a window (an artist's Area and Born, a label's or place's Area, an event's Held at) no longer jump. That script added its flag a moment after every change of the window, so the names moved while the window loaded and flicked when you clicked in it (a release-group type, a chip). The window now draws the flags itself, in a place of fixed size: each country's, and each state's (read from Wikidata the first time a window shows that state, then kept; on discogs.com a country shows its code).

**🔧 Refactor**

- \_mbPopAreaHtml() stamps data-flag-processed and puts \_mbPopFlagHtml() before the link (.mb-pop-flag, 16 × 11): a country MusicBrainz's span.flag.flag-XX, off musicbrainz.org its ISO code; a state (\_mbPopIsState()) its Wikidata P41 through \_mbPopFlagLoad() / \_mbPopFlagRecordFor() (area url-rels, wbgetclaims; key pop:flag:area:&lt;id&gt;, \_MB\_POP\_FLAG\_VERSION 1), started from \_mbPopAreaChainLoad(). \_\_saTest.mbPopFlagHtml(). Tests: new pop-area-flags.spec.js (3); popup-mb.spec.js counts flag lookups apart from chain steps; scripts/mutations/poh-fixes.json (+8, all caught). DEBUG-NOTES.md, docs/claude/detail-pages.md, HELP.


## 9.99.1508 — 2026-10-29

**✨ Improve**

- Link previews: a MusicBrainz label's window (on MusicBrainz, and from the MusicBrainz column on discogs.com) shows its links on the left, under its facts, as an artist's window does; the right side keeps the related labels, people, places and series.

**🔧 Refactor**

- The label kind's windowHtml puts \_mbPopUrlLinksTableHtml() after the facts in the first column. Test: popup-mb.spec.js "the label card and window"; scripts/mutations/poh-fixes.json (+1, caught). docs/claude/detail-pages.md, HELP.


## 9.99.1507 — 2026-10-29

**✨ Improve**

- Link previews: in a tag's window, each kind under "By kind" now says what a click does when you rest the pointer on it, e.g. "Show the 661,243 recordings tagged rock on the right, most votes first: the first 100 now, 100 more a page on demand"; the kind already listed says so. An editor's tag window names the editor.

**🔧 Refactor**

- \_mbTagKindTip() gives each mb-pop-kindbtn its data-mb-tip text in \_mbPopTagWindowHtml(); \_MB\_POP\_TAG\_KIND\_PAGE (100). Tests: popup-mb.spec.js and popup-mb-user-lists.spec.js assert the words; scripts/mutations/poh-fixes.json (4, all caught). docs/claude/detail-pages.md, HELP.


## 9.99.1506 — 2026-10-29

**✨ Improve**

- Page heading: the ❌ errors and ⚠️ warnings buttons, and 🔄 when pages failed to load, moved out of the SAED button into a small rounded bar of their own right after it. The SAED button keeps the same shape on every page; the second bar appears only when the page has something to show. ⚠️ still shows at 0 where it starts the title-style check.

**🔧 Refactor**

- The attn area is the one area of \#mb-saed-attn-bar (class mb-saed-bar, the same custom properties), built next to \#mb-saed-bar and held in \_saedAttnBarEl; \_saedAreaFor() resolves attn there, \_saedMarkFirst() marks each bar, \_orderToolbar() hides the bar while it is empty (.mb-saed-bar\[hidden\], since the bar's display beats the browser's own rule), and \_TOOLBAR\_TAIL\_ORDER names both bars. Approved mockup https://claude.ai/artifact/URrn3dps1EMtnkjKBvsvag. Tests: saed-toolbar, findings-menus (placement, rounded corners, hidden when empty) and fetch-in-segment updated; scripts/mutations/saed-attn-bar.json (6, all caught). docs/claude/toolbar-and-header-ui.md, findings.md, CLAUDE.md, HELP.


## 9.99.1505 — 2026-10-29

**🐛 Fix**

- A MusicBrainz window (on MusicBrainz and on discogs.com): Ctrl+hovering a link in it during its first seconds now shows the card. The window keeps loading for a few seconds after it opens (an artist's links, its area, its release-group counts, about one a second) and rebuilds its content with each answer; a card waiting for its short delay was dropped when that happened, and one already showing stayed up after the pointer left. The card now follows the link through the rebuild.


## 9.99.1504 — 2026-10-29

**🔧 Refactor**

- Tests: the two failures of the 9.99.1503 merge gate are fixed. \_\_saTest.getUniqDropSections() now moves a 📊 panel that opened off-screen into view: the panel is placed from its button, so for a header below the fold no entry could be ticked. It moves the panel, never the page, because a page scroll that moves the button closes the panel (a first version that scrolled broke the medley specs' second tick). New harness-uniq-drop-hook.spec.js; both mutations are caught. And the fixture projects answer MusicBrainz's CDN (static.metabrainz.org) from a disk cache (tests/support/test.js, tests/.cache/static-mb/, gitignored): on a slow line a fixture load under 28 workers took 27 s median and 73 s at worst and a full run timed out in page.goto(); cached, 7.4 s and 9.6 s, with the same files and MusicBrainz's scripts still running. A spec that blocks that host still wins. No change for users.


## 9.99.1503 — 2026-10-29

**🚀 Feature**

- Release tracklist: every empty "Recording of work" cell shows a 💡. Click it, or ▶💡 in the column header for all of them, and the script suggests the work with the closest title among the works of the track's artists, in orange and marked "suggested:", with "exact title" or "≈ N % alike" and a ➕ relate link to the recording's edit page. Each artist's work list is loaded once and kept for 30 days, shared with the artist Recordings page's suggestions. Nothing loads until you click, and a suggestion is not a link: the track keeps its "no associated work" flag. The column's 📊 gets a "Recording of work - Suggestions" section. New setting: "Suggest a work for tracks whose recording has none" (on).


## 9.99.1502 — 2026-10-29

**🚀 Feature**

- discogs.com: a user's collection or wantlist page of its own (/user/&lt;name&gt;/collection, /wantlist?user=&lt;name&gt;, your /mywantlist) gets the "Show the collection" or "Show the wantlist" button, the same table as on the user's page, read from Discogs' API. The button says how many entries the page counts, and stays away when the page says the list is empty.
- discogs.com: a master's, artist's or label's Images page gets "Show every image": every image with its type and size, from Discogs' API in one request.
- discogs.com: a release's Marketplace page (/sell/release/&lt;id&gt;) gets "Show every listing": every listing in one table with its conditions, seller and rating, where it ships from, price, shipping, and the price in your currency to compare.
- discogs.com: the search page gets "Show all results": the results in one table from Discogs' API, 100 a request (Discogs' API gives at most the first 10,000 of a search; the button says so).

**🐛 Fix**

- discogs.com search results: with the "Import Discogs releases to MusicBrainz" userscript installed, the table no longer gets a MusicBrainz column header without its cells, which put every later heading over the wrong column.


## 9.99.1501 — 2026-10-29

**🚀 Feature**

- Every picture an artist, label, place, series, instrument or area links (its image, logo and poster links, its Wikimedia Commons files), which MusicBrainz itself does not show, now appears beside its name: one, or several fading from one to the next every 6 seconds, with ‹ › on hover and a click opening them all in the viewer. A picture link that does not load is left out. The script asks MusicBrainz once for the links and remembers them; with the "MusicBrainz Entity Images" userscript installed it uses that script's pictures instead. New setting: "Entity pictures from its links" (on).
- Link previews: an artist's, label's or place's window shows all of these pictures: one large, a strip of the others (click one to make it the large one), and a line naming the links that did not load. The card shows the first with "+N".

**🐛 Fix**

- The sidebar picture: with the "MusicBrainz Entity Images" userscript showing a logo link first, a Wikimedia Commons picture shown after it no longer goes without its card and viewer, and the picture used is the one that script shows.


## 9.99.1500 — 2026-10-29

**✨ Improve**

- Link previews: in a preview window, a link to a Brucebase show or page (an event's "Review" link to brucebase.wikidot.com/2002\#100802, for example) or to another Springsteen site's page now opens in the same window, with Back, instead of a new tab.


## 9.99.1499 — 2026-10-29

**✨ Improve**

- Link previews, an event's window: a setlist in parts (Soundcheck, Concert, Encore, …) shows a heading row for each part with its number of songs and its notes, numbers its songs within each part, and gets a chip per part to show only that part. A song played in two parts says so ("↺ also in Soundcheck"). Before, every song was numbered in one run and the part names were loose lines under the table.
- The event card previews the setlist's longest part (usually the concert, not the soundcheck) and names the other parts.


## 9.99.1498 — 2026-10-29

**✨ Improve**

- discogs.com: the history page of a master, an artist or a label (e.g. /master/26725-Born-To-Run/history) now has the "Show the changes and the diff" button too, as a release's has had.

**🐛 Fix**

- discogs.com history pages: "Show the changes and the diff" read only the first page of a longer history, which holds the oldest changes. It now reads every page.
- An artist's or label's edit history: the diff of a change came out empty, on the history page and in the preview window. It now shows each field (Real Name, Profile, Sites, …), old and new.


## 9.99.1497 — 2026-10-29

**🐛 Fix**

- Discogs windows, Videos: the "Playing" label under the player no longer runs into "Video &lt;id&gt;", and each video's title has its proper gap after its ▶ Play tile.


## 9.99.1496 — 2026-10-29

**🐛 Fix**

- A long text cell (an editor profile's Bio, an Annotation, edit notes) in a sub-table that starts collapsed now gets its ▶ more toggle when the sub-table is opened. Before, its text was cut off after a few lines with no way to read the rest (reported on https://musicbrainz.org/user/atj).


## 9.99.1495 — 2026-10-28

**🚀 Feature**

- Link previews: a link to the genre list (/genres) has a card (how many genres, the first and the last) and, on Space, a window with every genre in a table: a filter, a chip per letter (0–9, A … Z, \#) and each genre opening its own card.
- Once the genre list has been read, a tag card names its genre's disambiguation, and an editor's Tags window links each of their genres to its genre page (a new "Genre page" column). Only a window asks for the list, never a hover.


## 9.99.1494 — 2026-10-28

**✨ Improve**

- Link previews: an artist's sort name is now the first line of the artist card ("Sort name  Iglesias, Julio"), when it differs from the name, instead of a separate "Link title" box above the card.

**🐛 Fix**

- Link previews: a label link's box above the card said "Sort name" for what is really the label's disambiguation (e.g. Legacy: "reissue division of Sony Music Entertainment"). The box is gone; the card already shows the disambiguation under the name.


## 9.99.1493 — 2026-10-28

**🚀 Feature**

- Link previews: the entity icon before a MusicBrainz page's title (the release, release group, artist… icon left of the h1) now shows that kind's documentation, as the icon before each step of the window's path does. Rest on it for the Documentation card; a click or Space reads the page in the window, Ctrl-click opens it in a new tab. Only while the MusicBrainz link previews are on.


## 9.99.1492 — 2026-10-28

**🐛 Fix**

- Link previews: links to BookBrainz, ListenBrainz, CritiqueBrainz, MetaBrainz and AcousticBrainz now get a card and Space like any other site (e.g. the BookBrainz search among the sidebar's Search links). Only musicbrainz.org and the artwork archives are still left out: MusicBrainz links have their own cards, and artwork has its own preview.


## 9.99.1491 — 2026-10-28

**🐛 Fix**

- With jesus2099's "mb. FUNKEY ILLUSTRATED RECORDS" active, its small cover before each release group name in a list — /tag/&lt;name&gt;'s "Release groups", an editor's ratings — kept its plain title ("N images found in this release"). It now shows the artwork card of that release on a hover and opens the viewer on a click, as the same icon already did in a release group's Relationships section.


## 9.99.1490 — 2026-10-28

**📝 Docs**

- The setting "Watch for late jesus2099 cover-art icon re-injection" named the wrong userscript: that cover-art icon (and the big picture strip above tables) comes from jesus2099's "mb. FUNKEY ILLUSTRATED RECORDS", not from "mb. SUPER MIND CONTROL". The same credit is corrected in the script's comments.


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


---

**Older versions:** [November 2026](ShowAllEntityData_CHANGELOG/2026-11.md) · [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

*Generated from ShowAllEntityData_CHANGELOG.json by scripts/build-changelog-pages.py — do not edit by hand.*
