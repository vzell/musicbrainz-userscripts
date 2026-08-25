'use strict';

/**
 * Clicks through VZ_MBLibrary's custom confirm dialog (`Lib.showCustomConfirm`,
 * `lib/VZ_MBLibrary.user.js`'s `showCustomDialog()`), if one is currently open.
 *
 * Unlike a native browser `confirm()`, this is a plain DOM overlay — a
 * class-less `<div>` containing a `<button>OK</button>`/`<button>Cancel</button>`
 * pair, built and positioned entirely with inline styles. Playwright's
 * automatic dialog handling (`page.on('dialog', ...)`) only sees native
 * `window.confirm`/`alert`/`prompt`, so it never fires for this — a real click
 * on the OK button is required or the page just sits there forever with no
 * console error and no visible progress.
 *
 * The confirming pageTypes: any `features.unboundedPagination: true` entry
 * (`edits`, `user-edits`, `user-open-edits`, `notes-received`) shows this
 * dialog ONLY when MusicBrainz's own pagination widget goes "ambiguous" (an
 * ellipsis, no true last page — see `_hasAmbiguousEditsPagination()` in
 * ShowAllEntityData.user.js) — i.e. once there's enough data that the fetch
 * could run long. A small result set that fits on one page never shows it at
 * all. Always call this right after clicking a "Show all ..." button
 * regardless of whether you expect the dialog — don't try to predict it from
 * row count, since that's exactly the ambiguity this dialog exists for.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [options] - how long to wait for the dialog
 *   to appear before concluding none will (default 1000ms — it renders
 *   synchronously right on click, so this adds negligible overhead to a
 *   capture that never shows it).
 * @returns {Promise<boolean>} true if a dialog was found and dismissed (OK
 *   clicked), false if none appeared within the timeout.
 */
async function dismissCustomConfirmDialog(page, { timeout = 1000 } = {}) {
    const okButton = page.getByRole('button', { name: 'OK', exact: true });
    try {
        await okButton.waitFor({ state: 'visible', timeout });
    } catch {
        return false;
    }
    await okButton.click();
    return true;
}

module.exports = { dismissCustomConfirmDialog };
