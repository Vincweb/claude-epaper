import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

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
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Largeur max (classes Tailwind). */
  className?: string;
  z?: string;
  /** Actions, toujours visibles en bas (hors de la zone qui défile). */
  footer?: ReactNode;
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
    // Mobile : feuille qui monte du bas (pleine largeur, poignée) ; ordinateur : fenêtre centrée.
    <div
      className={`fixed inset-0 ${z} flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4`}
      onClick={() => close.current()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-panel shadow-2xl motion-safe:animate-[sheet-in_0.28s_cubic-bezier(.2,.9,.3,1)] sm:max-h-[90vh] sm:rounded-2xl sm:motion-safe:animate-none ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-semibold">
            {title}
          </h2>
          <button
            onClick={() => close.current()}
            aria-label="Fermer"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/70 hover:bg-white/12 hover:text-white"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 ${footer ? 'pb-4' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'}`}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-white/10 bg-panel px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
