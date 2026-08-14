export function shouldBlockExternalHref(href: string | null): boolean {
    if (!href || href.startsWith('#')) return false;
    try {
        return !['app:', 'vault:', 'blob:'].includes(new URL(href, 'app://obsidian.md/').protocol);
    } catch {
        return true;
    }
}

export function isLocalAnnotationApiUrl(url: URL): boolean {
    if (url.origin !== 'http://localhost:8001') return false;
    return (
        url.pathname === '/api/search' ||
        url.pathname === '/api/annotations' ||
        url.pathname.startsWith('/api/annotations/')
    );
}
