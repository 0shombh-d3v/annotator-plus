import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { openPDFBrowser } from '../test-support/pdf-browser-fixture.mjs';

const require = createRequire(new URL('../../vendor/hypothesis-client/package.json', import.meta.url));
const { PNG } = require('pngjs');
const ts = require('typescript');
const darkReaderSource = await readFile(new URL('../../resources/dark-reader/darkreader.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../../src/darkMode.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { DARK_READER_FIXES } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

for (const dark of [false, true]) {
    test(`PDF selection has a strong blue background and preserves canvas glyphs in ${
        dark ? 'dark' : 'light'
    } mode`, async () => {
        const fixture = await openPDFBrowser();
        const { page, errors } = fixture;
        try {
            if (dark) {
                await page.evaluate(
                    async ({ source, fixes }) => {
                        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                        window.DarkReader = await import(url);
                        URL.revokeObjectURL(url);
                        DarkReader.setFetchMethod(fetch);
                        DarkReader.enable({ brightness: 100, contrast: 100, selectionColor: '' }, fixes);
                    },
                    { source: darkReaderSource, fixes: DARK_READER_FIXES }
                );
                await page.waitForFunction(
                    () => getComputedStyle(document.querySelector('.canvasWrapper > canvas')).filter !== 'none'
                );
            }
            const bounds = await page.evaluate(() => {
                const span = viewer.getPageView(0).textLayer.div.querySelector('span');
                const range = document.createRange();
                range.setStart(span.firstChild, 7);
                range.setEnd(span.firstChild, 24);
                window.sampleRange = range;
                const r = range.getBoundingClientRect();
                return {
                    x: Math.floor(r.x),
                    y: Math.floor(r.y),
                    width: Math.ceil(r.width),
                    height: Math.ceil(r.height)
                };
            });
            const before = PNG.sync.read(await page.screenshot({ clip: bounds }));
            await page.evaluate(() => {
                getSelection().removeAllRanges();
                getSelection().addRange(sampleRange);
            });
            await page.waitForFunction(() => document.querySelector('.canvasWrapper .selection'));
            const after = PNG.sync.read(await page.screenshot({ clip: bounds }));
            let blue = 0,
                glyphs = 0,
                preservedGlyphs = 0;
            for (let i = 0; i < before.data.length; i += 4) {
                const original = [...before.data.subarray(i, i + 3)];
                const selected = [...after.data.subarray(i, i + 3)];
                if (selected[2] > 180 && selected[2] > selected[0] + 70 && selected[2] > selected[1] + 50) blue++;
                if (dark ? Math.min(...original) > 210 : Math.max(...original) < 10) {
                    glyphs++;
                    // Check the original painted glyph at the same pixel, with
                    // only the selection's light/dark blend applied to it.
                    const blueRGB = [15, 117, 240];
                    const expected = original.map((n, index) =>
                        dark ? 255 - ((255 - n) * (255 - blueRGB[index])) / 255 : (n * blueRGB[index]) / 255
                    );
                    if (selected.every((n, index) => Math.abs(n - expected[index]) < 3)) preservedGlyphs++;
                }
            }
            const pixels = before.width * before.height;
            assert.ok(blue / pixels > 0.55, `blue selection coverage ${blue}/${pixels}`);
            assert.ok(glyphs > 40, `original glyph sample ${glyphs}`);
            assert.ok(
                preservedGlyphs / glyphs > 0.95,
                `original canvas glyph pixels preserved ${preservedGlyphs}/${glyphs}`
            );
            const textLayer = await page.evaluate(() => {
                const span = viewer.getPageView(0).textLayer.div.querySelector('span');
                const selectionStyle = getComputedStyle(span, '::selection');
                return {
                    text: getSelection().toString(),
                    foreground: selectionStyle.color,
                    background: selectionStyle.backgroundColor,
                    lineBreak: getComputedStyle(
                        viewer.getPageView(0).textLayer.div.querySelector('br') || span,
                        '::selection'
                    ).backgroundColor
                };
            });
            assert.equal(textLayer.text, 'highlighted words');
            assert.equal(textLayer.foreground, 'rgba(0, 0, 0, 0)', 'fallback DOM font must remain invisible');
            assert.equal(
                textLayer.background,
                'rgba(0, 0, 0, 0)',
                'selection is painted on the canvas, including no selected margin blocks'
            );
            assert.deepEqual(errors, []);
        } finally {
            await fixture.close();
        }
    });
}
