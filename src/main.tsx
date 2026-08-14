import 'core-js';
import {
    FileView,
    MarkdownView,
    Plugin,
    ViewState,
    WorkspaceLeaf,
    TFile,
    MarkdownPostProcessorContext,
    parseLinktext,
    MenuItem
} from 'obsidian';

import StyleObserver from 'styleObserver';
import definePdfAnnotation from './definePdfAnnotation';
import { around } from 'monkey-around';

import { VIEW_TYPE_PDF_ANNOTATOR, ICON_NAME, ANNOTATION_TARGET_PROPERTY } from './constants';
import { Annotation, PdfAnnotationProps } from './types';
import * as codeMirror from '@codemirror/state';
import AnnotatorSettingsTab, { AnnotatorSettings, DEFAULT_SETTINGS, IHasAnnotatorSettings } from 'settings';
import AnnotatorView from 'annotatorView';
import { awaitResourceLoading, loadResourcesZip, unloadResources } from 'resourcesFolder';
import stringEncodedResourcesFolder from './resources!zipStringEncoded';
import * as jszip from 'jszip';
import SourceViewObserver from 'sourceViewObserver';
import { migrateDarkModeSettings } from './darkMode';

export default class AnnotatorPlugin extends Plugin implements IHasAnnotatorSettings {
    static instance: AnnotatorPlugin = null;
    // @ts-ignore: initialized by loadSettings() in onloadImpl()
    settings: AnnotatorSettings;
    views: Set<AnnotatorView> = new Set();

    public pdfAnnotatorFileModes: { [file: string]: string } = {};
    private _loaded = false;

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
        this.styleObserver = new StyleObserver();
        this.styleObserver.watch();
        this.registerView(VIEW_TYPE_PDF_ANNOTATOR, leaf => new AnnotatorView(leaf, this));
        await this.loadResources();
        this.PdfAnnotation = definePdfAnnotation(this.app.vault, this);
        this.addMarkdownPostProcessor();
        this.registerMonkeyPatches();
        this.registerSettingsTab();
        this.sourceViewObserver = new SourceViewObserver(this);
        this.sourceViewObserver.watch();

        this.registerEditorExtension(this.getDropExtension());

        this.addCommand({
            id: 'toggle-annotation-mode',
            name: 'Toggle Annotation/Markdown Mode',
            mobileOnly: false,
            callback: () => {
                const annotatorView = this.app.workspace.getActiveViewOfType(AnnotatorView);
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

                if (annotatorView != null) {
                    this.pdfAnnotatorFileModes[(annotatorView.leaf as any).id || annotatorView.file.path] = 'markdown'; // eslint-disable-line
                    this.setMarkdownView(annotatorView.leaf);
                } else if (markdownView != null) {
                    this.pdfAnnotatorFileModes[(markdownView.leaf as any).id || markdownView.file.path] = // eslint-disable-line
                        VIEW_TYPE_PDF_ANNOTATOR;
                    this.setAnnotatorView(markdownView.leaf);
                }
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
            this.app.workspace.on('file-open', file => {
                if (file) {
                    this.log('file opened');
                    if (this.sourceViewObserver.getObserver()) {
                        this.sourceViewObserver.resetTmpLinkInfo();
                        this.sourceViewObserver.getObserver().disconnect();
                    } else {
                        this.sourceViewObserver.initObserver();
                    }
                    this.sourceViewObserver.watch();
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
    }

    /*
     * Converts hypothesis-highlight to obsidian link when drag-and-drop
     */
    getDropExtension() {
        return codeMirror.EditorState.transactionFilter.of(
            (transaction: codeMirror.Transaction): codeMirror.TransactionSpec => {
                if (transaction.isUserEvent('input.drop')) {
                    try {
                        // changes.inserted used like this because ChangeSet doesn't have typed attributes for that
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
                        const droppedText = (transaction.changes as any).inserted
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .map((x: any) => x.text.join(''))
                            .join('');

                        if (this.dragData !== null && droppedText == 'drag-event::hypothesis-highlight') {
                            const startPos = transaction.selection.ranges[0].from;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const leaf: FileView = Object.keys((transaction.state as any).config.address)
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                .map(x => (transaction.state as any).field({ id: x }))
                                .filter(x => x?.file)[0];

                            const targetFile = leaf.file;

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
                                    changes: { from: startPos, insert: linkString },
                                    selection: { anchor: startPos }
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
        this.unloadResources();
        this.styleObserver.unwatch();
        this.styleObserver.listerners = null;
        this.styleObserver = null;
        AnnotatorPlugin.instance = null;

        if (this.sourceViewObserver.getObserver()) {
            this.sourceViewObserver.getObserver().disconnect();
        }
    }

    async loadSettings() {
        const { settings, migrated } = migrateDarkModeSettings((await this.loadData()) || {});
        const saved = { ...settings } as Partial<AnnotatorSettings> & {
            customDefaultPath?: unknown;
            epubSettings?: unknown;
        };
        delete saved.customDefaultPath;
        delete saved.epubSettings;
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
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PDF_ANNOTATOR);
        let leaf: WorkspaceLeaf | null = null;

        if (leaves?.length > 0) {
            leaf = leaves[0];
        }
        if (!leaf) {
            leaf = this.app.workspace.activeLeaf;
        }

        if (!leaf) {
            leaf = this.app.workspace.getLeaf();
        }

        if (onNewPane) {
            leaf = this.app.workspace.createLeafBySplit(leaf);
        }

        await leaf.setViewState({
            type: VIEW_TYPE_PDF_ANNOTATOR,
            state: { file: annotationTargetFile.path }
        });

        this.scrollToAnnotation(annotationId);
    }

    public scrollToAnnotation(annotationid: Annotation['id'] | null) {
        for (const view of this.views) {
            view.scrollToAnnotation(annotationid);
        }
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
                        if (
                            self._loaded &&
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

                                self.pdfAnnotatorFileModes[state.state.file] = VIEW_TYPE_PDF_ANNOTATOR;

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
                const file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(parsedLink.path, ctx.sourcePath);

                if (file !== null && annotationid != null && this.isAnnotationFile(file)) {
                    this.sourceViewObserver.addClickListener(link, annotationid, file, true);
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
