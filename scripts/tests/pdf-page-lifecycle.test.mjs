import assert from 'node:assert/strict';
import test from 'node:test';
import { openPDFBrowser, selectWord, waitForPage } from '../test-support/pdf-browser-fixture.mjs';

test('PDF selection is visible after a page is destroyed and rendered again with editing disabled', async () => {
    const fixture = await openPDFBrowser();
    const { page, errors } = fixture;
    try {
        let selected = await selectWord(page, 'The remainder');
        assert.ok(selected.text.length);
        assert.equal(selected.paint, 1, 'first render selection paints');
        await page.evaluate(() => {
            getSelection().removeAllRanges();
            const p = viewer.getPageView(0);
            window.previousTextLayer = p.textLayer.div;
            // The page buffer calls this same method when evicting a page.
            p.destroy();
            viewer.update();
        });
        await waitForPage(page, 1);
        assert.equal(await page.evaluate(() => viewer.getPageView(0).textLayer.div === previousTextLayer), false);
        selected = await selectWord(page, 'The remainder');
        assert.ok(selected.text.length);
        assert.equal(selected.paint, 1, 'selection must paint on the new text layer after eviction');
        assert.deepEqual(errors, []);
    } finally {
        await fixture.close();
    }
});

test('PDF selection survives scrolling out of the real page buffer and back', async () => {
    const fixture = await openPDFBrowser();
    const { page, errors } = fixture;
    try {
        await page.evaluate(() => {
            window.previousTextLayer = viewer.getPageView(0).textLayer.div;
        });
        for (let number = 3; number <= 19; number += 2) {
            await page.evaluate(number => {
                viewer.currentPageNumber = number;
            }, number);
            await waitForPage(page, number);
        }
        assert.equal(
            await page.evaluate(() => previousTextLayer.isConnected),
            false,
            'first page was actually evicted'
        );
        await page.evaluate(() => {
            viewer.currentPageNumber = 1;
        });
        await waitForPage(page, 1);
        const selected = await selectWord(page, 'The remainder');
        assert.ok(selected.text.length);
        assert.equal(selected.paint, 1, 'selection paint must return with the page');
        for (const scale of ['1.57', 'page-width', 'page-fit']) {
            await page.evaluate(scale => {
                viewer.currentScaleValue = scale;
            }, scale);
            await waitForPage(page, 1);
            const changed = await selectWord(page, 'remainder');
            assert.equal(changed.text, 'remainder', scale);
            assert.equal(changed.paint, 1, `selection after zoom ${scale}`);
        }
        for (const rotation of [90, 0]) {
            await page.evaluate(rotation => {
                viewer.pagesRotation = rotation;
            }, rotation);
            await waitForPage(page, 1);
            const changed = await selectWord(page, 'remainder');
            assert.equal(changed.text, 'remainder', `rotation ${rotation}`);
            assert.equal(changed.paint, 1, `selection after rotation ${rotation}`);
        }
        assert.deepEqual(errors, []);
    } finally {
        await fixture.close();
    }
});
