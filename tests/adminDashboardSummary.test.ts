import assert from 'node:assert/strict';
import {
  buildDirectoryHealthSummary,
  buildOperationalQueue,
  buildRecentActivityFeed,
  buildUserGrowthSummary,
  evaluateTrafficProvenance,
  type DashboardSummaryInput,
} from '../lib/admin/dashboardSummary';
import type { InboundAnalyticsSummary } from '../lib/analytics/inboundReports';

const sampleNowMs = Date.parse('2026-10-09T12:00:00Z');

const createSampleInput = (): DashboardSummaryInput => ({
  nowMs: sampleNowMs,
  listings: [
    {
      id: 'club-1',
      type: 'club',
      name: 'Velvet Lounge',
      description: 'Premier lounge',
      location: 'Austin, TX',
      contactEmail: 'info@velvet.test',
      headerImageUrl: 'https://example.com/hero.jpg',
      brandLogoUrl: 'https://example.com/logo.png',
      geopoint: {
        latitude: 30.2672,
        longitude: -97.7431,
        address: { city: 'Austin', region: 'TX', country: 'USA' },
      },
      schedule: [{ id: 's-1', day: 'Saturday', hours: '9pm-2am', description: 'Main night' }],
      generalAmenities: ['Dance Floor'],
      status: 'approved',
      postedByUserId: 'u-1',
      buildingAssetId: 'bldg-1',
    },
    {
      id: 'club-2-dup',
      type: 'club',
      name: 'Velvet Lounge',
      description: 'Duplicate entry',
      location: 'Austin, TX',
      contactEmail: 'dup@velvet.test',
      geopoint: {
        latitude: 30.2675,
        longitude: -97.7435,
        address: { city: 'Austin', region: 'TX', country: 'USA' },
      },
      schedule: [],
      generalAmenities: [],
      status: 'pending_approval',
      postedByUserId: 'u-2',
    },
    {
      id: 'event-1',
      type: 'event',
      name: 'Midnight Masquerade',
      description: 'Upcoming gala',
      location: 'Miami, FL',
      contactEmail: 'events@velvet.test',
      geopoint: {
        latitude: 25.7617,
        longitude: -80.1918,
        address: { city: 'Miami', region: 'FL', country: 'USA' },
      },
      time: {
        start: '2026-11-15T21:00:00Z',
        end: '2026-11-16T03:00:00Z',
      },
      status: 'approved',
      postedByUserId: 'u-1',
    },
  ],
  venues: [
    {
      id: 'venue-1',
      type: 'venue',
      name: 'The Velvet Building',
      slug: 'velvet-building',
      address: { city: 'Austin', region: 'TX', country: 'USA' },
      latitude: 30.2672,
      longitude: -97.7431,
      visibility: 'public_exact',
      status: 'published',
      amenities: [],
      buildingAssetId: 'bldg-1',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-08T15:00:00Z',
    },
    {
      id: 'venue-2-unverified',
      type: 'venue',
      name: 'Unverified Warehouse',
      slug: 'unverified-warehouse',
      address: { city: 'Dallas', region: 'TX', country: 'USA' },
      latitude: 32.7767,
      longitude: -96.797,
      visibility: 'public_exact',
      status: 'published',
      amenities: [],
      createdAt: '2026-10-07T12:00:00Z',
      updatedAt: '2026-10-07T12:00:30Z',
    },
  ],
  organizations: [
    {
      id: 'org-1',
      type: 'organization',
      name: 'Velvet Hospitality Group',
      slug: 'velvet-hospitality',
      displayTypes: ['host', 'promoter'],
      status: 'active',
      createdAt: '2026-10-08T09:00:00Z',
      updatedAt: '2026-10-08T09:00:10Z',
    },
  ],
  venueRelationships: [],
  clubBrands: [
    {
      id: 'brand-1',
      type: 'club_brand',
      name: 'Velvet Brand',
      slug: 'velvet-brand',
      status: 'draft',
      createdAt: '2026-10-05T08:00:00Z',
      updatedAt: '2026-10-08T11:00:00Z',
    },
  ],
  eventSeries: [],
  resorts: [],
  cruiseSeries: [],
  cruiseSailings: [],
  buildingAssets: [
    {
      id: 'bldg-1',
      venueId: 'venue-1',
      listingId: 'club-1',
      source: {
        provider: 'OpenFreeMap',
        featureIds: ['f-1'],
      },
      footprint: {
        type: 'Polygon',
        coordinates: [
          [
            [-97.7431, 30.2672],
            [-97.743, 30.2672],
            [-97.743, 30.2673],
            [-97.7431, 30.2672],
          ],
        ],
      },
      Parts: [],
      anchor: { lng: -97.7431, lat: 30.2672 },
      render: { heightMeters: 12, minHeightMeters: 0, color: '#37d97a' },
      capture: {
        createdAt: '2026-10-08T18:00:00Z',
        updatedAt: '2026-10-08T18:00:00Z',
      },
    },
  ],
  openSiteIssueCount: 2,
  pendingWrittenReviews: [
    {
      id: 'rev-1',
      targetType: 'club',
      targetId: 'club-1',
      targetName: 'Velvet Lounge',
      authorUserId: 'u-2',
      authorDisplayName: 'Alex',
      body: 'Great atmosphere!',
      status: 'pending',
      createdAt: '2026-10-08T10:00:00Z',
      updatedAt: '2026-10-08T10:00:00Z',
    },
  ],
  openClaims: [
    {
      id: 'claim-1',
      listingId: 'club-1',
      claimantUserId: 'u-3',
      claimantRole: 'Owner',
      status: 'pending',
      verificationMethod: 'official_domain_email',
      evidenceReceived: false,
      evidenceDeleted: false,
      createdAt: '2026-10-08T16:00:00Z',
      updatedAt: '2026-10-08T16:00:00Z',
    },
  ],
  auditLogs: [
    {
      id: 'audit-1',
      timestamp: '2026-10-08T20:00:00Z',
      userId: 'admin-1',
      userName: 'Chief Admin',
      targetUserId: 'u-2',
      targetUserName: 'Alex',
      action: 'user.role_changed',
      reason: 'Promoted to Host',
    },
  ],
});

