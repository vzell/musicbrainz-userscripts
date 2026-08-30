'use strict';

const fs = require('fs');
const zlib = require('zlib');
const os = require('os');
const path = require('path');

const ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Computes chaban's own (community.metabrainz.org/u/chaban) 3-letter
 * weekday abbreviation for a raw "Country/Date" date string (e.g.
 * `"2009-03-10"`), mirroring ShowAllEntityData's own "Day" synthetic-column
 * extractor EXACTLY (same `text.split('-')` parse, same
 * `new Date(year, month - 1, day)` local-timezone construction, same
 * round-trip validity guard — see `ColumnDataExtractor`'s `Day` entry,
 * `DAY_NAMES`, ShowAllEntityData.user.js) so that a "Tue" filter on this
 * column and a "Tuesday" filter on the synthetic "Day" column agree on the
 * same set of rows. Returns `null` for a year-only/year-month partial date
 * (no day component) — no weekday to compute, matching the real script and
 * the "Day" column's own behavior.
 *
 * @param {string} dateText
 * @returns {string|null}
 */
function weekdayAbbrFor(dateText) {
    const parts = (dateText || '').trim().split('-');
    const year = parts[0] ? parseInt(parts[0], 10) : NaN;
    const month = parts[1] ? parseInt(parts[1], 10) : NaN;
    const day = parts[2] ? parseInt(parts[2], 10) : NaN;
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
        return null;
    }
    return ABBR[d.getDay()];
}

/**
 * Builds a TEMP copy of a committed disk fixture with a chaban-style
 * `<span class="mb-day-of-week">Abbr</span>` injected directly into every
 * full YYYY-MM-DD release-date's own RAW cell HTML string (not the live
 * DOM) for one column.
 *
 * Why patch the source HTML rather than use the usual
 * `injectThirdPartyScript()` post-render DOM-mutation pattern (every other
 * third-party-interop test in this repo's `when: 'now'` mode): confirmed
 * live that it does NOT survive here. "Country/Date" is one of this
 * pageType's declared `collapsableColumns`
 * (ShowAllEntityData.user.js's `artist-releases` pageDef) — its
 * `initCollapsableColumns()` per-column pass rebuilds affected `<td>`
 * content from the row's own STORED source HTML on every filter-triggered
 * re-render, discarding any manually-injected live-DOM content the instant
 * the first filter keystroke fires (`runFilter()`). A live post-render
 * injection is visible immediately (confirmed: 445
 * `.mb-day-of-week` spans present right after injection) but is reliably
 * gone (0 spans) the moment a column filter is typed. Patching the fixture
 * JSON's own `cell.html` strings BEFORE `loadFromDiskFixture()` ever loads
 * them sidesteps this entirely — the injected span becomes part of the
 * authoritative stored source every re-render rebuilds from.
 *
 * @param {string} sourceFixturePath - path to the source `.json.gz` fixture.
 * @param {number} countryDateColIndex - `COLUMN_INDEX['Country/Date']`.
 * @returns {string} path to a new temp `.json.gz` fixture file (caller does
 *   not need to clean it up — OS temp dir).
 */
function buildChabanPatchedFixture(sourceFixturePath, countryDateColIndex) {
    const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(sourceFixturePath)).toString('utf8'));
    const key = String(countryDateColIndex);

    for (const row of raw.rows) {
        const cell = row[key];
        if (!cell || !cell.html) continue;
        cell.html = cell.html.replace(/<span class="release-date">([^<]*)<\/span>/g, (whole, dateText) => {
            const abbr = weekdayAbbrFor(dateText);
            if (!abbr) return whole;
            return `<span class="release-date">${dateText}<span class="mb-day-of-week">${abbr}</span></span>`;
        });
    }

    const outPath = path.join(os.tmpdir(), `bodeans-chaban-${process.pid}-${Date.now()}.json.gz`);
    fs.writeFileSync(outPath, zlib.gzipSync(Buffer.from(JSON.stringify(raw))));
    return outPath;
}

module.exports = { buildChabanPatchedFixture, weekdayAbbrFor };
