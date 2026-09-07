import React, { useMemo, useState } from 'react';
import { ArrowRight, Bookmark, Building2, CalendarClock, CheckCircle2, ChevronRight, Crosshair, HelpCircle, Info, Mail, MapPin, Navigation, Search, ShieldCheck, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEntityIndex } from '../../../hooks/useEntityIndex';
import type { EntityIndex } from '../../../lib/entityIndex';
import { useAppStore } from '../../../store/appStore';
import { applyDevMobileListingSafetyToAll } from '../../../lib/devMobileListingSafety';
import type { Listing } from '../../../types';
import ProductionGlobePage from '../../ProductionGlobePage';
import ProtectedRoute from '../../ProtectedRoute';
import ListingEditor from '../../listing-editor/ListingEditor';
import SavedLivingLowPolyBackground from '../../SavedLivingLowPolyBackground';
import { DeviceExperienceProvider, useDeviceExperience, type DeviceExperienceKind } from '../../device/DeviceExperienceContext';
import { ExplorerProvider } from '../../explorer/ExplorerProvider';
import { DevMobileScreen, MobileHeader } from './DevMobileShell';
import { DEV_MOBILE_BASE } from './devMobileRouting';
import { MobileClubPage, MobileEventPage } from './MobileDetailPages';
import { MobileListingCard } from './MobileListingCard';
import { useDevMobileSaved } from './useDevMobileSaved';
import TabletNearbyPreviewPanel from '../tablet/TabletNearbyPreviewPanel';

const StreetViewPresentationPage = React.lazy(() => import('../StreetViewToolPage').then((module) => ({ default: module.StreetViewPresentationPage })));

const MobileExplorerPage: React.FC = () => {
  const { basePath } = useDeviceExperience();
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#030407]">
      <ExplorerProvider>
        <ProductionGlobePage mobilePrototype mobileExperienceBasePath={basePath} />
      </ExplorerProvider>
    </div>
  );
};

const MobileHomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const { basePath } = useDeviceExperience();

  const openSitePage = (path: string) => {
    if (window.top && window.top !== window) {
      window.top.location.assign(path);
      return;
    }
    window.location.assign(path);
  };

  return (
    <DevMobileScreen>
      <main className="relative h-full min-h-0 overflow-y-auto overscroll-contain bg-[#05070a]">
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-90">
          <SavedLivingLowPolyBackground className="absolute inset-0" interactive={false} />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,5,8,0.05)_0%,rgba(3,5,8,0.22)_44%,rgba(3,5,8,0.58)_72%,rgba(3,5,8,0.82)_100%)]" />
        </div>
        <div className="relative z-10 px-4 pb-8 pt-[max(2rem,env(safe-area-inset-top))]">
          <section className="flex min-h-[430px] flex-col justify-end pb-8 pt-8">
            <div className="flex items-center gap-3">
              <img src="/swingsphere-logo.png" alt="" className="h-12 w-12 object-contain drop-shadow-[0_14px_30px_rgba(0,0,0,0.45)]" />
              <div className="text-[18px] font-extrabold uppercase tracking-[0.04em]"><span className="text-red-500">Swing</span><span className="text-white">Sphere</span></div>
            </div>
            <h1 className="mt-6 max-w-[330px] text-[38px] font-semibold leading-[0.98] tracking-[-0.045em] text-white">Explore the lifestyle. Around the corner or around the world.</h1>
            <p className="mt-4 max-w-[330px] text-[14px] leading-6 text-gray-300/85">Discover clubs, events, and destinations through an interactive world built for exploration.</p>
            <button type="button" onClick={() => navigate(basePath)} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-red-500 px-4 text-sm font-bold text-white shadow-[0_14px_36px_rgba(239,68,68,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-200">
              Explore the world <ArrowRight className="h-4 w-4" />
            </button>
            <p className="mt-3 text-center text-[11px] text-gray-500">Browse freely. Share only what you choose.</p>
          </section>

          <section className="ss-glass ss-glass--liquid rounded-[28px] border-white/[0.075] p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-300/75">About SwingSphere</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Discovery first. Navigation second.</h2>
            <p className="mt-2 text-[13px] leading-6 text-gray-400">SwingSphere helps you discover lifestyle clubs, events, and communities by place. When you need turn-by-turn directions, your preferred maps app can take it from there.</p>
          </section>

          <section className="ss-glass ss-glass--liquid mt-3 overflow-hidden rounded-[26px] border-white/[0.075]">
            {[
              { label: 'About this site', path: '/about', icon: Info },
              { label: 'Frequently asked questions', path: '/faq', icon: HelpCircle },
              { label: 'Privacy & safety', path: '/privacy', icon: ShieldCheck },
              { label: 'Terms of service', path: '/tos', icon: CheckCircle2 },
              { label: 'Contact', path: 'mailto:swingsphereconnect@gmail.com', icon: Mail },
            ].map(({ label, path, icon: Icon }, index) => (
              <button key={label} type="button" onClick={() => openSitePage(path)} className={`flex min-h-14 w-full items-center gap-3 px-4 text-left ${index < 4 ? 'border-b border-white/[0.055]' : ''}`}>
                <Icon className="h-4 w-4 text-red-200" />
                <span className="flex-1 text-[13px] font-medium text-gray-200">{label}</span>
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
            ))}
          </section>

          <footer className="px-2 pb-2 pt-7 text-center">
            <img src="/swingsphere-logo.png" alt="" className="mx-auto h-8 w-8 object-contain opacity-80" />
            <p className="mt-3 text-[10px] leading-5 text-gray-600">SwingSphere is built for adult discovery, privacy, and intentional exploration.</p>
          </footer>
        </div>
      </main>
    </DevMobileScreen>
  );
};

