/* eslint-disable no-console */
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import minify from 'minify';
import MagicString from 'magic-string';

const importSuffix = "!zipStringEncoded";
let counter = 0;

export default function zipStringEncoded() {
  const stringMap = new Map();
  return {
    name: 'zip-string-encoded', // this name will show up in warnings and errors
    resolveId ( source ) {
      if (source.endsWith(importSuffix)) {
        return source; // this signals that rollup should not ask other plugins or check the file system to find this id
      }
      return null; // other ids should be handled as usually
    },
    async load ( id ) {
      if (id.endsWith(importSuffix)) {
        const folder = id.substr(0, id.length - importSuffix.length);
        const zip = await getZipOfFolder(folder);
        const theString = await zip.generateAsync({type: "string", compression: "DEFLATE", compressionOptions: {level: 9}});
        const placeholder = `rollupZipStringEncodedNo${counter++}`;
        const replacementCode = theString.replaceAll("*", "* ");
        stringMap.set(placeholder, replacementCode);
        return `const a = function(){/*@preserve${placeholder}*/};const s=a.toString();const s2 = s.substring(22,s.length-3); const res= s2.replaceAll("* ", "*"); export default res;`; // the source code for "virtual-module"
      }
      return null; // other ids should be handled as usually
    },
    renderChunk(code) {
      const magicString = new MagicString(code);
      for (const [placeholder, replacementCode] of stringMap.entries()) {
        const pattern = new RegExp(placeholder, 'gm');
        let match;
        let i = 0;
        while ((match = pattern.exec(code)) !== null) {
          const pattern = new RegExp(placeholder);
          if (match.index === pattern.lastIndex) {
            pattern.lastIndex++;
          }
          const start = match.index;
          const end = start + match[0].length;
          magicString.overwrite(start, end, replacementCode);
        }
      }
      return {code: magicString.toString(), map: magicString.generateMap({ hires: true })};
    }
  };
}


const getFilePathsRecursively = (dir) => {

  // returns a flat array of absolute paths of all files recursively contained in the dir
  let results = [];
  let list = fs.readdirSync(dir).sort();

  var pending = list.length;
  if (!pending) return results;

  for (let file of list) {
    file = path.resolve(dir, file);

    let stat = fs.lstatSync(file);

    if (stat && stat.isDirectory()) {
      results = results.concat(getFilePathsRecursively(file));
    } else {
      results.push(file);
    }

    if (!--pending) return results;
  }

  return results;
};

const minifiableFormats = new Set(["html", "js"]);
const ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');

const getZipOfFolder = async (dir) => {

  // returns a JSZip instance filled with contents of dir.

  let allPaths = getFilePathsRecursively(dir);

  let zip = new JSZip();
  for (let filePath of allPaths) {
    let addPath = slash(path.relative(dir, filePath)); // use this instead if you don't want the source folder itself in the zip
    let ext = filePath.split('.').pop().trim();
    
    let data;
    if(minifiableFormats.has(ext)) {
      try {
          console.log("minifying ", filePath)
          data = await minify(filePath)
      } catch(e) {
          
        console.log("Minification Failed for ", filePath)
      }
    }
    if(!data) {
      data = fs.readFileSync(filePath);
    }

    let stat = fs.lstatSync(filePath);

    if (stat.isSymbolicLink()) {
      zip.file(addPath, fs.readlinkSync(filePath), {
        unixPermissions: parseInt('120755', 8), // This permission can be more permissive than necessary for non-executables but we don't mind.
        dir: stat.isDirectory(),
        date: ZIP_DATE,
        createFolders: false
      });
    } else {
      zip.file(addPath, data, {
        unixPermissions: parseInt('100644', 8),
        dir: stat.isDirectory(),
        date: ZIP_DATE,
        createFolders: false
      });
    }
  }

  return zip;
};

function slash(path) {
	const isExtendedLengthPath = /^\\\\\?\\/.test(path);
	const hasNonAscii = /[^\u0000-\u0080]+/.test(path); // eslint-disable-line no-control-regex

	if (isExtendedLengthPath || hasNonAscii) {
		return path;
	}

	return path.replace(/\\/g, '/');
}
