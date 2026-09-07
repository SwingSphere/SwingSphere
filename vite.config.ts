import path from 'path';
import fs from 'fs';
import { spawn, spawnSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import * as THREE from 'three';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import { mockData } from './data/mockData';
import { normalizeAdmin1, normalizeCountry, normalizePlace, slugifyPlace } from './lib/geoNormalize';
import { completeMediaUpload, createCloudflareDirectUpload, deleteMediaAsset, moderateMediaAsset } from './lib/media/serverActions';
import { deleteAuthenticatedAccount } from './lib/accountDeletionServer';
import { createNominatimBuildingAddressResolver } from './lib/buildingAddressResolver';
import { queryMicrosoftBuildingFootprints } from './lib/microsoftBuildingFootprintsServer';
import { createAuthenticatedSupabaseServerClient, requireActiveAdmin } from './lib/adminServerAuth';
import { BUILDING_PERSISTENCE_POLICY_VERSION, createBuildingVerificationInputSnapshot, guardBuildingAssetPersistence } from './lib/buildingPersistenceGuard';
import { auditBuildingGeometry } from './lib/buildingGeometry';
import type { BuildingAssetHistoryEvent } from './lib/buildingAssetHistory';
import type { BuildingVerificationEvidenceRecord, BuildingVerificationReviewEvent } from './lib/buildingVerificationEvidence';

type GeoAddress = {
  country?: string;
  region?: string;
  city?: string;
  postalCode?: string;
  countrySlug?: string;
  admin1Slug?: string;
  citySlug?: string;
  isCityState?: boolean;
};

const ROOT_DIR = path.resolve(__dirname);
const GEO_ROOT = path.join(ROOT_DIR, 'public', 'geo', 'country');
const PUBLIC_GEO_ROOT = path.join(ROOT_DIR, 'public', 'geo');
const GEO_TOOL = path.join(ROOT_DIR, 'tools', 'geo_tool.py');
const OSM_TO_GEOJSON = path.join(ROOT_DIR, 'tools', 'osmtogeojson.cjs');
const PROCESS_GEO = path.join(ROOT_DIR, 'scripts', 'process_geo.py');
const BOUNDARY_TMP_ROOT = path.join(ROOT_DIR, 'tools', '.geo_boundary_builder');
const LANDMASK_PATH = path.join(ROOT_DIR, 'public', 'geo', '_land', 'ne_land_simplified.geojson');
const PYTHON_BIN = process.env.PYTHON || 'python';
const LISTINGS_STORE = path.join(ROOT_DIR, 'data', 'listings.local.json');
const BUILDING_ASSETS_STORE = path.join(ROOT_DIR, 'data', 'building-assets.local.json');
const BUILDING_VERIFICATION_EVIDENCE_STORE = path.join(ROOT_DIR, 'data', 'building-verification-evidence.local.json');
const BUILDING_VERIFICATION_REVIEW_STORE = path.join(ROOT_DIR, 'data', 'building-verification-reviews.local.json');
const BUILDING_ASSET_HISTORY_STORE = path.join(ROOT_DIR, 'data', 'building-asset-history.local.json');
const BUILDING_ADDRESS_CACHE_STORE = path.join(ROOT_DIR, '.codex-temp', 'building-address-cache.local.json');
const BUILDING_FOOTPRINT_CACHE_DIR = path.join(ROOT_DIR, '.codex-temp', 'microsoft-building-footprints');
const BUILDING_AUTO_PERSISTENCE_ENV = 'SWINGSPHERE_BUILDING_AUTO_PERSISTENCE';
const STREET_VIEW_PROFILES_STORE = path.join(ROOT_DIR, 'data', 'street-view-profiles.local.json');
const GLOBE_RUNTIME_CONFIG_PATH = path.join(ROOT_DIR, 'src', 'features', 'globe', 'runtime', 'GlobeRuntimeConfig.js');
const GLOBE_BORDER_OVERRIDE_PATH = path.join(ROOT_DIR, 'scripts', 'globe', 'manual-border-overrides.json');
const GLOBE_BORDER_GENERATOR_PATH = path.join(ROOT_DIR, 'scripts', 'globe', 'build-land-coastlines.mjs');
const GLOBE_SHOWCASE_MODULE_ID = 'virtual:swingsphere-globe-showcase-events';
const RESOLVED_GLOBE_SHOWCASE_MODULE_ID = `\0${GLOBE_SHOWCASE_MODULE_ID}`;
const PUBLIC_LISTINGS_MODULE_ID = 'virtual:swingsphere-public-listings';
const RESOLVED_PUBLIC_LISTINGS_MODULE_ID = `\0${PUBLIC_LISTINGS_MODULE_ID}`;
const PUBLIC_STREET_VIEW_BUILDING_ASSETS_MODULE_ID = 'virtual:swingsphere-public-street-view-building-assets';
const RESOLVED_PUBLIC_STREET_VIEW_BUILDING_ASSETS_MODULE_ID = `\0${PUBLIC_STREET_VIEW_BUILDING_ASSETS_MODULE_ID}`;
const SCHEMA_VERSION_MODULE_ID = 'virtual:swingsphere-schema-version';
const RESOLVED_SCHEMA_VERSION_MODULE_ID = `\0${SCHEMA_VERSION_MODULE_ID}`;
const MIGRATIONS_ROOT = path.join(ROOT_DIR, 'supabase', 'migrations');

const loadPublicListings = () => {
  if (!fs.existsSync(LISTINGS_STORE)) {
    throw new Error(`Public listings source is missing: ${LISTINGS_STORE}`);
  }

  const source = JSON.parse(fs.readFileSync(LISTINGS_STORE, 'utf8'));
  if (!Array.isArray(source)) {
    throw new Error('Public listings source must be an array of listings.');
  }

  return source.flatMap((listing: any) => {
    const latitude = Number(listing?.geopoint?.latitude);
    const longitude = Number(listing?.geopoint?.longitude);
    if (
      listing?.status !== 'approved'
      || !String(listing?.id ?? '').trim()
      || !String(listing?.name ?? '').trim()
      || !['club', 'event'].includes(listing?.type)
      || !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
    ) {
      return [];
    }

    const publicListing = JSON.parse(JSON.stringify(listing));
    if (listing.locationVisibility === 'approximate_public' || listing.isAddressPrivate === true) {
      const address = listing.geopoint?.address ?? {};
      publicListing.location = [address.city, address.region, address.postalCode, address.country]
        .filter(Boolean)
        .join(', ');
      publicListing.geopoint = {
        latitude: Math.round(latitude * 100) / 100,
        longitude: Math.round(longitude * 100) / 100,
        address: {
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
        },
      };
    }

    return [publicListing];
  });
};

const loadPublicStreetViewBuildingAssets = () => {
  if (!fs.existsSync(BUILDING_ASSETS_STORE)) return [];

  const source = JSON.parse(fs.readFileSync(BUILDING_ASSETS_STORE, 'utf8'));
  if (!Array.isArray(source)) {
    throw new Error('Public Street View building-asset source must be an array.');
  }

  const precisePublicListingIds = new Set(
    loadPublicListings()
      .filter((listing: any) => (
        listing?.status === 'approved'
        && listing?.type === 'club'
        && listing?.isAddressPrivate !== true
        && listing?.locationVisibility !== 'approximate_public'
        && listing?.locationVisibility !== 'private'
        && listing?.locationVisibility !== 'hidden'
        && listing?.locationMeta?.status !== 'private'
      ))
      .map((listing: any) => String(listing?.id ?? '').trim())
      .filter(Boolean),
  );

  return source.filter((asset: any) => precisePublicListingIds.has(String(asset?.listingId ?? '').trim()));
};

const loadPublicGlobeShowcaseEvents = () => {
  const events = loadPublicListings().flatMap((listing: any) => {
    const latitude = Number(listing?.geopoint?.latitude);
    const longitude = Number(listing?.geopoint?.longitude);
    if (
      listing?.type !== 'club'
      || listing?.status !== 'approved'
      || !String(listing?.id ?? '').trim()
      || !String(listing?.name ?? '').trim()
      || !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
    ) {
      return [];
    }

    const address = listing?.geopoint?.address ?? {};
    const city = String(address.city ?? '').trim();
    const region = String(address.region ?? '').trim();
    const country = String(address.country ?? '').trim();
    const isApproximate = listing.locationVisibility === 'approximate_public';
    const publicLatitude = isApproximate ? Math.round(latitude * 100) / 100 : latitude;
    const publicLongitude = isApproximate ? Math.round(longitude * 100) / 100 : longitude;
    const logoImageUrl = typeof listing.logoImageUrl === 'string' && listing.logoImageUrl.trim()
      ? listing.logoImageUrl.trim()
      : undefined;

    const id = String(listing.id);
    const name = String(listing.name);
    const publicListing = {
      id,
      type: 'club',
      name,
      description_short: '',
      location: [city, region, country].filter(Boolean).join(', '),
      contactEmail: '',
      locationVisibility: isApproximate ? 'approximate_public' : 'exact_public',
      geopoint: {
        latitude: publicLatitude,
        longitude: publicLongitude,
        address: { city, region, country },
      },
      schedule: [],
      generalAmenities: [],
      ...(logoImageUrl ? { logoImageUrl } : {}),
      status: 'approved',
      postedByUserId: 'public-showcase',
    };

    return [{
      id,
      name,
      lat: publicLatitude,
      lon: publicLongitude,
      countryIso2: normalizeCountry(country).toUpperCase(),
      countryIso3: '',
      listingId: id,
      listing: publicListing,
    }];
  });

  if (!events.length) {
    throw new Error('Globe showcase source contains no approved, geocoded clubs.');
  }

  return events;
};

const loadLocalSchemaVersion = () => {
  const migrationFiles = fs.existsSync(MIGRATIONS_ROOT)
    ? fs.readdirSync(MIGRATIONS_ROOT)
      .filter((file) => /^\d{14}_.+\.sql$/.test(file))
      .sort()
    : [];
  const latest = migrationFiles.at(-1) ?? '';
  const match = latest.match(/^(\d{14})_(.+)\.sql$/);
  return {
    version: match?.[1] ?? '',
    name: match?.[2] ?? '',
    filename: latest,
  };
};

const globeShowcaseDataPlugin = () => ({
  name: 'swingsphere-globe-showcase-data',
  resolveId(id: string) {
    if (id === GLOBE_SHOWCASE_MODULE_ID) return RESOLVED_GLOBE_SHOWCASE_MODULE_ID;
    if (id === PUBLIC_LISTINGS_MODULE_ID) return RESOLVED_PUBLIC_LISTINGS_MODULE_ID;
    if (id === PUBLIC_STREET_VIEW_BUILDING_ASSETS_MODULE_ID) return RESOLVED_PUBLIC_STREET_VIEW_BUILDING_ASSETS_MODULE_ID;
    if (id === SCHEMA_VERSION_MODULE_ID) return RESOLVED_SCHEMA_VERSION_MODULE_ID;
    return null;
  },
  load(id: string) {
    if (id === RESOLVED_GLOBE_SHOWCASE_MODULE_ID) {
      return `export default ${JSON.stringify(loadPublicGlobeShowcaseEvents())};`;
    }
    if (id === RESOLVED_PUBLIC_LISTINGS_MODULE_ID) {
      return `export default ${JSON.stringify(loadPublicListings())};`;
    }
    if (id === RESOLVED_PUBLIC_STREET_VIEW_BUILDING_ASSETS_MODULE_ID) {
      return `export default ${JSON.stringify(loadPublicStreetViewBuildingAssets())};`;
    }
    if (id === RESOLVED_SCHEMA_VERSION_MODULE_ID) {
      return `export default ${JSON.stringify(loadLocalSchemaVersion())};`;
    }
    return null;
  },
});

const comingSoonEntryPlugin = (enabled: boolean) => ({
  name: 'swingsphere-coming-soon-entry',
  transformIndexHtml: {
    order: 'pre' as const,
    handler(html: string) {
      if (!enabled) return html;
      return html.replace('src="/index.tsx"', 'src="/coming-soon.tsx"');
    },
  },
});

const loadListingsFromDisk = () => {
  if (!fs.existsSync(LISTINGS_STORE)) {
    return [...mockData];
  }
  try {
    const raw = fs.readFileSync(LISTINGS_STORE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to read listings.local.json, falling back to mockData.', error);
  }
  return [...mockData];
};

const saveListingsToDisk = (listings: any[]) => {
  fs.mkdirSync(path.dirname(LISTINGS_STORE), { recursive: true });
  fs.writeFileSync(LISTINGS_STORE, JSON.stringify(listings, null, 2));
};

const loadBuildingAssetsFromDisk = () => {
  if (!fs.existsSync(BUILDING_ASSETS_STORE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(BUILDING_ASSETS_STORE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to read building-assets.local.json.', error);
  }
  return [];
};

const saveBuildingAssetsToDisk = (assets: any[]) => {
  fs.mkdirSync(path.dirname(BUILDING_ASSETS_STORE), { recursive: true });
  fs.writeFileSync(BUILDING_ASSETS_STORE, JSON.stringify(assets, null, 2));
};

const loadJsonArray = (filePath: string) => {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`Failed to read ${path.basename(filePath)}.`, error);
    return [];
  }
};

const saveJsonArray = (filePath: string, records: any[]) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const backupPath = `${filePath}.${process.pid}.bak`;
  fs.writeFileSync(temporaryPath, JSON.stringify(records, null, 2));
  let backedUp = false;
  try {
    if (fs.existsSync(filePath)) {
      if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
      fs.renameSync(filePath, backupPath);
      backedUp = true;
    }
    fs.renameSync(temporaryPath, filePath);
    if (backedUp && fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    if (backedUp && fs.existsSync(backupPath) && !fs.existsSync(filePath)) fs.renameSync(backupPath, filePath);
    throw error;
  }
};

const requireBuildingAdmin = async (req: any, res: any) => {
  try {
    return await requireActiveAdmin(req.headers.authorization);
  } catch (error) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Active admin access is required.' }));
    return null;
  }
};

const loadAuthoritativeBuildingCollections = async (authorization?: string | null) => {
  const { supabase } = createAuthenticatedSupabaseServerClient(authorization);
  const [listingResult, venueResult, relationshipResult] = await Promise.all([
    supabase.rpc('list_accessible_listings'),
    supabase.from('venues').select('*'),
    supabase.from('organization_venue_relationships').select('*'),
  ]);
  if (listingResult.error) throw new Error(`Could not load canonical listings: ${listingResult.error.message}`);
  if (venueResult.error) throw new Error(`Could not load canonical venues: ${venueResult.error.message}`);
  if (relationshipResult.error) throw new Error(`Could not load canonical venue relationships: ${relationshipResult.error.message}`);

  const listings = Array.isArray(listingResult.data) ? listingResult.data : [];
  const venues = (venueResult.data ?? []).map((row: any) => ({
    id: row.id,
    type: 'venue',
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    address: row.address ?? {},
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    locationMeta: row.location_meta ?? undefined,
    visibility: row.visibility,
    status: row.status,
    amenities: row.amenities ?? [],
    parkingNotes: row.parking_notes ?? undefined,
    accessibilityNotes: row.accessibility_notes ?? undefined,
    logoImageUrl: row.logo_image_url ?? undefined,
    headerImageUrl: row.header_image_url ?? undefined,
    galleryImageUrls: row.gallery_image_urls ?? [],
    buildingAssetId: row.building_asset_id ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  }));
  const relationships = (relationshipResult.data ?? []).map((row: any) => ({
    id: row.id,
    organizationId: row.organization_id,
    venueId: row.venue_id,
    relationshipType: row.relationship_type,
    label: row.label ?? undefined,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    isPrimary: Boolean(row.is_primary),
    confidence: row.confidence === null || row.confidence === undefined ? undefined : Number(row.confidence),
    notes: row.notes ?? undefined,
  }));

  return { listings, venues, relationships };
};

const serverBuildingAddressResolver = createNominatimBuildingAddressResolver({
  minimumIntervalMs: 1_100,
  maximumAttempts: 3,
  timeoutMs: 9_000,
  userAgent: 'SwingSphereBuildingInspector/1.0 (admin development cache)',
});

const getBuildingAddressCacheKey = (body: any) => {
  const fingerprint = String(body?.footprintFingerprint ?? '').trim();
  if (fingerprint) return `footprint:${fingerprint}`;
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? `coordinate:${lat.toFixed(5)},${lng.toFixed(5)}` : '';
};

const listingAllowsPreciseBuildingLookup = (listing: any) => Boolean(
  listing
  && listing.status === 'approved'
  && listing.isAddressPrivate !== true
  && listing.locationVisibility !== 'approximate_public'
  && listing.locationVisibility !== 'private'
  && listing.locationMeta?.status !== 'private',
);

const toFiniteNumber = (value: unknown, fallback: number) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const saveHeroArrivalProfileToDisk = (profile: any) => {
  const source = fs.readFileSync(GLOBE_RUNTIME_CONFIG_PATH, 'utf8');
  const durationMs = Math.round(toFiniteNumber(profile.durationMs, 1200));
  const ease = ['cinematic', 'cubic', 'smooth'].includes(String(profile.ease))
    ? String(profile.ease)
    : 'cinematic';
  const mode = ['legacy', 'destinationTilt'].includes(String(profile.mode))
    ? String(profile.mode)
    : 'destinationTilt';
  const stage = profile.heroStage ?? {};
  const composition = profile.heroComposition ?? {};
  const destinationTilt = mode === 'destinationTilt';
  const stageDistance = toFiniteNumber(stage.distance, toFiniteNumber(profile.centerDistance, 5.68));
  const focusDistance = destinationTilt ? stageDistance : toFiniteNumber(profile.focusDistance, 4.95);
  const offsetX = destinationTilt ? 0 : toFiniteNumber(profile.offsetX, 0.01);
  const offsetY = destinationTilt ? 0 : toFiniteNumber(profile.offsetY, 0.035);
  const cameraYOffset = destinationTilt ? 0 : toFiniteNumber(profile.cameraYOffset, -0.38);
  const compositionSubject = ['label', 'pin'].includes(String(composition.subject))
    ? String(composition.subject)
    : 'label';
  const sharedHeroLines = [
    '    heroArrival: {',
    `      enabled: ${profile.enabled !== false},`,
    `      mode: "${mode}",`,
    `      centerDistance: ${stageDistance},`
  ];
  const legacyHeroLines = destinationTilt ? [] : [
    `      tangentOffset: ${toFiniteNumber(profile.tangentOffset, 0.18)},`,
    `      sideOffset: ${toFiniteNumber(profile.sideOffset, 0.06)},`,
    `      horizontalOffset: ${toFiniteNumber(profile.horizontalOffset, 0)},`,
    `      verticalOffset: ${toFiniteNumber(profile.verticalOffset, -0.42)},`,
    `      lookAtOffset: ${toFiniteNumber(profile.lookAtOffset, 0)},`,
    `      horizonBias: ${toFiniteNumber(profile.horizonBias, 0)},`,
    `      destinationScreenX: ${toFiniteNumber(profile.destinationScreenX, 0.5)},`,
    `      destinationScreenY: ${toFiniteNumber(profile.destinationScreenY, 0.5)},`
  ];
  const heroBlock = [
    ...sharedHeroLines,
    ...legacyHeroLines,
    `      fov: ${toFiniteNumber(profile.fov, 45)},`,
    `      ease: "${ease}",`,
    '      heroStage: {',
    `        distance: ${stageDistance},`,
    `        tiltDegrees: ${toFiniteNumber(stage.tiltDegrees, 18)},`,
    `        headingDegrees: ${toFiniteNumber(stage.headingDegrees, 0)},`,
    `        globeScreenX: ${toFiniteNumber(stage.globeScreenX, 0.5)},`,
    `        globeScreenY: ${toFiniteNumber(stage.globeScreenY, 0.62)},`,
    `        labelAnchorX: ${toFiniteNumber(stage.labelAnchorX, toFiniteNumber(composition.anchorX, 0.5))},`,
    `        labelAnchorY: ${toFiniteNumber(stage.labelAnchorY, toFiniteNumber(composition.anchorY, 0.44))}`,
    '      },',
    '      heroComposition: {',
    `        anchorX: ${toFiniteNumber(composition.anchorX, 0.5)},`,
    `        anchorY: ${toFiniteNumber(composition.anchorY, 0.44)},`,
    `        subject: "${compositionSubject}",`,
    `        tolerancePx: ${toFiniteNumber(composition.tolerancePx, 3)},`,
    `        maxCorrectionDegrees: ${toFiniteNumber(composition.maxCorrectionDegrees, 3)}`,
    '      }',
    '    }',
  ].join('\n');
  let next = source
    .replace(/durationMs:\s*[-\d.]+,/, `durationMs: ${durationMs},`)
    .replace(/focusDistance:\s*[-\d.]+,/, `focusDistance: ${focusDistance},`)
    .replace(/offsetX:\s*[-\d.]+,/, `offsetX: ${offsetX},`)
    .replace(/offsetY:\s*[-\d.]+,/, `offsetY: ${offsetY},`)
    .replace(/cameraYOffset:\s*[-\d.]+,/, `cameraYOffset: ${cameraYOffset},`);
  next = next.replace(/    heroArrival:\s*\{[\s\S]*?\n    \}/, heroBlock);
  fs.writeFileSync(GLOBE_RUNTIME_CONFIG_PATH, next);
};

const LIGHTING_AUDIT_LIGHT_KEYS = [
  'ambient',
  'hemisphere',
  'directionalKey',
  'softKey',
  'fill',
  'undersideFill',
  'rearFill',
  'crimsonRim',
  'crimsonBack',
  'crimsonBounce',
] as const;

const LIGHTING_AUDIT_EFFECT_KEYS = [
  'backgroundGradient',
  'backgroundHaze',
  'backgroundGlow',
  'innerAtmosphere',
  'outerAtmosphere',
  'crimsonRimShell',
  'bloom',
  'graphiteFacet',
  'landEmissive',
  'oceanEmissive',
] as const;

const saveLightingAuditStateToDisk = (state: any) => {
  const source = fs.readFileSync(GLOBE_RUNTIME_CONFIG_PATH, 'utf8');
  const lightState = state?.lights ?? {};
  const effectState = state?.effects ?? {};
  const missingLightState = LIGHTING_AUDIT_LIGHT_KEYS.filter((key) => typeof lightState[key] !== 'boolean');
  const missingEffectState = LIGHTING_AUDIT_EFFECT_KEYS.filter((key) => typeof effectState[key] !== 'boolean');
  const bloomSettings = state?.bloomSettings ?? {};
  const bloomValues = ['strength', 'radius', 'threshold', 'resolutionScale'] as const;
  const missingBloomState = bloomValues.filter((key) => !Number.isFinite(Number(bloomSettings[key])));
  if (missingLightState.length || missingEffectState.length || missingBloomState.length || !Number.isFinite(Number(state?.crimsonRimStrength))) {
    throw new Error(`Lighting state is incomplete. Missing lights: ${missingLightState.join(', ') || 'none'}; missing effects: ${missingEffectState.join(', ') || 'none'}; missing bloom: ${missingBloomState.join(', ') || 'none'}.`);
  }
  let next = source;

  for (const key of LIGHTING_AUDIT_LIGHT_KEYS) {
    const enabled = lightState[key] !== false;
    const pattern = new RegExp(`^(\\s{4}${key}: \\{)([^\\n]*)(\\},?)$`, 'm');
    next = next.replace(pattern, (_match, prefix, body, suffix) => {
      const cleanBody = String(body)
        .replace(/\benabled:\s*(?:true|false),?\s*/g, '')
        .trim()
        .replace(/^,\s*/, '');
      return `${prefix} enabled: ${enabled}, ${cleanBody}${suffix}`;
    });
  }

  let effectsBlock = [
    '  renderEffects: {',
    ...LIGHTING_AUDIT_EFFECT_KEYS.map((key, index) => {
      const comma = index === LIGHTING_AUDIT_EFFECT_KEYS.length - 1 ? '' : ',';
      return `    ${key}: ${effectState[key] !== false}${comma}`;
    }),
    '  },',
  ].join('\n');

  effectsBlock = effectsBlock
    .split(String.fromCharCode(92, 110))
    .join(String.fromCharCode(10));

  if (/  renderEffects:\s*\{[\s\S]*?\n  \},/.test(next)) {
    next = next.replace(/  renderEffects:\s*\{[\s\S]*?\n  \},/, effectsBlock);
  } else {
    next = next.replace(/\n  lights:\s*\{/, `\n${effectsBlock}\n  lights: {`);
  }

  const rimStrength = Math.max(0, Math.min(3, toFiniteNumber(state?.crimsonRimStrength, 1.05)));
  next = next.replace(
    /(  crimsonRim:\s*\{[\s\S]*?\n\s*rimStrength:\s*)[-\d.]+/,
    `$1${rimStrength}`,
  );

  const bloomStrength = Math.max(0, Math.min(4, toFiniteNumber(bloomSettings.strength, 1.512)));
  const bloomRadius = Math.max(0, Math.min(1, toFiniteNumber(bloomSettings.radius, 0.397)));
  const bloomThreshold = Math.max(0, Math.min(1, toFiniteNumber(bloomSettings.threshold, 0.3)));
  const bloomResolutionScale = Math.max(0.35, Math.min(1, toFiniteNumber(bloomSettings.resolutionScale, 0.75)));

  next = next
    .replace(/(    highBloom:\s*\{[\s\S]*?strength:\s*)[-\d.]+/, `$1${bloomStrength}`)
    .replace(/(    highBloom:\s*\{[\s\S]*?radius:\s*)[-\d.]+/, `$1${bloomRadius}`)
    .replace(/(    highBloom:\s*\{[\s\S]*?threshold:\s*)[-\d.]+/, `$1${bloomThreshold}`)
    .replace(/(  bloom:\s*\{[\s\S]*?strength:\s*)[-\d.]+/, `$1${bloomStrength}`)
    .replace(/(  bloom:\s*\{[\s\S]*?radius:\s*)[-\d.]+/, `$1${bloomRadius}`)
    .replace(/(  bloom:\s*\{[\s\S]*?threshold:\s*)[-\d.]+/, `$1${bloomThreshold}`)
    .replace(/(  bloom:\s*\{[\s\S]*?resolutionScale:\s*)[-\d.]+/, `$1${bloomResolutionScale}`);

  const syntaxCheckPath = `${GLOBE_RUNTIME_CONFIG_PATH}.lighting-audit-check.mjs`;
  try {
    fs.writeFileSync(syntaxCheckPath, next, 'utf8');
    const syntaxCheck = spawnSync(process.execPath, ['--check', syntaxCheckPath], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (syntaxCheck.status !== 0) {
      const detail = String(syntaxCheck.stderr || syntaxCheck.stdout || 'Unknown JavaScript syntax error.').trim();
      throw new Error(`Lighting state save was rejected before touching production config. ${detail}`);
    }
    fs.writeFileSync(GLOBE_RUNTIME_CONFIG_PATH, next, 'utf8');
  } finally {
    fs.rmSync(syntaxCheckPath, { force: true });
  }
};

const loadStreetViewProfiles = (): any[] => {
  if (!fs.existsSync(STREET_VIEW_PROFILES_STORE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(STREET_VIEW_PROFILES_STORE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getStreetViewProfile = (listingId: string) =>
  loadStreetViewProfiles().find((profile) => String(profile?.listingId ?? '') === listingId) ?? null;

const saveStreetViewProfile = (profile: any) => {
  const listingId = String(profile?.listingId ?? '').trim();
  const camera = profile?.camera ?? {};
  const selectedFeatures = profile?.buildingSelection?.geometry?.features;
  if (!listingId) throw new Error('Street View profile is missing listingId.');
  if (!Array.isArray(selectedFeatures) || !selectedFeatures.length) {
    throw new Error('Street View profile must contain at least one selected building footprint.');
  }
  for (const key of ['zoom', 'pitch', 'bearing'] as const) {
    if (!Number.isFinite(Number(camera[key]))) throw new Error(`Street View camera ${key} must be finite.`);
  }
  if (!Array.isArray(camera.center) || camera.center.length !== 2 || camera.center.some((value: unknown) => !Number.isFinite(Number(value)))) {
    throw new Error('Street View camera center must be [longitude, latitude].');
  }

  const profiles = loadStreetViewProfiles();
  const saved = {
    ...profile,
    id: String(profile?.id || `street-view-${listingId}`),
    version: 1,
    listingId,
    updatedAt: new Date().toISOString(),
  };
  const index = profiles.findIndex((candidate) => String(candidate?.listingId ?? '') === listingId);
  if (index >= 0) profiles[index] = saved;
  else profiles.push(saved);
  fs.writeFileSync(STREET_VIEW_PROFILES_STORE, `${JSON.stringify(profiles, null, 2)}\n`, 'utf8');
  return saved;
};

const loadManualBorderOverrides = () => {
  if (!fs.existsSync(GLOBE_BORDER_OVERRIDE_PATH)) return { version: 1, countries: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(GLOBE_BORDER_OVERRIDE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object'
      ? { version: 1, countries: parsed.countries ?? {} }
      : { version: 1, countries: {} };
  } catch {
    return { version: 1, countries: {} };
  }
};

const saveManualBorderOverride = (payload: any) => {
  const countryId = String(payload?.countryId ?? '').trim().toUpperCase();
  const ringId = String(payload?.ringId ?? '').trim();
  if (!/^[A-Z]{3}$/.test(countryId)) throw new Error('A three-letter country id is required.');
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(ringId)) throw new Error('A valid ring id is required.');

  const rawCoordinates = Array.isArray(payload?.coordinates) ? payload.coordinates : [];
  const coordinates = rawCoordinates.map((coordinate: any) => [Number(coordinate?.[0]), Number(coordinate?.[1])]);
  if (coordinates.length < 4) throw new Error('A border ring requires at least three unique points plus closure.');
  for (const coordinate of coordinates) {
    if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1]) || coordinate[0] < -180 || coordinate[0] > 180 || coordinate[1] < -90 || coordinate[1] > 90) {
      throw new Error('Border coordinates must contain valid longitude/latitude pairs.');
    }
  }
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (Math.abs(first[0] - last[0]) > 1e-8 || Math.abs(first[1] - last[1]) > 1e-8) {
    coordinates.push([...first]);
  }
  const edgeCount = coordinates.length - 1;
  const edgeKinds = Array.from({ length: edgeCount }, (_, index) =>
    payload?.edgeKinds?.[index] === 'coastline' ? 'coastline' : 'political'
  );

  const overrides = loadManualBorderOverrides();
  const country = overrides.countries[countryId] ?? { rings: {} };
  overrides.countries[countryId] = {
    ...country,
    rings: {
      ...(country.rings ?? {}),
      [ringId]: {
        coordinates,
        edgeKinds,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  fs.mkdirSync(path.dirname(GLOBE_BORDER_OVERRIDE_PATH), { recursive: true });
  fs.writeFileSync(GLOBE_BORDER_OVERRIDE_PATH, `${JSON.stringify(overrides, null, 2)}\n`);
  return overrides.countries[countryId].rings[ringId];
};

const removeManualBorderOverride = (countryIdInput: unknown, ringIdInput: unknown) => {
  const countryId = String(countryIdInput ?? '').trim().toUpperCase();
  const ringId = String(ringIdInput ?? '').trim();
  const overrides = loadManualBorderOverrides();
  if (!overrides.countries?.[countryId]?.rings?.[ringId]) return false;
  delete overrides.countries[countryId].rings[ringId];
  if (!Object.keys(overrides.countries[countryId].rings).length) delete overrides.countries[countryId];
  fs.writeFileSync(GLOBE_BORDER_OVERRIDE_PATH, `${JSON.stringify(overrides, null, 2)}\n`);
  return true;
};

const runGlobeBorderGenerator = () => new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, [GLOBE_BORDER_GENERATOR_PATH], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-20000);
  });
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(stderr.trim() || `Border generator exited with code ${code}.`));
  });
});

const buildListingLocation = (listing: any) => {
  if (typeof listing?.location === 'string' && listing.location.trim()) {
    return listing.location.trim();
  }
  const address = listing?.geopoint?.address ?? {};
  const street = [address.addressLine1, address.addressLine2].filter(Boolean).join(', ');
  const cityRegion = [address.city, address.region].filter(Boolean).join(', ');
  const parts = [street, cityRegion, address.postalCode, address.country].filter(Boolean);
  return parts.join(', ');
};

const generateListingId = (listing: any) => {
  if (typeof listing?.id === 'string' && listing.id.trim()) {
    return listing.id.trim();
  }
  const type = String(listing?.type || '').trim().toLowerCase();
  if (type === 'event') return `event-${Date.now()}`;
  if (type === 'club') return `club-${Date.now()}`;
  return `listing-${Date.now()}`;
};

const readJsonBody = (req: any) =>
  new Promise<any>((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });

const withinGeoRoot = (targetPath: string) => {
  const relative = path.relative(GEO_ROOT, targetPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const listingToAddress = (listing: any): GeoAddress => ({
  country: listing?.geopoint?.address?.country,
  region: listing?.geopoint?.address?.region,
  city: listing?.geopoint?.address?.city,
  postalCode: listing?.geopoint?.address?.postalCode,
  countrySlug: listing?.geopoint?.address?.countrySlug,
  admin1Slug: listing?.geopoint?.address?.admin1Slug,
  citySlug: listing?.geopoint?.address?.citySlug,
  isCityState: listing?.geopoint?.address?.isCityState,
});

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const GEO_USER_AGENT = 'SwingSphereGeoAdmin/1.0';

const fetchJson = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': GEO_USER_AGENT,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
};

const geocodeAddress = async (payload: any) => {
  if (payload?.addressText) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: String(payload.addressText),
      addressdetails: '1',
      limit: '1',
    });
    const data = await fetchJson(`${NOMINATIM_BASE}/search?${params.toString()}`);
    return Array.isArray(data) ? data[0] : null;
  }
  if (Number.isFinite(payload?.lat) && Number.isFinite(payload?.lon)) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(payload.lat),
      lon: String(payload.lon),
      addressdetails: '1',
    });
    return fetchJson(`${NOMINATIM_BASE}/reverse?${params.toString()}`);
  }
  return null;
};

const normalizeListingAddress = async (listing: any) => {
  const address = listing?.geopoint?.address ?? {};
  const lat = listing?.geopoint?.latitude;
  const lon = listing?.geopoint?.longitude;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  const addressParts = [
    address.addressLine1,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ].filter(Boolean);
  const addressText = addressParts.join(', ');

  const geocodePayload = hasCoords
    ? { lat, lon }
    : addressText
      ? { addressText }
      : { country: address.country, admin1: address.region, city: address.city };

  const geocode = await geocodeAddress(geocodePayload).catch(() => null);
  let relationTags = null;
  if (geocode?.osm_type === 'relation' && geocode?.osm_id) {
    relationTags = await fetchRelationTags(Number(geocode.osm_id)).catch(() => null);
  }

  const normalized = normalizePlace({
    country: address.country,
    admin1: address.region,
    city: address.city,
    geocode,
    relationTags,
  });

  return {
    normalized,
    address: {
      ...address,
      countrySlug: normalized.normalizedCountrySlug,
      admin1Slug: normalized.normalizedAdmin1Slug,
      citySlug: normalized.normalizedCitySlug,
      isCityState: normalized.isCityState,
    },
  };
};

const fetchRelationTags = async (relationId: number, options?: OverpassQueryOptions) => {
  const query = [
    '[out:json][timeout:25];',
    `relation(${relationId});`,
    'out tags;',
  ].join('\n');
  const data = await overpassQuery(query, options);
  const element = Array.isArray(data?.elements) ? data.elements[0] : null;
  return element?.tags ?? null;
};

type DistrictBoundaryType = 'district' | 'major-district';
type BoundaryBuilderType = 'city' | 'county' | 'region' | DistrictBoundaryType;
type BoundaryResolveType = Exclude<BoundaryBuilderType, DistrictBoundaryType>;
type BoundaryTypeInput = BoundaryBuilderType | 'state' | 'district-major' | 'major_district';
type BoundaryLevel = 'region' | 'county' | 'city' | 'district';
type SurrogateReason = 'consolidated-city-county';
type DistrictSourceKind = 'admin_level' | 'place';

type BoundaryResolveInput = {
  query: string;
  type: BoundaryResolveType;
  relationId?: number | null;
  countryName?: string;
  admin1Name?: string;
  countrySlug?: string;
  admin1Slug?: string;
};

type BoundaryResolvedMetadata = {
  query: string;
  type: BoundaryResolveType;
  name: string;
  relationId: number;
  adminLevel: string;
  countryName: string;
  admin1Name: string;
  countrySlug: string;
  admin1Slug: string;
  slug: string;
  suggestedPath: string;
};

type ResolvedBoundary = {
  level: BoundaryLevel;
  query: string;
  type: BoundaryResolveType;
  slug: string;
  name: string;
  relationId: number;
  adminLevel: string;
  countryName: string;
  admin1Name: string;
  countrySlug: string;
  admin1Slug: string;
  sourceLevel: BoundaryLevel;
  isSurrogate: boolean;
  surrogateReason?: SurrogateReason;
  outputPath: string;
  suggestedPath: string;
  reusedGeojson?: any;
  reusedFromDisk?: boolean;
  reusedFromPath?: string;
};

type OverpassQueryOptions = {
  retryEvents?: string[];
};

type BBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type GeoPoint = [number, number];
type GeoRing = GeoPoint[];
type GeoPolygon = GeoRing[];
type GeoTriangle = [GeoPoint, GeoPoint, GeoPoint];

type LandMaskPolygon = {
  rings: GeoPolygon;
  bbox: BBox;
  triangles?: GeoTriangle[];
};

type BoundaryPreviewCacheEntry = {
  id: string;
  createdAt: number;
  simplifyPercent: number;
  clipToLand: boolean;
  vertexCount: number;
  toleranceUsed: number;
  geojson: any;
  adminGeojson?: any;
  featureCount?: number;
  bbox?: BBox | null;
  districtItems?: Array<{
    id?: string;
    name: string;
    slug: string;
    adminLevel?: string;
    place?: string;
    sourceLabel: string;
  }>;
  districtSourceLabel?: string;
  pointOnlyHint?: boolean;
  pointOnlyCount?: number;
  availableDistrictGroups?: Array<{ key: string; label: string; count: number }>;
};

const BOUNDARY_ADMIN_LEVEL: Record<BoundaryResolveType, string> = {
  city: '8',
  county: '6',
  region: '4',
};

const BOUNDARY_PREVIEW_CACHE = new Map<string, BoundaryPreviewCacheEntry>();
const BOUNDARY_PREVIEW_TTL_MS = 30 * 60 * 1000;
let LANDMASK_CACHE: LandMaskPolygon[] | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const relativePathFromBase = (base: string, target: string) => {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  if (process.platform === 'win32') {
    return path.relative(resolvedBase.toLowerCase(), resolvedTarget.toLowerCase());
  }
  return path.relative(resolvedBase, resolvedTarget);
};

const isUnsafeRelativePath = (relativePath: string) => {
  const rel = String(relativePath || '').replace(/\\/g, '/');
  return !rel || rel === '.' || rel.startsWith('..') || path.isAbsolute(relativePath);
};

const normalizePublicGeoOutput = (rawPath: string) => {
  const base = path.resolve(ROOT_DIR, 'public', 'geo');
  const normalized = String(rawPath || '')
    .trim()
    .replace(/\\/g, '/');
  if (!normalized) {
    throw new Error('Output path is required.');
  }

  let relativeOutputPath = normalized.replace(/^\/+/, '');
  if (/^[a-zA-Z]:\//.test(relativeOutputPath)) {
    const relFromBase = relativePathFromBase(base, path.resolve(relativeOutputPath));
    if (isUnsafeRelativePath(relFromBase)) {
      throw new Error('Unsafe output path resolved. Aborting.');
    }
    relativeOutputPath = relFromBase.replace(/\\/g, '/');
  } else {
    const lower = relativeOutputPath.toLowerCase();
    if (lower.startsWith('public/geo/')) {
      relativeOutputPath = relativeOutputPath.slice('public/geo/'.length);
    } else if (lower.startsWith('geo/')) {
      relativeOutputPath = relativeOutputPath.slice('geo/'.length);
    }
  }

  const target = path.resolve(base, relativeOutputPath);
  const rel = relativePathFromBase(base, target);
  if (isUnsafeRelativePath(rel)) {
    throw new Error('Unsafe output path resolved. Aborting.');
  }
  return target;
};

const relationIdFromUnknown = (value: unknown) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
};

const normalizeBoundaryBuilderType = (value: unknown): BoundaryBuilderType | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'state') return 'region';
  if (normalized === 'district-major' || normalized === 'major_district' || normalized === 'major-district') {
    return 'major-district';
  }
  if (normalized === 'city' || normalized === 'county' || normalized === 'region' || normalized === 'district') {
    return normalized;
  }
  return null;
};

