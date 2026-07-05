import { useEffect, useState } from 'react';
import type { AppConfig } from '../lib/usage';

type Layout = AppConfig['epaperLayout'];

interface Props {
  layout: Layout;
  /** Rotation configurée pour la dalle physique (l'aperçu reste à l'endroit). */
  configRotate: 0 | 180;
  online: boolean;
  /** Change à chaque fetch usage réussi → recharge l'image. */
  version: string;
}

/**
 * Aperçu FIDÈLE : affiche le PNG exact généré par le serveur (celui envoyé à
 * la dalle 2,13″), upscalé en nearest-neighbor — MAIS toujours à l'endroit :
 * la rotation configurée ne s'applique qu'à la dalle physique, pas à l'aperçu.
 * Rafraîchi chaque seconde pour suivre les animations (point online, GIF).
 */
export function EpaperView({ layout, configRotate, online, version }: Props) {
  const [lay, setLay] = useState<Layout>(layout);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => setLay(layout), [layout]);

  // 1 s : suit le rythme d'animation du rendu serveur (comme la dalle).
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // rotate=0 explicite : l'aperçu ne suit jamais la rotation de la dalle.
  const src = `/api/render.png?layout=${lay}&rotate=0&v=${encodeURIComponent(version)}-${tick}`;
  // Une erreur (serveur éteint ?) est retentée au tick suivant.
  useEffect(() => setError(false), [src]);

  const horizontal = lay === 'horizontal';
  const nativeW = horizontal ? 250 : 122;
  const nativeH = horizontal ? 122 : 250;
  // Portrait : largeur bornée pour éviter une image démesurément haute.
  const previewW = horizontal ? 'min(750px, 90vw)' : 'min(360px, 70vw)';

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
            style={{ width: previewW, aspectRatio: `${nativeW} / ${nativeH}` }}
          >
            rendu indisponible — serveur éteint ?
          </div>
        ) : (
          <img
            src={src}
            onError={() => setError(true)}
            alt={`Rendu e-paper ${nativeW}×${nativeH}`}
            className="block"
            style={{
              width: previewW,
              aspectRatio: `${nativeW} / ${nativeH}`,
              imageRendering: 'pixelated',
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/50">
        <span>
          Rendu réel {nativeW}×{nativeH} (2,13″)
          {configRotate === 180 ? ' · dalle tournée 180°' : ''}
        </span>
        <div className="flex overflow-hidden rounded-lg bg-white/10">
          {(['horizontal', 'vertical'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLay(l)}
              className={`px-3 py-1 ${lay === l ? 'bg-[#d97757] text-black' : ''}`}
            >
              {l === 'horizontal' ? 'Horizontal' : 'Vertical'}
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
