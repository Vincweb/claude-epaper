import type { ClawdMotion } from './look.js';

/**
 * Couche idle de Clawd — une FONCTION PURE DU TEMPS, reprise de l'idée de
 * blobatar (github.com/Alain00/blobatar, `src/idle.ts`) : aucune boucle n'a de
 * départ ni d'arrêt, rien ne réagit à rien, donc aucun état à garder ni dérive
 * à corriger. Donnée une horloge, `idleFrame` dit à quoi ressemble Clawd ; la
 * dalle (1 img/s), les GIF (10 img/s) et le web live (60 img/s) échantillonnent
 * la MÊME timeline.
 *
 * Chaque piste donne UNE valeur clé par seconde : c'est exactement ce que voit
 * la dalle (118 px, N&B — déplacements en pixels entiers, pas de squash à 2 %
 * qui scintillerait en crispEdges). Le web passe PAR ces mêmes valeurs mais les
 * relie par des courbes : spline Catmull-Rom pour le corps (vitesse continue,
 * le mouvement coule), bascule rapide pour le regard (le « hold-and-flick » des
 * saccades de blobatar), paupière progressive, tremblement sinusoïdal. Aux
 * secondes entières, web et dalle sont identiques.
 *
 * Unités : pixels de la dalle (le carré mascotte fait 118 px). `clawd.ts`
 * convertit en unités de viewBox et arrondit au pixel pour le N&B.
 */

export interface IdleFrame {
  /** Saut du corps entier, jambes comprises (négatif = haut). */
  bob: number;
  /** Tassement : le corps descend sur ses jambes (≥ 0). */
  squash: number;
  /** Décalage horizontal du corps entier (dandinement, tremblement). */
  dx: number;
  /** Regard : translation des yeux. */
  lookX: number;
  lookY: number;
  /** Bras relevés (négatif = haut). */
  armL: number;
  armR: number;
  /** Paupière : 0 = ouverte, 1 = fermée (la dalle ne voit que 0 ou 1). */
  blink: number;
  /** Instant (s) : anime les accessoires en continu sur le web (Zzz qui montent…). */
  t: number;
  /** Seconde entière : anime les accessoires pas à pas sur la dalle. */
  step: number;
}

export const REST: IdleFrame = {
  bob: 0,
  squash: 0,
  dx: 0,
  lookX: 0,
  lookY: 0,
  armL: 0,
  armR: 0,
  blink: 0,
  t: 0,
  step: 0,
};

interface MotionDef {
  /** Longueur de boucle en secondes (= longueur des pistes). */
  loop: number;
  bob?: number[];
  squash?: number[];
  dx?: number[];
  /** Regard, tenu pendant chaque seconde puis basculé d'un coup (saccade). */
  look?: [number, number][];
  armL?: number[];
  armR?: number[];
  /** Secondes où Clawd cligne des yeux. */
  blink?: number[];
  /** Tremblement : ± amplitude (alterné chaque seconde sur la dalle, 5 Hz sur le web). */
  shake?: number;
}

const C: [number, number] = [0, 0];
const R: [number, number] = [2, 0];
const L: [number, number] = [-2, 0];

/** Les animations. Boucles courtes, diviseurs de 12 s, pour que le GIF boucle net. */
const MOTIONS: Record<ClawdMotion, MotionDef> = {
  // Respire (tassement 1 px toutes les 2 s), jette un œil à droite puis à gauche, cligne.
  idle: {
    loop: 12,
    squash: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    look: [C, C, C, C, R, R, C, C, C, L, L, C],
    blink: [2, 7],
  },
  // Sautille une seconde sur deux, bras en l'air au sommet.
  bounce: {
    loop: 4,
    bob: [0, -4, 0, -4],
    armL: [0, -3, 0, -3],
    armR: [0, -3, 0, -3],
    blink: [2],
  },
  // Se dandine de gauche à droite, un bras levé du côté où il penche.
  sway: {
    loop: 4,
    dx: [0, 2, 0, -2],
    look: [C, [1, 0], C, [-1, 0]],
    armL: [0, 0, 0, -3],
    armR: [0, -3, 0, 0],
  },
  // Regards inquiets d'un côté à l'autre, respiration courte.
  nervous: {
    loop: 4,
    squash: [0, 1, 0, 1],
    look: [L, L, R, R],
    blink: [3],
  },
  // Tremble sur place.
  shake: { loop: 2, shake: 1 },
  // Respiration lente et profonde (les Zzz s'animent à part, cf. clawd.ts).
  sleep: { loop: 4, squash: [0, 0, 1, 1] },
  none: { loop: 1 },
};

