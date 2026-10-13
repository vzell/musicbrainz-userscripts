<!-- Written on branch feature/bb-recent-changes-relations (2026-10-13). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# Titles on the non-MusicBrainz sites: MusicBrainz case and typography

The Springsteen sites write titles their own way. brucespringsteen.it and the
Brucebase setlists and venues are in capitals ("BORN IN THE USA", "BOSS AT HIS
BEST (THE)", "HAMPTON ROADS COLISEUM"); the Brucebase song list capitalises
every word ("Born In The U.S.A."); jungleland.it is however the uploader typed
it ("Fade away at the Madison Square Garden (Version 2)"). The request
(2026-10-13) was to write them "according to MB style guidelines", and then to
replace the keyboard punctuation with typographic punctuation.

Two settings, both **on** by default, both read only by the non-MusicBrainz
converters, so nothing changes on MusicBrainz:

| Setting                 | Does                                                                 | Function            |
|-------------------------|----------------------------------------------------------------------|---------------------|
| `sa_foreign_mb_titles`  | MusicBrainz English letter case; a trailing "(THE)" moves to the front | `_mbNormalizeTitle()` → `_mbTitleCase()` |
| `sa_foreign_typography` | ’ ‘ “ ” ″ – ‐ … — × instead of ' " - ... -- x                        | `_mbTypography()` → `_mbTypographyFixed()` |

`_mbSiteTitleText()` runs both, each behind its own setting. Where they apply:

| Site / pageType     | Column(s)                         | Through                                    |
|---------------------|-----------------------------------|--------------------------------------------|
| springsteenlyrics.com `sl-collection`, `sl-collection-intro`, `sl-bootlegs`, `sl-brucelegs` | Title | `_mbSiteTitleText()` in `_slBuildRow()` (the cover's alt text keeps the site's) |
| springsteenlyrics.com `sl-lyrics` | Title                     | `_mbSetSiteTitle()` in `applySlLyricsToTable()` |
| jungleland.it `jl-list` | Title                         | `_mbSetSiteTitle()` in `_jlBuildRow()`     |
| brucespringsteen.it `bs-records` | Title                | `_mbSetSiteTitle()` in `_bsBuildRow()`     |
| Brucebase `bb-songs` | Title                            | `_mbSetSiteTitle()` in `_bbBuildRow()`     |
| Brucebase `bb-year` / `bb-home` | Venue, City, Country (not "USA") | `_mbSetSiteTitle()` in `_bbYearBuildRow()` |
| Brucebase `bb-year` / `bb-home` | Soundcheck, Setlist (each song row) | `_mbSiteTitleNodes(li, {capsOnly, skipSel})` |
| Brucebase `bb-relations` | Name, Sort name (typography only — names, not titles) | `_bbRelationsBuildRow()` |

Not: State (a code, "NJ", or a region), Tour, Notes (prose), Recent changes
(a log of page names). Country "USA" is left as it is by request; it is also
in `_MBTC_ACRONYMS`, so the exception is belt and braces (its mutation is
`"expect": "pass"`). springsteenlyrics.com and City/Country came with the
user's second round (2026-10-13); the CD and vinyl bootleg list shares the
card converter and so came along. A title wholly in square brackets
("[no title]", "[unknown]", MusicBrainz's special-purpose style) is never
touched.

The site's own text stays reachable: a cell (or song row) whose text changed
gets it as its tooltip, "As written on the site: …" (`_setTip()`, so the
"Liner notes" card; it stands down while the detail-preview card shows).

## The rules — sources

- https://musicbrainz.org/doc/Style/Language/English (checked 2026-10-13):
  capitalise every word except, between the first and the last, the articles
  (a, an, the), the coordinating conjunctions (and, but, or, nor) and the
  prepositions of three letters or fewer (as, at, by, for, in, of, on, to,
  cum, mid, off, per, qua, re, up, via) — unless used as an adverb or as part
  of a verb ("Plug In Baby"); each part of a hyphenated word on its own;
  o', 'n', n' lower case; "O'Clock"; a title split by major punctuation
  (colon, question mark, exclamation mark, dash, quotes) is capitalised as
  separate titles; parentheses are capitalised as if they were not there.
- https://musicbrainz.org/doc/Style/Titles: capitals on the packaging are a
  typesetting choice, not the title; extra title information's descriptive
  words (live, remix, version, …) are lower case.
- The general Style page has no title rule of its own; it indexes the two above.

## How `_mbTitleCase()` decides

**Letter case only.** The result has the same length as the input. That is
what lets `_mbSiteTitleNodes()` rewrite a song row in place: it reads the
row's text nodes as one string, and gives each node its own slice back, so a
song's `<strong>` (a tour premiere), `<em>` and link survive.

1. **Parts.** The title is cut at parentheses and brackets. A part with no
   lower-case letter (an ordinal's st/nd/rd/th set aside: "4th OF JULY") is
   *in capitals*; any other part is *mixed case*. A parenthesised part in
   capitals counts as one only when the title is in capitals outside its
   parentheses too — "Out There In Radioland (JEMS)" keeps JEMS.
2. **In capitals**, every word is lowered and then capitalised by the rules,
   except acronyms (`_mbtcIsAcronym()`): `_MBTC_ACRONYMS` (USA, UK, EP, NYC,
   ICC, JAP, …), dotted letters (U.S.A., M.G.'s), letters round an "&" (A&M,
   R&B), a Roman numeral of two or more letters, and two to five letters with
   no vowel and no Y (NJ, TCB, PNC, DVD, MTV) unless an abbreviation of
   `_MBTC_ABBREVIATIONS` (St., Dr., Vol.). O'/D'/L' and Mc prefixes capitalise
   the next letter too (O'Clock, D'Angelo, L'Amore, McLoone).
3. **Mixed case** keeps every letter but a word's first: a small word goes to
   lower case unless it has a capital inside, a lower-case word is capitalised
   unless it has a capital inside ("iPhone") or is a particle. "THE" in a
   mixed title stays.
4. **Phrases.** Inside a part, `_MBTC_BREAK_RE` (parentheses, : ? ! / ; dashes,
   a spaced " - ", quotes, an ellipsis) ends a phrase; the first and last word
   of each phrase are capitalised. So " / " (several songs) and " - " (a
   medley) start afresh.
5. **Extra title information.** A parenthesised part made only of
   `_MBTC_ETI` words (and numbers, Roman numerals, "&", "/", "and") is all
   lower case: "(version 2)", "(half speed)", "(mono / stereo)",
   "(one sided)", "(late show)".
6. **`capsOnly`** (song rows): a mixed part is left exactly as written. A
   setlist's songs are in capitals; its notes ("(with Patti Scialfa)",
   "(partial)") are not titles.
7. **Particles.** `_MBTC_PARTICLES` (de, des, du, di, del, della, …) are lower
   case in a title in capitals ("Palais des Sports", "Stade de France") and
   left as written otherwise.

### Deliberate deviations from the letter of the guideline

- **"up" is always capitalised.** MusicBrainz lists it as a short preposition
  but capitalises it as part of a verb, and on these sites it is that in
  nearly every title: "Held Up Without a Gun", "Hurry Up Sundown", "I'm
  Shipping Up to Boston", "I Can't Stand Up for Falling Down".
- **"on", "off", "in" after a verb of `_MBTC_PHRASAL`** are capitalised:
  "Come On Over to My Place", "Hang On Sloopy", "Bring On the Night", "Turn
  Off the Light". A short list on purpose; elsewhere the preposition rule
  stands ("Born on the Bayou", "Darkness on the Edge of Town", "I'm on Fire").

### Known limits — judgement the rules cannot make

- Other phrasal verbs ("Stand on It" for "STAND ON IT").
- Acronyms with a vowel nobody listed ("Siriusxm"), and words in capitals that
  ARE acronyms but read as words.
- Other languages: only the particles above are handled; "Palacio de Deportes
  de La Comunidad" keeps a capital "La".

`node scripts/check-mb-title-case.js --sample [--typo]` prints, for every
saved snapshot in `debug/` (songs, jungleland.it, the three
brucespringsteen.it lists, the springsteenlyrics.com cards and lyrics index,
all 63 year pages' venues, cities, countries and songs), how many
titles change and a spread of before → after. Use it to judge any rule change
on the whole data, not just on the cases.

## Typography — `_mbTypography()`

`...` → … and `--` → — change the length, so they run per text node (in
`_mbSiteTitleNodes()`, after the one-for-one pass; never across two nodes).
`_mbTypographyFixed()` is one-for-one:

| Input | Becomes | When |
|-------|---------|------|
| `'` `´` `` ` `` | ’ | after a letter or digit ("Don’t", "Comin’", "70’s"); word-initial shortening a word (`_MBTP_ELISION_RE`: ’n’, ’til, ’cause, ’em, ’09) |
| `'` | ‘ … ’ | word-initial, not an elision, and closed later in the title ("IRISH ‘SPRINGSTEEN PACK’") |
| `"` | “ / ” | “ after a space, bracket or the start; ” otherwise |
| `"` | ″ | right after a digit with no quotation open ("7″") |
| `-` | – en dash | spaced (" – ", a medley or subtitle); between two numbers (a range, "1975–1985", "19–20") |
| `-` | ‐ hyphen | between letters ("Freeze‐Out"); in a run of three or more numbers (a date, "1999‐08‐12", "10‐18‐75") |
| `x` | × | between two numbers, spaces round it ("2 × 45") |

jungleland.it types the acute accent and the backtick for an apostrophe
("Spirit of ´76", "`Cause Tonight", "Rock `n` Roll"); they are treated as one.
Not done: the figure dash (no phone numbers in titles), the minus sign, the
fraction and division slashes (a slash in these titles is a date, "8/15/75",
or a title separator), German and French quotation marks (the titles are
English).

**Filters see the typographic text.** The engine's filters do not fold
punctuation, so "don't" no longer finds "Don’t" in these tables, and
"freeze-out" not "Freeze‐Out". `sa_foreign_typography` is its own setting for
that reason, and its description says so.

## Tests

| Spec / script | Pins |
|---|---|
| `tests/support/mbTitleCaseCases.js` | the cases, each a real title of one of the sites unless marked "constructed" |
| `scripts/check-mb-title-case.js` | the cases in Node (no browser), `--sample [--typo]` over the snapshots |
| `tests/fixtures/mb-title-case.spec.js` | the cases through `window.__saTest` in Chromium; per site the rendered titles (song list, jungleland.it, brucespringsteen.it "(THE)", springsteenlyrics.com bootlegs and lyrics, 1985 venues, cities, countries ("USA" kept, State untouched) and songs, 2018 notes kept, 2012 bold kept, set labels kept and the first song after one rewritten), the tooltips, a lower-case Setlist filter still matching, each setting alone |
| `scripts/mutations/foreign-titles.json` | 20 planted defects; `"expect": "pass"`: the per-node ellipsis (no setlist in the year fixtures holds "..." or "--") and the "USA" exception (see above) |

The converter specs (`bb-songs`, `bb-year`, `bb-home`, `jl-list`,
`bs-records`, every `sl-*` list spec) load with BOTH settings OFF: their
loaders' `titles` option (default `false`, `tests/support/{bb,jl,bs,sl}Fixture.js`) — they pin the sites'
text as written, which is what the converters read.
