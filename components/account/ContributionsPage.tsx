import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileEdit,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User } from '../../data/mockUsers';
import { useMemberHubDemoContent } from '../../hooks/useMemberHubDemoContent';
import * as api from '../../lib/api';
import { FEEDBACK_REVIEW_TEXT_MAX_LENGTH, FEEDBACK_REVIEW_TEXT_MIN_LENGTH } from '../../lib/feedback';
import { supabase } from '../../lib/supabase';
import type { Listing } from '../../types';

type FeedbackContributionRow = {
  id: string;
  event_id: string | null;
  club_id: string | null;
  organization_id: string | null;
  overall_sentiment: 'positive' | 'mixed' | 'negative';
  structured_status: 'eligible' | 'excluded' | 'withdrawn';
  created_at: string;
  updated_at: string;
  feedback_written_experiences?: { moderation_status?: string | null; approved_at?: string | null; submitted_at?: string | null } | Array<{ moderation_status?: string | null; approved_at?: string | null; submitted_at?: string | null }> | null;
};

type ContributionItem = {
  id: string;
  kind: 'review' | 'listing';
  title: string;
  eyebrow: string;
  status: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
  href?: string;
  listingId?: string;
  canManagePendingListing?: boolean;
  detail: string;
  body?: string;
  isDemo?: boolean;
};

const getWrittenState = (row: FeedbackContributionRow) => {
  const relation = Array.isArray(row.feedback_written_experiences)
    ? row.feedback_written_experiences[0]
    : row.feedback_written_experiences;
  return relation?.moderation_status ?? null;
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value));

