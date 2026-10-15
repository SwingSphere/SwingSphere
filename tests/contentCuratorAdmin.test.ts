import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  requireCuratorAdmin,
  getCuratorBridgeSnapshot,
  executeCuratorBridgeCommand,
  streamCuratorMediaPreview,
  sanitizeBridgeError,
  ensureAutomaticCuratorBridgeSync,
} from '../lib/contentCuratorBridgeServer';
import {
  buildAuthorizedEventDraftFromCandidate,
  buildCommandIdempotencyKey,
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

  // 84 monitored sources (70 clubs + 14 promoters)
  assert.equal(snapshot.summary.sources.total, 84);
  assert.equal(snapshot.summary.sources.clubs, 70);
  assert.equal(snapshot.summary.sources.promoters, 14);
  assert.equal(snapshot.monitoredSources.length, 84);

  // Staged candidates (113+ as live scheduled discovery runs), all approval-gated
  assert.ok(snapshot.candidates.length >= 113);
  assert.equal(snapshot.candidates.length, snapshot.summary.reviewQueue.totalStaged);
  assert.ok(snapshot.candidates.every((c: CuratorCandidateRecord) => c.publicChangeAuthorized === false));
  assert.ok(snapshot.summary.reviewQueue.inferredYearCount >= 30);

  // Verify every candidate reviewState in the live database is permitted by the Supabase migration constraint
  const allowedMigrationReviewStates = new Set([
    'pending_review',
    'approved',
    'staged_in_submissions',
    'rejected',
    'changes_requested',
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

  // Media records, including 6 generated 1080x1350 + 1920x1080 pairs and 7-point visual relevance criteria
  assert.ok(snapshot.mediaItems.length >= 54);
  assert.equal(snapshot.mediaItems.length, snapshot.summary.artwork.total);
  assert.equal(snapshot.summary.artwork.generatedPairs, 6);
  const twistPair = snapshot.mediaItems.find((m: any) => m.id === 'candidate-1794dc45e24f56d473a38e83');
  assert.ok(twistPair);
  assert.equal(twistPair.hasGeneratedPair, true);
  assert.equal(twistPair.dimensions.flyer.width, 1080);
  assert.equal(twistPair.dimensions.flyer.height, 1350);
  assert.equal(twistPair.dimensions.hero.width, 1920);
  assert.equal(twistPair.dimensions.hero.height, 1080);
  assert.equal(twistPair.visualEvaluation.criteria.length, 7);
  assert.equal(twistPair.publicPublishingAuthorized, false);

  // 5 operational cron jobs distinguishing scheduler outcome from source extraction outcome
  assert.equal(snapshot.agentAndJobs.cronJobs.length, 5);
  const scanJob = snapshot.agentAndJobs.cronJobs.find((j: any) => j.command === 'scan');
  assert.ok(scanJob);
  assert.ok(['idle', 'ok'].includes(scanJob.schedulerOutcome.lastStatus));
  assert.equal(scanJob.extractionOutcome.status, 'partial');
  assert.ok(scanJob.extractionOutcome.failedSources > 0);

  const reportJob = snapshot.agentAndJobs.cronJobs.find((j: any) => j.command === 'report');
  assert.ok(reportJob);
  assert.equal(reportJob.schedulerOutcome.lastStatus, 'ok');
  assert.equal(reportJob.extractionOutcome.status, 'ok');

  // Verify no local filesystem paths leak into the snapshot payload
  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('C:\\Users\\Ryoga'));
  assert.ok(!serialized.includes('file:///'));
});

test('Phase 2 & 4: restricted preview media streaming serves all 6 real portrait flyers and landscape heroes with private no-store headers and blocks traversal', async () => {
  const snapshot = await getCuratorBridgeSnapshot(makeLocalAdminReq());
  const generatedPairs = snapshot.mediaItems.filter((m: any) => m.hasGeneratedPair);
  assert.equal(generatedPairs.length, 6);

  for (const item of generatedPairs) {
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
  assert.equal(offlineSnapshot.monitoredSources.length, 84);
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
  assert.match(curatorUiSrc, /openclaw infer image/);
  assert.match(curatorUiSrc, /\*\/15 \* \* \* \*/);
  assert.match(curatorUiSrc, /sm:grid-cols-4/);
  assert.match(curatorUiSrc, /xl:grid-cols-12/);
});

