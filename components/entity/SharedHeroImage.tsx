import React, { useEffect, useMemo, useState } from 'react';
import {
  buildFallbackCandidateChain,
  LISTING_IMAGE_FALLBACK,
  markMediaUrlFailed,
} from '../../lib/listingImage';
import { normalizeHeroDeliveryUrl } from '../../lib/media/getCloudflareImageUrl';
import {
  buildHeroCssVariables,
  extractHeroCropFromUrl,
  normalizeHeroCrop,
  resolveViewportFraming,
  stripHeroCropFromUrl,
  type HeroCropConfig,
  type HeroViewport,
} from '../../lib/media/heroCrop';

export interface SharedHeroImageProps {
  imageUrl?: string | null;
  src?: string | null;
  fallbackImageUrls?: Array<string | null | undefined>;
  fallbackUrls?: Array<string | null | undefined>;
  alt: string;
  heroCrop?: Partial<HeroCropConfig> | null;
  crop?: Partial<HeroCropConfig> | null;
  entityId?: string;
  onError?: () => void;
  /**
   * When specified (e.g. inside the WYSIWYG Hero Image Composer preview),
   * forces the exact framing for that viewport regardless of window width.
   * When omitted on live pages, responsive CSS custom properties apply
   * desktop, tablet, and mobile framing automatically at each breakpoint.
   */
  viewport?: HeroViewport;
  className?: string;
  imgClassName?: string;
  draggable?: boolean;
  onImageLoaded?: (dimensions: { naturalWidth: number; naturalHeight: number; src: string }) => void;
}

const SharedHeroImage: React.FC<SharedHeroImageProps> = ({
  imageUrl: imageUrlProp,
  src,
  fallbackImageUrls: fallbackImageUrlsProp,
  fallbackUrls,
  alt,
  heroCrop: heroCropProp,
  crop,
  onError: onExternalError,
  viewport,
  className = 'absolute inset-0 h-full w-full overflow-hidden',
  imgClassName = '',
  draggable = false,
  onImageLoaded,
}) => {
  const imageUrl = imageUrlProp ?? src;
  const fallbackImageUrls = fallbackImageUrlsProp ?? fallbackUrls ?? [];
  const heroCrop = heroCropProp ?? crop;

  const resolvedPrimaryCrop = useMemo(() => {
    const fromUrl = extractHeroCropFromUrl(imageUrl).crop;
    if (heroCrop) return normalizeHeroCrop(heroCrop);
    if (fromUrl) return fromUrl;
    return normalizeHeroCrop(null);
  }, [heroCrop, imageUrl]);

  const normalizedPrimaryUrl = useMemo(
    () => (imageUrl ? stripHeroCropFromUrl(normalizeHeroDeliveryUrl(imageUrl, resolvedPrimaryCrop)) : ''),
    [imageUrl, resolvedPrimaryCrop],
  );

  const candidates = useMemo(
    () =>
      buildFallbackCandidateChain(
        [
          normalizedPrimaryUrl,
          stripHeroCropFromUrl(imageUrl),
          ...fallbackImageUrls.map((u) => stripHeroCropFromUrl(u)),
        ],
        true,
      ).map((u) => stripHeroCropFromUrl(u)),
    [normalizedPrimaryUrl, imageUrl, fallbackImageUrls],
  );

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [normalizedPrimaryUrl, imageUrl, fallbackImageUrls.join('|')]);

  const activeSrc = candidates[Math.min(candidateIndex, candidates.length - 1)] ?? LISTING_IMAGE_FALLBACK;
  const isUsingFallback =
    candidateIndex > 0 &&
    activeSrc !== normalizedPrimaryUrl &&
    activeSrc !== stripHeroCropFromUrl(imageUrl);

  const effectiveCrop = useMemo(
    () => (isUsingFallback ? normalizeHeroCrop(null) : resolvedPrimaryCrop),
    [isUsingFallback, resolvedPrimaryCrop],
  );

  const explicitFraming = useMemo(
    () => (viewport ? resolveViewportFraming(effectiveCrop, viewport) : null),
    [effectiveCrop, viewport],
  );

  const cssVars = useMemo(() => buildHeroCssVariables(effectiveCrop), [effectiveCrop]);

  const anyViewportUsesFit = useMemo(() => {
    if (explicitFraming) return explicitFraming.fitMode === 'fit';
    return (
      effectiveCrop.fitMode === 'fit' ||
      effectiveCrop.viewports?.desktop?.fitMode === 'fit' ||
      effectiveCrop.viewports?.tablet?.fitMode === 'fit' ||
      effectiveCrop.viewports?.mobile?.fitMode === 'fit'
    );
  }, [effectiveCrop, explicitFraming]);

  const imgStyle: React.CSSProperties = explicitFraming
    ? {
        objectFit: explicitFraming.fitMode === 'fit' ? 'contain' : 'cover',
        objectPosition: `${explicitFraming.focalX}% ${explicitFraming.focalY}%`,
        transformOrigin: `${explicitFraming.focalX}% ${explicitFraming.focalY}%`,
        transform: `scale(${explicitFraming.zoom})`,
      }
    : (cssVars as React.CSSProperties);

  return (
    <div className={`h-full w-full overflow-hidden ${className}`} data-testid="shared-hero-image">
      {anyViewportUsesFit ? (
        <img
          src={activeSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 select-none object-cover opacity-35 blur-2xl"
        />
      ) : null}
      <img
        src={activeSrc}
        alt={alt}
        draggable={draggable}
        data-testid="shared-hero-img"
        onLoad={(event) => {
          const el = event.currentTarget;
          if (el.naturalWidth > 0 && el.naturalHeight > 0) {
            onImageLoaded?.({
              naturalWidth: el.naturalWidth,
              naturalHeight: el.naturalHeight,
              src: activeSrc,
            });
          }
        }}
        onError={() => {
          const nextIdx = Math.min(candidateIndex + 1, candidates.length - 1);
          markMediaUrlFailed(activeSrc, {
            role: 'hero',
            nextUrl: candidates[nextIdx] ?? LISTING_IMAGE_FALLBACK,
          });
          setCandidateIndex((current) => Math.min(current + 1, candidates.length - 1));
        }}
        style={imgStyle}
        className={`${explicitFraming ? 'h-full w-full' : 'ss-shared-hero-img transition-transform duration-300'} relative z-[1] select-none ${imgClassName}`}
      />
    </div>
  );
};

export default SharedHeroImage;
