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
    OrganizationMember,
    OrganizationMemberRole,
    OrganizationMemberStatus,
    OrganizationVenueRelationship,
    Review,
    User as UserType,
    VenueData,
} from '../types';
import type { User } from '../data/mockUsers';
import type { AuditLogEntry } from '../data/mockAuditLog';
import type { FlaggedContent } from '../data/mockFlaggedContent';
import { normalizeHostName } from './identityUtils';
import { supabase } from './supabase';
import * as entityCatalog from './entityCatalogSupabase';
import * as taxonomy from './taxonomySupabase';

import { mockData } from '../data/mockData';
import { mockUsers } from '../data/mockUsers';
import { mockAuditLog } from '../data/mockAuditLog';
import { mockFlaggedContent } from '../data/mockFlaggedContent';
import { mockReviews } from '../data/mockReviews';
import { mockVenues } from '../data/mockVenues';
import { mockOrganizations } from '../data/mockOrganizations';
import { mockOrganizationVenueRelationships } from '../data/mockEntityRelationships';
import { communityHostEvents } from '../data/communityHostSeed';
import { getVenueForListing } from './entityCompatibility';
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

const withCommunityHostSeed = (listings: Listing[]): Listing[] => {
    const deletedIds = new Set(readDeletedListingIds());
    const seededIds = new Set(communityHostEvents.map((event) => event.id));
    return [
        ...communityHostEvents
            .filter((event) => !deletedIds.has(event.id))
            .map((event) => ({ ...event })),
        ...listings.filter((listing) => !seededIds.has(listing.id) && !deletedIds.has(listing.id)),
    ];
};

let db = {
    listings: withCommunityHostSeed(publicListings.map((listing) => ({ ...listing })) as Listing[]),
    users: [] as User[],
    auditLog: [] as AuditLogEntry[],
    flaggedContent: [] as FlaggedContent[],
    reviews: [] as Review[],
    buildingAssets: [] as BuildingAsset[],
    venues: [...mockVenues],
    organizations: [...mockOrganizations],
    organizationVenueRelationships: [...mockOrganizationVenueRelationships],
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
};

const removeLocalListing = (id: string) => {
    db.listings = db.listings.filter((listing) => listing.id !== id);
    persistDeletedListingIds(Array.from(new Set([...readDeletedListingIds(), id])));
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
    ? value.filter((item): item is Listing => Boolean(
        item
        && typeof item === 'object'
        && ['club', 'event'].includes(String((item as Listing).type))
        && String((item as Listing).id ?? '').trim(),
    ))
    : [];

const mergeLegacyCatalog = (remoteListings: Listing[]): Listing[] => {
    const merged = new Map<string, Listing>();
    withCommunityHostSeed(db.listings).forEach((listing) => merged.set(listing.id, listing));
    remoteListings.forEach((listing) => merged.set(listing.id, listing));
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
        const legacy = await requestJson<Listing[]>('/api/admin/listings', { cache: 'no-store' });
        if (!Array.isArray(legacy) || !legacy.length) return false;
        const source = withCommunityHostSeed(legacy);
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
        let state = await getListingStoreState();
        if (await importLegacyListingsIfNeeded(state)) state = await getListingStoreState();

        const { data, error } = await supabase.rpc('list_accessible_listings');
        if (error) throw error;
        const remoteListings = asListings(data);
        db.listings = state?.legacyImportComplete ? remoteListings : mergeLegacyCatalog(remoteListings);
        return db.listings.map((listing) => ({ ...listing })) as Listing[];
    } catch (error) {
        console.warn('Supabase listing store unavailable; using bundled read-only catalog.', error);
        return db.listings.map((listing) => ({ ...listing })) as Listing[];
    }
};

const persistListingToSupabase = async <T extends Listing>(listing: T): Promise<T> => {
    const { data, error } = await supabase.rpc('save_listing', { p_payload: listing });
    if (error) throw error;
    const saved = data as T;
    upsertLocalListing(saved);
    return saved;
};

export const saveListing = async (listing: Listing): Promise<Listing> => persistListingToSupabase(listing);

