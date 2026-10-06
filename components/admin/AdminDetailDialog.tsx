import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const AdminDetailDialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; tone?: 'light' | 'dark'; compact?: boolean }> = ({ title, onClose, children, tone = 'light', compact = false }) => {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter((node) => node.getClientRects().length > 0);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-950/60 p-2 sm:p-5" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`flex max-h-[92dvh] w-full min-w-0 flex-col overflow-hidden rounded-2xl shadow-2xl outline-none ${compact ? 'max-w-xl' : 'max-w-6xl'} ${tone === 'dark' ? 'border border-white/10 bg-[#14171c] text-gray-100' : 'bg-white text-gray-900'}`}>
        <header className={`flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4 ${tone === 'dark' ? 'border-white/10' : 'border-gray-200'}`}>
          <h2 id={titleId} className="min-w-0 break-words text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close details" className={`shrink-0 rounded-lg p-2 ${tone === 'dark' ? 'text-gray-400 hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100'}`}><X size={20} /></button>
        </header>
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-3 sm:p-5">{children}</div>
      </div>
    </div>, document.body,
  );
};
export default AdminDetailDialog;
