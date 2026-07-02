import { useEffect, useState } from 'react';
import type { AppConfig } from '../lib/usage';

type Palette = AppConfig['epaperPalette'];
type Layout = AppConfig['epaperLayout'];

interface Props {
  palette: Palette;
  layout: Layout;
  rotate: 0 | 180;
  /** Change à chaque fetch usage réussi → recharge l'image. */
  version: string;
}

/**
 * Aperçu FIDÈLE : affiche le PNG exact généré par le serveur (celui envoyé à
 * la dalle), upscalé en nearest-neighbor. Ce que tu vois = ce que l'e-ink reçoit.
 */
export function EpaperView({ palette, layout, rotate, version }: Props) {
  const [pal, setPal] = useState<Palette>(palette);
  const [lay, setLay] = useState<Layout>(layout);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => setPal(palette), [palette]);
  useEffect(() => setLay(layout), [layout]);

  // Filet de sécurité : la pose de Clawd tourne aussi sans variation d'usage.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const src = `/api/render.png?layout=${lay}&palette=${pal}${rotate === 180 ? '&rotate=180' : ''}&v=${encodeURIComponent(version)}-${tick}`;
  useEffect(() => setError(false), [src]);

  const compact = lay === 'compact';
  const nativeW = compact ? 250 : 800;
  const nativeH = compact ? 122 : 480;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Bezel du boîtier physique. */}
      <div className="rounded-2xl bg-[#22201d] p-4 shadow-2xl">
        {error ? (
          <div
            className="flex items-center justify-center bg-white font-mono text-xs text-black/60"
            style={{ width: 'min(750px, 90vw)', aspectRatio: `${nativeW} / ${nativeH}` }}
          >
            rendu indisponible — serveur éteint ?
          </div>
        ) : (
          <img
            key={src}
            src={src}
            onError={() => setError(true)}
            alt={`Rendu e-paper ${nativeW}×${nativeH}`}
            className="block"
            style={{
              width: 'min(750px, 90vw)',
              aspectRatio: `${nativeW} / ${nativeH}`,
              imageRendering: 'pixelated',
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/50">
        <span>
          Rendu réel {nativeW}×{nativeH}
          {compact ? ' (2,13″)' : ' (7,5″)'}
          {rotate === 180 ? ' · rotation 180°' : ''}
        </span>
        <div className="flex overflow-hidden rounded-lg bg-white/10">
          {(['bw', 'bwr'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPal(p)}
              className={`px-3 py-1 ${pal === p ? 'bg-[#d97757] text-black' : ''}`}
            >
              {p === 'bw' ? 'Noir & blanc' : 'N/B/rouge'}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-lg bg-white/10">
          {(['compact', 'full'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLay(l)}
              className={`px-3 py-1 ${lay === l ? 'bg-[#d97757] text-black' : ''}`}
            >
              {l === 'compact' ? '2,13″' : '7,5″'}
            </button>
          ))}
        </div>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-white/10 px-3 py-1 hover:bg-white/20"
        >
          Ouvrir le PNG ↗
        </a>
      </div>
    </div>
  );
}
