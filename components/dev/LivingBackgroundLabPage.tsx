import React, { useMemo, useRef, useState } from 'react';
import LivingBackground from '../living-background/LivingBackground';
import LivingBackgroundDiagnostics from '../living-background/LivingBackgroundDiagnostics';
import { getLivingBackgroundMeshStats } from '../LivingLowPolyBackground';
import {
  readLivingBackgroundStoredState,
  saveLivingBackgroundStoredState,
  type LivingBackgroundStoredState,
} from '../../lib/livingBackgroundSettings';
import {
  DEFAULT_AURORA_SETTINGS,
  DEFAULT_LOW_POLY_SETTINGS,
  DEFAULT_SCULPTURAL_SETTINGS,
  DEFAULT_SILK_RIBBONS_SETTINGS,
  DEFAULT_WATERCOLOR_SETTINGS,
  DEFAULT_SWINGSPHERE_PALETTE,
  PALETTE_PRESETS,
  THEME_METADATA,
  type AuroraThemeSettings,
  type LivingBackgroundPalette,
  type LivingBackgroundPerformanceMode,
  type LivingBackgroundThemeId,
  type LowPolyThemeSettings,
  type Rgb,
  type SculpturalThemeSettings,
  type SilkRibbonsThemeSettings,
  type WatercolorThemeSettings,
} from '../../lib/livingBackgroundThemes';

const sliderClass = 'w-full accent-red-500 cursor-pointer';

