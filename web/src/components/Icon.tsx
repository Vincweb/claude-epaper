/*
 * Icônes au trait, sobres (24×24, trait 1,75, bouts arrondis), dessinées pour
 * l'app : elles prennent la couleur du texte (`currentColor`).
 */
const PATHS = {
  // Jauge : l'écran principal (limites 5 h / 7 j).
  gauge: (
    <>
      <path d="M4.2 17.5a9 9 0 1 1 15.6 0" />
      <path d="M12 13.5l3.5-3.5" />
      <circle cx="12" cy="14" r="1.2" />
    </>
  ),
  // Dalle e-paper : écran paysage avec contenu.
  epaper: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <rect x="6" y="9" width="4" height="4" rx="0.8" />
      <path d="M13 9.5h5M13 12.5h3.5M6 15.5h12" />
    </>
  ),
  // Humeurs : visage.
  mood: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5c.9 1.1 2.1 1.7 3.5 1.7s2.6-.6 3.5-1.7" />
      <path d="M9 9.75v.5M15 9.75v.5" />
    </>
  ),
  // Réglages : curseurs.
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  // Se déconnecter : porte + flèche sortante.
  logout: <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3M15.5 16l4-4-4-4M19.5 12H9" />,
  // Fermer.
  close: <path d="M6 6l12 12M18 6L6 18" />,
  // Dé (au hasard).
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M8.5 8.5h.01M15.5 15.5h.01M12 12h.01M15.5 8.5h.01M8.5 15.5h.01" strokeWidth={2.6} />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
