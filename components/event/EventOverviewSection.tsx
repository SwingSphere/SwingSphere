import React from 'react';
import { Pencil } from 'lucide-react';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';

type EventOverviewSectionProps = {
  description?: string;
  onQuickEdit?: () => void;
};

const EventOverviewSection: React.FC<EventOverviewSectionProps> = ({ description, onQuickEdit }) => {
  const hasDescription = Boolean(description?.trim());
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControl = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/65 p-5 sm:p-6 lg:p-8">
      {showQuickControl ? <button type="button" onClick={onQuickEdit} className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Edit description</button> : null}
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">The experience</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">About the Event</h2>
      {hasDescription ? (
        <div className="mt-4 whitespace-pre-line text-[15px] leading-7 text-gray-300">{description}</div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">No event description has been added yet.</p>
      )}
    </section>
  );
};

export default EventOverviewSection;
