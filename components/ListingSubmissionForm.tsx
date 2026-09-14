import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ClubData, EventData, Listing } from '../types';
import * as api from '../lib/api';
import { useAppStore } from '../store/appStore';
import ListingEditor from './listing-editor/ListingEditor';
import SubmissionConfirmation from './listing-editor/SubmissionConfirmation';
import { supabase } from '../lib/supabase';
import { getOwnListingClaimForEntity } from '../lib/claims/listingClaims';

const ListingSubmissionForm: React.FC = () => {
  const navigate = useNavigate();
  const { listingId } = useParams<{ listingId?: string }>();
  const [searchParams] = useSearchParams();
  const { currentUser } = useAppStore();
  const currentUserId = currentUser?.id ?? '';
  const currentUserRole = currentUser?.role ?? '';
  const requestedSection = searchParams.get('section');
  const initialStep = requestedSection === 'location' ? 1 : 0;
  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : listingId ? '/account/contributions' : '/';
  const [listingToEdit, setListingToEdit] = useState<ClubData | EventData | null>(null);
  const [submittedListing, setSubmittedListing] = useState<Listing | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(listingId));
  const [prefill, setPrefill] = useState<{ kind?: 'club' | 'event'; organizationId?: string; organizationName?: string; club?: ClubData } | undefined>();
  const [isPrefillLoading, setIsPrefillLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!listingId) return;
    if (listingToEdit?.id === listingId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    void api.getListings()
      .then((listings) => {
        if (cancelled) return;
        const listing = listings.find((item) => item.id === listingId);
        if (!listing || !currentUserId) {
          setLoadError('This listing is unavailable or can no longer be edited.');
          return;
        }

        const isDirectCreator = listing.postedByUserId === currentUserId;
        const isAdmin = currentUserRole === 'Admin';
        const organizationId = listing.type === 'club' ? listing.ownerOrganizationId : listing.organizerOrganizationId;

        if (isDirectCreator || isAdmin) {
          setListingToEdit(listing as ClubData | EventData);
          return;
        }

        const entityType = listing.type === 'club' ? 'club' : 'event';
        return Promise.all([
          organizationId
            ? supabase
                .from('organization_members')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('user_id', currentUserId)
                .eq('status', 'active')
                .limit(1)
            : Promise.resolve({ data: [], error: null }),
          getOwnListingClaimForEntity(entityType, listing.id),
        ]).then(([membershipResult, claim]) => {
          if (membershipResult.error) throw membershipResult.error;
          const hasOrganizationMembership = Boolean(membershipResult.data?.length);
          const hasVerifiedClaim = claim?.status === 'verified';
          if (!hasOrganizationMembership && !hasVerifiedClaim) {
            setLoadError(
              organizationId
                ? 'You do not have active management access to this listing.'
                : 'This listing is not connected to an organization you can manage and no verified claim grants access.',
            );
            return;
          }
          setListingToEdit(listing as ClubData | EventData);
        });
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Unable to load this submission.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentUserId, currentUserRole, listingId, listingToEdit?.id]);

  useEffect(() => {
    if (listingId) return;
    const requestedKind = searchParams.get('type');
    const organizationId = searchParams.get('organizationId') || undefined;
    const clubId = searchParams.get('clubId') || undefined;
    if (requestedKind !== 'club' && requestedKind !== 'event' && !organizationId && !clubId) return;

    let cancelled = false;
    setIsPrefillLoading(true);
    void Promise.all([
      clubId ? api.getListings() : Promise.resolve([] as Listing[]),
      organizationId
        ? supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
      .then(([listings, organizationResult]) => {
        if (cancelled) return;
        if (organizationResult.error) throw organizationResult.error;
        const club = clubId ? listings.find((item): item is ClubData => item.id === clubId && item.type === 'club') : undefined;
        setPrefill({
          kind: requestedKind === 'club' || requestedKind === 'event' ? requestedKind : club ? 'event' : undefined,
          organizationId,
          organizationName: organizationResult.data?.name ?? undefined,
          club,
        });
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Unable to prepare this managed listing.');
      })
      .finally(() => {
        if (!cancelled) setIsPrefillLoading(false);
      });

    return () => { cancelled = true; };
  }, [listingId, searchParams]);

  if (submittedListing) {
    return (
      <SubmissionConfirmation
        listing={submittedListing}
        variant={listingId
          ? (listingToEdit?.status === 'approved' ? 'managed-updated' : 'updated')
          : submittedListing.status === 'approved'
            ? 'published'
            : 'submitted'}
        onViewSubmissions={() => navigate('/account/contributions')}
        onReturn={() => navigate(returnTo)}
        onAddAnother={listingId ? undefined : () => setSubmittedListing(null)}
      />
    );
  }

  if (isLoading || isPrefillLoading) {
    return <div className="ss-bg-geometric min-h-[calc(100vh-72px)] px-6 py-20 text-center text-sm text-gray-400">Loading your submission…</div>;
  }

  if (loadError) {
    return (
      <div className="ss-bg-geometric min-h-[calc(100vh-72px)] px-6 py-20 text-center text-white">
        <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-black/25 p-7">
          <h1 className="text-xl font-bold">Submission unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">{loadError}</p>
          <button type="button" onClick={() => navigate('/account/contributions')} className="mt-5 min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-500">Back to contributions</button>
        </div>
      </div>
    );
  }

  return (
    <ListingEditor
      mode="public"
      initialStep={initialStep}
      listingToEdit={listingToEdit ?? undefined}
      prefill={prefill}
      onSaved={setSubmittedListing}
      onCancel={() => navigate(returnTo)}
    />
  );
};

export default ListingSubmissionForm;
