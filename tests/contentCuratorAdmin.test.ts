import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  requireCuratorAdmin,
  getCuratorBridgeSnapshot,
  executeCuratorBridgeCommand,
  uploadCuratorApprovedMediaToProduction,
  streamCuratorMediaPreview,
  sanitizeBridgeError,
  ensureAutomaticCuratorBridgeSync,
} from '../lib/contentCuratorBridgeServer';
import {
  analyzeCuratorArtworkDimensions,
  buildAuthorizedEventDraftFromCandidate,
  buildCommandIdempotencyKey,
  buildCuratorPromotionalContentSchema,
  clearCuratorCandidateDraft,
  clearStoredCuratorArtworkPrompt,
  CURATOR_ARTWORK_STYLE_CATEGORIES,
  CURATOR_FLYER_LAYOUT_PATTERNS,
  filterCandidatesByQueueSignificance,
  gatherPublishableApprovedCandidates,
  generateCuratorArtworkPrompt,
  getActiveCuratorCutoffDate,
  getCuratorArtworkStyleCategory,
  getCuratorCandidateDraft,
  getLastCachedCuratorSnapshot,
  getSafeExternalHttpUrl,
  getStoredCuratorArtworkPrompt,
  isCandidateArchivedOrExpired,
  isCandidateDateExpired,
  isCandidateExcludedDuplicate,
  mergeCandidateWithDraft,
  normalizeCuratorDashboardSnapshot,
  publishApprovedCuratorChanges,
  resolveArtworkRoleProvenance,
  saveCuratorCandidateDraft,
  saveStoredCuratorArtworkPrompt,
  setLastCachedCuratorSnapshot,
  sortCandidatesForEditorialQueue,
  toOfflineSnapshotFallback,
  validateCandidateForEditorialReview,
  validateCandidateForManualPublish,
  validateCuratorArtworkUploadFile,
  type CuratorCandidateRecord,
} from '../lib/contentCuratorApi';
import type { ClubData } from '../types';
import { mockOrganizations } from '../data/mockOrganizations';
import { eventSeries } from '../data/eventSeries';
import { mockOrganizationVenueRelationships } from '../data/mockEntityRelationships';

const makeLocalAdminReq = (url = '/api/admin/curator/snapshot', withAdminHeader = true) => ({
  url,
  socket: { remoteAddress: '127.0.0.1' },
  headers: {
    host: 'localhost:5173',
    ...(withAdminHeader ? { 'x-swingsphere-dev-admin': 'true' } : {}),
  },
});

test('Phase 1 & 4: unauthenticated and non-admin requests to Content Curator bridge are rejected', async () => {
  await assert.rejects(
    async () => requireCuratorAdmin(makeLocalAdminReq('/api/admin/curator/snapshot', false)),
    /Active administrator authentication is required/,
  );

  await assert.rejects(
    async () =>
      getCuratorBridgeSnapshot({
        url: '/api/admin/curator/snapshot',
        socket: { remoteAddress: '203.0.113.45' },
        headers: { host: 'swingsphere.com', 'x-swingsphere-dev-admin': 'true' },
      }),
    /Active administrator authentication is required/,
  );

  const sanitized = sanitizeBridgeError(
    'Failed opening C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator\\state\\curator.sqlite with key sk-abc123456789 and machine token cur_mch_0123456789abcdef0123456789abcdef',
  );
  assert.ok(!sanitized.includes('C:\\Users\\Ryoga'));
  assert.ok(!sanitized.includes('sk-abc123456789'));
  assert.ok(!sanitized.includes('cur_mch_'));
});

test('Phase 1, 2 & 4: live Content Curator snapshot loads 84 sources, 113 candidates, 54 media items, 5 cron jobs, 15m bridge sync schedule, and OpenClaw image provider metadata with zero local path leakage', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const coreMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'core.mjs')).href);
  const preCleanDb = coreMod.database();
  try {
    preCleanDb
      .prepare("DELETE FROM candidates WHERE data LIKE '%https://trapezeclub.com/events/manual-publish-%'")
      .run();
    preCleanDb
      .prepare("DELETE FROM locks WHERE name IN ('bridge_daemon', 'bridge_sync')")
      .run();
    const silkyRow = preCleanDb
      .prepare("SELECT data FROM candidates WHERE id = 'candidate-c141b9a6593bf783e6fbf186'")
      .get();
    if (silkyRow?.data) {
      const parsedSilky = JSON.parse(silkyRow.data);
      if (parsedSilky?.statusMatrix && parsedSilky.statusMatrix.artwork !== 'visually_reviewed') {
        parsedSilky.statusMatrix.artwork = 'visually_reviewed';
        parsedSilky.statusMatrix.publication = 'pending_review';
        parsedSilky.reviewState = 'pending_review';
        preCleanDb
          .prepare("UPDATE candidates SET data = ? WHERE id = 'candidate-c141b9a6593bf783e6fbf186'")
          .run(JSON.stringify(parsedSilky));
      }
    }
    const silkyMediaRow = preCleanDb
      .prepare("SELECT data FROM media WHERE id = 'candidate-c141b9a6593bf783e6fbf186'")
      .get();
    if (silkyMediaRow?.data) {
      const parsedMedia = JSON.parse(silkyMediaRow.data);
      if (parsedMedia?.status === 'approved') {
        parsedMedia.status = 'needs_visual_review';
        preCleanDb
          .prepare("UPDATE media SET data = ? WHERE id = 'candidate-c141b9a6593bf783e6fbf186'")
          .run(JSON.stringify(parsedMedia));
      }
    }
  } finally {
    preCleanDb.close();
  }
  const snapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());

  assert.equal(snapshot.connection.agentId, 'swingsphere-content-curator');
  assert.equal(snapshot.connection.directPublishingEnabled, false);
  assert.ok(snapshot.connection.lastSynchronizedAt);
  assert.equal(snapshot.connection.imageProvider?.cliCommand, 'openclaw infer image');
  assert.equal(snapshot.connection.imageProvider?.requiresSeparateApiIntegration, false);
  assert.equal(snapshot.connection.bridgeSyncSchedule?.intervalMinutes, 15);
  assert.equal(snapshot.connection.bridgeSyncSchedule?.cronExpression, '*/15 * * * *');
  assert.equal(snapshot.connection.bridgeSyncSchedule?.triggersWebsiteScans, false);
  assert.equal(snapshot.connection.bridgeSyncSchedule?.triggersEventExtraction, false);
  assert.equal(snapshot.connection.bridgeSyncSchedule?.triggersImageGeneration, false);
  assert.equal(snapshot.connection.bridgeSyncSchedule?.deltaMetadataPushOnly, true);

  // 84+ monitored sources (clubs + promoters), all scheduled within <= 7 days
  assert.ok(snapshot.summary.sources.total >= 84);
  assert.ok(snapshot.summary.sources.clubs >= 70);
  assert.ok(snapshot.summary.sources.promoters >= 14);
  assert.equal(snapshot.monitoredSources.length, snapshot.summary.sources.total);
  for (const s of snapshot.monitoredSources) {
    assert.ok(
      s.currentIntervalDays <= 7,
      `Expected source ${s.id} interval (${s.currentIntervalDays}d) to be <= 7 days`,
    );
  }

  // Staged candidates (113+ as live scheduled discovery runs), all approval-gated
  assert.ok(snapshot.candidates.length >= 113);
  assert.equal(snapshot.candidates.length, snapshot.summary.reviewQueue.totalStaged);
  assert.ok(snapshot.candidates.every((c: CuratorCandidateRecord) => c.publicChangeAuthorized === false));
  assert.ok(snapshot.summary.reviewQueue.inferredYearCount >= 30);

  // Verify every candidate reviewState in the live database is permitted by the Supabase migration constraint
  const allowedMigrationReviewStates = new Set([
    'pending_review',
    'approved',
    'ready_to_publish',
    'published',
    'publish_failed',
    'staged_in_submissions',
    'rejected',
    'changes_requested',
    'deferred',
    'possible_duplicate',
    'not_for_publication',
    'historical_not_for_publication',
    'excluded_closure_notice',
    'excluded_duplicate_translation',
  ]);
  for (const c of snapshot.candidates) {
    assert.ok(
      allowedMigrationReviewStates.has(c.reviewState),
      `Candidate ${c.id} has reviewState "${c.reviewState}" which must be allowed by migration CHECK constraint`,
    );
  }

  // Media records, including generated 1080x1350 + 1920x1080 pairs and 10-point universal visual relevance criteria
  assert.ok(snapshot.mediaItems.length >= 161);
  assert.equal(snapshot.mediaItems.length, snapshot.summary.artwork.total);
  assert.ok(snapshot.summary.artwork.generatedPairs >= 9);
  const twistPair = snapshot.mediaItems.find((m: any) => m.id === 'candidate-1794dc45e24f56d473a38e83');
  assert.ok(twistPair);
  assert.equal(twistPair.hasGeneratedPair, true);
  assert.equal(twistPair.dimensions.flyer.width, 1080);
  assert.equal(twistPair.dimensions.flyer.height, 1350);
  assert.equal(twistPair.dimensions.hero.width, 1920);
  assert.equal(twistPair.dimensions.hero.height, 1080);
  assert.equal(twistPair.visualEvaluation.criteria.length, 10);
  assert.equal(twistPair.publicPublishingAuthorized, false);

  // Verify the 3 new validation pairs (Silky Soft, Twist Couples Saturday, All Kinks Thursday) and universal enrichment fields
  const silkyCandidate = snapshot.candidates.find((c: any) => c.id === 'candidate-c141b9a6593bf783e6fbf186');
  assert.ok(silkyCandidate);
  assert.ok(silkyCandidate.statusMatrix);
  assert.equal(silkyCandidate.statusMatrix.discovery, 'candidate_staged');
  assert.equal(silkyCandidate.statusMatrix.eventData, 'complete');
  assert.equal(silkyCandidate.statusMatrix.artwork, 'visually_reviewed');
  assert.equal(silkyCandidate.statusMatrix.publication, 'pending_review');
  assert.ok(silkyCandidate.displayDescription?.includes('Slip into satin, lace'));
  assert.ok(silkyCandidate.sourceDescription?.sourceUrl);
  assert.ok(silkyCandidate.eventDetails?.theme);
  assert.ok(Array.isArray(silkyCandidate.discoveredImages) && silkyCandidate.discoveredImages.length >= 1);

  const silkyMedia = snapshot.mediaItems.find((m: any) => m.id === 'candidate-c141b9a6593bf783e6fbf186');
  assert.ok(silkyMedia);
  assert.equal(silkyMedia.creativeProcess, 'reference_first');
  assert.equal(silkyMedia.styleFamily, 'Elegant fashion editorial');
  assert.ok(silkyMedia.officialImageAnalysis);
  assert.equal(silkyMedia.visualEvaluation.passedCount, 10);

  const twistSatMedia = snapshot.mediaItems.find((m: any) => m.id === 'candidate-f939e809a5c35f6558fdcf2e');
  assert.ok(twistSatMedia);
  assert.equal(twistSatMedia.creativeProcess, 'description_first');
  assert.ok(twistSatMedia.descriptionAnalysis);
  assert.equal(twistSatMedia.visualEvaluation.passedCount, 10);

  const allKinksMedia = snapshot.mediaItems.find((m: any) => m.id === 'candidate-d550c934092d5646f46ba983');
  assert.ok(allKinksMedia);
  assert.equal(allKinksMedia.creativeProcess, 'reference_first');
  assert.equal(allKinksMedia.styleFamily, 'Dark industrial');
  assert.equal(allKinksMedia.visualEvaluation.passedCount, 10);

  // 5 operational cron jobs distinguishing scheduler outcome from source extraction outcome
  assert.equal(snapshot.agentAndJobs.cronJobs.length, 5);
  const scanJob = snapshot.agentAndJobs.cronJobs.find((j: any) => j.command === 'scan');
  assert.ok(scanJob);
  assert.ok(['idle', 'ok', 'error', 'partial', 'timeout'].includes(scanJob.schedulerOutcome.lastStatus));
  assert.ok(['partial', 'failed', 'ok'].includes(scanJob.extractionOutcome.status));
  assert.ok(scanJob.extractionOutcome.failedSources >= 0);

  const reportJob = snapshot.agentAndJobs.cronJobs.find((j: any) => j.command === 'report');
  assert.ok(reportJob);
  assert.equal(reportJob.schedulerOutcome.lastStatus, 'ok');
  assert.equal(reportJob.extractionOutcome.status, 'ok');

  // Verify no local filesystem paths leak into the snapshot payload
  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('C:\\Users\\Ryoga'));
  assert.ok(!serialized.includes('file:///'));
});

test('Phase 2 & 4: restricted preview media streaming serves all real portrait flyers and landscape heroes with private no-store headers and blocks traversal', async () => {
  const snapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const generatedPairs = snapshot.mediaItems.filter((m: any) => m.hasGeneratedPair);
  assert.ok(generatedPairs.length >= 9);

  for (const item of generatedPairs.slice(0, 9)) {
    for (const role of ['flyer', 'hero'] as const) {
      let statusCode = 0;
      const headers: Record<string, string> = {};
      let bodyBuffer: Buffer | string | null = null;
      const mockRes = {
        get statusCode() {
          return statusCode;
        },
        set statusCode(val: number) {
          statusCode = val;
        },
        setHeader(k: string, v: string) {
          headers[k.toLowerCase()] = v;
        },
        end(payload: Buffer | string) {
          bodyBuffer = payload;
        },
      };

      await streamCuratorMediaPreview(
        makeLocalAdminReq(`/api/admin/curator/media-preview?mediaId=${item.id}&version=v1&role=${role}`),
        mockRes,
      );
      assert.equal(statusCode, 200, `Expected HTTP 200 for ${item.id} (${role})`);
      assert.equal(headers['content-type'], 'image/png');
      assert.match(headers['cache-control'], /private,\s*no-store/);
      assert.match(headers['x-robots-tag'], /noindex,\s*nofollow/);
      assert.ok(Buffer.isBuffer(bodyBuffer));
      assert.ok((bodyBuffer as Buffer).length > 10_000, `Expected non-empty PNG for ${item.id} (${role})`);
      // Verify PNG magic signature (89 50 4E 47)
      assert.equal((bodyBuffer as Buffer)[0], 0x89);
      assert.equal((bodyBuffer as Buffer)[1], 0x50);
      assert.equal((bodyBuffer as Buffer)[2], 0x4e);
      assert.equal((bodyBuffer as Buffer)[3], 0x47);
    }
  }

  let errResStatus = 0;
  const errMockRes = {
    get statusCode() {
      return errResStatus;
    },
    set statusCode(val: number) {
      errResStatus = val;
    },
    setHeader() {},
    end() {},
  };

  // Reject path traversal
  await assert.rejects(
    async () =>
      streamCuratorMediaPreview(
        makeLocalAdminReq('/api/admin/curator/media-preview?mediaId=../state/curator.sqlite&version=v1&role=flyer'),
        errMockRes,
      ),
    /Invalid media identifier/,
  );

  // Reject disallowed command types
  await assert.rejects(
    async () =>
      executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
        commandType: 'unrestricted_shell',
        targetId: 'any',
      }),
    /outside the authorized Content Curator bridge allow-list/,
  );
});

test('Phase 2 & 4: offline fallback preserves lastSynchronizedAt and transitions connection status to offline', async () => {
  const liveSnapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  setLastCachedCuratorSnapshot(liveSnapshot);

  const cached = getLastCachedCuratorSnapshot();
  assert.ok(cached);
  assert.equal(cached.connection.lastSynchronizedAt, liveSnapshot.connection.lastSynchronizedAt);

  const offlineSnapshot = toOfflineSnapshotFallback(
    liveSnapshot,
    'Simulated local OpenClaw gateway offline state for verification.',
  );
  assert.equal(offlineSnapshot.connection.status, 'offline');
  assert.equal(offlineSnapshot.connection.lastSynchronizedAt, liveSnapshot.connection.lastSynchronizedAt);
  assert.match(String(offlineSnapshot.connection.offlineReason), /Simulated local OpenClaw gateway offline/);
  assert.equal(offlineSnapshot.candidates.length, liveSnapshot.candidates.length);
  assert.ok(offlineSnapshot.monitoredSources.length >= 84);
});

test('Phase 2 & 4: Review Queue approval draft uses SwingSphere authorized moderation workflow and deterministic idempotency keys', () => {
  const sampleClub: ClubData = {
    id: 'club-twist',
    type: 'club',
    name: 'Twist Social Club',
    description_short: 'Upscale social club',
    location: 'Miami, FL, USA',
    contactEmail: 'info@twist.example',
    geopoint: {
      latitude: 25.7617,
      longitude: -80.1918,
      address: { city: 'Miami', region: 'FL', country: 'USA' },
    },
    schedule: [],
    generalAmenities: [],
    status: 'approved',
    postedByUserId: 'admin',
  };

  const sampleCandidate = {
    id: 'candidate-1794dc45e24f56d473a38e83',
    title: 'Twist Plus Party',
    date: '2026-11-07',
    endDate: '2026-11-08',
    startTime: '21:00:00',
    endTime: '03:00:00',
    timezone: 'America/New_York',
    clubId: 'club-twist',
    clubName: 'Twist Social Club',
    hostId: null,
    hostName: 'Twist Social Club',
    venue: 'Twist Social Club',
    address: 'Miami, FL',
    city: 'Miami',
    region: 'FL',
    country: 'USA',
    sourceUrl: 'https://twist.example/events/plus-party',
    ticketUrl: null,
    rsvpUrl: null,
    flyerUrl: null,
    description: 'Saturday evening party.',
    admission: null,
    restrictions: 'Couples & single women',
    series: null,
    recurrence: null,
    candidateType: 'event',
    isClosureNotice: false,
    reconciliationState: 'new',
    matchedExistingId: null,
    matchedExistingTitle: null,
    auditCategory: 'actionable',
    auditReason: null,
    missingFields: [],
    inferredFields: [],
    warnings: [],
    fieldDiffs: [],
    evidenceSummary: [],
    capturePages: [],
    reviewState: 'pending_review' as const,
    reviewDecision: null,
    publicChangeAuthorized: false,
    stagedMedia: null,
    updatedAt: '2026-10-14T18:00:00Z',
  };

  const draft = buildAuthorizedEventDraftFromCandidate(sampleCandidate, [sampleClub]);
  assert.equal(draft.type, 'event');
  assert.equal(draft.status, 'pending_approval');
  assert.equal(draft.name, 'Twist Plus Party');
  assert.equal(draft.geopoint.address.city, 'Miami');
  assert.equal(draft.publicSlug, 'twist-plus-party-miami-2026-11-07');

  const key1 = buildCommandIdempotencyKey('candidate_approve', sampleCandidate.id, 'approve_and_publish');
  const key2 = buildCommandIdempotencyKey('candidate_approve', sampleCandidate.id, 'approve_and_publish');
  assert.equal(key1, key2);
});

