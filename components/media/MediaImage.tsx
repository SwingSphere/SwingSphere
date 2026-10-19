import React, { useEffect, useState } from 'react';
import { getCloudflareImageUrl, getHeroCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule } from '../../lib/media/mediaRules';
import {
  buildFallbackCandidateChain,
  handleListingImageError,
  LISTING_IMAGE_FALLBACK,
  serializeFallbackCandidates,
} from '../../lib/listingImage';
import { normalizeHeroCropConfig } from '../../lib/media/heroCrop';
import SharedHeroImage from '../entity/SharedHeroImage';
import type { MediaAsset, MediaVariant } from '../../lib/media/types';

type MediaImageProps = {
  asset?: MediaAsset | null;
  variant?: MediaVariant;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  fallbackUrl?: string | null;
};

const MediaImage: React.FC<MediaImageProps> = ({
  asset,
  variant,
  alt,
  className = '',
  fallback = null,
  fallbackUrl = null,
}) => {
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setExhausted(false);
  }, [asset?.external_id, asset?.role, variant, fallbackUrl]);

  if (!asset || asset.storage_provider !== 'cloudflare_images') {
    return <>{fallback}</>;
  }

  const rule = getMediaRule(asset.role);
  const heroCrop =
    asset.role === 'hero'
      ? asset.hero_crop
        ? normalizeHeroCropConfig(asset.hero_crop)
        : asset.focal_point_x != null || asset.focal_point_y != null
          ? normalizeHeroCropConfig({
              focalX: asset.focal_point_x ?? 0.5,
              focalY: asset.focal_point_y ?? 0.5,
            })
          : null
      : null;

  const preferredUrl =
    asset.role === 'hero' && (!variant || variant === 'heropage')
      ? getHeroCloudflareImageUrl({
          externalId: asset.external_id,
          crop: heroCrop,
          preferredVariant: variant ?? rule.defaultVariant,
        })
      : getCloudflareImageUrl({
          externalId: asset.external_id,
          variant: variant ?? rule.defaultVariant,
        });

  const candidates = buildFallbackCandidateChain(
    [
      preferredUrl,
      ...rule.variants.map((v) =>
        getCloudflareImageUrl({
          externalId: asset.external_id,
          variant: v,
        }),
      ),
      fallbackUrl,
    ],
    fallback === null,
  );

  const primarySrc = candidates[0];
  if (!primarySrc || exhausted) return <>{fallback}</>;

  if (asset.role === 'hero') {
    return (
      <SharedHeroImage
        src={primarySrc}
        fallbackUrls={candidates.slice(1)}
        alt={alt ?? asset.alt_text ?? ''}
        crop={heroCrop}
        entityId={asset.owner_id}
        className={className}
      />
    );
  }

  const objectPosition =
    asset.focal_point_x != null || asset.focal_point_y != null
      ? `${((asset.focal_point_x ?? 0.5) * 100).toFixed(2)}% ${((asset.focal_point_y ?? 0.5) * 100).toFixed(2)}%`
      : undefined;

  return (
    <img
      src={primarySrc}
      alt={alt ?? asset.alt_text ?? ''}
      className={[className, rule.objectFitClassName].filter(Boolean).join(' ')}
      style={objectPosition ? { objectPosition } : undefined}
      loading="lazy"
      decoding="async"
      data-entity-id={asset.owner_id}
      data-media-role={asset.role}
      data-fallback-candidates={serializeFallbackCandidates(candidates.slice(1))}
      onError={(event) => {
        if (fallback !== null && candidates.length <= 1) {
          setExhausted(true);
          return;
        }
        handleListingImageError(event);
        if (fallback !== null && event.currentTarget.src.endsWith(LISTING_IMAGE_FALLBACK)) {
          setExhausted(true);
        }
      }}
    />
  );
};

export default MediaImage;

