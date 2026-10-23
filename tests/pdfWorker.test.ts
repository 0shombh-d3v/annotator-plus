import { installPdfWorker } from '../src/pdfWorker';

test('PDF module workers use the native constructor and are terminated on disposal', () => {
    const workers: { url: string; options: WorkerOptions; terminate: jest.Mock }[] = [];
    class NativeWorker {
        terminate = jest.fn();
        constructor(public url: string, public options: WorkerOptions) {
            workers.push(this);
        }
    }
    const frameWindow = { Worker: jest.fn() };
    const frame = { contentWindow: frameWindow, ownerDocument: { defaultView: { Worker: NativeWorker } } };
    const dispose = installPdfWorker(frame as never, 'blob:bundled-pdf-worker');
    new frameWindow.Worker('blob:bundled-pdf-worker', { type: 'module' });
    expect(workers).toHaveLength(1);
    expect(workers[0].options).toEqual({ type: 'module' });
    expect(() => new frameWindow.Worker('https://example.org/worker.js')).toThrow('unbundled');
    dispose();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
});
