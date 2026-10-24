import assert from 'node:assert/strict';
import test from 'node:test';
import { openPDFBrowser } from '../test-support/pdf-browser-fixture.mjs';

async function highlightedLine(page, nested = false) {
    return page.evaluate(nested => {
        const span = [...viewer.getPageView(0).textLayer.div.querySelectorAll('span')].find(e =>
            e.textContent.startsWith('Before highlighted')
        );
        const range = document.createRange();
        range.setStart(span.firstChild, 7);
        range.setEnd(span.firstChild, 24);
        const highlight = document.createElement('hypothesis-highlight');
        highlight.className = 'hypothesis-highlight user-highlights is-transparent';
        highlight.draggable = false;
        range.surroundContents(highlight);
        if (nested) {
            const inner = document.createElement('hypothesis-highlight');
            inner.className = highlight.className;
            range.setStart(highlight.firstChild, 3);
            range.setEnd(highlight.firstChild, 10);
            range.surroundContents(inner);
        }
        const point = (element, offset) => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (offset < node.length) {
                    range.setStart(node, offset);
                    range.setEnd(node, offset + 1);
                    const r = range.getBoundingClientRect();
                    return { x: r.x + r.width * 0.1, y: r.y + r.height / 2 };
                }
                offset -= node.length;
            }
        };
        const secondLine = [...viewer.getPageView(0).textLayer.div.querySelectorAll('span')].find(e =>
            e.textContent.startsWith('The remainder')
        );
        const firstRect = span.getBoundingClientRect();
        const secondRect = secondLine.getBoundingClientRect();
        return {
            start: point(span, 1),
            inside: point(span, nested ? 11 : 8),
            after: point(span, 30),
            end: point(secondLine, 22),
            beforeLine: { x: firstRect.left - 15, y: firstRect.y + firstRect.height / 2 },
            afterLine: { x: secondRect.right + 15, y: secondRect.y + secondRect.height / 2 }
        };
    }, nested);
}

for (const chromiumSelectionVersion of [142, 148]) {
    for (const nested of [false, true]) {
        for (const backward of [false, true]) {
            test(`${backward ? 'backward' : 'forward'} selection crosses ${
                nested ? 'overlapping' : 'existing'
            } highlights (Chromium ${chromiumSelectionVersion} branch)`, async () => {
                const fixture = await openPDFBrowser({ chromiumSelectionVersion });
                const { page, errors } = fixture;
                try {
                    const points = await highlightedLine(page, nested);
                    const start = backward ? points.end : points.start;
                    const end = backward ? points.start : points.end;
                    await page.mouse.move(start.x, start.y);
                    await page.mouse.down();
                    await page.mouse.move(points.inside.x, points.inside.y, { steps: 5 });
                    const during = await page.evaluate(after => {
                        const end = viewer.getPageView(0).textLayer.div.querySelector('.endOfContent');
                        return {
                            text: getSelection().toString(),
                            sentinelInsideText: !!end.closest('span, hypothesis-highlight'),
                            blocked: document.elementFromPoint(after.x, after.y)?.classList.contains('endOfContent')
                        };
                    }, points.after);
                    await page.mouse.move(end.x, end.y, { steps: 12 });
                    await page.mouse.up();
                    const selected = await page.evaluate(() => ({
                        text: getSelection().toString(),
                        paint: document.querySelectorAll('.canvasWrapper .selection').length
                    }));
                    assert.equal(
                        during.blocked,
                        false,
                        'text following a highlight must remain reachable during the drag'
                    );
                    assert.equal(
                        during.sentinelInsideText,
                        false,
                        'the full-page sentinel must not be nested inside a transformed glyph or highlight'
                    );
                    assert.ok(selected.text.includes('after highlighted words.'), JSON.stringify(selected));
                    assert.ok(selected.text.includes('The remainder'), JSON.stringify(selected));
                    assert.ok(!selected.text.includes('Page 1'), JSON.stringify(selected));
                    assert.equal(selected.paint, 1);
                    assert.deepEqual(errors, []);
                } finally {
                    await fixture.close();
                }
            });
        }
    }
}

test('keyboard extension through a PDF highlight preserves plain-text copying', async () => {
    const fixture = await openPDFBrowser({ chromiumSelectionVersion: 142 });
    const { page, errors } = fixture;
    try {
        const { start } = await highlightedLine(page, true);
        await page.mouse.dblclick(start.x, start.y);
        for (let i = 0; i < 35; i++) await page.keyboard.press('Shift+ArrowRight');
        const copied = await page.evaluate(() => {
            const layer = viewer.getPageView(0).textLayer.div;
            const data = new DataTransfer();
            // Run PDF.js's real copy handler without touching the OS clipboard.
            layer.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
            return {
                selection: getSelection().toString(),
                copy: data.getData('text/plain'),
                paint: document.querySelectorAll('.canvasWrapper .selection').length
            };
        });
        assert.ok(copied.selection.includes('highlighted words'), JSON.stringify(copied));
        assert.equal(copied.copy, copied.selection);
        assert.equal(copied.paint, 1);
        assert.deepEqual(errors, []);
    } finally {
        await fixture.close();
    }
});

