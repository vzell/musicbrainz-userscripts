'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// /report/CollaborationRelationships doesn't follow the
// "...With(Multiple|Many)..." naming pattern the rest of the
// 'report-multiple-linked' family uses (e.g. ASINsWithMultipleReleases),
// so its match() needed an explicit REPORT_MULTIPLE_LINKED_INCLUSIONS
// entry — see ShowAllEntityData.user.js's pageDefinitions comment and
// debug/NOTES.md's "2026-09-02 — CollaborationRelationships report routed
// to report-detail instead of report-multiple-linked" entry. Before that
// fix this page fell through to the generic 'report-detail' catch-all,
// which has no group-header/empty-first-<td> merge logic, so every
// collaborator row rendered with an EMPTY "Collaboration" cell.
const REPORT_URL = 'https://musicbrainz.org/report/CollaborationRelationships';
const FIXTURE_FILE = path.join(__dirname, 'collaboration-relationships.html');

test('CollaborationRelationships: "Collaboration" column is filled from the colspan group-header row, not left empty', async ({ page }) => {
    await loadUserscriptPage(page, { url: REPORT_URL, fixtureFile: FIXTURE_FILE, testMode: true });

    // "Show all (unfiltered)" carries a non-empty overrideParams (filter=0),
    // so startFetchingProcess always re-fetches page 1 over the network
    // rather than reusing the live document — this is exactly the path
    // that runs the group-header-carry-forward logic
    // (pendingUrlLinkedGroupCell) being tested here. Same fixture content
    // as the initial navigation: the report-multiple-linked row-loop must
    // fill each empty first <td> from the preceding colspan="2" group row.
    await page.route(`${REPORT_URL}?**`, (route) => route.fulfill({ path: FIXTURE_FILE, contentType: 'text/html' }));

    await page.click('button[data-label="Show all (unfiltered)"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const rows = page.locator('table.tbl tbody tr');
    await expect(rows).toHaveCount(3);

    const rowData = [];
    for (const row of await rows.all()) {
        rowData.push({
            collaboration: (await row.locator('td').nth(0).innerText()).trim(),
            collaborator: (await row.locator('td').nth(1).innerText()).trim(),
        });
    }

    // Order-independent: assert the collaborator->collaboration mapping the
    // group-header carry-forward must produce, regardless of any default
    // column sort applied on render.
    const byCollaborator = Object.fromEntries(rowData.map((r) => [r.collaborator, r.collaboration]));

    expect(rowData.every((r) => r.collaboration.length > 0)).toBe(true);
    expect(byCollaborator["'AbsoluteGoob'"]).toBe("'AshFyre'");
    expect(byCollaborator["'CocoaBeanz'"]).toBe("'AshFyre'");
    expect(byCollaborator['Ance Krauze']).toBe('"Baltic Beach Party" zvaigžņu koris');
});
