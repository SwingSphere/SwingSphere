import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import HomepageDiscoveryCard from './HomepageDiscoveryCard';
import type { Listing } from '../types';

type CarouselItem = {
  listing: Listing;
  logoUrl?: string;
};

type HomepageDiscoveryCarouselProps = {
  items: CarouselItem[];
  onOpen: (listing: Listing) => void;
  resetKey: string;
};

const GAP = 16;

const HomepageDiscoveryCarousel: React.FC<HomepageDiscoveryCarouselProps> = ({ items, onOpen, resetKey }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const controls = useAnimationControls();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [resetKey]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => setViewportWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cardWidth = useMemo(() => {
    if (!viewportWidth) return 252;
    return Math.min(286, Math.max(236, viewportWidth * 0.72));
  }, [viewportWidth]);

  const xFor = (index: number) => {
    if (!viewportWidth) return 0;
    return viewportWidth / 2 - cardWidth / 2 - index * (cardWidth + GAP);
  };

  useEffect(() => {
    void controls.start({
      x: xFor(activeIndex),
      transition: { type: 'spring', stiffness: 360, damping: 28, mass: 0.72 },
    });
  }, [activeIndex, cardWidth, viewportWidth, controls]);

  const moveTo = (index: number) => {
    if (!items.length) return;
    setActiveIndex(Math.max(0, Math.min(items.length - 1, index)));
  };

  const onDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number }; velocity: { x: number } }) => {
    setDragging(false);
    const fling = Math.abs(info.velocity.x) > 450;
    const moved = Math.abs(info.offset.x) > cardWidth * 0.18;
    if (!fling && !moved) {
      void controls.start({ x: xFor(activeIndex), transition: { type: 'spring', stiffness: 360, damping: 28, mass: 0.72 } });
      return;
    }
    if (info.offset.x < 0 || info.velocity.x < -450) moveTo(activeIndex + 1);
    else moveTo(activeIndex - 1);
  };

  if (!items.length) return null;

  return (
    <div className="lg:hidden">
      <div ref={viewportRef} className="relative overflow-hidden px-0 py-5">
        <motion.div
          className="flex cursor-grab select-none items-center active:cursor-grabbing"
          animate={controls}
          drag="x"
          dragElastic={0.11}
          dragMomentum={false}
          onDragStart={() => setDragging(true)}
          onDragEnd={onDragEnd}
          style={{ gap: GAP }}
        >
          {items.map((item, index) => {
            const distance = Math.abs(index - activeIndex);
            const scale = distance === 0 ? 1 : distance === 1 ? 0.92 : 0.84;
            const opacity = distance === 0 ? 1 : distance === 1 ? 0.72 : 0.42;
            return (
              <motion.div
                key={item.listing.id}
                animate={{ scale, opacity }}
                transition={{ type: 'spring', stiffness: 320, damping: 27, mass: 0.68 }}
                style={{ width: cardWidth, flex: `0 0 ${cardWidth}px`, zIndex: 10 - distance }}
                className="origin-center"
              >
                <HomepageDiscoveryCard
                  listing={item.listing}
                  resolvedLogoUrl={item.logoUrl}
                  className="!w-full"
                  onClick={() => {
                    if (!dragging && index === activeIndex) onOpen(item.listing);
                    else if (!dragging) moveTo(index);
                  }}
                />
              </motion.div>
            );
          })}
        </motion.div>

        {items.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous listing"
              disabled={activeIndex === 0}
              onClick={() => moveTo(activeIndex - 1)}
              className="absolute left-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/75 disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronLeft size={19} />
            </button>
            <button
              type="button"
              aria-label="Next listing"
              disabled={activeIndex === items.length - 1}
              onClick={() => moveTo(activeIndex + 1)}
              className="absolute right-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur transition hover:bg-black/75 disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronRight size={19} />
            </button>
          </>
        ) : null}
      </div>

      <div className="mt-1 flex items-center justify-center gap-2" aria-label={`Slide ${activeIndex + 1} of ${items.length}`}>
        {items.map((item, index) => (
          <button
            key={item.listing.id}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => moveTo(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${index === activeIndex ? 'w-6 bg-red-500' : 'w-1.5 bg-white/25 hover:bg-white/40'}`}
          />
        ))}
      </div>
    </div>
  );
};

export default HomepageDiscoveryCarousel;
