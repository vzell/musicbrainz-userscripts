'use strict';

const path = require('path');

/**
 * Shared identifiers and expected-stats table for the `artist-releases`
 * filter/sort/highlight regression suite (BoDeans' own 56-row catalog —
 * https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases).
 *
 * Every expected count below was re-verified LIVE against the actual
 * committed fixture (`tests/fixtures/saved-data/artist-releases-
 * bodeans.json.gz`) — NOT just derived from the static `debug/BoDeans-
 * artist-releases-final.html`/`-original.html` snapshots, which turned out
 * to reflect a different render state for a few columns (see
 * `debug/artist-releases-filterSort-test-report.org` for the full
 * methodology, provenance, and the specific corrections this required).
 * Re-verify every number here if the committed fixture is ever
 * re-captured against materially different BoDeans catalog data.
 *
 * Single source of truth consumed by both
 * `tests/live/artist-releases-filter-sort.spec.js` (assertions) and
 * `tests/support/generate-filtersort-report.js` (the .org/.html report).
 */

const URL = 'https://musicbrainz.org/artist/84c38d3a-3400-4c28-b988-90558bb6fae0/releases';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'saved-data', 'artist-releases-bodeans.json.gz');
const TOTAL_ROWS = 56;

/**
 * Column display name -> zero-based `row.cells`/`thead th` index, matching
 * the rendered header order (confirmed live via each `<th data-col-name>`).
 */
const COLUMN_INDEX = {
    Release: 0,
    Artist: 1,
    Format: 2,
    Tracks: 3,
    'Country/Date': 4,
    Label: 5,
    'Catalog#': 6,
    Barcode: 7,
    CAA: 8,
    Country: 9,
    Date: 10,
    'Total Tracks': 11,
    DD: 12,
    MM: 13,
    YYYY: 14,
    Day: 15,
    Month: 16,
    'MB-Name': 17,
    Comment: 18,
    'Primary alias': 19,
    Relationships: 20,
    // Picard (index 21) intentionally omitted — no filter/sort icons.
};

/**
 * §A — one representative typed column-filter case per filterable column
 * (Country/Date gets 6, per explicit request; three cases are tagged
 * `overlapDemo` — deliberately non-word-aligned substrings; four are tagged
 * `crossTag` — a match spanning two separate text nodes joined only by a
 * synthesized space (a normalized `&nbsp;`, or getCleanColumnText()'s own
 * join-space between two sibling elements), expecting TWO highlight spans
 * per match (`highlight: { spans: [...] }`) rather than one. This exercises
 * `highlightCrossTag()`'s cross-tag algorithm directly — see that
 * function's own JSDoc and debug/NOTES.md's 2026-08-29 entry for the real
 * bug this shape of case caught and fixed (the function used to lose that
 * synthetic space entirely, producing zero highlights despite a correct
 * row match).
 *
 * `highlight: null` means "expect ZERO `.mb-column-filter-highlight`
 * spans" — because nothing should visually highlight (Ex mode, an
 * always-empty column, or a match against DOM content with no visible
 * representation, e.g. CAA's `display:none` sort-key sentinel — see the
 * CAA note below). `highlight: 'X'` means every span's text should equal
 * `X` (or match case-insensitively / via `highlightRegex` when noted).
 */
