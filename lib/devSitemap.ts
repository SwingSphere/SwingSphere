import type { Listing } from '../types';

export type DevRouteCategory =
  | 'Discovery & globe'
  | 'Content & data'
  | 'Visual systems'
  | 'Mobile & responsive';

export type DevRouteCatalogEntry = {
  id: string;
  label: string;
  path: string;
  description: string;
  category: DevRouteCategory;
};

export const DEV_ROUTE_CATALOG: readonly DevRouteCatalogEntry[] = [
  {
    id: 'dev-globe',
    label: 'Production Globe Controls',
    path: '/dev/globe',
    description: 'Production globe with alignment, camera, and performance controls.',
    category: 'Discovery & globe',
  },
  {
    id: 'dev-hybrid-globe',
    label: 'Hybrid Globe',
    path: '/dev/hybrid-globe',
    description: 'Globe-to-map prototype with the calibrated pin and GeoJSON layers.',
    category: 'Discovery & globe',
  },
  {
    id: 'dev-globe-v3-cleanroom',
    label: 'Globe V3 Clean Room',
    path: '/dev/globe-v3-cleanroom',
    description: 'Isolated low-poly globe experiments.',
    category: 'Discovery & globe',
  },
  {
    id: 'dev-language-explorer-globe',
    label: 'Language Explorer Globe Lab',
    path: '/dev/language-explorer-globe',
    description: 'Country atlas, vector-border, and alignment laboratory.',
    category: 'Discovery & globe',
  },
  {
    id: 'dev-pin-marker-studio',
    label: 'Pin & Marker Studio',
    path: '/dev/pin-marker-studio',
    description: 'Marker comparison, hit-area, and zoom-scaling tests.',
    category: 'Discovery & globe',
  },
  {
    id: 'dev-border-surgery',
    label: 'Border Surgery',
    path: '/dev/border-surgery',
    description: 'Visual country-border correction and generator override editor.',
    category: 'Discovery & globe',
  },
  {
    id: 'dev-hero-camera',
    label: 'Hero Camera Studio',
    path: '/dev/hero-camera',
    description: 'Hero globe camera and arrival composition.',
    category: 'Visual systems',
  },
  {
    id: 'dev-lighting-audit',
    label: 'Globe Lighting Audit',
    path: '/dev/lighting-audit',
    description: 'Production globe lighting, bloom, and effects inspection.',
    category: 'Visual systems',
  },
  {
    id: 'dev-glass',
    label: 'Glass Material Lab',
    path: '/dev/glass',
    description: 'Liquid-glass material and surface experiments.',
    category: 'Visual systems',
  },
  {
    id: 'dev-living-background',
    label: 'Living Background Lab',
    path: '/dev/living-background',
    description: 'Animated geometric background studies.',
    category: 'Visual systems',
  },
  {
    id: 'dev-badges',
    label: 'Badge & Achievement Lab',
    path: '/dev/badges',
    description: 'Badge, achievement, and identity-state testing.',
    category: 'Visual systems',
  },
  {
    id: 'dev-mobile',
    label: 'Mobile Explorer Workbench',
    path: '/dev/mobile',
    description: 'Touch-first explorer and mobile destination workflow.',
    category: 'Mobile & responsive',
  },
  {
    id: 'dev-tablet',
    label: 'Tablet Explorer Workbench',
    path: '/dev/tablet',
    description: 'Tablet-sized explorer and destination workflow testing.',
    category: 'Mobile & responsive',
  },
  {
    id: 'dev-images',
    label: 'Image Library',
    path: '/dev/images',
    description: 'Current, duplicate, unresolved, and moderated media inventory.',
    category: 'Content & data',
  },
  {
    id: 'dev-street-view',
    label: 'Street View Tool',
    path: '/dev/street-view',
    description: 'Fixed-location 3D venue and streetscape authoring.',
    category: 'Content & data',
  },
  {
    id: 'dev-building-inspector',
    label: 'Building Inspector',
    path: '/dev/building-inspector',
    description: 'Building footprint, address, and venue verification.',
    category: 'Content & data',
  },
  {
    id: 'dev-building-capture',
    label: 'Building Capture',
    path: '/dev/building-capture',
    description: 'Building geometry capture workflow.',
    category: 'Content & data',
  },
  {
    id: 'dev-club-template',
    label: 'Club Template',
    path: '/dev/club-template',
    description: 'Controlled club-detail template fixture.',
    category: 'Content & data',
  },
  {
    id: 'dev-templates',
    label: 'Template Index',
    path: '/dev/templates',
    description: 'Template states and reusable QA fixtures.',
    category: 'Content & data',
  },
  {
    id: 'dev-sitemap',
    label: 'Dev Sitemap',
    path: '/dev/sitemap',
    description: 'Live route directory and content-state QA inventory.',
    category: 'Content & data',
  },
] as const;

type MediaRole = 'logo' | 'hero' | 'cover' | 'flyer' | 'gallery' | 'avatar';

type MediaCandidate = {
  identity: string;
  role: MediaRole;
};

export type ListingMediaSummary = {
  total: number;
  logoCount: number;
  heroCount: number;
  galleryCount: number;
  flyerCount: number;
  hasLogo: boolean;
  hasHero: boolean;
  status: 'none' | 'minimal' | 'multi-image';
};

const usableAsset = (asset: NonNullable<Listing['mediaAssets']>[number]) =>
  asset.status !== 'rejected' && asset.status !== 'archived' && Boolean(asset.external_id?.trim());

const normalizeUrl = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const summarizeListingMedia = (listing: Listing): ListingMediaSummary => {
  const candidates: MediaCandidate[] = [];
  const externalIds = new Set<string>();

  for (const asset of listing.mediaAssets ?? []) {
    if (!usableAsset(asset) || asset.role === 'avatar') continue;
    const externalId = asset.external_id.trim();
    externalIds.add(externalId);
    candidates.push({ identity: `asset:${externalId}`, role: asset.role });
  }

  const addUrl = (role: MediaRole, value: unknown) => {
    const url = normalizeUrl(value);
    if (!url || [...externalIds].some((externalId) => url.includes(externalId))) return;
    candidates.push({ identity: `url:${url}`, role });
  };

  addUrl('logo', listing.logoImageUrl);
  addUrl('hero', listing.headerImageUrl);
  for (const url of listing.galleryImageUrls ?? []) addUrl('gallery', url);

  const unique = new Map<string, MediaCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.identity)) unique.set(candidate.identity, candidate);
  }
  const media = [...unique.values()];
  const logoCount = media.filter((item) => item.role === 'logo').length;
  const heroCount = media.filter((item) => item.role === 'hero' || item.role === 'cover').length;
  const galleryCount = media.filter((item) => item.role === 'gallery').length;
  const flyerCount = media.filter((item) => item.role === 'flyer').length;
  const total = media.length;

  return {
    total,
    logoCount,
    heroCount,
    galleryCount,
    flyerCount,
    hasLogo: logoCount > 0,
    hasHero: heroCount > 0,
    status: total === 0 ? 'none' : total === 1 ? 'minimal' : 'multi-image',
  };
};

export const filterCatalogEntries = <T extends { label: string; path: string; description?: string; meta?: string }>(
  entries: readonly T[],
  query: string,
): T[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...entries];
  return entries.filter((entry) =>
    [entry.label, entry.path, entry.description, entry.meta]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalized)),
  );
};
