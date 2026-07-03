import { useEffect, useState } from 'react';
import type { AppConfig } from '../lib/usage';

type Palette = AppConfig['epaperPalette'];
type Layout = AppConfig['epaperLayout'];

interface Props {
  palette: Palette;
  layout: Layout;
  /** Rotation configurée pour la dalle physique (l'aperçu reste à l'endroit). */
  configRotate: 0 | 180;
  online: boolean;
  /** Change à chaque fetch usage réussi → recharge l'image. */
  version: string;
}

/**
 * Aperçu FIDÈLE : affiche le PNG exact généré par le serveur (celui envoyé à
 * la dalle), upscalé en nearest-neighbor — MAIS toujours à l'endroit : la
 * rotation configurée ne s'applique qu'à la dalle physique, pas à l'aperçu.
 */
export function EpaperView({ palette, layout, configRotate, online, version }: Props) {
  const [pal, setPal] = useState<Palette>(palette);
  const [lay, setLay] = useState<Layout>(layout);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => setPal(palette), [palette]);
  useEffect(() => setLay(layout), [layout]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // rotate=0 explicite : l'aperçu ne suit jamais la rotation de la dalle.
  const src = `/api/render.png?layout=${lay}&palette=${pal}&rotate=0&v=${encodeURIComponent(version)}-${tick}`;
  useEffect(() => setError(false), [src]);

  const compact = lay === 'compact';
  const nativeW = compact ? 250 : 800;
  const nativeH = compact ? 122 : 480;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="h-2.5 w-2.5 rounded-full blink-10"
          style={{ background: online ? '#4ade80' : '#e0533c' }}
        />
        <span className="text-white/60">{online ? 'online' : 'offline'}</span>
      </div>

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
          {configRotate === 180 ? ' · dalle tournée 180°' : ''}
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
