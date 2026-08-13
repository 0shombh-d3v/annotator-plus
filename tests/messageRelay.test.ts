/** @jest-environment jsdom */

import { HypothesisMessageRelay, parseHypothesisPortMessage } from '../src/messageRelay';

test('message relay accepts only valid Hypothesis port messages from registered frames', () => {
    expect(
        parseHypothesisPortMessage({ frame1: 'guest', frame2: 'host', type: 'request', requestId: 'abc-1' })
    ).not.toBeNull();
    expect(
        parseHypothesisPortMessage({ frame1: 'guest', frame2: 'evil', type: 'request', requestId: 'abc' })
    ).toBeNull();
    expect(
        parseHypothesisPortMessage({ frame1: 'guest', frame2: 'host', type: 'request', requestId: '../bad' })
    ).toBeNull();

    document.body.innerHTML = '<iframe></iframe><iframe></iframe>';
    const [guest, host] = [...document.querySelectorAll('iframe')].map(frame => frame.contentWindow);
    const relay = new HypothesisMessageRelay();
    relay.register(guest);
    relay.register(host);
    const received: unknown[] = [];
    host.addEventListener('message', event => received.push(event.data));

    relay.handle(new MessageEvent('message', { data: { nope: true }, source: guest }));
    relay.handle(
        new MessageEvent('message', {
            data: { frame1: 'guest', frame2: 'host', type: 'request', requestId: 'one' },
            source: guest
        })
    );
    expect(received).toHaveLength(1);

    relay.handle(
        new MessageEvent('message', {
            data: { frame1: 'guest', frame2: 'host', type: 'request', requestId: 'one' },
            source: guest
        })
    );
    expect(received).toHaveLength(1);
});
