import React, { useEffect, useMemo, useState } from 'react';
import type {
    ClubData,
    CruiseSailingData,
    CruiseSeriesData,
    EventData,
    Listing,
    ResortData,
    Tag,
    VenueData,
} from '../../types';
import { AdminView } from './AdminPanel';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import { resolveCountryFlagEmoji } from '../../lib/formatting';
import { buildingVerificationNeedsReview } from '../../lib/buildingVerification';

const Icon: React.FC<{ path: string }> = ({ path }) => (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
);

const icons = {
    inbox: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
    flag: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H8.5l-1-1H5a2 2 0 00-2 2z',
    image: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    map: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
    calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    building: 'M3 21h18M5 21V5a2 2 0 012-2h7a2 2 0 012 2v16M9 7h3M9 11h3M9 15h3M16 9h3a2 2 0 012 2v10',
    ship: 'M3 18c2 1 4 1 6 0 2 1 4 1 6 0 2 1 4 1 6 0M5 15l2-8h10l2 8M9 7V4h6v3',
    sparkles: 'M5 3v4M3 5h4m10-2v4m-2-2h4M6 15v6m-3-3h6m8-5v8m-4-4h8',
};

type AdminDashboardProps = {
    setView: (view: AdminView) => void;
    allTags: Tag[];
};

type DashboardData = {
    listings: Listing[];
    flagged: any[];
    venues: VenueData[];
    resorts: ResortData[];
    cruiseSeries: CruiseSeriesData[];
    cruiseSailings: CruiseSailingData[];
    clubBrands: Awaited<ReturnType<typeof api.getClubBrands>>;
    eventSeries: Awaited<ReturnType<typeof api.getEventSeries>>;
    organizations: Awaited<ReturnType<typeof api.getOrganizations>>;
};

const Surface: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string }> = ({ title, subtitle, children, className = '' }) => (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
        <div className="mb-4 border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
    </section>
);

