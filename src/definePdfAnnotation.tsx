import defineGenericAnnotation from 'defineGenericAnnotation';
import React from 'react';
import { Vault } from 'obsidian';
import AnnotatorPlugin from 'main';
import { wait } from 'utils';
import { PdfAnnotationProps } from './types';

type PdfViewerApplication = {
    pdfViewer: { currentScale: number };
};

async function waitForPdfViewer(iframe: HTMLIFrameElement): Promise<{
    application: PdfViewerApplication;
    container: HTMLElement;
    document: Document;
    viewer: HTMLElement;
}> {
    for (let attempt = 0; attempt < 200; attempt++) {
        const document = iframe.contentDocument;
        const application = (iframe.contentWindow as Window & { PDFViewerApplication?: PdfViewerApplication })
            ?.PDFViewerApplication;
        const container = document?.getElementById('viewerContainer');
        const viewer = document?.getElementById('viewer');
        if (application?.pdfViewer && container && viewer) return { application, container, document, viewer };
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
                    const { application: PDFViewerApplication, container, document, viewer } = await waitForPdfViewer(
                        iframe
                    );

                    let startX = 0,
                        startY = 0;
                    let initialPinchDistance = 0;
                    let pinchScale = 1;
                    const reset = () => {
                        startX = startY = initialPinchDistance = 0;
                        pinchScale = 1;
                    };
                    // Prevent native iOS page zoom
                    //document.addEventListener("touchmove", (e) => { if (e.scale !== 1) { e.preventDefault(); } }, { passive: false });
                    document.addEventListener('touchstart', e => {
                        if (e.touches.length > 1) {
                            startX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
                            startY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
                            initialPinchDistance = Math.hypot(
                                e.touches[1].pageX - e.touches[0].pageX,
                                e.touches[1].pageY - e.touches[0].pageY
                            );
                        } else {
                            initialPinchDistance = 0;
                        }
                    });
                    document.addEventListener(
                        'touchmove',
                        e => {
                            if (initialPinchDistance <= 0 || e.touches.length < 2) {
                                return;
                            }
                            e.preventDefault();
                            const pinchDistance = Math.hypot(
                                e.touches[1].pageX - e.touches[0].pageX,
                                e.touches[1].pageY - e.touches[0].pageY
                            );
                            const originX = startX + container.scrollLeft;
                            const originY = startY + container.scrollTop;
                            pinchScale = pinchDistance / initialPinchDistance;
                            viewer.style.transform = `scale(${pinchScale})`;
                            viewer.style.transformOrigin = `${originX}px ${originY}px`;
                        },
                        { passive: false }
                    );
                    document.addEventListener('touchend', () => {
                        if (initialPinchDistance <= 0) {
                            return;
                        }
                        viewer.style.transform = `none`;
                        viewer.style.transformOrigin = `unset`;
                        PDFViewerApplication.pdfViewer.currentScale *= pinchScale;
                        const rect = container.getBoundingClientRect();
                        const dx = startX - rect.left;
                        const dy = startY - rect.top;
                        container.scrollLeft += dx * (pinchScale - 1);
                        container.scrollTop += dy * (pinchScale - 1);
                        reset();
                    });
                    await onload?.(iframe);
                }}
            />
        );
    };
    return PdfAnnotation;
};
