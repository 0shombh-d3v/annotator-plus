import { navigateToAnnotation } from '../src/annotationNavigation';
import { VIEW_TYPE_PDF_ANNOTATOR } from '../src/constants';

function context() {
    const leaf = () => ({ setViewState: jest.fn(async () => undefined) });
    const first = { leaf: leaf(), file: { path: 'primer.md' }, scrollToAnnotation: jest.fn(async () => undefined) };
    const second = { leaf: leaf(), file: { path: 'math.md' }, scrollToAnnotation: jest.fn(async () => undefined) };
    const newLeaf = leaf();
    const workspace = {
        activeLeaf: first.leaf,
        getLeaf: jest.fn(() => newLeaf),
        revealLeaf: jest.fn(async () => undefined),
        setActiveLeaf: jest.fn()
    };
    return { first, second, newLeaf, workspace };
}

test('following a link reuses and activates its matching PDF, preserving the other PDF', async () => {
    const c = context();
    await navigateToAnnotation(
        c.workspace as never,
        [c.first, c.second] as never,
        c.second.file as never,
        false,
        'highlight'
    );
    expect(c.workspace.getLeaf).not.toHaveBeenCalled();
    expect(c.first.leaf.setViewState).not.toHaveBeenCalled();
    expect(c.second.leaf.setViewState).not.toHaveBeenCalled();
    expect(c.workspace.revealLeaf).toHaveBeenCalledWith(c.second.leaf);
    expect(c.workspace.setActiveLeaf).toHaveBeenCalledWith(c.second.leaf, { focus: true });
    expect(c.second.scrollToAnnotation).toHaveBeenCalledWith('highlight');
    expect(c.first.scrollToAnnotation).not.toHaveBeenCalled();
});

test('an unopened target uses a split when another PDF is active', async () => {
    const c = context();
    await navigateToAnnotation(c.workspace as never, [c.first] as never, c.second.file as never, false, null);
    expect(c.workspace.getLeaf).toHaveBeenCalledWith('split');
    expect(c.newLeaf.setViewState).toHaveBeenCalledWith({
        type: VIEW_TYPE_PDF_ANNOTATOR,
        state: { file: 'math.md' },
        active: true
    });
    expect(c.first.leaf.setViewState).not.toHaveBeenCalled();
});

test('modifier-click opens a split even when the document already has a reader', async () => {
    const c = context();
    await navigateToAnnotation(c.workspace as never, [c.first, c.second] as never, c.second.file as never, true, null);
    expect(c.workspace.getLeaf).toHaveBeenCalledWith('split');
    expect(c.second.leaf.setViewState).not.toHaveBeenCalled();
    expect(c.workspace.setActiveLeaf).toHaveBeenCalledWith(c.newLeaf, { focus: true });
});
