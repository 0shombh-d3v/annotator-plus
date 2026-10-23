import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../vendor/hypothesis-client/package.json', import.meta.url));
const { chromium } = require('playwright');

test('PDF native selection survives an unchanged zoom, while actual zoom changes clear it', async () => {
    const source = await readFile(new URL('../../resources/pdfjs/web/viewer.mjs', import.meta.url), 'utf8');
    const bootstrap = '  PDFViewerApplication.run(config);';
    assert.equal(source.split(bootstrap).length, 2);
    // Instantiate the actual bundled viewer class without booting the full app.
    // Its constructor and scale setters remain unchanged in this test module.
    const viewerModule = source.replace(bootstrap, '') + '\nexport { PDFViewer, EventBus };\n';
    const html = `<!doctype html>
      <div id="container" style="position:absolute;width:500px;height:500px;overflow:auto"><div id="viewer"></div></div>
      <script type="module">
        try {
          await import('/pdf.mjs');
          const { PDFViewer, EventBus } = await import('/viewer.mjs');
          window.viewer = new PDFViewer({
            container: document.getElementById('container'),
            eventBus: new EventBus(),
            l10n: {},
            renderingQueue: {}
          });
          // Rendering and navigation are outside this selection/scale regression.
          viewer.refresh = () => {};
          viewer.scrollPageIntoView = () => {};
          viewer.pdfDocument = { numPages: 1 };
          viewer._pages = [{ width: 500, height: 800, scale: 1 }];
          viewer._currentScale = 1;
          viewer._currentScaleValue = '1';
          const word = document.createElement('span');
          word.id = 'word';
          word.textContent = 'Selection';
          viewer.viewer.append(word);
          window.ready = true;
        } catch (error) { window.failure = String(error); }
      </script>`;
    const routes = new Map([
        ['/', ['text/html', html]],
        ['/viewer.mjs', ['text/javascript', viewerModule]],
        [
            '/pdf.mjs',
            ['text/javascript', await readFile(new URL('../../resources/pdfjs/build/pdf.mjs', import.meta.url))]
        ]
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
        await page.waitForFunction(() => window.ready || window.failure);
        assert.equal(await page.evaluate(() => window.failure), undefined);
        for (const mode of ['1', 'auto', 'page-fit', 'page-width']) {
            await page.evaluate(mode => {
                viewer.currentScaleValue = mode;
            }, mode);
            await page.locator('#word').dblclick();
            assert.equal(await page.evaluate(() => getSelection().toString()), 'Selection');
            const unchanged = await page.evaluate(mode => {
                viewer.currentScaleValue = mode;
                return getSelection().toString();
            }, mode);
            assert.equal(unchanged, 'Selection', mode);
        }
        const changed = await page.evaluate(() => {
            viewer.currentScaleValue = '2';
            return { selection: getSelection().toString(), scale: viewer.currentScale };
        });
        assert.deepEqual(changed, { selection: '', scale: 2 });
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
});
