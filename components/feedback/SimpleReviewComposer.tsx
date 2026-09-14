import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, LogIn, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { User } from '../../data/mockUsers';
import {
  FEEDBACK_REVIEW_TEXT_MAX_LENGTH,
  FEEDBACK_REVIEW_TEXT_MIN_LENGTH,
  type FeedbackDraft,
  type FeedbackSentiment,
  type FeedbackSubmission,
  type FeedbackTargetType,
} from '../../lib/feedback';

type SimpleReviewComposerProps = {
  targetType: Extract<FeedbackTargetType, 'club' | 'event'>;
  targetId: string;
  targetName: string;
  currentUser?: User | null;
  existingSubmission?: FeedbackSubmission | null;
  disabled?: boolean;
  disabledReason?: string;
  onSignIn: () => void;
  onSubmit: (draft: FeedbackDraft) => Promise<FeedbackSubmission>;
};

const recommendationFromSubmission = (submission?: FeedbackSubmission | null): FeedbackSentiment | undefined => (
  submission?.overallSentiment === 'positive' || submission?.overallSentiment === 'negative'
    ? submission.overallSentiment
    : undefined
);

const reviewTextFromSubmission = (submission?: FeedbackSubmission | null) => (
  submission?.writtenExperience.currentDraftText
  ?? submission?.writtenExperience.approvedText
  ?? ''
);

