import { access, readFile, stat } from 'node:fs/promises';

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
if ((await stat('main.js')).size < 100_000) throw new Error('main.js is missing or unexpectedly small');
if ((await readFile('main.js', 'utf8')).includes('sourceMappingURL=')) {
  throw new Error('Production main.js must not contain a source map');
}

console.log(`Verified Annotator+ ${manifest.version}`);
