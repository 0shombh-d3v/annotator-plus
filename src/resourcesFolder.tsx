import JSZip from 'jszip';

import { get_url_extension } from './utils';
import mime from 'mime';

export const resourcesZip = new JSZip();
export const resourceUrls = new Map<string, string>();
const resourceStyles = new Map<string, string>();

export const isBundledResourceUrl = (url: string): boolean => [...resourceUrls.values()].includes(url);

function bufferToBlobUrl(buffer: ArrayBuffer, type: string) {
    const blob = new Blob([buffer], { type });
    return URL.createObjectURL(blob);
}

export function getBundledResourcePath(url: URL | string): string {
    const parsedUrl = typeof url == 'string' ? new URL(url) : url;
    if (
        parsedUrl.pathname === '/annotator-plus/sidebar.html' &&
        (parsedUrl.hostname === 'via.hypothes.is' || parsedUrl.protocol === 'app:')
    ) {
        return 'hypothes.is/app.html';
    }
    if (parsedUrl.hostname === 'via.hypothes.is' && parsedUrl.pathname.startsWith('/pdfjs/')) {
        return parsedUrl.pathname.replace(/^\//, '');
    }
    return `${parsedUrl.host}${parsedUrl.pathname}`.replace(/^\//, '');
}

export function rewriteBundledCss(
    css: string,
    stylesheetPath: string,
    urls: ReadonlyMap<string, string> = resourceUrls
): string {
    const stylesheetUrl = `https://${stylesheetPath}`;
    return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (match, _quote, reference) => {
        if (/^(?:data:|blob:|#)/.test(reference)) return match;
        try {
            const path = getBundledResourcePath(new URL(reference, stylesheetUrl));
            const bundledUrl = urls.get(path);
            return `url("${bundledUrl || 'data:,'}")`;
        } catch {
            return 'url("data:,")';
        }
    });
}

export function inlineBundledStylesheet(
    element: HTMLElement,
    attribute: string,
    originalUrl: string,
    bundledUrl: string,
    css = resourceStyles.get(bundledUrl)
): void {
    if (attribute !== 'href' || element.tagName !== 'LINK') return;
    const link = element as HTMLLinkElement;
    const rel = link.rel;

    // These preloads are only an optimization. The offline fetch shim serves
    // the same API data, so letting Chromium preload the blob just produces an
    // unused-preload warning.
    if (rel === 'preload' && link.as === 'fetch' && originalUrl.startsWith('https://hypothes.is/api/')) {
        link.rel = 'annotator-plus-preload';
        queueMicrotask(() => link.remove());
        return;
    }

    if (!css) return;
    if (rel !== 'stylesheet' && !(rel === 'preload' && link.as === 'style')) return;
    link.rel = 'annotator-plus-pending-style';
    queueMicrotask(() => {
        if (rel === 'preload' && link.as === 'style') {
            const marker = link.ownerDocument.createElement('link');
            marker.rel = 'annotator-plus-preload';
            marker.dataset.annotatorPlusStyleUrl = originalUrl;
            marker.setAttribute('data-hypothesis-asset', '');
            link.replaceWith(marker);
            return;
        }
        if (rel !== 'stylesheet') return;

        const style = link.ownerDocument.createElement('style');
        style.textContent = css;
        style.setAttribute('data-hypothesis-asset', '');
        link.replaceWith(style);
        const loadEvent = link.ownerDocument.createEvent('Event');
        loadEvent.initEvent('load', false, false);
        link.dispatchEvent(loadEvent);
    });
}

async function _loadResourcesZip(zipObject: JSZip | Promise<JSZip>): Promise<JSZip> {
    const zip = await zipObject;
    for (const filePath of Object.keys(zip.files)) {
        const file = zip.file(filePath);
        if (!file || file.dir) continue;
        const buf = await file.async('arraybuffer');
        const type = mime.getType(get_url_extension(filePath));
        const url = bufferToBlobUrl(buf, type);
        resourceUrls.set(filePath, url);
    }

    for (const filePath of Object.keys(zip.files)) {
        if (mime.getType(get_url_extension(filePath)) !== 'text/css') continue;
        const file = zip.file(filePath);
        if (!file) continue;
        const url = resourceUrls.get(filePath);
        if (url) resourceStyles.set(url, rewriteBundledCss(await file.async('string'), filePath));
    }

    return await resourcesZip.loadAsync(await zip.generateAsync({ type: 'blob' }), { createFolders: true });
}

let loadingPromise: Promise<JSZip> = null;

export async function unloadResources() {
    for (const url of resourceUrls.values()) {
        URL.revokeObjectURL(url);
    }
    const paths: string[] = [];
    resourcesZip.forEach(path => {
        paths.push(path);
    });
    for (const path of paths) {
        resourcesZip.remove(path);
    }
    resourceUrls.clear();
    resourceStyles.clear();
    loadingPromise = null;
}

export async function loadResourcesZip(zipObject: JSZip | Promise<JSZip>) {
    const _loadingPromise = loadingPromise;
    loadingPromise = (async () => {
        await _loadingPromise;
        return await _loadResourcesZip(zipObject);
    })();
    return await loadingPromise;
}

export async function awaitResourceLoading() {
    await loadingPromise;
}
