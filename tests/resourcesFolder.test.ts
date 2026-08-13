import { getBundledResourcePath } from '../src/resourcesFolder';

describe('getBundledResourcePath', () => {
    it('resolves the upgraded PDF viewer request to its bundled path', () => {
        expect(getBundledResourcePath('https://via.hypothes.is/pdfjs/web/viewer.html')).toBe(
            'pdfjs/web/viewer.html'
        );
        expect(getBundledResourcePath('https://via.hypothes.is/pdfjs/build/pdf.worker.mjs')).toBe(
            'pdfjs/build/pdf.worker.mjs'
        );
    });
});
