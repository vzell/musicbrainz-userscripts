/**
 * Simulated third-party userscript side effect — reproduces a real,
 * already-seen failure mode (see ShowAllEntityData.user.js's
 * `_isGenuineFilterInputEvent()` JSDoc / debug/fail.debug): some OTHER
 * userscript (an autofill/form-restoration helper, most plausibly) wrote
 * its own cached value directly into one of this script's column-filter
 * inputs and dispatched a plain, untrusted `'input'` event to "make it
 * stick" — silently activating as an active filter and making the table
 * look like it had failed to render, with no exception anywhere. That
 * incident predates the `_isGenuineFilterInputEvent()` guard being added
 * as the fix; this simulator exists to keep proving that fix still holds.
 *
 * This is exactly what a careless script does: set `.value` directly
 * (bypasses the `readonly` anti-autofill attribute entirely — `readonly`
 * only blocks *user keyboard* editing, never a programmatic `.value =`
 * assignment) and fire a bare `new Event('input', {bubbles: true})` with
 * no `event.isTrusted` and no `event.mbInternal` marker.
 *
 * **Important behavioral note, found empirically (not assumed from the
 * bug report's own wording) — the guard doesn't just IGNORE the untrusted
 * event, it ACTIVELY RESETS the input's `.value`** as part of rejecting
 * it: dispatching a bare `'input'` event runs the script's own listener
 * *synchronously* (before `dispatchEvent()` returns), and that listener's
 * rejection path clears the field rather than leaving the poisoned text
 * visibly sitting there. This means a caller CANNOT observe "was the value
 * ever actually poisoned, even briefly" from outside this script's own
 * execution (there's no async gap to catch it in) — hence this fixture
 * self-reports what it attempted via `window.__thirdPartySimResult =
 * { found, colIdx }`, so a test can prove the write was genuinely
 * attempted independently of whatever ShowAllEntityData did in response,
 * rather than only being able to infer it from the (now-cleared) input
 * value, which would be indistinguishable from "this fixture never found
 * the column at all."
 *
 * Config (optional, set `window.__thirdPartySim` before injecting this):
 *   { columnName?: string, value?: string } — defaults to
 *   `{ columnName: 'ISRCs', value: 'vzell' }` (the real debug/fail.debug
 *   case: a cached MusicBrainz username left over from an unrelated
 *   script's own state).
 */
(function () {
    var cfg = Object.assign({ columnName: 'ISRCs', value: 'vzell' }, window.__thirdPartySim || {});
    var result = { found: false, colIdx: -1 };

    function stripHeaderDecorations(t) {
        return t.replace(/[⇅▲▼📊▶◀▤0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '').trim();
    }

    var tables = document.querySelectorAll('table.tbl');
    for (var t = 0; t < tables.length; t++) {
        var table = tables[t];
        var headers = table.querySelectorAll('thead tr:first-child th');
        var colIdx = -1;
        for (var h = 0; h < headers.length; h++) {
            var name = headers[h].dataset.colName || stripHeaderDecorations(headers[h].textContent);
            if (name === cfg.columnName) { colIdx = h; break; }
        }
        if (colIdx === -1) continue;

        var input = table.querySelector('.mb-col-filter-input[data-col-idx="' + colIdx + '"]');
        if (!input) continue;

        result.found = true;
        result.colIdx = colIdx;

        input.value = cfg.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        break; // Only the first matching table.
    }

    window.__thirdPartySimResult = result;
})();
