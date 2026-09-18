/**
 * Simulated third-party userscript side effect — NOT a vendored copy of any
 * real script's source, just the two DOM shapes that matter here.
 *
 * "MusicBrainz: Right Side Flags Everywhere" (Lotheric) replaces MusicBrainz's
 * CSS-sprite flags with Wikimedia SVGs on the right. `processFlags()` selects
 * `.flag:not([data-hq-processed]):not([data-hq-skip])` — ANY tag — and then
 * branches on whether that element wraps an `a[href*="/area/"]`:
 *
 *   WITH an anchor    it neutralizes the sprite in place and puts its <img>
 *                     into a NEW `span.mfe-flag-wrapper` around the anchor.
 *                     Native `.release-country` markup takes this branch, and
 *                     so does this script's injected column now that its cells
 *                     carry real /area/ links.
 *   WITHOUT an anchor `el.appendChild(img)` puts the <img> INSIDE the flag
 *                     element itself, after its text, leaving the hollow
 *                     element in place.
 *
 * Both branches leave the image INSIDE `.release-country`, which is what makes
 * a release event render "<country><flag><date>" with the date hard against
 * the flag: the image carries `margin-left: 0.40em` but `margin-right: 0.05em`,
 * correct on every surface where its flag ends the cell.
 *
 * Provenance: hand-built from
 * tests/fixtures/live-userscripts/MusicBrainz_Right_Side_Flags_Everywhere.user.js
 * v2026-09-16.1151 (`processFlags()`, `_doApplyHQ()`, `insertFlags()`,
 * `createFlagImgElement()`, `removeLegacySpacingIfNeeded()`). Re-verify if that
 * script's shapes change.
 *
 * Config (optional, via `window.__thirdPartySim`):
 *   { selector?: string } — defaults to '.flag[class*="flag-"]'.
 */
(function () {
    'use strict';

    const cfg = window.__thirdPartySim || {};
    const selector = cfg.selector || '.flag[class*="flag-"]';
    const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

    const makeImg = (code) => {
        const img = document.createElement('img');
        img.className = 'mb-hq-flag-img';
        img.setAttribute('data-hq-flag', code);
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('data-hq-processed', 'true');
        img.setAttribute('data-hq-code', code);
        img.style.setProperty('height', '11px', 'important');
        img.style.setProperty('display', 'inline-block', 'important');
        img.style.setProperty('margin-left', '0.40em', 'important');
        img.style.setProperty('margin-right', '0.05em', 'important');
        img.src = PX;
        return img;
    };

    document.querySelectorAll(selector).forEach((el) => {
        if (el.hasAttribute('data-hq-processed')) return;

        const code = (Array.from(el.classList)
            .find((c) => c.startsWith('flag-')) || 'flag-XX').slice('flag-'.length);

        // removeLegacySpacingIfNeeded(): kill the native sprite in place.
        el.style.setProperty('padding-left', '0px', 'important');
        el.style.setProperty('background-image', 'none', 'important');
        el.setAttribute('data-hq-processed', 'true');
        el.setAttribute('data-hq-code', code);

        const anchor = el.querySelector('a[href*="/area/"]');
        if (anchor) {
            const wrapper = document.createElement('span');
            wrapper.className = 'mfe-flag-wrapper';
            wrapper.style.whiteSpace = 'nowrap';
            anchor.parentNode.insertBefore(wrapper, anchor);
            wrapper.appendChild(anchor);
            wrapper.appendChild(makeImg(code));
        } else {
            el.appendChild(makeImg(code));
        }
    });
})();
