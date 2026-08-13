import React from 'react';
import { MessageSquareQuote, Quote, ShieldCheck, Sparkles, Star, TrendingUp } from 'lucide-react';
import {
  hasPendingWrittenRevision,
  type FeedbackAggregate,
  type FeedbackApprovedWrittenExperience,
  type FeedbackSentiment,
  type FeedbackSubmission,
  type FeedbackTargetType,
} from '../../lib/feedback';
import FeedbackSignalChip from './FeedbackSignalChip';
import FeedbackStateNotice from './FeedbackStateNotice';
import MemberAttributionLink from '../profile/MemberAttributionLink';

const formatPercentage = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

const sentimentMeta: Record<FeedbackSentiment, { label: string; bar: string; text: string }> = {
  positive: { label: 'Positive', bar: 'bg-emerald-300', text: 'text-emerald-200' },
  mixed: { label: 'Mixed', bar: 'bg-amber-300', text: 'text-amber-200' },
  negative: { label: 'Negative', bar: 'bg-rose-300', text: 'text-rose-200' },
};

type FeedbackSummaryCardProps = {
  aggregate: FeedbackAggregate;
  targetType: Extract<FeedbackTargetType, 'event' | 'club'>;
  viewerSubmission?: FeedbackSubmission | null;
  approvedWritten?: FeedbackApprovedWrittenExperience[];
};

