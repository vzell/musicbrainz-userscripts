/**
 * PROTOTYPE of the editing-history parser for the MusicBrainz entity popup
 * (org/mb-edit-history.org): reads an entity's "Editing history" page
 * (`/<entity>/<mbid>/edits`) into the record the window renders. Browser
 * code, run by scripts/inventory-mb-edits.js inside Playwright Chromium
 * (DOMParser, like the userscript's `_mbPageLoad()`), so the mockups and the
 * edit-type inventory come from the same code that will become
 * `_mbParseEditsPage()` / `_mbEditsHtml()` in ShowAllEntityData.user.js.
 *
 * Defines `window.mbParseEditsPage(doc)`; nothing else is global.
 */
(function () {
    'use strict';

    /**
     * HTML-escapes a string.
     * @param {string} s
     * @returns {string}
     */
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /**
     * An element's text, whitespace collapsed; '' for none.
     * @param {?Element} el
     * @returns {string}
     */
    const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

    /** Class prefixes of other userscripts' markup (debug/edits-*.html), never read. */
    const THIRD_PARTY = /^(jesus2099|mfe-|mb-hq-|mmth|search-link|mb-batch|batch-toggle|mb-vsb)/;

    /** Hosts an image in an edit may be shown from (cover art, event art, their thumbnails). */
    const IMG_HOST = /^https:\/\/([a-z0-9-]+\.)*(coverartarchive\.org|eventartarchive\.org|archive\.org)\//i;

    /**
     * A URL as written in the page, protocol-relative ones (`//archive.org/…`,
     * the artwork thumbnails) made https.
     * @param {string} u
     * @returns {string}
     */
    const absUrl = (u) => (/^\/\//.test(u) ? `https:${u}` : u);

    /**
     * A part of an edit as safe HTML: text, line breaks, links (MusicBrainz
     * paths stay paths, so the window's drill-in resolves them; other sites
     * absolute; both a new tab), bold/italic, code, bdi, lists, paragraphs,
     * nested tables re-classed `mb-meh-sub` (never `tbl`: every global
     * `table.tbl` query of the script would see them), cover-art images, and
     * MusicBrainz's diff marks `diff-only-a`/`diff-only-b` as
     * `mb-dgh-rem`/`mb-dgh-add` (the Discogs window's red/green), a removed
     * entity (`span.deleted`) as `mb-meh-deleted`. Nothing else survives.
     * An artwork cell's image is the `<noscript>` thumbnail (250 px): a
     * DOMParser document runs no script, so `<noscript>` parses as markup.
     * The node's own tag is not kept, only what it holds (a value cell
     * gives its content, not a `<td>`).
     *
     * @param {Node} node
     * @returns {string}
     */
    function editsHtml(node) {
        const walk = (n) => {
            if (n.nodeType === 3) return esc(n.nodeValue.replace(/\s+/g, ' '));
            if (n.nodeType !== 1) return '';
            const tag = n.tagName;
            const cls = Array.from(n.classList || []);
            if (/^(SCRIPT|STYLE|BUTTON|SELECT|TEXTAREA|INPUT|FORM|svg)$/i.test(tag)) return '';
            if (cls.some(c => THIRD_PARTY.test(c))) return '';
            const inner = Array.from(n.childNodes).map(walk).join('');
            if (cls.includes('diff-only-a')) return `<span class="mb-dgh-rem">${inner}</span>`;
            if (cls.includes('diff-only-b')) return `<span class="mb-dgh-add">${inner}</span>`;
            if (cls.includes('deleted')) return `<span class="mb-meh-deleted">${inner}</span>`;
            if (cls.includes('comment')) return `<span class="mb-meh-comment">${inner}</span>`;
            switch (tag) {
                case 'A': {
                    const href = absUrl(n.getAttribute('href') || '');
                    if (/^\/(?!\/)/.test(href) || /^https?:\/\//i.test(href)) {
                        return `<a href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`;
                    }
                    return inner;
                }
                case 'BR': return '<br>';
                case 'B': case 'STRONG': return `<b>${inner}</b>`;
                case 'I': case 'EM': return `<i>${inner}</i>`;
                case 'CODE': case 'BDI': case 'UL': case 'OL': case 'LI': case 'P': case 'THEAD': case 'TBODY': case 'TR':
                    return `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`;
                case 'TABLE': return `<table class="mb-meh-sub">${inner}</table>`;
                case 'TH': case 'TD': {
                    const span = ['colspan', 'rowspan'].map(a => (n.getAttribute(a) ? ` ${a}="${esc(n.getAttribute(a))}"` : '')).join('');
                    const side = cls.includes('old') ? ' class="mb-meh-old"' : cls.includes('new') ? ' class="mb-meh-new"' : '';
                    return `<${tag.toLowerCase()}${span}${side}>${inner}</${tag.toLowerCase()}>`;
                }
                case 'IMG': {
                    const src = absUrl(n.getAttribute('src') || '');
                    return IMG_HOST.test(src) ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
                }
                default: return inner;
            }
        };
        return Array.from(node.childNodes).map(walk).join('').replace(/\s+/g, ' ').trim();
    }

    /** An edit-header category token → the window's category. */
    const CATS = { 'edit-add': 'add', 'edit-edit': 'edit', 'edit-remove': 'remove', 'edit-merge': 'merge' };

    /**
     * One edit's `table.details` (and pre-NGS `table.tbl.edit-release-events`)
     * as rows: `diff` (an old and a new value: one row with `td.old` and
     * `td.new`, or `th[rowspan=2]` over an old row and a new row), `val` (one
     * value). A value cell that holds its own `table.details` (set track
     * lengths: one per track) gives one diff row per nested table.
     *
     * @param {Element} block - The edit's `div.edit-list`.
     * @returns {Array<Object>}
     */
    function parseRows(block) {
        const rows = [];
        const tables = Array.from(block.querySelectorAll('.edit-details table.details, .edit-details table.edit-release-events'))
            .filter(t => !t.parentElement.closest('.edit-details table'));
        tables.forEach((table) => {
            let pending = null;
            Array.from(table.rows).forEach((tr) => {
                const th = tr.querySelector(':scope > th');
                const oldTd = tr.querySelector(':scope > td.old');
                const newTd = tr.querySelector(':scope > td.new');
                const label = th ? txt(th).replace(/:$/, '') : '';
                if (!th && pending && newTd) {
                    pending.new = editsHtml(newTd);
                    pending = null;
                    return;
                }
                if (oldTd && newTd) {
                    rows.push({ label, kind: 'diff', old: editsHtml(oldTd), new: editsHtml(newTd) });
                    return;
                }
                if (oldTd || newTd) {
                    const r = { label, kind: 'diff', old: oldTd ? editsHtml(oldTd) : '', new: newTd ? editsHtml(newTd) : '' };
                    rows.push(r);
                    if (oldTd && th && th.rowSpan === 2) pending = r;
                    return;
                }
                const td = tr.querySelector(':scope > td');
                if (!td) return;
                const nested = Array.from(td.querySelectorAll(':scope > table.details, :scope > table.wrap-block'));
                if (nested.length && nested.every(t => t.querySelector('td.old, td.new'))) {
                    // Set track lengths: one table per track, numbered by
                    // nothing but its order.
                    nested.forEach((t, i) => rows.push({
                        label: `${/^Track/.test(label) ? 'Track' : label} ${i + 1}`, kind: 'diff',
                        old: editsHtml(t.querySelector('td.old') || t.ownerDocument.createElement('td')),
                        new: editsHtml(t.querySelector('td.new') || t.ownerDocument.createElement('td')),
                    }));
                    return;
                }
                rows.push({ label, kind: 'val', html: editsHtml(td), span: td.colSpan > 1, nestedTable: !!td.querySelector('table') });
            });
        });
        // "Old positions" + "New positions" (reorder art) are one change.
        for (let i = rows.length - 2; i >= 0; i--) {
            const a = rows[i];
            const b = rows[i + 1];
            const m = a.kind === 'val' && b.kind === 'val' && /^Old (.+)$/i.exec(a.label);
            if (m && b.label.toLowerCase() === `new ${m[1].toLowerCase()}`) {
                rows.splice(i, 2, { label: m[1].charAt(0).toUpperCase() + m[1].slice(1), kind: 'diff', old: a.html, new: b.html });
            }
        }
        // A diff whose two sides read the same (a track length set to what
        // it was) is shown dimmed, and hidden by "Only what changed".
        rows.forEach((r) => { if (r.kind === 'diff') r.same = r.old === r.new; });
        if (rows.some(r => r.kind === 'diff')) rows.forEach((r) => { if (r.kind === 'val') r.kind = 'ctx'; });
        return rows;
    }

    /**
     * One `div.edit-list` block as an entry.
     *
     * @param {Element} block
     * @returns {?Object}
     */
    function parseEntry(block) {
        const header = block.querySelector(':scope > .edit-header');
        const a = header && header.querySelector('h2 a[href^="/edit/"]');
        const m = a && /^Edit #(\d+)\s*-\s*(.+)$/.exec(txt(a));
        if (!m) return null;
        const tokens = header.className.split(/\s+/).filter(Boolean);
        const catTok = tokens.find(t => CATS[t] || t === 'edit-other') || '';
        const slug = tokens[tokens.indexOf(catTok) + 1] || '';
        const sub = header.querySelector('p.subheader');
        const userA = sub && sub.querySelector('a[href^="/user/"]');
        const avatar = userA && userA.querySelector('img.avatar');
        const vote = txt(header.querySelector('.vote-count')).replace(/^Vote tally:\s*/i, '');
        const yn = /(\d+)\s*yes\s*:\s*(\d+)\s*no/i.exec(vote);
        const expEl = header.querySelector('.edit-expiration');
        const exp = txt(expEl);
        const expM = /^(Closed|Approved|Voting|Expired|Cancelled)\s*:\s*(.*)$/i.exec(exp);
        // An open edit says "Closes in <span title="2026-10-27 00:22 GMT+1">7 days</span>".
        const expTip = expEl && expEl.querySelector('[title]');
        const statusEl = block.querySelector('.edit-status');
        const notes = Array.from(block.querySelectorAll(':scope > .edit-notes > .edit-note:not(.add-edit-note)')).map((n) => {
            const h3 = n.querySelector(':scope > h3');
            const ua = h3 && h3.querySelector('a[href^="/user/"]');
            return {
                author: txt(ua && (ua.querySelector('bdi') || ua)) || txt(h3 && h3.querySelector('bdi')),
                date: txt(h3 && h3.querySelector('a.date, .date')),
                vote: h3 ? Array.from(h3.classList).filter(c => c !== 'owner').join(' ') : '',
                owner: !!(h3 && h3.classList.contains('owner')),
                bot: /modbot/.test(n.querySelector('.edit-note-text') ? n.querySelector('.edit-note-text').className : ''),
                html: editsHtml(n.querySelector('.edit-note-text') || n),
            };
        });
        const rows = parseRows(block);
        return {
            id: m[1], type: m[2].trim(), slug, cat: CATS[catTok] || 'other',
            status: tokens[1] || '', statusLabel: statusEl ? txt(statusEl) : '', preNgs: tokens.includes('pre-ngs'),
            editor: txt(userA && (userA.querySelector('bdi') || userA)), editorHidden: !userA && /Editor hidden/.test(txt(sub)),
            avatar: avatar ? avatar.getAttribute('src') : '', avatarNone: !!(avatar && avatar.classList.contains('no-avatar')),
            editorClass: txt(sub && sub.querySelector('.editor-class')).replace(/^\(|\)$/g, ''),
            auto: /automatically applied/i.test(vote), yes: yn ? Number(yn[1]) : null, no: yn ? Number(yn[2]) : null, vote,
            when: expM ? expM[1] : '', date: expM ? expM[2].trim() : exp, dateAt: expTip ? expTip.getAttribute('title') : '',
            myVote: txt(header.querySelector('.my-vote')).replace(/^My vote:\s*/i, ''),
            notes, notesHidden: !block.querySelector('.edit-notes'),
            // An edit medium's tracklist is one value holding an Old/New
            // table with its own diff marks: changed, though no row is a diff.
            rows, changed: rows.some(r => r.kind === 'diff' || /mb-dgh-(add|rem)/.test(r.html || '')),
        };
    }

    /**
     * An entity's editing-history page as the window's record; `null` when
     * the page is not one (a login page, the browser check, an error page).
     *
     * @param {Document} doc
     * @returns {?Object}
     */
    window.mbParseEditsPage = function (doc) {
        const content = doc.getElementById('content');
        const found = content && /Found (at least )?([\d,]+) edits?/.exec(txt(content.querySelector('.search-toggle')));
        if (!found) return null;
        const h1a = content.querySelector('h1 a[href]');
        const subject = h1a ? { path: h1a.getAttribute('href'), name: txt(h1a) } : null;
        const seen = new Set();
        const entries = [];
        content.querySelectorAll('div.edit-list').forEach((b) => {
            const e = parseEntry(b);
            if (e && !seen.has(e.id)) {
                seen.add(e.id);
                entries.push(e);
            }
        });
        const pag = content.querySelector('ul.pagination');
        const nums = pag ? Array.from(pag.querySelectorAll('a[href*="page="]')).map(x => Number((/[?&]page=(\d+)/.exec(x.getAttribute('href')) || [])[1]) || 0) : [];
        return {
            subject, by: txt(content.querySelector('.subheader')).replace(/^~\s*/, ''),
            total: Number(found[2].replace(/,/g, '')), atLeast: !!found[1],
            page: pag ? Number(txt(pag.querySelector('a.sel'))) || 1 : 1, pages: nums.length ? Math.max(...nums) : 1,
            entries,
        };
    };
})();
