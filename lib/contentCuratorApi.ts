import type { ClubData, EventData, Listing } from '../types';

export type CuratorCommandType =
  | 'candidate_approve'
  | 'candidate_stage_submission'
  | 'candidate_reject'
  | 'candidate_request_changes'
  | 'artwork_approve'
  | 'artwork_reject'
  | 'artwork_regenerate'
  | 'artwork_select_version'
  | 'source_update_schedule'
  | 'source_request_scan'
  | 'agent_sync_bridge'
  | 'job_pause_all'
  | 'job_resume_all';

export interface CuratorFieldDiff {
  field: string;
  label: string;
  originalValue: unknown;
  proposedValue: unknown;
  changed: boolean;
  inferred: boolean;
  evidence: {
    sourceUrl: string | null;
    context: string | null;
    rawValue: string | null;
    verifiedAt: string | null;
    method: string | null;
  } | null;
}

export interface CuratorCandidateWarning {
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

export interface CuratorCandidateRecord {
  id: string;
  title: string;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  clubId: string | null;
  clubName: string;
  hostId: string | null;
  hostName: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  sourceUrl: string | null;
  ticketUrl: string | null;
  rsvpUrl: string | null;
  flyerUrl: string | null;
  description: string | null;
  admission: string | null;
  restrictions: string | null;
  series: string | null;
  recurrence: string | null;
  candidateType: 'event' | 'closure_notice' | 'duplicate_translation' | string;
  isClosureNotice: boolean;
  reconciliationState: 'new' | 'correction_proposed' | 'possible_duplicate' | 'duplicate_translation' | string;
  matchedExistingId: string | null;
  matchedExistingTitle: string | null;
  auditCategory: string | null;
  auditReason: string | null;
  missingFields: string[];
  inferredFields: Array<{
    field: string;
    method: string;
    rawValue: string | null;
    verifiedAt: string | null;
    beyondSixMonthsReview: boolean;
  }>;
  warnings: CuratorCandidateWarning[];
  fieldDiffs: CuratorFieldDiff[];
  evidenceSummary: Array<{
    field: string;
    sourceUrl: string | null;
    context: string | null;
    rawValue: string | null;
    verifiedAt: string | null;
    method: string | null;
  }>;
  capturePages: Array<{
    url: string | null;
    capturedAt: string | null;
    sha256: string | null;
  }>;
  reviewState:
    | 'pending_review'
    | 'approved'
    | 'staged_in_submissions'
    | 'rejected'
    | 'changes_requested'
    | 'possible_duplicate'
    | 'not_for_publication'
    | 'historical_not_for_publication'
    | 'excluded_closure_notice'
    | 'excluded_duplicate_translation';
  reviewDecision: {
    status: string;
    reviewedBy: string;
    reviewedAt: string;
    notes?: string;
    publishedListingId?: string | null;
    moderationWorkflow?: string;
    flaggedFields?: string[];
    commandId?: string;
  } | null;
  publicChangeAuthorized: boolean;
  stagedMedia: {
    id: string;
    status: string;
    styleFamily: string | null;
    selectedVersionId: string;
    hasGeneratedPair: boolean;
    flyerPreviewUrl: string | null;
    heroPreviewUrl: string | null;
  } | null;
  updatedAt: string | null;
}

export interface CuratorVisualCriterion {
  id: string;
  number: number;
  question: string;
  passed: boolean;
  status: string;
  notes: string;
}

export interface CuratorClubIdentitySummary {
  clubId: string | null;
  clubName: string;
  hostName: string | null;
  city?: string | null;
  logoUrl: string | null;
  heroUrl: string | null;
  existingFlyerUrls: string[];
  brandColors: string[];
  brandMotifs: string[];
  officialReferences: string[];
  mediaPresentation: string;
  atmosphereSummary: string;
  usagePolicy: string;
}

export interface CuratorSensualityDirection {
  mode: string;
  rationale: string;
  atmosphereCues: string[];
  clubAlignment: string;
  sfwBoundary: string;
  avoidSubjects: string[];
}

export interface CuratorMediaVersion {
  versionId: string;
  versionNumber: number;
  createdAt: string | null;
  styleFamily: string | null;
  composition: string | null;
  palette: string[];
  sensualityMode: string | null;
  status: string;
  feedback: Record<string, unknown> | null;
  visualEvaluation: {
    evaluatedAt: string;
    allPassed: boolean;
    passedCount: number;
    totalCriteria: number;
    readyForApproval: boolean;
    criteria: CuratorVisualCriterion[];
  } | null;
  previewUrls: {
    flyer: string | null;
    hero: string | null;
    portraitOriginal: string | null;
    landscapeOriginal: string | null;
  } | null;
  assets: {
    flyer: { width: number; height: number; role: string; targetRatio: string; sha256: string | null } | null;
    hero: { width: number; height: number; role: string; targetRatio: string; sha256: string | null } | null;
  } | null;
}

export interface CuratorMediaItem {
  id: string;
  candidateId: string | null;
  eventId: string | null;
  eventTitle: string;
  eventDate: string | null;
  clubId: string | null;
  clubName: string;
  hostId: string | null;
  hostName: string | null;
  city: string | null;
  validationOnly: boolean;
  source: string;
  officialSourceArtworkUrl: string | null;
  existingCatalogArtwork: {
    flyer: string | null;
    hero: string | null;
  } | null;
  styleFamily: string | null;
  composition: string | null;
  palette: string[];
  technique: string | null;
  motifs: string[];
  rationale: string | null;
  clubIdentity: CuratorClubIdentitySummary;
  sensualityDirection: CuratorSensualityDirection;
  provenance: string;
  status: string;
  selectedVersionId: string;
  hasGeneratedPair: boolean;
  generatedAt: string | null;
  attempts: number;
  knownLimitations: string[];
  nearDuplicates: string[];
  previewUrls: {
    flyer: string | null;
    hero: string | null;
    portraitOriginal: string | null;
    landscapeOriginal: string | null;
  } | null;
  dimensions: {
    flyer: { width: number; height: number; ratio: string } | null;
    hero: { width: number; height: number; ratio: string } | null;
  } | null;
  visualEvaluation: {
    evaluatedAt: string;
    allPassed: boolean;
    passedCount: number;
    totalCriteria: number;
    readyForApproval: boolean;
    criteria: CuratorVisualCriterion[];
  };
  visualReview: {
    decision: string;
    artworkApproved?: boolean;
    reviewedAt?: string;
    reviewer?: string;
    notes?: string;
    versionId?: string;
    publicPublishingAuthorized: boolean;
  } | null;
  visualReviewNotes: Record<string, unknown> | null;
  versionHistory: CuratorMediaVersion[];
  revisionRequests: Array<{
    revisionId: string;
    requestedAt: string;
    requestedBy: string;
    feedback: Record<string, unknown>;
    generatedImmediately: boolean;
    resultingVersionId: string | null;
    preservedEventTitle: string;
    preservedEventDate: string | null;
  }>;
  brief: Record<string, unknown>;
  eventReviewState: string;
  publicPublishingAuthorized: boolean;
}

export interface CuratorMonitoredSource {
  id: string;
  name: string;
  entityType: 'club' | 'promoter';
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string | null;
  website: string | null;
  calendarUrl: string | null;
  alternativeSources: string[];
  allowedDomains: string[];
  adapter: string;
  classification: string | null;
  monitoringTier: 'high' | 'moderate' | 'normal' | 'low' | 'static';
  monitoringTierDescription: string | null;
  currentIntervalDays: number;
  scanFrequencyHours: number;
  adaptiveSchedulingEnabled: boolean;
  paused: boolean;
  isDueNow: boolean;
  lastSuccessfulScan: string | null;
  lastAttemptedScan: string | null;
  nextScanAt: string | null;
  discoveredEventsCount: number;
  upcomingCandidatesCount: number;
  correctionCandidatesCount: number;
  extractionStatus: 'ok' | 'partial' | 'failed' | 'unattempted' | 'paused';
  consecutiveFailures: number;
  consecutiveNoChangeScans: number;
  failureBackoffDays: number;
  pendingUrlsCount: number;
  cycleFailures: Array<{ url: string; reason: string }>;
  knownLimitations: string[];
  manualOverride: {
    intervalDays?: number | null;
    tier?: string | null;
    adaptiveEnabled?: boolean;
    paused?: boolean;
    forcedScanPending?: boolean;
    reason?: string;
    updatedAt?: string;
  } | null;
  scheduleAdjustmentHistory: Array<{
    at: string;
    type: string;
    previousTier?: string;
    nextTier?: string;
    previousIntervalDays?: number;
    nextIntervalDays?: number;
    reason?: string;
  }>;
  recentScans: Array<{
    attemptedAt: string | null;
    completedAt: string | null;
    status: string;
    discoveredCount: number;
    failureCount: number;
    failures: Record<string, string>;
  }>;
}

export interface CuratorCronJobSummary {
  id: string;
  name: string;
  command: string;
  description: string;
  enabled: boolean;
  schedule: {
    kind: string;
    expr: string;
    tz: string;
    humanLabel: string;
  };
  timeouts: {
    wallClockSeconds: number;
    noOutputSeconds: number;
  };
  schedulerOutcome: {
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastStatus: string;
    lastDurationMs: number | null;
    consecutiveErrors: number;
    lastError: string | null;
  };
  extractionOutcome: {
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    observedAt: string | null;
    failedSources: number;
    failedMedia: number;
    consecutiveErrors: number;
    error: string | null;
  };
  statusDistinctionNote: string;
}

export interface CuratorImageProviderInfo {
  provider: string;
  cliCommand: string;
  agent: string;
  model: string;
  requiresSeparateApiIntegration: boolean;
  description: string;
}

export interface CuratorCommandRecord {
  id: string;
  idempotencyKey: string;
  commandType: CuratorCommandType;
  targetId: string;
  status: 'queued' | 'processing' | 'acknowledged' | 'failed';
  createdAt: string;
  updatedAt: string;
  actor: string;
  attempts?: number;
  recoveredFromInterruption?: boolean;
  retriedAfterFailure?: boolean;
  auditTrail?: Array<{
    at: string;
    event: string;
    actor: string;
    status: string;
    idempotencyKey?: string;
    error?: string;
  }>;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface CuratorBridgeSyncSchedule {
  id?: string;
  name?: string;
  intervalMinutes: number;
  intervalMs?: number;
  cronExpression: string;
  timezone?: string;
  command?: string;
  triggersWebsiteScans: boolean;
  triggersEventExtraction: boolean;
  triggersImageGeneration: boolean;
  respectsWorkflowLocks?: boolean;
  deltaMetadataPushOnly: boolean;
  preservesLastSuccessTimestamp?: boolean;
  supportedAuthModes?: string[];
}

export interface CuratorDashboardSnapshot {
  connection: {
    agentId: string;
    displayName: string;
    status: 'connected' | 'degraded' | 'offline';
    bridgeMode: string;
    authoritativeOperationalStore: string;
    authoritativePublishedStore: string;
    lastSynchronizedAt: string;
    catalogSyncedAt: string | null;
    lastDeltaHash?: string | null;
    bridgeSyncSchedule?: CuratorBridgeSyncSchedule;
    bridgeSyncState?: Record<string, unknown> | null;
    machineCredentialStatus?: {
      activeTokenCount: number;
      lastUsedAt: string | null;
    };
    directPublishingEnabled: boolean;
    imageProvider?: CuratorImageProviderInfo;
    offlineReason?: string | null;
    activeLocks?: Array<{ name: string; pid: number; expires: number }>;
  };
  summary: {
    reviewQueue: {
      totalStaged: number;
      actionableEventCandidates: number;
      pendingReview: number;
      newEvents: number;
      proposedCorrections: number;
      possibleDuplicates: number;
      duplicateTranslations: number;
      closureNotices: number;
      historicalEvents: number;
      alreadyInCatalog: number;
      incompleteFacts: number;
      inferredYearCount: number;
      approvedCount: number;
      rejectedCount: number;
      changesRequestedCount: number;
    };
    artwork: {
      total: number;
      generatedPairs: number;
      candidateGeneratedPairs: number;
      validationDiversityPairs: number;
      officialArtworkReview: number;
      briefReady: number;
      pendingVisualReview: number;
      approvedArtwork: number;
      rejectedArtwork: number;
      regenerationRequested: number;
    };
    sources: {
      total: number;
      clubs: number;
      promoters: number;
      dueNow: number;
      clubsCheckedRolling7d: number;
      successfulTotal: number;
      partialTotal: number;
      failedTotal: number;
      unattemptedTotal: number;
      pausedTotal: number;
      manualOverridesTotal: number;
      tierBreakdown: Record<string, number>;
    };
    jobs: {
      totalCronJobs: number;
      enabledCronJobs: number;
      openAlerts: number;
      resolvedAlerts: number;
      integrityWarnings: number;
      commandsAcknowledged: number;
    };
  };
  candidates: CuratorCandidateRecord[];
  mediaItems: CuratorMediaItem[];
  creativeCatalog: {
    styles: Array<{
      family: string;
      themes: string[];
      palette: string[];
      composition: string;
      technique: string;
      motifs: string[];
      sensualityMode?: string;
      sensualityCues?: string[];
    }>;
    visualRelevanceCriteria: Array<{
      id: string;
      number: number;
      question: string;
      category: string;
    }>;
    sensualityTechniques: Array<{
      id: string;
      label: string;
      cues: string[];
    }>;
    imageProvider?: CuratorImageProviderInfo;
    monitoringTiers: Record<
      string,
      {
        defaultDays: number;
        minDays: number;
        maxDays: number;
        description: string;
      }
    >;
  };
  monitoredSources: CuratorMonitoredSource[];
  agentAndJobs: {
    cronJobs: CuratorCronJobSummary[];
    alerts: Array<{
      id: string;
      severity: string;
      type: string;
      clubId?: string;
      candidateId?: string;
      message: string;
      status: string;
      createdAt: string;
    }>;
    integrity: {
      checkedAt: string | null;
      warnings: Array<{ type: string; id: string; message?: string }>;
    };
    recentOperations: Array<Record<string, unknown>>;
    commandQueue: CuratorCommandRecord[];
  };
  viewerAdmin?: {
    userId: string;
    email: string | null;
  };
}

const SNAPSHOT_STORAGE_KEY = 'swingsphere:curator-last-snapshot';
let inMemoryCachedSnapshot: CuratorDashboardSnapshot | null = null;

export const setLastCachedCuratorSnapshot = (snapshot: CuratorDashboardSnapshot | null): void => {
  inMemoryCachedSnapshot = snapshot;
  if (typeof window !== 'undefined' && snapshot) {
    try {
      window.sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota errors
    }
  }
};

export const getLastCachedCuratorSnapshot = (): CuratorDashboardSnapshot | null => {
  if (inMemoryCachedSnapshot) return inMemoryCachedSnapshot;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(SNAPSHOT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CuratorDashboardSnapshot;
        inMemoryCachedSnapshot = parsed;
        return parsed;
      }
    } catch {
      // Ignore invalid cached JSON
    }
  }
  return null;
};

