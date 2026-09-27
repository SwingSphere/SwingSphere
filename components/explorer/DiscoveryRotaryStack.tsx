import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Map } from 'lucide-react';
import type { Listing } from '../../types';
import { getListingCardImageUrl, getListingLogoUrl, handleListingImageError } from '../../lib/listingImage';
import { getListingPhysicalAddress } from '../../lib/entityCompatibility';
import { resolveCountryIsoCodes } from '../../lib/globeEntityAdapter';

export type DiscoveryRotaryHostItem = {
  id: string;
  organizationId: string;
  name: string;
  city: string;
  country: string;
  locationLabel?: string;
  logoUrl?: string;
  heroUrl?: string;
};

type Props = {
  scopeName: string;
  listings: Listing[];
  hosts?: DiscoveryRotaryHostItem[];
  selectedListingId?: string | null;
  anchor: { x: number; y: number } | null;
  onSelectListing: (listingId: string) => void;
  onSelectHost?: (host: DiscoveryRotaryHostItem) => void;
  onOpenMap: () => void;
};

const MAX_VISIBLE_CARDS = 5;

const countryCodeToFlagEmoji = (country: string | null | undefined) => {
  const iso2 = resolveCountryIsoCodes(country).iso2;
  if (!/^[A-Z]{2}$/.test(iso2)) return '';
  return String.fromCodePoint(...[...iso2].map((letter) => 127397 + letter.charCodeAt(0)));
};

