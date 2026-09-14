import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminDashboard from './AdminDashboard';
import AdminManageClubs from './AdminManageClubs';
import AdminAddClub from './AdminAddClub';
import AdminUserManagement from './AdminUserManagement';
import AdminTagsAndFilters from './AdminTagsAndFilters';
import AdminSettings from './AdminSettings';
import AdminAddEvent from './AdminAddEvent';
import AdminManageEvents from './AdminManageEvents';
import AdminEventSeriesEditor from './AdminEventSeriesEditor';
import AdminClubBrandEditor from './AdminClubBrandEditor';
import AdminManageTravel from './AdminManageTravel';
import AdminTravelEditor from './AdminTravelEditor';
import AdminManageVenues from './AdminManageVenues';
import AdminManageOrganizations from './AdminManageOrganizations';
import AdminOrganizationDetailEditor from './AdminOrganizationDetailEditor';
import AdminVenueDetailEditor from './AdminVenueDetailEditor';
import AdminAuditLog from './AdminAuditLog';
import AdminSubmissionsQueue from './AdminSubmissionsQueue';
import AdminModerationQueue from './AdminModerationQueue';
import AdminListingClaims from './AdminListingClaims';
import AdminOutboundAnalytics from './AdminOutboundAnalytics';
import AdminInboundAnalytics from './AdminInboundAnalytics';
import AdminBuildingInspector from './AdminBuildingInspector';
import { AdminListingDetailEditor } from './editor/AdminDetailPage';
import { useAppStore } from '../../store/appStore';
import * as api from '../../lib/api';
import { buildEntityIndex } from '../../lib/entityIndex';
import { getVenueForListing } from '../../lib/entityCompatibility';
import { getListingCanonicalPath } from '../../lib/entityUtils';
import type { BrandMediaCatalog } from '../../lib/entityBrandMedia';

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
    OrganizationData,
    OrganizationRelationship,
    OrganizationVenueRelationship,
    VenueData,
} from '../../types';
import type { User } from '../../data/mockUsers';
import type { FlaggedContent } from '../../data/mockFlaggedContent';

export type AdminView = 
    | 'dashboard' 
    | 'submissions'
    | 'moderation'
    | 'listing-claims'
    | 'outbound-analytics'
    | 'inbound-analytics'
    | 'add-club' 
    | 'add-event' 
    | 'add-event-series'
    | 'add-club-brand'
    | 'manage-clubs' 
    | 'manage-events' 
    | 'manage-venues'
    | 'manage-travel'
    | 'add-resort'
    | 'add-cruise-series'
    | 'add-cruise-sailing'
    | 'add-venue'
    | 'manage-organizations'
    | 'add-organization'
    | 'tags' 
    | 'users' 
    | 'settings' 
    | 'audit-log'
    | 'building-inspector'
    | { view: 'review-submission', listingId: string }
    | { view: 'edit-club', clubId: string }
    | { view: 'edit-event', eventId: string }
    | { view: 'edit-event-series', eventSeriesId: string }
    | { view: 'edit-club-brand', clubBrandId: string }
    | { view: 'edit-resort', resortId: string }
    | { view: 'edit-cruise-series', cruiseSeriesId: string }
    | { view: 'edit-cruise-sailing', cruiseSailingId: string }
    | { view: 'edit-venue', venueId: string }
    | { view: 'edit-organization', organizationId: string };


