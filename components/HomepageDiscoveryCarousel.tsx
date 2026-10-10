import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
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

const STACK_SPACING_RATIO = 0.56;
const VISIBLE_NEIGHBOR_RADIUS = 2;

const HomepageDiscoveryCarousel: React.FC<HomepageDiscoveryCarouselProps> = ({ items, onOpen, resetKey }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const controls = useAnimationControls();
  const prefersReducedMotion = useReducedMotion();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [resetKey]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => {
      const nextWidth = node.clientWidth;
      setViewportWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cardWidth = useMemo(() => {
    if (!viewportWidth) return 252;
    return Math.min(286, Math.max(236, viewportWidth * 0.72));
  }, [viewportWidth]);

  const stackSpacing = cardWidth * STACK_SPACING_RATIO;
  const cardOverlap = cardWidth - stackSpacing;

  const xFor = useCallback(
    (index: number) => {
      if (!viewportWidth) return 0;
      return viewportWidth / 2 - cardWidth / 2 - index * stackSpacing;
    },
    [cardWidth, stackSpacing, viewportWidth],
  );

  useEffect(() => {
    void controls.start({
      x: xFor(activeIndex),
      transition: prefersReducedMotion
        ? { duration: 0.12 }
        : { type: 'spring', stiffness: 360, damping: 28, mass: 0.72 },
    });
  }, [activeIndex, controls, prefersReducedMotion, xFor]);

  const moveTo = useCallback(
    (index: number) => {
      if (!items.length) return;
      setActiveIndex(Math.max(0, Math.min(items.length - 1, index)));
    },
    [items.length],
  );

  const onDragStart = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const onDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number }; velocity: { x: number } }) => {
      window.setTimeout(() => {
        draggingRef.current = false;
      }, 0);
      const fling = Math.abs(info.velocity.x) > 450;
      const moved = Math.abs(info.offset.x) > cardWidth * 0.18;
      if (!fling && !moved) {
        void controls.start({
          x: xFor(activeIndex),
          transition: prefersReducedMotion
            ? { duration: 0.12 }
            : { type: 'spring', stiffness: 360, damping: 28, mass: 0.72 },
        });
        return;
      }
      if (info.offset.x < 0 || info.velocity.x < -450) moveTo(activeIndex + 1);
      else moveTo(activeIndex - 1);
    },
    [activeIndex, cardWidth, controls, moveTo, prefersReducedMotion, xFor],
  );

  const cardClickHandlers = useMemo(
    () =>
      items.map((item, index) => () => {
        if (draggingRef.current) return;
        if (index === activeIndex) onOpen(item.listing);
        else moveTo(index);
      }),
    [activeIndex, items, moveTo, onOpen],
  );

  if (!items.length) return null;

  return (
    <div className="lg:hidden">
      <div ref={viewportRef} className="relative overflow-hidden px-0 py-7">
        <motion.div
          className="flex cursor-grab select-none items-center active:cursor-grabbing [touch-action:pan-y] [will-change:transform]"
          animate={controls}
          drag="x"
          dragElastic={0.11}
          dragMomentum={false}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {items.map((item, index) => {
            const distance = Math.abs(index - activeIndex);
            const direction = index < activeIndex ? -1 : index > activeIndex ? 1 : 0;
            const scale = distance === 0 ? 1 : distance === 1 ? 0.91 : 0.82;
            const opacity = distance === 0 ? 1 : distance === 1 ? 0.78 : distance === 2 ? 0.42 : 0;
            const y = distance === 0 ? 0 : distance === 1 ? 9 : 17;
            const isWithinWindow = distance <= VISIBLE_NEIGHBOR_RADIUS;

            return (
              <div
                key={item.listing.id}
                style={{
                  width: cardWidth,
                  flex: `0 0 ${cardWidth}px`,
                  marginRight: -cardOverlap,
                  zIndex: 30 - distance,
                  position: 'relative',
                  transform: `translate3d(0, ${y}px, 0) scale(${scale})`,
                  opacity,
                  transition: prefersReducedMotion
                    ? 'none'
                    : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                  transformOrigin: direction < 0 ? 'right center' : direction > 0 ? 'left center' : 'center center',
                  willChange: distance <= 1 ? 'transform, opacity' : 'auto',
                  pointerEvents: isWithinWindow ? 'auto' : 'none',
                }}
              >
                {isWithinWindow ? (
                  <HomepageDiscoveryCard
                    listing={item.listing}
                    resolvedLogoUrl={item.logoUrl}
                    imagePriority={distance <= 1 ? 'high' : 'low'}
                    className="!w-full"
                    onClick={cardClickHandlers[index]}
                  />
                ) : (
                  <div className="h-[320px] w-full" aria-hidden="true" />
                )}
              </div>
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
              className="absolute left-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg transition hover:bg-black/85 disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronLeft size={19} />
            </button>
            <button
              type="button"
              aria-label="Next listing"
              disabled={activeIndex === items.length - 1}
              onClick={() => moveTo(activeIndex + 1)}
              className="absolute right-1 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg transition hover:bg-black/85 disabled:pointer-events-none disabled:opacity-25"
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
