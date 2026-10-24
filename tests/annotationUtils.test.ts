import fs from 'fs';
import path from 'path';
import { IHasAnnotatorSettings } from 'settings';
import * as annotationUtils from '../src/annotationUtils';
import { Annotation } from '../src/types';

const testAnnotatorSettings: IHasAnnotatorSettings = {
    settings: {
        darkMode: 'follow-obsidian',
        darkReaderSettings: null,
        debugLogging: false,
        annotationMarkdownSettings: {
            annotationModeByDefault: true,
            includePostfix: true,
            includePrefix: true,
            highlightHighlightedText: true
        }
    }
};

function loadMd(mdfile: string) {
    const mdTestFilePath = path.join(__dirname, './', mdfile);
    return fs.readFileSync(mdTestFilePath, { encoding: 'utf8' }).replaceAll('\r\n', '\n');
}

function loadJson(jsonfile: string) {
    const jsonTestFilePath = path.join(__dirname, './', jsonfile);
    return fs.readFileSync(jsonTestFilePath, { encoding: 'utf8' });
}

test('AnnotationShouldBeCorrectlyParsed', () => {
    const mdTestFile = loadMd('testfile.md');
    const jsonTestFile = loadJson('testfile.json');
    const loadedAnnotations = annotationUtils.loadAnnotationsAtUriFromFileText(null, mdTestFile);
    expect(JSON.parse(jsonTestFile)).toEqual(loadedAnnotations);
});

test('AnnotationsCanBeModified', () => {
    const mdTestFile = loadMd('testfile2.md');
    const loadedAnnotations = annotationUtils.loadAnnotationsAtUriFromFileText(null, mdTestFile);
    const modifiedAnnotation: Annotation = {
        ...JSON.parse(JSON.stringify(loadedAnnotations.rows[0])),
        text: 'this is a modified comment'
    };
    const res = annotationUtils.writeAnnotationToAnnotationFileString(
        modifiedAnnotation,
        mdTestFile,
        testAnnotatorSettings
    );
    const loadedModifiedAnnotations = annotationUtils.loadAnnotationsAtUriFromFileText(
        null,
        res.newAnnotationFileString
    );
    expect(loadedModifiedAnnotations.total).toEqual(loadedAnnotations.total);
    expect(loadedModifiedAnnotations.rows[0]).toEqual(modifiedAnnotation);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const drop1 = ([_, ...rest]: Annotation[]) => rest;
    expect(drop1(loadedAnnotations.rows)).toEqual(drop1(loadedModifiedAnnotations.rows));
});

test('AnnotationsCanBeAdded', () => {
    const mdTestFile = loadMd('testfile2.md');
    const loadedAnnotations = annotationUtils.loadAnnotationsAtUriFromFileText(null, mdTestFile);
    const newAnnotation: Annotation = { ...JSON.parse(JSON.stringify(loadedAnnotations.rows[0])), id: 'anewid' };
    const res = annotationUtils.writeAnnotationToAnnotationFileString(newAnnotation, mdTestFile, testAnnotatorSettings);
    const loadedModifiedAnnotations = annotationUtils.loadAnnotationsAtUriFromFileText(
        null,
        res.newAnnotationFileString
    );
    expect(loadedModifiedAnnotations.total).toEqual(loadedAnnotations.total + 1);
    expect(loadedModifiedAnnotations.rows).toEqual([...loadedAnnotations.rows, newAnnotation]);
});

test('selector identity prefers position and rejects page notes', () => {
    const target = (selector: Annotation['target'][0]['selector']) =>
        ({ target: [{ source: 'pdf', selector }] } as Annotation);
    const position = { type: 'TextPositionSelector', start: 10, end: 20 } as const;
    const quote = { type: 'TextQuoteSelector', exact: 'same text', prefix: '', suffix: '' } as const;

    expect(annotationUtils.checkPseudoAnnotationEquality(target([position, quote]), target([quote, position]))).toBe(
        true
    );
    expect(
        annotationUtils.checkPseudoAnnotationEquality(
            target([position, quote]),
            target([{ ...position, start: 30, end: 40 }, quote])
        )
    ).toBe(false);
    expect(
        annotationUtils.checkPseudoAnnotationEquality(
            target([position, quote]),
            target([position, { ...quote, exact: 'different text' }])
        )
    ).toBe(false);
    expect(annotationUtils.checkPseudoAnnotationEquality({ target: [] } as Annotation, target([position]))).toBe(false);
});

test('legacy selector sets match independent of selector and object-key order', () => {
    const first = {
        target: [
            {
                source: 'pdf',
                selector: [
                    {
                        type: 'RangeSelector',
                        startContainer: '/p[1]',
                        startOffset: 0,
                        endContainer: '/p[1]',
                        endOffset: 2
                    },
                    { type: 'TextQuoteSelector', exact: 'hi', prefix: '', suffix: '' }
                ]
            }
        ]
    } as Annotation;
    const second = {
        target: [
            {
                source: 'pdf',
                selector: [
                    { suffix: '', exact: 'hi', prefix: '', type: 'TextQuoteSelector' },
                    {
                        endOffset: 2,
                        endContainer: '/p[1]',
                        startOffset: 0,
                        startContainer: '/p[1]',
                        type: 'RangeSelector'
                    }
                ]
            }
        ]
    } as Annotation;
    expect(annotationUtils.checkPseudoAnnotationEquality(first, second)).toBe(true);
});

