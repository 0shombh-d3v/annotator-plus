import type { TFile, Workspace, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_PDF_ANNOTATOR } from './constants';

type AnnotationView = {
    leaf: WorkspaceLeaf;
    file: TFile | null;
    scrollToAnnotation: (id: string) => Promise<void>;
};

/** Follow a block link without replacing another open annotation document. */
export async function navigateToAnnotation(
    workspace: Pick<Workspace, 'activeLeaf' | 'getLeaf' | 'revealLeaf' | 'setActiveLeaf'>,
    views: Iterable<AnnotationView>,
    file: TFile,
    newPane: boolean,
    id: string | null
) {
    const existing = [...views].find(view => view.file?.path === file.path);
    let leaf = !newPane ? existing?.leaf : null;
    if (!leaf) {
        const activeIsAnnotator = [...views].some(view => view.leaf === workspace.activeLeaf);
        leaf = newPane || activeIsAnnotator ? workspace.getLeaf('split') : workspace.getLeaf();
        await leaf.setViewState({ type: VIEW_TYPE_PDF_ANNOTATOR, state: { file: file.path }, active: true });
    }
    await workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
    if (id) await [...views].find(view => view.leaf === leaf)?.scrollToAnnotation(id);
}
