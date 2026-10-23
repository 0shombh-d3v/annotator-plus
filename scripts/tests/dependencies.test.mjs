import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const vendor = fileURLToPath(new URL('../../vendor/hypothesis-client/', import.meta.url));
const renderModule = new URL(
    '../../vendor/hypothesis-client/node_modules/@hypothesis/annotation-ui/lib/utils/render-markdown.js',
    import.meta.url
).href;

// Run parser triggers in bounded child processes: a dependency regression must
// fail the test without hanging the runner or exhausting the host's memory.
function isolated(code) {
    const setup = `import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(vendor + 'package.json')});
    const assert = require('node:assert/strict');`;
    const result = spawnSync(
        process.execPath,
        ['--max-old-space-size=128', '--input-type=module', '-e', setup + code],
        {
            cwd: root,
            encoding: 'utf8',
            timeout: 5000,
            maxBuffer: 1024 * 1024
        }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || `Child terminated by ${result.signal}`);
}

const renderSetup = `
  const rootRequire = createRequire(${JSON.stringify(root + 'package.json')});
  const { JSDOM } = rootRequire('jsdom');
  globalThis.window = new JSDOM('<!doctype html>').window;
  const { renderMathAndMarkdown: render } = await import(${JSON.stringify(renderModule)});
`;

for (const [tree, manifest] of [
    ['root', root + 'package.json'],
    ['vendor', vendor + 'package.json']
]) {
    // Resolve from the actual minifier consumer, including any nested copy.
    const serializerSetup = `
      const consumer = createRequire(createRequire(${JSON.stringify(manifest)}).resolve('@rollup/plugin-terser'));
      const serialize = consumer('serialize-javascript');
      const vm = require('node:vm');
    `;

    test(`${tree} minifier serializer escapes script endings in nested function sources`, () => {
        isolated(serializerSetup + String.raw`
          const rootRequire = createRequire(${JSON.stringify(root + 'package.json')});
          const { JSDOM } = rootRequire('jsdom');
          for (const ending of ['</script', '</ScRiPt', '</script>']) {
            const first = function probe() { return 23; };
            first.toString = () => 'function probe(){return 23}//' + ending;
            const second = function tail() { return 17; };
            second.toString = () => 'function tail(){return 17}// > <b id=serializer-breakout>';
            for (const nested of [{ first }, new Map([['first', first]]), new Set([first]), [, first]]) {
              const output = serialize({ nested, second }, { space: 2 });
              assert.ok(!/<\/script(?:[\s/>]|$)/i.test(output), output);
              const document = new JSDOM('<!doctype html><script>window.fixture=' + output + '</script>').window.document;
              assert.equal(document.querySelector('#serializer-breakout'), null);
            }
          }
        `);
    });

    test(`${tree} minifier preserves function options, licenses, maps, names, and compiled behavior`, () => {
        isolated(serializerSetup + String.raw`
          const options = {
            format: { comments: function (node, comment) { return /@preserve|@license|@cc_on/i.test(comment.value); } },
            nameCache: {}, maxWorkers: 1
          };
          const restored = vm.runInNewContext('(' + serialize(options) + ')');
          assert.equal(restored.format.comments(null, { value: '@license example' }), true);
          assert.equal(restored.format.comments(null, { value: 'ordinary comment' }), false);
          const control = { string: 'literal </script> and </scripture>', arrow: x => x + 2, regex: /a+b/i, bigint: 17n };
          const roundtrip = vm.runInNewContext('(' + serialize(control) + ')');
          assert.equal(roundtrip.string, control.string);
          assert.equal(roundtrip.arrow(5), 7);
          assert.ok(roundtrip.regex.test('AAAB'));
          assert.equal(roundtrip.bigint, 17n);
          const terser = createRequire(${JSON.stringify(manifest)})('@rollup/plugin-terser');
          const plugin = terser(options);
          const source = '/* @license example */\n/* ordinary comment */\nfunction calculate(value) { return value + 2; } globalThis.fixture = [calculate(5), "</script><b>"];';
          const output = await plugin.renderChunk(source, { fileName: 'fixture.js' }, { format: 'cjs', sourcemap: true });
          assert.ok(output.code.includes('@license example'));
          assert.ok(!output.code.includes('ordinary comment'));
          assert.equal(output.map.version, 3);
          assert.ok(options.nameCache.vars);
          const context = {};
          vm.runInNewContext(output.code, context);
          assert.equal(context.fixture[0], 7);
          assert.equal(context.fixture[1], '</script><b>');
        `);
    });
}

