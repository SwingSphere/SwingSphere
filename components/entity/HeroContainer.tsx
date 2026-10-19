import React from 'react';
import { uiTokens } from '../../lib/uiTokens';
import type { HeroCropConfig, HeroViewport } from '../../lib/media/heroCrop';
import SharedHeroImage from './SharedHeroImage';

type HeroContainerProps = {
  title: string;
  imageUrl?: string;
  fallbackImageUrls?: Array<string | null | undefined>;
  heroCrop?: Partial<HeroCropConfig> | null;
  viewport?: HeroViewport;
  imageClassName?: string;
  heightClassName?: string;
  sectionClassName?: string;
  children?: React.ReactNode;
};

const HeroContainer: React.FC<HeroContainerProps> = ({
  title,
  imageUrl,
  fallbackImageUrls = [],
  heroCrop,
  viewport,
  imageClassName = '',
  heightClassName = uiTokens.hero.defaultHeight,
  sectionClassName = 'mt-6',
  children,
}) => {
  return (
    <section className={sectionClassName}>
      <div className={`relative w-full overflow-hidden rounded-2xl border border-gray-800 bg-black/50 ${heightClassName}`}>
        <SharedHeroImage
          imageUrl={imageUrl}
          fallbackImageUrls={fallbackImageUrls}
          alt={title}
          heroCrop={heroCrop}
          viewport={viewport}
          imgClassName={imageClassName}
        />
        <div className="absolute inset-0 z-10">{children}</div>
      </div>
    </section>
  );
};

export default HeroContainer;