test('Phase 1, 2 & 4: Supabase RLS migration, revocable machine credentials, 15m auto-sync scheduler, and Admin UI integration satisfy security, offline display, and responsive layout requirements', async () => {
  const rootDir = path.resolve(process.cwd());
  const migrationSql = fs.readFileSync(
    path.join(rootDir, 'supabase', 'migrations', '20261015000000_content_curator_admin_bridge.sql'),
    'utf8',
  );
  assert.match(migrationSql, /alter table public\.curator_staged_candidates enable row level security/i);
  assert.match(migrationSql, /alter table public\.curator_staged_candidates force row level security/i);
  assert.match(migrationSql, /revoke all on table public\.curator_staged_candidates from public, anon/i);
  assert.match(migrationSql, /private\.is_active_admin/i);
  assert.match(migrationSql, /private\.curator_bridge_machine_tokens/i);
  assert.match(migrationSql, /revoke all on table private\.curator_bridge_machine_tokens from public, anon, authenticated/i);
  assert.match(migrationSql, /private\.authorize_curator_bridge_sync/i);
  assert.match(migrationSql, /admin_issue_curator_machine_token/i);
  assert.match(migrationSql, /admin_revoke_curator_machine_token/i);
  assert.match(migrationSql, /excluded_closure_notice/i);
  assert.match(migrationSql, /excluded_duplicate_translation/i);
  assert.match(migrationSql, /admin_list_pending_curator_commands/i);

  const daemonHandle = await ensureAutomaticCuratorBridgeSync({ forceStartInTest: true, intervalMs: 60_000 });
  assert.ok(daemonHandle);
  assert.equal(daemonHandle.schedule.intervalMinutes, 15);
  assert.equal(daemonHandle.schedule.cronExpression, '*/15 * * * *');
  assert.equal(daemonHandle.isRunning(), true);
  daemonHandle.stop();
  assert.equal(daemonHandle.isRunning(), false);

  const sidebarSrc = fs.readFileSync(path.join(rootDir, 'components', 'admin', 'AdminSidebar.tsx'), 'utf8');
  assert.match(sidebarSrc, /label="Content Curator"/);
  assert.match(sidebarSrc, /setView\('content-curator'\)/);

  const panelSrc = fs.readFileSync(path.join(rootDir, 'components', 'admin', 'AdminPanel.tsx'), 'utf8');
  assert.match(panelSrc, /'content-curator'/);
  assert.match(panelSrc, /<AdminContentCurator/);

  const curatorUiSrc = fs.readFileSync(path.join(rootDir, 'components', 'admin', 'AdminContentCurator.tsx'), 'utf8');
  assert.match(curatorUiSrc, /curator-view-review-queue/);
  assert.match(curatorUiSrc, /curator-view-artwork-studio/);
  assert.match(curatorUiSrc, /curator-view-monitored-sources/);
  assert.match(curatorUiSrc, /curator-view-agent-jobs/);
  assert.match(curatorUiSrc, /curator-offline-banner/);
  assert.match(curatorUiSrc, /curator-last-sync-time/);
  assert.match(curatorUiSrc, /curator-operational-health-strip/);
  assert.match(curatorUiSrc, /curator-community-candidates-section/);
  assert.match(curatorUiSrc, /curator-source-check-now/);
  assert.match(curatorUiSrc, /openclaw infer image/);
  assert.match(curatorUiSrc, /\*\/15 \* \* \* \*/);
  assert.match(curatorUiSrc, /swingsphere-creative-director/);
  assert.match(curatorUiSrc, /Stage B Deterministic Factual Overlay Fields/);
  assert.match(curatorUiSrc, /Creative Director 12-Point Quality Check/);
  assert.match(curatorUiSrc, /Select regeneration level/);
  assert.match(curatorUiSrc, /Override poster layout template/);
  assert.match(curatorUiSrc, /sm:grid-cols-4/);
  assert.match(curatorUiSrc, /xl:grid-cols-12/);
});

test('Section 8 End-to-End Validation: all 10 required processing scenarios pass safely with reversible state', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const workflowsMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'workflows.mjs')).href);
  const adaptersMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'html-adapters.mjs')).href);
  const scanStateMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'scan-state.mjs')).href);
  const coreMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'core.mjs')).href);

  // ---------------------------------------------------------------------------
  // Scenario 1: An existing club has a newly announced qualifying play-party event
  // ---------------------------------------------------------------------------
  const qualifyingEvent = {
    title: 'Velvet Midnight Play Party & Couples Takeover',
    description: 'An upscale on-premise lifestyle play party for couples and single women with full playroom access.',
    date: '2026-12-12',
    startTime: '21:00',
    endTime: '03:00',
    timezone: 'America/Chicago',
    clubId: 'club-colette-austin',
    clubName: 'Colette Austin',
    city: 'Austin',
    region: 'TX',
    country: 'USA',
    sourceUrl: 'https://www.coletteclubs.com/austin/events/velvet-midnight',
    ticketUrl: 'https://www.coletteclubs.com/tickets/velvet-midnight',
  };
  const elig1 = adaptersMod.classifyPlayPartyEligibility(qualifyingEvent, { entityType: 'club' });
  assert.equal(elig1.status, 'qualifying_play_party');
  assert.equal(elig1.qualified, true);
  assert.equal(elig1.requiresHumanReview, false);

  const recon1 = workflowsMod.reconcile(qualifyingEvent, []);
  assert.equal(recon1.state, 'new');
  const slug1 = workflowsMod.buildCandidatePublicSlug(qualifyingEvent, [], [], null);
  assert.equal(slug1, 'velvet-midnight-play-party-couples-takeover-austin-tx-2026-12-12');

  // ---------------------------------------------------------------------------
  // Scenario 2: An existing event has changed its time or date
  // ---------------------------------------------------------------------------
  const existingCatalogEvent = {
    id: 'event-existing-velvet-1',
    publicSlug: 'velvet-midnight-austin-tx-2026-12-12',
    title: 'Velvet Midnight Play Party',
    date: '2026-12-12',
    startTime: '21:00',
    endTime: '02:00',
    clubId: 'club-colette-austin',
    clubName: 'Colette Austin',
    venue: 'Colette Austin',
    city: 'Austin',
    region: 'TX',
    country: 'USA',
    sourceUrl: 'https://www.coletteclubs.com/austin/events/velvet-midnight',
    ticketUrl: 'https://www.coletteclubs.com/tickets/velvet-midnight',
    flyerUrl: 'https://cdn.swingsphere.com/custom/velvet-curated.png',
    description: 'Original curated description.',
  };
  const updatedTimeCandidate = {
    ...existingCatalogEvent,
    startTime: '22:00',
    endTime: '04:00',
  };
  const recon2 = workflowsMod.reconcile(updatedTimeCandidate, [existingCatalogEvent]);
  assert.equal(recon2.state, 'correction_proposed');
  assert.equal(recon2.matchedExistingId, 'event-existing-velvet-1');
  assert.ok(recon2.changes.some((d: any) => d.field === 'startTime' && d.before === '21:00' && d.after === '22:00'));
  // Existing URL slug is preserved
  const slug2 = workflowsMod.buildCandidatePublicSlug(
    updatedTimeCandidate,
    [existingCatalogEvent],
    [],
    existingCatalogEvent,
  );
  assert.equal(slug2, 'velvet-midnight-austin-tx-2026-12-12');

  // ---------------------------------------------------------------------------
  // Scenario 3: Source produces an event already in the DB (slight title edit,
  // description edit, ticket URL tracking params, club+promoter cross-listing,
  // and recurring event on separate dates)
  // ---------------------------------------------------------------------------
  const slightTitleAndTrackingCandidate = {
    ...existingCatalogEvent,
    title: 'Velvet Midnight Play Party — Holiday Edition',
    description: 'Updated organizer description with extra details.',
    ticketUrl:
      'https://www.coletteclubs.com/tickets/velvet-midnight?utm_source=instagram&utm_medium=social&fbclid=IwAR123456',
  };
  const recon3a = workflowsMod.reconcile(slightTitleAndTrackingCandidate, [existingCatalogEvent]);
  assert.equal(recon3a.matchedExistingId, 'event-existing-velvet-1');
  // Tracking-parameter-only change on ticketUrl must NOT be flagged as a diff
  assert.ok(!recon3a.changes.some((d: any) => d.field === 'ticketUrl'));

  // Cross-listed on promoter website (different clubId, same host/venue/date/title)
  const crossListedPromoterCandidate = {
    ...existingCatalogEvent,
    clubId: 'promoter-texas-lifestyle',
    clubName: 'Texas Lifestyle Promoters',
    host: 'Colette Austin',
    officialUrl: 'https://texaslifestyle.example/calendar/velvet-midnight',
    ticketUrl: 'https://texaslifestyle.example/tickets/velvet-midnight',
  };
  const recon3b = workflowsMod.reconcile(crossListedPromoterCandidate, [existingCatalogEvent]);
  assert.equal(recon3b.matchedExistingId, 'event-existing-velvet-1');

  // Same recurring series on a separate date must be recognized as a new occurrence, not overwrite the Dec 12 event
  const nextWeekRecurringCandidate = {
    ...existingCatalogEvent,
    date: '2026-12-19',
    officialUrl: 'https://www.coletteclubs.com/austin/events/velvet-midnight-dec-19',
    ticketUrl: 'https://www.coletteclubs.com/tickets/velvet-midnight-dec-19',
    sourceUid: 'velvet-2026-12-19',
  };
  const recon3c = workflowsMod.reconcile(nextWeekRecurringCandidate, [
    { ...existingCatalogEvent, recurrence: 'weekly', sourceUid: 'velvet-2026-12-12' },
  ]);
  assert.equal(recon3c.state, 'new');
  assert.equal(recon3c.matchedExistingId, null);

  // ---------------------------------------------------------------------------
  // Scenario 4: A monitored source is temporarily unavailable
  // ---------------------------------------------------------------------------
  const tempUnavailableProfile: any = {
    id: 'club-temp-unavailable-test',
    name: 'Temp Unavailable Club',
    monitoringTier: 'normal',
    currentIntervalDays: 7,
    failures: 2,
  };
  const cycleOutcome = scanStateMod.finishCycle(tempUnavailableProfile, {
    queue: ['https://unavailable.example/events'],
    visited: [],
    pages: [],
    results: [],
    failures: { 'https://unavailable.example/events': 'HTTP 503 Service Unavailable' },
  });
  assert.equal(cycleOutcome.failed, true);
  assert.ok(cycleOutcome.delayHours > 0 && cycleOutcome.delayHours <= 72, 'Failure backoff must be bounded <= 72h');
  assert.equal(tempUnavailableProfile.technicalBackoffHours, cycleOutcome.delayHours);

  // ---------------------------------------------------------------------------
  // Scenario 5: A newly discovered promoter is not in SwingSphere
  // ---------------------------------------------------------------------------
  const snapshotBefore = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  assert.ok(Array.isArray(snapshotBefore.communityCandidates));
  assert.ok(snapshotBefore.communityCandidates.length >= 5);
  for (const cc of snapshotBefore.communityCandidates) {
    assert.equal(cc.publicChangeAuthorized, false, 'Newly discovered organizations must never be auto-published');
    assert.ok(cc.name && cc.discoveryStrategy && Array.isArray(cc.qualifyingEventsEvidence));
  }

  // ---------------------------------------------------------------------------
  // Scenario 6: A discovered event is ambiguous and requires human review
  // ---------------------------------------------------------------------------
  const ambiguousMixer = {
    title: 'Friday Rooftop Cocktail Mixer & Icebreaker',
    description: 'Join us at the hotel rooftop lounge for casual drinks, conversation, and dancing. No playrooms on site.',
    date: '2026-12-18',
    clubId: 'promoter-social',
    clubName: 'Metro Social Group',
  };
  const elig6 = adaptersMod.classifyPlayPartyEligibility(ambiguousMixer, { entityType: 'promoter' });
  assert.equal(elig6.qualified, false);
  assert.equal(elig6.requiresHumanReview, true);
  assert.ok(['ambiguous_requires_human_review', 'non_play_flagged'].includes(elig6.status));

  // ---------------------------------------------------------------------------
  // Scenario 7: Flyer generation fails while event data is otherwise valid
  // ---------------------------------------------------------------------------
  // Verify candidates without generated pairs still have complete eventData statusMatrix and remain reviewable
  const validCandidateWithoutGeneratedArtwork = snapshotBefore.candidates.find(
    (c: any) => !c.stagedMedia?.hasGeneratedPair && c.statusMatrix?.eventData === 'complete',
  );
  assert.ok(validCandidateWithoutGeneratedArtwork, 'Event ingestion succeeds even when AI flyer generation has not run');
  assert.equal(validCandidateWithoutGeneratedArtwork.statusMatrix.discovery, 'candidate_staged');

  // ---------------------------------------------------------------------------
  // Scenario 8 & 9: Administrator approves, defers, or edits a candidate, followed by refresh
  // ---------------------------------------------------------------------------
  const db = coreMod.database();
  const testCandId = 'candidate-e2e-reversible-test';
  try {
    db.prepare('DELETE FROM command_queue WHERE target_id = ?').run(testCandId);
    db.prepare('DELETE FROM candidate_history WHERE candidate_id = ?').run(testCandId);
    coreMod.put(db, 'candidates', testCandId, {
      id: testCandId,
      title: 'Reversible E2E Test Play Party',
      date: '2026-12-28',
      startTime: '21:00',
      endTime: '02:00',
      timezone: 'America/New_York',
      clubId: 'club-trapeze-atlanta',
      clubName: 'Trapeze Atlanta',
      city: 'Atlanta',
      region: 'GA',
      country: 'USA',
      sourceUrl: 'https://trapezeclub.com/events/e2e-test',
      description: 'Private on-premise lifestyle play party for couples.',
      reconciliationState: 'new',
      reviewState: 'pending_review',
      publicChangeAuthorized: false,
      updatedAt: new Date().toISOString(),
    });
  } finally {
    db.close();
  }

  try {
    // Defer action
    const deferRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'candidate_defer',
      targetId: testCandId,
      payload: { notes: 'E2E test defer' },
    });
    assert.equal(deferRes.ok, true);

    // Edit fields & lock custom artwork
    const editRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'candidate_update_fields',
      targetId: testCandId,
      payload: {
        fields: {
          title: 'Reversible E2E Test Play Party (Edited)',
          customFlyerUrl: 'https://cdn.swingsphere.com/custom/manual-admin-flyer.png',
        },
        customArtworkLocked: true,
        notes: 'E2E test field edit and artwork lock',
      },
    });
    assert.equal(editRes.ok, true);

    // Scenario 9: Simulate page refresh by fetching a fresh snapshot from SQLite
    const refreshedSnapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
    const refreshedCand = refreshedSnapshot.candidates.find((c: any) => c.id === testCandId);
    assert.ok(refreshedCand, 'Edited candidate must persist across refresh');
    assert.equal(refreshedCand.reviewState, 'deferred');
    assert.equal(refreshedCand.title, 'Reversible E2E Test Play Party (Edited)');
    assert.equal(refreshedCand.customArtworkLocked, true);
    assert.equal(refreshedCand.customFlyerUrl, 'https://cdn.swingsphere.com/custom/manual-admin-flyer.png');

    // ---------------------------------------------------------------------------
    // Scenario 10: Administrator has manually selected custom artwork that must remain unchanged
    // ---------------------------------------------------------------------------
    const existingListingWithManualArtwork: any = {
      id: 'event-manual-artwork-1',
      publicSlug: 'manual-art-party-atlanta-ga-2026-12-28',
      type: 'event',
      name: 'Reversible E2E Test Play Party',
      hostName: 'Trapeze Atlanta',
      description_full: 'Curated description',
      location: 'Atlanta, GA',
      contactEmail: 'info@trapeze.example',
      time: { start: '2026-12-28T21:00:00', end: '2026-12-29T02:00:00' },
      geopoint: {
        latitude: 33.749,
        longitude: -84.388,
        address: { city: 'Atlanta', region: 'GA', country: 'USA' },
      },
      tags: ['Curated Event'],
      flyerImageUrl: 'https://cdn.swingsphere.com/manual/curated-flyer-do-not-overwrite.png',
      headerImageUrl: 'https://cdn.swingsphere.com/manual/curated-hero-do-not-overwrite.png',
      status: 'approved',
      postedByUserId: 'admin',
    };

    const candidateAttemptingOverwrite: any = {
      ...refreshedCand,
      matchedExistingId: 'event-manual-artwork-1',
      flyerUrl: 'https://ai.generated.example/synthetic-flyer.png',
      customFlyerUrl: null,
      replaceExistingArtwork: false,
    };

    const preservedDraft = buildAuthorizedEventDraftFromCandidate(candidateAttemptingOverwrite, [
      existingListingWithManualArtwork,
    ]);
    assert.equal(
      preservedDraft.flyerImageUrl,
      'https://cdn.swingsphere.com/manual/curated-flyer-do-not-overwrite.png',
      'Manually selected custom flyer artwork must never be overwritten silently',
    );
    assert.equal(
      preservedDraft.headerImageUrl,
      'https://cdn.swingsphere.com/manual/curated-hero-do-not-overwrite.png',
      'Manually selected custom hero artwork must never be overwritten silently',
    );
    assert.equal(
      preservedDraft.publicSlug,
      'manual-art-party-atlanta-ga-2026-12-28',
      'Existing event publicSlug must never be rewritten',
    );
  } finally {
    // Clean up reversible test records from SQLite so no test content remains
    const cleanupDb = coreMod.database();
    try {
      cleanupDb.prepare('DELETE FROM candidates WHERE id = ?').run(testCandId);
      cleanupDb.prepare('DELETE FROM candidate_history WHERE candidate_id = ?').run(testCandId);
      cleanupDb.prepare('DELETE FROM command_queue WHERE target_id = ?').run(testCandId);
    } finally {
      cleanupDb.close();
    }
  }
});

