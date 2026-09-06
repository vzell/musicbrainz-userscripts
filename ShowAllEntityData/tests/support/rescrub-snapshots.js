'use strict';

/**
 * Snapshot re-scrub runner — standalone Node script (not a Playwright test).
 *
 *   node tests/support/rescrub-snapshots.js            # dry run: report only
 *   node tests/support/rescrub-snapshots.js --apply
 *   node tests/support/rescrub-snapshots.js --apply --only=release-tracks
 *
 * Re-applies `scrub()` to every committed baseline under `tests/snapshots/`.
 *
 * WHY THIS EXISTS. `capture-snapshots.js` scrubs a capture on its way to disk,
 * then compares it against the committed file AS IT STANDS. So the moment a new
 * scrub rule is added, every baseline captured under the old rules is stale:
 * the fresh capture has the new region normalised, the committed one still has
 * the raw value, and the runner reports "changed" for a difference that is
 * purely the rule itself. Left alone, that turns the very verdict the rule was
 * meant to make trustworthy back into noise.
 *
 * The obvious alternative — re-capturing each affected pageType live — is worse
 * for this specific job, and not just slower. A live re-capture is a fresh fetch
 * of a page real editors keep changing, so it folds unrelated MusicBrainz drift
 * (and whatever the session's login state happens to be) into a commit whose
 * entire intended content is "one scrub rule now applies". Re-scrubbing on disk
 * is a pure text transformation and produces exactly, and only, what the new
 * rule does — which is also what makes the resulting diff reviewable.
 *
 * It imports `scrub` from `./snapshot` rather than reimplementing the rules, so
 * this stays correct for whatever rule is added next with no edit here. Being
 * idempotent, it is safe to run at any time: with nothing to do it reports
 * every file unchanged.
 *
 * @see ./snapshot.js `GENERIC_SCRUB_RULES`
 * @see ./capture-snapshots.js
 */

const fs = require('fs');
const path = require('path');

const { scrub } = require('./snapshot');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'snapshots');

/**
 * @param {string[]} argv
 * @returns {{ apply: boolean, only: ?string }}
 */
function parseArgs(argv) {
    const onlyArg = argv.find((a) => a.startsWith('--only='));
    return {
        apply: argv.includes('--apply'),
        only: onlyArg ? onlyArg.slice('--only='.length) : null,
    };
}

/**
 * Every committed baseline, as `{pageType, file}` pairs.
 *
 * The pageType is the DIRECTORY name, which is what `scrub()` takes as its
 * second argument to pick up any `PAGE_TYPE_SCRUB_RULES` entry — so a
 * per-pageType rule is honoured here exactly as it is at capture time.
 *
 * Picks up every `.html` in each directory rather than a hardcoded
 * raw/rendered pair: `artist-events` also carries `post-filter.html` and
 * `post-sort.html`, and those are captured through the same `scrub()` call.
 *
 * @returns {Array<{pageType: string, file: string}>}
 */
function collectSnapshots() {
    if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
    const out = [];
    for (const entry of fs.readdirSync(SNAPSHOTS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(SNAPSHOTS_DIR, entry.name);
        for (const file of fs.readdirSync(dir).sort()) {
            if (file.endsWith('.html')) out.push({ pageType: entry.name, file: path.join(dir, file) });
        }
    }
    return out;
}

(() => {
    const { apply, only } = parseArgs(process.argv.slice(2));
    const snapshots = collectSnapshots().filter((s) => !only || s.pageType === only);

    if (!snapshots.length) {
        console.log(only ? `No snapshots found for pageType "${only}".` : 'No snapshots found.');
        return;
    }

    let changed = 0;
    for (const { pageType, file } of snapshots) {
        const before = fs.readFileSync(file, 'utf8');
        const after = scrub(before, pageType);
        const rel = path.relative(path.join(__dirname, '..', '..'), file);
        if (before === after) {
            console.log(`  unchanged  ${rel}`);
            continue;
        }
        changed++;
        const delta = after.length - before.length;
        console.log(`  RESCRUBBED ${rel}  (${before.length} -> ${after.length} bytes, ${delta >= 0 ? '+' : ''}${delta})`);
        if (apply) fs.writeFileSync(file, after);
    }

    console.log(
        `\n${changed} of ${snapshots.length} snapshot file(s) ${apply ? 'rewritten' : 'would change'}.`
    );
    if (changed && !apply) console.log('Dry run — nothing written. Re-run with --apply.');
    if (changed && apply) {
        console.log('Now re-run capture-snapshots.js for one affected pageType: it must report');
        console.log('"unchanged", which is what proves the on-disk rewrite matches a real capture.');
    }
})();
