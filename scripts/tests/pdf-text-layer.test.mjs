import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../vendor/hypothesis-client/package.json', import.meta.url));
const { chromium } = require('playwright');

test('PDF text remains selectable when its first page renders in a hidden tab', async () => {
    const frameHTML = `<!doctype html><link rel="stylesheet" href="/viewer.css">
      <div style="--total-scale-factor:1;width:200px;height:200px;position:relative">
        <div id="text" class="textLayer"></div>
      </div>
      <script type="module">
        import { TextLayer } from '/pdf.mjs';
        try {
          const layer = new TextLayer({
            container: document.getElementById('text'),
            viewport: { scale: 1, rotation: 0, rawDims: { pageWidth: 200, pageHeight: 200, pageX: 0, pageY: 0 } },
            textContentSource: {
              items: [{ str: 'Selectable PDF text', dir: 'ltr', transform: [12, 0, 0, 12, 20, 40], width: 100, height: 12, fontName: 'test', hasEOL: true }],
              styles: { test: { fontFamily: 'serif', ascent: 0.8, descent: -0.2, vertical: false } }
            }
          });
          await layer.render();
          window.ready = true;
        } catch (error) { window.failure = String(error); }
      </script>`;
    const routes = new Map([
        [
            '/pdf.mjs',
            ['text/javascript', await readFile(new URL('../../resources/pdfjs/build/pdf.mjs', import.meta.url))]
        ],
        ['/viewer.css', ['text/css', await readFile(new URL('../../resources/pdfjs/web/viewer.css', import.meta.url))]],
        ['/frame.html', ['text/html', frameHTML]],
        ['/', ['text/html', '<!doctype html><body></body>']]
    ]);
    const server = createServer((request, response) => {
        const route = routes.get(request.url);
        if (!route) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { 'Content-Type': route[0] }).end(route[1]);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        for (const hidden of [false, true]) {
            await page.evaluate(hidden => {
                const frame = document.createElement('iframe');
                frame.id = hidden ? 'hidden' : 'visible';
                if (hidden) frame.style.display = 'none';
                frame.src = '/frame.html';
                document.body.append(frame);
            }, hidden);
            const id = hidden ? 'hidden' : 'visible';
            await page.waitForFunction(id => {
                const frame = document.getElementById(id);
                return frame.contentWindow.ready || frame.contentWindow.failure;
            }, id);
            const result = await page.evaluate(id => {
                const frame = document.getElementById(id);
                frame.style.display = 'block';
                const doc = frame.contentDocument,
                    span = doc.querySelector('#text span');
                const range = doc.createRange();
                range.selectNodeContents(span);
                return {
                    failure: frame.contentWindow.failure,
                    minimum: Number(doc.getElementById('text').style.getPropertyValue('--min-font-size')),
                    fontSize: parseFloat(frame.contentWindow.getComputedStyle(span).fontSize),
                    width: range.getBoundingClientRect().width,
                    height: range.getBoundingClientRect().height,
                    text: range.toString()
                };
            }, id);
            assert.equal(result.failure, undefined);
            assert.ok(result.minimum > 0 && result.fontSize > 0, JSON.stringify({ hidden, ...result }));
            assert.ok(result.width > 0 && result.height > 0, JSON.stringify({ hidden, ...result }));
            assert.equal(result.text, 'Selectable PDF text');
        }
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
});
