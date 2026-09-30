export type WebGlDiagnosticsState = {
  themeName: string;
  compileSuccess: boolean;
  linkSuccess: boolean;
  shaderInfoLog?: string | null;
  canvasWidth: number;
  canvasHeight: number;
  containerWidth: number;
  containerHeight: number;
  dpr: number;
  uTime: number;
  fps: number;
  frameDeltaMs: number;
  renderLoopAlive: boolean;
  reducedMotion: boolean;
  isVisible: boolean;
  paletteSwatches: {
    darkA: [number, number, number];
    darkB: [number, number, number];
    accentA: [number, number, number];
    accentB: [number, number, number];
    accentHot: [number, number, number];
  };
  settings: Record<string, number>;
  uniformsValid: boolean;
  invalidUniforms: string[];
  lastRenderTimestamp: number;
  frameCount: number;
};

type DiagnosticsListener = (state: WebGlDiagnosticsState) => void;

let currentState: WebGlDiagnosticsState | null = null;
const listeners = new Set<DiagnosticsListener>();

export const updateWebGlDiagnostics = (state: Partial<WebGlDiagnosticsState> & { themeName: string }) => {
  if (typeof window === 'undefined') return;

  const next: WebGlDiagnosticsState = {
    themeName: state.themeName,
    compileSuccess: state.compileSuccess ?? currentState?.compileSuccess ?? true,
    linkSuccess: state.linkSuccess ?? currentState?.linkSuccess ?? true,
    shaderInfoLog: state.shaderInfoLog ?? currentState?.shaderInfoLog ?? null,
    canvasWidth: state.canvasWidth ?? currentState?.canvasWidth ?? 0,
    canvasHeight: state.canvasHeight ?? currentState?.canvasHeight ?? 0,
    containerWidth: state.containerWidth ?? currentState?.containerWidth ?? 0,
    containerHeight: state.containerHeight ?? currentState?.containerHeight ?? 0,
    dpr: state.dpr ?? currentState?.dpr ?? 1,
    uTime: state.uTime ?? currentState?.uTime ?? 0,
    fps: state.fps ?? currentState?.fps ?? 0,
    frameDeltaMs: state.frameDeltaMs ?? currentState?.frameDeltaMs ?? 0,
    renderLoopAlive: state.renderLoopAlive ?? currentState?.renderLoopAlive ?? true,
    reducedMotion: state.reducedMotion ?? currentState?.reducedMotion ?? false,
    isVisible: state.isVisible ?? currentState?.isVisible ?? true,
    paletteSwatches: state.paletteSwatches ?? currentState?.paletteSwatches ?? {
      darkA: [0, 0, 0],
      darkB: [0, 0, 0],
      accentA: [0, 0, 0],
      accentB: [0, 0, 0],
      accentHot: [0, 0, 0],
    },
    settings: state.settings ?? currentState?.settings ?? {},
    uniformsValid: state.uniformsValid ?? currentState?.uniformsValid ?? true,
    invalidUniforms: state.invalidUniforms ?? currentState?.invalidUniforms ?? [],
    lastRenderTimestamp: state.lastRenderTimestamp ?? Date.now(),
    frameCount: (currentState?.themeName === state.themeName ? (currentState?.frameCount ?? 0) : 0) + 1,
  };

  currentState = next;
  (window as unknown as { __SWINGSPHERE_WEBGL_DIAGNOSTICS__?: WebGlDiagnosticsState }).__SWINGSPHERE_WEBGL_DIAGNOSTICS__ = next;

  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch {
      // Ignore listener error
    }
  });
};

export const subscribeWebGlDiagnostics = (listener: DiagnosticsListener): (() => void) => {
  listeners.add(listener);
  if (currentState) {
    listener(currentState);
  }
  return () => {
    listeners.delete(listener);
  };
};

export const validateUniforms = (
  theme: string,
  uniforms: Record<string, number | number[] | undefined | null>,
): { valid: boolean; invalidList: string[] } => {
  const invalidList: string[] = [];

  for (const [key, val] of Object.entries(uniforms)) {
    if (val === undefined || val === null) {
      invalidList.push(`${key}: ${val}`);
    } else if (typeof val === 'number') {
      if (!Number.isFinite(val) || Number.isNaN(val)) {
        invalidList.push(`${key}: ${val}`);
      }
    } else if (Array.isArray(val)) {
      const hasBad = val.some((v) => typeof v !== 'number' || !Number.isFinite(v) || Number.isNaN(v));
      if (hasBad) {
        invalidList.push(`${key}: [${val.join(',')}]`);
      }
    }
  }

  if (invalidList.length > 0) {
    console.warn(`[WebGL Diagnostics: ${theme}] Invalid uniform(s) detected:`, invalidList.join('; '));
    return { valid: false, invalidList };
  }

  return { valid: true, invalidList: [] };
};