const DiscoveryRotaryStack: React.FC<Props> = ({
  scopeName,
  listings,
  hosts = [],
  selectedListingId = null,
  anchor,
  onSelectListing,
  onSelectHost,
  onOpenMap,
}) => {
  const items = useMemo(() => [
    ...listings.map((listing) => ({ kind: 'listing' as const, id: listing.id, listing })),
    ...hosts.map((host) => ({ kind: 'host' as const, id: host.id, host })),
  ], [hosts, listings]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cardOrder, setCardOrder] = useState<number[]>(() => items.map((_, index) => index));
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [rotationDirection, setRotationDirection] = useState<1 | -1>(1);
  const touchStartYRef = useRef<number | null>(null);
  const rotationTimerRef = useRef<number | null>(null);

  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 390));

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
    setCardOrder(items.map((_, index) => index));
    setOutgoingIndex(null);
  }, [items, scopeName]);

  // When items load or change and no selectedListingId is provided, initialize to front item
  useEffect(() => {
    if (!selectedListingId && items.length > 0) {
      const first = items[0];
      if (first.kind === 'listing') onSelectListing(first.listing.id);
      else if (first.kind === 'host') onSelectHost?.(first.host);
    }
  }, [items, onSelectHost, onSelectListing, selectedListingId]);

  useEffect(() => {
    if (!selectedListingId || outgoingIndex !== null) return;
    const selectedIndex = items.findIndex((item) => item.kind === 'listing' && item.listing.id === selectedListingId);
    if (selectedIndex < 0) return;
    setCardOrder((current) => {
      if (current[0] === selectedIndex) return current;
      return [selectedIndex, ...current.filter((index) => index !== selectedIndex)];
    });
    setActiveIndex(selectedIndex);
  }, [items, outgoingIndex, selectedListingId]);

  useEffect(() => () => {
    if (rotationTimerRef.current !== null) window.clearTimeout(rotationTimerRef.current);
  }, []);

  const ordered = useMemo(() => {
    if (!items.length) return [];
    return cardOrder
      .map((index, depth) => ({
        item: items[index],
        index,
        depth,
      }))
      .filter((entry) => Boolean(entry.item));
  }, [cardOrder, items]);

  if (!anchor || items.length === 0) return null;

  const count = items.length;
  const isMobile = viewportWidth < 640;
  const maxAvailableWidth = viewportWidth - 24;
  const stackWidth = isMobile ? Math.min(350, Math.max(280, maxAvailableWidth)) : 350;
  const halfWidth = stackWidth / 2;
  const minX = halfWidth + 12;
  const maxX = viewportWidth - halfWidth - 12;
  const clampedX = isMobile
    ? (minX <= maxX ? Math.max(minX, Math.min(anchor.x, maxX)) : viewportWidth / 2)
    : anchor.x;
  const clampedY = isMobile ? Math.max(anchor.y, 290) : anchor.y;

  const advance = (delta: number) => {
    if (!count) return;
    if (rotationTimerRef.current !== null) {
      window.clearTimeout(rotationTimerRef.current);
      rotationTimerRef.current = null;
      setOutgoingIndex(null);
    }
    const direction: 1 | -1 = delta >= 0 ? 1 : -1;
    let nextOrder: number[];
    if (direction > 0) {
      const outgoing = cardOrder[0];
      nextOrder = [...cardOrder.slice(1), outgoing];
      setOutgoingIndex(outgoing);
    } else {
      const incoming = cardOrder[cardOrder.length - 1];
      nextOrder = [incoming, ...cardOrder.slice(0, -1)];
      setOutgoingIndex(null);
    }

    setRotationDirection(direction);
    setCardOrder(nextOrder);
    const newFrontIndex = nextOrder[0] ?? 0;
    setActiveIndex(newFrontIndex);

    // Immediately synchronize the selected venue / destination state
    const newFrontItem = items[newFrontIndex];
    if (newFrontItem) {
      if (newFrontItem.kind === 'listing') {
        onSelectListing(newFrontItem.listing.id);
      } else if (newFrontItem.kind === 'host') {
        onSelectHost?.(newFrontItem.host);
      }
    }

    rotationTimerRef.current = window.setTimeout(() => {
      setOutgoingIndex(null);
      rotationTimerRef.current = null;
    }, 450);
  };

  return (
    <div
      className="pointer-events-auto absolute z-[80]"
      style={{
        left: clampedX,
        top: clampedY,
        width: isMobile ? stackWidth : 'min(350px, calc(100vw - 56px))',
        height: 230,
        transform: 'translate(-50%, calc(-100% - 20px))',
        perspective: '950px',
        transformStyle: 'preserve-3d',
      }}
      onWheel={(event) => {
        if (Math.abs(event.deltaY) < 8) return;
        event.preventDefault();
        advance(event.deltaY > 0 ? 1 : -1);
      }}
      onTouchStart={(event) => {
        touchStartYRef.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(event) => {
        const startY = touchStartYRef.current;
        touchStartYRef.current = null;
        if (startY == null) return;
        const endY = event.changedTouches[0]?.clientY ?? startY;
        const delta = endY - startY;
        if (Math.abs(delta) >= 28) advance(delta < 0 ? 1 : -1);
      }}
      aria-label={scopeName + ' local activity stack'}
    >
      {ordered.map(({ item, index, depth }) => {
        const isActive = depth === 0;
        const isOutgoing = outgoingIndex === index;
        const visibleCardCount = Math.min(MAX_VISIBLE_CARDS, count);
        const isVisible = depth < visibleCardCount || isOutgoing;
        const depthOffset = Math.min(depth, visibleCardCount);
        const listing = item.kind === 'listing' ? item.listing : null;
        const host = item.kind === 'host' ? item.host : null;
        const address = listing ? getListingPhysicalAddress(listing) : null;
        const country = listing ? address?.country : host?.country;
        const city = listing ? address?.city : host?.city;
        const flagEmoji = countryCodeToFlagEmoji(country);
        const location = host?.locationLabel
          || [city, flagEmoji].filter(Boolean).join(' ')
          || listing?.location
          || scopeName;
        const name = listing?.name ?? host?.name ?? scopeName;
        const logoUrl = listing ? getListingLogoUrl(listing) : host?.logoUrl ?? '';
        const heroUrl = listing ? getListingCardImageUrl(listing) : host?.heroUrl ?? host?.logoUrl ?? '';

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (isActive) {
                if (listing) onSelectListing(listing.id);
                else if (host) onSelectHost?.(host);
                return;
              }
              if (depth === 1) advance(1);
              else if (depth === count - 1) advance(-1);
              else {
                const front = cardOrder[0];
                const nextOrder = [
                  index,
                  ...cardOrder.filter((cardIndex) => cardIndex !== index && cardIndex !== front),
                  front,
                ];
                setCardOrder(nextOrder);
                setActiveIndex(index);
                const activeItem = items[index];
                if (activeItem) {
                  if (activeItem.kind === 'listing') onSelectListing(activeItem.listing.id);
                  else if (activeItem.kind === 'host') onSelectHost?.(activeItem.host);
                }
              }
            }}
            className="top-full block overflow-hidden rounded-[20px] border text-left shadow-2xl backdrop-blur-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80"
            style={{
              position: 'absolute',
              left: isMobile ? `calc((${stackWidth}px - 44px) / 2)` : '50%',
              width: isMobile ? `calc(100% - 44px)` : 'min(330px, calc(100vw - 104px))',
              height: 104,
              zIndex: isOutgoing ? 28 : 20 - depth,
              opacity: isOutgoing ? 1 : isVisible ? [1, 0.8, 0.59, 0.4, 0.25][depth] ?? 0 : 0,
              pointerEvents: isVisible && !isOutgoing ? 'auto' : 'none',
              transformOrigin: '50% 100%',
              transform: [
                'translate(-50%, -100%)',
                'translateX(' + (depthOffset * (isMobile ? 6 : 15)) + 'px)',
                'translateY(' + (-depthOffset * 14) + 'px)',
                'translateZ(' + (-depthOffset * 38) + 'px)',
                'scale(' + (1 - depthOffset * 0.022) + ')',
                'rotateX(' + (-depthOffset * 4.5) + 'deg)',
                'rotateZ(' + (depthOffset * 0.7) + 'deg)',
              ].join(' '),
              animation: isOutgoing
                ? (rotationDirection > 0
                  ? 'ss-discovery-rotary-to-rear 520ms cubic-bezier(.2,.72,.18,1) both'
                  : 'ss-discovery-rotary-to-rear-reverse 520ms cubic-bezier(.2,.72,.18,1) both')
                : undefined,
              transition: isOutgoing
                ? 'none'
                : 'transform 430ms cubic-bezier(.2,.78,.2,1), opacity 300ms ease, filter 300ms ease',
              background: isActive
                ? 'linear-gradient(145deg, rgba(23,18,24,.94), rgba(7,9,13,.92))'
                : 'linear-gradient(145deg, rgba(14,16,22,.88), rgba(6,8,12,.82))',
              borderColor: isActive ? 'rgba(248,113,113,.62)' : 'rgba(255,255,255,.13)',
              filter: isActive ? 'saturate(1.05)' : 'brightness(' + (1 - depthOffset * 0.08) + ')',
            }}
            aria-label={isActive ? 'Open ' + name : 'Bring ' + name + ' to front'}
          >
            <img
              src={heroUrl}
              onError={listing ? handleListingImageError : undefined}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.58]"
            />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/72 via-black/48 to-black/58" />
            <span className="relative flex h-full items-center gap-3 px-3.5 sm:px-4">
              <img
                src={logoUrl}
                onError={listing ? handleListingImageError : undefined}
                alt=""
                className="h-[72px] w-[72px] shrink-0 rounded-[16px] border border-white/15 bg-black/45 object-cover shadow-lg sm:h-[76px] sm:w-[76px]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-white sm:text-[15px]">{name}</span>
                <span className="mt-1 block truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/55 sm:text-[11px]">{location}</span>
              </span>
              {isActive ? (
                <span className="shrink-0 rounded-full border border-red-300/25 bg-red-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-red-100">
                  {activeIndex + 1}/{count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}

      <div
        className={`absolute flex flex-col gap-1.5 transition-all ${
          isMobile
            ? 'bottom-0 right-0'
            : 'right-[-42px] top-[66px] max-[560px]:right-[-32px]'
        }`}
        style={{
          marginRight: isMobile ? 'max(0px, env(safe-area-inset-right))' : undefined,
        }}
      >
        <button
          type="button"
          onClick={() => advance(-1)}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/75 text-white/80 shadow-lg backdrop-blur-xl transition hover:border-white/30 hover:text-white active:scale-95"
          aria-label="Previous nearby listing"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => advance(1)}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/75 text-white/80 shadow-lg backdrop-blur-xl transition hover:border-white/30 hover:text-white active:scale-95"
          aria-label="Next nearby listing"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenMap}
          className="mt-0.5 grid h-8 w-8 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/20 text-cyan-100 shadow-lg backdrop-blur-xl transition hover:border-cyan-200/50 hover:text-cyan-50 active:scale-95"
          aria-label={'Open ' + scopeName + ' in local map'}
          title={'Open ' + scopeName + ' in local map'}
        >
          <Map className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default DiscoveryRotaryStack;
