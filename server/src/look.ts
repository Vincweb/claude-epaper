/**
 * Le « look » de Clawd — module ISOMORPHE (aucune dépendance Node) : importé
 * par le serveur (rendu e-paper, génération des sprites) ET par le web (rendu
 * vectoriel live). Ne rien importer ici qui ne tourne pas dans un navigateur.
 */

export type ClawdEyes = 'square' | 'wide' | 'happy' | 'sleep' | 'spiral' | 'wink' | 'shades' | 'cross';
export type ClawdMouth = 'none' | 'line' | 'open' | 'kiss';
export type ClawdAccessory = 'none' | 'laptop' | 'coffee' | 'ball' | 'wand' | 'heart' | 'skateboard';
export type ClawdOverhead = 'none' | 'party' | 'zzz' | 'sparkle-hat' | 'sun' | 'umbrella';
/** Animation idle de la pose (cf. idle.ts) — tourne en continu, sans pause. */
export type ClawdMotion = 'idle' | 'bounce' | 'sway' | 'nervous' | 'shake' | 'sleep' | 'none';

/** Le « look » d'une pose : les pièces qui composent son dessin et son animation.
 * Une pose = un jeu de canaux sur les mêmes pièces (façon blobatar), pas un dessin à part. */
export interface Look {
  eyes: ClawdEyes;
  mouth?: ClawdMouth;
  accessory?: ClawdAccessory;
  overhead?: ClawdOverhead;
  motion?: ClawdMotion;
}

export interface Pose extends Look {
  key: string;
  title: string;
}

/** Catalogue des pièces (libellés FR) — alimente l'éditeur de la galerie Humeurs. */
export const LOOK_PARTS = {
  eyes: {
    square: 'Carrés',
    wide: 'Grands ouverts',
    happy: 'Heureux',
    sleep: 'Fermés',
    wink: "Clin d'œil",
    spiral: 'Spirales',
    shades: 'Lunettes noires',
    cross: 'Croix',
  },
  mouth: { none: 'Aucune', line: 'Trait', open: 'Ouverte', kiss: 'Bisou' },
  accessory: {
    none: 'Aucun',
    laptop: 'Ordinateur',
    coffee: 'Café',
    ball: 'Ballon',
    wand: 'Baguette',
    heart: 'Cœur',
    skateboard: 'Skate',
  },
  overhead: {
    none: 'Rien',
    party: 'Chapeau de fête',
    'sparkle-hat': 'Chapeau magique',
    zzz: 'Zzz',
    sun: 'Soleil',
    umbrella: 'Parapluie',
  },
  motion: {
    idle: 'Respire',
    bounce: 'Sautille',
    sway: 'Se dandine',
    nervous: 'Nerveux',
    shake: 'Tremble',
    sleep: 'Somnole',
    none: 'Immobile',
  },
} as const satisfies {
  eyes: Record<ClawdEyes, string>;
  mouth: Record<ClawdMouth, string>;
  accessory: Record<ClawdAccessory, string>;
  overhead: Record<ClawdOverhead, string>;
  motion: Record<ClawdMotion, string>;
};

type LookPart = keyof typeof LOOK_PARTS;

const pick = <P extends LookPart>(part: P, v: unknown): keyof (typeof LOOK_PARTS)[P] | undefined =>
  typeof v === 'string' && Object.hasOwn(LOOK_PARTS[part], v) ? (v as keyof (typeof LOOK_PARTS)[P]) : undefined;

/** Valide un look reçu (API / fichier) : pièces inconnues ignorées, yeux carrés par défaut. */
export function sanitizeLook(raw: unknown): Look {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    eyes: pick('eyes', r.eyes) ?? 'square',
    mouth: pick('mouth', r.mouth) ?? 'none',
    accessory: pick('accessory', r.accessory) ?? 'none',
    overhead: pick('overhead', r.overhead) ?? 'none',
    motion: pick('motion', r.motion) ?? 'idle',
  };
}

/** Hash FNV-1a 32 bits → [0, 1). Trait adressé par clé (`nom:eyes`), comme blobatar :
 * ajouter un trait plus tard ne perturbe pas les autres. */
function trait(seed: string, key: string): number {
  let h = 0x811c9dc5;
  for (const c of `${seed.normalize('NFC').trim().toLowerCase()}:${key}`) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

function traitPick<P extends LookPart>(seed: string, part: P, pool: (keyof (typeof LOOK_PARTS)[P])[]) {
  return pool[Math.floor(trait(seed, part) * pool.length)];
}

/** Look DÉTERMINISTE tiré d'un nom (idée phare de blobatar) : une nouvelle humeur
 * « Café du matin » a toujours la même tête, sans rien configurer. Pools choisis
 * pour que toute combinaison reste lisible (pas de croix/dodo au hasard). */
export function lookFromName(name: string): Look {
  const withExtra = trait(name, 'extra');
  return {
    eyes: traitPick(name, 'eyes', ['square', 'square', 'happy', 'wide', 'wink', 'shades']),
    mouth: traitPick(name, 'mouth', ['none', 'none', 'line', 'open', 'kiss']),
    // Un seul extra la plupart du temps (accessoire OU chapeau) : silhouette lisible.
    accessory:
      withExtra < 0.5 ? traitPick(name, 'accessory', ['laptop', 'coffee', 'ball', 'wand', 'heart', 'skateboard']) : 'none',
    overhead: withExtra >= 0.5 && withExtra < 0.85 ? traitPick(name, 'overhead', ['party', 'sparkle-hat', 'sun', 'umbrella']) : 'none',
    motion: traitPick(name, 'motion', ['idle', 'idle', 'bounce', 'sway', 'nervous']),
  };
}
