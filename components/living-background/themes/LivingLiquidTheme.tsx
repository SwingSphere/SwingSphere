import React, { useEffect, useRef } from 'react';
import type { LiquidThemeSettings, LivingBackgroundPalette } from '../../../lib/livingBackgroundThemes';
import { updateWebGlDiagnostics, validateUniforms } from '../../../lib/livingBackgroundDiagnostics';

export type LivingLiquidThemeProps = {
  opacity?: number;
  interactive?: boolean;
  className?: string;
  palette?: LivingBackgroundPalette;
  settings?: LiquidThemeSettings;
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

uniform float u_flowSpeed;
uniform float u_turbulence;
uniform float u_diffusion;
uniform float u_contrast;

// Lightweight procedural hash & smooth noise
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 3-octave FBM for smooth viscous currents
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + vec2(0.15, 0.25);
    a *= 0.5;
  }
  return v;
}

void main() {
  // Aspect-corrected UV space
  vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * (u_flowSpeed * 0.18);
  float turb = u_turbulence * 1.8;
  float diff = u_diffusion * 1.1;

  // Domain warping for viscous fluid eddy currents
  // Layer 1: Base fluid velocity
  vec2 q = vec2(
    fbm(st * (diff * 1.5) + vec2(0.0, 0.0) + t * 0.25 + u_pointer * 0.2),
    fbm(st * (diff * 1.5) + vec2(5.2, 1.3) - t * 0.22 - u_pointer * 0.2)
  );

  // Layer 2: Swirling viscous vortex currents
  vec2 r = vec2(
    fbm(st * (diff * 1.8) + turb * q + vec2(1.7, 9.2) + t * 0.15),
    fbm(st * (diff * 1.8) + turb * q + vec2(8.3, 2.8) - t * 0.18)
  );

  // Layer 3: Diffusing pigment concentration
  float f = fbm(st * (diff * 2.2) + turb * r + t * 0.08);

  // Shape contrast: deep blacks in carrier fluid, concentrated pigment in stream veins
  float pigment = pow(smoothstep(0.42, 0.78, f), u_contrast * 1.2);
  float corePigment = pow(smoothstep(0.62, 0.88, f), 2.0);

  // Surface normal of the glossy fluid surface
  vec3 normal = normalize(vec3((r.x - 0.5) * 1.5, (r.y - 0.5) * 1.5, 0.7));
  vec3 keyLight = normalize(vec3(-0.3, 0.6, 0.8));
  float fluidSheen = pow(max(0.0, dot(normal, keyLight)), 24.0) * 0.14 * pigment;

  // Color mapping from hero palette:
  // Base carrier fluid: pure graphite / obsidian fluid
  vec3 fluidBg = mix(u_darkA, u_darkB, clamp(q.x * 0.35, 0.0, 0.3));

  // Dilute pigment wisps
  vec3 diluteTone = mix(fluidBg, u_accentA, pigment * 0.55);

  // Concentrated pigment currents
  vec3 richTone = mix(diluteTone, u_accentB, pigment * 0.75);

  // Dense pigment core
  vec3 finalColor = mix(richTone, u_accentHot, corePigment * 0.65);

  // Glossy dark fluid reflection masked by pigment
  finalColor += vec3(fluidSheen);

  // Vignette
  float vignette = 1.0 - 0.28 * length(st);
  finalColor *= max(0.0, vignette);

  // Clamp luminance proportionally so viscous pigment currents preserve saturation
  float lum = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
  float maxLum = 0.28;
  if (lum > maxLum) {
    finalColor *= (maxLum / lum);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export default function LivingLiquidTheme({
  opacity = 1,
  interactive = true,
  className = '',
  palette,
  settings,
}: LivingLiquidThemeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number>(0);
  const isVisible = useRef(true);
  const isReducedMotion = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const flowSpeed = (settings?.flowSpeed ?? 65) / 100;
  const turbulence = (settings?.turbulence ?? 90) / 100;
  const diffusion = (settings?.diffusion ?? 105) / 100;
  const contrast = (settings?.contrast ?? 100) / 100;

  const currentSettings = useRef({
    flowSpeed,
    turbulence,
    diffusion,
    contrast,
    interactive,
  });
  currentSettings.current = {
    flowSpeed,
    turbulence,
    diffusion,
    contrast,
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
      pointerRef.current.tx = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 1.2;
      pointerRef.current.ty = (e.clientY / Math.max(window.innerHeight, 1) - 0.5) * 1.2;
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
    const uPointer = gl.getUniformLocation(program, 'u_pointer');
    const uDarkA = gl.getUniformLocation(program, 'u_darkA');
    const uDarkB = gl.getUniformLocation(program, 'u_darkB');
    const uAccentA = gl.getUniformLocation(program, 'u_accentA');
    const uAccentB = gl.getUniformLocation(program, 'u_accentB');
    const uAccentHot = gl.getUniformLocation(program, 'u_accentHot');
    const uFlowSpeed = gl.getUniformLocation(program, 'u_flowSpeed');
    const uTurbulence = gl.getUniformLocation(program, 'u_turbulence');
    const uDiffusion = gl.getUniformLocation(program, 'u_diffusion');
    const uContrast = gl.getUniformLocation(program, 'u_contrast');

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

      const { valid, invalidList } = validateUniforms('liquid', {
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
        flowSpeed: s.flowSpeed,
        turbulence: s.turbulence,
        diffusion: s.diffusion,
        contrast: s.contrast,
      });

      gl.useProgram(program);

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

      gl.uniform1f(uFlowSpeed, s.flowSpeed);
      gl.uniform1f(uTurbulence, s.turbulence);
      gl.uniform1f(uDiffusion, s.diffusion);
      gl.uniform1f(uContrast, s.contrast);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      updateWebGlDiagnostics({
        themeName: 'Liquid / Ink',
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
          flowSpeed: s.flowSpeed,
          turbulence: s.turbulence,
          diffusion: s.diffusion,
          contrast: s.contrast,
        },
        uniformsValid: valid,
        invalidUniforms: invalidList,
        lastRenderTimestamp: Date.now(),
      });
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
      style={{ opacity }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
