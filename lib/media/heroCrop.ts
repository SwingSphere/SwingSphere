import type { MediaAsset } from './types';

export type HeroViewport = 'desktop' | 'tablet' | 'mobile';
export type HeroViewportKey = HeroViewport;
export type HeroFitMode = 'fill' | 'fit';
export type HeroEditScope = 'all' | HeroViewport;

export const HERO_RECOMMENDED_MIN_WIDTH = 1200;
export const HERO_RECOMMENDED_MIN_HEIGHT = 540;

export const HERO_VIEWPORT_LABELS: Record<HeroViewport, string> = {
  desktop: 'Desktop (20:9)',
  tablet: 'Tablet (16:9)',
  mobile: 'Mobile (4:3)',
};

export interface HeroViewportFraming {
  /** Horizontal focal/pan position in [0, 100], where 50 is centered. */
  focalX: number;
  /** Vertical focal/pan position in [0, 100], where 50 is centered. */
  focalY: number;
  /** Zoom multiplier >= 1 in 'fill' mode (1 = cover without borders). */
  zoom: number;
  /** 'fill' covers the container without empty borders; 'fit' contains the entire image. */
  fitMode: HeroFitMode;
}

export interface HeroCropConfig extends HeroViewportFraming {
  version: 1;
  targetRatio: '20:9';
  sourceWidth?: number;
  sourceHeight?: number;
  viewports?: Partial<Record<HeroViewport, Partial<HeroViewportFraming>>>;
}

export interface HeroViewportRatioSpec {
  viewport: HeroViewport;
  label: string;
  ratioText: string;
  cssAspectRatio: string;
  numeric: number;
  widthUnits: number;
  heightUnits: number;
  description: string;
}

export const HERO_VIEWPORT_RATIOS: Record<HeroViewport, HeroViewportRatioSpec> = {
  desktop: {
    viewport: 'desktop',
    label: 'Desktop',
    ratioText: '20:9',
    cssAspectRatio: '20 / 9',
    numeric: 20 / 9,
    widthUnits: 20,
    heightUnits: 9,
    description: '20:9 wide hero container (2.22:1)',
  },
  tablet: {
    viewport: 'tablet',
    label: 'Tablet',
    ratioText: '16:9',
    cssAspectRatio: '16 / 9',
    numeric: 16 / 9,
    widthUnits: 16,
    heightUnits: 9,
    description: '16:9 tablet hero container (1.78:1)',
  },
  mobile: {
    viewport: 'mobile',
    label: 'Mobile',
    ratioText: '4:3',
    cssAspectRatio: '4 / 3',
    numeric: 4 / 3,
    widthUnits: 4,
    heightUnits: 3,
    description: '4:3 mobile hero container (1.33:1)',
  },
};

export const DEFAULT_HERO_VIEWPORT_FRAMING: HeroViewportFraming = {
  focalX: 50,
  focalY: 50,
  zoom: 1,
  fitMode: 'fill',
};

