import React from 'react';
import type { DaySchedule } from '../../types';
import { ATTENDANCE_POLICY_OPTIONS } from '../../lib/listingTaxonomy';

type Props = {
  day: DaySchedule;
  onChange: (patch: Partial<DaySchedule>) => void;
  tone?: 'dark' | 'light';
};

const DayProgramFields: React.FC<Props> = ({ day, onChange, tone = 'dark' }) => {
  const fieldClass = tone === 'light'
    ? 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900'
    : 'mt-1 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white';
  const labelClass = tone === 'light' ? 'text-xs font-semibold text-gray-600' : 'text-xs font-semibold text-gray-400';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={tone === 'light' ? 'text-xs font-semibold text-gray-600' : 'text-xs font-semibold text-gray-400'}>
        Who can attend this day
        <select
          className={fieldClass}
          disabled={day.isClosed}
          value={day.attendancePolicy ?? ''}
          onChange={(event) => onChange({ attendancePolicy: event.target.value ? event.target.value as DaySchedule['attendancePolicy'] : undefined })}
        >
          <option value="">Not specified for this day</option>
          {ATTENDANCE_POLICY_OPTIONS.filter((option) => option.value !== 'varies_by_night').map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className={tone === 'light' ? 'text-xs font-semibold text-gray-600' : 'text-xs font-semibold text-gray-400'}>
        Theme or activity
        <input
          className={fieldClass}
          type="text"
          maxLength={100}
          disabled={day.isClosed}
          value={day.program ?? ''}
          onChange={(event) => onChange({ program: event.target.value })}
          placeholder="e.g. Kink night, workshop, massage class"
        />
      </label>
      <label className={labelClass}>
        Audience details
        <input className={fieldClass} type="text" maxLength={220} disabled={day.isClosed}
          value={day.audienceDetails ?? ''} onChange={(event) => onChange({ audienceDetails: event.target.value })}
          placeholder="e.g. Couples and single women; limited pre-approved single men" />
      </label>
      <label className={labelClass}>
        Approval or entry conditions
        <input className={fieldClass} type="text" maxLength={220} disabled={day.isClosed}
          value={day.entryConditions ?? ''} onChange={(event) => onChange({ entryConditions: event.target.value })}
          placeholder="e.g. Solo men need advance approval" />
      </label>
      <label className={labelClass}>
        Schedule type
        <select className={fieldClass} disabled={day.isClosed} value={day.occurrence ?? 'weekly'}
          onChange={(event) => onChange({ occurrence: event.target.value as DaySchedule['occurrence'] })}>
          <option value="weekly">Recurring club night</option>
          <option value="selected_events">Selected event dates</option>
        </select>
      </label>
    </div>
  );
};

export default DayProgramFields;
