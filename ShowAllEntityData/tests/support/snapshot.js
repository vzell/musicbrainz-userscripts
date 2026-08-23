'use strict';

/**
 * Navigates to `url` and returns MusicBrainz's own unmodified page HTML,
 * captured *before* any userscript code runs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @returns {Promise<string>}
 */
async function captureRaw(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page.evaluate(() => document.documentElement.outerHTML);
}

/**
 * Returns the fully-rendered page's HTML. Assumes the caller has already
 * injected the userscript, triggered its "Show all" button (or loaded a
 * disk fixture), and waited for `#mb-filter-container` to become visible —
 * `renderFinalTable()`/`renderGroupedTable()`'s own shared "initial render
 * finished" signal, reused here rather than a fixed timeout (see
 * `tests/support/liveAssertions.js`'s `assertGroupedRenderCompleted()` for
 * the same pattern).
 *
 * Callers on a pageType with `addCAA`/`addEAA`/`injectedColumns:
 * ['Relationships']` should ALSO await `waitForCaaEaaComplete()`/
 * `waitForRelationshipsComplete()` (`tests/support/asyncCompletion.js`)
 * before calling this — confirmed empirically that those complete well
 * *after* `#mb-filter-container` becomes visible, and capturing too early
 * produces a snapshot with an incomplete `#mb-info-display-caa`/`-rel`
 * state that would vary run to run depending on exact timing, defeating
 * the point of a snapshot baseline. `scrub()` below removes the *duration*
 * numbers those completions report either way, but can't paper over a
 * snapshot taken mid-fetch with genuinely different DOM content (an empty
 * info-display vs. a populated one).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function captureRendered(page) {
    return page.evaluate(() => document.documentElement.outerHTML);
}

/**
 * Blanks the numeric duration in every occurrence of a `<label><NUMBER>
 * <unit>` pattern (e.g. `Fetching: 0.12s`, `🎨CAA: 3.5s`, `Total load
 * time: 847ms`) — content-pattern-based rather than element-scoped, unlike
 * an earlier version of this module's rules.
 *
 * **Why content-pattern, not element-scoped**: the first version of these
 * rules matched `id="ID">TEXT<` — i.e. everything up to the first `<` —
 * which works for a plain-text element but silently under-scrubs one whose
 * content includes a NESTED element (`#mb-global-status-display` gets a
 * nested `<span title="...">🎨CAA: 51ms</span>` appended via
 * `_sdAppend()`, confirmed empirically: capturing the same page twice
 * still differed after scrubbing, at exactly this nested span). Matching
 * by the LABEL TEXT that precedes the number instead — a string that only
 * ever appears in this script's own status messages, never in raw MB
 * markup or a CSS value — sidesteps needing to know the DOM structure
 * around the number at all, and catches every occurrence regardless of
 * nesting depth.
 *
 * @param {string} html
 * @param {string} label - Exact literal text immediately preceding the
 *   number (regex-escaped internally), e.g. `'Fetching: '`.
 * @param {string} [replacement]
 * @returns {string}
 */
