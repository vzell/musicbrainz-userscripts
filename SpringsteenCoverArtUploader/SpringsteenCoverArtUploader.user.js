// ==UserScript==
// @name         VZ: Springsteen Cover Art Uploader
// @namespace    https://github.com/vzell/mb-userscripts
// @description  Upload cover art from different Springsteen related sites like SpringsteenLyrics.com and Jungleland.it to MusicBrainz directly from the cover-art page.
// @version      1.00.004+2026-06-19
// @author       vzell
// @tag          AI generated
// @homepageURL  https://github.com/vzell/mb-userscripts
// @supportURL   https://github.com/vzell/mb-userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/vzell/mb-userscripts/master/SpringsteenCoverArtUploader.user.js
// @updateURL    https://raw.githubusercontent.com/vzell/mb-userscripts/master/SpringsteenCoverArtUploader.user.js
// @icon         https://volkerzell.de/favicons/springsteenlyrics.ico
// @match        *://*.musicbrainz.org/release/*/cover-art
// @match        *://*.musicbrainz.org/release/*/add-cover-art
// @match        *://*.musicbrainz.org/release/*/add-cover-art?*
// @match        *://www.springsteenlyrics.com/collection.php*
// @match        *://springsteenlyrics.com/collection.php*
// @run-at       document-end
// @connect      musicbrainz.org
// @connect      www.springsteenlyrics.com
// @connect      springsteenlyrics.com
// @connect      www.jungleland.it
// @connect      jungleland.it
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_setValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM.getValue
// @grant        GM_deleteValue
// @grant        GM.deleteValue
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_NAME = 'MB: Cover Art Upload';

    /** Storage key used to pass the image queue from cover-art page to add-cover-art page. */
    const QUEUE_KEY = 'CoverArtUpload_queue';

    // ── Debug logger ─────────────────────────────────────────────────────────

    const dbg = {
        /** @param {...*} args */
        log: (...args) => console.log(`[${SCRIPT_NAME}]`, ...args),
        /** @param {...*} args */
        info: (...args) => console.info(`[${SCRIPT_NAME}]`, ...args),
        /** @param {...*} args */
        warn: (...args) => console.warn(`[${SCRIPT_NAME}]`, ...args),
        /** @param {...*} args */
        error: (...args) => console.error(`[${SCRIPT_NAME}]`, ...args),
        /**
         * Log a group of key/value pairs as a collapsible console group.
         * @param {string} label
         * @param {object} data
         */
        group: (label, data) => {
            console.groupCollapsed(`[${SCRIPT_NAME}] ${label}`);
            for (const [k, v] of Object.entries(data)) {
                console.log(`  ${k}:`, v);
            }
            console.groupEnd();
        },
    };

    /** MusicBrainz cover-art type IDs. */
    const ArtworkTypeIDs = {
        Front: 1,
        Back: 2,
        Booklet: 3,
        Medium: 4,
        Other: 8,
    };

    // ── GM compatibility wrappers ────────────────────────────────────────────

    /**
     * Perform a GM.xmlHttpRequest, returning a Promise.
     * Logs request and response details to the console for debugging.
     * @param {string} method - HTTP method
     * @param {string} url - Target URL
     * @param {object} [options] - Additional GM request options
     * @returns {Promise<object>} Resolved with the GM response object
     */
    function gmRequest(method, url, options = {}) {
        dbg.info(`→ ${method} ${url}`, options.responseType ? `(responseType: ${options.responseType})` : '');
        return new Promise((resolve, reject) => {
            const handler = (typeof GM !== 'undefined' && GM.xmlHttpRequest)
                ? GM.xmlHttpRequest.bind(GM)
                : GM_xmlhttpRequest;
            handler({
                method,
                url,
                ...options,
                onload: response => {
                    dbg.group(`← ${method} ${url}`, {
                        status: response.status,
                        statusText: response.statusText,
                        finalUrl: response.finalUrl,
                        responseHeaders: response.responseHeaders,
                        responseLength: typeof response.responseText === 'string'
                            ? response.responseText.length
                            : '(binary)',
                    });
                    resolve(response);
                },
                onerror: response => {
                    dbg.error(`✗ Network error for ${url}`, response);
                    reject(new Error(`Network error fetching ${url}`));
                },
                ontimeout: () => {
                    dbg.error(`✗ Timeout for ${url}`);
                    reject(new Error(`Timeout fetching ${url}`));
                },
            });
        });
    }

    /**
     * @param {string} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    function gmSetValue(key, value) {
        if (typeof GM !== 'undefined' && GM.setValue) return GM.setValue(key, value);
        GM_setValue(key, value);
        return Promise.resolve();
    }

    /**
     * @param {string} key
     * @param {*} [defaultValue]
     * @returns {Promise<*>}
     */
    function gmGetValue(key, defaultValue) {
        if (typeof GM !== 'undefined' && GM.getValue) return GM.getValue(key, defaultValue);
        return Promise.resolve(GM_getValue(key, defaultValue));
    }

    /**
     * @param {string} key
     * @returns {Promise<void>}
     */
    function gmDeleteValue(key) {
        if (typeof GM !== 'undefined' && GM.deleteValue) return GM.deleteValue(key);
        GM_deleteValue(key);
        return Promise.resolve();
    }

    // ── DOM helpers ──────────────────────────────────────────────────────────

    /**
     * Parse an HTML string into a Document with the given base URL applied.
     * @param {string} html
     * @param {string} baseUrl
     * @returns {Document}
     */
    function parseDOM(html, baseUrl) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc.querySelector('base')) {
            const base = doc.createElement('base');
            base.href = baseUrl;
            doc.head.insertAdjacentElement('beforeend', base);
        }
        return doc;
    }

    /**
     * @param {number} ms
     * @returns {Promise<void>}
     */
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ── MusicBrainz API ──────────────────────────────────────────────────────

    /**
     * Return all non-ended URL relationships attached to a release via the MB Web Service.
     * @param {string} mbid - Release MBID
     * @returns {Promise<string[]>} - Array of external URL strings
     */
    async function getReleaseExternalURLs(mbid) {
        const response = await fetch(
            `https://musicbrainz.org/ws/2/release/${mbid}?inc=url-rels&fmt=json`,
            { headers: { Accept: 'application/json' } }
        );
        if (!response.ok) throw new Error(`MB API returned ${response.status}`);
        const data = await response.json();
        return (data.relations ?? [])
            .filter(rel => !rel.ended)
            .map(rel => rel.url.resource);
    }

    // ── Image extractors ─────────────────────────────────────────────────────

    /**
     * Extract full-resolution artwork URLs from a springsteenlyrics.com collection page.
     *
     * The page lists thumbnails as:
     *   <a href="collection/.../10028_01.jpg" target="_blank">
     *     <img src="collection/.../10028_01_tn.jpg">
     *   </a>
     *
     * @param {string} html - Raw HTML of the collection page
     * @param {string} pageUrl - Absolute URL of the page (for resolving relative hrefs)
     * @returns {Array<{url: string, types: number[], comment: string}>}
     */
    function extractSpringsteenImages(html, pageUrl) {
        const doc = parseDOM(html, pageUrl);

        const allBlankLinks = [...doc.querySelectorAll('a[target="_blank"]')];
        dbg.info(`extractSpringsteenImages: found ${allBlankLinks.length} a[target="_blank"] links`);

        const candidates = allBlankLinks.map(a => {
            const href = a.getAttribute('href') ?? '';
            const hasImg = a.querySelector('img') !== null;
            const endsJpg = href.endsWith('.jpg');
            const hasTn = href.includes('_tn.');
            return { href, hasImg, endsJpg, hasTn, passes: endsJpg && !hasTn && hasImg };
        });

        dbg.group('extractSpringsteenImages: filter breakdown', {
            total: candidates.length,
            endsWithJpg: candidates.filter(c => c.endsJpg).length,
            hasThumbnailSuffix: candidates.filter(c => c.hasTn).length,
            hasImgChild: candidates.filter(c => c.hasImg).length,
            passes: candidates.filter(c => c.passes).length,
            allHrefs: candidates.map(c => `[${c.passes ? '✓' : '✗'}] ${c.href}`),
        });

        return candidates
            .filter(c => c.passes)
            .map(c => ({
                url: new URL(c.href, pageUrl).href,
                types: [],
                comment: '',
            }));
    }

    /**
     * Infer the MusicBrainz artwork type(s) from a jungleland.it image filename.
     * Filenames follow the pattern: YYYYMMDD_<type>.jpg
     * @param {string} filename
     * @returns {number[]} - artwork type IDs
     */
    function inferJunglelandTypes(filename) {
        const lower = filename.toLowerCase();
        if (lower.includes('_front')) return [ArtworkTypeIDs.Front];
        if (lower.includes('_back')) return [ArtworkTypeIDs.Back];
        if (lower.includes('_booklet')) return [ArtworkTypeIDs.Booklet];
        if (lower.includes('_cd') || lower.includes('_disc') || lower.includes('_vinyl')) {
            return [ArtworkTypeIDs.Medium];
        }
        return [];
    }

    /**
     * Extract full-resolution artwork URLs from a jungleland.it artwork page.
     *
     * The page uses Windows-style backslash paths:
     *   <a href="..\artwork\1960\19670916_front.jpg">
     *     <img src="..\artwork\1960\thumb\tn_19670916_front.jpg">
     *   </a>
     *
     * @param {string} html - Raw HTML of the artwork page
     * @param {string} pageUrl - Absolute URL of the page (for resolving relative hrefs)
     * @returns {Array<{url: string, types: number[], comment: string}>}
     */
    function extractJunglelandImages(html, pageUrl) {
        const doc = parseDOM(html, pageUrl);

        const allLinks = [...doc.querySelectorAll('a[href]')];
        dbg.info(`extractJunglelandImages: found ${allLinks.length} a[href] links`);

        const candidates = allLinks.map(a => {
            const href = a.getAttribute('href') ?? '';
            const lower = href.toLowerCase();
            const isImage = /\.(jpg|jpeg|png)$/i.test(href);
            const hasTn = lower.includes('_tn');
            const hasThumb = lower.includes('thumb');
            const passes = isImage && !hasTn && !hasThumb;
            return { href, isImage, hasTn, hasThumb, passes };
        });

        dbg.group('extractJunglelandImages: filter breakdown', {
            total: candidates.length,
            isImage: candidates.filter(c => c.isImage).length,
            hasThumbnailSuffix: candidates.filter(c => c.hasTn).length,
            hasThumbPath: candidates.filter(c => c.hasThumb).length,
            passes: candidates.filter(c => c.passes).length,
            allHrefs: candidates.map(c => `[${c.passes ? '✓' : '✗'}] ${c.href}`),
        });

        return candidates
            .filter(c => c.passes)
            .map(c => {
                // Jungleland uses Windows backslash separators — convert before resolving.
                const normalized = c.href.replace(/\\/g, '/');
                const url = new URL(normalized, pageUrl).href;
                const filename = url.split('/').pop() ?? '';
                const types = inferJunglelandTypes(filename);
                dbg.log(`  → ${url}  types=${JSON.stringify(types)}`);
                return { url, types, comment: '' };
            });
    }

    // ── Provider registry ────────────────────────────────────────────────────

    const PROVIDERS = [
        {
            name: 'SpringsteenLyrics',
            favicon: 'https://www.springsteenlyrics.com/favicon.ico',
            /** @param {string} url */
            test: url => /springsteenlyrics\.com\/collection\.php/i.test(url),
            extract: extractSpringsteenImages,
            /** Use a real browser popup to bypass CloudFlare JS challenges. */
            usePopup: true,
        },
        {
            name: 'Jungleland.it',
            favicon: 'https://www.jungleland.it/favicon.ico',
            /** @param {string} url */
            test: url => /jungleland\.it\/html\/[^/]+\.htm/i.test(url),
            extract: extractJunglelandImages,
        },
    ];

    /**
     * Return the provider that handles the given URL, or null.
     * @param {string} url
     * @returns {object|null}
     */
    function getProvider(url) {
        return PROVIDERS.find(p => p.test(url)) ?? null;
    }

    // ── Upload machinery (runs on /add-cover-art) ────────────────────────────

    /**
     * Access a constructor from the page's JS context.
     * Required in Firefox where the userscript sandbox differs from the page sandbox.
     * @param {string} name
     * @returns {*}
     */
    function getFromPageContext(name) {
        return (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window)[name];
    }

    /**
     * Clone a value into the page's JS context (Firefox sandbox bridge).
     * @param {*} value
     * @returns {*}
     */
    function cloneForPage(value) {
        return (typeof cloneInto !== 'undefined' && typeof unsafeWindow !== 'undefined')
            ? cloneInto(value, unsafeWindow)
            : value;
    }

    /**
     * Simulate dropping a File onto the MB cover-art drop zone.
     * @param {File} file
     */
    function dropFile(file) {
        const DataTransfer = getFromPageContext('DataTransfer');
        const dt = new DataTransfer();
        Object.defineProperty(dt, 'files', { value: cloneForPage([file]) });
        const dropZone = document.querySelector('#drop-zone');
        if (!dropZone) throw new Error('#drop-zone not found on page');
        dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt }));
    }

    /**
     * Set cover-art type checkboxes and the comment field for a queued upload row.
     * Retries until the Knockout-rendered row appears in the DOM.
     * @param {string} filename
     * @param {number[]} types
     * @param {string} comment
     * @returns {Promise<void>}
     */
    async function setImageParameters(filename, types, comment) {
        for (let i = 0; i < 40; i++) {
            const rows = [...document.querySelectorAll(
                'tbody[data-bind="foreach: files_to_upload"] > tr'
            )];
            const row = rows.find(
                r => r.querySelector('.file-info span[data-bind="text: name"]')?.textContent === filename
            );
            if (row) {
                if (types.length > 0) {
                    for (const cb of row.querySelectorAll(
                        'ul.cover-art-type-checkboxes input[type="checkbox"]'
                    )) {
                        if (types.includes(parseInt(cb.value, 10))) {
                            cb.checked = true;
                            cb.dispatchEvent(new Event('click'));
                        }
                    }
                }
                if (comment) {
                    const input = row.querySelector('div.comment > input.comment');
                    if (input) {
                        input.value = comment;
                        input.dispatchEvent(new Event('change'));
                    }
                }
                return;
            }
            await sleep(250);
        }
        console.warn(`[${SCRIPT_NAME}] Could not find upload row for "${filename}"`);
    }

    /**
     * Reconstruct a File from a data URL produced by FileReader.readAsDataURL.
     * @param {string} dataUrl - e.g. "data:image/jpeg;base64,..."
     * @param {string} filename
     * @returns {File}
     */
    function dataUrlToFile(dataUrl, filename) {
        const [header, base64] = dataUrl.split(',');
        const contentType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new File([bytes], filename, { type: contentType });
    }

    /**
     * Download a remote image as a typed File blob via GM.xmlHttpRequest (bypasses CORS).
     * Used for providers without CloudFlare protection (e.g. Jungleland.it).
     * For CF-protected sites the popup strategy embeds image data directly in the postMessage.
     * @param {string} url
     * @returns {Promise<File>}
     */
    async function downloadImage(url) {
        const response = await gmRequest('GET', url, { responseType: 'blob' });
        const filename = decodeURIComponent(url.split('/').pop() ?? 'image.jpg');
        const mimeType = response.responseHeaders?.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim()
            ?? 'image/jpeg';
        dbg.info(`downloadImage: "${filename}" mimeType="${mimeType}" size=${response.response?.size ?? '?'}`);
        return new File([response.response], filename, { type: mimeType });
    }

    /**
     * Process the image upload queue that was stored before navigating here from the cover-art page.
     * @returns {Promise<void>}
     */
    async function processUploadQueue() {
        dbg.info('processUploadQueue: checking GM storage…');
        const stored = await gmGetValue(QUEUE_KEY, null);
        if (!stored) {
            dbg.info('processUploadQueue: no queue found, nothing to do');
            return;
        }
        dbg.info('processUploadQueue: found stored queue', stored);

        let queue;
        try {
            queue = JSON.parse(stored);
        } catch {
            await gmDeleteValue(QUEUE_KEY);
            return;
        }

        const currentMbid = /\/release\/([a-f0-9-]+)\/add-cover-art/.exec(location.pathname)?.[1];
        dbg.info(`processUploadQueue: currentMbid="${currentMbid}" queueMbid="${queue.mbid}"`);
        if (!currentMbid || currentMbid !== queue.mbid) {
            dbg.warn('processUploadQueue: MBID mismatch — skipping');
            return;
        }

        // Clear storage immediately so a page reload does not re-trigger the upload.
        await gmDeleteValue(QUEUE_KEY);

        // Give Knockout time to finish binding the upload form.
        await sleep(800);

        dbg.info(`processUploadQueue: processing ${queue.images.length} image(s)`, queue.images);

        for (const [idx, image] of queue.images.entries()) {
            dbg.info(`processUploadQueue: [${idx + 1}/${queue.images.length}] ${image.url}  types=${JSON.stringify(image.types)}  hasDataUrl=${!!image.dataUrl}`);
            try {
                let file;
                if (image.dataUrl) {
                    // Image binary was pre-fetched inside the springsteenlyrics.com popup —
                    // reconstruct the File from the embedded data URL, no network request needed.
                    const filename = decodeURIComponent(image.url.split('/').pop() ?? 'image.jpg');
                    file = dataUrlToFile(image.dataUrl, filename);
                    dbg.info(`processUploadQueue: restored from dataUrl "${file.name}" (${file.size} bytes, ${file.type})`);
                } else {
                    file = await downloadImage(image.url);
                }
                dbg.info(`processUploadQueue: dropping file "${file.name}" (${file.size} bytes, ${file.type})`);
                dropFile(file);
                dbg.info(`processUploadQueue: file dropped, waiting for Knockout row…`);
                await setImageParameters(file.name, image.types, image.comment);
                dbg.info(`processUploadQueue: parameters set for "${file.name}"`);
                await sleep(300);
            } catch (err) {
                dbg.error(`processUploadQueue: failed to upload ${image.url}`, err);
            }
        }

        dbg.info(`processUploadQueue: done — ${queue.images.length} image(s) processed`);
    }

    // ── Cover-art page: inject upload buttons ────────────────────────────────

    /**
     * The URL parameter name used to signal the popup script to extract and postMessage images.
     * Must not conflict with any real springsteenlyrics.com query parameters.
     */
    const POPUP_SIGNAL_PARAM = 'cau_extract';

    /**
     * Open a real browser popup for a CloudFlare-protected provider, wait for the userscript
     * running inside it to postMessage back the extracted images, then close the popup.
     *
     * The popup URL gets the `cau_extract=1` parameter appended so the in-popup script knows
     * to run extraction and return data instead of normal page behaviour.
     *
     * @param {string} url - External site URL
     * @param {object} provider - Provider descriptor object
     * @param {string} mbid - Release MBID (sent through the popup URL for cross-check)
     * @returns {Promise<Array<{url: string, types: number[], comment: string}>>}
     */
    function fetchImagesViaPopup(url, provider, mbid) {
        dbg.info(`fetchImagesViaPopup: opening popup for "${provider.name}" → ${url}`);

        const separator = url.includes('?') ? '&' : '?';
        const popupUrl = `${url}${separator}${POPUP_SIGNAL_PARAM}=1&cau_mbid=${encodeURIComponent(mbid)}`;

        const popup = window.open(popupUrl, `cau_popup_${mbid}`, 'width=1100,height=750,noopener=no');

        if (!popup) {
            return Promise.reject(new Error(
                `Popup blocked by the browser. Please allow popups for musicbrainz.org and try again.`
            ));
        }

        dbg.info('fetchImagesViaPopup: popup opened, waiting for postMessage…');

        return new Promise((resolve, reject) => {
            // Allow up to 120 s — the popup fetches all images in parallel before responding.
            const timer = setTimeout(() => {
                window.removeEventListener('message', onMessage);
                try { popup.close(); } catch {}
                reject(new Error(
                    `Timeout: ${provider.name} did not respond within 120 s. ` +
                    `If a CloudFlare challenge appeared in the popup, solve it and click the button again.`
                ));
            }, 120000);

            /** @param {MessageEvent} event */
            function onMessage(event) {
                if (event.origin !== new URL(url).origin) {
                    dbg.warn(`fetchImagesViaPopup: ignoring message from unexpected origin "${event.origin}"`);
                    return;
                }
                if (!event.data || event.data.type !== 'cau_images') return;

                dbg.info('fetchImagesViaPopup: postMessage received', event.data);
                clearTimeout(timer);
                window.removeEventListener('message', onMessage);
                try { popup.close(); } catch {}
                resolve(event.data.images ?? []);
            }

            window.addEventListener('message', onMessage);
        });
    }

    /**
     * Fetch the external site page and extract image data.
     * Routes to a real-browser popup for providers with `usePopup: true` (CloudFlare-protected sites),
     * and to GM.xmlHttpRequest for all others.
     *
     * @param {string} url - External site URL
     * @param {object} provider - Provider descriptor object
     * @param {string} mbid - Release MBID (needed for the popup strategy)
     * @returns {Promise<Array<{url: string, types: number[], comment: string}>>}
     */
    async function fetchImagesFromProvider(url, provider, mbid) {
        dbg.info(`fetchImagesFromProvider: provider="${provider.name}" usePopup=${!!provider.usePopup} url="${url}"`);

        if (provider.usePopup) {
            return fetchImagesViaPopup(url, provider, mbid);
        }

        const response = await gmRequest('GET', url);
        const text = response.responseText ?? '';

        // Extract and log the page <title> so we can see what was actually returned.
        const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(text);
        const pageTitle = titleMatch ? titleMatch[1].trim() : '(no <title> found)';

        dbg.group('fetchImagesFromProvider: response analysis', {
            status: response.status,
            finalUrl: response.finalUrl,
            pageTitle,
            bodyLength: text.length,
            'body[0..500]': text.slice(0, 500),
            'body[500..1000]': text.slice(500, 1000),
            hasJustAMoment: text.includes('<title>Just a moment'),
            hasCfBrowserVerification: text.includes('cf-browser-verification'),
            hasCfRayId: text.includes('cf-ray'),
            hasCfChallenge: text.includes('__cf_chl_'),
        });

        const isCfJustAMoment = text.includes('<title>Just a moment');
        const isCfBrowserVerif = text.includes('cf-browser-verification');
        const isCfChallenge = text.includes('__cf_chl_');

        if (isCfJustAMoment || isCfBrowserVerif || isCfChallenge) {
            dbg.warn('CloudFlare challenge detected:', { isCfJustAMoment, isCfBrowserVerif, isCfChallenge, pageTitle });
            throw new Error(
                `CloudFlare challenge detected on ${provider.name}. ` +
                `Please open ${url} in your browser first to solve the challenge, then try again.`
            );
        }

        dbg.info('fetchImagesFromProvider: no CF challenge detected, extracting images…');
        const images = provider.extract(text, url);
        dbg.info(`fetchImagesFromProvider: extracted ${images.length} image(s)`, images);
        return images;
    }

    /**
     * Create and append a styled upload button for one supported external URL.
     * On click: fetches the external page, extracts images, stores the queue, navigates to add-cover-art.
     * @param {Element} container - The `.buttons` element to append to
     * @param {string} mbid - Release MBID
     * @param {string} url - External site URL
     * @param {object} provider - Provider descriptor object
     */
    function createUploadButton(container, mbid, url, provider) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = url;
        btn.style.cssText = 'margin: 4px; cursor: pointer; vertical-align: middle;';

        const favicon = document.createElement('img');
        favicon.src = provider.favicon;
        favicon.alt = '';
        favicon.style.cssText = 'width: 16px; height: 16px; margin-right: 6px; vertical-align: middle;';
        favicon.addEventListener('error', () => { favicon.style.display = 'none'; });

        const label = document.createElement('span');
        label.textContent = `Upload from ${provider.name}`;

        btn.append(favicon, label);

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            label.textContent = `Fetching from ${provider.name}…`;

            try {
                const images = await fetchImagesFromProvider(url, provider, mbid);

                if (images.length === 0) {
                    alert(`[${SCRIPT_NAME}]\nNo images found on the ${provider.name} page.\n${url}`);
                    btn.disabled = false;
                    label.textContent = `Upload from ${provider.name}`;
                    return;
                }

                await gmSetValue(QUEUE_KEY, JSON.stringify({ mbid, images, origin: url }));
                location.href = `https://musicbrainz.org/release/${mbid}/add-cover-art`;
            } catch (err) {
                console.error(`[${SCRIPT_NAME}]`, err);
                alert(`[${SCRIPT_NAME}]\n${err.message}`);
                btn.disabled = false;
                label.textContent = `Upload from ${provider.name}`;
            }
        });

        container.appendChild(btn);
    }

    /**
     * Fetch the release's external URL relationships and inject upload buttons for supported sites.
     * @returns {Promise<void>}
     */
    async function addUploadButtons() {
        const mbid = /\/release\/([a-f0-9-]+)\/cover-art/.exec(location.pathname)?.[1];
        dbg.info(`addUploadButtons: mbid="${mbid}"`);
        if (!mbid) return;

        let externalUrls;
        try {
            externalUrls = await getReleaseExternalURLs(mbid);
        } catch (err) {
            dbg.error('addUploadButtons: failed to fetch release URLs', err);
            return;
        }

        dbg.info(`addUploadButtons: ${externalUrls.length} external URL(s) from MB API`, externalUrls);

        const supported = externalUrls
            .map(url => ({ url, provider: getProvider(url) }))
            .filter(x => x.provider !== null);

        dbg.info(`addUploadButtons: ${supported.length} supported URL(s)`,
            supported.map(x => `${x.provider.name}: ${x.url}`));

        if (supported.length === 0) return;

        const buttonRow = document.querySelector('#content > .buttons');
        if (!buttonRow) {
            dbg.warn('addUploadButtons: #content > .buttons not found');
            return;
        }

        for (const { url, provider } of supported) {
            dbg.info(`addUploadButtons: injecting button for ${provider.name} → ${url}`);
            createUploadButton(buttonRow, mbid, url, provider);
        }
    }

    // ── Popup-side runner (springsteenlyrics.com) ────────────────────────────

    /**
     * Runs inside the popup opened by `fetchImagesViaPopup`.
     * Detects the `cau_extract` URL parameter, extracts images from the already-loaded real page,
     * fetches each image binary as a data URL (same-origin — CloudFlare sees this as a normal
     * browser request because the CF cookie is valid in this popup context), and postMessages
     * the image data back to the MB opener window.
     * This bypasses CloudFlare entirely for both the page HTML and the image files.
     */
    function runAsSpringsteenPopup() {
        const params = new URLSearchParams(location.search);
        if (!params.has(POPUP_SIGNAL_PARAM)) {
            dbg.info('runAsSpringsteenPopup: no cau_extract param — normal page visit, doing nothing');
            return;
        }

        dbg.info('runAsSpringsteenPopup: cau_extract detected — extracting images from live DOM…');

        const allBlankLinks = [...document.querySelectorAll('a[target="_blank"]')];
        dbg.info(`runAsSpringsteenPopup: found ${allBlankLinks.length} a[target="_blank"] links`);

        const imageItems = allBlankLinks
            .filter(a => {
                const href = a.getAttribute('href') ?? '';
                return href.endsWith('.jpg') && !href.includes('_tn.') && a.querySelector('img') !== null;
            })
            .map(a => ({
                url: new URL(a.getAttribute('href'), location.href).href,
                types: [],
                comment: '',
            }));

        dbg.info(`runAsSpringsteenPopup: found ${imageItems.length} image URL(s), fetching binaries…`, imageItems);

        if (!window.opener) {
            dbg.error('runAsSpringsteenPopup: window.opener is null — cannot postMessage back');
            return;
        }

        const targetOrigin = 'https://musicbrainz.org';

        /**
         * Fetch one image as a data URL using FileReader.
         * fetch() here runs inside the springsteenlyrics.com popup context — same-origin,
         * CF cookie is valid, so the request passes CloudFlare without challenge.
         * @param {string} url
         * @returns {Promise<string>} data URL (e.g. "data:image/jpeg;base64,...")
         */
        async function fetchAsDataUrl(url) {
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(/** @type {string} */ (reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        // Fetch all images in parallel, then postMessage the full payload to MB.
        (async () => {
            const images = await Promise.all(
                imageItems.map(async item => {
                    try {
                        dbg.info(`runAsSpringsteenPopup: fetching ${item.url}…`);
                        const dataUrl = await fetchAsDataUrl(item.url);
                        dbg.info(`runAsSpringsteenPopup: ✓ ${item.url} → ${dataUrl.length} chars`);
                        return { ...item, dataUrl };
                    } catch (err) {
                        // On error send the item without dataUrl; processUploadQueue will fall back
                        // to downloadImage() which will log the CF failure for diagnostics.
                        dbg.error(`runAsSpringsteenPopup: ✗ failed to fetch ${item.url}`, err);
                        return item;
                    }
                })
            );

            dbg.info(`runAsSpringsteenPopup: posting ${images.length} image(s) to opener (targetOrigin="${targetOrigin}")`);
            window.opener.postMessage({ type: 'cau_images', images }, targetOrigin);

            // Brief pause so the user can see the popup completed, then close.
            setTimeout(() => window.close(), 1500);
        })();
    }

    // ── Entry point ──────────────────────────────────────────────────────────

    const host = location.hostname.replace(/^www\./, '');
    const path = location.pathname;
    dbg.info(`init: host="${host}" path="${path}"`);

    if (host === 'springsteenlyrics.com') {
        dbg.info('init: springsteenlyrics.com popup → runAsSpringsteenPopup()');
        runAsSpringsteenPopup();
    } else if (/\/release\/[a-f0-9-]+\/cover-art$/.test(path)) {
        dbg.info('init: cover-art page → addUploadButtons()');
        addUploadButtons().catch(err => {
            dbg.error('Unhandled error in addUploadButtons', err);
        });
    } else if (/\/release\/[a-f0-9-]+\/add-cover-art/.test(path)) {
        dbg.info('init: add-cover-art page → processUploadQueue()');
        processUploadQueue().catch(err => {
            dbg.error('Unhandled error in processUploadQueue', err);
        });
    } else {
        dbg.warn(`init: host+path matched no handler`);
    }

})();
