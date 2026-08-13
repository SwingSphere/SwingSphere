import React from 'react';
import { uiTokens } from '../../lib/uiTokens';
import { LISTING_IMAGE_FALLBACK, handleListingImageError } from '../../lib/listingImage';

type HeroContainerProps = {
  title: string;
  imageUrl?: string;
  heightClassName?: string;
  children?: React.ReactNode;
};

const HeroContainer: React.FC<HeroContainerProps> = ({
  title,
  imageUrl,
  heightClassName = uiTokens.hero.defaultHeight,
  children,
}) => {
  return (
    <section className="mt-6">
      <div className={`relative w-full overflow-hidden rounded-2xl border border-gray-800 bg-black/50 ${heightClassName}`}>
        <img
          src={imageUrl ?? LISTING_IMAGE_FALLBACK}
          onError={handleListingImageError}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070707] via-[#070707]/70 to-[#070707]/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-black/55 lg:to-black/35" />
        <div className="absolute inset-0">{children}</div>
      </div>
    </section>
  );
};

export default HeroContainer;