const ListingCollectionScreen: React.FC<{
  title: string;
  eyebrow?: string;
  icon: React.ReactNode;
  listings: Listing[];
  isLoading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyBody: string;
  searchable?: boolean;
  index?: EntityIndex;
  immersiveBackground?: boolean;
  cardVisualMode?: 'default' | 'logo-over-hero';
}> = ({ title, eyebrow, icon, listings, isLoading, error, emptyTitle, emptyBody, searchable = false, index, immersiveBackground = false, cardVisualMode = 'default' }) => {
  const navigate = useNavigate();
  const { getListingPath } = useDeviceExperience();
  const [query, setQuery] = useState('');
  const mobileSafeListings = useMemo(() => applyDevMobileListingSafetyToAll(listings), [listings]);
  const visibleListings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? mobileSafeListings.filter((listing) => `${listing.name} ${listing.location}`.toLowerCase().includes(normalized)) : mobileSafeListings;
  }, [mobileSafeListings, query]);

  return (
    <DevMobileScreen>
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05070a]">
        {immersiveBackground ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-75">
            <SavedLivingLowPolyBackground className="absolute inset-0" interactive={false} />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,5,8,0.30)_0%,rgba(3,5,8,0.52)_38%,rgba(3,5,8,0.76)_78%,rgba(3,5,8,0.90)_100%)]" />
          </div>
        ) : null}
        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <MobileHeader title={title} eyebrow={eyebrow} />
          {searchable ? <label className="mx-3 mt-3 flex min-h-12 shrink-0 items-center gap-2 rounded-[18px] border border-white/[0.075] bg-white/[0.04] px-3"><Search className="h-4 w-4 text-gray-500" /><span className="sr-only">Search {title}</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500" placeholder={`Search ${title.toLowerCase()}`} /></label> : null}
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-3">
            {isLoading ? <div className="space-y-3" aria-label={`Loading ${title}`}><div className="h-28 animate-pulse rounded-[22px] bg-white/[0.045]" /><div className="h-28 animate-pulse rounded-[22px] bg-white/[0.045]" /></div> : error ? <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center" role="alert"><Info className="h-7 w-7 text-red-200" /><h1 className="mt-4 text-lg font-semibold text-white">Unable to load {title.toLowerCase()}</h1><p className="mt-2 text-sm leading-6 text-gray-400">{error}</p></div> : visibleListings.length ? <div className="space-y-2.5">{visibleListings.map((listing) => <MobileListingCard key={listing.id} listing={listing} visualMode={cardVisualMode} onClick={() => navigate(getListingPath(listing, index ?? undefined))} />)}</div> : <div className="flex min-h-[50vh] flex-col items-center justify-center px-7 text-center"><span className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/[0.075] bg-white/[0.035] text-red-200">{icon}</span><h1 className="mt-5 text-lg font-semibold text-white">{query ? 'No matches found' : emptyTitle}</h1><p className="mt-2 text-sm leading-6 text-gray-400">{query ? 'Try a different club, event, or location.' : emptyBody}</p></div>}
          </main>
        </div>
      </div>
    </DevMobileScreen>
  );
};

