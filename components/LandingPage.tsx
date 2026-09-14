import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingHeroGlobe from './LandingHeroGlobe';
import LandingStatsBar from './LandingStatsBar';
import HomepageDiscoveryCard from './HomepageDiscoveryCard';
import ExploreGlobeButton from './ExploreGlobeButton';
import Footer from './Footer';
import SavedLivingLowPolyBackground from './SavedLivingLowPolyBackground';
import { useEntityIndex } from '../hooks/useEntityIndex';
import { getListingCanonicalPath } from '../lib/entityUtils';
import { isActiveDiscoveryListing } from '../lib/eventLifecycle';
import type { Listing } from '../types';

let hasPlayedLandingHeroIntro = false;

type DiscoveryTab = 'featured' | 'recent';

type ListingDiscoverySignals = Listing & {
  addedAt?: string;
  createdAt?: string;
  created_at?: string;
  curated?: boolean;
  curatedOrder?: number;
  featured?: boolean;
  featuredPriority?: number;
  homepagePriority?: number;
  isFeatured?: boolean;
  priority?: number;
  updatedAt?: string;
  updated_at?: string;
};

const getFeaturedRank = (listing: Listing) => {
  const signals = listing as ListingDiscoverySignals;
  if (typeof signals.homepagePriority === 'number') return signals.homepagePriority;
  if (typeof signals.featuredPriority === 'number') return signals.featuredPriority;
  if (typeof signals.curatedOrder === 'number') return signals.curatedOrder;
  if (typeof signals.priority === 'number') return signals.priority;
  if (signals.isFeatured || signals.featured || signals.curated) return 0;
  return null;
};

const getListingTimestamp = (listing: Listing) => {
  const signals = listing as ListingDiscoverySignals;
  const value = signals.createdAt ?? signals.created_at ?? signals.addedAt ?? signals.updatedAt ?? signals.updated_at;
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const buildFeaturedListings = (listings: Listing[]) => {
  const approvedListings = listings.filter((listing) => listing.status === 'approved' && isActiveDiscoveryListing(listing));
  const withSourceIndex = approvedListings.map((listing, sourceIndex) => ({ listing, sourceIndex }));
  const hasFeaturedSignal = withSourceIndex.some(({ listing }) => getFeaturedRank(listing) !== null);

  if (!hasFeaturedSignal) return approvedListings.slice(0, 5);

  return withSourceIndex
    .sort((a, b) => {
      const rankA = getFeaturedRank(a.listing) ?? Number.POSITIVE_INFINITY;
      const rankB = getFeaturedRank(b.listing) ?? Number.POSITIVE_INFINITY;
      return rankA - rankB || a.sourceIndex - b.sourceIndex;
    })
    .slice(0, 5)
    .map(({ listing }) => listing);
};

const buildRecentlyAddedListings = (listings: Listing[]) => {
  const approvedListings = listings.filter((listing) => listing.status === 'approved' && isActiveDiscoveryListing(listing));

  return approvedListings
    .map((listing, sourceIndex) => ({
      listing,
      sourceIndex,
      timestamp: getListingTimestamp(listing),
    }))
    .sort((a, b) => {
      if (a.timestamp !== null || b.timestamp !== null) {
        return (b.timestamp ?? Number.NEGATIVE_INFINITY) - (a.timestamp ?? Number.NEGATIVE_INFINITY)
          || b.sourceIndex - a.sourceIndex;
      }
      return b.sourceIndex - a.sourceIndex;
    })
    .slice(0, 5)
    .map(({ listing }) => listing);
};


const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeDiscoveryTab, setActiveDiscoveryTab] = useState<DiscoveryTab>('featured');
  const [isReturningLandingVisit] = useState(() => hasPlayedLandingHeroIntro);
  const { index: entityIndex, listings, isLoading } = useEntityIndex();
  const featuredListings = useMemo(() => buildFeaturedListings(listings), [listings]);
  const recentlyAddedListings = useMemo(() => buildRecentlyAddedListings(listings), [listings]);
  const discoveryListings = activeDiscoveryTab === 'featured' ? featuredListings : recentlyAddedListings;

  useEffect(() => {
    const introCompleteTimer = window.setTimeout(() => {
      hasPlayedLandingHeroIntro = true;
    }, 1500);

    return () => window.clearTimeout(introCompleteTimer);
  }, []);

  return (
    <main className="ss-homepage flex-grow overflow-y-auto">
      <div className="ss-homepage-stage">
        <SavedLivingLowPolyBackground className="ss-homepage-living-art" />
      {/* Hero Section */}
      <section className="ss-homepage-hero relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute bottom-0 right-[-17vw] top-[-14vh] z-0 hidden w-[94vw] md:block [mask-image:radial-gradient(circle_at_58%_44%,black_0%,black_55%,transparent_79%),linear-gradient(to_bottom,black_0%,black_76%,transparent_100%)] [mask-composite:intersect] [-webkit-mask-image:radial-gradient(circle_at_58%_44%,black_0%,black_55%,transparent_79%),linear-gradient(to_bottom,black_0%,black_76%,transparent_100%)] [-webkit-mask-composite:source-in]">
          <LandingHeroGlobe />
        </div>
        <div className="relative z-10 container mx-auto flex min-h-[calc(100vh-11rem)] items-center px-6 pt-28 lg:px-8">
          <div className={`ss-landing-hero-intro flex max-w-3xl flex-col items-center text-center md:items-start md:text-left ${isReturningLandingVisit ? 'ss-landing-hero-intro--returning' : 'ss-landing-hero-intro--first'}`}>
            <h1 className="mb-5 text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              <span className="ss-landing-hero-intro__lead block">Explore the lifestyle.</span>
              <span className="mt-2 block">
                <span className="ss-landing-hero-intro__near inline-block">Around the corner</span>{' '}
                <span className="ss-landing-hero-intro__world inline-block">or around the <span className="text-red-500">world.</span></span>
              </span>
            </h1>
            <p className="ss-landing-hero-intro__copy mb-8 max-w-xl text-lg leading-relaxed text-gray-400 lg:text-xl">
              Discover clubs, events, hosts, and destinations through an interactive world built for exploration.
            </p>
            <div className="ss-landing-hero-intro__cta flex flex-col items-center md:items-start">
              <ExploreGlobeButton onActivate={() => navigate('/globe')} />
              <p className="ss-landing-hero-intro__microcopy mt-3 text-sm text-gray-500">
                Browse freely. Share only what you choose.
              </p>
            </div>
          </div>
        </div>
        <LandingStatsBar listings={listings} />
      </section>
      
      {/* Featured Listings Section */}
      <section className="ss-homepage-discovery border-t border-white/10 py-14">
          <div className="container mx-auto px-6 lg:px-8">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-2xl font-bold text-white md:text-3xl">Featured Clubs & Events</h2>
                <div className="ss-glass ss-glass--liquid flex w-fit rounded-full p-1">
                  {[
                    ['featured', 'Featured'],
                    ['recent', 'Recently Added'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setActiveDiscoveryTab(value as DiscoveryTab)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeDiscoveryTab === value
                          ? 'ss-glass ss-glass--liquid ss-glass--crimson text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
                  {!isLoading && discoveryListings.map(listing => (
                    <HomepageDiscoveryCard
                      key={listing.id}
                      listing={listing}
                      onClick={() => navigate(entityIndex ? getListingCanonicalPath(listing, entityIndex) : `/listing/${listing.id}`)}
                    />
                  ))}
              </div>
          </div>
      </section>

      <Footer />
      </div>
    </main>
  );
};

export default LandingPage;
