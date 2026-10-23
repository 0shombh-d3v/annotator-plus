/** Restore native module workers after react-offline-iframe's classic-worker shim. */
export function installPdfWorker(iframe: HTMLIFrameElement, workerUrl: string): () => void {
    const frameWindow = iframe.contentWindow as Window & typeof globalThis;
    const NativeWorker = iframe.ownerDocument.defaultView.Worker;
    const workers = new Set<Worker>();
    frameWindow.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
            if (String(url) !== workerUrl) throw new Error('Blocked an unbundled PDF worker.');
            super(url, options);
            workers.add(this);
        }
    };
    return () => {
        workers.forEach(worker => worker.terminate());
        workers.clear();
    };
}
