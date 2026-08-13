export type HypothesisFrame = 'guest' | 'host' | 'notebook' | 'sidebar';
export type HypothesisPortMessage = {
    frame1: HypothesisFrame;
    frame2: HypothesisFrame;
    type: 'request' | 'offer';
    requestId: string;
};

const frameNames = new Set<HypothesisFrame>(['guest', 'host', 'notebook', 'sidebar']);

export function parseHypothesisPortMessage(value: unknown): HypothesisPortMessage | null {
    if (!value || typeof value !== 'object') return null;
    const message = value as Partial<HypothesisPortMessage>;
    if (
        !frameNames.has(message.frame1) ||
        !frameNames.has(message.frame2) ||
        (message.type !== 'request' && message.type !== 'offer') ||
        typeof message.requestId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(message.requestId)
    ) {
        return null;
    }
    return message as HypothesisPortMessage;
}

export class HypothesisMessageRelay {
    private frames = new Set<Window>();
    private roles = new Map<HypothesisFrame, Set<Window>>();
    private seenRequests = new Set<string>();

    register(frame: Window): void {
        this.frames.add(frame);
    }

    unregister(frame: Window): void {
        this.frames.delete(frame);
        this.roles.forEach(frames => frames.delete(frame));
    }

    clear(): void {
        this.frames.clear();
        this.roles.clear();
        this.seenRequests.clear();
    }

    handle(event: MessageEvent): void {
        if (!event.source || !this.frames.has(event.source as Window)) return;
        const message = parseHypothesisPortMessage(event.data);
        if (!message) return;

        const source = event.source as Window;
        const sources = this.roles.get(message.frame1) || new Set<Window>();
        sources.add(source);
        this.roles.set(message.frame1, sources);

        if (message.type === 'request') {
            const key = `${message.frame1}:${message.frame2}:${message.requestId}`;
            if (this.seenRequests.has(key)) return;
            this.seenRequests.add(key);
            setTimeout(() => this.seenRequests.delete(key), 30_000);
        }

        const targets = this.roles.get(message.frame2) || this.frames;
        targets.forEach(target => {
            if (target === source) return;
            const MessageEventConstructor = (target as Window & typeof globalThis).MessageEvent || MessageEvent;
            target.dispatchEvent(
                new MessageEventConstructor('message', {
                    data: event.data,
                    origin: event.origin,
                    source,
                    ports: [...event.ports]
                })
            );
        });
    }
}