const isBoundaryResolveType = (value: BoundaryBuilderType): value is BoundaryResolveType => value !== 'district' && value !== 'major-district';

const replaceOutputFilename = (outputPath: string, nextFileName: string) => {
  const normalized = String(outputPath || '').replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash < 0) return nextFileName;
  return `${normalized.slice(0, lastSlash + 1)}${nextFileName}`;
};

const buildLegacyAliasOutputPaths = (type: BoundaryBuilderType, outputPath: string) => {
  const normalized = String(outputPath || '').trim().replace(/\\/g, '/');
  if (!normalized) return [] as string[];
  const fileName = normalized.split('/').pop()?.toLowerCase() || '';
  if ((type === 'city' || type === 'county') && fileName === 'boundary-simplified.json') {
    return [replaceOutputFilename(normalized, 'outline.geojson')];
  }
  if (type === 'district') {
    if (fileName === 'districts-raw.json') {
      return [
        replaceOutputFilename(normalized, 'districts.json'),
        replaceOutputFilename(normalized, 'districts-simplified.json'),
      ];
    }
    if (fileName === 'districts.json') {
      return [
        replaceOutputFilename(normalized, 'districts-raw.json'),
        replaceOutputFilename(normalized, 'districts-simplified.json'),
      ];
    }
    if (fileName === 'districts-simplified.json') {
      return [
        replaceOutputFilename(normalized, 'districts-raw.json'),
        replaceOutputFilename(normalized, 'districts.json'),
      ];
    }
  }
  return [] as string[];
};

