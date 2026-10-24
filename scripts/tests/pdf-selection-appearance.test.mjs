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
const highlightCSS = await readFile(
    new URL('../../resources/cdn.hypothes.is/hypothesis/build/styles/highlights.css', import.meta.url),
    'utf8'
);

function luminance(rgb) {
    return rgb
        .map(n => {
            n /= 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
}

function dominantColor(pixels) {
    const counts = new Map();
    for (const rgb of pixels) {
        const key = rgb.join(',');
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts]
        .sort((a, b) => b[1] - a[1])[0][0]
        .split(',')
        .map(Number);
}

for (const profile of [
    { name: 'light', dark: false, brightness: 100, contrast: 100 },
    { name: 'dark', dark: true, brightness: 100, contrast: 100 },
    { name: 'dark with custom brightness/contrast', dark: true, brightness: 150, contrast: 88 }
]) {
    for (const depth of [0, 1, 2]) {
        test(`PDF selection stays readable in ${profile.name} mode over ${depth} saved highlights`, async () => {
            const { dark } = profile;
            const fixture = await openPDFBrowser();
            const { page, errors } = fixture;
            try {
                await page.addStyleTag({ content: highlightCSS });
                if (dark) {
                    await page.evaluate(
                        async ({ source, fixes, brightness, contrast }) => {
                            const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                            window.DarkReader = await import(url);
                            URL.revokeObjectURL(url);
                            DarkReader.setFetchMethod(fetch);
                            DarkReader.enable({ brightness, contrast, selectionColor: '' }, fixes);
                        },
                        { source: darkReaderSource, fixes: DARK_READER_FIXES, ...profile }
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
                // Reproduce the SVG layer used by Hypothesis with its actual shipped
                // stylesheet, including two translucent highlights at the same spot.
                await page.evaluate(depth => {
                    document.body.classList.add('hypothesis-highlights-always-on');
                    if (!depth) return;
                    const canvas = document.querySelector('.canvasWrapper > canvas');
                    const cr = canvas.getBoundingClientRect(),
                        r = sampleRange.getBoundingClientRect();
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('class', 'hypothesis-highlight-layer');
                    Object.assign(svg.style, {
                        position: 'absolute',
                        inset: '0',
                        width: '100%',
                        height: '100%',
                        mixBlendMode: 'multiply'
                    });
                    for (let i = 0; i < depth; i++) {
                        const rect = document.createElementNS(svg.namespaceURI, 'rect');
                        rect.setAttribute('class', 'hypothesis-svg-highlight');
                        for (const [name, value] of Object.entries({
                            x: (r.left - cr.left) / cr.width,
                            y: (r.top - cr.top) / cr.height,
                            width: r.width / cr.width,
                            height: r.height / cr.height
                        }))
                            rect.setAttribute(name, `${value * 100}%`);
                        svg.append(rect);
                    }
                    canvas.parentElement.append(svg);
                }, depth);
                const unselected = PNG.sync.read(await page.screenshot({ clip: bounds }));
                await page.evaluate(() => {
                    getSelection().removeAllRanges();
                    getSelection().addRange(sampleRange);
                });
                await page.waitForFunction(() => document.querySelector('.canvasWrapper .selection'));
                const paint = await page.evaluate(() => {
                    const selection = getComputedStyle(document.querySelector('.canvasWrapper .selection'));
                    const layer = document.querySelector('.hypothesis-highlight-layer');
                    const rect = layer?.querySelector('rect');
                    return {
                        blue: selection.backgroundColor
                            .match(/[\d.]+/g)
                            .map(Number)
                            .slice(0, 3),
                        fill: rect
                            ? getComputedStyle(rect)
                                  .fill.match(/[\d.]+/g)
                                  .map(Number)
                            : [0, 0, 0, 0],
                        opacity: layer ? Number(getComputedStyle(layer).opacity) : 0,
                        blend: layer ? getComputedStyle(layer).mixBlendMode : 'normal'
                    };
                });
                const after = PNG.sync.read(await page.screenshot({ clip: bounds }));
                let blue = 0,
                    glyphs = 0,
                    preservedGlyphs = 0;
                const glyphPixels = [];
                const allPixels = [];
                const alpha = (1 - (1 - (paint.fill[3] ?? 1)) ** depth) * paint.opacity;
                for (let i = 0; i < before.data.length; i += 4) {
                    const original = [...before.data.subarray(i, i + 3)];
                    const selected = [...after.data.subarray(i, i + 3)];
                    allPixels.push(selected);
                    if (selected[2] > selected[0] + 30 && selected[2] > selected[1] + 20) blue++;
                    if (dark ? Math.min(...original) > 210 : Math.max(...original) < 10) {
                        glyphs++;
                        glyphPixels.push(selected);
                        // Check the original painted glyph at the same pixel, with
                        // only the selection's light/dark blend applied to it.
                        const expected = original.map((n, index) => {
                            const underlay =
                                paint.blend === 'multiply'
                                    ? n * (1 - alpha + (alpha * paint.fill[index]) / 255)
                                    : n * (1 - alpha) + paint.fill[index] * alpha;
                            return dark
                                ? 255 - ((255 - underlay) * (255 - paint.blue[index])) / 255
                                : (underlay * paint.blue[index]) / 255;
                        });
                        if (selected.every((n, index) => Math.abs(n - expected[index]) < 3)) preservedGlyphs++;
                    }
                }
                const pixels = before.width * before.height;
                const background = dominantColor(allPixels),
                    ink = dominantColor(glyphPixels);
                const l1 = luminance(background),
                    l2 = luminance(ink);
                const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                assert.ok(ratio >= 7, `rendered text contrast ${ratio.toFixed(2)}:1 (${ink} on ${background})`);
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
                await page.evaluate(() => getSelection().removeAllRanges());
                await page.waitForFunction(() => !document.querySelector('.canvasWrapper .selection'));
                const restored = PNG.sync.read(await page.screenshot({ clip: bounds }));
                assert.deepEqual(restored.data, unselected.data, 'clearing selection restores saved highlight colors');
            } finally {
                await fixture.close();
            }
        });
    }
}
