import React, { useEffect, useRef } from 'react';
import type { LivingBackgroundPalette, SilkThemeSettings } from '../../../lib/livingBackgroundThemes';
import { updateWebGlDiagnostics, validateUniforms } from '../../../lib/livingBackgroundDiagnostics';

export type LivingSilkThemeProps = {
  opacity?: number;
  interactive?: boolean;
  className?: string;
  palette?: LivingBackgroundPalette;
  settings?: SilkThemeSettings;
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
uniform vec2 u_pointer;
uniform vec3 u_darkA;
uniform vec3 u_darkB;
uniform vec3 u_accentA;
uniform vec3 u_accentB;
uniform vec3 u_accentHot;

uniform float u_foldScale;
uniform float u_foldComplexity;
uniform float u_drapeDepth;
uniform float u_flowSpeed;
uniform float u_sheenStrength;
uniform float u_lightMovement;

// Smooth maximum: allows upper cloth folds to roll over and overlap lower folds naturally
float smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(a, b, h) + k * h * (1.0 - h);
}

// Asymmetric cloth fold cross section:
// Broad soft valley, rising shoulder, defined narrow crest, gentle tuck
float foldProfile(float u) {
  float s = sin(u + 0.45 * sin(u));
  return pow(0.5 + 0.5 * s, 2.6);
}

// Procedural multi-layered draped satin heightfield
float getClothHeight(vec2 st, float t, float scale, float complexity, float speed, float depth) {
  float s = scale * 1.8;
  float sp = speed * 0.32;

  // 1. Broad nonlinear domain warp for sweeping organic S-curves across viewport
  vec2 w1 = vec2(
    sin(st.y * 1.1 + st.x * 0.35 + t * (sp * 0.35)) * 0.42,
    cos(st.x * 0.95 - st.y * 0.40 + t * (sp * 0.30)) * 0.38
  );
  vec2 q = st + w1;

  // 2. Secondary tension warp for nuanced cloth drift
  vec2 w2 = vec2(
    sin(q.y * 2.2 - q.x * 0.8 + t * (sp * 0.45)) * 0.18 * complexity,
    cos(q.x * 1.8 + q.y * 1.2 - t * (sp * 0.40)) * 0.16 * complexity
  );
  vec2 p = q + w2;

  // Fold Stream 1: Primary sweeping diagonal drape (~32 deg)
  float d1 = p.x * 0.85 - p.y * 0.52;
  float f1 = foldProfile(d1 * s * 2.4 + t * (sp * 0.65));

  // Fold Stream 2: S-curved counter-drape (~ -28 deg)
  float d2 = p.x * 0.48 + p.y * 0.88;
  float f2 = foldProfile(d2 * s * 2.1 - t * (sp * 0.55) + 1.2);

  // Fold Stream 3: Transverse meandering fold
  float d3 = p.x * 0.72 + p.y * 0.32;
  float f3 = foldProfile(d3 * s * 3.1 + t * (sp * 0.42) + 2.5) * 0.85;

  // Fold Stream 4: Secondary soft tuck (interwoven drape)
  float d4 = -p.x * 0.35 + p.y * 0.94;
  float f4 = foldProfile(d4 * s * 2.8 - t * (sp * 0.58) + 3.8) * 0.75 * complexity;

  // Layer folds using smooth maximum: higher folds smoothly roll over lower folds
  float cloth = smax(f1, f2 * 0.92, 0.22);
  cloth = smax(cloth, f3 * 0.85, 0.20);
  cloth = smax(cloth, f4 * 0.78, 0.18);

  // Ultra-low frequency billowing layer underneath (large-scale lift & settle)
  float billow = (sin(st.x * 0.65 + t * (sp * 0.25)) * cos(st.y * 0.55 - t * (sp * 0.20))) * 0.20;

  return (cloth + billow) * depth;
}

