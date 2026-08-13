/** @jest-environment jsdom */

import { setupPdfNoteIndicators, setupPdfNoteIndicatorsInFrame } from '../src/pdfNoteIndicators';
import { Annotation, Selector } from '../src/types';

const selector: Selector[] = [
    { type: 'TextPositionSelector', start: 10, end: 20 },
    { type: 'TextQuoteSelector', exact: 'highlight', prefix: 'a ', suffix: ' z' }
];

const annotation = {
    id: 'note-1',
    text: 'annotation note',
    target: [{ source: 'pdf', selector }]
} as Annotation;

function highlight(
    tag: string,
    targetSelector: Selector[] = selector
): HTMLElement & { svgHighlight?: SVGRectElement } {
    const element = document.createElement('hypothesis-highlight');
    Object.assign(element, {
        _annotation: { $tag: tag, target: [{ source: 'pdf', selector: targetSelector }] }
    });
    return element;
}

test('PDF note underlines decorate only the exact note-bearing highlight fragments', async () => {
    document.body.innerHTML = `
        <div class="page">
            <div class="canvasWrapper"><canvas></canvas><svg class="hypothesis-highlight-layer"></svg></div>
            <div class="textLayer"></div>
        </div>`;
    const page = document.querySelector('.page');
    const canvas = document.querySelector('canvas');
    const svgLayer = document.querySelector<SVGSVGElement>('.hypothesis-highlight-layer');
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20 } as DOMRect);
    let xOffset = 0;
    let annotations = [annotation];
    const firstFragment = highlight('t1');
    const finalFragment = highlight('t1');
    const plainHighlight = highlight('t2', [{ type: 'TextPositionSelector', start: 30, end: 40 }]);
    [firstFragment, finalFragment, plainHighlight].forEach((fragment, index) => {
        fragment.getBoundingClientRect = () =>
            ({ left: 30 + index * 30 + xOffset, top: 40, width: 20, height: 10 } as DOMRect);
        const svgHighlight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        svgLayer.appendChild(svgHighlight);
        fragment.svgHighlight = svgHighlight;
    });
    const staleIndicator = document.createElement('span');
    staleIndicator.className = 'obsidian-annotator-note-indicator';
    document.querySelector('.textLayer').append(firstFragment, finalFragment, plainHighlight);
    page.append(staleIndicator);

    let scaleListener: () => void;
    const eventBus = {
        on: jest.fn((_name: string, listener: () => void) => (scaleListener = listener)),
        off: jest.fn()
    };
    (window as typeof window & { PDFViewerApplication?: unknown }).PDFViewerApplication = { eventBus };

    const controller = setupPdfNoteIndicators(document, () => annotations);
    const style = document.getElementById('obsidian-annotator-note-indicator-styles');
    expect(style.textContent).toContain('stroke: #991b1b');
    expect(style.textContent).toContain('stroke-width: 2.5px');
    expect(style.textContent).not.toContain('linear-gradient');
    expect(document.querySelectorAll('.obsidian-annotator-note-indicator')).toHaveLength(2);
    expect(firstFragment.classList.contains('obsidian-annotator-note-highlight')).toBe(true);
    expect(finalFragment.classList.contains('obsidian-annotator-note-highlight')).toBe(true);
    expect(plainHighlight.classList.contains('obsidian-annotator-note-highlight')).toBe(false);
    expect(firstFragment.hasAttribute('tabindex')).toBe(false);
    expect(finalFragment.getAttribute('role')).toBe('button');
    expect(finalFragment.getAttribute('tabindex')).toBe('0');
    expect(document.querySelector('.obsidian-annotator-note-marker')).toBeNull();
    expect(document.body.textContent).not.toContain('annotation note');

    xOffset = 100;
    scaleListener();
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    expect(firstFragment.svgHighlight.getAttribute('x')).toBe('120');
    expect(document.querySelector('.obsidian-annotator-note-indicator').getAttribute('x1')).toBe('120');

    annotations = [{ ...annotation, text: '   ' }];
    controller.refresh();
    expect(document.querySelector('.obsidian-annotator-note-indicator')).toBeNull();
    expect(firstFragment.classList.contains('obsidian-annotator-note-highlight')).toBe(false);
    expect(finalFragment.hasAttribute('role')).toBe(false);

    annotations = [{ ...annotation, text: 'updated note' }];
    const replacementFragment = highlight('t1');
    replacementFragment.getBoundingClientRect = () => ({ left: 60, top: 40, width: 25, height: 10 } as DOMRect);
    finalFragment.replaceWith(replacementFragment);
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    expect(replacementFragment.classList.contains('obsidian-annotator-note-highlight')).toBe(true);
    expect(replacementFragment.getAttribute('role')).toBe('button');

    replacementFragment.svgHighlight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    replacementFragment.svgHighlight.classList.add('hypothesis-svg-highlight');
    svgLayer.appendChild(replacementFragment.svgHighlight);
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    expect(document.querySelectorAll('.obsidian-annotator-note-indicator')).toHaveLength(2);

    const onMouseUp = jest.fn();
    replacementFragment.addEventListener('mouseup', onMouseUp);
    replacementFragment.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    replacementFragment.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    expect(onMouseUp).toHaveBeenCalledTimes(2);

    annotations = [];
    controller.refresh();
    expect(replacementFragment.classList.contains('obsidian-annotator-note-highlight')).toBe(false);
    expect(replacementFragment.hasAttribute('role')).toBe(false);

    controller.disconnect();
    expect(eventBus.off).toHaveBeenCalledWith('scalechanging', scaleListener);
    expect(eventBus.off).toHaveBeenCalledWith('rotationchanging', scaleListener);
    expect(eventBus.off).toHaveBeenCalledWith('pagerendered', scaleListener);
    delete (window as typeof window & { PDFViewerApplication?: unknown }).PDFViewerApplication;
    expect(document.getElementById('obsidian-annotator-note-indicator-styles')).toBeNull();
});

