import React from 'react';
import type { FeedbackAggregate, FeedbackTargetType } from '../../lib/feedback';
import FeedbackInvitationPanel from './FeedbackInvitationPanel';

type FeedbackThresholdStateProps = {
  aggregate: FeedbackAggregate;
  targetType: Extract<FeedbackTargetType, 'event' | 'club'>;
  targetName: string;
  action?: React.ReactNode;
};

const FeedbackThresholdState: React.FC<FeedbackThresholdStateProps> = ({
  aggregate,
  targetType,
  targetName,
  action,
}) => (
  <FeedbackInvitationPanel
    aggregate={aggregate}
    targetType={targetType}
    targetName={targetName}
    action={action}
  />
);

export default FeedbackThresholdState;
