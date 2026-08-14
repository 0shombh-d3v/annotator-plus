import { access, readFile, stat } from 'node:fs/promises';
import JSZip from 'jszip';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));

if (manifest.id !== 'annotator-plus' || manifest.name !== 'Annotator+') {
  throw new Error('Unexpected plugin identity in manifest.json');
}
if (manifest.version !== pkg.version || versions[pkg.version] !== manifest.minAppVersion) {
  throw new Error('package.json, manifest.json, and versions.json disagree');
}
if (pkg.dependencies?.epubjs || pkg.keywords?.includes('epub') || /EPUB/i.test(manifest.description)) {
  throw new Error('Release metadata must describe the PDF-only product');
}

await access('main.js');
if ((await stat('main.js')).size < 5_000_000) {
  throw new Error('main.js is missing bundled reader resources');
}
const bundle = await readFile('main.js', 'utf8');
if (bundle.includes('sourceMappingURL=')) {
  throw new Error('Production main.js must not contain a source map');
}
if (bundle.includes('Annotator++')) {
  throw new Error('Production main.js contains the retired Annotator++ branding');
}
for (const marker of [
  'https://via.hypothes.is/pdfjs/web/viewer.html',
  'obsidian-annotator-note-indicator-styles',
  'follow-obsidian',
  'Blocked by Annotator+ offline policy',
  'vault-relative PDF path'
]) {
  if (!bundle.includes(marker)) throw new Error(`Release bundle is missing ${marker}`);
}
if (bundle.includes('/vendor/pdfjs-2/web/viewer.html')) {
  throw new Error('Release bundle still contains the legacy Via PDF wrapper');
}
for (const marker of ['require("fs")', 'require("https")', 'fetchHttpsTarget', 'epubjs']) {
  if (bundle.includes(marker)) throw new Error(`Release bundle contains removed runtime code: ${marker}`);
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
  'pdfjs/web/annotator-plus-bootstrap.js',
  'pdfjs/web/viewer.mjs',
  'pdfjs/build/pdf.mjs',
  'pdfjs/build/pdf.worker.mjs',
  'hypothes.is/app.html',
  'hypothes.is/annotator-plus-app-bootstrap.js',
  'cdn.hypothes.is/hypothesis/build/boot.js',
  'cdn.hypothes.is/hypothesis/build/scripts/annotator.bundle.js',
  'cdn.hypothes.is/hypothesis/build/scripts/sidebar.bundle.js'
]) {
  if (!resources.file(path)) throw new Error(`Reader resource is missing ${path}`);
}

const hypothesisApp = await resources.file('hypothes.is/app.html').async('string');
if (!hypothesisApp.includes('<title>Annotator+</title>')) {
  throw new Error('Hypothesis sidebar has the wrong display name');
}

for (const path of [
  'cdn.hypothes.is/hypothesis.html',
  'hypothes.is/embed.js',
  'hypothes.is/notebook.html',
  'via.hypothes.is/https.html',
  'cdn.hypothes.is/demos/epub/epub.js/index.html',
  'cdn.hypothes.is/hypothesis/build/boot-template.js',
  'cdn.hypothes.is/hypothesis/build/scripts/test-inputs.js',
  'cdn.hypothes.is/hypothesis/build/scripts/tests.bundle.js',
  'cdn.hypothes.is/hypothesis/build/scripts/tests.bundle.js.map',
  'cdn.hypothes.is/hypothesis/build/scripts/ui-playground.bundle.js',
  'cdn.hypothes.is/hypothesis/build/styles/ui-playground.css'
]) {
  if (resources.file(path)) throw new Error(`Release contains obsolete reader resource ${path}`);
}
if (Object.keys(resources.files).some(path => /(?:^|\/)epub(?:\/|$)/i.test(path))) {
  throw new Error('Release contains EPUB reader resources');
}
for (const [path, file] of Object.entries(resources.files)) {
  if (file.dir || !/\.(?:css|js|mjs)$/i.test(path)) continue;
  if ((await file.async('string')).includes('sourceMappingURL=')) {
    throw new Error(`Release resource still references a removed source map: ${path}`);
  }
}

const pdf = await resources.file('pdfjs/build/pdf.mjs').async('string');
if (!pdf.includes('pdfjsVersion = 6.2.108')) {
  throw new Error('Release bundle does not contain the pinned PDF.js 6.2.108 build');
}

