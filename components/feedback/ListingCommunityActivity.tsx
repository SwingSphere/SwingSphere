import React, { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Pencil, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { useMemberHubDemoContent } from '../../hooks/useMemberHubDemoContent';
import { useProfilePrivacy } from '../../hooks/useProfilePrivacy';
import {
  FEEDBACK_REVIEW_TEXT_MAX_LENGTH,
  FEEDBACK_REVIEW_TEXT_MIN_LENGTH,
  type FeedbackApprovedWrittenExperience,
  type FeedbackSentiment,
  type FeedbackTargetType,
} from '../../lib/feedback';
import { useAppStore } from '../../store/appStore';
import ContentVoteControl from '../community/ContentVoteControl';
import MemberAttributionLink from '../profile/MemberAttributionLink';

type ListingTargetType = Extract<FeedbackTargetType, 'club' | 'event'>;

type PublishedReview = {
  id: string;
  body: string;
  publishedAt: string;
  editedAt?: string;
  sentiment: FeedbackSentiment;
  authorDisplayName?: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  upvoteCount?: number;
  downvoteCount?: number;
  isDemo?: boolean;
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value));

const normalizeBody = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const sentimentClass: Record<FeedbackSentiment, string> = {
  positive: 'border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-200',
  mixed: 'border-amber-400/20 bg-amber-500/[0.07] text-amber-200',
  negative: 'border-rose-400/20 bg-rose-500/[0.07] text-rose-200',
};