// 1. Test Traffic Provenance Evaluation
{
  const mixedSummary: InboundAnalyticsSummary = {
    from: '2026-09-10',
    to: '2026-10-09',
    totalSessions: 120,
    totalViews: 210,
    totalUniqueVisitors: 100,
    bySource: [],
    byReferrer: [],
    byLanding: [],
    byDevice: [],
    byCountry: [],
    byRegion: [],
    byCampaign: [],
    daily: [
      { day: '2026-09-15', sessions: 40, views: 40, visitors: 38 },
      { day: '2026-10-08', sessions: 80, views: 170, visitors: 62 },
    ],
  };

  const prov = evaluateTrafficProvenance(mixedSummary);
  assert.equal(prov.mode, 'mixed_history');
  assert.equal(prov.sessionDerivedDaysCount, 1);
  assert.equal(prov.multiPageTrackedDaysCount, 1);
}

// 2. Test Operational Queue Generation & Filtered Record IDs
{
  const input = createSampleInput();
  const queue = buildOperationalQueue(input);

  const submissionsItem = queue.find((i) => i.id === 'pending-submissions');
  assert.ok(submissionsItem);
  assert.equal(submissionsItem.count, 1);
  assert.equal(submissionsItem.severity, 'critical');
  assert.deepEqual(submissionsItem.filterSpec?.ids, ['club-2-dup']);

  const moderationItem = queue.find((i) => i.id === 'moderation-queue');
  assert.ok(moderationItem);
  assert.equal(moderationItem.count, 3); // 2 site issues + 1 pending review
  assert.equal(moderationItem.severity, 'critical');

  const spatialItem = queue.find((i) => i.id === 'building-verification');
  assert.ok(spatialItem);
  assert.ok(spatialItem.count >= 2); // venue-2-unverified + club-2-dup
  assert.ok(spatialItem.filterSpec?.ids.includes('venue-2-unverified'));

  const duplicateItem = queue.find((i) => i.id === 'duplicate-listings');
  assert.ok(duplicateItem);
  assert.equal(duplicateItem.count, 2); // club-1 and club-2-dup share "velvet lounge|austin"
}

