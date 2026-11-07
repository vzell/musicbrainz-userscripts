# ShowAllEntityData — Full development log

Every version, newest first, with the technical details behind each change. For what changed for you in each published release, in plain words, see [What's new](ShowAllEntityData_RELEASES.md).

**Months:** [November 2026](ShowAllEntityData_CHANGELOG/2026-11.md) · [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

This page shows the newest 100 of 1745 versions; the month pages hold all of them.

---

## 9.99.1574 — 2026-11-07

**🐛 Fix**

- brucespringsteen.it record previews: a line the site writes between a record's facts and its Notes ("The original version is numbered." on All Those Years' LP) is no longer dropped, and "\*PROMO\*" leaves the title to become "promo" beside the kind (Official release or Bootleg).


## 9.99.1573 — 2026-11-07

**🚀 Feature**

- brucespringsteen.it song and show previews: on a record page, its song and show links (until now dead "\#" links) show a card on hover and open in the window on Space, as they do in the rendered table and on the other sites. A song shows its lyric versions, each with its note; a show its date, venue, setlist, notes and the records it is on, and a record there opens in the same window, with Back. On the record page a plain click still opens the site's own small window.


## 9.99.1572 — 2026-11-07

**🚀 Feature**

- brucespringsteen.it record pages (DB/detrec.aspx): a new "Tracklist" button shows the record the way MusicBrainz shows a release: a sub-table per record or disc (vinyl sides paired into records when the count adds up), Date, Show and Country split out of the source show, Notes, Ver and a Play tile; above it the record's notes, its facts as the page names them, the shows its tracks come from, and its photo. No request: everything comes from the page itself. It also works in the site's frameset, in the right-hand frame where the site shows the record you click in its list. Mockup: https://claude.ai/artifact/XULiW1dUFME9F4nbsrQokD


## 9.99.1571 — 2026-11-06

**🐛 Fix**

- Artwork viewer on a touch screen: dragging an Adjust slider with a finger no longer steps to the next picture (which also undid the adjustment); in Compare a swipe changes the right picture, as ← → do, and the left one stays; with the loupe on, one finger moves the lens (it followed only a mouse, so on a phone the Loupe button did nothing).


## 9.99.1570 — 2026-11-06

**🚀 Feature**

- Artwork viewer: Adjust (A) brightness, contrast, grayscale and invert to read a dark scan or a faded insert (view only; Download keeps the file); Compare (C) two pictures side by side (a page of a Spreads pair opens both); a loupe (L) under the pointer; Copy URL (Y; Shift+Y as an edit-note line); and ? for every key. On MusicBrainz and the other sites alike.


## 9.99.1569 — 2026-11-06

**🐛 Fix**

- Pictures that do not load (the Cover Art or Event Art Archive slow or down, or another site's pictures) no longer show the browser's broken image: a dashed box with ⟳ asks for the picture again. In a picture section a tile has its own ⟳ and the tool row "⟳ Reload N failed"; a medium's thumb in its heading and the cover beside the page heading ask again when clicked; the viewer offers "⟳ Try again" for a large image that did not come; a hover card says to rest on the link again. Until now only the archive's record ("⟳ Retry") and the CAA/EAA column's icon (⚠⟳) could be asked for again.


## 9.99.1568 — 2026-11-06

**🚀 Feature**

- Picture sections (a release's Cover art, an event's Event art, and the pictures on other sites' detail pages): a Table layout lists the pictures one per row (\#, picture, type, comment, ★ / ⏳, file name, and the copy on a springsteenlyrics item), sortable by any column; the viewer then steps through the rows in that order.
- Picture sections: a filter box narrows the pictures as you type (by type, comment or file name) in every layout, says how many are shown and highlights what it found; a Tiles slider makes the thumbnails bigger or smaller (remembered; ↺ takes them back to the original size); Show missing turns a springsteenlyrics copy's "no scans yet" box on and off.


## 9.99.1567 — 2026-11-06

**✨ Improve**

- Other sites' detail pages: as on a MusicBrainz release, a disc's or record's own pictures show as small thumbs in its heading above the tracks, and a click opens them in the viewer. On archive.org a picture named after a disc ("Disc 2.jpg") goes into that disc's heading; on a springsteenlyrics bootleg the artwork whose caption names the disc, its label, a picture side or the runout goes into the record's. A picture is placed only when its name says where; anything else stays in the pictures section only.
- springsteenlyrics bootleg pages: the artwork chips follow the site's captions — Front, Back, Booklet, Medium (disc, label, picture side, runout, matrix), else Artwork.


## 9.99.1566 — 2026-11-06

**🐛 Fix**

- springsteenlyrics.com item pages: a copy the site has no scans of yet ("No scans available yet") was left out of the scans, so the page read as if the item had one copy. It now shows as a dashed box with the site's own words, in its place among the copies.

**✨ Improve**

- springsteenlyrics.com item pages: an item's scans and artwork are one section. With several copies it has a chip per copy and By copy instead of By type, and the viewer steps through every copy's scans (before, each copy was its own section with its own viewer).


## 9.99.1565 — 2026-11-06

**✨ Improve**

- Other sites' detail pages (a Discogs release's or master's Tracks view, an archive.org item, a springsteenlyrics item or song page): their pictures now work like a release's Cover art on MusicBrainz. Type chips (Discogs' Primary and Secondary, archive.org's Front, Back, Booklet or Medium guessed from the file names, springsteenlyrics' Scan or Artwork), ★ on Discogs' primary image, Grid or By type (remembered for these pages, separately from MusicBrainz), and a click or Space opens the viewer over the pictures shown, with the page's title in its bar.


## 9.99.1564 — 2026-11-06

**🔧 Refactor**

- Cover art and Event art sections (release and event pages): the section now gets its pictures, loading and retry from one adapter, the first step toward one picture section for every detail page (springsteenlyrics scans, Discogs images, archive.org pictures). Nothing changes on screen. One fix comes with it: the Cover art tab finds its own section even when another picture section stands before it on the page.


## 9.99.1563 — 2026-11-05

**🐛 Fix**

- springsteenlyrics.com (and the other Springsteen sites): in a preview window, a link whose page its card has loaded gets the green "already loaded" dot, as MusicBrainz links do, also when the answer comes in after the pointer has moved on; resting on it again says "(read before, no request)".


## 9.99.1562 — 2026-11-05

**🐛 Fix**

- 📊 dropdown: on a site whose stylesheet sizes every element with its padding (springsteenlyrics.com's Bootstrap), the badge of the largest count was wider than the others, so its label started further right ("(176) Live" in the Type column of a lyrics letter page). Every badge now has one width on every site.


## 9.99.1561 — 2026-11-05

**🐛 Fix**

- springsteenlyrics.com: a medium written with its kind in brackets ("Disc 1: \[CD\]", "Disc 2: \[DVD\]", collection item 7457) is a medium of its own: the item's tables get a sub-table for each, its preview window both lists, and the initial page links the second one's songs too (until now its tracks were read as notes).
- springsteenlyrics.com: in an item's preview window, the titles of a tracklist line up after the numbers "10" and on (the site's fonts have figures of different widths).
- springsteenlyrics.com: a box set whose page lists its records without their tracklists (sampler items 5618 and 5619: Record 1: "Greetings From Asbury Park N.J.", its pressing, catalogue number and sleeve) gets one Contents table, a row per record (until now the first record's three lines were shown as three tracks and the others as notes); its preview counts the records and lists them.


## 9.99.1560 — 2026-11-05

**✨ Improve**

- springsteenlyrics.com item pages: the site's own tracklist already links each song (with its preview) before any button is pressed; its MusicBrainz icons and "this show" links appear there once they have been read (a press or a window reads them; a visit alone asks nothing).
- springsteenlyrics.com tracklists: on a bootleg of one show the title now links the song's main page, and the "this show" mark after it is a link of its own to that show's version, each with its own preview (until 9.99.1559 the title linked the show's version).
- springsteenlyrics.com tracklists: a song the site has no page for ("Circus Song") still gets its MusicBrainz work icon when MusicBrainz knows the work by that name or an alias; "Rosalita (Come Out Tonight) (instrumental)" and "Phantoms aka Wild Zero And Blind Terry" now find their songs.
- springsteenlyrics.com: the MusicBrainz work icons pulse while Bruce Springsteen's works load.
- springsteenlyrics.com: an item's preview window opened from a list now shows the MusicBrainz work icons too (the works are read when the window opens), and a various-artists line there ("Bruce Springsteen: BORN TO RUN") links Bruce's song.
- springsteenlyrics.com, logged in: the collection and bootleg lists get an ID column, the item's number on the site, linked, with the site's edit pencil, sorted as a number.
- springsteenlyrics.com: the CD and vinyl bootleg list's Label cell links the label's own list, and resting on it, or on the item page's Release card label, shows the label's card: how many CD and vinyl bootlegs, the first of them and their covers.
- Every non-MusicBrainz detail page (springsteenlyrics.com items and songs, Discogs releases and masters, archive.org items, setlist.fm): resting on a picture above the tables shows it large, larger while Shift is held; Space opens the artwork viewer, as a click does.
- springsteenlyrics.com: in a label's window, every item links its page, with its own preview.
- springsteenlyrics.com: in an item's preview window, the MusicBrainz work icons sit in the line before each title (they were shown below it while read-ahead was on).


## 9.99.1559 — 2026-11-05

**🚀 Feature**

- springsteenlyrics.com tracklists: in an item's tracklist (collection, bootleg, CD and vinyl bootleg), its preview window and a song page's edition tables, each song links its page in the lyrics index. Only songs the site has a page for are linked (an unknown address shows the site's "does not exist!" page): the script carries the site's list of 1,381 songs, and finds a title written differently from its page ("4TH OF JULY, ASBURY PARK (SANDY)", "(GET YOUR KICKS ON) ROUTE 66", 19 exceptions such as "FOURTY MILES OF BAD ROAD"). A medley links each of its songs; another artist's song on a various-artists album stays plain. Setting: Tracklists: link each song to its page on springsteenlyrics.com (on).
- springsteenlyrics.com: on a bootleg of one show, a song links the site's page of that very performance when there is one, marked "this show" (the 5 Feb 2014 Perth bootleg's E Street Shuffle opens theestreetshuffle\_2014-02-05). The script reads the lyrics index once (32 letter pages, about one a second) and keeps it 30 days; every lyrics letter page shown keeps it current. Setting: Tracklists: link a bootleg's songs to the version of that show (on).
- springsteenlyrics.com: a MusicBrainz work icon before each song of those tracklists, with MusicBrainz's card of the work on hover. Solid: the work's annotation links this song's page, or (logged in) the item's MusicBrainz release has it; dashed: matched by title only; several icons with a count: several works of that title. Bruce Springsteen's works are read once (16 requests, about 18 s, the icons faded meanwhile) and kept 30 days. Setting: Tracklists: MusicBrainz work glyph before each song (on).

**✨ Improve**

- springsteenlyrics.com song pages: a song the site leaves unlinked in a release's edition table (no page for that version) now links the song's main page when the site has one; the site's own links stay as written.


## 9.99.1558 — 2026-11-05

**🐛 Fix**

- MusicBrainz search pages whose address does not start with the query (e.g. search?type=annotation&query=…, typed by hand or bookmarked) got no buttons: the script only ran when query= came first.


## 9.99.1557 — 2026-11-05

**✨ Improve**

- MusicBrainz → springsteenlyrics.com: the site's two old addresses that MusicBrainz still carries, mostly in work annotations (/lyrics/&lt;letter&gt;/&lt;song&gt;.php and /collection/moreinfo.php?item=N), answer 404 today. Their preview now reads the page at its current address (lyrics.php?song=…, collection.php?item=…), and the card's first line says "Old address" with the new one.

**🚀 Feature**

- New ⚠️ WARNING "Old springsteenlyrics.com address in the annotation": an Annotation cell (annotation search, annotation reports such as Works with annotations) that links springsteenlyrics.com at an old address is tinted, and the menu filters to those rows so the annotations can be edited. The cell's tooltip names each link's current address. Setting: "Highlight Annotation cells with an old springsteenlyrics.com address as WARNING".


## 9.99.1556 — 2026-11-05

**✨ Improve**

- springsteenlyrics.com: a song's preview card and window now show the version's Type, Date and Show (as the lyrics index reads them), the song number (logged in), the versions by type ("Album 1, Unofficial studio 3, Live 57"), and the releases, live releases, covers and movies the page lists, counted. A live version adds its venue, place, tour and release, and the window shows that release's tracklist with the song marked ●.
- springsteenlyrics.com: a song preview's Request section no longer shows the contact form's field names.


## 9.99.1555 — 2026-11-05

**🚀 Feature**

- springsteenlyrics.com song pages (lyrics.php?song=…, and lyrics.php?item=N): new "Show the song" button. Each edition of the song's releases becomes a sub-table (vinyl sides paired into records), followed by Other official releases, Live releases (Date, Show, Release, Kind, Released and this song's page of that show), Covers, Appearance in movies and Available versions (the lyrics index's columns). This version is marked ● wherever it appears. Above the tables: the lyrics, the page's texts (Request without its contact form), Details (version, a live version's show and release, the studio recording, what the page lists), the pictures, and Private Info (closed, logged in only). No request: the page itself is the data.
- springsteenlyrics.com song pages: "Show all versions of this song" shows the page's versions alone as one table, with the ID column (logged in) sorting as a number.
- springsteenlyrics.com song pages, logged in: covers get an Item column (the cover release's page and its edit link). The "add N songs" links are left out.


## 9.99.1554 — 2026-11-05

**✨ Improve**

- springsteenlyrics.com lyrics index, logged in: a new ID column holds the song's number, which links to its page (lyrics.php?item=N), and a ✎ link to edit it on the site. The column sorts by number. Logged out, the table is unchanged.
- springsteenlyrics.com: hovering a song's number (lyrics.php?item=N) shows the song's preview, as its title does.

**🐛 Fix**

- springsteenlyrics.com lyrics index, logged in: the Lyrics column showed ✗ on every song, because it read the edit pencil instead of the lyrics icon.


## 9.99.1553 — 2026-11-05

**✨ Improve**

- springsteenlyrics.com lyrics index: a letter page (e.g. lyrics starting with B) now has a "This letter" button. It shows that page's songs as a table without loading anything. "Show all lyrics" still loads all 32 letters; on the lyrics start page it is the only button.


## 9.99.1552 — 2026-11-05

**🐛 Fix**

- springsteenlyrics.com, logged in: a song's preview card and window showed the page's "Private Info" notes and kept them in the preview cache. They are now left out, and previews read before the fix are read again. A logged-in read and a public read of a song page are now cached separately.


## 9.99.1551 — 2026-11-04

**🚀 Feature**

- springsteenlyrics.com: an item's own page (collection.php?item=…, bootlegs.php?item=…, brucelegs.php?item=…) gets a button, Tracklist: the tracklist from the page itself, one table per disc or record (vinyl sides paired: A/B is Record 1), with Take and Note columns on bootlegs, Version, Note and Length on the CD and vinyl bootlegs, and an Artist column on various-artists albums. Above the tables: the item's facts (release, or show and recording), its runout etchings, its files, its scans or artwork (one section per copy, with the site's captions, opening in the viewer), the notes, and the original info file, which is read only when you open its section. Logged in, a "Your collection" card shows the MusicBrainz link (with its preview), Good scans, Kept in, the item number and the edit link, and "Private info" is shown closed; it never appears in a preview. A CD or vinyl bootleg whose page lists several versions (pressings) also gets All versions: every one of them as one table with the list's columns. The view uses the window's full width, as the lists do, instead of the site's centred 1170 px column. Mockups: https://claude.ai/artifact/GBFJp9Ebo8LDoGPSskVMkg


## 9.99.1550 — 2026-11-04

**🚀 Feature**

- springsteenlyrics.com lists, logged in: the collection gets MusicBrainz, Good scans and Kept in columns (one column for every "In &lt;country&gt;" icon), the bootlegs a MusicBrainz column, all from the cards themselves, with no extra request. The MusicBrainz cell, and the site's own MusicBrainz icon on its cards, show MusicBrainz's card on hover and open in the window. Logged out, the tables are as before.
- springsteenlyrics.com bootleg lists: the Info file cell links the bootleg's original info file. Its card names the file, and Space reads it into the window.
- springsteenlyrics.com CD and vinyl bootleg lists: PDF and Artwork columns (vzell, although every card has both today); PDF links the item page, where the PDFs are.

**🐛 Fix**

- springsteenlyrics.com lists, logged in: the Version column was empty on every card, because a logged-in card puts its item number and a second marker before the title.


## 9.99.1549 — 2026-11-04

**🔧 Refactor**

- springsteenlyrics.com previews: a page read while logged in and one read logged out are no longer one cache entry. Each record notes the login state it was read in, and a record of the other state is read again.


## 9.99.1548 — 2026-11-04

**🐛 Fix**

- springsteenlyrics.com: the preview of a CD or vinyl bootleg (brucelegs.php?item=…) said "The page has no tracklist." It now shows the tracklist, with the lengths the page gives, the runout etchings and the release info.
- springsteenlyrics.com: the preview of a box set with "Record 2: …" headers (the Born In The U.S.A. 12" Single Collection) showed record 1 only; the other records ended up in the notes.
- springsteenlyrics.com: artwork in a preview carries the page's own captions ("front", "booklet p2,3").


## 9.99.1547 — 2026-11-04

**🚀 Feature**

- setlist.fm: a link to a festival or one of its editions has a card and a window, without the setlist.fm API key, wherever such links appear (setlist.fm's own festival pages before you press a button, the tables, the top of an edition's page, MusicBrainz). An edition's window lists all its setlists by day, with a chip per stage, its stages and its most attended setlists; a festival's window lists its editions and its Artist charts.


## 9.99.1546 — 2026-11-04

**🚀 Feature**

- setlist.fm: a festival edition's page (setlist.fm/festival/2025/…) gets a button, Setlists: every setlist of the festival from the page itself, one table per day, with Time, Artist (its setlist), Stage and Attendees. Above the tables: the dates and venue, and Details with the festival's facts (setlists, stages, attendances), its stages with their number of setlists, and the ten most attended setlists.
- setlist.fm: a festival's page (setlist.fm/festivals/…) gets a button, Editions: every edition as one table (Year, Edition, Stages, Venues, Start, End), with the festival's facts and its Artist charts above.


## 9.99.1545 — 2026-11-04

**🐛 Fix**

- setlist.fm: on a search page (an artist's search, a search by words), the setlists' links had no hover card or window before you pressed the button: setlist.fm lays a search page out differently from a venue's or an artist's list, and the cards were outside the part of the page the previews looked at. On a setlist's own page, the headline's artist and venue, its Tour line and the covers and guests in the song list now preview too.


## 9.99.1544 — 2026-11-04

**🚀 Feature**

- setlist.fm: a search by words (setlist.fm/search?query=…, such as "Bruce Springsteen", or "artist:(Bruce Springsteen) tour:(…)" as the Tour links open) gets the Setlists button too. Its table has both an Artist and a Venue column, as such a search can find other artists' setlists; its section is named after the query. These searches had no button before.


## 9.99.1543 — 2026-11-04

**🚀 Feature**

- setlist.fm: a setlist's own page (setlist.fm/setlist/…) gets a button, Setlist, that lays the setlist out like a MusicBrainz release page, without asking setlist.fm for anything (the page already holds the whole list). One table per set, named as setlist.fm names it ("The River", "Solo Acoustic"), else Set 1, Set 2 …, and Encore. Columns: \# (numbered on through the sets, a tape has none), Song (its statistics on setlist.fm), Cover of, With (each guest on a line), Tape, Info (setlist.fm's notes such as "first time since 2019") and Play, which finds the song on YouTube and plays it in place. Above the tables: "\~ Setlist by … (date: venue)", setlist.fm's Note, and Details: Show (date, artist, venue, tour, how many setlist.fm users were there), Set times, Setlist (songs, sets, encores, covers, tapes), and on the right Guests and Covered artists, the one on the most songs first ("Tom Morello ×2"). A setlist without songs yet has no button.


## 9.99.1542 — 2026-11-04

**🐛 Fix**

- Discogs Tracks view (a release's and a master's): track positions with a letter after the same number ("1a", "1b", …, a medley's parts) stay one table. Each part used to start a new disc: "The Very Best Of Stars On 45" came out as 147 tables of one row; now it is one table of 159 rows with a Section per medley.


## 9.99.1541 — 2026-11-04

**✨ Improve**

- Discogs release page, Tracks: the Community card shows its rows in two columns: Have, Want, Avg rating, Ratings and Data quality on the left, Last sold, Low, Median, High and For sale on the right. When the card is narrow it is one column again. The counts have thousands separators, as on Discogs' own box.


## 9.99.1540 — 2026-11-04

**🚀 Feature**

- Discogs master page: a new first button, Tracks, shows the master the way the release page's Tracks button shows a release. There is one table per disc or record (named by its positions, or by Discogs' heading when there is one per disc), the credits as columns (Instruments, Vocals, Producer, Engineer, Mixed by, Arranged by, Other credits), and the master's videos in a table under the tracks, with Play. Above the tables: "\~ Master release by … (year)", Notes, Details and Images. Details has on the left Master release (year, the main release ★, the newest release, the number of versions), External links, Genres and styles and Community (Have, Want, ratings and data quality; copies for sale, prices and formats, read from Discogs' own Statistics and For Sale boxes on the page). On the right is Credits: one line per person with their roles and the tracks each is on ("Guitar A1–B2, B4 · Harmonica A1"), the people on the most tracks first. The versions table is the second button, Versions, as before, now under one "Versions" sub-table heading.
- New setting: ⚙️ Settings → 💿 Discogs → "Master page: the number of versions in the Tracks view" (on). The count costs one request more, the master's first page of versions; off, Tracks asks only for the master.


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


---

**Older versions:** [November 2026](ShowAllEntityData_CHANGELOG/2026-11.md) · [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

*Generated from ShowAllEntityData_CHANGELOG.json by scripts/build-changelog-pages.py — do not edit by hand.*
