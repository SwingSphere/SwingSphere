import type {
    BuildingAsset,
    ClubBrandData,
    ClubData,
    EventData,
    EventSeriesData,
    ResortData,
    CruiseSeriesData,
    CruiseSailingData,
    Listing,
    DashboardStats,
    OrganizationData,
    OrganizationRelationship,
    OrganizationMember,
    OrganizationMemberRole,
    OrganizationMemberStatus,
    OrganizationVenueRelationship,
    Review,
    User as UserType,
    VenueData,
    ManualMassingObject,
} from '../types';
import type { User } from '../data/mockUsers';
import type { AuditLogEntry } from '../data/mockAuditLog';
import type { FlaggedContent } from '../data/mockFlaggedContent';
import { normalizeHostName } from './identityUtils';
import { supabase } from './supabase';
import { adminFetchJson } from './adminApi';
import type { BuildingAssetHistoryEvent } from './buildingAssetHistory';
import type { BuildingVerificationEvidenceRecord } from './buildingVerificationEvidence';
import type { BuildingAssetRevision, BuildingPersistenceMode, BuildingVerificationInputSnapshot } from './buildingPersistenceGuard';
import { getBuildingAssetHistoryFromSupabase, getBuildingAssetsFromSupabase, rollbackBuildingAssetInSupabase, saveBuildingAssetToSupabase } from './buildingAssetSupabase';
import * as entityCatalog from './entityCatalogSupabase';
import * as taxonomy from './taxonomySupabase';

import { mockUsers } from '../data/mockUsers';
import { mockAuditLog } from '../data/mockAuditLog';
import { mockFlaggedContent } from '../data/mockFlaggedContent';
import { mockReviews } from '../data/mockReviews';
import { mockVenues } from '../data/mockVenues';
import { mockOrganizations } from '../data/mockOrganizations';
import { mockOrganizationVenueRelationships } from '../data/mockEntityRelationships';
import { eventSeries as mockEventSeries } from '../data/eventSeries';
import { organizationRelationships as mockOrganizationRelationships } from '../data/organizationRelationships';
import { getVenueForListing } from './entityCompatibility';
import { normalizeListing } from './explorerFilters';
import publicListings from 'virtual:swingsphere-public-listings';

const LATENCY = 250;
const isFramed =
    typeof window !== 'undefined' &&
    (() => { try { return window.self !== window.top; } catch { return true; } })();
// @ts-ignore
const USE_MOCK = true; // Force mock data for now to ensure stability
// const USE_MOCK = isFramed || import.meta.env.VITE_FAKE_DATA === "1";


// --- In-memory "database" ---
const DELETED_LISTING_IDS_KEY = 'swingsphere:admin:deleted-listing-ids';

const readDeletedListingIds = (): string[] => {
    if (typeof window === 'undefined') return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(DELETED_LISTING_IDS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
        return [];
    }
};

const persistDeletedListingIds = (ids: string[]) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DELETED_LISTING_IDS_KEY, JSON.stringify(ids));
};

const withoutDeletedLocalListings = (listings: Listing[]): Listing[] => {
    if (!Array.isArray(listings)) {
        throw new Error('Invalid local listings catalog: expected an array of listings.');
    }
    const deletedIds = new Set(readDeletedListingIds());
    return listings
        .filter((listing) => !deletedIds.has(listing.id))
        .map((listing) => normalizeListing({ ...listing }));
};

let db = {
    listings: withoutDeletedLocalListings(publicListings as Listing[]),
    users: [] as User[],
    auditLog: [] as AuditLogEntry[],
    flaggedContent: [] as FlaggedContent[],
    reviews: [] as Review[],
    buildingAssets: [] as BuildingAsset[],
    venues: [...mockVenues],
    organizations: [...mockOrganizations],
    organizationVenueRelationships: [...mockOrganizationVenueRelationships],
    eventSeries: [...mockEventSeries],
    organizationRelationships: [...mockOrganizationRelationships],
};

const isDevPersistenceEnabled = () => typeof window !== 'undefined' && import.meta.env.DEV;

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });
    if (!res.ok) {
        const message = await res.text().catch(() => '');
        throw new Error(message || `Request failed with status ${res.status}.`);
    }
    return res.json() as Promise<T>;
};

const requestAdminJson = async <T>(url: string, init?: RequestInit): Promise<T> => adminFetchJson<T>(url, {
    ...init,
    headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
    },
});

