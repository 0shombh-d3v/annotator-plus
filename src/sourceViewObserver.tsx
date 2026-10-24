import { editorInfoField, TFile, parseLinktext } from 'obsidian';
import { EditorView } from '@codemirror/view';
import type AnnotatorPlugin from './main';
import { wikiLinkAtPosition } from './annotationLinks';
import { isValidAnnotationId } from './annotationUtils';

export default class SourceViewObserver {
    private controller = new AbortController();
    private linkedElements = new WeakSet<HTMLElement>();
    readonly editorExtension;

    constructor(private plugin: AnnotatorPlugin) {
        const onClick = (event: MouseEvent, editor: EditorView): boolean => {
            const target = event.target as HTMLElement;
            const linkElement = target.closest?.('.cm-hmd-internal-link');
            const file = editor.state.field(editorInfoField, false)?.file;
            if (!linkElement || !file) return false;
            const href = wikiLinkAtPosition(editor.state.doc.toString(), editor.posAtDOM(linkElement));
            if (!href) return false;
            const parsed = parseLinktext(href);
            const id = parsed.subpath.startsWith('#^') ? parsed.subpath.slice(2) : null;
            const destination = parsed.path
                ? plugin.app.metadataCache.getFirstLinkpathDest(parsed.path, file.path)
                : file;
            if (!destination || !isValidAnnotationId(id) || !plugin.isAnnotationFile(destination)) return false;
            return this.open(event, destination, id);
        };
        this.editorExtension = EditorView.domEventHandlers({ click: onClick, auxclick: onClick });
    }

    private open(event: MouseEvent, file: TFile, id: string) {
        if (event.button !== 0 && event.button !== 1) return false;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void this.plugin.openAnnotationTarget(file, event.metaKey || event.ctrlKey || event.button === 1, id);
        return true;
    }

    addClickListener(element: HTMLAnchorElement, id: string, file: TFile) {
        if (this.linkedElements.has(element) || !isValidAnnotationId(id)) return;
        this.linkedElements.add(element);
        const handler = (event: MouseEvent) => this.open(event, file, id);
        element.addEventListener('click', handler, { signal: this.controller.signal });
        element.addEventListener('auxclick', handler, { signal: this.controller.signal });
    }

    disconnect() {
        this.controller.abort();
    }
}