export const DEFAULT_HERO_CROP: HeroCropConfig = {
  version: 1,
  targetRatio: '20:9',
  ...DEFAULT_HERO_VIEWPORT_FRAMING,
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const normalizeViewportFraming = (
  input?: Partial<HeroViewportFraming> | null,
  fallback: HeroViewportFraming = DEFAULT_HERO_VIEWPORT_FRAMING,
): HeroViewportFraming => {
  const fitMode: HeroFitMode = input?.fitMode === 'fit' ? 'fit' : input?.fitMode === 'fill' ? 'fill' : fallback.fitMode;
  const minZoom = fitMode === 'fit' ? 0.5 : 1;
  const rawZoom = typeof input?.zoom === 'number' && Number.isFinite(input.zoom) ? input.zoom : fallback.zoom;
  const rawX = typeof input?.focalX === 'number' && Number.isFinite(input.focalX) ? input.focalX : fallback.focalX;
  const rawY = typeof input?.focalY === 'number' && Number.isFinite(input.focalY) ? input.focalY : fallback.focalY;

  return {
    focalX: round2(clamp(rawX, 0, 100)),
    focalY: round2(clamp(rawY, 0, 100)),
    zoom: round2(clamp(rawZoom, minZoom, 4)),
    fitMode,
  };
};

export const normalizeHeroCrop = (input?: Partial<HeroCropConfig> | null): HeroCropConfig => {
  if (!input) return { ...DEFAULT_HERO_CROP };
  const base = normalizeViewportFraming(input, DEFAULT_HERO_VIEWPORT_FRAMING);
  const viewports: Partial<Record<HeroViewport, Partial<HeroViewportFraming>>> = {};

  if (input.viewports && typeof input.viewports === 'object') {
    (['desktop', 'tablet', 'mobile'] as const).forEach((vp) => {
      const vpInput = input.viewports?.[vp];
      if (vpInput && typeof vpInput === 'object') {
        const normalizedVp = normalizeViewportFraming(vpInput, base);
        viewports[vp] = normalizedVp;
      }
    });
  }

  const sourceWidth =
    typeof input.sourceWidth === 'number' && Number.isFinite(input.sourceWidth) && input.sourceWidth > 0
      ? Math.round(input.sourceWidth)
      : undefined;
  const sourceHeight =
    typeof input.sourceHeight === 'number' && Number.isFinite(input.sourceHeight) && input.sourceHeight > 0
      ? Math.round(input.sourceHeight)
      : undefined;

  return {
    version: 1,
    targetRatio: '20:9',
    ...base,
    ...(sourceWidth ? { sourceWidth } : {}),
    ...(sourceHeight ? { sourceHeight } : {}),
    ...(Object.keys(viewports).length > 0 ? { viewports } : {}),
  };
};

export const normalizeHeroCropConfig = normalizeHeroCrop;

export const hasCustomHeroCrop = (crop?: Partial<HeroCropConfig> | null): boolean => {
  if (!crop) return false;
  const normalized = normalizeHeroCrop(crop);
  if (
    Math.abs(normalized.focalX - 50) > 0.05 ||
    Math.abs(normalized.focalY - 50) > 0.05 ||
    Math.abs(normalized.zoom - 1) > 0.01 ||
    normalized.fitMode !== 'fill'
  ) {
    return true;
  }
  if (normalized.viewports && Object.keys(normalized.viewports).length > 0) {
    return true;
  }
  return false;
};

export const hasViewportOverride = (
  crop: Partial<HeroCropConfig> | null | undefined,
  viewport: HeroViewport,
): boolean => {
  return Boolean(crop?.viewports?.[viewport]);
};

export const resolveViewportFraming = (
  crop: Partial<HeroCropConfig> | null | undefined,
  viewport: HeroViewport,
): HeroViewportFraming => {
  const normalized = normalizeHeroCrop(crop);
  const override = normalized.viewports?.[viewport];
  if (!override) {
    return {
      focalX: normalized.focalX,
      focalY: normalized.focalY,
      zoom: normalized.zoom,
      fitMode: normalized.fitMode,
    };
  }
  return normalizeViewportFraming(override, {
    focalX: normalized.focalX,
    focalY: normalized.focalY,
    zoom: normalized.zoom,
    fitMode: normalized.fitMode,
  });
};

export interface HeroVisibleRectResult {
  /** Normalized left edge in [0, 1] of source image */
  xMin: number;
  /** Normalized top edge in [0, 1] of source image */
  yMin: number;
  /** Normalized right edge in [0, 1] of source image */
  xMax: number;
  /** Normalized bottom edge in [0, 1] of source image */
  yMax: number;
  /** Alias for xMin in [0, 1] */
  left: number;
  /** Alias for yMin in [0, 1] */
  top: number;
  /** Alias for visibleWidthFraction in [0, 1] */
  width: number;
  /** Alias for visibleHeightFraction in [0, 1] */
  height: number;
  /** Fraction of source width visible in [0, 1] */
  visibleWidthFraction: number;
  /** Fraction of source height visible in [0, 1] */
  visibleHeightFraction: number;
  /** Percentage of total source image area visible in [0, 100] */
  visibleAreaPercent: number;
  /** Rendered image width divided by container width */
  renderWidthFactor: number;
  /** Rendered image height divided by container height */
  renderHeightFactor: number;
}

/**
 * Computes the exact normalized visible crop rectangle [xMin, xMax] x [yMin, yMax]
 * of the source image inside a hero container of `containerAspect`.
 *
 * This matches the CSS rendering of `SharedHeroImage`:
 *   object-fit: cover | contain;
 *   object-position: ${focalX}% ${focalY}%;
 *   transform-origin: ${focalX}% ${focalY}%;
 *   transform: scale(${zoom});
 */
export function computeHeroVisibleRect(params: {
  sourceAspect: number;
  containerAspect: number;
  framing: HeroViewportFraming;
}): HeroVisibleRectResult;
export function computeHeroVisibleRect(
  sourceWidth: number,
  sourceHeight: number,
  containerAspectOrSpec: number | { numeric: number },
  framing: HeroViewportFraming,
): HeroVisibleRectResult;
export function computeHeroVisibleRect(
  arg1:
    | {
        sourceAspect: number;
        containerAspect: number;
        framing: HeroViewportFraming;
      }
    | number,
  arg2?: number,
  arg3?: number | { numeric: number },
  arg4?: HeroViewportFraming,
): HeroVisibleRectResult {
  let sourceAspect: number;
  let containerAspect: number;
  let framingInput: HeroViewportFraming;

  if (typeof arg1 === 'object' && arg1 !== null) {
    sourceAspect = arg1.sourceAspect;
    containerAspect = arg1.containerAspect;
    framingInput = arg1.framing;
  } else {
    const sw = typeof arg1 === 'number' && arg1 > 0 ? arg1 : 1920;
    const sh = typeof arg2 === 'number' && arg2 > 0 ? arg2 : 1080;
    sourceAspect = sw / sh;
    containerAspect =
      typeof arg3 === 'number'
        ? arg3
        : arg3 && typeof arg3 === 'object' && typeof arg3.numeric === 'number'
          ? arg3.numeric
          : 20 / 9;
    framingInput = arg4 ?? { focalX: 50, focalY: 50, zoom: 1, fitMode: 'fill' };
  }

  const safeSourceAspect =
    Number.isFinite(sourceAspect) && sourceAspect > 0 ? sourceAspect : 16 / 9;
  const safeContainerAspect =
    Number.isFinite(containerAspect) && containerAspect > 0 ? containerAspect : 20 / 9;
  const framing = normalizeViewportFraming(framingInput);

  if (framing.fitMode === 'fit') {
    const baseRw = safeSourceAspect >= safeContainerAspect ? 1 : safeSourceAspect / safeContainerAspect;
    const baseRh = safeSourceAspect >= safeContainerAspect ? safeContainerAspect / safeSourceAspect : 1;
    const renderWidthFactor = baseRw * framing.zoom;
    const renderHeightFactor = baseRh * framing.zoom;
    const visibleWidthFraction = clamp(1 / Math.max(1, renderWidthFactor), 0, 1);
    const visibleHeightFraction = clamp(1 / Math.max(1, renderHeightFactor), 0, 1);
    const xMin = (framing.focalX / 100) * (1 - visibleWidthFraction);
    const yMin = (framing.focalY / 100) * (1 - visibleHeightFraction);
    return {
      xMin,
      yMin,
      xMax: xMin + visibleWidthFraction,
      yMax: yMin + visibleHeightFraction,
      left: xMin,
      top: yMin,
      width: visibleWidthFraction,
      height: visibleHeightFraction,
      visibleWidthFraction,
      visibleHeightFraction,
      visibleAreaPercent: Math.round(visibleWidthFraction * visibleHeightFraction * 100),
      renderWidthFactor,
      renderHeightFactor,
    };
  }

  // 'fill' (cover) mode:
  // At zoom = 1, the smaller dimension matches the container (factor = 1)
  // and the larger dimension overflows by the aspect ratio quotient.
  const baseRw = safeSourceAspect >= safeContainerAspect ? safeSourceAspect / safeContainerAspect : 1;
  const baseRh = safeSourceAspect < safeContainerAspect ? safeContainerAspect / safeSourceAspect : 1;

  const renderWidthFactor = baseRw * framing.zoom;
  const renderHeightFactor = baseRh * framing.zoom;

  const visibleWidthFraction = clamp(1 / renderWidthFactor, 0, 1);
  const visibleHeightFraction = clamp(1 / renderHeightFactor, 0, 1);

  const xMin = clamp((framing.focalX / 100) * (1 - visibleWidthFraction), 0, 1 - visibleWidthFraction);
  const yMin = clamp((framing.focalY / 100) * (1 - visibleHeightFraction), 0, 1 - visibleHeightFraction);

  return {
    xMin,
    yMin,
    xMax: xMin + visibleWidthFraction,
    yMax: yMin + visibleHeightFraction,
    left: xMin,
    top: yMin,
    width: visibleWidthFraction,
    height: visibleHeightFraction,
    visibleWidthFraction,
    visibleHeightFraction,
    visibleAreaPercent: Math.round(visibleWidthFraction * visibleHeightFraction * 100),
    renderWidthFactor,
    renderHeightFactor,
  };
}

/**
 * Converts a pointer drag delta (in container pixels) into updated (focalX, focalY)
 * so that the image tracks the user's cursor 1:1.
 */
export function applyDragDeltaToFraming(params: {
  framing: HeroViewportFraming;
  deltaX: number;
  deltaY: number;
  containerWidth: number;
  containerHeight: number;
  sourceAspect: number;
}): HeroViewportFraming;
export function applyDragDeltaToFraming(
  framing: HeroViewportFraming,
  deltaX: number,
  deltaY: number,
  containerWidth: number,
  containerHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  containerAspectOrSpec?: number | { numeric: number },
): HeroViewportFraming;
export function applyDragDeltaToFraming(
  arg1:
    | {
        framing: HeroViewportFraming;
        deltaX: number;
        deltaY: number;
        containerWidth: number;
        containerHeight: number;
        sourceAspect: number;
      }
    | HeroViewportFraming,
  deltaXArg?: number,
  deltaYArg?: number,
  containerWidthArg?: number,
  containerHeightArg?: number,
  sourceWidthArg?: number,
  sourceHeightArg?: number,
): HeroViewportFraming {
  let framing: HeroViewportFraming;
  let deltaX: number;
  let deltaY: number;
  let containerWidth: number;
  let containerHeight: number;
  let sourceAspect: number;

  if ('deltaX' in arg1 && 'containerWidth' in arg1) {
    framing = arg1.framing;
    deltaX = arg1.deltaX;
    deltaY = arg1.deltaY;
    containerWidth = arg1.containerWidth;
    containerHeight = arg1.containerHeight;
    sourceAspect = arg1.sourceAspect;
  } else {
    framing = arg1;
    deltaX = deltaXArg ?? 0;
    deltaY = deltaYArg ?? 0;
    containerWidth = containerWidthArg ?? 0;
    containerHeight = containerHeightArg ?? 0;
    const sw = sourceWidthArg && sourceWidthArg > 0 ? sourceWidthArg : 1920;
    const sh = sourceHeightArg && sourceHeightArg > 0 ? sourceHeightArg : 1080;
    sourceAspect = sw / sh;
  }

  if (containerWidth <= 0 || containerHeight <= 0) return framing;

  const containerAspect = containerWidth / containerHeight;
  const rect = computeHeroVisibleRect({
    sourceAspect,
    containerAspect,
    framing,
  });

  const overflowWidthPx = (rect.renderWidthFactor - 1) * containerWidth;
  const overflowHeightPx = (rect.renderHeightFactor - 1) * containerHeight;

  const nextFocalX =
    overflowWidthPx > 0.5 ? framing.focalX - (deltaX / overflowWidthPx) * 100 : framing.focalX;
  const nextFocalY =
    overflowHeightPx > 0.5 ? framing.focalY - (deltaY / overflowHeightPx) * 100 : framing.focalY;

  return normalizeViewportFraming({
    ...framing,
    focalX: nextFocalX,
    focalY: nextFocalY,
  });
}

export const computeCenterFraming = (framing: HeroViewportFraming): HeroViewportFraming =>
  normalizeViewportFraming({
    ...framing,
    focalX: 50,
    focalY: 50,
  });

export const computeFitFraming = (): HeroViewportFraming => ({
  focalX: 50,
  focalY: 50,
  zoom: 1,
  fitMode: 'fit',
});

export const computeFillFraming = (): HeroViewportFraming => ({
  focalX: 50,
  focalY: 50,
  zoom: 1,
  fitMode: 'fill',
});

const gcd = (a: number, b: number): number => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
};

