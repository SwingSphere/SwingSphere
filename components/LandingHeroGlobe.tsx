import React, { useEffect, useRef } from 'react';
import showcaseRuntimeEvents from 'virtual:swingsphere-globe-showcase-events';
import type { GlobeV1RuntimeEvent } from '../data/globeV1MockData';
import { createGlobePerformanceConfig, getGraphicsCapability } from '../lib/graphicsCapability';

type LandingGlobeRuntime = {
  mount: () => Promise<LandingGlobeRuntime> | LandingGlobeRuntime;
  updateEvents: (events: GlobeV1RuntimeEvent[]) => void;
  selectEvent: (eventId: string) => GlobeV1RuntimeEvent | null;
  fadeOutSelectedEvent: () => void;
  returnToWorld: (options?: { preserveSelection?: boolean }) => void;
  clearSelection: () => void;
  setIdleMotionSpeedMultiplier: (multiplier: number) => void;
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
    cameraPosition: [0, 0.35, 7.55],
    viewOffsetX: 0.23,
    viewOffsetMinWidth: 900,
  },
  idleMotion: {
    idleResumeDelaySeconds: 0.15,
    idleResumeEaseSeconds: 1.2,
    landInteractionEaseSeconds: 1.1,
  },
  pinPlacement: {
    showOnlySelectedEvent: true,
  },
  selection: {
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

  useEffect(() => {
    let cancelled = false;
    const timers = new Set<number>();
    let previousEventId: string | null = null;
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

    const chooseNextEvent = () => {
      const candidates = showcaseRuntimeEvents.filter((event) => String(event.id) !== previousEventId);
      const pool = candidates.length ? candidates : showcaseRuntimeEvents;
      return pool[Math.floor(Math.random() * pool.length)] ?? null;
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
  }, [autoplay, focusDurationMs, idleDurationMs, initialDelayMs]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="h-full w-full"
    />
  );
};

export default LandingHeroGlobe;
