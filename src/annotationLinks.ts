/** Resolve the wiki link under a CodeMirror DOM position, including virtualized lines. */
export function wikiLinkAtPosition(text: string, position: number): string | null {
    const lineStart = text.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
    const nextLine = text.indexOf('\n', position);
    const line = text.slice(lineStart, nextLine < 0 ? text.length : nextLine);
    const pattern = /\[\[([^\]\n]+)\]\]/g;
    let match: RegExpExecArray;
    while ((match = pattern.exec(line))) {
        const start = lineStart + match.index;
        if (position >= start && position <= start + match[0].length) return match[1].split('|')[0];
    }
    return null;
}
