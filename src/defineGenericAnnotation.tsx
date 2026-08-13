import { SAMPLE_PDF_URL, SAMPLE_PDF_URL_BASE64, SAMPLE_EPUB_URL } from './constants';
import { OfflineIframe } from 'react-offline-iframe';
import React, { useEffect, useRef } from 'react';
import { SpecificAnnotationProps } from 'types';
import { b64_to_utf8, utf8_to_b64, wait } from 'utils';
import { deleteAnnotation, loadAnnotations, writeAnnotation } from 'annotationFileUtils';
import { Annotation } from './types';
import AnnotatorPlugin from 'main';
import {
    checkPseudoAnnotationEquality,
    getAnnotationHighlightTextData,
    isValidAnnotationId,
    isWritableAnnotation
} from 'annotationUtils';
import { MarkdownRenderer, TFile, Vault } from 'obsidian';
import { DarkReaderType } from 'darkreader';
import { awaitResourceLoading, resourcesZip, resourceUrls, resourceUrlToPlainText } from 'resourcesFolder';
import { PdfNoteIndicatorController, setupPdfNoteIndicatorsInFrame } from 'pdfNoteIndicators';
import { AnnotationTarget } from './types';
import { targetMatchesRequest } from './targetResolver';
import { fetchHttpsTarget } from './secureFetch';
import { promises as fs } from 'fs';
import { HypothesisMessageRelay } from './messageRelay';

const proxiedHosts = new Set(['cdn.hypothes.is', 'via.hypothes.is', 'hypothes.is']);

const annotationTarget = (props: SpecificAnnotationProps): AnnotationTarget =>
    'pdf' in props ? props.pdf : props.epub;

