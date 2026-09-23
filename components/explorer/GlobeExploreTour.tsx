import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MousePointer2, X } from 'lucide-react';

const TOUR_STORAGE_KEY = 'swingsphere:globe-tour-seen-v1';

type TourRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TourStep = {
  title: string;
  body: React.ReactNode;
  target: 'globe' | string;
};

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Move around the globe',
    target: 'globe',
    body: (
      <>
        Drag to rotate the world, then scroll to zoom. Click a country to focus on it and keep exploring from there.
      </>
    ),
  },
  {
    title: 'Choose what you want to discover',
    target: '[data-globe-tour="filters"]',
    body: (
      <>
        Clubs are shown by default for a cleaner map. Switch to Events or Hosts at any time, or choose <strong className="font-semibold text-white">Show all</strong> to see everything together.
      </>
    ),
  },
  {
    title: 'Know what the pins mean',
    target: 'globe',
    body: (
      <div className="space-y-2">
        <p>Glowing white discovery pins represent an area with multiple things to explore. Select one to focus that area and open its nearby stack; the active area marker changes color so you can keep your geographic anchor.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.85)]" /> Club</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.85)]" /> Event</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.85)]" /> Host</span>
        </div>
        <p>Colored destination pins are individual places, events, or hosts you can open directly.</p>
      </div>
    ),
  },
  {
    title: 'Browse the area or open its map',
    target: 'globe',
    body: (
      <>
        Select a discovery pin to open a stack of the clubs, events, or hosts in that area. Scroll or use the up and down arrows to cycle through the stack. Choose the map icon to open the same regional results on the flat map, framed to that area.
      </>
    ),
  },
  {
    title: 'Search instead of browsing',
    target: '[data-globe-tour="search"]',
    body: (
      <>
        Already know where you want to go? Search by name, city, or keyword. Search respects whichever Clubs, Events, or Hosts view you currently have selected.
      </>
    ),
  },
  {
    title: 'Explore what is nearby',
    target: '[data-globe-tour="nearby"]',
    body: (
      <>
        As you move around the world, this rail updates with destinations in the area. Select a card to open it without hunting for the exact pin.
      </>
    ),
  },
];

const getTargetRect = (target: TourStep['target']): TourRect | null => {
  if (typeof window === 'undefined') return null;

  if (target === 'globe') {
    const left = Math.max(330, window.innerWidth * 0.25);
    const right = Math.max(390, window.innerWidth * 0.22);
    const top = 105;
    const bottom = Math.max(205, window.innerHeight * 0.22);
    return {
      left,
      top,
      width: Math.max(280, window.innerWidth - left - right),
      height: Math.max(260, window.innerHeight - top - bottom),
    };
  }

  const element = document.querySelector<HTMLElement>(target);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

const GlobeExploreTour: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);
  const [showNudge, setShowNudge] = useState(false);

  const step = TOUR_STEPS[stepIndex];

  const refreshTarget = useCallback(() => {
    if (!isOpen) return;
    setTargetRect(getTargetRect(step.target));
  }, [isOpen, step.target]);

  const openTour = useCallback(() => {
    setShowNudge(false);
    setStepIndex(0);
    setIsOpen(true);
  }, []);

  const closeTour = useCallback((remember = true) => {
    setIsOpen(false);
    if (remember) {
      try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, '1');
      } catch {
        // Browsing still works when storage is unavailable.
      }
    }
  }, []);

  useEffect(() => {
    const handleOpenTour = () => openTour();
    window.addEventListener('swingsphere:open-globe-tour', handleOpenTour);
    return () => window.removeEventListener('swingsphere:open-globe-tour', handleOpenTour);
  }, [openTour]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return;
    let alreadySeen = false;
    try {
      alreadySeen = window.localStorage.getItem(TOUR_STORAGE_KEY) === '1';
    } catch {
      alreadySeen = false;
    }
    if (alreadySeen) return;

    const timer = window.setTimeout(() => setShowNudge(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    refreshTarget();
    if (!isOpen) return;

    const handleResize = () => refreshTarget();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isOpen, refreshTarget, stepIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTour(false);
      if (event.key === 'ArrowRight' && stepIndex < TOUR_STEPS.length - 1) setStepIndex((current) => current + 1);
      if (event.key === 'ArrowLeft' && stepIndex > 0) setStepIndex((current) => current - 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeTour, isOpen, stepIndex]);

  const tooltipStyle = useMemo<React.CSSProperties>(() => {
    if (!targetRect || typeof window === 'undefined') {
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
    }

    const width = 360;
    const margin = 18;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const preferRight = targetCenterX < window.innerWidth / 2;
    let left = preferRight ? targetRect.left + targetRect.width + margin : targetRect.left - width - margin;
    left = Math.max(18, Math.min(left, window.innerWidth - width - 18));

    let top = targetRect.top + Math.min(36, targetRect.height * 0.18);
    top = Math.max(88, Math.min(top, window.innerHeight - 310));

    return { left, top, width };
  }, [targetRect]);

  if (!isOpen && !showNudge) return null;

  return (
    <>
      {showNudge && !isOpen ? (
        <div className="pointer-events-none fixed inset-0 z-[118] max-md:hidden" aria-hidden="true">
          <div className="absolute bottom-[78px] left-[clamp(24px,1.8vw,32px)] rounded-xl border border-red-300/20 bg-black/88 px-3 py-2 text-[11px] font-medium text-red-50 shadow-xl backdrop-blur-xl">
            New here? Try the 45-second tour.
          </div>
        </div>
      ) : null}

      {isOpen ? (
        <div className="fixed inset-0 z-[120] max-md:hidden" role="dialog" aria-modal="true" aria-label="How to explore SwingSphere">
          <div className="absolute inset-0 bg-black/22" />

          {targetRect ? (
            <div
              className="pointer-events-none absolute rounded-2xl border border-red-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.68),0_0_34px_rgba(239,68,68,0.5)] transition-all duration-300 ease-out"
              style={{
                left: targetRect.left - 7,
                top: targetRect.top - 7,
                width: targetRect.width + 14,
                height: targetRect.height + 14,
              }}
            />
          ) : null}

          <div
            className="absolute rounded-2xl border border-white/[0.12] bg-[rgba(8,10,14,0.95)] p-4 text-gray-100 shadow-2xl shadow-black/60 backdrop-blur-2xl transition-all duration-300"
            style={tooltipStyle}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300">
                  <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
                  How to Explore · {stepIndex + 1} of {TOUR_STEPS.length}
                </div>
                <h2 className="mt-2 text-base font-bold text-white">{step.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => closeTour(false)}
                className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Close tutorial"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 text-[12px] leading-5 text-gray-300">{step.body}</div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => closeTour(true)}
                className="text-[11px] font-semibold text-gray-500 transition hover:text-gray-300"
              >
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStepIndex((current) => current - 1)}
                    className="flex h-9 items-center gap-1 rounded-lg border border-white/[0.1] px-3 text-[11px] font-semibold text-gray-300 transition hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Back
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (stepIndex === TOUR_STEPS.length - 1) {
                      closeTour(true);
                      return;
                    }
                    setStepIndex((current) => current + 1);
                  }}
                  className="flex h-9 items-center gap-1 rounded-lg border border-red-300/40 bg-red-500/14 px-3 text-[11px] font-semibold text-red-50 transition hover:border-red-300/65 hover:bg-red-500/20"
                >
                  {stepIndex === TOUR_STEPS.length - 1 ? 'Start exploring' : 'Next'}
                  {stepIndex < TOUR_STEPS.length - 1 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default GlobeExploreTour;
