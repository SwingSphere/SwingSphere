import React from 'react';
import { uiTokens } from '../../lib/uiTokens';
import {
  LISTING_IMAGE_FALLBACK,
  buildFallbackCandidateChain,
  handleListingImageError,
  serializeFallbackCandidates,
} from '../../lib/listingImage';

type HeroContainerProps = {
  title: string;
  imageUrl?: string;
  fallbackImageUrls?: Array<string | null | undefined>;
  imageClassName?: string;
  heightClassName?: string;
  children?: React.ReactNode;
};

const HeroContainer: React.FC<HeroContainerProps> = ({
  title,
  imageUrl,
  fallbackImageUrls = [],
  imageClassName = '',
  heightClassName = uiTokens.hero.defaultHeight,
  children,
}) => {
  const candidates = buildFallbackCandidateChain([imageUrl, ...fallbackImageUrls], true);
  const primarySrc = candidates[0] ?? LISTING_IMAGE_FALLBACK;

  return (
    <section className="mt-6">
      <div className={`relative w-full overflow-hidden rounded-2xl border border-gray-800 bg-black/50 ${heightClassName}`}>
        <img
          src={primarySrc}
          data-media-role="hero"
          data-fallback-candidates={serializeFallbackCandidates(candidates.slice(1))}
          onError={handleListingImageError}
          alt={title}
          className={`absolute inset-0 h-full w-full object-cover ${imageClassName}`}
        />
        <div className="absolute inset-0">{children}</div>
      </div>
    </section>
  );
};

export default HeroContainer;

