import React, { useEffect, useState } from 'react';
import { BadgeCheck, Building2, ChevronDown, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import {
  createListingClaim,
  getOwnListingClaimById,
  getOwnListingClaimForEntity,
  withdrawListingClaim,
  type ListingClaim,
  type ListingClaimEntityType,
  type ListingClaimRole,
  type ListingClaimStatus,
} from '../../lib/claims/listingClaims';

type ListingClaimCardProps = {
  entityType: ListingClaimEntityType;
  entityId: string;
  entityName: string;
  organizationId?: string;
  defaultRole?: ListingClaimRole;
};

const statusLabels: Record<ListingClaimStatus, string> = {
  pending: 'Pending review',
  information_requested: 'Information requested',
  under_review: 'Under review',
  verified: 'Verified',
  denied: 'Not approved',
  withdrawn: 'Withdrawn',
  revoked: 'Access revoked',
  superseded: 'Superseded',
};

const openStatuses = new Set<ListingClaimStatus>(['pending', 'information_requested', 'under_review']);

const ListingClaimCard: React.FC<ListingClaimCardProps> = ({
  entityType,
  entityId,
  entityName,
  organizationId,
  defaultRole = 'manager',
}) => {
  const { currentUser, addToast } = useAppStore();
  const { canEdit: hasOrganizationAccess, isChecking: isCheckingAccess } = usePublicEditAccess({
    organizationIds: [organizationId],
  });
  const [claim, setClaim] = useState<ListingClaim | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(currentUser));
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingWithdraw, setIsConfirmingWithdraw] = useState(false);
  const [requestedRole, setRequestedRole] = useState<ListingClaimRole>(defaultRole);
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    if (!currentUser) {
      setClaim(null);
      setIsLoading(false);
      return () => { active = false; };
    }

    setIsLoading(true);
    getOwnListingClaimForEntity(entityType, entityId)
      .then((nextClaim) => {
        if (active) setClaim(nextClaim);
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.warn('Unable to load listing claim:', error);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [currentUser, entityId, entityType]);

  const submitClaim = async () => {
    if (!currentUser || isSaving) return;
    setIsSaving(true);
    try {
      const created = await createListingClaim({
        entityType,
        entityId,
        organizationId,
        requestedRole,
        claimantNote: note.trim() || undefined,
      });
      const confirmed = await getOwnListingClaimById(created.id);
      if (!confirmed || confirmed.id !== created.id || !openStatuses.has(confirmed.status)) {
        throw new Error('SwingSphere could not confirm the new claim in the review queue. Refresh this page before trying again.');
      }
      setClaim(confirmed);
      setIsOpen(false);
      setNote('');
      setIsConfirmingWithdraw(false);
      addToast({ message: 'Listing claim submitted and confirmed in the review queue.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to submit listing claim.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const withdrawClaim = async () => {
    if (!claim || isSaving) return;
    setIsSaving(true);
    try {
      const withdrawn = await withdrawListingClaim(claim.id);
      setClaim(withdrawn);
      setIsConfirmingWithdraw(false);
      setIsOpen(false);
      setRequestedRole(defaultRole);
      setNote('');
      addToast({ message: 'Listing claim withdrawn. You can submit a new request at any time.', type: 'success' });
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to withdraw listing claim.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const isManagedListing = Boolean(organizationId) || hasOrganizationAccess || claim?.status === 'verified';
  if (!isLoading && !isCheckingAccess && isManagedListing) return null;

  return (
    <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-300/15 bg-red-400/[0.08] text-red-200">
          <Building2 size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Listing access</p>
          <h2 className="mt-1 text-sm font-semibold text-gray-100">Manage {entityName}</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">Official owners, managers, and promoters can request access through a manual authority check.</p>
        </div>
      </div>

      {isLoading || isCheckingAccess ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500"><LoaderCircle size={14} className="animate-spin" /> Checking listing access…</div>
      ) : hasOrganizationAccess ? (
        <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><BadgeCheck size={15} /> Management access active</div>
          <p className="mt-2 text-xs leading-5 text-gray-500">Your organization role already grants access to manage this listing and its connected content.</p>
          <Link to="/host-dashboard" className="mt-3 flex min-h-10 w-full items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.08] px-4 text-xs font-bold text-emerald-100 hover:bg-emerald-300/[0.12]">Open management dashboard</Link>
        </div>
      ) : claim && (openStatuses.has(claim.status) || claim.status === 'verified') ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
            {claim.status === 'verified' ? <BadgeCheck size={15} className="text-emerald-300" /> : <ShieldCheck size={15} className="text-amber-300" />}
            {statusLabels[claim.status]}
          </div>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            {claim.status === 'information_requested'
              ? claim.decisionReason || 'SwingSphere needs another verification detail before completing this claim.'
              : claim.status === 'verified'
                ? claim.verificationSummary || 'Authority was verified and your approved management role is now active.'
                : 'Your request is recorded. SwingSphere will verify control through an official contact, social account, website challenge, invitation, or another proportionate method.'}
          </p>
          {claim.status === 'verified' ? (
            <Link
              to="/host-dashboard"
              className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive mt-3 flex min-h-10 w-full items-center justify-center rounded-xl px-4 text-xs font-bold text-white"
            >
              Open management dashboard
            </Link>
          ) : null}
          {openStatuses.has(claim.status) ? (
            isConfirmingWithdraw ? (
              <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.05] p-3">
                <p className="text-xs font-semibold text-amber-100">Withdraw this claim?</p>
                <p className="mt-1 text-[11px] leading-5 text-gray-500">This removes the request from the review queue. You can submit a new claim later.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsConfirmingWithdraw(false)}
                    className="min-h-9 flex-1 rounded-lg border border-white/10 px-3 text-xs font-semibold text-gray-300 hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    Keep request
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void withdrawClaim()}
                    className="min-h-9 flex-1 rounded-lg border border-red-300/20 bg-red-400/[0.08] px-3 text-xs font-bold text-red-200 hover:bg-red-400/[0.12] disabled:opacity-50"
                  >
                    {isSaving ? 'Withdrawing…' : 'Yes, withdraw'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setIsConfirmingWithdraw(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200 disabled:opacity-50"
              >
                <X size={13} /> Withdraw request
              </button>
            )
          ) : null}
        </div>
      ) : currentUser ? (
        <>
          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            aria-expanded={isOpen}
            className="ss-glass ss-glass--ambient ss-glass--interactive mt-4 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-gray-200"
          >
            Request listing access
            <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen ? (
            <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="block text-xs text-gray-400">
                Requested role
                <select
                  value={requestedRole}
                  onChange={(event) => setRequestedRole(event.target.value as ListingClaimRole)}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-gray-100 outline-none focus:border-red-300/40"
                >
                  <option value="owner">Owner</option>
                  <option value="manager">Manager</option>
                  <option value="editor">Editor</option>
                </select>
              </label>

              <label className="block text-xs text-gray-400">
                Best way to verify your authority
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 2000))}
                  rows={4}
                  placeholder="Example: Contact me through the email already listed on our official website, or message the established Instagram account."
                  className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-600 focus:border-red-300/40"
                />
              </label>

              <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
                Do not paste government ID numbers, banking details, home addresses, or sensitive documents here. SwingSphere will start with official email, public contact, social-account, website, invitation, or live verification methods.
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void submitClaim()}
                className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive flex min-h-10 w-full items-center justify-center rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50"
              >
                {isSaving ? 'Submitting…' : 'Submit claim request'}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <Link
          to="/login"
          className="ss-glass ss-glass--ambient ss-glass--interactive mt-4 flex min-h-10 items-center justify-center rounded-xl px-4 text-xs font-semibold text-gray-200"
        >
          Sign in to request access
        </Link>
      )}
    </section>
  );
};

export default ListingClaimCard;
