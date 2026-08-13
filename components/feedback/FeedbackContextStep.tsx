import React from 'react';
import type {
  FeedbackAttendanceCountRange,
  FeedbackExperienceScope,
  FeedbackTargetType,
} from '../../lib/feedback';

type FeedbackContextStepProps = {
  targetType: FeedbackTargetType;
  visitDate?: string;
  experienceScope?: FeedbackExperienceScope;
  relatedEventId?: string;
  attendanceCountRange?: FeedbackAttendanceCountRange;
  onVisitDateChange: (value: string) => void;
  onExperienceScopeChange: (value: FeedbackExperienceScope) => void;
  onRelatedEventIdChange: (value: string) => void;
  onAttendanceCountRangeChange: (value: FeedbackAttendanceCountRange) => void;
};

const FeedbackContextStep: React.FC<FeedbackContextStepProps> = ({
  targetType,
  visitDate,
  experienceScope,
  relatedEventId,
  attendanceCountRange,
  onVisitDateChange,
  onExperienceScopeChange,
  onRelatedEventIdChange,
  onAttendanceCountRangeChange,
}) => {
  if (targetType === 'event') {
    return <p className="text-sm text-gray-400">This feedback is connected to this specific event occurrence.</p>;
  }

  if (targetType === 'club') {
    return (
      <label className="block text-sm font-semibold text-gray-200">
        Visit date
        <input
          type="date"
          required
          value={visitDate ?? ''}
          onChange={(event) => onVisitDateChange(event.target.value)}
          className="ss-form-control mt-2 w-full"
        />
      </label>
    );
  }

  const scopeOptions: Array<{ id: FeedbackExperienceScope; label: string }> = [
    { id: 'communication_only', label: 'Communication only' },
    { id: 'single_event', label: 'One event' },
    { id: 'multiple_events', label: 'Multiple events' },
  ];

  return (
    <div>
      <p className="text-sm font-semibold text-gray-200">What is this feedback based on?</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {scopeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={experienceScope === option.id}
            onClick={() => onExperienceScopeChange(option.id)}
            className={`ss-glass ss-glass--ambient ss-glass--interactive min-h-12 rounded-xl px-3 text-sm font-semibold ${experienceScope === option.id ? 'ring-1 ring-red-400/80 text-white' : 'text-gray-300'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {experienceScope === 'single_event' ? (
        <label className="mt-4 block text-sm font-semibold text-gray-200">
          Related event ID
          <input value={relatedEventId ?? ''} onChange={(event) => onRelatedEventIdChange(event.target.value)} className="ss-form-control mt-2 w-full" />
        </label>
      ) : null}
      {experienceScope === 'multiple_events' ? (
        <label className="mt-4 block text-sm font-semibold text-gray-200">
          How many events informed this feedback?
          <select value={attendanceCountRange ?? ''} onChange={(event) => onAttendanceCountRangeChange(event.target.value as FeedbackAttendanceCountRange)} className="ss-form-control mt-2 w-full">
            <option value="" disabled>Choose a range</option>
            <option value="two_to_four">Two to four</option>
            <option value="five_plus">Five or more</option>
          </select>
        </label>
      ) : null}
    </div>
  );
};

export default FeedbackContextStep;