export const getClubBrands = entityCatalog.getClubBrands;
export const saveClubBrand = entityCatalog.saveClubBrand;
export const getEventSeries = entityCatalog.getEventSeries;
export const saveEventSeries = entityCatalog.saveEventSeries;
export const getResorts = entityCatalog.getResorts;
export const saveResort = entityCatalog.saveResort;
export const getCruiseSeries = entityCatalog.getCruiseSeries;
export const saveCruiseSeries = entityCatalog.saveCruiseSeries;
export const getCruiseSailings = entityCatalog.getCruiseSailings;
export const saveCruiseSailing = entityCatalog.saveCruiseSailing;
export const getVenues = entityCatalog.getVenues;
export const getOrganizations = entityCatalog.getOrganizations;
export const getOrganizationRelationships = entityCatalog.getOrganizationRelationships;
export const getOrganizationVenueRelationships = entityCatalog.getOrganizationVenueRelationships;

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

export const saveVenue = entityCatalog.saveVenue;
export const deleteVenue = entityCatalog.deleteVenue;
export const saveOrganization = entityCatalog.saveOrganization;
export const deleteOrganization = entityCatalog.deleteOrganization;
export const saveOrganizationVenueRelationship = entityCatalog.saveOrganizationVenueRelationship;
export const saveOrganizationRelationship = entityCatalog.saveOrganizationRelationship;
export const deleteOrganizationRelationship = entityCatalog.deleteOrganizationRelationship;

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

export const saveClub = async (
    club: ClubData,
    options: { requirePersistence?: boolean } = {},
): Promise<ClubData> => {
    const clubToSave: ClubData = {
        ...club,
        location: buildListingLocation(club),
        id: club.id || `club-${Date.now()}`,
    };
    try {
        return await persistListingToSupabase(clubToSave);
    } catch (error) {
        if (options.requirePersistence) {
            throw error instanceof Error ? error : new Error('Unable to persist this club update.');
        }
        throw error;
    }
};
export const saveEvent = async (event: EventData): Promise<EventData> => {
    const normalizedHost = normalizeHostName(event.hostName ?? '');
    const nextEvent: EventData = {
        ...event,
        id: event.id || `event-${Date.now()}`,
        hostName: normalizedHost,
        location: buildListingLocation(event),
    };
    return persistListingToSupabase(nextEvent);
};

export const getBuildingAssets = async (): Promise<BuildingAsset[]> => {
    if (USE_MOCK && isDevPersistenceEnabled()) {
        try {
            const data = await requestJson<BuildingAsset[]>('/api/admin/building-assets', { cache: 'no-store' });
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

export const saveBuildingAsset = async (
    listingId: string,
    asset: BuildingAsset,
): Promise<{ asset: BuildingAsset; listing: Listing | null }> => {
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
        try {
            const saved = await requestJson<{ asset: BuildingAsset; listing: Listing | null }>('/api/admin/building-assets/save', {
                method: 'POST',
                body: JSON.stringify({ listingId, asset: assetToSave }),
            });
            const assetIndex = db.buildingAssets.findIndex((item) => item.id === saved.asset.id);
            if (assetIndex >= 0) db.buildingAssets[assetIndex] = saved.asset;
            else db.buildingAssets.push(saved.asset);
            if (saved.listing) upsertLocalListing(saved.listing);
            return simulateRequest(saved);
        } catch {
            // Fall back to in-memory persistence.
        }
    }

    const assetIndex = db.buildingAssets.findIndex((item) => item.id === assetToSave.id || item.listingId === listingId);
    if (assetIndex >= 0) db.buildingAssets[assetIndex] = assetToSave;
    else db.buildingAssets.push(assetToSave);
    const listing = sourceListing;
    const updatedListing = listing ? { ...listing, buildingAssetId: asset.id } as Listing : null;
    if (updatedListing) upsertLocalListing(updatedListing);
    return simulateRequest({ asset: assetToSave, listing: updatedListing });
};


// --- USERS ---
export const getUsers = async (): Promise<User[]> => {
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
