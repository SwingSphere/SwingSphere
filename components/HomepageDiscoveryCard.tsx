import React from 'react';
import type { Listing } from '../types';
import { getListingImageUrl, getListingLogoUrl, handleListingImageError } from '../lib/listingImage';
import ListingAccessSummary from './listing/ListingAccessSummary';
import EntityTypePill from './entity/EntityTypePill';

type HomepageDiscoveryCardProps = {
  listing: Listing;
  onClick: () => void;
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

const HomepageDiscoveryCard: React.FC<HomepageDiscoveryCardProps> = ({ listing, onClick }) => {
  const tags = (listing.type === 'club' ? listing.generalAmenities ?? [] : listing.tags ?? []).slice(0, 2);
  const location = formatCardLocation(listing);
  const logoUrl = getListingLogoUrl(listing);
  const monochrome = listing.type === 'club' && (listing.mediaPresentation === 'monochrome' || listing.id === 'club-epicure-cape-town');

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-[320px] w-[236px] flex-none overflow-hidden rounded-2xl border border-white/10 bg-gray-950 text-left shadow-xl shadow-black/35 transition hover:-translate-y-1 hover:border-red-500/45 hover:shadow-red-950/25 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2 focus:ring-offset-black lg:h-[336px] lg:w-full"
    >
      <img
        src={getListingImageUrl(listing)}
        onError={handleListingImageError}
        alt={listing.name}
        loading="lazy"
        className={`absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105 ${monochrome ? 'grayscale contrast-[1.08]' : ''}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/54 to-black/12" />
      <div className="ss-glass ss-glass--liquid absolute left-4 top-4 h-24 w-24 overflow-hidden rounded-[22px] [mask-image:linear-gradient(#000,#000)]">
        <img
          src={logoUrl}
          onError={handleListingImageError}
          alt={`${listing.name} logo`}
          loading="lazy"
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
};

export default HomepageDiscoveryCard;
