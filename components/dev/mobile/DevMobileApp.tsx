import React, { useMemo, useState } from 'react';
import { ArrowRight, Bookmark, CalendarDays, CheckCircle2, ChevronRight, Construction, HelpCircle, Info, Mail, Plus, Search, ShieldCheck, UserRound } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEntityIndex } from '../../../hooks/useEntityIndex';
import type { EntityIndex } from '../../../lib/entityIndex';
import { useAppStore } from '../../../store/appStore';
import { applyDevMobileListingSafetyToAll } from '../../../lib/devMobileListingSafety';
import type { Listing } from '../../../types';
import ProductionGlobePage from '../../ProductionGlobePage';
import SavedLivingLowPolyBackground from '../../SavedLivingLowPolyBackground';
import { ExplorerProvider } from '../../explorer/ExplorerProvider';
import { DevMobileScreen, MobileHeader } from './DevMobileShell';
import { DEV_MOBILE_BASE, getDevMobileListingPath } from './devMobileRouting';
import { MobileClubPage, MobileEventPage } from './MobileDetailPages';
import { MobileListingCard } from './MobileListingCard';
import { useDevMobileSaved } from './useDevMobileSaved';

const MobileExplorerPage: React.FC = () => (
  <div className="mx-auto h-[100dvh] max-h-[844px] w-full max-w-[390px] overflow-hidden bg-[#030407]">
    <ExplorerProvider>
      <ProductionGlobePage mobilePrototype />
    </ExplorerProvider>
  </div>
);

const MobileHomeScreen: React.FC = () => {
  const navigate = useNavigate();

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
              <div className="text-[18px] font-extrabold uppercase tracking-[0.035em]"><span className="text-red-500">Swing</span><span className="text-white">Sphere</span></div>
            </div>
            <h1 className="mt-6 max-w-[330px] text-[38px] font-semibold leading-[0.98] tracking-[-0.045em] text-white">Explore the lifestyle. Around the corner or around the world.</h1>
            <p className="mt-4 max-w-[330px] text-[14px] leading-6 text-gray-300/85">Discover clubs, events, and destinations through an interactive world built for exploration.</p>
            <button type="button" onClick={() => navigate(DEV_MOBILE_BASE)} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-red-500 px-4 text-sm font-bold text-white shadow-[0_14px_36px_rgba(239,68,68,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-200">
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
}> = ({ title, eyebrow, icon, listings, isLoading, error, emptyTitle, emptyBody, searchable = false, index }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const mobileSafeListings = useMemo(() => applyDevMobileListingSafetyToAll(listings), [listings]);
  const visibleListings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? mobileSafeListings.filter((listing) => `${listing.name} ${listing.location}`.toLowerCase().includes(normalized)) : mobileSafeListings;
  }, [mobileSafeListings, query]);

  return (
    <DevMobileScreen>
      <div className="flex h-full min-h-0 flex-col">
        <MobileHeader title={title} eyebrow={eyebrow} />
        {searchable ? <label className="mx-3 mt-3 flex min-h-12 shrink-0 items-center gap-2 rounded-[18px] border border-white/[0.075] bg-white/[0.04] px-3"><Search className="h-4 w-4 text-gray-500" /><span className="sr-only">Search {title}</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500" placeholder={`Search ${title.toLowerCase()}`} /></label> : null}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-3">
          {isLoading ? <div className="space-y-3" aria-label={`Loading ${title}`}><div className="h-28 animate-pulse rounded-[22px] bg-white/[0.045]" /><div className="h-28 animate-pulse rounded-[22px] bg-white/[0.045]" /></div> : error ? <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center" role="alert"><Info className="h-7 w-7 text-red-200" /><h1 className="mt-4 text-lg font-semibold text-white">Unable to load {title.toLowerCase()}</h1><p className="mt-2 text-sm leading-6 text-gray-400">{error}</p></div> : visibleListings.length ? <div className="space-y-2.5">{visibleListings.map((listing) => <MobileListingCard key={listing.id} listing={listing} onClick={() => navigate(getDevMobileListingPath(listing, index ?? undefined))} />)}</div> : <div className="flex min-h-[50vh] flex-col items-center justify-center px-7 text-center"><span className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/[0.075] bg-white/[0.035] text-red-200">{icon}</span><h1 className="mt-5 text-lg font-semibold text-white">{query ? 'No matches found' : emptyTitle}</h1><p className="mt-2 text-sm leading-6 text-gray-400">{query ? 'Try a different club, event, or location.' : emptyBody}</p></div>}
        </main>
      </div>
    </DevMobileScreen>
  );
};

const MobileEventsScreen: React.FC = () => {
  const { listings, index, isLoading, error } = useEntityIndex();
  const events = useMemo(() => listings
    .filter((listing): listing is Extract<Listing, { type: 'event' }> => listing.type === 'event' && Date.parse(listing.time.end) >= Date.now())
    .sort((a, b) => Date.parse(a.time.start) - Date.parse(b.time.start)), [listings]);
  return <ListingCollectionScreen title="Events" eyebrow="Discover" icon={<CalendarDays className="h-6 w-6" />} listings={events} index={index ?? undefined} isLoading={isLoading} error={error} emptyTitle="No events are listed" emptyBody="Try another destination from Explore, or check back as the event calendar grows." searchable />;
};

const MobileSavedScreen: React.FC = () => {
  const { listings, index, isLoading, error } = useEntityIndex();
  const { savedIds } = useDevMobileSaved();
  const saved = useMemo(() => savedIds.flatMap((id) => listings.find((listing) => listing.id === id) ?? []), [listings, savedIds]);
  return <ListingCollectionScreen title="Saved" eyebrow="Your places" icon={<Bookmark className="h-6 w-6" />} listings={saved} index={index ?? undefined} isLoading={isLoading} error={error} emptyTitle="Nothing saved yet" emptyBody="Save clubs and events from their detail pages to keep them close at hand." />;
};

const MobileAddScreen: React.FC = () => {
  const [type, setType] = useState<'club' | 'event'>('club');
  return (
    <DevMobileScreen>
      <div className="flex h-full min-h-0 flex-col">
        <MobileHeader title="Add a listing" eyebrow="Community submission" />
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-4">
          <div className="rounded-[26px] border border-white/[0.075] bg-white/[0.035] p-5">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500/12 text-red-200"><Plus className="h-5 w-5" /></span>
            <h1 className="mt-4 text-xl font-semibold text-white">Help the community discover a place or event</h1>
            <p className="mt-2 text-[13px] leading-6 text-gray-400">Dev Mobile submissions are intentionally staged here while the complete moderation and ownership flow is adapted for touch.</p>
          </div>
          <section className="mt-3 rounded-[24px] border border-white/[0.075] bg-white/[0.03] p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">What are you adding?</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['club', 'event'] as const).map((value) => <button key={value} type="button" onClick={() => setType(value)} className={`min-h-12 rounded-2xl border text-sm font-semibold capitalize ${type === value ? 'border-red-400/50 bg-red-500/12 text-red-100' : 'border-white/[0.075] bg-white/[0.025] text-gray-300'}`} aria-pressed={type === value}>{value}</button>)}
            </div>
            <label className="mt-4 block"><span className="text-[11px] font-semibold text-gray-400">{type === 'club' ? 'Club name' : 'Event name'}</span><input className="mt-2 min-h-12 w-full rounded-2xl border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none focus:border-red-400/45" placeholder="Name" /></label>
            <label className="mt-3 block"><span className="text-[11px] font-semibold text-gray-400">City and country</span><input className="mt-2 min-h-12 w-full rounded-2xl border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none focus:border-red-400/45" placeholder="City, country" /></label>
            <button type="button" disabled className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.055] text-sm font-semibold text-gray-500"><Construction className="h-4 w-4" />Submission review coming next</button>
            <p className="mt-3 text-[11px] leading-5 text-gray-500">No information is submitted from this prototype. The production submission and moderation workflow remains unchanged.</p>
          </section>
        </main>
      </div>
    </DevMobileScreen>
  );
};

