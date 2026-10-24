// Keep this correction at the build boundary instead of modifying node_modules.
export function patchOfflineIframeLifecycle(source) {
    const normalized = source.replaceAll('\r\n', '\n');
    const preparation = 'const { html, context } = yield patchHtmlCode(content, src);';
    if (normalized.split(preparation).length !== 2) {
        throw new Error('The pinned react-offline-iframe initializer changed; review its disposal guard.');
    }
    return normalized.replace(
        preparation,
        `${preparation}
                        // The reader may have closed while its HTML was prepared.
                        if (!iframe.isConnected || !iframe.contentWindow) return;`
    );
}

export default function offlineIframeLifecycle() {
    return {
        name: 'annotator-plus-offline-iframe-lifecycle',
        transform(source, id) {
            if (!id.replaceAll('\\', '/').endsWith('/react-offline-iframe/build/index.esm.js')) return null;
            return { code: patchOfflineIframeLifecycle(source), map: null };
        }
    };
}
