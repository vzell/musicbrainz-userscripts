// ==UserScript==
// @name         VZ: MB: Inline Recording Tracks Toggle
// @namespace    https://github.com/vzell/mb-userscripts
// @version      1.0.1+2026-06-19
// @description  Toggle buttons to show/hide inline recording track info and to expand/collapse all mediums. Based on ROpdebee's mb_qol_inline_recording_tracks.
// @author       vzell
// @license      MIT
// @homepageURL  https://github.com/vzell/musicbrainz-userscripts
// @supportURL   https://github.com/vzell/musicbrainz-userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/vzell/mb-userscripts/master/MB_InlineRecordingTracks/MB_InlineRecordingTracks.user.js
// @updateURL    https://raw.githubusercontent.com/vzell/mb-userscripts/master/MB_InlineRecordingTracks/MB_InlineRecordingTracks.user.js
// @match        *://*.musicbrainz.eu/release/*
// @match        *://*.musicbrainz.org/release/*
// @exclude      */release/*/*
// @exclude      */release/add
// @run-at       document-end
// @grant        none
// ==/UserScript==

/*
 * VZ: MB: Inline Recording Tracks Toggle
 *
 * Extends ROpdebee's "MB: QoL: Inline all recording's tracks on releases" with a
 * proper toggle: the first click loads and displays track info for every recording
 * on the page; subsequent clicks alternately hide and show the already-fetched data
 * without re-fetching.
 *
 * Original script: https://github.com/ROpdebee/mb-userscripts
 */

