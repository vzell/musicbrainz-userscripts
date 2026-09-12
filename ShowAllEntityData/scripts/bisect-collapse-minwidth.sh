#!/bin/bash
# Runtime bisect for the collapsable-column min-width ratchet.
#
# Swaps ShowAllEntityData.user.js for the version at a given commit, runs the
# live probe against the reported release, and reports whether th.style.minWidth
# grows across repeated sort clicks. The probe must run LIVE: the ratchet's sign
# depends on MusicBrainz's own td/ul padding, which a saved fixture does not carry.
#
#   bash scripts/bisect-collapse-minwidth.sh <commit> [<commit> ...]
set -u
cd "$(dirname "$0")/.."
SRC=ShowAllEntityData.user.js
BK=$(mktemp)
cp "$SRC" "$BK"
trap 'cp "$BK" "$SRC"; rm -f "$BK" tests/live/_bisect-probe.spec.js' EXIT

cat > tests/live/_bisect-probe.spec.js <<'SPEC'
'use strict';
const { test } = require('../support/test');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

const URL = 'https://musicbrainz.org/release/9d451257-ebce-44ec-aad8-b48609bfaf7a';

test('bisect probe', async ({ page }) => {
    test.setTimeout(180000);
    await loadUserscriptPage(page, { url: URL, testMode: true });
    await page.click('button[data-label="Show all Tracks for Release"]');
    await waitForRenderComplete(page, { waitForAutoResize: false, timeout: 120000 });
    await page.waitForTimeout(4000);

    const read = () => page.evaluate(() => {
        const tbl = document.querySelector('table.tbl');
        if (!tbl) return null;
        const rows = Array.from(tbl.querySelectorAll('tbody tr'));
        const out = [];
        Array.from(tbl.querySelectorAll('thead tr:first-child th')).forEach((th, idx) => {
            const td = rows.map((tr) => tr.cells[idx])
                .find((c) => c && c.classList.contains('mb-has-collapse-toggle'));
            if (!td) return;
            out.push(`${th.dataset.colName || th.textContent.trim().slice(0, 18)}=${parseFloat(th.style.minWidth) || 0}`);
        });
        return out;
    });

    const seen = [];
    for (let i = 1; i <= 4; i++) {
        await page.locator('.sort-icon-btn', { hasText: '▲' }).first().click();
        await page.waitForTimeout(2500);
        seen.push(await read());
    }
    // eslint-disable-next-line no-console
    console.log('ARM-RESULT ' + JSON.stringify(seen));
});
SPEC

for c in "$@"; do
    echo "######################## arm: $c  ($(git log -1 --format='%ad %s' --date=short "$c" | cut -c1-70))"
    if ! git show "$c:ShowAllEntityData/ShowAllEntityData.user.js" > "$SRC" 2>/dev/null; then
        git show "$c:$SRC" > "$SRC" || { echo "  cannot extract userscript at $c"; continue; }
    fi
    npx playwright test tests/live/_bisect-probe.spec.js --project=chromium-live \
        --reporter=list 2>&1 | grep -E 'ARM-RESULT|passed|failed|Error:' | head -6
done
