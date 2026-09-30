import React, { useEffect, useRef } from 'react';
import type {
  LivingBackgroundPalette,
  LivingBackgroundPerformanceMode,
  SilkRibbonsThemeSettings,
} from '../../../lib/livingBackgroundThemes';
import { updateWebGlDiagnostics, validateUniforms } from '../../../lib/livingBackgroundDiagnostics';

export type LivingSilkRibbonsThemeProps = {
  opacity?: number;
  interactive?: boolean;
  className?: string;
  palette?: LivingBackgroundPalette;
  settings?: SilkRibbonsThemeSettings;
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
uniform vec2 u_pointer;
uniform vec3 u_darkA;
uniform vec3 u_darkB;
uniform vec3 u_accentA;
uniform vec3 u_accentB;
uniform vec3 u_accentHot;

uniform float u_ribbonCount;
uniform float u_curveScale;
uniform float u_edgeHighlight;
uniform float u_depthContrast;
uniform float u_sheenSoftness;
uniform float u_motionSpeed;

// 2D rotation
mat2 rot2D(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

void main() {
  // Aspect-corrected UV space centered at origin
  vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * (u_motionSpeed * 0.12);
  float curveScale = u_curveScale * 1.1;
  float edgeGain = u_edgeHighlight * 1.35;
  float depthGain = u_depthContrast * 1.15;
  float sheenGain = u_sheenSoftness * 1.0;

  // Diagonal orientation matching reference image (~32 degree sweep)
  vec2 rotCoord = rot2D(-0.52) * st;
  rotCoord.x += u_pointer.x * 0.08;
  rotCoord.y += u_pointer.y * 0.08;

  // Base background in deep graphite obsidian
  vec3 color = mix(u_darkA, u_darkB, clamp(0.1 + 0.35 * (st.y + 0.5), 0.0, 0.45));

  // Studio lighting direction
  vec3 keyLight = normalize(vec3(-0.45 + 0.15 * sin(t * 0.2), 0.65 + 0.12 * cos(t * 0.18), 0.72));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);

  // Stack of 6 cascading ribbon manifolds evaluated front-to-back
  // Each ribbon has an S-curve boundary, crisp rim line, and smooth face roll
  float baseDist = -0.75;
  float spacing = 0.28;

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= u_ribbonCount) break;

    // Harmonic curve equation for ribbon i: sweeping S-curves across viewport
    float phase1 = fi * 1.15 + t * (0.28 + fi * 0.03);
    float phase2 = fi * 1.72 - t * (0.22 + fi * 0.02);

    float curve = sin(rotCoord.y * (1.65 * curveScale) + phase1) * (0.22 * curveScale)
                + cos(rotCoord.y * (2.85 * curveScale) + phase2) * (0.09 * curveScale);

    float boundary = baseDist + fi * spacing + curve;
    float dist = rotCoord.x - boundary;

    // 1. Crisp, razor-sharp illuminated rim highlight right along the crest edge (1-2px)
    float rimDistance = abs(dist);
    float rimHighlight = exp(-rimDistance * 95.0) * edgeGain;
    float rimSoftGlow = exp(-rimDistance * 24.0) * (edgeGain * 0.35);

    // 2. Drop shadow cast onto the layer behind into negative space
    float shadow = smoothstep(0.0, 0.32, dist) * depthGain;

    // 3. Ribbon face surface gradient: cylindrical roll across ribbon width
    float faceRoll = clamp(dist / max(0.001, spacing), 0.0, 1.0);
    float faceSheen = pow(sin(faceRoll * 3.14159), 1.6) * sheenGain;

    // Analytical normal vector of the curving ribbon face
    float slopeX = (1.0 - 2.0 * faceRoll) * 0.65;
    vec3 ribbonNormal = normalize(vec3(slopeX, -0.25, 0.75));
    float nDotL = max(0.0, dot(ribbonNormal, keyLight));
    float diffuse = pow(nDotL, 1.25);

    // Specular highlight on satin face
    vec3 halfVec = normalize(keyLight + viewDir);
    float specular = pow(max(0.0, dot(ribbonNormal, halfVec)), 20.0) * 0.45;

    // Ribbon color mapping:
    // Base ribbon body tinted by accentA
    vec3 ribbonBody = mix(u_darkA, u_accentA, 0.25 + 0.35 * diffuse);

    // Face roll catches accentB in diffuse light
    vec3 ribbonFace = mix(ribbonBody, u_accentB, faceSheen * 0.55 * diffuse);

    // Illuminated edge rim: crisp accentHot / silver catch
    vec3 rimColor = mix(u_accentB, mix(u_accentHot, vec3(0.92, 0.94, 0.98), 0.45), 0.75);

    // Composite ribbon layer over previous layers:
    // When dist > 0, we are on or behind the ribbon
    if (dist > -0.05) {
      float layerMask = smoothstep(-0.02, 0.04, dist);
      vec3 layerColor = ribbonFace + vec3(specular * 0.3);
      layerColor += rimColor * (rimHighlight + rimSoftGlow);

      // Deepen underlying shadow
      color = mix(color * (1.0 - shadow * 0.55), layerColor, layerMask);
    }
  }

  // Soft vignette
  float vignette = 1.0 - 0.25 * length(st);
  color *= max(0.0, vignette);

  // Proportional luminance clamping so text stays crisp and readable
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float maxLum = 0.32;
  if (lum > maxLum) {
    color *= (maxLum / lum);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function LivingSilkRibbonsTheme({
  opacity = 1,
  interactive = true,
  className = '',
  palette,
  settings,
  performanceMode = 'balanced',
}: LivingSilkRibbonsThemeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number>(0);
  const isVisible = useRef(true);
  const isReducedMotion = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const ribbonCount = Math.max(3, Math.min(8, Math.round(settings?.ribbonCount ?? 5)));
  const curveScale = (settings?.curveScale ?? 100) / 100;
  const edgeHighlight = (settings?.edgeHighlight ?? 125) / 100;
  const depthContrast = (settings?.depthContrast ?? 115) / 100;
  const sheenSoftness = (settings?.sheenSoftness ?? 90) / 100;
  const motionSpeed = (settings?.motionSpeed ?? 40) / 100;

  const currentSettings = useRef({
    ribbonCount,
    curveScale,
    edgeHighlight,
    depthContrast,
    sheenSoftness,
    motionSpeed,
    interactive,
  });
  currentSettings.current = {
    ribbonCount,
    curveScale,
    edgeHighlight,
    depthContrast,
    sheenSoftness,
    motionSpeed,
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
    const handlePointerMove = (e: PointerEvent) => {
      if (!currentSettings.current.interactive || isReducedMotion.current) return;
      pointerRef.current.tx = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 1.0;
      pointerRef.current.ty = (e.clientY / Math.max(window.innerHeight, 1) - 0.5) * 1.0;
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
    const uRibbonCount = gl.getUniformLocation(program, 'u_ribbonCount');
    const uCurveScale = gl.getUniformLocation(program, 'u_curveScale');
    const uEdgeHighlight = gl.getUniformLocation(program, 'u_edgeHighlight');
    const uDepthContrast = gl.getUniformLocation(program, 'u_depthContrast');
    const uSheenSoftness = gl.getUniformLocation(program, 'u_sheenSoftness');
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

      const { valid, invalidList } = validateUniforms('silk-ribbons', {
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
        ribbonCount: s.ribbonCount,
        curveScale: s.curveScale,
        edgeHighlight: s.edgeHighlight,
        depthContrast: s.depthContrast,
        sheenSoftness: s.sheenSoftness,
        motionSpeed: s.motionSpeed,
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

      gl.uniform1f(uRibbonCount, s.ribbonCount);
      gl.uniform1f(uCurveScale, s.curveScale);
      gl.uniform1f(uEdgeHighlight, s.edgeHighlight);
      gl.uniform1f(uDepthContrast, s.depthContrast);
      gl.uniform1f(uSheenSoftness, s.sheenSoftness);
      gl.uniform1f(uMotionSpeed, s.motionSpeed);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      updateWebGlDiagnostics({
        themeName: 'Silk Ribbons',
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
          ribbonCount: s.ribbonCount,
          curveScale: s.curveScale,
          edgeHighlight: s.edgeHighlight,
          depthContrast: s.depthContrast,
          sheenSoftness: s.sheenSoftness,
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
