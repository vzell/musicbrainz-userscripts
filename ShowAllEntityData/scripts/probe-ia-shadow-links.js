/**
 * Probe: the links archive.org's search page writes into its shadow DOM
 * (G4 of NON-MB-COVERAGE.org, 2026-11-03).
 *
 * A saved page loses its shadow roots, so the fixture cannot tell what the
 * link previews meet on the real page. Paste this whole file into the
 * DevTools console on
 *
 *     https://archive.org/search?query=springsteen+1975
 *
 * once in each result view (Tile, List, Compact list), after the results
 * show. It copies its JSON to the clipboard (v2; paste it into a file such as
 * debug/ia-tile-probe.json — the object the console shows is cut off): per distinct link shape, how
 * many there are, an example href, whether the link wraps an image, its text,
 * and the custom elements and landmark tags from the link up to <app-root>
 * (shadow hosts marked with "#"). Read-only: it changes nothing on the page
 * and makes no request.
 *
 * Why each field: `_extTarget()` drops a link that wraps an `<img>` (it is an
 * image's), `_iaShadowLinkInScope()` drops one under `_IA_SHADOW_SKIP`
 * (nav, header, footer, ia-topnav, ia-footer), and the `iadetails` reader
 * takes `/details/<id>`. The probe shows which of the result list's links
 * survive all three.
 */
(function probeIaShadowLinks() {
    'use strict';
    const SKIP = 'nav, header, footer, ia-topnav, ia-footer';
    const links = [];

    /**
     * Collects every link under `root`, descending into each open shadow root.
     * @param {Node} root
     * @returns {void}
     */
    function walk(root) {
        root.querySelectorAll('*').forEach((el) => {
            if (el.tagName === 'A' && el.getAttribute('href')) links.push(el);
            if (el.shadowRoot) walk(el.shadowRoot);
        });
    }

    /**
     * The custom elements and landmarks from `a` up to the document,
     * crossing shadow roots ("#" after a shadow host).
     * @param {Element} a
     * @returns {{chain: string, skipped: boolean, inShadow: boolean}}
     */
    function chainOf(a) {
        const out = [];
        let skipped = false;
        for (let n = a.parentElement || (a.getRootNode() instanceof ShadowRoot ? a.getRootNode().host : null); n;) {
            if (n.matches(SKIP)) skipped = true;
            const tag = n.tagName.toLowerCase();
            if (tag.includes('-') || /^(nav|header|footer|main|section)$/.test(tag)) out.push(tag + (n.shadowRoot ? '#' : ''));
            if (n.parentElement) n = n.parentElement;
            else {
                const r = n.getRootNode();
                n = r instanceof ShadowRoot ? r.host : null;
            }
        }
        return { chain: out.reverse().join(' > '), skipped, inShadow: a.getRootNode() instanceof ShadowRoot };
    }

    walk(document);
    const shapes = new Map();
    for (const a of links) {
        const href = a.getAttribute('href');
        const kind = href.replace(/[?#].*$/, '').replace(/\/details\/[^/]+/, '/details/<id>').replace(/^https?:\/\/[^/]+/, '<abs>');
        const c = chainOf(a);
        const key = `${kind} | img:${!!a.querySelector('img')} | ${c.chain} | skip:${c.skipped}`;
        const s = shapes.get(key) || { n: 0, kind, example: href, img: !!a.querySelector('img'), text: (a.textContent || '').trim().slice(0, 60), inShadow: c.inShadow, chain: c.chain, skipped: c.skipped };
        s.n++;
        shapes.set(key, s);
    }
    const view = (new URLSearchParams(location.search)).get('view') || '(default)';
    const result = { probe: 'ia-shadow-links v2', url: location.href, view, ua: navigator.userAgent, links: links.length,
        shapes: [...shapes.values()].sort((x, y) => y.n - x.n) };
    const json = JSON.stringify(result, null, 1);
    // v2 (2026-11-04): the console shows a returned object collapsed, so the
    // fields that matter (chain, skipped) were cut off in the copied text.
    // The JSON goes to the clipboard (DevTools' copy()) and is returned as
    // one string: paste it into debug/ia-<view>-probe.json.
    if (typeof copy === 'function') copy(json);  // eslint-disable-line no-undef
    return `Copied ${result.shapes.length} link shapes (${json.length} characters) to the clipboard: paste them into a file.`;
})();
