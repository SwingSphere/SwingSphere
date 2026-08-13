import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, ChevronRight, CircleAlert, Loader2, Plus, Users } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { supabase } from '../../lib/supabase';
import * as api from '../../lib/api';
import { getEventCanonicalPath, getListingCanonicalPath } from '../../lib/entityUtils';
import { buildEntityIndex } from '../../lib/entityIndex';
import type { Listing, OrganizationData, OrganizationMember, OrganizationMemberRole } from '../../types';

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

const HostDashboard: React.FC = () => {
  const { currentUser } = useAppStore();
  const [memberships, setMemberships] = useState<OrganizationMember[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const [{ data: membershipRows, error: membershipError }, listingRows] = await Promise.all([
          supabase
            .from('organization_members')
            .select('id, organization_id, user_id, role, status, invited_by, created_at, updated_at')
            .eq('user_id', currentUser.id)
            .in('status', ['active', 'invited'])
            .order('created_at', { ascending: true }),
          api.getListings(),
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

  const entityIndex = useMemo(() => buildEntityIndex(listings, [], [], organizations, []), [listings, organizations]);
  const managedEvents = useMemo(() => selectedOrganization
    ? listings.filter((listing) => listing.type === 'event' && listing.organizerOrganizationId === selectedOrganization.id)
    : [], [listings, selectedOrganization]);
  const managedClubs = useMemo(() => selectedOrganization
    ? listings.filter((listing) => listing.type === 'club' && (listing.ownerOrganizationId === selectedOrganization.id || listing.postedByUserId === currentUser?.id))
    : [], [currentUser?.id, listings, selectedOrganization]);
  const upcomingEvents = useMemo(() => managedEvents
    .filter((listing) => listing.type === 'event' && new Date(listing.time.start).getTime() >= Date.now())
    .sort((a, b) => new Date(a.time.start).getTime() - new Date(b.time.start).getTime()), [managedEvents]);

  if (!currentUser) return null;

  const publicProfilePath = selectedOrganization ? `/hosts/${selectedOrganization.slug}` : (currentUser.handle ? `/users/${currentUser.handle}` : '/account');
  const managedCount = managedClubs.length + managedEvents.length;

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
            <Link to="/submission" className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500"><Plus size={16} /> Create listing</Link>
          </div>
        </div>

        <div className="grid gap-px bg-white/[0.06] sm:grid-cols-4">
          {[
            [organizations.length.toString(), 'Organizations'],
            [managedClubs.length.toString(), 'Managed clubs'],
            [managedEvents.length.toString(), 'Managed events'],
            [selectedMembership ? formatRole(selectedMembership.role) : 'Unassigned', 'Access level'],
          ].map(([value, label]) => <div key={label} className="bg-[rgba(8,11,16,0.86)] px-6 py-5 md:px-8"><div className="text-2xl font-black text-white">{value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div></div>)}
        </div>
      </div>

      {isLoading ? <div className={`${panelClass} flex min-h-64 items-center justify-center text-gray-400`}><Loader2 className="mr-2 animate-spin" size={20} /> Loading promoter workspace…</div> : error ? (
        <div className={`${panelClass} flex items-start gap-3 border-red-400/20 p-6 text-red-200`}><CircleAlert className="mt-0.5 shrink-0" size={20} /><div><h2 className="font-bold">Workspace could not load</h2><p className="mt-1 text-sm text-red-200/75">{error}</p></div></div>
      ) : organizations.length === 0 ? (
        <div className={`${panelClass} p-8 text-center md:p-12`}>
          <Users className="mx-auto text-gray-500" size={42} />
          <h2 className="mt-4 text-2xl font-bold text-white">No organization assigned yet</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-400">Your promoter role is active, but an administrator still needs to connect your account to a host or promoter organization. Once assigned, its clubs and events will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr]">
          <div className="space-y-6">
            <div className={`${panelClass} p-6 md:p-8`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Organization</p><h2 className="mt-2 text-xl font-bold text-white">Current workspace</h2></div>
                {organizations.length > 1 && <select value={selectedOrganization?.id ?? ''} onChange={(event) => setSelectedOrganizationId(event.target.value)} className="rounded-xl border border-white/[0.12] bg-black/35 px-4 py-2.5 text-sm font-semibold text-white focus:border-red-400 focus:outline-none">{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select>}
              </div>

              {selectedOrganization && <div className="mt-6 flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.1] bg-black/35 text-xl font-black text-white">{selectedOrganization.logoImageUrl ? <img src={selectedOrganization.logoImageUrl} alt="" className="h-full w-full object-contain" /> : selectedOrganization.name.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold text-white">{selectedOrganization.name}</h3><span className="rounded-full border border-emerald-400/20 bg-emerald-500/[0.08] px-2.5 py-1 text-xs font-bold text-emerald-300">{selectedMembership?.status ?? 'active'}</span></div><p className="mt-2 text-sm leading-6 text-gray-400">{selectedOrganization.descriptionShort || 'Add a public organization description to help visitors understand this host or promoter.'}</p></div>
              </div>}
            </div>

            <div className={`${panelClass} p-6 md:p-8`}>
              <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Managed content</p><h2 className="mt-2 text-xl font-bold text-white">Clubs and events</h2></div><span className="text-sm font-semibold text-gray-400">{managedCount} total</span></div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5"><div className="flex items-center gap-2 text-white"><Building2 size={18} className="text-red-300" /><h3 className="font-bold">Clubs</h3></div><div className="mt-4 space-y-2">{managedClubs.slice(0, 5).map((club) => <Link key={club.id} to={getListingCanonicalPath(club, entityIndex)} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-sm text-gray-200 transition hover:border-red-400/30 hover:text-white"><span className="truncate">{club.name}</span><ChevronRight size={15} /></Link>)}{managedClubs.length === 0 && <p className="text-sm leading-6 text-gray-500">No clubs are linked to this organization yet.</p>}</div></div>
                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5"><div className="flex items-center gap-2 text-white"><CalendarDays size={18} className="text-red-300" /><h3 className="font-bold">Upcoming events</h3></div><div className="mt-4 space-y-2">{upcomingEvents.slice(0, 5).map((event) => <Link key={event.id} to={getEventCanonicalPath(event, entityIndex)} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-sm text-gray-200 transition hover:border-red-400/30 hover:text-white"><span className="truncate">{event.name}</span><ChevronRight size={15} /></Link>)}{upcomingEvents.length === 0 && <p className="text-sm leading-6 text-gray-500">No upcoming events are linked right now.</p>}</div></div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`${panelClass} p-6 md:p-7`}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Permissions</p><h2 className="mt-2 text-xl font-bold text-white">Your access</h2><div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-5"><div className="text-2xl font-black text-white">{selectedMembership ? formatRole(selectedMembership.role) : 'None'}</div><p className="mt-2 text-sm leading-6 text-gray-400">{selectedMembership?.role === 'owner' ? 'Full organization and team control.' : selectedMembership?.role === 'manager' ? 'Manage the organization and its content.' : 'Edit assigned content without ownership controls.'}</p></div></div>
            <div className={`${panelClass} p-6 md:p-7`}><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Next actions</p><h2 className="mt-2 text-xl font-bold text-white">Keep listings current</h2><div className="mt-5 space-y-3"><Link to="/submission" className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:border-red-400/35 hover:text-white"><span>Create a club or event</span><ChevronRight size={16} /></Link><Link to={publicProfilePath} className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:border-red-400/35 hover:text-white"><span>Review public profile</span><ChevronRight size={16} /></Link></div><p className="mt-4 text-xs leading-5 text-gray-500">Direct promoter editing of organization and listing records will use these membership permissions as the authorization source.</p></div>
          </div>
        </div>
      )}
    </section>
  );
};

export default HostDashboard;
