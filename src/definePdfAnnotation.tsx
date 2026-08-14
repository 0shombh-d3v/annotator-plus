import defineGenericAnnotation from 'defineGenericAnnotation';
import React from 'react';
import { Vault } from 'obsidian';
import AnnotatorPlugin from 'main';
import { wait } from 'utils';
import { PdfAnnotationProps } from './types';

async function waitForPdfViewer(iframe: HTMLIFrameElement): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt++) {
        const application = (iframe.contentWindow as (Window & { PDFViewerApplication?: { pdfViewer?: unknown } }) | null)
            ?.PDFViewerApplication;
        if (application?.pdfViewer) return;
        await wait(50);
    }
    throw new Error('PDF.js did not finish starting');
}

export default (vault: Vault, plugin: AnnotatorPlugin) => {
    const GenericAnnotationPdf = defineGenericAnnotation(vault, plugin);
    const PdfAnnotation = ({ onload, ...props }: PdfAnnotationProps) => {
        return (
            <GenericAnnotationPdf
                baseSrc="https://via.hypothes.is/pdfjs/web/viewer.html"
                {...props}
                onload={async iframe => {
                    await waitForPdfViewer(iframe);
                    await onload(iframe);
                }}
            />
        );
    };
    return PdfAnnotation;
};
