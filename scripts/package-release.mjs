import { cp, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
const output = `dist/annotator-plus-${version}`;
await rm('dist', { recursive: true, force: true });
await mkdir(output, { recursive: true });
const zip = new JSZip();
const zipDate = new Date('1980-01-01T00:00:00.000Z');
zip.file(`annotator-plus-${version}/`, null, { dir: true, date: zipDate, unixPermissions: 0o40755 });
for (const file of ['main.js', 'manifest.json']) {
  const data = await readFile(file);
  await cp(file, `${output}/${file}`);
  zip.file(`annotator-plus-${version}/${file}`, data, { date: zipDate, unixPermissions: 0o100644 });
}
await writeFile(
  `dist/annotator-plus-${version}.zip`,
  await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE', compressionOptions: { level: 9 } }),
);

const assets = ['main.js', 'manifest.json', `annotator-plus-${version}.zip`];
const checksums = [];
for (const asset of assets) {
  const data = await readFile(asset.includes('.zip') ? `dist/${asset}` : asset);
  checksums.push(`${createHash('sha256').update(data).digest('hex')}  ${asset}`);
}
await cp('main.js', 'dist/main.js');
await cp('manifest.json', 'dist/manifest.json');
await writeFile('dist/SHA256SUMS', `${checksums.join('\n')}\n`);
console.log(`Packaged Annotator+ ${version} in dist/`);