type NearbyOrigin = {
  latitude: number;
  longitude: number;
  label: string;
  source: 'device' | 'city';
};

type NearbyListing = {
  listing: Listing;
  distanceMiles: number;
};

const NEARBY_RADIUS_MILES = 40;
const NEARBY_SECTION_LIMIT = 5;
const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const distanceMiles = (origin: NearbyOrigin, listing: Listing) => {
  const latitude = Number(listing.geopoint?.latitude);
  const longitude = Number(listing.geopoint?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return Number.POSITIVE_INFINITY;

  const deltaLatitude = toRadians(latitude - origin.latitude);
  const deltaLongitude = toRadians(longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const listingLatitude = toRadians(latitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(listingLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistance = (miles: number) => miles < 0.1 ? 'Nearby' : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;

const MobileNearbyScreen: React.FC = () => {
  const navigate = useNavigate();
  const { getListingPath, kind } = useDeviceExperience();
  const { listings, index, isLoading, error } = useEntityIndex();
  const [origin, setOrigin] = useState<NearbyOrigin | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'requesting' | 'denied' | 'unavailable'>('idle');
  const [tabletSelectedListingId, setTabletSelectedListingId] = useState<string | null>(null);
  const { isSaved, toggleSaved } = useDevMobileSaved();
  const isTablet = kind === 'tablet';

  const safeListings = useMemo(() => applyDevMobileListingSafetyToAll(listings), [listings]);
  const cityOptions = useMemo(() => {
    const cities = new Map<string, { city: string; region: string; country: string; latitude: number; longitude: number; count: number }>();
    safeListings.forEach((listing) => {
      const address = listing.geopoint?.address;
      const latitude = Number(listing.geopoint?.latitude);
      const longitude = Number(listing.geopoint?.longitude);
      if (!address?.city || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const key = `${address.city}|${address.region}|${address.country}`;
      const current = cities.get(key);
      if (current) {
        current.latitude += (latitude - current.latitude) / (current.count + 1);
        current.longitude += (longitude - current.longitude) / (current.count + 1);
        current.count += 1;
      } else {
        cities.set(key, { city: address.city, region: address.region, country: address.country, latitude, longitude, count: 1 });
      }
    });
    return [...cities.values()].sort((a, b) => a.city.localeCompare(b.city));
  }, [safeListings]);

  const ranked = useMemo<NearbyListing[]>(() => {
    if (!origin) return [];
    return safeListings
      .map((listing) => ({ listing, distanceMiles: distanceMiles(origin, listing) }))
      .filter((item) => Number.isFinite(item.distanceMiles))
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }, [origin, safeListings]);

  const now = Date.now();
  const endOfToday = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }, [origin]);

  const tonight = useMemo(() => ranked
    .filter(({ listing, distanceMiles }) => listing.type === 'event'
      && distanceMiles <= NEARBY_RADIUS_MILES
      && Date.parse(listing.time.end) >= now
      && Date.parse(listing.time.start) <= endOfToday)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, NEARBY_SECTION_LIMIT), [endOfToday, now, ranked]);

  const upcoming = useMemo(() => ranked
    .filter(({ listing, distanceMiles }) => listing.type === 'event'
      && distanceMiles <= NEARBY_RADIUS_MILES
      && Date.parse(listing.time.end) >= now
      && Date.parse(listing.time.start) > endOfToday)
    .sort((a, b) => Date.parse((a.listing as Extract<Listing, { type: 'event' }>).time.start) - Date.parse((b.listing as Extract<Listing, { type: 'event' }>).time.start) || a.distanceMiles - b.distanceMiles)
    .slice(0, NEARBY_SECTION_LIMIT), [endOfToday, now, ranked]);

  const closestClubs = useMemo(() => ranked
    .filter(({ listing }) => listing.type === 'club')
    .slice(0, NEARBY_SECTION_LIMIT), [ranked]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationState('unavailable');
      return;
    }
    setLocationState('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: 'Current location', source: 'device' });
        setLocationState('idle');
      },
      (positionError) => setLocationState(positionError.code === positionError.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  };

  const openListing = (listing: Listing) => navigate(getListingPath(listing, index ?? undefined));
  const selectNearbyListing = (listing: Listing) => {
    if (isTablet) {
      setTabletSelectedListingId(listing.id);
      return;
    }
    openListing(listing);
  };
  const selectedNearbyItem = tabletSelectedListingId
    ? ranked.find(({ listing }) => listing.id === tabletSelectedListingId) ?? null
    : null;

  const Section: React.FC<{ title: string; eyebrow: string; icon: React.ReactNode; items: NearbyListing[]; empty: string; cardVisualMode?: 'default' | 'logo-over-hero' }> = ({ title, eyebrow, icon, items, empty, cardVisualMode = 'default' }) => (
    <section className="mt-4">
      <div className="mb-2 flex items-end gap-3 px-1">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] border border-white/[0.07] bg-white/[0.035] text-red-200">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">{eyebrow}</div>
          <h2 className="text-[16px] font-semibold text-white">{title}</h2>
        </div>
      </div>
      {items.length ? <div className="space-y-2.5">{items.map(({ listing, distanceMiles: miles }) => <MobileListingCard key={listing.id} listing={listing} metaLabel={formatDistance(miles)} visualMode={cardVisualMode} selected={isTablet && tabletSelectedListingId === listing.id} onClick={() => selectNearbyListing(listing)} />)}</div> : <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.025] px-4 py-4 text-[12px] leading-5 text-gray-500">{empty}</div>}
    </section>
  );

  return (
    <DevMobileScreen>
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05070a]">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-75">
          <SavedLivingLowPolyBackground className="absolute inset-0" interactive={false} />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,5,8,0.30)_0%,rgba(3,5,8,0.52)_38%,rgba(3,5,8,0.76)_78%,rgba(3,5,8,0.90)_100%)]" />
        </div>
        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <MobileHeader title="Nearby" eyebrow="Around the corner" />
          <main className={`min-h-0 flex-1 px-3 pb-6 pt-3 ${isTablet && origin ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'}`}>
          {isLoading ? <div className="space-y-3"><div className="h-36 animate-pulse rounded-[24px] bg-white/[0.045]" /><div className="h-28 animate-pulse rounded-[22px] bg-white/[0.045]" /></div> : error ? <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center" role="alert"><Info className="h-7 w-7 text-red-200" /><h1 className="mt-4 text-lg font-semibold text-white">Unable to load nearby places</h1><p className="mt-2 text-sm leading-6 text-gray-400">{error}</p></div> : !origin ? (
            <section className="relative overflow-hidden rounded-[26px] border border-white/[0.10] bg-[rgba(10,13,18,0.72)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.26)] backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-red-300/[0.08]" />
                <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border border-red-300/[0.07]" />
                <div className="absolute right-8 top-8 h-20 w-20 rounded-full bg-red-500/[0.055] blur-2xl" />
                <MapPin className="absolute right-6 top-7 h-24 w-24 rotate-[8deg] text-red-200/[0.045]" strokeWidth={1.1} />
                <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.018),transparent_42%,rgba(239,68,68,0.025))]" />
              </div>
              <div className="relative z-10">
              <span className="grid h-14 w-14 place-items-center rounded-[20px] border border-red-300/15 bg-red-500/[0.07] text-red-200"><MapPin className="h-6 w-6" /></span>
              <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.025em] text-white">Find what's near you</h1>
              <p className="mt-2 text-[13px] leading-6 text-gray-400">Use your location to see nearby clubs, what's happening tonight, and upcoming events within about {NEARBY_RADIUS_MILES} miles.</p>
              <button type="button" onClick={requestLocation} disabled={locationState === 'requesting'} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-red-500 px-4 text-sm font-bold text-white shadow-[0_12px_30px_rgba(239,68,68,0.22)] disabled:opacity-60"><Crosshair className="h-4 w-4" />{locationState === 'requesting' ? 'Finding you…' : 'Use my location'}</button>
              {locationState === 'denied' ? <p className="mt-3 text-[11px] leading-5 text-amber-200/75">Location access was declined. You can still choose a city below.</p> : null}
              {locationState === 'unavailable' ? <p className="mt-3 text-[11px] leading-5 text-amber-200/75">Your location isn't available right now. Choose a city instead.</p> : null}
              <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-white/[0.06]" /><span className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-600">or choose a city</span><div className="h-px flex-1 bg-white/[0.06]" /></div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Browse nearby</label>
              <select defaultValue="" onChange={(event) => {
                const city = cityOptions[Number(event.target.value)];
                if (city) setOrigin({ latitude: city.latitude, longitude: city.longitude, label: `${city.city}${city.region ? `, ${city.region}` : ''}`, source: 'city' });
              }} className="mt-2 min-h-12 w-full rounded-[16px] border border-white/[0.08] bg-[#0b0e13] px-3 text-sm text-gray-200 outline-none focus:border-red-300/40">
                <option value="" disabled>Select a city</option>
                {cityOptions.map((city, cityIndex) => <option key={`${city.city}-${city.region}-${city.country}`} value={cityIndex}>{city.city}{city.region ? `, ${city.region}` : ''}</option>)}
              </select>
              <p className="mt-4 text-[10px] leading-4 text-gray-600">SwingSphere only asks for your device location when you choose to use Nearby.</p>
              </div>
            </section>
          ) : isTablet ? (
            <div className={`grid h-full min-h-0 transition-[grid-template-columns,column-gap] duration-300 ease-out ${selectedNearbyItem ? 'grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] gap-3' : 'grid-cols-[minmax(0,1fr)_0fr] gap-0'}`}>
              <div className="min-h-0 overflow-y-auto overscroll-contain pr-0.5">
                <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-[15px] bg-red-500/[0.08] text-red-200">{origin.source === 'device' ? <Navigation className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}</span>
                    <div className="min-w-0 flex-1"><div className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Showing nearby</div><div className="truncate text-sm font-semibold text-white">{origin.label}</div></div>
                    <button type="button" onClick={() => { setTabletSelectedListingId(null); setOrigin(null); }} className="min-h-10 rounded-[14px] border border-white/[0.07] bg-white/[0.035] px-3 text-[11px] font-semibold text-gray-300">Change</button>
                  </div>
                </section>
                <Section title="Tonight" eyebrow="Happening soon" icon={<CalendarClock className="h-4 w-4" />} items={tonight} empty={`No events are showing within ${NEARBY_RADIUS_MILES} miles tonight.`} cardVisualMode="logo-over-hero" />
                <Section title="Closest clubs" eyebrow="Near you" icon={<Building2 className="h-4 w-4" />} items={closestClubs} empty="No clubs with usable location data are listed yet." cardVisualMode="logo-over-hero" />
                <Section title="Coming up nearby" eyebrow={`Within ${NEARBY_RADIUS_MILES} miles`} icon={<CalendarClock className="h-4 w-4" />} items={upcoming} empty="No additional upcoming events are listed nearby yet." cardVisualMode="logo-over-hero" />
              </div>
              <div className="min-h-0 min-w-0 overflow-hidden">
                <AnimatePresence initial={false}>
                  {selectedNearbyItem ? (
                    <motion.div
                      key={selectedNearbyItem.listing.id}
                      initial={{ opacity: 0, x: 72 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 72 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full min-h-0"
                    >
                      <TabletNearbyPreviewPanel
                        listing={selectedNearbyItem.listing}
                        distanceLabel={formatDistance(selectedNearbyItem.distanceMiles)}
                        saved={isSaved(selectedNearbyItem.listing.id)}
                        onToggleSaved={() => void toggleSaved(selectedNearbyItem.listing.id, selectedNearbyItem.listing.type)}
                        onOpenDetails={() => openListing(selectedNearbyItem.listing)}
                        onClose={() => setTabletSelectedListingId(null)}
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <>
              <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.03] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-[15px] bg-red-500/[0.08] text-red-200">{origin.source === 'device' ? <Navigation className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1"><div className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Showing nearby</div><div className="truncate text-sm font-semibold text-white">{origin.label}</div></div>
                  <button type="button" onClick={() => setOrigin(null)} className="min-h-10 rounded-[14px] border border-white/[0.07] bg-white/[0.035] px-3 text-[11px] font-semibold text-gray-300">Change</button>
                </div>
              </section>
              <Section title="Tonight" eyebrow="Happening soon" icon={<CalendarClock className="h-4 w-4" />} items={tonight} empty={`No events are showing within ${NEARBY_RADIUS_MILES} miles tonight.`} cardVisualMode="logo-over-hero" />
              <Section title="Closest clubs" eyebrow="Near you" icon={<Building2 className="h-4 w-4" />} items={closestClubs} empty="No clubs with usable location data are listed yet." cardVisualMode="logo-over-hero" />
              <Section title="Coming up nearby" eyebrow={`Within ${NEARBY_RADIUS_MILES} miles`} icon={<CalendarClock className="h-4 w-4" />} items={upcoming} empty="No additional upcoming events are listed nearby yet." cardVisualMode="logo-over-hero" />
            </>
          )}
          </main>
        </div>
      </div>
    </DevMobileScreen>
  );
};

