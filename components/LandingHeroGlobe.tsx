import React, { useEffect, useMemo, useRef } from 'react';
import type { GlobeV1RuntimeEvent } from '../data/globeV1MockData';
import { useEntityIndex } from '../hooks/useEntityIndex';
import { clubBrands } from '../data/clubBrands';
import { adaptListingsToGlobeEvents, isGlobeEligibleListing } from '../lib/globeEntityAdapter';
import { resolveBrandHeader, resolveBrandLogo } from '../lib/entityBrandMedia';
import { getListingPrimaryHeroUrl, getListingPrimaryLogoUrl } from '../lib/listingImage';
import { createGlobePerformanceConfig, getGraphicsCapability } from '../lib/graphicsCapability';

type LandingGlobeRuntime = {
  mount: () => Promise<LandingGlobeRuntime> | LandingGlobeRuntime;
  updateEvents: (events: GlobeV1RuntimeEvent[]) => void;
  selectEvent: (eventId: string) => GlobeV1RuntimeEvent | null;
  fadeOutSelectedEvent: () => void;
  returnToWorld: (options?: { preserveSelection?: boolean }) => void;
  clearSelection: () => void;
  setIdleMotionSpeedMultiplier: (multiplier: number) => void;
  updatePresentationConfig: (config: Record<string, unknown>, options?: { frameWorld?: boolean }) => unknown;
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

type LandingGlobeConstructor = new (
  container: HTMLElement,
  options: {
    events: GlobeV1RuntimeEvent[];
    config: Record<string, unknown>;
  },
) => LandingGlobeRuntime;

type LandingHeroGlobeProps = {
  autoplay?: boolean;
  initialDelayMs?: number;
  idleDurationMs?: number;
  focusDurationMs?: number;
};

const landingGlobeConfig = {
  assets: {
    landModel: '/assets/globe/models/land.glb',
    oceanModel: '/assets/globe/models/ocean.glb',
    countryIdTexture: '/assets/globe/textures/countryIdTexture.png',
    visualCountryAtlas: '/assets/globe/textures/visualCountryAtlas_v3.png',
    countryLookup: '/assets/globe/data/countryLookup.json',
  },
  background: {
    enabled: false,
  },
  renderer: {
    // Pull the showcase closer to the headline so the opening composition feels
    // intentional instead of leaving a large dead zone between copy and globe.
    viewOffsetX: 0.18,
    // Keep the oversized showcase globe low in the hero instead of letting its
    // upper hemisphere dominate the frame.
    viewOffsetY: -0.22,
    viewOffsetMinWidth: 900,
  },
  presentation: {
    // Keep this showcase globe deliberately oversized relative to the explorer.
    // 1.344 is exactly 20% larger than the shared 1.12 presentation scale.
    globeScale: 1.344,
    camera: {
      // Keep the homepage globe cinematic, but give the post-launch idle state
      // about 20% more camera distance so it no longer overwhelms the hero.
      defaultDistanceWorld: 9.72,
      // The globe itself is 20% larger than the explorer. Compensate at the
      // selected-club arrival so cycling doesn't turn into an extreme close-up.
      listingArrivalDistanceWorld: 6.8,
    },
    pins: {
      // The showcase camera often views the terrain at a grazing angle. Keep
      // the pin clearly detached from the facet, but shorten the stem so it
      // reads as standing on the surface instead of visually spearing through
      // a large low-poly triangle.
      surfaceOffsetRadius: 0.009,
      stemHeightRadius: 0.042,
      selectedLiftRadius: 0.0025,
    },
  },
  idleMotion: {
    idleResumeDelaySeconds: 0.15,
    idleResumeEaseSeconds: 1.2,
    landInteractionEaseSeconds: 1.1,
  },
  pinPlacement: {
    showOnlySelectedEvent: true,
    // The homepage only ever presents one pin, so decluttering spread is not
    // useful here. It was causing the fading pin to begin at a displaced
    // coordinate (sometimes over water) before lerping back to the real venue.
    regionalSpread: {
      enabled: false,
    },
  },
  cameraFocus: {
    heroArrival: {
      // Preserve the existing 30° destination tilt/heading, but frame the globe
      // substantially lower so the selected pin and card stay in the viewport.
      heroStage: {
        globeScreenY: 1.58,
      },
    },
  },
  selection: {
    // Homepage autoplay is presentation-only; selecting its showcase pin should
    // not paint the underlying country as if the user selected it.
    highlightEventCountry: false,
    fadeInSeconds: 0.48,
    fadeOutSeconds: 0.62,
  },
};

const selectionFadeOutMs = 650;
const returnToIdleLeadInMs = 1200;
const selectionLingerIntoIdleMs = 2600;

const LandingHeroGlobe: React.FC<LandingHeroGlobeProps> = ({
  autoplay = true,
  initialDelayMs = 6500,
  idleDurationMs = 9000,
  focusDurationMs = 5200,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<LandingGlobeRuntime | null>(null);
  const { listings, venues, organizations, organizationVenueRelationships, isLoading } = useEntityIndex();
  const showcaseRuntimeEvents = useMemo(() => {
    const directMediaListings = listings.map((listing) => ({
      ...listing,
      logoImageUrl: getListingPrimaryLogoUrl(listing) ?? listing.logoImageUrl,
      headerImageUrl: getListingPrimaryHeroUrl(listing) ?? listing.headerImageUrl,
    }));
    const catalog = {
      listings: directMediaListings,
      venues,
      organizations,
      relationships: organizationVenueRelationships,
      clubBrands,
    };
    const presentationListings = directMediaListings.map((listing) => {
      if (listing.type !== 'club') return listing;
      const resolvedLogo = getListingPrimaryLogoUrl(listing)
        ?? resolveBrandLogo('club', listing.id, catalog).url;
      const resolvedHeader = getListingPrimaryHeroUrl(listing)
        ?? resolveBrandHeader('club', listing.id, catalog).url;
      return {
        ...listing,
        ...(resolvedLogo ? { logoImageUrl: resolvedLogo } : {}),
        ...(resolvedHeader ? { headerImageUrl: resolvedHeader } : {}),
      };
    });
    return adaptListingsToGlobeEvents(
      presentationListings.filter((listing) => listing.type === 'club' && isGlobeEligibleListing(listing)),
    );
  }, [listings, organizationVenueRelationships, organizations, venues]);

  useEffect(() => {
    if (isLoading || showcaseRuntimeEvents.length === 0) return undefined;
    let cancelled = false;
    const timers = new Set<number>();
    let previousEventId: string | null = null;
    let shuffledEventIds: string[] = [];
    let isHeroVisible = true;
    let visibilityObserver: IntersectionObserver | null = null;

    const clearTimers = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
    };

    const refillShuffleBag = () => {
      shuffledEventIds = showcaseRuntimeEvents.map((event) => String(event.id));
      for (let index = shuffledEventIds.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffledEventIds[index], shuffledEventIds[swapIndex]] = [shuffledEventIds[swapIndex], shuffledEventIds[index]];
      }
      if (shuffledEventIds.length > 1 && shuffledEventIds[0] === previousEventId) {
        const swapIndex = 1 + Math.floor(Math.random() * (shuffledEventIds.length - 1));
        [shuffledEventIds[0], shuffledEventIds[swapIndex]] = [shuffledEventIds[swapIndex], shuffledEventIds[0]];
      }
    };

    const chooseNextEvent = () => {
      if (!shuffledEventIds.length) refillShuffleBag();
      const nextId = shuffledEventIds.shift();
      return showcaseRuntimeEvents.find((event) => String(event.id) === nextId) ?? null;
    };

    const beginAutoplay = (globe: LandingGlobeRuntime) => {
      if (!autoplay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const focusNext = () => {
        if (cancelled || document.hidden || !isHeroVisible) {
          schedule(focusNext, idleDurationMs);
          return;
        }

        const nextEvent = chooseNextEvent();
        if (!nextEvent) return;
        previousEventId = String(nextEvent.id);
        globe.setIdleMotionSpeedMultiplier(0.16);
        globe.selectEvent(previousEventId);

        schedule(() => {
          if (cancelled) return;
          globe.returnToWorld({ preserveSelection: true });
          schedule(() => {
            if (cancelled) return;
            globe.setIdleMotionSpeedMultiplier(1);
            schedule(() => {
              if (cancelled) return;
              globe.fadeOutSelectedEvent();
              schedule(() => {
                if (cancelled) return;
                globe.clearSelection();
              }, selectionFadeOutMs);
            }, selectionLingerIntoIdleMs);
          }, returnToIdleLeadInMs);
          schedule(focusNext, idleDurationMs);
        }, focusDurationMs);
      };

      schedule(focusNext, initialDelayMs);
    };

    const mountGlobe = async () => {
      if (!containerRef.current) return;
      const desktopViewport = window.matchMedia('(min-width: 768px)').matches;
      if (!desktopViewport) return;

      const graphicsCapability = getGraphicsCapability();
      if (graphicsCapability === 'unsupported') return;
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const performanceConfig = createGlobePerformanceConfig(graphicsCapability, prefersReducedMotion);
      const module = await import('../src/features/globe/runtime/index.js');
      if (cancelled || !containerRef.current) return;
      const SwingSphereGlobe = module.SwingSphereGlobe as LandingGlobeConstructor;
      const globe = new SwingSphereGlobe(containerRef.current, {
        events: showcaseRuntimeEvents,
        config: {
          ...landingGlobeConfig,
          ...performanceConfig,
          renderer: {
            ...landingGlobeConfig.renderer,
            ...(performanceConfig.renderer as Record<string, unknown>),
          },
        },
      });
      globeRef.current = globe;
      await globe.mount();
      if (cancelled || !containerRef.current) return;

      // Opening composition: start about 20% larger than the settled idle view.
      // Immediately restore the configured idle distance without reframing so
      // later return-to-world transitions still settle at the roomier 9.72 view.
      globe.updatePresentationConfig({
        camera: { defaultDistanceWorld: 8.1 },
      }, { frameWorld: true });
      globe.updatePresentationConfig({
        camera: { defaultDistanceWorld: 9.72 },
      }, { frameWorld: false });

      if (typeof IntersectionObserver !== 'undefined') {
        visibilityObserver = new IntersectionObserver(
          ([entry]) => {
            const nextVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio > 0);
            if (nextVisible === isHeroVisible) return;
            isHeroVisible = nextVisible;
            if (isHeroVisible) globe.start();
            else globe.stop();
          },
          { threshold: 0.01 },
        );
        visibilityObserver.observe(containerRef.current);
      }

      beginAutoplay(globe);
    };

    void mountGlobe();

    return () => {
      cancelled = true;
      clearTimers();
      visibilityObserver?.disconnect();
      visibilityObserver = null;
      globeRef.current?.dispose();
      globeRef.current = null;
    };
  }, [autoplay, focusDurationMs, idleDurationMs, initialDelayMs, isLoading, showcaseRuntimeEvents]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="h-full w-full"
    />
  );
};

export default LandingHeroGlobe;
