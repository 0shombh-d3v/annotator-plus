import { getAnnotation } from 'annotationFileUtils';
import { ANNOTATION_TARGET_PROPERTY, VIEW_TYPE_PDF_ANNOTATOR } from './constants';
import { DarkReaderType } from 'darkreader';
import AnnotatorPlugin from 'main';
import { Annotation, AnnotationTarget } from './types';
import { FileView, Menu, MenuItem, TFile, WorkspaceLeaf } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';
import { wait } from 'utils';
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
    private loadGeneration = 0;
    private navigationGeneration = 0;
    private closed = false;
    private themeObserver: MutationObserver;
    getViewType(): string {
        return VIEW_TYPE_PDF_ANNOTATOR;
    }
    constructor(leaf: WorkspaceLeaf, plugin: AnnotatorPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.plugin.views.add(this);
        this.themeObserver = new MutationObserver(() => {
            if (this.plugin.settings.darkMode === 'follow-obsidian') void this.onDarkReadersUpdated();
        });
        this.themeObserver.observe(this.containerEl.ownerDocument.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    isDarkModeEnabled(): boolean {
        return shouldUseDarkMode(
            this.plugin.settings.darkMode,
            this.containerEl.ownerDocument.body.classList.contains('theme-dark')
        );
    }

    async getAnnotationTarget(file: TFile): Promise<AnnotationTarget> {
        const annotationTargetPropertyValue = this.plugin.getPropertyValue(ANNOTATION_TARGET_PROPERTY, file);
        return resolveAnnotationTarget(annotationTargetPropertyValue, {
            resolveVaultFile: path => {
                const target = this.app.vault.getAbstractFileByPath(path);
                return target instanceof TFile ? target : null;
            }
        });
    }

    async onLoadFile(file: TFile) {
        const generation = ++this.loadGeneration;
        try {
            // Prevent pane from loading too early.
            await this.plugin.setupPromise;
            if (this.closed || generation !== this.loadGeneration) return;
            this.clearReader();
            const annotationTarget = await this.getAnnotationTarget(file);
            if (this.closed || generation !== this.loadGeneration) return;

            this.contentEl.removeClass('view-content');
            this.contentEl.style.height = '100%';
            this.annotationTarget = annotationTarget;
            const commonProps = {
                containerEl: this.contentEl,
                annotationFile: file.path,
                onload: async (iframe: HTMLIFrameElement) => {
                    if (this.closed || generation !== this.loadGeneration) return;
                    this.iframe = iframe;
                },
                onDarkReadersUpdated: async (references: Set<WeakRef<DarkReaderType>>) => {
                    if (!this.closed && generation === this.loadGeneration) await this.onDarkReadersUpdated(references);
                },
                onerror: (error: Error) => {
                    if (!this.closed && generation === this.loadGeneration) this.showError(error);
                }
            };
            ReactDOM.render(<this.plugin.PdfAnnotation pdf={annotationTarget} {...commonProps} />, this.contentEl);
        } catch (error) {
            if (!this.closed && generation === this.loadGeneration) this.showError(error);
        }
    }

    private showError(error: unknown) {
        this.clearReader();
        this.contentEl.createDiv({
            cls: 'annotator-plus-error',
            attr: { role: 'alert' },
            text: error instanceof Error ? error.message : 'Could not open the annotation target.'
        });
    }

    private clearReader() {
        ReactDOM.unmountComponentAtNode(this.contentEl);
        this.iframe = null;
        this.annotationTarget = undefined;
        this.darkReaderReferences.clear();
        this.contentEl.empty();
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
        this.dispose();
        this.plugin.views.delete(this);
    }

    dispose() {
        this.closed = true;
        ++this.loadGeneration;
        ++this.navigationGeneration;
        this.themeObserver.disconnect();
        this.clearReader();
    }

    async onUnloadFile(file: TFile) {
        ++this.loadGeneration;
        ++this.navigationGeneration;
        this.clearReader();
        await super.onUnloadFile(file);
    }

    async onRename(file: TFile) {
        await super.onRename(file);
        await this.onLoadFile(file);
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
        if (!this.file || !annotationId) return;
        const generation = ++this.navigationGeneration;
        const file = this.file;
        const annotation = await getAnnotation(annotationId, file, this.app.vault);
        if (!annotation) return;

        for (let attempt = 0; attempt < 100; attempt++) {
            if (this.closed || generation !== this.navigationGeneration || this.file !== file) return;
            const sidebarFrame = this.iframe?.contentDocument
                ?.querySelector('hypothesis-sidebar')
                ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe.sidebar-frame');
            const bridge = (sidebarFrame?.contentWindow as Window & { annotatorPlus?: AnnotatorPlusBridge })
                ?.annotatorPlus;
            if (bridge) {
                if (bridge.focusAnnotation(annotation.id)) return;
            }
            await wait(50);
        }

        if (this.plugin.settings.debugLogging) console.warn('Annotator+ sidebar bridge did not become ready');
    }
}