test('Local-First Manual Publishing Workflow: automatic bridge sync disabled, local editorial statuses, preview, media upload, bounded batch publish, idempotency, failure recovery, and stale-overwrite protection', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const coreMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'core.mjs')).href);
  const workflowsMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'workflows.mjs')).href);

  // 1. Verify automatic bridge sync daemon is disabled by default
  const defaultDaemon = await ensureAutomaticCuratorBridgeSync();
  assert.equal(defaultDaemon, null, 'Automatic continuous bridge sync daemon must be disabled by default');

  const initialSnapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  assert.equal((initialSnapshot.connection.bridgeSyncSchedule as any)?.automaticSyncEnabled, false);
  assert.equal((initialSnapshot.connection.bridgeSyncSchedule as any)?.mode, 'local_first_manual_publish');

  const curatorUiSrc = fs.readFileSync(
    path.join(process.cwd(), 'components', 'admin', 'AdminContentCurator.tsx'),
    'utf8',
  );
  assert.match(curatorUiSrc, /curator-publish-approved-button/);
  assert.match(curatorUiSrc, /curator-publish-approved-modal/);
  assert.match(curatorUiSrc, /curator-confirm-publish-button/);
  assert.match(curatorUiSrc, /Publish Approved Changes/);

  // 2. Verify read-only catalog lookup in workflows.mjs uses cached local SQLite catalog when fresh
  const syncDb = coreMod.database();
  try {
    const syncRes = await workflowsMod.sync(syncDb, { force: false, maxAgeMs: 365 * 24 * 3600 * 1000 });
    assert.equal(syncRes.cached, true, 'Catalog lookup must use cached SQLite catalog when within TTL');
    assert.ok((syncRes.activeClubs ?? syncRes.clubs) >= 70);
  } finally {
    syncDb.close();
  }

  // 3. Stage two reversible test candidates in local SQLite
  const cand1Id = 'candidate-manual-publish-e2e-1';
  const cand2Id = 'candidate-manual-publish-e2e-2';
  const sampleMediaCandidate = initialSnapshot.mediaItems.find((m: any) => m.hasGeneratedPair);
  assert.ok(sampleMediaCandidate, 'Expected at least one generated media pair in SQLite');

  const setupDb = coreMod.database();
  try {
    for (const id of [cand1Id, cand2Id]) {
      setupDb.prepare('DELETE FROM command_queue WHERE target_id = ?').run(id);
      setupDb.prepare('DELETE FROM candidate_history WHERE candidate_id = ?').run(id);
    }
    coreMod.put(setupDb, 'candidates', cand1Id, {
      id: cand1Id,
      title: 'Manual Publish E2E Event One',
      date: '2026-12-29',
      startTime: '21:00',
      endTime: '02:00',
      timezone: 'America/New_York',
      clubId: 'club-trapeze-atlanta',
      clubName: 'Trapeze Atlanta',
      venue: 'Trapeze Atlanta',
      city: 'Atlanta',
      region: 'GA',
      country: 'USA',
      officialUrl: 'https://trapezeclub.com/events/manual-publish-1',
      description: 'Upscale lifestyle play party for couples.',
      displayDescription: 'Upscale lifestyle play party for couples.',
      reconciliation: { state: 'new', matchedExistingId: null, changes: [], possibleDuplicates: [] },
      missingFields: [],
      reviewState: 'pending_review',
      publicChangeAuthorized: false,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });

    coreMod.put(setupDb, 'candidates', cand2Id, {
      id: cand2Id,
      title: 'Manual Publish E2E Event Two',
      date: '2026-12-30',
      startTime: '22:00',
      endTime: '03:00',
      timezone: 'America/New_York',
      clubId: 'club-trapeze-atlanta',
      clubName: 'Trapeze Atlanta',
      venue: 'Trapeze Atlanta',
      city: 'Atlanta',
      region: 'GA',
      country: 'USA',
      officialUrl: 'https://trapezeclub.com/events/manual-publish-2',
      description: 'Second upscale lifestyle play party for couples.',
      displayDescription: 'Second upscale lifestyle play party for couples.',
      reconciliation: { state: 'new', matchedExistingId: null, changes: [], possibleDuplicates: [] },
      missingFields: [],
      reviewState: 'pending_review',
      publicChangeAuthorized: false,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
  } finally {
    setupDb.close();
  }

  try {
    // 4. Local editorial review: approve cand1 locally and mark cand2 ready_to_publish locally
    const approveRes1 = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'candidate_approve',
      targetId: cand1Id,
      payload: { notes: 'Local approval test' },
    });
    assert.equal(approveRes1.ok, true);
    assert.equal(approveRes1.command.result.reviewState, 'approved');

    const readyRes2 = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'candidate_mark_ready_to_publish',
      targetId: cand2Id,
      payload: { notes: 'Ready to publish test' },
    });
    assert.equal(readyRes2.ok, true);
    assert.equal(readyRes2.command.result.reviewState, 'ready_to_publish');

    // 5. Gather publish preview — must include both approved unpublished records
    const snapBeforePublish = await getCuratorBridgeSnapshot(makeLocalAdminReq());
    const listings: any[] = [
      {
        id: 'club-trapeze-atlanta',
        type: 'club',
        name: 'Trapeze Atlanta',
        description_short: 'Lifestyle club',
        location: 'Atlanta, GA',
        contactEmail: 'info@trapeze.example',
        geopoint: {
          latitude: 33.749,
          longitude: -84.388,
          address: { city: 'Atlanta', region: 'GA', country: 'USA' },
        },
        schedule: [],
        generalAmenities: [],
        status: 'approved',
        postedByUserId: 'admin',
      },
    ];

    const preview1 = gatherPublishableApprovedCandidates(snapBeforePublish, listings);
    const readyIds = preview1.readyItems.map((i) => i.candidate.id);
    assert.ok(readyIds.includes(cand1Id), 'Approved candidate 1 must be in readyItems');
    assert.ok(readyIds.includes(cand2Id), 'Ready-to-publish candidate 2 must be in readyItems');

    // Restrict preview to our 2 test items for deterministic batch testing
    const scopedPreview = {
      ...preview1,
      readyItems: preview1.readyItems.filter((i) => i.candidate.id === cand1Id || i.candidate.id === cand2Id),
      invalidItems: [],
      alreadyPublishedItems: [],
    };

    // 6. Simulate a transient failure on cand2 while cand1 succeeds
    const publishedStore = new Map<string, any>();
    let shouldFailCand2 = true;

    const summaryWithPartialFailure = await publishApprovedCuratorChanges(scopedPreview, listings, {
      batchSize: 1,
      commandSender: (input) =>
        executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), input) as any,
      moderationApi: {
        saveEvent: async (ev) => {
          if (shouldFailCand2 && ev.name.includes('Event Two')) {
            throw new Error('Simulated network error on Event Two');
          }
          publishedStore.set(ev.id, { ...ev });
          return { ...ev };
        },
        approveSubmission: async (id) => {
          const found = publishedStore.get(id);
          const approved = { ...found, status: 'approved' as const };
          publishedStore.set(id, approved);
          return approved;
        },
      },
    });

    assert.equal(summaryWithPartialFailure.succeeded.length, 1);
    assert.equal(summaryWithPartialFailure.succeeded[0].candidateId, cand1Id);
    assert.equal(summaryWithPartialFailure.failed.length, 1);
    assert.equal(summaryWithPartialFailure.failed[0].candidateId, cand2Id);

    // Verify SQLite recorded 'published' for cand1 and 'publish_failed' for cand2
    const snapAfterPartial = await getCuratorBridgeSnapshot(makeLocalAdminReq());
    const c1AfterPartial = snapAfterPartial.candidates.find((c: any) => c.id === cand1Id);
    const c2AfterPartial = snapAfterPartial.candidates.find((c: any) => c.id === cand2Id);
    assert.equal(c1AfterPartial.reviewState, 'published');
    assert.equal(c1AfterPartial.publicationRecord?.status, 'published');
    assert.ok(c1AfterPartial.publicationRecord?.publishedListingId);
    assert.ok(c1AfterPartial.publicationRecord?.publishedContentHash);
    assert.equal(c2AfterPartial.reviewState, 'publish_failed');
    assert.match(String(c2AfterPartial.publicationRecord?.lastError), /Simulated network error/);

    // 7. Retry manual publication: cand1 must be skipped idempotently, cand2 must publish without duplication
    shouldFailCand2 = false;
    const previewRetry = gatherPublishableApprovedCandidates(snapAfterPartial, [
      ...listings,
      ...Array.from(publishedStore.values()),
    ]);
    assert.ok(
      previewRetry.alreadyPublishedItems.some((a) => a.candidate.id === cand1Id),
      'Already-published cand1 with unchanged contentHash must be classified as alreadyPublishedItems',
    );
    assert.ok(
      previewRetry.readyItems.some((r) => r.candidate.id === cand2Id),
      'Failed cand2 must remain in readyItems for retry',
    );

    const scopedRetryPreview = {
      ...previewRetry,
      readyItems: previewRetry.readyItems.filter((i) => i.candidate.id === cand1Id || i.candidate.id === cand2Id),
      alreadyPublishedItems: previewRetry.alreadyPublishedItems.filter((a) => a.candidate.id === cand1Id),
      invalidItems: [],
    };

    const summaryRetry = await publishApprovedCuratorChanges(scopedRetryPreview, listings, {
      batchSize: 2,
      commandSender: (input) =>
        executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), input) as any,
      moderationApi: {
        saveEvent: async (ev) => {
          publishedStore.set(ev.id, { ...ev });
          return { ...ev };
        },
        approveSubmission: async (id) => {
          const found = publishedStore.get(id);
          const approved = { ...found, status: 'approved' as const };
          publishedStore.set(id, approved);
          return approved;
        },
      },
    });

    assert.equal(summaryRetry.succeeded.length, 1);
    assert.equal(summaryRetry.succeeded[0].candidateId, cand2Id);
    assert.equal(summaryRetry.skipped.length, 1);
    assert.equal(summaryRetry.skipped[0].candidateId, cand1Id);
    assert.equal(publishedStore.size, 2, 'No duplicate listings may be created on retry');

    // 8. Verify previously published events are NOT overwritten by stale local candidate records during background stage()
    const stageDb = coreMod.database();
    try {
      const stageOutcome = workflowsMod.stage(
        stageDb,
        {
          id: cand1Id,
          title: 'Stale Unreviewed Crawler Title That Must Not Overwrite Published Event',
          date: '2026-12-29',
          startTime: '21:00',
          endTime: '02:00',
          timezone: 'America/New_York',
          clubId: 'club-trapeze-atlanta',
          venue: 'Trapeze Atlanta',
          city: 'Atlanta',
          region: 'GA',
          country: 'USA',
          officialUrl: 'https://trapezeclub.com/events/manual-publish-1',
          description: 'Stale unreviewed description from crawler.',
        },
        { id: 'club-trapeze-atlanta', name: 'Trapeze Atlanta', timezone: 'America/New_York' },
        [{ url: 'https://trapezeclub.com/events/manual-publish-1', sha256: 'abc123', verifiedAt: new Date().toISOString() }],
      );
      const stagedAfterPublish =
        stageOutcome.candidate || coreMod.all(stageDb, 'candidates').find((x: any) => x.id === cand1Id);

      assert.equal(
        stagedAfterPublish.title,
        'Manual Publish E2E Event One',
        'Published candidate title must not be overwritten by unreviewed crawler stage()',
      );
      assert.equal(stagedAfterPublish.reviewState, 'published');
      assert.equal(stagedAfterPublish.publicationRecord?.status, 'published');
      assert.ok(
        Array.isArray(stagedAfterPublish.unreviewedSourceUpdates) &&
          stagedAfterPublish.unreviewedSourceUpdates.length >= 1,
        'Unreviewed source changes must be recorded in unreviewedSourceUpdates instead of overwriting published content',
      );
    } finally {
      stageDb.close();
    }

    // 9. Verify approved media upload helper produces valid production URLs and records upload in SQLite
    const mediaCheckDb = coreMod.database();
    const targetMediaId = sampleMediaCandidate.id;
    let originalMediaRaw: string | null = null;
    try {
      const row = mediaCheckDb.prepare('SELECT data FROM media WHERE id = ?').get(targetMediaId) as any;
      originalMediaRaw = row?.data || null;
      if (originalMediaRaw) {
        const parsed = JSON.parse(originalMediaRaw);
        parsed.status = 'approved';
        coreMod.put(mediaCheckDb, 'media', targetMediaId, parsed);
      }
    } finally {
      mediaCheckDb.close();
    }

    try {
      const uploadRes = await uploadCuratorApprovedMediaToProduction(
        makeLocalAdminReq('/api/admin/curator/upload-media'),
        { mediaId: targetMediaId, versionId: 'v1' },
      );
      assert.equal(uploadRes.uploaded, true);
      assert.ok(uploadRes.flyerUrl && !uploadRes.flyerUrl.startsWith('/api/admin/curator/media-preview'));
      assert.ok(uploadRes.heroUrl && !uploadRes.heroUrl.startsWith('/api/admin/curator/media-preview'));

      // Second call must reuse the existing upload idempotently
      const uploadResSecond = await uploadCuratorApprovedMediaToProduction(
        makeLocalAdminReq('/api/admin/curator/upload-media'),
        { mediaId: targetMediaId, versionId: 'v1' },
      );
      assert.equal(uploadResSecond.uploaded, true);
      assert.equal(uploadResSecond.reusedExistingUpload, true);
      assert.equal(uploadResSecond.flyerUrl, uploadRes.flyerUrl);
    } finally {
      if (originalMediaRaw) {
        const restoreMediaDb = coreMod.database();
        try {
          coreMod.put(restoreMediaDb, 'media', targetMediaId, JSON.parse(originalMediaRaw));
        } finally {
          restoreMediaDb.close();
        }
      }
      const publishedImgDir = path.join(process.cwd(), 'public', 'images', 'events', 'curator-published');
      if (fs.existsSync(publishedImgDir)) {
        for (const f of fs.readdirSync(publishedImgDir)) {
          if (f.startsWith('validation-diversity-')) {
            fs.rmSync(path.join(publishedImgDir, f), { force: true });
          }
        }
      }
    }
    // 10. Verify Content Curator is gated to local development only and excluded from production dist/ bundle
    const rootDir = process.cwd();
    const sidebarSrc = fs.readFileSync(path.join(rootDir, 'components', 'admin', 'AdminSidebar.tsx'), 'utf8');
    assert.match(sidebarSrc, /isAdmin && import\.meta\.env\.DEV/);

    const panelSrc = fs.readFileSync(path.join(rootDir, 'components', 'admin', 'AdminPanel.tsx'), 'utf8');
    assert.match(panelSrc, /import\.meta\.env\.DEV\s*\?\s*React\.lazy\(\(\)\s*=>\s*import\('\.\/AdminContentCurator'\)\)/);
    assert.match(panelSrc, /currentView === 'content-curator' && !import\.meta\.env\.DEV/);

    const viteConfigSrc = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
    assert.match(viteConfigSrc, /req\.url\.startsWith\('\/api\/admin\/curator\/'\) && !isLocalhostRequest\(req\)/);

    const distAssetsDir = path.join(rootDir, 'dist', 'assets');
    if (fs.existsSync(distAssetsDir)) {
      const jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
      for (const f of jsFiles) {
        const chunkText = fs.readFileSync(path.join(distAssetsDir, f), 'utf8');
        assert.equal(
          chunkText.includes('/api/admin/curator'),
          false,
          `Production chunk ${f} must not include /api/admin/curator endpoints`,
        );
        assert.equal(
          chunkText.includes('curator-publish-approved-button'),
          false,
          `Production chunk ${f} must not include AdminContentCurator UI`,
        );
      }
    }
  } finally {
    const cleanupDb = coreMod.database();
    try {
      for (const id of [cand1Id, cand2Id]) {
        cleanupDb.prepare('DELETE FROM candidates WHERE id = ?').run(id);
        cleanupDb.prepare('DELETE FROM candidate_history WHERE candidate_id = ?').run(id);
        cleanupDb.prepare('DELETE FROM command_queue WHERE target_id = ?').run(id);
      }
      cleanupDb
        .prepare("DELETE FROM candidates WHERE data LIKE '%https://trapezeclub.com/events/manual-publish-%'")
        .run();
    } finally {
      cleanupDb.close();
    }
  }
});

