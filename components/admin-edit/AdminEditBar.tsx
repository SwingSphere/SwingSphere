import React, { useState } from 'react';
import { ChevronDown, Eye, ExternalLink, Pencil, Settings2, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { useAdminEditMode } from './AdminEditModeContext';

const ENTITY_ROUTE_PATTERN = /^\/(events|clubs|hosts|venues|resorts|cruises|users)\//;
const ADMIN_BAR_OPEN_KEY = 'swingsphere.adminBarOpen';

const readInitialOpenState = () => {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(ADMIN_BAR_OPEN_KEY) === 'true';
};

const AdminEditBar: React.FC = () => {
  const { currentUser } = useAppStore();
  const { mode, setMode, hasUnsavedChanges, openAdvancedEditor, publicPage } = useAdminEditMode();
  const [isOpen, setIsOpen] = useState(readInitialOpenState);
  const location = useLocation();
  const navigate = useNavigate();

  const isEntityPage = ENTITY_ROUTE_PATTERN.test(location.pathname);
  const canEditPage = Boolean(currentUser && publicPage?.canEdit);
  const supportsInlineQuickEdit = Boolean(publicPage?.supportsInlineQuickEdit);

  if (!canEditPage || !isEntityPage) return null;

  const modeLabel = mode === 'editing'
    ? 'Editing'
    : mode === 'visitor'
      ? 'Visitor preview'
      : 'Viewing';

  const toggleOpen = () => {
    setIsOpen((current) => {
      const next = !current;
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(ADMIN_BAR_OPEN_KEY, String(next));
      }
      return next;
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-4 right-4 z-[1200] inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-[#111217]/95 px-3 py-2.5 text-sm font-bold text-white shadow-2xl shadow-black/50 backdrop-blur-xl transition hover:bg-[#181a21] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-red-300"
        aria-label="Open admin page controls"
        aria-expanded="false"
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-red-200">
          <ShieldCheck size={17} />
          {hasUnsavedChanges ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-300 ring-2 ring-[#111217]" /> : null}
        </span>
        <span className="hidden sm:inline">Admin</span>
        <span className="text-xs font-medium text-gray-400">{modeLabel}</span>
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-4 right-4 z-[1200] w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-white/15 bg-[#111217]/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
      aria-label="Admin page controls"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-red-200">
            <ShieldCheck size={17} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-black uppercase tracking-[0.16em] text-white">Page editor</div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{modeLabel}</span>
              {hasUnsavedChanges ? <span className="font-semibold text-amber-300">Unsaved changes</span> : null}
            </div>
          </div>
        </div>

        {mode === 'editing' ? (
          <button
            type="button"
            onClick={() => setMode('viewing')}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-gray-100 transition hover:bg-white/[0.1]"
          >
            <Eye size={15} />
            Stop editing
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const enteredEditing = setMode('editing');
              if (enteredEditing && !supportsInlineQuickEdit) openAdvancedEditor();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/25"
          >
            <Pencil size={15} />
            Edit page
          </button>
        )}

        {mode === 'editing' ? (
          <button
            type="button"
            onClick={openAdvancedEditor}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-gray-100 transition hover:bg-white/[0.1]"
          >
            <Settings2 size={15} />
            Advanced
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            if (setMode('viewing')) navigate('/admin');
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-gray-100 transition hover:bg-white/[0.1]"
        >
          <ExternalLink size={15} />
          Open admin
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'visitor' ? 'viewing' : 'visitor')}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
        >
          <Eye size={15} />
          {mode === 'visitor' ? 'Exit preview' : 'View as visitor'}
        </button>

        <button
          type="button"
          onClick={toggleOpen}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-white/[0.07] hover:text-white"
          aria-label="Collapse admin page controls"
          aria-expanded="true"
        >
          <ChevronDown size={17} />
        </button>
      </div>

      {mode === 'editing' ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-gray-400">
          {supportsInlineQuickEdit
            ? `Quick edit is active for ${publicPage?.label ?? 'this page'}. Select highlighted page elements to edit them in context; use Advanced for the full editor.`
            : `The full editor is open for ${publicPage?.label ?? 'this page'}. Changes save to the same record used by the public page.`}
        </div>
      ) : null}
    </aside>
  );
};

export default AdminEditBar;
