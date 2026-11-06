// @ts-check
// The viewer's tools added in image section P4b (org/image-handling.org 1b):
// Adjust (A), Compare (C), Loupe (L), Copy URL (Y / Shift+Y) and the key
// help (?). Same set-up as the other viewer specs (artViewerFixture.js: the
// medley release, every picture a real-size SVG).

const { test, expect } = require('../support/test');
const { openRelease, openViewerOnBigImage, VIEWER, RECORD } = require('../support/artViewerFixture');

const N = RECORD.images.length;
const pos = (page) => page.locator(`${VIEWER} .mb-artv-pos`).textContent();
const stageImg = (page) => page.locator(`${VIEWER} .mb-artv-stage .mb-artv-img`);

test.describe('artwork viewer tools (image section P4b)', () => {
    test('Adjust (A): sliders and Invert filter the picture live; a slider keeps its arrow keys; Reset; a step starts neutral', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await page.keyboard.press('a');
        const panel = page.locator(`${VIEWER} .mb-artv-adjust`);
        await expect(panel).toBeVisible();
        await panel.locator('input[data-artv-adj="b"]').evaluate((r) => { r.value = '150'; r.dispatchEvent(new Event('input', { bubbles: true })); });
        await panel.locator('input[data-artv-adj="inv"]').check();
        await expect.poll(() => stageImg(page).evaluate(i => i.style.filter)).toBe('brightness(150%) invert(1)');
        // A re-render (Info off) builds the stage anew: the filter stays.
        await page.locator(`${VIEWER} button[data-artv="info"]`).click();
        await expect.poll(() => stageImg(page).evaluate(i => i.style.filter)).toBe('brightness(150%) invert(1)');
        // A focused slider moves with ←/→; the picture does not step.
        const before = await pos(page);
        await panel.locator('input[data-artv-adj="c"]').focus();
        await page.keyboard.press('ArrowRight');
        expect(await pos(page)).toBe(before);
        expect(Number(await panel.locator('input[data-artv-adj="c"]').inputValue())).toBeGreaterThan(100);
        // Reset: neutral, no filter at all.
        await panel.locator('button[data-artv="adjreset"]').click();
        await expect.poll(() => stageImg(page).evaluate(i => i.style.filter)).toBe('');
        // Adjusted again, then a step: the next picture starts neutral, the panel stays.
        await panel.locator('input[data-artv-adj="g"]').evaluate((r) => { r.value = '100'; r.dispatchEvent(new Event('input', { bubbles: true })); });
        await expect.poll(() => stageImg(page).evaluate(i => i.style.filter)).toBe('grayscale(100%)');
        await page.locator(`${VIEWER} .mb-artv-next`).click();
        await expect.poll(() => stageImg(page).evaluate(i => i.style.filter)).toBe('');
        await expect(panel).toBeVisible();
    });

    test('Compare (C): two pictures; ← → and the filmstrip change the right one; zoom keys do nothing; Esc leaves Compare, then closes', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await page.keyboard.press('c');
        const caps = page.locator(`${VIEWER} .mb-artv-compare .mb-artv-cmp figcaption`);
        await expect(page.locator(`${VIEWER} .mb-artv-compare .mb-artv-cmp-img`)).toHaveCount(2);
        await expect(caps.nth(0)).toContainText(`Left: 1 / ${N}`);
        await expect(caps.nth(1)).toContainText(`Right: 2 / ${N}`);
        await page.keyboard.press('ArrowRight');
        await expect(caps.nth(1)).toContainText(`Right: 3 / ${N}`);
        await expect(caps.nth(0), 'the left one stays').toContainText(`Left: 1 / ${N}`);
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await expect(caps.nth(1), 'round, skipping the left one').toContainText(`Right: ${N} / ${N}`);
        await page.locator(`${VIEWER} .mb-artv-film [data-artv-go]`).nth(5).click();
        await expect(caps.nth(1)).toContainText(`Right: 6 / ${N}`);
        await page.keyboard.press('ArrowUp');
        await expect(page.locator(`${VIEWER} .mb-artv-compare`), 'zoom is not Compare\'s').toHaveCount(1);
        // The ↑ in Compare must not zoom the picture behind it: out of Compare it is fitted.
        await page.keyboard.press('Escape');
        await expect(page.locator(`${VIEWER} .mb-artv-compare`)).toHaveCount(0);
        await expect(page.locator(VIEWER)).toBeVisible();
        expect(await stageImg(page).evaluate(i => i.style.transform), 'no zoom left over from Compare').not.toContain('scale(');
        await page.keyboard.press('Escape');
        await expect(page.locator(VIEWER)).toBeHidden();
    });

    test('Compare from Spreads: a page of a paired spread opens both pages side by side; Esc closes the viewer', async ({ page }) => {
        await openRelease(page);
        await page.click('.mb-release-art-sec [data-mb-art-layout="spreads"]');
        const pair = page.locator('.mb-release-art-spread[data-mb-art-spread]').first();
        const [l, r] = (await pair.getAttribute('data-mb-art-spread')).split(',').map(Number);
        await pair.locator('figure.mb-release-art-tile > a').nth(1).click();
        const imgs = page.locator(`${VIEWER} .mb-artv-compare .mb-artv-cmp-img`);
        await expect(imgs).toHaveCount(2);
        expect(await imgs.evaluateAll(xs => xs.map(x => Number(x.dataset.artvI)))).toEqual([l, r]);
        await page.keyboard.press('Escape');
        await expect(page.locator(VIEWER), 'opened into Compare: Esc closes').toBeHidden();
    });

    test('Loupe (L): a lens over the picture with its own pixels 2.5× — also turned; hidden off the picture', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await page.keyboard.press('l');
        const lens = page.locator(`${VIEWER} .mb-artv-loupe`);
        await expect(lens).toBeHidden();
        const img = stageImg(page);
        const box = await img.boundingBox();
        // Near the top-left corner of the upright picture: its own top-left.
        await page.mouse.move(box.x + 2, box.y + 2);
        await expect(lens).toBeVisible();
        const read = () => lens.evaluate((el) => {
            const [bw, bh] = el.style.backgroundSize.split(' ').map(parseFloat);
            const [bx, by] = el.style.backgroundPosition.split(' ').map(parseFloat);
            const i = document.querySelector('#mb-art-viewer .mb-artv-stage .mb-artv-img');
            return { bw, bh, bx, by, w: i.offsetWidth, h: i.offsetHeight, img: el.style.backgroundImage, tf: el.style.transform };
        });
        let v = await read();
        expect(v.bw).toBeCloseTo(v.w * 2.5, 0);
        expect(v.bh).toBeCloseTo(v.h * 2.5, 0);
        expect(v.img).toContain('url(');
        expect(v.bx, 'the lens shows the picture\'s left edge').toBeGreaterThan(70);
        expect(v.by, 'and its top edge').toBeGreaterThan(70);
        // Turned a quarter: the screen's top-left is the picture's bottom-left.
        await page.keyboard.press('r');
        const box2 = await img.boundingBox();
        await page.mouse.move(box2.x + 2, box2.y + 2);
        v = await read();
        expect(v.tf).toContain('rotate(90deg)');
        expect(v.bx, 'still the left edge').toBeGreaterThan(70);
        expect(v.by, 'the bottom edge now').toBeLessThan(75 - v.bh + 10);
        // Off the picture: no lens.
        await page.mouse.move(2, 2);
        await expect(lens).toBeHidden();
    });

    test('Copy URL (Y): the picture\'s address; Shift+Y a line for an edit note', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await openRelease(page);
        await openViewerOnBigImage(page);
        const im = RECORD.images[0];
        const url = im.image.replace(/^https?:/, 'https:');
        await page.keyboard.press('y');
        await expect(page.locator(`${VIEWER} .mb-artv-note`)).toContainText('Copied:');
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
        await page.keyboard.press('Shift+Y');
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toBe(`${(im.types || []).join(' / ')}${im.comment ? ` (${im.comment})` : ''}: ${url}`);
    });

    test('Keys (?): every key, the new ones marked; Esc closes the help before the viewer; the info panel names them too', async ({ page }) => {
        await openRelease(page);
        await openViewerOnBigImage(page);
        await expect(page.locator(`${VIEWER} .mb-tt-foot`).last()).toContainText('A adjust · C compare · L loupe · Y copy URL · ? keys');
        await page.keyboard.press('?');
        const help = page.locator(`${VIEWER} .mb-artv-help`);
        await expect(help).toBeVisible();
        await expect(help.locator('dt')).toContainText(['← →', 'A', 'C', 'L', 'Y Shift+Y', '?', 'Esc']);
        await expect(help.locator('.mb-artv-help-new')).toHaveCount(5);
        // vzell 2026-11-06 (screenshot): the info panel hid the last column, and
        // the box covered the bar's second row. Every key's line is on top here,
        // and the box starts under the bar.
        const geo = await page.evaluate(() => {
            const h = document.querySelector('#mb-art-viewer .mb-artv-help');
            const bar = document.querySelector('#mb-art-viewer > .mb-artv-bar');
            const hidden = Array.from(h.querySelectorAll('dd')).filter((dd) => {
                const r = dd.getBoundingClientRect();
                const at = document.elementFromPoint(r.left + Math.min(8, r.width / 2), r.top + r.height / 2);
                return !(at && h.contains(at));
            }).map(dd => dd.textContent);
            // The box's own right edge, over where the info panel is: still the box.
            const hr = h.getBoundingClientRect();
            const edge = document.elementFromPoint(hr.right - 6, hr.top + 30);
            return { hidden, edgeOnTop: !!(edge && h.contains(edge)), top: hr.top, barBottom: bar.getBoundingClientRect().bottom };
        });
        expect(geo.hidden, 'no key line under the info panel').toEqual([]);
        expect(geo.edgeOnTop, 'the box is above the info panel').toBe(true);
        expect(geo.top, 'under the bar').toBeGreaterThanOrEqual(geo.barBottom);
        await page.keyboard.press('Escape');
        await expect(help).toHaveCount(0);
        await expect(page.locator(VIEWER)).toBeVisible();
        await page.locator(`${VIEWER} button[data-artv="help"]`).click();
        await expect(help).toBeVisible();
        await help.click();
        await expect(help).toHaveCount(0);
    });
});
