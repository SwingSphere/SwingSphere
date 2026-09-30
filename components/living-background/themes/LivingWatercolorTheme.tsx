import React, { useEffect, useRef } from 'react';
import type {
  LivingBackgroundPalette,
  LivingBackgroundPerformanceMode,
  WatercolorThemeSettings,
} from '../../../lib/livingBackgroundThemes';
import { updateWebGlDiagnostics, validateUniforms } from '../../../lib/livingBackgroundDiagnostics';

export type LivingWatercolorThemeProps = {
  opacity?: number;
  interactive?: boolean;
  className?: string;
  palette?: LivingBackgroundPalette;
  settings?: WatercolorThemeSettings;
  performanceMode?: LivingBackgroundPerformanceMode;
};

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_darkA;
uniform vec3 u_darkB;
uniform vec3 u_accentA;
uniform vec3 u_accentB;
uniform vec3 u_accentHot;

uniform float u_washScale;
uniform float u_bloomStrength;
uniform float u_diffusion;
uniform float u_edgeContrast;
uniform float u_paperTooth;
uniform float u_motionSpeed;

// High quality 2D hash for watercolor paper tooth
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Smooth value noise
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal Brownian Motion for organic pigment bleeding
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.05 + vec2(0.12, 0.35);
    a *= 0.5;
  }
  return v;
}

// Organic pigment drying edge contour ("coffee-ring" effect)
// Creates the characteristic dark, dense line right at the perimeter of a puddle
float dryingEdge(float field, float threshold, float width) {
  float dist = abs(field - threshold);
  return exp(- (dist * dist) / (2.0 * width * width));
}