const catalogMutationListeners = new Set<() => void>();

export const subscribeCatalogMutations = (listener: () => void): (() => void) => {
    catalogMutationListeners.add(listener);
    return () => {
        catalogMutationListeners.delete(listener);
    };
};

export const notifyCatalogMutations = () => {
    catalogMutationListeners.forEach((listener) => {
        try {
            listener();
        } catch {
            // Ignore listener errors.
        }
    });
};

export const getBundledCatalogSnapshot = () => ({
    listings: db.listings,
    venues: db.venues,
    organizations: db.organizations,
    organizationVenueRelationships: db.organizationVenueRelationships,
    eventSeries: db.eventSeries,
    organizationRelationships: db.organizationRelationships,
});

const upsertLocalListing = (listing: Listing) => {
    const index = db.listings.findIndex((item) => item.id === listing.id);
    if (index >= 0) {
        db.listings[index] = listing;
    } else {
        db.listings.unshift(listing);
    }
    const deletedIds = readDeletedListingIds();
    if (deletedIds.includes(listing.id)) {
        persistDeletedListingIds(deletedIds.filter((id) => id !== listing.id));
    }
    notifyCatalogMutations();
};

const removeLocalListing = (id: string) => {
    db.listings = db.listings.filter((listing) => listing.id !== id);
    persistDeletedListingIds(Array.from(new Set([...readDeletedListingIds(), id])));
    notifyCatalogMutations();
};

const buildListingLocation = (listing: Pick<Listing, 'type' | 'geopoint' | 'location'>) => {
    if (listing.location && listing.location.trim()) return listing.location;
    const address = listing.geopoint?.address;
    if (!address) return '';
    const street = [address.addressLine1, address.addressLine2].filter(Boolean).join(', ');
    const cityRegion = [address.city, address.region].filter(Boolean).join(', ');
    const parts = [street, cityRegion, address.postalCode, address.country].filter(Boolean);
    return parts.join(', ');
};

const simulateRequest = <T>(data: T, errorRate = 0): Promise<T> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (Math.random() < errorRate) {
                reject(new Error('A network error occurred. Please try again.'));
            } else {
                resolve(JSON.parse(JSON.stringify(data))); // Deep copy to prevent mutation issues
            }
        }, LATENCY);
    });
};

const logAction = (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
    const newLog: AuditLogEntry = {
        ...entry,
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
    };
    db.auditLog.unshift(newLog);
};


// --- AUTH ---
export const login = (email: string, pass: string): Promise<User | null> => {
    if (USE_MOCK) {
        const user = db.users.find(u => u.email === email);
        if (user && ((user.role === 'Admin' && pass === 'admin') || (user.role === 'Host' && pass === 'host') || (user.role === 'User' && pass === 'user'))) {
            return simulateRequest(user);
        }
        return simulateRequest(null);
    }
    // Real API integration not implemented yet; keep local-only behavior for now.
    return Promise.reject(new Error('Real login API is not implemented.'));
};

export const signUp = (credentials: { displayName: string, email: string, password: string }): Promise<UserType> => {
    if (db.users.some(u => u.email === credentials.email)) {
        return Promise.reject(new Error("An account with this email already exists."));
    }
    const newUser: UserType = {
        id: `user-${Date.now()}`,
        displayName: credentials.displayName,
        email: credentials.email,
        role: 'User',
        joinDate: new Date().toISOString(),
        submissionCount: 0,
        status: 'Active',
    };
    db.users.push(newUser);
    return simulateRequest(newUser);
};


// --- LISTINGS (Clubs & Events) ---
export type ListingStoreState = {
    legacyImportComplete: boolean;
    legacyImportCompletedAt?: string | null;
    legacyImportCount: number;
    listingCount: number;
    approvedCount: number;
    pendingCount: number;
};

const asListings = (value: unknown): Listing[] => Array.isArray(value)
    ? value
        .filter((item): item is Listing => Boolean(
            item
            && typeof item === 'object'
            && ['club', 'event'].includes(String((item as Listing).type))
            && String((item as Listing).id ?? '').trim(),
        ))
        .map((item) => normalizeListing(item))
    : [];

