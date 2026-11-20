/**
 * App lancée depuis l'écran d'accueil (PWA « standalone ») plutôt que dans un
 * onglet de navigateur. iOS expose `navigator.standalone`, les autres la
 * media query `display-mode`.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * Réglages propres à la PWA, appliqués avant le premier rendu :
 *  - classe `pwa` sur <html> (variante Tailwind `pwa:`) ;
 *  - zoom bloqué (pincement, double-tap, zoom auto sur un champ) : une app
 *    installée ne doit pas « flotter ». Dans un navigateur, le zoom reste permis
 *    (accessibilité).
 */
export function setupPwa(): void {
  if (!isStandalone()) return;
  document.documentElement.classList.add('pwa');
  const vp = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (vp) vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  // iOS ignore parfois user-scalable=no : on bloque aussi le geste de pincement.
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
}
