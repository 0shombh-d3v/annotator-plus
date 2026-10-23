import { TFile, Vault } from 'obsidian';
import { Annotation, AnnotationList } from './types';
import type AnnotatorPlugin from './main';
import {
    deleteAnnotationFromAnnotationFileString,
    getAnnotationFromFileContent,
    isValidAnnotationId,
    loadAnnotationsAtUriFromFileText,
    writeAnnotationToAnnotationFileString
} from './annotationUtils';

const vaultWriteQueues = new WeakMap<Vault, Map<string, Promise<unknown>>>();

function getWriteQueues(vault: Vault) {
    let queues = vaultWriteQueues.get(vault);
    if (!queues) vaultWriteQueues.set(vault, (queues = new Map()));
    return queues;
}

function serializeFileUpdate<T>(vault: Vault, path: string, update: () => Promise<T>): Promise<T> {
    const writeQueues = getWriteQueues(vault);
    const previous = writeQueues.get(path) || Promise.resolve();
    const current = previous.catch(() => undefined).then(update);
    writeQueues.set(path, current);
    void current.then(
        () => writeQueues.get(path) === current && writeQueues.delete(path),
        () => writeQueues.get(path) === current && writeQueues.delete(path)
    );
    return current;
}

export async function getAnnotation(
    annotationId: string | null,
    file: TFile,
    vault: Vault
): Promise<Annotation | null> {
    if (!isValidAnnotationId(annotationId)) return null;
    await getWriteQueues(vault)
        .get(file.path)
        ?.catch(() => undefined);
    const text = await vault.read(file);
    return getAnnotationFromFileContent(annotationId, text);
}

export async function writeAnnotation(
    annotation: Annotation,
    plugin: AnnotatorPlugin,
    annotationFilePath: string,
    partialUpdate?: Partial<Annotation>
) {
    const vault = plugin.app.vault;
    return serializeFileUpdate(vault, annotationFilePath, async () => {
        const tfile = vault.getAbstractFileByPath(annotationFilePath);
        let res: ReturnType<typeof writeAnnotationToAnnotationFileString>;
        if (tfile instanceof TFile) {
            await vault.process(tfile, text => {
                const existing = annotation.id ? getAnnotationFromFileContent(annotation.id, text) : null;
                if (partialUpdate && !existing) throw new Error('The annotation no longer exists.');
                // Merge patches inside the serialized, atomic update. A snapshot
                // read before queuing can overwrite a concurrent edit to another field.
                const saved = partialUpdate ? { ...existing, ...partialUpdate, id: annotation.id } : annotation;
                const now = new Date().toISOString();
                res = writeAnnotationToAnnotationFileString(
                    { ...saved, created: existing?.created || now, updated: now },
                    text,
                    plugin
                );
                return res.newAnnotationFileString;
            });
        } else {
            throw new Error('The annotation note no longer exists. Reopen its new location before saving.');
        }
        return res.newAnnotation;
    });
}

export async function loadAnnotations(
    url: URL | null,
    vault: Vault,
    annotationFilePath: string
): Promise<AnnotationList> {
    await getWriteQueues(vault)
        .get(annotationFilePath)
        ?.catch(() => undefined);
    const tfile = vault.getAbstractFileByPath(annotationFilePath);
    if (tfile instanceof TFile) {
        const text = await vault.read(tfile);
        return loadAnnotationsAtUriFromFileText(url, text);
    } else {
        return loadAnnotationsAtUriFromFileText(url, null);
    }
}

export async function deleteAnnotation(
    annotationId: string,
    vault: Vault,
    annotationFilePath: string
): Promise<{
    deleted: boolean;
    id: string;
}> {
    if (!isValidAnnotationId(annotationId)) throw new Error('Invalid annotation ID.');
    return serializeFileUpdate(vault, annotationFilePath, async () => {
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
