import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { patchOfflineIframeLifecycle } from '../offline-iframe-lifecycle.mjs';

const original = (
    await readFile(new URL('../../node_modules/react-offline-iframe/build/index.esm.js', import.meta.url), 'utf8')
).replaceAll('\r\n', '\n');

// Execute the pinned dependency's actual initializer. Pause either of its
// asynchronous preparation stages, then remove its frame as reader disposal does.
function fixture(stage) {
    let release;
    let started;
    const pending = new Promise(resolve => {
        release = resolve;
    });
    const ready = new Promise(resolve => {
        started = resolve;
    });
    const wait = async current => {
        if (current === stage) {
            started();
            await pending;
        }
    };
    let patched = 0;
    let initialized = 0;
    const noop = () => {};
    const source = patchOfflineIframeLifecycle(original);
    const awaiter = source.slice(
        source.indexOf('function __awaiter('),
        source.indexOf('\nfunction createXMLHttpRequest(')
    );
    const initializer = source.slice(
        source.indexOf('    function patchIframe(iframe)'),
        source.indexOf('    function patchIframes(')
    );
    assert.ok(awaiter && initializer);
    const scope = {
        patchedElements: new WeakSet(),
        patchedElementSrcDocs: new WeakMap(),
        props: {
            onIframePatch: async () => {
                initialized++;
            }
        },
        proxySrc: url => url,
        fetchUrlContent: async () => ({
            text: async () => {
                await wait('fetch');
                return '<p>Reader</p>';
            }
        }),
        patchHtmlCode: async html => {
            await wait('rewrite');
            return { html, context: 'https://via.hypothes.is/' };
        },
        patchIframeTags: iframe => {
            patched++;
            void iframe.contentWindow.HTMLLinkElement.prototype;
        },
        patchIframeEventListeners: noop,
        patchIframeClasses: noop,
        patchIframePostMessage: noop,
        patchIframeFetch: noop,
        patchIframeConsole: noop,
        patchIframeWorker: noop,
        patchIframeXMLHttpRequest: noop,
        patchIframeWebSocket: noop,
        setIframeContent: (iframe, html) => {
            iframe.contentWindow.html = html;
        },
        addIframeMutationObserverWhenReady: noop
    };
    runInNewContext(`${awaiter}\n${initializer}\nthis.begin = patchIframe;`, scope);
    const attributes = new Map([['patched-src', 'https://via.hypothes.is/pdfjs/web/viewer.html']]);
    const frame = {
        isConnected: true,
        contentWindow: { HTMLLinkElement: class {} },
        getAttribute: name => attributes.get(name),
        setAttribute: (name, value) => attributes.set(name, value),
        setAttributeNS: noop,
        removeAttribute: name => attributes.delete(name)
    };
    return { frame, ready, release, begin: () => scope.begin(frame), counts: () => ({ patched, initialized }) };
}

for (const stage of ['fetch', 'rewrite']) {
    test(`a frame removed during ${stage} preparation is never initialized`, async () => {
        const c = fixture(stage);
        const initializing = c.begin();
        await c.ready;
        c.frame.isConnected = false;
        c.frame.contentWindow = null;
        c.release();
        await assert.doesNotReject(initializing);
        assert.deepEqual(c.counts(), { patched: 0, initialized: 0 });
    });
}

test('a live frame still receives its document, patches, and completion callback', async () => {
    const c = fixture('fetch');
    const initializing = c.begin();
    await c.ready;
    c.release();
    await initializing;
    assert.equal(c.frame.contentWindow.html, '<p>Reader</p>');
    assert.equal(c.frame.getAttribute('patched'), 'true');
    assert.deepEqual(c.counts(), { patched: 1, initialized: 1 });
});

test('an upstream initializer change cannot silently remove the disposal guard', () => {
    assert.throws(() => patchOfflineIframeLifecycle('an updated upstream module'), /initializer changed/);
});
