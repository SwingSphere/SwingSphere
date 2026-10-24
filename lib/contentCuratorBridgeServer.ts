import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createAuthenticatedSupabaseServerClient, requireActiveAdmin, type ActiveAdminIdentity } from './adminServerAuth';
import { isLocalhostRequest } from './admin/releaseServer';

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
      const [core, bridge] = await Promise.all([
        import(pathToFileURL(corePath).href),
        import(`${pathToFileURL(bridgePath).href}?v=${versionKey}`),
      ]);
      return { core, bridge };
    })().catch((err) => {
      cachedModulesPromise = null;
      throw err;
    });
  }
  return cachedModulesPromise;
};

const appendServerPreviewFlag = (snapshot: any): any => {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const decorateUrl = (u: unknown) =>
    typeof u === 'string' && u.startsWith('/api/admin/curator/media-preview?')
      ? `${u}&adminPreview=1`
      : u;

  const mediaItems = Array.isArray(snapshot.mediaItems)
    ? snapshot.mediaItems.map((m: any) => ({
        ...m,
        previewUrls: m.previewUrls
          ? {
              flyer: decorateUrl(m.previewUrls.flyer),
              hero: decorateUrl(m.previewUrls.hero),
              portraitOriginal: decorateUrl(m.previewUrls.portraitOriginal),
              landscapeOriginal: decorateUrl(m.previewUrls.landscapeOriginal),
            }
          : null,
        versionHistory: Array.isArray(m.versionHistory)
          ? m.versionHistory.map((v: any) => ({
              ...v,
              previewUrls: v.previewUrls
                ? {
                    flyer: decorateUrl(v.previewUrls.flyer),
                    hero: decorateUrl(v.previewUrls.hero),
                    portraitOriginal: decorateUrl(v.previewUrls.portraitOriginal),
                    landscapeOriginal: decorateUrl(v.previewUrls.landscapeOriginal),
                  }
                : null,
            }))
          : [],
      }))
    : [];

  const candidates = Array.isArray(snapshot.candidates)
    ? snapshot.candidates.map((c: any) => ({
        ...c,
        stagedMedia: c.stagedMedia
          ? {
              ...c.stagedMedia,
              flyerPreviewUrl: decorateUrl(c.stagedMedia.flyerPreviewUrl),
              heroPreviewUrl: decorateUrl(c.stagedMedia.heroPreviewUrl),
            }
          : null,
      }))
    : [];

  return {
    ...snapshot,
    candidates,
    mediaItems,
  };
};

export const getCuratorBridgeSnapshot = async (req: any) => {
  const admin = await requireCuratorAdmin(req);
  const { core, bridge } = await loadCuratorBridgeModules();
  const db = core.database();
  try {
    const rawSnapshot = bridge.buildCuratorSnapshot(db);
    const snapshot = appendServerPreviewFlag(bridge.sanitizeDeep(rawSnapshot));

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

  const { core, bridge } = await loadCuratorBridgeModules();
  if (!bridge.ALLOWED_COMMANDS.has(commandType)) {
    throw new Error(`Command type "${commandType}" is outside the authorized Content Curator bridge allow-list.`);
  }
  if (!targetId) {
    throw new Error('Command targetId is required.');
  }

  const db = core.database();
  try {
    const execution = await bridge.enqueueAndExecuteCommand(db, {
      idempotencyKey,
      commandType,
      targetId,
      actor: admin.email || admin.userId,
      payload,
      recoverInterrupted: Boolean(body?.recoverInterrupted ?? payload?.recoverInterrupted),
      retryFailed: Boolean(body?.retryFailed ?? payload?.retryFailed),
    });

    const updatedSnapshot = appendServerPreviewFlag(bridge.sanitizeDeep(bridge.buildCuratorSnapshot(db)));
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
      version: versionId,
      role: 'flyer',
    });
    const heroResolved = bridge.resolvePreviewMediaFile(db, {
      mediaId: mediaItem.id,
      version: versionId,
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
