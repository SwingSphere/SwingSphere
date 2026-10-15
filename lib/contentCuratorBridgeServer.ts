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
  if (authHeader && /^Bearer\s+.+/i.test(authHeader)) {
    return requireActiveAdmin(authHeader);
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
    if (reqUrl.searchParams.get('adminPreview') === '1') {
      return {
        userId: '00000000-0000-0000-0000-000000000001',
        email: 'dev-admin@swingsphere.local',
      };
    }
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
  const isTestProcess =
    Boolean(process.env.NODE_TEST_CONTEXT) ||
    process.execArgv.includes('--test') ||
    process.argv.includes('--test');
  if (isTestProcess && !options.forceStartInTest) {
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
    });
    return backgroundSyncDaemonHandle;
  } catch {
    return null;
  }
};

const loadCuratorBridgeModules = async (): Promise<CuratorBridgeModules> => {
  if (!cachedModulesPromise) {
    cachedModulesPromise = (async () => {
      const root = getCuratorWorkspaceRoot();
      const corePath = path.join(root, 'src', 'core.mjs');
      const bridgePath = path.join(root, 'src', 'bridge.mjs');
      if (!fs.existsSync(corePath) || !fs.existsSync(bridgePath)) {
        throw new Error('Local OpenClaw Content Curator workspace is not reachable.');
      }
      const [core, bridge] = await Promise.all([
        import(pathToFileURL(corePath).href),
        import(pathToFileURL(bridgePath).href),
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
  await ensureAutomaticCuratorBridgeSync();
  const { core, bridge } = await loadCuratorBridgeModules();
  const db = core.database();
  try {
    const reqUrl = new URL(req?.url || '/', 'http://localhost');
    if (reqUrl.searchParams.get('mirrorSupabase') === '1') {
      try {
        await bridge.syncWithRemoteSupabaseBridge(db, {
          accessToken: req?.headers?.authorization || null,
          onlyPushChanged: true,
          respectWorkflowLock: true,
          gracefulAuthSkip: true,
        });
      } catch {
        // Non-fatal if remote migration has not been applied yet or offline
      }
    }

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

    // Also record in Supabase command queue if a Supabase bearer session is active
    if (req?.headers?.authorization) {
      try {
        const { supabase } = createAuthenticatedSupabaseServerClient(req.headers.authorization);
        const enq = await supabase.rpc('admin_enqueue_curator_command', {
          p_idempotency_key: execution.command?.idempotencyKey || idempotencyKey || '',
          p_command_type: commandType,
          p_target_id: targetId,
          p_payload: payload,
        });
        const remoteCommandId = enq.data?.command?.id;
        if (remoteCommandId) {
          await supabase.rpc('admin_acknowledge_curator_command', {
            p_command_id: remoteCommandId,
            p_status: 'acknowledged',
            p_result: execution.command?.result || {},
            p_error: null,
          });
        }
      } catch {
        // Non-fatal if remote migration is not yet applied
      }
    }

    const updatedSnapshot = appendServerPreviewFlag(bridge.sanitizeDeep(bridge.buildCuratorSnapshot(db)));
    return {
      ...execution,
      snapshot: updatedSnapshot,
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
