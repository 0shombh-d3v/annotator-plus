jest.mock(
    'obsidian',
    () => ({
        TFile: class TFile {
            constructor(public path: string) {}
        }
    }),
    { virtual: true }
);
import { TFile } from 'obsidian';
import { handleAnnotationApi } from '../src/annotationApi';
import { Annotation } from '../src/types';
import { loadAnnotationsAtUriFromFileText, writeAnnotationToAnnotationFileString } from '../src/annotationUtils';

const settings = {
    annotationMarkdownSettings: { includePrefix: true, includePostfix: true, highlightHighlightedText: true }
};
const annotation = (id: string) =>
    ({
        id,
        text: `Note ${id}`,
        tags: [],
        target: [{ source: 'vault:/book.pdf' }],
        created: '2025-01-01T00:00:00.000Z',
        updated: '2025-01-01T00:00:00.000Z'
    } as Annotation);
function context() {
    const file = new (TFile as unknown as { new (path: string): TFile })('note.md');
    let content = '---\nannotation-target: book.pdf\n---\n';
    let exists = true;
    for (const id of ['one', 'two', 'three'])
        content = writeAnnotationToAnnotationFileString(annotation(id), content, {
            settings
        } as never).newAnnotationFileString;
    const vault = {
        getAbstractFileByPath: (path: string) => (path === file.path && exists ? file : null),
        read: jest.fn(async () => content),
        process: jest.fn(async (_file, change) => {
            content = change(content);
            return content;
        }),
        create: jest.fn()
    };
    const plugin = { app: { vault }, settings };
    const request = (path: string, method = 'GET', payload?: unknown) =>
        handleAnnotationApi(
            new URL(`http://localhost:8001/api/${path}`),
            { method, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) },
            plugin as never,
            file.path
        );
    return {
        request,
        vault,
        content: () => content,
        remove: () => {
            exists = false;
        }
    };
}

test('read an annotation and paginate search while retaining the full indicator collection', async () => {
    const c = context();
    const read = await c.request('annotations/two');
    expect(read.response.status).toBe(200);
    expect((await read.response.json()).id).toBe('two');
    expect(read.response.headers.get('Content-Type')).toBe('application/json');
    const search = await c.request('search?offset=1&limit=1');
    expect((await search.response.json()).rows.map(row => row.id)).toEqual(['two']);
    expect(search.annotations.rows).toHaveLength(3);
});

test('partial updates preserve selectors, creation time, and unrelated annotations', async () => {
    const c = context();
    const changed = await c.request('annotations/two', 'PATCH', { text: 'Updated ∞' });
    expect(changed.response.status).toBe(200);
    const result = await changed.response.json();
    expect(result.created).toBe('2025-01-01T00:00:00.000Z');
    expect(result.updated).not.toBe(result.created);
    expect(result.target).toEqual(annotation('two').target);
    const rows = loadAnnotationsAtUriFromFileText(null, c.content()).rows;
    expect(rows.map(row => [row.id, row.text])).toEqual([
        ['one', 'Note one'],
        ['two', 'Updated ∞'],
        ['three', 'Note three']
    ]);
});

test('invalid requests fail before mutating the note', async () => {
    const c = context();
    const before = c.content();
    for (const [path, method, payload, status] of [
        ['annotations/one', 'PUT', { ...annotation('two') }, 400],
        ['annotations/one', 'PATCH', { target: [{ source: 'pdf', selector: null }] }, 400],
        ['annotations/one', 'PATCH', [], 400],
        ['annotations/missing', 'GET', undefined, 404],
        ['annotations/%ZZ', 'DELETE', undefined, 400],
        ['search', 'POST', {}, 405],
        ['annotations', 'GET', undefined, 405]
    ] as [string, string, unknown, number][]) {
        expect((await c.request(path, method, payload)).response.status).toBe(status);
    }
    expect(c.content()).toBe(before);
    expect(c.vault.process).not.toHaveBeenCalled();
});

test('concurrent partial updates preserve independently changed fields', async () => {
    const c = context();
    const results = await Promise.all([
        c.request('annotations/one', 'PATCH', { text: 'Concurrent edit' }),
        c.request('annotations/one', 'PATCH', { tags: ['concurrent-tag'] })
    ]);
    expect(results.every(result => result.response.status === 200)).toBe(true);
    const saved = await (await c.request('annotations/one')).response.json();
    expect(saved.text).toBe('Concurrent edit');
    expect(saved.tags).toEqual(['concurrent-tag']);
});

test.each(['PUT', 'PATCH'])('a %s racing a deletion cannot recreate the deleted annotation', async method => {
    const c = context();
    let releaseRead: () => void;
    let readStarted: () => void;
    const started = new Promise<void>(resolve => {
        readStarted = resolve;
    });
    const gate = new Promise<void>(resolve => {
        releaseRead = resolve;
    });
    c.vault.read.mockImplementationOnce(async () => {
        const snapshot = c.content();
        readStarted();
        await gate;
        return snapshot;
    });
    const updating = c.request('annotations/one', method, { text: 'An edit from the old reader' });
    await started;
    expect((await c.request('annotations/one', 'DELETE')).response.status).toBe(200);
    releaseRead();
    const warning = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        const result = await updating;
        expect(result.response.ok).toBe(false);
        expect(loadAnnotationsAtUriFromFileText(null, c.content()).rows.map(row => row.id)).toEqual(['two', 'three']);
    } finally {
        warning.mockRestore();
    }
});

test('deleted or renamed notes are never recreated at a stale path', async () => {
    const c = context();
    c.remove();
    expect((await c.request('annotations', 'POST', annotation('new'))).response.status).toBe(404);
    expect(c.vault.create).not.toHaveBeenCalled();
});

test('write failures are reported as failed saves and retain the stored note', async () => {
    const c = context();
    const before = c.content();
    c.vault.process.mockRejectedValueOnce(new Error('Disk unavailable'));
    const warning = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        const result = await c.request('annotations/one', 'PATCH', { text: 'Draft' });
        expect(result.response.status).toBe(500);
        expect((await result.response.json()).reason).toContain('draft has been kept');
        expect(c.content()).toBe(before);
        // A failed save must not poison the per-file queue.
        expect((await c.request('annotations/one', 'PATCH', { text: 'Retry' })).response.status).toBe(200);
    } finally {
        warning.mockRestore();
    }
});

test('create and delete touch only the requested annotation', async () => {
    const c = context();
    expect((await c.request('annotations', 'POST', annotation('new'))).response.status).toBe(200);
    expect((await c.request('annotations/two', 'DELETE')).response.status).toBe(200);
    expect(loadAnnotationsAtUriFromFileText(null, c.content()).rows.map(row => row.id)).toEqual([
        'one',
        'three',
        'new'
    ]);
});
