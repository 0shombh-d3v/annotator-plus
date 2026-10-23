import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../vendor/hypothesis-client/package.json', import.meta.url));
const { chromium } = require('playwright');
const resourceRoot = new URL('../../resources/pdfjs/', import.meta.url);

// A generated, redistributable PDF. Real canvas rendering, text layout, worker,
// page buffering, and selection run against the exact reader shipped in main.js.
function fixturePDF(pages = 20) {
    const objects = [null, '', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>'];
    const kids = [];
    for (let i = 1; i <= pages; i++) {
        const pageId = objects.length;
        const contentId = pageId + 1;
        kids.push(`${pageId} 0 R`);
        objects.push(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
        );
        const content = `BT /F1 18 Tf 48 720 Td (Before highlighted words after highlighted words.) Tj 0 -32 Td (The remainder will be the polynomial itself.) Tj 0 -32 Td (Selection across lines should keep the original font.) Tj 0 -32 Td (Page ${i}.) Tj ET`;
        objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    }
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Count ${pages} /Kids [${kids.join(' ')}] >>`;
    let pdf = '%PDF-1.7\n';
    const offsets = [0];
    for (let i = 1; i < objects.length; i++) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    pdf += offsets
        .slice(1)
        .map(n => `${String(n).padStart(10, '0')} 00000 n \n`)
        .join('');
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
}

export async function openPDFBrowser({ chromiumSelectionVersion } = {}) {
    const source = await readFile(new URL('web/viewer.mjs', resourceRoot), 'utf8');
    const bootstrap = '  PDFViewerApplication.run(config);';
    assert.equal(source.split(bootstrap).length, 2);
    const viewerModule = source.replace(bootstrap, '') + '\nexport { PDFViewer, EventBus };\n';
    const html = `<!doctype html><link rel="stylesheet" href="/pdfjs/web/viewer.css">
      <style>body{margin:0}#container{position:absolute;inset:0;overflow:auto}</style>
      <div id="container"><div id="viewer" class="pdfViewer"></div></div>
      <script type="module">
        try {
          await import('/pdfjs/build/pdf.mjs');
          pdfjsLib.GlobalWorkerOptions.workerSrc='/pdfjs/build/pdf.worker.mjs';
          const { PDFViewer, EventBus } = await import('/viewer-test.mjs');
          window.viewer = new PDFViewer({
            container: document.getElementById('container'),
            eventBus: new EventBus(), annotationEditorMode: -1,
            enableAutoLinking: false, enableDetailCanvas: false,
            minDurationToUpdateCanvas: 0
          });
          const task=pdfjsLib.getDocument({url:'/fixture.pdf',useSystemFonts:true,isEvalSupported:false});
          window.doc=await task.promise;
          const pagesInit=new Promise(resolve=>viewer.eventBus.on('pagesinit',resolve,{once:true}));
          viewer.setDocument(doc);
          await pagesInit;
          viewer.currentScaleValue='1';
          window.ready=true;
        } catch(error) { window.failure=String(error.stack || error); }
      </script>`;
    const server = createServer(async (request, response) => {
        try {
            if (request.url === '/') return response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
            if (request.url === '/fixture.pdf')
                return response.writeHead(200, { 'Content-Type': 'application/pdf' }).end(fixturePDF());
            if (request.url === '/viewer-test.mjs')
                return response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(viewerModule);
            const name = request.url.replace(/^\/pdfjs\//, '');
            if (!request.url.startsWith('/pdfjs/') || name.includes('..')) return response.writeHead(404).end();
            const body = await readFile(new URL(name, resourceRoot));
            return response
                .writeHead(200, { 'Content-Type': name.endsWith('.mjs') ? 'text/javascript' : 'text/css' })
                .end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
        if (chromiumSelectionVersion) {
            // Obsidian's Electron 39 uses Chromium 142. Exercise PDF.js's
            // pre-148 selection workaround as well as the current browser path.
            await page.addInitScript(version => {
                Object.defineProperty(navigator, 'userAgentData', { value: undefined });
                Object.defineProperty(navigator, 'userAgent', { value: `Mozilla/5.0 Chrome/${version}.0.0.0` });
            }, chromiumSelectionVersion);
        }
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.ready || window.failure);
        assert.equal(await page.evaluate(() => window.failure), undefined);
        await waitForPage(page, 1);
        return {
            page,
            errors,
            close: async () => {
                await browser.close();
                await new Promise(resolve => server.close(resolve));
            }
        };
    } catch (error) {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
        throw error;
    }
}

export async function waitForPage(page, number) {
    await page.waitForFunction(number => {
        const p = window.viewer?.getPageView(number - 1);
        return (
            p?.renderingState === 3 &&
            p.textLayer?.div?.isConnected &&
            p.textLayer.div.querySelector('span') &&
            p.drawLayer?.getDrawLayer()
        );
    }, number);
}

export async function selectWord(page, word) {
    const point = await page.evaluate(word => {
        const span = [...viewer.getPageView(viewer.currentPageNumber - 1).textLayer.div.querySelectorAll('span')].find(
            e => e.textContent.includes(word)
        );
        const offset = span.textContent.indexOf(word) + Math.floor(word.length / 2);
        const range = document.createRange();
        range.setStart(span.firstChild, offset);
        range.setEnd(span.firstChild, offset + 1);
        const r = range.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, word);
    // Native input, so PDF.js, selection observers and pointer handlers all run.
    await page.mouse.dblclick(point.x, point.y);
    return page.evaluate(() => ({
        text: getSelection().toString(),
        paint: document.querySelectorAll('.canvasWrapper .selection').length
    }));
}
