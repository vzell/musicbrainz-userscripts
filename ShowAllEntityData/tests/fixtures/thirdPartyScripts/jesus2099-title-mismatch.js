/**
 * Simulated third-party userscript side effect — NOT a real third-party
 * script's source, just the specific DOM marker ShowAllEntityData.user.js
 * is designed to detect: jesus2099's userscript flags a track/recording
 * whose display title differs from its underlying recording name by
 * writing a "≠" character into the title `<a>`'s own `title` tooltip
 * attribute (see debug/title.html: `<a title="track name: Rave On!\n≠rec.
 * name: Rave On" …>Rave On!</a>`).
 *
 * ShowAllEntityData's own detector (`_titleHasRecNameMismatch()`, near
 * `_COLLAPSE_MATCH_SEL`) deliberately tests only for the literal "≠"
 * character, not the exact tooltip wording or jesus2099's own class names
 * — so this simulator only needs to reproduce that one signal, not
 * jesus2099's actual comparison logic.
 *
 * Config (optional, set `window.__thirdPartySim` before injecting this):
 *   { columnName?: string, rowIndices?: number[] } — defaults to
 *   `{ columnName: 'Title', rowIndices: [0] }`.
 *
 * Marks the given row indices (within the FIRST table on the page whose
 * header matches `columnName`) by appending the "≠" marker to that row's
 * cell's first `<a title="...">` (or a freshly-added one if none exists).
 *
 * Provenance: hand-built directly from ShowAllEntityData.user.js's own
 * `_titleHasRecNameMismatch()` detection code (not from jesus2099's actual
 * script, which isn't vendored here) — last checked against that function
 * 2026-08-23. Re-verify this snippet if that function's detection logic
 * ever changes.
 */
(function () {
    var cfg = Object.assign({ columnName: 'Title', rowIndices: [0] }, window.__thirdPartySim || {});

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

        var rows = table.querySelectorAll('tbody tr');
        cfg.rowIndices.forEach(function (i) {
            var row = rows[i];
            if (!row) return;
            var cell = row.cells[colIdx];
            if (!cell) return;
            var anchor = cell.querySelector('a');
            if (!anchor) return;
            var displayName = anchor.textContent.trim();
            anchor.title = 'track name: ' + displayName + '\n≠rec. name: ' + displayName + ' (simulated)';
        });
        break; // Only the first matching table — matches this simulator's own single-table test usage.
    }
})();