const mergeLegacyCatalog = (remoteListings: Listing[]): Listing[] => {
    const merged = new Map<string, Listing>();
    withoutDeletedLocalListings(db.listings).forEach((listing) => merged.set(listing.id, normalizeListing(listing)));
    remoteListings.forEach((listing) => merged.set(listing.id, normalizeListing(listing)));
    return Array.from(merged.values());
};

export const getListingStoreState = async (): Promise<ListingStoreState | null> => {
    const { data, error } = await supabase.rpc('listing_store_state');
    if (error) return null;
    const state = data as Partial<ListingStoreState> | null;
    if (!state) return null;
    return {
        legacyImportComplete: Boolean(state.legacyImportComplete),
        legacyImportCompletedAt: state.legacyImportCompletedAt ?? null,
        legacyImportCount: Number(state.legacyImportCount ?? 0),
        listingCount: Number(state.listingCount ?? 0),
        approvedCount: Number(state.approvedCount ?? 0),
        pendingCount: Number(state.pendingCount ?? 0),
    };
};

const importLegacyListingsIfNeeded = async (state: ListingStoreState | null): Promise<boolean> => {
    if (!state || state.legacyImportComplete || !isDevPersistenceEnabled()) return false;

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return false;
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', authData.user.id)
        .maybeSingle();
    if (profileError || profile?.role !== 'admin' || profile?.status !== 'active') return false;

    try {
        const legacy = await requestAdminJson<Listing[]>('/api/admin/listings', { cache: 'no-store' });
        if (!Array.isArray(legacy) || !legacy.length) return false;
        const source = withoutDeletedLocalListings(legacy);
        const { error } = await supabase.rpc('admin_import_legacy_listings', { p_listings: source });
        if (error) throw error;
        return true;
    } catch (error) {
        console.warn('Legacy listing backfill is still pending.', error);
        return false;
    }
};

export const importLegacyListingsToSupabase = async (): Promise<{ imported: boolean; state: ListingStoreState | null }> => {
    const initialState = await getListingStoreState();
    const imported = await importLegacyListingsIfNeeded(initialState);
    return { imported, state: await getListingStoreState() };
};

export const getListings = async (): Promise<Listing[]> => {
    try {
        let [state, accessibleResult] = await Promise.all([
            getListingStoreState(),
            supabase.rpc('list_accessible_listings'),
        ]);
        if (await importLegacyListingsIfNeeded(state)) {
            [state, accessibleResult] = await Promise.all([
                getListingStoreState(),
                supabase.rpc('list_accessible_listings'),
            ]);
        }

        const { data, error } = accessibleResult;
        if (error) throw error;
        const remoteListings = asListings(data);
        db.listings = state?.legacyImportComplete ? remoteListings : mergeLegacyCatalog(remoteListings);
        return db.listings.map((listing) => normalizeListing({ ...listing }));
    } catch (error) {
        console.warn('Supabase listing store unavailable; using bundled read-only catalog.', error);
        return db.listings.map((listing) => normalizeListing({ ...listing }));
    }
};

const persistListingToSupabase = async <T extends Listing>(
    listing: T,
    options: { requireExisting?: boolean } = {},
): Promise<T> => {
    const rpcName = options.requireExisting ? 'save_managed_listing' : 'save_listing';
    const { data, error } = await supabase.rpc(rpcName, { p_payload: listing });
    if (error) {
        const migrationMissing = options.requireExisting
            && (error.code === 'PGRST202'
                || /save_managed_listing/i.test(error.message ?? '') && /not find|does not exist/i.test(error.message ?? ''));
        if (migrationMissing) {
            throw new Error('Managed listing saves require the latest database migration.');
        }
        throw error;
    }
    const saved = normalizeListing(data as T) as T;
    upsertLocalListing(saved);
    return saved;
};

export const saveListing = async (listing: Listing): Promise<Listing> => persistListingToSupabase(listing);

const withCatalogInvalidation = <TArgs extends any[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
) => async (...args: TArgs): Promise<TResult> => {
    const result = await fn(...args);
    notifyCatalogMutations();
    return result;
};