const escapeOverpass = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const runProcessCapture = (command: string, args: string[]) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const proc = spawn(command, args, { cwd: ROOT_DIR });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('error', (error) => {
      stderr += error.message;
      resolve({ code: 1, stdout, stderr });
    });
    proc.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });

const isOverpassTimeoutError = (error: unknown) => {
  const message = String((error as Error)?.message || '').toLowerCase();
  const name = String((error as { name?: string })?.name || '').toLowerCase();
  return (
    name === 'aborterror' ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('eai_again')
  );
};

async function overpassQuery(query: string, options?: OverpassQueryOptions) {
  const params = new URLSearchParams({ data: query });
  const url = `${OVERPASS_URL}?${params.toString()}`;
  let rateLimitRetries = 0;
  let timeoutRetries = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': GEO_USER_AGENT,
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const error = new Error(`Overpass request failed: ${res.status}`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
      }
      const data = await res.json();
      return data;
    } catch (error) {
      const status = Number((error as { status?: number })?.status);
      if (status === 429 && rateLimitRetries < 3) {
        const delayMs = 5000 * (2 ** rateLimitRetries);
        rateLimitRetries += 1;
        options?.retryEvents?.push(`rate limited, retrying... (${Math.round(delayMs / 1000)}s)`);
        await sleep(delayMs);
        continue;
      }
      const isTimeoutLike = status === 504 || isOverpassTimeoutError(error);
      if (isTimeoutLike && timeoutRetries < 2) {
        const delayMs = timeoutRetries === 0 ? 2000 : 4000;
        timeoutRetries += 1;
        options?.retryEvents?.push(`network timeout, retrying... (${Math.round(delayMs / 1000)}s)`);
        await sleep(delayMs);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

const findRelationByName = async (
  name: string,
  adminLevels: string[],
  countryName?: string,
  stateName?: string,
  options?: OverpassQueryOptions
) => {
  const country = (countryName || '').trim();
  const state = (stateName || '').trim();
  const areaClause = [
    country ? `area["name"="${escapeOverpass(country)}"]["boundary"="administrative"]->.country;` : '',
    state && country
      ? `area["name"="${escapeOverpass(state)}"]["boundary"="administrative"](area.country)->.state;`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  for (const level of adminLevels) {
    const query = [
      '[out:json][timeout:60];',
      areaClause,
      '(',
      state && country
        ? `  relation["boundary"="administrative"]["admin_level"="${level}"]["name"="${escapeOverpass(name)}"](area.state);`
        : country
          ? `  relation["boundary"="administrative"]["admin_level"="${level}"]["name"="${escapeOverpass(name)}"](area.country);`
          : `  relation["boundary"="administrative"]["admin_level"="${level}"]["name"="${escapeOverpass(name)}"];`,
      ');',
      'out tags;',
    ]
      .filter(Boolean)
      .join('\n');
    const data = await overpassQuery(query, options);
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    if (elements.length > 0) {
      return { relationId: Number(elements[0].id), adminLevel: String(elements[0]?.tags?.admin_level || level) };
    }
  }
  return null;
};

const getAddressField = (address: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!address) return '';
  for (const key of keys) {
    const value = address[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const buildBoundarySuggestedPath = (
  type: BoundaryResolveType,
  countrySlug: string,
  admin1Slug: string,
  slug: string
) => {
  const admin1 = admin1Slug || '_admin1';
  if (type === 'region') {
    return `/geo/country/${countrySlug}/${admin1}/boundary-simplified.json`;
  }
  if (type === 'county') {
    return `/geo/country/${countrySlug}/${admin1}/counties/${slug}/boundary-simplified.json`;
  }
  return `/geo/country/${countrySlug}/${admin1}/${slug}/boundary-simplified.json`;
};

const buildRawDistrictSuggestedPath = (
  countrySlug: string,
  admin1Slug: string,
  citySlug: string
) => `/geo/country/${countrySlug}/${admin1Slug || '_admin1'}/${citySlug}/districts-raw.json`;

const buildMajorDistrictSuggestedPath = (
  countrySlug: string,
  admin1Slug: string,
  citySlug: string
) => `/geo/country/${countrySlug}/${admin1Slug || '_admin1'}/${citySlug}/districts-major.json`;

const resolveBoundaryMetadata = async (
  input: BoundaryResolveInput,
  options?: OverpassQueryOptions
): Promise<BoundaryResolvedMetadata> => {
  const targetLevel = BOUNDARY_ADMIN_LEVEL[input.type];
  const relationOverride = relationIdFromUnknown(input.relationId);
  const query = (input.query || '').trim();
  if (!query && !relationOverride) {
    throw new Error('Query or relation id is required.');
  }

  let relationId = relationOverride ?? 0;
  let adminLevel = '';
  let resolvedName = '';
  let countryName = (input.countryName || '').trim();
  let admin1Name = (input.admin1Name || '').trim();
  let countrySlug = normalizeCountry((input.countrySlug || '').trim() || countryName);
  let admin1Slug = normalizeAdmin1((input.admin1Slug || '').trim() || admin1Name, countrySlug);

  let primaryGeocode: any = null;
  if (!relationOverride && query) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      addressdetails: '1',
      extratags: '1',
      limit: '5',
    });
    const geocode = await fetchJson(`${NOMINATIM_BASE}/search?${params.toString()}`).catch(() => []);
    primaryGeocode = Array.isArray(geocode) ? geocode[0] : null;
    const candidate =
      Array.isArray(geocode)
        ? geocode.find((item) => item?.osm_type === 'relation' && String(item?.extratags?.admin_level || '') === targetLevel)
        : null;
    if (candidate?.osm_id) {
      relationId = Number(candidate.osm_id);
      adminLevel = String(candidate?.extratags?.admin_level || '');
      resolvedName = String(candidate?.name || candidate?.display_name || '').split(',')[0]?.trim() || query;
    }
  }

  const address = (primaryGeocode?.address || {}) as Record<string, unknown>;
  if (!countryName) {
    countryName = getAddressField(address, ['country']);
  }
  if (!admin1Name) {
    admin1Name = getAddressField(address, ['state', 'region', 'state_district']);
  }
  if (!countrySlug) {
    countrySlug = normalizeCountry(getAddressField(address, ['country_code', 'country']) || countryName);
  }
  if (!admin1Slug) {
    admin1Slug = normalizeAdmin1(admin1Name, countrySlug);
  }

  if (!relationId) {
    const defaultByType: Record<BoundaryResolveType, string> = {
      city: getAddressField(address, ['city', 'town', 'village', 'municipality']) || query,
      county: getAddressField(address, ['county', 'state_district', 'city_district']) || query,
      region: getAddressField(address, ['state', 'region']) || query,
    };
    const searchName = defaultByType[input.type] || query;
    const scoped = await findRelationByName(
      searchName,
      [targetLevel],
      countryName || undefined,
      input.type === 'region' ? undefined : admin1Name || undefined,
      options
    );
    const fallback =
      scoped ??
      (await findRelationByName(
        searchName,
        [targetLevel],
        countryName || undefined,
        undefined,
        options
      ));
    if (!fallback) {
      throw new Error(`No ${input.type} boundary relation found for "${query}".`);
    }
    relationId = fallback.relationId;
    adminLevel = fallback.adminLevel;
    resolvedName = searchName;
  }

  const relationTags = (await fetchRelationTags(relationId, options).catch(() => null)) || {};
  const relationName = String(relationTags?.name || resolvedName || query || `relation-${relationId}`).trim();
  adminLevel = String(relationTags?.admin_level || adminLevel || targetLevel);
  const slug = slugifyPlace(relationName) || `relation-${relationId}`;
  const fallbackCountry = countrySlug || 'us';
  const fallbackAdmin1 = admin1Slug || (fallbackCountry === 'us' ? 'ca' : '_admin1');

  return {
    query,
    type: input.type,
    name: relationName,
    relationId,
    adminLevel,
    countryName,
    admin1Name,
    countrySlug: fallbackCountry,
    admin1Slug: fallbackAdmin1,
    slug,
    suggestedPath: buildBoundarySuggestedPath(input.type, fallbackCountry, fallbackAdmin1, slug),
  };
};

const normalizeCountyQueryForCityFallback = (rawQuery: string) => {
  return String(rawQuery || '')
    .replace(/^\s*county of\s+/i, '')
    .replace(/\s+county\s*$/i, '')
    .replace(/\s+co\.\s*$/i, '')
    .trim();
};

type DiskGeojsonReadResult =
  | { ok: true; geojson: any }
  | { ok: false; invalid: boolean; message: string };

const LEGACY_GEOJSON_INVALID_MESSAGE = 'Found legacy boundary file but it is not valid GeoJSON (Feature/FeatureCollection).';

const adaptToFeatureCollection = (parsed: any): DiskGeojsonReadResult => {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, invalid: true, message: LEGACY_GEOJSON_INVALID_MESSAGE };
  }
  const type = String(parsed.type || '').trim();
  if (type === 'FeatureCollection') {
    const features = Array.isArray(parsed.features) ? parsed.features : [];
    return { ok: true, geojson: { ...parsed, features } };
  }
  if (type === 'Feature') {
    return { ok: true, geojson: { type: 'FeatureCollection', features: [parsed] } };
  }
  if (type === 'Topology') {
    return { ok: false, invalid: true, message: LEGACY_GEOJSON_INVALID_MESSAGE };
  }
  return { ok: false, invalid: true, message: LEGACY_GEOJSON_INVALID_MESSAGE };
};


const parseGeojsonInput = (input: unknown): DiskGeojsonReadResult => {
  if (typeof input === 'string') {
    const raw = input.trim();
    if (!raw) {
      return { ok: false, invalid: false, message: 'GeoJSON input is required.' };
    }
    try {
      return adaptToFeatureCollection(JSON.parse(raw));
    } catch {
      return { ok: false, invalid: true, message: 'Provided GeoJSON is not valid JSON.' };
    }
  }
  if (input && typeof input === 'object') {
    return adaptToFeatureCollection(input);
  }
  return { ok: false, invalid: false, message: 'GeoJSON input is required.' };
};

const tryReadGeojsonCandidate = (outputPath: string): {
  found?: { geojson: any; outputPath: string };
  invalid?: { outputPath: string; message: string };
} => {
  try {
    const resolvedPath = normalizePublicGeoOutput(outputPath);
    const read = readGeojsonFromDisk(resolvedPath);
    if (read.ok) {
      return {
        found: {
          geojson: read.geojson,
          outputPath: resolvedPath,
        },
      };
    }
    if (read.invalid) {
      return {
        invalid: {
          outputPath: resolvedPath,
          message: read.message,
        },
      };
    }
    return {};
  } catch {
    return {};
  }
};

const findCaliforniaOutlineBySlug = (slug: string) => {
  const normalizedSlug = slug.toLowerCase();
  const roots = [
    path.resolve(ROOT_DIR, 'public', 'geo', 'country', 'us', 'ca'),
    path.resolve(ROOT_DIR, 'public', 'geo', 'country', 'usa', '_admin1', 'ca'),
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const current = stack.pop() as string;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;

        const lowerName = entry.name.toLowerCase();
        if (lowerName !== 'outline.geojson' && lowerName !== 'boundary-simplified.json' && lowerName !== 'boundary.json') {
          continue;
        }
        const normalizedPath = fullPath.replace(/\\/g, '/').toLowerCase();
        if (!normalizedPath.includes(`/${normalizedSlug}/`)) continue;
        if (normalizedPath.includes('/counties/')) continue;
        const read = readGeojsonFromDisk(fullPath);
        if (!read.ok) continue;
        return {
          geojson: read.geojson,
          outputPath: fullPath,
        };
      }
    }
  }

  return null;
};

const findExistingCityBoundaryOnDisk = (params: {
  input: BoundaryResolveInput;
  cityQuery: string;
  citySlug: string;
}) => {
  const countrySlug =
    normalizeCountry(
      String(params.input.countrySlug || '').trim() ||
      String(params.input.countryName || '').trim()
    ) || 'us';
  const admin1Slug =
    normalizeAdmin1(
      String(params.input.admin1Slug || '').trim() ||
      String(params.input.admin1Name || '').trim() ||
      (countrySlug === 'us' ? 'ca' : ''),
      countrySlug
    ) || (countrySlug === 'us' ? 'ca' : '_admin1');

  const invalidPaths: Array<{ outputPath: string; message: string }> = [];

  const deterministicPaths = [
    `/geo/country/us/ca/${params.citySlug}/outline.geojson`,
    `/geo/country/us/ca/${params.citySlug}/boundary-simplified.json`,
    `/geo/country/us/ca/${params.citySlug}/boundary.json`,
  ];

  for (const outputPath of deterministicPaths) {
    const found = tryReadGeojsonCandidate(outputPath);
    if (found.found) {
      return {
        found: {
          ...found.found,
          countrySlug: 'us',
          admin1Slug: 'ca',
          citySlug: params.citySlug,
          cityQuery: params.cityQuery,
        },
        invalidPaths,
      };
    }
    if (found.invalid) {
      invalidPaths.push(found.invalid);
    }
  }

  const generatedCityPath = buildBoundarySuggestedPath('city', countrySlug, admin1Slug, params.citySlug);
  const candidatePaths = Array.from(new Set([
    generatedCityPath,
    `/geo/country/${countrySlug}/${admin1Slug}/${params.citySlug}/boundary-simplified.json`,
    `/geo/country/${countrySlug}/${admin1Slug}/${params.citySlug}/boundary.json`,
    `/geo/country/usa/_admin1/ca/${params.citySlug}/outline.geojson`,
    `/geo/country/usa/_admin1/ca/${params.citySlug}/boundary-simplified.json`,
    `/geo/country/usa/_admin1/ca/${params.citySlug}/boundary.json`,
  ]));

  for (const outputPath of candidatePaths) {
    const found = tryReadGeojsonCandidate(outputPath);
    if (found.found) {
      return {
        found: {
          ...found.found,
          countrySlug,
          admin1Slug,
          citySlug: params.citySlug,
          cityQuery: params.cityQuery,
        },
        invalidPaths,
      };
    }
    if (found.invalid) {
      invalidPaths.push(found.invalid);
    }
  }

  if (countrySlug === 'us' && admin1Slug === 'ca') {
    const discovered = findCaliforniaOutlineBySlug(params.citySlug);
    if (discovered) {
      return {
        found: {
          ...discovered,
          countrySlug,
          admin1Slug,
          citySlug: params.citySlug,
          cityQuery: params.cityQuery,
        },
        invalidPaths,
      };
    }
  }

  return {
    found: undefined,
    invalidPaths,
  };
};

const resolveBoundaryForLevel = async (
  input: BoundaryResolveInput,
  options?: OverpassQueryOptions
): Promise<ResolvedBoundary> => {
  const requestedLevel = input.type as BoundaryLevel;
  const relationOverride = relationIdFromUnknown(input.relationId);

  try {
    const resolved = await resolveBoundaryMetadata(input, options);
    const outputPath = buildBoundarySuggestedPath(input.type, resolved.countrySlug, resolved.admin1Slug, resolved.slug);
    return {
      level: requestedLevel,
      query: resolved.query,
      type: input.type,
      slug: resolved.slug,
      name: resolved.name,
      relationId: resolved.relationId,
      adminLevel: resolved.adminLevel,
      countryName: resolved.countryName,
      admin1Name: resolved.admin1Name,
      countrySlug: resolved.countrySlug,
      admin1Slug: resolved.admin1Slug,
      sourceLevel: requestedLevel,
      isSurrogate: false,
      outputPath,
      suggestedPath: outputPath,
    };
  } catch (primaryError) {
    const originalQuery = String(input.query || '').trim();
    if (input.type !== 'county' || relationOverride || !originalQuery) {
      throw primaryError;
    }

    const normalizedCityQuery = normalizeCountyQueryForCityFallback(originalQuery) || originalQuery;
    const normalizedCitySlug =
      slugifyPlace(normalizedCityQuery) ||
      slugifyPlace(originalQuery) ||
      'city-surrogate';

    const diskReuse = findExistingCityBoundaryOnDisk({
      input,
      cityQuery: normalizedCityQuery,
      citySlug: normalizedCitySlug,
    });
    for (const invalid of diskReuse.invalidPaths) {
      options?.retryEvents?.push(`Legacy boundary found but invalid GeoJSON: ${invalid.outputPath}`);
    }
    if (diskReuse.found) {
      const outputPath = buildBoundarySuggestedPath('county', diskReuse.found.countrySlug, diskReuse.found.admin1Slug, diskReuse.found.citySlug);
      options?.retryEvents?.push('County boundary not found - using City boundary (consolidated city-county).');
      options?.retryEvents?.push(`Using existing city boundary on disk: ${diskReuse.found.outputPath.replace(/\\/g, '/')}`);
      return {
        level: 'county',
        query: originalQuery,
        type: 'county',
        slug: diskReuse.found.citySlug,
        name: originalQuery,
        relationId: 0,
        adminLevel: BOUNDARY_ADMIN_LEVEL.city,
        countryName: String(input.countryName || '').trim(),
        admin1Name: String(input.admin1Name || '').trim(),
        countrySlug: diskReuse.found.countrySlug,
        admin1Slug: diskReuse.found.admin1Slug,
        sourceLevel: 'city',
        isSurrogate: true,
        surrogateReason: 'consolidated-city-county',
        outputPath,
        suggestedPath: outputPath,
        reusedGeojson: diskReuse.found.geojson,
        reusedFromDisk: true,
        reusedFromPath: diskReuse.found.outputPath,
      };
    }

    try {
      const cityResolved = await resolveBoundaryMetadata(
        {
          ...input,
          type: 'city',
          query: normalizedCityQuery,
          relationId: null,
        },
        options
      );
      const outputPath = buildBoundarySuggestedPath('county', cityResolved.countrySlug, cityResolved.admin1Slug, cityResolved.slug);
      options?.retryEvents?.push('County boundary not found - using City boundary (consolidated city-county).');
      return {
        level: 'county',
        query: originalQuery,
        type: 'county',
        slug: cityResolved.slug,
        name: originalQuery || cityResolved.name,
        relationId: cityResolved.relationId,
        adminLevel: cityResolved.adminLevel,
        countryName: cityResolved.countryName,
        admin1Name: cityResolved.admin1Name,
        countrySlug: cityResolved.countrySlug,
        admin1Slug: cityResolved.admin1Slug,
        sourceLevel: 'city',
        isSurrogate: true,
        surrogateReason: 'consolidated-city-county',
        outputPath,
        suggestedPath: outputPath,
      };
    } catch {
      if (diskReuse.invalidPaths.length) {
        throw new Error(LEGACY_GEOJSON_INVALID_MESSAGE);
      }
      throw primaryError;
    }
  }
};

