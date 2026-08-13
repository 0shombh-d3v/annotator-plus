import { normalizePath, TFile } from 'obsidian';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { AnnotationTarget } from './types';

export type TargetResolverContext = {
    resolveVaultFile: (path: string) => TFile | null;
};

export async function resolveAnnotationTarget(
    rawTarget: unknown,
    fallbackPrefix: string,
    context: TargetResolverContext
): Promise<AnnotationTarget> {
    const value = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
    if (typeof value !== 'string' || !value.trim()) throw new Error('The annotation-target property is empty.');

    const target = value.trim();
    let parsed: URL | null = null;
    try {
        parsed = new URL(target);
    } catch {
        // A value without a URL scheme is a vault path.
    }

    if (parsed) {
        if (parsed.protocol === 'https:') return { kind: 'https', url: parsed.href };
        if (parsed.protocol === 'file:') {
            const path = await fs.realpath(fileURLToPath(parsed));
            if (!(await fs.stat(path)).isFile()) throw new Error('The annotation target is not a file.');
            return { kind: 'file', path, url: parsed.href };
        }
        throw new Error('Annotator+ supports only vault paths, file:// URLs, and HTTPS URLs.');
    }

    for (const candidate of [target, `${fallbackPrefix || ''}${target}`]) {
        const file = context.resolveVaultFile(candidate);
        if (file instanceof TFile) {
            const path = normalizePath(file.path);
            const encodedPath = path.split('/').map(encodeURIComponent).join('/');
            return { kind: 'vault', path, url: `vault:/${encodedPath}` };
        }
    }

    throw new Error(`Could not find annotation target “${target}” in the vault.`);
}

export function targetMatchesRequest(target: AnnotationTarget, requestUrl: URL): boolean {
    if (target.kind === 'https') {
        const expected = new URL(target.url);
        const requested = new URL(requestUrl.href);
        expected.hash = '';
        requested.hash = '';
        return expected.href === requested.href;
    }
    return requestUrl.href === target.url;
}
