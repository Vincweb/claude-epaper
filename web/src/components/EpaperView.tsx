import { useEffect, useState } from 'react';
import type { AppConfig } from '../lib/usage';

type Layout = AppConfig['epaperLayout'];

interface Props {
  layout: Layout;
  online: boolean;
}

/** Onglet visible ? (pas d'aperçu à rafraîchir pour un onglet en arrière-plan) */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/**
 * Aperçu FIDÈLE : affiche le PNG exact généré par le serveur (celui envoyé à
 * la dalle 2,13″), upscalé en nearest-neighbor — MAIS toujours à l'endroit :
 * la rotation configurée ne s'applique qu'à la dalle physique, pas à l'aperçu.
 * Rafraîchi chaque seconde (animations), en pause quand l'onglet est caché.
 * Chaque image est préchargée : en cas d'échec on garde la précédente.
 */
export function EpaperView({ layout, online }: Props) {
  const visible = usePageVisible();
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let pending: HTMLImageElement | null = null;
    const load = () => {
      // rotate=0 explicite : l'aperçu ne suit jamais la rotation de la dalle.
      const src = `/api/render.png?layout=${layout}&rotate=0&t=${Math.floor(Date.now() / 1000)}`;
      const img = new Image();
      pending = img;
      img.onload = () => {
        if (!alive) return;
        setShown(src);
        setFailed(false);
      };
      img.onerror = () => alive && setFailed(true);
      img.src = src;
    };
    load();
    const id = setInterval(load, 1000);
    return () => {
      alive = false;
      clearInterval(id);
      if (pending) pending.src = '';
    };
  }, [layout, visible]);

  const horizontal = layout === 'horizontal';
  const nativeW = horizontal ? 250 : 122;
  const nativeH = horizontal ? 122 : 250;
  // Portrait : largeur bornée pour éviter une image démesurément haute.
  const previewW = horizontal ? 'min(750px, calc(100vw - 72px))' : 'min(360px, 70vw)';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="h-2.5 w-2.5 rounded-full blink-10" style={{ background: online ? 'var(--color-ok)' : 'var(--color-bad)' }} />
        <span className="text-white/60">{online ? 'en ligne' : 'hors ligne'}</span>
      </div>

      {/* Bezel du boîtier physique. */}
      <div className="relative rounded-[1.5rem] bg-bezel p-4 shadow-2xl ring-1 ring-white/[0.06]">
        {shown ? (
          <img
            src={shown}
            alt={`Rendu e-paper ${nativeW}×${nativeH}`}
            className={`block ${failed ? 'opacity-40' : ''}`}
            style={{ width: previewW, aspectRatio: `${nativeW} / ${nativeH}`, imageRendering: 'pixelated' }}
          />
        ) : (
          <div
            className="flex items-center justify-center bg-white font-mono text-xs text-black/60"
            style={{ width: previewW, aspectRatio: `${nativeW} / ${nativeH}` }}
          >
            {failed ? 'rendu indisponible — serveur éteint ?' : 'chargement…'}
          </div>
        )}
        {shown && failed && (
          <div className="absolute inset-x-0 bottom-1 text-center text-[11px] text-bad-soft" role="status">
            rendu indisponible — dernière image affichée
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/60">
        <span>Rendu réel {nativeW}×{nativeH} (2,13″)</span>
        {shown && (
          <a href={shown} target="_blank" rel="noreferrer" className="btn btn-sm">
            Ouvrir le PNG ↗
          </a>
        )}
      </div>
    </div>
  );
}
