import fs from 'node:fs';
import path from 'node:path';
import type { UsageSnapshot } from './types.js';
import { getConfigDir, loadConfig } from './config.js';
import { renderEpaperPng } from './render.js';

/**
 * Abstraction de l'affichage physique. Le web dashboard n'en dépend pas ;
 * c'est ici qu'on branchera le driver e-paper (SPI/GPIO) sur le Raspberry Pi.
 */
export interface Display {
  render(snap: UsageSnapshot): Promise<void>;
}

/** Implémentation par défaut : log console (aucun matériel requis). */
export class NullDisplay implements Display {
  async render(snap: UsageSnapshot): Promise<void> {
    console.log(
      `[display] 5h=${snap.fiveHour.utilization}% 7d=${snap.sevenDay.utilization}%`,
    );
  }
}

/**
 * Rendu e-paper : génère le PNG du panneau et l'écrit dans CONFIG_DIR/epaper.png.
 * Sur le Pi, un script pousse ensuite ce PNG sur la dalle via le driver Waveshare
 * (SPI) — voir README > "Brancher l'e-paper".
 */
export class EpaperDisplay implements Display {
  async render(_snap: UsageSnapshot): Promise<void> {
    const png = renderEpaperPng();
    const out = path.join(getConfigDir(), 'epaper.png');
    fs.writeFileSync(out, png);
    console.log(`[epaper] PNG écrit (${png.length} o) -> ${out}`);
  }
}

export function createDisplay(): Display {
  return loadConfig().display === 'epaper' ? new EpaperDisplay() : new NullDisplay();
}
