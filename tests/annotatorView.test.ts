/** @jest-environment jsdom */
jest.mock(
    'obsidian',
    () => {
        class TFile {
            constructor(public path: string) {}
        }
        class FileView {
            app;
            leaf;
            file;
            contentEl;
            containerEl;
            constructor(leaf) {
                this.leaf = leaf;
                this.app = leaf.app;
                this.contentEl = document.createElement('div');
                this.containerEl = this.contentEl;
                this.contentEl.empty = () => this.contentEl.replaceChildren();
                this.contentEl.removeClass = name => this.contentEl.classList.remove(name);
                this.contentEl.createDiv = ({ cls, text, attr }) => {
                    const el = document.createElement('div');
                    el.className = cls;
                    el.textContent = text;
                    for (const [key, value] of Object.entries(attr || {})) el.setAttribute(key, value as string);
                    this.contentEl.appendChild(el);
                    return el;
                };
            }
            async onUnloadFile() {}
            async onRename() {}
        }
        return { TFile, FileView, normalizePath: path => path };
    },
    { virtual: true }
);
jest.mock('react-dom', () => ({ render: jest.fn(), unmountComponentAtNode: jest.fn() }));
jest.mock('annotationFileUtils', () => ({ getAnnotation: jest.fn() }));

import ReactDOM from 'react-dom';
import { TFile } from 'obsidian';
import AnnotatorView from '../src/annotatorView';
import { getAnnotation } from '../src/annotationFileUtils';

const makeFile = (path: string) => new (TFile as unknown as { new (path: string): TFile })(path);
function context() {
    const plugin = {
        views: new Set(),
        setupPromise: Promise.resolve(),
        settings: { darkMode: 'follow-obsidian', darkReaderSettings: {}, debugLogging: false },
        PdfAnnotation: () => null
    };
    const view = new AnnotatorView({ app: { vault: {} } } as never, plugin as never);
    return { view, plugin };
}
const target = { kind: 'vault', path: 'book.pdf', url: 'vault:/book.pdf' } as const;
afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.className = '';
});

test('a view closed during startup never renders after its setup promise resolves', async () => {
    const { view, plugin } = context();
    let ready: () => void;
    plugin.setupPromise = new Promise(resolve => {
        ready = resolve;
    });
    const loading = view.onLoadFile(makeFile('one.md'));
    view.dispose();
    ready();
    await loading;
    expect(ReactDOM.render).not.toHaveBeenCalled();
});

test('a slower previous file cannot overwrite the newer PDF view', async () => {
    const { view } = context();
    let previous: (value: typeof target) => void;
    jest.spyOn(view, 'getAnnotationTarget')
        .mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    previous = resolve;
                })
        )
        .mockResolvedValue(target);
    const first = view.onLoadFile(makeFile('one.md'));
    await Promise.resolve();
    await view.onLoadFile(makeFile('two.md'));
    previous(target);
    await first;
    expect(ReactDOM.render).toHaveBeenCalledTimes(1);
    expect((ReactDOM.render as jest.Mock).mock.calls[0][0].props.annotationFile).toBe('two.md');
    view.dispose();
});

test('renaming the note rebuilds the reader with its new save path', async () => {
    const { view } = context();
    jest.spyOn(view, 'getAnnotationTarget').mockResolvedValue(target);
    await view.onRename(makeFile('renamed.md'));
    expect((ReactDOM.render as jest.Mock).mock.calls[0][0].props.annotationFile).toBe('renamed.md');
    view.dispose();
});

test('target errors are visible and remove the stale iframe reference', async () => {
    const { view } = context();
    view.iframe = document.createElement('iframe');
    jest.spyOn(view, 'getAnnotationTarget').mockRejectedValue(new Error('PDF is missing'));
    await view.onLoadFile(makeFile('broken.md'));
    expect(view.contentEl.querySelector('[role="alert"]').textContent).toBe('PDF is missing');
    expect(view.iframe).toBeNull();
    view.dispose();
});