const DISTRICT_PLACE_TAGS = new Set([
  'borough',
  'city_district',
  'district',
  'neighborhood',
  'neighbourhood',
  'quarter',
  'suburb',
  'ward',
]);
const DISTRICT_ADMIN_LEVELS = new Set(['7', '8', '9', '10']);

type DistrictCandidate = {
  feature: any;
  id?: string;
  idKey?: string;
  name: string;
  normalizedName: string;
  slug: string;
  adminLevel?: string;
  place?: string;
  sourceKind: DistrictSourceKind;
  sourceValue: string;
  sourceLabel: string;
  searchText: string;
  priority: number;
  geometryType: string;
  geometryVertexCount: number;
  entityKind: 'relation' | 'way' | 'node' | 'other';
};

type DistrictSelectionResult = {
  geojson: any;
  featureCount: number;
  districtItems: NonNullable<BoundaryPreviewCacheEntry['districtItems']>;
  districtSourceLabel: string;
  pointOnlyHint: boolean;
  pointOnlyCount: number;
  availableDistrictGroups: NonNullable<BoundaryPreviewCacheEntry['availableDistrictGroups']>;
};

type DistrictCandidateGroup = {
  key: string;
  label: string;
  sourceKind: DistrictSourceKind;
  sourceValue: string;
  records: DistrictCandidate[];
  selected: DistrictCandidate[];
  duplicateCount: number;
  score: number;
};

const featureMatchesRelationId = (feature: any, relationId: number) => {
  if (!relationId) return false;
  const props = (feature?.properties && typeof feature.properties === 'object') ? feature.properties : {};
  const candidates = [
    feature?.id,
    props?.id,
    props?.['@id'],
    props?.osm_id,
    props?.osmId,
  ];
  return candidates.some((candidate) => {
    if (candidate == null) return false;
    const value = String(candidate);
    return value === String(relationId) || value.includes(`relation/${relationId}`);
  });
};

const districtSourceLabel = (kind: DistrictSourceKind, value: string) =>
  kind === 'admin_level' ? `administrative level ${value}` : `place=${value}`;

const districtSourcePriority = (kind: DistrictSourceKind, value: string) => {
  if (kind === 'admin_level') {
    if (value === '10') return 56;
    if (value === '9') return 52;
    if (value === '8') return 44;
    if (value === '7') return 36;
    return 24;
  }
  if (value === 'quarter') return 34;
  if (value === 'suburb') return 32;
  if (value === 'borough') return 30;
  if (value === 'district') return 28;
  if (value === 'ward') return 26;
  if (value === 'city_district') return 24;
  if (value === 'neighbourhood' || value === 'neighborhood') return 22;
  return 18;
};

const districtGroupScore = (kind: DistrictSourceKind, value: string, count: number, duplicateCount = 0) => {
  let score = districtSourcePriority(kind, value);
  score -= Math.min(24, Math.abs(count - 18));
  if (count < 2) score -= 24;
  if (count > 120) score -= 18;
  score -= Math.min(18, duplicateCount * 2);
  return score;
};

const districtMatchesQuery = (candidate: DistrictCandidate, districtQuery: string) => {
  const normalizedQuery = slugifyPlace(districtQuery || '');
  if (!normalizedQuery) return true;
  if (candidate.searchText.includes(normalizedQuery)) return true;
  return normalizedQuery
    .split('-')
    .filter(Boolean)
    .every((part) => candidate.searchText.includes(part));
};

const normalizeDistrictName = (name: string) => {
  const normalized = slugifyPlace(String(name || ''));
  return normalized || String(name || '').trim().toLowerCase();
};

const detectDistrictEntityKind = (feature: any, properties: any): DistrictCandidate['entityKind'] => {
  const values = [feature?.id, properties?.['@id'], properties?.id, properties?.osm_id, properties?.osmId];
  for (const value of values) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.includes('relation/')) return 'relation';
    if (normalized.includes('way/')) return 'way';
    if (normalized.includes('node/')) return 'node';
  }
  return 'other';
};

const districtEntityPriority = (kind: DistrictCandidate['entityKind']) => {
  if (kind === 'relation') return 36;
  if (kind === 'way') return 20;
  if (kind === 'other') return 8;
  return 0;
};

const districtGeometryPriority = (geometryType: string) => {
  if (geometryType === 'MultiPolygon') return 18;
  if (geometryType === 'Polygon') return 12;
  if (geometryType === 'MultiLineString') return 6;
  if (geometryType === 'LineString') return 2;
  return 0;
};

const districtCandidateStrength = (candidate: DistrictCandidate) =>
  candidate.priority * 100 +
  districtEntityPriority(candidate.entityKind) +
  districtGeometryPriority(candidate.geometryType) +
  Math.min(candidate.geometryVertexCount, 48);

const compareDistrictCandidates = (left: DistrictCandidate, right: DistrictCandidate) => {
  const strengthDiff = districtCandidateStrength(right) - districtCandidateStrength(left);
  if (strengthDiff !== 0) return strengthDiff;
  if (right.geometryVertexCount !== left.geometryVertexCount) {
    return right.geometryVertexCount - left.geometryVertexCount;
  }
  return left.name.localeCompare(right.name);
};

const toFeatureCollection = (features: any[]) => ({
  type: 'FeatureCollection',
  features,
});

const countGeojsonFeatures = (geojson: any) => {
  if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    return geojson.features.length;
  }
  return geojson ? 1 : 0;
};

const extractDistrictItemsFromGeojson = (geojson: any, fallbackSourceLabel: string) => {
  const features = Array.isArray(geojson?.features)
    ? geojson.features
    : geojson?.type === 'Feature'
      ? [geojson]
      : [];
  const items = new Map<string, {
    id?: string;
    name: string;
    slug: string;
    adminLevel?: string;
    place?: string;
    sourceLabel: string;
  }>();

  features.forEach((feature: any, index: number) => {
    const properties = (feature?.properties && typeof feature.properties === 'object') ? feature.properties : {};
    const name = String(
      properties?.name ??
      properties?.['name:en'] ??
      properties?.official_name ??
      properties?.short_name ??
      `district-${index + 1}`
    ).trim();
    if (!name) return;
    const slug = slugifyPlace(name) || `district-${index + 1}`;
    const sourceLabel = String(properties?.sourceLabel ?? properties?.source ?? fallbackSourceLabel).trim() || fallbackSourceLabel;
    if (!items.has(slug)) {
      items.set(slug, {
        id: feature?.id ?? properties?.id ?? properties?.osm_id ?? properties?.osmId,
        name,
        slug,
        adminLevel: String(properties?.admin_level ?? properties?.adminLevel ?? '').trim() || undefined,
        place: String(properties?.place ?? '').trim() || undefined,
        sourceLabel,
      });
    }
  });

  return Array.from(items.values()).sort((left, right) => left.name.localeCompare(right.name));
};
const dedupeDistrictCandidates = (candidates: DistrictCandidate[]) => {
  const sorted = candidates.slice().sort(compareDistrictCandidates);
  const byId = new Map<string, DistrictCandidate>();
  const withoutIds: DistrictCandidate[] = [];

  sorted.forEach((candidate) => {
    if (!candidate.idKey) {
      withoutIds.push(candidate);
      return;
    }
    if (!byId.has(candidate.idKey)) {
      byId.set(candidate.idKey, candidate);
    }
  });

  const idDeduped = [...byId.values(), ...withoutIds].sort(compareDistrictCandidates);
  const byName = new Map<string, DistrictCandidate>();

  idDeduped.forEach((candidate) => {
    const key = candidate.normalizedName || candidate.slug || candidate.name.toLowerCase();
    if (!key) return;
    if (!byName.has(key)) {
      byName.set(key, candidate);
    }
  });

  const selected = Array.from(byName.values()).sort(compareDistrictCandidates);
  return {
    selected,
    duplicateCount: Math.max(0, candidates.length - selected.length),
  };
};

const buildDistrictCandidateGroups = (candidates: DistrictCandidate[]): DistrictCandidateGroup[] => {
  const groupMap = new Map<string, DistrictCandidate[]>();
  candidates.forEach((candidate) => {
    const key = `${candidate.sourceKind}:${candidate.sourceValue}`;
    const next = groupMap.get(key) ?? [];
    next.push(candidate);
    groupMap.set(key, next);
  });

  return Array.from(groupMap.entries())
    .map(([key, records]) => {
      const deduped = dedupeDistrictCandidates(records);
      const sample = records[0];
      return {
        key,
        label: sample?.sourceLabel || key,
        sourceKind: sample?.sourceKind || 'place',
        sourceValue: sample?.sourceValue || '',
        records,
        selected: deduped.selected,
        duplicateCount: deduped.duplicateCount,
        score: districtGroupScore(sample?.sourceKind || 'place', sample?.sourceValue || '', deduped.selected.length, deduped.duplicateCount),
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.selected.length - left.selected.length ||
      left.label.localeCompare(right.label)
    );
};

const selectDistrictFeatures = (
  geojson: any,
  params: { parentRelationId: number; districtQuery?: string; retryEvents?: string[] }
): DistrictSelectionResult => {
  const rawFeatures = Array.isArray(geojson?.features)
    ? geojson.features
    : geojson?.type === 'Feature'
      ? [geojson]
      : [];

  const polygonCandidates: DistrictCandidate[] = [];
  const pointCandidates: DistrictCandidate[] = [];

  rawFeatures.forEach((feature: any, index: number) => {
    if (!feature || featureMatchesRelationId(feature, params.parentRelationId)) return;
    const properties = (feature?.properties && typeof feature.properties === 'object') ? feature.properties : {};
    const adminLevel = String(properties?.admin_level ?? properties?.adminLevel ?? '').trim();
    const place = String(properties?.place ?? '').trim().toLowerCase();
    const boundary = String(properties?.boundary ?? '').trim().toLowerCase();
    const sourceKind: DistrictSourceKind | null =
      boundary === 'administrative' && DISTRICT_ADMIN_LEVELS.has(adminLevel)
        ? 'admin_level'
        : DISTRICT_PLACE_TAGS.has(place)
          ? 'place'
          : null;
    if (!sourceKind) return;

    const name = String(
      properties?.name ??
      properties?.['name:en'] ??
      properties?.official_name ??
      properties?.short_name ??
      feature?.id ??
      `district-${index + 1}`
    ).trim();
    if (!name) return;

    const geometryType = String(feature?.geometry?.type || '').trim();
    const sourceValue = sourceKind === 'admin_level' ? adminLevel : place;
    const idKeyRaw = String(feature?.id ?? properties?.['@id'] ?? properties?.id ?? properties?.osm_id ?? properties?.osmId ?? '').trim();
    const candidate: DistrictCandidate = {
      feature,
      id: feature?.id ?? properties?.id ?? properties?.osm_id ?? properties?.osmId,
      idKey: idKeyRaw || undefined,
      name,
      normalizedName: normalizeDistrictName(name),
      slug: slugifyPlace(name) || `district-${index + 1}`,
      adminLevel: adminLevel || undefined,
      place: place || undefined,
      sourceKind,
      sourceValue,
      sourceLabel: districtSourceLabel(sourceKind, sourceValue),
      searchText: [name, place, adminLevel].map((value) => slugifyPlace(String(value || ''))).filter(Boolean).join(' '),
      priority: districtSourcePriority(sourceKind, sourceValue),
      geometryType,
      geometryVertexCount: countVertices(feature?.geometry),
      entityKind: detectDistrictEntityKind(feature, properties),
    };

    if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
      polygonCandidates.push(candidate);
      return;
    }
    if (geometryType === 'Point' || geometryType === 'MultiPoint') {
      pointCandidates.push(candidate);
    }
  });

  const candidateGroups = buildDistrictCandidateGroups(polygonCandidates);
  const availableDistrictGroups = candidateGroups.map((group) => ({
    key: group.key,
    label: group.label,
    count: group.selected.length,
  }));

  const districtQuery = String(params.districtQuery || '').trim();
  if (districtQuery) {
    const matchedPoints = pointCandidates.filter((candidate) => districtMatchesQuery(candidate, districtQuery));
    const matchedGroups = candidateGroups
      .map((group) => {
        const matchedRaw = group.records.filter((candidate) => districtMatchesQuery(candidate, districtQuery));
        const matchedSelected = group.selected.filter((candidate) => districtMatchesQuery(candidate, districtQuery));
        return {
          ...group,
          matchedRawCount: matchedRaw.length,
          matchedSelected,
        };
      })
      .filter((group) => group.matchedSelected.length > 0)
      .sort((left, right) =>
        right.score - left.score ||
        right.matchedSelected.length - left.matchedSelected.length ||
        left.label.localeCompare(right.label)
      );
    if (!matchedGroups.length) {
      if (matchedPoints.length) {
        params.retryEvents?.push(`Only point-based district matches were found for "${districtQuery}".`);
      }
      return {
        geojson: toFeatureCollection([]),
        featureCount: 0,
        districtItems: [],
        districtSourceLabel: districtQuery ? `district search: ${districtQuery}` : 'district search',
        pointOnlyHint: matchedPoints.length > 0,
        pointOnlyCount: matchedPoints.length,
        availableDistrictGroups,
      };
    }

    const bestGroup = matchedGroups[0];
    const selected = bestGroup.matchedSelected.slice().sort(compareDistrictCandidates);
    const duplicateCount = Math.max(0, bestGroup.matchedRawCount - selected.length);
    params.retryEvents?.push(
      `Using ${bestGroup.label} for "${districtQuery}" (${selected.length} unique polygon${selected.length === 1 ? '' : 's'}${duplicateCount > 0 ? ` after deduping ${duplicateCount} duplicate record${duplicateCount === 1 ? '' : 's'}` : ''}).`
    );
    return {
      geojson: toFeatureCollection(selected.map((candidate) => candidate.feature)),
      featureCount: selected.length,
      districtItems: selected.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        slug: candidate.slug,
        adminLevel: candidate.adminLevel,
        place: candidate.place,
        sourceLabel: candidate.sourceLabel,
      })),
      districtSourceLabel: `${bestGroup.label} filtered by "${districtQuery}"`,
      pointOnlyHint: false,
      pointOnlyCount: matchedPoints.length,
      availableDistrictGroups,
    };
  }

  if (!polygonCandidates.length) {
    return {
      geojson: toFeatureCollection([]),
      featureCount: 0,
      districtItems: [],
      districtSourceLabel: 'district collection',
      pointOnlyHint: pointCandidates.length > 0,
      pointOnlyCount: pointCandidates.length,
      availableDistrictGroups,
    };
  }

  const bestGroup = candidateGroups[0];
  const selected = bestGroup.selected.slice().sort(compareDistrictCandidates);
  params.retryEvents?.push(
    `Using ${bestGroup.label} group (${selected.length} unique polygon${selected.length === 1 ? '' : 's'} from ${bestGroup.records.length} record${bestGroup.records.length === 1 ? '' : 's'}${bestGroup.duplicateCount > 0 ? ` after deduping ${bestGroup.duplicateCount} duplicate${bestGroup.duplicateCount === 1 ? '' : 's'}` : ''}).`
  );
  return {
    geojson: toFeatureCollection(selected.map((candidate) => candidate.feature)),
    featureCount: selected.length,
    districtItems: selected.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      slug: candidate.slug,
      adminLevel: candidate.adminLevel,
      place: candidate.place,
      sourceLabel: candidate.sourceLabel,
    })),
    districtSourceLabel: bestGroup.label,
    pointOnlyHint: false,
    pointOnlyCount: pointCandidates.length,
    availableDistrictGroups,
  };
};

const buildDistrictGeometryQuery = (relationId: number) => {
  const areaId = 3600000000 + relationId;
  return [
    '[out:json][timeout:90];',
    `area(${areaId})->.a;`,
    '(',
    '  relation["boundary"="administrative"]["admin_level"~"^(7|8|9|10)$"](area.a);',
    '  way["boundary"="administrative"]["admin_level"~"^(7|8|9|10)$"](area.a);',
    '  relation["place"~"^(borough|city_district|district|neighbourhood|neighborhood|quarter|suburb|ward)$"](area.a);',
    '  way["place"~"^(borough|city_district|district|neighbourhood|neighborhood|quarter|suburb|ward)$"](area.a);',
    '  node["place"~"^(borough|city_district|district|neighbourhood|neighborhood|quarter|suburb|ward)$"](area.a);',
    ');',
    'out body;',
    '>;',
    'out skel qt;',
  ].join('\n');
};

const buildDistrictPreviewGeojson = async (params: {
  relationId: number;
  districtQuery?: string;
  simplifyPercent: number;
  clipToLand: boolean;
  overpassOptions?: OverpassQueryOptions;
}) => {
  fs.mkdirSync(BOUNDARY_TMP_ROOT, { recursive: true });

  const stamp = `${Date.now()}-${params.relationId}-districts-${Math.floor(Math.random() * 10000)}`;
  const osmPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.osm.json`);
  const rawGeoPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.geojson`);
  const selectedGeoPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.selected.geojson`);
  const simplifiedGeoPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.simplified.geojson`);

  const overpassData = await overpassQuery(buildDistrictGeometryQuery(params.relationId), params.overpassOptions);
  fs.writeFileSync(osmPath, JSON.stringify(overpassData));

  const convert = await runProcessCapture('node', [OSM_TO_GEOJSON, osmPath, rawGeoPath]);
  if (convert.code !== 0) {
    throw new Error(`osmtogeojson failed.\n${convert.stderr || convert.stdout}`.trim());
  }
  if (!fs.existsSync(rawGeoPath)) {
    throw new Error('osmtogeojson did not produce district output.');
  }

  const rawGeo = JSON.parse(fs.readFileSync(rawGeoPath, 'utf8'));
  const selected = selectDistrictFeatures(rawGeo, {
    parentRelationId: params.relationId,
    districtQuery: params.districtQuery,
    retryEvents: params.overpassOptions?.retryEvents,
  });

  if (selected.featureCount < 1) {
    if (selected.pointOnlyHint) {
      throw new Error(
        params.districtQuery
          ? `Only point-based neighborhood results were found for "${params.districtQuery}". Polygon district boundaries were not found.`
          : 'Only point-based neighborhood results were found. Polygon district boundaries were not found.'
      );
    }
    throw new Error(
      params.districtQuery
        ? `No district or neighborhood polygons matched "${params.districtQuery}".`
        : 'No district or neighborhood polygons were found for this place.'
    );
  }

  fs.writeFileSync(selectedGeoPath, JSON.stringify(selected.geojson));
  const tolerance = simplifyPercentToTolerance(selected.geojson, params.simplifyPercent);
  let finalGeo = selected.geojson;

  if (tolerance > 0) {
    const simplify = await runProcessCapture(PYTHON_BIN, [
      PROCESS_GEO,
      selectedGeoPath,
      simplifiedGeoPath,
      '--tolerance',
      String(tolerance),
    ]);
    if (simplify.code !== 0) {
      throw new Error(`Simplify failed.\n${simplify.stderr || simplify.stdout}`.trim());
    }
    if (!fs.existsSync(simplifiedGeoPath)) {
      throw new Error('Simplify step did not produce district output.');
    }
    finalGeo = JSON.parse(fs.readFileSync(simplifiedGeoPath, 'utf8'));
  }

  const adminGeojson = finalGeo;
  if (params.clipToLand) {
    const clipped = clipGeojsonToLandMask(finalGeo, params.overpassOptions?.retryEvents);
    if (clipped.empty) {
      params.overpassOptions?.retryEvents?.push('Clip to land produced empty district geometry, using unclipped polygons.');
    } else if (clipped.clipped) {
      finalGeo = clipped.geojson;
    }
  }

  const renderedFeatureCount = countGeojsonFeatures(finalGeo);
  if (renderedFeatureCount !== selected.featureCount) {
    params.overpassOptions?.retryEvents?.push(
      `Rendering ${renderedFeatureCount} of ${selected.featureCount} selected district polygon${selected.featureCount === 1 ? '' : 's'} after simplification/clipping.`
    );
  }

  return {
    geojson: finalGeo,
    adminGeojson: params.clipToLand ? adminGeojson : undefined,
    toleranceUsed: tolerance,
    vertexCount: countVertices(finalGeo),
    featureCount: renderedFeatureCount,
    bbox: computeGeojsonBBox(finalGeo),
    districtItems: selected.districtItems,
    districtSourceLabel: selected.districtSourceLabel,
    pointOnlyHint: selected.pointOnlyHint,
    pointOnlyCount: selected.pointOnlyCount,
    availableDistrictGroups: selected.availableDistrictGroups,
  };
};