void main() {
  // Aspect-corrected UV space centered at origin: preserves cloth drape across desktop, tablet, mobile
  vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time;
  float scale = u_foldScale;
  float complexity = u_foldComplexity;
  float depth = u_drapeDepth;
  float speed = u_flowSpeed;

  // Exact finite difference derivatives divided by delta to get true surface gradient
  vec2 eps = vec2(0.004, 0.0);
  float hCenter = getClothHeight(st, t, scale, complexity, speed, depth);
  float hL = getClothHeight(st - eps.xy, t, scale, complexity, speed, depth);
  float hR = getClothHeight(st + eps.xy, t, scale, complexity, speed, depth);
  float hD = getClothHeight(st - eps.yx, t, scale, complexity, speed, depth);
  float hU = getClothHeight(st + eps.yx, t, scale, complexity, speed, depth);

  float dhdx = (hR - hL) / (2.0 * eps.x);
  float dhdy = (hU - hD) / (2.0 * eps.x);

  // Surface normal vector tilting along the fold contours
  vec3 normal = normalize(vec3(-dhdx * 0.48, -dhdy * 0.48, 1.0));

  // Moving soft studio key light drifting on a gentle orbit
  float lightT = t * (u_lightMovement * 0.14);
  vec3 keyLight = normalize(vec3(
    -0.42 + 0.28 * sin(lightT + u_pointer.x * 1.2),
     0.60 + 0.22 * cos(lightT * 0.85 + u_pointer.y * 1.2),
     0.75
  ));

  // Directional diffuse on cloth folds
  float nDotL = max(0.0, dot(normal, keyLight));
  float diffuse = pow(nDotL, 1.35);

  // 2D Tangent vector running parallel to the fold ridge (perpendicular to surface gradient)
  vec2 foldDir = normalize(vec2(-dhdy, dhdx) + vec2(0.0001));
  vec3 tangent = vec3(foldDir, 0.0);

  // Half-vector for anisotropic specular
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(keyLight + viewDir);

  // Anisotropic highlight along fibers running across fold crests
  float tDotH = abs(dot(tangent, halfVec));
  float sinTH = sqrt(max(0.0, 1.0 - tDotH * tDotH));

  // Crest mask: highlights belong along crest ridges, suppressed in valleys
  float crestMask = smoothstep(0.02, 0.42, hCenter);

  // Specular sheen ribbon running continuously along the fold spine
  float sheenRibbon = pow(sinTH, 28.0) * (u_sheenStrength * 1.25);
  float sheenSoft = pow(sinTH, 8.0) * (u_sheenStrength * 0.35);
  float totalSheen = (sheenRibbon + sheenSoft) * diffuse * crestMask;

  // Ambient occlusion in deep cloth troughs
  float ao = smoothstep(-0.25, 0.45, hCenter);

  // Dark-calibrated palette mapping:
  // 1. Valleys: deep graphite obsidian, deepened by ambient occlusion
  float vMix = clamp(hCenter * 0.5 + 0.5, 0.0, 1.0);
  vec3 valleyColor = mix(u_darkA, u_darkB, vMix) * (0.28 + 0.72 * ao);

  // 2. Midtone slopes: subtle accentA wash
  vec3 slopeColor = mix(valleyColor, u_accentA, diffuse * 0.40);

  // 3. Fold crests: rich accentB on well-lit upper ridges
  vec3 crestColor = mix(slopeColor, u_accentB, diffuse * 0.75 * crestMask);

  // 4. Specular ribbons: accentHot blended with soft satin silver highlight
  vec3 sheenTint = mix(u_accentHot, vec3(0.92, 0.94, 0.98), 0.32);
  vec3 color = crestColor + sheenTint * totalSheen * 0.90;

  // Vignette to frame center interface
  float vignette = 1.0 - 0.26 * length(st);
  color *= max(0.0, vignette);

  // Clamp luminance proportionally so high-signal crimson keeps its rich ruby saturation without flat clipping
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float maxLum = 0.32;
  if (lum > maxLum) {
    color *= (maxLum / lum);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function LivingSilkTheme({
  opacity = 1,
  interactive = true,
  className = '',
  palette,
  settings,
}: LivingSilkThemeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number>(0);
  const isVisible = useRef(true);
  const isReducedMotion = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const foldScale = (settings?.foldScale ?? 100) / 100;
  const foldComplexity = (settings?.foldComplexity ?? 100) / 100;
  const drapeDepth = (settings?.drapeDepth ?? 100) / 100;
  const flowSpeed = (settings?.flowSpeed ?? 65) / 100;
  const sheenStrength = (settings?.sheenStrength ?? 95) / 100;
  const lightMovement = (settings?.lightMovement ?? 70) / 100;

  const currentSettings = useRef({
    foldScale,
    foldComplexity,
    drapeDepth,
    flowSpeed,
    sheenStrength,
    lightMovement,
    interactive,
  });
  currentSettings.current = {
    foldScale,
    foldComplexity,
    drapeDepth,
    flowSpeed,
    sheenStrength,
    lightMovement,
    interactive,
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

    const observer = new IntersectionObserver(([entry]) => {
      isVisible.current = entry.isIntersecting;
    }, { threshold: 0.01 });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!currentSettings.current.interactive || isReducedMotion.current) return;
      pointerRef.current.tx = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 1.5;
      pointerRef.current.ty = (e.clientY / Math.max(window.innerHeight, 1) - 0.5) * 1.5;
    };
    const handlePointerLeave = () => {
      pointerRef.current.tx = 0;
      pointerRef.current.ty = 0;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', handlePointerLeave);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('mouseleave', handlePointerLeave);
    };
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

    // Quad geometry (2 triangles covering NDC)
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

    // Uniform locations
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uPointer = gl.getUniformLocation(program, 'u_pointer');
    const uDarkA = gl.getUniformLocation(program, 'u_darkA');
    const uDarkB = gl.getUniformLocation(program, 'u_darkB');
    const uAccentA = gl.getUniformLocation(program, 'u_accentA');
    const uAccentB = gl.getUniformLocation(program, 'u_accentB');
    const uAccentHot = gl.getUniformLocation(program, 'u_accentHot');
    const uFoldScale = gl.getUniformLocation(program, 'u_foldScale');
    const uFoldComplexity = gl.getUniformLocation(program, 'u_foldComplexity');
    const uDrapeDepth = gl.getUniformLocation(program, 'u_drapeDepth');
    const uFlowSpeed = gl.getUniformLocation(program, 'u_flowSpeed');
    const uSheenStrength = gl.getUniformLocation(program, 'u_sheenStrength');
    const uLightMovement = gl.getUniformLocation(program, 'u_lightMovement');

    // Downscaled resolution scaler: 0.75x DPR preserves silky smooth gradients while saving 45% GPU pixel fill
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        render(performance.now());
      }
    };

    const toVec3 = (rgb?: readonly [number, number, number], fallback = [0, 0, 0]): [number, number, number] => {
      const val = rgb ?? fallback;
      return [val[0] / 255, val[1] / 255, val[2] / 255];
    };

    let lastTime = 0;
    const targetFps = 24;
    const frameInterval = 1000 / targetFps;

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

      const { valid, invalidList } = validateUniforms('silk', {
        uResW: canvas.width,
        uResH: canvas.height,
        uTime: curTime,
        pointerX: pointerRef.current.x,
        pointerY: pointerRef.current.y,
        darkA,
        darkB,
        accentA,
        accentB,
        accentHot,
        foldScale: s.foldScale,
        foldComplexity: s.foldComplexity,
        drapeDepth: s.drapeDepth,
        flowSpeed: s.flowSpeed,
        sheenStrength: s.sheenStrength,
        lightMovement: s.lightMovement,
      });

      gl.useProgram(program);

      // Smooth pointer lerp
      pointerRef.current.x += (pointerRef.current.tx - pointerRef.current.x) * 0.05;
      pointerRef.current.y += (pointerRef.current.ty - pointerRef.current.y) * 0.05;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, curTime);
      gl.uniform2f(uPointer, pointerRef.current.x, pointerRef.current.y);

      gl.uniform3f(uDarkA, darkA[0], darkA[1], darkA[2]);
      gl.uniform3f(uDarkB, darkB[0], darkB[1], darkB[2]);
      gl.uniform3f(uAccentA, accentA[0], accentA[1], accentA[2]);
      gl.uniform3f(uAccentB, accentB[0], accentB[1], accentB[2]);
      gl.uniform3f(uAccentHot, accentHot[0], accentHot[1], accentHot[2]);

      gl.uniform1f(uFoldScale, s.foldScale);
      gl.uniform1f(uFoldComplexity, s.foldComplexity);
      gl.uniform1f(uDrapeDepth, s.drapeDepth);
      gl.uniform1f(uFlowSpeed, s.flowSpeed);
      gl.uniform1f(uSheenStrength, s.sheenStrength);
      gl.uniform1f(uLightMovement, s.lightMovement);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      updateWebGlDiagnostics({
        themeName: 'Flowing Silk',
        compileSuccess: true,
        linkSuccess: true,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        containerWidth: container.clientWidth,
        containerHeight: container.clientHeight,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5) * 0.75,
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
          foldScale: s.foldScale,
          foldComplexity: s.foldComplexity,
          drapeDepth: s.drapeDepth,
          flowSpeed: s.flowSpeed,
          sheenStrength: s.sheenStrength,
          lightMovement: s.lightMovement,
        },
        uniformsValid: valid,
        invalidUniforms: invalidList,
        lastRenderTimestamp: Date.now(),
      });
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    // Draw initial frame
    render(0);

    const loop = (now: number) => {
      if (!isReducedMotion.current && isVisible.current && !document.hidden) {
        if (now - lastTime >= frameInterval) {
          render(now);
          lastTime = now;
        }
        animFrameRef.current = requestAnimationFrame(loop);
      } else if (!isReducedMotion.current) {
        // Light sleep check when tab is inactive or element is off-screen
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
        // Do not force WEBGL_lose_context here. React.StrictMode intentionally
        // runs effect setup/cleanup twice in development, and losing the context
        // during the first cleanup leaves the same canvas with a dead WebGL context
        // on the second setup. Deleting our own GL resources is sufficient.
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#030405] ${className}`}
      aria-hidden="true"
      style={opacity !== undefined && opacity < 1 ? { opacity } : undefined}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