export const formatAspectRatioLabel = (width?: number, height?: number): string => {
  if (!width || !height || width <= 0 || height <= 0) return 'Unknown';
  const ratio = width / height;
  const knownRatios: Array<{ label: string; value: number }> = [
    { label: '20:9', value: 20 / 9 },
    { label: '21:9', value: 21 / 9 },
    { label: '16:9', value: 16 / 9 },
    { label: '16:10', value: 16 / 10 },
    { label: '3:2', value: 3 / 2 },
    { label: '4:3', value: 4 / 3 },
    { label: '1:1', value: 1 },
    { label: '4:5', value: 4 / 5 },
    { label: '3:4', value: 3 / 4 },
    { label: '2:3', value: 2 / 3 },
    { label: '9:16', value: 9 / 16 },
  ];

  for (const candidate of knownRatios) {
    if (Math.abs(ratio - candidate.value) <= 0.03) {
      return `${candidate.label} (${ratio.toFixed(2)}:1)`;
    }
  }

  const divisor = gcd(width, height);
  const wUnits = Math.round(width / divisor);
  const hUnits = Math.round(height / divisor);
  if (wUnits <= 32 && hUnits <= 32) {
    return `${wUnits}:${hUnits} (${ratio.toFixed(2)}:1)`;
  }
  return `${ratio.toFixed(2)}:1`;
};

