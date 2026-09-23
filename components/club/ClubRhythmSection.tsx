import React from 'react';
import { Pencil } from 'lucide-react';
import type { DaySchedule } from '../../types';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';

type ClubRhythmSectionProps = {
  schedule: DaySchedule[];
  summary: string;
  specialScheduleNotes?: string;
  onQuickEdit?: () => void;
};

const ClubRhythmSection: React.FC<ClubRhythmSectionProps> = ({ schedule, summary, specialScheduleNotes, onQuickEdit }) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControl = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);
  const activeDays = schedule.filter((entry) => !entry.isClosed).slice(0, 7);

  return (
    <section className="relative rounded-2xl border border-gray-800 bg-gray-900/65 p-5 sm:p-6">
      {showQuickControl ? <button type="button" onClick={onQuickEdit} className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Edit schedule</button> : null}
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Plan your visit</p>
      <h2 className="mt-1 text-xl font-semibold text-gray-100">When to Go</h2>
      <p className="mt-2 text-sm text-gray-300">{summary}</p>
      {activeDays.length ? (
        <ul className="mt-4 space-y-2">
          {activeDays.map((entry) => (
            <li
              key={`${entry.day}-${entry.open ?? 'varies'}-${entry.close ?? 'varies'}`}
              className="ss-glass ss-glass--ambient flex items-center justify-between rounded-xl px-3 py-2 text-sm"
            >
              <span className="text-gray-200">{entry.day}</span>
              <span className="text-gray-400">
                {entry.open && entry.close ? `${entry.open} - ${entry.close}` : 'Hours vary'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {specialScheduleNotes ? (
        <p className="mt-4 text-sm leading-6 text-gray-400">{specialScheduleNotes}</p>
      ) : activeDays.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Contact the club for current schedule details before visiting.</p>
      ) : null}
    </section>
  );
};

export default ClubRhythmSection;
