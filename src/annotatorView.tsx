import { getAnnotation } from 'annotationFileUtils';
import { ANNOTATION_TARGET_PROPERTY, ANNOTATION_TARGET_TYPE_PROPERTY, VIEW_TYPE_PDF_ANNOTATOR } from './constants';
import { DarkReaderType } from 'darkreader';
import AnnotatorPlugin from 'main';
import { Annotation, AnnotationTarget } from './types';
import { FileView, Menu, MenuItem, TFile, WorkspaceLeaf } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';
import { get_url_extension } from 'utils';
import { DARK_READER_FIXES, shouldUseDarkMode } from './darkMode';
import { resolveAnnotationTarget } from './targetResolver';
import { checkPseudoAnnotationEquality } from './annotationUtils';

export default class AnnotatorView extends FileView {
    plugin: AnnotatorPlugin;
    iframe: HTMLIFrameElement;
    activeG: () => void;
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
                throw new Error('Annotator+ supports PDF and EPUB targets only.');
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
            this.darkReaderReferences = darkReaderReferences;
        }

        this.darkReaderReferences.forEach(r => {
            const darkReader = r.deref();
            if (!darkReader) return;
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
            setTimeout(f, 1000);
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
        if (!annotation) return;
        let yoffset = -10000;
        let done = false;
        let newYOffset;
        const isPageNote = !annotation.target?.length;
        const annotationTargetType =
            this.plugin.getPropertyValue(ANNOTATION_TARGET_TYPE_PROPERTY, this.file) ||
            get_url_extension(this.annotationTarget?.url || '');

        const g = () => {
            try {
                if (this.activeG != g) return;
                const document = this.iframe.contentDocument.getElementsByTagName('iframe')[0].contentDocument;
                const sidebarIframe: HTMLIFrameElement =
                    this.iframe?.contentDocument
                        ?.querySelector('iframe')
                        ?.contentDocument?.querySelector('body > hypothesis-sidebar')
                        ?.shadowRoot?.querySelector('div > iframe') ||
                    this.iframe?.contentDocument
                        ?.querySelector('body > hypothesis-sidebar')
                        ?.shadowRoot?.querySelector('div > iframe');

                const guests: any[] = // eslint-disable-line
                    (this.iframe.contentWindow as any).guests || // eslint-disable-line
                    (this.iframe.contentDocument.getElementsByTagName('iframe')[0].contentWindow as any).guests; // eslint-disable-line

                if (isPageNote) {
                    //Open Page Notes
                    const showAllButton: HTMLElement = sidebarIframe.contentDocument.querySelector(
                        'body > hypothesis-app > div > div.HypothesisApp__content > main > div > div.FilterStatus > div > div:nth-child(2) > button'
                    );
                    showAllButton?.click?.();
                    const pageNotesButton: HTMLElement = sidebarIframe.contentDocument.querySelector(
                        'body > hypothesis-app > div > div.HypothesisApp__content > main > div > div.SelectionTabs-container > div > div:nth-child(2) > button'
                    );
                    pageNotesButton?.click?.();
                    guests[0]._sidebarRPC.channelListeners.openSidebar();
                    return;
                }

                switch (annotationTargetType) {
                    case 'pdf':
                        break;
                    case 'epub':
                        const loc = new URL(annotation.uri).searchParams.get('loc');
                        (this.iframe.contentWindow as any).rendition.display(loc); // eslint-disable-line
                        break;
                }

                for (const guest of guests) {
                    if (!guest) continue;
                    const matchingAnchors = guest.anchors.filter(x =>
                        checkPseudoAnnotationEquality(annotation, x?.annotation)
                    );

                    guest._sidebarRPC.call(
                        'showAnnotations',
                        matchingAnchors.map(x => x.annotation.$tag)
                    );
                    switch (annotationTargetType) {
                        case 'pdf':
                            for (const anchor of matchingAnchors) {
                                if (done) break;
                                for (const highlight of anchor.highlights) {
                                    if (done) break;
                                    if (highlight.scrollIntoViewIfNeeded) {
                                        highlight.scrollIntoViewIfNeeded();
                                        done = true;
                                    } else if (highlight.scrollIntoView) {
                                        highlight.scrollIntoView();
                                        done = true;
                                    }
                                }
                            }
                            break;
                        case 'epub':
                            // Use the "real" hypothes.is code.
                            (
                                sidebarIframe.contentDocument.getElementById(annotation.id).firstChild as HTMLElement
                            ).click();
                            break;
                    }
                    guest._sidebarRPC.channelListeners.focusAnnotations(matchingAnchors.map(x => x.annotation.$tag));
                    (
                        sidebarIframe.contentDocument.getElementById(annotation.id).firstChild as HTMLElement
                    ).dispatchEvent(new Event('mouseenter'));
                }

                newYOffset = document.getElementsByTagName('hypothesis-highlight')[0].getBoundingClientRect().y;
                if (newYOffset != yoffset && annotationTargetType == 'pdf') {
                    yoffset = newYOffset;
                    setTimeout(g, 100);
                }
            } catch (e) {
                if (annotationTargetType == 'pdf') {
                    setTimeout(g, 100);
                } else if (this.plugin.settings.debugLogging) {
                    console.error(e);
                }
            }
        };
        this.activeG = g;
        try {
            setTimeout(function () {
                g();
            }, 1000);
        } catch (e) {}
        try {
            g();
        } catch (e) {}
    }
}
