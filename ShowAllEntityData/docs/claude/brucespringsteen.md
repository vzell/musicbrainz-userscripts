<!-- Written on branch feature/bs-support (org/springsteen.it.org). This file is the authority for its topic; CLAUDE.md keeps only the doc-map row. -->

# brucespringsteen.it: the third non-MusicBrainz host

ShowAllEntityData also runs on the brucespringsteen.it record database's
list page, `https://www.brucespringsteen.it/DB/records.aspx`, as the pageType
`bs-records`. It is **opt-in**: `sa_enable_brucespringsteen`, default **off**.
The request lives in `org/springsteen.it.org`: two buttons, Unofficial and
Official, every format checkbox ticked, the records as a table. It follows
the jungleland.it design (docs/claude/jungleland.md) and differs in one
essential way: **the rows always come from a fetched page**, never from the
live one.

## The site

Checked live on 2026-10-06 (curl captures in `debug/bs-records-*-raw.html`):

- **Server:** ASP.NET on IIS. `records.aspx` is one page with no
  pagination.
- **Query string:** `tipe=` is `-1` (unofficial) or `-2` (official)
  followed by the ticked format codes 0–11. `sort=0` is alphabetical, and
  `addon=` is the producer/country select index.
  - All formats, unofficial: `?tipe=-1,0,1,2,3,4,5,6,7,8,9,10,11&sort=0&addon=0`
    (1878 records).
  - All formats, official: `?tipe=-2,0,1,2,3,4,5,6,7,8,9,10,11&sort=0&addon=0`
    (1186 records).
  - An extra `page=1` is ignored, with the same counts.
- **Frameset:** the site's entry is `Blegsdx.htm`, a frameset whose 222 px
  left frame `sommario` loads `DB/records.aspx?tipe=-1,4&sort=0` (Vinyl LP
  only), and whose right frame `principale` shows a record's
  `detrec.aspx?code=…`. The page carries `<base target="principale">`.
- **Filter form:** `form[name="mio"]` has the checkboxes `C0`–`C11`, the
  radio `UN` (`-1`/`-2`) and the `PROD`/`COUNTRY` selects.
  - Its `calc()` writes `parent.sommario.location`, so standalone (no parent
    frameset) the site's own "APPLY FILTER" link does nothing.
  - The body's `onload="setup('<tipe>',…)"` ticks exactly the current list's
    formats.
- **Encoding:** the header says `text/html; charset=utf-8` and the bytes ARE
  UTF-8 (`…` = `e2 80 a6`), even though the page's meta tag says
  windows-1252. The header wins, so `fetchHtml()`'s `res.text()` is right
  and nothing in the fetch path changed. A fixture served WITHOUT a charset
  falls back to the meta tag and decodes "…" as "â€¦". That is why
  `bsFixture.js` sends `charset=utf-8`, and the spec pins it.
- **Records:** each is one `<p>`, with
  `<hr><center><b><u>A</u></b></center><hr>` section headers between them.
  - Unofficial:
    `<p><b>2 CD-R (Anubis Records) <br><a href="detrec.aspx?code=CR1AD1">1001 AMERICAN DREAMS</a><br>Mx:2211/12</b><br>[<i><u>note</u></i><br>]</p>`
  - Official: `<p><b>1 7 in. (Germany) <span …>PROMO</span><br><a href = "detrec.aspx?code=CBS39404">…</a><br>Catalogue : CBS 3940</b><br>…</p>`
  - Variants: `Mx:`/`Mx : ` (1498/378), `Catalogue:`/`Catalogue : `
    (481/705), and labels with nested parentheses (`UPC (?)`,
    `Scorpion (Scorpio?)`).
  - Titles ending in `(copy/repress)` are kept as written.
  - Two unofficial records have no Mx line AND no `</b>`. The parser
    reconstructs the `<b>` around what follows, which `_bsReadRecord()`
    tolerates.

## Gates and host-aware code

- **Gates:** `_isBsHost` is part of `_foreignHost`. Its opt-in gate and its
  frame gate (`window.top !== window`, decided 2026-10-06) sit next to the
  jungleland.it ones.
- **`performClutterCleanup()`** stands down here.
- **`initNavigationGuard()`** counts the query as part of the page's
  identity here, as on springsteenlyrics.com: `(_isSlHost || _isBsHost)`.
  Every list is `records.aspx?tipe=…`, so a predefined-filter link would
  otherwise drop a loaded table without asking.

## The buttons, and why the rows come from a fetch

The pageDefinition has two buttons. Each carries `params` (`tipe`, `sort`,
`addon`, with every format code from `_BS_ALL_FORMATS`) and a
`features.bsRecordsToTable` kind (`'unofficial'`/`'official'`).

- **Page 1 is always fetched.** Button params become `overrideParams`, and
  the fetch loop reuses the live document only when there are none. So
  whatever list the page itself shows, often the frameset's LP list, the
  table holds every record of the pressed kind.