test('Markdown parser handles nested brackets and malformed links within a bounded process', () => {
    isolated(
        renderSetup +
            `
    for (const input of ['['.repeat(90000), '[link](' + '('.repeat(30000)]) {
      assert.equal(typeof render(input), 'string');
    }
  `
    );
});

test('Markdown fragments preserve formatting, links, headings, code, tables, and formulae', () => {
    isolated(
        renderSetup +
            String.raw`
    assert.equal(render('plain'), '<p>plain</p>');
    assert.equal(render('~~gone~~'), '<p><del>gone</del></p>');
    assert.equal(render('Wait...'), '<p>Wait…</p>');
    assert.equal(render('# Heading\n\n# Heading'), '<h1 id="heading">Heading</h1>\n<h1 id="heading-1">Heading</h1>');
    const html = render('https://example.com/a_b.');
    const doc = new window.DOMParser().parseFromString(html, 'text/html');
    assert.equal(doc.querySelector('a').getAttribute('href'), 'https://example.com/a_b');
    assert.equal(doc.querySelector('a').target, '_blank');
    assert.ok(html.endsWith('</a>.</p>'));
    assert.ok(render('**bold** and *emphasis*').includes('<strong>bold</strong>'));
    assert.ok(render('- one\n  - two').includes('<ul>'));
    assert.ok(render('~~~js\nconst x = "...";\n~~~').includes('...'));
    assert.ok(!render('| a | b |\n| - | - |\n| 1 | 2 |').includes('<table'));
    assert.ok(render(String.fromCharCode(92) + '(x^2' + String.fromCharCode(92) + ')').includes('class="katex"'));
    assert.ok(render('$$x^2$$').includes('class="katex-display"'));
  `
    );
});

test('Markdown rejects active HTML including the old metadata and table-header payloads', () => {
    isolated(
        renderSetup +
            `
    for (const input of [
      '<script>alert(1)</script><img src=x onerror=alert(1)>',
      '---\\ntitle: </title><script>alert(1)</script>\\n---\\n# Hello',
      '| "><svg/onload=alert(1)> | Col2 |\\n| --- | --- |\\n| a | b |',
      '[click](javascript:alert(1))', '<a href="jav&#x61;script:alert(1)">click</a>'
    ]) {
      const doc = new window.DOMParser().parseFromString(render(input), 'text/html');
      assert.equal(doc.querySelector('script,[onload],[onerror]'), null);
      for (const a of doc.querySelectorAll('a')) assert.ok(!/^javascript:/i.test(a.getAttribute('href') || ''));
    }
  `
    );
});

test('KaTeX ignores inherited trust while ordinary inline and display maths render', () => {
    isolated(
        renderSetup +
            String.raw`
    Object.defineProperty(Object.prototype, 'trust', { value: true, writable: true, configurable: true });
    try {
      for (const expression of ['\\href{javascript:alert(1)}{x}', '\\includegraphics{https://example.com/x}']) {
        assert.equal(expression.charCodeAt(0), 92);
        assert.notEqual(expression.charCodeAt(1), 92);
        const html = render('\\(' + expression + '\\)');
        assert.ok(!html.includes('href="javascript:'));
        assert.ok(!html.includes('<img'));
      }
    assert.ok(render(String.fromCharCode(92) + '(x^2' + String.fromCharCode(92) + ')').includes('class="katex"'));
      assert.ok(render('$$x^2$$').includes('class="katex-display"'));
    } finally { delete Object.prototype.trust; }
  `
    );
});

test('Cheerio retains Enzyme CommonJS compatibility and rejects pathological nth expressions', () => {
    isolated(`
    const cheerio = require('cheerio');
    require('cheerio/lib/utils');
    require('enzyme');
    const $ = cheerio.load('<ul><li>a</li><li>b</li><li>c</li></ul>');
    assert.equal($('li:nth-child(2)').text(), 'b');
    const nth = require('nth-check');
    for (const whitespace of [' ', '\\t']) assert.throws(() => nth.parse('2n' + whitespace.repeat(50000) + '!'));
  `);
});

