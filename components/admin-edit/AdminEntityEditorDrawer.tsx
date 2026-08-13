import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useAdminEditMode } from './AdminEditModeContext';

type AdminEntityEditorDrawerProps = React.PropsWithChildren<{
  title: string;
  subtitle: string;
  eyebrow?: string;
  ariaLabel: string;
  onClose: () => void;
  maxWidthClassName?: string;
}>;

const AdminEntityEditorDrawer: React.FC<AdminEntityEditorDrawerProps> = ({
  title,
  subtitle,
  eyebrow = 'Admin page editor',
  ariaLabel,
  onClose,
  maxWidthClassName = 'max-w-[920px]',
  children,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const { markUnsaved } = useAdminEditMode();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1300] flex justify-end bg-black/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button type="button" tabIndex={-1} aria-label="Close editor" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section
        ref={panelRef}
        className={`relative z-10 h-full w-full ${maxWidthClassName} overflow-y-auto border-l border-white/10 bg-[#f6f7f9] text-gray-900 shadow-2xl`}
        onChangeCapture={markUnsaved}
      >
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-600">{eyebrow}</p>
            <h2 className="truncate text-lg font-black text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition hover:bg-gray-100 hover:text-gray-900" aria-label="Close editor">
            <X size={18} />
          </button>
        </header>
        <div className="p-4 sm:p-6">{children}</div>
      </section>
    </div>
  );
};

export default AdminEntityEditorDrawer;