export const toOfflineSnapshotFallback = (
  previousSnapshot: CuratorDashboardSnapshot,
  reason = 'Local OpenClaw gateway is unreachable; displaying last synchronized snapshot.',
): CuratorDashboardSnapshot => {
  return {
    ...previousSnapshot,
    connection: {
      ...previousSnapshot.connection,
      status: 'offline',
      bridgeMode: 'supabase-mirror-offline-fallback',
      lastSynchronizedAt: previousSnapshot.connection.lastSynchronizedAt,
      offlineReason: reason,
    },
  };
};

const getCuratorRequestHeaders = async (): Promise<Headers> => {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });

  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token?.trim();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  } catch {
    // Continue to check dev-admin fallback in local development
  }

  if (
    typeof window !== 'undefined' &&
    import.meta.env.DEV &&
    window.localStorage.getItem('swingsphere:dev-admin') === 'true'
  ) {
    headers.set('X-SwingSphere-Dev-Admin', 'true');
  }

  return headers;
};

export const buildCommandIdempotencyKey = (
  commandType: CuratorCommandType,
  targetId: string,
  discriminator: string = '',
): string => {
  const cleanDisc = discriminator.trim().replace(/\s+/g, '_').slice(0, 80);
  return `curator:${commandType}:${targetId}${cleanDisc ? `:${cleanDisc}` : ''}`;
};

