import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CircleAlert, FileCheck2, LoaderCircle, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  listListingClaimsForAdmin,
  reviewListingClaimAsAdmin,
  type AdminListingClaim,
  type ListingClaimStatus,
  type ListingClaimVerificationMethod,
} from '../../lib/claims/listingClaims';
import { useAppStore } from '../../store/appStore';
import type { Listing, OrganizationData } from '../../types';

const OPEN_STATUSES = new Set<ListingClaimStatus>(['pending', 'information_requested', 'under_review']);

const verificationMethods: Array<{ value: ListingClaimVerificationMethod; label: string }> = [
  { value: 'official_domain_email', label: 'Official-domain email' },
  { value: 'official_public_email', label: 'Previously published email' },
  { value: 'public_phone_callback', label: 'Public phone callback' },
  { value: 'official_social_account', label: 'Official social account' },
  { value: 'website_challenge', label: 'Website/domain challenge' },
  { value: 'existing_owner_invitation', label: 'Verified owner invitation' },
  { value: 'live_call', label: 'Live voice/video call' },
  { value: 'business_document', label: 'Redacted business document' },
  { value: 'combined_manual_review', label: 'Combined manual review' },
];

const statusLabel = (status: ListingClaimStatus): string => status.replaceAll('_', ' ');

const formatDate = (value?: string): string => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : value;
};

type ReviewDraft = {
  method: ListingClaimVerificationMethod;
  verificationSummary: string;
  decisionReason: string;
  publicNote: string;
  privateNote: string;
  evidenceReceived: boolean;
  evidenceDeleted: boolean;
};

const initialDraft = (claim: AdminListingClaim): ReviewDraft => ({
  method: claim.verificationMethod ?? 'official_public_email',
  verificationSummary: claim.verificationSummary ?? '',
  decisionReason: claim.decisionReason ?? '',
  publicNote: '',
  privateNote: '',
  evidenceReceived: Boolean(claim.evidenceReceivedAt),
  evidenceDeleted: Boolean(claim.evidenceDeletedAt),
});

type AdminListingClaimsProps = {
  listings: Listing[];
  organizations: OrganizationData[];
};

