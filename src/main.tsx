import 'core-js';
import {
    MarkdownView,
    Plugin,
    ViewState,
    WorkspaceLeaf,
    TFile,
    MarkdownPostProcessorContext,
    parseLinktext,
    MenuItem,
    editorInfoField
} from 'obsidian';

import StyleObserver from 'styleObserver';
import definePdfAnnotation from './definePdfAnnotation';
import { around } from 'monkey-around';

import {
    VIEW_TYPE_PDF_ANNOTATOR,
    LEGACY_VIEW_TYPE_PDF_ANNOTATOR,
    ICON_NAME,
    ANNOTATION_TARGET_PROPERTY
} from './constants';
import { Annotation, PdfAnnotationProps } from './types';
import * as codeMirror from '@codemirror/state';
import AnnotatorSettingsTab, { AnnotatorSettings, DEFAULT_SETTINGS, IHasAnnotatorSettings } from 'settings';
import AnnotatorView from 'annotatorView';
import { awaitResourceLoading, loadResourcesZip, unloadResources } from 'resourcesFolder';
import stringEncodedResourcesFolder from './resources!zipStringEncoded';
import * as jszip from 'jszip';
import SourceViewObserver from 'sourceViewObserver';
import { migrateDarkModeSettings } from './darkMode';
import { navigateToAnnotation } from './annotationNavigation';

export default class AnnotatorPlugin extends Plugin implements IHasAnnotatorSettings {
    static instance: AnnotatorPlugin = null;
    // @ts-ignore: initialized by loadSettings() in onloadImpl()
    settings: AnnotatorSettings;
    views: Set<AnnotatorView> = new Set();

    public pdfAnnotatorFileModes: { [file: string]: string } = {};
    private ready = false;
    private unloading = false;

    // All these initialized in onloadImpl(), instead of constructor
    // @ts-ignore
    PdfAnnotation: (props: PdfAnnotationProps) => JSX.Element;
    // Used to store text of hypothesis highlight during drag-and-drop event
    dragData: null | { annotationFilePath: string; annotationId: string; annotationText: string } = null;

    // @ts-ignore initializes in onload()
    setupPromise: Promise<void>;
    styleObserver: StyleObserver;

    // @ts-ignore initializes in onloadImpl()
    sourceViewObserver: SourceViewObserver;

    async onload() {
        this.unloading = false;
        AnnotatorPlugin.instance = this;
        this.setupPromise = this.onloadImpl();
        await this.setupPromise;
    }

    async loadResources() {
        await loadResourcesZip(jszip.loadAsync(stringEncodedResourcesFolder));
        await awaitResourceLoading();
    }

    unloadResources() {
        unloadResources();
    }