const SentimentMark: React.FC<{ sentiment: FeedbackSentiment }> = ({ sentiment }) => {
  const label = sentiment === 'positive' ? 'Author reaction: thumbs up' : sentiment === 'negative' ? 'Author reaction: thumbs down' : 'Author reaction: mixed legacy rating';
  const Icon = sentiment === 'positive' ? ThumbsUp : sentiment === 'negative' ? ThumbsDown : Minus;
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${sentimentClass[sentiment]}`}
      aria-label={label}
      title={label}
    >
      <Icon size={12} className={sentiment !== 'mixed' ? 'fill-current' : ''} aria-hidden="true" />
    </span>
  );
};

const ListingCommunityActivity: React.FC<{
  targetType: ListingTargetType;
  targetId: string;
  approvedWritten?: FeedbackApprovedWrittenExperience[];
}> = ({ targetType, targetId, approvedWritten = [] }) => {
  const { currentUser } = useAppStore();
  const demo = useMemberHubDemoContent(currentUser);
  const currentUserPrivacy = useProfilePrivacy(currentUser?.id);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const currentUserProfileAvailability = currentUserPrivacy.settings
    ? (currentUserPrivacy.settings.profileVisibility === 'visible' ? 'visible' : 'private')
    : undefined;

  const profileAvailabilityFor = (authorHandle?: string) => (
    authorHandle
    && currentUser?.handle
    && authorHandle.replace(/^@/, '').toLowerCase() === currentUser.handle.replace(/^@/, '').toLowerCase()
      ? currentUserProfileAvailability
      : undefined
  );

  const reviews = useMemo<PublishedReview[]>(() => {
    const liveReviews: PublishedReview[] = approvedWritten.map((experience) => ({
      id: experience.submissionId,
      body: experience.approvedText,
      publishedAt: experience.approvedAt,
      sentiment: experience.overallSentiment,
      authorDisplayName: experience.authorDisplayName,
      authorHandle: experience.authorHandle,
      authorAvatarUrl: experience.authorAvatarUrl,
    }));

    const demoReviews = demo.contributions
      .filter((contribution) => contribution.targetType === targetType && contribution.targetId === targetId)
      .map((contribution): PublishedReview => ({
        id: contribution.id,
        body: contribution.body,
        publishedAt: contribution.createdAt,
        editedAt: contribution.editedAt,
        sentiment: contribution.sentiment,
        authorDisplayName: currentUser?.displayName,
        authorHandle: currentUser?.handle,
        authorAvatarUrl: currentUser?.avatarUrl,
        upvoteCount: contribution.upvoteCount,
        downvoteCount: contribution.downvoteCount,
        isDemo: true,
      }));

    const demoBodies = demoReviews.map((review) => normalizeBody(review.body));
    const nonDuplicateLiveReviews = liveReviews.filter((review) => {
      const liveBody = normalizeBody(review.body);
      return !demoBodies.some((demoBody) => demoBody.includes(liveBody) || liveBody.includes(demoBody));
    });

    return [...demoReviews, ...nonDuplicateLiveReviews]
      .sort((left, right) => new Date(right.editedAt ?? right.publishedAt).getTime() - new Date(left.editedAt ?? left.publishedAt).getTime());
  }, [approvedWritten, currentUser?.avatarUrl, currentUser?.displayName, currentUser?.handle, demo.contributions, targetId, targetType]);

  useEffect(() => {
    if (!editingReviewId) return;
    const review = reviews.find((item) => item.id === editingReviewId);
    if (!review?.isDemo) {
      setEditingReviewId(null);
      setDraft('');
    }
  }, [editingReviewId, reviews]);

  const beginEdit = (review: PublishedReview) => {
    if (!review.isDemo) return;
    setEditingReviewId(review.id);
    setDraft(review.body);
  };

  const saveEdit = () => {
    if (!editingReviewId || draft.trim().length < FEEDBACK_REVIEW_TEXT_MIN_LENGTH) return;
    demo.editReview(editingReviewId, draft.trim());
    setEditingReviewId(null);
    setDraft('');
  };

  const deleteReview = (review: PublishedReview) => {
    if (!review.isDemo) return;
    if (!window.confirm('Delete this demo review? This cannot be undone.')) return;
    demo.deleteContribution(review.id);
  };

  if (!reviews.length) return null;

  return (
    <section className="mt-4 border-t border-white/[0.06] pt-4" aria-label="Guest reviews">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
          {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
        </p>
        <p className="hidden text-[10px] text-zinc-600 sm:block">Helpful votes are shown on each review.</p>
      </div>

      <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/15">
        {reviews.map((review) => {
          const isEditing = editingReviewId === review.id;
          return (
            <article key={review.id} className="px-3.5 py-3.5 sm:px-4 sm:py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-xs font-black text-zinc-400">
                  {review.authorAvatarUrl
                    ? <img src={review.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
                    : (review.authorDisplayName?.trim().charAt(0).toUpperCase() || 'S')}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <MemberAttributionLink
                        displayName={review.authorDisplayName}
                        handle={review.authorHandle}
                        profileAvailability={profileAvailabilityFor(review.authorHandle)}
                      />
                      {review.isDemo ? (
                        <span className="mt-0.5 rounded-full border border-fuchsia-300/15 bg-fuchsia-500/[0.07] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-200/70">Demo</span>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <ContentVoteControl
                        contentKey={`${targetType}:${targetId}:review:${review.id}`}
                        baseUpvotes={review.upvoteCount}
                        baseDownvotes={review.downvoteCount}
                        compact
                      />
                      {review.isDemo && !isEditing ? (
                        <>
                          <button type="button" onClick={() => beginEdit(review)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.04] hover:text-white" aria-label="Edit review" title="Edit review"><Pencil size={13} /></button>
                          <button type="button" onClick={() => deleteReview(review)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 transition hover:bg-red-500/10 hover:text-red-200" aria-label="Delete review" title="Delete review"><Trash2 size={13} /></button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
                    <SentimentMark sentiment={review.sentiment} />
                    <time dateTime={review.publishedAt}>{formatDateTime(review.publishedAt)}</time>
                    {review.editedAt ? <time dateTime={review.editedAt}>· Edited {formatDateTime(review.editedAt)}</time> : null}
                  </div>

                  {isEditing ? (
                    <div className="mt-2.5">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={4}
                        minLength={FEEDBACK_REVIEW_TEXT_MIN_LENGTH}
                        maxLength={FEEDBACK_REVIEW_TEXT_MAX_LENGTH}
                        className="w-full resize-y rounded-xl border border-white/10 bg-black/35 px-3.5 py-2.5 text-sm leading-6 text-white outline-none focus:border-red-400/55"
                      />
                      <div className="mt-2 flex justify-end gap-1.5">
                        <button type="button" onClick={() => { setEditingReviewId(null); setDraft(''); }} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-zinc-500 hover:bg-white/[0.04] hover:text-white"><X size={12} /> Cancel</button>
                        <button type="button" onClick={saveEdit} disabled={draft.trim().length < FEEDBACK_REVIEW_TEXT_MIN_LENGTH} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-[11px] font-bold text-white disabled:opacity-40"><Check size={12} /> Save review</button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2.5 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{review.body}</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ListingCommunityActivity;
