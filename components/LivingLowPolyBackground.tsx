import React, { useEffect, useMemo, useRef, useState } from 'react';

type Rgb = readonly [number, number, number];

type MeshPoint = {
  x: number;
  y: number;
  ampX: number;
  ampY: number;
  phaseX: number;
  phaseY: number;
};

type MeshTriangle = {
  a: number;
  b: number;
  c: number;
  phase: number;
  tone: number;
  flickerOffset: number;
};

type RuntimeSettings = {
  morphStrength: number;
  morphSpeed: number;
  colorSpeed: number;
  colorStrength: number;
  panelFlicker: number;
  lineStrength: number;
  glowStrength: number;
  interactive: boolean;
};

export type LivingLowPolyBackgroundProps = {
  opacity?: number;
  morphStrength?: number;
  morphSpeed?: number;
  colorSpeed?: number;
  colorStrength?: number;
  panelFlicker?: number;
  lineStrength?: number;
  glowStrength?: number;
  blurPx?: number;
  density?: number;
  interactive?: boolean;
  className?: string;
  palette?: {
    darkA: Rgb;
    darkB: Rgb;
    accentA: Rgb;
    accentB: Rgb;
    accentHot: Rgb;
  };
};

const VIEW_W = 1200;
const VIEW_H = 760;
const BASE_COLS = 11;
const BASE_ROWS = 8;
const FRAME_MS = 1000 / 18;

const DARK_A = [4, 5, 7] as const;
const DARK_B = [43, 45, 50] as const;
const RED_A = [31, 3, 8] as const;
const RED_B = [130, 8, 24] as const;
const RED_HOT = [209, 20, 48] as const;
const BLACK = [0, 0, 0] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const createSeededRandom = (seed = 0x5f3759df) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const mixRgb = (from: Rgb, to: Rgb, amount: number): Rgb => {
  const t = clamp(amount);
  return [
    Math.round(lerp(from[0], to[0], t)),
    Math.round(lerp(from[1], to[1], t)),
    Math.round(lerp(from[2], to[2], t)),
  ];
};

const rgba = (rgb: Rgb, alpha: number) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
const luminance = (rgb: Rgb) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;

export const getLivingBackgroundMeshStats = (density = 100) => {
  const normalizedDensity = clamp(density, 50, 200);
  const dimensionScale = Math.sqrt(normalizedDensity / 100);
  const cols = Math.max(7, Math.round(BASE_COLS * dimensionScale));
  const rows = Math.max(5, Math.round(BASE_ROWS * dimensionScale));
  const triangles = (cols - 1) * (rows - 1) * 2;
  return { cols, rows, triangles };
};

const panelFlickerEnvelope = (progress: number) => {
  if (progress < 0.08) return 0;
  if (progress < 0.13) return 0.72;
  if (progress < 0.18) return 0.08;
  if (progress < 0.24) return 0.90;
  if (progress < 0.30) return 0.34;
  if (progress < 0.68) return 0.98;
  if (progress < 0.73) return 0.52;
  if (progress < 0.78) return 0.98;
  if (progress < 0.83) return 0.18;
  if (progress < 0.88) return 0.78;
  if (progress < 0.93) return 0.28;
  return lerp(0.28, 0, clamp((progress - 0.93) / 0.07));
};

const getPanelFlickerAmount = (
  time: number,
  triangle: MeshTriangle,
  panelFlicker: number,
  reducedMotion: boolean,
) => {
  if (reducedMotion || panelFlicker <= 0) return 0;

  const activeFraction = clamp(panelFlicker, 0, 0.15);
  const cycleProgress = ((time / 80) + triangle.flickerOffset) % 1;
  if (cycleProgress >= activeFraction) return 0;

  return panelFlickerEnvelope(cycleProgress / activeFraction);
};

