/** @jest-environment jsdom */

jest.mock('react-offline-iframe', () => ({ OfflineIframe: () => null }));
jest.mock(
    'obsidian',
    () => ({
        TFile: class TFile {},
        Notice: jest.fn(),
        MarkdownRenderChild: class MarkdownRenderChild {
            constructor(public containerEl: HTMLElement) {}
            load = jest.fn();
            unload = jest.fn();
        },
        MarkdownRenderer: { renderMarkdown: jest.fn() }
    }),
    { virtual: true }
);

import { MarkdownRenderer } from 'obsidian';
import { patchSidebarMarkdownRendering } from '../src/defineGenericAnnotation';
import { utf8_to_b64 } from '../src/utils';

function context() {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('patched-src', 'https://hypothes.is/app.html');
    document.body.appendChild(iframe);
    const elementPrototype = (iframe.contentWindow as Window & typeof globalThis).Element.prototype;
    Object.defineProperty(elementPrototype, 'findAll', {
        value: function (selector) {
            return this.querySelectorAll(selector);
        }
    });
    const children = new Set();
    const plugin = { styleObserver: { listen: jest.fn(), remove: jest.fn() } };
    const cleanup = patchSidebarMarkdownRendering(iframe, 'notes.md', plugin as never, children as never);
    const element = iframe.contentDocument.createElement('obsidian-markdown');
    iframe.contentDocument.body.appendChild(element);
    return {
        element,
        children,
        close: () => {
            cleanup();
            iframe.remove();
        }
    };
}

afterEach(() => jest.clearAllMocks());

test('a slow previous Markdown render cannot append stale content to a newer preview', async () => {
    const pending = new Map<string, () => void>();
    (MarkdownRenderer.renderMarkdown as jest.Mock).mockImplementation(
        (text, container) =>
            new Promise<void>(resolve => {
                pending.set(text, () => {
                    container.appendChild(container.ownerDocument.createTextNode(text));
                    resolve();
                });
            })
    );
    const c = context();
    try {
        c.element.setAttribute('markdownbase64', utf8_to_b64('old draft'));
        c.element.setAttribute('markdownbase64', utf8_to_b64('current draft'));
        pending.get('current draft')();
        await Promise.resolve();
        pending.get('old draft')();
        await Promise.resolve();
        expect(c.element.textContent).toBe('current draft');
        expect(c.children.size).toBe(1);
    } finally {
        c.close();
    }
});

test('a renderer failure keeps the current note readable and releases its render child', async () => {
    (MarkdownRenderer.renderMarkdown as jest.Mock).mockRejectedValueOnce(new Error('Renderer unavailable'));
    const warning = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const c = context();
    try {
        c.element.setAttribute('markdownbase64', utf8_to_b64('**Current note** ∞'));
        await Promise.resolve();
        await Promise.resolve();
        expect(c.element.textContent).toBe('**Current note** ∞');
        expect(c.children.size).toBe(0);
        expect(warning).toHaveBeenCalledTimes(1);
    } finally {
        c.close();
        warning.mockRestore();
    }
});

test('a failed obsolete render cannot replace the current preview with its fallback', async () => {
    let rejectOld: (error: Error) => void;
    (MarkdownRenderer.renderMarkdown as jest.Mock)
        .mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    rejectOld = reject;
                })
        )
        .mockImplementationOnce(async (text, container) => {
            container.textContent = text;
        });
    const warning = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const c = context();
    try {
        c.element.setAttribute('markdownbase64', utf8_to_b64('old draft'));
        c.element.setAttribute('markdownbase64', utf8_to_b64('current draft'));
        rejectOld(new Error('Old renderer failed'));
        await Promise.resolve();
        await Promise.resolve();
        expect(c.element.textContent).toBe('current draft');
        expect(warning).not.toHaveBeenCalled();
    } finally {
        c.close();
        warning.mockRestore();
    }
});
