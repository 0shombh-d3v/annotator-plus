import assert from 'node:assert/strict';
import test from 'node:test';

import { auditFindings } from '../audit-dependencies.mjs';

const metadata = { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } };

test('accepts clean npm and Yarn reports', () => {
    assert.deepEqual(auditFindings({ auditReportVersion: 2, metadata, vulnerabilities: {} }), []);
    assert.deepEqual(auditFindings({ metadata, advisories: {}, muted: [] }), []);
});

test('detects Yarn advisories independently of its successful exit status', () => {
    assert.deepEqual(
        auditFindings({
            metadata,
            advisories: {
                1: { module_name: 'unsafe-parser', github_advisory_id: 'GHSA-example' }
            }
        }),
        ['unsafe-parser: GHSA-example']
    );
});

test('detects npm findings and nonzero summary counts', () => {
    assert.deepEqual(auditFindings({ auditReportVersion: 2, metadata, vulnerabilities: { 'unsafe-parser': {} } }), [
        'unsafe-parser'
    ]);
    assert.deepEqual(
        auditFindings({
            advisories: {},
            metadata: {
                vulnerabilities: { ...metadata.vulnerabilities, low: 1 }
            }
        }),
        ['1 reported vulnerabilities']
    );
});

test('fails closed on missing, failed, malformed, or muted audit responses', () => {
    for (const report of [
        null,
        {},
        { error: { code: 'NETWORK' }, metadata },
        { metadata, advisories: [] },
        { metadata, advisories: {}, muted: [123] },
        { metadata: { vulnerabilities: { ...metadata.vulnerabilities, high: -1 } }, advisories: {} },
        { metadata: { vulnerabilities: { ...metadata.vulnerabilities, low: '0' } }, advisories: {} }
    ]) {
        assert.throws(() => auditFindings(report));
    }
});
