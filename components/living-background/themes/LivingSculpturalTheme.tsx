import React, { useEffect, useRef } from 'react';
import type { LivingBackgroundPalette, SculpturalThemeSettings } from '../../../lib/livingBackgroundThemes';
import { updateWebGlDiagnostics, validateUniforms } from '../../../lib/livingBackgroundDiagnostics';

export type LivingSculpturalThemeProps = {
  opacity?: number;
  interactive?: boolean;
  className?: string;
  palette?: LivingBackgroundPalette;
  settings?: SculpturalThemeSettings;
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

uniform float u_surfaceScale;
uniform float u_deformation;
uniform float u_movementSpeed;
uniform float u_lightIntensity;

// Smooth broad sculptural relief topology
float getSculpturalHeight(vec2 st, float t, float scale, float deform) {
  float s = scale * 1.8;

  // Harmonic 1: Broad rolling topographic crest
  float h1 = sin(st.x * s * 0.95 + t * 0.28) * cos(st.y * s * 0.75 - t * 0.22);

  // Harmonic 2: Diagonal sculptural sweep (tension ridge)
  float h2 = sin((st.x * 0.85 + st.y * 1.1) * s * 0.65 - t * 0.35) * 0.58;

  // Harmonic 3: Gentle secondary saddle
  float h3 = cos((st.x * 1.2 - st.y * 0.6) * s * 0.52 + t * 0.18) * 0.42;

  // Harmonic 4: Very slow broad swell
  float h4 = sin((st.x - st.y) * s * 0.3 + t * 0.12) * 0.35;

  return (h1 + h2 + h3 + h4) * deform * 0.38;
}

void main() {
  // Aspect-corrected UV space centered at origin
  vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * (u_movementSpeed * 0.22);
  float scale = u_surfaceScale;
  float deform = u_deformation * 1.2;

  // Compute surface height and exact finite difference derivatives
  vec2 eps = vec2(0.005, 0.0);
  float hCenter = getSculpturalHeight(st, t, scale, deform);
  float hL = getSculpturalHeight(st - eps.xy, t, scale, deform);
  float hR = getSculpturalHeight(st + eps.xy, t, scale, deform);
  float hD = getSculpturalHeight(st - eps.yx, t, scale, deform);
  float hU = getSculpturalHeight(st + eps.yx, t, scale, deform);

  float dhdx = (hR - hL) / (2.0 * eps.x);
  float dhdy = (hU - hD) / (2.0 * eps.x);
  vec3 normal = normalize(vec3(-dhdx * 0.4, -dhdy * 0.4, 1.0));

  // Moving soft architectural key light
  vec3 lightDir = normalize(vec3(
    -0.42 + 0.22 * sin(t * 0.16 + u_pointer.x * 1.2),
     0.58 + 0.18 * cos(t * 0.14 + u_pointer.y * 1.2),
     0.72
  ));

  // Directional matte diffuse
  float nDotL = max(0.0, dot(normal, lightDir));
  float diffuse = pow(nDotL, 1.6) * (u_lightIntensity * 0.85);

  // Subtle grazing rim light along sharp ridges
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float rim = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.2) * 0.35;

  // Ambient occlusion in the sculptural valleys
  float ao = smoothstep(-0.85, 0.65, hCenter);
  float valley = clamp(hCenter * 0.5 + 0.5, 0.0, 1.0);

  // Color mapping from hero palette:
  // Valleys: deep graphite / obsidian with dark ambient occlusion
  vec3 valleyColor = mix(u_darkA, u_darkB, valley * 0.6 + 0.1) * (0.35 + 0.65 * ao);

  // Mid-slopes: hero accentA tinting the satin stone
  vec3 midSlope = mix(valleyColor, u_accentA, diffuse * 0.45);

  // Lit sculptural crests: hero accentB and high-signal rim
  vec3 crestColor = mix(midSlope, u_accentB, diffuse * 0.75);

  // High-light crest rim catch: subtle accentHot
  vec3 finalColor = mix(crestColor, u_accentHot, rim * 0.65 * diffuse);

  // Vignette
  float vignette = 1.0 - 0.28 * length(st);
  finalColor *= max(0.0, vignette);

  // Clamp luminance proportionally so sculptural basalt relief preserves rich signal
  float lum = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
  float maxLum = 0.30;
  if (lum > maxLum) {
    finalColor *= (maxLum / lum);
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export default function LivingSculpturalTheme({
  opacity = 1,
  interactive = true,
  className = '',
  palette,
  settings,
}: LivingSculpturalThemeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number>(0);
  const isVisible = useRef(true);
  const isReducedMotion = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const surfaceScale = (settings?.surfaceScale ?? 100) / 100;
  const deformation = (settings?.deformation ?? 90) / 100;
  const movementSpeed = (settings?.movementSpeed ?? 50) / 100;
  const lightIntensity = (settings?.lightIntensity ?? 95) / 100;

  const currentSettings = useRef({
    surfaceScale,
    deformation,
    movementSpeed,
    lightIntensity,
    interactive,
  });
  currentSettings.current = {
    surfaceScale,
    deformation,
    movementSpeed,
    lightIntensity,
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
    const uSurfaceScale = gl.getUniformLocation(program, 'u_surfaceScale');
    const uDeformation = gl.getUniformLocation(program, 'u_deformation');
    const uMovementSpeed = gl.getUniformLocation(program, 'u_movementSpeed');
    const uLightIntensity = gl.getUniformLocation(program, 'u_lightIntensity');

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
    const targetFps = 22;
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

      const { valid, invalidList } = validateUniforms('sculptural', {
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
        surfaceScale: s.surfaceScale,
        deformation: s.deformation,
        movementSpeed: s.movementSpeed,
        lightIntensity: s.lightIntensity,
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

      gl.uniform1f(uSurfaceScale, s.surfaceScale);
      gl.uniform1f(uDeformation, s.deformation);
      gl.uniform1f(uMovementSpeed, s.movementSpeed);
      gl.uniform1f(uLightIntensity, s.lightIntensity);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      updateWebGlDiagnostics({
        themeName: 'Soft Sculptural',
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
          surfaceScale: s.surfaceScale,
          deformation: s.deformation,
          movementSpeed: s.movementSpeed,
          lightIntensity: s.lightIntensity,
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
