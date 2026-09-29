/* ------------------------------------------------------------------------- *
 * Grille de Clawd (module isomorphe), partagée par le corps (`clawd.ts`) et
 * les accessoires (`clawd-props.ts`). Grille des GIF officiels : corps 8×6
 * cellules, bras 2×2, 4 pattes 1×2 ; 1 cellule = 7 px de dalle.
 * ------------------------------------------------------------------------- */

/** Une cellule Clawd, en px de dalle. */
export const C = 7;
// Silhouette 12×8 cellules = 84×56 px, centrée en largeur, pieds à y = 96 :
// ~40 px au-dessus pour les chapeaux (même en plein saut), ~22 dessous (skate).
export const BX = 31;
export const BY = 40;

/** Points d'accroche des accessoires (px de dalle, Clawd au repos). */
export const ANCHORS = {
  cx: BX + 4 * C, // milieu du corps (59)
  top: BY, // haut de la tête (40)
  bottom: BY + 6 * C, // bas du corps (82)
  left: BX, // flanc gauche (31)
  right: BX + 8 * C, // flanc droit (87)
  armTop: BY + 2 * C, // haut des bras (54)
  armH: 2 * C, // hauteur des bras (14)
  handR: BX + 10 * C, // bout du bras droit (101)
  handL: BX - 2 * C, // bout du bras gauche (17)
  flagHand: { x: BX + 6 * C, y: BY - C }, // main levée (drapeau) : au-dessus de la tête
  ground: BY + 8 * C, // sol, sous les pattes (96)
} as const;
