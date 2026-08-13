import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { EventData } from '../../types';
import { useAppStore } from '../../store/appStore';
import { useEventFeedback } from '../../hooks/useEventFeedback';
import { useMemberHubDemoContent } from '../../hooks/useMemberHubDemoContent';
import {
  createDemoFeedbackSubmission,
  hasPendingWrittenRevision,
  registerApprovedListingFeedbackTarget,
  type FeedbackDraft,
  type FeedbackSafetyReportReceipt,
  type FeedbackSubmission,
} from '../../lib/feedback';
import { ADVANCED_REVIEW_FLOW_ENABLED } from '../../lib/feedback/reviewExperienceConfig';
import FeedbackDialog from './FeedbackDialog';
import FeedbackEntryButton from './FeedbackEntryButton';
import FeedbackExperienceShell from './FeedbackExperienceShell';
import FeedbackStateNotice from './FeedbackStateNotice';
import FeedbackSummaryCard from './FeedbackSummaryCard';
import FeedbackThresholdState from './FeedbackThresholdState';
import ListingCommunityActivity from './ListingCommunityActivity';
import SimpleReviewComposer from './SimpleReviewComposer';

const EventFeedbackSection: React.FC<{ event: EventData }> = ({ event }) => {
  const navigate = useNavigate();
  const { currentUser, isAuthLoading, addToast } = useAppStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const repairAttemptedRef = useRef(false);
  const demoFallbackRef = useRef(false);
  const feedback = useEventFeedback({ sourceEventId: event.id, eventEndAt: event.time.end, currentUserId: currentUser?.id, isAuthLoading });
  const demo = useMemberHubDemoContent(currentUser);

  useEffect(() => {
    if (
      feedback.targetState !== 'unavailable'
      || currentUser?.status !== 'Active'
      || currentUser.role !== 'Admin'
      || event.status !== 'approved'
      || repairAttemptedRef.current
    ) return;

    repairAttemptedRef.current = true;
    void registerApprovedListingFeedbackTarget(event)
      .then(() => feedback.refresh())
      .catch((error) => {
        console.error(`Unable to repair feedback target for event ${event.id}:`, error);
      });
  }, [currentUser?.role, currentUser?.status, event, feedback.refresh, feedback.targetState]);
  const eventEndAt = new Date(event.time.end);
  const hasEnded = Number.isFinite(eventEndAt.getTime()) && Date.now() >= eventEndAt.getTime();
  const isWithdrawn = feedback.existingSubmission?.structuredStatus === 'withdrawn';

  const openEntry = () => {
    if (!currentUser) {
      addToast({ type: 'info', message: 'Sign in to share your experience.' });
      navigate('/login');
      return;
    }
    if (feedback.targetState === 'ready' && feedback.privateState === 'ready' && !isWithdrawn) setIsDialogOpen(true);
  };

  const handleSubmitted = (result: FeedbackSubmission | FeedbackSafetyReportReceipt, kind: 'feedback' | 'private_concern') => {
    const usedDemoFallback = demoFallbackRef.current;
    demoFallbackRef.current = false;
    setIsDialogOpen(false);
    addToast({
      type: 'success',
      message: usedDemoFallback
        ? 'Demo review saved locally and added to this event page. The production review backend is still unavailable.'
        : kind === 'private_concern'
          ? feedback.repositoryMode === 'mock'
            ? 'Saved in development mode. No report was sent.'
            : 'Your private concern was submitted to SwingSphere.'
          : 'Review saved. Written review text will appear after moderation.',
    });
  };

  const submitFeedback = async (draft: FeedbackDraft): Promise<FeedbackSubmission> => {
    try {
      demoFallbackRef.current = false;
      return await feedback.submitFeedback(draft);
    } catch (error) {
      if (!demo.isEligible || !currentUser) throw error;
      demoFallbackRef.current = true;
      if (draft.reviewText?.trim()) {
        demo.addReview({
          targetType: 'event',
          targetId: event.id,
          targetName: event.name,
          body: draft.reviewText,
          sentiment: draft.overallSentiment ?? 'mixed',
        });
      }
      return createDemoFeedbackSubmission({
        authorUserId: currentUser.id,
        targetType: 'event',
        targetId: feedback.target?.feedbackTargetId ?? event.id,
        draft,
      });
    }
  };

  const handleWithdrawn = () => {
    setIsDialogOpen(false);
    addToast({ type: 'success', message: 'Review withdrawn. It no longer contributes to community results.' });
  };

  const canShowEntry = hasEnded && !isAuthLoading && feedback.targetState === 'ready';
  const entryAction = ADVANCED_REVIEW_FLOW_ENABLED && canShowEntry ? (
    <FeedbackEntryButton
      label={currentUser ? isWithdrawn ? 'Review withdrawn' : feedback.existingSubmission ? 'Update your experience' : 'Share your experience' : 'Sign in to share your experience'}
      onClick={openEntry}
      requiresSignIn={!currentUser}
      disabled={Boolean(currentUser && (isWithdrawn || feedback.privateState !== 'ready' || feedback.mutationState !== 'idle'))}
      disabledReason={isWithdrawn ? 'A withdrawn review cannot be replaced yet.' : feedback.privateState === 'loading' ? 'Loading your review…' : feedback.privateState === 'error' ? 'Your review state is unavailable.' : undefined}
    />
  ) : undefined;

  const renderFeedbackBody = () => {
    if (!hasEnded) {
      return (
        <FeedbackStateNotice
          title="Feedback opens after this event"
          description={`Scheduled to close ${eventEndAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`}
        />
      );
    }
    if (feedback.targetState === 'resolving') return <FeedbackStateNotice tone="loading" title="Checking review availability" description="Confirming that this event is ready for guest reviews." />;
    if (feedback.targetState === 'unavailable') return <FeedbackStateNotice title="Guest reviews are not available yet" description="This event does not currently have an active review target." />;
    if (feedback.targetState === 'error') {
      return (
        <FeedbackStateNotice
          tone="error"
          title="Guest reviews are temporarily unavailable"
          description={feedback.error?.message}
          action={<button type="button" onClick={feedback.refresh} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-rose-300/20 px-3 text-xs font-bold text-rose-200 hover:bg-rose-300/10"><RotateCcw size={14} /> Retry</button>}
        />
      );
    }
    if (!ADVANCED_REVIEW_FLOW_ENABLED) return null;
    if (feedback.aggregateState === 'loading' || !feedback.aggregate) return <FeedbackStateNotice tone="loading" title="Loading guest reviews" description="Gathering reviews and community signals." />;
    if (feedback.aggregateState === 'error') return <FeedbackStateNotice tone="error" title="The community picture is temporarily unavailable" description={feedback.error?.message} />;

    return feedback.aggregate.status === 'public_ready'
      ? <FeedbackSummaryCard aggregate={feedback.aggregate} targetType="event" viewerSubmission={feedback.existingSubmission} approvedWritten={[]} />
      : <FeedbackThresholdState aggregate={feedback.aggregate} targetType="event" targetName={event.name} action={entryAction} />;
  };

  const submissionNotice = !ADVANCED_REVIEW_FLOW_ENABLED ? null : feedback.privateState === 'error' ? (
    <div className="mt-4"><FeedbackStateNotice tone="error" title="Your review could not be loaded" description="Updates are disabled until it becomes available." /></div>
  ) : feedback.existingSubmission ? (
    <div className="mt-4">
      <FeedbackStateNotice
        tone={isWithdrawn ? 'withdrawn' : 'success'}
        title={isWithdrawn ? 'Review withdrawn' : hasPendingWrittenRevision(feedback.existingSubmission) ? 'Revision pending' : 'Your review is saved'}
        description={isWithdrawn
          ? 'It no longer contributes to aggregate results or public written experiences. Withdrawal is terminal.'
          : hasPendingWrittenRevision(feedback.existingSubmission)
            ? 'Your currently published text remains visible while the new version is reviewed.'
            : feedback.existingSubmission.writtenExperience.moderationStatus === 'pending'
              ? 'Your review signals are active. Written context is awaiting moderation.'
              : 'You can return to update your review.'}
      />
    </div>
  ) : null;

  return (
    <FeedbackExperienceShell
      targetType="event"
      labelledBy={`event-feedback-${event.id}`}
      action={feedback.aggregate?.status === 'public_ready' ? entryAction : undefined}
    >
      {renderFeedbackBody()}
      {!ADVANCED_REVIEW_FLOW_ENABLED && canShowEntry ? (
        <SimpleReviewComposer
          targetType="event"
          targetId={feedback.target?.feedbackTargetId ?? event.id}
          targetName={event.name}
          currentUser={currentUser}
          existingSubmission={feedback.existingSubmission}
          disabled={Boolean(currentUser && (isWithdrawn || feedback.privateState !== 'ready' || feedback.mutationState !== 'idle'))}
          disabledReason={isWithdrawn
            ? 'This review was withdrawn.'
            : feedback.privateState === 'loading'
              ? 'Loading your review…'
              : feedback.privateState === 'error'
                ? 'Your review state is temporarily unavailable.'
                : undefined}
          onSignIn={openEntry}
          onSubmit={async (draft) => {
            const result = await submitFeedback(draft);
            handleSubmitted(result, 'feedback');
            return result;
          }}
        />
      ) : null}
      {submissionNotice}
      <ListingCommunityActivity
        targetType="event"
        targetId={event.id}
        approvedWritten={feedback.approvedWritten}
      />

      {ADVANCED_REVIEW_FLOW_ENABLED && currentUser && feedback.target ? (
        <FeedbackDialog
          isOpen={isDialogOpen}
          targetType="event"
          targetId={feedback.target.feedbackTargetId}
          targetName={event.name}
          repositoryMode={feedback.repositoryMode}
          existingSubmission={feedback.existingSubmission}
          onClose={() => setIsDialogOpen(false)}
          onSubmitFeedback={submitFeedback}
          onSubmitSafetyConcern={(categoryId, narrative) => feedback.submitSafetyConcern({ categoryId, narrative })}
          onWithdrawFeedback={feedback.withdrawFeedback}
          onSubmitted={handleSubmitted}
          onWithdrawn={handleWithdrawn}
        />
      ) : null}
    </FeedbackExperienceShell>
  );
};

export default EventFeedbackSection;