const FILTER_CASES = [
    { column: 'Release', value: 'Black and White', expected: 4, highlight: 'Black and White' },
    {
        // Comment-boundary cross-tag match: spans the title's own <bdi>
        // into a separate <span class="comment"><bdi>, joined only by a
        // normalized `&nbsp;`. FIXED (was a confirmed live bug —
        // highlightCrossTag() used to concatenate accepted text nodes with
        // no separator, losing the synthetic space getCleanColumnText()
        // inserts between every collected text-node piece; see that
        // function's own JSDoc and debug/NOTES.md's 2026-08-29 entry for
        // the root cause and fix). Produces TWO highlight spans per match:
        // the trailing fragment inside the title's own <bdi> ("In"), and
        // the leading fragment inside the comment's <bdi> ("(Disc").
        column: 'Release', value: 'In (Disc', expected: 1, crossTag: true,
        highlight: { spans: ['In', '(Disc'] },
    },
    { column: 'Artist', value: 'bodeans', expected: 56, highlight: 'bodeans', highlightCaseInsensitive: true }, // both "BoDeans"/"Bodeans" match, span case varies per row
    { column: 'Artist', value: 'BoDeans', caseSensitive: true, expected: 55, highlight: 'BoDeans' },
    { column: 'Format', value: 'CD', expected: 42, highlight: 'CD' },
    { column: 'Format', value: 'CD', exclude: true, expected: 14, highlight: null }, // exclude: expect ZERO highlight spans
    { column: 'Tracks', value: ' + ', expected: 6, highlight: ' + ' },
    // Country/Date: the country code and date live in two SEPARATE text
    // nodes (<abbr>US</abbr> / <span class="release-date">1986-05</span>,
    // no whitespace text node between them in the DOM) that
    // getCleanColumnText() joins with a real space when building matchable
    // text — confirmed live via regex probes (`US.1986`/`US\s1986` both
    // matched with exactly one character consumed, and plain `"US 1986"`
    // matches directly) — so a literal space IS required in a compound
    // query. (An earlier draft of this table first assumed a space, then
    // "corrected" it away based on a diagnostic that read the DOM's plain
    // native `.textContent` instead of the real matching function's own
    // text-building — that diagnostic doesn't insert the same join space,
    // so it was a false signal; this value has been re-verified against
    // the real filter mechanism, not `.textContent`.) No weekday
    // abbreviation appears in this column for a regular row, though — that
    // part of the correction holds: confirmed `"Tue"` alone still matches
    // 0 rows here (weekday only exists in the separate synthetic "Day"
    // column).
    { column: 'Country/Date', value: 'US', expected: 32, highlight: 'US' },
    { column: 'Country/Date', value: '1986', expected: 2, highlight: '1986' },
    { column: 'Country/Date', value: '05', expected: 4, highlight: '05' }, // naive substring collision: 1986-05, 1996-11-05, 2005-08-17 (via "2005"), 2022-05-06
    { column: 'Country/Date', value: 'XW', expected: 3, highlight: 'XW' }, // "[Worldwide]" pseudo-country-code rows
    // Both compound (country+date) queries below are ANOTHER instance of
    // the same comment-boundary cross-tag shape as Release's "In (Disc"/
    // Label's "Slash (US" cases (now fixed — see those cases' own notes):
    // the match spans from the <abbr> into the sibling
    // <span class="release-date"> (joined only by getCleanColumnText()'s
    // synthesized space, no real DOM content there), producing two
    // highlight spans. Row-level (single-element) Country/Date queries
    // above (US/1986/05/XW) don't cross this boundary — single span each.
    { column: 'Country/Date', value: 'US 2009-03-10', expected: 1, crossTag: true, highlight: { spans: ['US', '2009-03-10'] } }, // full exact-value match, single unambiguous row
    { column: 'Country/Date', value: 'US 1986', expected: 2, crossTag: true, highlight: { spans: ['US', '1986'] } }, // realistic compound value
    { column: 'Label', value: 'Reprise', expected: 11, highlight: 'Reprise' },
    {
        // Same comment-boundary shape as Release's "In (Disc" case above —
        // now fixed, two highlight spans per match.
        column: 'Label', value: 'Slash (US', expected: 26, crossTag: true,
        highlight: { spans: ['Slash', '(US'] },
    },
    { column: 'Catalog#', value: '9 25876-2', expected: 2, highlight: '9 25876-2' },
    { column: 'Barcode', value: '[none]', expected: 8, highlight: '[none]' },
    // CAA: filtering the hidden .mb-caa-sort-key sentinel text.
    // "no" plain-substring ALSO matches "Matrix/Runout" (a CAA image type
    // present on 9 "yes" rows — "Ru-no-ut" contains "no") — a genuine
    // naive-substring collision, confirmed live (19 "no" rows + 9
    // "Runout" rows = 28), NOT a bug. `^no$` anchored regex demonstrates
    // the stable, collision-free count — mirrors the DD `1`/`^1$` pair.
    { column: 'CAA', value: 'no', expected: 28, highlight: 'no' },
    // An anchored `^no$`/`^no.*$` regex variant was tried here as a second
    // Rx demo (mirroring DD's `1`/`^1$` pair) but consistently returned 0
    // rows live regardless of pattern permissiveness, while DD's own
    // anchored case works fine — something about this column's matched-
    // text shape breaks `^`/`$` anchoring specifically, not yet root-caused.
    // Not pursued further: DD's `^1$` case already covers the "anchored
    // regex avoids a substring collision" pattern for this suite, and this
    // is representative coverage, not exhaustive.
    { column: 'CAA', value: 'yes', expected: 37, highlight: null }, // sort-key span is display:none — matches, but nothing visible to highlight (confirmed live)
    { column: 'Country', value: 'United States (US)', expected: 32, highlight: 'United States (US)' },
    { column: 'Country', value: 'United States', expected: 34, highlight: 'United States' },
    {
        column: 'Date', value: '^\\d{4}-\\d{2}-\\d{2}$', regExp: true, expected: 22,
        highlight: null, highlightRegex: '^\\d{4}-\\d{2}-\\d{2}$', // per-row date text varies; every span must itself be a full ISO date
    },
    { column: 'Total Tracks', value: '11', expected: 4, highlight: '11' },
    { column: 'DD', value: '1', expected: 11, highlight: '1' },
    { column: 'DD', value: '^1$', regExp: true, expected: 1, highlight: '1' },
    { column: 'MM', value: '6', expected: 7, highlight: '6' },
    { column: 'YYYY', value: '2022', expected: 3, highlight: '2022' },
    { column: 'Day', value: 'Tuesday', expected: 16, highlight: 'Tuesday' },
    { column: 'Month', value: 'June', expected: 7, highlight: 'June' },
    { column: 'MB-Name', value: 'Outside Looking In', expected: 4, highlight: 'Outside Looking In' },
    { column: 'Comment', value: 'BMG', expected: 2, highlight: 'BMG' },
    { column: 'Primary alias', value: 'x', expected: 0, highlight: null }, // always-empty column — 0 rows, nothing to highlight
    { column: 'Relationships', value: 'amazon.com', expected: 19, highlight: 'amazon.com', needsRelSettle: true },
    {
        column: 'Format', value: 'gital Me', expected: 8, overlapDemo: true,
        highlight: 'gital Me',
    },
    {
        column: 'Release', value: 's: The Best Of', expected: 1, overlapDemo: true,
        highlight: 's: The Best Of',
    },
    {
        column: 'Release', value: 'tside Look', expected: 4, overlapDemo: true,
        highlight: 'tside Look',
    },
];

