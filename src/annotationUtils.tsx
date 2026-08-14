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
        Array.isArray(annotation.target)
    );
};

const makeAnnotationBlockRegex = (annotationId?: string) =>
    new RegExp(
        '(?<annotationBlock>^\n(>.*?\n)*?>```annotation-json(\n>.*?)*?)\n\\^(?<annotationId>' +
            (annotationId ? escapeRegExp(annotationId) : '[A-Za-z0-9_-]{1,128}') +
            ')\n',
        'gm'
    );

const getAnnotationFromAnnotationBlock = (annotationBlock: string, annotationId: string): Annotation => {
    const contentRegex = makeAnnotationContentRegex();
    const content = annotationBlock
        .split('\n')
        .map(x => x.substr(1))
        .join('\n');

    const {
        groups: { annotationJson, prefix, highlight, postfix, comment, tags }
    } = contentRegex.exec(content);
    const annotation = JSON.parse(annotationJson);
    const annotationTarget = annotation.target?.[0];
    if (annotationTarget && 'selector' in annotationTarget) {
        annotationTarget.selector = annotationTarget.selector.map(x =>
            x.type == 'TextQuoteSelector'
                ? { ...x, prefix: prefix ?? x.prefix, exact: x.exact ?? highlight, suffix: postfix ?? x.suffix }
                : x
        );
    }
    annotation.text = comment;
    annotation.tags = tags
        .split(',')
        .map(x => x.trim().substr(1))
        .filter(x => x);
    if ('group' in annotation) {
        delete annotation.group;
    }
    return { ...makeDefaultAnnotationObject(annotationId, annotation.tags), ...annotation };
};

const makeAnnotationContentRegex = () =>
    new RegExp(
        [
            '(.|\\n)*?',
            '%%\\n',
            '```annotation-json\\n',
            '(?<annotationJson>(.|\\n)*?)\\n',
            '```\\n',
            '%%(.|\\n)*?\\*',
            '(%%PREFIX%%(?<prefix>(.|\\n)*?))?',
            '(%%HIGHLIGHT%%( ==)?(?<highlight>(.|\\n)*?)(== )?)?',
            '(%%POSTFIX%%(?<postfix>(.|\\n)*?))?\\*\\n',
            '(%%LINK%%(?<link>(.|\\n)*?)\\n)?',
            '(%%COMMENT%%\\n(?<comment>(.|\\n)*?)\\n)?',
            '(%%TAGS%%\\n(?<tags>(.|\\n)*))?',
            '$'
        ].join(''),
        'g'
    );

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
    const annotationRegex = makeAnnotationBlockRegex(annotationId);
    let m: RegExpExecArray;

    if ((m = annotationRegex.exec(fileContent)) !== null) {
        if (m.index === annotationRegex.lastIndex) {
            annotationRegex.lastIndex++;
        }
        const {
            groups: { annotationBlock, annotationId }
        } = m;
        return getAnnotationFromAnnotationBlock(annotationBlock, annotationId);
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
    const annotationId = annotation.id || crypto.randomUUID();
    const res = JSON.parse(JSON.stringify(annotation));
    res.flagged = false;
    res.id = annotationId;
    const annotationString = makeAnnotationString(res, annotatorSettingsObject);
    if (annotationFileString !== null) {
        let didReplace = false;
        const regex = makeAnnotationBlockRegex(annotationId);
        annotationFileString = annotationFileString.replace(regex, () => {
            didReplace = true;
            return annotationString;
        });
        if (!didReplace) {
            annotationFileString = `${annotationFileString}\n${annotationString}`;
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

    const rows = [];

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
            const completeAnnotation = getAnnotationFromAnnotationBlock(annotationBlock, annotationId);
            const annotationDocumentIdentifiers = [
                completeAnnotation.document?.documentFingerprint,
                completeAnnotation.uri
            ];

            //The check against SAMPLE_PDF_URL is for backwards compability.
            if (
                url === null ||
                annotationDocumentIdentifiers.includes(params.uri) ||
                annotationDocumentIdentifiers.includes(encodeURI(params.uri)) ||
                annotationDocumentIdentifiers.includes(decodeURI(params.uri)) ||
                annotationDocumentIdentifiers.includes(SAMPLE_PDF_URL)
            ) {
                rows.push(completeAnnotation);
            }
        }
    }
    return { rows, total: rows.length };
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