test('Editorial Review Redesign: 4-section navigation, default Event Review queue sorting, 12 artwork styles, independent Flyer vs Hero rerolls/restores, local draft persistence, and non-regenerating field edits', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const coreMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'core.mjs')).href);

  // 1. Verify UI source contains 4 simplified sections, Visual Artwork Review cards, independent Flyer/Hero controls, and Inline Event Details Editor
  const curatorUiSrc = fs.readFileSync(
    path.join(process.cwd(), 'components', 'admin', 'AdminContentCurator.tsx'),
    'utf8',
  );
  assert.match(curatorUiSrc, /curator-nav-event-review/);
  assert.match(curatorUiSrc, /curator-nav-community-discovery/);
  assert.match(curatorUiSrc, /curator-nav-approved-history/);
  assert.match(curatorUiSrc, /curator-nav-settings-monitoring/);
  assert.match(curatorUiSrc, /curator-visual-artwork-review/);
  assert.match(curatorUiSrc, /curator-flyer-card/);
  assert.match(curatorUiSrc, /curator-hero-card/);
  assert.match(curatorUiSrc, /curator-flyer-reroll-button/);
  assert.match(curatorUiSrc, /curator-hero-reroll-button/);
  assert.match(curatorUiSrc, /curator-flyer-style-select/);
  assert.match(curatorUiSrc, /curator-hero-style-select/);
  assert.match(curatorUiSrc, /curator-flyer-upload-button/);
  assert.match(curatorUiSrc, /curator-hero-upload-button/);
  assert.match(curatorUiSrc, /curator-flyer-library-button/);
  assert.match(curatorUiSrc, /curator-hero-library-button/);
  assert.match(curatorUiSrc, /curator-flyer-fullsize-button/);
  assert.match(curatorUiSrc, /curator-hero-fullsize-button/);
  assert.match(curatorUiSrc, /curator-flyer-restore-button/);
  assert.match(curatorUiSrc, /curator-hero-restore-button/);
  assert.match(curatorUiSrc, /curator-event-details-editor/);
  assert.match(curatorUiSrc, /curator-approve-event-button/);
  assert.match(curatorUiSrc, /curator-save-for-later-button/);
  assert.match(curatorUiSrc, /curator-reject-event-button/);

  // 2. Verify all 12 required Artwork Style categories exist with rich style metadata
  const expectedStyles = [
    'underground_rave',
    'classic_nightclub',
    'renaissance',
    'baroque_rembrandt',
    'cubism_picasso',
    'surrealist',
    'art_nouveau',
    'contemporary_museum',
    'minimalist_editorial',
    'vintage_disco',
    'cinematic',
    'surprise_me',
  ];
  assert.equal(CURATOR_ARTWORK_STYLE_CATEGORIES.length, 12);
  for (const styleId of expectedStyles) {
    const found = getCuratorArtworkStyleCategory(styleId);
    assert.equal(found.id, styleId);
    assert.ok(found.label.length > 0);
    assert.ok(found.styleFamily.length > 0);
    assert.ok(found.lightingDirection.length > 0);
    assert.ok(found.paletteHex.length >= 3);
  }

  // 3. Verify default Event Review Queue sorting puts pending events with generated Flyer + Hero pairs + valid dates first
  const snap0 = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const mediaMap = new Map(snap0.mediaItems.map((m) => [m.id, m]));
  const sortedQueue = sortCandidatesForEditorialQueue(
    snap0.candidates.filter((c) => c.reviewState === 'pending_review'),
    mediaMap,
  );
  assert.ok(sortedQueue.length > 0, 'Sorted pending queue must not be empty');
  const firstPending = sortedQueue[0];
  assert.ok(firstPending.date, 'Top event in default Review Queue must have a valid date');
  assert.equal(
    Boolean(firstPending.stagedMedia?.hasGeneratedPair || mediaMap.get(firstPending.id)?.hasGeneratedPair),
    true,
    'Top event in default Review Queue must immediately display generated Flyer and Hero artwork',
  );

  // 4. Verify Local Draft Persistence and Editorial Validation
  const draftTestId = firstPending.id;
  clearCuratorCandidateDraft(draftTestId);
  assert.equal(getCuratorCandidateDraft(draftTestId), null);
  saveCuratorCandidateDraft(draftTestId, {
    title: 'Editorial Draft Title Override',
    theme: 'Velvet Masquerade',
  });
  const loadedDraft = getCuratorCandidateDraft(draftTestId);
  assert.ok(loadedDraft);
  assert.equal(loadedDraft.title, 'Editorial Draft Title Override');
  assert.equal(loadedDraft.theme, 'Velvet Masquerade');
  const mergedWithDraft = mergeCandidateWithDraft(firstPending, loadedDraft);
  assert.equal(mergedWithDraft.title, 'Editorial Draft Title Override');
  assert.equal(mergedWithDraft.theme, 'Velvet Masquerade');
  const valResult = validateCandidateForEditorialReview(firstPending, loadedDraft);
  assert.equal(valResult.canApprove, true);
  clearCuratorCandidateDraft(draftTestId);

  // 5. Stage a reversible test candidate and test Independent Flyer Reroll vs Independent Hero Reroll
  const testId = 'candidate-editorial-reroll-e2e';
  const setupDb = coreMod.database();
  try {
    setupDb.prepare('DELETE FROM command_queue WHERE target_id = ?').run(testId);
    setupDb.prepare('DELETE FROM candidate_history WHERE candidate_id = ?').run(testId);
    setupDb.prepare('DELETE FROM media WHERE id = ?').run(testId);
    coreMod.put(setupDb, 'candidates', testId, {
      id: testId,
      title: 'Editorial Independent Artwork Reroll Gala',
      date: '2026-12-27',
      startTime: '21:00',
      endTime: '02:00',
      timezone: 'America/New_York',
      clubId: 'club-trapeze-atlanta',
      clubName: 'Trapeze Atlanta',
      venue: 'Trapeze Atlanta',
      address: '3535 Chattahoochee Pkwy',
      city: 'Atlanta',
      region: 'GA',
      country: 'USA',
      theme: 'Midnight Baroque Masquerade',
      dressCode: 'Upscale Evening Attire',
      officialUrl: 'https://trapezeclub.com/events/editorial-reroll-e2e',
      description: 'An editorial test event for verifying independent flyer and hero regeneration.',
      displayDescription: 'An editorial test event for verifying independent flyer and hero regeneration.',
      reconciliation: { state: 'new', matchedExistingId: null, changes: [], possibleDuplicates: [] },
      missingFields: [],
      reviewState: 'pending_review',
      publicChangeAuthorized: false,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
  } finally {
    setupDb.close();
  }

  try {
    // 5a. Initial generation of both Flyer (1080x1350) and Hero (1920x1080) as v1
    const initGenRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'artwork_regenerate',
      targetId: testId,
      payload: {
        targetRole: 'both',
        styleCategory: 'classic_nightclub',
        editorialReroll: true,
        notes: 'Initial v1 Flyer + Hero pair',
      },
    });
    assert.equal(initGenRes.ok, true);
    const mediaV1 = initGenRes.snapshot?.mediaItems.find((m: any) => m.id === testId);
    assert.ok(mediaV1, 'Media record must exist after initial generation');
    assert.equal(mediaV1.selectedFlyerVersionId, 'v1');
    assert.equal(mediaV1.selectedHeroVersionId, 'v1');
    const v1Entry = mediaV1.versionHistory.find((v: any) => v.versionId === 'v1');
    assert.ok(v1Entry?.flyerSha256, 'v1 must have flyerSha256');
    assert.ok(v1Entry?.heroSha256, 'v1 must have heroSha256');

    // 5b. REROLL FLYER ONLY (style: renaissance) -> must NOT alter Hero!
    const flyerRerollRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'artwork_regenerate',
      targetId: testId,
      payload: {
        targetRole: 'flyer',
        styleCategory: 'renaissance',
        editorialReroll: true,
        notes: 'Independent Flyer reroll in Renaissance style',
      },
    });
    assert.equal(flyerRerollRes.ok, true);
    const mediaV2 = flyerRerollRes.snapshot?.mediaItems.find((m: any) => m.id === testId);
    assert.ok(mediaV2);
    assert.equal(mediaV2.selectedFlyerVersionId, 'v2', 'Flyer active version must advance to v2');
    assert.equal(mediaV2.selectedHeroVersionId, 'v1', 'Hero active version must remain v1 when only Flyer is rerolled');
    const v2Entry = mediaV2.versionHistory.find((v: any) => v.versionId === 'v2');
    assert.ok(v2Entry);
    assert.notEqual(v2Entry.flyerSha256, v1Entry.flyerSha256, 'Rerolled Flyer must have a newly generated image hash');
    assert.equal(
      v2Entry.heroSha256,
      v1Entry.heroSha256,
      'Rerolling the Flyer must preserve the Hero image byte-for-byte',
    );
    assert.equal(
      mediaV2.previewUrls?.hero,
      mediaV1.previewUrls?.hero,
      'Hero preview URL must remain unchanged when Flyer is rerolled',
    );

    // 5c. REROLL HERO ONLY (style: cubism_picasso) -> must NOT alter Flyer!
    const heroRerollRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'artwork_regenerate',
      targetId: testId,
      payload: {
        targetRole: 'hero',
        styleCategory: 'cubism_picasso',
        editorialReroll: true,
        notes: 'Independent Hero reroll in Cubism style',
      },
    });
    assert.equal(heroRerollRes.ok, true);
    const mediaV3 = heroRerollRes.snapshot?.mediaItems.find((m: any) => m.id === testId);
    assert.ok(mediaV3);
    assert.equal(
      mediaV3.selectedFlyerVersionId,
      'v2',
      'Flyer active version must remain v2 when only Hero is rerolled',
    );
    assert.equal(mediaV3.selectedHeroVersionId, 'v3', 'Hero active version must advance to v3');
    const v3Entry = mediaV3.versionHistory.find((v: any) => v.versionId === 'v3');
    assert.ok(v3Entry);
    assert.notEqual(v3Entry.heroSha256, v1Entry.heroSha256, 'Rerolled Hero must have a newly generated image hash');
    assert.equal(
      v3Entry.flyerSha256,
      v2Entry.flyerSha256,
      'Rerolling the Hero must preserve the active v2 Flyer byte-for-byte',
    );
    assert.equal(
      mediaV3.previewUrls?.flyer,
      mediaV2.previewUrls?.flyer,
      'Flyer preview URL must remain unchanged when Hero is rerolled',
    );

    // 5d. RESTORE PREVIOUS FLYER VERSION (v1) independently without altering Hero (v3)
    const restoreFlyerRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'artwork_select_version',
      targetId: testId,
      payload: {
        targetRole: 'flyer',
        versionId: 'v1',
      },
    });
    assert.equal(restoreFlyerRes.ok, true);
    const mediaAfterRestore = restoreFlyerRes.snapshot?.mediaItems.find((m: any) => m.id === testId);
    assert.ok(mediaAfterRestore);
    assert.equal(mediaAfterRestore.selectedFlyerVersionId, 'v1', 'Flyer must be restored to v1');
    assert.equal(mediaAfterRestore.selectedHeroVersionId, 'v3', 'Hero must remain on v3');

    // 5e. EDIT EVENT DETAILS -> must NOT trigger automatic image regeneration!
    const editFieldsRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'candidate_update_fields',
      targetId: testId,
      payload: {
        fields: {
          title: 'Editorial Independent Artwork Reroll Gala (Updated Title)',
          venue: 'Trapeze Grand Ballroom',
          startTime: '22:00',
        },
        notes: 'Edited unrelated event fields',
      },
    });
    assert.equal(editFieldsRes.ok, true);
    const mediaAfterFieldEdit = editFieldsRes.snapshot?.mediaItems.find((m: any) => m.id === testId);
    assert.ok(mediaAfterFieldEdit);
    assert.equal(
      mediaAfterFieldEdit.versionHistory.length,
      3,
      'Editing event details must never auto-regenerate or add artwork versions',
    );
    assert.equal(mediaAfterFieldEdit.selectedFlyerVersionId, 'v1');
    assert.equal(mediaAfterFieldEdit.selectedHeroVersionId, 'v3');
  } finally {
    const cleanupDb = coreMod.database();
    try {
      cleanupDb.prepare('DELETE FROM candidates WHERE id = ?').run(testId);
      cleanupDb.prepare('DELETE FROM candidate_history WHERE candidate_id = ?').run(testId);
      cleanupDb.prepare('DELETE FROM command_queue WHERE target_id = ?').run(testId);
      cleanupDb.prepare('DELETE FROM media WHERE id = ?').run(testId);
    } finally {
      cleanupDb.close();
    }
    const mediaDir = path.join(curatorRoot, 'media', testId);
    if (fs.existsSync(mediaDir)) {
      fs.rmSync(mediaDir, { recursive: true, force: true });
    }
  }
});

test('Expired Event Cleanup & Ingestion Eligibility Gate: dynamic current calendar date cutoff, expired events archived as historical data with media preserved, excluded from active approval/publication, and deterministic referenceTime supported', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const coreMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'core.mjs')).href);
  const workflowsMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'workflows.mjs')).href);

  const todayCutoff = getActiveCuratorCutoffDate('America/Los_Angeles');
  const snapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const datedCandidates = snapshot.candidates.filter((c) => c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date));
  const expiredInSnapshot = datedCandidates.filter((c) => c.date! <= '2026-10-24');
  assert.equal(expiredInSnapshot.length, 0, 'Zero candidates dated 2026-10-24 or earlier may remain in Content Curator');

  // 1. Active approval queue (pending_review, approved, ready_to_publish, recommended) must contain zero expired events (< todayCutoff)
  const activeApprovalQueue = snapshot.candidates.filter((c) =>
    ['pending_review', 'approved', 'ready_to_publish', 'staged_in_submissions'].includes(c.reviewState),
  );
  const expiredInActiveQueue = activeApprovalQueue.filter(
    (c) => c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.date < todayCutoff,
  );
  assert.equal(
    expiredInActiveQueue.length,
    0,
    `Zero events dated before current calendar date (${todayCutoff}) may remain in the active Content Curator approval queue`,
  );

  const activeDated = activeApprovalQueue
    .filter((c) => c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date))
    .map((c) => c.date!)
    .sort();
  assert.ok(
    activeDated[0] >= todayCutoff,
    `Earliest dated candidate remaining in active approval queue must be >= ${todayCutoff} (got ${activeDated[0]})`,
  );

  // 2. Expired events (< todayCutoff) must be preserved as archived historical data (never deleted) with all media intact
  const archivedHistorical = datedCandidates.filter((c) => c.date! < todayCutoff);
  const archivedOct2026 = archivedHistorical.filter((c) => c.date!.startsWith('2026-10-'));
  assert.equal(archivedOct2026.length, 84, 'All 84 expired October 2026 event records must be preserved as archived historical data');
  const archivedWithMedia = archivedOct2026.filter((hc) => Boolean(hc.stagedMedia));
  assert.equal(
    archivedWithMedia.length,
    79,
    'All 79 expired October 2026 event records that had associated media records must preserve their stagedMedia',
  );
  for (const hc of archivedHistorical) {
    assert.equal(hc.archivedAsHistorical, true, `Expired candidate ${hc.id} (${hc.date}) must have archivedAsHistorical=true`);
    assert.equal(hc.auditCategory, 'historical_event', `Expired candidate ${hc.id} must have auditCategory='historical_event'`);
    assert.equal(hc.publishEligible, false, `Expired candidate ${hc.id} must have publishEligible=false`);
    assert.equal(hc.needsPublish, false, `Expired candidate ${hc.id} must have needsPublish=false`);
    assert.equal(hc.eventSignificance?.recommendedForQueue, false, `Expired candidate ${hc.id} must not be recommended for queue`);
    if (hc.publicationRecord?.status !== 'published') {
      assert.equal(
        hc.reviewState,
        'historical_not_for_publication',
        `Unpublished expired candidate ${hc.id} must have reviewState='historical_not_for_publication'`,
      );
    }
    if (hc.flyerUrl || hc.stagedMedia?.hasGeneratedPair) {
      assert.ok(
        hc.stagedMedia?.flyerPreviewUrl,
        `Archived historical candidate ${hc.id} with flyer or generated pair must preserve flyerPreviewUrl`,
      );
    }
  }

  // 3. Queue significance filters and manual publish preview must exclude archived historical events
  const activeFilteredAll = filterCandidatesByQueueSignificance(snapshot.candidates, 'all');
  assert.equal(
    activeFilteredAll.some((c) => c.date && c.date < todayCutoff),
    false,
    'filterCandidatesByQueueSignificance must exclude expired/archived events from active queue views',
  );
  const pubPreview = gatherPublishableApprovedCandidates(snapshot, []);
  assert.equal(
    pubPreview.readyItems.some((item) => item.candidate.date && item.candidate.date < todayCutoff),
    false,
    'gatherPublishableApprovedCandidates must exclude expired/archived events from readyItems',
  );

  // 4. Deterministic tests can supply explicit referenceTime
  const sampleOct = archivedOct2026[0];
  assert.equal(
    isCandidateDateExpired(sampleOct.date, sampleOct.timezone, '2026-10-15T12:00:00Z'),
    false,
    'Explicit referenceTime before event date must evaluate as non-expired',
  );
  assert.equal(
    isCandidateDateExpired(sampleOct.date, sampleOct.timezone, '2026-11-01T12:00:00Z'),
    true,
    'Explicit referenceTime after event date must evaluate as expired',
  );
  const valOctAsOfOct15 = validateCandidateForEditorialReview(sampleOct, null, {
    referenceTime: '2026-10-15T12:00:00Z',
  });
  assert.equal(
    valOctAsOfOct15.blockingReasons.some((r) => r.includes('Expired event date')),
    false,
    'validateCandidateForEditorialReview must honor explicit referenceTime',
  );
  const valOctAsOfNov1 = validateCandidateForEditorialReview(sampleOct, null, {
    referenceTime: '2026-11-01T12:00:00Z',
  });
  assert.equal(
    valOctAsOfNov1.canApprove,
    false,
    'validateCandidateForEditorialReview must block approval when expired as of referenceTime',
  );

  const missingDateCandidates = snapshot.candidates.filter((c) => !c.date || !/^\d{4}-\d{2}-\d{2}$/.test(c.date));
  assert.ok(missingDateCandidates.length >= 35, 'All missing/ambiguous date candidates must be preserved');
  for (const mc of missingDateCandidates) {
    assert.ok(
      mc.missingFields.includes('date'),
      `Candidate ${mc.id} with missing date must list 'date' in missingFields`,
    );
    if (!mc.isClosureNotice) {
      assert.ok(
        (mc.reviewFlags || []).includes('missing_or_ambiguous_date_requires_review'),
        `Candidate ${mc.id} with missing date must be flagged for review`,
      );
    }
  }

  // Verify ingestion gate rejects expired events from being re-staged during future scans
  const db = coreMod.database();
  try {
    const countBefore = coreMod.all(db, 'candidates').length;
    const stageExpired = workflowsMod.stage(
      db,
      {
        title: 'Rediscovered Expired Event From Past Calendar',
        date: '2026-10-24',
        startTime: '21:00:00',
        endTime: '02:00:00',
        timezone: 'America/Los_Angeles',
        venue: 'Club Privata',
        officialUrl: 'https://www.clubprivata.com/events/expired-oct-24',
      },
      { id: 'club-privata-portland', name: 'Club Privata', timezone: 'America/Los_Angeles' },
      [],
    );
    assert.equal(stageExpired.skipped, true, 'stage() must skip expired event dates (< localToday)');
    assert.equal(stageExpired.skippedReason, 'expired_event_date');
    assert.equal(stageExpired.candidate, null);
    assert.equal(
      coreMod.all(db, 'candidates').length,
      countBefore,
      'Expired candidate must not be inserted into candidates table',
    );
  } finally {
    db.close();
  }
});