const HASH_PREFIX = 'ss-crop=';

/**
 * Removes any `#ss-crop=...` fragment from a URL while preserving the base URL.
 */
export const stripHeroCropFromUrl = (url?: string | null): string => {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx < 0) return trimmed;
  const base = trimmed.slice(0, hashIdx);
  const hash = trimmed.slice(hashIdx + 1);
  if (!hash.includes(HASH_PREFIX)) return trimmed;

  const params = new URLSearchParams(hash);
  params.delete('ss-crop');
  const remaining = params.toString();
  return remaining ? `${base}#${remaining}` : base;
};

/**
 * Serializes a HeroCropConfig into a compact URL fragment `#ss-crop=...`
 * so entities whose database tables only store `header_image_url` (text)
 * durably persist their full non-destructive framing across page reloads.
 */
export const serializeHeroCropParam = (crop?: Partial<HeroCropConfig> | null): string => {
  const normalized = normalizeHeroCrop(crop);
  const payload: Record<string, unknown> = {
    x: normalized.focalX,
    y: normalized.focalY,
    z: normalized.zoom,
    m: normalized.fitMode,
  };
  if (normalized.sourceWidth && normalized.sourceHeight) {
    payload.w = normalized.sourceWidth;
    payload.h = normalized.sourceHeight;
  }
  if (normalized.viewports && Object.keys(normalized.viewports).length > 0) {
    const vpCompact: Record<string, unknown> = {};
    (['desktop', 'tablet', 'mobile'] as const).forEach((vp) => {
      const o = normalized.viewports?.[vp];
      if (o) {
        const normO = normalizeViewportFraming(o, normalized);
        vpCompact[vp[0]] = {
          x: normO.focalX,
          y: normO.focalY,
          z: normO.zoom,
          m: normO.fitMode,
        };
      }
    });
    if (Object.keys(vpCompact).length > 0) {
      payload.v = vpCompact;
    }
  }
  return encodeURIComponent(JSON.stringify(payload));
};

