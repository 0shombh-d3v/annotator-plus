import { SAMPLE_PDF_URL, SAMPLE_PDF_URL_BASE64 } from './constants';
import { OfflineIframe } from 'react-offline-iframe';
import React, { useEffect, useRef } from 'react';
import { PdfAnnotationProps } from 'types';
import { b64_to_utf8, utf8_to_b64 } from 'utils';
import { deleteAnnotation, loadAnnotations, writeAnnotation } from 'annotationFileUtils';
import { Annotation } from './types';
import AnnotatorPlugin from 'main';
import {
    checkPseudoAnnotationEquality,
    getAnnotationHighlightTextData,
    isValidAnnotationId,
    isWritableAnnotation
} from 'annotationUtils';
import { MarkdownRenderChild, MarkdownRenderer, TFile, Vault } from 'obsidian';
import { DarkReaderType } from 'darkreader';
import {
    awaitResourceLoading,
    getBundledResourcePath,
    inlineBundledStylesheet,
    isBundledResourceUrl,
    resourcesZip,
    resourceUrls
} from 'resourcesFolder';
import { PdfNoteIndicatorController, setupPdfNoteIndicatorsInFrame } from 'pdfNoteIndicators';
import { targetMatchesRequest } from './targetResolver';
import { isLocalAnnotationApiUrl, shouldBlockExternalHref } from './offlinePolicy';
import { normalizeIframeFetch } from './iframeFetch';

const proxiedHosts = new Set(['cdn.hypothes.is', 'via.hypothes.is', 'hypothes.is']);
const BLOCKED_RESOURCE_URL = 'junk:/blocked';