const buildMesh = (density: number) => {
  const random = createSeededRandom();
  const points: MeshPoint[] = [];
  const { cols, rows } = getLivingBackgroundMeshStats(density);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const edge = row === 0 || row === rows - 1 || col === 0 || col === cols - 1;
      const cellX = VIEW_W / (cols - 1);
      const cellY = VIEW_H / (rows - 1);
      const jitterX = edge ? 0 : (random() - 0.5) * cellX * 0.68;
      const jitterY = edge ? 0 : (random() - 0.5) * cellY * 0.58;

      points.push({
        x: col * cellX + jitterX,
        y: row * cellY + jitterY,
        ampX: edge ? 0 : 5 + random() * 11,
        ampY: edge ? 0 : 5 + random() * 12,
        phaseX: random() * Math.PI * 2,
        phaseY: random() * Math.PI * 2,
      });
    }
  }

  const triangles: MeshTriangle[] = [];
  const index = (col: number, row: number) => row * cols + col;

  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const topLeft = index(col, row);
      const topRight = index(col + 1, row);
      const bottomLeft = index(col, row + 1);
      const bottomRight = index(col + 1, row + 1);
      const flip = (row + col) % 2 === 0;

      if (flip) {
        triangles.push({ a: topLeft, b: topRight, c: bottomRight, phase: random() * Math.PI * 2, tone: random(), flickerOffset: random() });
        triangles.push({ a: topLeft, b: bottomRight, c: bottomLeft, phase: random() * Math.PI * 2, tone: random(), flickerOffset: random() });
      } else {
        triangles.push({ a: topLeft, b: topRight, c: bottomLeft, phase: random() * Math.PI * 2, tone: random(), flickerOffset: random() });
        triangles.push({ a: topRight, b: bottomRight, c: bottomLeft, phase: random() * Math.PI * 2, tone: random(), flickerOffset: random() });
      }
    }
  }

  return { points, triangles };
};