test('annotation writes accept only safe IDs and the expected payload shape', () => {
    expect(annotationUtils.isValidAnnotationId('safe_note-1')).toBe(true);
    expect(annotationUtils.isValidAnnotationId('../unsafe')).toBe(false);
    expect(annotationUtils.isWritableAnnotation({ text: 'note', tags: ['tag'], target: [] })).toBe(true);
    expect(annotationUtils.isWritableAnnotation({ id: 'bad/id', text: 'note', tags: [], target: [] })).toBe(false);
    expect(annotationUtils.isWritableAnnotation({ text: 'note', tags: 'tag', target: [] })).toBe(false);
});

test('CRLF and a final block ID without a newline remain readable', () => {
    const text = loadMd('testfile.md');
    const expected = annotationUtils.loadAnnotationsAtUriFromFileText(null, text);
    expect(annotationUtils.loadAnnotationsAtUriFromFileText(null, text.replace(/\n/g, '\r\n').trimEnd())).toEqual(
        expected
    );
});

test('one corrupt JSON block does not hide the remaining annotations or rewrite the source', () => {
    const text = loadMd('testfile.md');
    const expected = annotationUtils.loadAnnotationsAtUriFromFileText(null, text);
    const corrupted = text.replace(/(>```annotation-json\n)>[^\n]+/, '$1>{broken JSON');
    const loaded = annotationUtils.loadAnnotationsAtUriFromFileText(null, corrupted);
    expect(loaded.rows).toEqual(expected.rows.slice(1));
    expect(loaded.errors).toHaveLength(1);
    expect(loaded.errors[0].id).toBe(expected.rows[0].id);
    expect(corrupted).toContain('>{broken JSON');
});

test('comments preserve indentation, Unicode, blank lines, and literal marker lines', () => {
    const base = annotationUtils.loadAnnotationsAtUriFromFileText(null, loadMd('testfile2.md')).rows[0];
    const comment = '  indented $x$\n\n> quoted\n%%TAGS%%\n#literal, not tags\nमराठी ∞';
    const annotation = { ...base, text: comment, tags: ['math', 'नोट'] };
    const result = annotationUtils.writeAnnotationToAnnotationFileString(annotation, '', testAnnotatorSettings);
    expect(annotationUtils.getAnnotationFromFileContent(annotation.id, result.newAnnotationFileString)).toEqual(
        annotation
    );
});

test.each(['\n', '\r\n'])('unambiguous tags survive saving and reopening in %j notes', lineEnding => {
    const base = annotationUtils.loadAnnotationsAtUriFromFileText(null, loadMd('testfile2.md')).rows[0];
    const annotation = { ...base, tags: ['functions, polynomials', 'ordinary', 'विषय', 'line\n%%TAGS%%\nvalue'] };
    const prose = `User prose.${lineEnding}`;
    const result = annotationUtils.writeAnnotationToAnnotationFileString(annotation, prose, testAnnotatorSettings);
    expect(annotationUtils.getAnnotationFromFileContent(annotation.id, result.newAnnotationFileString).tags).toEqual(
        annotation.tags
    );
    expect(result.newAnnotationFileString.startsWith(prose)).toBe(true);
});

test('manual edits to the displayed tags still take precedence over saved JSON tags', () => {
    const base = annotationUtils.loadAnnotationsAtUriFromFileText(null, loadMd('testfile2.md')).rows[0];
    const result = annotationUtils.writeAnnotationToAnnotationFileString(
        { ...base, tags: ['old'] },
        '',
        testAnnotatorSettings
    );
    const edited = result.newAnnotationFileString.replace('%%TAGS%%\n>#old', '%%TAGS%%\n>#new, #other');
    expect(annotationUtils.getAnnotationFromFileContent(base.id, edited).tags).toEqual(['new', 'other']);
});

test('saving a trimmed excerpt retains the original selector context and CRLF prose', () => {
    const base = annotationUtils.loadAnnotationsAtUriFromFileText(null, loadMd('testfile2.md')).rows[0];
    const selectors = [
        { type: 'TextQuoteSelector', exact: 'quote', prefix: ' before ', suffix: ' after ' }
    ] as Annotation['target'][0]['selector'];
    const annotation = { ...base, target: [{ source: 'vault:/book.pdf', selector: selectors }] };
    const prose = '---\r\nannotation-target: book.pdf\r\n---\r\n\r\nUser prose.\r\n';
    const result = annotationUtils.writeAnnotationToAnnotationFileString(annotation, prose, testAnnotatorSettings);
    const restored = annotationUtils.getAnnotationFromFileContent(annotation.id, result.newAnnotationFileString);
    expect(restored.target).toEqual(annotation.target);
    expect(result.newAnnotationFileString.startsWith(prose)).toBe(true);
    expect(result.newAnnotationFileString.replace(/\r\n/g, '')).not.toContain('\n');
});

test('deleting an EOF annotation leaves the preceding note intact', () => {
    const base = annotationUtils.loadAnnotationsAtUriFromFileText(null, loadMd('testfile2.md')).rows[0];
    const text = annotationUtils
        .writeAnnotationToAnnotationFileString(base, 'User prose.\n', testAnnotatorSettings)
        .newAnnotationFileString.trimEnd();
    expect(annotationUtils.deleteAnnotationFromAnnotationFileString(base.id, text)).toBe('User prose.\n');
});

test('malformed nested selectors and unsafe direct writes are rejected', () => {
    expect(
        annotationUtils.isWritableAnnotation({ text: '', tags: [], target: [{ source: 'pdf', selector: 'bad' }] })
    ).toBe(false);
    const base = annotationUtils.loadAnnotationsAtUriFromFileText(null, loadMd('testfile2.md')).rows[0];
    expect(() =>
        annotationUtils.writeAnnotationToAnnotationFileString({ ...base, id: '../unsafe' }, '', testAnnotatorSettings)
    ).toThrow('Invalid annotation payload');
});
