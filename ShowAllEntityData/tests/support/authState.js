'use strict';

/**
 * Shared accessor for the saved MusicBrainz session
 * (`playwright/.auth/vzell.json`, written by `npm run auth:login`).
 *
 * Every consumer used to inline the same test:
 *
 *   fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {}
 *
 * which asks only whether the FILE exists, never whether the session inside
 * it is still valid. An expired session is not an error — Playwright loads
 * the cookies, MusicBrainz rejects them, and the page renders LOGGED OUT —
 * so a capture run silently produces baselines whose header chrome ("Log
 * in"/"Create account", UTC instead of the account's timezone, Subscribe
 * instead of Unsubscribe) diffs against every logged-in baseline on disk.
 * That reads as "the script changed something" when nothing changed, and it
 * cost a real debugging detour once already (see
 * `tests/snapshots/registry.org`'s series-releases row).
 *
 * `musicbrainz_server_session` is the cookie that actually decides it.
 * A valid `remember_login` alongside an expired session cookie is NOT
 * sufficient — verified against the live site: the page still came back
 * logged out. So that is the one this module keys on, while still reporting
 * any other expired cookie for context.
 */

const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', '..', 'playwright', '.auth', 'vzell.json');

/** The cookie whose validity determines whether MusicBrainz treats us as logged in. */
const SESSION_COOKIE = 'musicbrainz_server_session';

/**
 * Inspects the saved session file without throwing on any of the ways it can
 * be absent or malformed.
 *
 * @param {string} [filePath=AUTH_FILE]
 *   Overridable purely so this can be exercised against a synthetic expired
 *   session without moving the developer's real one out of the way.
 * @returns {{
 *   file: string,
 *   present: boolean,
 *   readable: boolean,
 *   sessionCookie: ?{name: string, expires: number, expired: boolean, expiresAt: ?string},
 *   expiredCookies: string[],
 *   usable: boolean,
 *   reason: ?string
 * }}
 *   `usable` is true only when the file parses AND its session cookie has not
 *   expired. `reason` is a human-readable explanation whenever it is false.
 */
function inspectAuthState(filePath = AUTH_FILE) {
    const base = {
        file: filePath, present: false, readable: false,
        sessionCookie: null, expiredCookies: [], usable: false, reason: null,
    };

    if (!fs.existsSync(filePath)) {
        return { ...base, reason: 'no saved session file' };
    }

    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        return { ...base, present: true, reason: `session file is not valid JSON (${err.message})` };
    }

    const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
    const nowSec = Date.now() / 1000;

    // Playwright writes -1 for a session cookie (one that lives only as long as
    // the browser process). Such a cookie never "expires" on the clock, so it is
    // never counted as expired here.
    const isExpired = (c) => typeof c.expires === 'number' && c.expires > 0 && c.expires < nowSec;

    const expiredCookies = cookies.filter(isExpired).map((c) => c.name);
    const sc = cookies.find((c) => c.name === SESSION_COOKIE);

    const sessionCookie = sc
        ? {
            name: sc.name,
            expires: sc.expires,
            expired: isExpired(sc),
            expiresAt: (typeof sc.expires === 'number' && sc.expires > 0)
                ? new Date(sc.expires * 1000).toISOString()
                : null,
        }
        : null;

    let reason = null;
    if (!sessionCookie) {
        reason = `session file has no "${SESSION_COOKIE}" cookie`;
    } else if (sessionCookie.expired) {
        reason = `"${SESSION_COOKIE}" expired ${sessionCookie.expiresAt}`;
    }

    return {
        ...base,
        present: true,
        readable: true,
        sessionCookie,
        expiredCookies,
        usable: reason === null,
        reason,
    };
}

/**
 * Builds the `newContext()` / project `use` fragment for the saved session,
 * warning on stderr when the file is present but its session has expired.
 *
 * The expired file is still passed through rather than dropped: that keeps
 * behaviour identical to what every call site did before, so this change can
 * only ADD a warning, never alter which pages a run can reach. The warning is
 * the whole point — silence was the bug.
 *
 * @param {{ label?: string, silent?: boolean }} [opts]
 *   `label` names the caller in the warning (e.g. 'capture-snapshots').
 *   `silent` suppresses output (for callers that report state themselves).
 * @returns {{ storageState?: string }}
 *   Spreadable into `browser.newContext(...)` or a Playwright project's `use`.
 */
function authStorageState(opts = {}) {
    const { label = 'auth', silent = false } = opts;
    const state = inspectAuthState();

    if (!state.present) return {};

    if (!state.usable && !silent) {
        const extra = state.expiredCookies.length
            ? ` (expired cookies: ${state.expiredCookies.join(', ')})`
            : '';
        console.warn(
            `\n⚠  [${label}] Saved MusicBrainz session is NOT usable: ${state.reason}${extra}.\n` +
            `   The run will continue LOGGED OUT. Pages render different header chrome when\n` +
            `   logged out, so snapshot baselines captured now will diff against logged-in\n` +
            `   ones even though nothing in the userscript changed.\n` +
            `   Fix: npm run auth:login   (file: ${state.file})\n`
        );
    }

    // A file that failed to parse cannot be handed to Playwright at all.
    return state.readable || !state.present ? { storageState: state.file } : {};
}

module.exports = { AUTH_FILE, SESSION_COOKIE, inspectAuthState, authStorageState };