const ActionCard: React.FC<{
    label: string;
    value: number;
    description: string;
    icon: React.ReactNode;
    tone: 'neutral' | 'warning' | 'danger';
    onClick: () => void;
}> = ({ label, value, description, icon, tone, onClick }) => {
    const toneClasses = {
        neutral: 'bg-slate-100 text-slate-700',
        warning: 'bg-amber-100 text-amber-700',
        danger: 'bg-red-100 text-red-700',
    };
    return (
        <button onClick={onClick} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold text-slate-600">{label}</p>
                    <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
                </div>
                <span className={`rounded-xl p-3 ${toneClasses[tone]}`}>{icon}</span>
            </div>
        </button>
    );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ setView, allTags }) => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedHealthKey, setExpandedHealthKey] = useState<string | null>(null);
    const { addToast } = useAppStore();

    useEffect(() => {
        const load = async () => {
            try {
                const [listings, flagged, venues, resorts, cruiseSeries, cruiseSailings, clubBrands, eventSeries, organizations] = await Promise.all([
                    api.getListings(),
                    api.getFlaggedContent(),
                    api.getVenues(),
                    api.getResorts(),
                    api.getCruiseSeries(),
                    api.getCruiseSailings(),
                    api.getClubBrands(),
                    api.getEventSeries(),
                    api.getOrganizations(),
                ]);
                setData({ listings, flagged, venues, resorts, cruiseSeries, cruiseSailings, clubBrands, eventSeries, organizations });
            } catch {
                addToast({ message: 'Failed to load dashboard data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [addToast]);

    const computed = useMemo(() => {
        if (!data) return null;
        const clubs = data.listings.filter((item): item is ClubData => item.type === 'club');
        const events = data.listings.filter((item): item is EventData => item.type === 'event');
        const upcomingEvents = events
            .filter((event) => Date.parse(event.time.start) > Date.now())
            .sort((a, b) => Date.parse(a.time.start) - Date.parse(b.time.start));
        const upcomingSailings = data.cruiseSailings
            .filter((sailing) => Date.parse(sailing.startsAt) > Date.now())
            .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

        const missingLogos = data.listings.filter((item) => !item.logoImageUrl).length
            + data.resorts.filter((item) => !item.logoImageUrl).length
            + data.cruiseSeries.filter((item) => !item.logoImageUrl).length;
        const missingFlyers = upcomingEvents.filter((event) => !event.mediaAssets?.some((asset) => asset.role === 'flyer')).length;
        const clubsMissingSchedules = clubs.filter((club) => !club.schedule?.length).length;
        const venuesMissingBuildings = data.venues.filter((venue) => !venue.buildingAssetId).length;
        const organizationsMissingContact = data.organizations.filter((organization) => !organization.contactEmail && !organization.website).length;
        const pending = data.listings.filter((item) => item.status === 'pending_approval').length;
        const buildingVerificationFlags = [
            ...data.venues
                .filter((venue) => buildingVerificationNeedsReview(venue.locationMeta?.buildingVerification))
                .map((venue) => ({
                    id: `venue:${venue.id}`,
                    name: venue.name,
                    detail: venue.locationMeta?.buildingVerification?.candidateAddress
                        ? `Address mismatch near ${venue.locationMeta.buildingVerification.candidateAddress}`
                        : 'Nearby building address could not be confirmed',
                })),
            ...data.listings
                .filter((listing) => buildingVerificationNeedsReview(listing.locationMeta?.buildingVerification))
                .map((listing) => ({
                    id: `listing:${listing.id}`,
                    name: listing.name,
                    detail: listing.locationMeta?.buildingVerification?.candidateAddress
                        ? `Address mismatch near ${listing.locationMeta.buildingVerification.candidateAddress}`
                        : 'Nearby building address could not be confirmed',
                })),
        ];

        const timeline = [
            ...upcomingEvents.map((event) => ({
                id: event.id,
                kind: 'Event',
                title: event.name,
                date: event.time.start,
                subtitle: `${resolveCountryFlagEmoji(event.geopoint.address.country)} ${event.geopoint.address.city || event.location}`,
                onClick: () => setView({ view: 'edit-event', eventId: event.id }),
            })),
            ...upcomingSailings.map((sailing) => ({
                id: sailing.id,
                kind: 'Sailing',
                title: sailing.name,
                date: sailing.startsAt,
                subtitle: `${sailing.shipName} · ${sailing.departurePort.portName}`,
                onClick: () => setView({ view: 'edit-cruise-sailing', cruiseSailingId: sailing.id }),
            })),
        ].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 6);

        return {
            clubs,
            events,
            upcomingEvents,
            upcomingSailings,
            pending,
            missingLogos,
            missingFlyers,
            clubsMissingSchedules,
            venuesMissingBuildings,
            buildingVerificationFlags,
            organizationsMissingContact,
            timeline,
        };
    }, [data, setView]);

    if (isLoading) return <div className="flex h-full items-center justify-center text-slate-500">Loading dashboard…</div>;
    if (!data || !computed) return <div className="text-slate-500">Could not load dashboard data.</div>;

    const topTags = [...allTags].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5);
    const healthRows = [
        {
            key: 'missing-logos',
            label: 'Listings missing logos',
            value: computed.missingLogos,
            items: [
                ...data.listings.filter((item) => !item.logoImageUrl).map((item) => ({
                    id: item.id,
                    name: item.name,
                    detail: item.type === 'club' ? 'Club location' : 'Event occurrence',
                    onClick: () => setView(item.type === 'club' ? { view: 'edit-club', clubId: item.id } : { view: 'edit-event', eventId: item.id }),
                })),
                ...data.resorts.filter((item) => !item.logoImageUrl).map((item) => ({ id: item.id, name: item.name, detail: 'Resort', onClick: () => setView({ view: 'edit-resort', resortId: item.id }) })),
                ...data.cruiseSeries.filter((item) => !item.logoImageUrl).map((item) => ({ id: item.id, name: item.name, detail: 'Cruise series', onClick: () => setView({ view: 'edit-cruise-series', cruiseSeriesId: item.id }) })),
            ],
        },
        {
            key: 'missing-event-media',
            label: 'Upcoming events missing media',
            value: computed.missingFlyers,
            items: computed.upcomingEvents.filter((event) => !event.mediaAssets?.some((asset) => asset.role === 'flyer')).map((event) => ({
                id: event.id,
                name: event.name,
                detail: new Date(event.time.start).toLocaleDateString(),
                onClick: () => setView({ view: 'edit-event', eventId: event.id }),
            })),
        },
        {
            key: 'missing-schedules',
            label: 'Club locations missing schedules',
            value: computed.clubsMissingSchedules,
            items: computed.clubs.filter((club) => !club.schedule?.length).map((club) => ({
                id: club.id,
                name: club.name,
                detail: club.location,
                onClick: () => setView({ view: 'edit-club', clubId: club.id }),
            })),
        },
        {
            key: 'building-address-flags',
            label: 'Building address verification flags',
            value: computed.buildingVerificationFlags.length,
            items: computed.buildingVerificationFlags.map((item) => ({
                ...item,
                onClick: () => setView('building-inspector'),
            })),
        },
        {
            key: 'missing-buildings',
            label: 'Venues without verified buildings',
            value: computed.venuesMissingBuildings,
            items: data.venues.filter((venue) => !venue.buildingAssetId).map((venue) => ({
                id: venue.id,
                name: venue.name,
                detail: [venue.address.city, venue.address.region, venue.address.country].filter(Boolean).join(', '),
                onClick: () => setView({ view: 'edit-venue', venueId: venue.id }),
            })),
        },
        {
            key: 'missing-contacts',
            label: 'Organizations missing contact details',
            value: computed.organizationsMissingContact,
            items: data.organizations.filter((organization) => !organization.contactEmail && !organization.website).map((organization) => ({
                id: organization.id,
                name: organization.name,
                detail: organization.displayTypes.join(' · '),
                onClick: () => setView({ view: 'edit-organization', organizationId: organization.id }),
            })),
        },
    ];

    const inventory = [
        ['Club locations', computed.clubs.length],
        ['Club brands', data.clubBrands.length],
        ['Event occurrences', computed.events.length],
        ['Event series', data.eventSeries.length],
        ['Venues', data.venues.length],
        ['Resorts', data.resorts.length],
        ['Cruise series', data.cruiseSeries.length],
        ['Upcoming sailings', computed.upcomingSailings.length],
    ];

    return (
        <div className="mx-auto max-w-[1500px] space-y-6">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-slate-950">Dashboard</h1>
                    <p className="mt-2 text-slate-500">Content health, upcoming activity, and items that need attention.</p>
                </div>
                <p className="text-xs font-medium text-slate-400">Updated {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ActionCard label="Pending submissions" value={computed.pending} description="Listings waiting for review and approval." icon={<Icon path={icons.inbox} />} tone={computed.pending ? 'warning' : 'neutral'} onClick={() => setView('submissions')} />
                <ActionCard label="Flagged content" value={data.flagged.length} description="Reports and moderation items awaiting action." icon={<Icon path={icons.flag} />} tone={data.flagged.length ? 'danger' : 'neutral'} onClick={() => setView('moderation')} />
                <ActionCard label="Missing media" value={computed.missingLogos + computed.missingFlyers} description="Content missing a logo, banner, or event image." icon={<Icon path={icons.image} />} tone={computed.missingLogos + computed.missingFlyers ? 'warning' : 'neutral'} onClick={() => setView('manage-clubs')} />
                <ActionCard label="Building review" value={computed.venuesMissingBuildings + computed.buildingVerificationFlags.length} description="Missing building links plus address matches the resolver could not confirm." icon={<Icon path={icons.map} />} tone={computed.venuesMissingBuildings + computed.buildingVerificationFlags.length ? 'warning' : 'neutral'} onClick={() => setView('building-inspector')} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Surface title="Content health" subtitle="The most useful cleanup opportunities across the directory." className="xl:col-span-2">
                    <div className="divide-y divide-slate-100">
                        {healthRows.map((row) => {
                            const expanded = expandedHealthKey === row.key;
                            return (
                                <div key={row.key}>
                                    <button
                                        onClick={() => setExpandedHealthKey((current) => current === row.key ? null : row.key)}
                                        className="flex w-full items-center justify-between py-3 text-left transition hover:bg-slate-50"
                                        aria-expanded={expanded}
                                    >
                                        <span>
                                            <span className="block text-sm font-medium text-slate-700">{row.label}</span>
                                            {row.value > 0 && <span className="mt-0.5 block text-xs text-slate-400">Click to see the affected records</span>}
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.value ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{row.value}</span>
                                            <span className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
                                        </span>
                                    </button>
                                    {expanded && (
                                        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                                            {row.items.length ? row.items.map((item) => (
                                                <button key={`${row.key}-${item.id}`} onClick={item.onClick} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-white hover:shadow-sm">
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-semibold text-slate-800">{item.name}</span>
                                                        <span className="block truncate text-xs text-slate-500">{item.detail || 'Open record to complete this item'}</span>
                                                    </span>
                                                    <span className="ml-4 shrink-0 text-xs font-bold text-blue-600">Fix now →</span>
                                                </button>
                                            )) : <p className="px-3 py-4 text-center text-sm text-emerald-700">No affected records.</p>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Surface>

                <Surface title="Upcoming" subtitle="Events and sailings in chronological order.">
                    <div className="space-y-2">
                        {computed.timeline.length ? computed.timeline.map((item) => (
                            <button key={`${item.kind}-${item.id}`} onClick={item.onClick} className="w-full rounded-xl border border-slate-100 p-3 text-left transition hover:border-slate-200 hover:bg-slate-50">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-red-600">{item.kind}</span>
                                    <span className="text-xs text-slate-400">{new Date(item.date).toLocaleDateString()}</span>
                                </div>
                                <p className="mt-1 font-semibold text-slate-900">{item.title}</p>
                                <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p>
                            </button>
                        )) : <p className="py-6 text-center text-sm text-slate-400">Nothing upcoming yet.</p>}
                    </div>
                </Surface>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Surface title="Content inventory" subtitle="A compact view of every managed content layer." className="xl:col-span-2">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {inventory.map(([label, value]) => (
                            <div key={label} className="rounded-xl bg-slate-50 p-4">
                                <p className="text-2xl font-black text-slate-950">{value}</p>
                                <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
                            </div>
                        ))}
                    </div>
                </Surface>

                <Surface title="Top tags" subtitle="Most-used discovery labels.">
                    <div className="space-y-3">
                        {topTags.map((tag, index) => (
                            <div key={tag.id} className="flex items-center gap-3">
                                <span className="w-5 text-xs font-bold text-slate-400">{index + 1}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="truncate text-sm font-medium text-slate-700">{tag.label}</span>
                                        <span className="text-xs font-bold text-slate-500">{tag.usageCount}</span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                        <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.max(8, (tag.usageCount / Math.max(1, topTags[0]?.usageCount ?? 1)) * 100)}%` }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Surface>
            </div>

            <Surface title="Quick actions" subtitle="Jump directly into the most common admin workflows.">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                        ['Add club', 'add-club', icons.building],
                        ['Add event', 'add-event', icons.calendar],
                        ['Add resort', 'add-resort', icons.sparkles],
                        ['Add cruise', 'add-cruise-series', icons.ship],
                        ['Review submissions', 'submissions', icons.inbox],
                        ['Building inspector', 'building-inspector', icons.map],
                    ].map(([label, target, path]) => (
                        <button key={label} onClick={() => setView(target as AdminView)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white">
                            <Icon path={path} />
                            {label}
                        </button>
                    ))}
                </div>
            </Surface>
        </div>
    );
};

export default AdminDashboard;
