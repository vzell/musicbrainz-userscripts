// Builds tests/fixtures/user-ratings-multigroup.html: the real native
// /user/vzell/ratings page (debug/user-rating-initial.html), with the
// userscript's own previously-injected toolbar stripped back out so the
// fixture is a pristine native capture — mirrors how
// tests/snapshots/release-tracks/raw.html feeds release-tracks-ms-length.html,
// except that capture predates this script's own button injection.
//
// Used by tests/fixtures/user-ratings-multigroup.spec.js to cover two real
// bugs, both requiring MULTIPLE simultaneous entity-type sections on one
// page load (Artist/Event/Label/Place/Recording/Release group/Work ratings):
//   1. The CAA/EAA hover tooltip crashing (TypeError on
//      features.extractMainColumn.toLowerCase when extractMainColumn is the
//      numeric-index form user-ratings uses).
//   2. The 📊 "Date info - Decade/Month" dropdown sections missing on the
//      "Event ratings" table's Date column, because activeSyntheticColumnExtractors
//      reflected whichever OTHER group's entityFeatures rendered last.
const { chromium } = require('playwright');
const fs = require('fs');

const SRC = 'debug/user-rating-initial.html';
const OUT = 'tests/fixtures/user-ratings-multigroup.html';

(async () => {
    const html = fs.readFileSync(SRC, 'utf-8');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    const removed = await page.evaluate(() => {
        const el = document.getElementById('mb-show-all-controls-container');
        if (el) el.remove();
        return !!el;
    });
    console.log('removed injected toolbar:', removed);

    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    await browser.close();

    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>vzell - Ratings - MusicBrainz</title>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
    fs.writeFileSync(OUT, doc);
    console.log('wrote', OUT, doc.length, 'bytes');
})().catch(e => { console.error(e); process.exit(1); });
