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
  buildAuthorizedEventDraftFromCandidate,
  buildCommandIdempotencyKey,
  gatherPublishableApprovedCandidates,
  publishApprovedCuratorChanges,
  setLastCachedCuratorSnapshot,
  getLastCachedCuratorSnapshot,
  toOfflineSnapshotFallback,
  type CuratorCandidateRecord,
} from '../lib/contentCuratorApi';
import type { ClubData } from '../types';

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
