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
await access('main.js');
if ((await stat('main.js')).size < 10_000_000) throw new Error('main.js is missing validated reader resources');
const bundle = await readFile('main.js', 'utf8');
if (bundle.includes('sourceMappingURL=')) {
  throw new Error('Production main.js must not contain a source map');
}
for (const marker of [
  'via.hypothes.is/static/17596075c280a757b7d7f83122332990/vendor/pdfjs-2/web/viewer.html',
  'obsidian-annotator-note-indicator-styles',
  'follow-obsidian'
]) {
  if (!bundle.includes(marker)) throw new Error(`Release bundle is missing ${marker}`);
}
if (!bundle.includes('this.app.plugins.plugins["obsidian-annotator"]=this')) {
  throw new Error('Release bundle is missing the legacy sidebar compatibility alias');
}

const zipMarker = 'function(){/*@preserve';
const zipStart = bundle.indexOf(zipMarker);
const zipEnd = bundle.indexOf('*/}', zipStart);
if (zipStart < 0 || zipEnd < 0) throw new Error('Embedded reader resources are missing');
const resources = await JSZip.loadAsync(
  bundle.slice(zipStart + zipMarker.length, zipEnd).replaceAll('* ', '*')
);
const sidebar = await resources
  .file('cdn.hypothes.is/hypothesis/build/scripts/sidebar.bundle.js')
  ?.async('string');
if (!resources.file('via.hypothes.is/static/17596075c280a757b7d7f83122332990/vendor/pdfjs-2/web/viewer.html')) {
  throw new Error('Validated PDF.js reader is missing');
}
for (const marker of ['Filter annotations', 'show-annotations-with-notes', 'Notes (', 'obsidian-annotator']) {
  if (!sidebar?.includes(marker)) throw new Error(`Hypothesis sidebar is missing ${marker}`);
}

console.log(`Verified Annotator+ ${manifest.version}`);
