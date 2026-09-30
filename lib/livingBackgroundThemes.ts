export type LivingBackgroundThemeId =
  | 'low-poly'
  | 'silk-ribbons'
  | 'watercolor'
  | 'silk'
  | 'liquid'
  | 'aurora'
  | 'sculptural';

export type LivingBackgroundPerformanceMode = 'balanced' | 'green';

export type Rgb = readonly [number, number, number];

export type LivingBackgroundPalette = {
  darkA: Rgb;
  darkB: Rgb;
  accentA: Rgb;
  accentB: Rgb;
  accentHot: Rgb;
};

export type LowPolyThemeSettings = {
  opacity: number;       // 25 - 100 (default 64)
  morph: number;         // 0 - 180 (default 101)
  morphSpeed: number;    // 10 - 300 (default 160)
  panelSpeed: number;    // 5 - 300 (default 99)
  panelPulse: number;    // 0 - 180 (default 100)
  panelFlicker: number;  // 0 - 15 (default 7)
  lines: number;         // 0 - 100 (default 0)
  glow: number;          // 0 - 100 (default 41)
  blur: number;          // 0 - 8 (default 2)
  density: number;       // 50 - 200 (default 100)
};

export type SilkRibbonsThemeSettings = {
  ribbonCount: number;    // 3 - 8 (default 5): number of sweeping curved ribbon bands
  curveScale: number;     // 40 - 200 (default 100): amplitude and sweep of curves
  edgeHighlight: number;  // 20 - 180 (default 125): brightness of crisp luminous rim lines
  depthContrast: number;  // 30 - 180 (default 115): darkness of drop shadow gaps between ribbons
  sheenSoftness: number;  // 30 - 180 (default 90): smooth satin gradient roll across ribbon faces
  motionSpeed: number;    // 10 - 200 (default 40): velocity of stately parallax drift
};

// Alias for backwards compatibility
export type SilkThemeSettings = SilkRibbonsThemeSettings;

export type WatercolorThemeSettings = {
  washScale: number;      // 40 - 200 (default 100): scale of irregular watercolor pools
  bloomStrength: number;  // 20 - 180 (default 100): vibrancy and saturation of bloom wash
  diffusion: number;      // 20 - 180 (default 105): balance between soft bleeds and defined edges
  edgeContrast: number;   // 20 - 180 (default 110): intensity of darker coffee-ring drying contours
  paperTooth: number;     // 0 - 100 (default 20): broad, subtle cold-press paper texture
  motionSpeed: number;    // 10 - 200 (default 40): slow breathing drift of wet pigment settling
};

// Alias for backwards compatibility
export type LiquidThemeSettings = WatercolorThemeSettings;

export type SculpturalThemeSettings = {
  surfaceScale: number;    // 40 - 200 (default 100)
  deformation: number;     // 20 - 180 (default 90)
  movementSpeed: number;   // 10 - 200 (default 50)
  lightIntensity: number;  // 20 - 180 (default 95)
};

export type ThemeMetadata = {
  id: LivingBackgroundThemeId;
  label: string;
  tagline: string;
  renderingTech: string;
  domElements: string;
  fpsTarget: number;
  primaryCpuCost: string;
  primaryGpuCost: string;
  filterOverhead: string;
  expectedCost: 'Lowest' | 'Low' | 'Moderate' | 'Heavy';
  mobileSuitability: string;
  reducedMotionBehavior: string;
  description: string;
};