const rgbCss = (rgb: Rgb) => `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const luminance = (rgb: Rgb) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const saturation = (rgb: Rgb) => Math.max(...rgb) - Math.min(...rgb);
const scaleRgb = (rgb: Rgb, amount: number): Rgb => [
  clampByte(rgb[0] * amount),
  clampByte(rgb[1] * amount),
  clampByte(rgb[2] * amount),
];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  clampByte(a[0] + (b[0] - a[0]) * t),
  clampByte(a[1] + (b[1] - a[1]) * t),
  clampByte(a[2] + (b[2] - a[2]) * t),
];

const extractPaletteFromImage = (image: HTMLImageElement) => {
  const canvas = document.createElement('canvas');
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { rgb: [number, number, number]; count: number }>();
  for (let i = 0; i < pixels.length; i += 16) {
    if (pixels[i + 3] < 180) continue;
    const rgb: [number, number, number] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = rgb.map((v) => Math.round(v / 24) * 24).join(',');
    const entry = buckets.get(key);
    if (entry) entry.count += 1;
    else buckets.set(key, { rgb, count: 1 });
  }
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const useful = ranked.filter(({ rgb }) => luminance(rgb) > 18 && luminance(rgb) < 245);
  const accents = [...useful].sort(
    (a, b) => saturation(b.rgb) * Math.sqrt(b.count) - saturation(a.rgb) * Math.sqrt(a.count),
  );
  const dominant = useful[0]?.rgb ?? [70, 70, 76];
  const rawAccent = accents[0]?.rgb ?? dominant;
  const rawSecondary =
    accents.find(
      ({ rgb }) =>
        Math.abs(rgb[0] - rawAccent[0]) + Math.abs(rgb[1] - rawAccent[1]) + Math.abs(rgb[2] - rawAccent[2]) > 70,
    )?.rgb ?? mix(rawAccent, dominant, 0.5);

  // Calibrate tones so light/white flyers never wash out dark backgrounds
  const maxAccentLum = 135;
  const lumA = luminance(rawAccent);
  const accent = lumA > maxAccentLum ? scaleRgb(rawAccent, maxAccentLum / lumA) : rawAccent;
  const lumSec = luminance(rawSecondary);
  const secondary = lumSec > maxAccentLum ? scaleRgb(rawSecondary, maxAccentLum / lumSec) : rawSecondary;

  return {
    swatches: useful.slice(0, 8).map(({ rgb }) => rgb as Rgb),
    palette: {
      darkA: scaleRgb(dominant, Math.min(0.06, 12 / (luminance(dominant) || 1))),
      darkB: mix(scaleRgb(dominant, 0.22), [38, 40, 46], 0.4),
      accentA: scaleRgb(accent, 0.25),
      accentB: mix(scaleRgb(accent, 0.65), secondary, 0.25),
      accentHot: mix(scaleRgb(accent, 0.95), [240, 242, 250], 0.12),
    } as LivingBackgroundPalette,
  };
};

type ViewportMode = 'full' | 'desktop' | 'tablet' | 'mobile';

export default function LivingBackgroundLabPage() {
  const [savedState] = useState(readLivingBackgroundStoredState);
  const [activeTheme, setActiveTheme] = useState<LivingBackgroundThemeId>('silk-ribbons');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('full');

  // Common settings
  const [opacity, setOpacity] = useState(savedState.opacity ?? 70);
  const [blur, setBlur] = useState(savedState.blur ?? 0);
  const [showContent, setShowContent] = useState(savedState.showContent ?? true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Low Poly theme settings
  const [lowPoly, setLowPoly] = useState<LowPolyThemeSettings>({
    opacity: savedState.opacity ?? DEFAULT_LOW_POLY_SETTINGS.opacity,
    morph: savedState.morph ?? DEFAULT_LOW_POLY_SETTINGS.morph,
    morphSpeed: savedState.morphSpeed ?? DEFAULT_LOW_POLY_SETTINGS.morphSpeed,
    panelSpeed: savedState.panelSpeed ?? DEFAULT_LOW_POLY_SETTINGS.panelSpeed,
    panelPulse: savedState.panelPulse ?? DEFAULT_LOW_POLY_SETTINGS.panelPulse,
    panelFlicker: savedState.panelFlicker ?? DEFAULT_LOW_POLY_SETTINGS.panelFlicker,
    lines: savedState.lines ?? DEFAULT_LOW_POLY_SETTINGS.lines,
    glow: savedState.glow ?? DEFAULT_LOW_POLY_SETTINGS.glow,
    blur: savedState.blur ?? DEFAULT_LOW_POLY_SETTINGS.blur,
    density: savedState.density ?? DEFAULT_LOW_POLY_SETTINGS.density,
  });

  // Silk Ribbons theme settings
  const [silkRibbons, setSilkRibbons] = useState<SilkRibbonsThemeSettings>(DEFAULT_SILK_RIBBONS_SETTINGS);

  // Watercolor Ink theme settings
  const [watercolor, setWatercolor] = useState<WatercolorThemeSettings>(DEFAULT_WATERCOLOR_SETTINGS);

  // Aurora theme settings
  const [aurora, setAurora] = useState<AuroraThemeSettings>(DEFAULT_AURORA_SETTINGS);

  // Sculptural theme settings
  const [sculptural, setSculptural] = useState<SculpturalThemeSettings>(DEFAULT_SCULPTURAL_SETTINGS);

  // Hero palette state
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [heroName, setHeroName] = useState('');
  const [extracted, setExtracted] = useState<ReturnType<typeof extractPaletteFromImage>>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('swingsphere-crimson');
  const [heroInfluence, setHeroInfluence] = useState(100);
  const [performanceMode, setPerformanceMode] = useState<LivingBackgroundPerformanceMode>('balanced');
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragState = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const activePalette = useMemo<LivingBackgroundPalette>(() => {
    const basePalette =
      PALETTE_PRESETS.find((p) => p.id === selectedPresetId)?.palette ?? DEFAULT_SWINGSPHERE_PALETTE;

    if (!extracted) {
      return basePalette;
    }

    const t = heroInfluence / 100;
    return {
      darkA: mix(basePalette.darkA, extracted.palette.darkA, t),
      darkB: mix(basePalette.darkB, extracted.palette.darkB, t),
      accentA: mix(basePalette.accentA, extracted.palette.accentA, t),
      accentB: mix(basePalette.accentB, extracted.palette.accentB, t),
      accentHot: mix(basePalette.accentHot, extracted.palette.accentHot, t),
    };
  }, [extracted, selectedPresetId, heroInfluence]);

  const handleHeroFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setExtracted(extractPaletteFromImage(image));
      setHeroUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
      setHeroName(file.name);
    };
    image.src = url;
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
  };

  const applyPerformanceMode = (mode: LivingBackgroundPerformanceMode) => {
    setPerformanceMode(mode);
    setBlur(0);

    if (mode === 'green') {
      setSilkRibbons({
        ribbonCount: 4,
        curveScale: 95,
        edgeHighlight: 105,
        depthContrast: 100,
        sheenSoftness: 85,
        motionSpeed: 32,
      });
      setWatercolor({
        washScale: 95,
        bloomStrength: 90,
        diffusion: 95,
        edgeContrast: 95,
        paperTooth: 10,
        motionSpeed: 30,
      });
      setLowPoly((s) => ({
        ...s,
        morph: 80,
        morphSpeed: 110,
        panelSpeed: 75,
        panelPulse: 80,
        panelFlicker: 3,
        lines: 0,
        glow: 0,
        blur: 0,
        density: 70,
      }));
      return;
    }

    setSilkRibbons(DEFAULT_SILK_RIBBONS_SETTINGS);
    setWatercolor(DEFAULT_WATERCOLOR_SETTINGS);
    setLowPoly((s) => ({
      ...s,
      morph: 95,
      morphSpeed: 140,
      panelSpeed: 90,
      panelPulse: 90,
      panelFlicker: 5,
      lines: 0,
      glow: 15,
      blur: 0,
      density: 90,
    }));
  };

  const handlePanelPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button,input,label')) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragState.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setPanelPosition({ left: rect.left, top: rect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanelPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth ?? 410;
    const panelHeight = panel?.offsetHeight ?? 200;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - Math.min(panelWidth, window.innerWidth - margin * 2) - margin);
    const maxTop = Math.max(margin, window.innerHeight - Math.min(panelHeight, window.innerHeight - margin * 2) - margin);
    setPanelPosition({
      left: Math.min(maxLeft, Math.max(margin, event.clientX - drag.offsetX)),
      top: Math.min(maxTop, Math.max(margin, event.clientY - drag.offsetY)),
    });
  };

  const handlePanelPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSaveState = () => {
    const state: LivingBackgroundStoredState = {
      opacity,
      morph: lowPoly.morph,
      morphSpeed: lowPoly.morphSpeed,
      panelSpeed: lowPoly.panelSpeed,
      panelPulse: lowPoly.panelPulse,
      panelFlicker: lowPoly.panelFlicker,
      lines: lowPoly.lines,
      glow: lowPoly.glow,
      blur,
      density: lowPoly.density,
      showContent,
    };

    if (saveLivingBackgroundStoredState(state)) {
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 1400);
      return;
    }
    setSaveStatus('idle');
  };

  const currentMeta = THEME_METADATA[activeTheme];

  const getViewportDimensions = () => {
    switch (viewportMode) {
      case 'desktop':
        return 'w-[1440px] h-[900px] max-w-full max-h-[85vh] rounded-3xl border border-white/20 shadow-2xl';
      case 'tablet':
        return 'w-[768px] h-[1024px] max-w-full max-h-[85vh] rounded-3xl border border-white/20 shadow-2xl';
      case 'mobile':
        return 'w-[390px] h-[844px] max-w-full max-h-[85vh] rounded-[44px] border-4 border-white/25 shadow-2xl';
      case 'full':
      default:
        return 'w-full min-h-[calc(100vh-4.5rem)] flex-1';
    }
  };

  return (
    <main className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden bg-[#030405] text-white">
      {/* Device frame wrapper for responsive inspection */}
      <div
        className={`relative mx-auto flex w-full items-center justify-center transition-all duration-300 ${
          viewportMode === 'full' ? 'min-h-[calc(100vh-4.5rem)]' : 'py-8'
        }`}
      >
        <div
          className={`relative overflow-hidden bg-[#030405] transition-all duration-300 ${getViewportDimensions()}`}
        >
          {/* Active Living Background Theme */}
          <LivingBackground
            theme={activeTheme}
            opacity={opacity / 100}
            blurPx={blur}
            palette={activePalette}
            lowPolySettings={lowPoly}
            silkRibbonsSettings={silkRibbons}
            watercolorSettings={watercolor}
            auroraSettings={aurora}
            sculpturalSettings={sculptural}
            performanceMode={performanceMode}
          />

          {/* Vignette gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,4,5,0.42)_0%,rgba(3,4,5,0.12)_45%,transparent_72%)]" />

          {/* Foreground Product Mock Content */}
          <div className="relative z-10 flex h-full min-h-[calc(100vh-4.5rem)] max-w-7xl items-center px-6 py-14 lg:px-8">
            {showContent ? (
              <section className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-red-300">
                    Living Background Lab · {currentMeta.label}
                  </p>
                </div>

                <h1 className="mt-4 text-4xl font-black leading-[0.98] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                  {(activeTheme === 'silk-ribbons' || activeTheme === 'silk') && (
                    <>
                      Silk ribbons
                      <span className="mt-2 block text-red-500">sculptural atmosphere.</span>
                    </>
                  )}
                  {(activeTheme === 'watercolor' || activeTheme === 'liquid') && (
                    <>
                      Watercolor ink
                      <span className="mt-2 block text-red-500">pigment bloom.</span>
                    </>
                  )}
                  {activeTheme === 'aurora' && (
                    <>
                      Atmospheric
                      <span className="mt-2 block text-red-500">luminous veil.</span>
                    </>
                  )}
                  {activeTheme === 'sculptural' && (
                    <>
                      Soft sculptural
                      <span className="mt-2 block text-red-500">basalt relief.</span>
                    </>
                  )}
                  {activeTheme === 'low-poly' && (
                    <>
                      Living low-poly
                      <span className="mt-2 block text-red-500">geometric mesh.</span>
                    </>
                  )}
                </h1>

                <p className="mt-5 max-w-xl text-base leading-7 text-gray-300 sm:text-lg">
                  {currentMeta.description}
                </p>

                <div className="mt-8 flex flex-wrap gap-2.5">
                  <div className="ss-glass ss-glass--liquid rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-200">
                    {currentMeta.renderingTech}
                  </div>
                  <div className="ss-glass ss-glass--liquid rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-200">
                    {currentMeta.fpsTarget} FPS cap
                  </div>
                  <div className="ss-glass ss-glass--liquid rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-200">
                    Hero color unified
                  </div>
                  <div className="ss-glass ss-glass--liquid rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-200">
                    Reduced-motion safe
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {/* Movable / resizable control panel */}
      <aside
        ref={panelRef}
        className={`fixed z-[80] flex max-h-[calc(100vh-1rem)] min-w-[320px] max-w-[min(96vw,720px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur-2xl ${panelMinimized ? 'h-auto w-[300px]' : 'w-[min(94vw,410px)]'}`}
        style={{
          ...(panelPosition ? { left: panelPosition.left, top: panelPosition.top } : { right: 16, top: 16 }),
          resize: panelMinimized ? 'none' : 'both',
          minHeight: panelMinimized ? undefined : 260,
          height: panelMinimized ? undefined : 'min(84vh, 900px)',
        }}
      >
        {/* Top Header & Actions */}
        <div
          className="flex cursor-move touch-none items-center justify-between border-b border-white/10 px-5 py-3.5 select-none"
          onPointerDown={handlePanelPointerDown}
          onPointerMove={handlePanelPointerMove}
          onPointerUp={handlePanelPointerUp}
          onPointerCancel={handlePanelPointerUp}
          title="Drag to move panel"
        >
          <div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-red-400">Lab Suite</span>
            <h2 className="text-base font-black text-white">Living Backgrounds</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPanelPosition(null)}
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-gray-300 transition hover:bg-white/10"
              title="Reset panel to upper-right"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSaveState}
              className="rounded-xl border border-red-400/25 bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-200 transition hover:bg-red-500/25"
            >
              {saveStatus === 'saved' ? 'Saved ✓' : 'Save baseline'}
            </button>
            <button
              type="button"
              onClick={() => setPanelMinimized((v) => !v)}
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-gray-300 transition hover:bg-white/10"
              title={panelMinimized ? 'Expand controls' : 'Minimize controls'}
            >
              {panelMinimized ? 'Expand' : 'Minimize'}
            </button>
            <button
              type="button"
              onClick={() => setShowContent((v) => !v)}
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-gray-300 transition hover:bg-white/10"
              title="Toggle preview text"
            >
              {showContent ? 'Hide copy' : 'Show copy'}
            </button>
          </div>
        </div>

        {!panelMinimized && (
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4">

        {/* 1. Theme Selector */}
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Background Theme</span>
            <span className="text-[10px] text-gray-400 font-medium">5 Styles</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(
              [
                { id: 'silk-ribbons', label: 'Silk Ribbons', hot: true },
                { id: 'watercolor', label: 'Watercolor Ink', hot: true },
                { id: 'low-poly', label: 'Low Poly', hot: false },
                { id: 'aurora', label: 'Aurora Light', hot: false },
                { id: 'sculptural', label: 'Sculptural', hot: false },
              ] as const
            ).map((t) => {
              const active = activeTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTheme(t.id)}
                  className={`relative flex items-center justify-center rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                    active
                      ? 'border border-red-500/60 bg-red-500/20 text-white shadow-lg'
                      : 'border border-white/10 bg-white/[0.04] text-gray-300 hover:border-white/20 hover:bg-white/[0.08]'
                  }`}
                >
                  <span>{t.label}</span>
                  {t.hot ? (
                    <span className="absolute -top-1.5 -right-1 rounded-full bg-red-500 px-1.5 py-0.2 text-[8px] font-black uppercase text-white shadow-sm">
                      Hero
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 text-[11px] leading-relaxed text-gray-400">
            <strong className="text-gray-200">{currentMeta.label}:</strong> {currentMeta.tagline}
          </p>
        </div>

        {/* 2. Responsive Viewport Mode */}
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Responsive Aspect Preview</span>
            <span className="text-[10px] text-gray-400 font-mono capitalize">{viewportMode}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-semibold">
            {(['full', 'desktop', 'tablet', 'mobile'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewportMode(mode)}
                className={`rounded-lg py-1.5 text-[11px] transition ${
                  viewportMode === mode
                    ? 'border border-red-400/40 bg-red-500/20 text-white font-bold'
                    : 'border border-white/5 bg-white/[0.03] text-gray-400 hover:text-white'
                }`}
              >
                {mode === 'full' && 'Full'}
                {mode === 'desktop' && '1440×900'}
                {mode === 'tablet' && '768×1024'}
                {mode === 'mobile' && '390×844'}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Performance Preset */}
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Performance Preset</span>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                Green lowers ongoing animation cost; Balanced keeps more visual detail while staying moderate.
              </p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
              performanceMode === 'green'
                ? 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                : 'border border-amber-400/30 bg-amber-500/15 text-amber-200'
            }`}>
              {performanceMode === 'green' ? 'Low impact' : 'Moderate'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => applyPerformanceMode('green')}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                performanceMode === 'green'
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-white'
                  : 'border-white/10 bg-black/25 text-gray-400 hover:border-white/20 hover:text-white'
              }`}
            >
              Green · Low Impact
            </button>
            <button
              type="button"
              onClick={() => applyPerformanceMode('balanced')}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                performanceMode === 'balanced'
                  ? 'border-amber-400/40 bg-amber-500/15 text-white'
                  : 'border-white/10 bg-black/25 text-gray-400 hover:border-white/20 hover:text-white'
              }`}
            >
              Balanced · Moderate
            </button>
          </div>

          <div className="mt-2.5 rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-[10px] leading-relaxed text-gray-400">
            {performanceMode === 'green'
              ? activeTheme === 'low-poly'
                ? 'Low Poly: glow off, no CSS blur, 70% mesh density, lighter motion.'
                : activeTheme === 'silk-ribbons' || activeTheme === 'silk'
                  ? 'Silk: 4 ribbon layers, 18 FPS, reduced render resolution, no CSS blur.'
                  : activeTheme === 'watercolor' || activeTheme === 'liquid'
                    ? 'Watercolor: 18 FPS, reduced render resolution, restrained paper texture, no CSS blur.'
                    : 'Green mode is currently tuned for the three production-candidate themes.'
              : activeTheme === 'low-poly'
                ? 'Low Poly: 90% mesh density with a restrained 15% glow and no CSS blur.'
                : 'Balanced keeps the normal WebGL resolution/FPS envelope and richer theme detail.'}
          </div>
        </div>

        {/* 4. Hero Palette Experiment */}
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Hero Palette Engine</span>
            <span className="text-[10px] text-gray-400 font-medium">Shared across all themes</span>
          </div>

          {/* Quick preset selector */}
          <div className="mb-3">
            <span className="block text-[10px] font-semibold uppercase text-gray-400 mb-1.5">Atmospheric Presets</span>
            <div className="grid grid-cols-2 gap-1.5">
              {PALETTE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition ${
                    selectedPresetId === preset.id
                      ? 'border-red-400/50 bg-red-500/15 text-white'
                      : 'border-white/5 bg-black/30 text-gray-400 hover:border-white/15 hover:text-gray-200'
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-white/20"
                    style={{ backgroundColor: rgbCss(preset.palette.accentB) }}
                  />
                  <span className="truncate">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Upload hero image */}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 bg-black/30 p-2.5 transition hover:border-red-400/40">
            {heroUrl ? (
              <img src={heroUrl} alt="" className="h-14 w-20 rounded-lg object-cover" />
            ) : (
              <div className="flex h-14 w-20 items-center justify-center rounded-lg bg-white/5 text-xl text-gray-400">
                ✦
              </div>
            )}
            <span className="min-w-0 text-xs text-gray-300">
              <strong className="block truncate text-white">{heroName || 'Upload hero image'}</strong>
              <span className="mt-0.5 block text-[10px] text-gray-500">Extracts 5-color atmospheric palette</span>
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleHeroFile(e.target.files?.[0])}
            />
          </label>

          {/* Palette swatches preview */}
          {extracted ? (
            <div className="mt-3">
              <span className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">Extracted Swatches</span>
              <div className="flex gap-1.5">
                {extracted.swatches.map((rgb, index) => (
                  <span
                    key={index}
                    title={rgbCss(rgb)}
                    className="h-6 flex-1 rounded border border-white/10"
                    style={{ backgroundColor: rgbCss(rgb) }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Active 5-color palette */}
          <div className="mt-3">
            <span className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">
              Active Applied Palette (darkA, darkB, accentA, accentB, accentHot)
            </span>
            <div className="flex gap-1.5">
              {Object.entries(activePalette).map(([key, rgb]) => (
                <span
                  key={key}
                  title={`${key}: ${rgbCss(rgb)}`}
                  className="h-5 flex-1 rounded border border-white/15"
                  style={{ backgroundColor: rgbCss(rgb) }}
                />
              ))}
            </div>
          </div>

          {/* Hero color influence slider */}
          <label className="mt-3.5 block text-xs font-semibold text-gray-300">
            <span className="mb-1.5 flex justify-between">
              <span>Hero Color Influence</span>
              <span className="font-mono text-red-300">{heroInfluence}%</span>
            </span>
            <input
              className={sliderClass}
              type="range"
              min="0"
              max="100"
              value={heroInfluence}
              onChange={(e) => setHeroInfluence(Number(e.target.value))}
            />
          </label>
        </div>

        {/* 5. Theme-Specific Controls */}
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] p-3.5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
              {currentMeta.label} Controls
            </span>
            <span className="text-[10px] text-gray-400">Live Tuning</span>
          </div>

          {/* SILK RIBBONS CONTROLS */}
          {(activeTheme === 'silk-ribbons' || activeTheme === 'silk') && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs font-semibold text-gray-300">
              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Ribbon Layers</span>
                  <span className="font-mono text-red-300">{silkRibbons.ribbonCount}</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="3"
                  max="8"
                  step="1"
                  value={silkRibbons.ribbonCount}
                  onChange={(e) => setSilkRibbons((s) => ({ ...s, ribbonCount: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Curve Scale</span>
                  <span className="font-mono text-red-300">{silkRibbons.curveScale}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="40"
                  max="200"
                  value={silkRibbons.curveScale}
                  onChange={(e) => setSilkRibbons((s) => ({ ...s, curveScale: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Rim Highlight</span>
                  <span className="font-mono text-red-300">{silkRibbons.edgeHighlight}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="200"
                  value={silkRibbons.edgeHighlight}
                  onChange={(e) => setSilkRibbons((s) => ({ ...s, edgeHighlight: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Depth Contrast</span>
                  <span className="font-mono text-red-300">{silkRibbons.depthContrast}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="180"
                  value={silkRibbons.depthContrast}
                  onChange={(e) => setSilkRibbons((s) => ({ ...s, depthContrast: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Sheen Softness</span>
                  <span className="font-mono text-red-300">{silkRibbons.sheenSoftness}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="180"
                  value={silkRibbons.sheenSoftness}
                  onChange={(e) => setSilkRibbons((s) => ({ ...s, sheenSoftness: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Motion Speed</span>
                  <span className="font-mono text-red-300">{silkRibbons.motionSpeed}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="10"
                  max="200"
                  value={silkRibbons.motionSpeed}
                  onChange={(e) => setSilkRibbons((s) => ({ ...s, motionSpeed: Number(e.target.value) }))}
                />
              </label>
            </div>
          )}

          {/* AURORA CONTROLS */}
          {activeTheme === 'aurora' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs font-semibold text-gray-300">
              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Drift Speed</span>
                  <span className="font-mono text-red-300">{aurora.driftSpeed}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="10"
                  max="200"
                  value={aurora.driftSpeed}
                  onChange={(e) => setAurora((s) => ({ ...s, driftSpeed: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Field Scale</span>
                  <span className="font-mono text-red-300">{aurora.fieldScale}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="50"
                  max="200"
                  value={aurora.fieldScale}
                  onChange={(e) => setAurora((s) => ({ ...s, fieldScale: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Color Strength</span>
                  <span className="font-mono text-red-300">{aurora.colorStrength}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="180"
                  value={aurora.colorStrength}
                  onChange={(e) => setAurora((s) => ({ ...s, colorStrength: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Atmospheric Softness</span>
                  <span className="font-mono text-red-300">{aurora.softness}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="40"
                  max="200"
                  value={aurora.softness}
                  onChange={(e) => setAurora((s) => ({ ...s, softness: Number(e.target.value) }))}
                />
              </label>
            </div>
          )}

          {/* WATERCOLOR INK CONTROLS */}
          {(activeTheme === 'watercolor' || activeTheme === 'liquid') && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs font-semibold text-gray-300">
              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Wash Scale</span>
                  <span className="font-mono text-red-300">{watercolor.washScale}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="40"
                  max="200"
                  value={watercolor.washScale}
                  onChange={(e) => setWatercolor((s) => ({ ...s, washScale: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Bloom Strength</span>
                  <span className="font-mono text-red-300">{watercolor.bloomStrength}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="180"
                  value={watercolor.bloomStrength}
                  onChange={(e) => setWatercolor((s) => ({ ...s, bloomStrength: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Diffusion</span>
                  <span className="font-mono text-red-300">{watercolor.diffusion}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="180"
                  value={watercolor.diffusion}
                  onChange={(e) => setWatercolor((s) => ({ ...s, diffusion: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Drying Edges</span>
                  <span className="font-mono text-red-300">{watercolor.edgeContrast}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="200"
                  value={watercolor.edgeContrast}
                  onChange={(e) => setWatercolor((s) => ({ ...s, edgeContrast: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Paper Texture</span>
                  <span className="font-mono text-red-300">{watercolor.paperTooth}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="0"
                  max="100"
                  value={watercolor.paperTooth}
                  onChange={(e) => setWatercolor((s) => ({ ...s, paperTooth: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Flow Speed</span>
                  <span className="font-mono text-red-300">{watercolor.motionSpeed}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="10"
                  max="200"
                  value={watercolor.motionSpeed}
                  onChange={(e) => setWatercolor((s) => ({ ...s, motionSpeed: Number(e.target.value) }))}
                />
              </label>
            </div>
          )}

          {/* SCULPTURAL CONTROLS */}
          {activeTheme === 'sculptural' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs font-semibold text-gray-300">
              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Surface Scale</span>
                  <span className="font-mono text-red-300">{sculptural.surfaceScale}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="40"
                  max="200"
                  value={sculptural.surfaceScale}
                  onChange={(e) => setSculptural((s) => ({ ...s, surfaceScale: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Deformation</span>
                  <span className="font-mono text-red-300">{sculptural.deformation}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="180"
                  value={sculptural.deformation}
                  onChange={(e) => setSculptural((s) => ({ ...s, deformation: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Movement Speed</span>
                  <span className="font-mono text-red-300">{sculptural.movementSpeed}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="10"
                  max="200"
                  value={sculptural.movementSpeed}
                  onChange={(e) => setSculptural((s) => ({ ...s, movementSpeed: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1.5 flex justify-between">
                  <span>Light Intensity</span>
                  <span className="font-mono text-red-300">{sculptural.lightIntensity}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="20"
                  max="180"
                  value={sculptural.lightIntensity}
                  onChange={(e) => setSculptural((s) => ({ ...s, lightIntensity: Number(e.target.value) }))}
                />
              </label>
            </div>
          )}

          {/* LOW POLY CONTROLS */}
          {activeTheme === 'low-poly' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs font-semibold text-gray-300">
              <label>
                <span className="mb-1 flex justify-between">
                  <span>Morph</span>
                  <span className="font-mono text-red-300">{lowPoly.morph}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="0"
                  max="180"
                  value={lowPoly.morph}
                  onChange={(e) => setLowPoly((s) => ({ ...s, morph: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1 flex justify-between">
                  <span>Morph Speed</span>
                  <span className="font-mono text-red-300">{lowPoly.morphSpeed}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="10"
                  max="300"
                  value={lowPoly.morphSpeed}
                  onChange={(e) => setLowPoly((s) => ({ ...s, morphSpeed: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1 flex justify-between">
                  <span>Panel Speed</span>
                  <span className="font-mono text-red-300">{lowPoly.panelSpeed}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="5"
                  max="300"
                  value={lowPoly.panelSpeed}
                  onChange={(e) => setLowPoly((s) => ({ ...s, panelSpeed: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1 flex justify-between">
                  <span>Panel Pulse</span>
                  <span className="font-mono text-red-300">{lowPoly.panelPulse}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="0"
                  max="180"
                  value={lowPoly.panelPulse}
                  onChange={(e) => setLowPoly((s) => ({ ...s, panelPulse: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1 flex justify-between">
                  <span>Panel Flicker</span>
                  <span className="font-mono text-red-300">{lowPoly.panelFlicker}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="0"
                  max="15"
                  value={lowPoly.panelFlicker}
                  onChange={(e) => setLowPoly((s) => ({ ...s, panelFlicker: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1 flex justify-between">
                  <span>Lines</span>
                  <span className="font-mono text-red-300">{lowPoly.lines}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="0"
                  max="100"
                  value={lowPoly.lines}
                  onChange={(e) => setLowPoly((s) => ({ ...s, lines: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1 flex items-center justify-between gap-2">
                  <span>Line Glow</span>
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLowPoly((s) => ({ ...s, glow: s.glow > 0 ? 0 : 15 }))}
                      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide transition ${
                        lowPoly.glow === 0
                          ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      {lowPoly.glow === 0 ? 'Off' : 'On'}
                    </button>
                    <span className="font-mono text-red-300">{lowPoly.glow}%</span>
                  </span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="0"
                  max="100"
                  value={lowPoly.glow}
                  onChange={(e) => setLowPoly((s) => ({ ...s, glow: Number(e.target.value) }))}
                />
              </label>

              <label>
                <span className="mb-1 flex justify-between">
                  <span>Mesh Density</span>
                  <span className="font-mono text-red-300">{lowPoly.density}%</span>
                </span>
                <input
                  className={sliderClass}
                  type="range"
                  min="50"
                  max="200"
                  step="5"
                  value={lowPoly.density}
                  onChange={(e) => setLowPoly((s) => ({ ...s, density: Number(e.target.value) }))}
                />
                <span className="mt-1 block text-[10px] text-gray-500 font-normal">
                  {getLivingBackgroundMeshStats(lowPoly.density).triangles} facets
                </span>
              </label>
            </div>
          )}

          {/* Common Opacity & Blur sliders */}
          <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-x-4 text-xs font-semibold text-gray-300">
            <label>
              <span className="mb-1.5 flex justify-between">
                <span>Opacity</span>
                <span className="font-mono text-red-300">{opacity}%</span>
              </span>
              <input
                className={sliderClass}
                type="range"
                min="25"
                max="100"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
            </label>

            <label>
              <span className="mb-1.5 flex justify-between">
                <span>CSS Blur</span>
                <span className="font-mono text-red-300">{blur}px</span>
              </span>
              <input
                className={sliderClass}
                type="range"
                min="0"
                max="8"
                step="0.5"
                value={blur}
                onChange={(e) => setBlur(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        {/* 6. Performance Diagnostics Readout */}
        <LivingBackgroundDiagnostics
          theme={activeTheme}
          density={lowPoly.density}
          blurPx={blur}
          glow={lowPoly.glow}
          performanceMode={performanceMode}
          lowPolySettings={lowPoly}
          silkSettings={silkRibbons}
          watercolorSettings={watercolor}
        />
        </div>
        )}
      </aside>
    </main>
  );
}
