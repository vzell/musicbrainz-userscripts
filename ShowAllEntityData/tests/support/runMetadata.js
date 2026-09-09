'use strict';

/**
 * Run provenance shared by every capture script under `tests/support/`.
 *
 * CLAUDE.md's rule is "record the machine and the wall-clock time, every
 * timing, every time", and the filename convention that goes with it
 * (`<label>-<version>-<capturedAt>[-<hostname>]`). Both were implemented
 * inside `capture-interaction-perf.js` and were not reachable from anywhere
 * else, so a second capture script would have had to copy them — which is
 * exactly how the two halves of a convention drift apart. They live here now
 * and that script requires them from here.
 *
 * Nothing in this module is specific to what is being measured: it answers
 * "which script, which host, which moment, under what filename", and says
 * nothing about counts or timings.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const USERSCRIPT_PATH = path.join(REPO_ROOT, 'ShowAllEntityData.user.js');

/**
 * The userscript's own `// @version`, verbatim (e.g. `9.99.1049+2026-09-08`).
 *
 * @returns {string} the version string, or `'unknown'` if the header has none.
 */
function readScriptVersion() {
    const header = fs.readFileSync(USERSCRIPT_PATH, 'utf8').slice(0, 2000);
    const m = header.match(/\/\/ @version\s+(\S+)/);
    return m ? m[1] : 'unknown';
}

/**
 * Whether a Claude Code session has run on this box since it last booted —
 * distinct from `claudeResident`, which only sees one running RIGHT NOW.
 *
 * This closes a gap `tests/MEASUREMENTS.org`'s "PARTLY ANSWERED" arm A hit:
 * `claudeResident: {count: 0}` cannot tell "never ran a session" apart from
 * "ran one, then closed it" — and arm E (18 days of uptime with `claude`
 * never run at all, to isolate plain uptime accumulation from session
 * residue) needs exactly that distinction on every capture in its series, not
 * just remembered by the person running it.
 *
 * Every Claude Code session creates a directory under `/tmp/claude-<uid>/`
 * (this repo's own scratchpad path lives under one). If anything under
 * `/tmp/claude-*` has an mtime after boot, a session ran since the last
 * reboot, whether or not one is resident now.
 *
 * Linux-only, like `claudeResident` below (BSD/macOS `find` has no
 * `-newermt`) — `null` on any other platform or if the check itself fails,
 * kept distinct from `false` ("checked, found nothing since boot").
 *
 * @param {number} uptimeHours
 * @returns {boolean|null}
 */
function claudeSinceBoot(uptimeHours) {
    if (os.platform() !== 'linux') return null;
    const bootEpochSeconds = Math.floor(Date.now() / 1000 - uptimeHours * 3600);
    try {
        const out = execSync(
            `find /tmp/claude-* -newermt '@${bootEpochSeconds}' -print -quit 2>/dev/null`,
            { stdio: ['ignore', 'pipe', 'ignore'] },
        ).toString().trim();
        return out.length > 0;
    } catch (err) {
        // `find` exits 1 with empty stdout both when no `/tmp/claude-*`
        // directory exists at all (the glob expands to nothing) and when one
        // exists but nothing inside is newer than boot — either way that IS
        // "no session since boot", not a failed check. Same reasoning as
        // claudeResident's own `ps` check below.
        return (err.status === 1 && !String(err.stdout || '').trim()) ? false : null;
    }
}

/**
 * Host conditions that are not hardware but move timings anyway: how long the
 * box has been up, and whether a Claude Code session is resident while the
 * run happens.
 *
 * Both exist because of a real gap. `petri` measured 1735 ms on the global
 * filter on the morning of 2026-09-07 and ~3100 ms for the SAME script version
 * afterwards, with no reboot in between (18 days of uptime by the time it was
 * noticed). A separate host, `NB-3641`, measured ~1.8x faster at an identical
 * script version — and was reportedly freshly rebooted, which nothing in its
 * JSON could confirm. A later `petri` arm taken 10 minutes after a reboot came
 * back 1.37-1.77x faster, which settled reboot recency as a real mechanism and
 * killed the resident-session theory. Both fields stay recorded anyway: the
 * mechanism reproduces, but no arm should ever again be unable to say what
 * state its host was in.
 *
 * `claudeResident` is `null` when the check could not run at all (`ps -C` is
 * Linux-shaped and unsupported on BSD/macOS `ps`) — deliberately distinct from
 * `{count: 0}`, which means "checked, none running", per CLAUDE.md's "mark an
 * unknown as unknown rather than inferring it". `claudeSinceBoot` is the same
 * distinction one level up — see that function's own JSDoc.
 *
 * @returns {{uptimeHours: number,
 *   claudeResident: {count: number, oldestSessionHours: number|null}|null,
 *   claudeSinceBoot: boolean|null}}
 */