export default (vault: Vault, plugin: AnnotatorPlugin) => {
    const GenericAnnotation = (
        props: SpecificAnnotationProps & {
            baseSrc: string;
            onIframePatch?: (iframe: HTMLIFrameElement) => Promise<void>;
        }
    ) => {
        const darkReaderReferences = useRef(new Set<WeakRef<DarkReaderType>>()).current;
        const disposed = useRef(false);
        const pdfAnnotations = useRef<Annotation[]>([]);
        const pdfNoteIndicatorController = useRef<PdfNoteIndicatorController>(null);

        const refreshPdfNoteIndicators = (annotations?: Annotation[]) => {
            if (!('pdf' in props)) return;
            if (annotations) pdfAnnotations.current = annotations;
            pdfNoteIndicatorController.current?.refresh();
        };

        useEffect(() => {
            disposed.current = false;
            return () => {
                disposed.current = true;
                relay.current.clear();
                darkReaderReferences.clear();
                pdfNoteIndicatorController.current?.disconnect();
            };
        }, []);

        const relay = useRef(new HypothesisMessageRelay());
        useEffect(() => {
            const listener = (event: MessageEvent) => relay.current.handle(event);
            addEventListener('message', listener);
            return () => removeEventListener('message', listener);
        }, []);

        return (
            <OfflineIframe
                address={props.baseSrc}
                getUrl={url => getProxiedUrl(url, props)}
                fetch={async (requestInfo: RequestInfo, requestInit?: RequestInit) => {
                    const href = typeof requestInfo == 'string' ? requestInfo : requestInfo.url;
                    const url = new URL(href);
                    let res = null;
                    if (href == `junk:/ignore`) {
                        return new Response(JSON.stringify({}, null, 2), {
                            status: 200,
                            statusText: 'ok'
                        });
                    }
                    const localApi = url.origin === 'http://localhost:8001';
                    if (localApi && url.pathname === '/api/search') {
                        try {
                            res = await loadAnnotations(
                                'epub' in props ? new URL(href) : null,
                                vault,
                                props.annotationFile
                            );
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
                    await awaitResourceLoading;
                    const folder = resourcesZip;
                    if (proxiedHosts.has(url.host)) {
                        try {
                            const pathName = `${url.host}${url.pathname}`.replace(/^\//, '');
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
                            console.warn('mockFetch Failed, Error', { e, url });
                            return new Response(null, { status: 404, statusText: 'file not found' });
                        }
                    }
                    const target = annotationTarget(props);
                    if (!targetMatchesRequest(target, url)) {
                        return new Response(null, { status: 403, statusText: 'Blocked by Annotator+ target policy' });
                    }
                    if (target.kind === 'vault') {
                        const file = vault.getAbstractFileByPath(target.path);
                        if (!(file instanceof TFile)) return new Response(null, { status: 404 });
                        return new Response(await vault.readBinary(file), { status: 200 });
                    }
                    if (target.kind === 'file') return new Response(await fs.readFile(target.path), { status: 200 });
                    return fetchHttpsTarget(requestInfo, requestInit);
                }}
                htmlPostProcessFunction={(html: string) => {
                    if ('pdf' in props) {
                        html = html
                            .replaceAll(SAMPLE_PDF_URL_BASE64, utf8_to_b64(props.pdf.url))
                            .replaceAll(SAMPLE_PDF_URL, props.pdf.url);
                    }
                    if ('epub' in props) {
                        html = html.replaceAll(SAMPLE_EPUB_URL, props.epub.url);
                    }
                    return html;
                }}
                postMessagePatchStrategy={null}
                tagPatchStrategy="prototype"
                onAttributeSet={(el: HTMLElement, attr, value, patchedValue) => {
                    if (resourceUrlToPlainText.has(patchedValue)) {
                        const style = el.ownerDocument.createElement('style');
                        style.textContent = resourceUrlToPlainText.get(patchedValue) || null;
                        el.append(style);
                    }
                }}
                onMessagePatchStrategy={null}
                onIframePatch={async iframe => {
                    if (!iframe.contentWindow || !iframe.contentDocument) return;
                    relay.current.register(iframe.contentWindow);
                    patchSidebarMarkdownRendering(iframe, props.annotationFile, plugin);
                    patchIframeEventBubbling(iframe, props.containerEl);
                    await props.onIframePatch?.(iframe);

                    const darkReader = await loadDarkReader(iframe, resourceUrls.get('dark-reader/darkreader.js'));
                    if (darkReader) {
                        darkReaderReferences.add(new WeakRef(darkReader));
                        [...darkReaderReferences].filter(r => !r.deref()).forEach(r => darkReaderReferences.delete(r));
                        darkReader.setFetchMethod(iframe.contentWindow.fetch);
                        await props.onDarkReadersUpdated(darkReaderReferences);
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
                    if ('pdf' in props) {
                        const pdfJsFrame = iframe.contentDocument.getElementsByTagName('iframe')[0];
                        pdfNoteIndicatorController.current?.disconnect();
                        pdfNoteIndicatorController.current = setupPdfNoteIndicatorsInFrame(
                            pdfJsFrame,
                            () => pdfAnnotations.current
                        );
                    }
                    let sidebarFrame;
                    do {
                        await wait(100);
                        if (disposed.current || !iframe.isConnected) return;
                        sidebarFrame =
                            iframe?.contentDocument
                                ?.querySelector('iframe')
                                ?.contentDocument?.querySelector('body > hypothesis-sidebar')
                                ?.shadowRoot?.querySelector('div > iframe') ||
                            iframe?.contentDocument
                                ?.querySelector('body > hypothesis-sidebar')
                                ?.shadowRoot?.querySelector('div > iframe');
                    } while (!sidebarFrame?.contentDocument?.querySelector('body > hypothesis-app'));

                    const style = sidebarFrame.contentDocument.createElement('style');
                    style.textContent = `
        .PublishControlButton--primary {
            border-top-right-radius: 2px;
            border-bottom-right-radius: 2px;
        }

        .annotation-publish-button__menu-wrapper {
            display: none;
        }

        .AnnotationHeader__highlight {
            display: none!important;
        }
        
        .AnnotationShareInfo {
            display: none!important;
        }
        
        .AnnotationHeader__icon {
            display: none!important;
        }
        
        [data-testid="login-links"] {
            display: none!important;
        }

        [data-testid="top-bar-content"] > .Menu {
            display: none!important;
        }

        [data-testid="top-bar-content"] > button[title="Help"] {
            display: none!important;
        }`;
                    sidebarFrame.contentDocument.head.appendChild(style);
                }}
                outerIframeProps={{
                    height: '100%',
                    width: '100%',
                    sandbox: 'allow-same-origin allow-scripts allow-presentation allow-modals'
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
        script.textContent = `import DarkReader from ${JSON.stringify(moduleUrl)};
window.${resultKey}=DarkReader;
window.dispatchEvent(new Event(${JSON.stringify(readyEvent)}));`;
        script.onerror = () => resolve(null);
        iframe.contentDocument.head.appendChild(script);
    });
}

function patchSidebarMarkdownRendering(iframe: HTMLIFrameElement, filePath: string, plugin: AnnotatorPlugin): void {
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

        // Whenever an attibute is changed, this function is called. A switch statement is a good way to handle the various attributes.
        // Note that this also gets called the first time the attribute is set, so we do not need any special initialisation code.
        attributeChangedCallback(name, oldValue, newValue) {
            if (name == 'markdownbase64') {
                this.markdown = b64_to_utf8(newValue);
                (async () => {
                    MarkdownRenderer.renderMarkdown(this.markdown, this, filePath, null);
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
                                        MarkdownRenderer.renderMarkdown(
                                            await plugin.app.vault.cachedRead(target),
                                            previewEl,
                                            target.path,
                                            null
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

    // Now that our class is defined, we can register it
    iframe.contentWindow.customElements.define('obsidian-markdown', ObsidianMarkdown);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (iframe.contentWindow as any).renderObsidianMarkdown = markdown => {
        return `<obsidian-markdown markdownbase64="${utf8_to_b64(markdown)}" />`;
    };
}

export const getProxiedUrl = (url: URL | string, props: SpecificAnnotationProps): string => {
    const proxiedUrl = proxy(url, props);
    if (proxiedUrl.protocol == 'zip:') {
        const pathName = proxiedUrl.pathname.replace(/^\//, '');
        const res = resourceUrls.get(pathName) || resourceUrls.get(`${pathName}.html`);
        if (res) return res;
        return 'junk:/ignore';
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

function proxy(url: URL | string, props: SpecificAnnotationProps): URL {
    const href = typeof url == 'string' ? url : url.href;

    if (
        href == SAMPLE_PDF_URL ||
        ('pdf' in props && props.pdf.url == href) ||
        ((href.startsWith(`https://via.hypothes.is/proxy/static/xP1ZVAo-CVhW7kwNneW_oQ/1628964000/`) ||
            href.startsWith(`https://via.hypothes.is/proxy/static/UsvswpbIZv6ZUQTERtj1CA/1641646800/`) ||
            href.startsWith(`https://via.hypothes.is/proxy/static/VpXumaaWJSJVxmHv4EqN2g/1641916800/`)) &&
            !href.endsWith('.html'))
    ) {
        if (!('pdf' in props)) return new URL('junk:/ignore');
        return new URL(props.pdf.url);
    }
    if (href == SAMPLE_EPUB_URL || ('epub' in props && props.epub.url == href)) {
        if (!('epub' in props)) return new URL('junk:/ignore');
        return new URL(props.epub.url);
    }
    if (href == `https://hypothes.is/api/`) {
        return new URL(`zip:/fake-service/api.json`);
    }
    if (href == `http://localhost:8001/api/links`) {
        return new URL(`zip:/fake-service/api/links.json`);
    }
    if (href == `http://localhost:8001/api/profile`) {
        return new URL(`zip:/fake-service/api/profile.json`);
    }
    if (href.startsWith(`http://localhost:8001/api/profile/groups`)) {
        return new URL(`zip:/fake-service/api/profile/groups.json`);
    }
    if (href.startsWith(`http://localhost:8001/api/groups`)) {
        return new URL(`zip:/fake-service/api/groups.json`);
    }
    if (typeof url == 'string') {
        return new URL(url);
    }
    if (url.hostname === 'via.hypothes.is' && url.pathname.startsWith('/pdfjs/')) {
        return new URL(`zip:${url.pathname}`);
    }
    switch (url.hostname) {
        case 'via.hypothes.is':
            return new URL(`zip:/via.hypothes.is${url.pathname}`);
        case 'hypothes.is':
            return new URL(`zip:/hypothes.is${url.pathname}`);
        case 'cdn.hypothes.is':
            return new URL(`zip:/cdn.hypothes.is${url.pathname}`);
        default:
            return url;
    }
}