const ContributionsPage: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const demo = useMemberHubDemoContent(currentUser);
  const [feedbackRows, setFeedbackRows] = useState<FeedbackContributionRow[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [feedbackResult, listingRows] = await Promise.all([
        supabase
          .from('feedback_submissions')
          .select('id, event_id, club_id, organization_id, overall_sentiment, structured_status, created_at, updated_at, feedback_written_experiences(moderation_status, approved_at, submitted_at)')
          .order('updated_at', { ascending: false }),
        api.getListings(),
      ]);
      if (feedbackResult.error) throw feedbackResult.error;
      setFeedbackRows((feedbackResult.data ?? []) as FeedbackContributionRow[]);
      setListings(listingRows);
    } catch (loadError) {
      try {
        setListings(await api.getListings());
      } catch {
        setListings([]);
      }
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your contributions.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [currentUser.id]);

  const listingById = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);

  const ownedListings = useMemo(() => {
    const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
    const grouped = new Map<string, Listing[]>();

    listings
      .filter((listing) => listing.postedByUserId === currentUser.id)
      .forEach((listing) => {
        const key = `${listing.type}:${normalizeName(listing.name)}`;
        const group = grouped.get(key) ?? [];
        group.push(listing);
        grouped.set(key, group);
      });

    return Array.from(grouped.values()).map((group) => {
      const score = (listing: Listing) => listing.status === 'approved' ? 3 : listing.status === 'flagged' ? 2 : 1;
      return [...group].sort((left, right) => score(right) - score(left))[0];
    });
  }, [currentUser.id, listings]);

  const items = useMemo<ContributionItem[]>(() => {
    const demoItems: ContributionItem[] = demo.contributions.map((contribution) => ({
      id: contribution.id,
      kind: contribution.kind,
      title: contribution.targetName,
      eyebrow: `${contribution.targetType === 'club' ? 'Club' : 'Event'} ${contribution.kind}`,
      status: contribution.sentiment === 'negative' ? '👎 Review' : contribution.sentiment === 'mixed' ? 'Mixed · legacy' : '👍 Review',
      tone: contribution.sentiment === 'negative' ? 'danger' : contribution.sentiment === 'mixed' ? 'warning' : 'success',
      createdAt: contribution.createdAt,
      updatedAt: contribution.editedAt ?? contribution.createdAt,
      editedAt: contribution.editedAt,
      href: `/listing/${contribution.targetId}#${contribution.targetType}-feedback-${contribution.targetId}`,
      detail: 'Published written review credited to your display name and @username.',
      body: contribution.body,
      isDemo: true,
    }));

    const reviewItems = feedbackRows.map((row): ContributionItem => {
      const targetId = row.event_id ?? row.club_id ?? row.organization_id ?? 'unknown';
      const listing = listingById.get(targetId);
      const writtenState = getWrittenState(row);
      const withdrawn = row.structured_status === 'withdrawn';
      const excluded = row.structured_status === 'excluded';
      const status = withdrawn
        ? 'Withdrawn'
        : excluded
          ? 'Not counted'
          : writtenState === 'pending'
            ? 'Written review under review'
            : writtenState === 'needs_revision'
              ? 'Changes requested'
              : writtenState === 'rejected'
                ? 'Written review not published'
                : writtenState === 'approved'
                  ? 'Published review'
                  : 'Feedback recorded';
      const tone: ContributionItem['tone'] = withdrawn || writtenState === 'rejected'
        ? 'danger'
        : writtenState === 'needs_revision' || writtenState === 'pending'
          ? 'warning'
          : writtenState === 'approved' || row.structured_status === 'eligible'
            ? 'success'
            : 'neutral';

      return {
        id: `review-${row.id}`,
        kind: 'review',
        title: listing?.name ?? `${row.event_id ? 'Event' : row.club_id ? 'Club' : 'Organization'} feedback`,
        eyebrow: 'Review or feedback',
        status,
        tone,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        href: listing ? `/listing/${listing.id}#${row.event_id ? 'event' : row.club_id ? 'club' : 'organization'}-feedback-${targetId}` : undefined,
        detail: withdrawn
          ? 'This feedback no longer contributes to community results.'
          : writtenState === 'approved'
            ? 'Your approved text may show your display name and linked @username.'
            : 'Structured feedback remains private to you and moderation staff except for threshold-safe aggregate results.',
      };
    });

    const listingItems = ownedListings
      .map((listing): ContributionItem => ({
        id: `listing-${listing.id}`,
        kind: 'listing',
        title: listing.name,
        eyebrow: listing.type === 'event' ? 'Event submission' : 'Club submission',
        status: listing.status === 'approved' ? 'Published' : listing.status === 'flagged' ? 'Needs attention' : 'Under review',
        tone: listing.status === 'approved' ? 'success' : listing.status === 'flagged' ? 'warning' : 'neutral',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        href: listing.status === 'approved' ? `/listing/${listing.id}` : undefined,
        listingId: listing.id,
        canManagePendingListing: listing.status === 'pending_approval',
        detail: listing.status === 'approved'
          ? 'This contribution is live in discovery.'
          : 'Submission persistence and detailed moderation history are still being connected to the production listing backend.',
      }));

    return [...demoItems, ...reviewItems, ...listingItems]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [demo.contributions, feedbackRows, listingById, ownedListings]);

  const attentionCount = items.filter((item) => item.tone === 'warning').length;
  const publishedCount = items.filter((item) => item.tone === 'success').length;

  const deleteDemoReview = (item: ContributionItem) => {
    if (!item.isDemo || item.kind !== 'review') return;
    if (!window.confirm(`Delete your demo review of ${item.title}? This cannot be undone.`)) return;
    demo.deleteContribution(item.id);
  };

  const withdrawPendingListing = async (item: ContributionItem) => {
    if (!item.listingId || !item.canManagePendingListing || withdrawingId) return;
    if (!window.confirm(`Withdraw your submission for ${item.title}? It will leave the moderation queue and will no longer be reviewed.`)) return;
    setWithdrawingId(item.listingId);
    try {
      await api.withdrawMyPendingListing(item.listingId);
      await load();
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : 'Unable to withdraw this submission.');
    } finally {
      setWithdrawingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Your activity</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Contributions</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Track your reviews, structured feedback, corrections, and listing submissions without public rankings or contribution leaderboards.</p>
          </div>
          <Link to="/submission" className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-500"><Plus size={16} aria-hidden="true" /> Add a listing</Link>
        </div>
      </section>

      {demo.isEligible ? (
        <section className="rounded-[22px] border border-fuchsia-300/15 bg-fuchsia-500/[0.055] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-200/80">Temporary profile mock data</p>
              <p className="mt-1 text-sm leading-6 text-gray-400">
                {demo.isEnabled
                  ? 'These reviews exist only in this browser for the SwingSphere admin profile. Editing and deletion are interactive.'
                  : 'The temporary contribution examples have been removed from this browser.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {demo.isEnabled ? (
                <button type="button" onClick={demo.removeAll} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-gray-300 transition hover:border-red-400/30 hover:text-red-200"><Trash2 size={14} /> Remove demo data</button>
              ) : (
                <button type="button" onClick={demo.reset} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/10 px-3 text-xs font-bold text-fuchsia-100"><RotateCcw size={14} /> Restore demo data</button>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total activity" value={isLoading ? '—' : items.length.toString()} icon={FileText} />
        <SummaryCard label="Needs attention" value={isLoading ? '—' : attentionCount.toString()} icon={AlertCircle} />
        <SummaryCard label="Published or counted" value={isLoading ? '—' : publishedCount.toString()} icon={CheckCircle2} />
      </div>

      <section className="ss-glass-surface rounded-[22px] p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Activity history</p>
          <h3 className="mt-1 text-lg font-bold text-white">Your reviews and submissions</h3>
        </div>

        {isLoading ? (
          <div className="mt-4 space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.025]" />)}</div>
        ) : items.length ? (
          <div className="mt-4 space-y-2">
            {error ? <p className="rounded-xl border border-amber-300/15 bg-amber-500/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/75">Live contribution data could not load, so temporary examples are shown. {error}</p> : null}
            {items.map((item) => (
              <ContributionRow
                key={item.id}
                item={item}
                onEditReview={demo.editReview}
                onDeleteReview={() => deleteDemoReview(item)}
                onWithdrawListing={() => void withdrawPendingListing(item)}
                isWithdrawing={Boolean(item.listingId && withdrawingId === item.listingId)}
              />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-5 text-sm text-red-200">
            <p className="font-bold">Contributions could not load</p>
            <p className="mt-1 text-red-200/75">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 font-bold text-white"><RotateCcw size={15} aria-hidden="true" /> Try again</button>
          </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-dashed border-white/[0.12] bg-black/20 px-6 py-12 text-center">
            <FileEdit className="mx-auto text-gray-600" size={34} aria-hidden="true" />
            <h4 className="mt-4 text-xl font-bold text-white">Nothing to manage yet</h4>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">When you review an experience, suggest a correction, or submit a listing, its status will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
};

const toneClass = {
  neutral: 'border-white/10 bg-white/[0.035] text-gray-300',
  success: 'border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-200',
  warning: 'border-amber-400/20 bg-amber-500/[0.08] text-amber-200',
  danger: 'border-red-400/20 bg-red-500/[0.08] text-red-200',
} as const;

const ContributionRow: React.FC<{
  item: ContributionItem;
  onEditReview: (id: string, body: string) => void;
  onDeleteReview: () => void;
  onWithdrawListing: () => void;
  isWithdrawing: boolean;
}> = ({ item, onEditReview, onDeleteReview, onWithdrawListing, isWithdrawing }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(item.body ?? '');

  useEffect(() => setDraft(item.body ?? ''), [item.body]);

  const saveEdit = () => {
    const next = draft.trim();
    if (next.length < FEEDBACK_REVIEW_TEXT_MIN_LENGTH) return;
    onEditReview(item.id, next);
    setIsEditing(false);
  };

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-black/20 px-3.5 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-gray-500">
          {item.kind === 'review' ? <Star size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />}
          {item.eyebrow}
          {item.isDemo ? <span className="rounded-full border border-fuchsia-300/15 bg-fuchsia-500/[0.07] px-1.5 py-0.5 tracking-normal text-fuchsia-200/70">Demo</span> : null}
        </p>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${toneClass[item.tone]}`}><Clock3 size={10} aria-hidden="true" /> {item.status}</span>
      </div>

      <h4 className="mt-1 text-sm font-bold text-white sm:text-base">{item.title}</h4>
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
            <button type="button" onClick={() => { setDraft(item.body ?? ''); setIsEditing(false); }} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-gray-500 hover:bg-white/[0.04] hover:text-white"><X size={12} /> Cancel</button>
            <button type="button" onClick={saveEdit} disabled={draft.trim().length < FEEDBACK_REVIEW_TEXT_MIN_LENGTH} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-[11px] font-bold text-white disabled:opacity-40"><CheckCircle2 size={12} /> Save</button>
          </div>
        </div>
      ) : item.body ? (
        <p className="mt-2 line-clamp-2 max-w-4xl whitespace-pre-wrap text-sm leading-5 text-gray-300">“{item.body}”</p>
      ) : null}
      {!isEditing ? <p className="mt-1 line-clamp-1 max-w-3xl text-[11px] leading-4 text-gray-600">{item.detail}</p> : null}

      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[10px] leading-4 text-gray-600">
          <span>Posted {formatDateTime(item.createdAt)}</span>
          {item.editedAt ? <span className="ml-1.5 text-gray-500">· Edited {formatDateTime(item.editedAt)}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {item.kind === 'review' && item.isDemo && !isEditing ? (
            <>
              <button type="button" onClick={() => setIsEditing(true)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-gray-500 transition hover:bg-white/[0.04] hover:text-white"><Pencil size={12} /> Edit</button>
              <button type="button" onClick={onDeleteReview} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-gray-600 transition hover:bg-red-500/10 hover:text-red-200"><Trash2 size={12} /> Delete</button>
            </>
          ) : null}
          {item.kind === 'listing' && item.canManagePendingListing && item.listingId ? (
            <>
              <Link to={`/submission/${encodeURIComponent(item.listingId)}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-gray-400 transition hover:bg-white/[0.04] hover:text-white"><Pencil size={12} /> Edit submission</Link>
              <button type="button" onClick={onWithdrawListing} disabled={isWithdrawing} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-gray-500 transition hover:bg-red-500/10 hover:text-red-200 disabled:cursor-wait disabled:opacity-50"><Trash2 size={12} /> {isWithdrawing ? 'Withdrawing…' : 'Withdraw'}</button>
            </>
          ) : null}
          {item.href ? <Link to={item.href} className="inline-flex min-h-8 items-center rounded-lg px-2.5 text-xs font-bold text-red-300 transition hover:bg-red-500/[0.07] hover:text-red-200">View listing</Link> : null}
        </div>
      </div>
    </article>
  );
};

const SummaryCard: React.FC<{ label: string; value: string; icon: typeof FileText }> = ({ label, value, icon: Icon }) => (
  <div className="ss-glass-surface rounded-[22px] p-4 sm:p-5">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-2xl font-black text-white">{value}</p>
        <p className="mt-1 text-xs font-semibold text-gray-500">{label}</p>
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-red-200"><Icon size={18} aria-hidden="true" /></span>
    </div>
  </div>
);

export default ContributionsPage;
