/* ------------------------------------------------------------------------- *
 * Moteur de sprites pixel — module ISOMORPHE (serveur + web).
 *
 * Un sprite = des rectangles colorés, en pixels de dalle (1 unité = 1 px du
 * carré mascotte 118×118). Chaque couleur est une CLÉ de palette qui donne sa
 * teinte web ET son rendu N&B (encre / papier / invisible) : un seul dessin,
 * deux rendus, jamais deux copies à tenir synchrones.
 *
 * Le contour « sticker » est géométrique, en NIVEAUX : chaque rectangle est
 * tracé agrandi de `e` px dans la couleur du niveau, du plus large au plus
 * étroit, puis tous les remplissages par-dessus. L'union des rectangles agrandis
 * = l'union agrandie : les pièces qui se touchent (corps, bras, tasse tenue…)
 * fusionnent dans un seul contour, sans filtre SVG (net partout, resvg compris).
 * Ex. web : anneau blanc 3 px ; dalle : liseré noir 2 px.
 * ------------------------------------------------------------------------- */

export type Mode = 'mono' | 'color';

/** Rendu N&B d'une clé : encre (noir), papier (blanc) ou rien. */
export type MonoInk = 'ink' | 'paper' | null;

export interface Swatch {
  color: string;
  mono: MonoInk;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Clé de palette. */
  k: string;
  opacity?: number;
}

/** Un niveau de contour : agrandissement (px) et couleur (encre / papier). */
export type Ring = readonly [expand: number, role: 'ink' | 'paper'];

export interface Layer {
  rects: Rect[];
  /** Niveaux du contour sticker, par mode (absent = pas de contour). */
  outline?: Partial<Record<Mode, readonly Ring[]>>;
  /** Force une couleur unie pour toute la couche dans un mode (ex. détails fins
   * et flottants en encre sur la dalle, quelle que soit leur teinte web). */
  solid?: Partial<Record<Mode, 'ink' | 'paper'>>;
}

export const INK = '#000000';
export const PAPER = '#ffffff';

/**
 * Bitmap → rectangles : une ligne de texte par rangée, un caractère par pixel
 * (`.` ou espace = transparent, sinon la clé de palette), agrandi ×`s`. Les
 * pixels voisins de même clé sont fusionnés en bandes horizontales.
 */
export function bitmap(rows: string[], x: number, y: number, s = 1): Rect[] {
  const out: Rect[] = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; ) {
      const k = row[c];
      if (k === '.' || k === ' ') {
        c++;
        continue;
      }
      let e = c;
      while (row[e] === k) e++;
      out.push({ x: x + c * s, y: y + r * s, w: (e - c) * s, h: s, k });
      c = e;
    }
  });
  return out;
}

/** Décale des rectangles (mouvements de la couche idle). */
export function shift(rects: Rect[], dx: number, dy: number): Rect[] {
  return rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
}

const n = (v: number) => Math.round(v * 100) / 100;

function rectSvg(x: number, y: number, w: number, h: number, fill: string, opacity?: number): string {
  const o = opacity !== undefined && opacity < 1 ? ` opacity="${n(opacity)}"` : '';
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${o}/>`;
}

/**
 * Rend des couches en SVG : les contours niveau par niveau, TOUTES couches
 * confondues (sinon l'anneau d'une couche recouvrirait le liseré d'une autre),
 * du plus large au plus étroit, puis tous les remplissages dans l'ordre.
 */
export function renderLayers(layers: Layer[], palette: Record<string, Swatch>, mode: Mode): string {
  const color = (k: string): string | null => {
    const sw = palette[k];
    if (!sw) return null;
    if (mode === 'color') return sw.color;
    return sw.mono === 'ink' ? INK : sw.mono === 'paper' ? PAPER : null;
  };
  const visible = (r: Rect) => color(r.k) !== null && r.w > 0 && r.h > 0;
  const levels = [...new Set(layers.flatMap((l) => (l.outline?.[mode] ?? []).map(([e]) => e)))].sort((a, b) => b - a);
  let out = '';
  for (const e of levels) {
    for (const layer of layers) {
      const ring = layer.outline?.[mode]?.find(([x]) => x === e);
      if (!ring) continue;
      const fill = ring[1] === 'ink' ? INK : PAPER;
      for (const r of layer.rects)
        if (visible(r) && (r.opacity ?? 1) > 0.5) out += rectSvg(r.x - e, r.y - e, r.w + 2 * e, r.h + 2 * e, fill);
    }
  }
  for (const layer of layers) {
    const solid = layer.solid?.[mode];
    const forced = solid === 'ink' ? INK : solid === 'paper' ? PAPER : null;
    for (const r of layer.rects) if (visible(r)) out += rectSvg(r.x, r.y, r.w, r.h, forced ?? color(r.k)!, r.opacity);
  }
  return out;
}
