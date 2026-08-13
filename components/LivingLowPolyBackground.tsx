import React, { useEffect, useMemo, useRef } from 'react';

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
}: LivingLowPolyBackgroundProps) {
  const mesh = useMemo(() => buildMesh(density), [density]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const faceRefs = useRef<Array<SVGPolygonElement | null>>([]);
  const glowRefs = useRef<Array<SVGPolygonElement | null>>([]);
  const glowGroupRef = useRef<SVGGElement | null>(null);
  const glowBlurRef = useRef<SVGFEGaussianBlurElement | null>(null);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const reducedMotion = useRef(false);
  const visible = useRef(true);
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
    const handlePointerMove = (event: PointerEvent) => {
      if (!settingsRef.current.interactive || reducedMotion.current) return;
      pointer.current.tx = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
      pointer.current.ty = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
    };
    const handlePointerLeave = () => {
      pointer.current.tx = 0;
      pointer.current.ty = 0;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', handlePointerLeave);
    return () => {
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
      if (glowGroupRef.current) {
        glowGroupRef.current.setAttribute('opacity', String(glowStrengthNow > 0 ? 0.28 + glowStrengthNow * 0.72 : 0));
      }
      if (glowBlurRef.current) {
        glowBlurRef.current.setAttribute('stdDeviation', String(1.2 + glowStrengthNow * 2.6));
      }

      for (let index = 0; index < mesh.triangles.length; index += 1) {
        const triangle = mesh.triangles[index];
        const ax = animatedX[triangle.a];
        const ay = animatedY[triangle.a];
        const bx = animatedX[triangle.b];
        const by = animatedY[triangle.b];
        const cx = animatedX[triangle.c];
        const cy = animatedY[triangle.c];
        const points = `${ax},${ay} ${bx},${by} ${cx},${cy}`;

        const avgY = (ay + by + cy) / 3 / VIEW_H;
        const redZone = clamp((avgY - 0.34) / 0.66);
        const breathing = isReduced
          ? 0.45
          : 0.5 + 0.5 * Math.sin(time * 0.24 * settings.colorSpeed + triangle.phase);
        const activation = clamp(
          0.16
            + triangle.tone * 0.16
            + breathing * settings.colorStrength * (0.28 + triangle.tone * 0.42),
        );

        const darkRgb = mixRgb(DARK_A, DARK_B, 0.13 + triangle.tone * 0.52 + activation * 0.12);
        const redRgb = mixRgb(RED_A, RED_B, 0.12 + triangle.tone * 0.42 + activation * 0.42);
        const hotRgb = mixRgb(RED_B, RED_HOT, activation * 0.48);
        const baseRgb = redZone < 0.18
          ? darkRgb
          : redZone > 0.72 && triangle.tone > 0.72
            ? hotRgb
            : mixRgb(darkRgb, redRgb, redZone);
        const flickerAmount = getPanelFlickerAmount(time, triangle, settings.panelFlicker, isReduced);
        const fillRgb = flickerAmount > 0 ? mixRgb(baseRgb, BLACK, flickerAmount) : baseRgb;
        const fillAlpha = Math.max(0.02, 0.97 - flickerAmount * 0.96);
        const edgeAlpha = settings.lineStrength
          * (0.18 + activation * 0.82)
          * (0.58 + redZone * 0.42)
          * (1 - flickerAmount * 0.98);

        const face = faceRefs.current[index];
        if (face) {
          face.setAttribute('points', points);
          face.setAttribute('fill', rgba(fillRgb, fillAlpha));
          face.setAttribute(
            'stroke',
            settings.lineStrength <= 0
              ? 'none'
              : redZone > 0.35
                ? `rgba(238, 35, 67, ${edgeAlpha})`
                : `rgba(191, 198, 208, ${edgeAlpha * 0.34})`,
          );
        }

        const glow = glowRefs.current[index];
        if (glow) {
          const glowRedZone = clamp((avgY - 0.30) / 0.70);
          const pulse = isReduced
            ? 0.45
            : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 0.19 * settings.colorSpeed + triangle.phase));
          const glowAlpha = glowStrengthNow
            * (0.08 + glowRedZone * 0.42)
            * (0.45 + pulse * 0.55)
            * (1 - flickerAmount * 0.99);

          glow.setAttribute('points', points);
          glow.setAttribute(
            'stroke',
            glowRedZone > 0.28
              ? `rgba(255, 39, 74, ${glowAlpha})`
              : `rgba(178, 188, 204, ${glowAlpha * 0.18})`,
          );
          glow.setAttribute('stroke-width', String(1.2 + glowStrengthNow * 1.8));
        }
      }
    };

    renderFrameRef.current = renderFrame;
    renderFrame(0);

    let frame = 0;
    let last = 0;
    const animate = (now: number) => {
      if (!document.hidden && visible.current && !reducedMotion.current && now - last >= FRAME_MS) {
        renderFrame(now / 1000);
        last = now;
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      renderFrameRef.current = null;
    };
  }, [mesh]);

  useEffect(() => {
    if (reducedMotion.current) renderFrameRef.current?.(0);
  }, [morphStrength, morphSpeed, colorSpeed, colorStrength, panelFlicker, lineStrength, glowStrength]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#030405] ${className}`}
      aria-hidden="true"
      style={{ opacity, filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined }}
    >
      <svg className="h-full w-full" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="living-low-poly-red-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(70,0,12,0)" />
            <stop offset="58%" stopColor="rgba(85,2,16,0.04)" />
            <stop offset="100%" stopColor="rgba(178,8,31,0.18)" />
          </linearGradient>
          <radialGradient id="living-low-poly-vignette" cx="50%" cy="45%" r="72%">
            <stop offset="35%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.42)" />
          </radialGradient>
          <filter id="living-low-poly-line-glow" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur ref={glowBlurRef} stdDeviation={1.2 + glowStrength * 2.6} />
          </filter>
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

        <rect width={VIEW_W} height={VIEW_H} fill="url(#living-low-poly-red-floor)" />
        <rect width={VIEW_W} height={VIEW_H} fill="url(#living-low-poly-vignette)" />
      </svg>
    </div>
  );
}
