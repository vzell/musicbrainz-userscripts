# ShowAllEntityData — Full development log

Every version, newest first, with the technical details behind each change. For what changed for you in each published release, in plain words, see [What's new](ShowAllEntityData_RELEASES.md).

**Months:** [November 2026](ShowAllEntityData_CHANGELOG/2026-11.md) · [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

This page shows the newest 100 of 1844 versions; the month pages hold all of them.

---

## 9.99.1673 — 2026-11-21

**🚀 Feature**

- New WARNING "Possible duplicate recording" (👯) on an artist's recordings and a release tracklist: a recording that looks like another one on the same page, by the rules of majkinetor's Fusion, ported verbatim (credited in the header): a shared ISRC (or AcoustID), or at the normal cutoff the same title and artists with lengths within 5 s; never a video beside audio, live beside studio, two venues or dates, lengths more than 30 s apart, ISRCs of one batch, or a recording with an open edit. Read from the page, no requests. The title cell is tinted; its card names the other recordings of the group, what they share, its tier (strict / normal / loose) and what was kept apart. The ⚠️ menu filters to them, and the title column's 📊 has a new section "Duplicate recordings - Group" with one entry per group. Mockup approved 2026-11-20: https://claude.ai/artifact/LCthm5p9EiftZC6znZsqVB.
- Three settings under ⚠️ FINDINGS: "Find possible duplicate recordings" (sa\_findings\_rec\_dup), "how close is a match" (sa\_findings\_rec\_dup\_cutoff: Auto = strict on an artist's recordings, normal on a release; or strict, normal, loose) and the tint (sa\_findings\_tint\_rec\_dup), all on.
- The grouping never compares all pairs: an ISRC/AcoustID index, and for the normal and loose cutoffs title blocks (a prefix filter over the words, exact for Fusion's word test, and the title's two ends for its spelling test), walked in Fusion's own order, so the groups are Fusion's (checked against its all-pairs loop on Tom Petty's 2,630 recordings: identical at all three cutoffs; \_computeRecDupCtx(), \_recDupGroups(), \_recDupCandidatePairs(), \_recDupRecord(), \_recDupCommentSetting(), \_cmpDupHtml()).
- On a release tracklist a duplicate whose recording links no work keeps the "no work" tint and ⚠️, and its hover card shows the duplicate group under the "no work" text (\_writeFamilyTipFindings(), a finding's underFamilyTip). Columns that load later (AcoustIDs, Performance attributes, Recording of work) group the page again (\_recDupRegroupSoon()).
- A page too big to group at the normal or loose cutoff (more than two million candidate pairs: Springsteen's 74,630 recordings) is recognised up front from its title blocks and given up in about 0.07 s instead of 0.8 s (\_recDupBlockPairs()); on such a page nothing is marked, as before.


## 9.99.1672 — 2026-11-20

**✨ Improve**

- The card of a Brucebase mark on MusicBrainz (events and works) no longer lies over the link's preview: hovering a marked cell's link opens the card and, a moment later, the link's preview with its "Finding" box. The card now moves to the right of them when the window has room, else below them.


## 9.99.1671 — 2026-11-20

**🚀 Feature**

- MusicBrainz works: marks from the Brucebase feed (BruceParser 0.27.0, feed 1.8), on the Work cell of an artist's or area's works and beside a work page's Brucebase link (after the page's press also in its "Sidebar" card). ❌ ⚓ "Brucebase link reaches nothing": the link names a page the wiki does not have, or an anchor its page does not have; the card names where it likely should go (the nine works that link the renamed Greetings sessions page get its new …-nj-studio-sessions page, King's Rock gets \#kingsrock). ⚠️ ⇉ "Two works link one Brucebase song", with the other work in the card. ⚠️ ≉ "Work title differs from its Brucebase song": case, quotes, dashes and the wiki's "( - Artist - )" after a cover's title do not count, and one of the work's aliases may be the song's title. 14 works in the run of 2026-11-19. Each mark has its own switch in ⚙️ Settings → ⚠️ Findings, on by default; "Read the Brucebase feed on MusicBrainz too (events and works)" turns all of it off.


## 9.99.1670 — 2026-11-20

**🚀 Feature**

- MusicBrainz event lists and event pages: a fourth mark from the Brucebase feed (BruceParser 0.26.0, feed 1.7): ⚠️ ± "Brucebase entry has another date", an event whose Brucebase link names the entry of another date than the event's (1971\#030771b, the Upstage show of 1971-07-03, on an event dated 1971-07-04). Dates are compared as far as both go; a span such as a month of studio sessions fits when it holds the entry's date. The card says which side is likely wrong by the date at the start of the event's own name: the name agrees with Brucebase, so likely the event's date; or the name agrees with the date, so likely the link or the wiki's date. It shows the event with its disambiguation, its date, and the wiki's entries of the event's date, or that it has none. 7 events in the run of 2026-11-19, 6 of them a day late against their own name. On the Event cell of every event list and beside the Brucebase link on an event's page, after the page's press also in its "Sidebar" card; its own switch in ⚙️ Settings → ⚠️ Findings, on by default.


## 9.99.1669 — 2026-11-20

**🚀 Feature**

- With Rx on, the card under the global filter (the one query mode got in 9.99.1668) reads your regular expression: a green "Valid" and the pattern piece by piece ("^Born (to\|in)": the start of the cell · the text "Born " · group 1, holding: either "to" or "in"; repeats said after their piece), plus that each cell is tested on its own and what Cc and Ex do to it; or a red "Invalid" with the faulty spot marked and the reason and fix in plain words ("This ( has no closing ). Write \\( for a bracket."), the same in every browser. An Examples button offers nine patterns (a year from 1980 to 1999, an empty cell, two spaces in a row, …); a click puts one into the field and "↶ Back to …" restores what you typed. The filter's regular expressions have no Unicode flag, so \\p{L} is the letters "p{L}", and the card says so.


## 9.99.1668 — 2026-11-20

**🚀 Feature**

- The global filter has a query mode: tick the new Q box beside Cc, Rx and Ex, and the box reads the query language majkinetor's Event Horizon uses (credited). "format:cd" keeps the rows whose Format column contains "cd" (the start of a column name will do: "form:cd"), "-live" and "-(live OR demo)" leave rows out, OR and AND (in capitals) combine terms, quotes keep a phrase or a space together, and a Date or Year column takes ranges such as "date:1990-1995", "2016-" or "-1987". Side by side means AND, so "type:album year:1975-1985 -live" is the albums of those years that are not live; a lower-case "rock and roll" stays one phrase. A card under the field says what the query means as you type, what is still missing ("Format: type a value") and when a key names no column, and its Syntax button lists the rules. Ex turns the whole query round, Cc applies to every term, Q and Rx switch each other off, only the matching terms are highlighted, each sub-table uses its own columns, and a pinned or recent filter remembers its Q. Off on every new page; with Q off nothing changes, and plain filtering is as fast as before. A query searches every row on each key (a query can widen as you type), so on a very large table it is a little slower than a plain word.


## 9.99.1667 — 2026-11-20

**🚀 Feature**

- Brucebase: a new warning from the Brucebase feed (BruceParser 0.24.0): ⚠️ ⇋ a show's Notes, Gallery, Eyewitness, Media or Recording notes page whose name is not the show's, as its breadcrumb names the show. For example gallery:1967-11-00-… under gig:1967-11-00a-… (a missing day letter), "palais-omnisport" under "palais-omnisports" (a typo), or a page under a show of another date or place. A name Wikidot cut at its 60 characters, a "-1"/"-2" of two pages of one date and the "dl-" of a download's note count as fine. The show is marked on its rows, its page and its window, the page itself on its rows (Recent changes, the tag lists); the hover text names the page and the name it would have. 36 pages in the run of 2026-11-19. Its own switch in ⚙️ Settings → ⚠️ Findings, on by default.


## 9.99.1666 — 2026-11-20

**🚀 Feature**

- A release page (Tracklist or Credits) marks a ℗ notice in its annotation that no relationship backs: a line that starts with ℗, (P) or "Phonographic copyright", as on a sleeve ("℗ 1973 CBS, Inc."), is tinted light yellow with a ⚠️ when neither the release nor any of its recordings has a phonographic copyright relationship. Hovering (or tapping) it explains why and shows the holder as read. The ⚠️ list shows it first, under "This release", with the table warnings under "In the tables"; clicking it opens the Annotation, scrolls to the line and flashes it. A ℗ on even one recording is enough, © lines are not checked, and nothing is flagged while some of a long release's tracks are not on the page. No requests: it reads the page's own data. The rule and the notice parser are majkinetor's Group Therapy (credited); its own tint switch, ⚙️ Settings → ⚠️ Findings → "Highlight ℗ notices in a release's annotation that no relationship has as WARNING" (on).


## 9.99.1665 — 2026-11-20

**🚀 Feature**

- Brucebase: a show's song tags can now be checked too (⚙️ Settings, "Also check a Brucebase show's song tags", off by default while the tag checks are tuned). Every song the setlist links should carry its tag as the Brucebase feed's song map names it: the tags the shows of that song carry, such as "btr" or "borntorun" for Born to Run. The link's own title as a tag counts too, and a medley the feed names ("Land Of Hope And Dreams - People Get Ready") counts through its combined tag. Only songs whose tag the wiki uses on at least 9 of 10 of their shows are checked, and only linked songs. On the wiki today it flags 465 shows with 825 missing song tags.
- Brucebase: the place tags check now also expects the show's venue tag: its "Venue" link leads to the venue page, and the feed's venue map gives that page's tag. It adds 10 shows, for example 1981-04-26 Forest National without "forestnational".


## 9.99.1664 — 2026-11-20

**🚀 Feature**

- Brucebase: a show's cast tags can now be checked too (⚙️ Settings, "Also check a Brucebase show's cast tags", off by default while the remaining tag checks are tuned). Every person and band that a show's cast tab (On Stage, In Studio, On Audio, On Set) lists should have a tag. A tag counts in the ways the wiki writes names: "garrytallent", the dotted "vini.lopez", without "The", without a nickname, and each part of "Flo & Eddie". A show with an On Stage tab should carry "onstage". One with an On Stage tab but no On stage page gets "onstage" marked missing alone, since its cast is not tagged at all, rather than one mark per person. The cast is checked once the show's On stage page has been read, and the E Street Band's dotted names and other aliases come from the Brucebase feed. On the wiki today it flags 628 shows, 475 of them for the missing On stage page. "studio" and "guest" are not checked: the wiki uses them too unevenly.


## 9.99.1663 — 2026-11-20

**🚀 Feature**

- Brucebase: a show's content tags can now be checked too (⚙️ Settings, "Also check a Brucebase show's content tags", off by default while the remaining tag checks are tuned). A show whose News/Memorabilia tab shows a setlist should carry "setlist" (and "handwritten" or "printed" when the picture's name says so), one showing a ticket should carry "ticket", and one with an entry on its Storyteller or Eyewitness tab should carry "storyteller" or "eyewitness". A "storyteller" or "eyewitness" tag without its tab's entry is a ⚠️. The picture tags never are: a picture can sit on a news page the tab lists, or in its Flickr gallery. It reads only the page itself, with no request and no feed. Like the other tag checks, it is marked on the Tags card, in the preview window and in the year table's Tags column. On the wiki today it flags 154 shows. "news", "memorabilia", "bootleg", "livedl", "soundcheck" and "rescheduled" are not checked: the wiki does not tag them by a rule the page shows.


## 9.99.1662 — 2026-11-20

**🚀 Feature**

- Brucebase: a show's place tags can now be checked too (⚙️ Settings, "Also check a Brucebase show's place tags", off by default while the remaining tag checks are tuned). A show should carry tags for the city, the US state or Canadian province ("newjersey(nj)") and the country its title names, "usa" or "canada" after a state or province, and "europe" or "oceania" for a country there. Like the other tag checks, it is marked on the Tags card, in the preview window and in the year table's Tags column; a place tag is never called not expected. A few names the wiki tags its own way ("West Germany" is "germany", "Atlantic City" is "atlanticcitynj") and the regions come from the Brucebase feed, so BruceParser keeps them up to date without a new script version. Without the feed the Tags card says the place is not checked. On the wiki today it flags 35 shows, most of them without "usa" or "canada", one with the city written "Los Angels". The venue's own tag will follow through the feed.


## 9.99.1661 — 2026-11-20

**🚀 Feature**

- Brucebase: a show's tour tag can now be checked too (⚙️ Settings, "Also check a Brucebase show's tour tag", off by default while the remaining tag checks are tuned). A gig or a cancelled show whose date lies in a tour's dates should carry that tour's tag (both tags where two tours overlap), unless it is tagged "tour\_no", the wiki's mark of a one-off show between a tour's dates. A tour tag whose tour has other dates is a ⚠️. Like the other tag checks, it is marked on the Tags card, in the preview window and in the year table's Tags column. The tours and their dates come from the Brucebase feed, so BruceParser keeps them up to date without a new script version. Without the feed the Tags card says the tour is not checked. Rehearsals, recordings, interviews and dates with "00" are not checked. On the wiki today it flags 49 shows, for example the four Bijou Cafe pages of December 1973 tagged "tour\_wies" and the Brussels show of 2008 tagged "tour\_rsng" instead of "tour\_mgc".

**📝 Docs**

- The setting "Read the Brucebase feed" gave the file's size as about 25 KB; it is about 28 KB compressed now.


## 9.99.1660 — 2026-11-19

**🚀 Feature**

- A new ⚠️ WARNING on a release's "Credits" tables: a relationship whose role does not fit the release's format, from the page's own data and with no requests. Pressed, printed or manufactured on a release that is only Digital Media, lacquer cut with no phonograph record (vinyl, shellac, acetate), glass mastered with no pressed optical disc (a CD-R is burned, not glass mastered). A release with "CD + Digital Media" is judged on both media, so its pressing plant is fine. A medium of unknown format and the release group's rows are never flagged. The cell's tooltip names the role and the formats. The rules come from majkinetor's Group Therapy. The tint has its own switch in ⚙️ Settings → ⚠️ Findings.


## 9.99.1659 — 2026-11-19

**🚀 Feature**

- Two more ⚠️ WARNING checks on a release tracklist, from the track's own data and with no requests: a title that names a remixer ("Everlasting (Psyche remix)") while the track credits no remixer, and a medley title ("A / B") whose recording links works for fewer of its parts. Anonymous mixes ("(Extended Mix)", "(mono mix)", "(5.1 mix)", "(U.S. remix)") and non-musical parts in square brackets ("\[band intro\]") are not counted; the cell's tooltip names the remixer or the counts. The remix rules come from majkinetor's Credit Hoarder. Each tint has its own switch in ⚙️ Settings → ⚠️ Findings.

**🐛 Fix**

- The release tracklist's "Recording of work" column showed only the first work of a recording that links several; it now lists every work, one line each (with ▶ to fold a long list), each with its own "(live)"/"(cover)". The songs a medley work is made of stay in its "Work medley of" column.


## 9.99.1658 — 2026-11-19

**🚀 Feature**

- Brucebase: "Read every row" reads the event page of every row of a year table or the start page, not only the rows you scroll to. It is in ▶ Pages' progress card and in the ☰ menu's Brucebase group. Rows are read in the table's current order, rows a filter hides included, still one page a second. Above 200 rows it first says how many rows, pages and about how long. The card shows the time left, the rows flagged so far and the row being read. Stop puts the rest back, and a later press goes on where it stopped. Filters such as "All errors" take in the new rows every 25 rows or 10 seconds, without moving the window.

**🐛 Fix**

- "All errors" / "All warnings" now takes in a row whose problem is found later (a Brucebase row read by ▶ Pages, artwork that loads late). Before, such a row stayed hidden until the filter was changed.


## 9.99.1657 — 2026-11-19

**🚀 Feature**

- An artist credit that ends with a join phrase after its last artist ("Bad Legs, SeekFlow,", "… feat."), usually left over from a removed artist, now shows in the ⚠️ WARNING menu and the 📊 Findings section of the Artist columns, with a yellow tint and the phrase in the cell's tooltip; the same list as MusicBrainz's report "Artist credits with dubious trailing join phrases". No requests. The tint has its own switch in ⚙️ Settings → ⚠️ Findings.


## 9.99.1656 — 2026-11-19

**🐛 Fix**

- Typing in a filter on a large table (over 1,000 rows), then pressing ✕ or sorting while the filter was still working, no longer redraws the table a second time afterwards. The extra redraw showed the right rows, but on a big table it was one long pause.


## 9.99.1655 — 2026-11-19

**🚀 Feature**

- The ❌ and ⚠️ lists of problems start with All errors / All warnings: one click shows every row with a problem of that kind in any column (two single rows in different columns show only rows with both). Its number counts rows; while it is on, the single rows are greyed, a chip beside the global filter has a ✕ to remove it, and All errors with All warnings together show rows with both. On every page, MusicBrainz and Brucebase alike; on Brucebase it is BruceBaseParser's "only the mismatches" view.


## 9.99.1654 — 2026-11-19

**🚀 Feature**

- Five release checks from majkinetor's Platform Check and Mission Control now show in the ⚠️ WARNING / ❌ ERROR menus, the 📊 Findings sections and as a cell tint on release lists (release group, artist, label, series and tag pages), with no extra requests: an all-zero barcode such as 000000000000 (❌, it passes the format check), a release with no barcode entered (an empty cell; "\[none\]" is not flagged; counted in the menu, its tint is off by default), a label without a catalog number ("\[no label\]" excepted), a release with neither a date nor a country, and, on a release tracklist, a track with no length ("?:??"). Each tint has its own switch in ⚙️ Settings → ⚠️ Findings.


## 9.99.1653 — 2026-11-19

**🐛 Fix**

- Brucebase with BruceBaseParser installed too: on a page where BruceBaseParser runs, the action button now reads 🎛 BruceBaseParser is on this page, with a hover text saying why, instead of making a table from the page BruceBaseParser has already changed (a year page's table came out empty, a show page lost its setlist and cast tables and counted BruceBaseParser's own tags and title marks as the wiki's). Link previews and every other page work as before; switch BruceBaseParser off for brucebase.wikidot.com to get the buttons back.


## 9.99.1652 — 2026-11-18

**🚀 Feature**

- Brucebase venue, song, person and band, and release pages: their tags are checked like a show's (BruceBaseParser's page tag checks, parity batch 4). On the page's Tags card and in its preview window, a missing tag gets a red dashed chip and a tag that is not expected an amber ⚠️, with the ❌/⚠️ pills and the reasons in words. Checked: the page's kind (venue, song, retail; person with a Bands tab, band with a Members tab), the first letter as the wiki's letter tabs list it (0-9 for a digit, & for a band with &; not on a release), underconstruction against the Under Construction banner, and on a song its title as a tag and lyricsheet against a lyric sheet in its Gallery. Nothing more is read. Over the whole mirror of 2026-11-15 this flags 41 of 6,990 pages; the first letter matches BruceParser's own report.
- Never flagged: a second letter tag (the wiki lists some pages under an alternative title), a page tagged redirect, a release's tab pages, playlists. Left out as too noisy: a release's dates, a venue's place tags, a person's or band's name tags.

**✨ Improve**

- On those pages the BruceParser feed's first-letter mark after the byline (and after the window's title) is left out while missing tags are looked for: the check reads the page as it is now. The two settings Find Brucebase shows and pages that lack a tag / … with a tag of a checked kind that is not expected now cover these pages too; their defaults are unchanged.
- "&" counts as a letter tag in a Brucebase Tags card's rows (the wiki's letter for a band with "&").


## 9.99.1651 — 2026-11-18

**🐛 Fix**

- A jump of the computer's clock (a time sync, a virtual machine catching up, waking from sleep) no longer cuts short or stretches a wait in the shared MusicBrainz request gate: the page now counts every wait on a clock that never jumps, while the times it shares with other tabs and scripts stay as they were.
- Another script's "I am drawing a page" mark in the shared gate holds the page's background MusicBrainz requests for at most 10 s from the moment the page first saw it, so a broken or far-future mark can no longer stall them for minutes; a renewed mark still holds them again.


## 9.99.1650 — 2026-11-18

**🐛 Fix**

- The shared MusicBrainz request gate (mbu:mb-gate, shared with majkinetor's scripts) can no longer hang a request behind a Web Lock that never answers: after 3 s the booking goes ahead without the lock, and a lock granted later books nothing a second time (ported from his dev/net/mb-gate.mjs).
- A hold stored in the shared gate counts for at most 60 s from the moment the page first saw it, both when a request is booked and while it waits, so a broken or far-future hold can no longer stall the page's MusicBrainz requests for minutes. Behind such a hold, a 503 the page gets itself still holds it for the time MusicBrainz asked, and the debug log reports that time, not the broken one.
- Waits in the shared gate now end on time even when the browser holds the page's timers back (seen in Firefox with Violentmonkey): they also wake on animation frames, page changes and a worker's timer, and all of that stops as soon as nothing waits (ported from his mbnSleep, \#999).
- The Relationships column's job log now says that a wait is a hold MusicBrainz asked for, not pacing, and adds a line when a new hold makes the wait longer.


## 9.99.1649 — 2026-11-18

**🐛 Fix**

- MusicBrainz title style on the Springsteen sites: "QE" (Queen Elizabeth) stays in capitals, so Brucebase's "QE II JUBILEE SPORTS CENTRE" (1985-03-31) reads "QE II Jubilee Sports Centre" in the year tables and listings instead of "Qe II Jubilee Sports Centre".


## 9.99.1648 — 2026-11-18

**🐛 Fix**

- Brucebase date windows read a show's year-page entry as the year table does. The year page's note on a setlist ("Incomplete setlist.", "Setlist may be incorrect or out of order.") was read as part of the last song, and "No set details known." as a one-song setlist (951 songs across the year pages): the note is now a line of its own under the songs, and an entry with only that note shows no song.
- An entry whose first paragraph is a description rather than a setlist (2016-10-03 Barnes & Noble) no longer shows it as a one-song setlist (275 such songs), and an entry whose description is plain paragraphs rather than a box (1985-03-31, QE II Jubilee Sports Centre) now has its Notes in the window: 4,838 of 5,017 shows have a description there, 2,212 before. A soundcheck is a group of its own. Year pages read before are read once more.


## 9.99.1647 — 2026-11-18

**🚀 Feature**

- Brucebase feed on MusicBrainz: BruceParser compares the artist's MusicBrainz events with Brucebase, and an event whose Brucebase "reviews" link is doubtful is marked on its Event cell in every event list (an artist's, a place's, an area's events, event collections, event tags) and beside its Brucebase link on its own page. ❌ the link reaches no entry (197 events in the run of 2026-11-15, 172 of them because the wiki now writes that date with a letter: 2023\#120923 against \#120923a and \#120923b), ⚠️ two events link one entry (18; the one whose date differs from the entry's is called likely wrong), ⚠️ the link is a show's page, not its year-page anchor (1).
- Hover a mark: the card lists the wiki's entries of the event's date as links to the year page, the one whose heading names the event's place marked likely, so the link can be corrected. No request to MusicBrainz or the wiki: an event list's or an event page's press reads the feed at most once a day, shared with Brucebase. New setting "Read the Brucebase feed on MusicBrainz too" (on), a switch for each finding and one tint.

**📝 Docs**

- Needs the feed of BruceParser 0.21.0 on GitHub; an older feed marks nothing on MusicBrainz. A kept feed written by an older BruceParser (without a map this version reads) is read again on the next press once it was read an hour ago, instead of being used for the rest of its day.


## 9.99.1646 — 2026-11-18

**🚀 Feature**

- Artist and label pictures from majkinetor's Event Horizon, when it is installed: an artist's or a label's window (Space) shows the pictures Event Horizon finds on Discogs, Deezer, Tidal, Apple Music, SoundCloud, Bandcamp, YouTube Music and Wikipedia after this script's own, in the order you set in Event Horizon. They are marked "via Event Horizon" under the large picture and with a small EH on their thumbnails, and the viewer links each provider's page. This script's pictures show at once; one line says while Event Horizon is still asking, and when it gives no answer this script's pictures stand alone, with nothing said. Event Horizon's Wikipedia picture is left out when the window already shows a Wikimedia Commons file. The card on hover and the picture beside an artist's or label's name show the picture Event Horizon already knows, without asking anybody; beside the name it joins the turn last, its dot ringed in blue. New setting: Also Event Horizon's pictures, when it is installed (on; it needs Pictures in artist, label and place previews, and the settings dialog greys it out while that one is off, with VZ\_MBLibrary 4.6.0). This uses the shared lookup Event Horizon offers other scripts (MBU.artistImage, agreed on majkinetor/musicbrainz-userscripts \#938).


## 9.99.1645 — 2026-11-17

**🚀 Feature**

- Brucebase feed: a year listing's rows are marked too (e.g. /1973-list). A listing links the show's entry on its year page, not the show's own page; the feed now names the year-page anchor of every show it marks, so the row of 1975-11-10 Tampa gets the same ❌ as the show's row on the year page. Where two entries of a year page share one anchor (1972's two Mediasound sessions), the row's own date picks the show. No request.
- On Brucebase, the window of such a link (Ctrl+hover a listing row's Event link, Space) carries the show's marks after its title as well.

**📝 Docs**

- Needs the feed of BruceParser 0.20.0 on GitHub; an older feed marks no listing row. A script before this version ignores the new data.


## 9.99.1644 — 2026-11-17

**🐛 Fix**

- Brucebase date links with a letter (`brucebase.wikidot.com/1985#310385b`, one of several shows of one date; 338 entries of the wiki have one) and links to the early years' page (`…/1949-64#230949`) had no card and no window: the reader turned them away although it reads those shows fine. They now preview like every other date link, on Brucebase, on MusicBrainz (an event's "reviews" link) and in windows, and each shows its own show, not the other one of the same date.


## 9.99.1643 — 2026-11-17

**✨ Improve**

- MusicBrainz link previews follow a change made in Event Horizon at once: after a rating, a tag vote, an alias edit, a collection change or an edit vote there, the next card or window asks MusicBrainz again instead of showing what it kept for up to 24 hours (Keep MusicBrainz answers for (hours)). This uses the shared last-write time majkinetor's scripts keep in this browser (localStorage mbLastWrite, agreed on majkinetor/musicbrainz-userscripts \#938); SAED only reads it. It applies to the entity cards, a release group's releases and facts, edit and editor pages and the paged lists of the windows. The Relationships column, recording lengths and "Recording of" keep their own lifetime, because no such change alters what they hold, and the external sites' previews (Wikipedia, Discogs, setlist.fm, …) are not affected.


## 9.99.1642 — 2026-11-17

**🚀 Feature**

- Brucebase feed: three more findings from BruceParser's full read of the wiki. ❌ a page that is no show and lacks a tag of the date in its name ("22" for a page of 1978-08-22), ⚠️ one that carries a date tag its date does not have ("23"), ⚠️ a page tagged "files" that shows no picture (30 files index pages and two venues in the run of 2026-11-15). On the cell that names the page in every Brucebase list (the "files", "news" and "media" tag pages above all), in its window, and after a venue page's byline. A show's own date tags stay with the Tags findings, so one error never gets two marks.
- What the page in front of you shows wins here too: a date tag it has now, a wrong one it no longer has, a picture it shows now or a "files" tag it no longer carries drops the mark. The wiki's social icons, which every page has, are no picture. New settings: a switch for each of the three findings, on.
- The Brucebase feed's line in the ☰ menu and at the foot of the ⚠️/❌ menus names the BruceParser version of the file kept ("run of 2026-11-15 · BruceParser 0.19.0 · 226 pages"), so two files of one run can be told apart; its hover text names the rest (the feed.sh version and commit, when it was read, its pages per kind).

**📝 Docs**

- Needs the feed of BruceParser 0.19.0 on GitHub; an older feed simply has none of the three. A script before this version ignores the new data.


## 9.99.1641 — 2026-11-17

**🐛 Fix**

- springsteenlyrics.com on a phone (and in Firefox's responsive design mode): after pressing the button, nothing stayed at the top of the window: not the heading with the buttons, not the section bar, not the column headers. The site is set up for phones, and with a table wider than the screen Firefox let what you see slide around inside a much larger page area, which the docked bars do not follow. While a shown table is wider than the screen, the page can now no longer be zoomed out below 100 %, and the bars stay at the top. Zooming in still works; when the table fits the screen again, zooming out works as before.


## 9.99.1640 — 2026-11-17

**🐛 Fix**

- springsteenlyrics.com: on the collection's "Latest additions" page and on the sampler and memorabilia lists, the toolbar line (the heading with the SAED button and the status line) stayed at the top of the window only for a short distance and then scrolled away, before and after pressing the button. The site's own page structure ends the block holding the heading right after the category buttons, and a docked line cannot go past the end of the block it is in. The heading is now placed in the block that holds the whole list, so it stays at the top all the way down. Other pages were not affected and are unchanged.


## 9.99.1639 — 2026-11-17

**🐛 Fix**

- springsteenlyrics.com on a phone or in a narrow window: a white band stayed near the top of the window while scrolling down, and the page scrolled behind it. Two causes. The toolbar heading was docked 80 pixels down, below the site's menu bar, but the site only keeps that bar at the top in windows wider than 992 pixels; in a narrower one the heading now docks at the very top. And the white backdrop behind the docked heading stayed on after the heading itself had scrolled away (in a wide window too); it is now shown only while the heading is docked.


## 9.99.1638 — 2026-11-17

**🚀 Feature**

- Brucebase: the BruceParser feed. BruceParser reads the whole wiki offline and publishes what only that full read can see, in one small file on GitHub (github.com/vzell/brucebase-feed). The script reads it at most once a day, when you press a Brucebase page's button or open a Brucebase window with Space (never from a hover), keeps it for every site, and marks the pages it names with no request to the wiki.
- Four new findings: ❌ a page titled differently from its show (an On stage, Notes, Media, News or Story page; marked on that page AND on the show, 25 shows in the run of 2026-11-15), ❌ a page without any tag, ⚠️ a page without a parent page (104 story pages), ⚠️ a page without its first-letter tag. On every Brucebase list they sit on the cell that names the row's own page (Event, Title, Name, Page), with the menus, the 📊 Findings sections and the tint of every other finding; on a page's head after its byline, and in its window after the title.
- What the page in front of you shows wins: a page that has tags now, links a parent now, or whose title changed since the run is not marked for it. Every mark names the run it comes from, and calls it old after 14 days.
- When the feed cannot be read, nothing is marked from it and nothing stops; the findings menus and a new Brucebase group in the ☰ menu say why ("not loaded (GitHub answered 404)"), with Retry; an earlier copy is still used. The ☰ line otherwise names the run kept, with Read again. New setting "Read the Brucebase feed" (on), a switch per finding and one tint.

**📝 Docs**

- Not marked yet: a year listing's rows (they link the year page's anchor, not the show's page). Size: +34 KB.


## 9.99.1637 — 2026-11-16

**🐛 Fix**

- Brucebase: the tags kept on a show's On stage page were not found for shows with a long address (101 shows). The wiki cuts a page name to 60 characters, and "onstage:" is four characters longer than "gig:", so such a show's On stage page has a shortened name ("…-red-bank-n"). It was asked by its full name, not found, and the cast's tags were missing from the Tags card, the preview window and the year table's Tags column.


## 9.99.1636 — 2026-11-16

**🚀 Feature**

- Brucebase tag check: the wiki's two icons are checked too. A show marked with the Help Us icon should carry the tag "help", one marked with the Featured star "featured"; a show with neither icon should carry neither tag. A missing one is listed as "help missing" (❌), one without its icon is marked ⚠️, with the reason, in the same two findings as the date, day letter, kind and premiere tags.
- On a year table and a year listing the icons come with the page, at no cost. A show's own page and its preview window read the show's year page once for them, at the press or on Space (one more request, kept like every year page); with both tag findings switched off it is not read.
- The Featured star is recognised by its picture, also where the wiki gives it no title (12 shows).

**🔧 Refactor**

- Every stored preview of a page on another site, and every stored Brucebase year page, is read once more (both readers now keep the icons).


## 9.99.1635 — 2026-11-16

**🚀 Feature**

- Brucebase: a page title with two blanks in a row, or a blank before a comma, now also gets a ⚠️ after the show page's byline and after the preview window's title (until now only the year table's Event cell said so). Its hover text shows the title with ␣ where the blanks are. It follows the switch "Find Brucebase titles with two blanks or a blank before a comma".


## 9.99.1634 — 2026-11-16

**🚀 Feature**

- Brucebase year tables and listings: a new Tags column, filled by ▶ Pages. It lists every tag of the show, one a row and folded like On stage: the page's own tags and, marked ↪, those kept on its On stage page.
- Two new findings on that cell. ❌ "Brucebase tags: an expected tag is missing": the page should carry a part of its date (year, month, day, weekday), the letter of a second show of a day, its kind of page (gig, recording, …) or the number of tour premieres (the songs in bold, with "prem"), and none of the show's pages has it. ⚠️ "Brucebase tags: a tag that is not expected": a tag of those four families the page does not call for ("wednesday" on a Monday, "recording" on a gig). Marked tags stay in view while the cell is folded; the cell's hover text gives each with its reason. Both are in the ⚠️/❌ menus and the column's 📊, survive Save to Disk, and have their own switches and a tint setting under ⚙️ Settings → ⚠️ Findings.
- For the missing tags, ▶ Pages also reads each show's On stage page (and a full page's "-2"): about one more request per show with a cast, kept 30 days like the other pages. With the "missing" finding or the On stage tags switched off those pages are not read, and no show with a cast is then said to lack a tag.

**🔧 Refactor**

- Every stored preview of a page on another site is read once more (the Brucebase record now says what a show's page calls for).


## 9.99.1633 — 2026-11-16

**🚀 Feature**

- Brucebase show pages and their preview windows: the Tags card checks the show's tags against what the page calls for, in four families — the date, the day letter, the kind of page and the number of tour premieres. A tag that is missing is drawn as a red dashed chip ("9+ missing") in its family's row and is not counted in "Tags (N)"; a tag that is not expected gets an amber outline and a ⚠️. Each says why in its hover card, and under the chips each finding is written out. The pills ❌ N missing and ⚠️ N not expected, and "Findings" in the card's Show control, leave only the marked chips. ✓ says the four families are as expected.
- Nothing is marked while the show's On stage page is still being read, so a tag kept there is never called missing. With that page unread (the On stage tags switched off, or a page that failed) the card says that no missing tag is looked for. No request beyond the pages a press or Space reads anyway.
- This is the first part of BruceBaseParser's expected-tags check. Its other families (tour, place, cast, songs, what the page holds) are not checked yet: with BruceBaseParser's rules unchanged they would flag 88 % of all shows.


## 9.99.1632 — 2026-11-15

**🚀 Feature**

- Brucebase year tables and listings, ▶ Pages: a row that is read can be read again. Move the pointer over the row and click the ⟳ in its On stage cell: its event page and venue page are asked for whatever is kept, its year's listing too (on a listing, the year page), and the row's findings are made again. Up to three requests.
- "Read every row again" in the ▶ Pages progress card does it for the whole table: every row goes back to "not read" and is read again when it is in view, never all at once; a venue and a year's listing are read again once. Rows not scrolled to before the page is left keep their stored copy.


## 9.99.1631 — 2026-11-15

**🚀 Feature**

- Brucebase year pages: the Setlist column is compared with the Setlist tab of each entry's own page, once ▶ Pages has read it. Three new findings: ❌ "Brucebase setlist: songs differ from the event page" (a song only on one of the two pages; a medley written as one entry counts), ⚠️ "… a song is written differently" ("TWIST & SHOUT" against "TWIST AND SHOUT") and ⚠️ "… a set is named differently" ("Pre-show jam" against "Pre-Show Jam", or a Soundcheck only one page names). Notes in brackets ("(with Tom Morello)") are set aside. No request of its own. In November 2026: 95, 22 and 112 entries.
- A flagged Setlist cell has a card with both setlists side by side: hover it, tap it, or focus it and press Enter. It shows the lines that differ with the song before and after each, the letters that differ marked, "Show all N songs" for the whole set, and links to the year page and the event page. Esc closes it.
- Link previews of other sites are read again once after this update (an event page's record keeps its sets as written).


## 9.99.1630 — 2026-11-15

**🚀 Feature**

- Brucebase year pages: a new finding on the Event column, ❌ "Brucebase year entry missing from the year's listing". No line of the year's listing (/1977-list) links the entry: it is missing there ("1977-07-29 - Atlantic Studios"), or its line links another anchor. 16 entries in November 2026.
- ▶ Pages on a Brucebase year table now also reads the listing of each year whose rows come into view: one more request a year, kept like the year pages, and it answers every row of that year. After a reload the kept listing is used at once, without ▶ Pages. Switch the finding off in ⚙️ Settings → ⚠️ Findings and no listing is read.


## 9.99.1629 — 2026-11-15

**🚀 Feature**

- Brucebase year pages: a new finding on the Venue column, ⚠️ "Brucebase event page names its venue differently from the venue page". The title of an entry's own page names the venue differently from the title of the venue's page it links ("CBS Records" against "CBS"). A show of the day in brackets ("(Late)") and a description between the venue and its city ("Mediasound Studios, Studio C, New York City, NY") are accepted. It shows once ▶ Pages has read the entry's page.
- ▶ Pages on a Brucebase year table now also reads each entry's venue page: one more request per venue (not per entry), kept 30 days. The first reading of a year takes about a third to a half longer. Switch the venue finding off in ⚙️ Settings → ⚠️ Findings and no venue page is read.
- Link previews of other sites are read again once after this update (the venue pages' records get a new field): the first hover or ▶ Pages on a page read before asks the site again.


## 9.99.1628 — 2026-11-15

**🚀 Feature**

- Brucebase year listings (/1978-list): two new findings on the Event column, BruceBaseParser's listing checks. ❌ "Brucebase listing entry named differently from the year page": the listing writes an entry differently from the heading the year page has at the anchor it links (1966: "BUSINESS DISTRICT" against "UNKNOWN LOCATION"). ⚠️ "Brucebase listing entry with a wrong link to the year page": the link's anchor is not the entry's date, it names another year's page, or the year page has no such anchor. The date and year part shows with the table; the rest once ▶ Pages has read the year page, which is one request a year and answers every row of that year at once. A switch for each and one tint setting in ⚙️ Settings → ⚠️ Findings.

**🐛 Fix**

- Brucebase year listings: ▶ Pages said "no page of its own" for every recording session, rehearsal and interview, and for every entry whose anchor ends in a letter (several entries on one date). The year page was read for shows and cancelled shows only, and for anchors of six digits only. Such rows are now read like the others. Year pages kept from before are read once more.


## 9.99.1627 — 2026-11-14

**🚀 Feature**

- Brucebase year pages: a seventh finding of 9.99.1626's family, ❌ "Brucebase anchor used by two entries of the year page". Two entries of one year page have the same anchor ("000472b" on 1972-04-00 and on 1972-05-00), so a link to it, from an event page or from MusicBrainz, reaches only the first. Both rows are flagged, with the table and without any request. Its switch is in ⚙️ Settings → ⚠️ Findings; the tint is the anchor family's.

**🐛 Fix**

- Brucebase year pages: a table saved with Save to Disk came back with most of its errors gone (1972: 39 saved, 3 loaded). The MB-Event column's answers, the columns filled by ▶ Pages and both header buttons were not in the file. They are now: a loaded year shows the same findings as the saved one, the ▼ MB and ▶ Pages buttons are back, and nothing is asked again. A file saved before this update loads as before.
- Brucebase, springsteenlyrics.com, jungleland.it, brucespringsteen.it: the title of the Save to Disk dialog ("Save Table Data") stood pushed aside and wrapped when the table was wider than the window. The sticky page headers took it for a heading of the page.


## 9.99.1626 — 2026-11-14

**🚀 Feature**

- Brucebase year pages: six new findings on the Event column, the checks BruceBaseParser made on a year page. Two need no request and show with the table: ⚠️ "Brucebase anchor with another date than its entry" (the anchor is not the date as day, month, year: "000472b" on an entry of 1972-05-00) and ⚠️ "Brucebase anchor letter differs from the event page's address" (several entries on one date: the letter on the anchor against the letter after the date in the address; common in the early 1970s). The others show once ▶ Pages has read an entry's page, with no request of their own: ❌ "Brucebase event page named differently from the year page", ⚠️ "Brucebase event page adds (Early), (Late), … to the name" (also Afternoon, Evening, First, Second, Third, Morning, Soundcheck), ❌ "Brucebase event page links another entry of the year page" (its "Info & Setlist" link), and ⚠️ "Brucebase title with two blanks or a blank before a comma" (the heading at once, the page's title once read; year listings too). Names are compared as the wiki writes them, in capitals, with "Stone Pony (The)" read as "The Stone Pony" — never the text in MusicBrainz title style. Each has a row in the ⚠️ / ❌ menus and the 📊 dropdown, tints its Event cell, says what differs in the cell's tooltip (above "As written on the site"), and is kept by Save to Disk. Nine new settings under ⚙️ → ⚠️ Findings: a switch per finding and three tints (name, anchor, blanks), all on.
- Link previews of other sites are read again once after this update (their stored records get two new fields for the checks above): the first hover or ▶ Pages on a page read before asks the site again.


## 9.99.1625 — 2026-11-14

**🚀 Feature**

- Brucebase: the Tags of a page's head and of its preview window (on every site) now also show the tags kept on other pages. Brucebase allows 512 characters of tags per page, so a show's cast is tagged on its own On stage page, and a full page continues on a second one ("-2", "-3"). Those tags are drawn dashed with ↪; their hover card names the page that keeps them, and the pages are listed below the tags with how many each adds. They are read when you press the page's button or open the window with Space (never from a hover): for a show with an On Stage tab its On stage page, and the next page only while the one before is nearly full (over 450 of the 512 characters). A bar shows the pages being read, and a page that fails can be read again with Retry. New setting "Show the tags kept on a show's On stage page" (on).
- Every card of chips at the head of another site's detail page (Brucebase, springsteenlyrics.com, Discogs, archive.org, setlist.fm, …) and a Brucebase window's Tags get a tool row once they hold 6 chips or more: Show (All / This page / the other pages, where a card has them), a filter that keeps the chips containing the text and marks it in each, Group by (the card's own kinds, Page, None) and A–Z / Z–A (press the pressed one again for the page's order; Brucebase tags start A–Z, every other card in the page's order). Group by and the sort are remembered between pages; the filter is not. Esc clears the filter. Each row's label shows how many chips it holds.


## 9.99.1624 — 2026-11-13

**🐛 Fix**

- Multi-table pages with sticky filter bars: opening a sub-table (e.g. "Album + Compilation + Live" on an artist's release groups) could make the whole page flicker until the section was closed again or the page scrolled. The h3 bars' shared height was rounded up from a measurement with a tiny rounding error (22.0001 px), so it switched between 22 and 23 px on every frame; the measurement is now snapped to 1/100 px first.


## 9.99.1623 — 2026-11-13

**✨ Improve**

- Brucebase: a story page's window shows the page's own picture (the E Street Radio and DJ-set banners) with its title; the Storyteller badge is left out.
- Brucebase: a song's window keeps the links of the song's intro under its title (the writers, the original artist, the album); the hover card still shows it as words. Its Lyrics section keeps the "Visit SpringsteenLyrics.com for other versions of this song." link after each version.
- Link previews on the Springsteen sites: a link to the page you are on that only adds an \#anchor (a jump within the page) no longer opens a preview of that same page.


## 9.99.1622 — 2026-11-13

**✨ Improve**

- Brucebase: links to a song's tour page, its On The Tracks page and its lyrics page now preview (Ctrl+hover), under the song preview's setting. The tour page's card says how often the song was played on tour and on how many tours, the window lists every tour; On The Tracks shows the versions under each song with the releases each is on; a lyrics page's card shows its first four lines and how many versions it has, the window each version (the first open) and the springsteenlyrics.com link last.
- Brucebase: links to an album's studio sessions page and to a discography page now preview, under the event, venue, people and release setting. A sessions window has the overview, the credits and each table folded with its first 100 rows; a discography window has the releases under the page's own headings, each with its cover, year, release date and label, and the covers as its pictures. The other stats pages still have no preview.
- Brucebase: links to /multi: and /soundcheck: pages preview the show they lead to, as /onstage: links do.


## 9.99.1621 — 2026-11-13

**✨ Improve**

- Brucebase: the window of a person or band starts with the biography (About) and its source, and the hover card shows its first sentence.
- Brucebase: the window of a release or playlist also shows, folded, its On The Tracks versions under each song (with the releases each is on), its Recording 'Live' Dates under each disc with each date linked to its show, its Gallery/News press links, how often its songs were played live, its notes and history, and the links to its lyrics and media.
- Brucebase: a release's page (Release button) shows its Gallery/News press links too, folded above the details.


## 9.99.1620 — 2026-11-13

**✨ Improve**

- Brucebase: the window of a show, recording session or interview now starts with the page's description (About this show), and its hover card shows the description's first sentence. A page whose description is plain text above the tabs shows it too, in the page's own view as well.
- Brucebase: the window lists the people under the tab's own name: In studio for a recording session (with the session's name first), On set, On site. An interview's playlist is listed like a setlist, each song with its original artist. The venue's other lists (Appearances, Cancelled, Performances without Bruce, the From My Home To Yours episodes) are folded sections, and an older page's News tab shows as News/Memorabilia.
- Brucebase: the year table's On stage column shows a recording session's people too.
- Brucebase: the window, the year table and the event page's own view now list a show's guests too (a second list on the wiki's page: Bruce Springsteen as guest at another act's show, a radio show's guest after its hosts), and the people of the rarer tabs (On Phone, On Call, In Room). In the year table a line-up with several groups shows each group's members under it.
- Brucebase: a window no longer shows the code of the wiki's Flickr gallery as text.
- Brucebase: a new WARNING, "Brucebase event page with an 'Onstage' tab": in a year table or year listing, an entry whose page spells its cast tab "Onstage" (one word) is flagged on its Content cell once ▶ Pages has read it, also when the warning's filter is on while pages arrive. Its own settings switch it and its tint off.


## 9.99.1619 — 2026-11-13

**✨ Improve**

- Brucebase: a page's History section, with ✎ and H, is now in its window on every site, MusicBrainz included, not only on brucebase.wikidot.com. From another site the requests carry none of your cookies.


## 9.99.1618 — 2026-11-13

**🚀 Feature**

- Brucebase: the year table and the year listings get four columns from each event's own page: who was on stage (the band's members folded), which tabs have something in them (Recording, Storyteller, Media, …), the pictures by kind, and the scheduled start. They fill in after ▶ Pages in the On stage header: the rows you can see, then each row you scroll to, one page a second; a row whose hover card you opened before fills in at once, with no request. A row that could not be read shows ⟳ to ask again.


## 9.99.1617 — 2026-11-13

**🚀 Feature**

- Brucebase: a discography page (…/stats:discography-album, -retail, -single, the specials, -video) gets a button that shows every release it lists in one table: year, title, subtitle, cover, release date (with its day, month and year), label, and the section and tab it is under. A cover shows big on hover and opens in the viewer on a click. Nothing is fetched.
- Brucebase: the songs registered at the Library of Congress (…/stats:songs-registered) get a button that shows every title in a table with its song page where the wiki's song list has it (one request), the registration record above.


## 9.99.1616 — 2026-11-13

**🚀 Feature**

- Brucebase: a song's tour page (…/stats:hungry-heart-tour) gets a button that shows every tour in one table: how often the song was played, the tour's own number of shows, the share with a bar and the page's note, then the other known shows and the public rehearsals. Nothing is fetched.
- Brucebase: an album's studio sessions page (…/stats:born-to-run-studio-sessions, and each of its parts) gets a button that shows its tables, one per section and tab: the released and additional recordings, every take of the version history in one table with its name split into song, version, take and date and the wiki's note on the song as a column, the timeline and the potential album sequences; the album, its release date, label, credits and overview above. Nothing is fetched.

**✨ Improve**

- Brucebase: On The Tracks (on song, On The Tracks and release pages) splits a take's name further: "THE HEIST - V2 - take 14" gets a Take column, "JUNGLELAND - V1 (August 1, 1974)" a Date column.

**🐛 Fix**

- Brucebase: on a stats page's Tables (9.99.1615), a table whose every row is bold no longer takes its first row as the column names (a studio session's version tables), and a table of one bold row no longer gives its row as the column names to the tables after it.


## 9.99.1615 — 2026-11-13

**🚀 Feature**

- Brucebase: the statistics pages (…/stats:…: bootlegs by label, shows with circulating audio, the venues of a state, awards, song counts per tour, performance counts per city, …) get a button for each kind of content they have. List: the page's links in one table with the tab they are under, a show's or venue's title split into date, venue, city, state and country, the wiki's sort forms ("Left Foot (The)", "Band, The") turned round. Tables: the page's own tables, one per tab or heading, the first open, with a Section column where a row names the rows below it. Nothing is fetched; the wiki's page stays below, folded.

**🔧 Refactor**

- A test of the built-in hidden-columns rows offered on upgrade expected one row; since the Discogs Section rows there are three, so it now re-offers only the one it checks.


## 9.99.1614 — 2026-11-13

**🚀 Feature**

- Brucebase: a story page (…/story:…: a show's Storyteller words, an interview, a podcast, a speech, a DJ set) gets a button that shows its words as tables — each moment of the show with the song it leads into, or each speaker's turn, a table per part — with the kind, the date, the show's own page (found with one small request) and who compiled it above.
- Brucebase: a story link's window names the page's kind, date, how many moments or turns it has and who compiled it.


## 9.99.1613 — 2026-11-13

**🚀 Feature**

- Brucebase: the tag cloud (https://brucebase.wikidot.com/system:page-tags) gets a button that shows every tag in a table: its family (songs and people told apart with the song list and Relations), its weight on the cloud and about how many pages carry it.
- Brucebase: a tag's page (…/system:page-tags/tag/storyteller) gets two buttons: the tagged pages as a table (kind, and for a show its date, venue, city, state and country), and the same pages read from the wiki's page lists with when each was created and last changed, its size, comments and tags.
- Brucebase: Pages & Tags (…/manage:pages-and-tags) gets three buttons: this page, every page of its list, and every page of the wiki with its tags; the tags one row each.
- Brucebase: every link to a tag's page (the cloud, our tables, the tags line under each page, a window's Tags) shows how many pages carry the tag and the newest six on hover; Space opens the tag's pages in the window, the first 250 at once and "Load all" for the rest.


## 9.99.1612 — 2026-11-13

**✨ Improve**

- Brucebase Recent changes: each row's page has a ✎ button that opens the page's History in the window on that revision against the one before it (an older revision too: the list's later pages are read for it).
- Brucebase History: every comparison scrolls to its first changed line and marks it; and on the wiki's own History (signed in), a comparison opened there scrolls to its first difference.


## 9.99.1611 — 2026-11-13

**🚀 Feature**

- Brucebase: the year listing pages (https://brucebase.wikidot.com/2026-list, …, /1949-64-list) get two buttons. Events turns the year's list into a table — Event (linked to the show on the year page, with its card and window), Date with its parts, Venue, City, State, Country, Note (Recording Session, Rehearsal, Rescheduled, …) and Tour (from the Start of / End of boxes); All years reads every year's listing into one table. Under the year pages' switch.
- Brucebase: a tour box that ends one leg and starts the next in one line ("End of the 1st leg, and Start of the 2nd leg of …") now starts the new leg, on the year pages too.


## 9.99.1610 — 2026-11-13

**✨ Improve**

- Brucebase: the window of a show on its year page (e.g. an event's "Info & Setlist") shows the year page's icons — Photo, Setlist, Memorabilia, Video, Bootleg, … — each with its name, instead of a line of words.
- Brucebase: every Brucebase window (a venue, a person, a show, a song; on Brucebase or from another site) opens any link in the same window, as a MusicBrainz window does: a venue's "Source: Wikipedia" shows the article there, with Back.


## 9.99.1609 — 2026-11-13

**✨ Improve**

- Brucebase: links to a show on its year page (an event's "Info & Setlist", a release's "recorded July 6, 1981", e.g. /2026\#020526) now preview on Brucebase's own pages too — the card on hover, the show in the window on Space — as they already did on every other site. Clicking one still goes to the year page.


## 9.99.1608 — 2026-11-13

**🐛 Fix**

- Brucebase: the wiki's top-bar menus (Manage Site, Help Docs, …) can be used again. Their entries opened under our toolbar and status line, and the menu closed as the pointer moved down onto them, before any button was pressed too. The wiki's header is now lifted over our pinned toolbar, as MusicBrainz's top header already was.


## 9.99.1607 — 2026-11-13

**✨ Improve**

- The Brucebase window's History section: chips for the kinds of change (All, Source, Title, Page name, Tags, Metadata, Files, each with its count; several at once) filter the revisions at once; a tag change in the list shows as pills (+ tour\_lohadnk, − album\_thepromise); From and To on every row compare any two revisions, the older always on the left and the revisions between them tinted; every comparison shows the tags of both (added +, removed struck, or "the same in both") and a changed page title or page name. The list is read 100 revisions a page, and a revision that changed only tags no longer reads the page's text twice (9.99.1606's History section).
- "✎ Page history" is now in the ☰ menu of every Brucebase page with the toolbar, Recent changes and the year pages included (their own history: the 2026 page is at revision 310). Links to Brucebase story pages (the Storyteller words of a show) preview them, with the story's words and the History section, so a story page's title changes and renames can be seen too.


## 9.99.1606 — 2026-11-13

**🚀 Feature**

- Every Brucebase preview window on brucebase.wikidot.com ends with a folded "History" section: the page's revisions, newest first (number, date, who, the kind of change, the comment), and what the revision you click changed — the old lines and the new ones side by side, the changed words marked, the unchanged lines folded ("Everything" shows them), a revision that changed only tags or the title saying so. You need not be signed in: the wiki answers its history to everyone (probed signed in and signed out). Nothing is read until the section opens; then 20 revisions ("Load 20 more" for older ones) and the two texts the change needs, one request a second, kept until you leave the page. ✎ in the window's title bar and H open it; on a page that has a window, the ☰ menu's "✎ Page history" opens it for the page itself. Setting: Page history in the Brucebase window (on).

**📝 Docs**

- Help: the window's History section; two places still named the event preview setting by its old label.


## 9.99.1605 — 2026-11-13

**🚀 Feature**

- Brucebase release and playlist pages get a button, "Release": a table per edition and disc (song, running time, where the track comes from, the page's footnote on it; a box set's films each a table of their own), the personnel, the related releases, a live release's recording dates (the show's date and place, linked), the takes On The Tracks and how often each song was played live. Above them the facts the page states (released, label, produced, recorded, mixed, mastered, design, photography), each edition's running time, the overview, footnotes and history, tags, media, the lyrics' pages and the artwork typed by its file names; the wiki's page folded below. Nothing is fetched.
- Brucebase bootleg pages get "Bootleg": the tracklist, a table per disc with each song's time and, where the page marks them, the sides; the label, catalog number, time, format, source and sound in a Bootleg card, the notes and the Front, Back and Disc artwork. The wiki writes bootlegs as free text — lists, numbered lines, "Disc 1: (43:31)", "//" after a side's last song — and all of it is read.
- Links to Brucebase release, playlist and bootleg pages preview them (Ctrl+hover): their facts and tracks; Space opens the window with the overview, personnel and related releases. The settings are now called "Detail pages: events, songs, venues, people, releases and bootlegs as tables" and "Preview event, venue, people, release and bootleg pages on hover".

**🐛 Fix**

- A YouTube player embedded as "youtube.com/embed/playlist?list=…" (Brucebase's release pages) was taken for a video named "playlist"; it is the playlist.
- Brucebase On The Tracks: a take written "THE HEIST - V2 - take 14" or "JUNGLELAND - V1 (August 1, 1974)" is now split into title and version too (song pages and the new release pages).


## 9.99.1604 — 2026-11-13

**✨ Improve**

- Brucebase: the shows in a person's lists link the wiki's "on stage" pages, which the wiki forwards to the show; these links now preview the show itself, card and window.

**🚀 Feature**

- A new WARNING on the Brucebase detail pages, "Brucebase entry with a comma after its date": an entry the wiki lists as "2015-04-30, Story Chapel, …" instead of "2015-04-30 Story Chapel, …". It is still read; the Date cell is tinted, its tooltip quotes the entry, and the lists being the linked pages' titles, that page's title is the one to fix. Settings "Find Brucebase entries with a comma after their date" and its highlight (both on).


## 9.99.1603 — 2026-11-13

**🚀 Feature**

- Brucebase venue pages get a button, "Venue": the performances, cancelled shows and appearances at the venue as tables, its description, region, count, map link and pictures above, the wiki's page folded below.
- Brucebase pages of people and bands get "Person": every performance with Bruce Springsteen as one table — the wiki splits long lists into pages (Steven Van Zandt's 1,517 shows over six), and every page is read, one request each — with an As column saying in which band; the count per band; appearances; the recordings by song and role; their bands or members (in reading order: "The E Street Band"); songs co-written with Bruce. The biography, tags and pictures are above. The setting is now called "Detail pages: events, songs, venues and people as tables".


## 9.99.1602 — 2026-11-13

**🚀 Feature**

- Brucebase song pages get a button, "Song": the credits (each release, who played what), the performances counted by tour (only the tours it was played on, with its share of the shows), every performance, multiple performances on one date, snippets, the official live downloads and its takes On The Tracks (title, take, running time, the bootlegs and releases it is on), as tables you can filter and sort. Above them: where the song comes from, Released on Album, the lyrics and notes (folded), a Song card (how often and when last played live, released on, live downloads, takes), its tags, media and links; the wiki's page folded below. An On The Tracks page gets "Versions": its takes as one table. Nothing is fetched. The setting is now called "Detail pages: events and songs as tables".


## 9.99.1601 — 2026-11-13

**🚀 Feature**

- Brucebase event pages (a gig, a show that did not happen, a recording session, a rehearsal, an interview) get a button, "Event", that lays the page out like a MusicBrainz release, from the page itself with nothing fetched. Above the tables: what it was, where and when; About this show; an Event card (type, date and weekday, scheduled time, venue, tour, the year page, running time), the page's tags by family and its YouTube links; the pictures with a chip per kind and per photographer. The tables: the Setlist as one table (Set, \#, Song in MusicBrainz style, Segue, Premiere ★ for a song in bold on the wiki, Note), who was on stage with their band and role, the other shows at the venue (this one in bold), the recordings (official releases, bootlegs with their labels, the live download) and the Storyteller's words by song. The wiki's own page stays below, folded, its headings folding too. Setting "Event pages: a detail view of the gig" (on). Mockup: https://claude.ai/artifact/3rAGVKsBHEv9jGspkJ5X7Z

**🐛 Fix**

- Brucebase previews: the scheduled time is read on pages that write it "Scheduled: 21:00 \| Local Start Time …" too; the card left it out.


## 9.99.1600 — 2026-11-13

**✨ Improve**

- Brucebase previews: a picture now says what its file name tells, the photographer included ("Photo · Cliff Breining · \#01", "Setlist · \#01a · Handwritten", "Pass · \#01 · Backstage"), in the window and in the full-size viewer. The window shows the photos once per photographer, those without a known photographer last. Each group folds on a click on its heading, and a Ctrl+click folds or opens every group at once, so a gig with hundreds of photos can be folded away; the text sections stay as they are.
- Brucebase previews: the window ends with the page's tags, folded at first, sorted into Date, Place, Tour, On the page, Songs, People, Releases and more; each tag links to the wiki's list of pages with it. Previews already cached are read once more.


## 9.99.1599 — 2026-11-13

**✨ Improve**

- Brucebase: the side bar's show/hide handle now sits at the top of the side bar, as the MusicBrainz sidebar's does, instead of halfway down the window. Scrolled down, it stays near the top of the window; with the side bar hidden, it sits at the top of the page content.


## 9.99.1598 — 2026-11-11

**🚀 Feature**

- A Discogs release's or master's Tracks view now shows the headings Discogs puts inside a disc ("Cologne 13/02/1981", "Paris 05/02/1981" on a box of live shows) as bands above their tracks, the way Discogs' own page does. Each band says how many tracks it holds and how long they run, and a click folds or shows them; a fold stays through sorting and filtering. On a computer a band stays under the column headers while its tracks scroll past; on a phone or tablet only with the new setting "Tracks view: sticky section bands on touch devices". With a filter on, a band says "2 of 8 tracks", and a section with nothing left loses its band. Sorted by any other column the sections no longer run together, so the bands step aside and each title shows its section as a small tag. The Section column is now hidden by default (it would say the same twice); it is still in 👁️ Visible and the 📊 menu. Mockup: https://claude.ai/artifact/JHuxeos1Yvu7DFwtBftHzg
- The Discogs link preview's window shows a release's or master's tracklist as an outline: a shaded bar per disc ("Disc 1 · Volume 1: Live In Europe, 1981 · 13 tracks · 1:16:38") and an indented row per section, each with its tracks and running time, both folding on a click. Chips above the list jump to a disc or a section. Up to about 40 tracks everything starts open; on a bigger release only Disc 1. The card's summary line says how the tracks split: "57 tracks on 5 CDs · 6 sections". Previews already cached are asked from Discogs once more.


## 9.99.1597 — 2026-11-10

**🚀 Feature**

- A Discogs Marketplace listing (/shop/item/…, where a /sell/item/… link takes you) gets a button: "Show all tracks". It shows the listed release the way a release page's Tracks button does: a sub-table per disc or record with the credits as columns, and the release's notes, facts and images above. A "For sale" card comes first in the facts: the media and sleeve condition, the price as listed, the page's own shipping and total, the seller (their shop) with their rating, where it ships from, the seller's comments and when it was listed. Two requests: the listing and its release.
- Links to a listing (the Item column of a seller's shop and of a release's Marketplace table, and Discogs' own pages) now have link previews. The card shows the release, the price as listed, the conditions and the seller with their rating, from one request. The window adds where it ships from, the comments and when it was listed, and the release's tracklist, credits and images (one more request). The release and the seller's shop open in the same window.


## 9.99.1596 — 2026-11-10

**🚀 Feature**

- Links to a Discogs user's submissions, contributions, collection or wantlist, and to a seller's shop, now have link previews, on Discogs, MusicBrainz and the other supported sites. The card shows how many entries there are and the newest three (for a shop also the seller's rating and where it ships from), from one request. The window shows 25 rows in a table you can filter and sort, with "Load 25 more", and links to the user's other lists. The links in a Discogs user's window (Contributions, Submissions, Collection, Wantlist, and the new For sale) now open in the same window. Mockup: https://claude.ai/artifact/2gnX1gagFEHTCC2LsFEn6n


## 9.99.1595 — 2026-11-10

**🚀 Feature**

- Discogs searches by the page's filters, without a search text (for example /search?style\_exact=Rock+%26+Roll, ?format\_exact=Vinyl or ?decade=1970&year=1975), now get the "Show all results" button too. The style, genre, format, country, year and decade are sent to Discogs' API; a decade without a year is asked as its ten years. The sort by title, year or Have is kept. Anything the API cannot ask (another sort, a second style) is left out, and the button's hover text and a note above the table say what was left out. Links to such searches get the search card and window too.


## 9.99.1594 — 2026-11-10

**🚀 Feature**

- A Discogs seller's shop (/seller/&lt;name&gt;/profile) gets a button: "Show everything for sale". It reads every listing from the shop's own pages, 250 a page, with the page's filters (format, price range, the shop search) and its sort. Discogs' item text is split into Artist, Title and Format, and also kept whole in the Item column, which links the listing. The other columns: the release's image (with the image card and viewer), each label, Cat\#, the community's rating and Have and Want, the media and sleeve condition, the seller's comments, where it ships from, the price as listed, the shipping, and the price in your currency. An empty shop has no button.


## 9.99.1593 — 2026-11-10

**🚀 Feature**

- A Discogs user's contributions page (/contributions?user=&lt;name&gt;) and submissions page (/user/&lt;name&gt;/submissions) each get a button. It shows the same list as the matching button on the user's page, read from Discogs' API. Contributions come in the order the page shows them (by label, for example), whether or not the URL names it. On the submissions page, the page's own search box has no counterpart in the API: with a search in the URL, every submission is still read, and the button's hover text and a note above the tables say so. The submissions page's locked scrolling is unlocked, as on a list's submissions page.


## 9.99.1592 — 2026-11-10

**🚀 Feature**

- A Discogs release's image revision page (…/images/history?rev=N, "Previous State of Images") gets a button: "Show every image revision". Until now the script did not run on that page at all, so it had no button and no link previews. The button shows one sub-table per revision of the release's images, newest first. Each heading names the revision, when it was made, by whom and its note; the page's own revision says "this page". Each image has a Change column comparing it with the revision before (+ added, moved, → primary, → secondary), and an image the revision removed gets its own greyed row, "− removed". The Image column has the image card and the viewer, as on the Images page. The button reads the release's edit history (one request a page), then one request a revision, with your Discogs session. The page's own links now have link previews too, as on the other older Discogs pages.


## 9.99.1591 — 2026-11-10

**🐛 Fix**

- The preview window of a Discogs release's image history (…/images/update, opened for example from a link on the release's edit history page): a hover on a thumbnail in its table now shows that image big with its type, uploader, date, size and file size, and a click opens the image viewer on the full image, where Shift+→ / Shift+← step through the rows. Before, the thumbnails had no card, and on MusicBrainz a click opened the image in a new tab instead of the viewer.


## 9.99.1590 — 2026-11-10

**🐛 Fix**

- A release's Images page and its image editor on discogs.com ("Show every image"): a hover on an image in the Image column now shows that image big with its type, uploader, date, size and file size, and a click opens the image viewer, where Shift+→ / Shift+← step through the rows in the order shown. Until now these tables had no hover card at all: the card looked for the row's release in a Title column, and these tables have none. The card asks Discogs for nothing (the row is the image); it is switched off with the setting for the Discogs Image column's hover card. A table saved to disk earlier gets the card too.


## 9.99.1589 — 2026-11-10

**🚀 Feature**

- Links to an image revision of a Discogs release (…/images/history?rev=N, the "Images" links of image changes in a release's edit history, in the history's preview window and in the table of the edit history page) have their own preview window. Before, they showed the release itself. The window lists every revision that changed the release's images, newest first, with who changed them, when and the note, and highlights the revision the link points to. That revision shows its images and what changed since the revision before: + added, moved, → primary / → secondary, and removed images greyed out. A click on an image opens the image viewer. Every other revision shows its images when you press its "▸ Show images"; "Load the N other revisions" reads all of them, one request each (Stop ends it). To list every revision, the window reads every page of the release's edit history. A revision's images come from Discogs' image editor, so they are read with your Discogs session, as the Image history window already does; signed out, the revisions are still listed, each saying why its images are missing. Like the other Discogs history windows, it reads only when you press Space, never on a hover.


## 9.99.1588 — 2026-11-10

**✨ Improve**

- The detail window (the one a link preview opens) can be made bigger on a phone. Its resize corner is the browser's own, and that answers a mouse only, so on a phone the window kept its size. A new ⤢ beside ✕ makes it fill what the screen shows, following when you zoom or pan; ⤡ gives it its size back, and the next window opens the way you left it. On a desktop a double-click on an empty part of its title bar does the same. On a touch screen a grip in the lower-right corner resizes it with a finger.


## 9.99.1587 — 2026-11-10

**🐛 Fix**

- On a phone you can stop a fetch again. A narrow screen moves the fetch buttons into the ☰ SAED menu as its "Load" rows, and that also hid the button that turns into "■ Stop · n / N" while pages load, so a long paginated fetch could not be stopped. Now, while a fetch runs, that button comes back beside ☰ SAED with its progress, "Stopping…" and "Rendering…", and the bar is one line again when it is done. In the menu, the running row says Stop as well, and the other Load rows wait the way their buttons do.


## 9.99.1586 — 2026-11-09

**🐛 Fix**

- springsteenlyrics.com: in a song's preview window (e.g. "For You" opened from an item page's tracklist), the release tables showed every MusicBrainz work icon at full size, several hundred pixels tall. They are now the same small icon, in the line before the title, as in an item's window.


## 9.99.1585 — 2026-11-09

**🐛 Fix**

- A jump of the computer's clock no longer holds back link previews, the Relationships column and the other lookups. The script spaces its requests to MusicBrainz, to the foreign sites' pages and to each external site (setlist.fm, Wikidata, Discogs, …) by booking a time for each; it booked on the wall clock, so one booking made while the clock was off (an NTP correction, a virtual machine resyncing, waking from sleep) put every request after it that much later. Found on a WSL2 machine whose clock jumped 16.8 s ahead for a tenth of a second every 5 seconds, where an artist window's albums came after 25 s instead of 8.5 s. The bookings now follow the page's own steady clock. MusicBrainz's request budget shared with majkinetor's scripts keeps the wall clock, as all of them use it.


## 9.99.1584 — 2026-11-09

**🐛 Fix**

- ? and / no longer open the keyboard shortcuts reference while you type into a drop-down or editable text. Before, only text boxes and text areas counted as typing: with the focus on a drop-down (such as the type next to MusicBrainz's search box, reached with Tab) the reference opened over it, and in editable text the key was also lost. Typing now means what Event Horizon's key guard already uses: a text box, a text area, a drop-down or editable text.

**📝 Docs**

- Help, Keyboard shortcuts: with direct Ctrl+letter shortcuts on and String Theory installed, Ctrl+K opens String Theory's command palette, not the shortcuts reference; use the prefix key and k, or ?, or give one side another key (String Theory: its settings, Command palette, Hotkey). The ? and / row says they do not work while typing in a field.


## 9.99.1583 — 2026-11-09

**🚀 Feature**

- Shared MusicBrainz request budget: on musicbrainz.org, this script's Web Service requests (the Relationships column, link previews, entity pictures, millisecond lengths, release events, the release-group ▶ expand, the Recording of columns) now also book their place in mbu:mb-gate, the cross-tab schedule majkinetor's String Theory, Event Horizon, ISRC Scout and his other scripts share. A refusal (HTTP 503/429) seen by any of them makes all of them pause, in every tab, and this script no longer crowds their requests out. Its own pacing (one request per 1.1 s) stays, so it is never faster than before. Follows his protocol version 1, ported from his dev/net/mb-gate.mjs (9.99.1582). Setting: "Share MusicBrainz's request budget with other userscripts" (sa\_mb\_shared\_gate, on). Other sites are not affected.


## 9.99.1582 — 2026-11-09

**📝 Docs**

- ShowAllEntityData is now licensed GPL-3.0-or-later (it was MIT up to 9.99.1581); the full text ships as LICENSE next to the script. Several of the scripts it builds on are GPL themselves, and majkinetor's Musicbrainz Toolset is now credited in the header, because the shared MusicBrainz request gate (9.99.1583) is ported from it.


## 9.99.1581 — 2026-11-08

**🚀 Feature**

- With majkinetor's Event Horizon (String Theory) showing: on a page this script supports, Event Horizon's More (⋯) menu in the page header now has "Open in ShowAllEntityData" (what V does) and one "SAED: &lt;button&gt;" item per button of that page, e.g. "SAED: Show all Tracks for Release". Such an item switches to MusicBrainz's page and presses that button, also after Event Horizon navigated to another page inside its view (it reloads into MusicBrainz's page of that one first). The items follow the page Event Horizon shows. Needs the String Theory with the menu protocol (majkinetor's \#938); as with V, Event Horizon then stays off for the next pages until you switch it on again.

**🐛 Fix**

- With direct Ctrl+letter shortcuts on, Ctrl+L (Load from disk) also made Event Horizon go forward in the browser history. It is now this script's alone there; with direct shortcuts off (the default) Ctrl+L stays Event Horizon's, and inside Event Horizon's view it is always its own.


## 9.99.1580 — 2026-11-08

**🚀 Feature**

- With majkinetor's String Theory installed, up to eight corner launchers and its dock sat in the bottom right corner over the rendered table. While a table of this script is shown on MusicBrainz's page they are now hidden (in Event Horizon's own view they stay). ☰ SAED → View → "Show corner launchers" brings them back for the page, "Hide corner launchers" hides them again. Needs the String Theory with the shared quiet mark (majkinetor's \#938).

**✨ Improve**

- New setting: ⚙️ Settings → 🎨 UI FEATURES → "Hide String Theory's corner launchers while a table is shown" (on).


## 9.99.1579 — 2026-11-08

**🐛 Fix**

- ISRC Scout (majkinetor) no longer replaces the ISRC and Links columns of a rendered tracklist with bare copies that have no sort buttons and no 📊, and no longer widens its headings: every table this script renders now says it is this script's (the shared data-mbu-foreign mark), which ISRC Scout leaves alone, and its own hover tip no longer shows over the table. Needs the ISRC Scout with that mark (majkinetor's \#938); with an older one, press the Tracks button after its columns have appeared, as before.


## 9.99.1578 — 2026-11-08

**🐛 Fix**

- Release tracklist with ISRC Scout (majkinetor) since its 2026.11.06 versions: the Links column lost its platform names (no "Links info - Platform" section in 📊, typing "Deezer" matched nothing), because the name moved out of the icons' title. The platform is read again, from ISRC Scout's new platform data first, then from its tip, then from the old title, so every ISRC Scout version works.

**✨ Improve**

- The Links icons of ISRC Scout get this script's own card: the platform, "(ended)" and the number of links, then the link addresses; ISRC Scout's own tip no longer shows next to it.


## 9.99.1577 — 2026-11-08

**🐛 Fix**

- With majkinetor's Event Horizon (or String Theory) installed, its single-letter keys also worked on MusicBrainz's own page, even with Event Horizon switched off: a stray H went to the editing history (E to the edit page, R to the relationship editor, and so on), and the page was gone, a rendered table with it. On the pages this script runs on, before and after a button is pressed, those keys are now ignored. V (switching Event Horizon on or off), every key inside Event Horizon's own view and typing into a field keep working.
- After a table was rendered, in majkinetor's Event Horizon (after V): clicking a link in its view, or pressing one of its keys such as H, brought up the script's "You are about to leave this page" question, even when Event Horizon opened the page in place and the table stayed; and when Event Horizon really left the page (a page it loads, or V after moving around in it, which reloads), the table could be lost without a word. Now inside Event Horizon's view nothing is asked on a click, and the browser's own "Leave site?" prompt comes when the page really unloads. On MusicBrainz's own page the script's question stays as it was.

**✨ Improve**

- New setting: ⚙️ Settings → 🎹 KEYBOARD SHORTCUTS → "Ignore Event Horizon's single-letter keys on MusicBrainz's page" (on). Turn it off to give those keys back to Event Horizon. Keys you rebound in Event Horizon are not known to this script.


## 9.99.1576 — 2026-11-08

**🐛 Fix**

- With majkinetor's Event Horizon (String Theory) showing when a page loads, which is its default: after switching it off with V, the script's hover cards no longer showed, and the sidebar handle was missing on MusicBrainz's page and on the rendered page. Before V, the handle showed over Event Horizon's own view. The script's floating elements (cards, menus, dialogs, the sidebar handle, notices and the rest) now always belong to MusicBrainz's page: hidden while Event Horizon shows, there and working after V.


## 9.99.1575 — 2026-11-08

**🚀 Feature**

- springsteenlyrics.com song previews have a new window. On the left: the song's title, a coloured pill with the version's type, ‹ › to step through this song's other versions, cards for the version (or a live version's show and the release it came out on) and for how many versions and releases the site has, then Info, the studio facts (the band as name and instruments) and the pictures. On the right: a row of chips that jump to a section, the lyrics, then the releases, rows, Live History and Available Versions.
- The lyrics are set as a lyric sheet in a book face, with a gap between verses and stage notes such as \[Spoken:\] set apart in grey small capitals. A run of identical lines folds to one line with "× 9", which unfolds on a click. Copy copies the lyrics as plain text.
- Every section folds: click its heading to open or close it, or Ctrl+click to open or close all of them. Lyrics, Info and the tracklists start open, the long texts start closed, and your choice is kept while the page is open.
- Differs from the album version: on any other version (unofficial, live, …) the window also reads the album version's page and marks the lyrics. Changed lines are yellow, with the changed words picked out and the album line in the tooltip. Added lines are green, and the album's missing lines can be shown crossed out. A chip counts the lines that differ, and Side by side shows both sheets. The album page is read once, when the window opens, never from a hover.
- Tables you can filter and sort, with the filter text marked: Available Versions (with a chip and a heading per type, and this version marked), each release's tracklist (a chip per edition, this song marked; a live version shows its show's tracklist above the lyrics), the release, single, cover and movie rows with their pictures, and the live releases. Song titles open their page in the same window, with Back.
- Live History shows one row per tour, with each date as a small chip; a date with a version page on the site opens it in the window. Quotes are set as pull quotes, and the site's placeholders ("SECTION NOT YET COMPLETED", "PAGE UNDER CONSTRUCTION") are left out. Song titles the site writes in capitals without a link are linked when the site has a page for them.
- Double-encoded text on springsteenlyrics.com ("CalexÃ³ns" for "Calexóns", "Saint-Ã‰tienne" for "Saint-Étienne"): the site serves it in its own pages. The window shows it repaired and underlined, with the site's text in the tooltip, and a red banner counts the spots, with a button that copies a report for the site's maintainer. A new ❌ ERROR finding, "Double-encoded text (springsteenlyrics.com)", flags the rows: on a song's page by their own text, and on the lyrics index once a song's page has been read, so the count grows as you browse. Setting: "Highlight springsteenlyrics.com rows with double-encoded text as ERROR".

**✨ Improve**

- springsteenlyrics.com song page (Show the song): a song's "Single Release" rows are now a "Single releases" table, like Other official releases.

**🐛 Fix**

- Preview windows on brucebase, jungleland.it, brucespringsteen.it and springsteenlyrics.com: a window whose page was already read could go back to "Loading the detail page…" when it was redrawn (a table's filter or sort, a chip).


## 9.99.1574 — 2026-11-07

**🐛 Fix**

- brucespringsteen.it record previews: a line the site writes between a record's facts and its Notes ("The original version is numbered." on All Those Years' LP) is no longer dropped, and "\*PROMO\*" leaves the title to become "promo" beside the kind (Official release or Bootleg).


---

**Older versions:** [November 2026](ShowAllEntityData_CHANGELOG/2026-11.md) · [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

*Generated from ShowAllEntityData_CHANGELOG.json by scripts/build-changelog-pages.py — do not edit by hand.*