export const deserializeHeroCropParam = (rawParam?: string | null): HeroCropConfig | null => {
  if (!rawParam || typeof rawParam !== 'string') return null;
  try {
    const decoded = decodeURIComponent(rawParam);
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object') return null;

    const viewports: Partial<Record<HeroViewport, Partial<HeroViewportFraming>>> = {};
    if (parsed.v && typeof parsed.v === 'object') {
      const mapKey: Record<string, HeroViewport> = {
        d: 'desktop',
        t: 'tablet',
        m: 'mobile',
        desktop: 'desktop',
        tablet: 'tablet',
        mobile: 'mobile',
      };
      for (const [k, val] of Object.entries(parsed.v)) {
        const vp = mapKey[k];
        if (vp && val && typeof val === 'object') {
          const vObj = val as Record<string, unknown>;
          viewports[vp] = {
            focalX: typeof vObj.x === 'number' ? vObj.x : typeof vObj.focalX === 'number' ? vObj.focalX : undefined,
            focalY: typeof vObj.y === 'number' ? vObj.y : typeof vObj.focalY === 'number' ? vObj.focalY : undefined,
            zoom: typeof vObj.z === 'number' ? vObj.z : typeof vObj.zoom === 'number' ? vObj.zoom : undefined,
            fitMode: (vObj.m === 'fit' || vObj.fitMode === 'fit') ? 'fit' : 'fill',
          };
        }
      }
    } else if (parsed.viewports && typeof parsed.viewports === 'object') {
      Object.assign(viewports, parsed.viewports);
    }

    return normalizeHeroCrop({
      focalX: typeof parsed.x === 'number' ? parsed.x : parsed.focalX,
      focalY: typeof parsed.y === 'number' ? parsed.y : parsed.focalY,
      zoom: typeof parsed.z === 'number' ? parsed.z : parsed.zoom,
      fitMode: parsed.m === 'fit' || parsed.fitMode === 'fit' ? 'fit' : 'fill',
      sourceWidth: typeof parsed.w === 'number' ? parsed.w : parsed.sourceWidth,
      sourceHeight: typeof parsed.h === 'number' ? parsed.h : parsed.sourceHeight,
      ...(Object.keys(viewports).length > 0 ? { viewports } : {}),
    });
  } catch {
    return null;
  }
};