test('closing a reader asks the embedded client to stop before removing its iframe', () => {
    const { view } = context();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    view.iframe = iframe;
    const link = iframe.contentDocument.createElement('link');
    link.type = 'application/annotator+html';
    link.rel = 'sidebar';
    iframe.contentDocument.head.appendChild(link);
    const destroy = jest.fn(() => expect(view.iframe).toBe(iframe));
    link.addEventListener('destroy', destroy);

    view.dispose();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(view.iframe).toBeNull();
    iframe.remove();
});

test('client cleanup still runs when Obsidian has already detached the iframe document', async () => {
    const { view } = context();
    jest.spyOn(view, 'getAnnotationTarget').mockResolvedValue(target);
    await view.onLoadFile(makeFile('one.md'));
    const frameDocument = document.implementation.createHTMLDocument();
    const link = frameDocument.createElement('link');
    link.type = 'application/annotator+html';
    link.rel = 'sidebar';
    frameDocument.head.appendChild(link);
    const destroy = jest.fn();
    link.addEventListener('destroy', destroy);
    const iframe = { contentDocument: frameDocument };
    await (ReactDOM.render as jest.Mock).mock.calls[0][0].props.onload(iframe);
    iframe.contentDocument = null;

    view.dispose();

    expect(destroy).toHaveBeenCalledTimes(1);
});

test('pagehide stops the embedded client before native detachment clears its listeners', async () => {
    const { view } = context();
    jest.spyOn(view, 'getAnnotationTarget').mockResolvedValue(target);
    await view.onLoadFile(makeFile('one.md'));
    const frameDocument = document.implementation.createHTMLDocument();
    const link = frameDocument.createElement('link');
    link.type = 'application/annotator+html';
    link.rel = 'sidebar';
    frameDocument.head.appendChild(link);
    const destroy = jest.fn();
    link.addEventListener('destroy', destroy);
    const contentWindow = new EventTarget();
    await (ReactDOM.render as jest.Mock).mock.calls[0][0].props.onload({
        frameDocument,
        contentDocument: frameDocument,
        contentWindow
    });

    contentWindow.dispatchEvent(new Event('pagehide'));
    expect(destroy).toHaveBeenCalledTimes(1);
    view.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
});

test('annotation navigation waits for the new sidebar and focuses page notes by ID', async () => {
    jest.useFakeTimers();
    const { view } = context();
    view.file = makeFile('one.md');
    (getAnnotation as jest.Mock).mockResolvedValue({ id: 'note', target: [] });
    const navigating = view.scrollToAnnotation('note');
    await Promise.resolve();
    const focusAnnotation = jest.fn().mockReturnValue(true);
    view.iframe = {
        contentDocument: {
            querySelector: selector =>
                selector === 'hypothesis-sidebar'
                    ? {
                          shadowRoot: {
                              querySelector: () => ({ contentWindow: { annotatorPlus: { focusAnnotation } } })
                          }
                      }
                    : null
        }
    } as never;
    jest.advanceTimersByTime(50);
    await navigating;
    expect(focusAnnotation).toHaveBeenCalledWith('note');
    view.dispose();
});

test('Follow Obsidian responds to body theme changes and stops after disposal', async () => {
    const { view } = context();
    const darkReader = { enable: jest.fn(), disable: jest.fn() };
    await view.onDarkReadersUpdated(new Set([new WeakRef(darkReader as never)]));
    expect(darkReader.disable).toHaveBeenCalledTimes(1);
    document.body.classList.add('theme-dark');
    await Promise.resolve();
    expect(darkReader.enable).toHaveBeenCalledTimes(1);
    view.dispose();
    document.body.classList.remove('theme-dark');
    await Promise.resolve();
    expect(darkReader.disable).toHaveBeenCalledTimes(1);
    expect(view.darkReaderReferences.size).toBe(0);
});
