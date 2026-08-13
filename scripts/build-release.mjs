import { copyFile, readFile } from 'node:fs/promises';

const source = 'release/main.js';
const bundle = await readFile(source, 'utf8');

for (const marker of [
  'via.hypothes.is/static/17596075c280a757b7d7f83122332990/vendor/pdfjs-2/web/viewer.html',
  'obsidian-annotator-note-indicator-styles',
  'follow-obsidian'
]) {
  if (!bundle.includes(marker)) throw new Error(`Validated release bundle is missing ${marker}`);
}

await copyFile(source, 'main.js');
console.log('Built main.js from the validated Annotator+ runtime');
