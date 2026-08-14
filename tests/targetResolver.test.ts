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

import { TFile } from 'obsidian';
import { resolveAnnotationTarget, targetMatchesRequest } from '../src/targetResolver';

test('annotation targets are restricted to exact vault-relative PDF paths', async () => {
    const vaultFile = new (TFile as unknown as { new (path: string): TFile })('PDFs/book.pdf');
    const context = { resolveVaultFile: (path: string) => (path === 'PDFs/book.pdf' ? vaultFile : null) };

    await expect(resolveAnnotationTarget('PDFs/book.pdf', context)).resolves.toEqual({
        kind: 'vault',
        path: 'PDFs/book.pdf',
        url: 'vault:/PDFs/book.pdf'
    });

    const target = { kind: 'vault', path: 'PDFs/book.pdf', url: 'vault:/PDFs/book.pdf' } as const;
    expect(targetMatchesRequest(target, new URL('vault:/PDFs/book.pdf#page=2'))).toBe(true);
    expect(targetMatchesRequest(target, new URL('vault:/PDFs/other.pdf'))).toBe(false);

    const special = new (TFile as unknown as { new (path: string): TFile })('PDFs/Ünicode a #1.PDF');
    await expect(
        resolveAnnotationTarget('PDFs/Ünicode a #1.PDF', {
            resolveVaultFile: path => (path === special.path ? special : null)
        })
    ).resolves.toEqual({
        kind: 'vault',
        path: special.path,
        url: 'vault:/PDFs/%C3%9Cnicode%20a%20%231.PDF'
    });
});

test.each([
    [null, 'empty'],
    ['', 'empty'],
    [['PDFs/book.pdf'], 'one vault-relative PDF path'],
    ['https://example.com/book.pdf', 'vault-relative PDF path'],
    ['file:///tmp/book.pdf', 'vault-relative PDF path'],
    ['/tmp/book.pdf', 'vault-relative PDF path'],
    ['../book.pdf', 'vault-relative PDF path'],
    ['PDFs/../book.pdf', 'vault-relative PDF path'],
    ['PDFs\\book.pdf', 'vault-relative PDF path'],
    ['PDFs/book.epub', 'local PDF files only'],
    ['PDFs/book.pdf.exe', 'local PDF files only']
])('rejects unsupported annotation target %p', async (rawTarget, message) => {
    await expect(resolveAnnotationTarget(rawTarget, { resolveVaultFile: () => null })).rejects.toThrow(message);
});

test('does not accept fuzzy or missing vault matches', async () => {
    const other = new (TFile as unknown as { new (path: string): TFile })('Elsewhere/book.pdf');
    await expect(resolveAnnotationTarget('PDFs/book.pdf', { resolveVaultFile: () => other })).rejects.toThrow(
        'Could not find PDF'
    );
});
