import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Building2, CalendarDays, Compass, Globe2, MapPin, ShieldCheck, Sparkles, Plus } from 'lucide-react';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { slugifyPlace } from '../../lib/geoNormalize';
import {
  SITE_ORIGIN,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_ALT,
  DEFAULT_OG_WIDTH,
  DEFAULT_OG_HEIGHT,
} from '../../lib/staticSeo';
import { getListingCanonicalPath } from '../../lib/entityUtils';
import { getListingCardImageUrl, getListingLogoUrl, handleListingImageError } from '../../lib/listingImage';
import Seo from '../Seo';
import type { ClubData, EventData, Listing } from '../../types';

type CityDiscoveryIntent = 'clubs' | 'parties' | 'play-parties';

type CityDiscoveryPageProps = {
  intent?: CityDiscoveryIntent;
};

const formatAttendance = (policy?: string): string => {
  if (!policy) return 'Check guidelines';
  const map: Record<string, string> = {
    mixed_open: 'Open / All Genders',
    couples_focused: 'Couples Focused',
    couples_only: 'Couples Only',
    couples_and_single_women: 'Couples & Solo Women',
    couples_and_select_single_men: 'Couples & Select Men',
    women_only: 'Women Only',
    men_only: 'Men Only',
    lgbtq_centered: 'LGBTQ+ Centered',
    members_only: 'Members Only',
    invite_only: 'Invite Only',
  };
  return map[policy] ?? policy.replaceAll('_', ' ');
};

