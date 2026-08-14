import { normalizePath, TFile } from 'obsidian';
import { AnnotationTarget } from './types';

export type TargetResolverContext = {
    resolveVaultFile: (path: string) => TFile | null;
};

export async function resolveAnnotationTarget(
    rawTarget: unknown,
    context: TargetResolverContext
): Promise<AnnotationTarget> {
    if (Array.isArray(rawTarget)) {
        throw new Error('The annotation-target property must be one vault-relative PDF path.');
    }
    if (typeof rawTarget !== 'string' || !rawTarget.trim()) {
        throw new Error('The annotation-target property is empty.');
    }

    const target = rawTarget.trim();
    const segments = target.split('/');
    if (
        target.startsWith('/') ||
        target.includes('\\') ||
        /^[a-z][a-z\d+.-]*:/i.test(target) ||
        segments.some(segment => !segment || segment === '.' || segment === '..')
    ) {
        throw new Error('The annotation-target property must be a vault-relative PDF path.');
    }

    const path = normalizePath(target);
    if (!path.toLowerCase().endsWith('.pdf')) {
        throw new Error('Annotator+ supports local PDF files only.');
    }

    const file = context.resolveVaultFile(path);
    if (!(file instanceof TFile) || normalizePath(file.path) !== path) {
        throw new Error(`Could not find PDF “${path}” in the vault.`);
    }

    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return { kind: 'vault', path, url: `vault:/${encodedPath}` };
}

export function targetMatchesRequest(target: AnnotationTarget, requestUrl: URL): boolean {
    const requested = new URL(requestUrl.href);
    requested.hash = '';
    return requested.href === target.url;
}