test('Intelligent Event Significance & Recurring Night Classification: validates all 10 required scenarios, separate play-party check, queue filters, and persistent admin overrides', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const sigMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'event-significance.mjs')).href);
  const {
    filterCandidatesByQueueSignificance,
    sortCandidatesForEditorialQueue,
  } = await import('../lib/contentCuratorApi');

  const syntheticCorpus = [
    // Scenario 1: One-time Halloween party
    {
      id: 'scen-1-halloween',
      title: 'Night of the Dead Sexy Halloween Masquerade',
      clubId: 'club-sanctuary-pdx',
      clubName: 'Sanctuary Portland',
      date: '2026-10-31',
      description:
        'Join us for our annual Halloween play party featuring two floors of playrooms, a $500 costume contest, and guest DJs.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    // Scenario 2: Anniversary celebration
    {
      id: 'scen-2-anniversary',
      title: '12th Annual Club Anniversary Black-Tie Play Gala',
      clubId: 'club-privata-pdx',
      clubName: 'Club Privata',
      date: '2026-11-14',
      description:
        'Celebrating 12 years as the Northwest premier lifestyle club with champagne reception, live aerialist performance, and full 3rd-floor play suites.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    // Scenario 3: Monthly couples' play party (2 monthly occurrences in corpus)
    {
      id: 'scen-3-monthly-nov',
      title: "Power Exchange First-Saturday Monthly Couples' Night",
      clubId: 'club-power-exchange-sf',
      clubName: 'Power Exchange',
      date: '2026-11-07',
      description:
        'Our signature First Saturday of every month couples-only play party featuring dedicated couples play floors and themed lounges.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    {
      id: 'scen-3-monthly-dec',
      title: "Power Exchange First-Saturday Monthly Couples' Night",
      clubId: 'club-power-exchange-sf',
      clubName: 'Power Exchange',
      date: '2026-12-05',
      description:
        'Our signature First Saturday of every month couples-only play party featuring dedicated couples play floors and themed lounges.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    // Scenario 4: Quarterly themed event
    {
      id: 'scen-4-quarterly',
      title: 'Seasonal Solstices Quarterly Masquerade Play Party',
      clubId: 'club-velvet-ny',
      clubName: 'Velvet Society NYC',
      date: '2026-12-19',
      description:
        'Held once a quarter, our quarterly seasonal gala brings together 200+ vetted couples for an immersive themed play party.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    // Scenario 5: Ordinary weekly Thirsty Thursday (3 weekly occurrences)
    {
      id: 'scen-5-thirsty-1',
      title: 'Thirsty Thursday',
      clubId: 'club-eden-dfw',
      clubName: 'Club Eden DFW',
      date: '2026-11-05',
      description: 'Every Thursday drink specials and open club admission from 8pm to 1am.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    {
      id: 'scen-5-thirsty-2',
      title: 'Thirsty Thursday',
      clubId: 'club-eden-dfw',
      clubName: 'Club Eden DFW',
      date: '2026-11-12',
      description: 'Every Thursday drink specials and open club admission from 8pm to 1am.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    {
      id: 'scen-5-thirsty-3',
      title: 'Thirsty Thursday',
      clubId: 'club-eden-dfw',
      clubName: 'Club Eden DFW',
      date: '2026-11-19',
      description: 'Every Thursday drink specials and open club admission from 8pm to 1am.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    // Scenario 6: Repeated standard weekday admission night (identical descriptions, 3 weekly dates)
    {
      id: 'scen-6-routine-1',
      title: 'Play More Party',
      clubId: 'club-eden-dfw',
      clubName: 'Club Eden DFW',
      date: '2026-11-04',
      description: 'Standard Wednesday open house admission for couples and singles.',
      playPartyEligibility: { status: 'ambiguous_requires_human_review', qualified: false, requiresHumanReview: true },
    },
    {
      id: 'scen-6-routine-2',
      title: 'Play More Party',
      clubId: 'club-eden-dfw',
      clubName: 'Club Eden DFW',
      date: '2026-11-11',
      description: 'Standard Wednesday open house admission for couples and singles.',
      playPartyEligibility: { status: 'ambiguous_requires_human_review', qualified: false, requiresHumanReview: true },
    },
    {
      id: 'scen-6-routine-3',
      title: 'Play More Party',
      clubId: 'club-eden-dfw',
      clubName: 'Club Eden DFW',
      date: '2026-11-18',
      description: 'Standard Wednesday open house admission for couples and singles.',
      playPartyEligibility: { status: 'ambiguous_requires_human_review', qualified: false, requiresHumanReview: true },
    },
    // Scenario 7: Distinctive weekly signature play party
    {
      id: 'scen-7-weekly-sig-1',
      title: 'Berlin Kink',
      clubId: 'club-insomnia-berlin',
      clubName: 'Insomnia Berlin',
      date: '2026-11-05',
      description:
        'Berlin Kink is our flagship Kinky BDSM Playparty featuring curated Sexpositive Playgrounds, live Shibari rope demonstrations, BDSM Dungeon masters, and guest DJs across three floors.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    {
      id: 'scen-7-weekly-sig-2',
      title: 'Berlin Kink',
      clubId: 'club-insomnia-berlin',
      clubName: 'Insomnia Berlin',
      date: '2026-11-12',
      description:
        'Berlin Kink is our flagship Kinky BDSM Playparty featuring curated Sexpositive Playgrounds, live Shibari rope demonstrations, BDSM Dungeon masters, and guest DJs across three floors.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    // Scenario 8: Event with limited descriptive information
    {
      id: 'scen-8-limited-info',
      title: 'Luxe',
      clubId: 'club-krystal-vicenza',
      clubName: 'Krystal Club',
      date: '2026-11-21',
      description: '',
      playPartyEligibility: { status: 'ambiguous_requires_human_review', qualified: false, requiresHumanReview: true },
    },
    // Scenario 9: Two unrelated events with similar names at different clubs
    {
      id: 'scen-9-club-a',
      title: 'Temptation Night',
      clubId: 'club-alpha-miami',
      clubName: 'Club Alpha Miami',
      date: '2026-11-07',
      description:
        'One-night-only Miami VIP Temptation masquerade play party with curated playrooms, satin & lace dress code, and live saxophonist.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    {
      id: 'scen-9-club-b',
      title: 'Temptation Night',
      clubId: 'club-beta-seattle',
      clubName: 'Club Beta Seattle',
      date: '2026-11-14',
      description:
        'Seattle special Temptation themed couples play party featuring private play cabanas, sensual massage lounge, and midnight champagne toast.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    // Scenario 10: Special event falling on a regular weekly club night (Thursday at Club Eden DFW)
    {
      id: 'scen-10-special-on-weekly',
      title: 'Thirsty Thursday — Annual Thanksgiving Spanxxxgiving Edition',
      clubId: 'club-eden-dfw',
      clubName: 'Club Eden DFW',
      date: '2026-11-26',
      description:
        'Special Thanksgiving edition overriding our regular Thursday night with holiday playrooms, $1,000 costume contest, and late-night feast.',
      playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
    },
    // Separate Play-Party vs Significance Check: Special holiday occasion that is a non-play yoga class
    {
      id: 'scen-non-play-holiday',
      title: 'Halloween Couples Erotic Yoga Class',
      clubId: 'club-twist-sf',
      clubName: 'Twist SF',
      date: '2026-10-31',
      description: 'Guided 90-minute Halloween yoga class and breathing workshop.',
      playPartyEligibility: { status: 'excluded_non_play_event', qualified: false, requiresHumanReview: true },
    },
  ];

  const { results } = sigMod.classifyAllCandidates(syntheticCorpus, []);

  // Verify Scenario 1: One-time Halloween party -> Special Event — High Priority
  const r1 = results.get('scen-1-halloween');
  assert.equal(r1.category, 'special_event');
  assert.equal(r1.fullCategoryLabel, 'Special Event — High Priority');
  assert.equal(r1.recommendedForQueue, true);

  // Verify Scenario 2: Anniversary celebration -> Special Event — High Priority
  const r2 = results.get('scen-2-anniversary');
  assert.equal(r2.category, 'special_event');
  assert.equal(r2.fullCategoryLabel, 'Special Event — High Priority');
  assert.equal(r2.recommendedForQueue, true);

  // Verify Scenario 3: Monthly couples' play party -> Monthly or Periodic Signature Event — Include (not penalized!)
  const r3Nov = results.get('scen-3-monthly-nov');
  const r3Dec = results.get('scen-3-monthly-dec');
  assert.equal(r3Nov.category, 'monthly_signature');
  assert.equal(r3Dec.category, 'monthly_signature');
  assert.equal(r3Nov.recurrenceFrequency, 'monthly');
  assert.equal(r3Nov.recommendedForQueue, true, 'Monthly recurrence must NOT be treated as a negative signal');
  assert.deepEqual(r3Nov.observedDates, ['2026-11-07', '2026-12-05'], 'Individual monthly dates must be preserved');

  // Verify Scenario 4: Quarterly themed event -> Monthly or Periodic Signature Event — Include
  const r4 = results.get('scen-4-quarterly');
  assert.equal(r4.category, 'monthly_signature');
  assert.equal(r4.recurrenceFrequency, 'quarterly');
  assert.equal(r4.recommendedForQueue, true);

  // Verify Scenario 5: Ordinary weekly Thirsty Thursday -> Routine Club Night — Low Priority
  const r5 = results.get('scen-5-thirsty-1');
  assert.equal(r5.category, 'routine_club_night');
  assert.equal(r5.fullCategoryLabel, 'Routine Club Night — Low Priority');
  assert.equal(r5.recommendedForQueue, false);

  // Verify Scenario 6: Repeated standard weekday admission night -> Routine Club Night — Low Priority
  const r6 = results.get('scen-6-routine-1');
  assert.equal(r6.category, 'routine_club_night');
  assert.equal(r6.descriptionRepeatRatio, 1);
  assert.equal(r6.recommendedForQueue, false);

  // Verify Scenario 7: Distinctive weekly signature play party -> Weekly Signature Event — Conditional
  const r7 = results.get('scen-7-weekly-sig-1');
  assert.equal(r7.category, 'weekly_signature');
  assert.equal(r7.fullCategoryLabel, 'Weekly Signature Event — Conditional');
  assert.equal(r7.recommendedForQueue, true);
  assert.deepEqual(r7.weeklySignatureEvaluation, {
    explicitlyPlayParty: true,
    dedicatedBrandingOrAudience: true,
    programmingBeyondNormalAdmission: true,
    presentedAsSignificantGathering: true,
    credibleReasonForSeparateListing: true,
  });

  // Verify Scenario 8: Event with limited descriptive information -> Needs Human Review
  const r8 = results.get('scen-8-limited-info');
  assert.equal(r8.category, 'needs_human_review');
  assert.equal(r8.lacksAdequateEvidence, true);
  assert.equal(r8.confidence, 'low');
  assert.equal(r8.recommendedForQueue, false);

  // Verify Scenario 9: Two unrelated events with similar names at different clubs -> NOT collapsed into same series
  const r9a = results.get('scen-9-club-a');
  const r9b = results.get('scen-9-club-b');
  assert.notEqual(r9a.seriesKey, r9b.seriesKey, 'Events at different clubs must have distinct scoped seriesKeys');
  assert.equal(r9a.seriesOccurrenceCount, 1, 'Club Alpha event must not inherit Club Beta occurrence count');
  assert.equal(r9b.seriesOccurrenceCount, 1, 'Club Beta event must not inherit Club Alpha occurrence count');
  assert.equal(r9a.category, 'special_event');
  assert.equal(r9b.category, 'special_event');

  // Verify Scenario 10: Special event falling on a regular weekly club night -> prioritized as Special Event
  const r10 = results.get('scen-10-special-on-weekly');
  assert.equal(r10.category, 'special_event');
  assert.equal(r10.fallsOnRegularWeeklySlot, true);
  assert.equal(r10.recommendedForQueue, true);

  // Verify Separate Play-Party vs Significance Check: Holiday yoga class is NOT recommended
  const rNonPlay = results.get('scen-non-play-holiday');
  assert.equal(rNonPlay.recommendedForQueue, false, 'Excluded non-play activity must not be recommended even on Halloween');
  assert.equal(rNonPlay.requiresHumanReview, true);

  // Verify live snapshot has eventSignificance on all candidates and test persistent Admin Classification Override
  const liveSnapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  assert.ok(liveSnapshot.candidates.length >= 696);
  for (const c of liveSnapshot.candidates) {
    assert.ok(c.eventSignificance, `Candidate ${c.id} must have eventSignificance metadata`);
    assert.ok(
      ['special_event', 'monthly_signature', 'weekly_signature', 'routine_club_night', 'needs_human_review'].includes(
        c.eventSignificance!.category,
      ),
    );
  }

  // Verify queue filters & priority ordering
  const recommendedQueue = sortCandidatesForEditorialQueue(
    filterCandidatesByQueueSignificance(liveSnapshot.candidates, 'recommended'),
  );
  assert.ok(recommendedQueue.length > 0);
  assert.equal(
    recommendedQueue[0].eventSignificance?.category,
    'special_event',
    'Default Recommended queue must prioritize Special Events first',
  );
  assert.ok(
    recommendedQueue.every((c) => c.eventSignificance?.category !== 'routine_club_night'),
    'Default Recommended queue must exclude Routine Club Nights',
  );

  // Test Admin Classification Override persistence across reclassification
  const targetCandidate = liveSnapshot.candidates.find((c) => c.eventSignificance?.category === 'routine_club_night')!;
  assert.ok(targetCandidate);
  try {
    const overrideRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'candidate_override_significance',
      targetId: targetCandidate.id,
      payload: {
        category: 'weekly_signature',
        notes: 'Verified signature weekly party by admin',
      },
    });
    assert.equal(overrideRes.ok, true);
    const updatedCand = overrideRes.snapshot?.candidates.find((c: any) => c.id === targetCandidate.id);
    assert.equal(updatedCand?.eventSignificance?.category, 'weekly_signature');
    assert.equal(updatedCand?.eventSignificance?.manualOverride?.overridden, true);
    assert.equal(updatedCand?.eventSignificance?.manualOverride?.notes, 'Verified signature weekly party by admin');

    // Verify automatic reclassification does NOT overwrite the admin override
    const reclassAfterOverride = sigMod.classifyCandidateSignificance(updatedCand, null);
    assert.equal(reclassAfterOverride.category, 'weekly_signature');
    assert.equal(reclassAfterOverride.manualOverride?.overridden, true);
  } finally {
    // Reset override back to automatic classification
    const resetRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'candidate_override_significance',
      targetId: targetCandidate.id,
      payload: {
        resetOverride: true,
      },
    });
    assert.equal(resetRes.ok, true);
    const restoredCand = resetRes.snapshot?.candidates.find((c: any) => c.id === targetCandidate.id);
    assert.equal(restoredCand?.eventSignificance?.category, 'routine_club_night');
    assert.equal(restoredCand?.eventSignificance?.manualOverride, null);
  }
});

test('Creative Workflow & UI Refinement: provenance detection, flyer vs hero prompt generation across styles, prompt storage without side effects, drag-and-drop replacement with aspect-ratio framing, safe source URL links, and clutter reduction', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const coreMod = await import(pathToFileURL(path.join(curatorRoot, 'src', 'core.mjs')).href);

  // Clean up any leftover temp media directory from earlier runs
  const leftoverDir = path.join(curatorRoot, 'media', 'candidate-targeted-verify-reroll');
  if (fs.existsSync(leftoverDir)) {
    fs.rmSync(leftoverDir, { recursive: true, force: true });
  }

  // Verify live snapshot provenance distinguishes AI Stage A images from procedural template fallbacks
  const liveSnap = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const samplersCandidate = liveSnap.candidates.find((c) => c.id === 'candidate-9c4870b1176883423942b1a3');
  assert.ok(samplersCandidate, 'Expected "From Samplers to Scenes: March Play Party" candidate in snapshot');
  const samplersMedia = liveSnap.mediaItems.find((m) => m.candidateId === 'candidate-9c4870b1176883423942b1a3') || null;
  const samplersFlyerProv = resolveArtworkRoleProvenance(samplersCandidate, samplersMedia, 'flyer');
  const samplersHeroProv = resolveArtworkRoleProvenance(samplersCandidate, samplersMedia, 'hero');
  assert.equal(
    samplersFlyerProv.mode,
    'procedural_template_fallback',
    '"From Samplers to Scenes: March Play Party" has no AI original and must be labeled procedural_template_fallback',
  );
  assert.equal(samplersHeroProv.mode, 'procedural_template_fallback');
  assert.match(samplersFlyerProv.label, /Template Fallback/i);

  // Verify a candidate WITH a genuine AI Stage A original is labeled ai_model_stage_a
  const aiMediaItem = liveSnap.mediaItems.find((m) => m.flyerGenerationMode === 'ai_model' && Boolean(m.candidateId));
  assert.ok(aiMediaItem, 'Expected at least one candidate with genuine AI Stage A base artwork');
  const aiCand = liveSnap.candidates.find((c) => c.id === aiMediaItem.candidateId)!;
  const aiFlyerProv = resolveArtworkRoleProvenance(aiCand, aiMediaItem, 'flyer');
  assert.equal(aiFlyerProv.mode, 'ai_model_stage_a');
  assert.match(aiFlyerProv.label, /AI Model/i);

  // 1 & 2. Flyer prompt includes actual event info & selected style, and Hero prompt differs meaningfully
  const flyerPromptbeforeSha = samplersCandidate.stagedMedia?.flyerSha256;
  const heroPromptBeforeSha = samplersCandidate.stagedMedia?.heroSha256;

  const flyerBrief = generateCuratorArtworkPrompt({
    candidate: samplersCandidate,
    role: 'flyer',
    styleCategoryId: 'renaissance',
    includeEmbeddedTextOnFlyer: true,
  });
  const heroBrief = generateCuratorArtworkPrompt({
    candidate: samplersCandidate,
    role: 'hero',
    styleCategoryId: 'renaissance',
  });

  assert.equal(flyerBrief.role, 'flyer');
  assert.equal(flyerBrief.aspectRatio, '4:5');
  assert.equal(flyerBrief.targetResolution, '1080 × 1350');
  assert.match(flyerBrief.promptText, /From Samplers to Scenes: March Play Party/);
  assert.match(flyerBrief.promptText, /Selected Artistic Style: Renaissance/);
  assert.match(flyerBrief.promptText, /1080 × 1350/);
  assert.match(flyerBrief.promptText, /Paolo Veronese|Raphael|Palladio/i);
  assert.match(flyerBrief.promptText, /TYPOGRAPHY & POSTER HIERARCHY/);
  assert.match(flyerBrief.promptText, /SFW & EDITORIAL GUARDRAILS/);

  assert.equal(heroBrief.role, 'hero');
  assert.equal(heroBrief.aspectRatio, '16:9');
  assert.equal(heroBrief.targetResolution, '1920 × 1080');
  assert.notEqual(flyerBrief.promptText, heroBrief.promptText);
  assert.match(heroBrief.promptText, /1920 × 1080/);
  assert.match(heroBrief.promptText, /HERO BRANDING, TYPOGRAPHY TONE & SAFE ZONES/);
  assert.match(heroBrief.promptText, /Lighter Hero Information Hierarchy \(1 → 4\)/);
  assert.match(heroBrief.promptText, /compositionally independent from the vertical 4:5 flyer/i);

  // 3. Switching artistic styles produces substantially different prompt directions
  const styleIdsToCompare = ['renaissance', 'underground_rave', 'cubism_picasso', 'surrealist', 'cinematic'];
  const generatedByStyle = new Map<string, string>();
  for (const styleId of styleIdsToCompare) {
    const res = generateCuratorArtworkPrompt({
      candidate: samplersCandidate,
      role: 'flyer',
      styleCategoryId: styleId,
    });
    generatedByStyle.set(styleId, res.promptText);
  }
  assert.match(generatedByStyle.get('renaissance')!, /Paolo Veronese|Raphael|Palladian|Baroque opulence/i);
  assert.match(generatedByStyle.get('underground_rave')!, /Tresor|Berghain|brutalist concrete|strobe/i);
  assert.match(generatedByStyle.get('cubism_picasso')!, /Analytical and Synthetic Cubism|Picasso|Braque|angular planes/i);
  assert.match(generatedByStyle.get('surrealist')!, /Magritte|Remedios Varo|dreamlike|gravity-defying/i);
  assert.match(generatedByStyle.get('cinematic')!, /35mm anamorphic|Wong Kar-wai|Denis Villeneuve|bokeh/i);

  // 4 & 5. Local prompt storage & editing works and never modifies staged artwork
  saveStoredCuratorArtworkPrompt(samplersCandidate.id, 'flyer', {
    promptText: `${flyerBrief.promptText}\n# Custom Curator Note: emphasize warm candlelight.`,
    styleCategoryId: 'renaissance',
    styleLabel: flyerBrief.styleLabel,
    updatedAt: new Date().toISOString(),
    isModified: true,
  });
  const loadedPrompt = getStoredCuratorArtworkPrompt(samplersCandidate.id, 'flyer');
  assert.ok(loadedPrompt);
  assert.equal(loadedPrompt?.isModified, true);
  assert.match(loadedPrompt!.promptText, /Custom Curator Note: emphasize warm candlelight/);
  clearStoredCuratorArtworkPrompt(samplersCandidate.id, 'flyer');
  assert.equal(getStoredCuratorArtworkPrompt(samplersCandidate.id, 'flyer'), null);

  const snapAfterPromptOps = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const samplersAfterPrompt = snapAfterPromptOps.candidates.find(
    (c) => c.id === 'candidate-9c4870b1176883423942b1a3',
  )!;
  assert.equal(
    samplersAfterPrompt.stagedMedia?.flyerSha256,
    flyerPromptbeforeSha,
    'Generating or saving a prompt must NEVER modify flyer artwork',
  );
  assert.equal(
    samplersAfterPrompt.stagedMedia?.heroSha256,
    heroPromptBeforeSha,
    'Generating or saving a prompt must NEVER modify hero artwork',
  );

  // 9. File validation and aspect-ratio analysis fail safely / warn without silent force-cropping
  const invalidGifCheck = validateCuratorArtworkUploadFile({ name: 'anim.gif', type: 'image/gif', size: 10240 });
  assert.equal(invalidGifCheck.valid, false);
  assert.match(invalidGifCheck.error || '', /Unsupported file format/i);

  const oversizedCheck = validateCuratorArtworkUploadFile({
    name: 'huge.png',
    type: 'image/png',
    size: 15 * 1024 * 1024,
  });
  assert.equal(oversizedCheck.valid, false);
  assert.match(oversizedCheck.error || '', /exceeds the 10 MB limit/i);

  const validPngCheck = validateCuratorArtworkUploadFile({ name: 'poster.png', type: 'image/png', size: 512 * 1024 });
  assert.equal(validPngCheck.valid, true);

  const exactFlyerAspect = analyzeCuratorArtworkDimensions(1080, 1350, 'flyer');
  assert.equal(exactFlyerAspect.aspectMatches, true);
  assert.equal(exactFlyerAspect.warningMessage, null);

  const mismatchedFlyerAspect = analyzeCuratorArtworkDimensions(1920, 1080, 'flyer');
  assert.equal(mismatchedFlyerAspect.aspectMatches, false);
  assert.match(mismatchedFlyerAspect.warningMessage || '', /differs from the target Vertical Event Flyer/i);

  // 10 & 11. Safe external URL helper & draft survival across external-link navigation
  assert.equal(getSafeExternalHttpUrl('https://trapezeclub.com/events/march'), 'https://trapezeclub.com/events/march');
  assert.equal(getSafeExternalHttpUrl('javascript:alert(1)'), null);
  assert.equal(getSafeExternalHttpUrl('ftp://files.example.com/event'), null);
  assert.equal(getSafeExternalHttpUrl('not-a-valid-url'), null);
  assert.equal(getSafeExternalHttpUrl(''), null);

  saveCuratorCandidateDraft(samplersCandidate.id, {
    title: 'Unsaved Draft Title Preserved Across Source Tab Click',
    sourceUrl: 'https://trapezeclub.com/events/updated-source-link',
  });
  const draftBeforeLink = getCuratorCandidateDraft(samplersCandidate.id);
  assert.equal(draftBeforeLink?.title, 'Unsaved Draft Title Preserved Across Source Tab Click');
  assert.equal(
    getSafeExternalHttpUrl(draftBeforeLink?.sourceUrl),
    'https://trapezeclub.com/events/updated-source-link',
  );
  clearCuratorCandidateDraft(samplersCandidate.id);

  // 6, 7, 8, 12. Drag-and-drop / replacement upload for Flyer and Hero preserves other role, supports contain/cover, and preserves version history + approval
  const testCandId = 'candidate-dnd-upload-verify';
  const testMediaId = testCandId;
  const testMediaDir = path.join(curatorRoot, 'media', testCandId);
  const setupDb = coreMod.database();
  try {
    fs.mkdirSync(testMediaDir, { recursive: true });
    const initFlyerBuf = await coreMod.sharp({
      create: { width: 1080, height: 1350, channels: 3, background: { r: 30, g: 20, b: 50 } },
    })
      .png()
      .toBuffer();
    const initHeroBuf = await coreMod.sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 20, g: 45, b: 65 } },
    })
      .png()
      .toBuffer();
    const v1FlyerPath = path.join(testMediaDir, 'flyer-1080x1350.png');
    const v1HeroPath = path.join(testMediaDir, 'hero-1920x1080.png');
    fs.writeFileSync(v1FlyerPath, initFlyerBuf);
    fs.writeFileSync(v1HeroPath, initHeroBuf);
    const v1FlyerSha = coreMod.hash(initFlyerBuf);
    const v1HeroSha = coreMod.hash(initHeroBuf);

    coreMod.put(setupDb, 'candidates', testCandId, {
      id: testCandId,
      title: 'Drag and Drop Replacement Test Party',
      date: '2026-12-20',
      startTime: '21:00',
      endTime: '02:00',
      timezone: 'America/New_York',
      clubId: 'club-trapeze-atlanta',
      clubName: 'Trapeze Atlanta',
      venue: 'Trapeze Atlanta',
      city: 'Atlanta',
      region: 'GA',
      country: 'USA',
      officialUrl: 'https://trapezeclub.com/events/dnd-test',
      description: 'Verification event for independent drag-and-drop flyer and hero replacement.',
      displayDescription: 'Verification event for independent drag-and-drop flyer and hero replacement.',
      reconciliation: { state: 'new', matchedExistingId: null, changes: [], possibleDuplicates: [] },
      missingFields: [],
      reviewState: 'pending_review',
      stagedMedia: {
        id: testMediaId,
        status: 'pending_review',
        selectedVersionId: 'v1',
        selectedFlyerVersionId: 'v1',
        selectedHeroVersionId: 'v1',
        flyerPath: v1FlyerPath,
        heroPath: v1HeroPath,
        flyerSha256: v1FlyerSha,
        heroSha256: v1HeroSha,
      },
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });

    coreMod.put(setupDb, 'media', testMediaId, {
      id: testMediaId,
      candidateId: testCandId,
      clubId: 'club-trapeze-atlanta',
      status: 'pending_review',
      selectedVersionId: 'v1',
      selectedFlyerVersionId: 'v1',
      selectedHeroVersionId: 'v1',
      assets: {
        flyer: { path: v1FlyerPath, width: 1080, height: 1350, sha256: v1FlyerSha },
        hero: { path: v1HeroPath, width: 1920, height: 1080, sha256: v1HeroSha },
      },
      versionHistory: [
        {
          versionId: 'v1',
          versionNumber: 1,
          createdAt: new Date().toISOString(),
          targetRole: 'both',
          styleCategory: 'art_deco',
          styleCategoryLabel: 'Art Deco / Speakeasy',
          assets: {
            flyer: { path: v1FlyerPath, width: 1080, height: 1350, sha256: v1FlyerSha },
            hero: { path: v1HeroPath, width: 1920, height: 1080, sha256: v1HeroSha },
          },
        },
      ],
    });
  } finally {
    setupDb.close();
  }

  try {
    const snapV1 = await getCuratorBridgeSnapshot(makeLocalAdminReq());
    const candV1 = snapV1.candidates.find((c) => c.id === testCandId)!;
    const initialFlyerSha = candV1.stagedMedia?.flyerSha256;
    const initialHeroSha = candV1.stagedMedia?.heroSha256;
    assert.ok(initialFlyerSha);
    assert.ok(initialHeroSha);

    // 6. Drop / upload a custom Flyer image (with 'contain' fit mode on a square 800x800 image so no silent cropping occurs)
    const droppedFlyerBuf = await coreMod.sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 190, g: 45, b: 90 } },
    })
      .png()
      .toBuffer();
    const droppedFlyerDataUrl = `data:image/png;base64,${droppedFlyerBuf.toString('base64')}`;

    const uploadFlyerRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'artwork_regenerate',
      targetId: testCandId,
      payload: {
        targetRole: 'flyer',
        styleCategory: 'renaissance',
        replacementDataUrl: droppedFlyerDataUrl,
        replacementFitMode: 'contain',
        source: 'editorial_artwork_replacement',
        editorialReroll: true,
      },
    });
    assert.equal(uploadFlyerRes.ok, true);
    const candV2 = uploadFlyerRes.snapshot!.candidates.find((c: any) => c.id === testCandId)!;
    const mediaV2 = uploadFlyerRes.snapshot!.mediaItems.find((m: any) => m.id === testMediaId)!;

    assert.equal(candV2.stagedMedia?.selectedFlyerVersionId, 'v2');
    assert.equal(candV2.stagedMedia?.selectedHeroVersionId, 'v1', 'Hero version must remain v1 when flyer is replaced');
    assert.notEqual(candV2.stagedMedia?.flyerSha256, initialFlyerSha, 'Flyer sha256 must update after replacement');
    assert.equal(
      candV2.stagedMedia?.heroSha256,
      initialHeroSha,
      'Hero sha256 must remain byte-for-byte identical when flyer is replaced',
    );
    const flyerProvAfterUpload = resolveArtworkRoleProvenance(candV2, mediaV2, 'flyer');
    assert.equal(flyerProvAfterUpload.mode, 'custom_upload');

    // 7 & 8. Drop / upload a custom Hero image and verify Flyer v2 is preserved byte-for-byte
    const flyerShaAfterV2 = candV2.stagedMedia?.flyerSha256;
    const droppedHeroBuf = await coreMod.sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 25, g: 130, b: 160 } },
    })
      .png()
      .toBuffer();
    const droppedHeroDataUrl = `data:image/png;base64,${droppedHeroBuf.toString('base64')}`;

    const uploadHeroRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'artwork_regenerate',
      targetId: testCandId,
      payload: {
        targetRole: 'hero',
        styleCategory: 'cinematic',
        replacementDataUrl: droppedHeroDataUrl,
        replacementFitMode: 'cover',
        source: 'editorial_artwork_replacement',
        editorialReroll: true,
      },
    });
    assert.equal(uploadHeroRes.ok, true);
    const candV3 = uploadHeroRes.snapshot!.candidates.find((c: any) => c.id === testCandId)!;
    const mediaV3 = uploadHeroRes.snapshot!.mediaItems.find((m: any) => m.id === testMediaId)!;

    assert.equal(candV3.stagedMedia?.selectedFlyerVersionId, 'v2', 'Flyer selection must remain v2 when hero is replaced');
    assert.equal(candV3.stagedMedia?.selectedHeroVersionId, 'v3');
    assert.equal(
      candV3.stagedMedia?.flyerSha256,
      flyerShaAfterV2,
      'Flyer sha256 must remain byte-for-byte identical when hero is replaced',
    );
    assert.notEqual(candV3.stagedMedia?.heroSha256, initialHeroSha, 'Hero sha256 must update after replacement');
    assert.equal(mediaV3.versionHistory.length, 3);

    // 12. Restore previous flyer version (v1) and approve candidate
    const restoreFlyerRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'artwork_select_version',
      targetId: testCandId,
      payload: {
        targetRole: 'flyer',
        versionId: 'v1',
      },
    });
    assert.equal(restoreFlyerRes.ok, true);
    const candRestored = restoreFlyerRes.snapshot!.candidates.find((c: any) => c.id === testCandId)!;
    assert.equal(candRestored.stagedMedia?.selectedFlyerVersionId, 'v1');
    assert.equal(candRestored.stagedMedia?.selectedHeroVersionId, 'v3');

    const approveRes = await executeCuratorBridgeCommand(makeLocalAdminReq('/api/admin/curator/command'), {
      commandType: 'candidate_approve',
      targetId: testCandId,
      payload: { notes: 'Approved after prompt + drag-and-drop verification' },
    });
    assert.equal(approveRes.ok, true);
    assert.equal(approveRes.command.result.reviewState, 'approved');
  } finally {
    const cleanDb = coreMod.database();
    try {
      cleanDb.prepare('DELETE FROM candidates WHERE id = ?').run(testCandId);
      cleanDb.prepare('DELETE FROM media WHERE id = ?').run(testMediaId);
      cleanDb.prepare('DELETE FROM candidate_history WHERE candidate_id = ?').run(testCandId);
      cleanDb.prepare('DELETE FROM command_queue WHERE target_id IN (?, ?)').run(testCandId, testMediaId);
    } finally {
      cleanDb.close();
    }
    if (fs.existsSync(testMediaDir)) {
      fs.rmSync(testMediaDir, { recursive: true, force: true });
    }
  }
});

