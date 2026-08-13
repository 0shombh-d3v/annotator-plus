import { getAnnotation } from 'annotationFileUtils';
import { ANNOTATION_TARGET_PROPERTY, ANNOTATION_TARGET_TYPE_PROPERTY, VIEW_TYPE_PDF_ANNOTATOR } from './constants';
import { DarkReaderType } from 'darkreader';
import AnnotatorPlugin from 'main';
import { Annotation, AnnotationTarget } from './types';
import { FileView, Menu, MenuItem, TFile, WorkspaceLeaf } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';
import { get_url_extension, wait } from 'utils';
import { DARK_READER_FIXES, shouldUseDarkMode } from './darkMode';
import { resolveAnnotationTarget } from './targetResolver';

type AnnotatorPlusBridge = {
    focusAnnotation: (id: string) => boolean;
    showPageNotes: () => void;
};

export default class AnnotatorView extends FileView {
    plugin: AnnotatorPlugin;
    iframe: HTMLIFrameElement;
    annotationTarget?: AnnotationTarget;
    darkReaderReferences: Set<WeakRef<DarkReaderType>> = new Set();
    getViewType(): string {
        return VIEW_TYPE_PDF_ANNOTATOR;
    }
    constructor(leaf: WorkspaceLeaf, plugin: AnnotatorPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.plugin.views.add(this);
    }

    isDarkModeEnabled(): boolean {
        return shouldUseDarkMode(
            this.plugin.settings.darkMode,
            this.containerEl.ownerDocument.body.classList.contains('theme-dark')
        );
    }

    async getAnnotationTarget(file: TFile): Promise<AnnotationTarget> {
        const annotationTargetPropertyValue = this.plugin.getPropertyValue(ANNOTATION_TARGET_PROPERTY, file);
        return resolveAnnotationTarget(annotationTargetPropertyValue, this.plugin.settings.customDefaultPath, {
            resolveVaultFile: path => this.app.metadataCache.getFirstLinkpathDest(path, file.path)
        });
    }

    async onLoadFile(file: TFile) {
        try {
            // Prevent pane from loading too early.
            await this.plugin.setupPromise;
            ReactDOM.unmountComponentAtNode(this.contentEl);
            this.contentEl.empty();
            const annotationTarget = await this.getAnnotationTarget(file);

            this.contentEl.removeClass('view-content');
            this.contentEl.style.height = '100%';
            this.annotationTarget = annotationTarget;
            const annotationTargetType = String(
                this.plugin.getPropertyValue(ANNOTATION_TARGET_TYPE_PROPERTY, file) ||
                    get_url_extension(annotationTarget.url)
            ).toLowerCase();
            const commonProps = {
                containerEl: this.contentEl,
                annotationFile: file.path,
                onload: async (iframe: HTMLIFrameElement) => {
                    this.iframe = iframe;
                },
                onDarkReadersUpdated: this.onDarkReadersUpdated.bind(this)
            };
            if (annotationTargetType === 'pdf') {
                ReactDOM.render(<this.plugin.PdfAnnotation pdf={annotationTarget} {...commonProps} />, this.contentEl);
            } else if (annotationTargetType === 'epub') {
                ReactDOM.render(
                    <this.plugin.EpubAnnotation epub={annotationTarget} {...commonProps} />,
                    this.contentEl
                );
            } else {
                throw new Error('Annotator++ supports PDF and EPUB targets only.');
            }
        } catch (error) {
            this.contentEl.empty();
            this.contentEl.createDiv({
                cls: 'annotator-plus-error',
                text: error instanceof Error ? error.message : 'Could not open the annotation target.'
            });
        }
    }

    async onDarkReadersUpdated(darkReaderReferences?: Set<WeakRef<DarkReaderType>>): Promise<void> {
        if (darkReaderReferences) {
            darkReaderReferences.forEach(reference => this.darkReaderReferences.add(reference));
        }

        this.darkReaderReferences.forEach(r => {
            const darkReader = r.deref();
            if (!darkReader) {
                this.darkReaderReferences.delete(r);
                return;
            }
            const darkReaderSettings = this.plugin.settings.darkReaderSettings;
            const f = () => {
                try {
                    if (this.isDarkModeEnabled()) {
                        darkReader.enable(darkReaderSettings, DARK_READER_FIXES);
                    } else {
                        darkReader.disable();
                    }
                } catch (e) {
                    console.warn('DarkReader', { r }, 'failed with error', { e });
                }
            };
            f();
        });
    }

    onunload() {
        try {
            ReactDOM.unmountComponentAtNode(this.contentEl);
        } catch (e) {}
        this.plugin.views.delete(this);
        this.contentEl.empty();
    }

    async onUnloadFile(file: TFile) {
        try {
            ReactDOM.unmountComponentAtNode(this.contentEl);
        } catch (e) {}
        await super.onUnloadFile(file);
    }

    onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string) {
        super.onPaneMenu(menu, source);

        // any because item doesn't have .setSection() in the type
        // eslint-disable-next-line
        menu.addItem(
            (item: MenuItem): MenuItem =>
                item
                    .setTitle('Open as Markdown')
                    .setIcon('document')
                    .setSection('pane')
                    .onClick(async () => {
                        this.plugin.pdfAnnotatorFileModes[(this.leaf as any).id || this.file.path] = 'markdown'; // eslint-disable-line
                        await this.plugin.setMarkdownView(this.leaf);
                    })
        );

        // any because item doesn't have .setSection() in the type
        // eslint-disable-next-line
        menu.addItem(
            (item: MenuItem): MenuItem =>
                item
                    .setTitle(`Annotator: Use ${this.isDarkModeEnabled() ? 'Light' : 'Dark'} Mode`)
                    .setIcon('switch')
                    .setSection('pane')
                    .onClick(async () => {
                        this.plugin.settings.darkMode = this.isDarkModeEnabled() ? 'light' : 'dark';
                        await this.plugin.saveSettings();
                    })
        );
    }

    async scrollToAnnotation(annotationId: Annotation['id'] | null) {
        const annotation = await getAnnotation(annotationId, this.file, this.app.vault);
        if (!annotation || !this.iframe) return;

        for (let attempt = 0; attempt < 100; attempt++) {
            const sidebarFrame = this.iframe.contentDocument
                ?.querySelector('hypothesis-sidebar')
                ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe.sidebar-frame');
            const bridge = (sidebarFrame?.contentWindow as Window & { annotatorPlus?: AnnotatorPlusBridge })
                ?.annotatorPlus;
            if (bridge) {
                if (!annotation.target?.length) {
                    bridge.showPageNotes();
                    return;
                }
                if (bridge.focusAnnotation(annotation.id)) return;
            }
            await wait(50);
        }

        if (this.plugin.settings.debugLogging) console.warn('Annotator++ sidebar bridge did not become ready');
    }
}
