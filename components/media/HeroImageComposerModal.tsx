import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Crosshair,
  Eye,
  EyeOff,
  Grid,
  Laptop,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Smartphone,
  Sparkles,
  Tablet,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import SharedHeroImage from '../entity/SharedHeroImage';
import EntityTypePill from '../entity/EntityTypePill';
import {
  applyDragDeltaToFraming,
  computeCenterFraming,
  computeFillFraming,
  computeFitFraming,
  computeHeroVisibleRect,
  DEFAULT_HERO_VIEWPORT_FRAMING,
  evaluateHeroFramingWarnings,
  formatAspectRatioLabel,
  HERO_RECOMMENDED_MIN_HEIGHT,
  HERO_RECOMMENDED_MIN_WIDTH,
  HERO_VIEWPORT_LABELS,
  HERO_VIEWPORT_RATIOS,
  normalizeHeroCropConfig,
  resolveViewportFraming,
  type HeroCropConfig,
  type HeroFitMode,
  type HeroViewportFraming,
  type HeroViewportKey,
} from '../../lib/media/heroCrop';
import { stripHeroCropFromUrl } from '../../lib/media/heroCrop';

export type HeroComposerPreviewContext = {
  entityType?: 'club' | 'event' | 'host' | 'venue' | 'resort' | 'cruise';
  entityKind?: 'club' | 'event' | 'host' | 'venue' | 'resort' | 'cruise';
  title?: string;
  subtitle?: string;
  locationText?: string;
  badgeLabel?: string;
  logoUrl?: string;
  tags?: string[];
  thumbnails?: string[];
};

export type HeroComposerConfirmPayload = {
  /** File to upload (when a new file was selected or exported crop was generated). Null when re-framing an existing URL in-place. */
  file: File | null;
  /** Normalized non-destructive crop configuration. */
  crop: HeroCropConfig;
  /** Whether the user chose non-destructive metadata framing (default) or physical exported crop. */
  mode: 'non_destructive' | 'exported_crop';
  /** Natural dimensions of the source image. */
  naturalWidth: number;
  naturalHeight: number;
};

export type HeroImageComposerModalProps = {
  file?: File | null;
  existingImageUrl?: string | null;
  initialCrop?: HeroCropConfig | null;
  title?: string;
  previewContext?: HeroComposerPreviewContext;
  estimatedOptimizedBytes?: number | null;
  onCancel: () => void;
  onConfirm: (payload: HeroComposerConfirmPayload) => void;
};

type EditScope = 'all' | HeroViewportKey;