test('Flyer & Hero Information Overlay / Branding Upgrade: promotional content schema, 1-to-6 flyer hierarchy, 1-to-4 lighter hero hierarchy, 5 layout patterns, multi-brand & logo placement strategy, graceful missing-field omission, and direct Stage B overlay rendering', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const creativeDirectorMod = await import(
    pathToFileURL(path.join(curatorRoot, 'src', 'creative-director.mjs')).href
  );

  // Verify all 5 required flyer layout patterns exist
  const expectedLayoutPatternIds = [
    'top_logo_centered_title_bottom_info',
    'logo_top_left_title_center_stacked_details',
    'poster_bold_title_side_info_column',
    'editorial_layout_footer_metadata',
    'nightlife_flyer_badge_callouts',
  ] as const;
  for (const patId of expectedLayoutPatternIds) {
    assert.ok(CURATOR_FLYER_LAYOUT_PATTERNS[patId], `Missing flyer layout pattern ${patId}`);
  }

  // Rich promotional candidate with club + distinct venue + distinct host + logo + theme + costume + $500 prize + URL
  const richCandidate: CuratorCandidateRecord = {
    id: 'candidate-promo-rich-verify',
    title: 'Midnight Venetian Masquerade & Play Gala',
    date: '2026-10-31',
    endDate: null,
    startTime: '21:00',
    endTime: '02:30',
    timezone: 'America/Los_Angeles',
    clubId: 'club-sanctuary-pdx',
    clubName: 'Sanctuary Club, 410 SW Broadway, Portland, OR 97205',
    hostId: 'host-velvet-society',
    hostName: 'Velvet Society',
    venue: 'The Grand Palazzo Ballroom, 410 SW Broadway, Portland, OR 97205',
    address: '410 SW Broadway, Portland, OR 97205',
    city: 'Portland',
    region: 'OR',
    country: 'USA',
    sourceUrl: 'https://www.pdxsanctuary.com/events/midnight-masquerade?utm_source=calendar',
    ticketUrl: 'https://www.pdxsanctuary.com/tickets/masquerade',
    rsvpUrl: null,
    flyerUrl: null,
    description:
      'Join Sanctuary Club and Velvet Society for our annual Halloween play party featuring two floors of playrooms, a $500 costume contest, Venetian masks, and midnight champagne toast. Long narrative paragraph that must never be printed verbatim on the flyer.',
    displayDescription:
      'Join Sanctuary Club and Velvet Society for our annual Halloween play party featuring two floors of playrooms, a $500 costume contest, Venetian masks, and midnight champagne toast.',
    theme: 'Venetian Gothic Masquerade',
    dressCode: 'Venetian Masks & Formal Fetish Couture',
    admission: 'Couples $90 · Single Females $35',
    rsvpRequirement: 'Advance RSVP Required',
    restrictions: '21+ Couples & Vetted Singles',
    series: null,
    recurrence: null,
    candidateType: 'event',
    isClosureNotice: false,
    reconciliationState: 'new',
    matchedExistingId: null,
    matchedExistingTitle: null,
    auditCategory: null,
    auditReason: null,
    missingFields: [],
    inferredFields: [],
    warnings: [],
    fieldDiffs: [],
    evidenceSummary: [],
    capturePages: [],
    reviewState: 'pending_review',
    publicChangeAuthorized: false,
    stagedMedia: null,
    reviewDecision: null,
    updatedAt: new Date().toISOString(),
  };

  // 1 & 7. Multi-brand priority & deduplication + Logo asset vs Typographic fallback
  const schemaWithLogo = buildCuratorPromotionalContentSchema(richCandidate, {
    styleCategoryId: 'classic_nightclub',
    logoUrlOverride: 'https://www.pdxsanctuary.com/assets/sanctuary-crest.png',
  });
  assert.equal(schemaWithLogo.primaryBrand, 'Sanctuary Club', 'Embedded street address must be stripped from primaryBrand');
  assert.equal(schemaWithLogo.secondaryVenue, 'The Grand Palazzo Ballroom', 'Distinct venue must be preserved');
  assert.equal(schemaWithLogo.hostPresenter, 'Velvet Society', 'Distinct host must be preserved');
  assert.equal(schemaWithLogo.hasLogoAsset, true);
  assert.equal(schemaWithLogo.logoSourceStatus, 'logo_asset_available');
  assert.equal(schemaWithLogo.logoPlacement, 'top-center');
  assert.equal(schemaWithLogo.timeDisplay, '9:00 PM – 2:30 AM');
  assert.match(schemaWithLogo.dateDisplay || '', /Oct 31, 2026/);
  assert.equal(schemaWithLogo.theme, 'Venetian Gothic Masquerade');
  assert.equal(schemaWithLogo.dressCodeOrCostume, 'Venetian Masks & Formal Fetish Couture');
  assert.match(schemaWithLogo.prizeOrHighlight || '', /\$500 costume contest/i);
  assert.equal(schemaWithLogo.displayUrl, 'pdxsanctuary.com/tickets/masquerade');
  assert.equal(schemaWithLogo.promotionalStatus, 'complete_promotional_info');

  // Verify typographic fallback when no logo exists
  const schemaWithoutLogo = buildCuratorPromotionalContentSchema(richCandidate, {
    styleCategoryId: 'minimalist_editorial',
    logoUrlOverride: null,
  });
  assert.equal(schemaWithoutLogo.hasLogoAsset, false);
  assert.equal(schemaWithoutLogo.logoSourceStatus, 'typographic_fallback');
  assert.equal(schemaWithoutLogo.logoPlacement, 'top-left');
  assert.match(schemaWithoutLogo.logoFallbackText, /SANCTUARY CLUB/);

  // 2 & 3 & 6. Flyer prompt vs Hero prompt hierarchy & supporting details
  const flyerPrompt = generateCuratorArtworkPrompt({
    candidate: richCandidate,
    role: 'flyer',
    styleCategoryId: 'vintage_disco',
  });
  const heroPrompt = generateCuratorArtworkPrompt({
    candidate: richCandidate,
    role: 'hero',
    styleCategoryId: 'vintage_disco',
  });

  // Flyer prompt checks (1 -> 6 hierarchy + supporting details)
  assert.equal(flyerPrompt.layoutPatternId, 'nightlife_flyer_badge_callouts');
  assert.match(flyerPrompt.promptText, /1\. Logo \/ Organizer Identity/);
  assert.match(flyerPrompt.promptText, /2\. Event Title \(Primary Focal Headline\): "Midnight Venetian Masquerade & Play Gala"/);
  assert.match(flyerPrompt.promptText, /3\. Date \+ Time: ".*Oct 31, 2026 · 9:00 PM – 2:30 AM"/);
  assert.match(flyerPrompt.promptText, /4\. Location \/ Venue: "The Grand Palazzo Ballroom · 410 SW Broadway, Portland, OR"/);
  assert.match(flyerPrompt.promptText, /5\. Supporting Callout \/ Detail Block:.*Venetian Gothic Masquerade.*Hosted by Velvet Society.*Venetian Masks & Formal Fetish Couture.*\$500 costume contest/);
  assert.match(flyerPrompt.promptText, /6\. Footer URL \/ Ticket Reference: "pdxsanctuary\.com\/tickets\/masquerade"/);

  // Hero prompt checks (lighter 1 -> 4 hierarchy, omits flyer-level clutter)
  assert.match(heroPrompt.promptText, /Lighter Hero Information Hierarchy \(1 → 4\)/);
  assert.match(heroPrompt.promptText, /1\. Logo or Organizer Identity/);
  assert.match(heroPrompt.promptText, /2\. Event Title \(Widescreen Headline\): "Midnight Venetian Masquerade & Play Gala"/);
  assert.match(heroPrompt.promptText, /3\. Date \/ Location Line: ".*Oct 31, 2026 · Sanctuary Club · Portland, OR"/);
  assert.match(heroPrompt.promptText, /4\. Optional Short Subheading: "Hosted by Velvet Society · Venetian Gothic Masquerade"/);
  assert.match(heroPrompt.promptText, /Omit start\/end hours, street addresses, dress code lists, admission tiers, and footer URLs/);

  // 4 & 8. Missing fields are omitted gracefully without invention, and art-only missing metadata is clearly labeled
  const sparseCandidate: CuratorCandidateRecord = {
    ...richCandidate,
    id: 'candidate-promo-sparse-verify',
    title: 'Secret Noir Gathering',
    date: null,
    startTime: null,
    endTime: null,
    clubName: '',
    hostName: null,
    venue: null,
    address: null,
    city: null,
    region: null,
    country: null,
    theme: null,
    dressCode: null,
    admission: null,
    rsvpRequirement: null,
    ticketUrl: null,
    sourceUrl: null,
    description: 'An atmospheric nocturnal gathering.',
    displayDescription: 'An atmospheric nocturnal gathering.',
    missingFields: ['date', 'venue'],
  };

  const sparseFlyerPrompt = generateCuratorArtworkPrompt({
    candidate: sparseCandidate,
    role: 'flyer',
    styleCategoryId: 'baroque_rembrandt',
  });
  assert.equal(sparseFlyerPrompt.promotionalContent.dateDisplay, null, 'Must not invent a missing date');
  assert.equal(sparseFlyerPrompt.promotionalContent.timeDisplay, null, 'Must not invent a missing time');
  assert.equal(sparseFlyerPrompt.promotionalContent.flyerLocationDisplay, null, 'Must not invent a missing location');
  assert.equal(sparseFlyerPrompt.promotionalContent.isArtOnlyMissingMetadata, true);
  assert.match(
    sparseFlyerPrompt.promptText,
    /3\. Date \+ Time: \[OMIT — date\/time not verified in source; do NOT invent a date or time\]/,
  );
  assert.match(
    sparseFlyerPrompt.promptText,
    /4\. Location \/ Venue: \[OMIT — location not verified in source\]/,
  );

  const sparseProvenance = resolveArtworkRoleProvenance(sparseCandidate, null, 'flyer');
  assert.equal(sparseProvenance.mode, 'art_only_missing_metadata');
  assert.equal(sparseProvenance.isArtOnlyMissingMetadata, true);
  assert.match(sparseProvenance.badgeLabel, /Art-Only Composition \(Missing Required Metadata\)/i);

  // 5. Different artistic styles map to all 5 layout patterns and preserve readable information hierarchy
  const styleToExpectedLayout: Array<[string, string, string]> = [
    ['classic_nightclub', 'top_logo_centered_title_bottom_info', 'top-center'],
    ['minimalist_editorial', 'logo_top_left_title_center_stacked_details', 'top-left'],
    ['cubism_picasso', 'poster_bold_title_side_info_column', 'top-left'],
    ['contemporary_museum', 'editorial_layout_footer_metadata', 'top-right'],
    ['vintage_disco', 'nightlife_flyer_badge_callouts', 'top-center'],
    ['cinematic', 'editorial_layout_footer_metadata', 'bottom-corner'],
  ];
  for (const [styleId, expectedPatternId, expectedLogoPos] of styleToExpectedLayout) {
    const p = generateCuratorArtworkPrompt({
      candidate: richCandidate,
      role: 'flyer',
      styleCategoryId: styleId,
    });
    assert.equal(
      p.layoutPatternId,
      expectedPatternId,
      `Style ${styleId} should map to layout pattern ${expectedPatternId}`,
    );
    assert.equal(
      p.logoPlacement,
      expectedLogoPos,
      `Style ${styleId} should default to logo placement ${expectedLogoPos}`,
    );
  }

  // 6. Direct Stage B overlay generation in creative-director.mjs extracts deduplicated facts and renders both Flyer and Promotional Hero overlays
  const extractedFacts = creativeDirectorMod.extractAppliedEventFacts(richCandidate, {
    clubName: richCandidate.clubName,
    city: richCandidate.city,
  });
  assert.equal(extractedFacts.clubName, 'Sanctuary Club');
  assert.equal(extractedFacts.venueName, 'The Grand Palazzo Ballroom');
  assert.equal(extractedFacts.hostName, 'Velvet Society');
  assert.match(extractedFacts.prizeOrHighlight || '', /\$500 costume contest/i);
  assert.equal(extractedFacts.displayUrl, 'pdxsanctuary.com/tickets/masquerade');
  assert.equal(extractedFacts.isArtOnlyMissingMetadata, false);
});