for (const legacyHelperBoundary of [false, true]) {
    for (const backward of [false, true]) {
        test(`releasing a ${backward ? 'backward' : 'forward'} drag in the line margin keeps the intended selection${
            legacyHelperBoundary ? ' (Obsidian helper boundary)' : ''
        }`, async () => {
            const fixture = await openPDFBrowser({ chromiumSelectionVersion: 142 });
            const { page, errors } = fixture;
            try {
                const points = await highlightedLine(page, true);
                const start = backward ? points.end : points.start;
                const end = backward ? points.beforeLine : points.afterLine;
                await page.mouse.move(start.x, start.y);
                await page.mouse.down();
                await page.mouse.move(points.inside.x, points.inside.y, { steps: 5 });
                await page.mouse.move(end.x, end.y, { steps: 5 });
                await page.mouse.up();
                if (legacyHelperBoundary) {
                    await page.evaluate(
                        ({ backward, end }) => {
                            // Electron's Chromium 142 can finish this drag with focus
                            // inside the empty helper. Reproduce the observed native
                            // boundary atomically with the release event, even when the
                            // test browser has newer native caret fixes.
                            const layer = viewer.getPageView(0).textLayer.div;
                            const [first, second] = layer.querySelectorAll('span[role="presentation"]');
                            const helper = layer.querySelector('.endOfContent');
                            if (backward) first.before(helper);
                            else first.after(helper);
                            const anchor = backward ? second.firstChild : first.firstChild;
                            getSelection().setBaseAndExtent(anchor, backward ? 22 : 1, helper, 0);
                            layer.dispatchEvent(
                                new PointerEvent('pointerup', { clientX: end.x, clientY: end.y, bubbles: true })
                            );
                        },
                        { backward, end }
                    );
                }
                const selected = await page.evaluate(() => getSelection().toString());
                assert.ok(selected.includes('highlighted words'), selected);
                assert.ok(selected.includes('The remainder'), selected);
                assert.ok(
                    !selected.includes('Selection across'),
                    'selection must not jump to the bottom of the page: ' + selected
                );
                if (backward) assert.ok(selected.startsWith('Before'), selected);
                else assert.ok(selected.endsWith('polynomial itself.'), selected);
                assert.deepEqual(errors, []);
            } finally {
                await fixture.close();
            }
        });
    }
}

for (const boundary of ['annotation layer', 'text-layer container']) {
    for (const backward of [false, true]) {
        test(`a first ${
            backward ? 'backward' : 'forward'
        } margin drag ending at the PDF ${boundary} stays on the intended lines`, async () => {
            const fixture = await openPDFBrowser({ chromiumSelectionVersion: 142 });
            const { page, errors } = fixture;
            try {
                const points = await highlightedLine(page, true);
                const start = backward ? points.end : points.start;
                const end = await page.evaluate(backward => {
                    const span = viewer.getPageView(0).textLayer.div.querySelector('span');
                    const r = span.getBoundingClientRect();
                    return { x: backward ? r.left - 15 : r.right + 15, y: r.y + r.height / 2 };
                }, backward);
                await page.mouse.move(start.x, start.y);
                await page.mouse.down();
                await page.mouse.move(end.x, end.y);
                await page.mouse.up();
                await page.evaluate(
                    ({ backward, end, boundary }) => {
                        const p = viewer.getPageView(0);
                        const [first, second] = p.textLayer.div.querySelectorAll('span[role="presentation"]');
                        const overlay =
                            boundary === 'text-layer container'
                                ? p.textLayer.div
                                : p.div.querySelector('.annotationLayer') ||
                                  p.div.appendChild(document.createElement('div'));
                        if (boundary === 'annotation layer') overlay.classList.add('annotationLayer');
                        const anchor = backward ? second.firstChild : first.firstChild;
                        // Obsidian's Chromium 142 can place the first drag's focus at
                        // these layer containers rather than the text-layer helper.
                        getSelection().setBaseAndExtent(anchor, backward ? 22 : 0, overlay, 0);
                        p.div.dispatchEvent(
                            new PointerEvent('pointerup', { clientX: end.x, clientY: end.y, bubbles: true })
                        );
                    },
                    { backward, end, boundary }
                );
                await page.evaluate(
                    () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                );
                const text = await page.evaluate(() => getSelection().toString());
                assert.ok(text.startsWith('Before highlighted words'), text);
                if (backward) assert.ok(text.includes('The remainder'), text);
                else assert.ok(!text.includes('The remainder'), text);
                assert.ok(!text.includes('Selection across'), text);
                assert.ok(!text.includes('Page 1'), text);
                assert.deepEqual(errors, []);
            } finally {
                await fixture.close();
            }
        });
    }
}
