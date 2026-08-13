import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCircle2, LockKeyhole, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import {
  FEEDBACK_REVIEW_TEXT_MAX_LENGTH,
  FEEDBACK_REVIEW_TEXT_MIN_LENGTH,
  FeedbackSubmissionValidationError,
  type FeedbackDraft,
  type FeedbackRepositoryMode,
  type FeedbackSafetyReportReceipt,
  type FeedbackSubmission,
  type FeedbackTargetType,
} from '../../lib/feedback';
import FeedbackSignalSelector from './FeedbackSignalSelector';
import { useAppStore } from '../../store/appStore';

type FeedbackDialogProps = {
  isOpen: boolean;
  targetType: FeedbackTargetType;
  targetId: string;
  targetName: string;
  repositoryMode: FeedbackRepositoryMode;
  existingSubmission?: FeedbackSubmission | null;
  onClose: () => void;
  onSubmitFeedback: (draft: FeedbackDraft) => Promise<FeedbackSubmission>;
  onSubmitSafetyConcern: (categoryId: string, narrative: string) => Promise<FeedbackSafetyReportReceipt>;
  onWithdrawFeedback: () => Promise<FeedbackSubmission>;
  onSubmitted: (result: FeedbackSubmission | FeedbackSafetyReportReceipt, kind: 'feedback' | 'private_concern') => void;
  onWithdrawn: (submission: FeedbackSubmission) => void;
};

type DialogStage = 'review' | 'thanks' | 'details';

const createDraft = (
  targetType: FeedbackTargetType,
  targetId: string,
  existing?: FeedbackSubmission | null,
): FeedbackDraft => ({
  targetType,
  targetId,
  overallSentiment: existing?.overallSentiment === 'mixed' ? undefined : existing?.overallSentiment,
  positiveSignalIds: existing?.positiveSignalIds ?? [],
  improvementSignalIds: existing?.improvementSignalIds ?? [],
  reviewText: existing?.writtenExperience.currentDraftText ?? existing?.writtenExperience.approvedText ?? '',
  relatedEventId: existing?.relatedEventId,
  visitDate: existing?.visitDate,
  experienceScope: existing?.experienceScope,
  attendanceCountRange: existing?.attendanceCountRange,
  attendanceVerification: existing?.attendanceVerification === 'platform_confirmed' ? 'self_reported' : existing?.attendanceVerification,
});