const MobileSavedScreen: React.FC = () => {
  const navigate = useNavigate();
  const { toPath } = useDeviceExperience();
  const { currentUser } = useAppStore();
  const { listings, index, isLoading: isEntityLoading, error: entityError } = useEntityIndex();
  const { savedIds, isLoading: isSavedLoading, error: savedError } = useDevMobileSaved();
  const saved = useMemo(() => savedIds.flatMap((id) => listings.find((listing) => listing.id === id) ?? []), [listings, savedIds]);

  if (!currentUser) {
    return (
      <DevMobileScreen>
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05070a]">
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-70">
            <SavedLivingLowPolyBackground className="absolute inset-0" interactive={false} />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,5,8,0.34)_0%,rgba(3,5,8,0.70)_60%,rgba(3,5,8,0.92)_100%)]" />
          </div>
          <div className="relative z-10 flex h-full min-h-0 flex-col">
            <MobileHeader title="Saved" eyebrow="Your places" />
            <main className="flex min-h-0 flex-1 items-center px-5 pb-8 text-center">
              <section className="w-full rounded-[28px] border border-white/[0.085] bg-black/30 p-6 backdrop-blur-xl">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-red-300/15 bg-red-500/[0.07] text-red-200"><Bookmark className="h-7 w-7" /></span>
                <h1 className="mt-5 text-xl font-semibold text-white">Keep your discoveries with you</h1>
                <p className="mt-2 text-[13px] leading-6 text-gray-400">Sign in to save clubs and events privately to your SwingSphere account and access them across devices.</p>
                <button type="button" onClick={() => navigate('/login', { state: { from: toPath('/saved') } })} className="mt-6 min-h-12 w-full rounded-[18px] bg-red-500 px-4 text-sm font-bold text-white">Sign in</button>
                <button type="button" onClick={() => navigate('/signup', { state: { from: toPath('/saved') } })} className="mt-2 min-h-12 w-full rounded-[18px] border border-white/[0.09] bg-white/[0.04] px-4 text-sm font-semibold text-gray-200">Create an account</button>
              </section>
            </main>
          </div>
        </div>
      </DevMobileScreen>
    );
  }

  return <ListingCollectionScreen title="Saved" eyebrow="Your places" icon={<Bookmark className="h-6 w-6" />} listings={saved} index={index ?? undefined} isLoading={isEntityLoading || isSavedLoading} error={entityError || savedError} emptyTitle="Nothing saved yet" emptyBody="Save clubs and events from their detail pages to keep them close at hand. Your saved library follows your SwingSphere account across devices." immersiveBackground cardVisualMode="logo-over-hero" />;
};

