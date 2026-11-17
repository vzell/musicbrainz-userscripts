'use strict';
/**
 * Playwright config for the scripts/probe-sl-*.probe.js probes only (a probe,
 * not a spec: it asserts nothing, it prints). Run:
 *   npx playwright test -c scripts/probe-sl-sticky-head.config.js
 */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: '.',
    testMatch: 'probe-sl-*.probe.js',
    reporter: [['list']],
    timeout: 120000,
    workers: 1,
});
