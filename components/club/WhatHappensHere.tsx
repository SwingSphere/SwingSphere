import React from 'react';
import { Pencil } from 'lucide-react';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';

type WhatHappensHereProps = {
  description?: string;
  onQuickEdit?: () => void;
};

const WhatHappensHere: React.FC<WhatHappensHereProps> = ({ description, onQuickEdit }) => {
  const text = description?.trim();
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControl = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);
  return (
    <section className="relative rounded-2xl border border-gray-800 bg-gray-900/65 p-5 sm:p-6">
      {showQuickControl ? <button type="button" onClick={onQuickEdit} className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Edit description</button> : null}
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">The experience</p>
      <h2 className="mt-1 text-2xl font-bold text-gray-100">About the Club</h2>
      {text ? (
        <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-gray-300">{text}</p>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          A fuller introduction to the club’s atmosphere and experience has not been added yet.
        </p>
      )}
    </section>
  );
};

export default WhatHappensHere;
