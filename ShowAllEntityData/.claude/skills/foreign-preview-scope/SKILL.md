---
name: foreign-preview-scope
description: Diagnose and fix link previews (POH — the hover card and the Space window) that are missing, wrong or leaking on a NON-MusicBrainz site's own page in ShowAllEntityData — before any button (the initial page, IP) or inside our rendered section (FRP). Use whenever the user says a foreign page "has no POH support", "no hover card on the IP", "previews work on the venue page but not the search page", "this link opens a new tab instead of the window", "the card never hides", or after adding a pageType on a foreign host whose page has a different layout than its siblings. Also when updating docs/non-mb-coverage.json's ip/frp cells. For a new reader of a kind of link use add-foreign-page-or-reader.
---

# Link previews on a foreign site's page

Distilled from G1–G8 of the non-MB coverage report (2026-11-03,
`org/non-MB-coverage.org` Phase C, DEBUG-NOTES.md "link previews: G1–G8")
and setlist.fm's search and setlist pages (2026-11-04, DEBUG-NOTES.md
"setlist.fm: no link previews before a render"). Read
`docs/claude/detail-pages.md` and `docs/claude/<site>.md` first.

## 1. Where the decision is made

A link gets a card when three things agree. Find which one says no:

1. **Scope** — is the link inside an element the engine listens to? On a
   foreign host that is `_DP_SITES[host].extRoot` (the site's own page,
   before and after a render) plus our section (`#mb-<site>-root`). Nothing
   outside it previews.
2. **Target** — `_extTarget()`: a link of the SAME host is skipped unless a
   reader admits it (`_extDgSiteTest()`, `_extIaTest()`, `_extSfmTest()`);
   relative hrefs are resolved against the page on discogs.com, archive.org
   and setlist.fm; `data-mb-dp-newtab` and `_MB_POP_PAGE_SKIP` (`nav`, …)
   refuse; inside a window a host-specific reader may win (G3).
3. **Reader** — `_EXT_READERS` order (a specific reader before a broad
   one), and its own conditions: setlist.fm's reader needs the API key
   except for setlist.fm's search links; Brucebase's `ownLinks` under their
   setting (G1); MusicBrainz pages read off musicbrainz.org only from the
   hosts named in `_MB_FOREIGN_POP_HOST` (G2, consented cookies).

The test hook answers all three at once:
`window.__saTest.popResolve(a)` → `'ext|ext:<reader>:<url>'`, or `'none'`.

## 2. Diagnose from the snapshot's DOM, not from memory

- Get the IP saved from the user's browser (and the FRP for a bug after the
  render). Never assume one site has one layout: setlist.fm's venue and
  artist lists hold their cards in `.mainColumn`, but EVERY search page
  holds form, cards and pager in `.rightColumn` and has no `.mainColumn`;
  a setlist page's links sit in `.setlistInfo .setlistHeadline`,
  `.setlistInfo .infoContainer > p` and `.setlistList`.
- Print the container chain of each kind of link with a small script that
  walks the `<div>` start/end tags up to the link (class of each ancestor),
  for every page family of the site, and compare it with `extRoot`.
- Behaviour bugs (a card that never hides, a click that leaves): log the
  events first (CLAUDE.md "Debugging DOM/Rendering Bugs"). archive.org's
  shadow DOM fires NO `mouseover`/`mouseout` at the document (target and
  relatedTarget retarget to the same host), so the engine follows the
  pointer with `mousemove` there (`_dpInIaShadow()`); two guesses before the
  log were wrong.

## 3. Write the pre-tests before the code

For each gap: one real URL, the exact clicks, what happens today, what
should happen after (the table in `org/non-MB-coverage.org` Phase C). The
user runs them in their browser after the build; the specs pin the same.

## 4. The fix

- Widen `extRoot` with NARROW selectors for the containers found in step 2
  — never a whole column: setlist.fm's `.mainColumn` also holds "Upcoming"
  ticket-shop affiliate links, which must stay without a card.
- Keep `extRoot` a single string literal on ONE source line:
  `scripts/build-coverage-report.py` reads it from that line, and a string
  split with `+` made it read half and fail `--check`.
- A link that should leave (an "on Discogs ↗" link in a window): mark it
  `data-mb-dp-newtab` (G6/G7) rather than special-casing the reader.
- Comment the `_DP_SITES` entry with the date, the user's words and the
  layout found, as the setlist.fm entry does.

## 5. Make the fixture able to show the bug

A fixture builder that rewraps blocks into ONE skeleton hides layout bugs:
`scripts/build-setlistfm-fixtures.py` put every list page's cards into the
venue page's `.mainColumn`, so no search spec could fail. The builder must
keep the real container chain per page family (a `searchFilter` page now
goes into `.rightColumn`). Regenerate, and confirm which fixtures changed
(`git status tests/fixtures`) — only the intended ones.

Shadow DOM cannot live in a fixture: the spec builds it, and a console probe
(`scripts/probe-ia-shadow-links.js`) for the user confirms the real link
shapes.

## 6. Tests

- Before any button, with `{ sa_pop_ext: true, sa_pop_ext_<site>_key: … }`
  as needed: assert nothing is rendered yet, the links are where the site
  puts them (count `.rightColumn .setlistPreview`), and
  `popResolve(link)` for each link kind: a positive per page family, the
  key-less reader without a key, and a NEGATIVE control (the affiliate
  link → `'none'`).
- Inside a window: drill-downs open in place with Back; a `newtab` link
  leaves.
- A mutation that restores the old scope, per spec, must FAIL
  (`scripts/mutations/<site>-*.json`); run it with `mutation-check.py`.

## 7. The registry and the docs

- `docs/non-mb-coverage.json`: the site's `extRoot` field (must equal the
  source), and each pageType's `ip`/`frp` cell — `"ev": "spec"` with the
  spec file and a title substring once a test pins it, the `why` saying
  where the links are. Watch for rows sharing the same text (sfm-artist and
  sfm-search did): anchor an edit on the row's `type` line. Then
  `python3 scripts/build-coverage-report.py` and `--check`.
- `docs/claude/<site>.md` (the extRoot bullet, dated), HELP's "before you
  press the button" sentence, a `WIP.N` 🐛 Fix entry in the user's words, a
  DEBUG-NOTES.md entry (Env stamp, report, root cause from the DOM, why the
  specs missed it, fix, tests).
- Hand over with URLs and what to hover, and which links need a key.