export const extractHeroCropFromUrl = (
  url?: string | null,
): { cleanUrl: string; crop: HeroCropConfig | null } => {
  if (typeof url !== 'string' || !url.trim()) {
    return { cleanUrl: '', crop: null };
  }
  const trimmed = url.trim();
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx < 0) {
    return { cleanUrl: trimmed, crop: null };
  }
  const hash = trimmed.slice(hashIdx + 1);
  if (!hash.includes(HASH_PREFIX)) {
    return { cleanUrl: trimmed, crop: null };
  }
  const params = new URLSearchParams(hash);
  const rawCrop = params.get('ss-crop');
  const crop = deserializeHeroCropParam(rawCrop);
  return {
    cleanUrl: stripHeroCropFromUrl(trimmed),
    crop,
  };
};

export const encodeHeroCropToUrl = (
  url: string,
  crop?: Partial<HeroCropConfig> | null,
): string => {
  const cleanUrl = stripHeroCropFromUrl(url);
  if (!cleanUrl) return '';
  if (!crop) return cleanUrl;

  const normalized = normalizeHeroCrop(crop);
  const hasMetadata =
    hasCustomHeroCrop(normalized) ||
    Boolean(normalized.sourceWidth && normalized.sourceHeight);
  if (!hasMetadata) return cleanUrl;

  const serialized = serializeHeroCropParam(normalized);
  const hashIdx = cleanUrl.indexOf('#');
  if (hashIdx < 0) {
    return `${cleanUrl}#${HASH_PREFIX}${serialized}`;
  }
  return `${cleanUrl}&${HASH_PREFIX}${serialized}`;
};

/**
 * Resolves the effective HeroCropConfig for an entity or URL, checking:
 * 1. Explicit `explicitCrop`
 * 2. `#ss-crop=` encoded in `imageUrl` or `entity.headerImageUrl`
 * 3. `entity.heroCrop`
 * 4. `entity.mediaAssets` (`role === 'hero' | 'cover'`) `hero_crop` or `focal_point_x`/`focal_point_y`
 * 5. `DEFAULT_HERO_CROP`
 */