export default (vault: Vault, plugin: AnnotatorPlugin) => {
    const GenericAnnotation = (
        props: PdfAnnotationProps & {
            baseSrc: string;
            onIframePatch?: (iframe: HTMLIFrameElement) => Promise<void>;
        }
    ) => {
        const darkReaderReferences = useRef(new Set<WeakRef<DarkReaderType>>()).current;
        const markdownRenderChildren = useRef(new Set<MarkdownRenderChild>()).current;
        const disposed = useRef(false);
        const pdfAnnotations = useRef<Annotation[]>([]);
        const pdfNoteIndicatorController = useRef<PdfNoteIndicatorController>(null);
        const sidebarCleanups = useRef(new Set<() => void>()).current;

        const refreshPdfNoteIndicators = (annotations?: Annotation[]) => {
            if (annotations) pdfAnnotations.current = annotations;
            pdfNoteIndicatorController.current?.refresh();
        };

        useEffect(() => {
            disposed.current = false;
            return () => {
                disposed.current = true;
                sidebarCleanups.forEach(cleanup => cleanup());
                sidebarCleanups.clear();
                markdownRenderChildren.forEach(child => child.unload());
                markdownRenderChildren.clear();
                darkReaderReferences.clear();
                pdfNoteIndicatorController.current?.disconnect();
            };
        }, []);

        return (
            <OfflineIframe
                address={props.baseSrc}
                getUrl={url => getProxiedUrl(url, props)}
                fetch={async (requestInfo: RequestInfo, requestInit?: RequestInit) => {
                    const href = typeof requestInfo == 'string' ? requestInfo : requestInfo.url;
                    const url = new URL(href);
                    let res = null;
                    if (href.startsWith('junk:')) {
                        return new Response(null, {
                            status: 403,
                            statusText: 'Blocked by Annotator+ offline policy'
                        });
                    }
                    if (isBundledResourceUrl(href)) return fetch(href);
                    const localApi = isLocalAnnotationApiUrl(url);
                    if (localApi && url.pathname === '/api/search') {
                        try {
                            res = await loadAnnotations(null, vault, props.annotationFile);
                            refreshPdfNoteIndicators(res.rows);
                        } catch (e) {
                            console.error('failed to load annotations', { error: e });
                        }
                    }
                    if (
                        localApi &&
                        (url.pathname === '/api/annotations' || url.pathname.startsWith('/api/annotations/'))
                    ) {
                        const method = (requestInit?.method || 'GET').toUpperCase();
                        if (method === 'DELETE') {
                            let id = '';
                            try {
                                id = decodeURIComponent(url.pathname.slice('/api/annotations/'.length));
                            } catch {
                                // Handled by the validation below.
                            }
                            if (!isValidAnnotationId(id)) {
                                return new Response(null, { status: 400, statusText: 'Invalid annotation ID' });
                            }
                            res = await deleteAnnotation(id, vault, props.annotationFile);
                            if (res.deleted) {
                                refreshPdfNoteIndicators(
                                    pdfAnnotations.current.filter(annotation => annotation.id != res.id)
                                );
                            }
                        } else if (['POST', 'PUT', 'PATCH'].includes(method) && typeof requestInit?.body === 'string') {
                            let annotation: unknown;
                            try {
                                annotation = JSON.parse(requestInit.body);
                            } catch {
                                return new Response(null, { status: 400, statusText: 'Invalid annotation JSON' });
                            }
                            if (!isWritableAnnotation(annotation)) {
                                return new Response(null, { status: 400, statusText: 'Invalid annotation payload' });
                            }
                            res = await writeAnnotation(annotation, plugin, props.annotationFile);
                            refreshPdfNoteIndicators([
                                ...pdfAnnotations.current.filter(annotation => annotation.id != res.id),
                                res
                            ]);
                        } else return new Response(null, { status: 405, statusText: 'Unsupported annotation request' });
                    }
                    if (res) {
                        return new Response(JSON.stringify(res, null, 2), {
                            status: 200,
                            statusText: 'ok'
                        });
                    }
                    await awaitResourceLoading();
                    const folder = resourcesZip;
                    if (proxiedHosts.has(url.host)) {
                        try {
                            const pathName = getBundledResourcePath(url);
                            const file =
                                folder.file(pathName) ||
                                folder.file(`${pathName}.html`) ||
                                folder.file(`${pathName}.json`) ||
                                folder.file(`${decodeURI(pathName)}`) ||
                                folder.file(`${decodeURI(pathName)}.html`) ||
                                folder.file(`${decodeURI(pathName)}.json`);
                            const buf = await file.async('arraybuffer');
                            return new Response(buf, {
                                status: 200,
                                statusText: 'ok'
                            });
                        } catch (e) {
                            if (plugin.settings.debugLogging) {
                                console.warn('Bundled reader resource was not found', { error: e, url: url.href });
                            }
                            return new Response(null, { status: 404, statusText: 'file not found' });
                        }
                    }
                    if (!targetMatchesRequest(props.pdf, url)) {
                        return new Response(null, { status: 403, statusText: 'Blocked by Annotator+ target policy' });
                    }
                    const file = vault.getAbstractFileByPath(props.pdf.path);
                    if (!(file instanceof TFile)) return new Response(null, { status: 404 });
                    return new Response(await vault.readBinary(file), { status: 200 });
                }}
                htmlPostProcessFunction={(html: string) => {
                    const workerUrl = resourceUrls.get('pdfjs/build/pdf.worker.mjs');
                    if (!workerUrl) throw new Error('Bundled PDF worker is unavailable');
                    return html
                        .replaceAll(SAMPLE_PDF_URL_BASE64, utf8_to_b64(props.pdf.url))
                        .replaceAll(SAMPLE_PDF_URL, props.pdf.url)
                        .replaceAll('__ANNOTATOR_PLUS_PDF_WORKER_URL__', workerUrl);
                }}
                postMessagePatchStrategy={null}
                tagPatchStrategy="prototype"
                onAttributeSet={inlineBundledStylesheet}
                onMessagePatchStrategy={null}
                onIframePatch={async iframe => {
                    if (!iframe.contentWindow || !iframe.contentDocument) return;
                    normalizeIframeFetch(iframe.contentWindow);
                    blockExternalNavigation(iframe);
                    const cleanupSidebar = patchSidebarMarkdownRendering(
                        iframe,
                        props.annotationFile,
                        plugin,
                        markdownRenderChildren
                    );
                    if (cleanupSidebar) sidebarCleanups.add(cleanupSidebar);
                    patchIframeEventBubbling(iframe, props.containerEl);
                    await props.onIframePatch?.(iframe);

                    const darkReader = await loadDarkReader(iframe, resourceUrls.get('dark-reader/darkreader.js'));
                    if (darkReader) {
                        const darkReaderReference = new WeakRef(darkReader);
                        darkReaderReferences.add(darkReaderReference);
                        [...darkReaderReferences].filter(r => !r.deref()).forEach(r => darkReaderReferences.delete(r));
                        darkReader.setFetchMethod(iframe.contentWindow.fetch);
                        await props.onDarkReadersUpdated(new Set([darkReaderReference]));
                    }
                    iframe.contentDocument.documentElement.addEventListener('keydown', function (ev) {
                        if (ev.key == 'Shift') {
                            for (const highlightElem of iframe.contentDocument.documentElement.getElementsByTagName(
                                'HYPOTHESIS-HIGHLIGHT'
                            ) as HTMLCollectionOf<HTMLElement>) {
                                highlightElem.draggable = true;
                            }
                        }
                    });
                    iframe.contentDocument.documentElement.addEventListener('keyup', function (ev) {
                        if (ev.key == 'Shift') {
                            for (const highlightElem of iframe.contentDocument.documentElement.getElementsByTagName(
                                'HYPOTHESIS-HIGHLIGHT'
                            ) as HTMLCollectionOf<HTMLElement>) {
                                highlightElem.draggable = false;
                            }
                        }
                    });
                    iframe.contentDocument.documentElement.addEventListener('mousemove', function (ev) {
                        const elem = ev.target as HTMLElement;
                        if (elem.tagName != 'HYPOTHESIS-HIGHLIGHT') {
                            return;
                        }
                        elem.draggable = false;
                        if (ev.shiftKey) {
                            elem.draggable = true;
                        }

                        elem.onkeydown = ev => {
                            elem.draggable = ev.key == 'Shift' || ev.shiftKey;
                        };
                        elem.onkeyup = ev => {
                            elem.draggable &&= ev.key != 'Shift';
                        };

                        elem.ondragstart = async event => {
                            event.dataTransfer.setData('text/plain', 'drag-event::hypothesis-highlight');
                            const pseudoAnnotation = (elem as HTMLElement & { _annotation: Annotation })._annotation;
                            const annotations = await loadAnnotations(null, vault, props.annotationFile);
                            const matchingAnnotations = annotations.rows.filter(annotation =>
                                checkPseudoAnnotationEquality(annotation, pseudoAnnotation)
                            );
                            if (matchingAnnotations.length > 0) {
                                const annotation = matchingAnnotations[0];
                                let { exact } = getAnnotationHighlightTextData(annotation);
                                exact = exact.replace(/[\r\n]/g, ' ');
                                plugin.dragData = {
                                    annotationFilePath: props.annotationFile,
                                    annotationId: annotation.id,
                                    annotationText: exact
                                };
                            }
                        };
                    });
                }}
                webSocketSetup={createServer => {
                    const mockServer = createServer('wss://h-websocket.hypothes.is/ws');
                    mockServer.on('connection', () => '');
                    mockServer.on('message', () => {
                        mockServer.send(
                            JSON.stringify({ type: 'whoyouare', userid: 'Obsidian User', ok: true, reply_to: 1 })
                        );
                    });
                }}
                onload={async iframe => {
                    await props.onload(iframe);
                    if (disposed.current) return;
                    pdfNoteIndicatorController.current?.disconnect();
                    pdfNoteIndicatorController.current = setupPdfNoteIndicatorsInFrame(
                        iframe,
                        () => pdfAnnotations.current
                    );
                }}
                outerIframeProps={{
                    height: '100%',
                    width: '100%',
                    sandbox: 'allow-same-origin allow-scripts allow-modals'
                }}
            />
        );
    };
    return GenericAnnotation;
};