export const getClubBrands = entityCatalog.getClubBrands;
export const saveClubBrand = withCatalogInvalidation(entityCatalog.saveClubBrand);
export const getEventSeries = async (): Promise<EventSeriesData[]> => {
    const rows = await entityCatalog.getEventSeries();
    if (rows.length > 0) db.eventSeries = rows;
    return rows;
};
export const saveEventSeries = withCatalogInvalidation(async (series: EventSeriesData): Promise<EventSeriesData> => {
    const saved = await entityCatalog.saveEventSeries(series);
    const idx = db.eventSeries.findIndex((item) => item.id === saved.id);
    if (idx >= 0) db.eventSeries[idx] = saved;
    else db.eventSeries.unshift(saved);
    return saved;
});
export const getResorts = entityCatalog.getResorts;
export const saveResort = withCatalogInvalidation(entityCatalog.saveResort);
export const getCruiseSeries = entityCatalog.getCruiseSeries;
export const saveCruiseSeries = withCatalogInvalidation(entityCatalog.saveCruiseSeries);
export const getCruiseSailings = entityCatalog.getCruiseSailings;
export const saveCruiseSailing = withCatalogInvalidation(entityCatalog.saveCruiseSailing);
export const getVenues = async (): Promise<VenueData[]> => {
    const rows = await entityCatalog.getVenues();
    if (rows.length > 0) db.venues = rows;
    return rows;
};
export const getOrganizations = async (): Promise<OrganizationData[]> => {
    const rows = await entityCatalog.getOrganizations();
    if (rows.length > 0) db.organizations = rows;
    return rows;
};
export const getOrganizationRelationships = async (): Promise<OrganizationRelationship[]> => {
    const rows = await entityCatalog.getOrganizationRelationships();
    if (rows.length > 0) db.organizationRelationships = rows;
    return rows;
};
export const getOrganizationVenueRelationships = async (): Promise<OrganizationVenueRelationship[]> => {
    const rows = await entityCatalog.getOrganizationVenueRelationships();
    if (rows.length > 0) db.organizationVenueRelationships = rows;
    return rows;
};

