'use strict';

// The WS/2 event lookups of the "#" cell's stacked event card
// (_eventRgEventStack(), sa_event_rg_event_card, on by default) on the
// Brixton Night fixture, answered from the real captures
// (scripts/probe-event-card-fixtures.py), so a spec that hovers a "#" cell
// never reaches the network. An event without a capture answers 404.

const fs = require('fs');
const path = require('path');

/** Captured event answers by MBID. */
const EVENT_FIXTURES = {
    '066b48dd-4246-4553-ba5d-94fd2d29115a': 'ws2-pop-event-brixton-0424.json',
    '0ee722a0-00b8-45a4-ba21-f4d549ce29bd': 'ws2-pop-event-rah-0422.json',
};

/**
 * Routes `/ws/2/event/<MBID>?…` for the whole context and records each
 * lookup's MBID.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{status?: function(string): ?number}} [opts] - `status(mbid)`: a
 *   status to answer instead (a failure), or null for the capture.
 * @returns {Promise<string[]>} The looked-up MBIDs, in order (live array).
 */
async function routeEventLookups(page, { status = null } = {}) {
    const lookups = [];
    await page.context().route(/\/ws\/2\/event\/[0-9a-f-]{36}\?/, (route) => {
        const mbid = new URL(route.request().url()).pathname.split('/').pop();
        lookups.push(mbid);
        const forced = status ? status(mbid) : null;
        const file = EVENT_FIXTURES[mbid];
        if (forced || !file) return route.fulfill({ status: forced || 404, contentType: 'application/json', body: '{}' });
        return route.fulfill({
            status: 200, contentType: 'application/json',
            body: fs.readFileSync(path.join(__dirname, '..', 'fixtures', file), 'utf8'),
        });
    });
    return lookups;
}

module.exports = { routeEventLookups, EVENT_FIXTURES };