const MobileAddScreen: React.FC = () => {
  const navigate = useNavigate();
  const { basePath } = useDeviceExperience();
  const [submittedListing, setSubmittedListing] = useState<Listing | null>(null);

  return (
    <DevMobileScreen>
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05070a]">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-65">
          <SavedLivingLowPolyBackground className="absolute inset-0" interactive={false} />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,5,8,0.10)_0%,rgba(3,5,8,0.34)_44%,rgba(3,5,8,0.70)_76%,rgba(3,5,8,0.92)_100%)]" />
        </div>
        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <MobileHeader title="Add a listing" eyebrow="Community submission" onBack={() => navigate(basePath)} />
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3">
          {submittedListing ? (
            <section className="flex min-h-[62vh] flex-col items-center justify-center rounded-[26px] border border-emerald-300/15 bg-emerald-300/[0.045] px-6 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-[22px] border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200"><CheckCircle2 className="h-7 w-7" /></span>
              <h1 className="mt-5 text-xl font-semibold text-white">Submission received</h1>
              <p className="mt-2 text-[13px] leading-6 text-gray-400"><span className="font-semibold text-gray-200">{submittedListing.name}</span> is saved for review and will not appear publicly until it is approved.</p>
              <div className="mt-6 grid w-full grid-cols-2 gap-2">
                <button type="button" onClick={() => setSubmittedListing(null)} className="min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.045] px-3 text-sm font-semibold text-white">Add another</button>
                <button type="button" onClick={() => navigate(basePath)} className="min-h-12 rounded-2xl bg-red-500 px-3 text-sm font-bold text-white">Explore</button>
              </div>
            </section>
          ) : (
            <ListingEditor
              mode="public"
              presentation="mobile"
              onSaved={setSubmittedListing}
              onCancel={() => navigate(basePath)}
            />
          )}
          </main>
        </div>
      </div>
    </DevMobileScreen>
  );
};

