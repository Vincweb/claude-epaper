import { useEffect, useRef } from 'react';
import { CLAWD_VIEWBOX, REST, clawdSvg, idleFrame, sanitizeLook, type IdleFrame } from '../lib/clawd';

/*
 * Clawd dessiné EN DIRECT dans le navigateur : le même `idleFrame` + `clawdSvg`
 * que le serveur (dalle, sprites), évalués à chaque image (~60 img/s) — vectoriel,
 * anti-aliasé, net à toute taille. Même horloge que la dalle (`Date.now()`) :
 * l'écran et l'e-paper clignent au même moment.
 */

/* Une seule boucle requestAnimationFrame pour tous les Clawd de la page (la
 * galerie en affiche une douzaine) ; elle s'arrête quand plus personne n'écoute,
 * et le navigateur la met en pause quand l'onglet est masqué. */
type Draw = (t: number) => void;
const listeners = new Set<Draw>();
let raf = 0;
function tick() {
  const t = Date.now() / 1000;
  listeners.forEach((draw) => draw(t));
  raf = listeners.size ? requestAnimationFrame(tick) : 0;
}
function subscribe(draw: Draw): () => void {
  listeners.add(draw);
  if (!raf) raf = requestAnimationFrame(tick);
  return () => void listeners.delete(draw);
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Portée du regard : au-delà (px écran), Clawd ne suit plus le pointeur. */
const GAZE_RADIUS = 420;
/** Amplitude max du regard qui suit le pointeur, en pixels de dalle. */
const GAZE_MAX = 2.5;

export function ClawdLive({
  look,
  size = 240,
  className,
  title = 'Clawd',
  gaze = false,
}: {
  /** Pièces du look (valeurs inconnues ignorées → défauts). */
  look: Partial<Record<'eyes' | 'mouth' | 'accessory' | 'overhead' | 'motion', string>>;
  size?: number;
  className?: string;
  title?: string;
  /** Les yeux suivent le pointeur quand il passe à proximité (façon blobatar). */
  gaze?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const clean = sanitizeLook(look);
  const sig = JSON.stringify(clean);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const l = sanitizeLook(JSON.parse(sig));
    let last = '';
    const paint = (f: IdleFrame) => {
      const markup = clawdSvg(l, false, f);
      if (markup !== last) {
        el.innerHTML = markup; // ne touche au DOM que si l'image a changé
        last = markup;
      }
    };
    if (prefersReducedMotion()) {
      paint(REST);
      return;
    }

    // Regard : cible calculée au mouvement du pointeur, suivie en douceur.
    let target: [number, number] | null = null;
    let weight = 0;
    let gx = 0;
    let gy = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.3); // les yeux sont en haut du corps
      const d = Math.hypot(dx, dy);
      target = d > GAZE_RADIUS ? null : [(dx / Math.max(d, 60)) * GAZE_MAX, (dy / Math.max(d, 60)) * GAZE_MAX];
    };
    const onLeave = () => (target = null);
    if (gaze) {
      window.addEventListener('pointermove', onMove);
      document.addEventListener('pointerleave', onLeave);
    }

    const unsubscribe = subscribe((t) => {
      const f = idleFrame(l.motion, t, 1 / 60);
      if (gaze) {
        weight += ((target ? 1 : 0) - weight) * 0.12;
        if (target) [gx, gy] = [gx + (target[0] - gx) * 0.2, gy + (target[1] - gy) * 0.2];
        f.lookX += (gx - f.lookX) * weight;
        f.lookY += (gy - f.lookY) * weight;
      }
      paint(f);
    });
    return () => {
      unsubscribe();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [sig, gaze]);

  return (
    <svg
      ref={ref}
      viewBox={CLAWD_VIEWBOX}
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
    />
  );
}
