import React from 'react';
import { handleListingImageError } from '../../../lib/listingImage';

type HeroMediaRailProps = {
  images: string[];
  title: string;
};

const HeroMediaRail: React.FC<HeroMediaRailProps> = ({ images, title }) => {
  const items = images.filter(Boolean).slice(0, 3);
  if (items.length === 0) return null;

  return (
    <div className="absolute right-4 top-20 z-20 hidden lg:flex lg:flex-col lg:gap-2">
      {items.map((image, index) => (
        <button
          key={`${image}-${index}`}
          type="button"
          className="group relative block h-20 w-24 overflow-hidden rounded-lg border border-white/15 bg-black/30 shadow-lg shadow-black/35 backdrop-blur-sm xl:h-24 xl:w-28"
          aria-label={`Open ${title} media ${index + 1}`}
        >
          <img
            src={image}
            onError={handleListingImageError}
            alt={`${title} media ${index + 1}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </button>
      ))}
    </div>
  );
};

export default HeroMediaRail;

export const HeroMediaRailMobile: React.FC<HeroMediaRailProps> = ({ images, title }) => {
  const items = images.filter(Boolean).slice(0, 3);
  if (items.length === 0) return null;
  const mobileVisible = items.slice(0, 2);
  const remainingCount = items.length > 2 ? items.length - 2 : 0;

  return (
    <div className="mt-4 flex gap-2 lg:hidden">
      {mobileVisible.map((image, index) => (
        <button
          key={`mobile-${image}-${index}`}
          type="button"
          className="relative h-16 w-20 overflow-hidden rounded-md border border-white/15 bg-black/20"
          aria-label={`Open ${title} mobile media ${index + 1}`}
        >
          <img
            src={image}
            onError={handleListingImageError}
            alt={`${title} mobile media ${index + 1}`}
            className="h-full w-full object-cover"
          />
          {index === mobileVisible.length - 1 && remainingCount > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-semibold text-white">
              +{remainingCount}
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
};