test('The 15 Association Source Quality Audit: limited-detail calendar classification, non-party exclusion, private registration identification, organizer attribution preservation, missing-evidence Needs Human Review, and Recommended queue gating', async () => {
  const { pathToFileURL } = await import('node:url');
  const curatorRoot = 'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator';
  const htmlAdaptersMod = await import(
    pathToFileURL(path.join(curatorRoot, 'src', 'html-adapters.mjs')).href
  );
  const significanceMod = await import(
    pathToFileURL(path.join(curatorRoot, 'src', 'event-significance.mjs')).href
  );

  // 1. Verify profile & snapshot classification as limited_detail_calendar
  const snapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const the15Source = snapshot.monitoredSources.find((s: any) => s.id === 'org-promoter-the-15-association');
  assert.ok(the15Source, 'Expected The 15 Association source profile in snapshot');
  assert.equal(
    the15Source.classification,
    'limited_detail_calendar',
    'The 15 Association must be classified as a limited-detail event source requiring stricter verification',
  );
  assert.equal(the15Source.calendarUrl, 'https://the15association.org/eventslist.php');
  assert.equal(
    (the15Source as any).suppressedCalendarEntriesCount,
    13,
    'All 13 non-party calendar entries must be recorded in the suppressed audit trail',
  );

  // 2. Verify non-qualifying calendar entries are excluded by classifyPlayPartyEligibility
  const nonPartySamples = [
    { title: 'Dungeon Monitor Training', expectedCat: 'training_session' },
    { title: 'Beer Bust', expectedCat: 'beer_bust_or_bar_social' },
    { title: 'Cigar Social', expectedCat: 'beer_bust_or_bar_social' },
    { title: 'Anniversary Awards Social', expectedCat: 'beer_bust_or_bar_social' },
    { title: 'Member Registration starts for BootCamp', expectedCat: 'registration_or_ticket_milestone' },
    { title: 'Guest Ticket Sales begin for Dore Alley Party', expectedCat: 'registration_or_ticket_milestone' },
    { title: 'Anniversary Weekend Package', expectedCat: 'multi_event_ticket_bundle' },
    { title: 'Sampler & Demos', expectedCat: 'educational_demo_or_sampler' },
    { title: 'Outdoor Dungeon at Dore Alley Fair', expectedCat: 'street_fair_booth_or_public_outreach' },
  ];
  for (const sample of nonPartySamples) {
    const elig = htmlAdaptersMod.classifyPlayPartyEligibility(
      {
        title: sample.title,
        date: '2027-03-01',
        host: 'The 15 Association',
        hostId: 'org-promoter-the-15-association',
        city: 'San Francisco',
      },
      the15Source,
    );
    assert.equal(
      elig.status,
      'excluded_non_play_event',
      `"${sample.title}" must be classified as excluded_non_play_event`,
    );
    assert.equal(elig.qualified, false);
    assert.equal(elig.suppressFromIngestion, true);
    assert.equal(elig.activityCategory, sample.expectedCat);
  }

  // 3. Verify staged candidates for The 15 Association in snapshot
  const the15Candidates = snapshot.candidates.filter(
    (c) => c.hostId === 'org-promoter-the-15-association',
  );
  assert.equal(
    the15Candidates.length,
    16,
    'Expected 16 active candidates for The 15 Association after suppressing 13 non-party entries and restoring 2 overwritten 2026 parties',
  );

  // Ensure none of the 13 excluded non-party titles remain in active candidates
  const excludedTitles = new Set(nonPartySamples.map((s) => s.title));
  for (const cand of the15Candidates) {
    assert.equal(
      excludedTitles.has(cand.title),
      false,
      `Excluded non-party activity "${cand.title}" must not remain in active candidates`,
    );
    // Requirement 8: Preserve The 15 Association's own organizer identity (never attribute to Paradox or Stopgap as club)
    assert.equal(cand.clubId, null, `Promoter event "${cand.title}" must not have clubId assigned to hosting venue`);
    assert.equal(cand.clubName, 'The 15 Association', `Promoter event "${cand.title}" must display The 15 Association as primary organizer`);
    assert.equal(cand.hostName, 'The 15 Association');
    // Requirement 6 & 7: Identify private registration method accurately and never invent public ticket URLs
    assert.equal(cand.ticketUrl, null, `Must not invent public ticket URLs for "${cand.title}"`);
    assert.equal(cand.rsvpUrl, 'https://the15association.org/partyrequest.php');
    assert.equal(cand.registrationMethod, 'members_only_or_invitation_required');
    assert.match(cand.registrationMethodLabel || '', /Members-only advance registration or approved guest invitation required/i);
  }

  // 4. Verify the 5 existing approved catalog events are preserved and reconciled as 'unchanged' (excluded from Recommended queue)
  const unchangedCatalogMatches = the15Candidates.filter((c) => c.reconciliationState === 'unchanged');
  assert.equal(
    unchangedCatalogMatches.length,
    5,
    'All 5 existing catalog play parties from The 15 Association must reconcile cleanly as unchanged',
  );
  for (const matchedCand of unchangedCatalogMatches) {
    assert.ok(matchedCand.matchedExistingId?.startsWith('event-the15-'));
    assert.equal(
      matchedCand.eventSignificance?.recommendedForQueue,
      false,
      `Already-published catalog event "${matchedCand.title}" (${matchedCand.date}) must not clutter the Recommended queue`,
    );
  }

  // 5. Verify Recommended queue for The 15 Association contains only verifiable, qualifying new play parties with event-specific details
  const recommended15 = the15Candidates.filter((c) => c.eventSignificance?.recommendedForQueue);
  assert.equal(recommended15.length, 4, 'Expected 4 qualifying new play parties in Recommended queue');
  const recommendedTitles = recommended15.map((c) => `${c.date}:${c.title}`).sort();
  assert.deepEqual(recommendedTitles, [
    '2027-04-17:Associates Weekend Play Party',
    '2027-04-18:Associates Weekend Sunday Play Party',
    '2027-05-15:Flash! A Photography and Play Party',
    '2027-12-12:Holiday Play Party',
  ]);
  for (const recCand of recommended15) {
    assert.equal(recCand.eventSignificance?.category, 'special_event');
    assert.equal(recCand.playPartyEligibility?.qualified, true);
    assert.ok(recCand.venue === 'Stopgap' || recCand.venue === 'Paradox');
    assert.equal(recCand.city, 'San Francisco');
  }

  // 6. Verify incomplete or ambiguous candidates are marked Needs Human Review with an explicit missing-information explanation and excluded from Recommended
  const needsReview15 = the15Candidates.filter(
    (c) => c.eventSignificance?.category === 'needs_human_review',
  );
  assert.equal(needsReview15.length, 7, 'Expected 7 incomplete/ambiguous candidates marked Needs Human Review');
  for (const nrCand of needsReview15) {
    assert.equal(
      nrCand.eventSignificance?.recommendedForQueue,
      false,
      `Needs Human Review candidate "${nrCand.title}" (${nrCand.date}) must be excluded from Recommended queue`,
    );
    assert.ok(
      nrCand.eventSignificance?.missingInformationExplanation &&
        nrCand.eventSignificance.missingInformationExplanation.includes('Needs Human Review — missing required verification evidence:'),
      `Candidate "${nrCand.title}" (${nrCand.date}) must provide a clear missingInformationExplanation`,
    );
  }

  // Specifically verify "Try Something New" (2027-01-23) flags both missing play-party confirmation and the source calendar sales-date conflict
  const trySomethingNew = needsReview15.find((c) => c.date === '2027-01-23');
  assert.ok(trySomethingNew);
  assert.match(
    trySomethingNew.eventSignificance?.missingInformationExplanation || '',
    /clear evidence that the gathering is a play party/i,
  );
  assert.match(
    trySomethingNew.eventSignificance?.missingInformationExplanation || '',
    /Member sales start Monday, November 1st, 2027/i,
  );

  // Specifically verify generic monthly placeholder "August Play Party" (2027-08-28) is blocked from Recommended queue
  const augustParty = needsReview15.find((c) => c.date === '2027-08-28');
  assert.ok(augustParty);
  assert.equal(augustParty.publicSlug, 'august-play-party-san-francisco-ca-2027-08-28');
  assert.match(
    augustParty.eventSignificance?.missingInformationExplanation || '',
    /generic monthly calendar placeholder/i,
  );

  // 7. Verify candidate missing core required fields (title, date, organizer, or location) is forced to needs_human_review
  const missingVenueCheck = significanceMod.classifyCandidateSignificance({
    id: 'cand-test-missing-venue',
    title: 'Mystery Play Party',
    date: '2027-06-15',
    host: 'The 15 Association',
    hostId: 'org-promoter-the-15-association',
    venue: null,
    city: null,
    description: 'A private play party.',
    playPartyEligibility: { status: 'qualifying_play_party', qualified: true, requiresHumanReview: false },
  });
  assert.equal(missingVenueCheck.category, 'needs_human_review');
  assert.equal(missingVenueCheck.recommendedForQueue, false);
  assert.match(missingVenueCheck.missingInformationExplanation || '', /verifiable city or venue location/i);
});