async function loadDarkReader(iframe: HTMLIFrameElement, moduleUrl?: string): Promise<DarkReaderType | null> {
    if (!moduleUrl || !iframe.contentDocument || !iframe.contentWindow) return null;
    return await new Promise(resolve => {
        const resultKey = '__annotatorPlusDarkReader';
        const readyEvent = 'annotator-plus-dark-reader-ready';
        const onReady = () => {
            iframe.contentWindow.removeEventListener(readyEvent, onReady);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve((iframe.contentWindow as any)[resultKey] || null);
        };
        iframe.contentWindow.addEventListener(readyEvent, onReady, { once: true });
        const script = iframe.contentDocument.createElement('script');
        script.type = 'module';
        const wrapperUrl = URL.createObjectURL(
            new Blob(
                [
                    `import * as DarkReader from ${JSON.stringify(moduleUrl)};
window.${resultKey}=DarkReader;
window.dispatchEvent(new Event(${JSON.stringify(readyEvent)}));`
                ],
                { type: 'text/javascript' }
            )
        );
        script.src = wrapperUrl;
        script.onload = () => URL.revokeObjectURL(wrapperUrl);
        script.onerror = () => {
            URL.revokeObjectURL(wrapperUrl);
            resolve(null);
        };
        iframe.contentDocument.head.appendChild(script);
    });
}

function blockExternalNavigation(iframe: HTMLIFrameElement): void {
    iframe.contentDocument?.addEventListener(
        'click',
        event => {
            const target = event.target;
            const link =
                target && typeof (target as Element).closest === 'function' ? (target as Element).closest('a') : null;
            if (
                !link ||
                link.classList.contains('internal-link') ||
                !shouldBlockExternalHref(link.getAttribute('href'))
            ) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
        },
        true
    );
}