const SimpleReviewComposer: React.FC<SimpleReviewComposerProps> = ({
  targetType,
  targetId,
  targetName,
  currentUser,
  existingSubmission,
  disabled = false,
  disabledReason,
  onSignIn,
  onSubmit,
}) => {
  const [sentiment, setSentiment] = useState<FeedbackSentiment | undefined>(() => recommendationFromSubmission(existingSubmission));
  const [reviewText, setReviewText] = useState(() => reviewTextFromSubmission(existingSubmission));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [reactionPrompt, setReactionPrompt] = useState(false);

  useEffect(() => {
    setSentiment(recommendationFromSubmission(existingSubmission));
    setReviewText(reviewTextFromSubmission(existingSubmission));
    setError('');
    setSavedMessage('');
    setReactionPrompt(false);
  }, [existingSubmission?.id, existingSubmission?.overallSentiment, existingSubmission?.updatedAt]);

  const currentText = reviewTextFromSubmission(existingSubmission).trim();
  const currentSentiment = recommendationFromSubmission(existingSubmission);
  const writtenStatus = existingSubmission?.writtenExperience.moderationStatus;
  const writtenIsPending = writtenStatus === 'pending';
  const hasApprovedText = Boolean(existingSubmission?.writtenExperience.approvedText?.trim());
  const hasChanges = useMemo(() => (
    reviewText.trim() !== currentText || sentiment !== currentSentiment
  ), [currentSentiment, currentText, reviewText, sentiment]);

  const canAttemptSubmit = Boolean(
    currentUser
    && reviewText.trim().length >= FEEDBACK_REVIEW_TEXT_MIN_LENGTH
    && reviewText.length <= FEEDBACK_REVIEW_TEXT_MAX_LENGTH
    && !disabled
    && !isSubmitting
    && (!existingSubmission || hasChanges)
  );

  const submit = async () => {
    if (!currentUser || reviewText.trim().length < FEEDBACK_REVIEW_TEXT_MIN_LENGTH || disabled || isSubmitting) return;
    if (!sentiment) {
      setReactionPrompt(true);
      setError('');
      setSavedMessage('');
      return;
    }
    setIsSubmitting(true);
    setError('');
    setSavedMessage('');

    const draft: FeedbackDraft = {
      targetType,
      targetId,
      overallSentiment: sentiment,
      reviewText: reviewText.trim(),
      // Preserve any structured details previously supplied through the advanced
      // flow. The launch composer does not expose or erase them.
      positiveSignalIds: existingSubmission?.positiveSignalIds ?? [],
      improvementSignalIds: existingSubmission?.improvementSignalIds ?? [],
      relatedEventId: targetType === 'event' ? targetId : existingSubmission?.relatedEventId,
      relatedVenueId: existingSubmission?.relatedVenueId,
      visitDate: existingSubmission?.visitDate,
      experienceScope: targetType === 'event'
        ? 'single_event'
        : existingSubmission?.experienceScope ?? 'single_visit',
      attendanceCountRange: existingSubmission?.attendanceCountRange,
      attendanceVerification: existingSubmission?.attendanceVerification === 'platform_confirmed'
        ? 'self_reported'
        : existingSubmission?.attendanceVerification ?? 'self_reported',
    };

    try {
      await onSubmit(draft);
      setSavedMessage(existingSubmission
        ? 'Review update submitted for moderation.'
        : 'Review submitted for moderation.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Your review could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.09] bg-black/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-rose-300/25 hover:bg-white/[0.035] hover:text-white"
      >
        <LogIn size={16} aria-hidden="true" />
        Sign in to leave a review
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-xs font-black text-zinc-400">
          {currentUser.avatarUrl
            ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
            : currentUser.displayName.trim().charAt(0).toUpperCase() || 'S'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-white">{existingSubmission ? 'Update your review' : `Review ${targetName}`}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Add a quick reaction, then share as much or as little detail as you want.</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Overall reaction">
              <button
                type="button"
                aria-label="Thumbs up"
                aria-pressed={sentiment === 'positive'}
                onClick={() => { setSentiment('positive'); setReactionPrompt(false); }}
                disabled={disabled || isSubmitting}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  sentiment === 'positive'
                    ? 'border-emerald-300/30 bg-emerald-500/12 text-emerald-100'
                    : reactionPrompt
                      ? 'border-rose-300/45 bg-rose-500/10 text-rose-200 ring-2 ring-rose-500/20'
                      : 'border-white/[0.08] bg-white/[0.025] text-zinc-500 hover:border-white/15 hover:text-zinc-200'
                } disabled:cursor-not-allowed disabled:opacity-50`}
                title="Thumbs up"
              >
                <ThumbsUp size={15} className={sentiment === 'positive' ? 'fill-current' : ''} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Thumbs down"
                aria-pressed={sentiment === 'negative'}
                onClick={() => { setSentiment('negative'); setReactionPrompt(false); }}
                disabled={disabled || isSubmitting}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  sentiment === 'negative'
                    ? 'border-rose-300/30 bg-rose-500/12 text-rose-100'
                    : reactionPrompt
                      ? 'border-rose-300/45 bg-rose-500/10 text-rose-200 ring-2 ring-rose-500/20'
                      : 'border-white/[0.08] bg-white/[0.025] text-zinc-500 hover:border-white/15 hover:text-zinc-200'
                } disabled:cursor-not-allowed disabled:opacity-50`}
                title="Thumbs down"
              >
                <ThumbsDown size={15} className={sentiment === 'negative' ? 'fill-current' : ''} aria-hidden="true" />
              </button>
            </div>
          </div>

          <textarea
            value={reviewText}
            onChange={(event) => {
              setReviewText(event.target.value);
              setError('');
              setSavedMessage('');
            }}
            rows={5}
            minLength={FEEDBACK_REVIEW_TEXT_MIN_LENGTH}
            maxLength={FEEDBACK_REVIEW_TEXT_MAX_LENGTH}
            disabled={disabled || isSubmitting}
            placeholder="Tell future guests about your experience — the atmosphere, entry, hosts, music, spaces, or anything else that stood out."
            className="mt-3 w-full resize-y rounded-xl border border-white/[0.09] bg-black/30 px-3.5 py-3 text-sm leading-6 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-rose-300/35 focus:ring-2 focus:ring-rose-500/10 disabled:cursor-not-allowed disabled:opacity-55"
          />

          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5 text-[11px] leading-5">
              {error ? <span className="text-rose-200" role="alert">{error}</span> : null}
              {!error && savedMessage ? <span className="text-emerald-200">{savedMessage}</span> : null}
              {!error && !savedMessage && reactionPrompt ? <span className="text-rose-200">Choose thumbs up or thumbs down before posting your review.</span> : null}
              {!error && !savedMessage && !reactionPrompt && disabledReason ? <span className="text-zinc-500">{disabledReason}</span> : null}
              {!error && !savedMessage && !reactionPrompt && !disabledReason && writtenIsPending ? (
                <span className="text-amber-200">
                  {hasApprovedText
                    ? 'Revision pending moderation. Your previously approved review remains public until this version is approved.'
                    : 'Pending moderation. Your review will appear publicly after approval.'}
                </span>
              ) : null}
              {!error && !savedMessage && !reactionPrompt && !disabledReason && !writtenIsPending ? <span className="text-zinc-600">{reviewText.length}/{FEEDBACK_REVIEW_TEXT_MAX_LENGTH}</span> : null}
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canAttemptSubmit}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-end rounded-xl bg-rose-600 px-4 text-xs font-bold text-white shadow-[0_8px_22px_rgba(159,18,57,.16)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
              {isSubmitting
                ? 'Posting…'
                : existingSubmission && !hasChanges && writtenIsPending
                  ? 'Pending moderation'
                  : existingSubmission && !hasChanges
                    ? 'Review saved'
                    : existingSubmission
                      ? 'Update review'
                      : 'Post review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleReviewComposer;