// 3. Test Content & Directory Health Summary
{
  const input = createSampleInput();
  const health = buildDirectoryHealthSummary(input);
  assert.equal(health.totalPublishedListings, 2); // club-1 (approved) + event-1 (approved)
  const clubsHealth = health.categories.find((c) => c.key === 'clubs');
  assert.ok(clubsHealth);
  assert.equal(clubsHealth.total, 2);
  assert.equal(clubsHealth.published, 1);
  assert.equal(clubsHealth.draftOrPending, 1);
  assert.equal(clubsHealth.completenessPct, 50); // club-1 complete, club-2-dup incomplete
}

// 4. Test Substantiated Recent Activity Feed
{
  const input = createSampleInput();
  const feed = buildRecentActivityFeed(input, 10);
  assert.ok(feed.length >= 5);
  // Most recent should be audit-1 at 20:00Z, followed by bldg-1 at 18:00Z
  assert.equal(feed[0].id, 'audit-audit-1');
  assert.equal(feed[0].kind, 'admin_audit');
  assert.equal(feed[1].kind, 'building_verified');
  assert.equal(feed[1].actionLabel, '3D building captured');
  // org-1 was created (createdAt and updatedAt 10s apart)
  const orgActivity = feed.find((item) => item.entityId === 'org-1');
  assert.ok(orgActivity);
  assert.equal(orgActivity.kind, 'entity_created');
  // venue-1 was updated (createdAt Oct 1, updatedAt Oct 8)
  const venueActivity = feed.find((item) => item.entityId === 'venue-1' && item.kind === 'entity_updated');
  assert.ok(venueActivity);
}

// 5. Test User Growth Summary
{
  const growth = buildUserGrowthSummary({
    users: [
      {
        id: 'u-1',
        displayName: 'Founder One',
        role: 'Admin',
        status: 'Active',
        joinDate: '2026-10-05T12:00:00Z',
        emailVerifiedAt: '2026-10-05T12:05:00Z',
        founderNumber: 1,
        profileVisibility: 'visible',
        badgeCount: 2,
        publicBadgeCount: 2,
        organizationCount: 1,
        approvedReviewCount: 0,
        adminMetadataAvailable: true,
      },
      {
        id: 'u-2',
        displayName: 'Member Two',
        role: 'User',
        status: 'Active',
        joinDate: '2026-10-08T15:00:00Z',
        profileVisibility: 'private',
        badgeCount: 0,
        publicBadgeCount: 0,
        organizationCount: 0,
        approvedReviewCount: 1,
        adminMetadataAvailable: true,
      },
      {
        id: 'u-prev',
        displayName: 'Prior Member',
        role: 'Host',
        status: 'Active',
        joinDate: '2026-09-28T10:00:00Z',
        emailVerifiedAt: '2026-09-28T10:10:00Z',
        profileVisibility: 'visible',
        badgeCount: 1,
        publicBadgeCount: 1,
        organizationCount: 1,
        approvedReviewCount: 0,
        adminMetadataAvailable: true,
      },
    ],
    from: '2026-10-03',
    to: '2026-10-09',
    granularity: 'daily',
  });

  assert.equal(growth.totalUsers, 3);
  assert.equal(growth.newUsersInPeriod, 2);
  assert.equal(growth.newUsersPreviousPeriod, 1);
  assert.equal(growth.newUsersDelta.formatted, '+100.0%');
  assert.equal(growth.verifiedUsers, 2);
  assert.equal(growth.unverifiedUsers, 1);
  assert.equal(growth.verificationRatePct, 67);
  assert.equal(growth.foundingMembers, 1);
  assert.equal(growth.byRole.admin, 1);
  assert.equal(growth.byRole.host, 1);
  assert.equal(growth.byRole.user, 1);
  assert.equal(growth.trendPoints.length, 7);
}

console.log('All Admin Dashboard v2 summary tests passed!');