function _scrubTimingAfterLabel(html, label, replacement = '[SCRUBBED]') {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escapedLabel})\\d+(?:\\.\\d+)?(?:ms|s)`, 'g');
    return html.replace(re, `$1${replacement}`);
}

/**
 * Recursively sorts every plain object's keys (alphabetically), leaving
 * array element ORDER untouched (that can be genuine row/track ordering —
 * only object key order is the actual noise source here, see
 * `_canonicalizeJsonBlocks()`'s own JSDoc for why).
 *
 * @param {*} value
 * @returns {*}
 */
function _sortKeysDeep(value) {
    if (Array.isArray(value)) return value.map(_sortKeysDeep);
    if (value && typeof value === 'object') {
        const sorted = {};
        for (const key of Object.keys(value).sort()) sorted[key] = _sortKeysDeep(value[key]);
        return sorted;
    }
    return value;
}

/**
 * Canonicalizes (sorts object keys, recursively) the content of every
 * `<script type="application/json">`/`<script type="application/ld+json">`
 * block in `html`.
 *
 * **Why this exists**: MusicBrainz's own raw page HTML embeds several such
 * blocks (entity data, the "Release events" blob, JSON-LD SEO structured
 * data, …) whose *object key order* is genuinely non-deterministic between
 * two otherwise-identical requests to the same URL — confirmed empirically
 * by capturing the same page twice in a row and diffing: the JSON-LD
 * block's keys came back in a different order each time, with byte-
 * identical *values*, most likely Perl hash-iteration-order randomization
 * on MusicBrainz's own Catalyst backend (a deliberate anti-hash-flooding
 * security measure, not a bug). Confirmed the fix works by parsing both
 * captures' JSON-LD blocks, sorting keys, and finding the results byte-
 * identical. Without this, `raw.html` would show a false diff on
 * essentially every re-capture, unrelated to any script change or real MB
 * edit — the exact failure mode this whole harness exists to avoid.
 *
 * Array element order is deliberately left untouched (only object keys are
 * sorted) — an array can encode genuine ordering (track list order, event
 * list order) that must NOT be normalized away, unlike a hash's key order.
 *
 * Blocks that aren't valid JSON (parse failure) are left untouched rather
 * than dropped — safer than guessing.
 *
 * @param {string} html
 * @returns {string}
 */
function _canonicalizeJsonBlocks(html) {
    return html.replace(
        // [^>]* after the type attribute: the rendered (post-script) page
        // adds extra attributes to some of these tags (e.g. a
        // style="display: none;" on the "Release events" block) that
        // aren't present on the raw page — confirmed empirically, an
        // earlier version of this regex matched the raw capture fine but
        // silently skipped this one once rendered, since it required the
        // type attribute to be immediately followed by '>'.
        /(<script type="application\/(?:ld\+)?json"[^>]*>)([\s\S]*?)(<\/script>)/g,
        (full, open, body, close) => {
            try {
                return open + JSON.stringify(_sortKeysDeep(JSON.parse(body))) + close;
            } catch {
                return full;
            }
        }
    );
}

/**
 * Blanks the content of MusicBrainz's own `window.__MB__` bootstrap script
 * (`<script>Object.defineProperty(window,"__MB__",{value:Object.freeze(
 * {...})})</script>` — Catalyst-internal DBDefs/session/i18n plumbing).
 * Not valid pure JSON (it's a JS expression, `Object.freeze()`/
 * `Object.seal()` calls, not a bare object literal), so
 * `_canonicalizeJsonBlocks()` can't parse and re-sort it the same way —
 * and it's irrelevant to blank wholesale anyway, since this script never
 * reads `window.__MB__` (it reads rendered `<table>` DOM content, not this
 * bootstrap data). Found via the same two-captures-in-a-row diff that
 * surfaced the JSON blocks above; same underlying Perl-hash-order-
 * randomization root cause.
 *
 * @param {string} html
 * @returns {string}
 */
function _scrubMbBootstrapScript(html) {
    return html.replace(
        /<script>Object\.defineProperty\(window,"__MB__",[\s\S]*?<\/script>/,
        '<script>[SCRUBBED window.__MB__ bootstrap]</script>'
    );
}

/**
 * Generic scrub rules, applied to every pageType — each one targets
 * content that's genuinely volatile *per capture run*, not per script
 * change, verified by actually inspecting both pilot pages' raw AND
 * rendered HTML (see `task-playwright-html-snapshot-harness.md`'s Part 1
 * implementation notes) rather than guessing at selectors:
 *
 *   - MetaBrainz's own frontend build-hashed static asset filenames
 *     (`static.metabrainz.org/MB/.../<name>-<7-hex-hash>.<ext>`) change on
 *     every MetaBrainz deploy, unrelated to any change in this script.
 *   - This script's OWN self-reported wall-clock timing text — confirmed
 *     present on both pilot pages once rendered: `#mb-global-status-
 *     display`'s "Fetching: X.XXs, Rendering: X.XXs, ..." summary,
 *     `#mb-info-display-caa`/`-rel`'s "🎨CAA: X.Xs"/"🔗Rels: X.Xs" (plus
 *     their `data-mbtt` tooltips' own "Total load time: X.Xs" line),
 *     `#mb-info-display-generic`'s auto-resize "...in X.XXs" message, and
 *     the (hidden-but-still-serialized) `#mb-fetch-progress-label`'s stale
 *     "...  - X.Xs left" estimate.
 *   - MusicBrainz's OWN embedded JSON blocks (`<script type="application/
 *     json">`/`"application/ld+json">`, and the `window.__MB__` bootstrap
 *     script) — their *object key order* is genuinely non-deterministic
 *     per request (see `_canonicalizeJsonBlocks()`'s own JSDoc for the
 *     empirical proof). This was the single biggest false-diff source
 *     found: without it, `raw.html` differed on nearly every re-capture
 *     of the SAME unchanged page.
 *
 * None of the doc's originally-guessed candidates (CSRF/nonce, "N alerts",
 * relative timestamps, session identifiers) were actually found on either
 * pilot page — logged out, no personalized banners exist to find. Both
 * categories above were found only by actually diffing two back-to-back
 * captures of the same unchanged page, not by inspecting a single capture.
 *
 * Checked and explicitly ruled out (found during the same investigation,
 * NOT volatile — real, stable data): ISO `creation_date` timestamps on
 * annotation/entity records, and "N edit(s)"-shaped substrings that turned
 * out to be a false-positive regex match against a stable list title
 * ("...2021 edition") rather than a real edit counter.
 */
