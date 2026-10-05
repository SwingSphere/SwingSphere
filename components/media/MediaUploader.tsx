import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { supabase } from '../../lib/supabase';
import { ALLOWED_MEDIA_MIME_TYPES, formatMaxUploadSize, getMediaRule } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaOwnerType, MediaRole } from '../../lib/media/types';
import ImageCropDialog from './ImageCropDialog';
import MediaImage from './MediaImage';

type MediaUploaderProps = {
  ownerType: MediaOwnerType;
  ownerId: string;
  role: MediaRole;
  existingAsset?: MediaAsset | null;
  onUploaded?: (asset: MediaAsset) => void;
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
};

type UploadState = 'idle' | 'creating' | 'uploading' | 'saving';

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
  onUploaded,
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
}) => {
  const rule = getMediaRule(role);
  const [asset, setAsset] = useState<MediaAsset | null>(existingAsset ?? null);
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string>('');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAsset(existingAsset ?? null);
  }, [existingAsset]);

  const previewUrl = useMemo(() => {
    if (!asset) return null;
    return getCloudflareImageUrl({ externalId: asset.external_id, variant: rule.defaultVariant });
  }, [asset, rule.defaultVariant]);

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

  const uploadFile = async (file: File) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Please log in before uploading media.');
      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      setState('creating');
      const createResponse = await fetch('/api/media/create-upload-url', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ownerType, ownerId, role, managedEntityId }),
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

      setState('saving');
      const completeResponse = await fetch('/api/media/complete-upload', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ownerType,
          ownerId,
          role,
          externalId,
          altText: file.name.replace(/\.[^.]+$/, ''),
          managedEntityId,
        }),
      });
      if (!completeResponse.ok) throw new Error(await getUploadError(completeResponse));
      const completePayload = await completeResponse.json();
      const nextAsset = completePayload.asset as MediaAsset;
      setAsset(nextAsset);
      onUploaded?.(nextAsset);
    } catch (uploadError: any) {
      reportError(uploadError?.message || 'Upload failed. Please try again.');
    } finally {
      setState('idle');
      clearInput();
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

    if (cropAspectRatio) {
      setCropFile(file);
      return;
    }
    void uploadFile(file);
  };

  const acceptExternalUrl = (candidate: string) => {
    try {
      const url = new URL(candidate.trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid protocol');
      if (url.username || url.password) throw new Error('Embedded credentials are not allowed');
      if (!onExternalImageUrl) throw new Error('Linking external images is unavailable here.');
      onExternalImageUrl(url.href);
      setImageUrl(url.href);
      setError('');
    } catch {
      reportError('Enter or drop a valid public HTTP(S) image URL.');
    }
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
  const cropDialog = cropFile && cropAspectRatio ? (
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
      <p className={isLight ? 'mb-3 text-xs text-gray-600' : 'mb-3 text-xs text-gray-300'}>Drag an image here from your computer or another website.</p>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <label className="block">
            <span className={isLight ? 'mb-1 block text-sm font-semibold text-gray-800' : 'mb-1 block text-sm font-medium text-gray-300'}>{label ?? rule.label}</span>
            <input
              id={inputId}
              ref={inputRef}
              type="file"
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
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </div>
        <div className={isLight ? 'flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white md:w-36' : 'flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/35 md:w-36'}>
          {asset ? (
            <MediaImage asset={asset} className="h-full w-full" alt={asset.alt_text ?? rule.label} />
          ) : previewUrl ? (
            <img src={previewUrl} alt="" className={['h-full w-full', rule.objectFitClassName].join(' ')} />
          ) : (
            <span className="px-4 text-center text-xs text-gray-500">No image uploaded</span>
          )}
        </div>
      </div>

      {cropDialog}
    </div>
  );
};

export default MediaUploader;