/** Durée d'une saccade (bascule du regard), juste avant la seconde suivante. */
const FLICK = 0.14;
/** Durée d'un clignement sur le web (la dalle le tient une image, soit 1 s). */
const BLINK = 0.24;
/** Tremblement web (Hz) : cos(2π·5·t) alterne pile ± à 10 img/s (GIF). */
const SHAKE_HZ = 5;

const mod = (a: number, n: number) => ((a % n) + n) % n;
const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** Piste du corps : spline Catmull-Rom cyclique. Elle PASSE par chaque valeur
 * clé aux secondes entières (la dalle les voit telles quelles) et les relie avec
 * une vitesse continue — le mouvement coule au lieu de marquer chaque pose. */
function smooth(values: number[] | undefined, t: number): number {
  if (!values?.length) return 0;
  const n = values.length;
  const i = Math.floor(t);
  const u = t - i;
  const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => values[mod(i + k, n)]);
  return (
    0.5 *
    (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u ** 2 + (3 * p1 - p0 - 3 * p2 + p3) * u ** 3)
  );
}

/** Regard : tenu toute la seconde, puis bascule rapide vers la valeur suivante. */
function flick(values: [number, number][] | undefined, t: number): [number, number] {
  if (!values?.length) return C;
  const i = Math.floor(t);
  const a = values[mod(i, values.length)];
  const b = values[mod(i + 1, values.length)];
  const u = (t - i - (1 - FLICK)) / FLICK;
  if (u <= 0) return a;
  const e = ease(Math.min(1, u));
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
}

export function motionLoop(motion: ClawdMotion | undefined): number {
  return MOTIONS[motion ?? 'idle'].loop;
}

/**
 * Image de la couche idle à l'instant `t` (secondes, n'importe quelle origine :
 * tout est périodique — le web passe `Date.now()/1000`, la dalle la seconde
 * epoch, donc les deux clignent en même temps). `dt` = durée d'une image : la
 * dalle (dt ≥ 0,5) tient un clignement une image entière et tremble d'un pixel
 * par seconde ; le web ferme la paupière progressivement et tremble à 5 Hz.
 */
export function idleFrame(motion: ClawdMotion | undefined, t: number, dt: number): IdleFrame {
  const def = MOTIONS[motion ?? 'idle'];
  const tl = mod(t, def.loop);
  const stepped = dt >= 0.5;
  const look = flick(def.look, tl);
  let blink = 0;
  for (const b of def.blink ?? []) {
    if (stepped) blink = Math.max(blink, tl >= b && tl < b + dt ? 1 : 0);
    else if (tl >= b && tl < b + BLINK) blink = Math.max(blink, Math.sin((Math.PI * (tl - b)) / BLINK));
  }
  let shake = 0;
  if (def.shake) {
    const parity = mod(Math.round(t / dt), 2) ? def.shake : -def.shake;
    shake = stepped ? parity : def.shake * Math.cos(2 * Math.PI * SHAKE_HZ * t);
  }
  return {
    bob: smooth(def.bob, tl),
    squash: smooth(def.squash, tl),
    dx: smooth(def.dx, tl) + shake,
    lookX: look[0],
    lookY: look[1],
    armL: smooth(def.armL, tl),
    armR: smooth(def.armR, tl),
    blink,
    t,
    step: Math.floor(t),
  };
}
