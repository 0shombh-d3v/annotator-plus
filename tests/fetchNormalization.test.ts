import { normalizeIframeFetch } from '../src/iframeFetch';

test('preserves method and body when a frame fetches with a Request object', async () => {
    const offlineFetch = jest.fn(async () => ({ ok: true } as Response));
    const iframeWindow = { fetch: offlineFetch } as unknown as Window;
    const request = {
        url: 'http://localhost:8001/api/annotations/example',
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        clone: () => ({ text: async () => '{"text":"local note"}' })
    } as unknown as Request;

    normalizeIframeFetch(iframeWindow);
    await iframeWindow.fetch(request);

    expect(offlineFetch).toHaveBeenCalledWith(request.url, {
        method: 'PATCH',
        headers: request.headers,
        body: '{"text":"local note"}'
    });
});
