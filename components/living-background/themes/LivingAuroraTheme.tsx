import React, { useEffect, useRef } from 'react';
import type { AuroraThemeSettings, LivingBackgroundPalette } from '../../../lib/livingBackgroundThemes';
import { updateWebGlDiagnostics, validateUniforms } from '../../../lib/livingBackgroundDiagnostics';

export type LivingAuroraThemeProps = {
  opacity?: number;
  interactive?: boolean;
  className?: string;
  palette?: LivingBackgroundPalette;
  settings?: AuroraThemeSettings;
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

uniform float u_driftSpeed;
uniform float u_fieldScale;
uniform float u_colorStrength;
uniform float u_softness;

// 2D Rotation matrix
mat2 rot2D(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

void main() {
  // Aspect-corrected UV space centered at origin
  vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * u_driftSpeed * 0.12;
  float scale = u_fieldScale * 1.25;
  float softness = u_softness * 1.1;

  // Gentle coordinate distortion to make atmospheric boundaries non-circular & organic
  vec2 warp = vec2(
    sin(st.y * 1.6 + t * 0.35) * 0.18,
    cos(st.x * 1.8 - t * 0.28) * 0.18
  );
  vec2 pos = st + warp;

  // Orbit 1: Primary hero accent atmospheric veil (lazy Lissajous drift)
  vec2 c1 = vec2(
    sin(t * 0.45) * 0.42 + u_pointer.x * 0.25,
    cos(t * 0.38) * 0.35 + 0.15 + u_pointer.y * 0.25
  );
  vec2 p1 = rot2D(t * 0.15 + 0.5) * (pos - c1) * vec2(0.85, 1.4);
  float d1 = length(p1);
  float r1 = clamp(d1 / (scale * 0.95), 0.0, 1.0);
  float field1 = pow(1.0 - r1, 1.5 + softness * 1.5);

  // Orbit 2: Secondary accent atmospheric mass (counter-drifting)
  vec2 c2 = vec2(
    cos(t * 0.32 + 2.1) * 0.55 - u_pointer.x * 0.2,
    sin(t * 0.41 + 1.2) * 0.38 - 0.2 - u_pointer.y * 0.2
  );
  vec2 p2 = rot2D(-t * 0.2 + 1.2) * (pos - c2) * vec2(1.3, 0.75);
  float d2 = length(p2);
  float r2 = clamp(d2 / (scale * 1.1), 0.0, 1.0);
  float field2 = pow(1.0 - r2, 1.5 + softness * 1.5);

  // Orbit 3: Hot luminous core (subtle high-signal accent flare, deeper in canvas)
  vec2 c3 = vec2(
    sin(t * 0.22 - 1.5) * 0.32,
    -0.35 + cos(t * 0.28) * 0.22
  );
  vec2 p3 = rot2D(t * 0.1) * (pos - c3) * vec2(1.1, 1.1);
  float d3 = length(p3);
  float r3 = clamp(d3 / (scale * 0.7), 0.0, 1.0);
  float field3 = pow(1.0 - r3, 2.2 + softness * 2.0);

  // Deep negative space: threshold out faint haze to guarantee rich black spaces between color masses
  field1 = smoothstep(0.12, 0.90, field1);
  field2 = smoothstep(0.12, 0.90, field2);
  field3 = smoothstep(0.18, 0.92, field3);

  // Base graphite backdrop
  vec3 bg = mix(u_darkA, u_darkB, clamp(0.1 + 0.25 * (st.y + 0.5), 0.0, 0.35));

  // Blend atmospheric light fields into dark graphite space
  vec3 color = bg;
  color += u_accentA * field1 * (u_colorStrength * 0.52);
  color += u_accentB * field2 * (u_colorStrength * 0.48);
  color += u_accentHot * field3 * (u_colorStrength * 0.42);

  // Vignette
  float vignette = 1.0 - 0.32 * length(st);
  color *= max(0.0, vignette);

  // Clamp luminance proportionally so atmospheric hues keep their saturation
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float maxLum = 0.30;
  if (lum > maxLum) {
    color *= (maxLum / lum);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function LivingAuroraTheme({
  opacity = 1,
  interactive = true,
  className = '',
  palette,
  settings,
}: LivingAuroraThemeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number>(0);
  const isVisible = useRef(true);
  const isReducedMotion = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const driftSpeed = (settings?.driftSpeed ?? 60) / 100;
  const fieldScale = (settings?.fieldScale ?? 115) / 100;
  const colorStrength = (settings?.colorStrength ?? 85) / 100;
  const softness = (settings?.softness ?? 120) / 100;

  const currentSettings = useRef({
    driftSpeed,
    fieldScale,
    colorStrength,
    softness,
    interactive,
  });
  currentSettings.current = {
    driftSpeed,
    fieldScale,
    colorStrength,
    softness,
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
    const uDriftSpeed = gl.getUniformLocation(program, 'u_driftSpeed');
    const uFieldScale = gl.getUniformLocation(program, 'u_fieldScale');
    const uColorStrength = gl.getUniformLocation(program, 'u_colorStrength');
    const uSoftness = gl.getUniformLocation(program, 'u_softness');

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
    const targetFps = 20;
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

      const { valid, invalidList } = validateUniforms('aurora', {
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
        driftSpeed: s.driftSpeed,
        fieldScale: s.fieldScale,
        colorStrength: s.colorStrength,
        softness: s.softness,
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

      gl.uniform1f(uDriftSpeed, s.driftSpeed);
      gl.uniform1f(uFieldScale, s.fieldScale);
      gl.uniform1f(uColorStrength, s.colorStrength);
      gl.uniform1f(uSoftness, s.softness);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      updateWebGlDiagnostics({
        themeName: 'Aurora Atmosphere',
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
          driftSpeed: s.driftSpeed,
          fieldScale: s.fieldScale,
          colorStrength: s.colorStrength,
          softness: s.softness,
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