const FeedbackSummaryCard: React.FC<FeedbackSummaryCardProps> = ({
  aggregate,
  targetType,
  viewerSubmission,
  approvedWritten = [],
}) => {
  if (aggregate.status !== 'public_ready' || !aggregate.sentimentPercentages) return null;

  const responseCount = aggregate.eligibleResponseCount ?? 0;
  const praised = aggregate.mostPraisedSignals.slice(0, 5);
  const improvements = aggregate.mostCommonImprovementSignals.slice(0, 4);
  const isSingleEventResponse = targetType === 'event' && responseCount === 1;
  const isEarlyEventFeedback = targetType === 'event' && responseCount > 1 && responseCount < 5;
  const dominantSentiment = (Object.entries(aggregate.sentimentPercentages) as Array<[FeedbackSentiment, number]>)
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'mixed';
  const experienceNoun = targetType === 'event' ? 'guest review' : 'community review';

  const renderSignals = (
    title: string,
    signals: typeof praised,
    polarity: 'positive' | 'improvement',
    early = false,
  ) => (
    <div>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {signals.length ? signals.map((signal) => (
          <FeedbackSignalChip
            key={`${polarity}-${signal.signalId}`}
            signalId={signal.signalId}
            polarity={polarity}
            suffix={isSingleEventResponse ? undefined : early ? `Mentioned by ${signal.count}` : formatPercentage(signal.percentage)}
          />
        )) : <span className="text-sm text-zinc-500">No themes shared yet.</span>}
      </div>
    </div>
  );

  const pendingNotice = viewerSubmission && hasPendingWrittenRevision(viewerSubmission) ? (
    <div className="mb-4">
      <FeedbackStateNotice
        tone="success"
        title="Revision pending"
        description="Your published text remains visible while the new version is reviewed."
      />
    </div>
  ) : null;

  if (isSingleEventResponse || isEarlyEventFeedback) {
    return (
      <div>
        {pendingNotice}
        <div className="ss-feedback-card bg-[radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.11),transparent_18rem),linear-gradient(145deg,rgba(20,18,22,.82),rgba(6,7,10,.86))]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
                <MessageSquareQuote size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-200/80">
                  {isSingleEventResponse ? 'First guest review' : 'Early review signals'}
                </p>
                <h3 className="mt-2 font-serif text-2xl font-semibold leading-tight text-white sm:text-3xl">
                  {isSingleEventResponse ? 'One guest has shared a review' : `${responseCount} guests have shared reviews`}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  {isSingleEventResponse
                    ? 'This is one first-hand perspective, not a community consensus.'
                    : 'These early impressions are useful, but the picture may continue to change as more guests respond.'}
                </p>
              </div>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold ${sentimentMeta[dominantSentiment].text}`}>
              <Star size={14} className="fill-current" aria-hidden="true" /> {sentimentMeta[dominantSentiment].label} review signal
            </span>
          </div>

          {isEarlyEventFeedback ? (
            <div className="mt-6 grid grid-cols-3 gap-2 border-y border-white/[0.07] py-4">
              {(Object.keys(sentimentMeta) as FeedbackSentiment[]).map((sentiment) => (
                <div key={sentiment} className="text-center">
                  <p className={`text-xl font-black ${sentimentMeta[sentiment].text}`}>{formatPercentage(aggregate.sentimentPercentages![sentiment])}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{sentimentMeta[sentiment].label}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {renderSignals('What guests appreciated', praised.slice(0, 4), 'positive', true)}
            {renderSignals('What guests said could improve', improvements.slice(0, 3), 'improvement', true)}
          </div>

          {approvedWritten[0] ? (
            <blockquote className="mt-6 border-l-2 border-rose-300/45 pl-4 text-sm italic leading-6 text-zinc-300">
              “{approvedWritten[0].approvedText}”
              <footer className="mt-2 text-xs not-italic text-zinc-500">
                Reviewed by <MemberAttributionLink displayName={approvedWritten[0].authorDisplayName} handle={approvedWritten[0].authorHandle} />
              </footer>
            </blockquote>
          ) : null}
        </div>
      </div>
    );
  }

  const positivePercentage = aggregate.sentimentPercentages.positive;

  return (
    <div>
      {pendingNotice}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,.86fr)_minmax(0,1.14fr)]">
        <div className="ss-feedback-card ss-feedback-card--metric">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-200/80">
            <TrendingUp size={15} aria-hidden="true" /> Overall experience
          </p>
          <div className="mt-5 flex items-end gap-2 text-amber-100">
            <Star size={28} className="mb-2 fill-amber-300 text-amber-300" aria-hidden="true" />
            <span className="text-5xl font-black tabular-nums tracking-[-0.04em] sm:text-6xl">{formatPercentage(positivePercentage)}</span>
          </div>
          <p className="mt-1 text-base font-bold text-white">positive</p>
          <p className="mt-3 text-xs leading-5 text-zinc-400">
            Based on {responseCount || 'the threshold cohort'} eligible {experienceNoun}{responseCount === 1 ? '' : 's'}.
          </p>

          <div className="mt-6 space-y-4 border-t border-white/[0.07] pt-5">
            {(Object.keys(sentimentMeta) as FeedbackSentiment[]).map((sentiment) => {
              const value = aggregate.sentimentPercentages![sentiment];
              return (
                <div key={sentiment}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-zinc-300">{sentimentMeta[sentiment].label}</span>
                    <span className="tabular-nums text-zinc-400">{formatPercentage(value)}</span>
                  </div>
                  <div className="ss-feedback-bar"><span className={sentimentMeta[sentiment].bar} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="ss-feedback-card">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-rose-200/80">
              <Sparkles size={15} aria-hidden="true" /> Community themes
            </p>
            <div className="mt-5 space-y-6">
              {renderSignals('Most praised', praised, 'positive')}
              {renderSignals('Could improve', improvements, 'improvement')}
            </div>
            <p className="mt-5 flex items-start gap-2 border-t border-white/[0.07] pt-4 text-[11px] leading-5 text-zinc-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Safety-sensitive concerns are handled separately and never appear in these themes.
            </p>
          </div>
        </div>
      </div>

      {approvedWritten.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {approvedWritten.slice(0, 2).map((experience) => (
            <blockquote key={experience.submissionId} className="ss-feedback-card">
              <Quote size={20} className="text-rose-300/70" aria-hidden="true" />
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-zinc-300">{experience.approvedText}</p>
              <footer className="mt-4 text-xs text-zinc-500">
                Reviewed by <MemberAttributionLink displayName={experience.authorDisplayName} handle={experience.authorHandle} />
              </footer>
            </blockquote>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default FeedbackSummaryCard;