function patchSidebarMarkdownRendering(
    iframe: HTMLIFrameElement,
    filePath: string,
    plugin: AnnotatorPlugin,
    renderChildren: Set<MarkdownRenderChild>
): (() => void) | null {
    const source = iframe.getAttribute('patched-src');
    try {
        if (!source || new URL(source).pathname !== '/annotator-plus/sidebar.html') return null;
    } catch {
        return null;
    }

    type HTMLElementConstructor = typeof window.HTMLElement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const IframeElement = (iframe.contentWindow as any).Element;
    const existingKeys = new Set([...Object.getOwnPropertyNames(IframeElement.prototype)]);
    for (const key in Element.prototype) {
        try {
            if (!existingKeys.has(key)) {
                IframeElement.prototype[key] = Element.prototype[key];
            }
        } catch (e) {}
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    class ObsidianMarkdown extends ((iframe.contentWindow as any).HTMLElement as HTMLElementConstructor) {
        markdown: string;
        renderChild?: MarkdownRenderChild;

        clearRenderChild() {
            if (!this.renderChild) return;
            this.renderChild.unload();
            renderChildren.delete(this.renderChild);
            this.renderChild = undefined;
        }

        disconnectedCallback() {
            this.clearRenderChild();
        }

        // Whenever an attibute is changed, this function is called. A switch statement is a good way to handle the various attributes.
        // Note that this also gets called the first time the attribute is set, so we do not need any special initialisation code.
        attributeChangedCallback(name, oldValue, newValue) {
            if (name == 'markdownbase64') {
                this.markdown = b64_to_utf8(newValue);
                (async () => {
                    this.clearRenderChild();
                    this.replaceChildren();
                    const renderChild = new MarkdownRenderChild(this);
                    this.renderChild = renderChild;
                    renderChild.load();
                    renderChildren.add(renderChild);
                    await MarkdownRenderer.renderMarkdown(this.markdown, this, filePath, renderChild);
                    if (this.renderChild !== renderChild) return;
                    const maxDepth = 10;
                    const patchEmbeds = (el: HTMLElement, filePath: string, depth: number) => {
                        if (depth > maxDepth) return;
                        [...el.findAll('.internal-embed')].forEach(async (el: HTMLElement) => {
                            const src = el.getAttribute('src');
                            const target =
                                typeof src === 'string' && plugin.app.metadataCache.getFirstLinkpathDest(src, filePath);
                            if (target instanceof TFile) {
                                el.innerText = '';
                                switch (target.extension) {
                                    case 'md':
                                        const embed = el.createDiv({ cls: 'markdown-embed' });
                                        embed.createDiv({ cls: 'markdown-embed-title', text: target.basename });
                                        const content = embed.createDiv({
                                            cls: 'markdown-embed-content node-insert-event markdown-embed-page'
                                        });
                                        const previewEl = content.createDiv({ cls: 'markdown-preview-view' });
                                        embed.createDiv({
                                            cls: 'markdown-embed-link',
                                            attr: { 'aria-label': 'Open link' }
                                        });
                                        await MarkdownRenderer.renderMarkdown(
                                            await plugin.app.vault.cachedRead(target),
                                            previewEl,
                                            target.path,
                                            renderChild
                                        );
                                        await patchEmbeds(previewEl, target.path, depth + 1);
                                        el.addClasses(['is-loaded']);
                                        break;
                                    default:
                                        el.createEl(
                                            'img',
                                            { attr: { src: plugin.app.vault.getResourcePath(target) } },
                                            img => {
                                                if (el.hasAttribute('width'))
                                                    img.setAttribute('width', el.getAttribute('width'));
                                                if (el.hasAttribute('alt'))
                                                    img.setAttribute('alt', el.getAttribute('alt'));
                                            }
                                        );
                                        el.addClasses(['image-embed', 'is-loaded']);
                                        break;
                                }
                            }
                        });
                    };
                    patchEmbeds(this, filePath, 1);
                })();
            }
        }

        // We need to specify which attributes will be watched for changes. If an attribute is not included here, attributeChangedCallback will never be called for it
        static get observedAttributes() {
            return ['markdownbase64'];
        }
    }

    if (!iframe.contentWindow.customElements.get('obsidian-markdown')) {
        iframe.contentWindow.customElements.define('obsidian-markdown', ObsidianMarkdown);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (iframe.contentWindow as any).renderObsidianMarkdown = markdown => {
        return `<obsidian-markdown markdownbase64="${utf8_to_b64(markdown)}" />`;
    };

    const updateStyles = (css: string) => {
        let style = iframe.contentDocument.getElementById('obsidian-styles') as HTMLStyleElement;
        if (!style) {
            style = iframe.contentDocument.createElement('style');
            style.id = 'obsidian-styles';
            iframe.contentDocument.head.appendChild(style);
        }
        style.textContent = css;
    };
    plugin.styleObserver.listen(updateStyles);
    return () => {
        plugin.styleObserver.remove(updateStyles);
        [...renderChildren].forEach(child => {
            if (child.containerEl.ownerDocument === iframe.contentDocument) {
                child.unload();
                renderChildren.delete(child);
            }
        });
    };
}

export const getProxiedUrl = (url: URL | string, props: PdfAnnotationProps): string => {
    const proxiedUrl = proxy(url, props);
    if (proxiedUrl.protocol == 'zip:') {
        const pathName = proxiedUrl.pathname.replace(/^\//, '');
        const res = resourceUrls.get(pathName) || resourceUrls.get(`${pathName}.html`);
        if (res) return res;
        return BLOCKED_RESOURCE_URL;
    }
    return proxiedUrl.toString();
};

function patchIframeEventBubbling(iframe: HTMLIFrameElement, container: HTMLElement): void {
    const events = [];
    for (const property in container) {
        const match = property.match(/^on(.*)/);
        if (match) {
            events.push(match[1]);
        }
    }
    for (const event of events) {
        iframe.addEventListener(event, ev => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            container.dispatchEvent(new (ev.constructor as any)(ev.type, ev));
        });
    }
}

function proxy(url: URL | string, props: PdfAnnotationProps): URL {
    const href = typeof url == 'string' ? url : url.href;
    const parsedUrl = typeof url == 'string' ? new URL(url) : url;

    if (isBundledResourceUrl(href) || parsedUrl.protocol === 'blob:' || parsedUrl.protocol === 'data:') {
        return parsedUrl;
    }
    if (
        href == SAMPLE_PDF_URL ||
        targetMatchesRequest(props.pdf, parsedUrl) ||
        ((href.startsWith(`https://via.hypothes.is/proxy/static/xP1ZVAo-CVhW7kwNneW_oQ/1628964000/`) ||
            href.startsWith(`https://via.hypothes.is/proxy/static/UsvswpbIZv6ZUQTERtj1CA/1641646800/`) ||
            href.startsWith(`https://via.hypothes.is/proxy/static/VpXumaaWJSJVxmHv4EqN2g/1641916800/`)) &&
            !href.endsWith('.html'))
    ) {
        return new URL(props.pdf.url);
    }
    if (href == `https://hypothes.is/api/`) {
        return new URL(`zip:/fake-service/api.json`);
    }
    if (href == `https://hypothes.is/api/links` || href == `http://localhost:8001/api/links`) {
        return new URL(`zip:/fake-service/api/links.json`);
    }
    if (href.startsWith(`https://hypothes.is/api/`)) {
        return new URL(href.replace(`https://hypothes.is/api/`, `http://localhost:8001/api/`));
    }
    if (isLocalAnnotationApiUrl(parsedUrl)) {
        return parsedUrl;
    }
    if (href == `http://localhost:8001/api/profile`) {
        return new URL(`zip:/fake-service/api/profile.json`);
    }
    if (href.startsWith(`http://localhost:8001/api/profile/groups`)) {
        return new URL(`zip:/fake-service/api/groups.json`);
    }
    if (href.startsWith(`http://localhost:8001/api/groups`)) {
        return new URL(`zip:/fake-service/api/groups.json`);
    }
    if (
        parsedUrl.pathname === '/annotator-plus/sidebar.html' &&
        (parsedUrl.hostname === 'via.hypothes.is' || parsedUrl.protocol === 'app:')
    ) {
        return new URL('zip:/hypothes.is/app.html');
    }
    if (parsedUrl.hostname === 'via.hypothes.is' && parsedUrl.pathname.startsWith('/pdfjs/')) {
        return new URL(`zip:${parsedUrl.pathname}`);
    }
    switch (parsedUrl.hostname) {
        case 'via.hypothes.is':
            return new URL(`zip:/via.hypothes.is${parsedUrl.pathname}`);
        case 'hypothes.is':
            return new URL(`zip:/hypothes.is${parsedUrl.pathname}`);
        case 'cdn.hypothes.is':
            return new URL(`zip:/cdn.hypothes.is${parsedUrl.pathname}`);
        default:
            return new URL(BLOCKED_RESOURCE_URL);
    }
}
