import { SAMPLE_PDF_URL } from './constants';
import { IHasAnnotatorSettings } from 'settings';
import { Annotation, AnnotationList } from 'types';

const ANNOTATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isValidAnnotationId = (value: unknown): value is string =>
    typeof value === 'string' && ANNOTATION_ID_PATTERN.test(value);

export const isWritableAnnotation = (value: unknown): value is Annotation => {
    if (!value || typeof value !== 'object') return false;
    const annotation = value as Partial<Annotation>;
    return (
        (annotation.id === undefined || isValidAnnotationId(annotation.id)) &&
        typeof annotation.text === 'string' &&
        Array.isArray(annotation.tags) &&
        annotation.tags.every(tag => typeof tag === 'string') &&
        Array.isArray(annotation.target) &&
        annotation.target.every(
            target =>
                target &&
                typeof target === 'object' &&
                typeof target.source === 'string' &&
                (target.selector === undefined ||
                    (Array.isArray(target.selector) &&
                        target.selector.every(
                            selector => selector && typeof selector === 'object' && typeof selector.type === 'string'
                        )))
        ) &&
        (annotation.references === undefined ||
            (Array.isArray(annotation.references) && annotation.references.every(isValidAnnotationId)))
    );
};

const makeAnnotationBlockRegex = (annotationId?: string) =>
    new RegExp(
        '(?<annotationBlock>(?:^|\\r?\\n)> ?%%\\r?\\n> ?```annotation-json(?:\\r?\\n>[^\\n]*)*?)\\r?\\n\\^(?<annotationId>' +
            (annotationId ? escapeRegExp(annotationId) : '[A-Za-z0-9_-]{1,128}') +
            ')(?:\\r?\\n|$)',
        'gm'
    );

