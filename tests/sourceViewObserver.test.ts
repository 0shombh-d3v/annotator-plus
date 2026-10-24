/** @jest-environment jsdom */

jest.mock(
    'obsidian',
    () => ({
        editorInfoField: Symbol('editor info'),
        parseLinktext: (href: string) => {
            const [path, id] = href.split('#^');
            return { path, subpath: id ? `#^${id}` : '' };
        }
    }),
    { virtual: true }
);
jest.mock('@codemirror/view', () => ({ EditorView: { domEventHandlers: handlers => handlers } }));

import SourceViewObserver from '../src/sourceViewObserver';

test.each([0, 1, 2])('reading-view annotation links respect mouse button %i', button => {
    const openAnnotationTarget = jest.fn();
    const observer = new SourceViewObserver({ openAnnotationTarget } as never);
    const link = document.createElement('a');
    observer.addClickListener(link, 'highlight', { path: 'book.md' } as never);
    const event = new MouseEvent(button === 0 ? 'click' : 'auxclick', { button, cancelable: true });
    try {
        const unhandled = link.dispatchEvent(event);
        expect(openAnnotationTarget).toHaveBeenCalledTimes(button === 2 ? 0 : 1);
        expect(unhandled).toBe(button === 2);
        if (button !== 2)
            expect(openAnnotationTarget).toHaveBeenCalledWith({ path: 'book.md' }, button === 1, 'highlight');
    } finally {
        observer.disconnect();
    }
});

test.each([0, 1, 2])('editor annotation links respect mouse button %i', button => {
    const destination = { path: 'book.md' };
    const openAnnotationTarget = jest.fn();
    const observer = new SourceViewObserver({
        openAnnotationTarget,
        isAnnotationFile: () => true,
        app: { metadataCache: { getFirstLinkpathDest: () => destination } }
    } as never);
    const link = document.createElement('span');
    link.className = 'cm-hmd-internal-link';
    const event = new MouseEvent(button === 0 ? 'click' : 'auxclick', { button, cancelable: true });
    Object.defineProperty(event, 'target', { value: link });
    const editor = {
        state: { field: () => ({ file: { path: 'source.md' } }), doc: { toString: () => '[[book#^highlight]]' } },
        posAtDOM: () => 3
    };
    try {
        const handled = observer.editorExtension[button === 0 ? 'click' : 'auxclick'](event, editor);
        expect(handled).toBe(button !== 2);
        expect(event.defaultPrevented).toBe(button !== 2);
        expect(openAnnotationTarget).toHaveBeenCalledTimes(button === 2 ? 0 : 1);
    } finally {
        observer.disconnect();
    }
});