const formatBytes = (bytes?: number | null): string => {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

const cropExportFileName = (name: string) =>
  `${name.replace(/\.[^.]+$/, '')}-hero-20x9.webp`;

const toInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const HeroImageComposerModal: React.FC<HeroImageComposerModalProps> = ({
  file,
  existingImageUrl,
  initialCrop,
  title = 'Hero Image Composer',
  previewContext,
  estimatedOptimizedBytes,
  onCancel,
  onConfirm,
}) => {
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originFraming: HeroViewportFraming;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialZoom: number;
  } | null>(null);

  const [objectUrl, setObjectUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: initialCrop?.sourceWidth ?? 0,
    height: initialCrop?.sourceHeight ?? 0,
  });
  const [activeViewport, setActiveViewport] = useState<HeroViewportKey>('desktop');
  const [editScope, setEditScope] = useState<EditScope>('all');
  const [cleanPreview, setCleanPreview] = useState<boolean>(false);
  const [showThirdsGrid, setShowThirdsGrid] = useState<boolean>(true);
  const [showCenterGuides, setShowCenterGuides] = useState<boolean>(false);
  const [showSafeAreas, setShowSafeAreas] = useState<boolean>(true);
  const [showCroppedGhost, setShowCroppedGhost] = useState<boolean>(true);
  const [saveMode, setSaveMode] = useState<'non_destructive' | 'exported_crop'>('non_destructive');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const buildInitialCrop = useCallback((): HeroCropConfig => {
    if (initialCrop) {
      return normalizeHeroCropConfig(initialCrop);
    }
    return normalizeHeroCropConfig(DEFAULT_HERO_VIEWPORT_FRAMING);
  }, [initialCrop]);

  const [crop, setCrop] = useState<HeroCropConfig>(buildInitialCrop);

  useEffect(() => {
    setCrop(buildInitialCrop());
  }, [buildInitialCrop]);

  useEffect(() => {
    if (!file) {
      setObjectUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const imageSrc = useMemo(() => {
    if (objectUrl) return objectUrl;
    if (existingImageUrl) return stripHeroCropFromUrl(existingImageUrl);
    return '';
  }, [existingImageUrl, objectUrl]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaving, onCancel]);

  const currentFraming = useMemo(
    () => resolveViewportFraming(crop, activeViewport),
    [activeViewport, crop],
  );

  const updateFraming = useCallback(
    (updater: (prev: HeroViewportFraming) => HeroViewportFraming) => {
      setCrop((prevCrop) => {
        const baseFraming = resolveViewportFraming(
          prevCrop,
          editScope === 'all' ? activeViewport : editScope,
        );
        const nextFraming = updater(baseFraming);
        if (editScope === 'all') {
          return normalizeHeroCropConfig({
            ...prevCrop,
            focalX: nextFraming.focalX,
            focalY: nextFraming.focalY,
            zoom: nextFraming.zoom,
            fitMode: nextFraming.fitMode,
            sourceWidth: naturalSize.width || prevCrop.sourceWidth,
            sourceHeight: naturalSize.height || prevCrop.sourceHeight,
            viewports: prevCrop.viewports,
          });
        }
        return normalizeHeroCropConfig({
          ...prevCrop,
          sourceWidth: naturalSize.width || prevCrop.sourceWidth,
          sourceHeight: naturalSize.height || prevCrop.sourceHeight,
          viewports: {
            ...prevCrop.viewports,
            [editScope]: nextFraming,
          },
        });
      });
    },
    [activeViewport, editScope, naturalSize.height, naturalSize.width],
  );

  const clearViewportOverride = (viewport: HeroViewportKey) => {
    setCrop((prev) => {
      const nextViewports = { ...prev.viewports };
      delete nextViewports[viewport];
      return normalizeHeroCropConfig({
        ...prev,
        viewports: Object.keys(nextViewports).length ? nextViewports : undefined,
      });
    });
    if (editScope === viewport) {
      setEditScope('all');
    }
  };

  const targetContainerRatio = HERO_VIEWPORT_RATIOS[activeViewport];

  const visibleRect = useMemo(
    () =>
      computeHeroVisibleRect(
        naturalSize.width || 1600,
        naturalSize.height || 720,
        targetContainerRatio,
        currentFraming,
      ),
    [currentFraming, naturalSize.height, naturalSize.width, targetContainerRatio],
  );

  const warnings = useMemo(
    () =>
      naturalSize.width > 0 && naturalSize.height > 0
        ? evaluateHeroFramingWarnings(naturalSize.width, naturalSize.height, crop)
        : [],
    [crop, naturalSize.height, naturalSize.width],
  );

  const handleReset = () => {
    if (editScope === 'all') {
      setCrop(
        normalizeHeroCropConfig({
          ...DEFAULT_HERO_VIEWPORT_FRAMING,
          sourceWidth: naturalSize.width || undefined,
          sourceHeight: naturalSize.height || undefined,
        }),
      );
    } else {
      clearViewportOverride(editScope);
    }
  };

  const handleCenter = () => {
    updateFraming((prev) => computeCenterFraming(prev));
  };

  const handleFit = () => {
    updateFraming(() => computeFitFraming());
  };

  const handleFill = () => {
    updateFraming(() => computeFillFraming());
  };

  const handleZoomChange = (nextZoom: number) => {
    updateFraming((prev) => ({
      ...prev,
      zoom: Math.min(3, Math.max(1, Number(nextZoom.toFixed(3)))),
    }));
  };

  const handleFitModeChange = (nextFitMode: HeroFitMode) => {
    updateFraming((prev) => ({
      ...prev,
      fitMode: nextFitMode,
      zoom: nextFitMode === 'fit' ? 1 : prev.zoom,
    }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewfinderRef.current) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if synthetic or unsupported pointer capture
    }
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointersRef.current.size === 2) {
      const points = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      pinchStateRef.current = {
        initialDistance: Math.max(10, dist),
        initialZoom: currentFraming.zoom,
      };
      dragStateRef.current = null;
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originFraming: currentFraming,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (activePointersRef.current.size === 2 && pinchStateRef.current) {
      const points = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const ratio = dist / pinchStateRef.current.initialDistance;
      handleZoomChange(pinchStateRef.current.initialZoom * ratio);
      return;
    }

    const drag = dragStateRef.current;
    const container = viewfinderRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const nextFraming = applyDragDeltaToFraming(
      drag.originFraming,
      deltaX,
      deltaY,
      rect.width,
      rect.height,
      naturalSize.width || rect.width,
      naturalSize.height || rect.height,
    );
    updateFraming(() => nextFraming);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  const handleZoomChangeRef = useRef(handleZoomChange);
  const currentZoomRef = useRef(currentFraming.zoom);
  handleZoomChangeRef.current = handleZoomChange;
  currentZoomRef.current = currentFraming.zoom;

  useEffect(() => {
    const el = viewfinderRef.current;
    if (!el) return undefined;
    const onNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomStep = -event.deltaY * 0.0015;
      handleZoomChangeRef.current(currentZoomRef.current + zoomStep);
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  const handleConfirm = async () => {
    setError('');
    const normalizedCrop = normalizeHeroCropConfig({
      ...crop,
      sourceWidth: naturalSize.width || crop.sourceWidth,
      sourceHeight: naturalSize.height || crop.sourceHeight,
    });

    if (saveMode === 'non_destructive' || !file) {
      onConfirm({
        file: file ?? null,
        crop: normalizedCrop,
        mode: 'non_destructive',
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
      });
      return;
    }

    // Exported physical crop mode: render exact 20:9 high-res canvas matching desktop preview
    const imageEl = sourceImageRef.current;
    if (!imageEl || !naturalSize.width || !naturalSize.height) {
      setError('Image is still loading. Please wait a moment and try again.');
      return;
    }

    setIsSaving(true);
    try {
      const desktopFraming = resolveViewportFraming(normalizedCrop, 'desktop');
      const desktopRect = computeHeroVisibleRect(
        naturalSize.width,
        naturalSize.height,
        HERO_VIEWPORT_RATIOS.desktop,
        desktopFraming,
      );

      const outputWidth = 1920;
      const outputHeight = Math.round(outputWidth / HERO_VIEWPORT_RATIOS.desktop.numeric); // 864
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Browser canvas context is unavailable.');

      ctx.fillStyle = '#05060a';
      ctx.fillRect(0, 0, outputWidth, outputHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (desktopFraming.fitMode === 'fit') {
        const imgAspect = naturalSize.width / naturalSize.height;
        const targetAspect = outputWidth / outputHeight;
        let drawW = outputWidth;
        let drawH = outputHeight;
        if (imgAspect > targetAspect) {
          drawH = outputWidth / imgAspect;
        } else {
          drawW = outputHeight * imgAspect;
        }
        const drawX = (outputWidth - drawW) * (desktopFraming.focalX / 100);
        const drawY = (outputHeight - drawH) * (desktopFraming.focalY / 100);
        ctx.drawImage(imageEl, drawX, drawY, drawW, drawH);
      } else {
        const sx = desktopRect.left * naturalSize.width;
        const sy = desktopRect.top * naturalSize.height;
        const sw = desktopRect.width * naturalSize.width;
        const sh = desktopRect.height * naturalSize.height;
        ctx.drawImage(imageEl, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.92),
      );
      if (!blob) throw new Error('Could not export the cropped hero image.');

      const exportedFile = new File([blob], cropExportFileName(file.name), {
        type: 'image/webp',
        lastModified: Date.now(),
      });

      // Since the exported file is already cropped to 20:9 desktop framing, reset its stored desktop framing to centered 1x
      onConfirm({
        file: exportedFile,
        crop: normalizeHeroCropConfig({
          focalX: 50,
          focalY: 50,
          zoom: 1,
          fitMode: 'fill',
          sourceWidth: outputWidth,
          sourceHeight: outputHeight,
        }),
        mode: 'exported_crop',
        naturalWidth: outputWidth,
        naturalHeight: outputHeight,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export cropped image.');
      setIsSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  const displayTitle = previewContext?.title?.trim() || 'Sample Listing Title';
  const displayLocation = previewContext?.locationText?.trim() || 'Miami Beach, FL 🇺🇸';
  const displaySubtitle = previewContext?.subtitle?.trim() || '';
  const displayEntityType = previewContext?.entityType ?? previewContext?.entityKind ?? 'club';
  const displayBadge =
    previewContext?.badgeLabel ??
    (displayEntityType === 'event'
      ? 'Event'
      : displayEntityType === 'host'
        ? 'Promoter'
        : displayEntityType === 'resort'
          ? 'Resort'
          : displayEntityType === 'cruise'
            ? 'Cruise'
            : displayEntityType === 'venue'
              ? 'Venue'
              : 'Club');
  const displayTags = previewContext?.tags?.length
    ? previewContext.tags.slice(0, 3)
    : ['Upscale', 'Lounge', 'Verified'];

  const viewfinderMaxWidthClass =
    activeViewport === 'desktop'
      ? 'max-w-[960px]'
      : activeViewport === 'tablet'
        ? 'max-w-[680px]'
        : 'max-w-[420px]';

  const croppedTopPct = Math.round(visibleRect.top * 100);
  const croppedBottomPct = Math.round(Math.max(0, 1 - (visibleRect.top + visibleRect.height)) * 100);
  const croppedLeftPct = Math.round(visibleRect.left * 100);
  const croppedRightPct = Math.round(Math.max(0, 1 - (visibleRect.left + visibleRect.width)) * 100);

  return createPortal(
    <div
      className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/88 p-2 sm:p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="hero-image-composer-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onCancel();
      }}
    >
      {/* Hidden source image probe to read natural dimensions reliably */}
      {imageSrc ? (
        <img
          ref={sourceImageRef}
          src={imageSrc}
          alt=""
          aria-hidden="true"
          className="hidden"
          onLoad={(event) => {
            const w = event.currentTarget.naturalWidth;
            const h = event.currentTarget.naturalHeight;
            if (w > 0 && h > 0) {
              setNaturalSize({ width: w, height: h });
            }
          }}
        />
      ) : null}

      <div className="ss-glass ss-glass--liquid flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[26px] border border-white/15 bg-[#090c12]/95 shadow-[0_32px_96px_rgba(0,0,0,0.75)] sm:max-h-[calc(100dvh-2rem)]">
        {/* Sticky Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/45 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-red-200">
                <Sparkles size={11} /> WYSIWYG Hero Composer
              </span>
              <span className="text-[11px] font-semibold text-gray-400">
                Target {HERO_VIEWPORT_LABELS[activeViewport]}
              </span>
            </div>
            <h2 className="mt-1 truncate text-base font-black text-white sm:text-lg">{title}</h2>
          </div>

          {/* Responsive Preview Switcher: Desktop | Tablet | Mobile + Clean Image toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-xl border border-white/12 bg-black/50 p-1"
              role="tablist"
              aria-label="Preview viewport mode"
            >
              {(
                [
                  { key: 'desktop', label: 'Desktop', sub: '20:9', Icon: Laptop },
                  { key: 'tablet', label: 'Tablet', sub: '16:9', Icon: Tablet },
                  { key: 'mobile', label: 'Mobile', sub: '4:3', Icon: Smartphone },
                ] as const
              ).map(({ key, label, sub, Icon }) => {
                const isActive = activeViewport === key;
                const hasOverride = Boolean(crop.viewports?.[key]);
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    data-testid={`composer-viewport-${key}`}
                    onClick={() => {
                      setActiveViewport(key);
                      if (editScope !== 'all') setEditScope(key);
                    }}
                    className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      isActive
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <Icon size={13} />
                    <span>{label}</span>
                    <span className={`text-[10px] ${isActive ? 'text-red-100' : 'text-gray-500'}`}>
                      {sub}
                    </span>
                    {hasOverride ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-amber-300"
                        title={`${label} has custom viewport framing`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setCleanPreview((prev) => !prev)}
              data-testid="composer-toggle-clean-preview"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                cleanPreview
                  ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
                  : 'border-white/12 bg-black/45 text-gray-200 hover:bg-white/[0.08]'
              }`}
              title="Toggle between Public Hero Overlay Preview and Clean Artwork View"
            >
              {cleanPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{cleanPreview ? 'Clean Image' : 'Preview Overlays'}</span>
            </button>

            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="rounded-full border border-white/10 p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Close hero composer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Workspace */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {/* Interactive Viewfinder */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#040609] p-3 sm:p-5">
            <div className="mb-2.5 flex w-full flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
              <span className="inline-flex items-center gap-1.5 font-medium text-gray-300">
                <Move size={13} className="text-red-400" />
                Drag image to position • Scroll or pinch to zoom
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-gray-200">
                  Focal: {Math.round(currentFraming.focalX)}% × {Math.round(currentFraming.focalY)}%
                </span>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-gray-200">
                  Zoom: {currentFraming.zoom.toFixed(2)}×
                </span>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                  Visible: {visibleRect.visibleAreaPercent}%
                </span>
              </div>
            </div>

            {/* Viewfinder Frame matching exact public container ratio */}
            <div className={`relative w-full ${viewfinderMaxWidthClass} transition-all duration-200`}>
              <div
                ref={viewfinderRef}
                data-testid="hero-composer-viewfinder"
                style={{ aspectRatio: targetContainerRatio.cssAspectRatio }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="group relative w-full cursor-grab touch-none select-none overflow-hidden rounded-[24px] border border-red-400/45 bg-[#05060a] shadow-[0_20px_60px_rgba(0,0,0,0.75)] active:cursor-grabbing"
              >
                {/* Actual SharedHeroImage Renderer (100% shared logic with live pages) */}
                {imageSrc ? (
                  <SharedHeroImage
                    src={imageSrc}
                    alt={displayTitle}
                    crop={crop}
                    viewport={activeViewport}
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
                    onImageLoaded={({ naturalWidth, naturalHeight }) => {
                      if (naturalWidth > 0 && naturalHeight > 0) {
                        setNaturalSize((prev) =>
                          prev && prev.width === naturalWidth && prev.height === naturalHeight
                            ? prev
                            : { width: naturalWidth, height: naturalHeight },
                        );
                      }
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                    Loading image preview…
                  </div>
                )}

                {/* Cropped Content Boundary Indicators (top/bottom/left/right percentages) */}
                {showCroppedGhost && currentFraming.fitMode === 'fill' ? (
                  <div className="pointer-events-none absolute inset-0 z-10">
                    {croppedTopPct > 1 ? (
                      <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-amber-300/30 bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-amber-200 backdrop-blur-md">
                        ↑ {croppedTopPct}% cropped above
                      </div>
                    ) : null}
                    {croppedBottomPct > 1 ? (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/30 bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-amber-200 backdrop-blur-md">
                        ↓ {croppedBottomPct}% cropped below
                      </div>
                    ) : null}
                    {croppedLeftPct > 1 ? (
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-amber-300/30 bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-amber-200 backdrop-blur-md">
                        ← {croppedLeftPct}%
                      </div>
                    ) : null}
                    {croppedRightPct > 1 ? (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-amber-300/30 bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-amber-200 backdrop-blur-md">
                        {croppedRightPct}% →
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Rule of Thirds Grid */}
                {showThirdsGrid ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(to_right,transparent_33.2%,rgba(255,255,255,0.16)_33.3%,rgba(255,255,255,0.16)_33.5%,transparent_33.6%,transparent_66.5%,rgba(255,255,255,0.16)_66.6%,rgba(255,255,255,0.16)_66.8%,transparent_66.9%),linear-gradient(to_bottom,transparent_33.2%,rgba(255,255,255,0.16)_33.3%,rgba(255,255,255,0.16)_33.5%,transparent_33.6%,transparent_66.5%,rgba(255,255,255,0.16)_66.6%,rgba(255,255,255,0.16)_66.8%,transparent_66.9%)]"
                  />
                ) : null}

                {/* Center Crosshair Guides */}
                {showCenterGuides ? (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
                    <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-cyan-300/45" />
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-cyan-300/45" />
                  </div>
                ) : null}

                {/* Safe-Area Subject Guides */}
                {showSafeAreas ? (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
                    <div
                      className="absolute inset-x-[12%] top-[12%] bottom-[28%] rounded-xl border border-dashed border-emerald-300/40"
                      title="Primary subject safe zone (clear of logo and bottom title overlays)"
                    >
                      <span className="absolute right-2 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300/90">
                        Subject Safe Area
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Authentic Public Listing Hero Overlay Preview */}
                {!cleanPreview ? (
                  <div
                    aria-hidden="true"
                    data-testid="composer-public-overlay"
                    className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between"
                  >
                    {/* Readability bottom gradient matching ClubHero / HostHero / TravelHero */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#05060a]/85 via-[#05060a]/25 to-transparent" />

                    {/* Top row: Logo on left, Save/Action pill on right */}
                    <div className="relative flex items-start justify-between p-3.5 sm:p-5">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-black/45 shadow-lg backdrop-blur-sm sm:h-20 sm:w-20">
                        {previewContext?.logoUrl ? (
                          <img
                            src={previewContext.logoUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-lg font-black text-white sm:text-xl">
                            {toInitials(displayTitle)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur-md">
                          Save
                        </span>
                      </div>
                    </div>

                    {/* Bottom row: Entity badge, Title, Location/Subtitle, Tags, and Desktop Thumbnail Stack */}
                    <div className="relative flex items-end justify-between gap-4 p-3.5 sm:p-5">
                      <div className="max-w-[75%] min-w-0 [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <EntityTypePill
                            tone={
                              displayEntityType === 'event'
                                ? 'event'
                                : displayEntityType === 'host'
                                  ? 'host'
                                  : displayEntityType === 'resort'
                                    ? 'resort'
                                    : displayEntityType === 'cruise'
                                      ? 'cruise'
                                      : 'club'
                            }
                          >
                            {displayBadge}
                          </EntityTypePill>
                        </div>
                        <h3 className="mt-1.5 line-clamp-2 text-lg font-black leading-tight text-white sm:text-2xl lg:text-3xl">
                          {displayTitle}
                        </h3>
                        <p className="mt-1 truncate text-xs font-medium text-gray-200 sm:text-sm">
                          {displayLocation}
                        </p>
                        {displaySubtitle ? (
                          <p className="mt-1 line-clamp-1 text-xs text-gray-300">{displaySubtitle}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {displayTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-white/15 bg-black/55 px-2.5 py-0.5 text-[10px] font-semibold text-gray-100 backdrop-blur-md"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Desktop right-side thumbnail stack representation */}
                      {activeViewport === 'desktop' ? (
                        <div className="hidden sm:flex flex-col gap-1.5 rounded-2xl border border-white/15 bg-black/55 p-2 backdrop-blur-md">
                          <div className="h-10 w-16 rounded-lg border border-white/15 bg-white/10" />
                          <div className="h-10 w-16 rounded-lg border border-white/15 bg-white/10" />
                          <span className="text-center text-[9px] font-bold uppercase tracking-wider text-gray-300">
                            Gallery
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Multi-Viewport Mini Strip: Instantly see how the same image crops across Desktop, Tablet, and Mobile */}
            <div className="mt-4 grid w-full max-w-4xl grid-cols-3 gap-2.5">
              {(['desktop', 'tablet', 'mobile'] as const).map((vp) => {
                const vpRatio = HERO_VIEWPORT_RATIOS[vp];
                const vpFraming = resolveViewportFraming(crop, vp);
                const vpRect = computeHeroVisibleRect(
                  naturalSize.width || 1600,
                  naturalSize.height || 720,
                  vpRatio,
                  vpFraming,
                );
                const isSelected = activeViewport === vp;
                return (
                  <button
                    key={vp}
                    type="button"
                    onClick={() => {
                      setActiveViewport(vp);
                      if (editScope !== 'all') setEditScope(vp);
                    }}
                    className={`flex items-center gap-2.5 rounded-xl border p-2 text-left transition ${
                      isSelected
                        ? 'border-red-400/50 bg-red-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div
                      style={{ aspectRatio: vpRatio.cssAspectRatio }}
                      className="relative h-9 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black"
                    >
                      {imageSrc ? (
                        <SharedHeroImage
                          src={imageSrc}
                          alt=""
                          crop={crop}
                          viewport={vp}
                          className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-bold capitalize text-white">
                          {vp}
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400">
                          {vpRect.visibleAreaPercent}% vis
                        </span>
                      </div>
                      <p className="truncate text-[10px] text-gray-400">
                        { crop.viewports?.[vp] ? 'Custom viewport crop' : 'Shared focal point' }
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Controls & Inspector Grid */}
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Left Column: Zoom, Framing Actions, Guides & Edit Scope */}
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              {/* Zoom Slider */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-300">
                  <ZoomIn size={14} className="text-red-400" /> Zoom
                </span>
                <button
                  type="button"
                  onClick={() => handleZoomChange(currentFraming.zoom - 0.1)}
                  className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
                  aria-label="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <input
                  type="range"
                  aria-label="Hero zoom"
                  data-testid="composer-zoom-slider"
                  min="1"
                  max="3"
                  step="0.01"
                  value={currentFraming.zoom}
                  onChange={(event) => handleZoomChange(Number(event.target.value))}
                  className="min-w-[120px] flex-1 accent-red-500"
                />
                <button
                  type="button"
                  onClick={() => handleZoomChange(currentFraming.zoom + 0.1)}
                  className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
                  aria-label="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <span className="w-12 text-right font-mono text-xs font-bold text-white">
                  {currentFraming.zoom.toFixed(2)}×
                </span>
              </div>

              {/* Explicit Action Buttons: Fill | Fit | Center | Reset */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="composer-action-fill"
                    onClick={handleFill}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                      currentFraming.fitMode === 'fill'
                        ? 'border-red-400/45 bg-red-500/20 text-white'
                        : 'border-white/12 bg-black/40 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <Maximize2 size={13} /> Fill Frame
                  </button>
                  <button
                    type="button"
                    data-testid="composer-action-fit"
                    onClick={handleFit}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                      currentFraming.fitMode === 'fit'
                        ? 'border-red-400/45 bg-red-500/20 text-white'
                        : 'border-white/12 bg-black/40 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <Minimize2 size={13} /> Fit Entire Image
                  </button>
                  <button
                    type="button"
                    data-testid="composer-action-center"
                    onClick={handleCenter}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-black/40 px-3 py-1.5 text-xs font-bold text-gray-200 transition hover:bg-white/10 hover:text-white"
                  >
                    <Crosshair size={13} /> Center
                  </button>
                  <button
                    type="button"
                    data-testid="composer-action-reset"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-black/40 px-3 py-1.5 text-xs font-bold text-gray-200 transition hover:bg-white/10 hover:text-white"
                  >
                    <RotateCcw size={13} /> Reset
                  </button>
                </div>

                {/* Guide Toggles */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowThirdsGrid((prev) => !prev)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      showThirdsGrid
                        ? 'border-white/25 bg-white/15 text-white'
                        : 'border-white/10 bg-black/30 text-gray-400'
                    }`}
                  >
                    <Grid size={12} /> Grid
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCenterGuides((prev) => !prev)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      showCenterGuides
                        ? 'border-cyan-300/35 bg-cyan-400/15 text-cyan-100'
                        : 'border-white/10 bg-black/30 text-gray-400'
                    }`}
                  >
                    <Crosshair size={12} /> Center Lines
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSafeAreas((prev) => !prev)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      showSafeAreas
                        ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100'
                        : 'border-white/10 bg-black/30 text-gray-400'
                    }`}
                  >
                    Safe Zone
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCroppedGhost((prev) => !prev)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      showCroppedGhost
                        ? 'border-amber-300/35 bg-amber-400/15 text-amber-100'
                        : 'border-white/10 bg-black/30 text-gray-400'
                    }`}
                  >
                    Crop %
                  </button>
                </div>
              </div>

              {/* Edit Scope Selector: Apply to All Views vs Current Viewport Override */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                <div className="flex items-center gap-2">
                  <Sliders size={13} className="text-red-300" />
                  <span className="text-xs font-semibold text-gray-300">Apply framing edits to:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="composer-scope-all"
                    onClick={() => setEditScope('all')}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      editScope === 'all'
                        ? 'border-red-400/45 bg-red-500/20 text-white'
                        : 'border-white/10 bg-black/35 text-gray-400 hover:text-white'
                    }`}
                  >
                    All Views (Shared)
                  </button>
                  <button
                    type="button"
                    data-testid="composer-scope-viewport"
                    onClick={() => setEditScope(activeViewport)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold capitalize transition ${
                      editScope === activeViewport
                        ? 'border-amber-300/45 bg-amber-400/20 text-amber-100'
                        : 'border-white/10 bg-black/35 text-gray-400 hover:text-white'
                    }`}
                  >
                    {activeViewport} Only
                  </button>
                  {crop.viewports?.[activeViewport] ? (
                    <button
                      type="button"
                      onClick={() => clearViewportOverride(activeViewport)}
                      className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-semibold text-gray-400 hover:text-white"
                    >
                      Clear {activeViewport} override
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Right Column: Image Telemetry & Intelligent Framing Warnings */}
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Source Size
                  </div>
                  <div
                    className="mt-0.5 font-mono font-bold text-white"
                    data-testid="composer-source-dimensions"
                  >
                    {naturalSize.width && naturalSize.height
                      ? `${naturalSize.width} × ${naturalSize.height}`
                      : 'Measuring…'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Source Ratio
                  </div>
                  <div
                    className="mt-0.5 font-mono font-bold text-white"
                    data-testid="composer-source-ratio"
                  >
                    {naturalSize.width && naturalSize.height
                      ? formatAspectRatioLabel(naturalSize.width, naturalSize.height)
                      : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Target Hero
                  </div>
                  <div className="mt-0.5 font-mono font-bold text-red-200">
                    {activeViewport === 'desktop'
                      ? '20:9 (2.22:1)'
                      : activeViewport === 'tablet'
                        ? '16:9 (1.78:1)'
                        : '4:3 (1.33:1)'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Visible Area
                  </div>
                  <div
                    className="mt-0.5 font-mono font-bold text-emerald-300"
                    data-testid="composer-visible-percent"
                  >
                    {visibleRect.visibleAreaPercent}% of source
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    File Size
                  </div>
                  <div className="mt-0.5 font-mono font-bold text-gray-200">
                    {file ? formatBytes(file.size) : 'Canonical Asset'}
                    {estimatedOptimizedBytes && file && estimatedOptimizedBytes < file.size
                      ? ` → ${formatBytes(estimatedOptimizedBytes)}`
                      : ''}
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Preservation
                  </div>
                  {file ? (
                    <select
                      aria-label="Crop preservation mode"
                      value={saveMode}
                      onChange={(e) =>
                        setSaveMode(e.target.value as 'non_destructive' | 'exported_crop')
                      }
                      className="mt-0.5 w-full rounded bg-transparent font-semibold text-cyan-200 focus:outline-none"
                    >
                      <option value="non_destructive" className="bg-[#090c12] text-white">
                        Non-destructive (Full Image)
                      </option>
                      <option value="exported_crop" className="bg-[#090c12] text-white">
                        Exported 20:9 Crop
                      </option>
                    </select>
                  ) : (
                    <div className="mt-0.5 font-semibold text-cyan-200">Non-destructive</div>
                  )}
                </div>
              </div>

              {/* Warnings & Framing Advisories */}
              {warnings.length > 0 ? (
                <div className="space-y-1.5" data-testid="composer-warnings">
                  {warnings.map((warning) => (
                    <div
                      key={warning.code}
                      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 ${
                        warning.severity === 'warning'
                          ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                          : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                      }`}
                    >
                      {warning.severity === 'warning' ? (
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
                      ) : (
                        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-cyan-300" />
                      )}
                      <span>
                        {warning.title ? <strong className="font-bold">{warning.title}: </strong> : null}
                        {warning.message}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  <Check size={14} className="shrink-0 text-emerald-300" />
                  <span>
                    Source resolution meets the {HERO_RECOMMENDED_MIN_WIDTH}×{HERO_RECOMMENDED_MIN_HEIGHT} hero standard.
                  </span>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-200">
              {error}
            </p>
          ) : null}
        </div>

        {/* Sticky Footer with Explicit Actions: Reset | Fit | Fill | Preview | Save */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/55 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className="font-semibold text-gray-200">
              Editing:{' '}
              <span className="text-red-300">
                {editScope === 'all'
                  ? 'All Views (Desktop 20:9, Tablet 16:9, Mobile 4:3)'
                  : `${editScope.toUpperCase()} viewport override`}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-bold text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleFit}
              disabled={isSaving}
              className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-bold text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              Fit
            </button>
            <button
              type="button"
              onClick={handleFill}
              disabled={isSaving}
              className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-bold text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              Fill
            </button>
            <button
              type="button"
              onClick={() => setCleanPreview((prev) => !prev)}
              disabled={isSaving}
              className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-bold text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              {cleanPreview ? 'Show Overlay Preview' : 'Clean Preview'}
            </button>
            <button
              type="button"
              data-testid="composer-cancel-button"
              onClick={onCancel}
              disabled={isSaving}
              className="rounded-xl border border-white/12 px-3.5 py-2 text-xs font-bold text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="composer-save-button"
              onClick={() => void handleConfirm()}
              disabled={isSaving || (!file && !existingImageUrl)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-black text-white shadow-lg shadow-red-950/50 transition hover:bg-red-600 disabled:opacity-50"
            >
              <Check size={14} />
              <span>{isSaving ? 'Saving Hero…' : file ? 'Save & Upload Hero' : 'Save Framing'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default HeroImageComposerModal;
