import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Sliders } from 'lucide-react';
import { getCloudflareImageUrl, getHeroCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import {
  computeFileSha256Hex,
  saveStoredUploadMetadata,
  validateExternalImageUrl,
} from '../../lib/media/canonicalAssetModel';
import {
  encodeHeroCropToUrl,
  extractHeroCropFromUrl,
  normalizeHeroCropConfig,
  type HeroCropConfig,
} from '../../lib/media/heroCrop';
import { supabase } from '../../lib/supabase';
import { ALLOWED_MEDIA_MIME_TYPES, formatMaxUploadSize, getMediaRule } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaOwnerType, MediaRole } from '../../lib/media/types';
import HeroImageComposerModal, {
  type HeroComposerConfirmPayload,
  type HeroComposerPreviewContext,
} from './HeroImageComposerModal';
import ImageCropDialog from './ImageCropDialog';
import MediaImage from './MediaImage';
import MediaLibraryPickerModal from './MediaLibraryPickerModal';
import SharedHeroImage from '../entity/SharedHeroImage';

type MediaUploaderProps = {
  ownerType: MediaOwnerType;
  ownerId: string;
  role: MediaRole;
  existingAsset?: MediaAsset | null;
  existingImageUrl?: string | null;
  existingHeroCrop?: HeroCropConfig | null;
  heroPreviewContext?: HeroComposerPreviewContext;
  onUploaded?: (asset: MediaAsset) => void;
  onHeroCropChange?: (crop: HeroCropConfig, resolvedUrlWithCrop: string) => void;
  label?: string;
  helperText?: string;
  cropAspectRatioOverride?: number | null;
  inputId?: string;
  tone?: 'dark' | 'light';
  triggerOnly?: boolean;
  onError?: (message: string) => void;
  managedEntityId?: string;
  externalFile?: File | null;
  onExternalImageUrl?: (url: string) => void;
  allowLibraryPick?: boolean;
};

type UploadState = 'idle' | 'creating' | 'uploading' | 'saving';

// Preserve the original if re-encoding does not improve its size. Cloudflare still
// performs browser-specific resizing/format negotiation on delivery.
const optimizeUploadFile = async (file: File, role: MediaRole, skipReencode = false): Promise<File> => {
  if (skipReencode || file.size <= 500 * 1024) return file;
  const maxDimension =
    role === 'hero'
      ? 2048
      : role === 'flyer'
        ? 1800
        : role === 'logo' || role === 'avatar'
          ? 1024
          : 1600;
  const quality = role === 'hero' || role === 'flyer' || role === 'logo' ? 0.9 : 0.84;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-optimized.webp', {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch {
    // Unsupported image encoders should not block otherwise valid uploads.
    return file;
  } finally {
    bitmap?.close();
  }
};

const getUploadError = async (response: Response) => {
  const text = await response.text().catch(() => '');
  if (!text) return `Upload failed with status ${response.status}.`;
  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || text;
  } catch {
    return text;
  }
};

const extractCloudflareImageId = (payload: any): string => {
  const candidates = [
    payload?.result?.id,
    payload?.id,
    payload?.result?.image?.id,
    payload?.result?.variants?.[0]?.split('/').at(-2),
  ];
  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim() ?? '';
};

