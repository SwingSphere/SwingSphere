import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import {
  feedbackRepositoryMode,
  feedbackService,
  resolveClubFeedbackTarget,
  resolveEventFeedbackTarget,
  type FeedbackAggregate,
  type FeedbackTargetType,
} from '../../lib/feedback';

type PublicFeedbackHeroBadgeProps = {
  targetType: Extract<FeedbackTargetType, 'event' | 'club'>;
  sourceId: string;
  onClick?: () => void;
};

const PublicFeedbackHeroBadge: React.FC<PublicFeedbackHeroBadgeProps> = ({ targetType, sourceId, onClick }) => {
  const [aggregate, setAggregate] = useState<FeedbackAggregate | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const target = targetType === 'event'
          ? await resolveEventFeedbackTarget(sourceId, feedbackRepositoryMode)
          : await resolveClubFeedbackTarget(sourceId, feedbackRepositoryMode);
        const result = await feedbackService.getAggregate(targetType, target.feedbackTargetId);
        if (active) setAggregate(result);
      } catch {
        if (active) setAggregate(null);
      }
    };
    void load();
    return () => { active = false; };
  }, [sourceId, targetType]);

  if (!aggregate || aggregate.status !== 'public_ready' || !aggregate.sentimentPercentages) return null;

  const positive = aggregate.sentimentPercentages.positive;
  const responseCount = aggregate.eligibleResponseCount ?? 0;
  const label = targetType === 'event' && responseCount === 1
    ? '1 guest review'
    : targetType === 'event' && responseCount < 5
      ? 'Early guest reviews'
      : `${Number.isInteger(positive) ? positive : positive.toFixed(1)}% positive`;
  const detail = targetType === 'event' && responseCount === 1
    ? 'First-hand review'
    : `${responseCount} ${targetType === 'event' ? 'guest' : 'community'} review${responseCount === 1 ? '' : 's'}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="ss-feedback-hero-badge ss-glass--interactive absolute right-3 top-3 z-30 max-w-[calc(100%-7rem)] text-left sm:right-6 sm:top-6"
      aria-label={`${label}. ${detail}. View guest reviews.`}
    >
      <span className="ss-feedback-hero-badge__spark" aria-hidden="true" />
      <span className="flex items-center gap-2 text-xs font-black text-amber-100 sm:text-sm">
        <Star size={17} className="fill-amber-300 text-amber-300" aria-hidden="true" />
        {label}
      </span>
      <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100/60 sm:text-[10px]">
        {detail}
      </span>
    </button>
  );
};

export default PublicFeedbackHeroBadge;
