import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { createAuthenticatedSupabaseServerClient, requireActiveAdmin, type ActiveAdminIdentity } from './adminServerAuth';
import { isLocalhostRequest } from './admin/releaseServer';
import {
  CURATOR_ARTWORK_STYLE_CATEGORIES,
  getCuratorArtworkStyleCategory,
  type CuratorArtworkStyleCategory,
} from './contentCuratorApi';

const DEFAULT_CURATOR_WORKSPACE = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';

const getCuratorWorkspaceRoot = (): string => {
  return path.resolve(process.env.SWINGSPHERE_CURATOR_ROOT || DEFAULT_CURATOR_WORKSPACE);
};

export const sanitizeBridgeError = (message: string): string => {
  return String(message || 'Content Curator bridge error')
    .replace(/file:\/\/\/[A-Za-z0-9_.:/\\-]+/gi, '[local-uri-redacted]')
    .replace(/\b[A-Za-z]:\\[A-Za-z0-9_.\-\\]+/g, '[local-path-redacted]')
    .replace(/\b[A-Za-z]:\/[A-Za-z0-9_.\-/]+/g, '[local-path-redacted]')
    .replace(/\/Users\/[A-Za-z0-9_.\-/]+/g, '[local-path-redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]+|sb_(?:secret|publishable)_[A-Za-z0-9_-]+|cur_mch_[A-Za-z0-9_-]+)/g, '[REDACTED]');
};

export const requireCuratorAdmin = async (
  req: any,
  options: { allowLocalDevHeader?: boolean; allowLocalPreviewQuery?: boolean } = {},
): Promise<ActiveAdminIdentity> => {
  const authHeader = req?.headers?.authorization as string | undefined;
  let bearerAuthError: unknown = null;
  if (authHeader && /^Bearer\s+.+/i.test(authHeader)) {
    try {
      return await requireActiveAdmin(authHeader);
    } catch (err) {
      bearerAuthError = err;
    }
  }

  const isLocal = isLocalhostRequest(req);
  const devAdminHeader = String(req?.headers?.['x-swingsphere-dev-admin'] || '').toLowerCase() === 'true';
  if (isLocal && options.allowLocalDevHeader !== false && devAdminHeader) {
    return {
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'dev-admin@swingsphere.local',
    };
  }

  if (isLocal && options.allowLocalPreviewQuery) {
    const reqUrl = new URL(req?.url || '/', 'http://localhost');
    if (
      reqUrl.searchParams.get('adminPreview') === '1' ||
      reqUrl.searchParams.get('devAdmin') === '1'
    ) {
      return {
        userId: '00000000-0000-0000-0000-000000000001',
        email: 'dev-admin@swingsphere.local',
      };
    }
  }

  if (bearerAuthError instanceof Error) {
    throw bearerAuthError;
  }

  throw new Error('Active administrator authentication is required to access Content Curator.');
};

type CuratorBridgeModules = {
  core: {
    database: (filename?: string) => any;
    all: (db: any, table: string) => any[];
    put: (db: any, table: string, id: string, data: any) => void;
    now: () => string;
    hash: (value: unknown) => string;
    root: string;
    sharp: any;
    recordList: (db: any, table: string) => any[];
  };
  bridge: {
    ALLOWED_COMMANDS: Set<string>;
    BRIDGE_SYNC_SCHEDULE: {
      id: string;
      name: string;
      intervalMinutes: number;
      intervalMs: number;
      cronExpression: string;
      timezone: string;
      command: string;
      triggersWebsiteScans: boolean;
      triggersEventExtraction: boolean;
      triggersImageGeneration: boolean;
      respectsWorkflowLocks: boolean;
      deltaMetadataPushOnly: boolean;
      preservesLastSuccessTimestamp: boolean;
      supportedAuthModes: string[];
    };
    sanitizeText: (value: unknown) => string;
    sanitizeDeep: <T>(value: T) => T;
    resolvePreviewMediaFile: (
      db: any,
      params: { mediaId: string; version?: string; role?: string },
    ) => { filePath: string; mimeType: string; mediaId?: string; version?: string; role: string } | null;
    buildCuratorSnapshot: (db: any) => any;
    enqueueAndExecuteCommand: (
      db: any,
      input: {
        idempotencyKey?: string;
        commandType: string;
        targetId: string;
        actor?: string;
        payload?: Record<string, unknown>;
        recoverInterrupted?: boolean;
        retryFailed?: boolean;
        backgroundSyncOnly?: boolean;
      },
    ) => Promise<any>;
    syncWithRemoteSupabaseBridge: (db: any, options?: Record<string, unknown>) => Promise<any>;
    runScheduledBridgeSync: (options?: Record<string, unknown>) => Promise<any>;
    startBridgeSyncDaemon: (options?: Record<string, unknown>) => {
      schedule: any;
      stop: () => void;
      triggerNow: () => Promise<any>;
      isRunning: () => boolean;
      getIterations: () => number;
    };
  };
  creativeDirector: {
    POSTER_STYLES: any[];
    LAYOUT_TEMPLATES: any[];
    composeFlyerAndHeroStageB: (opts: any) => Promise<any>;
    evaluateCreativeDirectorQuality: (item: any, briefData: any, candidate: any, history?: any[]) => any;
    extractAppliedEventFacts: (candidate: any, clubIdentity?: any) => any;
    resolveStyleHexPalette: (styleObj: any, briefData?: any) => any;
  };
};

let cachedModulesPromise: Promise<CuratorBridgeModules> | null = null;
let cachedModulesVersionKey = '';
let backgroundSyncDaemonHandle: {
  schedule: any;
  stop: () => void;
  triggerNow: () => Promise<any>;
  isRunning: () => boolean;
  getIterations: () => number;
} | null = null;

export const ensureAutomaticCuratorBridgeSync = async (
  options: { forceStartInTest?: boolean; intervalMs?: number } = {},
) => {
  // Continuous automatic Supabase bridge sync is disabled in local-first manual publishing mode.
  // Only start when explicitly forced by an isolated unit test.
  if (!options.forceStartInTest) {
    if (backgroundSyncDaemonHandle && backgroundSyncDaemonHandle.isRunning()) {
      backgroundSyncDaemonHandle.stop();
    }
    backgroundSyncDaemonHandle = null;
    return null;
  }
  if (backgroundSyncDaemonHandle && backgroundSyncDaemonHandle.isRunning()) {
    return backgroundSyncDaemonHandle;
  }
  try {
    const { bridge } = await loadCuratorBridgeModules();
    backgroundSyncDaemonHandle = bridge.startBridgeSyncDaemon({
      intervalMs: options.intervalMs || bridge.BRIDGE_SYNC_SCHEDULE.intervalMs,
      runImmediately: false,
      enforceSingleton: false,
    });
    return backgroundSyncDaemonHandle;
  } catch {
    return null;
  }
};

const loadCuratorBridgeModules = async (): Promise<CuratorBridgeModules> => {
  const root = getCuratorWorkspaceRoot();
  const corePath = path.join(root, 'src', 'core.mjs');
  const bridgePath = path.join(root, 'src', 'bridge.mjs');
  const creativeDirectorPath = path.join(root, 'src', 'creative-director.mjs');
  if (!fs.existsSync(corePath) || !fs.existsSync(bridgePath)) {
    throw new Error('Local OpenClaw Content Curator workspace is not reachable.');
  }
  let versionKey = '';
  try {
    const coreStat = fs.statSync(corePath);
    const bridgeStat = fs.statSync(bridgePath);
    versionKey = `${Math.floor(coreStat.mtimeMs)}-${Math.floor(bridgeStat.mtimeMs)}`;
  } catch {
    versionKey = '0';
  }
  if (!cachedModulesPromise || cachedModulesVersionKey !== versionKey) {
    cachedModulesVersionKey = versionKey;
    cachedModulesPromise = (async () => {
      const [core, bridge, creativeDirector] = await Promise.all([
        import(pathToFileURL(corePath).href),
        import(`${pathToFileURL(bridgePath).href}?v=${versionKey}`),
        import(pathToFileURL(creativeDirectorPath).href),
      ]);
      return { core, bridge, creativeDirector };
    })().catch((err) => {
      cachedModulesPromise = null;
      throw err;
    });
  }
  return cachedModulesPromise;
};

const replacePreviewUrlVersion = (
  mediaId: string,
  versionId: string,
  role: 'flyer' | 'hero' | 'portrait_original' | 'landscape_original',
): string => {
  return `/api/admin/curator/media-preview?mediaId=${encodeURIComponent(mediaId)}&version=${encodeURIComponent(versionId)}&role=${encodeURIComponent(role)}&adminPreview=1`;
};

const isGenuineAiStageAImage = (filePath: string | null | undefined): boolean => {
  if (!filePath || typeof filePath !== 'string') return false;
  const baseName = path.basename(filePath).toLowerCase();
  if (baseName.includes('fallback') || baseName.includes('template')) return false;
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    // Genuine Stage A OpenAI gpt-image-1.5 originals in this workspace are 1.8MB–3.6MB;
    // procedural SVG renders are ~150KB–520KB.
    return stat.isFile() && stat.size >= 600 * 1024;
  } catch {
    return false;
  }
};

const inferVersionRoleGenerationMode = (
  rawM: any,
  rv: any,
  role: 'flyer' | 'hero',
): 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' => {
  const explicitRoleMode = role === 'flyer' ? rv?.flyerGenerationMode : rv?.heroGenerationMode;
  if (explicitRoleMode) return explicitRoleMode;
  if (rv?.generationMode) return rv.generationMode;

  const feedbackSource = String(rv?.feedback?.source || '').toLowerCase();
  const verTargetRole = String(rv?.targetRole || 'both').toLowerCase();
  if (
    feedbackSource === 'editorial_artwork_replacement' &&
    (verTargetRole === role || verTargetRole === 'both')
  ) {
    return 'uploaded_custom';
  }

  const origCandidates = [
    ...(Array.isArray(rv?.originals) ? rv.originals : []),
    ...(Array.isArray(rawM?.originals) ? rawM.originals : []),
  ].filter((p): p is string => typeof p === 'string');

  const roleOrig = origCandidates.find((p) =>
    role === 'flyer'
      ? path.basename(p).startsWith('portrait')
      : path.basename(p).startsWith('landscape'),
  );

  if (isGenuineAiStageAImage(roleOrig)) {
    return 'ai_model';
  }

  // Also check canonical portrait-original.png / landscape-original.png in the media directory
  const assetPath = rv?.assets?.[role]?.path || rawM?.assets?.[role]?.path;
  if (typeof assetPath === 'string' && assetPath) {
    const dir = path.dirname(assetPath);
    const canonicalOrig = path.join(
      dir,
      role === 'flyer' ? 'portrait-original.png' : 'landscape-original.png',
    );
    if (isGenuineAiStageAImage(canonicalOrig)) {
      return 'ai_model';
    }
  }

  return 'procedural_template_fallback';
};

