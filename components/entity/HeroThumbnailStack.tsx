import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { uiTokens } from '../../lib/uiTokens';
import { handleListingImageError } from '../../lib/listingImage';

type HeroThumbnailStackProps = {
  images: string[];
  title: string;
  maxDesktop?: number;
  maxMobile?: number;
  showDesktop?: boolean;
  showMobile?: boolean;
};

const HeroThumbnailStack: React.FC<HeroThumbnailStackProps> = ({
  images,
  title,
  maxDesktop = 3,
  maxMobile = 2,
  showDesktop = true,
  showMobile = true,
}) => {
  const clean = Array.from(new Set(images.filter(Boolean)));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const desktopItems = clean.slice(0, maxDesktop);
  const mobileItems = clean.slice(0, maxMobile);
  const desktopOverflow = Math.max(0, clean.length - desktopItems.length);
  const mobileOverflow = Math.max(0, clean.length - mobileItems.length);

  useEffect(() => {
    if (activeIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null);
      if (event.key === 'ArrowLeft') setActiveIndex((current) => current === null ? null : (current - 1 + clean.length) % clean.length);
      if (event.key === 'ArrowRight') setActiveIndex((current) => current === null ? null : (current + 1) % clean.length);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, clean.length]);

  if (clean.length === 0) return null;

  const openImage = (image: string) => setActiveIndex(Math.max(0, clean.indexOf(image)));
  const step = (direction: -1 | 1) => setActiveIndex((current) => current === null ? null : (current + direction + clean.length) % clean.length);

  return (
    <>
      {showDesktop ? (
        <div className={`absolute right-4 top-16 z-20 hidden lg:flex lg:flex-col lg:items-end ${uiTokens.thumbnail.desktopGap}`}>
          {desktopItems.map((image, index) => {
            const isLast = index === desktopItems.length - 1;
            const showOverflow = isLast && desktopOverflow > 0;
            return (
              <button
                key={`desktop-${image}-${index}`}
                type="button"
                onClick={() => openImage(image)}
                className={`ss-glass ss-glass--ambient ss-glass--interactive group relative ${uiTokens.thumbnail.desktopTileSize} overflow-hidden rounded-xl`}
                aria-label={`Open ${title} gallery image ${index + 1}`}
              >
                <img src={image} onError={handleListingImageError} alt={`${title} gallery image ${index + 1}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                {showOverflow ? <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">+{desktopOverflow}</div> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {showMobile ? (
        <div className="mt-4 flex gap-2 lg:hidden">
          {mobileItems.map((image, index) => {
            const isLast = index === mobileItems.length - 1;
            const showOverflow = isLast && mobileOverflow > 0;
            return (
              <button key={`mobile-${image}-${index}`} type="button" onClick={() => openImage(image)} className={`ss-glass ss-glass--ambient relative ${uiTokens.thumbnail.mobileTileSize} overflow-hidden rounded-lg`} aria-label={`Open ${title} gallery image ${index + 1}`}>
                <img src={image} onError={handleListingImageError} alt={`${title} gallery image ${index + 1}`} className="h-full w-full object-cover" />
                {showOverflow ? <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-semibold text-white">+{mobileOverflow}</div> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {activeIndex !== null ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${title} photo gallery`} onClick={() => setActiveIndex(null)}>
          <div className="ss-glass ss-glass--liquid relative flex max-h-[88vh] w-full max-w-5xl items-center justify-center rounded-[28px] p-4 sm:p-6" onClick={(event) => event.stopPropagation()}>
            <img src={clean[activeIndex]} onError={handleListingImageError} alt={`${title} expanded gallery image ${activeIndex + 1}`} className="max-h-[76vh] max-w-full rounded-2xl object-contain" />
            <button type="button" onClick={() => setActiveIndex(null)} className="ss-glass ss-glass--liquid ss-glass--interactive absolute right-4 top-4 rounded-full p-2 text-white" aria-label="Close gallery"><X className="h-5 w-5" /></button>
            {clean.length > 1 ? (
              <>
                <button type="button" onClick={() => step(-1)} className="ss-glass ss-glass--liquid ss-glass--interactive absolute left-4 rounded-full p-2 text-white" aria-label="Previous image"><ChevronLeft className="h-6 w-6" /></button>
                <button type="button" onClick={() => step(1)} className="ss-glass ss-glass--liquid ss-glass--interactive absolute right-4 rounded-full p-2 text-white" aria-label="Next image"><ChevronRight className="h-6 w-6" /></button>
              </>
            ) : null}
            <div className="ss-glass ss-glass--ambient absolute bottom-4 rounded-full px-3 py-1 text-xs font-semibold text-gray-200">{activeIndex + 1} of {clean.length}</div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default HeroThumbnailStack;