- **`non_paginated: true`** (definition level) skips the extra page-1
  request `fetchMaxPageGeneric()` would make for params. A mutation pins it:
  exactly one records.aspx fetch per press.
- **The base definition's `bsRecordsToTable: true`** is what Load from Disk
  runs with, since no button is pressed there. Each button narrows it to its
  kind.
- **A second press reloads the page.** This is generic
  (fetch-and-render-pipeline.md), not specific to this site: switching from
  Unofficial to Official means reload, then press Official.

## Every format ticked — `_bsCheckAllFormats(kind?)`

The org file asks for all checkboxes to be ticked before a button is
pressed. The function sets `.checked` on `C0`–`C11`. It never calls the
site's `setup()`/`clean()`, which also reset the selects. It runs:

1. **in `_bsPrepareLivePage()` at init**, and once more on `window` `load`
   when the document is not yet complete. Tampermonkey's document-idle can
   come before the page's own `onload="setup(…)"`, which would untick them
   again. The fixture harness injects after load, so no spec can order the
   two, and that mutation is recorded as `"expect": "pass"`;
2. **at click time with the kind**, which also selects the matching `UN`
   radio, so the form shows what is being fetched.

## The converter — `applyBsRecordsToTable(def, docContext)`

It has the same three call sites as the other converters, with the roles
reversed:

- **The fetched page (pagination loop, `doc !== document`) is THE path.**
  Its records become rows (`_bsBuildRow()`).
- **The live document** (click-time pre-processing and Load from Disk) gets
  an EMPTY table: header row by kind, no rows.
  - `renderFinalTable()` empties the tbody anyway, and Load from Disk
    rebuilds the header row from the file.
  - The live page's own records, and the `hr`/`center` section headers
    after the site's form, are removed.
  - `<h2 class="mb-bs-list-heading">Records</h2>` goes before the table.
  - The form stays, showing the ticked boxes.

Parsing:

- **`_bsReadRecord(p)`:**
  - The text before the link is the head, read through `_bsParseHead()`.
  - The text after it, inside the same bold block, is `Mx`/`Catalogue`
    with `\s*:\s*`.
  - `i` elements outside that block are the notes, joined with "; ".
  - Code comes from the link's `code` parameter.
  - Whitespace is collapsed ("COL  3-10274" → "COL 3-10274").
- **`_bsParseHead(text)`**, also exposed as `window.__saTest.bsParseHead`:
  - a trailing `PROMO` becomes a flag;
  - `^(.*?)\s*\((.*)\)$` splits the rest at the FIRST "(" up to the LAST
    ")", so a nested label stays whole;
  - with no parentheses, the whole line is the format.

Columns (`_BS_HEADERS`):

| Unofficial                                | Official                                              |
|-------------------------------------------|-------------------------------------------------------|
| Title, Matrix, Format, Label, Code, Notes | Title, Catalogue, Format, Country, Promo, Code, Notes |

- **Promo** is "yes" or empty, as springsteenlyrics.com's flags are.
- **Notes** hold the italic line, e.g. "Lower 'Bruce Springsteen' - Little
  Steven Mix", "Picture disc".
- **Title** links to the absolute `detrec.aspx` URL with `target="_blank"`,
  because standalone there is no `principale` frame.

## Styling

- `_ensureForeignTableStyle()`'s `:is()` list now names
  `.mb-sa-host-bs` too.
- `_ensureBsStyle()` styles only the injected `<h1>`/`<h2>` and left-aligns
  them against the site's centred layout.

## Tests

| Spec                                          | Pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/fixtures/bs-records.spec.js`           | fixture preconditions (the LP page's onload ticks C4 only; 1878/1186); gates off and in the frameset (form state untouched); setting on: exactly Unofficial and Official, all 12 boxes ticked; each button: exactly one fetch with all formats of its kind, rows = the list's own "N RESULTS", exact headers, the live records gone, the UN radio matching, the shared table CSS; parsed fields (spaced Mx, notes, nested-parenthesis label, `(copy/repress)`, no Mx line, "…" decoded, PROMO, `Catalogue:`); Label and Country filters; the navigation guard on a predefined-filter link; no MusicBrainz/CAA/EAA request; Save → Load from Disk on a fresh page; `_bsParseHead` shapes |
| `tests/fixtures/sl-include-regex.spec.js`     | the `@include` line: `DB`/`db` records.aspx in; `Blegsdx.htm`, `detrec.aspx`, the other frameset, look-alike hosts out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tests/live/bs-records.spec.js` (`@extended`) | each button on the real site: rows = the count the all-formats page announces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Fixtures: `python3 scripts/build-bs-fixtures.py` turns the three raw
captures into `tests/fixtures/bs-records-{unofficial,official,lp}.html`,
kept WHOLE with their inline script, minus the body background.
`tests/support/bsFixture.js` serves every records.aspx request by its
`tipe=`. Mutation list: `scripts/mutations/bs-support.json`.
