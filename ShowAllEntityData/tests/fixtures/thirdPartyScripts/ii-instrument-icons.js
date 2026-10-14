/**
 * Simulated third-party userscript side effect — NOT a vendored copy of any
 * real script's source, just the DOM shape and timing that matter here.
 *
 * "MusicBrainz: Instrument Icons Everywhere" (Lotheric) decorates every
 * instrument link on a MusicBrainz page. `processPage()` selects
 * `a[href*="/instrument/"]:not([data-ii-processed])`, skips links inside tab
 * bars/`nav` and links with no visible text, then for each one:
 *
 *   1. stamps the ANCHOR `data-ii-processed="true"` at once (`processLink()`);
 *   2. resolves the icon asynchronously (memory → IndexedDB → network) and,
 *      when there is one, inserts `<img class="mb-ii-icon">` IMMEDIATELY
 *      BEFORE the anchor (`insertIconBeforeLink()`, which also refuses to
 *      insert when the previous sibling already is one);
 *   3. when there is none (a GitHub 404, cached as `'NONE'`), leaves the
 *      anchor stamped with no icon — for good.
 *
 * A MutationObserver on `document.body` (subtree, 120 ms debounce) re-runs
 * `processPage()`, so any UNSTAMPED anchor added later is decorated too.
 * A stamped anchor is never looked at again: a clone of the anchor alone
 * keeps the stamp and loses the icon, which is the defect this simulator
 * exists to reproduce.
 *
 * Provenance: hand-built from
 * tests/fixtures/live-userscripts/MusicBrainz_Instrument_Icons_Everywhere.user.js
 * v2026-10-07.1444 (`processPage()`, `shouldSkip()`, `processLink()`,
 * `createIconImg()`, `insertIconBeforeLink()`, `init()`). Re-verify if that
 * script's shapes change.
 *
 * Config (optional, via `window.__thirdPartySim`):
 *   {
 *     icons?: { [uuid: string]: string | { folder: string, delayMs: number } },
 *       // uuid → irombook folder name (icon right away, as from the
 *       // in-memory cache), or { folder, delayMs } (icon after delayMs, as
 *       // from a network fetch). Any uuid not listed has NO icon ('NONE')…
 *     allIcons?: boolean,
 *       // …unless this is true: then every unlisted instrument gets an icon
 *       // at once, its folder taken from the link text.
 *     debounceMs?: number  // observer debounce, default 120 (the script's)
 *   }
 *
 * Test-only signal (not part of the real script): `window.__iiSimIdle` is
 * false from the moment the observer schedules a pass until that pass has
 * run, so a spec can wait for "the script has looked at the new DOM"
 * instead of sleeping past the debounce.
 */
(function () {
    'use strict';

    const cfg = window.__thirdPartySim || {};
    const icons = cfg.icons || {};
    const allIcons = cfg.allIcons === true;
    const debounceMs = typeof cfg.debounceMs === 'number' ? cfg.debounceMs : 120;
    const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const LINK_RE = /\/instrument\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:\?[^#]*)?(?:#.*)?$/i;

    /**
     * Builds the script's icon image, with its real inline styles.
     * @param {string} folder - irombook folder name.
     * @returns {HTMLImageElement}
     */
    const makeImg = (folder) => {
        const img = document.createElement('img');
        img.className = 'mb-ii-icon';
        img.src = PX;
        img.alt = '';
        img.title = folder.replace(/_/g, ' ');
        img.setAttribute('aria-hidden', 'true');
        img.style.setProperty('width', '16px', 'important');
        img.style.setProperty('height', '16px', 'important');
        img.style.setProperty('display', 'inline-block', 'important');
        img.style.setProperty('vertical-align', 'middle', 'important');
        img.style.setProperty('margin-right', '0.30em', 'important');
        img.style.setProperty('margin-left', '0.05em', 'important');
        img.style.setProperty('object-fit', 'contain', 'important');
        img.style.setProperty('border', 'none', 'important');
        return img;
    };

    /**
     * Inserts the icon before `link`, unless one is already there.
     * @param {HTMLAnchorElement} link
     * @param {string} folder
     */
    const insertIcon = (link, folder) => {
        if (!link.parentNode) return;
        const prev = link.previousSibling;
        if (prev && prev.nodeType === 1 && prev.classList.contains('mb-ii-icon')) return;
        link.parentNode.insertBefore(makeImg(folder), link);
    };

    /**
     * Whether the script would skip this anchor.
     * @param {Element} el
     * @returns {boolean}
     */
    const shouldSkip = (el) => {
        if (el.dataset.iiProcessed === 'true') return true;
        return !!el.closest('.tabs, ul.tabs, .subtabs, .page_tabs, [role="tablist"], .tabs-wrap, nav');
    };

    /** One `processPage()` pass. */
    const processPage = () => {
        document.querySelectorAll('a[href*="/instrument/"]:not([data-ii-processed])').forEach((link) => {
            if (shouldSkip(link)) return;
            if (!link.textContent.trim()) return;
            const m = (link.href || '').match(LINK_RE);
            if (!m) return;
            link.dataset.iiProcessed = 'true';
            const spec = icons[m[1].toLowerCase()] || (allIcons ? link.textContent.trim().replace(/\s+/g, '_') : null);
            if (!spec) return;
            if (typeof spec === 'string') {
                insertIcon(link, spec);
            } else {
                setTimeout(() => insertIcon(link, spec.folder), spec.delayMs);
            }
        });
    };

    /** The script's `init()`: one pass, then a debounced observer. */
    const init = () => {
        processPage();
        let t = null;
        window.__iiSimIdle = true;
        new MutationObserver(() => {
            if (t) return;
            window.__iiSimIdle = false;
            t = setTimeout(() => { t = null; processPage(); window.__iiSimIdle = true; }, debounceMs);
        }).observe(document.body || document.documentElement, { childList: true, subtree: true });
        window.MBII_processPage = processPage;
    };

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