const hydrateRemoteSnapshotMediaPreviews = (
  snapshot: CuratorDashboardSnapshot,
): CuratorDashboardSnapshot => {
  const mediaItems = Array.isArray(snapshot.mediaItems)
    ? snapshot.mediaItems.map((m: any) => {
        const inlineFlyer = m.inlinePreviewDataUrls?.flyer || null;
        const inlineHero = m.inlinePreviewDataUrls?.hero || null;
        const versionHistory = Array.isArray(m.versionHistory)
          ? m.versionHistory.map((v: any) => {
              const vFlyer = v.inlinePreviewDataUrls?.flyer || inlineFlyer;
              const vHero = v.inlinePreviewDataUrls?.hero || inlineHero;
              return {
                ...v,
                previewUrls: v.previewUrls
                  ? {
                      flyer: vFlyer || v.previewUrls.flyer,
                      hero: vHero || v.previewUrls.hero,
                      portraitOriginal: vFlyer || v.previewUrls.portraitOriginal,
                      landscapeOriginal: vHero || v.previewUrls.landscapeOriginal,
                    }
                  : null,
              };
            })
          : [];
        return {
          ...m,
          previewUrls: m.previewUrls
            ? {
                flyer: inlineFlyer || m.previewUrls.flyer,
                hero: inlineHero || m.previewUrls.hero,
                portraitOriginal: inlineFlyer || m.previewUrls.portraitOriginal,
                landscapeOriginal: inlineHero || m.previewUrls.landscapeOriginal,
              }
            : null,
          versionHistory,
        };
      })
    : [];

  const candidates = Array.isArray(snapshot.candidates)
    ? snapshot.candidates.map((c: any) => ({
        ...c,
        stagedMedia: c.stagedMedia
          ? {
              ...c.stagedMedia,
              flyerPreviewUrl: c.stagedMedia.flyerInlineDataUrl || c.stagedMedia.flyerPreviewUrl,
              heroPreviewUrl: c.stagedMedia.heroInlineDataUrl || c.stagedMedia.heroPreviewUrl,
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

export const fetchCuratorDashboardSnapshot = async (options?: {
  mirrorSupabase?: boolean;
}): Promise<CuratorDashboardSnapshot> => {
  const headers = await getCuratorRequestHeaders();
  const query = options?.mirrorSupabase ? '?mirrorSupabase=1' : '';
  try {
    const response = await fetch(`/api/admin/curator/snapshot${query}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const liveSnapshot = (await response.json()) as CuratorDashboardSnapshot;
      setLastCachedCuratorSnapshot(liveSnapshot);
      return liveSnapshot;
    }
    if (contentType.includes('application/json')) {
      const errBody = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        throw new Error(errBody?.error || 'Active administrator authentication is required.');
      }
    }
  } catch (err) {
    if (err instanceof Error && /Active administrator authentication/i.test(err.message)) {
      throw err;
    }
    // Fall through to Supabase RPC snapshot or cached offline snapshot if local bridge middleware is unreachable
  }

  const cached = getLastCachedCuratorSnapshot();
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.rpc('admin_get_curator_dashboard_snapshot');
    if (!error && data) {
      const remoteSnapshot = hydrateRemoteSnapshotMediaPreviews(data as CuratorDashboardSnapshot);
      const hasMirroredRows =
        (remoteSnapshot.candidates?.length || 0) > 0 || (remoteSnapshot.monitoredSources?.length || 0) > 0;
      if (!hasMirroredRows && cached) {
        return toOfflineSnapshotFallback(
          cached,
          'Local OpenClaw gateway is offline; displaying last synchronized snapshot.',
        );
      }
      const lastSyncIso =
        remoteSnapshot.connection?.lastSynchronizedAt ||
        cached?.connection?.lastSynchronizedAt ||
        new Date(0).toISOString();
      const syncAgeMs = Date.now() - Date.parse(lastSyncIso);
      const isFreshSync = Number.isFinite(syncAgeMs) && syncAgeMs <= 25 * 60 * 1000;
      const effectiveStatus =
        remoteSnapshot.connection?.status === 'offline' || !isFreshSync
          ? 'offline'
          : remoteSnapshot.connection?.status || 'connected';
      const hydrated = {
        ...remoteSnapshot,
        connection: {
          ...remoteSnapshot.connection,
          status: effectiveStatus,
          bridgeMode: isFreshSync ? 'supabase_authenticated_mirror' : 'supabase-mirror-offline-fallback',
          lastSynchronizedAt: lastSyncIso,
          offlineReason:
            effectiveStatus === 'offline'
              ? 'Local OpenClaw gateway synchronization is stale or offline; displaying last synchronized Supabase mirror snapshot.'
              : null,
        },
      };
      setLastCachedCuratorSnapshot(hydrated);
      return hydrated;
    }
    if (cached) {
      return toOfflineSnapshotFallback(
        cached,
        'Local OpenClaw gateway is offline; displaying last synchronized snapshot.',
      );
    }
    throw new Error(error?.message || 'Unable to load Content Curator dashboard snapshot.');
  } catch (rpcErr) {
    if (cached) {
      return toOfflineSnapshotFallback(
        cached,
        'Local OpenClaw gateway is offline; displaying last synchronized snapshot.',
      );
    }
    throw rpcErr instanceof Error ? rpcErr : new Error('Unable to load Content Curator dashboard snapshot.');
  }
};

export const sendCuratorCommand = async (input: {
  idempotencyKey?: string;
  commandType: CuratorCommandType;
  targetId: string;
  payload?: Record<string, unknown>;
  recoverInterrupted?: boolean;
  retryFailed?: boolean;
}): Promise<{
  ok: boolean;
  duplicate: boolean;
  acknowledged: boolean;
  recoveredFromInterruption?: boolean;
  retriedAfterFailure?: boolean;
  command: CuratorCommandRecord;
  snapshot?: CuratorDashboardSnapshot;
}> => {
  const headers = await getCuratorRequestHeaders();
  const idempotencyKey =
    input.idempotencyKey ||
    buildCommandIdempotencyKey(
      input.commandType,
      input.targetId,
      JSON.stringify(input.payload || {}),
    );

  try {
    const response = await fetch('/api/admin/curator/command', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey,
        commandType: input.commandType,
        targetId: input.targetId,
        payload: input.payload || {},
        recoverInterrupted: input.recoverInterrupted,
        retryFailed: input.retryFailed,
      }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const body = await response.json();
      if (body?.snapshot) {
        setLastCachedCuratorSnapshot(body.snapshot);
      }
      return body;
    }
    if (contentType.includes('application/json')) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody?.error || `Command failed with status ${response.status}.`);
    }
    throw new Error('Local bridge command endpoint unavailable; queueing in Supabase command queue.');
  } catch (err) {
    if (err instanceof Error && /allow-list|required|not found|Invalid/i.test(err.message)) {
      throw err;
    }
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.rpc('admin_enqueue_curator_command', {
      p_idempotency_key: idempotencyKey,
      p_command_type: input.commandType,
      p_target_id: input.targetId,
      p_payload: input.payload || {},
    });
    if (error) {
      throw err instanceof Error ? err : new Error(error.message);
    }
    return data;
  }
};

const buildIsoStartEnd = (candidate: CuratorCandidateRecord): { start: string; end: string } => {
  const baseDate = candidate.date || new Date().toISOString().slice(0, 10);
  const startTime = candidate.startTime || '20:00:00';
  const endDate = candidate.endDate || baseDate;
  const endTime = candidate.endTime || '23:59:00';
  const startIso = `${baseDate}T${startTime.length === 5 ? `${startTime}:00` : startTime}`;
  const endIso = `${endDate}T${endTime.length === 5 ? `${endTime}:00` : endTime}`;
  return { start: startIso, end: endIso };
};

export const buildAuthorizedEventDraftFromCandidate = (
  candidate: CuratorCandidateRecord,
  listings: Listing[],
): EventData => {
  const existingEvent = candidate.matchedExistingId
    ? listings.find((l): l is EventData => l.type === 'event' && l.id === candidate.matchedExistingId)
    : undefined;
  const parentClub = candidate.clubId
    ? listings.find((l): l is ClubData => l.type === 'club' && l.id === candidate.clubId)
    : undefined;

  const { start, end } = buildIsoStartEnd(candidate);

  if (existingEvent) {
    return {
      ...existingEvent,
      name: candidate.title || existingEvent.name,
      hostName: candidate.hostName || candidate.clubName || existingEvent.hostName,
      description_full: candidate.description || existingEvent.description_full,
      website: candidate.sourceUrl || candidate.ticketUrl || existingEvent.website,
      time: {
        start: candidate.date ? start : existingEvent.time.start,
        end: candidate.date ? end : existingEvent.time.end,
      },
      flyerImageUrl: existingEvent.flyerImageUrl || candidate.flyerUrl || undefined,
    };
  }

  const defaultGeopoint = parentClub?.geopoint || {
    latitude: 36.1699,
    longitude: -115.1398,
    address: {
      addressLine1: candidate.address || undefined,
      city: candidate.city || 'Las Vegas',
      region: candidate.region || 'NV',
      country: candidate.country || 'USA',
    },
  };

  const deterministicListingId = candidate.matchedExistingId || `event-curated-${candidate.id.replace(/^candidate-/, '')}`;

  return {
    id: deterministicListingId,
    type: 'event',
    name: candidate.title,
    hostName: candidate.hostName || parentClub?.name || candidate.clubName || 'SwingSphere Host',
    description_full:
      candidate.description ||
      `${candidate.title} hosted at ${candidate.venue || parentClub?.name || candidate.clubName}. Verified from official source calendar.`,
    location:
      candidate.address ||
      parentClub?.location ||
      [candidate.city, candidate.region, candidate.country].filter(Boolean).join(', ') ||
      candidate.clubName,
    website: candidate.sourceUrl || candidate.ticketUrl || parentClub?.website,
    contactEmail: parentClub?.contactEmail || 'events@swingsphere.com',
    venueId: parentClub?.primaryVenueId,
    organizerOrganizationId: parentClub?.ownerOrganizationId,
    time: { start, end },
    geopoint: defaultGeopoint,
    tags: ['Curated Event', ...(candidate.series ? [candidate.series] : [])],
    logoImageUrl: parentClub?.logoImageUrl,
    flyerImageUrl: candidate.flyerUrl || undefined,
    headerImageUrl: parentClub?.headerImageUrl,
    status: 'pending_approval',
    postedByUserId: 'admin',
  };
};

export interface CuratorModerationWorkflowAdapter {
  saveEvent: (event: EventData, options?: { requireExisting?: boolean }) => Promise<EventData>;
  approveSubmission: (id: string) => Promise<Listing>;
}

export const approveCandidateViaAuthorizedWorkflow = async (
  candidate: CuratorCandidateRecord,
  listings: Listing[],
  options: {
    mode: 'stage_submission' | 'approve_and_publish';
    notes?: string;
    moderationApi: CuratorModerationWorkflowAdapter;
  },
): Promise<{
  savedListing: EventData;
  commandResponse: Awaited<ReturnType<typeof sendCuratorCommand>>;
}> => {
  if (candidate.isClosureNotice || candidate.candidateType === 'closure_notice') {
    throw new Error('Closure notices cannot be published as event occurrences.');
  }
  if (!candidate.date) {
    throw new Error('Candidates missing a verified event date cannot be published without completing required facts.');
  }

  // Deterministic idempotency key prevents duplicate publishing on repeated clicks
  const commandType: CuratorCommandType =
    options.mode === 'approve_and_publish' ? 'candidate_approve' : 'candidate_stage_submission';
  const idempotencyKey = buildCommandIdempotencyKey(commandType, candidate.id, options.mode);

  const eventDraft = buildAuthorizedEventDraftFromCandidate(candidate, listings);

  // Step 1: Save through SwingSphere's authorized saveEvent (save_listing RPC) as pending_approval
  let savedListing = await options.moderationApi.saveEvent({
    ...eventDraft,
    status: 'pending_approval',
  });

  // Step 2: If full approval was requested, run SwingSphere's authorized moderation RPC (`admin_moderate_listing`)
  if (options.mode === 'approve_and_publish') {
    const moderated = await options.moderationApi.approveSubmission(savedListing.id);
    if (moderated.type === 'event') {
      savedListing = moderated;
    } else {
      savedListing = { ...savedListing, status: 'approved' };
    }
  }

  // Step 3: Record explicit acknowledgment & audit trail in the Curator command queue
  const commandResponse = await sendCuratorCommand({
    idempotencyKey,
    commandType,
    targetId: candidate.id,
    payload: {
      notes:
        options.notes ||
        (options.mode === 'approve_and_publish'
          ? 'Approved and published through SwingSphere moderation workflow'
          : 'Staged in SwingSphere pending submissions queue for moderation'),
      publishedListingId: savedListing.id,
      moderationWorkflow:
        options.mode === 'approve_and_publish'
          ? 'save_listing_and_admin_moderate_listing'
          : 'save_listing_pending_approval',
    },
  });

  return {
    savedListing,
    commandResponse,
  };
};
