import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Fenêtre modale accessible : `role="dialog"`, fermeture par Échap ou clic sur
 * le fond, focus placé dans la fenêtre puis rendu à l'élément d'origine, et
 * Tab qui reste à l'intérieur.
 */
export function Modal({
  title,
  onClose,
  children,
  className = 'max-w-md',
  z = 'z-30',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Largeur max (classes Tailwind). */
  className?: string;
  z?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Toujours la dernière version de onClose, sans relancer l'effet.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const focusables = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (focusables()[0] ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className={`fixed inset-0 ${z} flex items-center justify-center bg-black/60 p-4`} onClick={() => close.current()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-panel p-6 shadow-2xl ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button onClick={() => close.current()} aria-label="Fermer" className="rounded px-1 text-white/55 hover:text-white">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
