import { useEffect, useRef, useState } from 'react';
import { CLAWD_VIEWBOX, REST, clawdSvg, idleFrame, sanitizeLook, type IdleFrame } from '../lib/clawd';

/*
 * Clawd dessiné EN DIRECT dans le navigateur : le même `idleFrame` + `clawdSvg`
 * que le serveur (dalle, sprites), évalués à chaque image (~60 img/s) — pixel
 * art vectoriel, net à toute taille. Même horloge que la dalle (`Date.now()`) :
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

const REDUCED = '(prefers-reduced-motion: reduce)';

/** Suit le réglage système « réduire les animations » (changeable à chaud). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCED);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Le Clawd est-il à l'écran ? (la galerie en affiche une douzaine, souvent hors champ) */
function useOnScreen(ref: React.RefObject<Element | null>): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

/*
 * Arrondi de l'image côté WEB uniquement (la dalle et ses sprites ne passent
 * pas par ici) : 0,25 unité ≈ ½ pixel écran à 240 px. Sans lui, le SVG change
 * à presque chaque image (≈ 430 réécritures innerHTML sur 600 en « idle ») ;
 * avec, ≈ 50 — même rendu à l'œil, beaucoup moins de travail pour le navigateur.
 */
const q = (v: number, step: number) => Math.round(v / step) * step;
function quantize(f: IdleFrame): IdleFrame {
  return {
    ...f,
    bob: q(f.bob, 0.25),
    squash: q(f.squash, 0.25),
    dx: q(f.dx, 0.25),
    lookX: q(f.lookX, 0.25),
    lookY: q(f.lookY, 0.25),
    armL: q(f.armL, 0.25),
    armR: q(f.armR, 0.25),
    blink: q(f.blink, 0.1),
    t: q(f.t, 1 / 30), // accessoires animés (Zzz, notes…) : 30 img/s suffisent
  };
}

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
  const reduced = useReducedMotion();
  const onScreen = useOnScreen(ref);

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
    if (reduced || !onScreen) {
      // Immobile (réglage système) ou hors écran : une image fixe, pas de boucle.
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
      paint(quantize(f));
    });
    return () => {
      unsubscribe();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [sig, gaze, reduced, onScreen]);

  return (
    <svg
      ref={ref}
      viewBox={CLAWD_VIEWBOX}
      // Pixel art : bords nets, et pas de joints d'anti-aliasing entre cellules voisines.
      shapeRendering="crispEdges"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
    />
  );
}