test('detached PDF documents and missing frames are safe no-ops', () => {
    const detached = document.implementation.createHTMLDocument('detached');
    expect(detached.defaultView).toBeNull();
    expect(() => setupPdfNoteIndicators(detached, () => []).refresh()).not.toThrow();
    expect(() => setupPdfNoteIndicatorsInFrame(null, () => []).disconnect()).not.toThrow();
});

test('PDF frame reloads reinstall underlines and remove old indicator artifacts', () => {
    document.body.innerHTML = '';
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const controller = setupPdfNoteIndicatorsInFrame(iframe, () => [annotation]);

    const page = iframe.contentDocument.createElement('div');
    page.className = 'page';
    const fragment = highlight('t1');
    page.append(fragment);
    iframe.contentDocument.body.append(page);
    const legacyStyle = iframe.contentDocument.createElement('style');
    legacyStyle.id = 'obsidian-annotator-note-marker-styles';
    iframe.contentDocument.head.append(legacyStyle);
    const legacyMarker = iframe.contentDocument.createElement('button');
    legacyMarker.className = 'obsidian-annotator-note-marker';
    page.append(legacyMarker);
    const staleIndicator = iframe.contentDocument.createElement('span');
    staleIndicator.className = 'obsidian-annotator-note-indicator';
    page.append(staleIndicator);

    iframe.dispatchEvent(new Event('load'));
    expect(fragment.classList.contains('obsidian-annotator-note-highlight')).toBe(true);
    expect(iframe.contentDocument.querySelector('.obsidian-annotator-note-indicator')).toBeNull();
    expect(iframe.contentDocument.querySelector('.obsidian-annotator-note-marker')).toBeNull();
    expect(iframe.contentDocument.getElementById('obsidian-annotator-note-marker-styles')).toBeNull();

    iframe.contentDocument.getElementById('obsidian-annotator-note-indicator-styles').remove();
    iframe.dispatchEvent(new Event('load'));
    expect(iframe.contentDocument.getElementById('obsidian-annotator-note-indicator-styles')).not.toBeNull();
    expect(fragment.classList.contains('obsidian-annotator-note-highlight')).toBe(true);

    controller.disconnect();
});