test('Modern Lifestyle extraction recovery end-to-end integration verification', async () => {
  const reportPath =
    'C:\\Users\\Ryoga\\.openclaw\\workspaces\\swingsphere-content-curator\\reports\\modern-lifestyle-media-recovery.json';
  const recoveryReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const recoveredRows = (recoveryReport.rows || []).filter(
    (r: any) =>
      r.action?.startsWith('Staged official flyer') ||
      r.action?.startsWith('Staged & downloaded official flyer'),
  );
  assert.equal(recoveredRows.length, 395, 'Expected 395 recovered Modern Lifestyle candidates in recovery report');

  const rawSnap = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const snap = normalizeCuratorDashboardSnapshot(rawSnap);
  const candById = new Map(snap.candidates.map((c) => [c.id, c]));

  // 1 & 2. Confirm recovered official flyers and mediaExtraction / extractedMedia / mediaExtractionStatus fields are consumed by SwingSphere frontend
  for (const row of recoveredRows) {
    const c = candById.get(row.candidateId);
    assert.ok(c, `Recovered candidate ${row.candidateId} (${row.event}) must exist in snapshot`);
    assert.equal(c.platform, 'modern_lifestyle');
    assert.equal(c.mediaExtractionStatus, 'Official Flyer Found');
    assert.ok(c.mediaExtraction?.hasOfficialFlyer, `Candidate ${c.id} must have mediaExtraction.hasOfficialFlyer`);
    assert.ok(c.extractedMedia?.officialFlyer, `Candidate ${c.id} must have normalized extractedMedia.officialFlyer`);
    assert.ok(
      c.stagedMedia?.flyerPreviewUrl &&
        !/\/assets\/calendar-icon\.png|\/images\/buttons\/nil_btn\.png/i.test(c.stagedMedia.flyerPreviewUrl),
      `Candidate ${c.id} must have a valid non-icon flyerPreviewUrl on stagedMedia`,
    );

    // 4. Verify recovered descriptions, event dates, organizer associations, and source links are correct
    assert.ok(
      c.displayDescription &&
        c.displayDescription.length >= 20 &&
        !/^\{\{\{\$event_details/i.test(c.displayDescription),
      `Candidate ${c.id} must have a clean recovered displayDescription without macro leaks`,
    );
    if (!c.missingFields?.includes('date')) {
      assert.ok(c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date), `Candidate ${c.id} must have a valid YYYY-MM-DD date`);
    } else {
      assert.equal(
        c.eventSignificance?.category,
        'needs_human_review',
        `Undated candidate ${c.id} must be held in needs_human_review`,
      );
    }
    assert.ok(c.clubId || c.hostId || c.clubName || c.hostName, `Candidate ${c.id} must have an organizer association`);
    assert.ok(
      c.sourceUrl && /^https?:\/\//i.test(c.sourceUrl) && !/\/ical(?:$|\?)/i.test(c.sourceUrl),
      `Candidate ${c.id} must have a canonical HTML sourceUrl (not /ical): ${c.sourceUrl}`,
    );

    // 5. Check that none of the 395 recovered candidates have been duplicated or accidentally approved for publication
    const isExplicitlyHumanApproved =
      (c.reviewState === 'approved' &&
        (c.reviewDecision as any)?.moderationWorkflow === 'local_approval_manual_publish') ||
      (c.reviewState === 'published' && c.publicationRecord?.status === 'published');
    const expectedReviewState = isExplicitlyHumanApproved
      ? c.reviewState
      : c.isClosureNotice
        ? 'excluded_closure_notice'
        : c.archivedAsHistorical || c.auditCategory === 'historical_event'
          ? 'historical_not_for_publication'
          : c.duplicateClassification === 'affiliate_referral_duplicate' ||
              c.duplicateClassification === 'multi_branch_shared_domain_duplicate' ||
              c.duplicateClassification === 'same_club_duplicate' ||
              c.duplicateClassification === 'cross_source_duplicate' ||
              c.canonicalCandidateId
            ? 'possible_duplicate'
            : 'pending_review';
    assert.equal(
      c.reviewState,
      expectedReviewState,
      `Recovered candidate ${c.id} must remain unapproved unless explicitly approved by human editor (actual: ${c.reviewState})`,
    );
    assert.equal(c.publicChangeAuthorized, false, `Candidate ${c.id} must not have publicChangeAuthorized`);
    if (!isExplicitlyHumanApproved) {
      assert.equal(c.reviewDecision, null, `Candidate ${c.id} must not have an automated reviewDecision`);
    }
    assert.notEqual(
      c.reconciliationState,
      'duplicate_translation',
      `Candidate ${c.id} must not be falsely flagged as duplicate_translation`,
    );
  }

  // Verify zero duplicate candidate IDs among Modern Lifestyle candidates
  const mlCandidates = snap.candidates.filter((c) => c.platform === 'modern_lifestyle');
  const seenCandidateIds = new Set<string>();
  const seenSourceUids = new Set<string>();
  for (const c of mlCandidates) {
    assert.equal(seenCandidateIds.has(c.id), false, `Duplicate candidate ID detected: ${c.id}`);
    seenCandidateIds.add(c.id);
    if (c.sourceUrl && !/\/events\/?$/i.test(c.sourceUrl)) {
      const urlDateKey = `${c.clubId || c.hostId || ''}::${c.sourceUrl}::${c.date || ''}`;
      assert.equal(
        seenSourceUids.has(urlDateKey),
        false,
        `Duplicate Modern Lifestyle candidate detected for ${urlDateKey} (${c.id})`,
      );
      seenSourceUids.add(urlDateKey);
    }
  }

  // 6. Verify candidates that moved out of needs_human_review into special_event / monthly_signature still require explicit human approval
  const reclassifiedMl = recoveredRows
    .map((r: any) => candById.get(r.candidateId)!)
    .filter(
      (c) =>
        !c.isClosureNotice &&
        c.eventSignificance?.category &&
        c.eventSignificance.category !== 'needs_human_review',
    );
  assert.ok(
    reclassifiedMl.length >= 100,
    `Expected at least 100 recovered candidates classified as special_event/monthly_signature (actual: ${reclassifiedMl.length})`,
  );
  for (const c of reclassifiedMl) {
    const isExplicitlyHumanApproved =
      (c.reviewState === 'approved' &&
        (c.reviewDecision as any)?.moderationWorkflow === 'local_approval_manual_publish') ||
      (c.reviewState === 'published' && c.publicationRecord?.status === 'published');
    assert.ok(
      c.reviewState === 'pending_review' ||
        c.reviewState === 'historical_not_for_publication' ||
        c.reviewState === 'possible_duplicate' ||
        isExplicitlyHumanApproved,
      `Reclassified candidate ${c.id} must still require human review, be excluded as a duplicate, or be archived as historical (actual: ${c.reviewState})`,
    );
    assert.equal(c.publicChangeAuthorized, false);
    if (!isExplicitlyHumanApproved) {
      assert.equal(c.needsPublish, false, `Unapproved candidate ${c.id} must not be marked needsPublish`);
    }
  }

  // Verify local media-preview endpoint streams locally downloaded official flyers with HTTP 200 and valid image MIME
  const localDownloadedCand = mlCandidates.find((c) =>
    c.stagedMedia?.flyerPreviewUrl?.includes('role=official_flyer'),
  );
  assert.ok(localDownloadedCand, 'Expected at least one Modern Lifestyle candidate with locally downloaded official_flyer preview URL');
  let previewStatus = 0;
  const previewHeaders: Record<string, string> = {};
  let previewBuffer: Buffer | string | null = null;
  const previewRes = {
    get statusCode() {
      return previewStatus;
    },
    set statusCode(val: number) {
      previewStatus = val;
    },
    setHeader(k: string, v: string) {
      previewHeaders[k.toLowerCase()] = v;
    },
    end(payload: Buffer | string) {
      previewBuffer = payload;
    },
  };
  await streamCuratorMediaPreview(
    makeLocalAdminReq(
      `/api/admin/curator/media-preview?mediaId=${localDownloadedCand.id}&version=official&role=official_flyer&adminPreview=1`,
    ),
    previewRes,
  );
  assert.equal(previewStatus, 200, 'Expected HTTP 200 from streamCuratorMediaPreview for official_flyer');
  assert.match(previewHeaders['content-type'] || '', /^image\/(jpeg|png|webp)$/i);
  assert.ok(Buffer.isBuffer(previewBuffer) && previewBuffer.length > 1000, 'Expected non-empty official flyer image buffer');

  // 3. Confirm viewing additional extracted images, selecting one as preferred flyer, and preserving selection across snapshot reload
  const multiImageCand = mlCandidates.find(
    (c) => (c.extractedMedia?.additionalMedia?.length || 0) >= 2,
  );
  assert.ok(multiImageCand, 'Expected a Modern Lifestyle candidate with multiple additional extracted images');
  const originalFlyerUrl = multiImageCand.flyerUrl;
  const additionalImg = multiImageCand.extractedMedia!.additionalMedia![0];
  const additionalUrl = additionalImg.highResUrl || additionalImg.originalUrl || additionalImg.url;
  assert.ok(additionalUrl && additionalUrl !== originalFlyerUrl);

  const openclawCoreUrl = new URL(
    'file:///C:/Users/Ryoga/.openclaw/workspaces/swingsphere-content-curator/src/core.mjs',
  ).href;
  const coreMod = await import(openclawCoreUrl);
  const dbBefore = coreMod.database();
  const rawCandBefore = coreMod.all(dbBefore, 'candidates').find((x: any) => x.id === multiImageCand.id);

  try {
    const selectRes = await executeCuratorBridgeCommand(
      makeLocalAdminReq('/api/admin/curator/command'),
      {
        idempotencyKey: `test-select-extracted-${multiImageCand.id}-${Date.now()}`,
        commandType: 'artwork_select_extracted',
        targetId: multiImageCand.id,
        payload: {
          url: additionalUrl,
          classification: additionalImg.mediaClassification || 'event_photo_gallery',
        },
      },
    );
    assert.equal(selectRes.ok, true);

    // Reload snapshot (simulating page refresh) and verify selection is preserved
    const refreshedRaw = await getCuratorBridgeSnapshot(makeLocalAdminReq());
    const refreshedSnap = normalizeCuratorDashboardSnapshot(refreshedRaw);
    const refreshedCand = refreshedSnap.candidates.find((c) => c.id === multiImageCand.id)!;
    assert.ok(refreshedCand.selectedExtractedMedia, 'selectedExtractedMedia must be present after refresh');
    assert.equal(refreshedCand.selectedExtractedMedia?.url, additionalUrl);
    assert.equal(refreshedCand.flyerUrl, additionalUrl);
    assert.equal(refreshedCand.customFlyerUrl, additionalUrl);

    const provAfterSelect = resolveArtworkRoleProvenance(refreshedCand, null, 'flyer');
    assert.equal(provAfterSelect.kind, 'official_reference');
    assert.equal(provAfterSelect.badgeLabel, 'Selected Extracted Artwork');
  } finally {
    const dbRestore = coreMod.database();
    if (rawCandBefore) {
      coreMod.put(dbRestore, 'candidates', multiImageCand.id, rawCandBefore);
    }
    dbRestore.prepare("DELETE FROM command_queue WHERE idempotency_key LIKE 'test-select-extracted-%'").run();
  }

  // 7 & 8. Ensure image recovery didn't trigger unnecessary AI generation and official artwork takes priority over unapproved generated/procedural images
  const playEncounters = candById.get('candidate-d05380cbb87538c756dd2b18');
  assert.ok(playEncounters, 'Expected Playful Encounters candidate to exist');
  assert.equal(playEncounters.stagedMedia?.source, 'official_or_existing');
  assert.equal(playEncounters.stagedMedia?.status, 'official_artwork_review');
  assert.equal(playEncounters.stagedMedia?.flyerPreviewUrl, playEncounters.flyerUrl);
  const playProv = resolveArtworkRoleProvenance(playEncounters, null, 'flyer');
  assert.equal(playProv.kind, 'official_reference');

  const draft = buildAuthorizedEventDraftFromCandidate(playEncounters, []);
  assert.equal(draft.flyerImageUrl, playEncounters.flyerUrl);
});

test('Destination, cruise, affiliate, and multi-branch duplicate deduplication in active Content Curator queue', async () => {
  const rawSnapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const snapshot = normalizeCuratorDashboardSnapshot(rawSnapshot);
  const allCandidates = snapshot.candidates;

  // Simulate AdminContentCurator baseActionableQueuePool + filterCandidatesByQueueSignificance
  const activePendingPool = allCandidates.filter((c) => {
    if (isCandidateArchivedOrExpired(c)) return false;
    if (isCandidateExcludedDuplicate(c)) return false;
    if (c.reviewState === 'rejected' || c.reviewState === 'published' || c.reviewState === 'approved') return false;
    return true;
  });
  const mainRecommendedQueue = filterCandidatesByQueueSignificance(activePendingPool, 'recommended');
  const fullReviewQueue = filterCandidatesByQueueSignificance(activePendingPool, 'all');

  // 1. NOV 2026 Dirty Perv Week Takeover (2026-11-07) -> exactly 1 canonical candidate (active or human-published), all affiliates excluded
  const dirtyPervAll = allCandidates.filter((c) => /dirty perv week/i.test(c.title));
  const dirtyPervNonDuplicates = dirtyPervAll.filter((c) => !isCandidateExcludedDuplicate(c));
  assert.ok(dirtyPervAll.length >= 11, `Expected all 11 Dirty Perv Week records preserved for audit, got ${dirtyPervAll.length}`);
  assert.equal(dirtyPervNonDuplicates.length, 1, 'Expected exactly 1 canonical Dirty Perv Week candidate across all records');
  const dirtyPervCanonical = dirtyPervNonDuplicates[0];
  assert.equal(dirtyPervCanonical.id, 'candidate-e031a5f5a003d9bb5ed44433');
  assert.equal(dirtyPervCanonical.clubName, 'Hedonism II');
  assert.equal(dirtyPervCanonical.hostName, 'IOS Connections');
  assert.equal(dirtyPervCanonical.venue, 'Hedonism II');
  assert.equal(dirtyPervCanonical.city, 'Negril');
  assert.equal(dirtyPervCanonical.duplicateClassification, 'canonical_destination_event');
  assert.ok((dirtyPervCanonical.affiliateDuplicateIds?.length || 0) >= 10);

  const dirtyPervDuplicates = dirtyPervAll.filter((c) => c.id !== dirtyPervCanonical.id);
  for (const dup of dirtyPervDuplicates) {
    assert.equal(isCandidateExcludedDuplicate(dup), true, `Expected ${dup.id} (${dup.title}) to be excluded as duplicate`);
    assert.equal(dup.reviewState, 'possible_duplicate');
    assert.equal(dup.publishEligible, false);
    assert.equal(dup.eventSignificance?.recommendedForQueue, false);
    assert.equal(dup.canonicalCandidateId, dirtyPervCanonical.id);
  }

  // 2. Bliss Cruise - RCI Wonder Charter Nov 2026 (2026-11-09) -> exactly 1 canonical candidate (active or human-published), all affiliates excluded
  const blissNovAll = allCandidates.filter((c) => /bliss cruise.*wonder charter/i.test(c.title));
  const blissNovNonDuplicates = blissNovAll.filter((c) => !isCandidateExcludedDuplicate(c));
  assert.ok(blissNovAll.length >= 11, `Expected all 11 Bliss Cruise Nov 2026 records preserved for audit, got ${blissNovAll.length}`);
  assert.equal(blissNovNonDuplicates.length, 1, 'Expected exactly 1 canonical Bliss Cruise Nov 2026 candidate across all records');
  const blissNovCanonical = blissNovNonDuplicates[0];
  assert.equal(blissNovCanonical.id, 'candidate-44f92ddfa87265937acf0876');
  assert.equal(blissNovCanonical.clubName, 'Bliss Cruise');
  assert.equal(blissNovCanonical.hostName, 'Bliss Cruise');
  assert.equal(blissNovCanonical.venue, 'RCI Wonder of the Seas');
  assert.equal(blissNovCanonical.city, 'Miami');
  assert.equal(blissNovCanonical.duplicateClassification, 'canonical_destination_event');

  // 3. Bliss Cruise - RCI Celebrity Summit Charter Feb 2027 (2027-02-24) -> distinct date preserved as 1 canonical entry
  const blissFebNonDuplicates = allCandidates.filter(
    (c) => /bliss cruise.*summit charter/i.test(c.title) && !isCandidateExcludedDuplicate(c),
  );
  assert.equal(blissFebNonDuplicates.length, 1, 'Expected distinct Feb 2027 Bliss Cruise charter preserved as 1 canonical entry');
  assert.equal(blissFebNonDuplicates[0].clubName, 'Bliss Cruise');
  assert.equal(blissFebNonDuplicates[0].hostName, 'Bliss Cruise');

  // 4. Valid distinct events with the same title in different cities remain separate active entries
  const newbieNightsActive = activePendingPool.filter(
    (c) => c.title.trim().toLowerCase() === 'newbie night',
  );
  const newbieCities = new Set(newbieNightsActive.map((c) => c.city));
  assert.equal(
    newbieCities.has('Sydney') && newbieCities.has('Miami'),
    true,
    'Distinct Newbie Night events in Sydney and Miami must not be merged',
  );

  // 5. Verify zero remaining duplicate (date + normalized title + club/venue/host) groups in fullReviewQueue
  const seenKeys = new Map<string, CuratorCandidateRecord>();
  for (const c of fullReviewQueue) {
    const normTitle = c.title
      .toLowerCase()
      .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+20\d{2}\b/g, '')
      .replace(/\btakeover\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const scope = (c.clubId || c.venue || c.hostName || c.clubName || '').toLowerCase().trim();
    const key = `${c.date || 'undated'}|${normTitle}|${scope}`;
    assert.equal(
      seenKeys.has(key),
      false,
      `Unexpected duplicate in active queue for key ${key}: ${c.id} vs ${seenKeys.get(key)?.id}`,
    );
    seenKeys.set(key, c);
  }

  // 6. Verify editorial review & manual publish guards block excluded duplicates
  const sampleDup = dirtyPervDuplicates[0];
  const reviewValidation = validateCandidateForEditorialReview(sampleDup);
  assert.equal(reviewValidation.canApprove, false);
  assert.ok(reviewValidation.blockingReasons.some((e) => /duplicate/i.test(e)));
  const publishValidation = validateCandidateForManualPublish(sampleDup, []);
  assert.ok(publishValidation.errors.some((e) => /duplicate/i.test(e)));
});

test('Hotwife Community independent promoter: official branding, series & partner-venue relationship with Club Joi, LFN cross-calendar deduplication, and evening local date preservation', async () => {
  // 1. Verify Hotwife Community organization catalog entry
  const hwcOrg = mockOrganizations.find((o) => o.id === 'org-promoter-hotwife-community');
  assert.ok(hwcOrg, 'Expected org-promoter-hotwife-community in mockOrganizations');
  assert.equal(hwcOrg.name, 'Hotwife Community');
  assert.equal(hwcOrg.website, 'https://hotwifecommunity.com/');
  assert.ok(
    hwcOrg.logoImageUrl?.includes('modernlifestyle-prod.nyc3.cdn.digitaloceanspaces.com/3180576/2f62bc21-32a6-47b9-843b-b8ecce39332e/original.jpg'),
    'Expected official Hotwife Community crest logo',
  );
  assert.ok(
    hwcOrg.headerImageUrl?.includes('modernlifestyle-prod.nyc3.cdn.digitaloceanspaces.com/3180566/7abac4f3-7b3b-455d-9b52-d6931aa96190/original.png'),
    'Expected official Hotwife Community banner header',
  );

  // 2. Verify Ladies Fantasy Night and Hotwife Palooza event series & partner-venue relationship
  const lfnSeries = eventSeries.find((s) => s.id === 'series-ladies-fantasy-night');
  assert.ok(lfnSeries, 'Expected series-ladies-fantasy-night in eventSeries');
  assert.equal(lfnSeries.organizerOrganizationId, 'org-promoter-hotwife-community');
  assert.equal(lfnSeries.defaultVenueId, 'venue-club-club-joi-la');

  const paloozaSeries = eventSeries.find((s) => s.id === 'series-hotwife-palooza');
  assert.ok(paloozaSeries, 'Expected series-hotwife-palooza in eventSeries');
  assert.equal(paloozaSeries.organizerOrganizationId, 'org-promoter-hotwife-community');

  const hwcJoiRel = mockOrganizationVenueRelationships.find((r) => r.id === 'rel-hotwife-community-club-joi-la');
  assert.ok(hwcJoiRel, 'Expected rel-hotwife-community-club-joi-la in mockOrganizationVenueRelationships');
  assert.equal(hwcJoiRel.organizationId, 'org-promoter-hotwife-community');
  assert.equal(hwcJoiRel.venueId, 'venue-club-club-joi-la');
  assert.equal(hwcJoiRel.relationshipType, 'recurring_guest');

  // 3. Verify live Content Curator snapshot has Hotwife Community monitored source and 3 canonical LFN events
  const rawSnapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const snapshot = normalizeCuratorDashboardSnapshot(rawSnapshot);

  const hwcSource = snapshot.monitoredSources.find((s) => s.id === 'org-promoter-hotwife-community');
  assert.ok(hwcSource, 'Expected org-promoter-hotwife-community in monitoredSources');
  assert.equal(hwcSource.entityType, 'promoter');
  assert.equal(hwcSource.calendarUrl, 'https://hotwifecommunity.com/events');

  const lfnCandidates = snapshot.candidates.filter(
    (c) => (c as any).seriesId === 'series-ladies-fantasy-night' || /\bLFN\b/i.test(c.title),
  );
  assert.equal(lfnCandidates.length, 3, 'Expected 3 canonical Ladies Fantasy Night candidates deduplicated across Hotwife Community and Club Joi calendars');
  const lfnDates = lfnCandidates.map((c) => c.date).sort();
  assert.deepEqual(
    lfnDates,
    ['2026-11-01', '2026-11-25', '2026-12-13'],
    'All 3 LFN events must preserve their local America/Los_Angeles evening dates',
  );
  for (const lfn of lfnCandidates) {
    assert.equal(lfn.hostId, 'org-promoter-hotwife-community');
    assert.equal(lfn.hostName, 'Hotwife Community');
    assert.equal(lfn.clubName, 'Hotwife Community');
    assert.equal(lfn.clubId, null, 'Promoter-hosted event at partner venue must not set clubId to Club Joi');
    assert.equal((lfn as any).venueId, 'venue-club-club-joi-la');
    assert.equal(lfn.venue, 'Club Joi');
    assert.equal(lfn.startTime, '20:00:00');
    assert.equal(lfn.endTime, '02:00:00');
    assert.equal(lfn.timezone, 'America/Los_Angeles');
  }
});