const CityDiscoveryPage: React.FC<CityDiscoveryPageProps> = ({ intent = 'clubs' }) => {
  const { city: cityParam } = useParams<{ city: string }>();
  const citySlug = (cityParam ?? '').toLowerCase();
  const { index, listings, isLoading } = useEntityIndex();

  const isClubIntent = intent === 'clubs';
  const isPlayPartyIntent = intent === 'play-parties';
  const isPartyIntent = intent === 'parties' || isPlayPartyIntent;

  // Filter approved listings for this city
  const cityListingsAll = useMemo(() => {
    return listings.filter((l) => {
      const city = l.geopoint?.address?.city;
      return city && slugifyPlace(city) === citySlug;
    });
  }, [listings, citySlug]);

  const clubs = useMemo(() => cityListingsAll.filter((l) => l.type === 'club') as ClubData[], [cityListingsAll]);
  const events = useMemo(() => cityListingsAll.filter((l) => l.type === 'event') as EventData[], [cityListingsAll]);
  const cityListings = isClubIntent ? clubs : events;

  // Derive display names
  const firstListing = cityListingsAll[0];
  const cityName = firstListing?.geopoint?.address?.city
    ?? citySlug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const region = firstListing?.geopoint?.address?.state || firstListing?.geopoint?.address?.region || '';
  const regionLabel = region ? `, ${region}` : '';
  const locationLabel = `${cityName}${regionLabel}`;

  const canonicalPath = isPlayPartyIntent
    ? `${SITE_ORIGIN}/swinger-parties/${citySlug}`
    : isClubIntent
    ? `${SITE_ORIGIN}/swinger-clubs/${citySlug}`
    : `${SITE_ORIGIN}/swinger-parties/${citySlug}`;

  const seoTitle = isPlayPartyIntent
    ? `Play Parties in ${locationLabel} | Lifestyle Events | SwingSphere`
    : isClubIntent
    ? `Swinger Clubs in ${locationLabel} | Lifestyle Venues | SwingSphere`
    : `Swinger Parties in ${locationLabel} | Lifestyle Events | SwingSphere`;

  const seoDescription = isPlayPartyIntent
    ? `Curated play parties, private lifestyle gatherings, and adult events in ${locationLabel}. Attendee guidelines, dress codes, and RSVP access on SwingSphere.`
    : isClubIntent
    ? `Explore approved swinger clubs, lifestyle venues, and adult nightlife spaces in ${locationLabel}. View party schedules, amenities, dress codes, and entry rules on SwingSphere.`
    : `Discover upcoming swinger parties, play parties, and lifestyle events in ${locationLabel}. Attendee guidelines, host screening policies, and ticket details on SwingSphere.`;

  const structuredData = useMemo(() => {
    const itemList = cityListings.slice(0, 10).map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      url: `${SITE_ORIGIN}${isClubIntent ? `/clubs/${item.id}` : `/events/${item.id}`}`,
    }));

    return [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: seoTitle,
        description: seoDescription,
        url: canonicalPath,
        mainEntity: itemList.length > 0 ? {
          '@type': 'ItemList',
          itemListElement: itemList,
        } : undefined,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_ORIGIN}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Directory',
            item: `${SITE_ORIGIN}/discover`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: `${locationLabel} ${isClubIntent ? 'Clubs' : 'Parties'}`,
            item: canonicalPath,
          },
        ],
      },
    ];
  }, [cityListings, isClubIntent, seoTitle, seoDescription, canonicalPath, locationLabel]);

  const headline = isPlayPartyIntent
    ? `Play Parties & Lifestyle Events in ${locationLabel}`
    : isClubIntent
    ? `Swinger Clubs & Lifestyle Venues in ${locationLabel}`
    : `Swinger Parties & Lifestyle Events in ${locationLabel}`;

  const subtitle = isPlayPartyIntent
    ? `Curated play parties, consent-first adult socials, and private themed gatherings in ${locationLabel}. Entry requirements, RSVP procedures, and community etiquette.`
    : isClubIntent
    ? `Explore approved lifestyle clubs, swinger venues, and adult nightlife spaces in ${locationLabel}. View amenities, operating schedules, attendance rules, and guest dress codes.`
    : `Discover upcoming swinger parties, play parties, and lifestyle events in ${locationLabel}. Access policies, host screening guidelines, and ticket details.`;

  return (
    <>
      <Seo
        title={seoTitle}
        description={seoDescription}
        canonicalPath={canonicalPath}
        imageUrl={DEFAULT_OG_IMAGE}
        imageAlt={DEFAULT_OG_IMAGE_ALT}
        imageWidth={DEFAULT_OG_WIDTH}
        imageHeight={DEFAULT_OG_HEIGHT}
        ogType="website"
        noIndex={!isLoading && cityListings.length === 0}
        structuredData={structuredData}
      />

      <div className="min-h-screen bg-[#07080a] text-gray-100 pb-20">
        {/* Breadcrumb Header */}
        <div className="border-b border-white/[0.06] bg-black/40 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-gray-400">
              <Link to="/" className="hover:text-white transition-colors">Home</Link>
              <span>/</span>
              <Link to="/discover" className="hover:text-white transition-colors">Directory</Link>
              <span>/</span>
              <span className="text-gray-200 font-medium">{locationLabel} {isClubIntent ? 'Clubs' : 'Parties'}</span>
            </nav>
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative overflow-hidden border-b border-white/[0.06] bg-gradient-to-b from-rose-950/20 via-black to-[#07080a] py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Curated Community Discovery • {locationLabel}
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              {headline}
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-7 text-gray-300 sm:text-lg">
              {subtitle}
            </p>

            {/* Quick Actions & Navigation Tabs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={`/swinger-clubs/${citySlug}`}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  isClubIntent
                    ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Building2 className="h-4 w-4" />
                Clubs & Venues {clubs.length ? `(${clubs.length})` : ''}
              </Link>

              <Link
                to={`/swinger-parties/${citySlug}`}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  !isClubIntent && !isPlayPartyIntent
                    ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <CalendarDays className="h-4 w-4" />
                Parties & Events {events.length ? `(${events.length})` : ''}
              </Link>

              <Link
                to={`/play-parties/${citySlug}`}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  isPlayPartyIntent
                    ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                Play Parties
              </Link>

              <Link
                to="/globe"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm font-medium text-gray-300 hover:border-white/20 hover:text-white transition-all ml-auto"
              >
                <Globe2 className="h-4 w-4 text-red-400" />
                Explore on 3D Globe
              </Link>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          {cityListings.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
              <Compass className="mx-auto h-12 w-12 text-gray-500" />
              <h2 className="mt-4 text-xl font-semibold text-white">No Approved {isClubIntent ? 'Clubs' : 'Parties'} in {locationLabel} Yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
                SwingSphere curates approved lifestyle venues and community organizers. We haven’t listed a public {isClubIntent ? 'club' : 'event'} in {cityName} at this time.
              </p>
              <div className="mt-6 flex justify-center gap-4">
                <Link
                  to="/discover"
                  className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors"
                >
                  Browse Global Directory
                </Link>
                <Link
                  to="/submission"
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-500 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Submit a Venue
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-semibold text-white">
                  Approved {isClubIntent ? 'Clubs & Venues' : 'Events & Parties'} in {locationLabel}
                </h2>
                <span className="text-sm text-gray-400">
                  {cityListings.length} {cityListings.length === 1 ? 'listing' : 'listings'}
                </span>
              </div>

              {/* Grid of Listings */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {cityListings.map((item) => {
                  const href = index ? getListingCanonicalPath(item as Listing, index) : `/clubs/${item.id}`;
                  const image = getListingCardImageUrl(item as Listing);
                  const logo = getListingLogoUrl(item as Listing);
                  const address = item.geopoint?.address ?? {};
                  const isPrivateLoc = item.isAddressPrivate === true || item.locationVisibility === 'approximate_public' || item.locationVisibility === 'private';
                  const locString = isPrivateLoc
                    ? `Private location, ${cityName}`
                    : [address.city, address.region].filter(Boolean).join(', ');

                  return (
                    <Link
                      key={item.id}
                      to={href}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0e12] transition-all hover:border-red-500/40 hover:shadow-xl hover:shadow-red-950/20"
                    >
                      {/* Card Image */}
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-900">
                        <img
                          src={image}
                          alt={item.name}
                          onError={handleListingImageError}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0e12] via-transparent to-transparent" />

                        {/* Attendance Policy Pill */}
                        <div className="absolute top-3 right-3">
                          <span className="inline-flex items-center rounded-lg bg-black/75 px-2.5 py-1 text-xs font-medium text-gray-200 backdrop-blur-md border border-white/10">
                            {formatAttendance(item.attendancePolicy)}
                          </span>
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-start gap-3">
                          {logo && !logo.includes('swingsphere-logo') && (
                            <img
                              src={logo}
                              alt=""
                              onError={handleListingImageError}
                              className="h-10 w-10 shrink-0 rounded-xl object-cover border border-white/10 bg-black/50"
                              loading="lazy"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-white group-hover:text-red-400 transition-colors truncate text-base">
                              {item.name}
                            </h3>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                              <MapPin className="h-3 w-3 shrink-0 text-red-500" />
                              <span className="truncate">{locString}</span>
                            </p>
                          </div>
                        </div>

                        {/* Description */}
                        {item.type === 'club' && item.description_short && (
                          <p className="mt-3 line-clamp-2 text-xs leading-5 text-gray-400">
                            {item.description_short}
                          </p>
                        )}
                        {item.type === 'event' && (
                          <p className="mt-3 text-xs text-gray-400">
                            Hosted by <span className="text-gray-300 font-medium">{item.hostName || 'Community Host'}</span>
                          </p>
                        )}

                        {/* Amenities / Tags */}
                        {item.generalAmenities && item.generalAmenities.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-1.5 pt-3 border-t border-white/[0.05]">
                            {item.generalAmenities.slice(0, 3).map((amenity: string) => (
                              <span
                                key={amenity}
                                className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-400"
                              >
                                {amenity}
                              </span>
                            ))}
                            {item.generalAmenities.length > 3 && (
                              <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-500">
                                +{item.generalAmenities.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          {/* Local Guide & Etiquette Section */}
          <div className="mt-16 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-white">
              Lifestyle & Swinger Etiquette in {locationLabel}
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-200">Enthusiastic Consent</h3>
                <p className="text-xs leading-6 text-gray-400">
                  Consent is mandatory, explicit, and ongoing at all lifestyle clubs and parties. A "no" is always respected without negotiation or persistence.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-200">Discretion & Privacy</h3>
                <p className="text-xs leading-6 text-gray-400">
                  Photography, recording devices, and cell phones are strictly prohibited in play areas and private social spaces. Privacy of all attendees is guaranteed.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-200">Dress Codes & Entry</h3>
                <p className="text-xs leading-6 text-gray-400">
                  Venues enforce specific dress codes (upscale chic, fetish, theme attire). Many events require pre-screening or advance RSVP before ticket issuance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CityDiscoveryPage;
