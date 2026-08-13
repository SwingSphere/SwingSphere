import React from 'react';
import { Check } from 'lucide-react';
import {
  getFeedbackSignalPresentation,
  getFeedbackSignals,
  type FeedbackSignalPolarity,
  type FeedbackTargetType,
} from '../../lib/feedback';

type FeedbackSignalSelectorProps = {
  targetType: FeedbackTargetType;
  polarity: FeedbackSignalPolarity;
  selectedIds: string[];
  unavailableIds?: string[];
  onChange: (signalIds: string[]) => void;
};

const FeedbackSignalSelector: React.FC<FeedbackSignalSelectorProps> = ({
  targetType,
  polarity,
  selectedIds,
  unavailableIds = [],
  onChange,
}) => {
  const signals = getFeedbackSignals(targetType, polarity);
  const title = polarity === 'positive' ? 'What went well?' : 'What could have been better?';
  const helper = polarity === 'positive'
    ? 'Choose any details that stood out. This step can be skipped.'
    : 'Choose constructive areas for improvement. This step can be skipped.';

  const toggle = (signalId: string) => {
    if (selectedIds.includes(signalId)) {
      onChange(selectedIds.filter((id) => id !== signalId));
    } else {
      onChange([...selectedIds, signalId]);
    }
  };

  return (
    <fieldset>
      <legend className="text-lg font-bold text-white">{title}</legend>
      <p className="mt-1 text-sm leading-6 text-gray-400">{helper}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {signals.map((signal) => {
          const selected = selectedIds.includes(signal.id);
          const unavailable = unavailableIds.includes(signal.id) && !selected;
          const presentation = getFeedbackSignalPresentation(signal.id, polarity);
          if (!presentation) return null;
          const Icon = presentation.icon;

          return (
            <button
              key={signal.id}
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={presentation.fullLabel}
              disabled={unavailable}
              onClick={() => toggle(signal.id)}
              className={`ss-feedback-signal ss-feedback-signal--${polarity}`}
            >
              <span className="ss-feedback-signal__icon">
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="ss-feedback-signal__label">{presentation.shortLabel}</span>
              <span className="ss-feedback-signal__check" aria-hidden="true">
                <Check size={13} strokeWidth={2.4} />
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
};

export default FeedbackSignalSelector;
