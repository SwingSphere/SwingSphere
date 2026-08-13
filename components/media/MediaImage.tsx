import React from 'react';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaVariant } from '../../lib/media/types';

type MediaImageProps = {
  asset?: MediaAsset | null;
  variant?: MediaVariant;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
};

const MediaImage: React.FC<MediaImageProps> = ({ asset, variant, alt, className = '', fallback = null }) => {
  if (!asset || asset.storage_provider !== 'cloudflare_images') {
    return <>{fallback}</>;
  }

  const rule = getMediaRule(asset.role);
  const imageUrl = getCloudflareImageUrl({
    externalId: asset.external_id,
    variant: variant ?? rule.defaultVariant,
  });

  if (!imageUrl) return <>{fallback}</>;

  return (
    <img
      src={imageUrl}
      alt={alt ?? asset.alt_text ?? ''}
      className={[className, rule.objectFitClassName].filter(Boolean).join(' ')}
      loading="lazy"
      decoding="async"
    />
  );
};

export default MediaImage;
