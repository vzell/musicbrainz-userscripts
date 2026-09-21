/**
 * What does making `_findCellJoinPhrases()`'s entity boundary structural cost?
 *
 * The fix (DEBUG-NOTES.md 2026-09-21) stopped requiring a credited `<a>` to be
 * a DIRECT CHILD of its `<bdi>` — MusicBrainz's own `<span class="mp">`
 * open-edits wrapper broke that assumption and hid a whole join phrase. The new
 * shape asks the `<bdi>` for its anchors and walks each consecutive pair up to
 * their nearest common ancestor, which trades a `childNodes` scan for one
 * `querySelectorAll` plus a `closest()` per anchor.
 *
 * That matters because `openUniqDrop()` calls this once per VISIBLE ROW of the
 * column being opened, and PERFORMANCE.org's Step 4 measures a cold
 * uniq-dropdown open in tens of seconds on a 4174-row page. This answers
 * whether the boundary change is a visible part of that or noise inside it.
 *
 * Both algorithms are implemented here and run over the SAME synthetic cells,
 * so the only difference measured is the boundary resolution. The cells
 * reproduce the four real shapes in
 * `tests/fixtures/uniq-drop-join-phrases.html`, in the proportion a real
 * Artist column has them — overwhelmingly the plain one.
 *
 *     node scripts/bench-join-phrase-scan.js [cells] [repeats]
 */

'use strict';

const os = require('os');
const { chromium } = require('playwright');