(function () {
    'use strict';

    let releaseMbid = location.pathname.match(/\/release\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (releaseMbid) {
        releaseMbid = releaseMbid[1];
    }

    /** Whether the inline track-info divs are currently visible. */
    let trackInfoVisible = false;

    // -----------------------------------------------------------------------
    // Fetch helpers (unchanged from ROpdebee's original)
    // -----------------------------------------------------------------------

    /**
     * Split an array into chunks of at most `chunkSize` elements.
     * @param {Array}  arr
     * @param {number} chunkSize
     * @returns {Array[]}
     */
    function splitChunks(arr, chunkSize) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
            chunks.push(arr.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Rate-limited fetch queue: at most one in-flight request at a time,
     * retrying failed requests automatically.
     * @param {string} url
     * @returns {Promise<Response>}
     */
    const queuedFetch = (() => {
        const fetchQueue = [];

        setInterval(async () => {
            let url, resolve;
            try {
                [url, resolve] = fetchQueue.shift();
            } catch {
                return;
            }
            try {
                const resp = await fetch(url);
                if (!resp.ok) fetchQueue.push([url, resolve]);
                else resolve(resp);
            } catch {
                fetchQueue.push([url, resolve]);
            }
        }, 500);

        return function (url) {
            return new Promise((resolve) => fetchQueue.push([url, resolve]));
        };
    })();

    /**
     * Fetch recording metadata for a batch of recording IDs via the MB web service.
     * @param {string[]} rids - Recording MBIDs.
     * @returns {Promise<Object>} Map of recording MBID → recording object.
     */
    async function loadRecordingInfo(rids) {
        const query = rids.map((rid) => 'rid:' + rid).join(' OR ');
        const url = location.origin + '/ws/2/recording?fmt=json&query=' + query;
        const resp = await (await queuedFetch(url)).json();
        const perRecId = {};
        resp.recordings.forEach((rec) => { perRecId[rec.id] = rec; });
        return perRecId;
    }

    /**
     * Build an anchor to a specific track position within a medium.
     * @param {Object} track
     * @param {number} mediumPosition
     * @param {number} mediumTrackCount
     * @returns {string} HTML string.
     */
    function getTrackIndex(track, mediumPosition, mediumTrackCount) {
        return `<a href="/track/${track.id}" title="track ${track.number} of ${mediumTrackCount}">#${mediumPosition}.${track.number}</a>`;
    }

    /**
     * Collect all track-position anchors across all media for a recording.
     * @param {Object[]} media
     * @returns {string} Comma-separated HTML anchors.
     */
    function getTrackIndices(media) {
        return media
            .flatMap((medium) =>
                medium.track.map((track) =>
                    getTrackIndex(track, medium.position, medium['track-count'])
                )
            )
            .join(', ');
    }

    /**
     * Build an anchor to a release, with optional disambiguation comment.
     * @param {Object} release
     * @returns {string} HTML string.
     */
    function getReleaseName(release) {
        const dateTitle = release.date ? `released on ${release.date}` : 'unknown release date';
        const disambig = release.disambiguation
            ? ` <span class="comment">(${release.disambiguation})</span>`
            : '';
        return `<a href="/release/${release.id}" title="${dateTitle}">${release.title}</a>${disambig}`;
    }

    /**
     * Format one release as an "appears on" row, dimming the current release.
     * @param {Object} release
     * @returns {string} HTML string for a `<dl class="ars">` element.
     */
    function formatRow(release) {
        let rowHead = '<dl class="ars"';
        if (releaseMbid === release.id) {
            rowHead += ' style="opacity: .6; filter: contrast(.2);" title="current release"';
        }
        return `${rowHead}><dt>appears on:</dt><dd>${getReleaseName(release)} (${getTrackIndices(release.media)}) <span class="comment">${toIntelligibleTime(release.media[0].track[0].length)}</span></dd></dl>`;
    }

    /**
     * Sort key for releases: date → title → disambiguation → medium → track.
     * @param {Object} release
     * @returns {string}
     */
    function releaseOrderingString(release) {
        return `[${release.date || ''}] ${release.title} ${release.disambiguation || ''} ${release.media[0].position.toString().padStart(4, '0')}.${release.media[0].track[0].number.toString().padStart(10, '0')}`;
    }

    /**
     * @param {Object} a
     * @param {Object} b
     * @returns {number}
     */
    function compareReleases(a, b) {
        return releaseOrderingString(a) < releaseOrderingString(b) ? -1 : 1;
    }

    /**
     * Insert the "appears on" block into a recording's table cell.
     * Inserts before any existing `.ars` div, or appends at the end.
     * Skips cells that already have a `.ars.ROpdebee_inline_tracks` div.
     * @param {Element} recordingTd
     * @param {Object}  recordingInfo
     */
    function insertRows(recordingTd, recordingInfo) {
        const rowsHtml = recordingInfo.releases
            .sort(compareReleases)
            .map(formatRow)
            .join('\n');
        const block = `<div class="ars ROpdebee_inline_tracks">\n${rowsHtml}\n</div>`;
        const existingArs = recordingTd.querySelector('div.ars');
        if (existingArs) {
            existingArs.insertAdjacentHTML('beforebegin', block);
        } else {
            recordingTd.insertAdjacentHTML('beforeend', block);
        }
    }

    /**
     * Fetch recording info for all recordings whose cells do not yet have a
     * `.ars.ROpdebee_inline_tracks` block and insert the results.
     */
    function loadAndInsert() {
        const recAnchors = document.querySelectorAll(
            'table.medium td > a[href^="/recording/"], ' +
            'table.medium td > span > a[href^="/recording/"], ' +
            'table.medium td > span > span > a[href^="/recording/"]'
        );
        const todo = [...recAnchors]
            .map((a) => [a.closest('td'), a.href.split('/recording/')[1]])
            .filter(([td]) => !td.querySelector('div.ars.ROpdebee_inline_tracks'));

        splitChunks(todo, 20).forEach(async (chunk) => {
            const recInfo = await loadRecordingInfo(chunk.map(([, recId]) => recId));
            chunk.forEach(([td, recId]) => insertRows(td, recInfo[recId]));
        });
    }

    // -----------------------------------------------------------------------
    // Toggle logic
    // -----------------------------------------------------------------------

    /**
     * Make all already-inserted `.ars.ROpdebee_inline_tracks` blocks visible
     * and fetch/insert any that have not been loaded yet.
     */
    function showTrackInfo() {
        document.querySelectorAll('div.ars.ROpdebee_inline_tracks').forEach((el) => {
            el.style.display = '';
        });
        loadAndInsert();
    }

    /**
     * Hide all `.ars.ROpdebee_inline_tracks` blocks without removing them,
     * so they can be shown again without re-fetching.
     */
    function hideTrackInfo() {
        document.querySelectorAll('div.ars.ROpdebee_inline_tracks').forEach((el) => {
            el.style.display = 'none';
        });
    }

    /**
     * Toggle the visibility of inline recording track info and update the button label.
     * @param {HTMLButtonElement} button - The toggle button element.
     */
    function toggleTrackInfo(button) {
        if (trackInfoVisible) {
            hideTrackInfo();
            button.textContent = 'Display track info for recordings';
            trackInfoVisible = false;
        } else {
            showTrackInfo();
            button.textContent = 'Hide track info for recordings';
            trackInfoVisible = true;
        }
    }

    // -----------------------------------------------------------------------
    // Medium expand/collapse toggle
    // -----------------------------------------------------------------------

    /**
     * Return true if medium track rows are currently expanded (visible).
     * Checks the computed display of the first medium table's tbody.
     * @returns {boolean}
     */
    function areMediumsExpanded() {
        const tbody = document.querySelector('table.tbl.medium tbody');
        return tbody ? window.getComputedStyle(tbody).display !== 'none' : true;
    }

    /**
     * Replace the "Expand all mediums" and "Collapse all mediums" buttons with a
     * single toggle button at the same DOM position.
     *
     * The originals are hidden (not removed) so MB's own expand/collapse logic
     * can still be invoked via .click(). The " | " text node that separated the
     * two original buttons is removed — a text node between two hidden elements
     * still renders, which would produce a dangling double-separator.
     */
    function installMediumToggle() {
        const expandBtn   = document.querySelector('#expand-all-mediums');
        const collapseBtn = document.querySelector('#collapse-all-mediums');
        if (!expandBtn || !collapseBtn) return;

        let mediumsExpanded = areMediumsExpanded();

        const toggle = document.createElement('button');
        toggle.classList.add('btn-link');
        toggle.type = 'button';
        toggle.textContent = mediumsExpanded ? 'Collapse all mediums' : 'Expand all mediums';

        toggle.addEventListener('click', () => {
            if (mediumsExpanded) {
                collapseBtn.click();
                toggle.textContent = 'Expand all mediums';
                mediumsExpanded = false;
            } else {
                expandBtn.click();
                toggle.textContent = 'Collapse all mediums';
                mediumsExpanded = true;
            }
        });

        // Place the toggle at the expand button's position.
        expandBtn.before(toggle);

        // Hide both originals; they must remain in the DOM so .click() still works.
        expandBtn.hidden = true;
        collapseBtn.hidden = true;

        // Remove the " | " text node that separated the two now-hidden buttons.
        const sepBetween = collapseBtn.previousSibling;
        if (sepBetween && sepBetween.nodeType === Node.TEXT_NODE &&
                sepBetween.textContent.trim() === '|') {
            sepBetween.remove();
        }
    }

    // -----------------------------------------------------------------------
    // React hydration guard (unchanged from ROpdebee's original)
    // -----------------------------------------------------------------------

    /**
     * Run `callback` once the given element's React component has hydrated.
     * MBS fires a custom `mb-hydration` event on each component root after hydration.
     * @param {Element}  element
     * @param {Function} callback
     */
    function onReactHydrated(element, callback) {
        const alreadyHydrated = Object.keys(element).some(
            (key) => key.startsWith('_reactListening') && element[key]
        );

        if (alreadyHydrated) {
            callback();
        } else if (
            window.__MB__.DBDefs.GIT_BRANCH === 'production' &&
            window.__MB__.DBDefs.GIT_SHA === '923237cf73'
        ) {
            // Compatibility shim for production versions that predate the mb-hydration event.
            window.addEventListener('load', callback);
        } else {
            element.addEventListener('mb-hydration', callback);
        }
    }

    // -----------------------------------------------------------------------
    // Entry point
    // -----------------------------------------------------------------------

    onReactHydrated(document.querySelector('.tracklist-and-credits'), () => {
        const button = document.createElement('button');
        button.classList.add('btn-link');
        button.type = 'button';
        button.textContent = 'Display track info for recordings';
        button.addEventListener('click', () => toggleTrackInfo(button));

        document.querySelector('span#medium-toolbox')
            .firstChild.before(button, ' | ');

        installMediumToggle();
    });

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    /**
     * Format a duration in milliseconds as a human-readable time string (m:ss or h:mm:ss).
     * Returns "?:??" for zero, null, or undefined values.
     * @param {number|string} _ms
     * @returns {string}
     */
    function toIntelligibleTime(_ms) {
        const ms = typeof _ms === 'string' ? parseInt(_ms, 10) : _ms;
        if (ms > 0) {
            const d = new Date(ms);
            const hh = d.getUTCHours();
            const mm = d.getUTCMinutes().toString().padStart(2, '0');
            const ss = d.getUTCSeconds().toString().padStart(2, '0');
            const msStr = d.getUTCMilliseconds() > 0
                ? '.' + d.getUTCMilliseconds().toString().padStart(3, '0')
                : '';
            return (hh > 0 ? `${hh}:${mm}` : d.getUTCMinutes()) + `:${ss}${msStr}`;
        }
        return '?:??';
    }

})();
