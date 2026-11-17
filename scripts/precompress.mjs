#!/usr/bin/env node
// Pré-compresse les assets du build web (brotli + gzip) UNE fois, au build :
// le serveur les sert tels quels (cf. server/src/index.ts), sans compresser à
// la volée sur le Pi ni ajouter de dépendance.
// Usage : node scripts/precompress.mjs web/dist
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(process.argv[2] ?? 'web/dist');
const EXT = new Set(['.js', '.css', '.html', '.svg', '.json', '.webmanifest']);
const MIN_BYTES = 1024;

let saved = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (EXT.has(path.extname(e.name)) && fs.statSync(p).size >= MIN_BYTES) {
      const buf = fs.readFileSync(p);
      const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
      const gz = zlib.gzipSync(buf, { level: 9 });
      fs.writeFileSync(`${p}.br`, br);
      fs.writeFileSync(`${p}.gz`, gz);
      saved += buf.length - br.length;
    }
  }
}
walk(root);
console.log(`précompression : ${Math.round(saved / 1024)} Ko économisés (brotli)`);