const mapOrganizationMember = (row: {
    id: string;
    organization_id: string;
    user_id: string;
    role: OrganizationMemberRole;
    status: OrganizationMemberStatus;
    invited_by: string | null;
    created_at: string;
    updated_at: string;
}): OrganizationMember => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    invitedBy: row.invited_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export const getOrganizationMembers = async (organizationId: string): Promise<OrganizationMember[]> => {
    if (!organizationId) return [];
    const { data, error } = await supabase
        .from('organization_members')
        .select('id, organization_id, user_id, role, status, invited_by, created_at, updated_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapOrganizationMember);
};

export const saveOrganizationMember = async (member: Omit<OrganizationMember, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<OrganizationMember> => {
    const { data: authData } = await supabase.auth.getUser();
    const payload = {
        organization_id: member.organizationId,
        user_id: member.userId,
        role: member.role,
        status: member.status,
        invited_by: member.invitedBy ?? authData.user?.id ?? null,
    };
    const query = member.id
        ? supabase.from('organization_members').update(payload).eq('id', member.id)
        : supabase.from('organization_members').insert(payload);
    const { data, error } = await query
        .select('id, organization_id, user_id, role, status, invited_by, created_at, updated_at')
        .single();
    if (error) throw error;
    return mapOrganizationMember(data);
};

export const removeOrganizationMember = async (memberId: string): Promise<void> => {
    const { error } = await supabase.from('organization_members').delete().eq('id', memberId);
    if (error) throw error;
};

export const saveVenue = withCatalogInvalidation(async (venue: VenueData): Promise<VenueData> => {
    const saved = await entityCatalog.saveVenue(venue);
    const idx = db.venues.findIndex((item) => item.id === saved.id);
    if (idx >= 0) db.venues[idx] = saved;
    else db.venues.unshift(saved);
    return saved;
});
export const deleteVenue = withCatalogInvalidation(async (venueId: string): Promise<void> => {
    await entityCatalog.deleteVenue(venueId);
    db.venues = db.venues.filter((item) => item.id !== venueId);
});
export const saveOrganization = withCatalogInvalidation(async (organization: OrganizationData): Promise<OrganizationData> => {
    const saved = await entityCatalog.saveOrganization(organization);
    const idx = db.organizations.findIndex((item) => item.id === saved.id);
    if (idx >= 0) db.organizations[idx] = saved;
    else db.organizations.unshift(saved);

    if (saved.logoImageUrl) {
        const ownedClubs = db.listings.filter(
            (item): item is ClubData => item.type === 'club' && item.ownerOrganizationId === saved.id && !item.clubBrandId,
        );
        if (ownedClubs.length === 1 && ownedClubs[0].logoImageUrl !== saved.logoImageUrl) {
            const updatedClub: ClubData = { ...ownedClubs[0], logoImageUrl: saved.logoImageUrl };
            const clubIdx = db.listings.findIndex((item) => item.id === updatedClub.id);
            if (clubIdx >= 0) db.listings[clubIdx] = updatedClub;
            try {
                await persistListingToSupabase(updatedClub);
            } catch {
                // Best-effort sync; primary organization save already succeeded.
            }
        }
    }
    return saved;
});
export const deleteOrganization = withCatalogInvalidation(async (organizationId: string): Promise<void> => {
    await entityCatalog.deleteOrganization(organizationId);
    db.organizations = db.organizations.filter((item) => item.id !== organizationId);
});
export const saveOrganizationVenueRelationship = withCatalogInvalidation(async (relationship: OrganizationVenueRelationship): Promise<OrganizationVenueRelationship> => {
    const saved = await entityCatalog.saveOrganizationVenueRelationship(relationship);
    const idx = db.organizationVenueRelationships.findIndex((item) => item.id === saved.id);
    if (idx >= 0) db.organizationVenueRelationships[idx] = saved;
    else db.organizationVenueRelationships.unshift(saved);
    return saved;
});
export const saveOrganizationRelationship = withCatalogInvalidation(async (relationship: OrganizationRelationship): Promise<OrganizationRelationship> => {
    const saved = await entityCatalog.saveOrganizationRelationship(relationship);
    const idx = db.organizationRelationships.findIndex((item) => item.id === saved.id);
    if (idx >= 0) db.organizationRelationships[idx] = saved;
    else db.organizationRelationships.unshift(saved);
    return saved;
});
export const deleteOrganizationRelationship = withCatalogInvalidation(async (relationshipId: string, reason: string): Promise<void> => {
    await entityCatalog.deleteOrganizationRelationship(relationshipId, reason);
    db.organizationRelationships = db.organizationRelationships.filter((item) => item.id !== relationshipId);
});

export const getPendingSubmissions = async (): Promise<Listing[]> => {
    const listings = await getListings();
    return listings.filter((listing) => listing.status === 'pending_approval');
};

export const approveSubmission = async (id: string): Promise<Listing> => {
    const { data, error } = await supabase.rpc('admin_moderate_listing', {
        p_listing_id: id,
        p_action: 'approve',
        p_reason: 'Approved from the SwingSphere moderation queue.',
    });
    if (error) throw error;
    const saved = data as Listing;
    upsertLocalListing(saved);
    return saved;
};

export const getArchivedClubs = async (): Promise<ClubData[]> => {
    const { data, error } = await supabase.rpc('admin_list_archived_clubs');
    if (error) throw error;
    return asListings(data).filter((listing): listing is ClubData => listing.type === 'club');
};

export const restoreListing = async (id: string): Promise<Listing> => {
    const { data, error } = await supabase.rpc('admin_moderate_listing', {
        p_listing_id: id,
        p_action: 'restore',
        p_reason: 'Restored from the SwingSphere admin interface.',
    });
    if (error) throw error;
    const restored = data as Listing;
    upsertLocalListing(restored);
    return restored;
};

export const deleteListing = async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.rpc('admin_moderate_listing', {
        p_listing_id: id,
        p_action: 'archive',
        p_reason: 'Archived from the SwingSphere admin interface.',
    });
    if (error) throw error;
    removeLocalListing(id);
    return { success: true };
};

export const withdrawMyPendingListing = async (id: string): Promise<{ success: boolean }> => {
    const { error } = await supabase.rpc('withdraw_my_pending_listing', {
        p_listing_id: id,
    });
    if (error) throw error;
    removeLocalListing(id);
    return { success: true };
};

export const saveClub = async (
    club: ClubData,
    options: { requirePersistence?: boolean; requireExisting?: boolean } = {},
): Promise<ClubData> => {
    const clubToSave: ClubData = {
        ...club,
        location: buildListingLocation(club),
        id: club.id || `club-${Date.now()}`,
    };
    try {
        const saved = await persistListingToSupabase(clubToSave, { requireExisting: options.requireExisting });
        if (saved.ownerOrganizationId && saved.logoImageUrl && !saved.clubBrandId) {
            const ownedClubsCount = db.listings.filter(
                (item): item is ClubData => item.type === 'club' && item.ownerOrganizationId === saved.ownerOrganizationId,
            ).length;
            const orgIdx = db.organizations.findIndex((org) => org.id === saved.ownerOrganizationId);
            if (ownedClubsCount <= 1 && orgIdx >= 0 && db.organizations[orgIdx].logoImageUrl !== saved.logoImageUrl) {
                const updatedOrg: OrganizationData = {
                    ...db.organizations[orgIdx],
                    logoImageUrl: saved.logoImageUrl,
                };
                db.organizations[orgIdx] = updatedOrg;
                try {
                    const persistedOrg = await entityCatalog.saveOrganization(updatedOrg);
                    db.organizations[orgIdx] = persistedOrg;
                } catch {
                    // Best-effort sync; primary club save already succeeded.
                }
                notifyCatalogMutations();
            }
        }
        return saved;
    } catch (error) {
        if (options.requirePersistence) {
            throw error instanceof Error ? error : new Error('Unable to persist this club update.');
        }
        throw error;
    }
};
export const saveEvent = async (
    event: EventData,
    options: { requireExisting?: boolean } = {},
): Promise<EventData> => {
    const trimmedHost = event.hostName?.trim() || normalizeHostName(event.hostName ?? '');
    const nextEvent: EventData = {
        ...event,
        id: event.id || `event-${Date.now()}`,
        hostName: trimmedHost,
        location: buildListingLocation(event),
    };
    return persistListingToSupabase(nextEvent, { requireExisting: options.requireExisting });
};

export const getBuildingAssets = async (): Promise<BuildingAsset[]> => {
    if (USE_MOCK && isDevPersistenceEnabled()) {
        try {
            const data = await requestAdminJson<BuildingAsset[]>('/api/admin/building-assets', { cache: 'no-store' });
            if (Array.isArray(data)) {
                db.buildingAssets = data;
                return simulateRequest(db.buildingAssets);
            }
        } catch {
            // Fall through to in-memory assets.
        }
    }
    return simulateRequest(db.buildingAssets);
};

/** Admin-authoring source. Development uses the guarded local service; deployed
 * admin tooling uses the durable Supabase RPC store. Public discovery callers
 * should continue using getBuildingAssets()/public virtual assets instead. */
export const getAdminBuildingAssets = async (): Promise<BuildingAsset[]> => {
    if (USE_MOCK && isDevPersistenceEnabled()) return getBuildingAssets();
    const assets = await getBuildingAssetsFromSupabase();
    db.buildingAssets = assets;
    return assets;
};

export const saveBuildingAsset = async (
    listingId: string,
    asset: BuildingAsset,
    options: {
        expectedSnapshot?: BuildingVerificationInputSnapshot | null;
        evidence?: BuildingVerificationEvidenceRecord | null;
        mode?: BuildingPersistenceMode;
        allowReplaceExisting?: boolean;
        expectedExistingAsset?: BuildingAssetRevision | null;
    } = {},
): Promise<{ asset: BuildingAsset; listing: Listing | null; historyEvent?: BuildingAssetHistoryEvent }> => {
    const sourceListing = db.listings.find((item) => item.id === listingId) ?? null;
    const assetToSave: BuildingAsset = {
        ...asset,
        venueId: asset.venueId ?? (sourceListing ? getVenueForListing(sourceListing, {
            listings: db.listings,
            venues: db.venues,
            organizations: db.organizations,
            relationships: db.organizationVenueRelationships,
        })?.id : undefined),
    };

    if (USE_MOCK && isDevPersistenceEnabled()) {
        const saved = await requestAdminJson<{ asset: BuildingAsset; listing: Listing | null; historyEvent?: BuildingAssetHistoryEvent }>('/api/admin/building-assets/save', {
            method: 'POST',
            body: JSON.stringify({ listingId, asset: assetToSave, ...options, mode: options.mode ?? 'manual' }),
        });
        const assetIndex = db.buildingAssets.findIndex((item) => item.id === saved.asset.id);
        if (assetIndex >= 0) db.buildingAssets[assetIndex] = saved.asset;
        else db.buildingAssets.push(saved.asset);
        if (saved.listing) upsertLocalListing(saved.listing);
        return simulateRequest(saved);
    }

    if (!options.expectedSnapshot) {
        throw new Error('BuildingAsset persistence requires an expected canonical-location snapshot.');
    }
    const saved = await saveBuildingAssetToSupabase({
        listingId,
        asset: assetToSave,
        expectedSnapshot: options.expectedSnapshot,
        expectedExistingAsset: options.expectedExistingAsset,
        evidence: options.evidence,
        mode: options.mode ?? 'manual',
    });
    const assetIndex = db.buildingAssets.findIndex((item) => item.id === saved.asset.id || item.listingId === listingId);
    if (assetIndex >= 0) db.buildingAssets[assetIndex] = saved.asset;
    else db.buildingAssets.push(saved.asset);
    return simulateRequest({ asset: saved.asset, listing: null });
};

export const getBuildingAssetHistory = async (listingId: string): Promise<BuildingAssetHistoryEvent[]> => {
    if (USE_MOCK && isDevPersistenceEnabled()) {
        return requestAdminJson<BuildingAssetHistoryEvent[]>(`/api/admin/building-assets/history?listingId=${encodeURIComponent(listingId)}`, { cache: 'no-store' });
    }
    return getBuildingAssetHistoryFromSupabase(listingId);
};

export const rollbackBuildingAsset = async (
    listingId: string,
    expectedSnapshot: BuildingVerificationInputSnapshot,
    expectedExistingAsset: BuildingAssetRevision,
    historyEventId: string,
): Promise<{ asset: BuildingAsset; listing: Listing | null; historyEvent?: BuildingAssetHistoryEvent }> => {
    const saved = USE_MOCK && isDevPersistenceEnabled()
        ? await requestAdminJson<{ asset: BuildingAsset; listing: Listing | null; historyEvent: BuildingAssetHistoryEvent }>('/api/admin/building-assets/rollback', {
            method: 'POST',
            body: JSON.stringify({ listingId, expectedSnapshot, expectedExistingAsset, historyEventId }),
        })
        : await rollbackBuildingAssetInSupabase({ listingId, expectedSnapshot, expectedExistingAsset, historyEventId });
    const assetIndex = db.buildingAssets.findIndex((item) => item.id === saved.asset.id || item.listingId === listingId);
    if (assetIndex >= 0) db.buildingAssets[assetIndex] = saved.asset;
    else db.buildingAssets.push(saved.asset);
    if (saved.listing) upsertLocalListing(saved.listing);
    return simulateRequest(saved);
};

export const getAmbientBuildingMassings = async (venueId: string): Promise<ManualMassingObject[]> => {
    if (!venueId) return [];
    if (USE_MOCK && isDevPersistenceEnabled()) {
        try {
            const data = await requestAdminJson<ManualMassingObject[]>(
                `/api/admin/ambient-building-massings?venueId=${encodeURIComponent(venueId)}`,
                { cache: 'no-store' }
            );
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }
    try {
        const { data, error } = await supabase
            .from('venue_ambient_building_massings')
            .select('objects')
            .eq('venue_id', venueId)
            .maybeSingle();
        if (error || !data) return [];
        return Array.isArray(data.objects) ? (data.objects as ManualMassingObject[]) : [];
    } catch {
        return [];
    }
};

export const saveAmbientBuildingMassings = async (
    venueId: string,
    objects: ManualMassingObject[],
): Promise<void> => {
    if (!venueId) return;
    if (USE_MOCK && isDevPersistenceEnabled()) {
        await requestAdminJson('/api/admin/ambient-building-massings/save', {
            method: 'POST',
            body: JSON.stringify({ venueId, objects }),
        });
        return;
    }
    const { error } = await supabase
        .from('venue_ambient_building_massings')
        .upsert({
            venue_id: venueId,
            version: 1,
            objects,
            updated_at: new Date().toISOString(),
        });
    if (error) {
        throw new Error(`Failed to save ambient massings: ${error.message}`);
    }
};


// --- USERS ---
export const getUsers = async (): Promise<User[]> => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
        return db.users;
    }
    const [{ data: profiles, error }, { data: authData }] = await Promise.all([
        supabase
            .from('profiles')
            .select('id, display_name, handle, bio, role, status, avatar_url, created_at')
            .order('created_at', { ascending: false }),
        supabase.auth.getUser(),
    ]);

    if (error) throw error;

    const currentAuthUser = authData.user;
    const users = (profiles ?? []).map((profile): User => ({
        id: profile.id,
        displayName: profile.display_name,
        email: currentAuthUser?.id === profile.id ? (currentAuthUser.email ?? '') : '',
        role: profile.role === 'admin' ? 'Admin' : profile.role === 'promoter' ? 'Host' : 'User',
        joinDate: profile.created_at,
        submissionCount: 0,
        status: profile.status === 'active' ? 'Active' : profile.status === 'deleted' ? 'Deleted' : 'Suspended',
        handle: profile.handle,
        bio: profile.bio ?? undefined,
        avatarUrl: profile.avatar_url ?? undefined,
    }));

    db.users = users;
    return users;
};

