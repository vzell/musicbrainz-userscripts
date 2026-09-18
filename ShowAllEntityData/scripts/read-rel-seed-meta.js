'use strict';

/**
 * Prints the metadata of a captured `rel-ws2` perf seed (entityType, entity
 * count, url-rel total, capture date) plus a couple of sample ckeys.
 *
 * Written because the seeded `--rel-arm=expanded` run started rendering 0
 * icons on BOTH `main` (9.99.1092) and the feature branch, and the first
 * question is whether the seed's own key space still matches what the
 * userscript looks up (`${entityType}:${mbid}`).
 *
 *   node scripts/read-rel-seed-meta.js [seedPath]
 */

const path = require('path');
const { readSeed, seedPathFor } = require('../tests/support/relWs2Seed');

const seedPath = process.argv[2] || seedPathFor('artist-releases-dylan');
const seed = readSeed(seedPath);
const mbids = Object.keys(seed.data);

console.log('seedPath      :', path.relative(process.cwd(), seedPath));
console.log('entityType    :', seed.entityType);
console.log('capturedAt    :', seed.capturedAt);
console.log('entityCount   :', seed.entityCount, '(actual keys:', mbids.length + ')');
console.log('urlRelTotal   :', seed.urlRelTotal);
console.log('sample ckeys  :', mbids.slice(0, 3).map((m) => `${seed.entityType}:${m}`).join('  '));
const withRels = mbids.filter((m) => (seed.data[m].relations || []).length).length;
console.log('entities with relations:', withRels);
