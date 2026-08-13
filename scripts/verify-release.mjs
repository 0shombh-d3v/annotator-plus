import { access, readFile, stat } from 'node:fs/promises';
import JSZip from 'jszip';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));

if (manifest.id !== 'annotator-plus' || manifest.name !== 'Annotator++') {
  throw new Error('Unexpected plugin identity in manifest.json');
}
if (manifest.version !== pkg.version || versions[pkg.version] !== manifest.minAppVersion) {
  throw new Error('package.json, manifest.json, and versions.json disagree');
}

await access('main.js');
if ((await stat('main.js')).size < 5_000_000) {
  throw new Error('main.js is missing bundled reader resources');
}
const bundle = await readFile('main.js', 'utf8');
if (bundle.includes('sourceMappingURL=')) {
  throw new Error('Production main.js must not contain a source map');
}
for (const marker of [
  'https://via.hypothes.is/pdfjs/web/viewer.html',
  'obsidian-annotator-note-indicator-styles',
  'follow-obsidian'
]) {
  if (!bundle.includes(marker)) throw new Error(`Release bundle is missing ${marker}`);
}
if (bundle.includes('/vendor/pdfjs-2/web/viewer.html')) {
  throw new Error('Release bundle still contains the legacy Via PDF wrapper');
}

const zipMarker = 'function(){/*@preserve';
const zipStart = bundle.indexOf(zipMarker);
const zipEnd = bundle.indexOf('*/}', zipStart);
if (zipStart < 0 || zipEnd < 0) throw new Error('Embedded reader resources are missing');
const resources = await JSZip.loadAsync(
  bundle.slice(zipStart + zipMarker.length, zipEnd).replaceAll('* ', '*')
);

for (const path of [
  'pdfjs/web/viewer.html',
  'pdfjs/web/viewer.mjs',
  'pdfjs/build/pdf.mjs',
  'pdfjs/build/pdf.worker.mjs',
  'hypothes.is/app.html',
  'cdn.hypothes.is/hypothesis/build/boot.js',
  'cdn.hypothes.is/hypothesis/build/scripts/annotator.bundle.js',
  'cdn.hypothes.is/hypothesis/build/scripts/sidebar.bundle.js',
  'cdn.hypothes.is/demos/epub/epub.js/index.html'
]) {
  if (!resources.file(path)) throw new Error(`Reader resource is missing ${path}`);
}

for (const path of [
  'cdn.hypothes.is/hypothesis.html',
  'hypothes.is/embed.js',
  'hypothes.is/notebook.html',
  'via.hypothes.is/https.html',
  'cdn.hypothes.is/hypothesis/build/boot-template.js'
]) {
  if (resources.file(path)) throw new Error(`Release contains obsolete reader resource ${path}`);
}

const pdf = await resources.file('pdfjs/build/pdf.mjs').async('string');
if (!pdf.includes('pdfjsVersion = 6.2.108')) {
  throw new Error('Release bundle does not contain the pinned PDF.js 6.2.108 build');
}

const viewer = await resources.file('pdfjs/web/viewer.html').async('string');
for (const marker of [
  'js-hypothesis-config',
  'showHighlights',
  'annotator-plus/sidebar.html',
  'https://cdn.hypothes.is/hypothesis/build/boot.js'
]) {
  if (!viewer.includes(marker)) throw new Error(`PDF reader is missing ${marker}`);
}

const epub = await resources.file('cdn.hypothes.is/demos/epub/epub.js/index.html').async('string');
for (const marker of [
  'js-hypothesis-config',
  'showHighlights',
  'annotator-plus/sidebar.html',
  'https://cdn.hypothes.is/hypothesis/build/boot.js'
]) {
  if (!epub.includes(marker)) throw new Error(`EPUB reader is missing ${marker}`);
}
if (epub.includes('fonts.googleapis.com')) {
  throw new Error('EPUB reader must not load its controls from Google Fonts');
}

const darkReader = await resources.file('dark-reader/darkreader.js').async('string');
const darkReaderVersion = JSON.parse(await resources.file('dark-reader/version.json').async('string'));
if (darkReaderVersion.version !== '4.9.128' || !darkReader.includes('setFetchMethod')) {
  throw new Error('Release bundle does not contain the pinned Dark Reader 4.9.128 build');
}

const sidebar = await resources
  .file('cdn.hypothes.is/hypothesis/build/scripts/sidebar.bundle.js')
  .async('string');
for (const marker of [
  'annotatorPlus',
  'Filter annotations',
  'show-annotations-with-notes',
  'Notes (',
  'renderObsidianMarkdown'
]) {
  if (!sidebar.includes(marker)) throw new Error(`Hypothesis sidebar is missing ${marker}`);
}

console.log(`Verified Annotator++ ${manifest.version} with PDF.js 6.2.108, current Hypothesis, and Dark Reader 4.9.128`);