(async () => {
    const cellCount = Number(process.argv[2] || 4174);
    const repeats = Number(process.argv[3] || 5);
    const startedAt = new Date().toISOString();
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const result = await page.evaluate(({ n, reps }) => {
        const A = (name) => `<a href="/artist/11111111-2222-4333-8444-555555555555" title="${name}">${name}</a>`;
        // 0: solo (no phrase at all) — the commonest cell on a real page.
        // 1: plain joined pair, both anchors direct children.
        // 2: an .mp-wrapped anchor — the shape the old code could not see.
        // 3: each entity carrying its own .comment, so the phrase spans
        //    three nodes. MusicBrainz's ordinary disambiguated shape.
        const SHAPES = [
            `<bdi>${A('Bruce Springsteen')}</bdi>`,
            `<bdi>${A('Axl Rose')} and ${A('Bruce Springsteen')}</bdi>`,
            `<bdi><span class="mp">${A('Guns N’ Roses')}</span> feat. ${A('Bruce Springsteen')}</bdi>`,
            `<bdi>${A('Queen')}&nbsp;<span class="comment"><bdi>(UK rock group)</bdi></span> vs. <span class="mp">${A('Bruce Springsteen')}</span></bdi>`,
        ];
        // Roughly a real Artist column: most rows are one artist.
        const MIX = [0, 0, 0, 0, 0, 0, 1, 1, 2, 3];

        const host = document.createElement('div');
        document.body.appendChild(host);
        const cells = [];
        for (let i = 0; i < n; i++) {
            const td = document.createElement('td');
            td.innerHTML = SHAPES[MIX[i % MIX.length]];
            host.appendChild(td);
            cells.push(td);
        }

        const isQualifyingHref = (href) => /^\/([a-z][a-z-]*)\/[0-9a-f-]+/i.test(href || '');

        // --- before: entity boundary must be a DIRECT child of the <bdi> ---
        const oldFind = (cell) => {
            const out = [];
            const isEntityAnchor = (node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return false;
                if (node.tagName === 'A') return isQualifyingHref(node.getAttribute('href'));
                if (node.tagName === 'SPAN' && node.classList.contains('name-variation')) {
                    const innerA = node.querySelector(':scope > a[href]');
                    return !!innerA && isQualifyingHref(innerA.getAttribute('href'));
                }
                return false;
            };
            cell.querySelectorAll('bdi').forEach((bdi) => {
                const kids = Array.from(bdi.childNodes);
                const entityIdx = [];
                kids.forEach((nd, i) => { if (isEntityAnchor(nd)) entityIdx.push(i); });
                if (entityIdx.length < 2) return;
                for (let k = 0; k < entityIdx.length - 1; k++) {
                    const between = kids.slice(entityIdx[k] + 1, entityIdx[k + 1])
                        .filter((nd) => nd.nodeType === Node.TEXT_NODE);
                    if (!between.length) continue;
                    const phrase = between.map((nd) => nd.nodeValue).join('').trim().replace(/\s+/g, ' ');
                    if (phrase) out.push(phrase);
                }
            });
            return out;
        };

        // --- after: nearest common ancestor, any wrapper --------------------
        const newFind = (cell) => {
            const out = [];
            const hostUnder = (node, stop) => {
                let nd = node;
                while (nd && nd.parentNode && nd.parentNode !== stop) nd = nd.parentNode;
                return (nd && nd.parentNode === stop) ? nd : null;
            };
            const commonAncestor = (a, b, root) => {
                const chain = new Set();
                for (let nd = a; nd; nd = nd.parentNode) { chain.add(nd); if (nd === root) break; }
                for (let nd = b; nd; nd = nd.parentNode) { if (chain.has(nd)) return nd; if (nd === root) break; }
                return root;
            };
            cell.querySelectorAll('bdi').forEach((bdi) => {
                const anchors = Array.from(bdi.querySelectorAll('a[href]')).filter((a) =>
                    isQualifyingHref(a.getAttribute('href')) && a.closest('bdi') === bdi);
                if (anchors.length < 2) return;
                for (let k = 0; k < anchors.length - 1; k++) {
                    const anc = commonAncestor(anchors[k], anchors[k + 1], bdi);
                    const hostA = hostUnder(anchors[k], anc);
                    const hostB = hostUnder(anchors[k + 1], anc);
                    if (!hostA || !hostB || hostA === hostB) continue;
                    const kids = Array.from(anc.childNodes);
                    const between = kids.slice(kids.indexOf(hostA) + 1, kids.indexOf(hostB))
                        .filter((nd) => nd.nodeType === Node.TEXT_NODE);
                    if (!between.length) continue;
                    const phrase = between.map((nd) => nd.nodeValue).join('').trim().replace(/\s+/g, ' ');
                    if (phrase) out.push(phrase);
                }
            });
            return out;
        };

        const time = (fn) => {
            const samples = [];
            let found = 0;
            for (let r = 0; r < reps; r++) {
                const t = performance.now();
                let c = 0;
                for (const td of cells) c += fn(td).length;
                samples.push(performance.now() - t);
                found = c;
            }
            samples.sort((a, b) => a - b);
            return { medianMs: +samples[Math.floor(samples.length / 2)].toFixed(1), found };
        };

        // Warm both paths before measuring either.
        oldFind(cells[0]); newFind(cells[0]);
        const before = time(oldFind);
        const after = time(newFind);
        host.remove();

        return {
            phrasesFoundBefore: before.found,
            phrasesFoundAfter: after.found,
            beforeMedianMs: before.medianMs,
            afterMedianMs: after.medianMs,
            deltaMs: +(after.medianMs - before.medianMs).toFixed(1),
            ratio: +(after.medianMs / before.medianMs).toFixed(2),
            perCellDeltaUs: +(((after.medianMs - before.medianMs) * 1000) / n).toFixed(3),
        };
    }, { n: cellCount, reps: repeats });

    await browser.close();

    console.log(JSON.stringify({
        what: '_findCellJoinPhrases(): direct-child boundary vs nearest-common-ancestor boundary, one pass over every cell',
        note: 'phrasesFoundAfter > phrasesFoundBefore is the POINT — the old shape could not see an .mp-wrapped anchor.',
        machine: {
            hostname: os.hostname(), cores: os.cpus().length, node: process.version,
            uptimeHours: +(os.uptime() / 3600).toFixed(1),
        },
        startedAt, finishedAt: new Date().toISOString(),
        cellCount, repeats, ...result,
    }, null, 2));
})();
