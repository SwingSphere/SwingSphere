import type { ExplorerSurfaceMode } from './explorerCamera';

export type ExplorerTransitionFrame = {
  progress: number;
  globeOpacity: number;
  globeScale: number;
  globeBlurPx: number;
  mapOpacity: number;
  mapScale: number;
  mapBlurPx: number;
  veilOpacity: number;
};

export const EXPLORER_TRANSITION_DURATION_MS = 960;

const easeInOutCubic = (value: number): number =>
  value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;

export class ExplorerTransitionController {
  #target: ExplorerSurfaceMode;
  #current: number;
  #startProgress: number;
  #startedAt: number;
  #active: boolean;
  #durationMs: number;

  constructor(initialSurface: ExplorerSurfaceMode = 'globe', durationMs = EXPLORER_TRANSITION_DURATION_MS) {
    this.#target = initialSurface;
    this.#current = initialSurface === 'map' ? 1 : 0;
    this.#startProgress = this.#current;
    this.#startedAt = performance.now();
    this.#active = false;
    this.#durationMs = Math.max(0, durationMs);
  }

  setTarget(surface: ExplorerSurfaceMode, now = performance.now()): void {
    if (surface === this.#target) return;
    this.#target = surface;
    this.#startProgress = this.#current;
    this.#startedAt = now;
    this.#active = true;
  }

  update(now = performance.now()): ExplorerTransitionFrame {
    const targetProgress = this.#target === 'map' ? 1 : 0;
    if (!this.#active) {
      this.#current = targetProgress;
      return this.#frame(this.#current);
    }

    const elapsed = now - this.#startedAt;
    const rawProgress = this.#durationMs === 0
      ? 1
      : Math.min(1, Math.max(0, elapsed / this.#durationMs));
    const eased = easeInOutCubic(rawProgress);
    this.#current = this.#startProgress + (targetProgress - this.#startProgress) * eased;

    if (rawProgress >= 1) {
      this.#current = targetProgress;
      this.#active = false;
    }

    return this.#frame(this.#current);
  }

  getTarget(): ExplorerSurfaceMode {
    return this.#target;
  }

  isAnimating(): boolean {
    return this.#active;
  }

  #frame(progress: number): ExplorerTransitionFrame {
    const globeProgress = 1 - progress;
    const mapProgress = progress;
    const veil = 0.08 + Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI) * 0.14;

    return {
      progress,
      globeOpacity: Math.max(0, globeProgress),
      globeScale: 1 + (1 - globeProgress) * 0.022,
      globeBlurPx: globeProgress < 0.5 ? (1 - globeProgress) * 6 : 0,
      mapOpacity: Math.max(0, mapProgress),
      mapScale: 0.988 + mapProgress * 0.012,
      mapBlurPx: mapProgress < 0.5 ? (1 - mapProgress) * 5 : 0,
      veilOpacity: veil,
    };
  }
}
