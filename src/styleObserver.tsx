export default class StyleObserver {
    style: string;
    listeners: Set<(style: string) => void>;
    interval?: NodeJS.Timeout;

    constructor() {
        this.style = '';
        this.listeners = new Set();
        this.interval = null;
    }

    watch() {
        this.interval = setInterval(() => {
            const newStyle = [...document.getElementsByTagName('style')]
                .flatMap(x => [...(x.sheet?.cssRules || [])].map(x => x.cssText))
                .join('\n');
            if (newStyle != this.style) {
                this.style = newStyle;
                for (const listener of this.listeners) {
                    listener(newStyle);
                }
            }
        }, 250);
    }

    listen(listener: (style: string) => void) {
        this.listeners.add(listener);
        listener(this.style);
    }

    remove(listener: (style: string) => void) {
        this.listeners.delete(listener);
    }

    unwatch() {
        clearInterval(this.interval);
    }
}
