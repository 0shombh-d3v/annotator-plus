import { TFile, Vault } from 'obsidian';
import { Annotation, AnnotationList } from './types';
import type AnnotatorPlugin from './main';
import {
    deleteAnnotationFromAnnotationFileString,
    getAnnotationFromFileContent,
    loadAnnotationsAtUriFromFileText,
    writeAnnotationToAnnotationFileString
} from './annotationUtils';

const writeQueues = new Map<string, Promise<unknown>>();

function serializeFileUpdate<T>(path: string, update: () => Promise<T>): Promise<T> {
    const previous = writeQueues.get(path) || Promise.resolve();
    const current = previous.catch(() => undefined).then(update);
    writeQueues.set(path, current);
    void current.then(
        () => writeQueues.get(path) === current && writeQueues.delete(path),
        () => writeQueues.get(path) === current && writeQueues.delete(path)
    );
    return current;
}

export async function getAnnotation(annotationId: string, file: TFile, vault: Vault): Promise<Annotation | null> {
    const text = await vault.read(file);
    return getAnnotationFromFileContent(annotationId, text);
}

export async function writeAnnotation(annotation: Annotation, plugin: AnnotatorPlugin, annotationFilePath: string) {
    return serializeFileUpdate(annotationFilePath, async () => {
        const vault = plugin.app.vault;
        const tfile = vault.getAbstractFileByPath(annotationFilePath);
        let res: ReturnType<typeof writeAnnotationToAnnotationFileString>;
        if (tfile instanceof TFile) {
            await vault.process(tfile, text => {
                res = writeAnnotationToAnnotationFileString(annotation, text, plugin);
                return res.newAnnotationFileString;
            });
        } else {
            res = writeAnnotationToAnnotationFileString(annotation, null, plugin);
            await vault.create(annotationFilePath, res.newAnnotationFileString);
        }
        return res.newAnnotation;
    });
}

export async function loadAnnotations(
    url: URL | null,
    vault: Vault,
    annotationFilePath: string
): Promise<AnnotationList> {
    const tfile = vault.getAbstractFileByPath(annotationFilePath);
    if (tfile instanceof TFile) {
        const text = await vault.read(tfile);
        return loadAnnotationsAtUriFromFileText(url, text);
    } else {
        return loadAnnotationsAtUriFromFileText(url, null);
    }
}

export async function deleteAnnotation(
    annotationId,
    vault: Vault,
    annotationFilePath: string
): Promise<{
    deleted: boolean;
    id: string;
}> {
    return serializeFileUpdate(annotationFilePath, async () => {
        const tfile = vault.getAbstractFileByPath(annotationFilePath);
        let deleted = false;
        if (tfile instanceof TFile) {
            await vault.process(tfile, text => {
                const updatedText = deleteAnnotationFromAnnotationFileString(annotationId, text);
                deleted = text !== updatedText;
                return updatedText;
            });
        }
        return { deleted, id: annotationId };
    });
}