const MediaUploader: React.FC<MediaUploaderProps> = ({
  ownerType,
  ownerId,
  role,
  existingAsset,
  existingImageUrl,
  existingHeroCrop,
  heroPreviewContext,
  onUploaded,
  onHeroCropChange,
  label,
  helperText,
  cropAspectRatioOverride,
  inputId,
  tone = 'dark',
  triggerOnly = false,
  onError,
  managedEntityId,
  externalFile,
  onExternalImageUrl,
  allowLibraryPick = true,
}) => {
  const rule = getMediaRule(role);
  // Legacy listing identifiers are human-readable; the Media API requires a stable UUID.
  // Normalize at the shared upload boundary so every editor follows the same contract.
  const uploadOwnerId = getMediaOwnerId(ownerType, ownerId.trim());
  const [asset, setAsset] = useState<MediaAsset | null>(existingAsset ?? null);
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string>('');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isReframingExistingHero, setIsReframingExistingHero] = useState(false);
  const [estimatedOptimizedBytes, setEstimatedOptimizedBytes] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [lastFailedUpload, setLastFailedUpload] = useState<{
    file: File;
    heroPayload?: {
      crop: HeroCropConfig;
      mode: 'non_destructive' | 'exported_crop';
      naturalWidth: number;
      naturalHeight: number;
    };
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAsset(existingAsset ?? null);
  }, [existingAsset]);

  const resolvedHeroCrop = useMemo<HeroCropConfig | null>(() => {
    if (role !== 'hero') return null;
    if (asset?.hero_crop) return normalizeHeroCropConfig(asset.hero_crop);
    if (existingHeroCrop) return normalizeHeroCropConfig(existingHeroCrop);
    if (existingImageUrl) {
      const fromUrl = extractHeroCropFromUrl(existingImageUrl);
      if (fromUrl) return fromUrl;
    }
    if (asset?.focal_point_x != null || asset?.focal_point_y != null) {
      return normalizeHeroCropConfig({
        focalX: asset.focal_point_x ?? 0.5,
        focalY: asset.focal_point_y ?? 0.5,
      });
    }
    return null;
  }, [asset, existingHeroCrop, existingImageUrl, role]);

  const previewUrl = useMemo(() => {
    if (asset) {
      if (role === 'hero') {
        return getHeroCloudflareImageUrl({
          externalId: asset.external_id,
          crop: resolvedHeroCrop,
          preferredVariant: 'heropage',
        });
      }
      return getCloudflareImageUrl({ externalId: asset.external_id, variant: rule.defaultVariant });
    }
    if (existingImageUrl) return existingImageUrl;
    return null;
  }, [asset, existingImageUrl, resolvedHeroCrop, role, rule.defaultVariant]);

  useEffect(() => {
    let active = true;
    if (!cropFile || role !== 'hero') {
      setEstimatedOptimizedBytes(null);
      return () => {
        active = false;
      };
    }
    optimizeUploadFile(cropFile, 'hero')
      .then((optimized) => {
        if (active) setEstimatedOptimizedBytes(optimized.size);
      })
      .catch(() => {
        if (active) setEstimatedOptimizedBytes(null);
      });
    return () => {
      active = false;
    };
  }, [cropFile, role]);

  const isBusy = state !== 'idle';
  const accept = ALLOWED_MEDIA_MIME_TYPES.join(',');
  const cropAspectRatio = useMemo(() => {
    if (typeof cropAspectRatioOverride === 'number' && cropAspectRatioOverride > 0) return cropAspectRatioOverride;
    if (cropAspectRatioOverride === null) return null;
    if (rule.aspectMode !== 'cover' || !rule.targetRatio) return null;
    const [width, height] = rule.targetRatio.split(':').map(Number);
    return width > 0 && height > 0 ? width / height : null;
  }, [cropAspectRatioOverride, rule.aspectMode, rule.targetRatio]);

  const clearInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const reportError = (message: string) => {
    setError(message);
    onError?.(message);
  };

  const uploadFile = async (
    originalFile: File,
    heroPayload?: {
      crop: HeroCropConfig;
      mode: 'non_destructive' | 'exported_crop';
      naturalWidth: number;
      naturalHeight: number;
    },
  ) => {
    try {
      setError('');
      setLastFailedUpload(null);
      const skipReencode = heroPayload?.mode === 'exported_crop';
      const file = await optimizeUploadFile(originalFile, role, skipReencode);
      const sha256Promise = computeFileSha256Hex(file).catch(() => undefined);
      const { data: sessionData } = await supabase.auth.getSession();
      const isDevAdminLocal =
        import.meta.env.DEV &&
        typeof window !== 'undefined' &&
        window.localStorage.getItem('swingsphere:dev-admin') === 'true';
      const accessToken =
        sessionData.session?.access_token || (isDevAdminLocal ? 'dev-admin-local-token' : undefined);
      if (!accessToken) throw new Error('Please log in before uploading media.');
      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      setState('creating');
      const createResponse = await fetch('/api/media/create-upload-url', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ownerType, ownerId: uploadOwnerId, role, managedEntityId }),
      });
      if (!createResponse.ok) throw new Error(await getUploadError(createResponse));
      const createPayload = await createResponse.json();
      const uploadURL = createPayload.uploadURL || createPayload.result?.uploadURL;
      if (!uploadURL) throw new Error('Cloudflare did not return an upload URL.');

      setState('uploading');
      const formData = new FormData();
      formData.append('file', file);
      const uploadResponse = await fetch(uploadURL, {
        method: 'POST',
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error(await getUploadError(uploadResponse));
      const uploadPayload = await uploadResponse.json();
      const externalId = extractCloudflareImageId(uploadPayload);
      if (!externalId) throw new Error('Cloudflare upload completed without an image id.');

      const sha256 = await sha256Promise;
      saveStoredUploadMetadata(externalId, {
        sha256,
        fileSizeBytes: file.size,
        originalFilename: file.name,
        mimeType: file.type,
        uploadedAt: new Date().toISOString(),
      });

      setState('saving');
      const completeResponse = await fetch('/api/media/complete-upload', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ownerType,
          ownerId: uploadOwnerId,
          role,
          externalId,
          altText: file.name.replace(/\.[^.]+$/, ''),
          managedEntityId,
          ...(heroPayload
            ? {
                focalPointX: heroPayload.crop.focalX,
                focalPointY: heroPayload.crop.focalY,
                width: heroPayload.naturalWidth || undefined,
                height: heroPayload.naturalHeight || undefined,
              }
            : {}),
        }),
      });
      if (!completeResponse.ok) throw new Error(await getUploadError(completeResponse));
      const completePayload = await completeResponse.json();
      const baseAsset = completePayload.asset as MediaAsset;
      const nextAsset: MediaAsset = heroPayload
        ? {
            ...baseAsset,
            focal_point_x: heroPayload.crop.focalX,
            focal_point_y: heroPayload.crop.focalY,
            hero_crop: heroPayload.crop,
            source_width: heroPayload.naturalWidth || baseAsset.width,
            source_height: heroPayload.naturalHeight || baseAsset.height,
          }
        : baseAsset;
      setAsset(nextAsset);
      setLastFailedUpload(null);
      onUploaded?.(nextAsset);
      if (heroPayload && onHeroCropChange) {
        const deliveryUrl =
          getHeroCloudflareImageUrl({
            externalId: nextAsset.external_id,
            crop: heroPayload.crop,
            preferredVariant: 'heropage',
          }) ?? '';
        onHeroCropChange(heroPayload.crop, encodeHeroCropToUrl(deliveryUrl, heroPayload.crop));
      }
    } catch (uploadError: any) {
      setLastFailedUpload({ file: originalFile, heroPayload });
      reportError(uploadError?.message || 'Upload failed. Please try again.');
    } finally {
      setState('idle');
      clearInput();
    }
  };

  const handleHeroComposerConfirm = (payload: HeroComposerConfirmPayload) => {
    setCropFile(null);
    setIsReframingExistingHero(false);

    if (payload.file) {
      void uploadFile(payload.file, {
        crop: payload.crop,
        mode: payload.mode,
        naturalWidth: payload.naturalWidth,
        naturalHeight: payload.naturalHeight,
      });
      return;
    }

    // Re-framing an existing hero asset in-place without re-uploading or duplicating canonical assets
    const nextCrop = normalizeHeroCropConfig({
      ...payload.crop,
      sourceWidth: payload.naturalWidth || payload.crop.sourceWidth,
      sourceHeight: payload.naturalHeight || payload.crop.sourceHeight,
    });

    if (asset) {
      const updatedAsset: MediaAsset = {
        ...asset,
        focal_point_x: nextCrop.focalX,
        focal_point_y: nextCrop.focalY,
        hero_crop: nextCrop,
        source_width: payload.naturalWidth || asset.source_width || asset.width,
        source_height: payload.naturalHeight || asset.source_height || asset.height,
      };
      setAsset(updatedAsset);
      onUploaded?.(updatedAsset);
      const baseDeliveryUrl =
        getHeroCloudflareImageUrl({
          externalId: updatedAsset.external_id,
          crop: nextCrop,
          preferredVariant: 'heropage',
        }) ??
        existingImageUrl ??
        '';
      const urlWithCrop = encodeHeroCropToUrl(baseDeliveryUrl, nextCrop);
      onHeroCropChange?.(nextCrop, urlWithCrop);
      onExternalImageUrl?.(urlWithCrop);
      return;
    }

    if (existingImageUrl) {
      const urlWithCrop = encodeHeroCropToUrl(existingImageUrl, nextCrop);
      onHeroCropChange?.(nextCrop, urlWithCrop);
      onExternalImageUrl?.(urlWithCrop);
    }
  };

  const handleFile = (file?: File | null) => {
    setError('');
    if (!file) return;
    if (!ownerId.trim()) {
      reportError('Save or create this listing before uploading media.');
      clearInput();
      return;
    }
    if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type as any)) {
      reportError('Use a JPG, PNG, or WebP image. GIF, SVG, HEIC, and video uploads are not supported.');
      clearInput();
      return;
    }
    if (file.size > rule.maxUploadBytes) {
      reportError(`${rule.label} uploads are limited to ${formatMaxUploadSize(rule.maxUploadBytes)}.`);
      clearInput();
      return;
    }

    if (role === 'hero' || cropAspectRatio) {
      setCropFile(file);
      return;
    }
    void uploadFile(file);
  };

  const acceptExternalUrl = (candidate: string) => {
    const check = validateExternalImageUrl(candidate);
    if (!check.valid || !check.normalizedUrl) {
      reportError(check.error ?? 'Enter or drop a valid public HTTP(S) image URL.');
      return;
    }
    if (!onExternalImageUrl) {
      reportError('Linking external images is unavailable here.');
      return;
    }
    onExternalImageUrl(check.normalizedUrl);
    setImageUrl(check.normalizedUrl);
    setError('');
  };

  const onDropImage = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (isBusy) return;
    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith('image/'));
    if (file) {
      handleFile(file);
      return;
    }
    const uri = event.dataTransfer.getData('text/uri-list').split(/\r?\n/).find((line) => line && !line.startsWith('#'));
    const html = event.dataTransfer.getData('text/html');
    const src = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const text = event.dataTransfer.getData('text/plain');
    const candidate = src || uri || text;
    if (candidate) acceptExternalUrl(candidate);
    else reportError('Drop an image file or drag an image directly from a webpage.');
  };

  useEffect(() => {
    if (!externalFile) return;
    handleFile(externalFile);
    // A new File object represents an explicit external upload/crop request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFile]);

  const isLight = tone === 'light';
  const cropDialog =
    role === 'hero' && (cropFile || (isReframingExistingHero && previewUrl)) ? (
      <HeroImageComposerModal
        file={cropFile}
        existingImageUrl={cropFile ? null : previewUrl}
        initialCrop={resolvedHeroCrop}
        title={`${cropFile ? 'Compose' : 'Adjust'} ${label ?? rule.label}`}
        previewContext={heroPreviewContext}
        estimatedOptimizedBytes={estimatedOptimizedBytes}
        onCancel={() => {
          setCropFile(null);
          setIsReframingExistingHero(false);
          clearInput();
        }}
        onConfirm={handleHeroComposerConfirm}
      />
    ) : cropFile && cropAspectRatio ? (
      <ImageCropDialog
        file={cropFile}
        aspectRatio={cropAspectRatio}
        title={`Crop ${label ?? rule.label}`}
        onCancel={() => {
          setCropFile(null);
          clearInput();
        }}
        onConfirm={(croppedFile) => {
          setCropFile(null);
          void uploadFile(croppedFile);
        }}
      />
    ) : null;

  if (triggerOnly) {
    return (
      <>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={isBusy}
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />
        {cropDialog}
      </>
    );
  }

  return (
    <div
      onDragOver={(event) => { event.preventDefault(); if (!isBusy) setDragActive(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false); }}
      onDrop={onDropImage}
      className={[isLight ? 'rounded-xl border bg-gray-50 p-4' : 'rounded-2xl border bg-black/25 p-4', dragActive ? 'border-red-400 ring-2 ring-red-400/50' : isLight ? 'border-gray-200' : 'border-white/10'].join(' ')}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className={isLight ? 'text-xs text-gray-600' : 'text-xs text-gray-300'}>
          Drag an image here, upload a file, or select an existing canonical asset.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {role === 'hero' && previewUrl ? (
            <button
              type="button"
              data-testid="adjust-hero-framing-button"
              onClick={() => setIsReframingExistingHero(true)}
              className={
                isLight
                  ? 'inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-100'
                  : 'inline-flex items-center gap-1.5 rounded-lg border border-red-400/35 bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-500/25'
              }
            >
              <Sliders className="h-3.5 w-3.5 text-red-300" />
              Adjust Hero Framing
            </button>
          ) : null}
          {allowLibraryPick ? (
            <button
              type="button"
              onClick={() => setIsLibraryOpen(true)}
              className={
                isLight
                  ? 'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50'
                  : 'inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-gray-200 transition hover:bg-white/[0.12] hover:text-white'
              }
            >
              <FolderOpen className="h-3.5 w-3.5 text-red-400" />
              Choose From Media Library
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <label className="block">
            <span className={isLight ? 'mb-1 block text-sm font-semibold text-gray-800' : 'mb-1 block text-sm font-medium text-gray-300'}>{label ?? rule.label}</span>
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              data-testid={`media-file-input-${role}`}
              accept={accept}
              disabled={isBusy}
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
              className={isLight ? 'block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700 file:mr-4 file:rounded-full file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-gray-700 disabled:opacity-60' : 'block w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-gray-300 file:mr-4 file:rounded-full file:border-0 file:bg-red-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-red-600 disabled:opacity-60'}
            />
          </label>
          <p className={isLight ? 'mt-2 text-xs leading-5 text-gray-500' : 'mt-2 text-xs leading-5 text-gray-400'}>{helperText ?? rule.helperText}</p>
          {onExternalImageUrl ? (
            <form className="mt-3 flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); acceptExternalUrl(imageUrl); }}>
              <input type="url" aria-label="Direct image URL" placeholder="Paste image URL (https://…)" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/30 px-2 py-2 text-xs text-white" />
              <button type="submit" disabled={isBusy || !imageUrl.trim()} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Link image</button>
            </form>
          ) : null}
          {isBusy && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-red-200">
              {state === 'creating' ? 'Preparing upload' : state === 'uploading' ? 'Uploading image' : 'Saving media'}
            </p>
          )}
          {error && (
            <div
              role="alert"
              data-testid="media-upload-error"
              className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs text-red-200"
            >
              <span>{error}</span>
              {lastFailedUpload && !isBusy ? (
                <button
                  type="button"
                  data-testid="media-upload-retry-button"
                  onClick={() => void uploadFile(lastFailedUpload.file, lastFailedUpload.heroPayload)}
                  className="rounded-lg border border-red-300/40 bg-red-500/20 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-red-500/35"
                >
                  Retry upload
                </button>
              ) : null}
            </div>
          )}
        </div>
        <div
          className={
            role === 'hero'
              ? isLight
                ? 'relative flex aspect-[20/9] w-full items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-black md:w-64'
                : 'relative flex aspect-[20/9] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/60 md:w-64'
              : isLight
                ? 'flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white md:w-36'
                : 'flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/35 md:w-36'
          }
        >
          {role === 'hero' && previewUrl ? (
            <SharedHeroImage
              src={previewUrl}
              alt={asset?.alt_text ?? rule.label}
              crop={resolvedHeroCrop}
              viewport="desktop"
              className="h-full w-full"
            />
          ) : asset ? (
            <MediaImage asset={asset} className="h-full w-full" alt={asset.alt_text ?? rule.label} />
          ) : previewUrl ? (
            <img src={previewUrl} alt="" className={['h-full w-full', rule.objectFitClassName].join(' ')} />
          ) : (
            <span className="px-4 text-center text-xs text-gray-500">No image uploaded</span>
          )}
        </div>
      </div>

      {cropDialog}
      {allowLibraryPick ? (
        <MediaLibraryPickerModal
          isOpen={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          targetRole={role}
          targetOwnerType={ownerType}
          targetOwnerId={ownerId}
          onSelectCanonicalAsset={({ syntheticMediaAsset, resolvedUrl }) => {
            const nextAsset: MediaAsset =
              role === 'hero' && resolvedHeroCrop
                ? {
                    ...syntheticMediaAsset,
                    focal_point_x: resolvedHeroCrop.focalX,
                    focal_point_y: resolvedHeroCrop.focalY,
                    hero_crop: resolvedHeroCrop,
                  }
                : syntheticMediaAsset;
            setAsset(nextAsset);
            onUploaded?.(nextAsset);
            const finalUrl =
              role === 'hero' && resolvedHeroCrop
                ? encodeHeroCropToUrl(resolvedUrl, resolvedHeroCrop)
                : resolvedUrl;
            onExternalImageUrl?.(finalUrl);
          }}
        />
      ) : null}
    </div>
  );
};

export default MediaUploader;