export const updateUser = async (_user: User): Promise<User> => {
    throw new Error('Admin role and status changes are not yet wired to a trusted server endpoint. Use Supabase Table Editor for now.');
};
export const updateUserProfile = (userId: string, profileData: { displayName: string, email: string }): Promise<User> => {
    const index = db.users.findIndex(u => u.id === userId);
    if (index > -1) {
        db.users[index] = { ...db.users[index], ...profileData };
        return simulateRequest(db.users[index]);
    }
    return Promise.reject(new Error('User not found'));
};

export const deleteUserAccount = (userId: string): Promise<{ success: boolean }> => {
    const user = db.users.find(u => u.id === userId);
    if (user) {
        // Remove user
        db.users = db.users.filter(u => u.id !== userId);
        // Remove all content posted by the user
        db.listings = db.listings.filter(l => l.postedByUserId !== userId);
        
        logAction({
            adminId: userId,
            adminName: user.displayName,
            action: 'ACCOUNT_DELETED_BY_USER',
            targetType: 'User',
            targetId: userId,
            targetName: user.displayName,
            details: 'User permanently deleted their own account and all associated data.'
        });
    }
    return simulateRequest({ success: true });
};

// --- REVIEWS ---
export const getReviews = (listingId: string): Promise<Review[]> => {
    const reviews = db.reviews.filter(r => r.listingId === listingId);
    return simulateRequest(reviews);
};

