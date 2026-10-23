import { Worker } from 'worker_threads';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';

test('the PDF worker supplies missing runtime APIs instead of silently dropping embedded fonts', async () => {
    const workerUrl = pathToFileURL(path.resolve(__dirname, '../resources/pdfjs/build/pdf.worker.mjs')).href;
    const worker = new Worker(
        `
        const { parentPort } = require('worker_threads');
        Math.sumPrecise = undefined;
        Map.prototype.getOrInsertComputed = undefined;
        Promise.try = undefined;
        (async () => {
            await import(${JSON.stringify(workerUrl)});
            const map = new Map();
            parentPort.postMessage({ sum: Math.sumPrecise([1e20, 1, -1e20]), mapped: map.getOrInsertComputed('font', () => 42), promise: await Promise.try(() => 17) });
        })().catch(error => { throw error; });
    `,
        { eval: true }
    );
    try {
        const result = await new Promise((resolve, reject) => {
            worker.once('message', resolve);
            worker.once('error', reject);
        });
        expect(result).toEqual({ sum: 1, mapped: 42, promise: 17 });
    } finally {
        await worker.terminate();
    }
}, 15000);

test('both PDF realms use the pinned compatibility build', () => {
    for (const name of ['pdf.mjs', 'pdf.worker.mjs']) {
        const source = fs.readFileSync(path.resolve(__dirname, '../resources/pdfjs/build', name), 'utf8');
        expect(source).toContain('pdfjsVersion = 6.2.108');
        expect(source).toContain('es.math.sum-precise.js');
        expect(source).toContain('es.map.get-or-insert-computed.js');
    }
});