const basePointsForTriangle = (triangle: MeshTriangle, points: MeshPoint[]) => {
  const a = points[triangle.a];
  const b = points[triangle.b];
  const c = points[triangle.c];
  return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`;
};

export default function LivingLowPolyBackground({
  opacity = 0.7,
  morphStrength = 1,
  morphSpeed = 1,
  colorSpeed = 1,
  colorStrength = 1,
  panelFlicker = 0.05,
  lineStrength = 0.22,
  glowStrength = 0.35,
  blurPx = 0,
  density = 100,
  interactive = true,
  className = '',
  palette,
}: LivingLowPolyBackgroundProps) {
  const paletteDarkA = palette?.darkA ?? DARK_A;
  const paletteDarkB = palette?.darkB ?? DARK_B;
  const paletteAccentA = palette?.accentA ?? RED_A;
  const paletteAccentB = palette?.accentB ?? RED_B;
  const paletteAccentHot = palette?.accentHot ?? RED_HOT;
  const paletteRef = useRef({
    darkA: paletteDarkA,
    darkB: paletteDarkB,
    accentA: paletteAccentA,
    accentB: paletteAccentB,
    accentHot: paletteAccentHot,
  });
  paletteRef.current = {
    darkA: paletteDarkA,
    darkB: paletteDarkB,
    accentA: paletteAccentA,
    accentB: paletteAccentB,
    accentHot: paletteAccentHot,
  };

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  const effectiveDensity = isMobileViewport ? Math.min(density, 56) : density;
  const mesh = useMemo(() => buildMesh(effectiveDensity), [effectiveDensity]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const faceRefs = useRef<Array<SVGPolygonElement | null>>([]);
  const glowRefs = useRef<Array<SVGPolygonElement | null>>([]);
  const glowGroupRef = useRef<SVGGElement | null>(null);
  const glowBlurRef = useRef<SVGFEGaussianBlurElement | null>(null);
  const lastGlowApplied = useRef<number | null>(null);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const reducedMotion = useRef(false);
  const visible = useRef(true);
  const isGestureActiveRef = useRef(false);
  const pauseUntilRef = useRef(0);
  const isMobileRef = useRef(isMobileViewport);
  isMobileRef.current = isMobileViewport;
  const renderFrameRef = useRef<((time: number) => void) | null>(null);
  const settingsRef = useRef<RuntimeSettings>({
    morphStrength,
    morphSpeed,
    colorSpeed,
    colorStrength,
    panelFlicker,
    lineStrength,
    glowStrength,
    interactive,
  });

  settingsRef.current = {
    morphStrength,
    morphSpeed,
    colorSpeed,
    colorStrength,
    panelFlicker,
    lineStrength,
    glowStrength,
    interactive,
  };

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncReducedMotion = () => {
      reducedMotion.current = media.matches;
      if (media.matches) {
        pointer.current.x = 0;
        pointer.current.y = 0;
        pointer.current.tx = 0;
        pointer.current.ty = 0;
        renderFrameRef.current?.(0);
      }
    };

    syncReducedMotion();
    media.addEventListener('change', syncReducedMotion);
    return () => media.removeEventListener('change', syncReducedMotion);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !('IntersectionObserver' in window)) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
    }, { threshold: 0.01 });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handlePointerDown = () => {
      isGestureActiveRef.current = true;
      pauseUntilRef.current = performance.now() + 260;
    };
    const handlePointerUp = () => {
      isGestureActiveRef.current = false;
      pauseUntilRef.current = performance.now() + 220;
    };
    const handleTouchMoveOrScroll = () => {
      pauseUntilRef.current = performance.now() + 240;
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (isGestureActiveRef.current || event.buttons > 0) {
        pauseUntilRef.current = performance.now() + 240;
        return;
      }
      if (!settingsRef.current.interactive || reducedMotion.current || isMobileRef.current) return;
      pointer.current.tx = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
      pointer.current.ty = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
    };
    const handlePointerLeave = () => {
      pointer.current.tx = 0;
      pointer.current.ty = 0;
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('pointercancel', handlePointerUp, { passive: true });
    window.addEventListener('touchstart', handlePointerDown, { passive: true });
    window.addEventListener('touchmove', handleTouchMoveOrScroll, { passive: true });
    window.addEventListener('touchend', handlePointerUp, { passive: true });
    window.addEventListener('touchcancel', handlePointerUp, { passive: true });
    window.addEventListener('scroll', handleTouchMoveOrScroll, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', handlePointerLeave);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('touchmove', handleTouchMoveOrScroll);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
      window.removeEventListener('scroll', handleTouchMoveOrScroll);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, []);

  useEffect(() => {
    const animatedX = new Float32Array(mesh.points.length);
    const animatedY = new Float32Array(mesh.points.length);

    const renderFrame = (time: number) => {
      const settings = settingsRef.current;
      const isReduced = reducedMotion.current;
      const currentPalette = paletteRef.current;

      if (!isReduced) {
        pointer.current.x = lerp(pointer.current.x, pointer.current.tx, 0.055);
        pointer.current.y = lerp(pointer.current.y, pointer.current.ty, 0.055);
      }

      for (let index = 0; index < mesh.points.length; index += 1) {
        const point = mesh.points[index];
        if (isReduced) {
          animatedX[index] = point.x;
          animatedY[index] = point.y;
          continue;
        }

        const px = pointer.current.x * 11 * (1 - point.y / VIEW_H);
        const py = pointer.current.y * 8;
        animatedX[index] = point.x
          + Math.sin(time * 0.22 * settings.morphSpeed + point.phaseX) * point.ampX * settings.morphStrength
          + px;
        animatedY[index] = point.y
          + Math.cos(time * 0.18 * settings.morphSpeed + point.phaseY) * point.ampY * settings.morphStrength
          + py;
      }

      const glowStrengthNow = settings.glowStrength;
      if (lastGlowApplied.current !== glowStrengthNow) {
        lastGlowApplied.current = glowStrengthNow;
        if (glowGroupRef.current) {
          glowGroupRef.current.setAttribute('opacity', String(glowStrengthNow > 0 ? 0.28 + glowStrengthNow * 0.72 : 0));
        }
        if (glowBlurRef.current) {
          glowBlurRef.current.setAttribute('stdDeviation', String(1.2 + glowStrengthNow * 2.6));
        }
      }

      const pDarkA = currentPalette.darkA;
      const pDarkB = currentPalette.darkB;
      const pAccentA = currentPalette.accentA;
      const pAccentB = currentPalette.accentB;
      const pAccentHot = currentPalette.accentHot;

      // Low Poly glow follows the brightest color in the active palette instead of
      // using SwingSphere red. This keeps hero-derived palettes visually coherent.
      let glowRgb = pDarkA;
      let glowLuminance = luminance(glowRgb);
      for (const candidate of [pDarkB, pAccentA, pAccentB, pAccentHot]) {
        const candidateLuminance = luminance(candidate);
        if (candidateLuminance > glowLuminance) {
          glowRgb = candidate;
          glowLuminance = candidateLuminance;
        }
      }

      for (let index = 0; index < mesh.triangles.length; index += 1) {
        const triangle = mesh.triangles[index];
        const ax = animatedX[triangle.a];
        const ay = animatedY[triangle.a];
        const bx = animatedX[triangle.b];
        const by = animatedY[triangle.b];
        const cx = animatedX[triangle.c];
        const cy = animatedY[triangle.c];
        // 1-decimal formatting reduces coordinate string size by >50% and avoids GC string churn
        const points = `${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;

        const avgY = (ay + by + cy) / 3 / VIEW_H;

        // Full-height palette progression. The old renderer kept the upper field in
        // a dark-only branch and activated color mostly in the lower field, which
        // read as two stacked halves on tall screens. A warped smooth ramp keeps
        // the whole mesh participating in one continuous gradient.
        const verticalRamp = smoothstep(0.02, 0.98, avgY);
        const rampWarp =
          (triangle.tone - 0.5) * 0.12
          + Math.sin(triangle.phase + avgY * 7) * 0.035;
        const gradientPosition = clamp(verticalRamp + rampWarp);

        const breathing = isReduced
          ? 0.45
          : 0.5 + 0.5 * Math.sin(time * 0.24 * settings.colorSpeed + triangle.phase);
        const activation = clamp(
          0.16
            + triangle.tone * 0.16
            + breathing * settings.colorStrength * (0.28 + triangle.tone * 0.42),
        );

        // Zero-allocation scalar RGB blending for the dark and accent ends of the ramp.
        const darkT = clamp(0.10 + triangle.tone * 0.48 + activation * 0.14);
        const darkR = Math.round(pDarkA[0] + (pDarkB[0] - pDarkA[0]) * darkT);
        const darkG = Math.round(pDarkA[1] + (pDarkB[1] - pDarkA[1]) * darkT);
        const darkB = Math.round(pDarkA[2] + (pDarkB[2] - pDarkA[2]) * darkT);

        const accentT = clamp(0.10 + triangle.tone * 0.34 + activation * 0.34);
        const accentR = Math.round(pAccentA[0] + (pAccentB[0] - pAccentA[0]) * accentT);
        const accentG = Math.round(pAccentA[1] + (pAccentB[1] - pAccentA[1]) * accentT);
        const accentB = Math.round(pAccentA[2] + (pAccentB[2] - pAccentA[2]) * accentT);

        const gradientMix = smoothstep(0.14, 0.90, gradientPosition);

        let baseR = Math.round(darkR + (accentR - darkR) * gradientMix);
        let baseG = Math.round(darkG + (accentG - darkG) * gradientMix);
        let baseB = Math.round(darkB + (accentB - darkB) * gradientMix);

        // Keep the hottest palette color sparse and late in the ramp so it reads as
        // a highlight rather than a separate bottom section.
        const hotMix =
          smoothstep(0.80, 1.00, gradientPosition)
          * smoothstep(0.62, 1.00, triangle.tone)
          * (0.35 + activation * 0.65);

        if (hotMix > 0) {
          const hotAmount = clamp(hotMix * 0.55);
          baseR = Math.round(baseR + (pAccentHot[0] - baseR) * hotAmount);
          baseG = Math.round(baseG + (pAccentHot[1] - baseG) * hotAmount);
          baseB = Math.round(baseB + (pAccentHot[2] - baseB) * hotAmount);
        }

        const flickerAmount = getPanelFlickerAmount(time, triangle, settings.panelFlicker, isReduced);
        let finalR = baseR;
        let finalG = baseG;
        let finalB = baseB;
        if (flickerAmount > 0) {
          const fInv = 1 - flickerAmount;
          finalR = Math.round(baseR * fInv);
          finalG = Math.round(baseG * fInv);
          finalB = Math.round(baseB * fInv);
        }
        const fillAlpha = Math.max(0.02, 0.97 - flickerAmount * 0.96);
        const edgeAlpha = settings.lineStrength
          * (0.18 + activation * 0.82)
          * (0.52 + gradientMix * 0.48)
          * (1 - flickerAmount * 0.98);

        const face = faceRefs.current[index];
        if (face) {
          face.setAttribute('points', points);
          face.setAttribute('fill', `rgba(${finalR},${finalG},${finalB},${fillAlpha.toFixed(2)})`);
          const edgeTint = 0.28 + gradientMix * 0.72;
          face.setAttribute(
            'stroke',
            settings.lineStrength <= 0
              ? 'none'
              : rgba(glowRgb, Number((edgeAlpha * edgeTint).toFixed(2))),
          );
        }

        // Only update glow attributes when glow is visibly active on tablet/desktop
        if (glowStrengthNow > 0 && !isMobileRef.current) {
          const glow = glowRefs.current[index];
          if (glow) {
            const glowGradient = smoothstep(0.08, 0.96, gradientPosition);
            const pulse = isReduced
              ? 0.45
              : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 0.19 * settings.colorSpeed + triangle.phase));
            const glowAlpha = glowStrengthNow
              * (0.05 + glowGradient * 0.24)
              * (0.45 + pulse * 0.55)
              * (1 - flickerAmount * 0.99);

            glow.setAttribute('points', points);
            glow.setAttribute(
              'stroke',
              rgba(glowRgb, Number((glowAlpha * (0.28 + glowGradient * 0.72)).toFixed(2))),
            );
            glow.setAttribute('stroke-width', (1.2 + glowStrengthNow * 1.8).toFixed(1));
          }
        }
      }
    };

    renderFrameRef.current = renderFrame;
    renderFrame(0);

    let frame = 0;
    let last = 0;
    const animate = (now: number) => {
      const isInteracting = isGestureActiveRef.current || now < pauseUntilRef.current;
      if (!document.hidden && visible.current && !reducedMotion.current && !isInteracting) {
        const targetFrameMs = isMobileRef.current ? 50 : FRAME_MS;
        if (now - last >= targetFrameMs) {
          renderFrame(now / 1000);
          last = now;
        }
        frame = requestAnimationFrame(animate);
      } else if (!reducedMotion.current) {
        // Sleep idle check when hidden, off-screen, or during active user touch/scroll gesture
        frame = requestAnimationFrame(() => {
          setTimeout(() => {
            frame = requestAnimationFrame(animate);
          }, isInteracting ? 120 : 200);
        });
      }
    };

    if (!reducedMotion.current) {
      frame = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(frame);
      renderFrameRef.current = null;
    };
  }, [mesh]);

  useEffect(() => {
    if (reducedMotion.current) renderFrameRef.current?.(0);
  }, [morphStrength, morphSpeed, colorSpeed, colorStrength, panelFlicker, lineStrength, glowStrength, paletteDarkA, paletteDarkB, paletteAccentA, paletteAccentB, paletteAccentHot]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#030405] ${className}`}
      aria-hidden="true"
      style={{ opacity, filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined }}
    >
      <svg className="h-full w-full" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="living-low-poly-floor-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="58%" stopColor="rgba(255,255,255,0.008)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.035)" />
          </linearGradient>
          <radialGradient id="living-low-poly-vignette" cx="50%" cy="45%" r="72%">
            <stop offset="35%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.42)" />
          </radialGradient>
          {!isMobileViewport ? (
            <filter id="living-low-poly-line-glow" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
              <feGaussianBlur ref={glowBlurRef} stdDeviation={1.2 + glowStrength * 2.6} />
            </filter>
          ) : null}
        </defs>

        <rect width={VIEW_W} height={VIEW_H} fill="#030405" />

        {mesh.triangles.map((triangle, index) => (
          <polygon
            key={`face-${index}`}
            ref={(element) => { faceRefs.current[index] = element; }}
            points={basePointsForTriangle(triangle, mesh.points)}
            fill="#111216"
            stroke="none"
            strokeWidth={0.7}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {!isMobileViewport ? (
          <g
            ref={glowGroupRef}
            filter="url(#living-low-poly-line-glow)"
            opacity={glowStrength > 0 ? 0.28 + glowStrength * 0.72 : 0}
          >
            {mesh.triangles.map((triangle, index) => (
              <polygon
                key={`line-glow-${index}`}
                ref={(element) => { glowRefs.current[index] = element; }}
                points={basePointsForTriangle(triangle, mesh.points)}
                fill="none"
                stroke="rgba(255, 39, 74, 0)"
                strokeWidth={1.2 + glowStrength * 1.8}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ) : null}

        <rect width={VIEW_W} height={VIEW_H} fill="url(#living-low-poly-floor-wash)" />
        <rect width={VIEW_W} height={VIEW_H} fill="url(#living-low-poly-vignette)" />
      </svg>
    </div>
  );
}