export const submitReview = (reviewData: { listingId: string; userId: string; rating: 'up' | 'down'; text: string }): Promise<Review> => {
    const user = db.users.find(u => u.id === reviewData.userId);
    if (!user) {
        return Promise.reject(new Error("User not found"));
    }
    const newReview: Review = {
        id: `review-${Date.now()}`,
        listingId: reviewData.listingId,
        userId: user.id,
        userName: user.displayName,
        userHandle: user.handle,
        userAvatarUrl: user.avatarUrl,
        rating: reviewData.rating,
        text: reviewData.text,
        timestamp: new Date().toISOString(),
    };
    db.reviews.unshift(newReview);
    return simulateRequest(newReview);
};

// --- TAXONOMY / TAGS ---
export const getTags = taxonomy.getPublicTags;
export const getTagCategories = taxonomy.getPublicTagCategories;
export const getAdminTags = taxonomy.getAdminTags;
export const getAdminTagCategories = taxonomy.getAdminTagCategories;
export const saveTag = taxonomy.saveTag;
export const deprecateTag = taxonomy.deprecateTag;
export const saveCategory = taxonomy.saveTagCategory;

// --- MODERATION ---
export const getFlaggedContent = (): Promise<FlaggedContent[]> => simulateRequest(db.flaggedContent);
export const dismissFlag = (id: string): Promise<{ success: boolean }> => {
    db.flaggedContent = db.flaggedContent.filter(f => f.id !== id);
    return simulateRequest({ success: true });
};
export const approveFlag = async (id: string): Promise<{ success: boolean }> => {
    const flag = db.flaggedContent.find(f => f.id === id);
    if (flag) {
        await deleteListing(flag.contentId); // This will also create an audit log entry
        db.flaggedContent = db.flaggedContent.filter(f => f.id !== id);
    }
    return simulateRequest({ success: true });
};


// --- AUDIT LOG & DASHBOARD ---
export const getAuditLog = (): Promise<AuditLogEntry[]> => simulateRequest(db.auditLog);

export const getDashboardStats = async (): Promise<DashboardStats> => {
    const users = await getUsers();
    const submissionsOverTime = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return {
            date: date.toISOString().split('T')[0],
            clubs: 0,
            events: 0,
        };
    });

    return {
        totalUsers: users.length,
        totalClubs: db.listings.filter(l => l.type === 'club').length,
        totalEvents: db.listings.filter(l => l.type === 'event').length,
        totalFlagged: 0,
        submissionsOverTime,
    };
};
