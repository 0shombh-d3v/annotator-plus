import { DarkReaderType } from 'darkreader';

export type AnnotationList = {
    total: number;
    rows: Annotation[];
};

export type Annotation = {
    id: string;
    document: {
        title: string[];
        documentFingerprint?: string;
    };
    created: string;
    updated: string;
    user: string;
    uri: string;
    text: string;
    tags: string[];
    group: string;
    permissions: unknown;
    target: {
        source: string;
        selector: Selector[];
    }[];
    links: {
        html: string;
        incontext: string;
        json: string;
    };
    hidden: boolean;
    flagged: boolean;
    references: string[];
    user_info: {
        display_name: string;
    };
};

export type Selector = TextPositionSelector | TextQuoteSelector | RangeSelector;

export type RangeSelector = {
    type: 'RangeSelector';
    endContainer: string;
    endOffset: number;
    startContainer: string;
    startOffset: number;
};

export type TextPositionSelector = {
    type: 'TextPositionSelector';
    start: number;
    end: number;
};

export type TextQuoteSelector = {
    type: 'TextQuoteSelector';
    exact: string;
    prefix: string;
    suffix: string;
};

export type GenericAnnotationProps = {
    annotationFile: string;
    containerEl: HTMLElement;
    onload: (iframe: HTMLIFrameElement) => Promise<void>;
    onDarkReadersUpdated: (darkReaderReferences: Set<WeakRef<DarkReaderType>>) => Promise<void>;
};

export type AnnotationTarget = { kind: 'vault'; path: string; url: string };

export type PdfAnnotationProps = GenericAnnotationProps & {
    pdf: AnnotationTarget;
};
