import type { MediaAspectMode, MediaOwnerType, MediaRole, MediaVariant } from './types';

export const MEDIA_OWNER_TYPES = ['club', 'club_brand', 'venue', 'event', 'organization', 'resort', 'cruise_series', 'cruise_sailing', 'event_series', 'user'] as const satisfies readonly MediaOwnerType[];
export const MEDIA_ROLES = ['logo', 'avatar', 'hero', 'cover', 'flyer', 'gallery'] as const satisfies readonly MediaRole[];

export const ALLOWED_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type MediaRoleRule = {
  role: MediaRole;
  label: string;
  aspectMode: MediaAspectMode;
  targetRatio: string | null;
  maxUploadBytes: number;
  defaultVariant: MediaVariant;
  variants: MediaVariant[];
  helperText: string;
  objectFitClassName: 'object-contain' | 'object-cover';
};

const MB = 1024 * 1024;

export const mediaRules: Record<MediaRole, MediaRoleRule> = {
  logo: {
    role: 'logo',
    label: 'Logo',
    aspectMode: 'contain',
    targetRatio: '1:1',
    maxUploadBytes: 3 * MB,
    defaultVariant: 'logosquare',
    variants: ['logosquare'],
    helperText: 'Upload a JPG, PNG, or WebP logo up to 3 MB. Rectangular logos are preserved without cropping.',
    objectFitClassName: 'object-contain',
  },
  avatar: {
    role: 'avatar',
    label: 'Avatar',
    aspectMode: 'cover',
    targetRatio: '1:1',
    maxUploadBytes: 3 * MB,
    defaultVariant: 'avatarsquare',
    variants: ['avatarsquare'],
    helperText: 'Upload a JPG, PNG, or WebP avatar up to 3 MB. The final image is square and may be cropped.',
    objectFitClassName: 'object-cover',
  },
  hero: {
    role: 'hero',
    label: 'Hero image',
    aspectMode: 'cover',
    targetRatio: '16:9',
    maxUploadBytes: 8 * MB,
    defaultVariant: 'heropage',
    variants: ['herocard', 'heropage'],
    helperText: 'Upload a JPG, PNG, or WebP hero image up to 8 MB. Wide 16:9 photography works best.',
    objectFitClassName: 'object-cover',
  },
  cover: {
    role: 'cover',
    label: 'Cover image',
    aspectMode: 'cover',
    targetRatio: '3:1',
    maxUploadBytes: 8 * MB,
    defaultVariant: 'coverpage',
    variants: ['coverpage'],
    helperText: 'Upload a JPG, PNG, or WebP cover image up to 8 MB. Use a wide composition.',
    objectFitClassName: 'object-cover',
  },
  flyer: {
    role: 'flyer',
    label: 'Event flyer',
    aspectMode: 'contain',
    targetRatio: null,
    maxUploadBytes: 8 * MB,
    defaultVariant: 'flyercard',
    variants: ['flyercard', 'flyerpage'],
    helperText: 'Recommended flyer size: 1080 x 1350 px. Vertical flyers work best. We will preserve the full flyer and resize it for the website without cropping.',
    objectFitClassName: 'object-contain',
  },
  gallery: {
    role: 'gallery',
    label: 'Gallery image',
    aspectMode: 'cover',
    targetRatio: '4:3',
    maxUploadBytes: 8 * MB,
    defaultVariant: 'gallerythumb',
    variants: ['gallerythumb', 'gallerypage'],
    helperText: 'Upload JPG, PNG, or WebP gallery images up to 8 MB each. Landscape 4:3 images work best.',
    objectFitClassName: 'object-cover',
  },
};

export const isMediaOwnerType = (value: unknown): value is MediaOwnerType =>
  typeof value === 'string' && MEDIA_OWNER_TYPES.includes(value as MediaOwnerType);

export const isMediaRole = (value: unknown): value is MediaRole =>
  typeof value === 'string' && MEDIA_ROLES.includes(value as MediaRole);

export const isMediaVariant = (value: unknown): value is MediaVariant =>
  typeof value === 'string' && Object.values(mediaRules).some((rule) => rule.variants.includes(value as MediaVariant));

export const getMediaRule = (role: MediaRole) => mediaRules[role];

export const formatMaxUploadSize = (bytes: number) => `${Math.round(bytes / MB)} MB`;
