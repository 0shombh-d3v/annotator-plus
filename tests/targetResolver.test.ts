jest.mock(
    'obsidian',
    () => {
        class TFile {
            path: string;
            constructor(path: string) {
                this.path = path;
            }
        }
        return { TFile, normalizePath: (path: string) => path.replace(/^\/+/, '') };
    },
    { virtual: true }
);

import { pathToFileURL } from 'url';
import { TFile } from 'obsidian';
import { resolveAnnotationTarget, targetMatchesRequest } from '../src/targetResolver';

test('annotation targets are resolved once and restricted to exact vault, file, or HTTPS resources', async () => {
    const vaultFile = new (TFile as unknown as { new (path: string): TFile })('PDFs/book.pdf');
    const context = { resolveVaultFile: (path: string) => (path === 'PDFs/book.pdf' ? vaultFile : null) };

    await expect(resolveAnnotationTarget('PDFs/book.pdf', '', context)).resolves.toEqual({
        kind: 'vault',
        path: 'PDFs/book.pdf',
        url: 'vault:/PDFs/book.pdf'
    });
    await expect(resolveAnnotationTarget('https://example.com/a.pdf', '', context)).resolves.toEqual({
        kind: 'https',
        url: 'https://example.com/a.pdf'
    });
    const local = await resolveAnnotationTarget(pathToFileURL(__filename).href, '', context);
    expect(local.kind).toBe('file');
    await expect(resolveAnnotationTarget('http://example.com/a.pdf', '', context)).rejects.toThrow('only vault paths');

    const httpsTarget = { kind: 'https', url: 'https://example.com/a.pdf' } as const;
    expect(targetMatchesRequest(httpsTarget, new URL('https://example.com/a.pdf#page=2'))).toBe(true);
    expect(targetMatchesRequest(httpsTarget, new URL('https://example.com/other.pdf'))).toBe(false);

    const special = new (TFile as unknown as { new (path: string): TFile })('PDFs/a #1.pdf');
    await expect(
        resolveAnnotationTarget('PDFs/a #1.pdf', '', {
            resolveVaultFile: path => (path === special.path ? special : null)
        })
    ).resolves.toEqual({ kind: 'vault', path: special.path, url: 'vault:/PDFs/a%20%231.pdf' });
});
