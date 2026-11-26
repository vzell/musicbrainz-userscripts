# ShowAllEntityData — Full development log

Every version, newest first, with the technical details behind each change. For what changed for you in each published release, in plain words, see [What's new](ShowAllEntityData_RELEASES.md).

**Months:** [November 2026](ShowAllEntityData_CHANGELOG/2026-11.md) · [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

This page shows the newest 100 of 1877 versions; the month pages hold all of them.

---

## 9.99.1706 — 2026-11-26

**✨ Improve**

- The Relationships column now re-checks older answers in the background: after it has loaded from the browser's storage, the answers kept for more than 7 days are asked again, the oldest first, at most 100 per page and one a second, without any loading glyph; a row whose relationships changed is rewritten, and the progress card says how many were re-checked and how many changed. Switch: "Re-check older kept relationships in the background" (on).


## 9.99.1705 — 2026-11-26

**✨ Improve**

- MusicBrainz link previews: a kept answer older than "Keep MusicBrainz answers for" (24 hours) is no longer replaced by "Loading…". For up to 30 days the old card or window is shown at once, its foot saying "checking…", while MusicBrainz is asked again in the background, as majkinetor's Event Horizon does with its kept answers; if the answer changed, it repaints. A change another script reports (Event Horizon, Group Therapy, Falcon, Apollo) still drops the kept answer at once.


## 9.99.1704 — 2026-11-26

**✨ Improve**

- Link previews: an instrument's window now shows MusicBrainz's own IROMBOOK drawing of it (no extra request), else the image its Wikidata item names, and its links, as majkinetor's Event Horizon does, and its description shows its links as links instead of HTML tags; a series' window shows its own picture link, else the image its Wikidata item names (asked on Space only), and its links. The card shows the picture once a window found it. A place's or a series' own page now shows the picture its preview window found (Wikidata's too) beside the name, from this browser's storage, without asking anything.


## 9.99.1703 — 2026-11-26

**🚀 Feature**

- discogs.com, the MusicBrainz column (with murdos' importer): a Discogs release that no MusicBrainz release links yet can now be looked for by its barcode, as majkinetor's First Contact does. 🔎 beside ▶ MB counts such releases; a press asks Discogs for each one's barcode, formats and tracks and searches MusicBrainz by the barcode, and a MusicBrainz release whose barcode, kind of media and track count agree shows as a candidate: the release icon in a dashed box with ≈ (≈2 for two). It is not a link: its card says what agreed, a click opens the release on MusicBrainz, and ⧉ copies the Discogs address to add it there yourself. At most 25 releases a press (60 with a Discogs token), never automatic, each answer kept for 7 days; 📊 "» MB links: candidate" keeps only the candidates.


## 9.99.1702 — 2026-11-26

**🚀 Feature**

- New ⚠️ finding "The same page linked twice in Relationships": the Relationships column now knows when two links are one page in different forms (Apple Music's /us/ and /gb/ storefront of one album, a Discogs release with and without its title in the address, tidal.com and listen.tidal.com, a Qobuz page in two locales, Deezer, Spotify and Beatport likewise), as majkinetor's scripts do. Such a link is a duplicate to remove. "Several links to one site in Relationships" now counts only really different pages, so those forms no longer show up there, and amazon.de and amazon.com stay different stores. Both findings have their own switch and highlight in ⚙️ Settings, and the tooltip names every form.


## 9.99.1701 — 2026-11-26

**🐛 Fix**

- When MusicBrainz answered a "Show all" page with its "Verifying your browser" page (once a day, after the browser's check expired), that page was taken for the list page: its rows were silently missing and the run called itself complete ("Loaded 3 pages (200 rows)" of 300), and on the request for the page count the whole list came out as one empty page. Now the script lets MusicBrainz verify the browser in a hidden frame and asks for the page again, as majkinetor's scripts do; if that does not work, the page counts as failed, the status line says INCOMPLETE and why, and ↻ Load the missing pages carries on. The link previews' cards also no longer take an ordinary page for the check because of a beacon address it contains.


## 9.99.1700 — 2026-11-25

**✨ Improve**

- When MusicBrainz refuses only searches because it is busy (an HTTP 503 marked "search-shed"), only searches now wait: this script's own lookups (the Relationships column, link previews, entity pictures) and those of majkinetor's scripts in every tab go on. Before, this script answered such a refusal by stopping every script's requests for a second or more. Its own searches (the millisecond lengths of a recording list, an event's release group lookup) now also wait when one of majkinetor's scripts saw such a refusal. As in majkinetor's request gate, every wait after a refusal gets up to half a second at random, so the waiting requests of many tabs do not all start again at the same moment, and a wait MusicBrainz names itself (Retry-After), or a refusal because all of MusicBrainz is out of room, is no longer stretched after repeated refusals. Only with "Share MusicBrainz's request budget with other userscripts (mbu:mb-gate)" on.


## 9.99.1699 — 2026-11-25

**✨ Improve**

- In String Theory's Network log (Ctrl+Alt+N), this script's rows now carry its own icon, the small table of its entries in Event Horizon's ⋯ menu, instead of String Theory's. It needs String Theory 2026.11.25.174628 or newer, which reads a script's icon from the shared browser storage (mbu.logIcons); this script writes its entry there once, on musicbrainz.org, when it first logs a request, and keeps every other script's entry. Like the log rows, only with "Share MusicBrainz's request budget with other userscripts (mbu:mb-gate)" on.


## 9.99.1698 — 2026-11-25

**🚀 Feature**

- springsteenlyrics.com, jungleland.it, brucespringsteen.it and Brucebase: after a press only the table view shows (springsteenlyrics.com keeps its navbar and breadcrumb, Brucebase its header and side bar); the rest of the site's page hides, and on a Brucebase event, song, venue, person, release, story or tag page so does the folded "Brucebase page". The switch (☰ SAED → View → "📄 Show the original page", Ctrl+M P, "▦ Back to the tables") shows the page as it was before the press, drawn by the site's own stylesheet in a frame over the page, with a note on top that says what does not work in that copy (on Brucebase, for example: searching, signing in and the page's own buttons): links work and open in the tab, Brucebase's letter tabs switch; Ctrl+M P works inside it too. On a Brucebase detail page the original view is the live wiki page instead: our tables hide, the wiki's title and page come back unfolded, everything on them works, and its own headings are no longer folded by us. A link followed on the copy asks first, as one on the page does ("You are about to leave this page").

**🐛 Fix**

- On a phone or tablet, the corner grip of a detail window (the one opened on a link) takes the finger more reliably: a drag on it could be taken for a scroll of the window's content and do nothing, depending on what lay under the window.


## 9.99.1697 — 2026-11-25

**🐛 Fix**

- setlist.fm: on a page long enough to scroll, the toolbar above our table (the action button and ☰ SAED) no longer disappears under a dark bar as soon as it sticks to the top. The backdrop meant to sit behind it lay over our whole section, in the colour of setlist.fm's dark page. Discogs and archive.org use the same rule now; MusicBrainz and the Springsteen sites are unchanged.


## 9.99.1696 — 2026-11-25

**🚀 Feature**

- discogs.com, archive.org and setlist.fm: after a press only the table view shows; the site's own page no longer sits under our tables. The switch of 9.99.1695 (☰ SAED → View → "📄 Show the original page", Ctrl+M P, "▦ Back to the tables") shows the site's own page again, live and fully working, with a "Live" note on top, and hides our section; back again, the tables are as you left them. The site's header stays only where it sits above our section (a Discogs master, release, artist or label page); where our section comes first (archive.org, setlist.fm, Discogs' search, submissions and user pages) the header hides with the page, and so does the footer. Before a press nothing changes. The site's page is shown as the site drew it: its own headings are not folded by us (archive.org's player and pictures are there after the switch); only Discogs' section headings keep their fold toggles.


## 9.99.1695 — 2026-11-25

**🚀 Feature**

- MusicBrainz pages: switch between the tables and the original page, and back, as often as you like, without a reload. After a "Show all …" press, ☰ SAED → View → "📄 Show the original page" (or Ctrl+M, then P) shows the page as it was just before the press: MusicBrainz's own list with its pages, its tracklist, its sidebar. A "▦ Back to the tables" button bottom right (or Ctrl+M P again) brings the tables back as you left them: the same rows, the filter you typed, the sort, and where you had scrolled. The original page is a copy taken at the press, so it switches at once and costs no request; a note on it says so, since MusicBrainz's own buttons in it (rating stars, "Load all tracks", the credits toggle) may not respond. Esc never switches. A load from disk takes the copy too. Every render opens on the tables; the choice is not remembered. With majkinetor's scripts, the button stacks with his corner launchers, and while the original page shows his launchers, keys and player behave as on a page without our tables. Like Event Horizon's V (org/majkinetor.org, "Switch between SAED's view and the original page (EH's V)"; approved mockup https://claude.ai/artifact/9wsKwn3kSr7LvhBkJVcijf).


## 9.99.1694 — 2026-11-25

**✨ Improve**

- With majkinetor's String Theory installed, this script's requests to MusicBrainz now show in its Network log (Ctrl+Alt+N), under the name ShowAllEntityData, beside his scripts' requests. Each Web Service request is one row with its reason (relationships, preview, length, recording of, release events, works, expand), its wait in the shared request gate, its answer, the hold a 503 set and MusicBrainz's rate-limit headers; a retry stays in its row. The pages of a list ("Show all") and the pages behind a card are listed too, marked as not paced. Nothing changes in how or when requests are made. The log is kept as String Theory keeps it (each tab's last 400 events, written once a second; secrets in a URL shown as •••), and only on musicbrainz.org with "Share MusicBrainz's request budget with other userscripts (mbu:mb-gate)" on.


## 9.99.1693 — 2026-11-24

**🐛 Fix**

- Brucebase year table: a private residence is no longer marked ❌ "Brucebase event page named differently from the year page" when the event page calls it "&lt;name&gt; Residence" and the year page gives its street or another name (1949-64: "87 RANDOLPH STREET, FREEHOLD, NJ" / "Springsteen Residence, Freehold, NJ"; 1991-02-09: "STING RESIDENCE" / "Sumner Residence"). The wiki writes them so on purpose, to keep a real person's address out of the page's address (Danny van der Linden, 2024). Date and place must still agree. BruceParser 0.43.2 has the same rule. 23 rows less on the whole wiki (38 → 15).


## 9.99.1692 — 2026-11-24

**✨ Improve**

- This script's items in Event Horizon's menus ("Open in ShowAllEntityData", "SAED: Show all Tracks for Release", …) now carry a small table icon, so an item you move from ⋯ into Event Horizon's main row no longer shows as words only. It reads on light and dark themes, and costs no request.

**📝 Docs**

- Help: a paragraph on String Theory's idle mode (a random theme and an animated effect over the page after five minutes without input, our tables included): what it costs and where in String Theory's settings to switch it off or give it a longer time.


## 9.99.1691 — 2026-11-24

**🐛 Fix**

- Brucebase feed: the feed of 2026-11-24 (BruceParser 0.43.0, with its relation map) did not load: "Brucebase feed: not loaded (the file is not a feed of format 1)", and the script went on using an older run. The file had grown past 512 KB, where the script cut every answer it reads from another site; it now reads the feed whole, up to 16 MB, and a bigger file is refused by name.


## 9.99.1690 — 2026-11-24

**✨ Improve**

- Brucebase tag checks on venue, person/band and release pages: three more checks, each off by default (⚙️ Settings → ⚠️ Findings). "Also check the place tags of a Brucebase show and of a venue page" (the place setting, renamed) now checks a venue page too: the city, US state or Canadian province, country and region of its own title, and the venue's own tag as its shows carry it (73 of 2,168 venue pages; BruceBaseParser's rule flagged 369). "Also check a Brucebase person's or band's own name tag": a person's or band's page should carry its own name as a tag, in the forms the cast check accepts, or the name the wiki itself uses for it from the Brucebase feed's new relation map, so a stage name such as "duckdunn" for Donald Dunn passes (17 of 1,292). "Also check a Brucebase release's date and first-letter tags": a release with a "Commercially Released" line should carry the year, month and day of one of the dates it names, a date tag that is none of them is marked ⚠️ (Life, Death And Dennis Hopper: tagged 2024, released 2025), and it should carry its title's first letter. Missing tags show in their row of the Tags card (Place, People, Date, Letter) and in the window, as the other checks do.
- Brucebase: the four release tab pages whose names the wiki cut at 60 characters ("…-hall-of-fame-credit") are no longer checked as releases.


## 9.99.1689 — 2026-11-24

**🚀 Feature**

- New 🧾 Activity log, in the SAED menu (Help, below ❓ Help) and in the Tampermonkey menu: what the script did on this page, one line per step, inside the page, so you can send it with a bug report without opening the browser's console. Each line shows its time, level, the console's icon and channel, and the message. A filter box keeps the lines with your text and marks it; Level and Channel chips show one kind at a time; Record detail records every step for this page only; ⧉ Copy as Markdown copies everything, ready for a forum post or a GitHub issue, naming the script and library versions, the page type and the page's address; Clear asks first. The window moves, resizes and goes full screen, and is full screen on a phone. When a warning or an error was logged, the menu row shows how many (an amber "2 ⚠", a red "1 ✖").
- The window itself is VZ\_MBLibrary 4.7.0/4.7.1's (Lib.logWindow, based on majkinetor's mbuLog from his Musicbrainz Toolset, with his permission). ShowAllEntityData puts it in MusicBrainz's own body, so a window opened while Event Horizon's view is on comes back after V, and gives it the page type for the copy. A debug line while debug logging is off is still not recorded at all, so nothing gets slower.


## 9.99.1688 — 2026-11-23

**✨ Improve**

- springsteenlyrics.com song window: the red "encoding error" banner now lists each spot, with its section and where in it ("Covers · 7 Lvvas · Note", "Lyrics · line 12") and the garbled word over the repaired one. It lists three, then "and N more · show all". A click on a spot opens its section and scrolls to it, which flashes. A section's heading says how many it holds, and its chip at the top carries a red count that goes to the section's first spot. The repaired text is easier to see: a light red tint, a wavy line and a small 🔤, and a red edge on its table cell. Saved song pages are read again once (parser version 38).


## 9.99.1687 — 2026-11-23

**🐛 Fix**

- springsteenlyrics.com, Brucebase, brucespringsteen.it: a cell whose title is shown in MusicBrainz style (its tip "As written on the site") now shows its findings above that tip. Before, the tip hid them: the lyrics index's Title cell of "Backstreets" was tinted for double-encoded text, but its card showed only the site's title.
- Comparison cards: a text that differs from the other only in letter case ("BACKSTREETS" and "Backstreets") is marked letter by letter, with the summary "10 letters in a different case", instead of "The two share little, so nothing is marked".

**✨ Improve**

- springsteenlyrics.com, the "Double-encoded text" card (9.99.1686): each spot shows the whole word, "CalexÃ³ns" over "Calexóns", not only "Ã³" over "ó". The song window's "Copy report for the site maintainer" names the word after each spot. Saved song pages are read again once (parser version 37).


## 9.99.1686 — 2026-11-23

**✨ Improve**

- Brucebase and springsteenlyrics.com: six findings that compare two texts now show them as the diff card, like the venue one (the two values one under the other, the letters that differ marked), instead of a sentence: "Brucebase page named differently from its show" and "… titled differently from its show" (on the cells and on a show's own head marks; a show with several such pages gets one pair each, a title pair names its page), "Brucebase event page adds (Early), (Late), …" (the year heading over the event page's name), "Brucebase event page links another entry" (both anchors as year\#anchor), "Brucebase entry with a comma after its date" (the entry over its usual form) and "Double-encoded text" on springsteenlyrics.com (each garbled text over what it means). The plain text stays the fallback.


## 9.99.1685 — 2026-11-23

**🐛 Fix**

- Brucebase: "the venue's own page names it differently" (⚠️ on a year table's Venue cell, after ▶ Pages) no longer flags the wiki's own conventions: today's name on the venue page ("ICC Berlin, West Berlin, West Germany" for "ICC Berlin, Berlin, Germany"), the generic "Unknown Location" page, a room or part named before the venue ("Spotify HQ, Adelphi (The), London, England"), and a description between the venue and a place of more than two parts ("Concert Hall, QPAC, South Brisbane, Brisbane, Queensland, Australia"). The same rules as BruceParser 0.41.0's venue report: on the Brucebase run of 2026-11-23 both flag the same 104 events (128 with the old rules on the run of 2026-11-21), among them MetLife ×12 and the Telegraph Hill recordings that link the Holmdel residence.


## 9.99.1684 — 2026-11-23

**✨ Improve**

- Brucebase: "Brucebase page named differently from its show" (⚠️ ⇋) also covers a show's On stage, Off stage and soundcheck pages, as the Brucebase feed of BruceParser 0.40.0 lists them (76 pages, e.g. onstage:1988-05-06-tacoma-dome-tacoma-wa under gig:1988-05-06-dome-tacoma-wa). These pages have no breadcrumb, so their show is the one show of their date; a day with several shows is left out. The show is marked on its rows, head and window, the page itself on its rows, as for a Gallery or Notes page. Only the finding's description and its report text change here; the marks come from the feed.


## 9.99.1683 — 2026-11-23

**✨ Improve**

- Link previews on other sites (discogs.com, setlist.fm, archive.org, the Springsteen sites): a country in a window's area line now shows its real flag instead of its two-letter code in a box (images from flagcdn.com, as majkinetor's Event Horizon does, asked only once a window opens). Codes with no flag there, such as XE (Europe) and XW (Worldwide), keep the box, and so does a flag the site blocks. On musicbrainz.org MusicBrainz's own flags stay, and Lotheric's "Right Side Flags" and "More Flags Everywhere" still leave the windows alone.
- Link previews: an area's window now starts its Facts with "Part of", the whole line above it with flags ("New Jersey, United States" for Long Branch), asked in one request (9.99.1682). Once a window has it, the area's hover card names that line too instead of only the nearest parent.


## 9.99.1682 — 2026-11-23

**✨ Improve**

- Link previews: a window now names an area's whole line ("Long Branch, New Jersey, United States") from one request instead of one request per level. It asks MusicBrainz's website for the area and everything above it (as majkinetor's Event Horizon does), about 1 KB, where the climb asked three lookups of about 30 KB together, each waiting for its one-a-second turn. Artist, label, place, event and recording windows all get it, and every area of the line is remembered, so a label in New Jersey asks nothing more. If the website does not answer, or answers with its browser check, the window climbs level by level as before, for the rest of that page. A hover card still asks nothing for the line.


## 9.99.1681 — 2026-11-23

**✨ Improve**

- The request budget shared with majkinetor's scripts (mbu:mb-gate) no longer lets two tabs take the same request slot. After booking a slot this script now keeps the shared lock 30 ms longer, as majkinetor's scripts do since String Theory 2026.11.23, so the booking reaches every other MusicBrainz tab before the next one reads the schedule. The request itself is not delayed, and this script's own pace (one request per 1.1 s, never faster than one a second in the shared schedule) stays as it was, although majkinetor's scripts now go faster.


## 9.99.1680 — 2026-11-23

**🐛 Fix**

- Event Horizon's player no longer plays on under this script's table. A track started in Event Horizon (majkinetor's String Theory) kept playing after V, with its controls gone, and the next track could show its source's own frame (an Apple Music login card). While a table of this script is shown on MusicBrainz's page, the player is now stopped and hidden: Event Horizon is asked to close it on its own player channel, but only in the tab that plays it, and any source it starts there again is removed. Before a button is pressed, in Event Horizon's own view and in a tab that only mirrors a player window, nothing changes. New setting "Stop Event Horizon's player while a table is shown" (on). It also sets &lt;html data-mbu-player-off="saed"&gt;, a mark proposed to majkinetor for his player to pause and hide by itself.


## 9.99.1679 — 2026-11-23

**✨ Improve**

- An area's link preview now shows its pictures, as majkinetor's Event Horizon does: press Space on an area link and the window shows its Wikidata locator map with the area's flag on its corner, then the flag, coat of arms, seal and image (five small requests to Wikidata, "2 of 5 asked" while they come). The card then shows the map with a small flag, also after a reload, and the area's own page shows the pictures beside its name once a window has asked for them (the page itself asks nothing). The switch is now called "Pictures in artist, label, place and area previews".
- An area's window also lists its links (Wikidata, GeoNames) in a table under the facts, as a place's window does.
- When Wikidata says too many requests, every tab now pauses its Wikidata requests for as long as Wikidata asks and then tries again, so a window waits for its pictures instead of failing (as already for Discogs).


## 9.99.1678 — 2026-11-23

**✨ Improve**

- A track named differently from its recording (jesus2099's ≠ note) now says what kind of difference it is: the comparison box opens with a small label, Case only or Punctuation and spacing only (green; "&" counts as "and"), 1–2 characters (amber: a typo, a plural, an accent) or Different (red). The Title column's 📊 menu lists the same four kinds, indented under "≠ track/recording name", each with its count, so you can keep only the real differences. The punctuation fold and the edit distance follow majkinetor's Apollo Editor (recFold, recLev).


## 9.99.1677 — 2026-11-23

**✨ Improve**

- Titles in MusicBrainz style (the Springsteen sites' converted titles and the title-style findings on MusicBrainz) now use MusicBrainz's own guess-case word lists, as majkinetor's Apollo Editor carries them: acronyms such as YMCA, USSR and NBA stay in capitals ("CORN IN THE USSR" becomes "Corn in the USSR", no longer "Corn in the Ussr"); iTunes, iPhone, iPad, iPod, iMac, YouTube, TikTok, DJs and OC ReMix are written that way whatever the source's case; and version phrases such as "official music video", "slowed", "sped up", "reverb" and "nightcore" count as extra title information, so "(Slowed + Reverb)" is written "(slowed + reverb)".
- The title-style findings leave Armenian titles alone, as they already did Cyrillic and Greek ones: those scripts write titles in sentence case.


## 9.99.1676 — 2026-11-21

**✨ Improve**

- Event Horizon's keys on our table: a standalone Event Horizon (2026.11.22.184100 or newer) now gets the same treatment as String Theory's. It marks the page with its version (&lt;html data-mbu-eh&gt;, majkinetor's answer on \#938), so while a table of ours shows the page asks it to leave all its keys alone except its on/off switch: U, Ctrl+P (which prints again) and its player's keys no longer act on the table, and an on/off switch rebound to another letter keeps working. Before, only String Theory's version mark counted, and a standalone Event Horizon kept the older single-letter guard.
- The keys marks also follow when String Theory or Event Horizon starts after the table is shown: their version marks are watched, so the next render is no longer needed.


## 9.99.1675 — 2026-11-21

**✨ Improve**

- With majkinetor's String Theory 2026.11.20.165956 or newer, a table of ours now asks Event Horizon to leave all its keys alone except its on/off switch, through the shared marks &lt;html data-mbu-keys-off="saed" data-mbu-keys-keep="toggle"&gt; (\#938 convention C3, keys-keep added by majkinetor 2026-11-20). Its newer keys stay off the table too: U (your profile, which left the page), Ctrl+P (its player, so the browser prints again) and its player's Space, arrows and Alt+1/2/3. A toggle rebound in Event Horizon to a letter keeps working. The marks come down while Event Horizon's view shows, and are never set over another script's (\_mbuKeysSync(), \_ehKeysKeepHonoured()).
- Before a button is pressed, and with a standalone or older Event Horizon, the single-letter guard stays as it was, now with U. The setting is renamed "Keep Event Horizon's keys off MusicBrainz's page" (sa\_block\_eh\_single\_keys, same key and default).


## 9.99.1674 — 2026-11-21

**✨ Improve**

- The shared MusicBrainz request gate (mbu:mb-gate): every write of this script now lowers a broken hold or lead in the stored schedule, a cool past now + 60 s to now + 60 s and a leadUntil past now + 10 s to now + 10 s, as majkinetor's scripts do since a1e8f54 (\#938, 2026-11-20). A value ten minutes out is then repaired for every tab and script after the write, not only counted capped by this tab (9.99.1651). A tab that already counts such a value keeps the end it gave it at first sight, so its own write does not restart the minute (\_mbGateClampWrite(), in \_mbGateState()).


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


---

**Older versions:** [November 2026](ShowAllEntityData_CHANGELOG/2026-11.md) · [October 2026](ShowAllEntityData_CHANGELOG/2026-10.md) · [September 2026](ShowAllEntityData_CHANGELOG/2026-09.md) · [August 2026](ShowAllEntityData_CHANGELOG/2026-08.md) · [July 2026](ShowAllEntityData_CHANGELOG/2026-07.md) · [June 2026](ShowAllEntityData_CHANGELOG/2026-06.md) · [May 2026](ShowAllEntityData_CHANGELOG/2026-05.md) · [April 2026](ShowAllEntityData_CHANGELOG/2026-04.md) · [March 2026 (1 of 2)](ShowAllEntityData_CHANGELOG/2026-03-1.md) · [March 2026 (2 of 2)](ShowAllEntityData_CHANGELOG/2026-03-2.md) · [February 2026](ShowAllEntityData_CHANGELOG/2026-02.md) · [January 2026](ShowAllEntityData_CHANGELOG/2026-01.md)

*Generated from ShowAllEntityData_CHANGELOG.json by scripts/build-changelog-pages.py — do not edit by hand.*