const buildRelationGeometryQuery = (relationId: number) =>
  [
    '[out:json][timeout:60];',
    `relation(${relationId});`,
    'out body;',
    '>;',
    'out skel qt;',
  ].join('\n');

const CLIP_EPSILON = 1e-9;
const CLIP_SNAP_DIGITS = 6;

const toPointKey = (point: GeoPoint) => `${point[0].toFixed(CLIP_SNAP_DIGITS)},${point[1].toFixed(CLIP_SNAP_DIGITS)}`;

const snapPoint = (point: GeoPoint): GeoPoint => [
  Number(point[0].toFixed(CLIP_SNAP_DIGITS)),
  Number(point[1].toFixed(CLIP_SNAP_DIGITS)),
];

const pointsEqual = (a: GeoPoint, b: GeoPoint, eps = CLIP_EPSILON) =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;

const ringSignedArea = (ring: GeoRing) => {
  if (ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += (a[0] * b[1]) - (b[0] * a[1]);
  }
  return area / 2;
};

const toOpenRing = (rawRing: any): GeoRing => {
  if (!Array.isArray(rawRing)) return [];
  const points: GeoRing = rawRing
    .filter((coord: any) => Array.isArray(coord) && coord.length >= 2)
    .map((coord: any) => [Number(coord[0]), Number(coord[1])] as GeoPoint)
    .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]));

  const deduped: GeoRing = [];
  for (const point of points) {
    if (!deduped.length || !pointsEqual(deduped[deduped.length - 1], point, 0)) {
      deduped.push(point);
    }
  }
  if (deduped.length >= 2 && pointsEqual(deduped[0], deduped[deduped.length - 1], 0)) {
    deduped.pop();
  }
  return deduped;
};

const toClosedRing = (ring: GeoRing): GeoRing => {
  if (!ring.length) return [];
  const closed = [...ring];
  if (!pointsEqual(closed[0], closed[closed.length - 1], 0)) {
    closed.push(closed[0]);
  }
  return closed;
};

const bboxFromPoints = (points: GeoRing): BBox | null => {
  if (!points.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
};

const bboxIntersects = (a: BBox, b: BBox) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

const extractPolygonsFromGeometry = (geometry: any): GeoPolygon[] => {
  if (!geometry || typeof geometry !== 'object') return [];
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const rings = (geometry.coordinates as any[]).map(toOpenRing).filter((ring) => ring.length >= 3);
    return rings.length ? [rings] : [];
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as any[])
      .map((polygon: any) => (Array.isArray(polygon) ? polygon.map(toOpenRing).filter((ring) => ring.length >= 3) : []))
      .filter((polygon: GeoPolygon) => polygon.length >= 1);
  }
  return [];
};

const triangulatePolygon = (polygon: GeoPolygon): GeoTriangle[] => {
  if (!polygon.length) return [];
  const contour = toOpenRing(polygon[0]);
  if (contour.length < 3) return [];
  const holes = polygon.slice(1).map(toOpenRing).filter((ring) => ring.length >= 3);

  const triangulate = (outer: GeoRing, inner: GeoRing[]) => {
    const contourVec = outer.map((point) => new THREE.Vector2(point[0], point[1]));
    const holesVec = inner.map((ring) => ring.map((point) => new THREE.Vector2(point[0], point[1])));
    const indices = THREE.ShapeUtils.triangulateShape(contourVec, holesVec);
    const allPoints: GeoRing = [...outer, ...inner.flat()];
    const triangles: GeoTriangle[] = [];
    for (const tri of indices) {
      const a = allPoints[tri[0]];
      const b = allPoints[tri[1]];
      const c = allPoints[tri[2]];
      if (!a || !b || !c) continue;
      triangles.push([a, b, c]);
    }
    return triangles;
  };

  const firstPass = triangulate(contour, holes);
  if (firstPass.length) return firstPass;

  const fallbackOuter = [...contour].reverse();
  const fallbackHoles = holes.map((ring) => [...ring].reverse());
  return triangulate(fallbackOuter, fallbackHoles);
};

const cross = (a: GeoPoint, b: GeoPoint, p: GeoPoint) =>
  ((b[0] - a[0]) * (p[1] - a[1])) - ((b[1] - a[1]) * (p[0] - a[0]));

const lineIntersection = (s: GeoPoint, e: GeoPoint, a: GeoPoint, b: GeoPoint): GeoPoint => {
  const x1 = s[0];
  const y1 = s[1];
  const x2 = e[0];
  const y2 = e[1];
  const x3 = a[0];
  const y3 = a[1];
  const x4 = b[0];
  const y4 = b[1];
  const denominator = ((x1 - x2) * (y3 - y4)) - ((y1 - y2) * (x3 - x4));
  if (Math.abs(denominator) < CLIP_EPSILON) return e;
  const determinant1 = (x1 * y2) - (y1 * x2);
  const determinant2 = (x3 * y4) - (y3 * x4);
  const px = ((determinant1 * (x3 - x4)) - ((x1 - x2) * determinant2)) / denominator;
  const py = ((determinant1 * (y3 - y4)) - ((y1 - y2) * determinant2)) / denominator;
  return [px, py];
};

const clipPolygonByConvex = (subject: GeoRing, clipper: GeoRing): GeoRing => {
  if (subject.length < 3 || clipper.length < 3) return [];
  let output = [...subject];
  const clipArea = ringSignedArea(clipper);
  for (let i = 0; i < clipper.length; i += 1) {
    const cp1 = clipper[i];
    const cp2 = clipper[(i + 1) % clipper.length];
    const input = output;
    output = [];
    if (!input.length) break;
    let s = input[input.length - 1];
    for (const e of input) {
      const eInside = clipArea >= 0
        ? cross(cp1, cp2, e) >= -CLIP_EPSILON
        : cross(cp1, cp2, e) <= CLIP_EPSILON;
      const sInside = clipArea >= 0
        ? cross(cp1, cp2, s) >= -CLIP_EPSILON
        : cross(cp1, cp2, s) <= CLIP_EPSILON;
      if (eInside) {
        if (!sInside) output.push(lineIntersection(s, e, cp1, cp2));
        output.push(e);
      } else if (sInside) {
        output.push(lineIntersection(s, e, cp1, cp2));
      }
      s = e;
    }
  }
  const deduped: GeoRing = [];
  for (const point of output) {
    const snapped = snapPoint(point);
    if (!deduped.length || !pointsEqual(deduped[deduped.length - 1], snapped, 0)) {
      deduped.push(snapped);
    }
  }
  if (deduped.length >= 2 && pointsEqual(deduped[0], deduped[deduped.length - 1], 0)) {
    deduped.pop();
  }
  if (deduped.length < 3) return [];
  if (Math.abs(ringSignedArea(deduped)) <= CLIP_EPSILON) return [];
  return deduped;
};

const buildBoundaryRingsFromPieces = (pieces: GeoRing[]): GeoRing[] => {
  type Edge = { a: GeoPoint; b: GeoPoint; used: boolean };
  const edgeMap = new Map<string, Edge>();

  for (const ring of pieces) {
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length; i += 1) {
      const a = snapPoint(ring[i]);
      const b = snapPoint(ring[(i + 1) % ring.length]);
      if (pointsEqual(a, b, 0)) continue;
      const key = `${toPointKey(a)}>${toPointKey(b)}`;
      const reverseKey = `${toPointKey(b)}>${toPointKey(a)}`;
      if (edgeMap.has(reverseKey)) {
        edgeMap.delete(reverseKey);
      } else {
        edgeMap.set(key, { a, b, used: false });
      }
    }
  }

  const outgoing = new Map<string, string[]>();
  for (const [key, edge] of edgeMap.entries()) {
    const fromKey = toPointKey(edge.a);
    const list = outgoing.get(fromKey) || [];
    list.push(key);
    outgoing.set(fromKey, list);
  }

  const loops: GeoRing[] = [];
  for (const [startEdgeKey, startEdge] of edgeMap.entries()) {
    if (startEdge.used) continue;
    const startPointKey = toPointKey(startEdge.a);
    const loop: GeoRing = [startEdge.a];
    let currentEdgeKey = startEdgeKey;
    let guard = 0;
    let closed = false;

    while (guard < 20000) {
      guard += 1;
      const edge = edgeMap.get(currentEdgeKey);
      if (!edge || edge.used) break;
      edge.used = true;
      loop.push(edge.b);
      const nextPointKey = toPointKey(edge.b);
      if (nextPointKey === startPointKey) {
        closed = true;
        break;
      }
      const candidates = (outgoing.get(nextPointKey) || []).filter((candidateKey) => {
        const candidate = edgeMap.get(candidateKey);
        return Boolean(candidate && !candidate.used);
      });
      if (!candidates.length) break;
      currentEdgeKey = candidates[0];
    }

    if (!closed) continue;
    const openLoop = toOpenRing(loop);
    if (openLoop.length < 3) continue;
    if (Math.abs(ringSignedArea(openLoop)) <= CLIP_EPSILON) continue;
    loops.push(toClosedRing(openLoop));
  }

  return loops;
};

const pointInRing = (point: GeoPoint, ring: GeoRing) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || CLIP_EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (point: GeoPoint, polygon: GeoPolygon) => {
  if (!polygon.length) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
};

const extractLandMaskPolygons = (geojson: any) => {
  const polygons: LandMaskPolygon[] = [];
  const pushGeometry = (geometry: any) => {
    const extracted = extractPolygonsFromGeometry(geometry);
    for (const polygon of extracted) {
      const bbox = bboxFromPoints(polygon.flat());
      if (!bbox) continue;
      polygons.push({ rings: polygon, bbox });
    }
  };

  if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    geojson.features.forEach((feature: any) => pushGeometry(feature?.geometry));
  } else if (geojson?.type === 'Feature') {
    pushGeometry(geojson.geometry);
  } else {
    pushGeometry(geojson);
  }
  return polygons;
};

const loadLandMask = () => {
  if (LANDMASK_CACHE) return LANDMASK_CACHE;
  if (!fs.existsSync(LANDMASK_PATH)) {
    throw new Error(`Land mask not found at ${LANDMASK_PATH}`);
  }
  const raw = fs.readFileSync(LANDMASK_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  LANDMASK_CACHE = extractLandMaskPolygons(parsed);
  return LANDMASK_CACHE;
};

const clipGeojsonToLandMask = (geojson: any, retryEvents?: string[]) => {
  const subjectBBoxRaw = computeGeojsonBBox(geojson);
  if (!subjectBBoxRaw) {
    return { geojson, clipped: false, empty: false };
  }
  const subjectBBox: BBox = {
    minX: subjectBBoxRaw.minX,
    minY: subjectBBoxRaw.minY,
    maxX: subjectBBoxRaw.maxX,
    maxY: subjectBBoxRaw.maxY,
  };

  let landPolygons: LandMaskPolygon[];
  try {
    landPolygons = loadLandMask();
  } catch (error) {
    retryEvents?.push(`Clip to land skipped: ${(error as Error).message}`);
    return { geojson, clipped: false, empty: false };
  }

  const candidateLand = landPolygons.filter((polygon) => bboxIntersects(polygon.bbox, subjectBBox));
  if (!candidateLand.length) {
    retryEvents?.push('Clip to land skipped: no landmask polygons intersect boundary bbox.');
    return { geojson, clipped: false, empty: false };
  }

  const landTriangles: GeoTriangle[] = [];
  for (const polygon of candidateLand) {
    if (!polygon.triangles) {
      polygon.triangles = triangulatePolygon(polygon.rings);
    }
    for (const triangle of polygon.triangles || []) {
      const triBBox = bboxFromPoints(triangle);
      if (!triBBox || !bboxIntersects(triBBox, subjectBBox)) continue;
      landTriangles.push(triangle);
    }
  }
  if (!landTriangles.length) {
    retryEvents?.push('Clip to land skipped: no triangulated landmask polygons found in bbox.');
    return { geojson, clipped: false, empty: false };
  }

  const clipFeatureGeometry = (geometry: any) => {
    const polygons = extractPolygonsFromGeometry(geometry);
    const clippedPolygons: GeoPolygon[] = [];

    for (const polygon of polygons) {
      const subjectTriangles = triangulatePolygon(polygon);
      const pieces: GeoRing[] = [];
      for (const subjectTriangle of subjectTriangles) {
        const subjectBBoxTri = bboxFromPoints(subjectTriangle);
        if (!subjectBBoxTri) continue;
        for (const landTriangle of landTriangles) {
          const landBBoxTri = bboxFromPoints(landTriangle);
          if (!landBBoxTri || !bboxIntersects(subjectBBoxTri, landBBoxTri)) continue;
          const clipped = clipPolygonByConvex([...subjectTriangle], [...landTriangle]);
          if (clipped.length >= 3) {
            const centroid: GeoPoint = [
              clipped.reduce((sum, point) => sum + point[0], 0) / clipped.length,
              clipped.reduce((sum, point) => sum + point[1], 0) / clipped.length,
            ];
            if (!pointInPolygon(centroid, polygon)) continue;
            pieces.push(clipped);
          }
        }
      }
      const boundaryRings = buildBoundaryRingsFromPieces(pieces);
      for (const ring of boundaryRings) {
        clippedPolygons.push([ring]);
      }
    }

    if (!clippedPolygons.length) {
      return null;
    }
    if (clippedPolygons.length === 1) {
      return {
        type: 'Polygon',
        coordinates: clippedPolygons[0],
      };
    }
    return {
      type: 'MultiPolygon',
      coordinates: clippedPolygons,
    };
  };

  if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    const features = geojson.features
      .map((feature: any) => {
        const geometry = clipFeatureGeometry(feature?.geometry);
        if (!geometry) return null;
        return {
          ...feature,
          geometry,
        };
      })
      .filter(Boolean);
    if (!features.length) {
      return { geojson, clipped: false, empty: true };
    }
    return {
      geojson: {
        ...geojson,
        features,
      },
      clipped: true,
      empty: false,
    };
  }

  if (geojson?.type === 'Feature') {
    const geometry = clipFeatureGeometry(geojson.geometry);
    if (!geometry) {
      return { geojson, clipped: false, empty: true };
    }
    return {
      geojson: {
        ...geojson,
        geometry,
      },
      clipped: true,
      empty: false,
    };
  }

  const geometry = clipFeatureGeometry(geojson);
  if (!geometry) {
    return { geojson, clipped: false, empty: true };
  }
  return {
    geojson: geometry,
    clipped: true,
    empty: false,
  };
};

const computeGeojsonBBox = (geo: any) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const visitCoords = (coords: any) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const x = Number(coords[0]);
      const y = Number(coords[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return;
    }
    coords.forEach(visitCoords);
  };

  const visitGeometry = (geometry: any) => {
    if (!geometry || typeof geometry !== 'object') return;
    if (Array.isArray(geometry.coordinates)) {
      visitCoords(geometry.coordinates);
    }
    if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
      geometry.geometries.forEach(visitGeometry);
    }
  };

  if (geo?.type === 'FeatureCollection' && Array.isArray(geo.features)) {
    geo.features.forEach((feature: any) => visitGeometry(feature?.geometry));
  } else if (geo?.type === 'Feature') {
    visitGeometry(geo.geometry);
  } else {
    visitGeometry(geo);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
};

const simplifyPercentToTolerance = (geo: any, simplifyPercent: number) => {
  const pct = clamp(simplifyPercent, 0, 100);
  if (pct <= 0) return 0;
  const bbox = computeGeojsonBBox(geo);
  if (!bbox) {
    return Math.max(1e-6, (pct / 100) * 0.001);
  }
  const dx = bbox.maxX - bbox.minX;
  const dy = bbox.maxY - bbox.minY;
  const diagonal = Math.sqrt(dx * dx + dy * dy);
  const scaled = diagonal * (pct / 100) * 0.02;
  return Math.max(1e-7, scaled);
};

const countVertices = (geo: any) => {
  let total = 0;
  const visitCoords = (coords: any) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      total += 1;
      return;
    }
    coords.forEach(visitCoords);
  };
  const visitGeometry = (geometry: any) => {
    if (!geometry || typeof geometry !== 'object') return;
    if (Array.isArray(geometry.coordinates)) {
      visitCoords(geometry.coordinates);
    }
    if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
      geometry.geometries.forEach(visitGeometry);
    }
  };
  if (geo?.type === 'FeatureCollection' && Array.isArray(geo.features)) {
    geo.features.forEach((feature: any) => visitGeometry(feature?.geometry));
  } else if (geo?.type === 'Feature') {
    visitGeometry(geo.geometry);
  } else {
    visitGeometry(geo);
  }
  return total;
};

const purgeBoundaryPreviewCache = () => {
  const now = Date.now();
  for (const [id, entry] of BOUNDARY_PREVIEW_CACHE.entries()) {
    if ((now - entry.createdAt) > BOUNDARY_PREVIEW_TTL_MS) {
      BOUNDARY_PREVIEW_CACHE.delete(id);
    }
  }
};

const createBoundaryPreviewId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const putBoundaryPreview = (entry: Omit<BoundaryPreviewCacheEntry, 'id' | 'createdAt'>) => {
  purgeBoundaryPreviewCache();
  const id = createBoundaryPreviewId();
  BOUNDARY_PREVIEW_CACHE.set(id, {
    id,
    createdAt: Date.now(),
    ...entry,
  });
  return id;
};

const getBoundaryPreview = (id: string) => {
  purgeBoundaryPreviewCache();
  const entry = BOUNDARY_PREVIEW_CACHE.get(id);
  if (!entry) return null;
  if ((Date.now() - entry.createdAt) > BOUNDARY_PREVIEW_TTL_MS) {
    BOUNDARY_PREVIEW_CACHE.delete(id);
    return null;
  }
  return entry;
};