const MobileAccountScreen: React.FC = () => {
  const { currentUser, isAuthLoading } = useAppStore();
  const navigate = useNavigate();
  const { toPath } = useDeviceExperience();
  return (
    <DevMobileScreen>
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05070a]">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-60">
          <SavedLivingLowPolyBackground className="absolute inset-0" interactive={false} />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,5,8,0.32)_0%,rgba(3,5,8,0.62)_44%,rgba(3,5,8,0.86)_100%)]" />
        </div>
        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <MobileHeader title="Account" eyebrow="SwingSphere" />
          <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-4">
            {isAuthLoading ? (
              <section className="flex min-h-[45vh] items-center justify-center text-sm text-gray-400">Loading account…</section>
            ) : !currentUser ? (
              <section className="relative overflow-hidden rounded-[28px] border border-white/[0.085] bg-black/30 p-6 text-center backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
                <div className="relative z-10">
                  <span className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] border border-red-300/15 bg-black/45 text-gray-300"><UserRound className="h-8 w-8" /></span>
                  <h1 className="mt-5 text-xl font-semibold text-white">Your SwingSphere account</h1>
                  <p className="mt-2 text-[13px] leading-6 text-gray-400">Sign in to sync saved places across devices, submit listings, and access your member settings.</p>
                  <button type="button" onClick={() => navigate('/login', { state: { from: toPath('/account') } })} className="mt-6 min-h-12 w-full rounded-[18px] bg-red-500 px-4 text-sm font-bold text-white">Sign in</button>
                  <button type="button" onClick={() => navigate('/signup', { state: { from: toPath('/account') } })} className="mt-2 min-h-12 w-full rounded-[18px] border border-white/[0.09] bg-white/[0.04] px-4 text-sm font-semibold text-gray-200">Create an account</button>
                </div>
              </section>
            ) : (
              <>
                <section className="relative overflow-hidden rounded-[28px] border border-white/[0.085] bg-black/30 p-5 text-center backdrop-blur-xl">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
                  <div className="pointer-events-none absolute left-1/2 top-5 h-28 w-28 -translate-x-1/2 rounded-full bg-red-500/10 blur-3xl" />
                  <div className="relative z-10">
                    <span className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-[26px] border border-red-300/15 bg-black/45 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">{currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-7 w-7 text-gray-400" />}</span>
                    <h1 className="mt-4 text-xl font-semibold text-white">{currentUser.displayName}</h1>
                    <p className="mt-1 text-sm text-gray-400">{currentUser.email}</p>
                  </div>
                </section>

                <div className="mt-4 px-1 text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Your activity</div>
                <section className="mt-2 overflow-hidden rounded-[24px] border border-white/[0.075] bg-black/25 backdrop-blur-lg">
                  <button type="button" onClick={() => navigate(toPath('/saved'))} className="flex min-h-14 w-full items-center gap-3 px-4 text-left"><Bookmark className="h-4 w-4 text-red-200" /><span className="flex-1 text-[13px] text-gray-200">Saved places</span><ChevronRight className="h-4 w-4 text-gray-600" /></button>
                </section>

                <div className="mt-4 px-1 text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">Settings & safety</div>
                <section className="mt-2 overflow-hidden rounded-[24px] border border-white/[0.075] bg-black/25 backdrop-blur-lg">
                  <div className="flex min-h-14 items-center gap-3 border-b border-white/[0.055] px-4"><ShieldCheck className="h-4 w-4 text-red-200" /><span className="flex-1 text-[13px] text-gray-200">Privacy & safety</span><span className="text-[10px] text-gray-500">Protected</span></div>
                  <div className="flex min-h-14 items-center gap-3 px-4"><CheckCircle2 className="h-4 w-4 text-red-200" /><span className="flex-1 text-[13px] text-gray-200">Mobile preferences</span><span className="text-[10px] text-gray-500">Coming later</span></div>
                </section>

                <div className="mt-4 rounded-[20px] border border-red-300/10 bg-black/25 p-4 text-[11px] leading-5 text-gray-400 backdrop-blur-lg">Saved places are stored privately with your SwingSphere account and are available anywhere you sign in.</div>
              </>
            )}
          </main>
        </div>
      </div>
    </DevMobileScreen>
  );
};

