import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrowseDirectoryButton from './BrowseDirectoryButton';
import LandingHeroGlobe from './LandingHeroGlobe';
import LandingStatsBar from './LandingStatsBar';
import HomepageDiscoveryCard from './HomepageDiscoveryCard';
import HomepageDiscoveryCarousel from './HomepageDiscoveryCarousel';
import ExploreGlobeButton from './ExploreGlobeButton';
import Footer from './Footer';
import SavedLivingLowPolyBackground from './SavedLivingLowPolyBackground';
import { useEntityIndex } from '../hooks/useEntityIndex';
import { getListingCanonicalPath } from '../lib/entityUtils';
import { resolveBrandLogo } from '../lib/entityBrandMedia';
import { isActiveDiscoveryListing } from '../lib/eventLifecycle';
import type { Listing } from '../types';

let hasPlayedLandingHeroIntro = false;

type DiscoveryTab = 'featured' | 'recent';

type ListingDiscoverySignals = Listing & {
  addedAt?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

const getListingTimestamp = (listing: Listing) => {
  const signals = listing as ListingDiscoverySignals;
  const value = signals.createdAt ?? signals.created_at ?? signals.addedAt ?? signals.updatedAt ?? signals.updated_at;
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const buildFeaturedListings = (listings: Listing[]) => {
  const clubs = listings.filter((listing) => listing.type === 'club' && listing.status === 'approved' && isActiveDiscoveryListing(listing));
  const shuffled = [...clubs];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 5);
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
  const { index: entityIndex, listings, venues, organizations, organizationVenueRelationships, eventSeries, isLoading } = useEntityIndex();
  const featuredListings = useMemo(() => buildFeaturedListings(listings), [listings]);
  const recentlyAddedListings = useMemo(() => buildRecentlyAddedListings(listings), [listings]);
  const discoveryListings = activeDiscoveryTab === 'featured' ? featuredListings : recentlyAddedListings;
  const discoveryCarouselItems = useMemo(() => discoveryListings.map((listing) => ({
    listing,
    logoUrl: resolveBrandLogo(listing.type, listing.id, {
      listings,
      venues,
      organizations,
      relationships: organizationVenueRelationships,
      eventSeries,
    }).url,
  })), [discoveryListings, listings, venues, organizations, organizationVenueRelationships, eventSeries]);
  const openGlobeExperience = () => {
    navigate('/globe');
  };

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
              <div className="ss-hero-cta-pair flex w-full max-w-sm flex-col items-stretch gap-3.5 sm:max-w-none sm:w-auto sm:flex-row sm:items-center">
                <ExploreGlobeButton onActivate={openGlobeExperience} className="w-full sm:w-auto" />
                <BrowseDirectoryButton onClick={() => navigate('/discover')} className="w-full sm:w-auto" />
              </div>
              <p className="ss-landing-hero-intro__microcopy mt-3.5 text-sm text-gray-500">
                Explore visually or browse directly. Share only what you choose.
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
                <h2 className="text-2xl font-bold text-white md:text-3xl">{activeDiscoveryTab === 'featured' ? 'Featured Clubs' : 'Recently Added'}</h2>
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
              {!isLoading ? (
                <>
                  <HomepageDiscoveryCarousel
                    items={discoveryCarouselItems}
                    resetKey={activeDiscoveryTab}
                    onOpen={(listing) => navigate(entityIndex ? getListingCanonicalPath(listing, entityIndex) : `/listing/${listing.id}`)}
                  />
                  <div className="hidden gap-4 lg:grid lg:grid-cols-5">
                    {discoveryCarouselItems.map(({ listing, logoUrl }) => (
                      <HomepageDiscoveryCard
                        key={listing.id}
                        listing={listing}
                        resolvedLogoUrl={logoUrl}
                        onClick={() => navigate(entityIndex ? getListingCanonicalPath(listing, entityIndex) : `/listing/${listing.id}`)}
                      />
                    ))}
                  </div>
                </>
              ) : null}
          </div>
      </section>

      <Footer />
      </div>
    </main>
  );
};

export default LandingPage;
