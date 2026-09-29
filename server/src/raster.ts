import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

// Police embarquée (server/fonts) → rendu identique partout, sans dépendre des
// polices système. Tiny5 = police PIXEL/bitmap (OFL) : nette à petite taille sur
// l'e-ink, là où une police vectorielle (DejaVu) casse sous ~9 px. Chemin résolu
// depuis dist/ comme depuis src/.
const FONT_DIR = fileURLToPath(new URL('../fonts/', import.meta.url));
const FONT_FAMILY = 'Tiny5';
const FONT_FILES = [`${FONT_DIR}Tiny5-Regular.ttf`];

const PAPER = '#ffffff';

function resvg(svg: string, widthPx: number, transparent: boolean): Resvg {
  return new Resvg(svg, {
    ...(transparent ? {} : { background: PAPER }),
    fitTo: { mode: 'width', value: widthPx },
    // La police générique "monospace" du SVG est mappée sur Tiny5 (pixel).
    // loadSystemFonts:false = rendu déterministe + init plus rapide (Pi Zero).
    font: {
      loadSystemFonts: false,
      fontFiles: FONT_FILES,
      defaultFontFamily: FONT_FAMILY,
      monospaceFamily: FONT_FAMILY,
    },
  });
}

/** Rastérise un SVG en PNG avec la police embarquée (rendu déterministe partout). */
export function rasterizeSvg(svg: string, widthPx: number, transparent = false): Buffer {
  return Buffer.from(resvg(svg, widthPx, transparent).render().asPng());
}

/** Même rendu, en pixels RGBA bruts (encodage GIF sans passer par le PNG). */
export function rasterizeRgba(svg: string, widthPx: number): { data: Buffer; width: number; height: number } {
  const img = resvg(svg, widthPx, true).render();
  return { data: Buffer.from(img.pixels), width: img.width, height: img.height };
}

/* ------------------------------------------------------------------------- *
 * Chasses de Tiny5, en PIXELS DE POLICE (la police est dessinée sur une grille
 * de 1/8 d'em : elle n'est nette qu'à 8, 16, 24 px… et à une position entière).
 * Lues directement dans le TTF (tables cmap format 4 + hmtx) : sert à aligner
 * le texte au pixel près plutôt que de laisser `text-anchor` tomber entre deux.
 * ------------------------------------------------------------------------- */

let advances: Map<number, number> | null = null;

function readAdvances(file: string): Map<number, number> {
  const f = fs.readFileSync(file);
  const tables: Record<string, number> = {};
  for (let i = 0; i < f.readUInt16BE(4); i++) {
    const at = 12 + 16 * i;
    tables[f.toString('latin1', at, at + 4)] = f.readUInt32BE(at + 8);
  }
  const unit = f.readUInt16BE(tables.head + 18) / 8; // unités par pixel de police
  const hMetrics = f.readUInt16BE(tables.hhea + 34);
  const advance = (g: number) => Math.round(f.readUInt16BE(tables.hmtx + 4 * Math.min(g, hMetrics - 1)) / unit);
  const map = new Map<number, number>();
  const cmap = tables.cmap;
  for (let i = 0; i < f.readUInt16BE(cmap + 2); i++) {
    const base = cmap + f.readUInt32BE(cmap + 4 + 8 * i + 4);
    if (f.readUInt16BE(base) !== 4) continue;
    const segX2 = f.readUInt16BE(base + 6);
    const ends = base + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const start = f.readUInt16BE(starts + 2 * s);
      const end = f.readUInt16BE(ends + 2 * s);
      const delta = f.readInt16BE(deltas + 2 * s);
      const range = f.readUInt16BE(ranges + 2 * s);
      for (let ch = start; ch <= end && ch !== 0xffff; ch++) {
        let g = range ? f.readUInt16BE(ranges + 2 * s + range + 2 * (ch - start)) : ch;
        if (g) g = (g + delta) & 0xffff;
        if (g) map.set(ch, advance(g));
      }
    }
    break;
  }
  return map;
}

/** Largeur d'un texte en pixels de police (chasse de chaque glyphe, espacement compris). */
export function pixelTextWidth(text: string): number {
  advances ??= readAdvances(FONT_FILES[0]);
  let w = 0;
  for (const ch of text) w += advances.get(ch.codePointAt(0)!) ?? 4;
  return w;
}
