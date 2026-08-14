/** @jest-environment jsdom */

import {
    getBundledResourcePath,
    inlineBundledStylesheet,
    isBundledResourceUrl,
    resourceUrls,
    rewriteBundledCss
} from '../src/resourcesFolder';

describe('getBundledResourcePath', () => {
    it('resolves the upgraded PDF viewer request to its bundled path', () => {
        expect(getBundledResourcePath('https://via.hypothes.is/pdfjs/web/viewer.html')).toBe('pdfjs/web/viewer.html');
        expect(getBundledResourcePath('https://via.hypothes.is/pdfjs/build/pdf.worker.mjs')).toBe(
            'pdfjs/build/pdf.worker.mjs'
        );
    });

    it('resolves the bundled sidebar shell from the virtual Via URL', () => {
        expect(getBundledResourcePath('https://via.hypothes.is/annotator-plus/sidebar.html#config=test')).toBe(
            'hypothes.is/app.html'
        );
        expect(getBundledResourcePath('app://obsidian.md/annotator-plus/sidebar.html#config=test')).toBe(
            'hypothes.is/app.html'
        );
    });

    it('recognizes only URLs created for bundled resources', () => {
        resourceUrls.set('test/resource.json', 'blob:bundled-resource');
        expect(isBundledResourceUrl('blob:bundled-resource')).toBe(true);
        expect(isBundledResourceUrl('blob:untrusted-resource')).toBe(false);
        resourceUrls.delete('test/resource.json');
    });

    it('rewrites bundled CSS assets and blocks missing or external URLs', () => {
        const urls = new Map([['cdn.hypothes.is/hypothesis/build/styles/fonts/test.woff2', 'blob:font']]);
        const css =
            '.a{src:url(fonts/test.woff2)}.b{src:url(data:font/woff2;base64,abc)}.c{src:url(https://example.com/x)}';
        expect(rewriteBundledCss(css, 'cdn.hypothes.is/hypothesis/build/styles/annotator.css', urls)).toBe(
            '.a{src:url("blob:font")}.b{src:url(data:font/woff2;base64,abc)}.c{src:url("data:,")}'
        );
    });

    it('replaces a dynamically injected bundled stylesheet and reports it loaded', async () => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        const loaded = jest.fn();
        link.addEventListener('load', loaded);

        inlineBundledStylesheet(link, 'href', 'https://example.com/style.css', 'blob:style', '.a{}');
        document.head.appendChild(link);
        await Promise.resolve();

        expect(document.head.lastElementChild?.tagName).toBe('STYLE');
        expect(document.head.lastElementChild?.textContent).toBe('.a{}');
        expect(loaded).toHaveBeenCalledTimes(1);
    });

    it('keeps style preload metadata without asking Chromium to preload it', async () => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'style';

        inlineBundledStylesheet(link, 'href', 'https://example.com/style.css', 'blob:style', '.a{}');
        document.head.appendChild(link);
        await Promise.resolve();

        expect(document.head.lastElementChild).toMatchObject({ rel: 'annotator-plus-preload' });
        expect((document.head.lastElementChild as HTMLElement).dataset.annotatorPlusStyleUrl).toBe(
            'https://example.com/style.css'
        );
    });
});
