import { wikiLinkAtPosition } from '../src/annotationLinks';

test('wiki links resolve at their document position, independently of visible aliases', () => {
    const text = '[[earlier#^a|First]]\n'.repeat(100) + 'Text [[notes/book#^b|Chosen]] and [[other#^c|Last]]';
    expect(wikiLinkAtPosition(text, text.indexOf('Chosen'))).toBe('notes/book#^b');
    expect(wikiLinkAtPosition(text, text.indexOf('Last'))).toBe('other#^c');
    expect(wikiLinkAtPosition(text, text.lastIndexOf('Text'))).toBeNull();
});

test('same-note block links and unaliased links resolve', () => {
    const text = '[[#^local]] [[folder/file#^external]]';
    expect(wikiLinkAtPosition(text, 3)).toBe('#^local');
    expect(wikiLinkAtPosition(text, text.indexOf('folder'))).toBe('folder/file#^external');
});
