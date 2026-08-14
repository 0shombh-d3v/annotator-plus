import { checkPseudoAnnotationEquality } from './annotationUtils';
import { Annotation } from './types';

const HIGHLIGHT_SELECTOR = 'hypothesis-highlight';
const HIGHLIGHT_RENDER_SELECTOR = `${HIGHLIGHT_SELECTOR}, .hypothesis-svg-highlight`;
const MARKED_HIGHLIGHT_CLASS = 'obsidian-annotator-note-highlight';
const FOCUS_TARGET_CLASS = 'obsidian-annotator-note-focus-target';
const INDICATOR_CLASS = 'obsidian-annotator-note-indicator';
const REFRESHING_PAGE_CLASS = 'obsidian-annotator-note-refreshing';
const STYLE_ID = 'obsidian-annotator-note-indicator-styles';
const LEGACY_MARKER_CLASS = 'obsidian-annotator-note-marker';
const LEGACY_STYLE_ID = 'obsidian-annotator-note-marker-styles';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type HighlightElement = HTMLElement & {
    _annotation?: Annotation & { $tag?: string };
    svgHighlight?: SVGRectElement;
    noteIndicatorOriginalAttributes?: {
        ariaLabel: string | null;
        role: string | null;
        tabIndex: string | null;
    };
};

export type PdfNoteIndicatorController = {
    refresh: () => void;
    disconnect: () => void;
};

const noOpController: PdfNoteIndicatorController = { refresh: () => undefined, disconnect: () => undefined };

const styles = `
    .page:has(.textLayer[hidden]) .hypothesis-highlight-layer,
    .page.${REFRESHING_PAGE_CLASS} .hypothesis-highlight-layer {
        visibility: hidden;
    }

    .${INDICATOR_CLASS} {
        stroke: #991b1b;
        stroke-width: 2.5px;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
    }

    .${FOCUS_TARGET_CLASS}:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
    }
`;

function restoreAttribute(element: Element, name: string, value: string | null): void {
    if (value == null) element.removeAttribute(name);
    else element.setAttribute(name, value);
}

function clearNoteIndicators(document: Document): void {
    document.querySelectorAll(`.${INDICATOR_CLASS}, .${LEGACY_MARKER_CLASS}`).forEach(indicator => indicator.remove());
    document.querySelectorAll<HighlightElement>(`.${MARKED_HIGHLIGHT_CLASS}`).forEach(highlight => {
        highlight.classList.remove(MARKED_HIGHLIGHT_CLASS, FOCUS_TARGET_CLASS);
        const original = highlight.noteIndicatorOriginalAttributes;
        if (original) {
            restoreAttribute(highlight, 'aria-label', original.ariaLabel);
            restoreAttribute(highlight, 'role', original.role);
            restoreAttribute(highlight, 'tabindex', original.tabIndex);
            delete highlight.noteIndicatorOriginalAttributes;
        }
    });
}

function updatePdfHighlightGeometry(document: Document): void {
    const canvasRects = new Map<HTMLCanvasElement, DOMRect>();
    document.querySelectorAll<HighlightElement>(HIGHLIGHT_SELECTOR).forEach(highlight => {
        if (!highlight.svgHighlight) return;
        const canvas = highlight.closest('.page')?.querySelector<HTMLCanvasElement>('.canvasWrapper > canvas');
        if (!canvas) return;

        const canvasRect = canvasRects.get(canvas) || canvas.getBoundingClientRect();
        canvasRects.set(canvas, canvasRect);
        const highlightRect = highlight.getBoundingClientRect();
        if (!highlightRect.width || !highlightRect.height) return;

        highlight.svgHighlight.setAttribute('x', (highlightRect.left - canvasRect.left).toString());
        highlight.svgHighlight.setAttribute('y', (highlightRect.top - canvasRect.top).toString());
        highlight.svgHighlight.setAttribute('width', highlightRect.width.toString());
        highlight.svgHighlight.setAttribute('height', highlightRect.height.toString());
    });
}

function addNoteIndicator(document: Document, highlight: HighlightElement): void {
    const svgHighlight = highlight.svgHighlight;
    if (!svgHighlight?.parentElement) return;

    const x = Number(svgHighlight.getAttribute('x'));
    const y = Number(svgHighlight.getAttribute('y'));
    const width = Number(svgHighlight.getAttribute('width'));
    const height = Number(svgHighlight.getAttribute('height'));
    if (![x, y, width, height].every(Number.isFinite)) return;

    const line = document.createElementNS(SVG_NAMESPACE, 'line');
    line.classList.add(INDICATOR_CLASS);
    line.setAttribute('x1', x.toString());
    line.setAttribute('x2', (x + width).toString());
    line.setAttribute('y1', (y + height - 1).toString());
    line.setAttribute('y2', (y + height - 1).toString());
    svgHighlight.parentElement.appendChild(line);
}

function addStyles(document: Document): void {
    document.getElementById(LEGACY_STYLE_ID)?.remove();
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = styles;
}

function addKeyboardTarget(highlight: HighlightElement): void {
    highlight.noteIndicatorOriginalAttributes = {
        ariaLabel: highlight.getAttribute('aria-label'),
        role: highlight.getAttribute('role'),
        tabIndex: highlight.getAttribute('tabindex')
    };
    highlight.classList.add(FOCUS_TARGET_CLASS);
    highlight.setAttribute('aria-label', 'Open annotation note');
    highlight.setAttribute('role', 'button');
    highlight.setAttribute('tabindex', '0');
}

