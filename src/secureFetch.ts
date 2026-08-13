import { request as httpsRequest } from 'https';

const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'if-modified-since', 'if-none-match', 'if-range', 'range']);
const MAX_REDIRECTS = 5;

function safeHeaders(headers?: HeadersInit): Record<string, string> {
    const result: Record<string, string> = {};
    new Headers(headers).forEach((value, name) => {
        if (ALLOWED_REQUEST_HEADERS.has(name.toLowerCase())) result[name] = value;
    });
    return result;
}

export async function fetchHttpsTarget(
    requestInfo: RequestInfo,
    requestInit: RequestInit = {},
    redirects = 0
): Promise<Response> {
    const request = typeof requestInfo === 'string' ? null : requestInfo;
    const url = new URL(typeof requestInfo === 'string' ? requestInfo : requestInfo.url);
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('Only credential-free HTTPS annotation targets are allowed.');
    }

    const method = (requestInit.method || request?.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') throw new Error(`Unsupported target request method: ${method}`);
    const headers = safeHeaders(requestInit.headers || request?.headers);

    return await new Promise<Response>((resolve, reject) => {
        const req = httpsRequest(url, { method, headers }, response => {
            const status = response.statusCode || 500;
            const location = response.headers.location;
            if (location && [301, 302, 303, 307, 308].includes(status)) {
                response.resume();
                if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many HTTPS redirects.'));
                const next = new URL(location, url);
                if (next.protocol !== 'https:') return reject(new Error('Annotation target redirected outside HTTPS.'));
                void fetchHttpsTarget(next.href, { method: status === 303 ? 'GET' : method, headers }, redirects + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            const chunks: Uint8Array[] = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                const body = method === 'HEAD' ? null : Buffer.concat(chunks);
                const responseHeaders = new Headers();
                for (const [name, value] of Object.entries(response.headers)) {
                    if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
                }
                resolve(new Response(body, { status, headers: responseHeaders }));
            });
        });
        req.on('error', reject);
        if (requestInit.signal) {
            const abort = () => req.destroy(new DOMException('The request was aborted.', 'AbortError'));
            if (requestInit.signal.aborted) abort();
            else requestInit.signal.addEventListener('abort', abort, { once: true });
        }
        req.end();
    });
}
