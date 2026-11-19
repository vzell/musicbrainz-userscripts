/**
 * Stands in for BruceBaseParser's first act on a Brucebase page
 * (~/git/userscripts/BruceBaseParser/BruceBaseParser.user.js v3.33,
 * `createTooltipElement()`, run before it changes anything):
 *
 *     const div = document.createElement('div');
 *     div.id = 'bb-tooltip';
 *     div.style.display = 'none';
 *     document.body.appendChild(div);
 *
 * ShowAllEntityData's `_bbBbpPresent()` reads exactly this element, so the
 * stand-in exercises the guard on every machine; the real script, where its
 * checkout exists, is what tests/fixtures/bb-bbp-coexistence.spec.js uses to
 * show the page changes the guard protects against (org/bbp-parity.org,
 * "Coexistence"). Injected with `loadUserscriptPage()`'s `extraScripts`.
 */
(function () {
    'use strict';
    const div = document.createElement('div');
    div.id = 'bb-tooltip';
    div.style.display = 'none';
    document.body.appendChild(div);
})();
