export type MediaOwnerType =
  | 'club'
  | 'club_brand'
  | 'venue'
  | 'event'
  | 'organization'
  | 'event_series'
  | 'resort'
  | 'cruise_series'
  | 'cruise_sailing'
  | 'user';

export type MediaRole = 'logo' | 'avatar' | 'hero' | 'cover' | 'flyer' | 'gallery';

export type MediaVariant =
  | 'logosquare'
  | 'avatarsquare'
  | 'herocard'
  | 'heropage'
  | 'coverpage'
  | 'flyercard'
  | 'flyerpage'
  | 'gallerythumb'
  | 'gallerypage';

export type MediaStorageProvider = 'cloudflare_images';

export type MediaStatus = 'pending_review' | 'approved' | 'rejected' | 'archived';

export type MediaAspectMode = 'contain' | 'cover';

export type MediaAsset = {
  id: string;
  owner_type: MediaOwnerType;
  owner_id: string;
  role: MediaRole;
  storage_provider: MediaStorageProvider;
  external_id: string;
  status: MediaStatus;
  aspect_mode: MediaAspectMode;
  target_ratio: string | null;
  alt_text: string | null;
  sort_order: number;
  focal_point_x: number | null;
  focal_point_y: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