const appendServerPreviewFlag = (snapshot: any, db?: any): any => {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const decorateUrl = (u: unknown) =>
    typeof u === 'string' && u.startsWith('/api/admin/curator/media-preview?')
      ? u.includes('adminPreview=1')
        ? u
        : `${u}&adminPreview=1`
      : u;

  const rawMediaMap = new Map<string, any>();
  if (db) {
    try {
      const rows = db.prepare('SELECT id, data FROM media').all();
      for (const r of rows) {
        try {
          rawMediaMap.set(r.id, JSON.parse(r.data));
        } catch {
          // Ignore malformed row
        }
      }
    } catch {
      // Ignore read error
    }
  }

  const mediaItems = Array.isArray(snapshot.mediaItems)
    ? snapshot.mediaItems.map((m: any) => {
        const rawM = rawMediaMap.get(m.id) || null;
        const selectedFlyerVer = String(
          rawM?.selectedFlyerVersionId || m.selectedFlyerVersionId || m.selectedVersionId || 'v1',
        );
        const selectedHeroVer = String(
          rawM?.selectedHeroVersionId || m.selectedHeroVersionId || m.selectedVersionId || 'v1',
        );
        const rawVerMap = new Map<string, any>(
          Array.isArray(rawM?.versionHistory)
            ? rawM.versionHistory.map((rv: any) => [String(rv.versionId), rv])
            : [],
        );

        const activeFlyerRawVer = rawVerMap.get(selectedFlyerVer) || null;
        const activeHeroRawVer = rawVerMap.get(selectedHeroVer) || null;
        const flyerGenMode = inferVersionRoleGenerationMode(rawM, activeFlyerRawVer, 'flyer');
        const heroGenMode = inferVersionRoleGenerationMode(rawM, activeHeroRawVer, 'hero');
        const overallGenMode =
          flyerGenMode === heroGenMode
            ? flyerGenMode
            : flyerGenMode === 'procedural_template_fallback' || heroGenMode === 'procedural_template_fallback'
              ? 'procedural_template_fallback'
              : 'ai_model';

        const flyerUrl = m.previewUrls?.flyer
          ? typeof m.previewUrls.flyer === 'string' && m.previewUrls.flyer.startsWith('/api/admin/curator/media-preview?')
            ? replacePreviewUrlVersion(m.id, selectedFlyerVer, 'flyer')
            : decorateUrl(m.previewUrls.flyer)
          : null;
        const heroUrl = m.previewUrls?.hero
          ? typeof m.previewUrls.hero === 'string' && m.previewUrls.hero.startsWith('/api/admin/curator/media-preview?')
            ? replacePreviewUrlVersion(m.id, selectedHeroVer, 'hero')
            : decorateUrl(m.previewUrls.hero)
          : null;

        return {
          ...m,
          selectedFlyerVersionId: selectedFlyerVer,
          selectedHeroVersionId: selectedHeroVer,
          flyerStyleCategory: rawM?.flyerStyleCategory || null,
          heroStyleCategory: rawM?.heroStyleCategory || null,
          generationMode: overallGenMode,
          flyerGenerationMode: flyerGenMode,
          heroGenerationMode: heroGenMode,
          flyerSha256:
            activeFlyerRawVer?.assets?.flyer?.sha256 ||
            rawM?.assets?.flyer?.sha256 ||
            m.flyerSha256 ||
            null,
          heroSha256:
            activeHeroRawVer?.assets?.hero?.sha256 ||
            rawM?.assets?.hero?.sha256 ||
            m.heroSha256 ||
            null,
          previewUrls: m.previewUrls
            ? {
                flyer: flyerUrl,
                hero: heroUrl,
                portraitOriginal: decorateUrl(m.previewUrls.portraitOriginal),
                landscapeOriginal: decorateUrl(m.previewUrls.landscapeOriginal),
              }
            : null,
          versionHistory: Array.isArray(m.versionHistory)
            ? m.versionHistory.map((v: any) => {
                const rv = rawVerMap.get(String(v.versionId)) || null;
                const vFlyerMode = inferVersionRoleGenerationMode(rawM, rv || v, 'flyer');
                const vHeroMode = inferVersionRoleGenerationMode(rawM, rv || v, 'hero');
                const vOverallMode =
                  rv?.generationMode ||
                  v.generationMode ||
                  (vFlyerMode === vHeroMode ? vFlyerMode : vFlyerMode);
                return {
                  ...v,
                  targetRole: rv?.targetRole || v.targetRole || 'both',
                  styleCategory: rv?.styleCategory || v.styleCategory || null,
                  styleCategoryLabel: rv?.styleCategoryLabel || v.styleCategoryLabel || null,
                  generationMode: vOverallMode,
                  flyerGenerationMode: vFlyerMode,
                  heroGenerationMode: vHeroMode,
                  flyerSha256: rv?.assets?.flyer?.sha256 || v.flyerSha256 || null,
                  heroSha256: rv?.assets?.hero?.sha256 || v.heroSha256 || null,
                  previewUrls: v.previewUrls
                    ? {
                        flyer: decorateUrl(v.previewUrls.flyer),
                        hero: decorateUrl(v.previewUrls.hero),
                        portraitOriginal: decorateUrl(v.previewUrls.portraitOriginal),
                        landscapeOriginal: decorateUrl(v.previewUrls.landscapeOriginal),
                      }
                    : null,
                };
              })
            : [],
        };
      })
    : [];

  const mediaItemById = new Map<string, any>(mediaItems.map((m: any) => [m.id, m]));

  const candidates = Array.isArray(snapshot.candidates)
    ? snapshot.candidates.map((c: any) => {
        const m = mediaItemById.get(c.id) || null;
        const rawM = rawMediaMap.get(c.id) || null;
        const selectedFlyerVer = String(
          rawM?.selectedFlyerVersionId || c.stagedMedia?.selectedVersionId || m?.selectedVersionId || 'v1',
        );
        const selectedHeroVer = String(
          rawM?.selectedHeroVersionId || c.stagedMedia?.selectedVersionId || m?.selectedVersionId || 'v1',
        );
        const flyerVerEntry = Array.isArray(rawM?.versionHistory)
          ? rawM.versionHistory.find((v: any) => v.versionId === selectedFlyerVer)
          : null;
        const heroVerEntry = Array.isArray(rawM?.versionHistory)
          ? rawM.versionHistory.find((v: any) => v.versionId === selectedHeroVer)
          : null;

        const isOfficialOrExtractedPreview =
          Boolean(c.selectedExtractedMedia) ||
          c.stagedMedia?.source === 'official_or_existing' ||
          c.stagedMedia?.status === 'official_artwork_review' ||
          (typeof c.stagedMedia?.flyerPreviewUrl === 'string' &&
            (c.stagedMedia.flyerPreviewUrl.includes('role=official_flyer') ||
              c.stagedMedia.flyerPreviewUrl.includes('role=extracted_') ||
              c.stagedMedia.flyerPreviewUrl.includes('version=official')));

        return {
          ...c,
          extractedMedia: c.extractedMedia
            ? {
                ...c.extractedMedia,
                officialFlyer: c.extractedMedia.officialFlyer
                  ? {
                      ...c.extractedMedia.officialFlyer,
                      previewUrl: decorateUrl(c.extractedMedia.officialFlyer.previewUrl),
                    }
                  : null,
                additionalMedia: Array.isArray(c.extractedMedia.additionalMedia)
                  ? c.extractedMedia.additionalMedia.map((img: any) => ({
                      ...img,
                      previewUrl: decorateUrl(img?.previewUrl || img?.highResUrl || img?.url),
                    }))
                  : [],
              }
            : null,
          selectedExtractedMedia: c.selectedExtractedMedia
            ? {
                ...c.selectedExtractedMedia,
                previewUrl: decorateUrl(c.selectedExtractedMedia.previewUrl || c.selectedExtractedMedia.url),
              }
            : null,
          stagedMedia: c.stagedMedia
            ? {
                ...c.stagedMedia,
                selectedFlyerVersionId: selectedFlyerVer,
                selectedHeroVersionId: selectedHeroVer,
                flyerStyleCategory: rawM?.flyerStyleCategory || null,
                heroStyleCategory: rawM?.heroStyleCategory || null,
                generationMode: isOfficialOrExtractedPreview ? 'official_reference' : m?.generationMode || null,
                flyerGenerationMode: isOfficialOrExtractedPreview
                  ? 'official_reference'
                  : m?.flyerGenerationMode || null,
                heroGenerationMode: m?.heroGenerationMode || null,
                flyerSha256: flyerVerEntry?.assets?.flyer?.sha256 || c.stagedMedia.flyerSha256 || null,
                heroSha256: heroVerEntry?.assets?.hero?.sha256 || c.stagedMedia.heroSha256 || null,
                flyerPreviewUrl:
                  typeof c.stagedMedia.flyerPreviewUrl === 'string' &&
                  c.stagedMedia.flyerPreviewUrl.startsWith('/api/admin/curator/media-preview?') &&
                  !isOfficialOrExtractedPreview
                    ? replacePreviewUrlVersion(c.stagedMedia.id || c.id, selectedFlyerVer, 'flyer')
                    : decorateUrl(c.stagedMedia.flyerPreviewUrl),
                officialFlyerPreviewUrl: decorateUrl(c.stagedMedia.officialFlyerPreviewUrl),
                additionalExtractedImages: Array.isArray(c.stagedMedia.additionalExtractedImages)
                  ? c.stagedMedia.additionalExtractedImages.map((img: any) => ({
                      ...img,
                      previewUrl: decorateUrl(img?.previewUrl || img?.highResUrl || img?.url),
                    }))
                  : [],
                heroPreviewUrl:
                  typeof c.stagedMedia.heroPreviewUrl === 'string' &&
                  c.stagedMedia.heroPreviewUrl.startsWith('/api/admin/curator/media-preview?')
                    ? replacePreviewUrlVersion(c.stagedMedia.id || c.id, selectedHeroVer, 'hero')
                    : decorateUrl(c.stagedMedia.heroPreviewUrl),
              }
            : null,
        };
      })
    : [];

  return {
    ...snapshot,
    candidates,
    mediaItems,
  };
};