const AdminListingClaims: React.FC<AdminListingClaimsProps> = ({ listings, organizations }) => {
  const { addToast } = useAppStore();
  const [claims, setClaims] = useState<AdminListingClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const nextClaims = await listListingClaimsForAdmin();
      setClaims(nextClaims);
      setDrafts((current) => {
        const next = { ...current };
        nextClaims.forEach((claim) => {
          if (!next[claim.id]) next[claim.id] = initialDraft(claim);
        });
        return next;
      });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to load listing claims.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleClaims = useMemo(
    () => filter === 'open' ? claims.filter((claim) => OPEN_STATUSES.has(claim.status)) : claims,
    [claims, filter],
  );

  const updateDraft = (claimId: string, patch: Partial<ReviewDraft>) => {
    setDrafts((current) => ({
      ...current,
      [claimId]: { ...(current[claimId] ?? initialDraft(claims.find((claim) => claim.id === claimId)!)), ...patch },
    }));
  };

  const review = async (
    claim: AdminListingClaim,
    status: Exclude<ListingClaimStatus, 'pending' | 'withdrawn'>,
  ) => {
    const draft = drafts[claim.id] ?? initialDraft(claim);
    if (status === 'verified' && draft.verificationSummary.trim().length < 10) {
      addToast({ message: 'Add a concise verification summary before approving the claim.', type: 'error' });
      return;
    }
    if (status === 'information_requested' && draft.decisionReason.trim().length < 5) {
      addToast({ message: 'Describe the additional information the claimant should provide.', type: 'error' });
      return;
    }
    if (status === 'denied' && draft.decisionReason.trim().length < 5) {
      addToast({ message: 'Add a decision reason before denying the claim.', type: 'error' });
      return;
    }
    if (status === 'revoked' && draft.decisionReason.trim().length < 5) {
      addToast({ message: 'Add a decision reason before revoking the claim.', type: 'error' });
      return;
    }

    setSavingId(claim.id);
    try {
      const now = new Date().toISOString();
      const reviewed = await reviewListingClaimAsAdmin({
        claimId: claim.id,
        status,
        verificationMethod: draft.method,
        verificationSummary: draft.verificationSummary.trim() || undefined,
        decisionReason: draft.decisionReason.trim() || undefined,
        publicNote: draft.publicNote.trim() || undefined,
        privateNote: draft.privateNote.trim() || undefined,
        evidenceReceivedAt: draft.evidenceReceived && !claim.evidenceReceivedAt ? now : undefined,
        evidenceDeletedAt: draft.evidenceDeleted && !claim.evidenceDeletedAt ? now : undefined,
      });
      setClaims((current) => current.map((item) => item.id === claim.id ? { ...item, ...reviewed } : item));
      setDrafts((current) => ({ ...current, [claim.id]: initialDraft(reviewed) }));
      addToast({
        message: status === 'verified'
          ? 'Claim verified. The approved organization role is now active.'
          : `Claim marked ${statusLabel(status)}.`,
        type: 'success',
      });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to update listing claim.', type: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Trust & ownership</p>
          <h1 className="mt-1 text-3xl font-black text-gray-900">Listing Claims</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">Verify that a claimant has authority to manage a listing. The queue stores the method, decision, and deletion record—not identity documents.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <div className="flex items-start gap-3">
          <CircleAlert size={20} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-bold">Do not request or store government IDs in this queue.</div>
            <p className="mt-1 leading-6">Start with official email, an already published contact method, an established social account, a website challenge, an existing-owner invitation, or a live confirmation. Redacted business evidence is a last resort and must be deleted promptly after review.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setFilter('open')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${filter === 'open' ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}>Open ({claims.filter((claim) => OPEN_STATUSES.has(claim.status)).length})</button>
        <button type="button" onClick={() => setFilter('all')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${filter === 'all' ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}>All ({claims.length})</button>
      </div>

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"><LoaderCircle size={18} className="mr-2 animate-spin" /> Loading claims…</div>
      ) : !visibleClaims.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">No {filter === 'open' ? 'open ' : ''}listing claims.</div>
      ) : (
        <div className="space-y-4">
          {visibleClaims.map((claim) => {
            const draft = drafts[claim.id] ?? initialDraft(claim);
            const expanded = expandedId === claim.id;
            const saving = savingId === claim.id;
            const listing = (claim.entityType === 'club' || claim.entityType === 'event')
              ? listings.find((item) => item.id === claim.entityId)
              : undefined;
            const organization = claim.entityType === 'organization'
              ? organizations.find((item) => item.id === claim.entityId)
              : undefined;
            const entityName = listing?.name ?? organization?.name ?? claim.entityName ?? claim.entityId;
            const entityPath = listing
              ? `/listing/${encodeURIComponent(listing.id)}`
              : organization?.slug
                ? `/hosts/${organization.slug}`
                : claim.entityPath;
            return (
              <article key={claim.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="grid w-full gap-3 p-5 text-left md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-600">{claim.entityType.replaceAll('_', ' ')}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${claim.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : OPEN_STATUSES.has(claim.status) ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{statusLabel(claim.status)}</span>
                    </div>
                    {entityPath ? (
                      <Link to={entityPath} className="mt-2 block truncate text-base font-bold text-gray-900 hover:text-blue-600 hover:underline">
                        {entityName}
                      </Link>
                    ) : (
                      <div className="mt-2 truncate text-base font-bold text-gray-900">{entityName}</div>
                    )}
                    <div className="mt-1 text-xs text-gray-500">Requested role: <span className="font-semibold capitalize text-gray-700">{claim.requestedRole}</span></div>
                  </div>
                  <div className="min-w-0 text-sm text-gray-600">
                    {claim.claimantHandle ? (
                      <Link to={`/users/${claim.claimantHandle}`} className="block truncate font-semibold text-gray-800 hover:text-blue-600 hover:underline">
                        {claim.claimantDisplayName || `@${claim.claimantHandle}`}
                      </Link>
                    ) : (
                      <div className="truncate font-semibold text-gray-800">{claim.claimantDisplayName || claim.claimantUserId}</div>
                    )}
                    {claim.claimantHandle ? <Link to={`/users/${claim.claimantHandle}`} className="block truncate text-xs text-gray-500 hover:text-blue-600 hover:underline">@{claim.claimantHandle}</Link> : null}
                    <div className="mt-1 text-xs text-gray-500">Submitted {formatDate(claim.submittedAt)}</div>
                  </div>
                  <button type="button" onClick={() => setExpandedId(expanded ? null : claim.id)} className="text-sm font-semibold text-blue-600 hover:text-blue-700">{expanded ? 'Close' : 'Review'}</button>
                </div>

                {expanded ? (
                  <div className="border-t border-gray-200 bg-gray-50 p-5">
                    <div className="grid gap-5 lg:grid-cols-2">
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Claimant note</div>
                          <div className="mt-2 min-h-20 whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm leading-6 text-gray-700">{claim.claimantNote || 'No verification note supplied.'}</div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600"><span className="font-bold text-gray-800">Claim ID</span><div className="mt-1 break-all">{claim.id}</div></div>
                          <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600"><span className="font-bold text-gray-800">Organization</span><div className="mt-1 break-all">{claim.organizationId || 'Not linked yet'}</div></div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-gray-700">Evidence received
                            <button type="button" onClick={() => updateDraft(claim.id, { evidenceReceived: !draft.evidenceReceived })} className={`mt-1.5 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${draft.evidenceReceived ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-300 bg-white text-gray-600'}`}><FileCheck2 size={15} />{draft.evidenceReceived ? 'Record receipt' : 'No temporary evidence'}</button>
                          </label>
                          <label className="text-xs font-semibold text-gray-700">Evidence deleted
                            <button type="button" disabled={!draft.evidenceReceived} onClick={() => updateDraft(claim.id, { evidenceDeleted: !draft.evidenceDeleted })} className={`mt-1.5 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left disabled:opacity-40 ${draft.evidenceDeleted ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-gray-300 bg-white text-gray-600'}`}><Trash2 size={15} />{draft.evidenceDeleted ? 'Record deletion' : 'Deletion not recorded'}</button>
                          </label>
                        </div>
                        {(claim.evidenceReceivedAt || claim.evidenceDeletedAt) ? <div className="text-xs leading-5 text-gray-500">Received: {formatDate(claim.evidenceReceivedAt)}<br />Deleted: {formatDate(claim.evidenceDeletedAt)}</div> : null}
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-semibold text-gray-700">Verification method
                          <select value={draft.method} onChange={(event) => updateDraft(claim.id, { method: event.target.value as ListingClaimVerificationMethod })} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
                            {verificationMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs font-semibold text-gray-700">Verification summary
                          <textarea rows={3} value={draft.verificationSummary} onChange={(event) => updateDraft(claim.id, { verificationSummary: event.target.value.slice(0, 2000) })} placeholder="Example: Confirmed through the business email already published on the official website." className="mt-1.5 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-5 text-gray-900" />
                        </label>
                        <label className="block text-xs font-semibold text-gray-700">Decision or information-request reason
                          <textarea rows={2} value={draft.decisionReason} onChange={(event) => updateDraft(claim.id, { decisionReason: event.target.value.slice(0, 2000) })} placeholder="Visible decision context stored on the claim." className="mt-1.5 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-5 text-gray-900" />
                        </label>
                        <label className="block text-xs font-semibold text-gray-700">Internal note
                          <textarea rows={2} value={draft.privateNote} onChange={(event) => updateDraft(claim.id, { privateNote: event.target.value.slice(0, 2000) })} placeholder="Restricted reviewer note; do not copy sensitive document contents." className="mt-1.5 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-5 text-gray-900" />
                        </label>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                      {OPEN_STATUSES.has(claim.status) ? (
                        <>
                          <button type="button" disabled={saving} onClick={() => void review(claim, 'information_requested')} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50">Request information</button>
                          <button type="button" disabled={saving} onClick={() => void review(claim, 'under_review')} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 disabled:opacity-50">Mark under review</button>
                          <button type="button" disabled={saving} onClick={() => void review(claim, 'verified')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><BadgeCheck size={15} /> Verify claim</button>
                          <button type="button" disabled={saving} onClick={() => void review(claim, 'denied')} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Deny</button>
                        </>
                      ) : claim.status === 'verified' ? (
                        <button type="button" disabled={saving} onClick={() => void review(claim, 'revoked')} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><ShieldCheck size={15} /> Revoke verified claim</button>
                      ) : null}
                      {saving ? <span className="inline-flex items-center gap-2 px-2 text-sm text-gray-500"><LoaderCircle size={15} className="animate-spin" /> Saving…</span> : null}
                    </div>
                    {claim.status === 'verified' ? <p className="mt-3 text-xs leading-5 text-emerald-800">Verification grants the approved owner, manager, or editor role automatically. If this listing did not already have a canonical organization, SwingSphere creates and links one during approval.</p> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminListingClaims;