const getAnnotationFromAnnotationBlock = (annotationBlock: string, annotationId: string): Annotation => {
    const quotePrefix = /^> ```annotation-json\r?$/m.test(annotationBlock) ? /^> ?/ : /^>/;
    const lines = annotationBlock.split(/\r?\n/).map(line => line.replace(quotePrefix, ''));
    const jsonStart = lines.indexOf('```annotation-json');
    const jsonEnd = lines.indexOf('```', jsonStart + 1);
    if (jsonStart < 0 || jsonEnd < 0) throw new Error('The annotation JSON fence is incomplete.');
    const annotation = JSON.parse(lines.slice(jsonStart + 1, jsonEnd).join('\n'));
    if (!annotation || typeof annotation !== 'object' || Array.isArray(annotation))
        throw new Error('Invalid annotation metadata.');

    const metadata = lines.slice(jsonEnd + 1);
    const commentStart = metadata.indexOf('%%COMMENT%%');
    // Only the final tags delimiter is structural. Notes may quote these markers.
    const tagsStart = metadata.lastIndexOf('%%TAGS%%');
    const comment =
        commentStart < 0
            ? annotation.text || ''
            : metadata.slice(commentStart + 1, tagsStart > commentStart ? tagsStart : undefined).join('\n');
    const tags =
        tagsStart < 0
            ? annotation.tags || []
            : metadata
                  .slice(tagsStart + 1)
                  .join('\n')
                  .split(',')
                  .map(tag => tag.trim().replace(/^#/, ''))
                  .filter(Boolean);

    const excerpt = metadata.slice(0, commentStart < 0 ? undefined : commentStart).join('\n');
    const prefix = /%%PREFIX%%([\s\S]*?)(?=%%HIGHLIGHT%%|%%POSTFIX%%)/.exec(excerpt)?.[1];
    const suffix = /%%POSTFIX%%([\s\S]*?)\*(?:\n|$)/.exec(excerpt)?.[1];
    const context = (original: string | undefined, display: string | undefined) => {
        if (original === undefined) return display;
        return display?.trim() === original.trim() && display.length > original.length ? display : original;
    };
    if (Array.isArray(annotation.target?.[0]?.selector)) {
        annotation.target[0].selector = annotation.target[0].selector.map(selector =>
            selector?.type === 'TextQuoteSelector'
                ? {
                      ...selector,
                      prefix: context(selector.prefix, prefix),
                      suffix: context(selector.suffix, suffix)
                  }
                : selector
        );
    }

    const result = {
        ...makeDefaultAnnotationObject(annotationId, tags),
        ...annotation,
        id: annotationId,
        text: comment,
        tags
    };
    if (!isWritableAnnotation(result)) throw new Error('Invalid annotation fields or selectors.');
    delete result.group;
    // JSON selectors retain their original whitespace; the display excerpt is trimmed.
    return { ...makeDefaultAnnotationObject(annotationId, tags), ...result };
};

export const getAnnotationHighlightTextData = (annotation: Annotation) => {
    let prefix = '';
    let exact = '';
    let suffix = '';
    annotation.target?.[0]?.selector?.forEach(x => {
        if (x.type == 'TextQuoteSelector') {
            prefix = x.prefix || '';
            exact = x.exact || '';
            suffix = x.suffix || '';
        }
    });
    return { prefix, exact, suffix };
};

const makeAnnotationString = (annotation: Annotation, plugin: IHasAnnotatorSettings) => {
    const { highlightHighlightedText, includePostfix, includePrefix } = plugin.settings.annotationMarkdownSettings;
    const { prefix, exact, suffix } = getAnnotationHighlightTextData(annotation);

    const annotationString =
        '%%\n```annotation-json' +
        `\n${JSON.stringify(
            stripDefaultValues(annotation, makeDefaultAnnotationObject(annotation.id, annotation.tags))
        )}` +
        '\n```\n%%\n' +
        `*${includePrefix ? `%%PREFIX%%${prefix.trim()}` : ''}%%HIGHLIGHT%%${
            highlightHighlightedText ? ' ==' : ''
        }${exact.trim()}${highlightHighlightedText ? '== ' : ''}${
            includePostfix ? `%%POSTFIX%%${suffix.trim()}` : ''
        }*\n%%LINK%%[[#^${annotation.id}|show annotation]]\n%%COMMENT%%\n${
            annotation.text || ''
        }\n%%TAGS%%\n${annotation.tags.map(x => `#${x}`).join(', ')}`;

    return (
        '\n' +
        annotationString
            .split('\n')
            .map(x => `>${x}`)
            .join('\n') +
        '\n^' +
        annotation.id +
        '\n'
    );
};

export function getAnnotationFromFileContent(annotationId: string, fileContent: string): Annotation {
    if (!isValidAnnotationId(annotationId)) return null;
    const annotationRegex = makeAnnotationBlockRegex(annotationId);
    let m: RegExpExecArray;

    if ((m = annotationRegex.exec(fileContent)) !== null) {
        if (m.index === annotationRegex.lastIndex) {
            annotationRegex.lastIndex++;
        }
        const {
            groups: { annotationBlock, annotationId }
        } = m;
        try {
            return getAnnotationFromAnnotationBlock(annotationBlock, annotationId);
        } catch {
            return null;
        }
    } else {
        return null;
    }
}

export const makeDefaultAnnotationObject = (annotationId: string, tags: string[]) => ({
    group: '__world__',
    permissions: { read: ['Obsidian User'], update: ['Obsidian User'], delete: ['Obsidian User'] },
    tags,
    text: '',
    user: 'Obsidian User',
    user_info: { display_name: 'Obsidian User' },
    hidden: false,
    target: [],
    links: {},
    flagged: false,
    id: annotationId
});

export const stripDefaultValues = (obj: Record<string, unknown>, defaultObj: Record<string, unknown>) => {
    const strippedObject: Record<string, unknown> = {};
    const toIgnore = ['group', 'permissions', 'user', 'user_info'];
    for (const key of Object.keys(obj)) {
        if (JSON.stringify(obj[key]) !== JSON.stringify(defaultObj[key]) && !toIgnore.includes(key)) {
            strippedObject[key] = obj[key];
        }
    }
    return strippedObject;
};

export function writeAnnotationToAnnotationFileString(
    annotation: Annotation,
    annotationFileString: string | null,
    annotatorSettingsObject: IHasAnnotatorSettings
): { newAnnotationFileString: string; newAnnotation: Annotation } {
    if (!isWritableAnnotation(annotation)) throw new Error('Invalid annotation payload.');
    const annotationId = annotation.id || crypto.randomUUID();
    const res = JSON.parse(JSON.stringify(annotation));
    res.flagged = false;
    res.id = annotationId;
    const lineEnding = annotationFileString?.includes('\r\n') ? '\r\n' : '\n';
    const annotationString = makeAnnotationString(res, annotatorSettingsObject).replace(/\n/g, lineEnding);
    if (annotationFileString !== null) {
        let didReplace = false;
        const regex = makeAnnotationBlockRegex(annotationId);
        annotationFileString = annotationFileString.replace(regex, () => {
            didReplace = true;
            return annotationString;
        });
        if (!didReplace) {
            const separator = annotationFileString && !annotationFileString.endsWith(lineEnding) ? lineEnding : '';
            annotationFileString = `${annotationFileString}${separator}${annotationString}`;
        }
        return { newAnnotationFileString: annotationFileString, newAnnotation: res };
    } else {
        return { newAnnotationFileString: annotationString, newAnnotation: res };
    }
}

export function loadAnnotationsAtUriFromFileText(url: URL | null, fileText: string | null): AnnotationList {
    const params = url ? Object.fromEntries(url.searchParams.entries()) : null;
    if (params?.uri == 'app://obsidian.md/index.html') {
        return { rows: [], total: 0 };
    }

    const rows: Annotation[] = [];
    const errors: NonNullable<AnnotationList['errors']> = [];
    const decode = (value: string) => {
        try {
            return decodeURI(value);
        } catch {
            return value;
        }
    };

    const annotationRegex = makeAnnotationBlockRegex();
    if (fileText !== null) {
        let m: RegExpExecArray;
        while ((m = annotationRegex.exec(fileText)) !== null) {
            if (m.index === annotationRegex.lastIndex) {
                annotationRegex.lastIndex++;
            }
            const {
                groups: { annotationBlock, annotationId }
            } = m;
            let completeAnnotation: Annotation;
            try {
                completeAnnotation = getAnnotationFromAnnotationBlock(annotationBlock, annotationId);
            } catch (error) {
                errors.push({
                    id: annotationId,
                    message: error instanceof Error ? error.message : 'Invalid annotation block.'
                });
                continue;
            }
            const annotationDocumentIdentifiers = [
                completeAnnotation.document?.documentFingerprint,
                completeAnnotation.uri
            ];

            //The check against SAMPLE_PDF_URL is for backwards compability.
            if (
                url === null ||
                annotationDocumentIdentifiers.includes(params.uri) ||
                annotationDocumentIdentifiers.includes(encodeURI(params.uri)) ||
                annotationDocumentIdentifiers.includes(decode(params.uri)) ||
                annotationDocumentIdentifiers.includes(SAMPLE_PDF_URL)
            ) {
                rows.push(completeAnnotation);
            }
        }
    }
    return { rows, total: rows.length, ...(errors.length ? { errors } : {}) };
}

export function deleteAnnotationFromAnnotationFileString(
    annotationId: string,
    annotationFileString: string | null
): string {
    if (annotationFileString !== null) {
        let didReplace = false;
        const regex = makeAnnotationBlockRegex(annotationId);
        annotationFileString = annotationFileString.replace(regex, () => {
            didReplace = true;
            return '';
        });
        if (didReplace) {
            return annotationFileString;
        }
    }

    return annotationFileString;
}

export function checkPseudoAnnotationEquality(annotation: Annotation, pseudoAnnotation: Annotation): boolean {
    const selectors = annotation.target?.[0]?.selector;
    const pseudoSelectors = pseudoAnnotation.target?.[0]?.selector;
    if (!selectors?.length || !pseudoSelectors?.length) return false;

    const position = selectors.find(
        (x): x is Extract<typeof x, { type: 'TextPositionSelector' }> => x.type === 'TextPositionSelector'
    );
    const pseudoPosition = pseudoSelectors.find(
        (x): x is Extract<typeof x, { type: 'TextPositionSelector' }> => x.type === 'TextPositionSelector'
    );
    if (position && pseudoPosition) {
        if (position.start !== pseudoPosition.start || position.end !== pseudoPosition.end) return false;
        const quote = selectors.find(
            (x): x is Extract<typeof x, { type: 'TextQuoteSelector' }> => x.type === 'TextQuoteSelector'
        );
        const pseudoQuote = pseudoSelectors.find(
            (x): x is Extract<typeof x, { type: 'TextQuoteSelector' }> => x.type === 'TextQuoteSelector'
        );
        return !quote || !pseudoQuote || quote.exact === pseudoQuote.exact;
    }

    const normalize = (value: unknown): string => {
        if (Array.isArray(value)) return `[${value.map(normalize).sort().join(',')}]`;
        if (value && typeof value === 'object') {
            const record = value as Record<string, unknown>;
            return `{${Object.keys(record)
                .sort()
                .map(key => `${JSON.stringify(key)}:${normalize(record[key])}`)
                .join(',')}}`;
        }
        return JSON.stringify(value);
    };
    return normalize(selectors) === normalize(pseudoSelectors);
}