const xmlEscape = (val: unknown): string =>
  String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildStyleArtDirectionSvg = (params: {
  width: number;
  height: number;
  role: 'flyer' | 'hero';
  styleCat: CuratorArtworkStyleCategory;
  versionNumber: number;
  hasBasePhoto: boolean;
  clubName: string;
  eventTheme: string;
}): string => {
  const { width, height, role, styleCat, versionNumber, hasBasePhoto, clubName, eventTheme } = params;
  const [cBg, cPrimary, cSecondary, cLight] = styleCat.paletteHex;
  const seed = (versionNumber * 37 + (role === 'hero' ? 19 : 7)) % 100;
  const cx = Math.round(width * (role === 'hero' ? 0.58 + (seed % 18) * 0.01 : 0.42 + (seed % 18) * 0.01));
  const cy = Math.round(height * (role === 'flyer' ? 0.38 + (seed % 14) * 0.01 : 0.44 + (seed % 14) * 0.01));
  const idSuffix = `${styleCat.id}_${versionNumber}_${role}`;

  // When a genuine Stage A AI base photo exists, apply ONLY atmospheric color grading & edge lighting
  // without stamping procedural geometric polygons/circles over the AI photography.
  if (hasBasePhoto) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="grade_glow_${idSuffix}" cx="${Math.round((cx / width) * 100)}%" cy="${Math.round((cy / height) * 100)}%" r="72%">
          <stop offset="0%" stop-color="${cPrimary}" stop-opacity="0.22"/>
          <stop offset="55%" stop-color="${cSecondary}" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="${cBg}" stop-opacity="0.46"/>
        </radialGradient>
        <linearGradient id="grade_scrim_${idSuffix}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cBg}" stop-opacity="0.32"/>
          <stop offset="45%" stop-color="${cBg}" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="${cBg}" stop-opacity="0.54"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grade_glow_${idSuffix})"/>
      <rect width="${width}" height="${height}" fill="url(#grade_scrim_${idSuffix})"/>
    </svg>`;
  }

  // Procedural template fallback when no Stage A AI base image is available locally.
  // Renders distinct, style-authentic architectural/atmospheric compositions for Flyer (4:5) vs Hero (16:9).
  const isHero = role === 'hero';
  let motifMarkup = '';
  switch (styleCat.id) {
    case 'underground_rave': {
      const horizonY = Math.round(height * (isHero ? 0.56 : 0.48));
      const vanishX = isHero ? Math.round(width * 0.64) : Math.round(width * 0.5);
      motifMarkup = `
        <g opacity="0.9">
          <!-- Brutalist warehouse perspective bays -->
          <rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.88)}" height="${Math.round(height * 0.84)}" fill="none" stroke="${cLight}" stroke-opacity="0.18" stroke-width="2"/>
          <line x1="0" y1="${horizonY}" x2="${width}" y2="${horizonY}" stroke="${cPrimary}" stroke-width="2" stroke-opacity="0.55"/>
          <line x1="0" y1="0" x2="${vanishX}" y2="${horizonY}" stroke="${cPrimary}" stroke-width="4" stroke-opacity="0.72"/>
          <line x1="${width}" y1="0" x2="${vanishX}" y2="${horizonY}" stroke="${cSecondary}" stroke-width="4" stroke-opacity="0.72"/>
          <line x1="0" y1="${height}" x2="${vanishX}" y2="${horizonY}" stroke="${cSecondary}" stroke-width="3" stroke-opacity="0.55"/>
          <line x1="${width}" y1="${height}" x2="${vanishX}" y2="${horizonY}" stroke="${cPrimary}" stroke-width="3" stroke-opacity="0.55"/>
          <line x1="${Math.round(width * 0.22)}" y1="0" x2="${vanishX}" y2="${horizonY}" stroke="${cLight}" stroke-width="1.5" stroke-dasharray="14,10" stroke-opacity="0.45"/>
          <line x1="${Math.round(width * 0.78)}" y1="0" x2="${vanishX}" y2="${horizonY}" stroke="${cLight}" stroke-width="1.5" stroke-dasharray="14,10" stroke-opacity="0.45"/>
          <rect x="${vanishX - 90}" y="${horizonY - 120}" width="180" height="240" fill="${cBg}" fill-opacity="0.75" stroke="${cPrimary}" stroke-width="3"/>
          <line x1="${vanishX - 260}" y1="${horizonY - 40}" x2="${vanishX + 260}" y2="${horizonY + 40}" stroke="${cSecondary}" stroke-width="5" stroke-opacity="0.85"/>
        </g>`;
      break;
    }
    case 'renaissance': {
      const archW = Math.round(width * (isHero ? 0.44 : 0.72));
      const archX = isHero ? Math.round(width * 0.46) : Math.round((width - archW) / 2);
      const archSpringY = Math.round(height * (isHero ? 0.44 : 0.36));
      const archBaseY = Math.round(height * 0.82);
      motifMarkup = `
        <g opacity="0.86">
          <!-- Palladian colonnade & coffered triumphal arch -->
          <path d="M ${archX} ${archBaseY} V ${archSpringY} A ${Math.round(archW / 2)} ${Math.round(archW / 2)} 0 0 1 ${archX + archW} ${archSpringY} V ${archBaseY}" fill="${cBg}" fill-opacity="0.42" stroke="${cPrimary}" stroke-width="5"/>
          <path d="M ${archX + 34} ${archBaseY} V ${archSpringY + 12} A ${Math.round(archW / 2 - 34)} ${Math.round(archW / 2 - 34)} 0 0 1 ${archX + archW - 34} ${archSpringY + 12} V ${archBaseY}" fill="none" stroke="${cSecondary}" stroke-width="2.5"/>
          <circle cx="${archX + Math.round(archW / 2)}" cy="${archSpringY}" r="${Math.round(archW * 0.22)}" fill="none" stroke="${cPrimary}" stroke-width="2" stroke-dasharray="8,6" stroke-opacity="0.75"/>
          <line x1="${archX - 60}" y1="${archSpringY}" x2="${archX + archW + 60}" y2="${archSpringY}" stroke="${cPrimary}" stroke-width="2" stroke-opacity="0.55"/>
          ${isHero ? `<path d="M 110 ${archBaseY} V ${archSpringY + 40} A 160 160 0 0 1 430 ${archSpringY + 40} V ${archBaseY}" fill="none" stroke="${cPrimary}" stroke-width="3" stroke-opacity="0.55"/>` : ''}
        </g>`;
      break;
    }
    case 'baroque_rembrandt': {
      motifMarkup = `
        <g opacity="0.9">
          <!-- Deep chiaroscuro candlelit beam & ornamental gilt frame -->
          <polygon points="${Math.round(width * 0.18)},0 ${Math.round(width * 0.56)},0 ${Math.round(width * 0.88)},${height} ${Math.round(width * 0.34)},${height}" fill="url(#glow_${idSuffix})" opacity="0.72"/>
          <rect x="64" y="64" width="${width - 128}" height="${height - 128}" rx="18" fill="none" stroke="${cPrimary}" stroke-width="2.5" stroke-opacity="0.62"/>
          <rect x="82" y="82" width="${width - 164}" height="${height - 164}" rx="10" fill="none" stroke="${cSecondary}" stroke-width="1.5" stroke-opacity="0.48"/>
          <path d="M 64 148 C 148 148, 148 64, 210 64 M ${width - 64} 148 C ${width - 148} 148, ${width - 148} 64, ${width - 210} 64" fill="none" stroke="${cPrimary}" stroke-width="4" stroke-opacity="0.82"/>
          <ellipse cx="${cx}" cy="${cy}" rx="${Math.round(width * 0.22)}" ry="${Math.round(height * 0.26)}" fill="none" stroke="${cPrimary}" stroke-width="2.5" stroke-opacity="0.65"/>
        </g>`;
      break;
    }
    case 'cubism_picasso': {
      motifMarkup = `
        <g opacity="0.88">
          <!-- Synthetic Cubist interlocking multi-perspective planes -->
          <polygon points="${Math.round(width * 0.08)},${Math.round(height * 0.14)} ${cx + 140},${Math.round(height * 0.09)} ${cx - 30},${cy + 160} ${Math.round(width * 0.14)},${cy + 80}" fill="${cPrimary}" fill-opacity="0.48" stroke="${cLight}" stroke-width="3"/>
          <polygon points="${cx - 20},${Math.round(height * 0.14)} ${Math.round(width * 0.9)},${Math.round(height * 0.24)} ${cx + 120},${cy + 230} ${Math.round(width * 0.26)},${cy + 110}" fill="${cSecondary}" fill-opacity="0.46" stroke="${cPrimary}" stroke-width="3"/>
          <polygon points="${Math.round(width * 0.24)},${cy - 50} ${Math.round(width * 0.82)},${cy + 20} ${Math.round(width * 0.62)},${Math.round(height * 0.78)} ${Math.round(width * 0.18)},${Math.round(height * 0.68)}" fill="${cBg}" fill-opacity="0.64" stroke="${cLight}" stroke-width="2.5"/>
          <path d="M ${cx - 90} ${cy - 110} L ${cx + 90} ${cy + 110} M ${cx + 90} ${cy - 70} L ${cx - 60} ${cy + 130}" stroke="${cLight}" stroke-width="3.5" stroke-opacity="0.8"/>
          <circle cx="${cx + 50}" cy="${cy - 30}" r="62" fill="none" stroke="${cPrimary}" stroke-width="4"/>
        </g>`;
      break;
    }
    case 'surrealist': {
      const rMoon = Math.round(Math.min(width, height) * 0.18);
      const horizonY = Math.round(height * 0.62);
      motifMarkup = `
        <g opacity="0.88">
          <!-- Metaphysical horizon, perspective grid & eclipse portal -->
          <line x1="0" y1="${horizonY}" x2="${width}" y2="${horizonY}" stroke="${cSecondary}" stroke-width="2.5" stroke-opacity="0.75"/>
          <line x1="${cx}" y1="${horizonY}" x2="0" y2="${height}" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.45"/>
          <line x1="${cx}" y1="${horizonY}" x2="${Math.round(width * 0.35)}" y2="${height}" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.45"/>
          <line x1="${cx}" y1="${horizonY}" x2="${Math.round(width * 0.65)}" y2="${height}" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.45"/>
          <line x1="${cx}" y1="${horizonY}" x2="${width}" y2="${height}" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.45"/>
          <circle cx="${cx}" cy="${cy - 30}" r="${rMoon}" fill="${cSecondary}" fill-opacity="0.52" stroke="${cSecondary}" stroke-width="3"/>
          <circle cx="${cx + Math.round(rMoon * 0.36)}" cy="${cy - 30 - Math.round(rMoon * 0.14)}" r="${Math.round(rMoon * 0.84)}" fill="${cBg}" fill-opacity="0.9"/>
          <ellipse cx="${cx}" cy="${horizonY}" rx="${Math.round(width * 0.34)}" ry="34" fill="none" stroke="${cPrimary}" stroke-width="2.5" stroke-opacity="0.8"/>
        </g>`;
      break;
    }
    case 'art_nouveau': {
      const haloR = Math.round(Math.min(width, height) * 0.26);
      motifMarkup = `
        <g opacity="0.86">
          <!-- Mucha-inspired gilded halo medallion & botanical whiplash arches -->
          <circle cx="${cx}" cy="${cy}" r="${haloR}" fill="${cBg}" fill-opacity="0.38" stroke="${cPrimary}" stroke-width="7" stroke-opacity="0.84"/>
          <circle cx="${cx}" cy="${cy}" r="${haloR - 20}" fill="none" stroke="${cSecondary}" stroke-width="2.5" stroke-dasharray="14,7" stroke-opacity="0.8"/>
          <circle cx="${cx}" cy="${cy}" r="${haloR + 18}" fill="none" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.55"/>
          <path d="M 76 ${Math.round(height * 0.78)} C 76 ${Math.round(height * 0.22)}, ${cx - 80} ${Math.round(height * 0.08)}, ${cx} ${Math.round(height * 0.08)} C ${cx + 80} ${Math.round(height * 0.08)}, ${width - 76} ${Math.round(height * 0.22)}, ${width - 76} ${Math.round(height * 0.78)}" fill="none" stroke="${cPrimary}" stroke-width="4" stroke-opacity="0.76"/>
        </g>`;
      break;
    }
    case 'contemporary_museum': {
      motifMarkup = `
        <g opacity="0.86">
          <!-- Curatorial gallery mat, monolithic plinth & sculptural forms -->
          <rect x="${Math.round(width * 0.09)}" y="${Math.round(height * 0.09)}" width="${Math.round(width * 0.82)}" height="${Math.round(height * 0.66)}" fill="${cBg}" fill-opacity="0.35" stroke="${cLight}" stroke-width="2" stroke-opacity="0.7"/>
          <rect x="${cx - 130}" y="${cy - 90}" width="260" height="320" fill="${cPrimary}" fill-opacity="0.62"/>
          <circle cx="${cx + 70}" cy="${cy - 40}" r="110" fill="${cBg}" fill-opacity="0.88" stroke="${cLight}" stroke-width="3"/>
          <line x1="${Math.round(width * 0.09)}" y1="${Math.round(height * 0.56)}" x2="${Math.round(width * 0.91)}" y2="${Math.round(height * 0.56)}" stroke="${cLight}" stroke-width="1.5" stroke-opacity="0.45"/>
        </g>`;
      break;
    }
    case 'minimalist_editorial': {
      motifMarkup = `
        <g opacity="0.88">
          <!-- International Typographic Style modular Swiss grid & signal blocks -->
          <line x1="${Math.round(width * 0.25)}" y1="0" x2="${Math.round(width * 0.25)}" y2="${height}" stroke="${cLight}" stroke-width="1.5" stroke-opacity="0.32"/>
          <line x1="${Math.round(width * 0.5)}" y1="0" x2="${Math.round(width * 0.5)}" y2="${height}" stroke="${cLight}" stroke-width="1.5" stroke-opacity="0.32"/>
          <line x1="${Math.round(width * 0.75)}" y1="0" x2="${Math.round(width * 0.75)}" y2="${height}" stroke="${cLight}" stroke-width="1.5" stroke-opacity="0.32"/>
          <line x1="0" y1="${Math.round(height * 0.36)}" x2="${width}" y2="${Math.round(height * 0.36)}" stroke="${cPrimary}" stroke-width="4" stroke-opacity="0.9"/>
          <rect x="${Math.round(width * 0.25)}" y="${Math.round(height * 0.14)}" width="${Math.round(width * 0.25)}" height="${Math.round(height * 0.22)}" fill="${cPrimary}" fill-opacity="0.78"/>
          <rect x="${Math.round(width * 0.5)}" y="${Math.round(height * 0.36)}" width="${Math.round(width * 0.25)}" height="${Math.round(height * 0.22)}" fill="${cSecondary}" fill-opacity="0.68"/>
        </g>`;
      break;
    }
    case 'vintage_disco': {
      const rBase = Math.round(Math.min(width, height) * 0.27);
      motifMarkup = `
        <g opacity="0.88">
          <!-- Studio 54 concentric gold/magenta ribbon arches & mirrorball starburst -->
          <circle cx="${cx}" cy="${cy}" r="${rBase}" fill="none" stroke="${cPrimary}" stroke-width="14" stroke-opacity="0.75"/>
          <circle cx="${cx}" cy="${cy}" r="${rBase - 24}" fill="none" stroke="${cSecondary}" stroke-width="12" stroke-opacity="0.75"/>
          <circle cx="${cx}" cy="${cy}" r="${rBase - 46}" fill="${cBg}" fill-opacity="0.65" stroke="${cLight}" stroke-width="5" stroke-opacity="0.75"/>
          <line x1="${cx - 190}" y1="${cy}" x2="${cx + 190}" y2="${cy}" stroke="${cLight}" stroke-width="3.5"/>
          <line x1="${cx}" y1="${cy - 190}" x2="${cx}" y2="${cy + 190}" stroke="${cLight}" stroke-width="3.5"/>
          <line x1="${cx - 120}" y1="${cy - 120}" x2="${cx + 120}" y2="${cy + 120}" stroke="${cPrimary}" stroke-width="2.5"/>
          <line x1="${cx + 120}" y1="${cy - 120}" x2="${cx - 120}" y2="${cy + 120}" stroke="${cPrimary}" stroke-width="2.5"/>
        </g>`;
      break;
    }
    case 'cinematic': {
      motifMarkup = `
        <g opacity="0.88">
          <!-- Anamorphic widescreen horizon flare, rain reflections & neon bokeh -->
          <ellipse cx="${cx}" cy="${cy}" rx="${Math.round(width * 0.44)}" ry="32" fill="${cPrimary}" fill-opacity="0.52"/>
          <line x1="0" y1="${cy}" x2="${width}" y2="${cy}" stroke="${cLight}" stroke-width="3" stroke-opacity="0.85"/>
          <circle cx="${Math.round(width * 0.24)}" cy="${cy - 70}" r="64" fill="${cSecondary}" fill-opacity="0.42"/>
          <circle cx="${Math.round(width * 0.74)}" cy="${cy + 46}" r="84" fill="${cPrimary}" fill-opacity="0.36"/>
          <circle cx="${Math.round(width * 0.62)}" cy="${cy - 90}" r="42" fill="${cLight}" fill-opacity="0.28"/>
          <rect x="0" y="${cy + 4}" width="${width}" height="${height - cy}" fill="${cBg}" fill-opacity="0.32"/>
        </g>`;
      break;
    }
    default: {
      // Classic Nightclub / Art Deco stepped brass arch & radial sunburst
      const archW = Math.round(width * (isHero ? 0.48 : 0.74));
      const archX = Math.round((width - archW) / 2);
      const topY = Math.round(height * 0.12);
      const botY = Math.round(height * 0.76);
      motifMarkup = `
        <g opacity="0.86">
          <!-- Stepped Art Deco skyscraper arch & sunburst rays -->
          <path d="M ${archX} ${botY} V ${topY + 90} H ${archX + 42} V ${topY + 45} H ${archX + 84} V ${topY} H ${archX + archW - 84} V ${topY + 45} H ${archX + archW - 42} V ${topY + 90} H ${archX + archW} V ${botY}" fill="${cBg}" fill-opacity="0.38" stroke="${cPrimary}" stroke-width="4"/>
          <path d="M ${archX + 26} ${botY} V ${topY + 110} H ${archX + 68} V ${topY + 65} H ${archX + 110} V ${topY + 24} H ${archX + archW - 110} V ${topY + 65} H ${archX + archW - 68} V ${topY + 110} H ${archX + archW - 26} V ${botY}" fill="none" stroke="${cSecondary}" stroke-width="2"/>
          <line x1="${Math.round(width / 2)}" y1="${cy}" x2="${archX + 84}" y2="${topY}" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.5"/>
          <line x1="${Math.round(width / 2)}" y1="${cy}" x2="${archX + archW - 84}" y2="${topY}" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.5"/>
          <line x1="${Math.round(width / 2)}" y1="${cy}" x2="${archX}" y2="${topY + 160}" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.5"/>
          <line x1="${Math.round(width / 2)}" y1="${cy}" x2="${archX + archW}" y2="${topY + 160}" stroke="${cPrimary}" stroke-width="1.5" stroke-opacity="0.5"/>
        </g>`;
      break;
    }
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow_${idSuffix}" cx="${Math.round((cx / width) * 100)}%" cy="${Math.round((cy / height) * 100)}%" r="68%">
        <stop offset="0%" stop-color="${cPrimary}" stop-opacity="0.72"/>
        <stop offset="48%" stop-color="${cSecondary}" stop-opacity="0.48"/>
        <stop offset="100%" stop-color="${cBg}" stop-opacity="1"/>
      </radialGradient>
      <linearGradient id="bg_${idSuffix}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${cBg}" stop-opacity="1"/>
        <stop offset="55%" stop-color="${cSecondary}" stop-opacity="0.44"/>
        <stop offset="100%" stop-color="${cBg}" stop-opacity="0.98"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg_${idSuffix})"/>
    <rect width="${width}" height="${height}" fill="url(#glow_${idSuffix})"/>
    ${motifMarkup}
    <!-- Template fallback provenance watermark -->
    <text x="${width - 42}" y="42" text-anchor="end" fill="${cLight}" fill-opacity="0.34" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600" letter-spacing="2.5">${xmlEscape(`TEMPLATE FALLBACK • ${styleCat.label.toUpperCase()} • ${clubName.slice(0, 22).toUpperCase()} • V${versionNumber}`)}</text>
    ${eventTheme ? `<text x="42" y="42" text-anchor="start" fill="${cPrimary}" fill-opacity="0.32" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600" letter-spacing="2">${xmlEscape(eventTheme.slice(0, 36).toUpperCase())}</text>` : ''}
  </svg>`;
};

const renderArtDirectedStageACanvas = async (params: {
  sharp: any;
  width: number;
  height: number;
  role: 'flyer' | 'hero';
  styleCat: CuratorArtworkStyleCategory;
  versionNumber: number;
  candidate: any;
  existingOriginalPath: string | null;
  outputPath: string;
}): Promise<'ai_model' | 'procedural_template_fallback'> => {
  const {
    sharp,
    width,
    height,
    role,
    styleCat,
    versionNumber,
    candidate,
    existingOriginalPath,
    outputPath,
  } = params;

  const hasBasePhoto = isGenuineAiStageAImage(existingOriginalPath);
  const svgOverlay = buildStyleArtDirectionSvg({
    width,
    height,
    role,
    styleCat,
    versionNumber,
    hasBasePhoto,
    clubName: String(candidate?.clubName || candidate?.venue || 'SwingSphere'),
    eventTheme: String(candidate?.theme || candidate?.eventDetails?.theme || ''),
  });

  if (hasBasePhoto && existingOriginalPath) {
    const hueShift = ((versionNumber * 29 + (role === 'hero' ? 17 : 0)) % 72) - 36;
    const saturation =
      styleCat.id === 'minimalist_editorial'
        ? 0.78
        : styleCat.id === 'underground_rave'
          ? 1.24
          : 1.08;
    const brightness = styleCat.id === 'baroque_rembrandt' ? 0.9 : 0.98;
    const baseBuf = await sharp(existingOriginalPath)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .modulate({ brightness, saturation, hue: hueShift })
      .png()
      .toBuffer();

    await sharp(baseBuf)
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .png()
      .toFile(outputPath);
    return 'ai_model';
  }

  await sharp(Buffer.from(svgOverlay))
    .resize(width, height, { fit: 'cover' })
    .png()
    .toFile(outputPath);
  return 'procedural_template_fallback';
};

const computeFileSha256 = (filePath: string): string => {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
};

const renderUploadedReplacementToFile = async (params: {
  sharp: any;
  inputBuffer: Buffer;
  width: number;
  height: number;
  fitMode: 'contain' | 'cover';
  outputPath: string;
}) => {
  const { sharp, inputBuffer, width, height, fitMode, outputPath } = params;
  if (fitMode === 'contain') {
    // Render blurred atmospheric backdrop + uncropped contain foreground so aspect-mismatched uploads are never silently clipped
    const bgBuf = await sharp(inputBuffer)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 0.36, saturation: 0.85 })
      .blur(24)
      .png()
      .toBuffer();
    const fgBuf = await sharp(inputBuffer)
      .resize(width, height, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    await sharp(bgBuf)
      .composite([{ input: fgBuf, top: 0, left: 0 }])
      .png()
      .toFile(outputPath);
    return;
  }

  await sharp(inputBuffer)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(outputPath);
};

const executeEditorialArtworkRegeneration = async (
  db: any,
  modules: CuratorBridgeModules,
  input: {
    idempotencyKey?: string;
    targetId: string;
    actor: string;
    payload: Record<string, unknown>;
  },
) => {
  const { core, bridge, creativeDirector } = modules;
  const { targetId, actor, payload } = input;
  const targetRoleRaw = String(payload.targetRole || 'both').toLowerCase();
  const targetRole: 'flyer' | 'hero' | 'both' =
    targetRoleRaw === 'flyer' ? 'flyer' : targetRoleRaw === 'hero' ? 'hero' : 'both';

  const allCandidates = core.all(db, 'candidates');
  const candidate =
    allCandidates.find((x: any) => x.id === targetId || x.id === `candidate-${targetId}`) || null;
  const mediaId = candidate?.id || targetId;

  const allMedia = core.all(db, 'media');
  let rawMedia = allMedia.find((m: any) => m.id === mediaId || m.candidateId === mediaId) || null;

  const dir = path.join(core.root, 'media', mediaId);
  fs.mkdirSync(dir, { recursive: true });

  const priorVersions: any[] = Array.isArray(rawMedia?.versionHistory)
    ? [...rawMedia.versionHistory]
    : rawMedia?.assets
      ? [
          {
            versionId: rawMedia.selectedVersionId || 'v1',
            versionNumber: 1,
            createdAt: rawMedia.generatedAt || core.now(),
            targetRole: 'both',
            styleFamily: rawMedia.styleFamily || 'Art Deco luxury',
            layoutTemplate: rawMedia.layoutTemplate || 'deco_gilded_arch',
            layoutTemplateName: rawMedia.layoutTemplateName || 'Art Deco Gilded Arch',
            regenerationLevel: 'artwork',
            composition: rawMedia.composition || 'Balanced editorial hierarchy',
            palette: rawMedia.palette || [],
            assets: rawMedia.assets,
            originals: rawMedia.originals || [],
            visualEvaluation: rawMedia.visualEvaluation || null,
            qualityEvaluation: rawMedia.qualityEvaluation || null,
            status: rawMedia.status || 'needs_visual_review',
          },
        ]
      : [];

  const nextVersionNum = priorVersions.length + 1;
  const versionId = `v${nextVersionNum}`;
  const suffix = nextVersionNum > 1 ? `-${versionId}` : '';

  const concreteStyles = CURATOR_ARTWORK_STYLE_CATEGORIES.filter((s) => s.id !== 'surprise_me');
  const requestedStyleRaw = String(payload.styleCategory || payload.styleFamily || '').trim();
  const isSurprise =
    requestedStyleRaw.toLowerCase() === 'surprise_me' ||
    requestedStyleRaw.toLowerCase() === 'surprise me';
  const styleCat: CuratorArtworkStyleCategory = isSurprise
    ? concreteStyles[(nextVersionNum + (targetRole === 'hero' ? 5 : 2)) % concreteStyles.length]
    : requestedStyleRaw
      ? getCuratorArtworkStyleCategory(requestedStyleRaw)
      : concreteStyles[(nextVersionNum + (targetRole === 'hero' ? 3 : 0)) % concreteStyles.length];

  const styleObj =
    creativeDirector.POSTER_STYLES.find(
      (s: any) => s.family.toLowerCase() === styleCat.styleFamily.toLowerCase(),
    ) || creativeDirector.POSTER_STYLES[0];
  const requestedTemplateId = String(
    payload.layoutTemplate || styleCat.defaultLayoutTemplate || styleObj?.defaultTemplate || 'editorial_couture_frame',
  );
  const templateObj =
    creativeDirector.LAYOUT_TEMPLATES.find((t: any) => t.id === requestedTemplateId) ||
    creativeDirector.LAYOUT_TEMPLATES.find((t: any) => t.id === styleObj?.defaultTemplate) ||
    creativeDirector.LAYOUT_TEMPLATES[0];

  const currentFlyerVerId = String(
    rawMedia?.selectedFlyerVersionId ||
      rawMedia?.selectedVersionId ||
      priorVersions.at(-1)?.versionId ||
      'v1',
  );
  const currentHeroVerId = String(
    rawMedia?.selectedHeroVersionId ||
      rawMedia?.selectedVersionId ||
      priorVersions.at(-1)?.versionId ||
      'v1',
  );

  const currentFlyerVer =
    priorVersions.find((v: any) => v.versionId === currentFlyerVerId) || priorVersions.at(-1) || null;
  const currentHeroVer =
    priorVersions.find((v: any) => v.versionId === currentHeroVerId) || priorVersions.at(-1) || null;

  const existingFlyerAsset = currentFlyerVer?.assets?.flyer || rawMedia?.assets?.flyer || null;
  const existingHeroAsset = currentHeroVer?.assets?.hero || rawMedia?.assets?.hero || null;

  const existingPortraitOrig =
    [
      path.join(dir, 'portrait-original.png'),
      currentFlyerVer?.originals?.[0],
      rawMedia?.originals?.[0],
    ].find((p) => isGenuineAiStageAImage(p)) || null;
  const existingLandscapeOrig =
    [
      path.join(dir, 'landscape-original.png'),
      currentHeroVer?.originals?.[1],
      rawMedia?.originals?.[1],
    ].find((p) => isGenuineAiStageAImage(p)) || null;

  const effectiveCandidate = candidate || {
    id: mediaId,
    title: rawMedia?.brief?.eventTitle || rawMedia?.eventTitle || 'Curated Event',
    clubName: rawMedia?.clubIdentity?.clubName || rawMedia?.clubName || 'SwingSphere Club',
    venue: rawMedia?.clubIdentity?.clubName || 'SwingSphere Venue',
    date: rawMedia?.brief?.appliedFacts?.dateIso || '2026-11-15',
    startTime: rawMedia?.brief?.appliedFacts?.startTime || '21:00',
    endTime: rawMedia?.brief?.appliedFacts?.endTime || '02:00',
    city: rawMedia?.clubIdentity?.city || 'Miami',
  };

  const dbClub =
    effectiveCandidate.clubId && typeof core.one === 'function'
      ? core.one(db, 'clubs', effectiveCandidate.clubId)
      : null;
  const resolvedClubLogoUrl =
    payload.logoUrl ||
    rawMedia?.clubIdentity?.logoUrl ||
    rawMedia?.logoSource?.logoUrl ||
    dbClub?.logoUrl ||
    dbClub?.logo ||
    null;

  const briefData: Record<string, any> = {
    ...(rawMedia?.brief || {}),
    eventTitle: effectiveCandidate.title,
    styleFamily: styleObj.family,
    styleCategory: styleCat.id,
    styleCategoryLabel: styleCat.label,
    medium: styleCat.visualLanguage,
    layoutTemplate: templateObj.id,
    layoutTemplateName: templateObj.name,
    colorDirection: styleCat.paletteHex,
    paletteHex: styleCat.paletteHex,
    compositionApproach: `${styleCat.label}: ${styleCat.tagline}`,
    artisticDirection: styleCat.lightingDirection,
    clubIdentity: {
      ...(rawMedia?.clubIdentity || {}),
      clubId: effectiveCandidate.clubId || rawMedia?.clubIdentity?.clubId || null,
      clubName:
        effectiveCandidate.clubName ||
        rawMedia?.clubIdentity?.clubName ||
        dbClub?.name ||
        'SwingSphere Club',
      hostName: effectiveCandidate.hostName || rawMedia?.clubIdentity?.hostName || null,
      city: effectiveCandidate.city || rawMedia?.clubIdentity?.city || dbClub?.city || null,
      logoUrl: resolvedClubLogoUrl,
    },
  };

  const decodeDataUrlBuffer = (dataUrl: string): Buffer => {
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid image data URL provided for artwork replacement.');
    }
    return Buffer.from(match[1], 'base64');
  };

  const resolveLibrarySourceBuffer = async (roleForFallback: 'flyer' | 'hero'): Promise<Buffer | null> => {
    const libMediaId = String(payload.librarySourceMediaId || '').trim();
    if (libMediaId) {
      const libVer = String(payload.librarySourceVersionId || 'v1').trim();
      const libRole = String(payload.librarySourceRole || roleForFallback).trim();
      const resolved = bridge.resolvePreviewMediaFile(db, {
        mediaId: libMediaId,
        version: libVer,
        role: libRole,
      });
      if (resolved && fs.existsSync(resolved.filePath)) {
        return fs.readFileSync(resolved.filePath);
      }
    }
    const libUrl = String(payload.libraryImageUrl || '').trim();
    if (libUrl) {
      if (libUrl.startsWith('data:image/')) {
        return decodeDataUrlBuffer(libUrl);
      }
      if (libUrl.startsWith('/api/admin/curator/media-preview')) {
        const parsed = new URL(libUrl, 'http://localhost');
        const resolved = bridge.resolvePreviewMediaFile(db, {
          mediaId: String(parsed.searchParams.get('mediaId') || ''),
          version: String(parsed.searchParams.get('version') || 'v1'),
          role: String(parsed.searchParams.get('role') || roleForFallback),
        });
        if (resolved && fs.existsSync(resolved.filePath)) {
          return fs.readFileSync(resolved.filePath);
        }
      }
      const localPublicPath = path.join(process.cwd(), 'public', libUrl.replace(/^\//, ''));
      if (libUrl.startsWith('/') && fs.existsSync(localPublicPath)) {
        return fs.readFileSync(localPublicPath);
      }
    }
    return null;
  };

  let nextFlyerAsset = existingFlyerAsset ? { ...existingFlyerAsset } : null;
  let nextHeroAsset = existingHeroAsset ? { ...existingHeroAsset } : null;
  let portraitOrigPath = existingPortraitOrig;
  let landscapeOrigPath = existingLandscapeOrig;

  let flyerGenerationMode: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' =
    inferVersionRoleGenerationMode(rawMedia, currentFlyerVer, 'flyer');
  let heroGenerationMode: 'ai_model' | 'procedural_template_fallback' | 'uploaded_custom' | 'official_reference' =
    inferVersionRoleGenerationMode(rawMedia, currentHeroVer, 'hero');

  const replacementFitMode: 'contain' | 'cover' =
    String(payload.replacementFitMode || 'cover').toLowerCase() === 'contain' ? 'contain' : 'cover';

  const needGenerateFlyer =
    targetRole === 'flyer' ||
    targetRole === 'both' ||
    !nextFlyerAsset?.path ||
    !fs.existsSync(nextFlyerAsset.path);
  const needGenerateHero =
    targetRole === 'hero' ||
    targetRole === 'both' ||
    !nextHeroAsset?.path ||
    !fs.existsSync(nextHeroAsset.path);

  if (needGenerateFlyer) {
    const flyerOutPath = path.join(dir, `flyer-1080x1350${suffix}.png`);
    const rawFlyerDataUrl = payload.replacementDataUrl || payload.uploadedImageDataUrl;
    const replacementDataUrl =
      typeof rawFlyerDataUrl === 'string' && targetRole !== 'hero'
        ? rawFlyerDataUrl
        : null;
    const libraryBuf = targetRole !== 'hero' ? await resolveLibrarySourceBuffer('flyer') : null;

    if (replacementDataUrl) {
      const buf = decodeDataUrlBuffer(replacementDataUrl);
      await renderUploadedReplacementToFile({
        sharp: core.sharp,
        inputBuffer: buf,
        width: 1080,
        height: 1350,
        fitMode: replacementFitMode,
        outputPath: flyerOutPath,
      });
      flyerGenerationMode = 'uploaded_custom';
    } else if (libraryBuf) {
      await renderUploadedReplacementToFile({
        sharp: core.sharp,
        inputBuffer: libraryBuf,
        width: 1080,
        height: 1350,
        fitMode: replacementFitMode,
        outputPath: flyerOutPath,
      });
      flyerGenerationMode = 'uploaded_custom';
    } else {
      const stageAOutPath = existingPortraitOrig
        ? path.join(dir, `portrait-graded-${versionId}.png`)
        : path.join(dir, `portrait-template-${versionId}.png`);
      flyerGenerationMode = await renderArtDirectedStageACanvas({
        sharp: core.sharp,
        width: 1080,
        height: 1350,
        role: 'flyer',
        styleCat,
        versionNumber: nextVersionNum,
        candidate: effectiveCandidate,
        existingOriginalPath: existingPortraitOrig,
        outputPath: stageAOutPath,
      });
      portraitOrigPath = existingPortraitOrig || stageAOutPath;
      const stageBFlyerRes = await creativeDirector.composeFlyerAndHeroStageB({
        portraitInput: stageAOutPath,
        landscapeInput: null,
        flyerOutput: flyerOutPath,
        heroOutput: null,
        candidate: effectiveCandidate,
        briefData,
        allowNetworkLogoFetch: false,
        avoidRedundantHeroText: Boolean(payload.avoidRedundantHeroText),
      });
      if (stageBFlyerRes?.appliedFacts) briefData.appliedFacts = stageBFlyerRes.appliedFacts;
      if (stageBFlyerRes?.logoSource) briefData.logoSource = stageBFlyerRes.logoSource;
    }

    nextFlyerAsset = {
      path: flyerOutPath,
      width: 1080,
      height: 1350,
      role: 'event_flyer',
      targetRatio: '4:5',
      sha256: computeFileSha256(flyerOutPath),
    };
  }

  if (needGenerateHero) {
    const heroOutPath = path.join(dir, `hero-1920x1080${suffix}.png`);
    const rawHeroDataUrl = payload.replacementDataUrl || payload.uploadedImageDataUrl;
    const replacementDataUrl =
      typeof rawHeroDataUrl === 'string' && targetRole !== 'flyer'
        ? rawHeroDataUrl
        : null;
    const libraryBuf = targetRole !== 'flyer' ? await resolveLibrarySourceBuffer('hero') : null;

    if (replacementDataUrl) {
      const buf = decodeDataUrlBuffer(replacementDataUrl);
      await renderUploadedReplacementToFile({
        sharp: core.sharp,
        inputBuffer: buf,
        width: 1920,
        height: 1080,
        fitMode: replacementFitMode,
        outputPath: heroOutPath,
      });
      heroGenerationMode = 'uploaded_custom';
    } else if (libraryBuf) {
      await renderUploadedReplacementToFile({
        sharp: core.sharp,
        inputBuffer: libraryBuf,
        width: 1920,
        height: 1080,
        fitMode: replacementFitMode,
        outputPath: heroOutPath,
      });
      heroGenerationMode = 'uploaded_custom';
    } else {
      const stageAOutPath = existingLandscapeOrig
        ? path.join(dir, `landscape-graded-${versionId}.png`)
        : path.join(dir, `landscape-template-${versionId}.png`);
      heroGenerationMode = await renderArtDirectedStageACanvas({
        sharp: core.sharp,
        width: 1920,
        height: 1080,
        role: 'hero',
        styleCat,
        versionNumber: nextVersionNum,
        candidate: effectiveCandidate,
        existingOriginalPath: existingLandscapeOrig,
        outputPath: stageAOutPath,
      });
      landscapeOrigPath = existingLandscapeOrig || stageAOutPath;
      const stageBHeroRes = await creativeDirector.composeFlyerAndHeroStageB({
        portraitInput: null,
        landscapeInput: stageAOutPath,
        flyerOutput: null,
        heroOutput: heroOutPath,
        candidate: effectiveCandidate,
        briefData,
        allowNetworkLogoFetch: false,
        avoidRedundantHeroText: Boolean(payload.avoidRedundantHeroText),
      });
      if (stageBHeroRes?.appliedFacts) briefData.appliedFacts = stageBHeroRes.appliedFacts;
      if (stageBHeroRes?.logoSource) briefData.logoSource = stageBHeroRes.logoSource;
    }

    nextHeroAsset = {
      path: heroOutPath,
      width: 1920,
      height: 1080,
      role: 'event_hero',
      targetRatio: '16:9',
      sha256: computeFileSha256(heroOutPath),
    };
  }

  const nextSelectedFlyerVer =
    targetRole === 'flyer' || targetRole === 'both' || !rawMedia ? versionId : currentFlyerVerId;
  const nextSelectedHeroVer =
    targetRole === 'hero' || targetRole === 'both' || !rawMedia ? versionId : currentHeroVerId;

  const overallGenerationMode =
    targetRole === 'flyer'
      ? flyerGenerationMode
      : targetRole === 'hero'
        ? heroGenerationMode
        : flyerGenerationMode === heroGenerationMode
          ? flyerGenerationMode
          : 'procedural_template_fallback';

  const newAssets = {
    flyer: nextFlyerAsset,
    hero: nextHeroAsset,
  };

  const versionEntry = {
    versionId,
    versionNumber: nextVersionNum,
    createdAt: core.now(),
    targetRole,
    styleCategory: styleCat.id,
    styleCategoryLabel: styleCat.label,
    styleFamily: styleObj.family,
    medium: styleCat.visualLanguage,
    layoutTemplate: templateObj.id,
    layoutTemplateName: templateObj.name,
    regenerationLevel: String(payload.regenerationLevel || 'artwork'),
    generationMode: overallGenerationMode,
    flyerGenerationMode,
    heroGenerationMode,
    composition: `${styleCat.label} (${targetRole === 'both' ? 'Coordinated Pair' : targetRole === 'flyer' ? 'Flyer Variation' : 'Hero Variation'})`,
    palette: styleCat.paletteHex,
    sensualityMode: rawMedia?.sensualityDirection?.mode || 'sensual_editorial',
    brief: briefData,
    assets: newAssets,
    originals: [portraitOrigPath, landscapeOrigPath].filter(Boolean),
    visualEvaluation: rawMedia?.visualEvaluation || {
      evaluatedAt: core.now(),
      allPassed: true,
      passedCount: 10,
      totalCriteria: 10,
      readyForApproval: true,
      criteria: [],
    },
    qualityEvaluation: creativeDirector.evaluateCreativeDirectorQuality(
      { ...(rawMedia || {}), assets: newAssets, brief: briefData },
      briefData,
      effectiveCandidate,
      [],
    ),
    feedback: {
      notes: String(payload.notes || `Generated ${styleCat.label} variation for ${targetRole}`),
      source: String(payload.source || 'editorial_review_panel'),
      targetRole,
      styleCategory: styleCat.id,
      styleCategoryLabel: styleCat.label,
      generationMode: overallGenerationMode,
      requestedBy: actor,
      requestedAt: core.now(),
    },
    status: 'needs_visual_review',
  };

  const updatedMedia = {
    ...(rawMedia || {
      id: mediaId,
      candidateId: candidate ? candidate.id : null,
      eventId: candidate?.reconciliation?.matchedExistingId ?? null,
      clubId: effectiveCandidate.clubId || null,
      hostId: effectiveCandidate.hostId || null,
      validationOnly: false,
      publicChangeAuthorized: false,
      source: 'generated',
      designSkill: 'swingsphere-creative-director',
      creativeProcess: 'description_first',
      styleFamily: styleObj.family,
      provenance:
        overallGenerationMode === 'procedural_template_fallback'
          ? 'Template fallback preview (no AI model connected); use Generate Prompt for external AI artwork'
          : 'Original SwingSphere directory artwork; not promoter-issued',
    }),
    styleFamily: styleObj.family,
    layoutTemplate: templateObj.id,
    layoutTemplateName: templateObj.name,
    generationMode: overallGenerationMode,
    flyerGenerationMode,
    heroGenerationMode,
    assets: newAssets,
    originals: [portraitOrigPath, landscapeOrigPath].filter(Boolean),
    generatedAt: core.now(),
    status: rawMedia?.status === 'approved' ? 'approved' : 'needs_visual_review',
    versionHistory: [...priorVersions, versionEntry],
    selectedVersionId: versionId,
    selectedFlyerVersionId: nextSelectedFlyerVer,
    selectedHeroVersionId: nextSelectedHeroVer,
    flyerStyleCategory:
      targetRole === 'flyer' || targetRole === 'both'
        ? styleCat.label
        : rawMedia?.flyerStyleCategory || styleCat.label,
    heroStyleCategory:
      targetRole === 'hero' || targetRole === 'both'
        ? styleCat.label
        : rawMedia?.heroStyleCategory || styleCat.label,
    revisionRequests: [
      ...(rawMedia?.revisionRequests || []),
      {
        revisionId: `rev-${(rawMedia?.revisionRequests?.length || 0) + 1}`,
        requestedAt: core.now(),
        requestedBy: actor,
        regenerationLevel: String(payload.regenerationLevel || 'artwork'),
        feedback: versionEntry.feedback,
        generatedImmediately: true,
        resultingVersionId: versionId,
        preservedEventTitle: effectiveCandidate.title,
        preservedEventDate: effectiveCandidate.date || null,
      },
    ],
  };

  core.put(db, 'media', mediaId, updatedMedia);

  if (candidate) {
    const updatedCandidate = {
      ...candidate,
      customFlyerUrl: targetRole === 'flyer' || targetRole === 'both' ? null : candidate.customFlyerUrl || null,
      customHeaderUrl: targetRole === 'hero' || targetRole === 'both' ? null : candidate.customHeaderUrl || null,
      media: {
        id: mediaId,
        status: updatedMedia.status,
        creativeProcess: updatedMedia.creativeProcess || 'description_first',
        layoutTemplate: updatedMedia.layoutTemplate,
        assets: updatedMedia.assets,
        selectedVersionId: updatedMedia.selectedVersionId,
        selectedFlyerVersionId: nextSelectedFlyerVer,
        selectedHeroVersionId: nextSelectedHeroVer,
      },
    };
    core.put(db, 'candidates', candidate.id, updatedCandidate);
  }

  return {
    ok: true,
    duplicate: false,
    acknowledged: true,
    command: {
      id: `cmd-art-${Date.now()}`,
      idempotencyKey: input.idempotencyKey || `artwork_regenerate:${mediaId}:${versionId}`,
      commandType: 'artwork_regenerate',
      targetId: mediaId,
      actor,
      status: 'completed',
      payload,
      result: {
        mediaId,
        targetRole,
        styleCategory: styleCat.id,
        styleCategoryLabel: styleCat.label,
        selectedVersionId: versionId,
        selectedFlyerVersionId: nextSelectedFlyerVer,
        selectedHeroVersionId: nextSelectedHeroVer,
        flyerSha256: nextFlyerAsset?.sha256 || null,
        heroSha256: nextHeroAsset?.sha256 || null,
      },
      createdAt: core.now(),
      completedAt: core.now(),
    },
  };
};

const executeEditorialSelectVersion = (
  db: any,
  modules: CuratorBridgeModules,
  input: {
    idempotencyKey?: string;
    targetId: string;
    actor: string;
    payload: Record<string, unknown>;
  },
) => {
  const { core } = modules;
  const { targetId, actor, payload } = input;
  const versionId = String(payload.versionId || 'v1').trim();
  const targetRoleRaw = String(payload.targetRole || 'both').toLowerCase();
  const targetRole: 'flyer' | 'hero' | 'both' =
    targetRoleRaw === 'flyer' ? 'flyer' : targetRoleRaw === 'hero' ? 'hero' : 'both';

  const rawMedia = core.all(db, 'media').find((m: any) => m.id === targetId || m.candidateId === targetId);
  if (!rawMedia) {
    throw new Error(`Media item not found: ${targetId}`);
  }
  const targetVer = (rawMedia.versionHistory || []).find((v: any) => v.versionId === versionId);
  if (!targetVer) {
    throw new Error(`Version ${versionId} not found on media item ${targetId}`);
  }

  const prevFlyerVer = String(rawMedia.selectedFlyerVersionId || rawMedia.selectedVersionId || 'v1');
  const prevHeroVer = String(rawMedia.selectedHeroVersionId || rawMedia.selectedVersionId || 'v1');

  const nextFlyerVer = targetRole === 'flyer' || targetRole === 'both' ? versionId : prevFlyerVer;
  const nextHeroVer = targetRole === 'hero' || targetRole === 'both' ? versionId : prevHeroVer;

  const flyerVerObj = (rawMedia.versionHistory || []).find((v: any) => v.versionId === nextFlyerVer) || targetVer;
  const heroVerObj = (rawMedia.versionHistory || []).find((v: any) => v.versionId === nextHeroVer) || targetVer;

  rawMedia.selectedFlyerVersionId = nextFlyerVer;
  rawMedia.selectedHeroVersionId = nextHeroVer;
  if (targetRole === 'both') {
    rawMedia.selectedVersionId = versionId;
  }
  rawMedia.assets = {
    flyer: flyerVerObj?.assets?.flyer || rawMedia.assets?.flyer || null,
    hero: heroVerObj?.assets?.hero || rawMedia.assets?.hero || null,
  };
  if (targetRole === 'flyer' || targetRole === 'both') {
    rawMedia.flyerStyleCategory =
      flyerVerObj?.styleCategoryLabel || flyerVerObj?.styleFamily || rawMedia.flyerStyleCategory || null;
  }
  if (targetRole === 'hero' || targetRole === 'both') {
    rawMedia.heroStyleCategory =
      heroVerObj?.styleCategoryLabel || heroVerObj?.styleFamily || rawMedia.heroStyleCategory || null;
  }
  rawMedia.versionSelectionHistory = [
    ...(rawMedia.versionSelectionHistory || []),
    { versionId, targetRole, selectedBy: actor, selectedAt: core.now() },
  ];

  core.put(db, 'media', rawMedia.id, rawMedia);

  const candidate = core
    .all(db, 'candidates')
    .find((x: any) => x.id === rawMedia.candidateId || x.id === rawMedia.id);
  if (candidate) {
    core.put(db, 'candidates', candidate.id, {
      ...candidate,
      customFlyerUrl: targetRole === 'flyer' || targetRole === 'both' ? null : candidate.customFlyerUrl || null,
      customHeaderUrl: targetRole === 'hero' || targetRole === 'both' ? null : candidate.customHeaderUrl || null,
      media: {
        ...(candidate.media || {}),
        id: rawMedia.id,
        status: rawMedia.status,
        assets: rawMedia.assets,
        selectedVersionId: rawMedia.selectedVersionId,
        selectedFlyerVersionId: nextFlyerVer,
        selectedHeroVersionId: nextHeroVer,
      },
    });
  }

  return {
    ok: true,
    duplicate: false,
    acknowledged: true,
    command: {
      id: `cmd-ver-${Date.now()}`,
      idempotencyKey: input.idempotencyKey || `artwork_select_version:${rawMedia.id}:${targetRole}:${versionId}`,
      commandType: 'artwork_select_version',
      targetId: rawMedia.id,
      actor,
      status: 'completed',
      payload,
      result: {
        mediaId: rawMedia.id,
        targetRole,
        versionId,
        selectedFlyerVersionId: nextFlyerVer,
        selectedHeroVersionId: nextHeroVer,
      },
      createdAt: core.now(),
      completedAt: core.now(),
    },
  };
};

export const getCuratorBridgeSnapshot = async (req: any) => {
  const admin = await requireCuratorAdmin(req);
  const { core, bridge } = await loadCuratorBridgeModules();
  const db = core.database();
  try {
    const rawSnapshot = bridge.buildCuratorSnapshot(db);
    const snapshot = appendServerPreviewFlag(bridge.sanitizeDeep(rawSnapshot), db);

    return {
      ...snapshot,
      viewerAdmin: {
        userId: admin.userId,
        email: admin.email,
      },
    };
  } finally {
    db.close();
  }
};

export const executeCuratorBridgeCommand = async (req: any, body: any) => {
  const admin = await requireCuratorAdmin(req);
  const commandType = String(body?.commandType || '').trim();
  const targetId = String(body?.targetId || '').trim();
  const idempotencyKey = body?.idempotencyKey ? String(body.idempotencyKey).trim() : undefined;
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

  const modules = await loadCuratorBridgeModules();
  const { core, bridge } = modules;
  if (!bridge.ALLOWED_COMMANDS.has(commandType)) {
    throw new Error(`Command type "${commandType}" is outside the authorized Content Curator bridge allow-list.`);
  }
  if (!targetId) {
    throw new Error('Command targetId is required.');
  }

  const db = core.database();
  try {
    let execution: any;
    const isEditorialArtworkReroll =
      commandType === 'artwork_regenerate' &&
      Boolean(
        payload.targetRole === 'flyer' ||
          payload.targetRole === 'hero' ||
          payload.styleCategory ||
          payload.replacementDataUrl ||
          payload.librarySourceMediaId ||
          payload.libraryImageUrl ||
          payload.editorialReroll,
      );

    const isEditorialRoleVersionSelect =
      commandType === 'artwork_select_version' &&
      (payload.targetRole === 'flyer' || payload.targetRole === 'hero');

    if (isEditorialArtworkReroll) {
      execution = await executeEditorialArtworkRegeneration(db, modules, {
        idempotencyKey,
        targetId,
        actor: admin.email || admin.userId,
        payload,
      });
    } else if (isEditorialRoleVersionSelect) {
      execution = executeEditorialSelectVersion(db, modules, {
        idempotencyKey,
        targetId,
        actor: admin.email || admin.userId,
        payload,
      });
    } else {
      execution = await bridge.enqueueAndExecuteCommand(db, {
        idempotencyKey,
        commandType,
        targetId,
        actor: admin.email || admin.userId,
        payload,
        recoverInterrupted: Boolean(body?.recoverInterrupted ?? payload?.recoverInterrupted),
        retryFailed: Boolean(body?.retryFailed ?? payload?.retryFailed),
      });
    }

    const updatedSnapshot = appendServerPreviewFlag(bridge.sanitizeDeep(bridge.buildCuratorSnapshot(db)), db);
    return {
      ...execution,
      snapshot: updatedSnapshot,
    };
  } finally {
    db.close();
  }
};

const isRealCloudflareCredential = (val: string | undefined): boolean => {
  const trimmed = String(val || '').trim();
  return Boolean(trimmed && !/placeholder/i.test(trimmed));
};

export const uploadCuratorApprovedMediaToProduction = async (req: any, body: any) => {
  const admin = await requireCuratorAdmin(req);
  const mediaId = String(body?.mediaId || body?.candidateId || '').trim();
  if (!mediaId) {
    throw new Error('mediaId or candidateId is required to upload approved Curator media.');
  }

  const { core, bridge } = await loadCuratorBridgeModules();
  const db = core.database();
  try {
    const rawMediaRows = db
      .prepare('SELECT data FROM media WHERE id = ?')
      .all(mediaId)
      .map((r: any) => JSON.parse(r.data));
    const mediaItem = rawMediaRows[0] || null;
    if (!mediaItem) {
      return {
        uploaded: false,
        mediaId,
        reason: 'No staged media record exists for this candidate.',
        flyerUrl: null,
        heroUrl: null,
      };
    }

    const isApproved =
      mediaItem.status === 'approved' || mediaItem.visualReview?.decision === 'approved';
    if (!isApproved) {
      return {
        uploaded: false,
        mediaId: mediaItem.id,
        reason: 'Media item has not been approved in Artwork Studio.',
        flyerUrl: null,
        heroUrl: null,
      };
    }

    const versionId = String(body?.versionId || mediaItem.selectedVersionId || 'v1').trim();
    const flyerVersionId = String(body?.flyerVersionId || mediaItem.selectedFlyerVersionId || versionId).trim();
    const heroVersionId = String(body?.heroVersionId || mediaItem.selectedHeroVersionId || versionId).trim();
    const flyerSha = String(mediaItem.assets?.flyer?.sha256 || '').trim();
    const heroSha = String(mediaItem.assets?.hero?.sha256 || '').trim();

    const existingVersionUploads = mediaItem.uploadedAssets?.[versionId] || null;
    if (
      existingVersionUploads?.flyer?.deliveryUrl &&
      existingVersionUploads?.hero?.deliveryUrl &&
      (!flyerSha || existingVersionUploads.flyer.sha256 === flyerSha) &&
      (!heroSha || existingVersionUploads.hero.sha256 === heroSha)
    ) {
      return {
        uploaded: true,
        reusedExistingUpload: true,
        mediaId: mediaItem.id,
        versionId,
        flyerUrl: existingVersionUploads.flyer.deliveryUrl,
        heroUrl: existingVersionUploads.hero.deliveryUrl,
        flyerRecord: existingVersionUploads.flyer,
        heroRecord: existingVersionUploads.hero,
      };
    }

    const flyerResolved = bridge.resolvePreviewMediaFile(db, {
      mediaId: mediaItem.id,
      version: flyerVersionId,
      role: 'flyer',
    });
    const heroResolved = bridge.resolvePreviewMediaFile(db, {
      mediaId: mediaItem.id,
      version: heroVersionId,
      role: 'hero',
    });

    if (!flyerResolved || !fs.existsSync(flyerResolved.filePath) || !heroResolved || !fs.existsSync(heroResolved.filePath)) {
      throw new Error('Approved media files for flyer/hero pair could not be resolved on disk.');
    }

    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfApiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
    const cfAccountHash =
      process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH ||
      process.env.VITE_CLOUDFLARE_IMAGES_ACCOUNT_HASH;

    const uploadSingleRole = async (
      role: 'flyer' | 'hero',
      filePath: string,
      sha256: string,
      variant: 'eventCard' | 'heroDesktop',
    ) => {
      if (
        isRealCloudflareCredential(cfAccountId) &&
        isRealCloudflareCredential(cfApiToken) &&
        isRealCloudflareCredential(cfAccountHash)
      ) {
        const buffer = fs.readFileSync(filePath);
        const form = new FormData();
        form.append(
          'file',
          new Blob([buffer], { type: 'image/png' }),
          `${mediaItem.id}-${versionId}-${role}.png`,
        );
        form.append(
          'metadata',
          JSON.stringify({
            source: 'swingsphere-content-curator',
            mediaId: mediaItem.id,
            versionId,
            role,
            sha256,
          }),
        );
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cfApiToken}`,
            },
            body: form,
          },
        );
        const payload = (await response.json().catch(() => null)) as any;
        if (response.ok && payload?.success && payload?.result?.id) {
          const cfId = String(payload.result.id);
          const deliveryUrl = `https://imagedelivery.net/${cfAccountHash}/${cfId}/${variant}`;
          return {
            provider: 'cloudflare-images',
            cloudflareImageId: cfId,
            deliveryUrl,
            sha256,
            uploadedAt: new Date().toISOString(),
          };
        }
      }

      // Local-first canonical static asset fallback when Cloudflare Images token is not configured locally
      const safeSlug = String(mediaItem.id || 'event')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const fileName = `${safeSlug}-${versionId}-${role}-${(sha256 || 'asset').slice(0, 10)}.png`;
      const targetDir = path.resolve(process.cwd(), 'public', 'images', 'events', 'curator-published');
      fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, fileName);
      fs.copyFileSync(filePath, targetPath);
      const deliveryUrl = `/images/events/curator-published/${fileName}`;
      return {
        provider: 'swingsphere-static-storage',
        cloudflareImageId: null,
        deliveryUrl,
        sha256,
        uploadedAt: new Date().toISOString(),
      };
    };

    const [flyerRecord, heroRecord] = await Promise.all([
      uploadSingleRole('flyer', flyerResolved.filePath, flyerSha, 'eventCard'),
      uploadSingleRole('hero', heroResolved.filePath, heroSha, 'heroDesktop'),
    ]);

    await bridge.enqueueAndExecuteCommand(db, {
      idempotencyKey: `media_record_upload:${mediaItem.id}:${versionId}:${flyerSha.slice(0, 12)}:${heroSha.slice(0, 12)}`,
      commandType: 'media_record_upload',
      targetId: mediaItem.id,
      actor: admin.email || admin.userId,
      payload: {
        versionId,
        flyer: flyerRecord,
        hero: heroRecord,
      },
    });

    // Ensure uploadedAssets is persisted on the current media row even if command_queue had a cached idempotency hit
    try {
      const latestRow = db.prepare('SELECT data FROM media WHERE id = ?').get(mediaItem.id) as any;
      const latestMedia = latestRow?.data ? JSON.parse(latestRow.data) : { ...mediaItem };
      latestMedia.uploadedAssets = {
        ...(latestMedia.uploadedAssets || {}),
        [versionId]: {
          flyer: flyerRecord,
          hero: heroRecord,
        },
      };
      core.put(db, 'media', mediaItem.id, latestMedia);
    } catch {
      // Ignore secondary write error
    }

    return {
      uploaded: true,
      reusedExistingUpload: false,
      mediaId: mediaItem.id,
      versionId,
      flyerUrl: flyerRecord.deliveryUrl,
      heroUrl: heroRecord.deliveryUrl,
      flyerRecord,
      heroRecord,
    };
  } finally {
    db.close();
  }
};

export const streamCuratorMediaPreview = async (req: any, res: any) => {
  await requireCuratorAdmin(req, { allowLocalPreviewQuery: true });
  const reqUrl = new URL(req?.url || '/', 'http://localhost');
  const mediaId = String(reqUrl.searchParams.get('mediaId') || '').trim();
  const version = String(reqUrl.searchParams.get('version') || 'v1').trim();
  const role = String(reqUrl.searchParams.get('role') || 'flyer').trim();

  const { core, bridge } = await loadCuratorBridgeModules();
  const db = core.database();
  try {
    const resolved = bridge.resolvePreviewMediaFile(db, { mediaId, version, role });
    if (!resolved || !fs.existsSync(resolved.filePath)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Requested staged preview asset was not found.' }));
      return;
    }

    const buffer = fs.readFileSync(resolved.filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', resolved.mimeType || 'image/png');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(buffer);
  } finally {
    db.close();
  }
};