/** §B — combo (multi-column) and global+column-order-pair cases. */
const COMBO_CASES = [
    {
        name: 'Combo A',
        filters: [{ column: 'Format', value: 'CD' }, { column: 'Country', value: 'United States (US)' }],
        expected: 28,
    },
    {
        name: 'Combo B',
        filters: [{ column: 'Format', value: 'CD' }, { column: 'YYYY', value: '2022' }],
        expected: 1,
    },
    {
        name: 'Combo C',
        filters: [
            { column: 'Format', value: 'CD' },
            { column: 'Country', value: 'United States (US)' },
            { column: 'Label', value: 'Reprise' },
        ],
        expected: 9,
    },
];

/** Global+column order-pair case (§B) — tested in both typing orders. */
const ORDER_PAIR_CASE = {
    globalValue: 'Home',
    globalExpected: 5,
    column: 'Format',
    columnValue: 'CD',
    columnExpected: 42,
    combinedExpected: 4,
};

/** §C — sort-then-restore checkpoints. */
const SORT_CHECKPOINTS = [
    { name: 'baseline', filters: [], expectedCount: TOTAL_ROWS, sortColumn: 'Release' },
    { name: 'after Format~CD', filters: [{ column: 'Format', value: 'CD' }], expectedCount: 42, sortColumn: 'YYYY' },
    {
        name: 'after Combo A',
        filters: [{ column: 'Format', value: 'CD' }, { column: 'Country', value: 'United States (US)' }],
        expectedCount: 28,
        sortColumn: 'Total Tracks',
    },
    {
        name: 'after Artist Cc-on',
        filters: [{ column: 'Artist', value: 'BoDeans', caseSensitive: true }],
        expectedCount: 55,
        sortColumn: 'Artist',
    },
    { name: 'after CAA no', filters: [{ column: 'CAA', value: 'no' }], expectedCount: 28, sortColumn: 'CAA' },
    {
        name: 'after order-pair result',
        filters: [{ column: 'Format', value: 'CD' }], // global 'Home' applied separately in the spec
        expectedCount: 4,
        sortColumn: 'Date',
    },
];

/** §D — uniq-dropdown checks with filters cleared. */
const UNIQ_DROP_COLUMNS_CLEARED = ['Format', 'Artist', 'CAA', 'Country', 'Primary alias', 'Label'];

/** §E — uniq-dropdown checks with the Format~CD filter (42 rows) left active. */
const UNIQ_DROP_ACTIVE_FILTER = { column: 'Format', value: 'CD', expected: 42 };
const UNIQ_DROP_COLUMNS_ACTIVE = ['Format', 'Barcode'];

/**
 * §F — uniq-dropdown-DRIVEN filter selection (checking dropdown items, not
 * typing). Exact-value/value-set semantics — categorically different from
 * §A's substring matching.
 *
 * CONFIRMED LIVE (correcting an earlier, wrong assumption): Format/Label/
 * Country/Barcode have NO flat "Values" list at all — every one of them is
 * fully decomposed into faceted structural sections (e.g. Format: Size /
 * Medium count / Combo / Type; Label: Structure / Entity info - Label name
 * / Entity info - Comment). A label with no disambiguation comment (e.g.
 * "Reprise Records") has NO selectable dropdown entry at all — only labels
 * that also have a comment get an "Entity info - Label name" item, paired
 * 1:1 with an "Entity info - Comment" item. `itemTitle` below is always the
 * literal bare `.title` HTML attribute text (NOT `getUniqDropSections()`'s
 * own differently-formatted `label` field, e.g. `"» image type: Front"` vs
 * the real `.title` `"Front — One of this CAA/EAA image's own type-badge…"`).
 */
