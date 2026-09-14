import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, ChevronRight, CircleAlert, Loader2, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { supabase } from '../../lib/supabase';
import * as api from '../../lib/api';
import { getEventCanonicalPath, getListingCanonicalPath } from '../../lib/entityUtils';
import { buildEntityIndex } from '../../lib/entityIndex';
import { getListingPrimaryHeroUrl, getListingPrimaryLogoUrl } from '../../lib/listingImage';
import { listOwnListingClaims, type ListingClaim } from '../../lib/claims/listingClaims';
import type { ClubData, EventData, Listing, OrganizationData, OrganizationMember, OrganizationMemberRole } from '../../types';

const panelClass = 'rounded-2xl border border-white/[0.09] bg-[rgba(8,11,16,0.72)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl';

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationMemberRole;
  status: OrganizationMember['status'];
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  display_types: OrganizationData['displayTypes'];
  description_short: string | null;
  description_full: string | null;
  website: string | null;
  contact_email: string | null;
  logo_image_url: string | null;
  header_image_url: string | null;
  gallery_image_urls: string[] | null;
  status: OrganizationData['status'];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const mapOrganization = (row: OrganizationRow): OrganizationData => ({
  id: row.id,
  type: 'organization',
  name: row.name,
  slug: row.slug,
  displayTypes: row.display_types,
  descriptionShort: row.description_short ?? undefined,
  descriptionFull: row.description_full ?? undefined,
  website: row.website ?? undefined,
  contactEmail: row.contact_email ?? undefined,
  logoImageUrl: row.logo_image_url ?? undefined,
  headerImageUrl: row.header_image_url ?? undefined,
  galleryImageUrls: row.gallery_image_urls ?? [],
  status: row.status,
  postedByUserId: row.created_by ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const formatRole = (role: OrganizationMemberRole): string => role.charAt(0).toUpperCase() + role.slice(1);

type TeamMemberView = OrganizationMember & {
  displayName?: string;
  handle?: string;
};

const HostDashboard: React.FC = () => {
  const { currentUser, addToast } = useAppStore();
  const [memberships, setMemberships] = useState<OrganizationMember[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [verifiedClaims, setVerifiedClaims] = useState<ListingClaim[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMemberView[]>([]);
  const [teamHandle, setTeamHandle] = useState('');
  const [teamRole, setTeamRole] = useState<OrganizationMemberRole>('editor');
  const [teamSaving, setTeamSaving] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const [{ data: membershipRows, error: membershipError }, listingRows, ownClaims] = await Promise.all([
          supabase
            .from('organization_members')
            .select('id, organization_id, user_id, role, status, invited_by, created_at, updated_at')
            .eq('user_id', currentUser.id)
            .in('status', ['active', 'invited'])
            .order('created_at', { ascending: true }),
          api.getListings(),
          listOwnListingClaims(),
        ]);
        if (membershipError) throw membershipError;

        const mappedMemberships = ((membershipRows ?? []) as MembershipRow[]).map((row) => ({
          id: row.id,
          organizationId: row.organization_id,
          userId: row.user_id,
          role: row.role,
          status: row.status,
          invitedBy: row.invited_by ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        const organizationIds = mappedMemberships.map((membership) => membership.organizationId);
        let mappedOrganizations: OrganizationData[] = [];
        if (organizationIds.length) {
          const { data: organizationRows, error: organizationError } = await supabase
            .from('organizations')
            .select('id, name, slug, display_types, description_short, description_full, website, contact_email, logo_image_url, header_image_url, gallery_image_urls, status, created_by, created_at, updated_at')
            .in('id', organizationIds)
            .order('name');
          if (organizationError) throw organizationError;
          mappedOrganizations = ((organizationRows ?? []) as OrganizationRow[]).map(mapOrganization);
        }

        if (!cancelled) {
          setMemberships(mappedMemberships);
          setOrganizations(mappedOrganizations);
          setListings(listingRows);
          setVerifiedClaims(ownClaims.filter((claim) => claim.status === 'verified'));
          setSelectedOrganizationId((current) => current || mappedOrganizations[0]?.id || '');
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load your promoter workspace.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [currentUser]);

  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) ?? organizations[0] ?? null;
  const selectedMembership = memberships.find((membership) => membership.organizationId === selectedOrganization?.id) ?? null;

  useEffect(() => {
    if (!selectedOrganization || !selectedMembership || !['owner', 'manager'].includes(selectedMembership.role)) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    const loadTeam = async () => {
      const { data: memberRows, error: memberError } = await supabase
        .from('organization_members')
        .select('id, organization_id, user_id, role, status, invited_by, created_at, updated_at')
        .eq('organization_id', selectedOrganization.id)
        .in('status', ['active', 'invited'])
        .order('created_at');
      if (memberError) throw memberError;
      const rows = (memberRows ?? []) as MembershipRow[];
      const userIds = rows.map((row) => row.user_id);
      const { data: profileRows, error: profileError } = userIds.length
        ? await supabase.from('profiles').select('id, display_name, handle').in('id', userIds)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const profileById = new Map((profileRows ?? []).map((profile) => [profile.id, profile] as const));
      if (!cancelled) {
        setTeamMembers(rows.map((row) => ({
          id: row.id,
          organizationId: row.organization_id,
          userId: row.user_id,
          role: row.role,
          status: row.status,
          invitedBy: row.invited_by ?? undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          displayName: profileById.get(row.user_id)?.display_name ?? undefined,
          handle: profileById.get(row.user_id)?.handle ?? undefined,
        })));
      }
    };
    void loadTeam().catch((loadError) => {
      if (!cancelled) addToast({ message: loadError instanceof Error ? loadError.message : 'Could not load organization team.', type: 'error' });
    });
    return () => { cancelled = true; };
  }, [addToast, selectedMembership, selectedOrganization]);

  const entityIndex = useMemo(() => buildEntityIndex(listings, [], [], organizations, []), [listings, organizations]);
  const verifiedClaimByEntityId = useMemo(
    () => new Map(verifiedClaims.map((claim) => [claim.entityId, claim] as const)),
    [verifiedClaims],
  );
  const managedEvents = useMemo(() => listings.filter((listing): listing is EventData => (
    listing.type === 'event'
    && listing.status !== 'pending_approval'
    && (
      (selectedOrganization ? listing.organizerOrganizationId === selectedOrganization.id : false)
      || verifiedClaimByEntityId.has(listing.id)
    )
  )), [listings, selectedOrganization, verifiedClaimByEntityId]);
  const managedClubs = useMemo(() => listings.filter((listing): listing is ClubData => (
    listing.type === 'club'
    && listing.status !== 'pending_approval'
    && (
      (selectedOrganization ? listing.ownerOrganizationId === selectedOrganization.id : false)
      || verifiedClaimByEntityId.has(listing.id)
    )
  )), [listings, selectedOrganization, verifiedClaimByEntityId]);
  const primaryManagedClub = managedClubs.find((club) => (
    selectedOrganization ? club.ownerOrganizationId === selectedOrganization.id : verifiedClaimByEntityId.has(club.id)
  )) ?? managedClubs[0] ?? null;
  const primaryManagedClubHeroUrl = getListingPrimaryHeroUrl(primaryManagedClub);
  const primaryManagedClubLogoUrl = getListingPrimaryLogoUrl(primaryManagedClub) ?? selectedOrganization?.logoImageUrl ?? null;
  const upcomingEvents = useMemo(() => managedEvents
    .filter((listing) => new Date(listing.time.start).getTime() >= Date.now())
    .sort((a, b) => new Date(a.time.start).getTime() - new Date(b.time.start).getTime()), [managedEvents]);

  if (!currentUser) return null;

  const claimRoleRank: Record<OrganizationMemberRole, number> = { editor: 1, manager: 2, owner: 3 };
  const verifiedClaimRole = verifiedClaims.reduce<OrganizationMemberRole | null>((best, claim) => {
    const nextRole = claim.requestedRole as OrganizationMemberRole;
    if (!best || claimRoleRank[nextRole] > claimRoleRank[best]) return nextRole;
    return best;
  }, null);
  const effectiveRole = selectedMembership?.role ?? verifiedClaimRole;
  const publicProfilePath = selectedOrganization ? `/hosts/${selectedOrganization.slug}` : (currentUser.handle ? `/users/${currentUser.handle}` : '/account');
  const managedCount = managedClubs.length + managedEvents.length;
  const canManageTeam = selectedMembership?.role === 'owner' || selectedMembership?.role === 'manager';
  const assignableRoles: OrganizationMemberRole[] = selectedMembership?.role === 'owner'
    ? ['owner', 'manager', 'editor']
    : ['editor'];

  const addTeamMember = async () => {
    if (!selectedOrganization || !selectedMembership || !canManageTeam || teamSaving) return;
    const handle = teamHandle.trim().replace(/^@/, '');
    if (!handle) {
      addToast({ message: 'Enter the member’s SwingSphere handle.', type: 'error' });
      return;
    }
    const roleToAssign = assignableRoles.includes(teamRole) ? teamRole : assignableRoles[0];
    if (!roleToAssign) {
      addToast({ message: 'Your role cannot assign team access.', type: 'error' });
      return;
    }

    setTeamSaving(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, handle')
        .eq('handle', handle)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error(`No SwingSphere member found for @${handle}.`);

      const existing = teamMembers.find((member) => member.userId === profile.id);
      let savedRow: MembershipRow;
      if (existing) {
        const { data, error: updateError } = await supabase
          .from('organization_members')
          .update({ role: roleToAssign, status: 'active' })
          .eq('id', existing.id)
          .select('id, organization_id, user_id, role, status, invited_by, created_at, updated_at')
          .single();
        if (updateError) throw updateError;
        savedRow = data as MembershipRow;
      } else {
        const { data, error: insertError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: selectedOrganization.id,
            user_id: profile.id,
            role: roleToAssign,
            status: 'active',
            invited_by: currentUser.id,
          })
          .select('id, organization_id, user_id, role, status, invited_by, created_at, updated_at')
          .single();
        if (insertError) throw insertError;
        savedRow = data as MembershipRow;
      }

      const next: TeamMemberView = {
        id: savedRow.id,
        organizationId: savedRow.organization_id,
        userId: savedRow.user_id,
        role: savedRow.role,
        status: savedRow.status,
        invitedBy: savedRow.invited_by ?? undefined,
        createdAt: savedRow.created_at,
        updatedAt: savedRow.updated_at,
        displayName: profile.display_name ?? undefined,
        handle: profile.handle ?? undefined,
      };
      setTeamMembers((current) => [...current.filter((member) => member.userId !== next.userId), next]);
      setTeamHandle('');
      addToast({ message: `${profile.display_name || `@${handle}`} now has ${formatRole(roleToAssign)} access.`, type: 'success' });
    } catch (saveError) {
      addToast({ message: saveError instanceof Error ? saveError.message : 'Could not update the organization team.', type: 'error' });
    } finally {
      setTeamSaving(false);
    }
  };

  const removeTeamMember = async (member: TeamMemberView) => {
    if (!selectedMembership || teamSaving) return;
    if (member.userId === currentUser.id) {
      addToast({ message: 'Use ownership transfer before removing your own access.', type: 'error' });
      return;
    }
    if (selectedMembership.role === 'manager' && member.role !== 'editor') {
      addToast({ message: 'Managers can remove editors only.', type: 'error' });
      return;
    }
    setTeamSaving(true);
    try {
      const { error: deleteError } = await supabase.from('organization_members').delete().eq('id', member.id);
      if (deleteError) throw deleteError;
      setTeamMembers((current) => current.filter((candidate) => candidate.id !== member.id));
      addToast({ message: 'Team access removed.', type: 'success' });
    } catch (removeError) {
      addToast({ message: removeError instanceof Error ? removeError.message : 'Could not remove team access.', type: 'error' });
    } finally {
      setTeamSaving(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className={`${panelClass} mb-6 overflow-hidden`}>
        <div className="flex flex-col gap-6 border-b border-white/[0.08] px-6 py-7 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/[0.08] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-200">Promoter workspace</div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">Welcome, {currentUser.displayName}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400 md:text-base">Manage organizations assigned to your account, review linked clubs and events, and create new submissions.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to={publicProfilePath} className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-red-400/45 hover:text-white">View public profile</Link>
            <Link to={selectedOrganization ? `/submission?organizationId=${encodeURIComponent(selectedOrganization.id)}` : '/submission'} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500"><Plus size={16} /> Create listing</Link>
          </div>
        </div>

        <div className="grid gap-px bg-white/[0.06] sm:grid-cols-4">
          {[
            [organizations.length ? organizations.length.toString() : verifiedClaims.length ? 'Pending link' : '0', 'Organizations'],
            [managedClubs.length.toString(), 'Managed clubs'],
            [managedEvents.length.toString(), 'Managed events'],
            [effectiveRole ? formatRole(effectiveRole) : 'Unassigned', 'Access level'],
          ].map(([value, label]) => <div key={label} className="bg-[rgba(8,11,16,0.86)] px-6 py-5 md:px-8"><div className="text-2xl font-black text-white">{value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div></div>)}
        </div>
        {!selectedMembership && verifiedClaims.length > 0 ? (
          <div className="border-t border-amber-300/15 bg-amber-300/[0.05] px-6 py-4 text-sm text-amber-100/85 md:px-8">
            Your listing claim is verified and its content access is active. The canonical organization membership is still being linked, so team-management controls are temporarily unavailable.
          </div>
        ) : null}
      </div>

      {isLoading ? <div className={`${panelClass} flex min-h-64 items-center justify-center text-gray-400`}><Loader2 className="mr-2 animate-spin" size={20} /> Loading promoter workspace…</div> : error ? (
        <div className={`${panelClass} flex items-start gap-3 border-red-400/20 p-6 text-red-200`}><CircleAlert className="mt-0.5 shrink-0" size={20} /><div><h2 className="font-bold">Workspace could not load</h2><p className="mt-1 text-sm text-red-200/75">{error}</p></div></div>
      ) : organizations.length === 0 && verifiedClaims.length === 0 ? (
        <div className={`${panelClass} p-8 text-center md:p-12`}>
          <Users className="mx-auto text-gray-500" size={42} />
          <h2 className="mt-4 text-2xl font-bold text-white">No management access assigned yet</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-400">Verified listing claims and organization memberships will appear here automatically once access is granted.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr]">
          <div className="space-y-6">
            <div className={`${panelClass} p-6 md:p-8`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Organization</p><h2 className="mt-2 text-xl font-bold text-white">Current workspace</h2></div>
                {organizations.length > 1 && <select value={selectedOrganization?.id ?? ''} onChange={(event) => setSelectedOrganizationId(event.target.value)} className="rounded-xl border border-white/[0.12] bg-black/35 px-4 py-2.5 text-sm font-semibold text-white focus:border-red-400 focus:outline-none">{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select>}
              </div>

              {selectedOrganization ? (
                primaryManagedClub ? (
                  <Link
                    to={getListingCanonicalPath(primaryManagedClub, entityIndex)}
                    className="group relative mt-6 block min-h-[164px] overflow-hidden rounded-2xl border border-white/[0.09] bg-black/30 transition hover:border-red-400/35"
                  >
                    {primaryManagedClubHeroUrl ? (
                      <img
                        src={primaryManagedClubHeroUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-[1.015] group-hover:opacity-65"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,11,0.96)_0%,rgba(5,7,11,0.82)_48%,rgba(5,7,11,0.48)_100%)]" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.38))]" />
                    <div className="relative flex min-h-[164px] items-center gap-5 p-5 md:p-6">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.14] bg-black/55 text-xl font-black text-white shadow-[0_14px_34px_rgba(0,0,0,0.35)] backdrop-blur-sm">
                        {primaryManagedClubLogoUrl ? (
                          <img src={primaryManagedClubLogoUrl} alt={`${primaryManagedClub.name} logo`} className="h-full w-full object-contain p-1" />
                        ) : (
                          primaryManagedClub.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-xl font-bold text-white md:text-2xl">{primaryManagedClub.name}</h3>
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/[0.12] px-2.5 py-1 text-xs font-bold text-emerald-200 backdrop-blur-sm">{selectedMembership?.status ?? 'active'}</span>
                        </div>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">{selectedOrganization.descriptionShort || 'Open the managed club listing to update its public page.'}</p>
                        <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-red-200 transition group-hover:text-white">View club listing <ChevronRight size={14} className="transition group-hover:translate-x-0.5" /></div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="mt-6 flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.1] bg-black/35 text-xl font-black text-white">{selectedOrganization.logoImageUrl ? <img src={selectedOrganization.logoImageUrl} alt="" className="h-full w-full object-contain" /> : selectedOrganization.name.slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold text-white">{selectedOrganization.name}</h3><span className="rounded-full border border-emerald-400/20 bg-emerald-500/[0.08] px-2.5 py-1 text-xs font-bold text-emerald-300">{selectedMembership?.status ?? 'active'}</span></div><p className="mt-2 text-sm leading-6 text-gray-400">{selectedOrganization.descriptionShort || 'Add a public organization description to help visitors understand this host or promoter.'}</p></div>
                  </div>
                )
              ) : (
                <div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-5">
                  <div className="text-sm font-bold text-amber-100">Verified listing access</div>
                  <p className="mt-2 text-sm leading-6 text-gray-400">Your verified listings are available below while SwingSphere finishes linking the canonical organization record.</p>
                </div>
              )}
            </div>

            <div className={`${panelClass} p-6 md:p-8`}>
              <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Managed content</p><h2 className="mt-2 text-xl font-bold text-white">Clubs and events</h2></div><span className="text-sm font-semibold text-gray-400">{managedCount} total</span></div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                  <div className="flex items-center gap-2 text-white"><Building2 size={18} className="text-red-300" /><h3 className="font-bold">Clubs</h3></div>
                  <div className="mt-4 space-y-3">
                    {managedClubs.slice(0, 5).map((club) => (
                      <div key={club.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                        <Link to={getListingCanonicalPath(club, entityIndex)} className="flex items-center justify-between text-sm font-semibold text-gray-100 transition hover:text-white"><span className="truncate">{club.name}</span><ChevronRight size={15} /></Link>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link to={`/submission/${encodeURIComponent(club.id)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:border-red-400/35 hover:text-white"><Pencil size={12} /> Edit listing</Link>
                          <Link to={selectedOrganization ? `/submission?type=event&organizationId=${encodeURIComponent(selectedOrganization.id)}&clubId=${encodeURIComponent(club.id)}` : `/submission?type=event&clubId=${encodeURIComponent(club.id)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/[0.08] px-2.5 py-1.5 text-xs font-semibold text-red-200 hover:border-red-400/45 hover:text-white"><Plus size={12} /> Add event</Link>
                        </div>
                      </div>
                    ))}
                    {managedClubs.length === 0 && <p className="text-sm leading-6 text-gray-500">No clubs are linked to this organization yet.</p>}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                  <div className="flex items-center gap-2 text-white"><CalendarDays size={18} className="text-red-300" /><h3 className="font-bold">Upcoming events</h3></div>
                  <div className="mt-4 space-y-3">
                    {upcomingEvents.slice(0, 5).map((event) => (
                      <div key={event.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                        <Link to={getEventCanonicalPath(event, entityIndex)} className="flex items-center justify-between text-sm font-semibold text-gray-100 transition hover:text-white"><span className="truncate">{event.name}</span><ChevronRight size={15} /></Link>
                        <Link to={`/submission/${encodeURIComponent(event.id)}`} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:border-red-400/35 hover:text-white"><Pencil size={12} /> Edit event</Link>
                      </div>
                    ))}
                    {upcomingEvents.length === 0 && <p className="text-sm leading-6 text-gray-500">No upcoming events are linked right now.</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`${panelClass} p-6 md:p-7`}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Permissions</p><h2 className="mt-2 text-xl font-bold text-white">Your access</h2><div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-5"><div className="text-2xl font-black text-white">{effectiveRole ? formatRole(effectiveRole) : 'None'}</div><p className="mt-2 text-sm leading-6 text-gray-400">{effectiveRole === 'owner' ? (selectedMembership ? 'Full organization and team control.' : 'Verified owner access to claimed listings. Team controls unlock when the organization link is active.') : effectiveRole === 'manager' ? (selectedMembership ? 'Manage the organization and its content.' : 'Verified manager access to claimed listings. Team controls unlock when the organization link is active.') : 'Edit assigned content without ownership controls.'}</p></div></div>
            {canManageTeam ? (
              <div className={`${panelClass} p-6 md:p-7`}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Team</p>
                <h2 className="mt-2 text-xl font-bold text-white">Organization access</h2>
                <p className="mt-2 text-sm leading-6 text-gray-400">{selectedMembership?.role === 'owner' ? 'Owners can assign owners, managers, and editors.' : 'Managers can add and remove editors.'}</p>
                <div className="mt-5 space-y-2">
                  {teamMembers.map((member) => {
                    const removable = member.userId !== currentUser.id && (selectedMembership?.role === 'owner' || member.role === 'editor');
                    return (
                      <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{member.displayName || member.handle || member.userId}</div>
                          <div className="mt-0.5 text-xs text-gray-500">{member.handle ? `@${member.handle} · ` : ''}{formatRole(member.role)}</div>
                        </div>
                        {removable ? <button type="button" disabled={teamSaving} onClick={() => void removeTeamMember(member)} className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40" aria-label={`Remove ${member.displayName || member.handle || 'member'}`}><Trash2 size={15} /></button> : null}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 space-y-3 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                  <label className="block text-xs font-semibold text-gray-400">Member handle
                    <input value={teamHandle} onChange={(event) => setTeamHandle(event.target.value)} placeholder="@username" className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-red-400/50" />
                  </label>
                  <label className="block text-xs font-semibold text-gray-400">Role
                    <select value={assignableRoles.includes(teamRole) ? teamRole : assignableRoles[0]} onChange={(event) => setTeamRole(event.target.value as OrganizationMemberRole)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-red-400/50">
                      {assignableRoles.map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={teamSaving || !teamHandle.trim()} onClick={() => void addTeamMember()} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-45"><UserPlus size={15} /> {teamSaving ? 'Updating…' : 'Add team member'}</button>
                </div>
              </div>
            ) : null}
            <div className={`${panelClass} p-6 md:p-7`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Next actions</p>
              <h2 className="mt-2 text-xl font-bold text-white">Keep listings current</h2>
              <div className="mt-5 space-y-3">
                <Link
                  to={selectedOrganization ? `/submission?type=club&organizationId=${encodeURIComponent(selectedOrganization.id)}` : '/submission?type=club'}
                  className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:border-red-400/35 hover:text-white"
                >
                  <span>Create a club</span><ChevronRight size={16} />
                </Link>
                <Link
                  to={primaryManagedClub
                    ? `${selectedOrganization ? `/submission?type=event&organizationId=${encodeURIComponent(selectedOrganization.id)}` : '/submission?type=event'}&clubId=${encodeURIComponent(primaryManagedClub.id)}`
                    : selectedOrganization ? `/submission?type=event&organizationId=${encodeURIComponent(selectedOrganization.id)}` : '/submission?type=event'}
                  className="flex items-center justify-between rounded-xl border border-red-400/20 bg-red-500/[0.07] px-4 py-3 text-sm font-semibold text-red-100 transition hover:border-red-400/45 hover:bg-red-500/[0.1] hover:text-white"
                >
                  <span>{primaryManagedClub ? `Create event for ${primaryManagedClub.name}` : 'Create an event'}</span><ChevronRight size={16} />
                </Link>
                <Link to={publicProfilePath} className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:border-red-400/35 hover:text-white"><span>Review public profile</span><ChevronRight size={16} /></Link>
              </div>
              <p className="mt-4 text-xs leading-5 text-gray-500">{selectedOrganization ? 'Verified organization roles authorize full listing updates. New owner/promoter submissions still enter the normal moderation queue before public publication.' : 'Your verified listing access is active. New listings can still be started while SwingSphere finishes linking the canonical organization.'}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default HostDashboard;
