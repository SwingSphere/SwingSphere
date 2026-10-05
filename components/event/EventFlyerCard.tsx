import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MediaAsset } from '../../lib/media/types';
import MediaImage from '../media/MediaImage';
import { Expand, ImagePlus, X } from 'lucide-react';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';

type EventFlyerCardProps = {
  eventName: string;
  flyerAsset?: MediaAsset | null;
  flyerUrl?: string | null;
  onQuickEdit?: () => void;
};

const EventFlyerCard: React.FC<EventFlyerCardProps> = ({ eventName, flyerAsset, flyerUrl, onQuickEdit }) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControl = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);
  const [isExpanded, setIsExpanded] = useState(false);
  const flyerButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      flyerButtonRef.current?.focus();
    };
  }, [isExpanded]);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      {showQuickControl ? <button type="button" onClick={onQuickEdit} className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/80 px-3 py-2 text-xs font-black text-white"><ImagePlus size={14} /> Replace flyer</button> : null}
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Official artwork</p>
        <h2 className="mt-1 text-base font-semibold text-gray-100">Event flyer</h2>
      </div>

      <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-black/35 p-2">
        {flyerAsset || flyerUrl ? (
          <button
            ref={flyerButtonRef}
            type="button"
            onClick={() => setIsExpanded(true)}
            className="group relative flex w-full cursor-zoom-in items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/80"
            aria-label={`Enlarge ${eventName} flyer`}
          >
            {flyerAsset ? <MediaImage
              asset={flyerAsset}
              variant="flyerpage"
              alt={flyerAsset.alt_text ?? `${eventName} flyer`}
              className="max-h-[680px] w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
            /> : <img src={flyerUrl ?? undefined} alt={`${eventName} flyer`} className="max-h-[680px] w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]" />}
            <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Expand size={14} /> Enlarge
            </span>
          </button>
        ) : (
          <div className="max-w-52 text-center">
            <div className="mx-auto flex aspect-[3/4] w-24 items-center justify-center rounded-xl border border-dashed border-gray-700 bg-white/[0.025] text-3xl text-gray-700">✦</div>
            <p className="mt-4 text-sm font-medium text-gray-400">No event flyer has been added yet.</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">Promoters can add vertical event artwork here.</p>
          </div>
        )}
      </div>

      {(flyerAsset || flyerUrl) && isExpanded && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-3 backdrop-blur-sm sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label={`${eventName} flyer viewer`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsExpanded(false);
              }}
            >
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setIsExpanded(false)}
                className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-xl backdrop-blur-md transition hover:border-red-400/60 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                aria-label="Close flyer viewer"
              >
                <X size={22} />
              </button>
              <div
                className="flex h-full w-full items-center justify-center overflow-auto overscroll-contain"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setIsExpanded(false);
                }}
              >
                {flyerAsset ? <MediaImage
                  asset={flyerAsset}
                  variant="flyerpage"
                  alt={flyerAsset.alt_text ?? `${eventName} flyer`}
                  className="h-auto max-h-[calc(100vh-3rem)] w-auto max-w-[calc(100vw-3rem)] select-none object-contain shadow-2xl"
                /> : <img src={flyerUrl ?? undefined} alt={`${eventName} flyer`} className="h-auto max-h-[calc(100vh-3rem)] w-auto max-w-[calc(100vw-3rem)] select-none object-contain shadow-2xl" />}
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
};

export default EventFlyerCard;
