import React, { useEffect, useRef } from 'react';
import { ArrowRight, Globe2 } from 'lucide-react';

type ExploreGlobeButtonProps = {
  onActivate: () => void;
};

type EdgePlacement = {
  left: number;
  top: number;
  x: number;
  y: number;
};

const PARTICLE_COUNT = 14;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const getRandomEdgePlacement = (): EdgePlacement => {
  const side = Math.floor(Math.random() * 4);

  if (side === 0) {
    return {
      left: randomBetween(10, 90),
      top: randomBetween(2, 10),
      x: randomBetween(-18, 18),
      y: -randomBetween(36, 78),
    };
  }

  if (side === 1) {
    return {
      left: randomBetween(90, 98),
      top: randomBetween(18, 82),
      x: randomBetween(42, 86),
      y: randomBetween(-18, 18),
    };
  }

  if (side === 2) {
    return {
      left: randomBetween(10, 90),
      top: randomBetween(90, 98),
      x: randomBetween(-18, 18),
      y: randomBetween(36, 78),
    };
  }

  return {
    left: randomBetween(2, 10),
    top: randomBetween(18, 82),
    x: -randomBetween(42, 86),
    y: randomBetween(-18, 18),
  };
};

const ExploreGlobeButton: React.FC<ExploreGlobeButtonProps> = ({ onActivate }) => {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const particleRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const animationsRef = useRef<Array<Animation | null>>([]);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const radiationGenerationRef = useRef(0);
  const activeRef = useRef(false);

  const stopRadiation = () => {
    activeRef.current = false;
    radiationGenerationRef.current += 1;
    animationsRef.current.forEach((animation) => animation?.cancel());
    animationsRef.current = [];
  };

  const runParticle = (particle: HTMLSpanElement, index: number, generation: number, initialDelay = 0) => {
    if (!activeRef.current || generation !== radiationGenerationRef.current) return;

    const placement = getRandomEdgePlacement();
    const isHeroChunk = particle.classList.contains('ss-explore-globe-cta__particle--chunk');
    const rotation = randomBetween(-175, 175);
    const scale = isHeroChunk ? randomBetween(0.9, 1.45) : randomBetween(0.74, 1.36);
    const duration = isHeroChunk ? randomBetween(360, 620) : randomBetween(300, 560);
    const pause = isHeroChunk ? randomBetween(150, 520) : randomBetween(80, 360);

    particle.style.left = `${placement.left}%`;
    particle.style.top = `${placement.top}%`;

    const animation = particle.animate(
      [
        {
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(0.2) rotate(0deg)',
          offset: 0,
        },
        {
          opacity: randomBetween(0.7, 1),
          transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation * 0.18}deg)`,
          offset: 0.16,
        },
        {
          opacity: randomBetween(0.42, 0.76),
          transform: `translate(calc(-50% + ${placement.x * 0.44}px), calc(-50% + ${placement.y * 0.44}px)) scale(${scale * 0.72}) rotate(${rotation * 0.58}deg)`,
          offset: 0.52,
        },
        {
          opacity: 0,
          transform: `translate(calc(-50% + ${placement.x}px), calc(-50% + ${placement.y}px)) scale(0.08) rotate(${rotation}deg)`,
          offset: 1,
        },
      ],
      {
        duration,
        delay: initialDelay,
        easing: 'cubic-bezier(0.16, 0.78, 0.22, 1)',
        fill: 'none',
      },
    );

    animationsRef.current[index] = animation;

    animation.finished
      .then(() => {
        if (!activeRef.current || generation !== radiationGenerationRef.current) return;
        window.setTimeout(() => runParticle(particle, index, generation), pause);
      })
      .catch(() => {
        // Animation cancellation is expected when hover/focus ends.
      });
  };

  const startRadiation = () => {
    if (activeRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    activeRef.current = true;
    radiationGenerationRef.current += 1;
    const generation = radiationGenerationRef.current;

    particleRefs.current.forEach((particle, index) => {
      if (!particle) return;
      runParticle(particle, index, generation, randomBetween(0, 360));
    });
  };

  const syncRadiation = () => {
    if (hoverRef.current || focusRef.current) {
      startRadiation();
      return;
    }
    stopRadiation();
  };

  useEffect(() => () => stopRadiation(), []);

  return (
    <span
      ref={rootRef}
      className="ss-explore-globe-cta"
      onPointerEnter={() => {
        hoverRef.current = true;
        syncRadiation();
      }}
      onPointerLeave={() => {
        hoverRef.current = false;
        syncRadiation();
      }}
      onFocusCapture={() => {
        focusRef.current = true;
        syncRadiation();
      }}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        focusRef.current = false;
        syncRadiation();
      }}
    >
      <span className="ss-explore-globe-cta__radiation" aria-hidden="true">
        {Array.from({ length: PARTICLE_COUNT }).map((_, index) => {
          const variant = index % 5 === 0
            ? 'chunk'
            : index % 3 === 0
              ? 'spark'
              : index % 3 === 1
                ? 'outline'
                : 'hex';
          return (
            <span
              key={index}
              ref={(element) => { particleRefs.current[index] = element; }}
              className={`ss-explore-globe-cta__particle ss-explore-globe-cta__particle--${variant}`}
            />
          );
        })}
      </span>

      <button type="button" className="ss-explore-globe-cta__button" onClick={onActivate}>
        <span className="ss-explore-globe-cta__glass" aria-hidden="true" />
        <span className="ss-explore-globe-cta__content">
          <Globe2 className="ss-explore-globe-cta__icon" size={20} strokeWidth={1.9} aria-hidden="true" />
          <span>Explore the Globe</span>
          <ArrowRight className="ss-explore-globe-cta__arrow" size={18} strokeWidth={2} aria-hidden="true" />
        </span>
      </button>
    </span>
  );
};

export default ExploreGlobeButton;
