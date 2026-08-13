import React from 'react';
import {
  getFeedbackSignalPresentation,
  type FeedbackSignalPolarity,
} from '../../lib/feedback';

type FeedbackSignalChipProps = {
  signalId: string;
  polarity?: FeedbackSignalPolarity;
  suffix?: string;
  interactive?: boolean;
};

const FeedbackSignalChip: React.FC<FeedbackSignalChipProps> = ({
  signalId,
  polarity = 'positive',
  suffix,
  interactive = false,
}) => {
  const presentation = getFeedbackSignalPresentation(signalId, polarity);
  if (!presentation) return null;
  const Icon = presentation.icon;

  return (
    <span
      className={`ss-feedback-chip ss-feedback-chip--${polarity}${interactive ? ' ss-feedback-chip--interactive' : ''}`}
      title={presentation.fullLabel}
    >
      <Icon size={15} aria-hidden="true" />
      <span aria-hidden="true">{presentation.shortLabel}</span>
      <span className="sr-only">{presentation.fullLabel}</span>
      {suffix ? <span className="ss-feedback-chip__suffix">{suffix}</span> : null}
    </span>
  );
};

export default FeedbackSignalChip;