export const THEME_METADATA: Record<LivingBackgroundThemeId, ThemeMetadata> = {
  'silk-ribbons': {
    id: 'silk-ribbons',
    label: 'Silk Ribbons',
    tagline: 'Smooth overlapping dark satin ribbons with illuminated rim edges',
    renderingTech: 'Hardware Canvas (WebGL single quad)',
    domElements: '1 <canvas> node',
    fpsTarget: 24,
    primaryCpuCost: 'Zero (<0.02ms CPU per frame, 0 GC allocations)',
    primaryGpuCost: 'Lowest (~0.18ms GPU fill with layered ribbon manifold)',
    filterOverhead: 'None (analytical ribbon edge highlights & drop shadows)',
    expectedCost: 'Lowest',
    mobileSuitability: 'Flawless (runs with high smoothness on all devices)',
    reducedMotionBehavior: 'Static folded ribbon composition, rAF paused',
    description: 'Multiple cascading dark satin ribbons sweeping across the viewport with deep shadow gaps and subtle illuminated edge crests.',
  },
  watercolor: {
    id: 'watercolor',
    label: 'Watercolor Ink',
    tagline: 'Translucent pools of pigment, organic drying edges, and paper tooth',
    renderingTech: 'Hardware Canvas (WebGL single quad)',
    domElements: '1 <canvas> node',
    fpsTarget: 24,
    primaryCpuCost: 'Zero (<0.02ms CPU per frame, 0 GC allocations)',
    primaryGpuCost: 'Low (~0.25ms GPU fill with procedural drying contours)',
    filterOverhead: 'None (pure analytical pigment bleed in-shader)',
    expectedCost: 'Low',
    mobileSuitability: 'Excellent (resolution-scaled, aspect-ratio corrected)',
    reducedMotionBehavior: 'Static pigment wash at frame 0, rAF paused',
    description: 'Layered pools of watercolor pigment diffusing across textured paper with organic drying contours and luminous edge blooms.',
  },
  'low-poly': {
    id: 'low-poly',
    label: 'Low Poly',
    tagline: 'Angular SVG mesh with breathing facets and edge glow',
    renderingTech: 'Direct SVG DOM',
    domElements: '280 – 600 <polygon> nodes',
    fpsTarget: 18,
    primaryCpuCost: 'Moderate (coordinate string formatting, setAttribute dispatch)',
    primaryGpuCost: 'Moderate to High (<feGaussianBlur> rasterization + CSS blur)',
    filterOverhead: 'High (SVG Gaussian blur filter over 140+ animated paths)',
    expectedCost: 'Moderate',
    mobileSuitability: 'Fair (can hitch on older mobile if glow filter is high)',
    reducedMotionBehavior: 'Static mesh rendered at frame 0, rAF paused',
    description: 'The production baseline: an angular field of drifting triangles that breathes slowly and wakes up in crimson.',
  },
  silk: {
    id: 'silk',
    label: 'Silk Ribbons',
    tagline: 'Smooth overlapping dark satin ribbons with illuminated rim edges',
    renderingTech: 'Hardware Canvas (WebGL single quad)',
    domElements: '1 <canvas> node',
    fpsTarget: 24,
    primaryCpuCost: 'Zero (<0.02ms CPU per frame, 0 GC allocations)',
    primaryGpuCost: 'Lowest (~0.18ms GPU fill with layered ribbon manifold)',
    filterOverhead: 'None (analytical ribbon edge highlights & drop shadows)',
    expectedCost: 'Lowest',
    mobileSuitability: 'Flawless (runs with high smoothness on all devices)',
    reducedMotionBehavior: 'Static folded ribbon composition, rAF paused',
    description: 'Multiple cascading dark satin ribbons sweeping across the viewport with deep shadow gaps and subtle illuminated edge crests.',
  },
  liquid: {
    id: 'liquid',
    label: 'Watercolor Ink',
    tagline: 'Translucent pools of pigment, organic drying edges, and paper tooth',
    renderingTech: 'Hardware Canvas (WebGL single quad)',
    domElements: '1 <canvas> node',
    fpsTarget: 24,
    primaryCpuCost: 'Zero (<0.02ms CPU per frame, 0 GC allocations)',
    primaryGpuCost: 'Low (~0.25ms GPU fill with procedural drying contours)',
    filterOverhead: 'None (pure analytical pigment bleed in-shader)',
    expectedCost: 'Low',
    mobileSuitability: 'Excellent (resolution-scaled, aspect-ratio corrected)',
    reducedMotionBehavior: 'Static pigment wash at frame 0, rAF paused',
    description: 'Layered pools of watercolor pigment diffusing across textured paper with organic drying contours and luminous edge blooms.',
  },
  aurora: {
    id: 'aurora',
    label: 'Aurora Atmosphere',
    tagline: 'Slow drifting clouds of atmospheric architectural light',
    renderingTech: 'Hardware Canvas (WebGL single quad)',
    domElements: '1 <canvas> node',
    fpsTarget: 20,
    primaryCpuCost: 'Zero (<0.01ms CPU per frame, 0 GC allocations)',
    primaryGpuCost: 'Lowest (~0.15ms GPU fill)',
    filterOverhead: 'None (smooth polynomial falloff, no CSS/SVG filters)',
    expectedCost: 'Lowest',
    mobileSuitability: 'Flawless (runs comfortably on any mobile or tablet)',
    reducedMotionBehavior: 'Single static atmospheric frame, rAF paused',
    description: 'Subtle, soft fields of hero-derived ambient light that drift on non-repeating Lissajous orbits with deep graphite negative space.',
  },
  sculptural: {
    id: 'sculptural',
    label: 'Soft Sculptural',
    tagline: 'Matte 3D architectural topography with soft directional lighting',
    renderingTech: 'Hardware Canvas (WebGL single quad)',
    domElements: '1 <canvas> node',
    fpsTarget: 22,
    primaryCpuCost: 'Zero (<0.02ms CPU per frame, 0 GC allocations)',
    primaryGpuCost: 'Ultra-low (~0.25ms GPU fill)',
    filterOverhead: 'None (wrapped diffuse + ambient occlusion in-shader)',
    expectedCost: 'Low',
    mobileSuitability: 'Excellent (broad geometry prevents aliasing)',
    reducedMotionBehavior: 'Static relief sculpture, rAF paused',
    description: 'A continuous satin/matte basalt surface that deforms slowly like a living architectural relief without visible triangle facets.',
  },
};

