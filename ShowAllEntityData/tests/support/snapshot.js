'use strict';

/**
 * Serializes `document.documentElement` to a string with every `<script>`
 * element removed and a `<base>` tag inserted, run entirely INSIDE
 * `page.evaluate()` (DOM manipulation before serializing) rather than as a
 * string-regex post-process on the already-serialized HTML.
 *
 * **Why this exists — a real bug, found by opening a saved `rendered.html`
 * directly in a browser** (not by anything in this module's own automated
 * checks): `captureRendered()` used to serialize `outerHTML` verbatim,
 * including the `<script>` tags `page.addScriptTag()` injects containing
 * this userscript's own ~800KB+ source. A `<script>` element's raw text
 * content is serialized completely unescaped, and that much source almost
 * certainly contains a literal `</script` substring somewhere in a comment
 * or string. Re-opening the *saved* file in a real browser ends the script
 * tag right there and dumps the rest of the userscript's source as literal
 * page text, corrupting everything after it — exactly what happened.
 * `tests/support/test.js`'s own `SAVE_HTML` fixture-saving mechanism had
 * already solved this exact problem (strip `<script>` before serializing);
 * this module just hadn't been given the same treatment.
 *
 * **Why this must run as DOM manipulation, not a string regex**: a
 * regex-based `<script>...</script>` removal on the ALREADY-SERIALIZED
 * HTML string has the identical footgun this function exists to fix — a
 * literal `</script` substring inside the content would terminate the
 * regex match early too, for the same reason it corrupts a browser's own
 * parse.
 *
 * The `<base>` tag (root-relative URLs, e.g. MusicBrainz's own CSS/image
 * paths) makes a saved file's OWN styling/images resolve correctly when
 * opened directly via `file://` instead of served — mirrors
 * `test.js`'s identical reasoning for its own saved copies.
 *
 * A side benefit of stripping every `<script>` unconditionally: it also
 * removes MusicBrainz's own embedded `<script type="application/json">`/
 * `"application/ld+json">`/`window.__MB__` bootstrap blocks — the exact
 * elements an earlier version of `scrub()` had to canonicalize because
 * their *object key order* was non-deterministic per request (Perl
 * hash-iteration-order randomization). With those blocks gone entirely,
 * that canonicalization is moot; removed rather than left as dead code.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function _serializeWithoutScripts(page) {
    return page.evaluate((baseHref) => {
        const clone = document.documentElement.cloneNode(true);
        clone.querySelectorAll('script').forEach((el) => el.remove());
        const base = document.createElement('base');
        base.href = baseHref;
        const head = clone.querySelector('head') || clone;
        head.insertBefore(base, head.firstChild);
        return '<!DOCTYPE html>\n' + clone.outerHTML;
    }, page.url());
}

/**
 * Navigates to `url` and returns MusicBrainz's own unmodified page HTML,
 * captured *before* any userscript code runs — scripts stripped, see
 * `_serializeWithoutScripts()`'s own JSDoc.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @returns {Promise<string>}
 */
async function captureRaw(page, url) {
    // 'load' (not 'domcontentloaded', despite this doc's original spec) —
    // confirmed empirically that MusicBrainz's own native page JS mutates
    // the DOM shortly after DOMContentLoaded (e.g. artist-releasegroups'
    // Wikipedia-extract widget toggling a wikipedia-extract-collapsed/
    // -collapse class and adding/removing its own "Show more..." toggle
    // link, depending on whether that JS has run yet). Two back-to-back
    // domcontentloaded-gated captures of the same unchanged page differed
    // at exactly those two spots — a genuine capture-timing race, not real
    // MB data drift. Waiting for the `load` event (all resources fetched,
    // not just initial HTML parsed) gives that native JS a much better
    // chance to have already run and settled before this captures anything.
    await page.goto(url, { waitUntil: 'load' });
    return _serializeWithoutScripts(page);
}

/**
 * Returns the fully-rendered page's HTML — scripts stripped, see
 * `_serializeWithoutScripts()`'s own JSDoc. Assumes the caller has already
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
    return _serializeWithoutScripts(page);
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
 *
 * MusicBrainz's own embedded `<script type="application/json">`/
 * `"application/ld+json">`/`window.__MB__` bootstrap blocks (whose *object
 * key order* was found to be genuinely non-deterministic per request —
 * Perl hash-iteration-order randomization on the Catalyst backend) no
 * longer need a scrub rule here at all: `captureRaw()`/`captureRendered()`
 * strip every `<script>` element entirely before this function ever runs
 * (see `_serializeWithoutScripts()`'s own JSDoc — a separate, more severe
 * bug fix: a captured `rendered.html`, opened directly in a browser,
 * showed this userscript's own multi-hundred-KB source dumped as literal
 * page text once a `</script` substring inside it prematurely closed the
 * real script tag). That fix happens to also remove the JSON-key-order
 * noise as a side effect, since those blocks live inside `<script>` tags
 * too.
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