type MobileErrorBoundaryState = { error: Error | null };
type MobileErrorBoundaryProps = React.PropsWithChildren<{ basePath: string }>;

class MobileErrorBoundary extends React.Component<MobileErrorBoundaryProps, MobileErrorBoundaryState> {
  state: MobileErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): MobileErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Dev Mobile runtime error', {
      error,
      componentStack: info.componentStack,
      path: window.location.pathname,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <DevMobileScreen>
        <div className="flex h-full min-h-0 flex-col items-center justify-center px-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-[22px] border border-red-300/15 bg-red-500/[0.06] text-red-200"><Info className="h-6 w-6" /></span>
          <h1 className="mt-5 text-xl font-semibold text-white">Something interrupted this view</h1>
          <p className="mt-2 max-w-[320px] text-sm leading-6 text-gray-400">Your mobile session is still safe. Retry this screen, or return to Explore.</p>
          <div className="mt-6 grid w-full max-w-[320px] grid-cols-2 gap-2">
            <button type="button" onClick={() => window.location.reload()} className="min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-sm font-semibold text-white">Retry</button>
            <button type="button" onClick={() => window.location.assign(this.props.basePath)} className="min-h-12 rounded-2xl bg-red-500 px-4 text-sm font-bold text-white">Explore</button>
          </div>
          <p className="mt-4 max-w-[320px] break-words text-[10px] leading-4 text-gray-600">{this.state.error.message || 'Unknown mobile runtime error'}</p>
        </div>
      </DevMobileScreen>
    );
  }
}