const pdfViewer = await resources.file('pdfjs/web/viewer.mjs').async('string');
if (!pdfViewer.includes('const annotationEditorMode = AnnotationEditorType.DISABLE;')) {
  throw new Error('PDF.js editing tools must remain disabled in the Annotator+ reader');
}
if (!pdfViewer.includes('const supportsDownloading = false;')) {
  throw new Error('PDF.js Save controls must remain disabled in the Annotator+ reader');
}
if (!pdfViewer.includes('}], ["supportsPrinting", {\n  value: false,')) {
  throw new Error('PDF.js Print controls must remain disabled in the Annotator+ reader');
}
if (!pdfViewer.includes('return shadow(this, "supportsFullscreen", false);')) {
  throw new Error('PDF.js Presentation Mode must remain disabled in the Annotator+ reader');
}
for (const marker of [
  '["enableAltTextModelDownload", {\n  value: false,',
  '["enableAutoLinking", {\n  value: false,',
  '["enableGuessAltText", {\n  value: false,',
  '["enableScripting", {\n  value: false,',
  'externalLinkEnabled = false;'
]) {
  if (!pdfViewer.includes(marker)) throw new Error(`PDF reader offline policy is missing ${marker}`);
}
for (const marker of ['eventBus.dispatch("openfile"', 'presentationModeKeyboard']) {
  if (pdfViewer.includes(marker)) throw new Error(`PDF reader restored disabled shortcut ${marker}`);
}
for (const marker of [
  'toggleButton: document.getElementById("secondaryToolbarToggleButton")'
]) {
  if (!pdfViewer.includes(marker)) throw new Error(`PDF reader is missing ${marker}`);
}

const viewer = await resources.file('pdfjs/web/viewer.html').async('string');
for (const marker of [
  'Content-Security-Policy',
  "connect-src 'none'",
  'annotator-plus-bootstrap.js',
  'data-target-base64=aHR0cHM6Ly9hcnhpdi5vcmcvcGRmLzE3MDIuMDg3MzQucGRm',
  'id=printButton class="toolbarButton hidden"',
  'id=secondaryOpenFile class="toolbarButton labeled hidden"',
  'id=secondaryPrint class="toolbarButton labeled hidden"',
  'id=documentActionsSeparator class="horizontalToolbarSeparator hidden"',
  'id=presentationMode class="toolbarButton labeled hidden"',
  'id=viewBookmark class="toolbarButton labeled hidden"',
  'id=viewBookmarkSeparator class="horizontalToolbarSeparator hidden"'
]) {
  if (!viewer.includes(marker)) throw new Error(`PDF reader is missing ${marker}`);
}
if (viewer.includes("script-src 'unsafe-inline'") || viewer.includes("script-src 'unsafe-eval'")) {
  throw new Error('PDF reader CSP permits inline or evaluated scripts');
}
if (/href="https?:\/\//i.test(viewer)) {
  throw new Error('PDF reader HTML contains an external navigation link');
}

const bootstrap = await resources.file('pdfjs/web/annotator-plus-bootstrap.js').async('string');
for (const marker of [
  'await window.PDFViewerApplication.initializedPromise',
  'targetBase64',
  'instanceof URL',
  '"enableScripting",!1',
  '"enableAltTextModelDownload",!1',
  '"enableGuessAltText",!1',
  'showHighlights:"always"',
  'annotator-plus/sidebar.html',
  'https://cdn.hypothes.is/hypothesis/build/boot.js'
]) {
  if (!bootstrap.includes(marker)) throw new Error(`PDF bootstrap is missing ${marker}`);
}

const appBootstrap = await resources.file('hypothes.is/annotator-plus-app-bootstrap.js').async('string');
for (const marker of ['window.hypothesisConfig', 'https://cdn.hypothes.is/hypothesis/build/boot.js']) {
  if (!appBootstrap.includes(marker)) throw new Error(`Sidebar bootstrap is missing ${marker}`);
}

for (const path of ['pdfjs/web/viewer.html', 'hypothes.is/app.html']) {
  const html = await resources.file(path).async('string');
  if (!html.includes('Content-Security-Policy') || !html.includes("connect-src 'none'")) {
    throw new Error(`${path} is missing the offline CSP`);
  }
  if (!html.includes('font-src blob: data: app:')) {
    throw new Error(`${path} does not allow Obsidian's bundled PDF fonts`);
  }
  if (html.includes('__ANNOTATOR_PLUS_CSP_NONCE__') || html.includes('js-hypothesis-config')) {
    throw new Error(`${path} contains an inline configuration script`);
  }
}

const sidebarApp = await resources.file('hypothes.is/app.html').async('string');
if (!sidebarApp.includes('src=https://hypothes.is/annotator-plus-app-bootstrap.js')) {
  throw new Error('Sidebar app does not use the bundled absolute bootstrap URL');
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

const hypothesisManifest = JSON.parse(
  await resources.file('cdn.hypothes.is/hypothesis/build/manifest.json').async('string')
);
const manifestKeys = Object.keys(hypothesisManifest);
if (manifestKeys.join('\n') !== [...manifestKeys].sort().join('\n')) {
  throw new Error('Hypothesis asset manifest is not deterministic');
}

console.log(`Verified Annotator+ ${manifest.version} with PDF.js 6.2.108, current Hypothesis, and Dark Reader 4.9.128`);
