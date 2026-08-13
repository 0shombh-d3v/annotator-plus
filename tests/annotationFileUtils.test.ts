jest.mock(
    'obsidian',
    () => {
        class TFile {
            path: string;
            constructor(path: string) {
                this.path = path;
            }
        }
        return { TFile };
    },
    { virtual: true }
);

import { TFile } from 'obsidian';
import { writeAnnotation } from '../src/annotationFileUtils';
import { loadAnnotationsAtUriFromFileText } from '../src/annotationUtils';
import { Annotation } from '../src/types';

test('concurrent annotation writes are serialized without losing either note', async () => {
    const file = new (TFile as unknown as { new (path: string): TFile })('notes.md');
    let exists = false;
    let text = '';
    const vault = {
        getAbstractFileByPath: () => (exists ? file : null),
        create: async (_path: string, value: string) => {
            await Promise.resolve();
            if (exists) throw new Error('already exists');
            exists = true;
            text = value;
            return file;
        },
        process: async (_file: TFile, change: (value: string) => string) => {
            text = change(text);
            return text;
        }
    };
    const plugin = {
        app: { vault },
        settings: {
            annotationMarkdownSettings: {
                annotationModeByDefault: true,
                includePrefix: true,
                includePostfix: true,
                highlightHighlightedText: true
            }
        }
    };
    const annotation = (id: string) =>
        ({ id, text: id, tags: [], target: [], document: { title: [] } } as unknown as Annotation);

    await Promise.all([
        writeAnnotation(annotation('first'), plugin as never, 'notes.md'),
        writeAnnotation(annotation('second'), plugin as never, 'notes.md')
    ]);
    expect(loadAnnotationsAtUriFromFileText(null, text).rows.map(row => row.id)).toEqual(['first', 'second']);
});