function hostRuntimeState() {
    const uptimeHours = Math.round(os.uptime() / 360) / 10;
    let claudeResident = null;
    try {
        const out = execSync('ps -C claude -o etimes=', {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim();
        const ages = out ? out.split('\n').map((n) => parseInt(n, 10)).filter(Number.isFinite) : [];
        claudeResident = {
            count: ages.length,
            oldestSessionHours: ages.length ? Math.round(Math.max(...ages) / 360) / 10 : null,
        };
    } catch (err) {
        // `ps -C` exits 1 with empty output when nothing matches — that is a
        // real "none running" answer, not a failed check. Anything else means
        // the check itself did not work, which stays unknown.
        claudeResident = (err.status === 1 && !String(err.stdout || '').trim())
            ? { count: 0, oldestSessionHours: null }
            : null;
    }
    return { uptimeHours, claudeResident, claudeSinceBoot: claudeSinceBoot(uptimeHours) };
}

/**
 * Identifies the machine a run happened on, so absolutes are never compared
 * across machines by accident.
 *
 * This exists because two `main` captures three script versions apart were
 * 1.5-2x apart, and "which machine was that on" could not be answered from the
 * committed JSON at all — the gap got attributed to machine state, then to
 * load, before anyone checked. Both turned out to be guesses.
 *
 * @returns {{hostname: string, platform: string, release: string, cpus: number,
 *   totalMemGb: number, node: string, playwright: string, uptimeHours: number,
 *   claudeResident: {count: number, oldestSessionHours: number|null}|null,
 *   claudeSinceBoot: boolean|null}}
 */
function machineInfo() {
    let playwright = 'unknown';
    try {
        playwright = require('playwright/package.json').version;
    } catch { /* leave unknown */ }
    return {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        cpus: os.cpus().length,
        totalMemGb: Math.round(os.totalmem() / 1024 ** 3),
        node: process.version,
        playwright,
        ...hostRuntimeState(),
    };
}

/**
 * Filesystem-safe form of an arbitrary string for use inside a filename:
 * anything other than letters/digits/dot/underscore/hyphen becomes `-`.
 *
 * @param {string} s
 * @returns {string}
 */
function sanitizeForFilename(s) {
    return s.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/**
 * `os.hostname()` can come back empty, `localhost`, or some other
 * non-identifying placeholder depending on the environment. Only a
 * meaningful hostname earns a place in the filename — anything else is
 * left out rather than baked in as a false identifier, per CLAUDE.md's
 * "mark an unknown host as unknown rather than inferring it".
 *
 * @param {string} hostname
 * @returns {string|null}
 */
function hostnameForFilename(hostname) {
    if (!hostname || /^(localhost|unknown)$/i.test(hostname)) return null;
    return sanitizeForFilename(hostname);
}

/**
 * Filename form of the userscript version: the `M.MM.NNN` number alone,
 * without the `+YYYY-MM-DD` release stamp the header carries.
 *
 * That stamp is the version's own SHIP date, which is not the capture date
 * and reads as one. Sanitizing turns `9.99.1049+2026-09-08` into
 * `9.99.1049-2026-09-08`, so a name that already ends in `<capturedAt>`
 * carried two same-shaped dates. The full version is not lost: it stays
 * verbatim in the JSON's own `scriptVersion` field.
 *
 * @param {string} version
 * @returns {string}
 */
function versionForFilename(version) {
    return sanitizeForFilename(version.split('+')[0]);
}

/** @returns {string} the current git branch, or `'unknown'`. */
function readCurrentBranch() {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT }).toString().trim();
    } catch {
        return 'unknown';
    }
}

/**
 * Assembles the conventional archive filename stem:
 * `<prefix>-<label>-<version>-<capturedAt>[-<hostname>]`.
 *
 * The hostname segment is omitted, never guessed, when `os.hostname()` is not
 * a meaningful identifier — the branch-only naming this replaced let one
 * machine's run silently overwrite another's.
 *
 * @param {{prefix: string, label: string, version: string, capturedAt: string,
 *   hostname?: string}} parts
 * @returns {string} filename stem, without extension.
 */
function archiveFileStem({ prefix, label, version, capturedAt, hostname }) {
    const host = hostnameForFilename(hostname === undefined ? os.hostname() : hostname);
    const segments = [prefix, sanitizeForFilename(label), versionForFilename(version), capturedAt];
    if (host) segments.push(host);
    return segments.join('-');
}

module.exports = {
    REPO_ROOT,
    USERSCRIPT_PATH,
    readScriptVersion,
    hostRuntimeState,
    machineInfo,
    sanitizeForFilename,
    hostnameForFilename,
    versionForFilename,
    readCurrentBranch,
    archiveFileStem,
};
