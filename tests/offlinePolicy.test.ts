import { isLocalAnnotationApiUrl, shouldBlockExternalHref } from '../src/offlinePolicy';

test.each([
    ['#page=2', false],
    ['app://obsidian.md/Notes/example.md', false],
    ['vault:/Attachments/example.pdf', false],
    ['blob:local-resource', false],
    ['https://example.com', true],
    ['http://example.com', true],
    ['mailto:reader@example.com', true],
    ['javascript:alert(1)', true],
    ['data:text/html,hello', true]
])('external navigation policy handles %s', (href, blocked) => {
    expect(shouldBlockExternalHref(href)).toBe(blocked);
});

test.each([
    ['http://localhost:8001/api/search?limit=200', true],
    ['http://localhost:8001/api/annotations', true],
    ['http://localhost:8001/api/annotations/local-id', true],
    ['http://localhost:8001/api/profile', false],
    ['http://localhost:8001/anything-else', false],
    ['http://127.0.0.1:8001/api/search', false]
])('local annotation API policy handles %s', (href, allowed) => {
    expect(isLocalAnnotationApiUrl(new URL(href))).toBe(allowed);
});
