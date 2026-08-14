export function normalizeIframeFetch(iframeWindow: Window): void {
    const offlineFetch = iframeWindow.fetch;
    iframeWindow.fetch = async (input, init) => {
        if (typeof input !== 'string' && 'href' in input && !('url' in input)) {
            return offlineFetch(input.href, init);
        }
        if (typeof input === 'string' || !('url' in input) || !('method' in input) || !('clone' in input)) {
            return offlineFetch(input, init);
        }

        const method = (init?.method || input.method).toUpperCase();
        const normalizedInit: RequestInit = {
            ...init,
            method,
            headers: init?.headers || input.headers
        };
        if (normalizedInit.body === undefined && method !== 'GET' && method !== 'HEAD') {
            normalizedInit.body = await input.clone().text();
        }
        return offlineFetch(input.url, normalizedInit);
    };
}