export const resolveEntityHeroCrop = (
  entity?: {
    headerImageUrl?: string | null;
    heroCrop?: Partial<HeroCropConfig> | null;
    mediaAssets?: MediaAsset[] | null;
  } | null,
  imageUrl?: string | null,
  explicitCrop?: Partial<HeroCropConfig> | null,
): HeroCropConfig => {
  if (explicitCrop) {
    return normalizeHeroCrop(explicitCrop);
  }

  const fromImageUrl = extractHeroCropFromUrl(imageUrl).crop;
  if (fromImageUrl) {
    return fromImageUrl;
  }

  if (entity?.heroCrop) {
    return normalizeHeroCrop(entity.heroCrop);
  }

  const fromEntityHeaderUrl = extractHeroCropFromUrl(entity?.headerImageUrl).crop;
  if (fromEntityHeaderUrl) {
    return fromEntityHeaderUrl;
  }

  const heroAssets = (entity?.mediaAssets ?? []).filter(
    (asset) => (asset.role === 'hero' || asset.role === 'cover') && asset.status !== 'rejected',
  );
  const latestHeroAsset = heroAssets[heroAssets.length - 1];
  if (latestHeroAsset) {
    if (latestHeroAsset.hero_crop) {
      return normalizeHeroCrop(latestHeroAsset.hero_crop);
    }
    if (
      typeof latestHeroAsset.focal_point_x === 'number' ||
      typeof latestHeroAsset.focal_point_y === 'number'
    ) {
      return normalizeHeroCrop({
        focalX:
          typeof latestHeroAsset.focal_point_x === 'number'
            ? latestHeroAsset.focal_point_x <= 1 && latestHeroAsset.focal_point_x >= 0 && latestHeroAsset.focal_point_x !== 0.5
              ? latestHeroAsset.focal_point_x * 100
              : latestHeroAsset.focal_point_x
            : 50,
        focalY:
          typeof latestHeroAsset.focal_point_y === 'number'
            ? latestHeroAsset.focal_point_y <= 1 && latestHeroAsset.focal_point_y >= 0 && latestHeroAsset.focal_point_y !== 0.5
              ? latestHeroAsset.focal_point_y * 100
              : latestHeroAsset.focal_point_y
            : 50,
      });
    }
  }

  return { ...DEFAULT_HERO_CROP };
};

export interface HeroFramingWarning {
  id: string;
  code: string;
  level: 'warning' | 'info';
  severity: 'warning' | 'info';
  title: string;
  message: string;
}

export function evaluateHeroFramingWarnings(params: {
  crop: Partial<HeroCropConfig>;
  sourceWidth?: number;
  sourceHeight?: number;
  activeViewport: HeroViewport;
}): HeroFramingWarning[];
export function evaluateHeroFramingWarnings(
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  crop: Partial<HeroCropConfig>,
  activeViewport?: HeroViewport,
): HeroFramingWarning[];
export function evaluateHeroFramingWarnings(
  arg1:
    | {
        crop: Partial<HeroCropConfig>;
        sourceWidth?: number;
        sourceHeight?: number;
        activeViewport: HeroViewport;
      }
    | number
    | undefined,
  arg2?: number,
  arg3?: Partial<HeroCropConfig>,
  arg4?: HeroViewport,
): HeroFramingWarning[] {
  const params =
    typeof arg1 === 'object' && arg1 !== null
      ? arg1
      : {
          sourceWidth: arg1,
          sourceHeight: arg2,
          crop: arg3 ?? DEFAULT_HERO_CROP,
          activeViewport: arg4 ?? 'desktop',
        };

  const warnings: HeroFramingWarning[] = [];
  const normalized = normalizeHeroCrop(params.crop);
  const sw = params.sourceWidth ?? normalized.sourceWidth ?? 0;
  const sh = params.sourceHeight ?? normalized.sourceHeight ?? 0;
  const sourceAspect = sw > 0 && sh > 0 ? sw / sh : 16 / 9;

  const activeFraming = resolveViewportFraming(normalized, params.activeViewport);
  const activeRatio = HERO_VIEWPORT_RATIOS[params.activeViewport].numeric;
  const activeRect = computeHeroVisibleRect({
    sourceAspect,
    containerAspect: activeRatio,
    framing: activeFraming,
  });

  // 1. Source image resolution check
  if (sw > 0 && sh > 0) {
    if (sw < 1200 || sh < 500) {
      warnings.push({
        id: 'low-source-resolution',
        code: 'low-source-resolution',
        level: 'warning',
        severity: 'warning',
        title: 'Low source resolution',
        message: `Original image is ${sw} × ${sh} px. Recommended hero resolution is at least 1920 × 864 px (minimum 1200 × 540 px) for crisp desktop display.`,
      });
    } else {
      const effectiveWidth = Math.round(sw * activeRect.visibleWidthFraction);
      const effectiveHeight = Math.round(sh * activeRect.visibleHeightFraction);
      if (params.activeViewport === 'desktop' && effectiveWidth < 1120) {
        warnings.push({
          id: 'zoom-resolution-softness',
          code: 'zoom-resolution-softness',
          level: 'warning',
          severity: 'warning',
          title: 'High zoom reduces sharpness',
          message: `Current zoom leaves ${effectiveWidth} × ${effectiveHeight} px visible across a 1120 px desktop hero container.`,
        });
      }
    }
  }

  // 2. Overlay collision warnings (logo at top-left, title at bottom-left, thumbnails at right)
  if (activeFraming.fitMode === 'fill') {
    if (activeFraming.focalY > 78 && activeFraming.focalX < 65) {
      warnings.push({
        id: 'bottom-title-overlay',
        code: 'bottom-title-overlay',
        level: 'info',
        severity: 'info',
        title: 'Subject near lower title overlay',
        message:
          'The lower-left region carries the listing title, location, and tags over a contrast gradient. Verify key faces or text are not obscured.',
      });
    }
    if (activeFraming.focalY < 22 && activeFraming.focalX < 25) {
      warnings.push({
        id: 'top-left-logo-overlay',
        code: 'top-left-logo-overlay',
        level: 'info',
        severity: 'info',
        title: 'Subject near top-left logo badge',
        message:
          'The top-left corner displays the entity logo badge. Keep key faces or brand marks toward the center safe area.',
      });
    }
  }

  // 3. Mobile horizontal crop warning when editing desktop/all views without mobile override
  const mobileFraming = resolveViewportFraming(normalized, 'mobile');
  const desktopFraming = resolveViewportFraming(normalized, 'desktop');
  const desktopRect = computeHeroVisibleRect({
    sourceAspect,
    containerAspect: HERO_VIEWPORT_RATIOS.desktop.numeric,
    framing: desktopFraming,
  });
  const mobileRect = computeHeroVisibleRect({
    sourceAspect,
    containerAspect: HERO_VIEWPORT_RATIOS.mobile.numeric,
    framing: mobileFraming,
  });

  const horizontalLossOnMobile =
    desktopRect.visibleWidthFraction > 0
      ? 1 - mobileRect.visibleWidthFraction / desktopRect.visibleWidthFraction
      : 0;

  if (
    horizontalLossOnMobile >= 0.24 &&
    !hasViewportOverride(normalized, 'mobile') &&
    (desktopFraming.focalX < 28 || desktopFraming.focalX > 72)
  ) {
    warnings.push({
      id: 'mobile-edge-cutoff',
      code: 'mobile-edge-cutoff',
      level: 'warning',
      severity: 'warning',
      title: 'Edge subject may be cropped on Mobile (4:3)',
      message: `Mobile view crops ${Math.round(horizontalLossOnMobile * 100)}% of the horizontal width visible on Desktop. Switch to Mobile preview to inspect or set a Mobile framing override.`,
    });
  }

  return warnings;
}