const MobileAccountScreen: React.FC = () => {
  const { currentUser } = useAppStore();
  const navigate = useNavigate();
  return (
    <DevMobileScreen>
      <div className="flex h-full min-h-0 flex-col">
        <MobileHeader title="Account" eyebrow="SwingSphere" />
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-4">
          <section className="rounded-[26px] border border-white/[0.075] bg-white/[0.035] p-5 text-center">
            <span className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-[26px] border border-white/[0.1] bg-black/30">{currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-7 w-7 text-gray-400" />}</span>
            <h1 className="mt-4 text-xl font-semibold text-white">{currentUser?.displayName || 'SwingSphere member'}</h1>
            <p className="mt-1 text-sm text-gray-500">{currentUser?.email || 'Signed in for Dev Mobile evaluation'}</p>
          </section>
          <section className="mt-3 overflow-hidden rounded-[24px] border border-white/[0.075] bg-white/[0.03]">
            <button type="button" onClick={() => navigate('/dev/mobile-preview/saved')} className="flex min-h-14 w-full items-center gap-3 border-b border-white/[0.055] px-4 text-left"><Bookmark className="h-4 w-4 text-red-200" /><span className="flex-1 text-[13px] text-gray-200">Saved places</span><ChevronRight className="h-4 w-4 text-gray-600" /></button>
            <div className="flex min-h-14 items-center gap-3 border-b border-white/[0.055] px-4"><ShieldCheck className="h-4 w-4 text-red-200" /><span className="flex-1 text-[13px] text-gray-200">Privacy & safety</span><span className="text-[10px] text-gray-500">Protected</span></div>
            <div className="flex min-h-14 items-center gap-3 px-4"><CheckCircle2 className="h-4 w-4 text-red-200" /><span className="flex-1 text-[13px] text-gray-200">Mobile preferences</span><span className="text-[10px] text-gray-500">Coming later</span></div>
          </section>
          <div className="mt-3 rounded-[20px] border border-amber-300/10 bg-amber-300/[0.04] p-4 text-[11px] leading-5 text-gray-400">Account settings are read-only in Dev Mobile. Authentication and production account data are not modified by this experiment.</div>
        </main>
      </div>
    </DevMobileScreen>
  );
};

const DevMobileApp: React.FC = () => (
  <div className="min-h-screen overflow-hidden bg-[#030407]">
    <Routes>
      <Route index element={<MobileExplorerPage />} />
      <Route path="home" element={<MobileHomeScreen />} />
      <Route path="clubs/:slug" element={<MobileClubPage />} />
      <Route path="events" element={<MobileEventsScreen />} />
      <Route path="events/:slug" element={<MobileEventPage />} />
      <Route path="saved" element={<MobileSavedScreen />} />
      <Route path="add" element={<MobileAddScreen />} />
      <Route path="account" element={<MobileAccountScreen />} />
      <Route path="*" element={<Navigate to="/dev/mobile-preview" replace />} />
    </Routes>
  </div>
);

export default DevMobileApp;
