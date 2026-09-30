import React, { useEffect, useState } from 'react';
import {
  THEME_METADATA,
  type LivingBackgroundPerformanceMode,
  type LivingBackgroundThemeId,
  type LowPolyThemeSettings,
  type SilkRibbonsThemeSettings,
  type WatercolorThemeSettings,
} from '../../lib/livingBackgroundThemes';
import {
  subscribeWebGlDiagnostics,
  type WebGlDiagnosticsState,
} from '../../lib/livingBackgroundDiagnostics';

export type LivingBackgroundDiagnosticsProps = {
  theme: LivingBackgroundThemeId;
  density?: number;
  blurPx?: number;
  glow?: number;
  performanceMode?: LivingBackgroundPerformanceMode;
  lowPolySettings?: LowPolyThemeSettings;
  silkSettings?: SilkRibbonsThemeSettings;
  watercolorSettings?: WatercolorThemeSettings;
  className?: string;
};

export default function LivingBackgroundDiagnostics({
  theme,
  density = 100,
  blurPx = 0,
  glow = 41,
  performanceMode = 'balanced',
  lowPolySettings,
  silkSettings,
  watercolorSettings,
  className = '',
}: LivingBackgroundDiagnosticsProps) {
  const [liveFps, setLiveFps] = useState<number>(0);
  const [frameTimeMs, setFrameTimeMs] = useState<number>(0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [webglDiag, setWebglDiag] = useState<WebGlDiagnosticsState | null>(null);
  const meta = THEME_METADATA[theme];

  useEffect(() => {
    return subscribeWebGlDiagnostics((state) => {
      setWebglDiag(state);
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(media.matches);
    const handler = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let accumulatedTime = 0;

    const measure = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;
      frameCount += 1;
      accumulatedTime += delta;

      if (accumulatedTime >= 500) {
        const fps = Math.round((frameCount * 1000) / accumulatedTime);
        const avgFrameTime = Math.round((accumulatedTime / frameCount) * 10) / 10;
        setLiveFps(fps);
        setFrameTimeMs(avgFrameTime);
        frameCount = 0;
        accumulatedTime = 0;
      }

      frameId = requestAnimationFrame(measure);
    };

    frameId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const rendererCap = theme === 'low-poly'
    ? 18
    : ((theme === 'silk-ribbons' || theme === 'silk' || theme === 'watercolor' || theme === 'liquid') && performanceMode === 'green')
      ? 18
      : meta.fpsTarget;

  const estimatedSustainableFps = (() => {
    if (isReducedMotion) return 0;
    if (theme === 'low-poly') {
      const s = lowPolySettings;
      const densityPenalty = Math.max(0, ((s?.density ?? density) - 70) / 130) * 4.5;
      const glowPenalty = (s?.glow ?? glow) > 0 ? 2.5 + ((s?.glow ?? glow) / 100) * 2.5 : 0;
      const blurPenalty = blurPx > 0 ? Math.min(3, blurPx * 0.45) : 0;
      const linePenalty = ((s?.lines ?? 0) / 100) * 1.5;
      return Math.max(8, Math.min(rendererCap, Math.round(rendererCap - densityPenalty - glowPenalty - blurPenalty - linePenalty)));
    }
    if (theme === 'silk-ribbons' || theme === 'silk') {
      const ribbons = silkSettings?.ribbonCount ?? 5;
      const ribbonPenalty = Math.max(0, ribbons - 4) * 0.8;
      const blurPenalty = blurPx > 0 ? Math.min(2, blurPx * 0.3) : 0;
      return Math.max(12, Math.min(rendererCap, Math.round(rendererCap - ribbonPenalty - blurPenalty)));
    }
    if (theme === 'watercolor' || theme === 'liquid') {
      const blurPenalty = blurPx > 0 ? Math.min(2, blurPx * 0.3) : 0;
      return Math.max(12, Math.min(rendererCap, Math.round(rendererCap - blurPenalty)));
    }
    return rendererCap;
  })();

  const dynamicDomCount = theme === 'low-poly'
    ? `${Math.round(((Math.max(7, Math.round(11 * Math.sqrt(density / 100))) - 1) * (Math.max(5, Math.round(8 * Math.sqrt(density / 100))) - 1) * 2) * 2)} <polygon> elements`
    : '1 <canvas> element';

  const filterStatus = theme === 'low-poly'
    ? `${glow > 0 ? 'SVG <feGaussianBlur> active' : 'Glow off'}, ${blurPx > 0 ? `CSS blur(${blurPx}px)` : 'CSS blur 0px'}`
    : blurPx > 0 ? `CSS blur(${blurPx}px)` : 'None (pure analytical shader)';

  const getCostBadgeColor = (cost: string) => {
    switch (cost) {
      case 'Lowest':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
      case 'Low':
        return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
      case 'Moderate':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
      default:
        return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    }
  };

  return (
    <div className={`rounded-2xl border border-white/10 bg-black/60 p-4 text-xs text-gray-300 shadow-xl backdrop-blur-md ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-bold text-white uppercase tracking-wider text-[11px]">Lab Performance Diagnostics</span>
        </div>
        <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${getCostBadgeColor(meta.expectedCost)}`}>
          {meta.expectedCost} Cost Profile
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/5 bg-white/[0.025] p-2.5">
          <span className="block text-[10px] uppercase tracking-wider text-gray-500">Browser Refresh</span>
          <span className="mt-0.5 text-base font-black text-white">
            {isReducedMotion ? 'Static' : `${liveFps} FPS`}
            <span className="ml-1 text-[9px] font-normal text-gray-500">{frameTimeMs}ms</span>
          </span>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.025] p-2.5">
          <span className="block text-[10px] uppercase tracking-wider text-gray-500">Renderer Cap</span>
          <span className="mt-0.5 text-base font-black text-gray-200">
            {rendererCap} FPS
          </span>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.025] p-2.5">
          <span className="block text-[10px] uppercase tracking-wider text-gray-500">Est. Sustainable</span>
          <span className="mt-0.5 text-base font-black text-emerald-300">
            {isReducedMotion ? 'Static' : `~${estimatedSustainableFps} FPS`}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-gray-500">
        Estimate updates from the active sliders and render mode. It is a workload estimate, not a hardware benchmark.
      </p>

      <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[11px]">
        <div className="flex justify-between">
          <span className="text-gray-400">Rendering Engine:</span>
          <span className="font-semibold text-white">{meta.renderingTech}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Active DOM Nodes:</span>
          <span className="font-mono text-gray-200">{dynamicDomCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Filter Pipeline:</span>
          <span className="font-mono text-gray-300">{filterStatus}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">CPU Footprint:</span>
          <span className="text-gray-300 truncate max-w-[200px]" title={meta.primaryCpuCost}>{meta.primaryCpuCost}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">GPU Fillrate:</span>
          <span className="text-gray-300 truncate max-w-[200px]" title={meta.primaryGpuCost}>{meta.primaryGpuCost}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Mobile Suitability:</span>
          <span className="text-gray-200">{meta.mobileSuitability}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Off-Screen Handling:</span>
          <span className="text-emerald-400">Paused via IntersectionObserver</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Reduced Motion:</span>
          <span className="text-gray-300">{isReducedMotion ? 'Active (Motion paused)' : 'Supported'}</span>
        </div>

        {/* Temporary WebGL Runtime & Shader Diagnostics */}
        {theme !== 'low-poly' && webglDiag && (
          <div className="mt-3 space-y-2 rounded-xl border border-red-500/20 bg-red-950/20 p-2.5 text-[10px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5 font-bold">
              <span className="text-red-300 uppercase tracking-wider">WebGL Live Shader Telemetry</span>
              <span className={webglDiag.compileSuccess && webglDiag.linkSuccess ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>
                {webglDiag.compileSuccess && webglDiag.linkSuccess ? 'Shader OK ✓' : 'Shader Error ✕'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-400">Canvas Buffer:</span>
              <span className="font-mono text-gray-200">{webglDiag.canvasWidth} × {webglDiag.canvasHeight} (dpr {webglDiag.dpr.toFixed(2)})</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-400">Container Box:</span>
              <span className="font-mono text-gray-200">{webglDiag.containerWidth} × {webglDiag.containerHeight}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-400">Shader u_time:</span>
              <span className="font-mono text-red-200">{webglDiag.uTime.toFixed(3)}s</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-400">Uniforms State:</span>
              <span className={webglDiag.uniformsValid ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-bold'}>
                {webglDiag.uniformsValid ? 'All Valid' : `ERR: ${webglDiag.invalidUniforms.join(', ')}`}
              </span>
            </div>

            <div className="border-t border-white/5 pt-1.5">
              <span className="block text-gray-400 mb-1">Active Shader Palette (0–255):</span>
              <div className="flex items-center gap-1.5">
                {Object.entries(webglDiag.paletteSwatches).map(([k, rgb]) => (
                  <div key={k} className="flex flex-col items-center gap-0.5" title={`${k}: rgb(${rgb.join(',')})`}>
                    <div
                      className="h-3 w-5 rounded border border-white/20 shadow-sm"
                      style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
                    />
                    <span className="text-[8px] text-gray-400 font-mono">{k.replace('accent', 'acc')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/5 pt-1.5">
              <span className="block text-gray-400 mb-1">Theme Settings Applied:</span>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[9px] text-gray-300">
                {Object.entries(webglDiag.settings).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-500">{k}:</span>
                    <span>{typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