const AdminPanel: React.FC<{ initialView?: AdminView }> = ({ initialView }) => {
    const [view, setView] = useState<AdminView>(initialView ?? 'dashboard');
    const { currentUser, tags, fetchTags, addToast } = useAppStore();
    const navigate = useNavigate();
    const location = useLocation();

    const [isLoading, setIsLoading] = useState(true);
    const [listings, setListings] = useState<Listing[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [venues, setVenues] = useState<VenueData[]>([]);
    const [eventSeries, setEventSeries] = useState<EventSeriesData[]>([]);
    const [clubBrands, setClubBrands] = useState<ClubBrandData[]>([]);
    const [resorts, setResorts] = useState<ResortData[]>([]);
    const [cruiseSeries, setCruiseSeries] = useState<CruiseSeriesData[]>([]);
    const [cruiseSailings, setCruiseSailings] = useState<CruiseSailingData[]>([]);
    const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
    const [organizationRelationships, setOrganizationRelationships] = useState<OrganizationRelationship[]>([]);
    const [organizationVenueRelationships, setOrganizationVenueRelationships] = useState<OrganizationVenueRelationship[]>([]);
    const [buildingAssets, setBuildingAssets] = useState<BuildingAsset[]>([]);
    const [flaggedContent, setFlaggedContent] = useState<FlaggedContent[]>([]);
    const brandMediaCatalog = React.useMemo<BrandMediaCatalog>(() => ({
        listings,
        venues,
        organizations,
        relationships: organizationVenueRelationships,
        eventSeries,
        clubBrands,
        resorts,
        cruiseSeries,
        cruiseSailings,
    }), [clubBrands, cruiseSailings, cruiseSeries, eventSeries, listings, organizationVenueRelationships, organizations, resorts, venues]);
    const entityIndex = React.useMemo(() => {
        if (!listings.length) return null;
        return buildEntityIndex(listings, users, venues, organizations, organizationVenueRelationships, eventSeries, organizationRelationships);
    }, [eventSeries, listings, organizationRelationships, organizationVenueRelationships, organizations, users, venues]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [
                listingsData,
                usersData,
                flaggedContentData,
                venuesData,
                organizationsData,
                organizationRelationshipsData,
                relationshipsData,
                buildingAssetsData,
                eventSeriesData,
                clubBrandsData,
                resortsData,
                cruiseSeriesData,
                cruiseSailingsData,
            ] = await Promise.all([
                api.getListings(),
                api.getUsers(),
                api.getFlaggedContent(),
                api.getVenues(),
                api.getOrganizations(),
                api.getOrganizationRelationships(),
                api.getOrganizationVenueRelationships(),
                api.getAdminBuildingAssets(),
                api.getEventSeries(),
                api.getClubBrands(),
                api.getResorts(),
                api.getCruiseSeries(),
                api.getCruiseSailings(),
            ]);
            setListings(listingsData);
            setUsers(usersData);
            setFlaggedContent(flaggedContentData);
            setVenues(venuesData);
            setOrganizations(organizationsData);
            setOrganizationRelationships(organizationRelationshipsData);
            setOrganizationVenueRelationships(relationshipsData);
            setBuildingAssets(buildingAssetsData);
            setEventSeries(eventSeriesData);
            setClubBrands(clubBrandsData);
            setResorts(resortsData);
            setCruiseSeries(cruiseSeriesData);
            setCruiseSailings(cruiseSailingsData);
            if (tags.length === 0) {
                await fetchTags();
            }
        } catch (error) {
            addToast({ message: 'Failed to load admin data.', type: 'error' });
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleClubBrandSaved = (saved: ClubBrandData) => {
        setClubBrands((prev) => {
            const index = prev.findIndex((item) => item.id === saved.id);
            if (index < 0) return [saved, ...prev];
            const next = [...prev];
            next[index] = saved;
            return next;
        });
    };

    const handleTravelSaved = (saved: ResortData | CruiseSeriesData | CruiseSailingData) => {
        if (saved.type === 'resort') setResorts((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
        if (saved.type === 'cruise_series') setCruiseSeries((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
        if (saved.type === 'cruise_sailing') setCruiseSailings((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
    };

    const handleEventSeriesSaved = (saved: EventSeriesData) => {
        setEventSeries((prev) => {
            const index = prev.findIndex((item) => item.id === saved.id);
            if (index < 0) return [saved, ...prev];
            const next = [...prev];
            next[index] = saved;
            return next;
        });
    };

    const handleListingSaved = (saved: Listing) => {
        setListings((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
    };

    const syncListingPhysicalFieldsFromVenue = (listing: Listing, venue: VenueData): Listing => {
        const synced = {
            ...listing,
            location: [
                venue.address.addressLine1,
                venue.address.addressLine2,
                [venue.address.city, venue.address.region].filter(Boolean).join(', '),
                venue.address.postalCode,
                venue.address.country,
            ].filter(Boolean).join(', '),
            geopoint: {
                latitude: venue.latitude,
                longitude: venue.longitude,
                address: venue.address,
            },
            locationMeta: venue.locationMeta ?? listing.locationMeta,
            buildingAssetId: venue.buildingAssetId ?? listing.buildingAssetId,
        };
        // TODO(SEMv2 Phase 4): remove this legacy listing sync when Venue is the only physical-location writer.
        return listing.type === 'club'
            ? { ...synced, generalAmenities: venue.amenities.length ? [...venue.amenities] : listing.generalAmenities } as ClubData
            : synced as EventData;
    };

    const handleVenueSaved = (saved: VenueData) => {
        setVenues((prev) => {
            const index = prev.findIndex((item) => item.id === saved.id);
            const nextVenues = index < 0 ? [saved, ...prev] : [...prev];
            if (index >= 0) nextVenues[index] = saved;
            setListings((currentListings) => currentListings.map((listing) => {
                const resolvedVenue = getVenueForListing(listing, {
                    listings: currentListings,
                    venues: nextVenues,
                    organizations,
                    relationships: organizationVenueRelationships,
                });
                return resolvedVenue?.id === saved.id
                    ? syncListingPhysicalFieldsFromVenue(listing, saved)
                    : listing;
            }));
            if (index < 0) return nextVenues;
            const next = [...prev];
            next[index] = saved;
            return next;
        });
    };

    const handleOrganizationSaved = (saved: OrganizationData) => {
        setOrganizations((prev) => {
            const index = prev.findIndex((item) => item.id === saved.id);
            if (index < 0) return [saved, ...prev];
            const next = [...prev];
            next[index] = saved;
            return next;
        });
    };

    const handleOrganizationDeleted = (organizationId: string) => {
        setOrganizations((prev) => prev.filter((organization) => organization.id !== organizationId));
        setOrganizationRelationships((prev) => prev.filter((relationship) => relationship.sourceOrganizationId !== organizationId && relationship.targetOrganizationId !== organizationId));
        setOrganizationVenueRelationships((prev) => prev.filter((relationship) => relationship.organizationId !== organizationId));
        setListings((prev) => prev.map((listing) => {
            if (listing.type === 'event' && listing.organizerOrganizationId === organizationId) {
                return { ...listing, organizerOrganizationId: undefined };
            }
            if (listing.type === 'club' && listing.ownerOrganizationId === organizationId) {
                return { ...listing, ownerOrganizationId: undefined };
            }
            return listing;
        }));
        setView('manage-organizations');
    };

    const handleRelationshipSaved = (saved: OrganizationVenueRelationship) => {
        setOrganizationVenueRelationships((prev) => {
            const index = prev.findIndex((item) => item.id === saved.id);
            if (index < 0) return [saved, ...prev];
            const next = [...prev];
            next[index] = saved;
            return next;
        });
    };

    useEffect(() => {
        const currentView = typeof view === 'string' ? view : view.view;
        if (currentView === 'building-inspector' && location.pathname !== '/admin/building-inspector') {
            navigate('/admin/building-inspector');
        } else if (
            currentView !== 'building-inspector' &&
            location.pathname === '/admin/building-inspector'
        ) {
            navigate('/admin');
        }
    }, [view, location.pathname, navigate]);

    useEffect(() => {
        const currentView = typeof view === 'string' ? view : view.view;
        if (location.pathname === '/admin/building-inspector' && currentView !== 'building-inspector') {
            setView('building-inspector');
        }
    }, [location.pathname, view]);

    const renderContent = () => {
        if (isLoading) {
             return <div className="flex items-center justify-center h-full"><div className="text-gray-500">Loading Admin Panel...</div></div>;
        }

        const currentView = typeof view === 'string' ? view : view.view;
        
        // RBAC Check
        const isAdmin = currentUser?.role === 'Admin';
        const isHost = currentUser?.role === 'Host';
        
        const canAccessBuildingInspector = isAdmin || import.meta.env.DEV;
        if (
            (!isAdmin && ['users', 'tags', 'settings', 'audit-log', 'listing-claims', 'outbound-analytics', 'inbound-analytics'].includes(currentView)) ||
            (currentView === 'building-inspector' && !canAccessBuildingInspector)
        ) {
            return <div>Access Denied.</div>;
        }

        switch(currentView) {
            case 'dashboard':
                // FIX: Pass fetched tags to AdminDashboard
                return <AdminDashboard setView={setView} allTags={tags} />;
            case 'submissions':
                return <AdminSubmissionsQueue users={users} onReview={(listing) => setView({ view: 'review-submission', listingId: listing.id })} />;
            case 'review-submission': {
                if (typeof view !== 'object' || view.view !== 'review-submission') return null;
                const submissionToReview = listings.find((listing) => listing.id === view.listingId);
                if (!submissionToReview) return <div>Submission not found.</div>;
                return (
                    <AdminListingDetailEditor
                        listing={submissionToReview}
                        users={users}
                        venues={venues}
                        organizations={organizations}
                        clubBrands={clubBrands}
                        relationships={organizationVenueRelationships}
                        listings={listings}
                        buildingAssets={buildingAssets}
                        entityIndex={entityIndex}
                        onVenueSaved={handleVenueSaved}
                        onRelationshipSaved={handleRelationshipSaved}
                        onSaved={handleListingSaved}
                        onBack={() => setView('submissions')}
                        backLabel="Back to submissions"
                    />
                );
            }
            case 'moderation':
                return <AdminModerationQueue onDataChange={fetchData} setView={setView} />;
            case 'listing-claims':
                return <AdminListingClaims listings={listings} organizations={organizations} />;
            case 'outbound-analytics':
                return <AdminOutboundAnalytics />;
            case 'inbound-analytics':
                return <AdminInboundAnalytics />;
            case 'manage-clubs':
                const clubs = listings.filter(l => l.type === 'club') as ClubData[];
                return <AdminManageClubs clubs={clubs} clubBrands={clubBrands} organizations={organizations} mediaCatalog={brandMediaCatalog} setView={setView} onDataChange={fetchData} />;
            case 'add-club-brand':
                return <AdminClubBrandEditor brand={{ id: '', type: 'club_brand', name: '', slug: '', status: 'draft' }} clubs={listings.filter(l => l.type === 'club') as ClubData[]} organizations={organizations} onSaved={(saved) => { handleClubBrandSaved(saved); setView({ view: 'edit-club-brand', clubBrandId: saved.id }); }} onOpenClub={(clubId) => setView({ view: 'edit-club', clubId })} onBack={() => setView('manage-clubs')} />;
            case 'edit-club-brand':
                if (typeof view !== 'object' || view.view !== 'edit-club-brand') return null;
                const brandToEdit = clubBrands.find((brand) => brand.id === view.clubBrandId);
                if (!brandToEdit) return <div>Club brand not found.</div>;
                return <AdminClubBrandEditor brand={brandToEdit} clubs={listings.filter(l => l.type === 'club') as ClubData[]} organizations={organizations} onSaved={handleClubBrandSaved} onOpenClub={(clubId) => setView({ view: 'edit-club', clubId })} onBack={() => setView('manage-clubs')} />;
            case 'add-club':
                return <AdminAddClub onClubAction={(club) => {
                    fetchData();
                    if (club) {
                        const target = entityIndex ? getListingCanonicalPath(club, entityIndex) : `/listing/${club.id}`;
                        window.location.href = target;
                    } else {
                        setView('manage-clubs');
                    }
                }} onCancel={() => setView('manage-clubs')} />;
            case 'edit-club':
                 if (typeof view !== 'object' || view.view !== 'edit-club') return null;
                 const clubToEdit = listings.find(l => l.id === view.clubId && l.type === 'club') as ClubData | undefined;
                 if (!clubToEdit) return <div>Club not found.</div>;
                 return (
                    <AdminListingDetailEditor
                        listing={clubToEdit}
                        users={users}
                        venues={venues}
                        organizations={organizations}
                        clubBrands={clubBrands}
                        relationships={organizationVenueRelationships}
                        listings={listings}
                        buildingAssets={buildingAssets}
                        entityIndex={entityIndex}
                        onVenueSaved={handleVenueSaved}
                        onRelationshipSaved={handleRelationshipSaved}
                        onSaved={handleListingSaved}
                        onBack={() => setView('manage-clubs')}
                        backLabel="Back to clubs"
                    />
                 );
            case 'users':
                return <AdminUserManagement onDataChange={fetchData} />;
            case 'tags':
                return <AdminTagsAndFilters />;
            case 'settings':
                return <AdminSettings />;
            case 'add-event':
                 return <AdminAddEvent onEventAction={(event) => {
                    fetchData();
                    if (event) {
                        const target = entityIndex ? getListingCanonicalPath(event, entityIndex) : `/listing/${event.id}`;
                        window.location.href = target;
                    } else {
                        setView('manage-events');
                    }
                }} onCancel={() => setView('manage-events')} />;
            case 'manage-events':
                const events = listings.filter(l => l.type === 'event') as EventData[];
                return <AdminManageEvents events={events} eventSeries={eventSeries} organizations={organizations} venues={venues} mediaCatalog={brandMediaCatalog} setView={setView} onDataChange={fetchData} />;
            case 'add-event-series':
                return <AdminEventSeriesEditor eventSeries={{ id: '', type: 'event_series', name: '', slug: '', status: 'draft' }} events={listings.filter(l => l.type === 'event') as EventData[]} organizations={organizations} venues={venues} onSaved={(saved) => { handleEventSeriesSaved(saved); setView({ view: 'edit-event-series', eventSeriesId: saved.id }); }} onEditOccurrence={(eventId) => setView({ view: 'edit-event', eventId })} onBack={() => setView('manage-events')} />;
            case 'edit-event-series':
                if (typeof view !== 'object' || view.view !== 'edit-event-series') return null;
                const seriesToEdit = eventSeries.find((series) => series.id === view.eventSeriesId);
                if (!seriesToEdit) return <div>Event series not found.</div>;
                return <AdminEventSeriesEditor eventSeries={seriesToEdit} events={listings.filter(l => l.type === 'event') as EventData[]} organizations={organizations} venues={venues} onSaved={handleEventSeriesSaved} onEditOccurrence={(eventId) => setView({ view: 'edit-event', eventId })} onBack={() => setView('manage-events')} />;
            case 'manage-travel':
                return <AdminManageTravel resorts={resorts} cruiseSeries={cruiseSeries} sailings={cruiseSailings} setView={setView} />;
            case 'add-resort':
                return <AdminTravelEditor entity={{ id: '', type: 'resort', name: '', slug: '', descriptionShort: '', descriptionFull: '', geopoint: { latitude: 0, longitude: 0, address: { city: '', country: '' } }, resortStyle: 'destination_resort', audienceLabel: '', accommodationSummary: '', amenities: [], experienceHighlights: [], status: 'draft' }} organizations={organizations} cruiseSeries={cruiseSeries} sailings={cruiseSailings} onSaved={(saved) => { handleTravelSaved(saved); if (saved.type === 'resort') setView({ view: 'edit-resort', resortId: saved.id }); }} onOpenSailing={(id) => setView({ view: 'edit-cruise-sailing', cruiseSailingId: id })} onBack={() => setView('manage-travel')} />;
            case 'edit-resort':
                if (typeof view !== 'object' || view.view !== 'edit-resort') return null;
                const resortToEdit = resorts.find((item) => item.id === view.resortId);
                if (!resortToEdit) return <div>Resort not found.</div>;
                return <AdminTravelEditor entity={resortToEdit} organizations={organizations} cruiseSeries={cruiseSeries} sailings={cruiseSailings} onSaved={handleTravelSaved} onOpenSailing={(id) => setView({ view: 'edit-cruise-sailing', cruiseSailingId: id })} onBack={() => setView('manage-travel')} />;
            case 'add-cruise-series':
                return <AdminTravelEditor entity={{ id: '', type: 'cruise_series', name: '', slug: '', descriptionShort: '', descriptionFull: '', audienceLabel: '', experienceHighlights: [], status: 'draft' }} organizations={organizations} cruiseSeries={cruiseSeries} sailings={cruiseSailings} onSaved={(saved) => { handleTravelSaved(saved); if (saved.type === 'cruise_series') setView({ view: 'edit-cruise-series', cruiseSeriesId: saved.id }); }} onOpenSailing={(id) => setView({ view: 'edit-cruise-sailing', cruiseSailingId: id })} onBack={() => setView('manage-travel')} />;
            case 'edit-cruise-series':
                if (typeof view !== 'object' || view.view !== 'edit-cruise-series') return null;
                const cruiseSeriesToEdit = cruiseSeries.find((item) => item.id === view.cruiseSeriesId);
                if (!cruiseSeriesToEdit) return <div>Cruise series not found.</div>;
                return <AdminTravelEditor entity={cruiseSeriesToEdit} organizations={organizations} cruiseSeries={cruiseSeries} sailings={cruiseSailings} onSaved={handleTravelSaved} onOpenSailing={(id) => setView({ view: 'edit-cruise-sailing', cruiseSailingId: id })} onBack={() => setView('manage-travel')} />;
            case 'add-cruise-sailing':
                if (!cruiseSeries.length) return <div>Create a cruise series before adding a sailing.</div>;
                return <AdminTravelEditor entity={{ id: '', type: 'cruise_sailing', cruiseSeriesId: cruiseSeries[0].id, name: '', slug: '', shipName: '', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), departurePort: { id: `port-${Date.now()}`, portName: '', country: '' }, itinerary: [], durationNights: 7, status: 'draft' }} organizations={organizations} cruiseSeries={cruiseSeries} sailings={cruiseSailings} onSaved={(saved) => { handleTravelSaved(saved); if (saved.type === 'cruise_sailing') setView({ view: 'edit-cruise-sailing', cruiseSailingId: saved.id }); }} onOpenSailing={(id) => setView({ view: 'edit-cruise-sailing', cruiseSailingId: id })} onBack={() => setView('manage-travel')} />;
            case 'edit-cruise-sailing':
                if (typeof view !== 'object' || view.view !== 'edit-cruise-sailing') return null;
                const sailingToEdit = cruiseSailings.find((item) => item.id === view.cruiseSailingId);
                if (!sailingToEdit) return <div>Cruise sailing not found.</div>;
                return <AdminTravelEditor entity={sailingToEdit} organizations={organizations} cruiseSeries={cruiseSeries} sailings={cruiseSailings} onSaved={handleTravelSaved} onOpenSailing={(id) => setView({ view: 'edit-cruise-sailing', cruiseSailingId: id })} onBack={() => setView('manage-travel')} />;
            case 'manage-venues':
                return <AdminManageVenues venues={venues} listings={listings} buildingAssets={buildingAssets} mediaCatalog={brandMediaCatalog} setView={setView} onDataChange={fetchData} />;
            case 'manage-organizations':
                return <AdminManageOrganizations organizations={organizations} listings={listings} relationships={organizationVenueRelationships} organizationRelationships={organizationRelationships} mediaCatalog={brandMediaCatalog} setView={setView} onDeleted={handleOrganizationDeleted} />;
            case 'add-organization':
                return <AdminOrganizationDetailEditor organization={{ id: '', type: 'organization', name: '', slug: '', displayTypes: ['host', 'promoter'], status: 'draft' }} organizations={organizations} organizationRelationships={organizationRelationships} onOrganizationRelationshipsChanged={setOrganizationRelationships} listings={listings} venues={venues} relationships={organizationVenueRelationships} users={users} onSaved={(saved) => { handleOrganizationSaved(saved); setView({ view: 'edit-organization', organizationId: saved.id }); }} onDeleted={handleOrganizationDeleted} onBack={() => setView('manage-organizations')} />;
            case 'edit-organization':
                if (typeof view !== 'object' || view.view !== 'edit-organization') return null;
                const organizationToEdit = organizations.find((organization) => organization.id === view.organizationId);
                if (!organizationToEdit) return <div>Promoter / host not found.</div>;
                return <AdminOrganizationDetailEditor organization={organizationToEdit} organizations={organizations} organizationRelationships={organizationRelationships} onOrganizationRelationshipsChanged={setOrganizationRelationships} listings={listings} venues={venues} relationships={organizationVenueRelationships} users={users} onSaved={handleOrganizationSaved} onDeleted={handleOrganizationDeleted} onBack={() => setView('manage-organizations')} />;
            case 'add-venue':
                const newVenue: VenueData = {
                    id: '',
                    type: 'venue',
                    name: '',
                    slug: '',
                    address: { city: '', region: '', country: 'USA' },
                    latitude: 0,
                    longitude: 0,
                    visibility: 'public_exact',
                    status: 'draft',
                    amenities: [],
                };
                return (
                    <AdminVenueDetailEditor
                        venue={newVenue}
                        venues={venues}
                        organizations={organizations}
                        relationships={organizationVenueRelationships}
                        listings={listings}
                        buildingAssets={buildingAssets}
                        entityIndex={entityIndex}
                        onSaved={(venue) => {
                            handleVenueSaved(venue);
                            setView({ view: 'edit-venue', venueId: venue.id });
                        }}
                        onBack={() => setView('manage-venues')}
                    />
                );
            case 'edit-venue':
                if (typeof view !== 'object' || view.view !== 'edit-venue') return null;
                const venueToEdit = venues.find((venue) => venue.id === view.venueId);
                if (!venueToEdit) return <div>Venue not found.</div>;
                return (
                    <AdminVenueDetailEditor
                        venue={venueToEdit}
                        venues={venues}
                        organizations={organizations}
                        relationships={organizationVenueRelationships}
                        listings={listings}
                        buildingAssets={buildingAssets}
                        entityIndex={entityIndex}
                        onSaved={handleVenueSaved}
                        onBack={() => setView('manage-venues')}
                    />
                );
             case 'edit-event':
                 if (typeof view !== 'object' || view.view !== 'edit-event') return null;
                 const eventToEdit = listings.find(l => l.id === view.eventId && l.type === 'event') as EventData | undefined;
                 if (!eventToEdit) return <div>Event not found.</div>;
                 return (
                    <AdminListingDetailEditor
                        listing={eventToEdit}
                        users={users}
                        venues={venues}
                        organizations={organizations}
                        clubBrands={clubBrands}
                        relationships={organizationVenueRelationships}
                        listings={listings}
                        buildingAssets={buildingAssets}
                        entityIndex={entityIndex}
                        onVenueSaved={handleVenueSaved}
                        onRelationshipSaved={handleRelationshipSaved}
                        onSaved={handleListingSaved}
                        onBack={() => setView('manage-events')}
                        backLabel="Back to events"
                    />
                 );
            case 'audit-log':
                return <AdminAuditLog />;
            case 'building-inspector':
                return (
                    <AdminBuildingInspector
                        listings={listings}
                        venues={venues}
                        organizations={organizations}
                        relationships={organizationVenueRelationships}
                        onUpdateListing={(updated) =>
                            setListings((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
                        }
                        onUpdateVenue={handleVenueSaved}
                    />
                );
            default:
                const viewStr = typeof view === 'string' ? view : view.view;
                return (
                    <div>
                        <h1 className="text-4xl font-bold text-gray-800 mb-8">{viewStr.replace('-', ' ')}</h1>
                        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                            <p className="text-gray-500">This page is not yet implemented.</p>
                        </div>
                    </div>
                );
        }
    }

    const currentViewName = typeof view === 'string' ? view : view.view;

    return (
        <div className="flex h-screen bg-blue-50 font-sans text-gray-800">
            <AdminSidebar 
                currentView={currentViewName} 
                setView={setView} 
                pendingSubmissions={listings.filter(l => l.status === 'pending_approval').length}
                pendingFlags={flaggedContent.length}
            />
            <main className={currentViewName === 'building-inspector' ? 'flex-1 overflow-hidden p-3 md:p-4' : 'flex-1 p-6 md:p-8 overflow-y-auto'}>
                {renderContent()}
            </main>
        </div>
    );
};

export default AdminPanel;