export function syncPdfNoteIndicators(document: Document, annotations: Annotation[]): void {
    updatePdfHighlightGeometry(document);
    clearNoteIndicators(document);

    const highlightsByTag = new Map<string, HighlightElement[]>();
    document.querySelectorAll<HighlightElement>(HIGHLIGHT_SELECTOR).forEach(highlight => {
        const tag = highlight._annotation?.$tag;
        if (!tag) return;
        const highlights = highlightsByTag.get(tag) || [];
        highlights.push(highlight);
        highlightsByTag.set(tag, highlights);
    });

    for (const highlights of highlightsByTag.values()) {
        const pseudoAnnotation = highlights[0]._annotation;
        if (!pseudoAnnotation) continue;

        // ponytail: document-sized linear scan; index selectors only if PDFs reach thousands of annotations.
        const annotation = annotations.find(candidate => checkPseudoAnnotationEquality(candidate, pseudoAnnotation));
        if (!annotation?.text?.trim()) continue;

        for (const highlight of highlights) {
            highlight.classList.add(MARKED_HIGHLIGHT_CLASS);
            addNoteIndicator(document, highlight);
        }

        const keyboardTarget = highlights[highlights.length - 1];
        if (keyboardTarget) addKeyboardTarget(keyboardTarget);
    }
}

function containsHighlight(node: Node): boolean {
    if (node.nodeType !== 1) return false;
    const element = node as Element;
    return element.matches(HIGHLIGHT_RENDER_SELECTOR) || element.querySelector(HIGHLIGHT_RENDER_SELECTOR) != null;
}

export function setupPdfNoteIndicators(
    document: Document | null,
    getAnnotations: () => Annotation[]
): PdfNoteIndicatorController {
    const frameWindow = document?.defaultView;
    if (!document?.documentElement || !frameWindow) return noOpController;
    addStyles(document);
    let animationFrame = 0;
    const refreshingPages = new Set<Element>();

    const refresh = () => syncPdfNoteIndicators(document, getAnnotations());
    const scheduleRefresh = () => {
        if (animationFrame) return;
        animationFrame = frameWindow.requestAnimationFrame(() => {
            animationFrame = 0;
            refresh();
            refreshingPages.forEach(page => page.classList.remove(REFRESHING_PAGE_CLASS));
            refreshingPages.clear();
        });
    };
    const refreshAfterTextLayer = (event?: { pageNumber?: number }) => {
        const page = document.querySelector(`.page[data-page-number="${event?.pageNumber}"]`);
        if (page) {
            page.classList.add(REFRESHING_PAGE_CLASS);
            refreshingPages.add(page);
        }
        scheduleRefresh();
    };
    const observer = new frameWindow.MutationObserver(records => {
        if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(containsHighlight))) {
            scheduleRefresh();
        }
    });
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    const pdfEventBus = (
        frameWindow as typeof frameWindow & {
            PDFViewerApplication?: {
                eventBus?: {
                    on: (name: string, listener: (event?: { pageNumber?: number }) => void) => void;
                    off: (name: string, listener: (event?: { pageNumber?: number }) => void) => void;
                };
            };
        }
    ).PDFViewerApplication?.eventBus;
    pdfEventBus?.on('scalechanging', scheduleRefresh);
    pdfEventBus?.on('rotationchanging', scheduleRefresh);
    pdfEventBus?.on('pagerendered', scheduleRefresh);
    pdfEventBus?.on('textlayerrendered', refreshAfterTextLayer);

    const onKeyDown = (event: KeyboardEvent) => {
        if (!['Enter', ' '].includes(event.key) || !(event.target instanceof frameWindow.Element)) return;
        const highlight = event.target.closest<HighlightElement>(`.${FOCUS_TARGET_CLASS}`);
        if (!highlight) return;
        event.preventDefault();
        highlight.dispatchEvent(
            new frameWindow.MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: frameWindow
            })
        );
    };
    document.addEventListener('keydown', onKeyDown);
    refresh();

    return {
        refresh,
        disconnect: () => {
            observer.disconnect();
            pdfEventBus?.off('scalechanging', scheduleRefresh);
            pdfEventBus?.off('rotationchanging', scheduleRefresh);
            pdfEventBus?.off('pagerendered', scheduleRefresh);
            pdfEventBus?.off('textlayerrendered', refreshAfterTextLayer);
            document.removeEventListener('keydown', onKeyDown);
            if (animationFrame) frameWindow.cancelAnimationFrame(animationFrame);
            refreshingPages.forEach(page => page.classList.remove(REFRESHING_PAGE_CLASS));
            clearNoteIndicators(document);
            document.getElementById(STYLE_ID)?.remove();
        }
    };
}

export function setupPdfNoteIndicatorsInFrame(
    iframe: HTMLIFrameElement | null,
    getAnnotations: () => Annotation[]
): PdfNoteIndicatorController {
    if (!iframe) return noOpController;
    let documentController: PdfNoteIndicatorController = noOpController;
    const setup = () => {
        documentController?.disconnect();
        documentController = setupPdfNoteIndicators(iframe.contentDocument, getAnnotations);
    };
    iframe.addEventListener('load', setup);
    setup();

    return {
        refresh: () => documentController?.refresh(),
        disconnect: () => {
            iframe.removeEventListener('load', setup);
            documentController?.disconnect();
        }
    };
}