test('diff handles all affected line separators and still applies legitimate patches', () => {
    isolated(`
    const diff = require('diff');
    for (const separator of ['\\r', '\\u2028', '\\u2029']) {
      assert.equal(diff.parsePatch('--- old' + separator + 'name\\n+++ new\\n@@ -1 +1 @@\\n-old\\n+new\\n').length, 1);
      diff.parsePatch(('leading' + separator).repeat(5000));
    }
    const patch = diff.createPatch('example.txt', 'old\\n', 'new\\n');
    assert.equal(diff.applyPatch('old\\n', patch), 'new\\n');
    const spy = require('sinon').spy();
    spy({ value: 1 });
    const diagnostic = spy.printf('%D', { value: 2 });
    assert.ok(diagnostic.includes('1') && diagnostic.includes('2'));
  `);
});

test('path-to-regexp bounds optional groups and wildcard routes while preserving ordinary routing', () => {
    isolated(`
    const { match, pathToRegexp } = require('path-to-regexp');
    for (const pattern of ['/{a}{b}{c}{d}{e}{f}{g}{h}{i}{j}{k}{l}:z', '/*a-:b-*c-:d']) {
      try { pathToRegexp(pattern).regexp.test('/' + 'a-'.repeat(10000) + '!'); }
      catch (error) { assert.ok(error instanceof Error); }
    }
    assert.equal(match('/annotations/:id')('/annotations/note-1').params.id, 'note-1');
    assert.equal(match('/resources/*path')('/resources/pdf/fonts').params.path.join('/'), 'pdf/fonts');
  `);
});

test('Zod rejects oversized constrained arrays before traversing their elements', () => {
    isolated(`
    const { z } = require('zod');
    for (const constraint of ['max', 'length']) {
      let visited = 0;
      const schema = z.array(z.any().superRefine(() => { visited++; }))[constraint](2);
      assert.equal(schema.safeParse(Array(10000).fill('x')).success, false);
      assert.equal(visited, 0);
      assert.equal(schema.safeParse(['a', 'b']).success, true);
      assert.equal(visited, 2);
    }
  `);
});

test('cache policy preserves private response and revalidation boundaries', () => {
    isolated(`
    const CachePolicy = require('http-cache-semantics');
    const request = { url: 'https://example.com/data', headers: { host: 'example.com' } };
    const staleRequest = { ...request, headers: { ...request.headers, 'cache-control': 'max-stale=999999' } };
    for (const directive of ['private, max-age=60', 'no-store']) {
      const policy = new CachePolicy(request, { headers: { 'cache-control': directive } });
      // Shared caches must consult storable() before retaining any response.
      assert.equal(policy.storable(), false, directive);
      assert.equal(CachePolicy.fromObject(policy.toObject()).storable(), false, directive);
    }
    const revalidate = new CachePolicy(request, { headers: { 'cache-control': 'must-revalidate, max-age=0' } });
    assert.equal(revalidate.satisfiesWithoutRevalidation(staleRequest), false);
    const policy = new CachePolicy(request, { headers: { 'cache-control': 'private, max-age=60' } }, { shared: false });
    assert.equal(policy.satisfiesWithoutRevalidation(request), true);
    assert.equal(policy.satisfiesWithoutRevalidation({ ...request, url: 'https://example.com/other' }), false);
    assert.equal(policy.satisfiesWithoutRevalidation({ ...request, headers: { ...request.headers, 'cache-control': 'no-cache' } }), false);
  `);
});

test('ESLint schema validation retains the patched AJV API with dynamic patterns disabled', () => {
    isolated(`
    const { default: createAjv } = await import(${JSON.stringify(
        new URL('../../vendor/hypothesis-client/node_modules/@eslint/eslintrc/lib/shared/ajv.js', import.meta.url).href
    )});
    const ajv = createAjv();
    assert.ok(!ajv._opts.$data);
    const validate = ajv.compile({ type: 'object', properties: { name: { type: 'string', pattern: '^safe$' } } });
    assert.equal(validate({ name: 'safe' }), true);
    assert.equal(validate({ name: 'unsafe' }), false);
  `);
});
