import React from 'react';
import type { MediaAsset } from '../../lib/media/types';
import MediaImage from '../media/MediaImage';
import { ImagePlus } from 'lucide-react';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';

type EventFlyerCardProps = {
  eventName: string;
  flyerAsset?: MediaAsset | null;
  onQuickEdit?: () => void;
};

const EventFlyerCard: React.FC<EventFlyerCardProps> = ({ eventName, flyerAsset, onQuickEdit }) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControl = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      {showQuickControl ? <button type="button" onClick={onQuickEdit} className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/80 px-3 py-2 text-xs font-black text-white"><ImagePlus size={14} /> Replace flyer</button> : null}
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Official artwork</p>
        <h2 className="mt-1 text-base font-semibold text-gray-100">Event flyer</h2>
      </div>

      <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-black/35 p-2">
        {flyerAsset ? (
          <MediaImage
            asset={flyerAsset}
            variant="flyerpage"
            alt={flyerAsset.alt_text ?? `${eventName} flyer`}
            className="max-h-[680px] w-full object-contain"
          />
        ) : (
          <div className="max-w-52 text-center">
            <div className="mx-auto flex aspect-[3/4] w-24 items-center justify-center rounded-xl border border-dashed border-gray-700 bg-white/[0.025] text-3xl text-gray-700">✦</div>
            <p className="mt-4 text-sm font-medium text-gray-400">No event flyer has been added yet.</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">Promoters can add vertical event artwork here.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default EventFlyerCard;
