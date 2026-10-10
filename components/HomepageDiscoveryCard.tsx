import React, { useMemo } from 'react';
import type { Listing } from '../types';
import {
  getListingCardImageUrl,
  getListingImageCandidates,
  getListingLogoUrl,
  handleListingImageError,
  serializeFallbackCandidates,
} from '../lib/listingImage';
import ListingAccessSummary from './listing/ListingAccessSummary';
import EntityTypePill from './entity/EntityTypePill';

type HomepageDiscoveryCardProps = {
  listing: Listing;
  onClick: () => void;
  resolvedLogoUrl?: string;
  imagePriority?: 'high' | 'low';
  className?: string;
};

const normalizeCountry = (country: string) => {
  const normalized = country.trim().toLowerCase();
  if (normalized === 'usa' || normalized === 'us' || normalized === 'united states') return 'United States';
  return country.trim();
};

const formatCardLocation = (listing: Listing) => {
  const { city, region, country } = listing.geopoint.address;
  const cleanCity = city.trim();
  const cleanRegion = region.trim();
  const cleanCountry = normalizeCountry(country);

  if (cleanCountry === 'United States') {
    return cleanRegion ? `${cleanCity}, ${cleanRegion}` : cleanCity;
  }

  return cleanCountry ? `${cleanCity}, ${cleanCountry}` : cleanCity;
};

const HomepageDiscoveryCard: React.FC<HomepageDiscoveryCardProps> = React.memo(({
  listing,
  onClick,
  resolvedLogoUrl,
  imagePriority = 'low',
  className = '',
}) => {
  const tags = useMemo(
    () => (listing.type === 'club' ? listing.generalAmenities ?? [] : listing.tags ?? []).slice(0, 2),
    [listing],
  );
  const location = useMemo(() => formatCardLocation(listing), [listing]);
  const logoCandidates = useMemo(
    () =>
      getListingImageCandidates(listing, {
        role: 'logo',
        extraCandidates: [resolvedLogoUrl],
        includeGenericFallback: true,
      }),
    [listing, resolvedLogoUrl],
  );
  const backgroundCandidates = useMemo(
    () =>
      getListingImageCandidates(listing, {
        role: 'card',
        includeGenericFallback: listing.type !== 'event',
      }),
    [listing],
  );
  const logoUrl = logoCandidates[0] || resolvedLogoUrl || getListingLogoUrl(listing);
  const logoFallbacks = useMemo(
    () => serializeFallbackCandidates(logoCandidates.slice(1)),
    [logoCandidates],
  );
  const backgroundUrl = backgroundCandidates[0] || getListingCardImageUrl(listing);
  const backgroundFallbacks = useMemo(
    () => serializeFallbackCandidates(backgroundCandidates.slice(1)),
    [backgroundCandidates],
  );
  const monochrome = listing.type === 'club' && (listing.mediaPresentation === 'monochrome' || listing.id === 'club-epicure-cape-town');
  const loadingMode = imagePriority === 'high' ? 'eager' : 'lazy';
  const fetchPriorityMode = imagePriority === 'high' ? 'high' : 'low';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative h-[320px] w-[236px] flex-none overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_35%_30%,#461920,#090b10_70%)] text-left shadow-xl shadow-black/35 transition hover:-translate-y-1 hover:border-red-500/45 hover:shadow-red-950/25 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2 focus:ring-offset-black lg:h-[336px] lg:w-full ${className}`}
    >
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          data-entity-id={listing.id}
          data-media-role="card"
          data-fallback-candidates={backgroundFallbacks}
          onError={(event) => {
            if (listing.type === 'event' && backgroundCandidates.length <= 1) {
              event.currentTarget.style.display = 'none';
            } else {
              handleListingImageError(event);
            }
          }}
          alt={listing.name}
          loading={loadingMode}
          decoding="async"
          fetchPriority={fetchPriorityMode}
          className={`absolute inset-0 h-full w-full object-cover transition duration-500 lg:group-hover:scale-105 ${monochrome ? 'grayscale contrast-[1.08]' : ''}`}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/54 to-black/12" />
      <div className="absolute left-4 top-4 h-24 w-24 overflow-hidden rounded-[22px] border border-white/18 bg-black/75 shadow-lg shadow-black/50">
        <img
          src={logoUrl}
          data-entity-id={listing.id}
          data-media-role="logo"
          data-fallback-candidates={logoFallbacks}
          onError={handleListingImageError}
          alt={`${listing.name} logo`}
          loading={loadingMode}
          decoding="async"
          fetchPriority={fetchPriorityMode}
          className={`h-full w-full scale-[1.04] object-cover ${monochrome ? 'grayscale contrast-[1.12]' : ''}`}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex min-h-[46%] flex-col justify-end p-4">
        <EntityTypePill tone={listing.type} className="mb-3 w-fit">
          {listing.type}
        </EntityTypePill>
        <h3 className="min-h-[2.5rem] overflow-hidden text-base font-bold leading-tight text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {listing.name}
        </h3>
        <p className="mt-1 truncate text-xs font-medium text-gray-300">{location}</p>
        <ListingAccessSummary listing={listing} variant="card" />
        {!!tags.length && (
          <div className="mt-3 flex flex-wrap gap-1.5 overflow-hidden">
            {tags.map((tag) => (
              <span
                key={tag}
                className="max-w-full truncate rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold text-gray-200 ring-1 ring-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
});

export default HomepageDiscoveryCard;