const FeedbackDialog: React.FC<FeedbackDialogProps> = ({
  isOpen,
  targetType,
  targetId,
  targetName,
  existingSubmission,
  onClose,
  onSubmitFeedback,
  onWithdrawFeedback,
  onSubmitted,
  onWithdrawn,
}) => {
  const { currentUser } = useAppStore();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [stage, setStage] = useState<DialogStage>('review');
  const [draft, setDraft] = useState<FeedbackDraft>(() => createDraft(targetType, targetId, existingSubmission));
  const [savedSubmission, setSavedSubmission] = useState<FeedbackSubmission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setStage('review');
    setDraft(createDraft(targetType, targetId, existingSubmission));
    setSavedSubmission(null);
    setErrors([]);
    setIsSubmitting(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [existingSubmission, isOpen, targetId, targetType]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const canSubmitReview = Boolean(
    (draft.overallSentiment === 'positive' || draft.overallSentiment === 'negative')
    && (draft.reviewText?.trim().length ?? 0) >= FEEDBACK_REVIEW_TEXT_MIN_LENGTH,
  );

  const submitReview = async () => {
    if (!canSubmitReview) return;
    setIsSubmitting(true);
    setErrors([]);
    try {
      const submission = await onSubmitFeedback(draft);
      setSavedSubmission(submission);
      setStage('thanks');
    } catch (error) {
      if (error instanceof FeedbackSubmissionValidationError) {
        setErrors(error.errors.map((validationError) => validationError.message));
      } else {
        setErrors([error instanceof Error ? error.message : 'Review could not be submitted.']);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveDetails = async () => {
    if (!savedSubmission) return;
    setIsSubmitting(true);
    setErrors([]);
    try {
      const updated = await onSubmitFeedback(draft);
      onSubmitted(updated, 'feedback');
    } catch (error) {
      if (error instanceof FeedbackSubmissionValidationError) {
        setErrors(error.errors.map((validationError) => validationError.message));
      } else {
        setErrors([error instanceof Error ? error.message : 'Extra details could not be saved.']);
      }
      setIsSubmitting(false);
    }
  };

  const finishWithoutDetails = () => {
    if (savedSubmission) onSubmitted(savedSubmission, 'feedback');
    else onClose();
  };

  const withdraw = async () => {
    if (!existingSubmission || existingSubmission.structuredStatus === 'withdrawn') return;
    if (!window.confirm('Withdraw this review? Its public text will be hidden and its private detail signals will stop contributing to aggregate insights.')) return;
    setIsSubmitting(true);
    setErrors([]);
    try {
      const submission = await onWithdrawFeedback();
      onWithdrawn(submission);
      onClose();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Review could not be withdrawn.']);
      setIsSubmitting(false);
    }
  };

  const renderReviewStage = () => (
    <>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Overall reaction</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            aria-label="Thumbs up"
            title="Thumbs up"
            aria-pressed={draft.overallSentiment === 'positive'}
            onClick={() => setDraft((current) => ({ ...current, overallSentiment: 'positive' }))}
            className={`flex min-h-20 items-center justify-center gap-3 rounded-2xl border px-4 text-sm font-bold transition ${
              draft.overallSentiment === 'positive'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-white'
            }`}
          >
            <ThumbsUp size={24} className={draft.overallSentiment === 'positive' ? 'fill-current' : ''} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Thumbs down"
            title="Thumbs down"
            aria-pressed={draft.overallSentiment === 'negative'}
            onClick={() => setDraft((current) => ({ ...current, overallSentiment: 'negative' }))}
            className={`flex min-h-20 items-center justify-center gap-3 rounded-2xl border px-4 text-sm font-bold transition ${
              draft.overallSentiment === 'negative'
                ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
                : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-white'
            }`}
          >
            <ThumbsDown size={24} className={draft.overallSentiment === 'negative' ? 'fill-current' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <label htmlFor="guest-review-text" className="text-base font-bold text-white">Write your review</label>
            <p className="mt-1 text-sm leading-6 text-zinc-400">What should another guest know before they go?</p>
          </div>
          <span className="text-[11px] tabular-nums text-zinc-600">{draft.reviewText?.length ?? 0}/{FEEDBACK_REVIEW_TEXT_MAX_LENGTH}</span>
        </div>
        <textarea
          id="guest-review-text"
          value={draft.reviewText ?? ''}
          onChange={(event) => setDraft((current) => ({ ...current, reviewText: event.target.value }))}
          rows={6}
          minLength={FEEDBACK_REVIEW_TEXT_MIN_LENGTH}
          maxLength={FEEDBACK_REVIEW_TEXT_MAX_LENGTH}
          placeholder="Share the details that would have helped you before your visit."
          className="mt-3 w-full resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/50 focus:ring-2 focus:ring-red-500/10"
        />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3 text-xs leading-5 text-zinc-500">
        If approved, this written review is public and credited to {currentUser?.displayName || 'your display name'}{currentUser?.handle ? ` @${currentUser.handle}` : ''}. Extra venue details are optional and are not shown on your individual review card.
      </div>
    </>
  );

  const renderThanksStage = () => (
    <div className="py-4 sm:py-8">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
        <CheckCircle2 size={27} aria-hidden="true" />
      </span>
      <div className="mx-auto mt-5 max-w-xl text-center">
        <h2 className="text-2xl font-black text-white">Review submitted</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Your written review will appear after moderation. You can stop here, or spend about 30 seconds adding private details that can help SwingSphere identify recurring patterns.</p>
      </div>

      <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={finishWithoutDetails}
          className="min-h-12 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-zinc-200 transition hover:border-white/20 hover:text-white"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => setStage('details')}
          className="min-h-12 rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-bold text-red-100 transition hover:bg-red-500/15"
        >
          Add private details
        </button>
      </div>

      <div className="mx-auto mt-5 flex max-w-xl items-start gap-2 rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs leading-5 text-zinc-500">
        <LockKeyhole size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        These details are stored with the listing even if no organizer has claimed it yet. They can later support aggregate insights or verified-organizer reporting without exposing your individual selections publicly.
      </div>
    </div>
  );

  const renderDetailsStage = () => (
    <div>
      <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <LockKeyhole size={17} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-white">Optional private details</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">These selections are not attached to your public review. SwingSphere can use them to surface aggregate patterns and, later, provide verified organizers with useful trends.</p>
          </div>
        </div>
      </div>

      {targetType === 'club' ? (
        <div className="mt-5">
          <label htmlFor="review-visit-date" className="text-sm font-bold text-white">Visit date <span className="font-normal text-zinc-500">(optional)</span></label>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Helps distinguish recent experiences from older ones. It is not shown on the public review card.</p>
          <input
            id="review-visit-date"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={draft.visitDate ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, visitDate: event.target.value || undefined }))}
            className="mt-3 min-h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-red-400/50"
          />
        </div>
      ) : null}

      <div className="mt-6">
        <FeedbackSignalSelector
          targetType={targetType}
          polarity="positive"
          selectedIds={draft.positiveSignalIds}
          unavailableIds={draft.improvementSignalIds}
          onChange={(positiveSignalIds) => setDraft((current) => ({ ...current, positiveSignalIds }))}
        />
      </div>

      <div className="mt-7 border-t border-white/[0.07] pt-6">
        <FeedbackSignalSelector
          targetType={targetType}
          polarity="improvement"
          selectedIds={draft.improvementSignalIds}
          unavailableIds={draft.positiveSignalIds}
          onChange={(improvementSignalIds) => setDraft((current) => ({ ...current, improvementSignalIds }))}
        />
      </div>
    </div>
  );

  const title = stage === 'review'
    ? existingSubmission ? `Update your review of ${targetName}` : `Review ${targetName}`
    : stage === 'thanks'
      ? 'Thanks for sharing'
      : 'Help improve the experience';

  const description = stage === 'review'
    ? 'Thumbs up or down · write your review · submit'
    : stage === 'thanks'
      ? 'Your public review is complete'
      : 'Optional · private structured details';

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/88 p-3 backdrop-blur-md" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-dialog-title"
          aria-describedby="feedback-dialog-description"
          className="ss-feedback-dialog ss-glass ss-glass--liquid my-auto flex max-h-[calc(100dvh-24px)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-rose-300/15"
        >
          <header className="ss-feedback-dialog__header shrink-0 border-b border-white/10 px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-red-300">Guest review</p>
                <h1 id="feedback-dialog-title" className="mt-1 text-2xl font-black leading-tight text-white">{title}</h1>
                <p id="feedback-dialog-description" className="mt-1 text-xs text-zinc-400">{description}</p>
              </div>
              <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close review dialog" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="ss-glass--scrollable min-h-0 flex-1 px-4 py-4 sm:px-6 sm:py-5">
            {stage === 'review' ? renderReviewStage() : stage === 'thanks' ? renderThanksStage() : renderDetailsStage()}

            {errors.length ? (
              <div role="alert" aria-live="assertive" className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
                <ul className="list-disc space-y-1 pl-4">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            ) : null}
          </div>

          {stage !== 'thanks' ? (
            <footer className="shrink-0 border-t border-white/10 bg-[linear-gradient(90deg,rgba(8,9,13,.92),rgba(30,8,15,.82))] px-4 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {stage === 'details' ? (
                    <button type="button" onClick={() => setStage('thanks')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-300 hover:bg-white/5">
                      <ArrowLeft size={16} aria-hidden="true" /> Back
                    </button>
                  ) : (
                    <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-300 hover:bg-white/5">Cancel</button>
                  )}
                  {stage === 'review' && existingSubmission && existingSubmission.structuredStatus !== 'withdrawn' ? (
                    <button type="button" disabled={isSubmitting} onClick={() => void withdraw()} className="min-h-11 px-2 text-xs font-semibold text-zinc-500 hover:text-red-200 disabled:opacity-40">Withdraw review</button>
                  ) : null}
                </div>

                {stage === 'review' ? (
                  <button
                    type="button"
                    disabled={isSubmitting || !canSubmitReview}
                    onClick={() => void submitReview()}
                    className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive min-h-11 rounded-xl px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSubmitting ? 'Submitting…' : existingSubmission ? 'Update review' : 'Submit review'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={finishWithoutDetails} disabled={isSubmitting} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-zinc-500 hover:text-white disabled:opacity-40">Skip</button>
                    <button type="button" onClick={() => void saveDetails()} disabled={isSubmitting} className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive min-h-11 rounded-xl px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
                      {isSubmitting ? 'Saving…' : 'Save private details'}
                    </button>
                  </div>
                )}
              </div>
            </footer>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FeedbackDialog;