    async onloadImpl() {
        await this.loadSettings();
        if (this.unloading) return;
        this.styleObserver = new StyleObserver();
        this.styleObserver.watch();
        this.registerView(VIEW_TYPE_PDF_ANNOTATOR, leaf => new AnnotatorView(leaf, this));
        await this.loadResources();
        if (this.unloading) {
            this.unloadResources();
            return;
        }
        this.PdfAnnotation = definePdfAnnotation(this.app.vault, this);
        this.sourceViewObserver = new SourceViewObserver(this);
        this.addMarkdownPostProcessor();
        this.registerMonkeyPatches();
        this.registerSettingsTab();
        this.registerEditorExtension(this.sourceViewObserver.editorExtension);

        this.registerEditorExtension(this.getDropExtension());

        this.addCommand({
            id: 'toggle-annotation-mode',
            name: 'Toggle Annotation/Markdown Mode',
            mobileOnly: false,
            checkCallback: checking => {
                const annotatorView = this.app.workspace.getActiveViewOfType(AnnotatorView);
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!annotatorView && (!markdownView?.file || !this.isAnnotationFile(markdownView.file))) return false;
                if (checking) return true;

                if (annotatorView != null) {
                    this.pdfAnnotatorFileModes[(annotatorView.leaf as any).id || annotatorView.file.path] = 'markdown'; // eslint-disable-line
                    void this.setMarkdownView(annotatorView.leaf);
                } else if (markdownView != null) {
                    this.pdfAnnotatorFileModes[(markdownView.leaf as any).id || markdownView.file.path] = // eslint-disable-line
                        VIEW_TYPE_PDF_ANNOTATOR;
                    void this.setAnnotatorView(markdownView.leaf);
                }
                return true;
            }
        });

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
                if (
                    leaf?.view instanceof MarkdownView &&
                    file instanceof TFile &&
                    this.getPropertyValue(ANNOTATION_TARGET_PROPERTY, file)
                ) {
                    // any because item doesn't have .setSection() in the type
                    // eslint-disable-next-line
                    menu.addItem(
                        (item: MenuItem): MenuItem =>
                            item
                                .setTitle('Annotate')
                                .setIcon(ICON_NAME)
                                .onClick(async () => {
                                    // any because leaf doesn't have id in type
                                    // eslint-disable-next-line
                                    this.pdfAnnotatorFileModes[(leaf as any).id || file.path] = VIEW_TYPE_PDF_ANNOTATOR;
                                    await this.setAnnotatorView(leaf);
                                })
                    );
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('css-change', () => {
                if (this.settings.darkMode === 'follow-obsidian') {
                    this.views.forEach(view => void view.onDarkReadersUpdated());
                }
            })
        );
        this.ready = true;
    }

    /*
     * Converts hypothesis-highlight to obsidian link when drag-and-drop
     */
    getDropExtension() {
        return codeMirror.EditorState.transactionFilter.of(
            (transaction: codeMirror.Transaction): codeMirror.TransactionSpec => {
                if (transaction.isUserEvent('input.drop')) {
                    try {
                        const changes: { from: number; to: number; text: string }[] = [];
                        transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) =>
                            changes.push({ from, to, text: inserted.toString() })
                        );
                        if (
                            this.dragData !== null &&
                            changes.length === 1 &&
                            changes[0].text === 'drag-event::hypothesis-highlight'
                        ) {
                            const { from, to } = changes[0];
                            const targetFile = transaction.startState.field(editorInfoField, false)?.file;

                            const annotationFile = this.app.vault.getAbstractFileByPath(
                                this.dragData.annotationFilePath
                            );
                            if (annotationFile instanceof TFile && targetFile instanceof TFile) {
                                const linkString = this.app.fileManager.generateMarkdownLink(
                                    annotationFile,
                                    targetFile.path,
                                    `#^${this.dragData.annotationId}`,
                                    this.dragData.annotationText
                                );
                                this.dragData = null;
                                return {
                                    changes: { from, to, insert: linkString },
                                    selection: { anchor: from + linkString.length }
                                };
                            }
                        }
                    } catch (e) {
                        this.log('Failed to handle hypothesis drag-and-drop annotation event: ', e);
                    }
                }
                return transaction;
            }
        );
    }

    registerSettingsTab() {
        this.addSettingTab(new AnnotatorSettingsTab(this.app, this));
    }

    onunload() {
        this.unloading = true;
        this.ready = false;
        this.views.forEach(view => view.dispose());
        this.views.clear();
        this.unloadResources();
        this.styleObserver?.unwatch();
        this.styleObserver = null;
        AnnotatorPlugin.instance = null;

        this.sourceViewObserver?.disconnect();
        this.dragData = null;
    }

    async loadSettings() {
        const { settings, migrated } = migrateDarkModeSettings((await this.loadData()) || {});
        const saved = settings as Partial<AnnotatorSettings>;
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...saved,
            darkReaderSettings: { ...DEFAULT_SETTINGS.darkReaderSettings, ...saved.darkReaderSettings },
            annotationMarkdownSettings: {
                ...DEFAULT_SETTINGS.annotationMarkdownSettings,
                ...saved.annotationMarkdownSettings
            }
        };
        if (migrated) await this.saveData(this.settings);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.views.forEach(v => v.onDarkReadersUpdated());
    }

    public async openAnnotationTarget(
        annotationTargetFile: TFile,
        onNewPane: boolean,
        annotationId: string | null
    ): Promise<void> {
        await navigateToAnnotation(this.app.workspace, this.views, annotationTargetFile, onNewPane, annotationId);
    }

    public scrollToAnnotation(annotationid: Annotation['id'] | null) {
        const view = this.app.workspace.getActiveViewOfType(AnnotatorView);
        if (view) void view.scrollToAnnotation(annotationid);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPropertyValue(propertyName: string, file: TFile | null): any | null {
        if (!file) {
            return null;
        }

        // eslint-disable-next-line
        const dataViewPropertyValue: any | undefined = (this.app as any)?.plugins // eslint-disable-line
            ?.getPlugin('dataview')
            ?.api?.page(file.path)?.[propertyName];

        if (dataViewPropertyValue) {
            if (dataViewPropertyValue.path) {
                return this.app.metadataCache.getFirstLinkpathDest(dataViewPropertyValue.path, file.path)?.path;
            }
            const externalLinkMatch = /^\[.*\]\((.*)\)$/gm.exec(dataViewPropertyValue)?.[1];
            if (externalLinkMatch) {
                return externalLinkMatch;
            }
            return dataViewPropertyValue;
        } else {
            const cache = this.app.metadataCache.getFileCache(file);
            return cache?.frontmatter?.[propertyName];
        }
    }

    private registerMonkeyPatches() {
        const self = this;

        // Monkey patch WorkspaceLeaf to open Annotations in the Annotation view by default
        this.register(
            around(WorkspaceLeaf.prototype, {
                detach(next) {
                    return function () {
                        const state = this.view?.getState();

                        if (state?.file && self.pdfAnnotatorFileModes[this.id || state.file]) {
                            delete self.pdfAnnotatorFileModes[this.id || state.file];
                        }

                        return next.apply(this);
                    };
                },

                setViewState(next) {
                    return function (state: ViewState, ...rest: unknown[]) {
                        // Restore workspaces saved by 1.0.0 without claiming the fallback plugin's view type.
                        if (
                            state.type === LEGACY_VIEW_TYPE_PDF_ANNOTATOR &&
                            !(
                                self.app as typeof self.app & { plugins: { getPlugin: (id: string) => unknown } }
                            ).plugins?.getPlugin('obsidian-annotator')
                        ) {
                            // eslint-disable-line
                            state = { ...state, type: VIEW_TYPE_PDF_ANNOTATOR };
                        }
                        if (
                            self.ready &&
                            state.type === 'markdown' &&
                            typeof state.state?.file === 'string' &&
                            self.pdfAnnotatorFileModes[this.id || state.state.file] !== 'markdown' &&
                            self.settings.annotationMarkdownSettings.annotationModeByDefault === true
                        ) {
                            const file = self.app.vault.getAbstractFileByPath(state.state.file);

                            if (file instanceof TFile && self.getPropertyValue(ANNOTATION_TARGET_PROPERTY, file)) {
                                const newState = {
                                    ...state,
                                    type: VIEW_TYPE_PDF_ANNOTATOR
                                };

                                self.pdfAnnotatorFileModes[this.id || state.state.file] = VIEW_TYPE_PDF_ANNOTATOR;

                                return next.apply(this, [newState, ...rest]);
                            }
                        }

                        return next.apply(this, [state, ...rest]);
                    };
                }
            })
        );
    }

    public async setAnnotatorView(leaf: WorkspaceLeaf) {
        await leaf.setViewState({
            type: VIEW_TYPE_PDF_ANNOTATOR,
            state: leaf.view.getState(),
            popstate: true
        } as ViewState);
    }

    public async setMarkdownView(leaf: WorkspaceLeaf) {
        await leaf.setViewState(
            {
                type: 'markdown',
                state: leaf.view.getState(),
                popstate: true
            } as ViewState,
            { focus: true }
        );
    }

    isAnnotationFile(f: TFile | null): boolean {
        return !(this.getPropertyValue(ANNOTATION_TARGET_PROPERTY, f) == null);
    }

    private addMarkdownPostProcessor() {
        const markdownPostProcessor = async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            for (const link of el.getElementsByClassName('internal-link') as HTMLCollectionOf<HTMLAnchorElement>) {
                const linkHref = link.getAttribute('href');
                if (linkHref === null) {
                    continue;
                }
                const parsedLink = parseLinktext(linkHref);
                const annotationid = parsedLink.subpath.startsWith('#^') ? parsedLink.subpath.substr(2) : null;
                const file = parsedLink.path
                    ? this.app.metadataCache.getFirstLinkpathDest(parsedLink.path, ctx.sourcePath)
                    : this.app.vault.getAbstractFileByPath(ctx.sourcePath);

                if (file instanceof TFile && annotationid != null && this.isAnnotationFile(file)) {
                    this.sourceViewObserver.addClickListener(link, annotationid, file);
                }
            }
        };

        this.registerMarkdownPostProcessor(markdownPostProcessor);
    }

    log(...args: Parameters<LogType>) {
        if (this.settings.debugLogging) {
            // eslint-disable-next-line no-console
            console.log(...args);
        }
    }
}

type LogType = typeof console.log;
