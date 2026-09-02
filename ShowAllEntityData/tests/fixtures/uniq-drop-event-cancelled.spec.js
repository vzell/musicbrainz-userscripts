'use strict';

const { test, expect } = require('../support/test');
const path = require('path');
const { loadUserscriptPage } = require('../support/loadPage');
const { waitForRenderComplete } = require('../support/browser');

// artist-events (path.includes('/events')) shares the same 'entitycancelled'
// _eventCancelledKind family as user-ratings-type's "Events" sub-table
// (activeDefinition.type-gated — see the _eventCancelledKind derivation's
// own comment) but needs no listToTable/entityFeatures machinery, no
// GM_xmlhttpRequest mocking (its lone button carries no `params`, so
// startFetchingProcess reuses the live `document` instead of re-fetching —
// see its "use existing document" fast path) — the simplest page type this
// makeValueSynItem() code path is reachable from.
const ARTIST_EVENTS_URL = 'https://musicbrainz.org/artist/89729b97-90a3-4f84-9e88-e16f96cab350/events';
const FIXTURE_FILE = path.join(__dirname, 'artist-events-cancelled.html');

test('unique-values dropdown: the "Event info - Event cancelled" entry renders red, matching the cell\'s own native .cancelled marker', async ({ page }) => {
    await loadUserscriptPage(page, { url: ARTIST_EVENTS_URL, fixtureFile: FIXTURE_FILE, testMode: true });

    await page.click('button[data-label="Show all Events for Artist"]');
    await waitForRenderComplete(page, { waitForAutoResize: false });

    const sections = await page.evaluate(() => window.__saTest.getUniqDropSections('Event'));
    // artist-events uses the 'entitycancelled' kind (SYN_SECTION_META's
    // `entityEventCancelled` entry, "Entity info - Event cancelled") —
    // distinct from the 'eventcancelled' kind's "Event info - Event
    // cancelled" label used by tag-value/user-tag-value/user-ratings-type
    // (see _eventCancelledKind's own derivation comment). Both kinds hit
    // the same makeValueSynItem() `.cancelled`-class branch this test
    // covers; the label difference is expected, not a discrepancy.
    const cancelledSection = sections.find((s) => s.label === 'Entity info - Event cancelled');

    expect(cancelledSection).toBeTruthy();
    expect(cancelledSection.items).toHaveLength(1);
    expect(cancelledSection.items[0].count).toBe(1);
    expect(cancelledSection.items[0].label).toContain('cancelled');
    // The load-bearing assertion: the entry reuses MusicBrainz's own native
    // `.cancelled` CSS class (red styling) instead of rendering as plain text.
    expect(cancelledSection.items[0].cancelled).toBe(true);

    // A control from a different section confirms the `cancelled` flag is
    // scoped to this one entry family, not accidentally applied everywhere.
    const otherSection = sections.find((s) => s.label !== 'Event info - Event cancelled');
    expect(otherSection).toBeTruthy();
    expect(otherSection.items.every((i) => i.cancelled === false)).toBe(true);
});