/**
 * Generates CSS variables for `SharedHeroImage` so desktop, tablet, and mobile
 * viewports apply their exact respective framing via CSS media queries without JS resize listeners.
 */
export const buildHeroCssVariables = (
  crop?: Partial<HeroCropConfig> | null,
): Record<string, string> => {
  const desktop = resolveViewportFraming(crop, 'desktop');
  const tablet = resolveViewportFraming(crop, 'tablet');
  const mobile = resolveViewportFraming(crop, 'mobile');

  return {
    '--ss-hero-desktop-pos': `${desktop.focalX}% ${desktop.focalY}%`,
    '--ss-hero-desktop-origin': `${desktop.focalX}% ${desktop.focalY}%`,
    '--ss-hero-desktop-scale': `${desktop.zoom}`,
    '--ss-hero-desktop-fit': desktop.fitMode === 'fit' ? 'contain' : 'cover',

    '--ss-hero-tablet-pos': `${tablet.focalX}% ${tablet.focalY}%`,
    '--ss-hero-tablet-origin': `${tablet.focalX}% ${tablet.focalY}%`,
    '--ss-hero-tablet-scale': `${tablet.zoom}`,
    '--ss-hero-tablet-fit': tablet.fitMode === 'fit' ? 'contain' : 'cover',

    '--ss-hero-mobile-pos': `${mobile.focalX}% ${mobile.focalY}%`,
    '--ss-hero-mobile-origin': `${mobile.focalX}% ${mobile.focalY}%`,
    '--ss-hero-mobile-scale': `${mobile.zoom}`,
    '--ss-hero-mobile-fit': mobile.fitMode === 'fit' ? 'contain' : 'cover',
  };
};
