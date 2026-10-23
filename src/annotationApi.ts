import type AnnotatorPlugin from './main';
import { deleteAnnotation, getAnnotation, loadAnnotations, writeAnnotation } from './annotationFileUtils';
import { isValidAnnotationId, isWritableAnnotation } from './annotationUtils';
import { isLocalAnnotationApiUrl } from './offlinePolicy';
import { Annotation, AnnotationList } from './types';
import { TFile } from 'obsidian';

type ApiResult = { response: Response; annotations?: AnnotationList };
const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** The local Hypothesis API. All operations are scoped to the note owning this reader. */
export async function handleAnnotationApi(
    url: URL,
    init: RequestInit | undefined,
    plugin: AnnotatorPlugin,
    notePath: string
): Promise<ApiResult | null> {
    if (!isLocalAnnotationApiUrl(url)) return null;
    const method = (init?.method || 'GET').toUpperCase();
    const vault = plugin.app.vault;
    const file = vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile))
        return {
            response: json(
                { reason: 'The annotation note no longer exists. Reopen its new location before saving.' },
                404
            )
        };

    try {
        if (url.pathname === '/api/search') {
            if (method !== 'GET') return { response: json({ reason: 'Unsupported search request.' }, 405) };
            const annotations = await loadAnnotations(null, vault, notePath);
            const number = (key: string, fallback: number) => {
                const value = Number(url.searchParams.get(key) ?? fallback);
                return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
            };
            const offset = number('offset', 0);
            const limit = number('limit', annotations.total);
            return {
                response: json({ ...annotations, rows: annotations.rows.slice(offset, offset + limit) }),
                annotations
            };
        }

        const hasId = url.pathname.startsWith('/api/annotations/');
        let id: string;
        if (hasId) {
            try {
                id = decodeURIComponent(url.pathname.slice('/api/annotations/'.length));
            } catch {
                /* Invalid below. */
            }
            if (!isValidAnnotationId(id)) return { response: json({ reason: 'Invalid annotation ID.' }, 400) };
        }
        if (method === 'GET' && hasId) {
            const annotation = await getAnnotation(id, file, vault);
            return { response: annotation ? json(annotation) : json({ reason: 'Annotation not found.' }, 404) };
        }
        if (method === 'DELETE' && hasId) {
            const result = await deleteAnnotation(id, vault, notePath);
            return {
                response: json(result, result.deleted ? 200 : 404),
                annotations: await loadAnnotations(null, vault, notePath)
            };
        }
        if ((method === 'POST' && !hasId) || (['PUT', 'PATCH'].includes(method) && hasId)) {
            let payload: unknown;
            let partialUpdate: Partial<Annotation>;
            try {
                payload = JSON.parse(String(init?.body));
            } catch {
                return { response: json({ reason: 'Invalid annotation JSON.' }, 400) };
            }
            if (hasId) {
                const existing = await getAnnotation(id, file, vault);
                if (!existing) return { response: json({ reason: 'Annotation not found.' }, 404) };
                if (
                    !payload ||
                    typeof payload !== 'object' ||
                    Array.isArray(payload) ||
                    ('id' in payload && payload.id !== id)
                ) {
                    return { response: json({ reason: 'Annotation ID does not match the request.' }, 400) };
                }
                if (method === 'PATCH') partialUpdate = payload;
                payload = { ...existing, ...payload, id };
            }
            if (!isWritableAnnotation(payload))
                return { response: json({ reason: 'Invalid annotation payload.' }, 400) };
            const saved = await writeAnnotation(payload, plugin, notePath, partialUpdate);
            return { response: json(saved), annotations: await loadAnnotations(null, vault, notePath) };
        }
        return { response: json({ reason: 'Unsupported annotation request.' }, 405) };
    } catch (error) {
        console.error('Annotator+: annotation operation failed', error);
        return {
            response: json(
                {
                    reason: 'Could not save or read the annotation note. Your draft has been kept; check that the note is writable and retry.'
                },
                500
            )
        };
    }
}