export const DEFAULT_LOW_POLY_SETTINGS: LowPolyThemeSettings = {
  opacity: 64,
  morph: 101,
  morphSpeed: 160,
  panelSpeed: 99,
  panelPulse: 100,
  panelFlicker: 7,
  lines: 0,
  glow: 41,
  blur: 2,
  density: 100,
};

export const DEFAULT_SILK_RIBBONS_SETTINGS: SilkRibbonsThemeSettings = {
  ribbonCount: 5,
  curveScale: 100,
  edgeHighlight: 125,
  depthContrast: 115,
  sheenSoftness: 90,
  motionSpeed: 40,
};

export const DEFAULT_SILK_SETTINGS: SilkRibbonsThemeSettings = DEFAULT_SILK_RIBBONS_SETTINGS;

export const DEFAULT_WATERCOLOR_SETTINGS: WatercolorThemeSettings = {
  washScale: 100,
  bloomStrength: 100,
  diffusion: 105,
  edgeContrast: 110,
  paperTooth: 20,
  motionSpeed: 40,
};

export const DEFAULT_LIQUID_SETTINGS: WatercolorThemeSettings = DEFAULT_WATERCOLOR_SETTINGS;

export const DEFAULT_AURORA_SETTINGS: AuroraThemeSettings = {
  driftSpeed: 60,
  fieldScale: 115,
  colorStrength: 85,
  softness: 120,
};

export const DEFAULT_SCULPTURAL_SETTINGS: SculpturalThemeSettings = {
  surfaceScale: 100,
  deformation: 90,
  movementSpeed: 50,
  lightIntensity: 95,
};

export const DEFAULT_SWINGSPHERE_PALETTE: LivingBackgroundPalette = {
  darkA: [4, 5, 7] as const,       // Obsidian graphite
  darkB: [43, 45, 50] as const,     // Slate charcoal
  accentA: [31, 3, 8] as const,     // Deep crimson shadow
  accentB: [130, 8, 24] as const,   // SwingSphere burgundy signal
  accentHot: [209, 20, 48] as const,// High-signal ruby crest
};

export type PalettePreset = {
  id: string;
  name: string;
  tagline: string;
  palette: LivingBackgroundPalette;
};

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'swingsphere-crimson',
    name: 'SwingSphere Signature',
    tagline: 'Deep graphite & ruby crimson',
    palette: DEFAULT_SWINGSPHERE_PALETTE,
  },
  {
    id: 'tokyo-magenta',
    name: 'Nocturne Velvet',
    tagline: 'Electric violet & deep magenta',
    palette: {
      darkA: [5, 4, 10],
      darkB: [38, 32, 54],
      accentA: [42, 6, 48],
      accentB: [142, 22, 120],
      accentHot: [225, 48, 185],
    },
  },
  {
    id: 'amber-speakeasy',
    name: 'Amber Speakeasy',
    tagline: 'Smoked oak, warm cognac & gold',
    palette: {
      darkA: [8, 6, 4],
      darkB: [52, 42, 30],
      accentA: [55, 32, 8],
      accentB: [168, 98, 22],
      accentHot: [235, 165, 45],
    },
  },
  {
    id: 'cobalt-midnight',
    name: 'Cobalt Lounge',
    tagline: 'Midnight navy & electric sapphire',
    palette: {
      darkA: [3, 6, 12],
      darkB: [26, 38, 60],
      accentA: [6, 28, 65],
      accentB: [24, 88, 180],
      accentHot: [45, 145, 240],
    },
  },
  {
    id: 'emerald-sanctuary',
    name: 'Emerald Sanctuary',
    tagline: 'Dark jade & deep forest moss',
    palette: {
      darkA: [3, 8, 6],
      darkB: [24, 48, 38],
      accentA: [6, 45, 28],
      accentB: [18, 125, 78],
      accentHot: [42, 195, 128],
    },
  },
];