const DeviceStreetViewPage: React.FC = () => {
  const { kind } = useDeviceExperience();
  return (
    <React.Suspense fallback={<div className="grid h-[100dvh] w-full place-items-center bg-[#050608] text-xs font-semibold uppercase tracking-[0.18em] text-red-200">Loading Street View…</div>}>
      <StreetViewPresentationPage kind={kind} />
    </React.Suspense>
  );
};

const DeviceExperienceRoutes: React.FC = () => {
  const { basePath } = useDeviceExperience();
  return (
    <Routes>
      <Route index element={<MobileExplorerPage />} />
      <Route path="home" element={<MobileHomeScreen />} />
      <Route path="clubs/:slug" element={<MobileClubPage />} />
      <Route path="nearby" element={<MobileNearbyScreen />} />
      <Route path="events" element={<Navigate to={`${basePath}/nearby`} replace />} />
      <Route path="events/:slug" element={<MobileEventPage />} />
      <Route path="saved" element={<MobileSavedScreen />} />
      <Route path="street-view" element={<DeviceStreetViewPage />} />
      <Route path="add" element={<ProtectedRoute><MobileAddScreen /></ProtectedRoute>} />
      <Route path="account" element={<MobileAccountScreen />} />
      <Route path="*" element={<Navigate to={basePath} replace />} />
    </Routes>
  );
};

type DevMobileAppProps = {
  basePath?: string;
  experienceKind?: DeviceExperienceKind;
};

const DevMobileApp: React.FC<DevMobileAppProps> = ({ basePath = DEV_MOBILE_BASE, experienceKind = 'mobile' }) => (
  <DeviceExperienceProvider kind={experienceKind} basePath={basePath}>
    <MobileErrorBoundary basePath={basePath}>
      <div className="min-h-screen overflow-hidden bg-[#030407]">
        <DeviceExperienceRoutes />
      </div>
    </MobileErrorBoundary>
  </DeviceExperienceProvider>
);

export default DevMobileApp;
