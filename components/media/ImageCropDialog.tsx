import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';

const MIN_VIEWPORT_WIDTH = 180;
const DEFAULT_VIEWPORT_WIDTH = 380;
const MAX_WIDE_VIEWPORT_WIDTH = 500;
const DIALOG_VERTICAL_CHROME = 300;

type ImageCropDialogProps = {
  file: File;
  aspectRatio: number;
  title: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

type Size = { width: number; height: number };
type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const cropFileName = (name: string) => `${name.replace(/\.[^.]+$/, '')}-cropped.webp`;

const ImageCropDialog: React.FC<ImageCropDialogProps> = ({
  file,
  aspectRatio,
  title,
  onCancel,
  onConfirm,
}) => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [naturalSize, setNaturalSize] = useState<Size>({ width: 0, height: 0 });
  const [viewportWidth, setViewportWidth] = useState(DEFAULT_VIEWPORT_WIDTH);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const updateViewport = () => {
      const preferredWidth = aspectRatio >= 2 ? MAX_WIDE_VIEWPORT_WIDTH : DEFAULT_VIEWPORT_WIDTH;
      const availableWidth = Math.max(MIN_VIEWPORT_WIDTH, window.innerWidth - 64);
      const availableCropHeight = Math.max(MIN_VIEWPORT_WIDTH / aspectRatio, window.innerHeight - DIALOG_VERTICAL_CHROME);
      const widthFromHeight = availableCropHeight * aspectRatio;
      setViewportWidth(Math.round(Math.max(
        MIN_VIEWPORT_WIDTH,
        Math.min(preferredWidth, availableWidth, widthFromHeight),
      )));
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [aspectRatio]);

  const viewport = useMemo(() => ({
    width: viewportWidth,
    height: viewportWidth / aspectRatio,
  }), [aspectRatio, viewportWidth]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isCreating) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCreating, onCancel]);

  const baseScale = naturalSize.width && naturalSize.height
    ? Math.max(viewport.width / naturalSize.width, viewport.height / naturalSize.height)
    : 1;
  const scale = baseScale * zoom;
  const rendered = {
    width: naturalSize.width * scale,
    height: naturalSize.height * scale,
  };
  const maxPan = {
    x: Math.max(0, (rendered.width - viewport.width) / 2),
    y: Math.max(0, (rendered.height - viewport.height) / 2),
  };
  const safePan = {
    x: clamp(pan.x, -maxPan.x, maxPan.x),
    y: clamp(pan.y, -maxPan.y, maxPan.y),
  };

  useEffect(() => {
    setPan((current) => ({
      x: clamp(current.x, -maxPan.x, maxPan.x),
      y: clamp(current.y, -maxPan.y, maxPan.y),
    }));
  }, [maxPan.x, maxPan.y]);

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: safePan,
    };
  };

  const continueDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: clamp(drag.origin.x + event.clientX - drag.start.x, -maxPan.x, maxPan.x),
      y: clamp(drag.origin.y + event.clientY - drag.start.y, -maxPan.y, maxPan.y),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const createCrop = async () => {
    const image = imageRef.current;
    if (!image || !naturalSize.width || !naturalSize.height) return;

    setIsCreating(true);
    setError('');
    try {
      const outputWidth = aspectRatio === 1 ? 768 : 1280;
      const outputHeight = Math.round(outputWidth / aspectRatio);
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare the image crop.');

      const imageLeft = (viewport.width - rendered.width) / 2 + safePan.x;
      const imageTop = (viewport.height - rendered.height) / 2 + safePan.y;
      const sourceX = clamp(-imageLeft / scale, 0, naturalSize.width);
      const sourceY = clamp(-imageTop / scale, 0, naturalSize.height);
      const sourceWidth = Math.min(viewport.width / scale, naturalSize.width - sourceX);
      const sourceHeight = Math.min(viewport.height / scale, naturalSize.height - sourceY);

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
      if (!blob) throw new Error('The cropped image could not be created.');
      onConfirm(new File([blob], cropFileName(file.name), { type: 'image/webp' }));
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'The image could not be cropped.');
      setIsCreating(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2200] overflow-y-auto bg-black/85 p-3 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isCreating) onCancel();
      }}
    >
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4">
      <div className="ss-glass ss-glass--liquid my-auto w-full max-w-xl rounded-[24px] p-4 sm:p-5 max-h-[calc(100vh-24px)] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-300">Confirm image</p>
            <h2 className="mt-0.5 text-xl font-black text-white">{title}</h2>
            <p className="mt-1 text-xs text-gray-400">Drag to reposition. Use the slider to zoom.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full border border-white/10 p-2 text-gray-400 transition hover:bg-white/10 hover:text-white" aria-label="Close crop dialog">
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 flex justify-center overflow-hidden rounded-2xl bg-black/55 p-2.5 sm:p-3">
          <div
            className="relative max-w-full cursor-grab touch-none overflow-hidden rounded-2xl border border-white/15 bg-black active:cursor-grabbing"
            style={{ width: viewport.width, aspectRatio: String(aspectRatio) }}
            onPointerDown={beginDrag}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {objectUrl && (
              <img
                ref={imageRef}
                src={objectUrl}
                alt="Crop preview"
                draggable={false}
                onLoad={(event) => setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: rendered.width || 'auto',
                  height: rendered.height || 'auto',
                  transform: `translate(calc(-50% + ${safePan.x}px), calc(-50% + ${safePan.y}px))`,
                }}
              />
            )}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/25" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_33.2%,rgba(255,255,255,.12)_33.3%,rgba(255,255,255,.12)_33.6%,transparent_33.7%,transparent_66.2%,rgba(255,255,255,.12)_66.3%,rgba(255,255,255,.12)_66.6%,transparent_66.7%),linear-gradient(to_bottom,transparent_33.2%,rgba(255,255,255,.12)_33.3%,rgba(255,255,255,.12)_33.6%,transparent_33.7%,transparent_66.2%,rgba(255,255,255,.12)_66.3%,rgba(255,255,255,.12)_66.6%,transparent_66.7%)]" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-300">Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="min-w-0 flex-1 accent-red-500"
          />
          <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:bg-white/10 hover:text-white">
            <RotateCcw size={14} /> Reset
          </button>
        </div>

        {error && <p className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

        <div className="mt-4 flex flex-col-reverse gap-2.5 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={isCreating} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-gray-300 transition hover:bg-white/10 disabled:opacity-50">Choose another</button>
          <button type="button" onClick={() => void createCrop()} disabled={isCreating || !naturalSize.width} className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-600 disabled:opacity-50">
            {isCreating ? 'Preparing image…' : 'Use this crop'}
          </button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
};

export default ImageCropDialog;