const UNIQ_DROP_SINGLE_CASES = [
    // Format's "Type" facet — matches ANY release with a CD-type medium,
    // so it coincides exactly with §A's typed-substring `CD` (42, not the
    // 37 an earlier draft assumed existed as a flat exact-string count).
    // Confirmed live: DOES highlight (via _highlightFormatMatch).
    { column: 'Format', section: 'Format info - Type', itemTitle: 'CD', expected: 42, highlightExpected: true },
    // "Slash" (not "Reprise Records" — no comment, no dropdown entry at
    // all). This dropdown-driven `name:` structural mode dispatches to
    // `_highlightEntityCommentPartMatch()` (ShowAllEntityData.user.js's
    // dedicated entity-name highlighter), NOT the generic
    // `highlightText()`/`highlightCrossTag()` path the §A typed "Slash (US"
    // comment-boundary case uses — confirmed live these are genuinely
    // different mechanisms: this one DOES highlight correctly (26 spans),
    // even though the generic path has the confirmed comment-boundary gap.
    // Don't assume the two share a highlighting fate just because they
    // target the same underlying text.
    {
        column: 'Label', section: 'Entity info - Label name', itemTitle: 'Slash', expected: 26,
        highlightExpected: true,
    },
    // The combined "Name (Code)" flat-value entry (with its own
    // flag-icon note) — confirmed live to genuinely exist, distinct from
    // the separate "Country details - Name"/"- Code" structural facets.
    // Confirmed live: row count is correct (32) but produces ZERO
    // highlight spans — this flat combined entry apparently does NOT
    // dispatch through `_highlightCountryMatch()` (that's reserved for the
    // `countryname:`/`countrycode:`/`revcountry:` structural-facet modes,
    // not this generic flat-value entry) — an assumption that turned out
    // wrong, not chased further to its exact root cause (diminishing
    // returns, same call as the CAA anchored-regex gap above).
    { column: 'Country', section: 'Values (flag-icon)', itemTitle: 'United States (US)', expected: 32, highlightExpected: false },
    { column: 'Primary alias', section: 'Structure', itemTitle: '○ empty cells', expected: 56, highlightExpected: false },
];

const UNIQ_DROP_COMBO_CASES = [
    {
        // Both items are Format's "Type" facet — CD(42) ∪ Digital
        // Media(8) with no overlap (no release is both types) = 50, not
        // the 45 an earlier draft assumed from the wrong 37-count premise.
        name: 'Format OR',
        column: 'Format',
        itemTitles: ['CD', 'Digital Media'],
        expected: 50,
        highlightExpected: true,
    },
    {
        name: 'CAA arttype OR',
        column: 'CAA',
        itemTitles: ['Front', 'Back'], // "CAA info - Type" structural section
        expected: 37, // 36 Front-rows + 26 Back-rows, 25-row overlap
        highlightExpected: true,
    },
];

/**
 * Cross-column dropdown-driven combo. NOTE: since Format's dropdown "CD"
 * item is the Type facet (42 rows, same membership as the typed substring
 * `CD`), this combo's result (28) is IDENTICAL to §B Combo A's typed-
 * substring result — confirmed live. The "dropdown exact-value differs
 * from typed substring" contrast doesn't hold for Format specifically;
 * CAA's arttype facet (§F combo above) is the case that still
 * demonstrates genuine exact-value semantics distinct from typing.
 */
const UNIQ_DROP_CROSS_COLUMN_COMBO = {
    columnA: 'Format', itemA: 'CD',
    columnB: 'Country', itemB: 'United States (US)',
    expected: 28,
};

module.exports = {
    URL,
    FIXTURE_PATH,
    TOTAL_ROWS,
    COLUMN_INDEX,
    FILTER_CASES,
    COMBO_CASES,
    ORDER_PAIR_CASE,
    SORT_CHECKPOINTS,
    UNIQ_DROP_COLUMNS_CLEARED,
    UNIQ_DROP_ACTIVE_FILTER,
    UNIQ_DROP_COLUMNS_ACTIVE,
    UNIQ_DROP_SINGLE_CASES,
    UNIQ_DROP_COMBO_CASES,
    UNIQ_DROP_CROSS_COLUMN_COMBO,
};
