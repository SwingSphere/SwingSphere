import React, { useEffect, useState } from 'react';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule } from '../../lib/media/mediaRules';
import {
  buildFallbackCandidateChain,
  handleListingImageError,
  LISTING_IMAGE_FALLBACK,
  serializeFallbackCandidates,
} from '../../lib/listingImage';
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
  const preferredUrl = getCloudflareImageUrl({
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

  return (
    <img
      src={primarySrc}
      alt={alt ?? asset.alt_text ?? ''}
      className={[className, rule.objectFitClassName].filter(Boolean).join(' ')}
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