const GENERIC_SCRUB_RULES = [
    (html) => html.replace(
        /(static\.metabrainz\.org\/MB\/[A-Za-z0-9/_.-]*?)-[0-9a-f]{7}(\.(?:js|css|png|svg|ico))/g,
        '$1-SCRUBBED$2'
    ),
    (html) => _scrubTimingAfterLabel(html, 'Fetching: '),
    (html) => _scrubTimingAfterLabel(html, 'Rendering: '),
    (html) => _scrubTimingAfterLabel(html, '📐Measuring: '),
    (html) => _scrubTimingAfterLabel(html, '🎨CAA: '),
    (html) => _scrubTimingAfterLabel(html, '🔗Rels: '),
    (html) => _scrubTimingAfterLabel(html, 'Total load time: '),
    (html) => _scrubTimingAfterLabel(html, 'in '),
    // #mb-fetch-progress-label's stale "... - X.Xs left" estimate — suffix-
    // anchored on " left" rather than a label-prefix match, since "- " on
    // its own is too generic a prefix to be a safe match anchor.
    (html) => html.replace(/\d+(?:\.\d+)?s left/g, '[SCRUBBED] left'),
    _canonicalizeJsonBlocks,
    _scrubMbBootstrapScript,
];

/**
 * Per-pageType scrub rule overrides/additions, populated by actually
 * inspecting that pageType's own captured HTML — empty until a real
 * volatile region specific to one pageType (not covered by
 * `GENERIC_SCRUB_RULES`) is found. Neither `artist-releasegroups` nor
 * `release-tracks` needed one as of this writing.
 *
 * @type {Object<string, Array<(html: string) => string>>}
 */
const PAGE_TYPE_SCRUB_RULES = {};

/**
 * Strips or placeholder-replaces known-volatile content before either
 * snapshot is compared or written to disk. See `GENERIC_SCRUB_RULES`'s own
 * JSDoc for what's covered and why.
 *
 * **Known limitation, not solved here**: live MB data changing between two
 * capture runs (an editor adding a release group) still shows up as a real
 * content diff unrelated to any script change — for `raw.html` (MB's own
 * unmodified page) this is unavoidable by definition, since that capture
 * has to come from a live fetch. For `rendered.html`, this is solved
 * separately, not by this function: see `task-playwright-test-infra-
 * expansion.md`'s Part 6 disk-based fixture loading
 * (`tests/support/diskFixture.js`) — replay a committed `.json.gz`
 * snapshot instead of re-fetching live, for byte-for-byte-identical input
 * on every re-capture.
 *
 * @param {string} html
 * @param {string} pageType
 * @returns {string}
 */
function scrub(html, pageType) {
    let result = html;
    for (const rule of GENERIC_SCRUB_RULES) result = rule(result);
    for (const rule of PAGE_TYPE_SCRUB_RULES[pageType] || []) result = rule(result);
    return result;
}

/**
 * Thin comparison wrapper — a small hand-rolled line-diff (no `diff`/
 * `jsdiff` package exists anywhere in this repo as of this writing).
 * Returns whether `before`/`after` are identical and, if not, a short
 * preview for the console; the actual diff detail belongs to `git diff` on
 * the committed snapshot files, not to this function's return value.
 *
 * @param {string} before
 * @param {string} after
 * @returns {{identical: boolean, beforeLines: number, afterLines: number, firstDiffLine: number|null, preview: string[]}}
 */
function diffSummary(before, after) {
    if (before === after) {
        return { identical: true, beforeLines: before.split('\n').length, afterLines: after.split('\n').length, firstDiffLine: null, preview: [] };
    }

    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    let firstDiffLine = 0;
    const maxCommon = Math.min(beforeLines.length, afterLines.length);
    while (firstDiffLine < maxCommon && beforeLines[firstDiffLine] === afterLines[firstDiffLine]) {
        firstDiffLine++;
    }

    const preview = [];
    const contextStart = Math.max(0, firstDiffLine - 1);
    for (let i = contextStart; i < Math.min(afterLines.length, firstDiffLine + 3); i++) {
        const marker = i === firstDiffLine ? '>' : ' ';
        preview.push(`${marker} [after  ${i}] ${afterLines[i]?.slice(0, 200) ?? ''}`);
    }
    for (let i = contextStart; i < Math.min(beforeLines.length, firstDiffLine + 3); i++) {
        const marker = i === firstDiffLine ? '>' : ' ';
        preview.push(`${marker} [before ${i}] ${beforeLines[i]?.slice(0, 200) ?? ''}`);
    }

    return {
        identical: false,
        beforeLines: beforeLines.length,
        afterLines: afterLines.length,
        firstDiffLine,
        preview,
    };
}

module.exports = { captureRaw, captureRendered, scrub, diffSummary };