const buildBoundaryPreviewGeojson = async (params: {
  relationId: number;
  simplifyPercent: number;
  clipToLand: boolean;
  overpassOptions?: OverpassQueryOptions;
}) => {
  fs.mkdirSync(BOUNDARY_TMP_ROOT, { recursive: true });

  const stamp = `${Date.now()}-${params.relationId}-${Math.floor(Math.random() * 10000)}`;
  const osmPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.osm.json`);
  const rawGeoPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.geojson`);
  const simplifiedGeoPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.simplified.geojson`);

  const overpassData = await overpassQuery(buildRelationGeometryQuery(params.relationId), params.overpassOptions);
  fs.writeFileSync(osmPath, JSON.stringify(overpassData));

  const convert = await runProcessCapture('node', [OSM_TO_GEOJSON, osmPath, rawGeoPath]);
  if (convert.code !== 0) {
    throw new Error(`osmtogeojson failed.\n${convert.stderr || convert.stdout}`.trim());
  }
  if (!fs.existsSync(rawGeoPath)) {
    throw new Error('osmtogeojson did not produce output.');
  }

  const rawGeo = JSON.parse(fs.readFileSync(rawGeoPath, 'utf8'));
  const tolerance = simplifyPercentToTolerance(rawGeo, params.simplifyPercent);
  let finalGeo = rawGeo;

  if (tolerance > 0) {
    const simplify = await runProcessCapture(PYTHON_BIN, [
      PROCESS_GEO,
      rawGeoPath,
      simplifiedGeoPath,
      '--tolerance',
      String(tolerance),
    ]);
    if (simplify.code !== 0) {
      throw new Error(`Simplify failed.\n${simplify.stderr || simplify.stdout}`.trim());
    }
    if (!fs.existsSync(simplifiedGeoPath)) {
      throw new Error('Simplify step did not produce output.');
    }
    finalGeo = JSON.parse(fs.readFileSync(simplifiedGeoPath, 'utf8'));
  }

  const adminGeojson = finalGeo;
  if (params.clipToLand) {
    const clipped = clipGeojsonToLandMask(finalGeo, params.overpassOptions?.retryEvents);
    if (clipped.empty) {
      params.overpassOptions?.retryEvents?.push('Clip to land produced empty geometry, using unclipped boundary.');
    } else if (clipped.clipped) {
      finalGeo = clipped.geojson;
    }
  }

  return {
    geojson: finalGeo,
    adminGeojson: params.clipToLand ? adminGeojson : undefined,
    toleranceUsed: tolerance,
    vertexCount: countVertices(finalGeo),
  };
};

const buildBoundaryPreviewFromGeojson = async (params: {
  geojson: any;
  simplifyPercent: number;
  clipToLand: boolean;
  retryEvents?: string[];
}) => {
  fs.mkdirSync(BOUNDARY_TMP_ROOT, { recursive: true });

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}-disk`;
  const rawGeoPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.geojson`);
  const simplifiedGeoPath = path.join(BOUNDARY_TMP_ROOT, `${stamp}.simplified.geojson`);

  const rawGeo = params.geojson;
  fs.writeFileSync(rawGeoPath, JSON.stringify(rawGeo));

  const tolerance = simplifyPercentToTolerance(rawGeo, params.simplifyPercent);
  let finalGeo = rawGeo;

  if (tolerance > 0) {
    const simplify = await runProcessCapture(PYTHON_BIN, [
      PROCESS_GEO,
      rawGeoPath,
      simplifiedGeoPath,
      '--tolerance',
      String(tolerance),
    ]);
    if (simplify.code !== 0) {
      throw new Error(`Simplify failed.\n${simplify.stderr || simplify.stdout}`.trim());
    }
    if (!fs.existsSync(simplifiedGeoPath)) {
      throw new Error('Simplify step did not produce output.');
    }
    finalGeo = JSON.parse(fs.readFileSync(simplifiedGeoPath, 'utf8'));
  }

  const adminGeojson = finalGeo;
  if (params.clipToLand) {
    const clipped = clipGeojsonToLandMask(finalGeo, params.retryEvents);
    if (clipped.empty) {
      params.retryEvents?.push('Clip to land produced empty geometry, using unclipped boundary.');
    } else if (clipped.clipped) {
      finalGeo = clipped.geojson;
    }
  }

  return {
    geojson: finalGeo,
    adminGeojson: params.clipToLand ? adminGeojson : undefined,
    toleranceUsed: tolerance,
    vertexCount: countVertices(finalGeo),
  };
};

const buildCuratedDistrictPreviewGeojson = async (params: {
  geojson: any;
  simplifyPercent: number;
  clipToLand: boolean;
  sourceLabel: string;
  retryEvents?: string[];
}) => {
  const built = await buildBoundaryPreviewFromGeojson({
    geojson: params.geojson,
    simplifyPercent: params.simplifyPercent,
    clipToLand: params.clipToLand,
    retryEvents: params.retryEvents,
  });
  const districtItems = extractDistrictItemsFromGeojson(params.geojson, params.sourceLabel);
  const renderedFeatureCount = countGeojsonFeatures(built.geojson);
  if (renderedFeatureCount !== districtItems.length) {
    params.retryEvents?.push(
      `Rendering ${renderedFeatureCount} polygon${renderedFeatureCount === 1 ? '' : 's'} from ${districtItems.length} curated district feature${districtItems.length === 1 ? '' : 's'} after simplification/clipping.`
    );
  }
  return {
    geojson: built.geojson,
    adminGeojson: built.adminGeojson,
    toleranceUsed: built.toleranceUsed,
    vertexCount: built.vertexCount,
    featureCount: renderedFeatureCount,
    bbox: computeGeojsonBBox(built.geojson),
    districtItems,
    districtSourceLabel: params.sourceLabel,
    pointOnlyHint: false,
    pointOnlyCount: 0,
    availableDistrictGroups: [{
      key: 'curated-major',
      label: params.sourceLabel,
      count: districtItems.length,
    }],
  };
};

const saveBoundaryGeojsonFile = async (params: {
  outputPath: string;
  geojson: any;
  clipToLand?: boolean;
  adminGeojson?: any;
  aliasOutputPaths?: string[];
}) => {
  const targetPath = normalizePublicGeoOutput(params.outputPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(params.geojson, null, 2));

  const aliasTargets = Array.from(new Set((params.aliasOutputPaths || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => normalizePublicGeoOutput(item))
    .filter((item) => item !== targetPath)));
  aliasTargets.forEach((aliasPath) => {
    fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
    fs.writeFileSync(aliasPath, JSON.stringify(params.geojson, null, 2));
  });

  let adminOutputPath: string | undefined;
  if (params.clipToLand && params.adminGeojson) {
    adminOutputPath = path.join(path.dirname(targetPath), 'outline-admin.geojson');
    fs.writeFileSync(adminOutputPath, JSON.stringify(params.adminGeojson, null, 2));
  }
  const relative = path.relative(path.join(ROOT_DIR, 'public'), targetPath).replace(/\\/g, '/');
  const aliasOutputUrls = aliasTargets.map((aliasPath) => `/${path.relative(path.join(ROOT_DIR, 'public'), aliasPath).replace(/\\/g, '/')}`);
  const adminRelative = adminOutputPath
    ? path.relative(path.join(ROOT_DIR, 'public'), adminOutputPath).replace(/\\/g, '/')
    : undefined;
  return {
    outputPath: targetPath,
    outputUrl: `/${relative}`,
    aliasOutputPaths: aliasTargets,
    aliasOutputUrls,
    adminOutputPath,
    adminOutputUrl: adminRelative ? `/${adminRelative}` : undefined,
  };
};

const createGeoApiMiddleware = () => async (req: any, res: any, next: any) => {
  if (!req.url?.startsWith('/api/admin/') && !req.url?.startsWith('/api/media/') && !req.url?.startsWith('/api/account/')) {
    return next();
  }

  try {
    if (req.method === 'POST' && req.url.startsWith('/api/media/create-upload-url')) {
      const body = await readJsonBody(req);
      const payload = await createCloudflareDirectUpload(body, req.headers.authorization);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/media/complete-upload')) {
      const body = await readJsonBody(req);
      const payload = await completeMediaUpload(body, req.headers.authorization);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/media/delete-asset')) {
      const body = await readJsonBody(req);
      const payload = await deleteMediaAsset(body, req.headers.authorization);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/media/moderate-asset')) {
      const body = await readJsonBody(req);
      const payload = await moderateMediaAsset(body, req.headers.authorization);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/account/delete')) {
      const payload = await deleteAuthenticatedAccount(req.headers.authorization);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/admin/listings')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const listings = loadListingsFromDisk();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(listings));
      return;
    }

    if (req.method === 'GET' && (req.url === '/api/admin/building-assets' || req.url.startsWith('/api/admin/building-assets?'))) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const assets = loadBuildingAssetsFromDisk();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(assets));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/admin/building-verification/evidence')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const records = loadJsonArray(BUILDING_VERIFICATION_EVIDENCE_STORE);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(records));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/building-verification/evidence/save')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const body = await readJsonBody(req);
      const evidence = body?.evidence as BuildingVerificationEvidenceRecord | undefined;
      const listingId = String(evidence?.listingId ?? '').trim();
      if (!listingId || !evidence?.evaluatedAt || !evidence?.providerSnapshot) {
        res.statusCode = 400;
        res.end('Missing building verification evidence.');
        return;
      }
      const listings = loadListingsFromDisk();
      const listing = listings.find((item: any) => item.id === listingId);
      if (!listingAllowsPreciseBuildingLookup(listing)) {
        res.statusCode = 403;
        res.end('Precise building evidence is disabled for this listing.');
        return;
      }
      const records = loadJsonArray(BUILDING_VERIFICATION_EVIDENCE_STORE) as BuildingVerificationEvidenceRecord[];
      const existing = records.find((item) => item.listingId === listingId && item.evaluatedAt === evidence.evaluatedAt);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(evidence)) {
          res.statusCode = 409;
          res.end('Building verification evidence is immutable once recorded. Start a new verification run instead.');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, evidence: existing, duplicate: true }));
        return;
      }
      records.push(evidence);
      records.sort((a, b) => String(a.evaluatedAt).localeCompare(String(b.evaluatedAt)));
      saveJsonArray(BUILDING_VERIFICATION_EVIDENCE_STORE, records);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, evidence }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/building-verification/evidence/review')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const body = await readJsonBody(req);
      const listingId = String(body?.listingId ?? '').trim();
      const disposition = String(body?.disposition ?? '').trim();
      const allowed = new Set(['accept_recommended_building', 'keep_existing_building', 'move_pin_to_recommended_building', 'mark_location_for_research']);
      if (!listingId || !allowed.has(disposition)) {
        res.statusCode = 400;
        res.end('Invalid building review disposition.');
        return;
      }
      const records = loadJsonArray(BUILDING_VERIFICATION_EVIDENCE_STORE) as BuildingVerificationEvidenceRecord[];
      const matching = records
        .filter((item) => item.listingId === listingId)
        .sort((a, b) => String(b.evaluatedAt).localeCompare(String(a.evaluatedAt)))[0];
      if (!matching) {
        res.statusCode = 404;
        res.end('No building verification evidence exists for this listing.');
        return;
      }
      const reviewEvent: BuildingVerificationReviewEvent = {
        version: 1,
        id: `building-review-${listingId}-${Date.now()}`,
        listingId,
        evidenceEvaluatedAt: matching.evaluatedAt,
        evidenceSnapshotHash: matching.inputSnapshotHash,
        disposition: disposition as BuildingVerificationReviewEvent['disposition'],
        reviewedAt: new Date().toISOString(),
        reviewedBy: admin.userId,
        note: String(body?.note ?? '').trim() || undefined,
      };
      const reviews = loadJsonArray(BUILDING_VERIFICATION_REVIEW_STORE) as BuildingVerificationReviewEvent[];
      reviews.push(reviewEvent);
      saveJsonArray(BUILDING_VERIFICATION_REVIEW_STORE, reviews);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, evidence: matching, reviewEvent }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/building-footprints/supplemental')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const body = await readJsonBody(req);
      const listingId = String(body?.listingId ?? '').trim();
      const lat = Number(body?.lat);
      const lng = Number(body?.lng);
      const radiusMeters = Math.max(20, Math.min(750, Number(body?.radiusMeters) || 250));
      const maxFeatures = Math.max(1, Math.min(2_000, Number(body?.maxFeatures) || 1_200));
      const listing = loadListingsFromDisk().find((item: any) => item.id === listingId);
      if (!listingId || !listingAllowsPreciseBuildingLookup(listing)) {
        res.statusCode = 403;
        res.end('Precise supplemental building lookup is disabled for this listing.');
        return;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        res.statusCode = 400;
        res.end('Invalid supplemental building coordinate.');
        return;
      }
      const listingLat = Number(listing?.geopoint?.latitude);
      const listingLng = Number(listing?.geopoint?.longitude);
      if (Number.isFinite(listingLat) && Number.isFinite(listingLng)) {
        const latitudeDeltaMeters = Math.abs(lat - listingLat) * 110_540;
        const longitudeDeltaMeters = Math.abs(lng - listingLng) * Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180));
        if (Math.hypot(latitudeDeltaMeters, longitudeDeltaMeters) > 1_500) {
          res.statusCode = 400;
          res.end('Supplemental building lookup must stay near the listing coordinate.');
          return;
        }
      }
      const payload = await queryMicrosoftBuildingFootprints({
        lat,
        lng,
        radiusMeters,
        maxFeatures,
        cacheDirectory: BUILDING_FOOTPRINT_CACHE_DIR,
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/building-address/reverse')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const body = await readJsonBody(req);
      const listingId = String(body?.listingId ?? '').trim();
      const lat = Number(body?.lat);
      const lng = Number(body?.lng);
      const listing = loadListingsFromDisk().find((item: any) => item.id === listingId);
      if (!listingId || !listingAllowsPreciseBuildingLookup(listing)) {
        res.statusCode = 403;
        res.end('Precise address resolution is disabled for this listing.');
        return;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        res.statusCode = 400;
        res.end('Invalid reverse-geocode coordinate.');
        return;
      }
      const cacheKey = getBuildingAddressCacheKey(body);
      const cache = loadJsonArray(BUILDING_ADDRESS_CACHE_STORE);
      const cached = cache.find((item: any) => item.key === cacheKey);
      if (cached?.resolution) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ...cached.resolution, cached: true }));
        return;
      }
      const resolution = await serverBuildingAddressResolver.resolveDetailed(lat, lng, {
        listingId,
        footprintFingerprint: String(body?.footprintFingerprint ?? '').trim() || undefined,
      });
      if (resolution.status !== 'provider_error') {
        cache.push({ key: cacheKey, resolvedAt: new Date().toISOString(), source: 'nominatim', resolution });
        saveJsonArray(BUILDING_ADDRESS_CACHE_STORE, cache.slice(-5_000));
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(resolution));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/globe/hero-arrival/save')) {
      const body = await readJsonBody(req);
      if (!body?.profile) {
        res.statusCode = 400;
        res.end('Missing hero arrival profile.');
        return;
      }
      saveHeroArrivalProfileToDisk(body.profile);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, path: GLOBE_RUNTIME_CONFIG_PATH }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/globe/lighting-audit/save')) {
      const body = await readJsonBody(req);
      if (!body?.state) {
        res.statusCode = 400;
        res.end('Missing lighting audit state.');
        return;
      }
      saveLightingAuditStateToDisk(body.state);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, path: GLOBE_RUNTIME_CONFIG_PATH }));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/admin/street-view/profile')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const url = new URL(req.url, 'http://localhost');
      const listingId = String(url.searchParams.get('listingId') ?? '').trim();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ profile: listingId ? getStreetViewProfile(listingId) : null }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/street-view/profile/save')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const body = await readJsonBody(req);
      if (!body?.profile) {
        res.statusCode = 400;
        res.end('Missing Street View profile.');
        return;
      }
      const profile = saveStreetViewProfile(body.profile);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, profile, path: STREET_VIEW_PROFILES_STORE }));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/admin/globe/border-surgery/overrides')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(loadManualBorderOverrides()));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/globe/border-surgery/save')) {
      const body = await readJsonBody(req);
      const saved = saveManualBorderOverride(body);
      await runGlobeBorderGenerator();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        saved,
        assetUrl: `/assets/globe/borders/hybrid/v1/${String(body.countryId ?? '').trim().toLowerCase()}.json`,
      }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/globe/border-surgery/remove')) {
      const body = await readJsonBody(req);
      const removed = removeManualBorderOverride(body?.countryId, body?.ringId);
      if (removed) await runGlobeBorderGenerator();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, removed }));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/admin/building-assets/history')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const url = new URL(req.url, 'http://localhost');
      const listingId = String(url.searchParams.get('listingId') ?? '').trim();
      const history = (loadJsonArray(BUILDING_ASSET_HISTORY_STORE) as BuildingAssetHistoryEvent[])
        .filter((event) => !listingId || event.listingId === listingId)
        .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(history));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/building-assets/rollback')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const body = await readJsonBody(req);
      const listingId = String(body?.listingId ?? '').trim();
      const expectedSnapshot = body?.expectedSnapshot;
      const expectedExistingAsset = body?.expectedExistingAsset;
      const historyEventId = String(body?.historyEventId ?? '').trim();
      const assets = loadBuildingAssetsFromDisk();
      const localListings = loadListingsFromDisk();
      const history = loadJsonArray(BUILDING_ASSET_HISTORY_STORE) as BuildingAssetHistoryEvent[];
      let canonicalCollections;
      try {
        canonicalCollections = await loadAuthoritativeBuildingCollections(req.headers.authorization);
      } catch (error) {
        res.statusCode = 503;
        res.end(`Rollback could not verify canonical location data: ${error instanceof Error ? error.message : 'unknown error'}`);
        return;
      }
      const listing = canonicalCollections.listings.find((item: any) => item.id === listingId);
      const currentAsset = assets.find((item: any) => item.listingId === listingId || item.id === listing?.buildingAssetId) ?? null;
      const restoreEvent = history.find((event) => (
        event.id === historyEventId
        && event.listingId === listingId
        && event.action === 'replace'
        && event.previousAsset
      )) ?? null;
      if (!listing || !currentAsset || !restoreEvent?.previousAsset) {
        res.statusCode = 404;
        res.end('No previous BuildingAsset revision is available to restore.');
        return;
      }
      const guard = guardBuildingAssetPersistence({
        listing,
        collections: canonicalCollections,
        asset: restoreEvent.previousAsset,
        expectedSnapshot,
        existingAsset: currentAsset,
        expectedExistingAsset,
        mode: 'manual',
        allowReplaceExisting: true,
      });
      if (!guard.ok) {
        res.statusCode = 409;
        res.end(`Rollback blocked: ${guard.reasons.join('; ')}`);
        return;
      }
      const now = new Date().toISOString();
      const restoredAsset = {
        ...restoreEvent.previousAsset,
        capture: { ...restoreEvent.previousAsset.capture, updatedAt: now },
      };
      const nextAssets = assets.map((item: any) => item.id === currentAsset.id || item.listingId === listingId ? restoredAsset : item);
      const listingIndex = localListings.findIndex((item: any) => item.id === listingId);
      const updatedListing = { ...listing, buildingAssetId: restoredAsset.id };
      const nextListings = [...localListings];
      if (listingIndex >= 0) nextListings[listingIndex] = updatedListing;
      else nextListings.push(updatedListing);
      const historyEvent: BuildingAssetHistoryEvent = {
        version: 1,
        id: `building-history-${listingId}-${Date.now()}`,
        listingId,
        venueId: restoredAsset.venueId ?? null,
        action: 'rollback',
        occurredAt: now,
        actorUserId: admin.userId,
        persistenceMode: 'manual',
        policyVersion: BUILDING_PERSISTENCE_POLICY_VERSION,
        inputSnapshot: guard.currentSnapshot,
        previousAsset: currentAsset,
        nextAsset: restoredAsset,
        note: `Restored revision from ${restoreEvent.occurredAt}.`,
      };
      const nextHistory = [...history, historyEvent];
      try {
        saveJsonArray(BUILDING_ASSETS_STORE, nextAssets);
        saveJsonArray(LISTINGS_STORE, nextListings);
        saveJsonArray(BUILDING_ASSET_HISTORY_STORE, nextHistory);
      } catch (error) {
        saveJsonArray(BUILDING_ASSETS_STORE, assets);
        saveJsonArray(LISTINGS_STORE, localListings);
        saveJsonArray(BUILDING_ASSET_HISTORY_STORE, history);
        throw error;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ asset: restoredAsset, listing: updatedListing, historyEvent }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/building-assets/save')) {
      const admin = await requireBuildingAdmin(req, res);
      if (!admin) return;
      const body = await readJsonBody(req);
      const asset = body?.asset;
      const listingId = String(body?.listingId || asset?.listingId || '').trim();
      const mode = body?.mode === 'automatic' ? 'automatic' : 'manual';
      if (mode === 'automatic' && process.env[BUILDING_AUTO_PERSISTENCE_ENV] !== '1') {
        res.statusCode = 403;
        res.end(`Automatic building persistence is disabled. Set ${BUILDING_AUTO_PERSISTENCE_ENV}=1 only after benchmark approval.`);
        return;
      }
      if (!listingId || !asset?.geometry) {
        res.statusCode = 400;
        res.end('Missing building asset listing id or geometry.');
        return;
      }

      const now = new Date().toISOString();
      const assets = loadBuildingAssetsFromDisk();
      const localListings = loadListingsFromDisk();
      const history = loadJsonArray(BUILDING_ASSET_HISTORY_STORE) as BuildingAssetHistoryEvent[];
      let canonicalCollections;
      try {
        canonicalCollections = await loadAuthoritativeBuildingCollections(req.headers.authorization);
      } catch (error) {
        res.statusCode = 503;
        res.end(`Building save could not verify canonical location data: ${error instanceof Error ? error.message : 'unknown error'}`);
        return;
      }
      const listing = canonicalCollections.listings.find((item: any) => item.id === listingId);
      if (!listing) {
        res.statusCode = 404;
        res.end('BuildingAsset owner listing was not found in the canonical listing store.');
        return;
      }
      const existingAsset = assets.find((item: any) => item.listingId === listingId || item.id === asset.id) ?? null;
      const assetId = String(existingAsset?.id || asset.id || `building-asset-${listingId}`);
      const nextAsset = {
        ...asset,
        id: assetId,
        listingId,
        version: 1,
        capture: {
          ...(asset.capture ?? {}),
          createdAt: existingAsset?.capture?.createdAt || asset.capture?.createdAt || now,
          updatedAt: now,
        },
      };
      const guard = guardBuildingAssetPersistence({
        listing,
        collections: canonicalCollections,
        asset: nextAsset,
        expectedSnapshot: body?.expectedSnapshot,
        evidence: body?.evidence ?? null,
        existingAsset,
        expectedExistingAsset: body?.expectedExistingAsset,
        mode,
        allowReplaceExisting: body?.allowReplaceExisting === true,
      });
      if (!guard.ok) {
        res.statusCode = 409;
        res.end(`Building save blocked: ${guard.reasons.join('; ')}`);
        return;
      }
      const geometryAudit = auditBuildingGeometry(nextAsset.geometry);
      if (!geometryAudit.valid) {
        res.statusCode = 400;
        res.end(`Invalid building geometry: ${geometryAudit.failures.join(', ')}`);
        return;
      }
      nextAsset.capture = {
        ...nextAsset.capture,
        polygonCount: geometryAudit.polygonCount,
        ringCount: geometryAudit.ringCount,
        vertexCount: geometryAudit.vertexCount,
      };

      const nextAssets = [...assets];
      const assetIndex = nextAssets.findIndex((item: any) => item.id === assetId || item.listingId === listingId);
      if (assetIndex >= 0) nextAssets[assetIndex] = nextAsset;
      else nextAssets.push(nextAsset);
      const listingIndex = localListings.findIndex((item: any) => item.id === listingId);
      const updatedListing = { ...listing, buildingAssetId: assetId };
      const nextListings = [...localListings];
      if (listingIndex >= 0) nextListings[listingIndex] = updatedListing;
      else nextListings.push(updatedListing);
      const historyEvent: BuildingAssetHistoryEvent = {
        version: 1,
        id: `building-history-${listingId}-${Date.now()}`,
        listingId,
        venueId: nextAsset.venueId ?? null,
        action: existingAsset ? 'replace' : 'create',
        occurredAt: now,
        actorUserId: admin.userId,
        persistenceMode: mode,
        policyVersion: BUILDING_PERSISTENCE_POLICY_VERSION,
        inputSnapshot: guard.currentSnapshot,
        evidenceEvaluatedAt: body?.evidence?.evaluatedAt,
        previousAsset: existingAsset,
        nextAsset,
        note: mode === 'automatic' ? 'Definitive verifier persistence.' : 'Explicit Building Inspector save.',
      };
      const nextHistory = [...history, historyEvent];
      try {
        saveJsonArray(BUILDING_ASSETS_STORE, nextAssets);
        saveJsonArray(LISTINGS_STORE, nextListings);
        saveJsonArray(BUILDING_ASSET_HISTORY_STORE, nextHistory);
      } catch (error) {
        saveJsonArray(BUILDING_ASSETS_STORE, assets);
        saveJsonArray(LISTINGS_STORE, localListings);
        saveJsonArray(BUILDING_ASSET_HISTORY_STORE, history);
        throw error;
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ asset: nextAsset, listing: updatedListing, historyEvent }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/listings/save')) {
      const body = await readJsonBody(req);
      const listing = body?.listing;
      if (!listing) {
        res.statusCode = 400;
        res.end('Missing listing payload.');
        return;
      }

      let listingToSave = listing;
      try {
        const normalized = await normalizeListingAddress(listing);
        listingToSave = {
          ...listing,
          id: generateListingId(listing),
          location: buildListingLocation(listing),
          geopoint: {
            ...listing.geopoint,
            address: normalized.address,
          },
        };
      } catch (error) {
        console.warn('Listing normalization failed; saving raw listing.', error);
        listingToSave = {
          ...listing,
          id: generateListingId(listing),
          location: buildListingLocation(listing),
        };
      }

      const listings = loadListingsFromDisk();
      const index = listings.findIndex((item: any) => item.id === listingToSave.id);
      if (index >= 0) {
        listings[index] = listingToSave;
      } else {
        listings.push(listingToSave);
      }
      saveListingsToDisk(listings);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(listingToSave));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/listings/delete')) {
      const body = await readJsonBody(req);
      const id = String(body?.id || '').trim();
      if (!id) {
        res.statusCode = 400;
        res.end('Missing listing id.');
        return;
      }

      const listings = loadListingsFromDisk();
      const nextListings = listings.filter((item: any) => item.id !== id);
      saveListingsToDisk(nextListings);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/admin/geo/boundary-builder/exists')) {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const inputPath = String(parsedUrl.searchParams.get('path') || '').trim();
      if (!inputPath) {
        res.statusCode = 400;
        res.end('Path is required.');
        return;
      }
      try {
        const normalizedPath = normalizePublicGeoOutput(inputPath);
        const exists = fs.existsSync(normalizedPath);
        const relative = path.relative(path.join(ROOT_DIR, 'public'), normalizedPath).replace(/\\/g, '/');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          path: inputPath,
          exists,
          outputPath: normalizedPath,
          outputUrl: `/${relative}`,
        }));
      } catch (error) {
        res.statusCode = 400;
        res.end(`Invalid path: ${(error as Error).message}`);
      }
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/geo/boundary-builder/exists')) {
      const body = await readJsonBody(req);
      const inputPaths = Array.isArray(body?.paths)
        ? body.paths.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [String(body?.path || '').trim()].filter(Boolean);
      if (!inputPaths.length) {
        res.statusCode = 400;
        res.end('At least one path is required.');
        return;
      }

      const items = inputPaths.map((inputPath) => {
        try {
          const normalizedPath = normalizePublicGeoOutput(inputPath);
          const exists = fs.existsSync(normalizedPath);
          const relative = path.relative(path.join(ROOT_DIR, 'public'), normalizedPath).replace(/\\/g, '/');
          return {
            path: inputPath,
            exists,
            outputPath: normalizedPath,
            outputUrl: `/${relative}`,
          };
        } catch (error) {
          return {
            path: inputPath,
            exists: false,
            error: (error as Error).message,
          };
        }
      });

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        total: items.length,
        existing: items.filter((item) => item.exists).length,
        items,
      }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/geo/boundary-builder/resolve')) {
      const body = await readJsonBody(req);
      const type = normalizeBoundaryBuilderType(body?.type);
      if (!type || !isBoundaryResolveType(type)) {
        res.statusCode = 400;
        res.end('Invalid boundary type. Use region, county, or city.');
        return;
      }
      const retryEvents: string[] = [];
      const resolved = await resolveBoundaryForLevel({
        query: String(body?.query || '').trim(),
        type,
        relationId: relationIdFromUnknown(body?.relationId),
        countryName: String(body?.countryName || '').trim(),
        admin1Name: String(body?.admin1Name || '').trim(),
        countrySlug: String(body?.countrySlug || '').trim(),
        admin1Slug: String(body?.admin1Slug || '').trim(),
      }, { retryEvents });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ...resolved,
        events: retryEvents,
      }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/geo/boundary-builder/export')) {
      const body = await readJsonBody(req);
      const type = normalizeBoundaryBuilderType(body?.type);
      if (!type) {
        res.statusCode = 400;
        res.end('Invalid boundary type. Use region, county, city, district, or major-district.');
        return;
      }
      const simplifyPercent = clamp(Number(body?.simplifyPercent ?? 12), 0, 100);
      const clipToLand = typeof body?.clipToLand === 'boolean' ? body.clipToLand : type !== 'region';
      const previewOnly = Boolean(body?.previewOnly);
      const previewId = String(body?.previewId || '').trim();
      const retryEvents: string[] = [];

      if (type === 'district' || type === 'major-district') {
        const isMajorDistrict = type === 'major-district';
        const parentQuery = String(body?.parentQuery || body?.query || '').trim();
        const districtQuery = String(body?.districtQuery || '').trim();
        const parentResolved = await resolveBoundaryForLevel({
          query: parentQuery,
          type: 'city',
          relationId: relationIdFromUnknown(body?.relationId),
          countryName: String(body?.countryName || '').trim(),
          admin1Name: String(body?.admin1Name || '').trim(),
          countrySlug: String(body?.countrySlug || '').trim(),
          admin1Slug: String(body?.admin1Slug || '').trim(),
        }, { retryEvents });
        const countrySlug = normalizeCountry(String(body?.countrySlug || '').trim() || parentResolved.countrySlug) || parentResolved.countrySlug;
        const admin1Slug = normalizeAdmin1(
          String(body?.admin1Slug || '').trim() || parentResolved.admin1Slug,
          countrySlug
        ) || parentResolved.admin1Slug;
        const citySlug = slugifyPlace(String(body?.parentSlug || body?.slug || '').trim() || parentResolved.slug) || parentResolved.slug;
        const defaultPath = isMajorDistrict
          ? buildMajorDistrictSuggestedPath(countrySlug, admin1Slug, citySlug)
          : buildRawDistrictSuggestedPath(countrySlug, admin1Slug, citySlug);
        const outputPath = String(body?.outputPath || defaultPath).trim();
        let preview = previewId ? getBoundaryPreview(previewId) : null;
        if (!preview || preview.simplifyPercent !== simplifyPercent || preview.clipToLand !== clipToLand) {
          const built = isMajorDistrict
            ? await (async () => {
                const hasImportedGeojson =
                  (typeof body?.importGeojson === 'string' && body.importGeojson.trim()) ||
                  (body?.importGeojson && typeof body.importGeojson === 'object');
                let sourceGeojson: any;
                let sourceLabel = 'curated major districts';
                if (hasImportedGeojson) {
                  const parsedInput = parseGeojsonInput(body?.importGeojson);
                  if (!parsedInput.ok) {
                    throw new Error(parsedInput.message || 'Invalid curated GeoJSON input.');
                  }
                  sourceGeojson = parsedInput.geojson;
                  sourceLabel = 'curated major districts (imported GeoJSON)';
                  retryEvents.push('Loaded curated major districts from imported GeoJSON.');
                } else {
                  const inputPath = String(body?.inputPath || outputPath || defaultPath).trim() || defaultPath;
                  const loaded = tryReadGeojsonCandidate(inputPath);
                  if (loaded.invalid) {
                    throw new Error(`Curated major district file is invalid: ${loaded.invalid.message}`);
                  }
                  if (!loaded.found) {
                    throw new Error(`Curated major district file not found at ${inputPath}. Paste GeoJSON or create the file first.`);
                  }
                  sourceGeojson = loaded.found.geojson;
                  retryEvents.push(`Loaded curated major districts from ${inputPath}.`);
                }
                return buildCuratedDistrictPreviewGeojson({
                  geojson: sourceGeojson,
                  simplifyPercent,
                  clipToLand,
                  sourceLabel,
                  retryEvents,
                });
              })()
            : await buildDistrictPreviewGeojson({
                relationId: parentResolved.relationId,
                districtQuery,
                simplifyPercent,
                clipToLand,
                overpassOptions: { retryEvents },
              });
          const storedPreviewId = putBoundaryPreview({
            simplifyPercent,
            clipToLand,
            vertexCount: built.vertexCount,
            toleranceUsed: built.toleranceUsed,
            geojson: built.geojson,
            adminGeojson: built.adminGeojson,
            featureCount: built.featureCount,
            bbox: built.bbox,
            districtItems: built.districtItems,
            districtSourceLabel: built.districtSourceLabel,
            pointOnlyHint: built.pointOnlyHint,
            pointOnlyCount: built.pointOnlyCount,
            availableDistrictGroups: built.availableDistrictGroups,
          });
          preview = getBoundaryPreview(storedPreviewId);
          if (!preview) {
            throw new Error('Failed to cache district preview geometry.');
          }
        }

        const previewName = isMajorDistrict
          ? `${parentResolved.name} major districts`
          : districtQuery
            ? `${parentResolved.name} districts matching ${districtQuery}`
            : `${parentResolved.name} districts`;

        if (previewOnly) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            type,
            level: 'district',
            query: parentQuery,
            name: previewName,
            parentName: parentResolved.name,
            parentRelationId: parentResolved.relationId,
            countrySlug,
            admin1Slug,
            slug: citySlug,
            outputPath: normalizePublicGeoOutput(outputPath),
            outputUrl: outputPath,
            simplifyPercent,
            clipToLand,
            previewId: preview.id,
            geojson: preview.geojson,
            featureCount: preview.featureCount,
            bbox: preview.bbox,
            districtItems: preview.districtItems || [],
            districtSourceLabel: preview.districtSourceLabel,
            pointOnlyHint: Boolean(preview.pointOnlyHint),
            pointOnlyCount: preview.pointOnlyCount || 0,
            availableDistrictGroups: preview.availableDistrictGroups || [],
            vertexCount: preview.vertexCount,
            toleranceUsed: preview.toleranceUsed,
            events: retryEvents,
            previewOnly: true,
          }));
          return;
        }

        const saved = await saveBoundaryGeojsonFile({
          outputPath,
          geojson: preview.geojson,
          clipToLand,
          adminGeojson: preview.adminGeojson,
          aliasOutputPaths: buildLegacyAliasOutputPaths(type, outputPath),
        });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          type,
          level: 'district',
          query: parentQuery,
          name: previewName,
          parentName: parentResolved.name,
          parentRelationId: parentResolved.relationId,
          countrySlug,
          admin1Slug,
          slug: citySlug,
          previewId: preview.id,
          outputPath: saved.outputPath,
          outputUrl: saved.outputUrl,
          aliasOutputPaths: saved.aliasOutputPaths,
          aliasOutputUrls: saved.aliasOutputUrls,
          adminOutputPath: saved.adminOutputPath,
          adminOutputUrl: saved.adminOutputUrl,
          featureCount: preview.featureCount,
          bbox: preview.bbox,
          districtItems: preview.districtItems || [],
          districtSourceLabel: preview.districtSourceLabel,
          pointOnlyHint: Boolean(preview.pointOnlyHint),
          pointOnlyCount: preview.pointOnlyCount || 0,
          availableDistrictGroups: preview.availableDistrictGroups || [],
          simplifyPercent,
          clipToLand,
          vertexCount: preview.vertexCount,
          toleranceUsed: preview.toleranceUsed,
          events: retryEvents,
        }));
        return;
      }
      if (!isBoundaryResolveType(type)) {
        res.statusCode = 400;
        res.end('Invalid boundary type. Use region, county, city, district, or major-district.');
        return;
      }

      const resolved = await resolveBoundaryForLevel({
        query: String(body?.query || '').trim(),
        type,
        relationId: relationIdFromUnknown(body?.relationId),
        countryName: String(body?.countryName || '').trim(),
        admin1Name: String(body?.admin1Name || '').trim(),
        countrySlug: String(body?.countrySlug || '').trim(),
        admin1Slug: String(body?.admin1Slug || '').trim(),
      }, { retryEvents });
      const countrySlug = normalizeCountry(String(body?.countrySlug || '').trim() || resolved.countrySlug) || resolved.countrySlug;
      const admin1Slug = normalizeAdmin1(
        String(body?.admin1Slug || '').trim() || resolved.admin1Slug,
        countrySlug
      ) || resolved.admin1Slug;
      const slug = slugifyPlace(String(body?.slug || '').trim() || resolved.slug) || resolved.slug;
      const defaultPath = buildBoundarySuggestedPath(type, countrySlug, admin1Slug, slug);
      const outputPath = String(body?.outputPath || defaultPath).trim();
      let preview = previewId ? getBoundaryPreview(previewId) : null;
      if (!preview || preview.simplifyPercent !== simplifyPercent || preview.clipToLand !== clipToLand) {
        const built = resolved.reusedGeojson
          ? await buildBoundaryPreviewFromGeojson({
              geojson: resolved.reusedGeojson,
              simplifyPercent,
              clipToLand,
              retryEvents,
            })
          : await buildBoundaryPreviewGeojson({
              relationId: resolved.relationId,
              simplifyPercent,
              clipToLand,
              overpassOptions: { retryEvents },
            });
        const storedPreviewId = putBoundaryPreview({
          simplifyPercent,
          clipToLand,
          vertexCount: built.vertexCount,
          toleranceUsed: built.toleranceUsed,
          geojson: built.geojson,
          adminGeojson: built.adminGeojson,
          bbox: computeGeojsonBBox(built.geojson),
        });
        preview = getBoundaryPreview(storedPreviewId);
        if (!preview) {
          throw new Error('Failed to cache preview geometry.');
        }
      }

      if (previewOnly) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ...resolved,
          level: type,
          type,
          countrySlug,
          admin1Slug,
          slug,
          outputPath: normalizePublicGeoOutput(outputPath),
          outputUrl: outputPath,
          simplifyPercent,
          clipToLand,
          previewId: preview.id,
          geojson: preview.geojson,
          bbox: preview.bbox,
          vertexCount: preview.vertexCount,
          toleranceUsed: preview.toleranceUsed,
          events: retryEvents,
          previewOnly: true,
        }));
        return;
      }

      const saved = await saveBoundaryGeojsonFile({
        outputPath,
        geojson: preview.geojson,
        clipToLand,
        adminGeojson: preview.adminGeojson,
        aliasOutputPaths: buildLegacyAliasOutputPaths(type, outputPath),
      });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ...resolved,
        level: type,
        type,
        countrySlug,
        admin1Slug,
        slug,
        previewId: preview.id,
        outputPath: saved.outputPath,
        outputUrl: saved.outputUrl,
        aliasOutputPaths: saved.aliasOutputPaths,
        aliasOutputUrls: saved.aliasOutputUrls,
        adminOutputPath: saved.adminOutputPath,
        adminOutputUrl: saved.adminOutputUrl,
        simplifyPercent,
        clipToLand,
        bbox: preview.bbox,
        vertexCount: preview.vertexCount,
        toleranceUsed: preview.toleranceUsed,
        events: retryEvents,
      }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/geo/boundary-builder/batch')) {
      const body = await readJsonBody(req);
      const type = normalizeBoundaryBuilderType(body?.type);
      if (!type || !isBoundaryResolveType(type)) {
        res.statusCode = 400;
        res.end('Invalid boundary type. Use region, county, or city.');
        return;
      }
      const simplifyPercent = clamp(Number(body?.simplifyPercent ?? 12), 0, 100);
      const clipToLand = typeof body?.clipToLand === 'boolean' ? body.clipToLand : type !== 'region';
      const rawQueries = Array.isArray(body?.queries)
        ? body.queries.map((item: unknown) => String(item ?? '')).join('\n')
        : String(body?.queries ?? body?.queryList ?? '');
      const queries = rawQueries
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (queries.length === 0) {
        res.statusCode = 400;
        res.end('At least one query is required.');
        return;
      }

      const items: Array<Record<string, unknown>> = [];
      for (let index = 0; index < queries.length; index += 1) {
        const query = queries[index];
        const lineEvents: string[] = [];
        try {
          const resolved = await resolveBoundaryForLevel({
            query,
            type,
            relationId: null,
            countryName: String(body?.countryName || '').trim(),
            admin1Name: String(body?.admin1Name || '').trim(),
            countrySlug: String(body?.countrySlug || '').trim(),
            admin1Slug: String(body?.admin1Slug || '').trim(),
          }, { retryEvents: lineEvents });
          const countrySlug = normalizeCountry(String(body?.countrySlug || '').trim() || resolved.countrySlug) || resolved.countrySlug;
          const admin1Slug = normalizeAdmin1(
            String(body?.admin1Slug || '').trim() || resolved.admin1Slug,
            countrySlug
          ) || resolved.admin1Slug;
          const slug = resolved.slug;
          const outputPath = buildBoundarySuggestedPath(type, countrySlug, admin1Slug, slug);
          const preview = resolved.reusedGeojson
            ? await buildBoundaryPreviewFromGeojson({
                geojson: resolved.reusedGeojson,
                simplifyPercent,
                clipToLand,
                retryEvents: lineEvents,
              })
            : await buildBoundaryPreviewGeojson({
                relationId: resolved.relationId,
                simplifyPercent,
                clipToLand,
                overpassOptions: { retryEvents: lineEvents },
              });
          const exported = await saveBoundaryGeojsonFile({
            outputPath,
            geojson: preview.geojson,
            clipToLand,
            adminGeojson: preview.adminGeojson,
            aliasOutputPaths: buildLegacyAliasOutputPaths(type, outputPath),
          });
          items.push({
            success: true,
            query,
            line: index + 1,
            type,
            level: type,
            name: resolved.name,
            relationId: resolved.relationId,
            adminLevel: resolved.adminLevel,
            countrySlug,
            admin1Slug,
            slug,
            sourceLevel: resolved.sourceLevel,
            isSurrogate: resolved.isSurrogate,
            surrogateReason: resolved.surrogateReason,
            outputPath: exported.outputPath,
            outputUrl: exported.outputUrl,
            adminOutputPath: exported.adminOutputPath,
            adminOutputUrl: exported.adminOutputUrl,
            clipToLand,
            toleranceUsed: preview.toleranceUsed,
            vertexCount: preview.vertexCount,
            events: lineEvents,
          });
        } catch (error) {
          items.push({
            success: false,
            query,
            line: index + 1,
            type,
            error: (error as Error).message,
            events: lineEvents,
          });
        }
        if (index < queries.length - 1) {
          const delayMs = 1500 + Math.floor(Math.random() * 1001);
          await sleep(delayMs);
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          total: items.length,
          succeeded: items.filter((item) => item.success).length,
          failed: items.filter((item) => !item.success).length,
          items,
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/geo/boundary-builder/region')) {
      const body = await readJsonBody(req);
      const countrySlug = normalizeCountry(String(body?.countrySlug || '').trim()) || 'us';
      const admin1Slug = normalizeAdmin1(String(body?.admin1Slug || '').trim() || 'ca', countrySlug) || 'ca';
      const regionSlug = slugifyPlace(String(body?.regionSlug || '').trim() || 'region');
      const regionName = String(body?.regionName || '').trim() || regionSlug;
      const items = Array.isArray(body?.items) ? body.items : [];
      if (!items.length) {
        res.statusCode = 400;
        res.end('Region definition requires at least one exported boundary item.');
        return;
      }

      const outputPath = normalizePublicGeoOutput(
        `/geo/country/${countrySlug}/${admin1Slug}/regions/${regionSlug}.json`
      );

      const regionMembers = items
        .map((item: any) => {
          const levelRaw = String(item?.level || item?.type || '').trim().toLowerCase();
          const normalizedLevel = levelRaw === 'state' ? 'region' : levelRaw;
          if (normalizedLevel !== 'city' && normalizedLevel !== 'county' && normalizedLevel !== 'region') return null;
          const level = normalizedLevel as BoundaryBuilderType;
          const slugValue = slugifyPlace(String(item?.slug || item?.name || item?.query || '').trim());
          if (!slugValue) return null;
          const sourceRaw = String(item?.boundarySource || item?.sourceLevel || '').trim().toLowerCase();
          const normalizedSource = sourceRaw === 'state' ? 'region' : sourceRaw;
          const boundarySource =
            normalizedSource === 'city' || normalizedSource === 'county' || normalizedSource === 'region'
              ? (normalizedSource as BoundaryBuilderType)
              : undefined;
          const boundarySlug = slugifyPlace(String(item?.boundarySlug || item?.slug || '').trim()) || slugValue;
          const reasonRaw = String(item?.reason || item?.surrogateReason || '').trim();
          const reason = reasonRaw === 'consolidated-city-county' ? 'consolidated-city-county' : undefined;
          return {
            level,
            type: level,
            query: String(item?.query || '').trim() || undefined,
            slug: slugValue,
            name: String(item?.name || '').trim() || slugValue,
            relationId: relationIdFromUnknown(item?.relationId) ?? undefined,
            outputUrl: String(item?.outputUrl || '').trim() || undefined,
            boundarySource,
            boundarySlug: boundarySource ? boundarySlug : undefined,
            reason: boundarySource ? reason : undefined,
          };
        })
        .filter((member): member is Record<string, unknown> => Boolean(member));

      if (!regionMembers.length) {
        res.statusCode = 400;
        res.end('Region definition requires valid member entries.');
        return;
      }

      const regions = regionMembers.filter((item: any) => item?.level === 'region');
      const regionPayload = {
        id: regionSlug,
        name: regionName,
        countrySlug,
        admin1Slug,
        generatedAt: new Date().toISOString(),
        members: {
          cities: regionMembers.filter((item: any) => item?.level === 'city'),
          counties: regionMembers.filter((item: any) => item?.level === 'county'),
          regions,
          states: regions,
        },
      };

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(regionPayload, null, 2));
      const relative = path.relative(path.join(ROOT_DIR, 'public'), outputPath).replace(/\\/g, '/');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ outputPath, outputUrl: `/${relative}`, region: regionPayload }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/geo/run')) {
      const body = await readJsonBody(req);
      const { mode, listingId, includeRoads, includeDistricts, dryRun, addressOverride } = body;

      if (!mode || !listingId) {
        res.statusCode = 400;
        res.end('Missing mode or listingId.');
        return;
      }

      const listings = loadListingsFromDisk();
      const listing = listings.find((item) => item.id === listingId);
      if (!listing) {
        res.statusCode = 404;
        res.end('Listing not found.');
        return;
      }

      const baseAddress = listingToAddress(listing);
      const override = addressOverride || {};
      const address = {
        country: override.country ?? baseAddress.country,
        region: override.region ?? baseAddress.region,
        city: override.city ?? baseAddress.city,
        postalCode: override.postalCode ?? baseAddress.postalCode,
      };
      const addressLine1 =
        override.addressLine1 ??
        listing.geopoint.address?.addressLine1 ??
        '';
      const locationFallback = listing.location ?? '';

      const lat = Number.isFinite(override.latitude)
        ? override.latitude
        : listing.geopoint?.latitude;
      const lon = Number.isFinite(override.longitude)
        ? override.longitude
        : listing.geopoint?.longitude;

      const hasCity = Boolean(address.city?.trim());
      const hasCountry = Boolean(address.country?.trim());
      const hasPostal = Boolean(address.postalCode?.trim());
      const hasAddressLine = Boolean(addressLine1?.trim());
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
      const locationHasStreet = /\d/.test(locationFallback);

      const addressParts = [
        hasAddressLine ? addressLine1 : locationHasStreet ? locationFallback : '',
        address.city,
        address.region,
        address.postalCode,
        address.country,
      ].filter(Boolean);
      const addressString = addressParts.join(', ');

      const buildCityArgs = () => {
        const args: string[] = [GEO_TOOL, 'city'];
        if (hasAddressLine || locationHasStreet) {
          if (addressString) {
            args.push('--address', addressString);
          }
        } else if (hasCity && hasCountry) {
          args.push('--city', address.city as string, '--country', address.country as string);
          if (address.region) args.push('--state', address.region);
        } else if (hasCity) {
          args.push('--city', address.city as string);
          if (address.region) args.push('--state', address.region);
          if (address.country) args.push('--country', address.country);
        } else if (hasCoords) {
          args.push('--lat', String(lat), '--lon', String(lon));
          if (address.country) args.push('--country', address.country);
        }
        return args;
      };

      const cityArgs = buildCityArgs();
      const args: string[] = [];
      let effectiveMode = mode;

      if (mode === 'zip') {
        if (hasPostal && hasCity) {
          args.push(GEO_TOOL, 'zip', '--postal', address.postalCode as string);
          if (address.city) args.push('--city', address.city);
          if (address.region) args.push('--state', address.region);
          if (address.country) args.push('--country', address.country);
          if (addressString) args.push('--address', addressString);
        } else {
          effectiveMode = 'city';
          args.push(...cityArgs);
        }
      } else if (mode === 'city') {
        args.push(...cityArgs);
      } else {
        res.statusCode = 400;
        res.end('Unsupported mode.');
        return;
      }

      if (!args.length) {
        res.statusCode = 400;
        res.end('No usable location data. Provide city, address, or coordinates.');
        return;
      }

      const filePaths = buildGeoFilePaths(address, path.join(ROOT_DIR, 'public', 'geo'));
      const outputPath = effectiveMode === 'zip' ? filePaths.paths.zip : filePaths.paths.city;
      if (outputPath && !withinGeoRoot(outputPath)) {
        res.statusCode = 400;
        res.end('Unsafe output path resolved. Aborting.');
        return;
      }

      const withFlags = (baseArgs: string[], runMode: 'city' | 'zip') => {
        const finalArgs = [...baseArgs];
        if (includeRoads && runMode === 'city') {
          finalArgs.push('--include-roads');
        }
        if (includeDistricts && runMode === 'city') {
          finalArgs.push('--include-districts');
        }
        if (dryRun) {
          finalArgs.push('--dry-run', '--debug');
        }
        return finalArgs;
      };

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const writeLine = (payload: Record<string, unknown>) => {
        res.write(`${JSON.stringify(payload)}\n`);
      };

      const streamProcess = (procArgs: string[]) =>
        new Promise<number>((resolve) => {
          writeLine({ type: 'log', message: `Running: ${PYTHON_BIN} ${procArgs.join(' ')}\n\n` });
          const proc = spawn(PYTHON_BIN, procArgs, { cwd: ROOT_DIR });
          proc.stdout.on('data', (data) => {
            writeLine({ type: 'log', message: data.toString() });
          });
          proc.stderr.on('data', (data) => {
            writeLine({ type: 'log', message: data.toString() });
          });
          proc.on('error', (error) => {
            writeLine({ type: 'log', message: `\nProcess spawn failed: ${error.message}\n` });
            resolve(1);
          });
          proc.on('close', (code) => {
            resolve(code ?? 0);
          });
        });

      const run = async () => {
        if (mode === 'zip' && effectiveMode === 'city') {
          writeLine({ type: 'log', message: 'ZIP unavailable or missing fields; falling back to city boundary.\n\n' });
        }
        const primaryArgs = withFlags(args, effectiveMode as 'city' | 'zip');
        const primaryCode = await streamProcess(primaryArgs);

        let finalCode = primaryCode;
        if (mode === 'zip' && effectiveMode === 'zip' && primaryCode !== 0) {
          if (!cityArgs.length) {
            writeLine({ type: 'log', message: '\nZIP generation failed and no city fallback is available.\n' });
            finalCode = primaryCode;
          } else {
            writeLine({ type: 'log', message: '\nZIP generation failed; falling back to city boundary.\n\n' });
            const fallbackArgs = withFlags(cityArgs, 'city');
            const fallbackCode = await streamProcess(fallbackArgs);
            finalCode = fallbackCode;
          }
        }

        writeLine({ type: 'exit', success: finalCode === 0, code: finalCode });
        res.end();
      };

      run();
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/geo/normalize-place')) {
      const body = await readJsonBody(req);
      const geocode = await geocodeAddress(body).catch(() => null);
      let relationTags = null;
      if (geocode?.osm_type === 'relation' && geocode?.osm_id) {
        relationTags = await fetchRelationTags(Number(geocode.osm_id)).catch(() => null);
      }

      const normalized = normalizePlace({
        country: body?.country,
        admin1: body?.admin1,
        city: body?.city,
        geocode,
        relationTags,
      });

      const { normalizedCountrySlug, normalizedAdmin1Slug, normalizedCitySlug } = normalized;
      const recommendedPath = normalizedCitySlug
        ? `/geo/country/${normalizedCountrySlug}/${normalizedAdmin1Slug}/${normalizedCitySlug}/boundary-simplified.json`
        : normalizedAdmin1Slug
          ? `/geo/country/${normalizedCountrySlug}/${normalizedAdmin1Slug}/boundary-simplified.json`
          : normalizedCountrySlug
            ? `/geo/country/${normalizedCountrySlug}/boundary-simplified.json`
            : '';

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        normalizedCountrySlug,
        normalizedAdmin1Slug,
        normalizedCitySlug,
        isCityState: normalized.isCityState,
        usedPlaceholderAdmin1: normalized.usedPlaceholderAdmin1,
        normalizationWarnings: normalized.normalizationWarnings,
        recommendedPath,
        geocode,
        relationTags,
      }));
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/admin/geo/batch')) {
      const body = await readJsonBody(req);
      const { includeRoads, includeZip, dryRun, limit } = body || {};

      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const args: string[] = [GEO_TOOL, 'batch', '--listings', LISTINGS_STORE];
      if (includeRoads) args.push('--include-roads');
      if (includeZip) args.push('--include-zip');
      if (typeof limit === 'number' && Number.isFinite(limit)) {
        args.push('--limit', String(limit));
      }
      if (dryRun) args.push('--dry-run');

      const procArgs = [...args];
      res.write(`Running: ${PYTHON_BIN} ${procArgs.join(' ')}\n\n`);

      const proc = spawn(PYTHON_BIN, procArgs, { cwd: ROOT_DIR });
      proc.stdout.on('data', (data) => res.write(data));
      proc.stderr.on('data', (data) => res.write(data));
      proc.on('error', (error) => {
        res.write(`\nProcess spawn failed: ${error.message}\n`);
        res.end();
      });
      proc.on('close', (code) => {
        res.write(`\nProcess exited with code ${code ?? 0}\n`);
        res.end();
      });
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/api/admin/geo/validate')) {
      const listings = loadListingsFromDisk();
      const totals = {
        listings: listings.length,
        zipCandidates: 0,
        missingZip: 0,
        missingCity: 0,
        missingAdmin1: 0,
        missingCountry: 0,
      };

      const missingByCity: Record<string, any> = {};
      const missingByAdmin1: Record<string, any> = {};

      listings.forEach((listing) => {
        const address = listingToAddress(listing);
        const filePaths = buildGeoFilePaths(address, path.join(ROOT_DIR, 'public', 'geo'));
        const urlPaths = buildGeoUrlPaths(address);
        const missing: string[] = [];
        const cityExists = Boolean(filePaths.paths.city && fs.existsSync(filePaths.paths.city));
        const zipExists = Boolean(filePaths.paths.zip && fs.existsSync(filePaths.paths.zip));
        const cityPathForReport = urlPaths.paths.city;
        const zipPathForReport = urlPaths.paths.zip;

        if (!fs.existsSync(filePaths.paths.country)) {
          totals.missingCountry += 1;
          missing.push('country');
        }
        if (filePaths.normalizedAdmin1Slug && filePaths.paths.admin1 && !fs.existsSync(filePaths.paths.admin1)) {
          totals.missingAdmin1 += 1;
          missing.push('admin1');
        }
        if (!cityExists) {
          totals.missingCity += 1;
          missing.push('city');
        }
        if (filePaths.postalCode) {
          totals.zipCandidates += 1;
          if (!zipExists) {
            totals.missingZip += 1;
            missing.push('zip');
          }
        }

        const cityKey = `${filePaths.citySlug}|${filePaths.admin1Slug}|${filePaths.countrySlug}`;
        if (missing.includes('city') || missing.includes('zip')) {
          if (!missingByCity[cityKey]) {
            missingByCity[cityKey] = {
              key: cityKey,
              city: address.city ?? filePaths.citySlug,
              admin1: address.region ?? filePaths.admin1Slug,
              country: address.country ?? filePaths.countrySlug,
              missing: new Set<string>(),
              listings: [],
              paths: {
                city: cityPathForReport,
                zip: zipPathForReport || undefined,
              },
            };
          }
          missingByCity[cityKey].listings.push({
            id: listing.id,
            name: listing.name,
            type: listing.type,
            postalCode: address.postalCode,
          });
          missing.forEach((item) => missingByCity[cityKey].missing.add(item));
        }

        const admin1Key = `${filePaths.admin1Slug}|${filePaths.countrySlug}`;
        if (missing.includes('admin1')) {
          if (!missingByAdmin1[admin1Key]) {
            missingByAdmin1[admin1Key] = {
              key: admin1Key,
              admin1: address.region ?? filePaths.admin1Slug,
              country: address.country ?? filePaths.countrySlug,
              missing: new Set<string>(),
              listings: [],
              paths: { admin1: urlPaths.paths.admin1 },
            };
          }
          missingByAdmin1[admin1Key].listings.push({
            id: listing.id,
            name: listing.name,
            type: listing.type,
            postalCode: address.postalCode,
          });
          missingByAdmin1[admin1Key].missing.add('admin1');
        }
      });

      const report = {
        totals,
        missingByCity: Object.values(missingByCity).map((entry: any) => ({
          ...entry,
          missing: Array.from(entry.missing),
        })),
        missingByAdmin1: Object.values(missingByAdmin1).map((entry: any) => ({
          ...entry,
          missing: Array.from(entry.missing),
        })),
      };

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(report));
      return;
    }
  } catch (error: any) {
    const message = error?.message || 'unknown error';
    const isMediaApi = req.url?.startsWith('/api/media/');
    const apiLabel = isMediaApi
      ? 'Media API'
      : req.url?.startsWith('/api/account/')
        ? 'Account API'
        : 'Geo admin API';
    res.statusCode = isMediaApi && /authentication|session/i.test(message)
      ? 401
      : isMediaApi && /administrator access|admin access/i.test(message)
        ? 403
        : isMediaApi && /invalid|missing|required|not supported|no longer exists/i.test(message)
          ? 400
          : 500;
    res.end(`${apiLabel} error: ${message}`);
    return;
  }

  res.statusCode = 404;
  res.end('Not Found');
};

export default defineConfig(({ mode }) => {
    const modeEnv = loadEnv(mode, '.', '');
    const env = mode === 'cloudflare'
      ? {
          ...modeEnv,
          ...loadEnv('development', '.', 'VITE_SUPABASE_'),
        }
      : modeEnv;
    const buildCloudflarePreview = env.VITE_DEPLOY_FULL_PREVIEW === '1';
    const publicLandingComingSoon =
      env.VITE_SITE_MODE === 'coming-soon' || env.VITE_PUBLIC_LANDING_COMING_SOON === '1';

    // Vite exposes loaded values through import.meta.env in browser code, but our
    // development API middleware runs in Node and reads process.env. Mirror the
    // loaded server-side values here without changing which variables are exposed
    // to the browser (that remains controlled by envPrefix below).
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }

    return {
      envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
      build: buildCloudflarePreview
        ? {
            rollupOptions: {
              input: {
                main: path.resolve(ROOT_DIR, 'index.html'),
                preview: path.resolve(ROOT_DIR, 'preview/index.html'),
              },
            },
          }
        : undefined,
      server: {
        port: 5173,
        host: '0.0.0.0',
        watch: {
          ignored: [
            '**/.codex-temp/**',
            '**/docs/audits/**',
            '**/data/listings.local.json',
            '**/data/building-assets.local.json',
            '**/data/building-verification-evidence.local.json',
            '**/data/building-verification-reviews.local.json',
            '**/data/building-asset-history.local.json',
          ],
        },
      },
      plugins: [
        comingSoonEntryPlugin(publicLandingComingSoon),
        globeShowcaseDataPlugin(),
        react(),
        {
          name: 'local-admin-api',
          configureServer(server) {
            server.middlewares.use(createGeoApiMiddleware());
          },
          configurePreviewServer(server) {
            server.middlewares.use(createGeoApiMiddleware());
          },
        },
      ],
      css: {
        postcss: {
          plugins: [
            tailwindcss(),
            autoprefixer(),
          ],
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        dedupe: ['three'],
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        include: [
          'three',
          'three/addons/loaders/GLTFLoader.js',
          'three/addons/controls/OrbitControls.js',
          'three/addons/postprocessing/EffectComposer.js',
          'three/addons/postprocessing/RenderPass.js',
          'three/addons/postprocessing/UnrealBloomPass.js',
        ],
      }
    };
});