void main() {
  // Aspect-corrected UV space centered at origin
  vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  // Keep the wash visibly alive even at restrained settings. The old
  // multiplier made autonomous evolution so slow that pointer movement dominated.
  float t = u_time * (0.08 + u_motionSpeed * 0.22);
  float scale = u_washScale * 1.15;
  float diff = u_diffusion * 1.1;

  // 1. Broad cold-press paper variation. Keep this in normalized scene
  // space rather than gl_FragCoord so it reads as soft material texture instead
  // of pixel-scale sandpaper, especially on portrait/mobile previews.
  float paperNoise1 = vnoise(st * 7.0 + vec2(2.3, 5.1));
  float paperNoise2 = vnoise(st * 14.0 + vec2(7.7, 1.9));
  float paperGrain = (paperNoise1 * 0.72 + paperNoise2 * 0.28 - 0.5) * (u_paperTooth * 0.055);

  // 2. Slow autonomous domain warp simulating wet pigment flow.
  // Watercolor intentionally ignores pointer input: it should evolve on its own
  // rather than feel like an interactive liquid surface.
  vec2 driftA = vec2(
    sin(t * 0.19) * 0.34 + cos(t * 0.07) * 0.17,
    cos(t * 0.16) * 0.28 + sin(t * 0.09) * 0.14
  );
  vec2 driftB = vec2(
    cos(t * 0.13 + 1.7) * 0.30,
    sin(t * 0.11 + 0.8) * 0.26
  );

  vec2 warp1 = vec2(
    fbm(st * (scale * 0.78) + vec2(0.0, 0.0) + driftA),
    fbm(st * (scale * 0.78) + vec2(4.2, 1.7) - driftB)
  );
  vec2 p = st + (warp1 - 0.5) * 0.60 * diff;

  vec2 warp2 = vec2(
    fbm(p * (scale * 1.15) + vec2(1.9, 8.4) + driftB * 0.72),
    fbm(p * (scale * 1.15) + vec2(7.3, 3.1) - driftA * 0.68)
  );
  vec2 q = p + (warp2 - 0.5) * 0.42;

  // 3. Wash Layer 1: Primary deep pool (main body wash)
  float w1 = fbm(q * scale * 1.35 + vec2(0.5, 0.2) + t * 0.08);
  float wash1 = smoothstep(0.28, 0.76, w1);
  float ring1 = dryingEdge(w1, 0.46, 0.035) * (u_edgeContrast * 1.35);

  // 4. Wash Layer 2: Secondary blooming pigment wash (partially overlapping)
  float w2 = fbm(q * scale * 1.65 + vec2(3.7, 5.2) - t * 0.10);
  float wash2 = smoothstep(0.32, 0.82, w2);
  float ring2 = dryingEdge(w2, 0.52, 0.040) * (u_edgeContrast * 1.25);

  // 5. Wash Layer 3: High-bleed accent wisp
  float w3 = fbm(q * scale * 2.1 + vec2(6.1, 2.8) + t * 0.12);
  float wash3 = smoothstep(0.40, 0.88, w3);
  float ring3 = dryingEdge(w3, 0.58, 0.030) * (u_edgeContrast * 1.15);

  // 6. Base paper backdrop: deep dark obsidian graphite with subtle tooth.
  // Deliberately no glitter/fleck pass here; the previous screen-space speckles
  // read as sand or metallic dust rather than watercolor.
  vec3 baseBackdrop = mix(u_darkA, u_darkB, clamp(0.12 + 0.3 * (st.y + 0.5), 0.0, 0.4));
  baseBackdrop += vec3(paperGrain * 0.08);

  // 8. Layered Watercolor Pigment Composition:
  // Base wash body
  vec3 color = baseBackdrop;

  // Layer 1: Muted wash base (accentA)
  vec3 washColor1 = mix(u_darkB, u_accentA, wash1 * (u_bloomStrength * 0.70));
  color = mix(color, washColor1, wash1 * 0.82);

  // Layer 2: Vibrant bloom wash (accentB)
  vec3 washColor2 = mix(u_accentA, u_accentB, wash2 * (u_bloomStrength * 0.85));
  color = mix(color, washColor2, wash2 * 0.78);

  // Layer 3: AccentHot luminous bloom
  color = mix(color, u_accentHot, wash3 * 0.48 * (u_bloomStrength * 0.65));

  // 9. Apply the dark drying contour lines (puddle tide lines where pigment concentrated)
  float totalRings = max(ring1, max(ring2, ring3));
  vec3 darkPigmentEdge = mix(u_darkA * 0.5, u_accentA * 0.4, 0.35);
  color = mix(color, darkPigmentEdge, clamp(totalRings * 0.72, 0.0, 0.85));

  // 10. Subtle paper absorption granulation in pooled areas.
  // Keep it restrained and broad so it behaves like paper fibers beneath pigment.
  color += vec3(paperGrain) * (0.06 + 0.16 * wash1);

  // 11. Soft vignette
  float vignette = 1.0 - 0.26 * length(st);
  color *= max(0.0, vignette);

  // 13. Proportional luminance clamping so text remains crisp while colors stay rich
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float maxLum = 0.36;
  if (lum > maxLum) {
    color *= (maxLum / lum);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function LivingWatercolorTheme({
  opacity = 1,
  interactive: _interactive = true,
  className = '',
  palette,
  settings,
  performanceMode = 'balanced',
}: LivingWatercolorThemeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number>(0);
  const isVisible = useRef(true);
  const isReducedMotion = useRef(false);
  const washScale = (settings?.washScale ?? 100) / 100;
  const bloomStrength = (settings?.bloomStrength ?? 100) / 100;
  const diffusion = (settings?.diffusion ?? 105) / 100;
  const edgeContrast = (settings?.edgeContrast ?? 110) / 100;
  const paperTooth = (settings?.paperTooth ?? 20) / 100;
  const motionSpeed = (settings?.motionSpeed ?? 40) / 100;

  const currentSettings = useRef({
    washScale,
    bloomStrength,
    diffusion,
    edgeContrast,
    paperTooth,
    motionSpeed,
  });
  currentSettings.current = {
    washScale,
    bloomStrength,
    diffusion,
    edgeContrast,
    paperTooth,
    motionSpeed,
  };

  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      isReducedMotion.current = media.matches;
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('IntersectionObserver' in window)) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible.current = entry.isIntersecting;
      },
      { threshold: 0.01 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });

    if (!gl) return undefined;
    glRef.current = gl;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return undefined;

    const program = gl.createProgram();
    if (!program) return undefined;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(program));
      return undefined;
    }
    programRef.current = program;
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uDarkA = gl.getUniformLocation(program, 'u_darkA');
    const uDarkB = gl.getUniformLocation(program, 'u_darkB');
    const uAccentA = gl.getUniformLocation(program, 'u_accentA');
    const uAccentB = gl.getUniformLocation(program, 'u_accentB');
    const uAccentHot = gl.getUniformLocation(program, 'u_accentHot');
    const uWashScale = gl.getUniformLocation(program, 'u_washScale');
    const uBloomStrength = gl.getUniformLocation(program, 'u_bloomStrength');
    const uDiffusion = gl.getUniformLocation(program, 'u_diffusion');
    const uEdgeContrast = gl.getUniformLocation(program, 'u_edgeContrast');
    const uPaperTooth = gl.getUniformLocation(program, 'u_paperTooth');
    const uMotionSpeed = gl.getUniformLocation(program, 'u_motionSpeed');

    const toVec3 = (rgb?: readonly [number, number, number], fallback = [0, 0, 0]): [number, number, number] => {
      const val = rgb ?? fallback;
      return [val[0] / 255, val[1] / 255, val[2] / 255];
    };

    let lastTime = 0;
    const targetFps = performanceMode === 'green' ? 18 : 24;
    const frameInterval = 1000 / targetFps;
    const getRenderDpr = () => performanceMode === 'green'
      ? Math.min(window.devicePixelRatio || 1, 1.25) * 0.7
      : Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;

    const render = (now: number) => {
      if (!gl || !programRef.current) return;

      const p = paletteRef.current;
      const darkA = toVec3(p?.darkA, [4, 5, 7]);
      const darkB = toVec3(p?.darkB, [43, 45, 50]);
      const accentA = toVec3(p?.accentA, [31, 3, 8]);
      const accentB = toVec3(p?.accentB, [130, 8, 24]);
      const accentHot = toVec3(p?.accentHot, [209, 20, 48]);

      const s = currentSettings.current;
      const curTime = isReducedMotion.current ? 0.0 : now * 0.001;

      const { valid, invalidList } = validateUniforms('watercolor', {
        uResW: canvas.width,
        uResH: canvas.height,
        uTime: curTime,
        darkA,
        darkB,
        accentA,
        accentB,
        accentHot,
        washScale: s.washScale,
        bloomStrength: s.bloomStrength,
        diffusion: s.diffusion,
        edgeContrast: s.edgeContrast,
        paperTooth: s.paperTooth,
        motionSpeed: s.motionSpeed,
      });

      gl.useProgram(program);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, curTime);

      gl.uniform3f(uDarkA, darkA[0], darkA[1], darkA[2]);
      gl.uniform3f(uDarkB, darkB[0], darkB[1], darkB[2]);
      gl.uniform3f(uAccentA, accentA[0], accentA[1], accentA[2]);
      gl.uniform3f(uAccentB, accentB[0], accentB[1], accentB[2]);
      gl.uniform3f(uAccentHot, accentHot[0], accentHot[1], accentHot[2]);

      gl.uniform1f(uWashScale, s.washScale);
      gl.uniform1f(uBloomStrength, s.bloomStrength);
      gl.uniform1f(uDiffusion, s.diffusion);
      gl.uniform1f(uEdgeContrast, s.edgeContrast);
      gl.uniform1f(uPaperTooth, s.paperTooth);
      gl.uniform1f(uMotionSpeed, s.motionSpeed);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      updateWebGlDiagnostics({
        themeName: 'Watercolor Ink',
        compileSuccess: true,
        linkSuccess: true,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        containerWidth: container.clientWidth,
        containerHeight: container.clientHeight,
        dpr: getRenderDpr(),
        uTime: curTime,
        fps: lastTime > 0 ? Math.round(1000 / Math.max(1, now - lastTime)) : targetFps,
        frameDeltaMs: lastTime > 0 ? Math.round((now - lastTime) * 10) / 10 : 0,
        renderLoopAlive: true,
        reducedMotion: isReducedMotion.current,
        isVisible: isVisible.current,
        paletteSwatches: {
          darkA: (p?.darkA ?? [4, 5, 7]) as [number, number, number],
          darkB: (p?.darkB ?? [43, 45, 50]) as [number, number, number],
          accentA: (p?.accentA ?? [31, 3, 8]) as [number, number, number],
          accentB: (p?.accentB ?? [130, 8, 24]) as [number, number, number],
          accentHot: (p?.accentHot ?? [209, 20, 48]) as [number, number, number],
        },
        settings: {
          washScale: s.washScale,
          bloomStrength: s.bloomStrength,
          diffusion: s.diffusion,
          edgeContrast: s.edgeContrast,
          paperTooth: s.paperTooth,
          motionSpeed: s.motionSpeed,
        },
        uniformsValid: valid,
        invalidUniforms: invalidList,
        lastRenderTimestamp: Date.now(),
      });
    };

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = getRenderDpr();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        render(performance.now());
      }
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    render(0);

    const loop = (now: number) => {
      if (!isReducedMotion.current && isVisible.current && !document.hidden) {
        if (now - lastTime >= frameInterval) {
          render(now);
          lastTime = now;
        }
        animFrameRef.current = requestAnimationFrame(loop);
      } else if (!isReducedMotion.current) {
        setTimeout(() => {
          animFrameRef.current = requestAnimationFrame(loop);
        }, 250);
      }
    };

    if (!isReducedMotion.current) {
      animFrameRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      if (gl) {
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
        if (program) gl.deleteProgram(program);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        // Do not force WEBGL_lose_context here for React.StrictMode safety
      }
    };
  }, [performanceMode]);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#030405] ${className}`}
      aria-hidden="true"
      style={{ opacity }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
