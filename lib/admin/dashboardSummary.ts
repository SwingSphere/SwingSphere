import type {
  BuildingAsset,
  ClubBrandData,
  ClubData,
  CruiseSailingData,
  CruiseSeriesData,
  EventData,
  EventSeriesData,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  ResortData,
  VenueData,
} from '../../types';
import type { AdminView } from '../../components/admin/AdminPanel';
import type { AdminManagedUser } from './userManagement';
import type { AdminAuditLogEntry } from './auditLog';
import type { AdminListingClaim } from '../claims/listingClaims';
import type { PendingWrittenReview } from '../feedback/adminFeedbackModeration';
import type { PlatformHealthSnapshot } from './platformHealth';
import { buildingVerificationNeedsReview } from '../buildingVerification';
import { resolveBrandLogo, type BrandMediaCatalog } from '../entityBrandMedia';
import {
  getBuildingAssetForListing,
  getBuildingAssetForVenue,
  getVenueForListing,
} from '../entityCompatibility';
import {
  buildAnalyticsTrendPoints,
  computePercentageChange,
  shiftUtcDays,
  toDateInput,
  type AnalyticsGranularity,
  type DeltaResult,
  type TrendPoint,
} from '../analytics/trendSeries';
import type { InboundAnalyticsSummary } from '../analytics/inboundReports';

export type OperationalSeverity = 'critical' | 'warning' | 'info' | 'healthy';

export type OperationalCategory =
  | 'approvals'
  | 'moderation'
  | 'spatial'
  | 'media'
  | 'duplicates'
  | 'completeness'
  | 'system';

export type AdminQueueFilterSpec = {
  target:
    | 'clubs'
    | 'events'
    | 'venues'
    | 'organizations'
    | 'travel'
    | 'moderation'
    | 'submissions'
    | 'claims'
    | 'settings';
  mode?: string;
  tab?: string;
  ids: string[];
  label: string;
};

export type OperationalAffectedRecord = {
  id: string;
  name: string;
  entityType: string;
  subtitle: string;
  reason: string;
  status?: string;
  editView: AdminView;
  secondaryAction?: {
    label: string;
    view?: AdminView;
    href?: string;
  };
};

export type OperationalQueueItem = {
  id: string;
  title: string;
  description: string;
  category: OperationalCategory;
  severity: OperationalSeverity;
  count: number;
  actionLabel: string;
  targetView: AdminView;
  filterSpec?: AdminQueueFilterSpec;
  records: OperationalAffectedRecord[];
};

export type DirectoryCategoryHealth = {
  key: 'clubs' | 'events' | 'hosts' | 'resorts' | 'cruises' | 'venues';
  label: string;
  total: number;
  published: number;
  draftOrPending: number;
  secondaryLabel: string;
  secondaryCount: number;
  completenessPct: number;
  completenessNote: string;
  targetView: AdminView;
};

export type DirectoryHealthSummary = {
  totalPublishedListings: number;
  totalCatalogRecords: number;
  overallCompletenessPct: number;
  categories: DirectoryCategoryHealth[];
};

export type RecentActivityKind =
  | 'building_verified'
  | 'admin_audit'
  | 'entity_created'
  | 'entity_updated'
  | 'claim_submitted'
  | 'submission_pending';

export type RecentActivityItem = {
  id: string;
  kind: RecentActivityKind;
  entityId: string;
  entityName: string;
  entityType: string;
  actionLabel: string;
  detail: string;
  occurredAt: string;
  timestampMs: number;
  isSubstantiatedTimestamp: boolean;
  targetView: AdminView;
  secondaryHref?: string;
};

export type UserGrowthSummary = {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  newUsersInPeriod: number;
  newUsersPreviousPeriod: number;
  newUsersDelta: DeltaResult;
  verifiedUsers: number;
  unverifiedUsers: number;
  verificationRatePct: number;
  adminMetadataAvailable: boolean;
  foundingMembers: number;
  byRole: {
    user: number;
    host: number;
    admin: number;
  };
  trendPoints: TrendPoint[];
};

export type TrafficProvenanceInfo = {
  mode: 'full_pageviews' | 'mixed_history' | 'session_derived_estimates';
  badgeLabel: string;
  shortNote: string;
  explanation: string;
  sessionDerivedDaysCount: number;
  multiPageTrackedDaysCount: number;
};

export type DashboardSummaryInput = {
  listings: Listing[];
  venues: VenueData[];
  organizations: OrganizationData[];
  venueRelationships: OrganizationVenueRelationship[];
  clubBrands: ClubBrandData[];
  eventSeries: EventSeriesData[];
  resorts: ResortData[];
  cruiseSeries: CruiseSeriesData[];
  cruiseSailings: CruiseSailingData[];
  buildingAssets: BuildingAsset[];
  openSiteIssueCount: number;
  pendingWrittenReviews?: PendingWrittenReview[];
  openClaims?: AdminListingClaim[];
  auditLogs?: AdminAuditLogEntry[];
  managedUsers?: AdminManagedUser[];
  platformHealth?: PlatformHealthSnapshot | null;
  nowMs?: number;
};

const normalizeKey = (value?: string | null): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const formatLocationSubtitle = (city?: string, region?: string, country?: string): string => {
  const parts = [city, region, country].map((p) => p?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Location not set';
};

export const evaluateTrafficProvenance = (
  summary: InboundAnalyticsSummary | null,
): TrafficProvenanceInfo => {
  if (!summary) {
    return {
      mode: 'full_pageviews',
      badgeLabel: 'Page-view tracking active',
      shortNote: 'Tracking SPA route views and entry sessions',
      explanation:
        'SwingSphere records both entry sessions and in-session SPA route views.',
      sessionDerivedDaysCount: 0,
      multiPageTrackedDaysCount: 0,
    };
  }

  const activeDays = (summary.daily ?? []).filter((d) => (d.sessions ?? 0) > 0 || (d.views ?? 0) > 0);
  let sessionDerivedDaysCount = 0;
  let multiPageTrackedDaysCount = 0;

  for (const day of activeDays) {
    const views = Number(day.views ?? day.sessions ?? 0);
    const sessions = Number(day.sessions ?? 0);
    if (views > sessions) {
      multiPageTrackedDaysCount += 1;
    } else if (sessions > 0) {
      sessionDerivedDaysCount += 1;
    }
  }

  const hasPageViewTable = (summary.byPageView?.length ?? 0) > 0;
  const totalViews = Number(summary.totalViews ?? summary.totalSessions ?? 0);
  const totalSessions = Number(summary.totalSessions ?? 0);

  if (sessionDerivedDaysCount > 0 && multiPageTrackedDaysCount > 0) {
    return {
      mode: 'mixed_history',
      badgeLabel: 'Mixed: Full page views + historical session estimates',
      shortNote: `${multiPageTrackedDaysCount}d full page-view tracking · ${sessionDerivedDaysCount}d session-derived (1 view/session)`,
      explanation:
        'This date range spans the Analytics v3 upgrade. Recent days include full multi-page SPA route views, while earlier historical days reflect session-entry counts (1 recorded entry view per session).',
      sessionDerivedDaysCount,
      multiPageTrackedDaysCount,
    };
  }

  if (sessionDerivedDaysCount > 0 && multiPageTrackedDaysCount === 0 && totalViews === totalSessions && !hasPageViewTable) {
    return {
      mode: 'session_derived_estimates',
      badgeLabel: 'Session-derived entry views (1 per session)',
      shortNote: 'Historical period prior to multi-page route tracking',
      explanation:
        'Records in this window were collected before multi-page SPA route tracking was enabled and represent 1 entry view per inbound session.',
      sessionDerivedDaysCount,
      multiPageTrackedDaysCount: 0,
    };
  }

  return {
    mode: 'full_pageviews',
    badgeLabel: 'Full page-view tracking',
    shortNote: 'Includes entry views and subsequent in-session route transitions',
    explanation:
      'Page views reflect tracked SPA page views across sessions. Historical days prior to the v3 upgrade fall back to 1 entry view per session when included in longer ranges.',
    sessionDerivedDaysCount,
    multiPageTrackedDaysCount,
  };
};

export const buildOperationalQueue = (input: DashboardSummaryInput): OperationalQueueItem[] => {
  const nowMs = input.nowMs ?? Date.now();
  const clubs = input.listings.filter((item): item is ClubData => item.type === 'club');
  const events = input.listings.filter((item): item is EventData => item.type === 'event');
  const upcomingEvents = events.filter((event) => Date.parse(event.time.start) > nowMs);

  const mediaCatalog: BrandMediaCatalog = {
    listings: input.listings,
    venues: input.venues,
    organizations: input.organizations,
    relationships: input.venueRelationships,
    eventSeries: input.eventSeries,
    clubBrands: input.clubBrands,
    resorts: input.resorts,
    cruiseSeries: input.cruiseSeries,
    cruiseSailings: input.cruiseSailings,
  };

  // 1. Listings awaiting approval or publication
  const pendingListings = input.listings.filter((item) => item.status === 'pending_approval');
  const pendingRecords: OperationalAffectedRecord[] = pendingListings.map((item) => ({
    id: item.id,
    name: item.name,
    entityType: item.type === 'club' ? 'Club Submission' : 'Event Submission',
    subtitle: formatLocationSubtitle(
      item.geopoint?.address?.city,
      item.geopoint?.address?.region,
      item.geopoint?.address?.country,
    ),
    reason: 'Submitted by community/host and awaiting administrator review',
    status: item.status,
    editView: { view: 'review-submission', listingId: item.id },
  }));

  // 2. Moderation queue (open site reports + pending written reviews)
  const pendingReviews = input.pendingWrittenReviews ?? [];
  const totalModerationCount = Math.max(0, input.openSiteIssueCount) + pendingReviews.length;
  const moderationRecords: OperationalAffectedRecord[] = [
    ...pendingReviews.map((rev) => ({
      id: rev.id,
      name: rev.targetName || 'Listing Review',
      entityType: 'Written Review',
      subtitle: rev.authorDisplayName ? `By ${rev.authorDisplayName}` : 'Member review',
      reason: 'Pending written review moderation before public display',
      status: 'pending',
      editView: 'moderation' as AdminView,
    })),
  ];
  if (input.openSiteIssueCount > 0) {
    moderationRecords.unshift({
      id: 'open-site-issues',
      name: `${input.openSiteIssueCount} Open Site Report${input.openSiteIssueCount === 1 ? '' : 's'}`,
      entityType: 'Site Inaccuracy / Issue Report',
      subtitle: 'Moderation Queue → Site reports tab',
      reason: 'Reported listing inaccuracies or platform issues awaiting triage',
      status: 'open',
      editView: 'moderation',
    });
  }

  // 3. Open ownership & listing claims
  const openClaims = (input.openClaims ?? []).filter((claim) =>
    ['pending', 'information_requested', 'under_review'].includes(claim.status),
  );
  const claimRecords: OperationalAffectedRecord[] = openClaims.map((claim) => {
    const matchedListing = input.listings.find((l) => l.id === claim.listingId);
    return {
      id: claim.id,
      name: matchedListing?.name ?? claim.organizationName ?? `Claim #${claim.id.slice(0, 8)}`,
      entityType: 'Ownership Claim',
      subtitle: `${claim.claimantRole || 'Claimant'} · ${claim.status.replaceAll('_', ' ')}`,
      reason: 'Ownership/management claim awaiting verification decision',
      status: claim.status,
      editView: 'listing-claims',
    };
  });

  // 4. Spatial & 3D Building Verification (clubs needing verification + venues/clubs missing 3D footprints)
  const spatialRecords: OperationalAffectedRecord[] = [];
  const seenSpatialIds = new Set<string>();
  const affectedVenueIds: string[] = [];
  const affectedClubIdsForSpatial: string[] = [];

  for (const club of clubs) {
    if (buildingVerificationNeedsReview(club)) {
      seenSpatialIds.add(`club:${club.id}`);
      affectedClubIdsForSpatial.push(club.id);
      const linkedVenue = getVenueForListing(club, {
        listings: input.listings,
        venues: input.venues,
        organizations: input.organizations,
        relationships: input.venueRelationships,
      });
      if (linkedVenue) affectedVenueIds.push(linkedVenue.id);
      spatialRecords.push({
        id: club.id,
        name: club.name,
        entityType: 'Club Location',
        subtitle: formatLocationSubtitle(
          club.geopoint?.address?.city,
          club.geopoint?.address?.region,
          club.geopoint?.address?.country,
        ),
        reason: `Building verification status: ${club.buildingVerification?.status?.replaceAll('_', ' ') ?? 'needs review'}`,
        status: club.buildingVerification?.status ?? 'needs_review',
        editView: { view: 'edit-club', clubId: club.id },
        secondaryAction: {
          label: 'Inspect 3D Building',
          view: 'building-inspector',
        },
      });
    }
  }

  for (const venue of input.venues) {
    const hasBuilding = Boolean(
      getBuildingAssetForVenue(venue, input.buildingAssets, {
        listings: input.listings,
        venues: input.venues,
      }),
    );
    if (!hasBuilding) {
      affectedVenueIds.push(venue.id);
      spatialRecords.push({
        id: venue.id,
        name: venue.name,
        entityType: 'Venue',
        subtitle: formatLocationSubtitle(
          venue.address?.city,
          venue.address?.region,
          venue.address?.country,
        ),
        reason: 'Missing verified 3D building footprint asset',
        status: venue.status,
        editView: { view: 'edit-venue', venueId: venue.id },
        secondaryAction: {
          label: 'Inspect 3D Building',
          view: 'building-inspector',
        },
      });
    }
  }

  for (const club of clubs) {
    if (seenSpatialIds.has(`club:${club.id}`)) continue;
    const hasBuilding = Boolean(
      getBuildingAssetForListing(club, input.buildingAssets, {
        listings: input.listings,
        venues: input.venues,
        organizations: input.organizations,
        relationships: input.venueRelationships,
      }),
    );
    if (!hasBuilding) {
      affectedClubIdsForSpatial.push(club.id);
      spatialRecords.push({
        id: club.id,
        name: club.name,
        entityType: 'Club Location',
        subtitle: formatLocationSubtitle(
          club.geopoint?.address?.city,
          club.geopoint?.address?.region,
          club.geopoint?.address?.country,
        ),
        reason: 'No linked 3D building footprint on venue or listing',
        status: club.status,
        editView: { view: 'edit-club', clubId: club.id },
        secondaryAction: {
          label: 'Inspect 3D Building',
          view: 'building-inspector',
        },
      });
    }
  }

  // 5. Missing hero images, brand logos, or event flyers
  const mediaRecords: OperationalAffectedRecord[] = [];
  const mediaClubIds: string[] = [];
  const mediaEventIds: string[] = [];

  for (const club of clubs) {
    const hasLogo = Boolean(resolveBrandLogo('club', club.id, mediaCatalog).url);
    const hasHero = Boolean(club.headerImageUrl || (club.photos && club.photos.length > 0));
    if (!hasLogo || !hasHero) {
      mediaClubIds.push(club.id);
      const missingParts = [!hasLogo ? 'brand logo' : null, !hasHero ? 'hero image' : null].filter(Boolean).join(' & ');
      mediaRecords.push({
        id: club.id,
        name: club.name,
        entityType: 'Club',
        subtitle: formatLocationSubtitle(
          club.geopoint?.address?.city,
          club.geopoint?.address?.region,
          club.geopoint?.address?.country,
        ),
        reason: `Missing ${missingParts}`,
        status: club.status,
        editView: { view: 'edit-club', clubId: club.id },
      });
    }
  }

  for (const event of upcomingEvents) {
    const hasLogo = Boolean(resolveBrandLogo('event', event.id, mediaCatalog).url);
    const hasFlyer = Boolean(event.media?.some((m) => m.role === 'flyer') || event.headerImageUrl);
    if (!hasLogo || !hasFlyer) {
      mediaEventIds.push(event.id);
      const missingParts = [!hasLogo ? 'brand logo' : null, !hasFlyer ? 'event flyer/banner' : null].filter(Boolean).join(' & ');
      mediaRecords.push({
        id: event.id,
        name: event.name,
        entityType: 'Upcoming Event',
        subtitle: `${new Date(event.time.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${event.geopoint?.address?.city || event.location}`,
        reason: `Missing ${missingParts}`,
        status: event.status,
        editView: { view: 'edit-event', eventId: event.id },
      });
    }
  }

  for (const resort of input.resorts) {
    const hasLogo = Boolean(resolveBrandLogo('resort', resort.id, mediaCatalog).url);
    if (!hasLogo) {
      mediaRecords.push({
        id: resort.id,
        name: resort.name,
        entityType: 'Resort',
        subtitle: formatLocationSubtitle(
          resort.geopoint?.address?.city,
          resort.geopoint?.address?.region,
          resort.geopoint?.address?.country,
        ),
        reason: 'Missing resort brand logo',
        status: resort.status,
        editView: { view: 'edit-resort', resortId: resort.id },
      });
    }
  }

  for (const series of input.cruiseSeries) {
    const hasLogo = Boolean(resolveBrandLogo('cruise_series', series.id, mediaCatalog).url);
    if (!hasLogo) {
      mediaRecords.push({
        id: series.id,
        name: series.name,
        entityType: 'Cruise Series',
        subtitle: series.audienceLabel || 'Cruise brand',
        reason: 'Missing cruise series brand logo',
        status: series.status,
        editView: { view: 'edit-cruise-series', cruiseSeriesId: series.id },
      });
    }
  }

  // 6. Duplicate or potentially conflicting listings
  const duplicateRecords: OperationalAffectedRecord[] = [];
  const duplicateClubIds: string[] = [];

  const clubGroups = new Map<string, ClubData[]>();
  for (const club of clubs) {
    const key = `${normalizeKey(club.name)}|${normalizeKey(club.geopoint?.address?.city)}`;
    if (!normalizeKey(club.name)) continue;
    const list = clubGroups.get(key) ?? [];
    list.push(club);
    clubGroups.set(key, list);
  }
  for (const group of clubGroups.values()) {
    if (group.length > 1) {
      for (const club of group) {
        duplicateClubIds.push(club.id);
        const others = group.filter((c) => c.id !== club.id).map((c) => c.name).join(', ');
        duplicateRecords.push({
          id: club.id,
          name: club.name,
          entityType: 'Club',
          subtitle: formatLocationSubtitle(
            club.geopoint?.address?.city,
            club.geopoint?.address?.region,
            club.geopoint?.address?.country,
          ),
          reason: `Shares normalized name & city with ${group.length - 1} other club record (${others})`,
          status: club.status,
          editView: { view: 'edit-club', clubId: club.id },
        });
      }
    }
  }

  const venueGroups = new Map<string, VenueData[]>();
  for (const venue of input.venues) {
    const key = `${normalizeKey(venue.name)}|${normalizeKey(venue.address?.city)}`;
    if (!normalizeKey(venue.name)) continue;
    const list = venueGroups.get(key) ?? [];
    list.push(venue);
    venueGroups.set(key, list);
  }
  for (const group of venueGroups.values()) {
    if (group.length > 1) {
      for (const venue of group) {
        duplicateRecords.push({
          id: venue.id,
          name: venue.name,
          entityType: 'Venue',
          subtitle: formatLocationSubtitle(venue.address?.city, venue.address?.region, venue.address?.country),
          reason: `Potential duplicate venue in ${venue.address?.city || 'same city'} (${group.length} matching records)`,
          status: venue.status,
          editView: { view: 'edit-venue', venueId: venue.id },
        });
      }
    }
  }

  const eventGroups = new Map<string, EventData[]>();
  for (const event of events) {
    const datePart = (event.time?.start ?? '').slice(0, 10);
    const key = `${normalizeKey(event.name)}|${datePart}`;
    if (!normalizeKey(event.name) || !datePart) continue;
    const list = eventGroups.get(key) ?? [];
    list.push(event);
    eventGroups.set(key, list);
  }
  for (const group of eventGroups.values()) {
    if (group.length > 1) {
      for (const event of group) {
        duplicateRecords.push({
          id: event.id,
          name: event.name,
          entityType: 'Event',
          subtitle: `${(event.time?.start ?? '').slice(0, 10)} · ${event.geopoint?.address?.city || event.location}`,
          reason: `Duplicate event title and start date (${group.length} matching occurrences)`,
          status: event.status,
          editView: { view: 'edit-event', eventId: event.id },
        });
      }
    }
  }

  // 7. Incomplete schedules or host contact details
  const completenessRecords: OperationalAffectedRecord[] = [];
  const incompleteClubIds: string[] = [];
  for (const club of clubs) {
    if (!club.schedule || club.schedule.length === 0) {
      incompleteClubIds.push(club.id);
      completenessRecords.push({
        id: club.id,
        name: club.name,
        entityType: 'Club',
        subtitle: formatLocationSubtitle(
          club.geopoint?.address?.city,
          club.geopoint?.address?.region,
          club.geopoint?.address?.country,
        ),
        reason: 'Missing recurring operating schedule',
        status: club.status,
        editView: { view: 'edit-club', clubId: club.id },
      });
    }
  }
  for (const org of input.organizations) {
    if (!org.contactEmail && !org.websiteUrl) {
      completenessRecords.push({
        id: org.id,
        name: org.name,
        entityType: 'Organization / Host',
        subtitle: org.displayTypes.join(', ') || 'Host',
        reason: 'Missing both contact email and official website URL',
        status: org.status,
        editView: { view: 'edit-organization', organizationId: org.id },
      });
    }
  }

  // 8. Draft or unpublished catalog records
  const draftRecords: OperationalAffectedRecord[] = [];
  for (const brand of input.clubBrands) {
    if (brand.status === 'draft') {
      draftRecords.push({
        id: brand.id,
        name: brand.name,
        entityType: 'Club Brand',
        subtitle: `/${brand.slug}`,
        reason: 'Club brand is in draft status',
        status: brand.status,
        editView: { view: 'edit-club-brand', clubBrandId: brand.id },
      });
    }
  }
  for (const series of input.eventSeries) {
    if (series.status === 'draft') {
      draftRecords.push({
        id: series.id,
        name: series.name,
        entityType: 'Event Series',
        subtitle: series.cadenceLabel || `/${series.slug}`,
        reason: 'Event series is in draft status',
        status: series.status,
        editView: { view: 'edit-event-series', eventSeriesId: series.id },
      });
    }
  }
  for (const resort of input.resorts) {
    if (resort.status === 'draft' || resort.status === 'pending_review') {
      draftRecords.push({
        id: resort.id,
        name: resort.name,
        entityType: 'Resort',
        subtitle: formatLocationSubtitle(
          resort.geopoint?.address?.city,
          resort.geopoint?.address?.region,
          resort.geopoint?.address?.country,
        ),
        reason: `Resort status is ${resort.status.replaceAll('_', ' ')}`,
        status: resort.status,
        editView: { view: 'edit-resort', resortId: resort.id },
      });
    }
  }
  for (const series of input.cruiseSeries) {
    if (series.status === 'draft' || series.status === 'pending_review') {
      draftRecords.push({
        id: series.id,
        name: series.name,
        entityType: 'Cruise Series',
        subtitle: series.audienceLabel || `/${series.slug}`,
        reason: `Cruise series status is ${series.status.replaceAll('_', ' ')}`,
        status: series.status,
        editView: { view: 'edit-cruise-series', cruiseSeriesId: series.id },
      });
    }
  }
  for (const sailing of input.cruiseSailings) {
    if (sailing.status === 'draft' || sailing.status === 'pending_review') {
      draftRecords.push({
        id: sailing.id,
        name: sailing.name,
        entityType: 'Cruise Sailing',
        subtitle: `${sailing.shipName} · Departs ${sailing.departurePort?.portName || 'TBD'}`,
        reason: `Cruise sailing status is ${sailing.status.replaceAll('_', ' ')}`,
        status: sailing.status,
        editView: { view: 'edit-cruise-sailing', cruiseSailingId: sailing.id },
      });
    }
  }

  // 9. Platform & infrastructure warnings (if any)
  const platformWarningItems = (input.platformHealth?.items ?? []).filter((item) =>
    ['Pending deploy', 'Degraded', 'Operational · Action needed', 'Partial'].includes(item.status),
  );
  const platformRecords: OperationalAffectedRecord[] = platformWarningItems.map((item) => ({
    id: item.id,
    name: item.name,
    entityType: 'Platform Subsystem',
    subtitle: `${item.category} · ${item.status}`,
    reason: item.PendingWork || item.summary,
    status: item.status,
    editView: 'settings',
  }));

  const items: OperationalQueueItem[] = [
    {
      id: 'pending-submissions',
      title: 'Listings awaiting approval',
      description:
        pendingRecords.length > 0
          ? `${pendingRecords.length} community or host submission${pendingRecords.length === 1 ? '' : 's'} waiting for publication review.`
          : 'All submitted clubs and events have been reviewed.',
      category: 'approvals',
      severity: pendingRecords.length > 0 ? 'critical' : 'healthy',
      count: pendingRecords.length,
      actionLabel: 'Review submissions',
      targetView: 'submissions',
      filterSpec: {
        target: 'submissions',
        ids: pendingRecords.map((r) => r.id),
        label: 'Listings awaiting approval',
      },
      records: pendingRecords,
    },
    {
      id: 'moderation-queue',
      title: 'Pending moderation & inaccuracy reports',
      description:
        totalModerationCount > 0
          ? `${input.openSiteIssueCount} open site/inaccuracy report${input.openSiteIssueCount === 1 ? '' : 's'} and ${pendingReviews.length} written review${pendingReviews.length === 1 ? '' : 's'} awaiting moderation.`
          : 'No open site reports or unmoderated written reviews.',
      category: 'moderation',
      severity: totalModerationCount > 0 ? 'critical' : 'healthy',
      count: totalModerationCount,
      actionLabel: 'Open moderation queue',
      targetView: 'moderation',
      filterSpec: {
        target: 'moderation',
        tab: input.openSiteIssueCount > 0 && pendingReviews.length === 0 ? 'reports' : 'reviews',
        ids: moderationRecords.map((r) => r.id),
        label: 'Pending moderation items',
      },
      records: moderationRecords,
    },
    {
      id: 'open-listing-claims',
      title: 'Listing ownership claims',
      description:
        claimRecords.length > 0
          ? `${claimRecords.length} promoter or venue ownership claim${claimRecords.length === 1 ? '' : 's'} awaiting verification.`
          : 'No open ownership claims awaiting review.',
      category: 'approvals',
      severity: claimRecords.length > 0 ? 'warning' : 'healthy',
      count: claimRecords.length,
      actionLabel: 'Review claims',
      targetView: 'listing-claims',
      filterSpec: {
        target: 'claims',
        ids: claimRecords.map((r) => r.id),
        label: 'Open ownership claims',
      },
      records: claimRecords,
    },
    {
      id: 'building-verification',
      title: 'Unverified 3D building locations',
      description:
        spatialRecords.length > 0
          ? `${spatialRecords.length} club or venue location${spatialRecords.length === 1 ? '' : 's'} need 3D building footprint capture or address-pin verification.`
          : 'All venues and clubs have verified 3D building footprints.',
      category: 'spatial',
      severity: spatialRecords.length > 0 ? 'warning' : 'healthy',
      count: spatialRecords.length,
      actionLabel: affectedVenueIds.length > 0 ? 'Filter unverified venues' : 'Filter unverified clubs',
      targetView: affectedVenueIds.length > 0 ? 'manage-venues' : 'manage-clubs',
      filterSpec:
        affectedVenueIds.length > 0
          ? {
              target: 'venues',
              ids: Array.from(new Set(affectedVenueIds)),
              label: 'Venues needing 3D building verification',
            }
          : {
              target: 'clubs',
              mode: 'locations',
              ids: Array.from(new Set(affectedClubIdsForSpatial)),
              label: 'Clubs needing 3D building verification',
            },
      records: spatialRecords,
    },
    {
      id: 'missing-media',
      title: 'Missing hero images, flyers, or brand logos',
      description:
        mediaRecords.length > 0
          ? `${mediaRecords.length} active record${mediaRecords.length === 1 ? '' : 's'} missing a resolved brand logo, hero image, or event flyer.`
          : 'All active clubs, upcoming events, and travel brands have resolved media.',
      category: 'media',
      severity: mediaRecords.length > 0 ? 'warning' : 'healthy',
      count: mediaRecords.length,
      actionLabel: mediaClubIds.length > 0 ? 'Filter clubs missing media' : 'Filter events missing media',
      targetView: mediaClubIds.length > 0 ? 'manage-clubs' : 'manage-events',
      filterSpec:
        mediaClubIds.length > 0
          ? {
              target: 'clubs',
              mode: 'locations',
              ids: mediaClubIds,
              label: 'Clubs missing brand logo or hero media',
            }
          : {
              target: 'events',
              mode: 'occurrences',
              ids: mediaEventIds,
              label: 'Upcoming events missing flyer or brand logo',
            },
      records: mediaRecords,
    },
    {
      id: 'duplicate-listings',
      title: 'Duplicate or conflicting records',
      description:
        duplicateRecords.length > 0
          ? `${duplicateRecords.length} record${duplicateRecords.length === 1 ? '' : 's'} share a normalized name and city/date with another entry.`
          : 'No duplicate club, venue, or event records detected.',
      category: 'duplicates',
      severity: duplicateRecords.length > 0 ? 'warning' : 'healthy',
      count: duplicateRecords.length,
      actionLabel: 'Inspect potential duplicates',
      targetView: duplicateClubIds.length > 0 ? 'manage-clubs' : 'manage-venues',
      filterSpec:
        duplicateClubIds.length > 0
          ? {
              target: 'clubs',
              mode: 'locations',
              ids: duplicateClubIds,
              label: 'Potential duplicate club records',
            }
          : undefined,
      records: duplicateRecords,
    },
    {
      id: 'metadata-completeness',
      title: 'Missing club schedules or host contacts',
      description:
        completenessRecords.length > 0
          ? `${incompleteClubIds.length} club${incompleteClubIds.length === 1 ? '' : 's'} missing schedules and ${completenessRecords.length - incompleteClubIds.length} host${completenessRecords.length - incompleteClubIds.length === 1 ? '' : 's'} missing contact info.`
          : 'All clubs have operating schedules and all hosts have contact details.',
      category: 'completeness',
      severity: completenessRecords.length > 0 ? 'info' : 'healthy',
      count: completenessRecords.length,
      actionLabel: incompleteClubIds.length > 0 ? 'Filter clubs missing schedules' : 'Filter hosts missing contacts',
      targetView: incompleteClubIds.length > 0 ? 'manage-clubs' : 'manage-organizations',
      filterSpec:
        incompleteClubIds.length > 0
          ? {
              target: 'clubs',
              mode: 'locations',
              ids: incompleteClubIds,
              label: 'Clubs missing operating schedules',
            }
          : {
              target: 'organizations',
              ids: completenessRecords.map((r) => r.id),
              label: 'Organizations missing contact details',
            },
      records: completenessRecords,
    },
    {
      id: 'draft-catalog-records',
      title: 'Draft brands, series & travel listings',
      description:
        draftRecords.length > 0
          ? `${draftRecords.length} catalog record${draftRecords.length === 1 ? '' : 's'} currently saved as draft or pending review.`
          : 'No unpublished draft brands, series, or travel records.',
      category: 'completeness',
      severity: draftRecords.length > 0 ? 'info' : 'healthy',
      count: draftRecords.length,
      actionLabel: 'Review draft records',
      targetView: 'manage-travel',
      records: draftRecords,
    },
  ];

  if (platformRecords.length > 0) {
    items.push({
      id: 'platform-warnings',
      title: 'Platform & schema deployment checks',
      description: `${platformRecords.length} subsystem${platformRecords.length === 1 ? '' : 's'} with pending migrations or operational notes.`,
      category: 'system',
      severity: 'info',
      count: platformRecords.length,
      actionLabel: 'Open Platform Health',
      targetView: 'settings',
      records: platformRecords,
    });
  }

  const severityRank: Record<OperationalSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    healthy: 3,
  };

  return items.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count,
  );
};

export const buildDirectoryHealthSummary = (
  input: DashboardSummaryInput,
): DirectoryHealthSummary => {
  const nowMs = input.nowMs ?? Date.now();
  const clubs = input.listings.filter((item): item is ClubData => item.type === 'club');
  const events = input.listings.filter((item): item is EventData => item.type === 'event');
  const upcomingEvents = events.filter((event) => Date.parse(event.time.start) > nowMs);

  const mediaCatalog: BrandMediaCatalog = {
    listings: input.listings,
    venues: input.venues,
    organizations: input.organizations,
    relationships: input.venueRelationships,
    eventSeries: input.eventSeries,
    clubBrands: input.clubBrands,
    resorts: input.resorts,
    cruiseSeries: input.cruiseSeries,
    cruiseSailings: input.cruiseSailings,
  };

  // Clubs completeness: approved + has logo + has schedule + has building asset
  const publishedClubs = clubs.filter((c) => c.status === 'approved');
  const pendingClubs = clubs.filter((c) => c.status !== 'approved');
  const completeClubs = clubs.filter((club) => {
    const hasLogo = Boolean(resolveBrandLogo('club', club.id, mediaCatalog).url);
    const hasSchedule = Boolean(club.schedule && club.schedule.length > 0);
    const hasBuilding = Boolean(
      getBuildingAssetForListing(club, input.buildingAssets, {
        listings: input.listings,
        venues: input.venues,
        organizations: input.organizations,
        relationships: input.venueRelationships,
      }),
    );
    return hasLogo && hasSchedule && hasBuilding;
  });
  const clubCompletenessPct = clubs.length > 0 ? Math.round((completeClubs.length / clubs.length) * 100) : 100;

  // Events completeness: upcoming events with resolved logo/flyer & coordinates
  const publishedEvents = events.filter((e) => e.status === 'approved');
  const pendingEvents = events.filter((e) => e.status !== 'approved');
  const completeUpcomingEvents = upcomingEvents.filter((event) => {
    const hasMedia = Boolean(
      resolveBrandLogo('event', event.id, mediaCatalog).url
      || event.media?.some((m) => m.role === 'flyer')
      || event.headerImageUrl,
    );
    const hasCoords = Boolean(event.geopoint?.latitude && event.geopoint?.longitude);
    return hasMedia && hasCoords;
  });
  const eventCompletenessPct =
    upcomingEvents.length > 0
      ? Math.round((completeUpcomingEvents.length / upcomingEvents.length) * 100)
      : events.length > 0
        ? 100
        : 100;

  // Hosts / Organizations completeness
  const publishedOrgs = input.organizations.filter((o) => o.status !== 'draft');
  const draftOrgs = input.organizations.filter((o) => o.status === 'draft');
  const completeOrgs = input.organizations.filter((org) => {
    const hasLogo = Boolean(resolveBrandLogo('organization', org.id, mediaCatalog).url);
    const hasContact = Boolean(org.contactEmail || org.websiteUrl);
    return hasLogo && hasContact;
  });
  const orgCompletenessPct =
    input.organizations.length > 0
      ? Math.round((completeOrgs.length / input.organizations.length) * 100)
      : 100;

  // Resorts completeness
  const publishedResorts = input.resorts.filter((r) => r.status === 'approved');
  const draftResorts = input.resorts.filter((r) => r.status !== 'approved');
  const completeResorts = input.resorts.filter((r) => {
    const hasLogo = Boolean(resolveBrandLogo('resort', r.id, mediaCatalog).url);
    const hasDesc = Boolean(r.descriptionShort?.trim());
    return hasLogo && hasDesc;
  });
  const resortCompletenessPct =
    input.resorts.length > 0
      ? Math.round((completeResorts.length / input.resorts.length) * 100)
      : 100;

  // Cruises (sailings + series)
  const publishedSailings = input.cruiseSailings.filter((s) => s.status === 'approved');
  const draftSailings = input.cruiseSailings.filter((s) => s.status !== 'approved');
  const upcomingSailings = input.cruiseSailings.filter((s) => Date.parse(s.startsAt) > nowMs);
  const completeSailings = input.cruiseSailings.filter(
    (s) => Boolean(s.shipName && s.departurePort?.portName && s.startsAt),
  );
  const cruiseCompletenessPct =
    input.cruiseSailings.length > 0
      ? Math.round((completeSailings.length / input.cruiseSailings.length) * 100)
      : 100;

  // Venues
  const publishedVenues = input.venues.filter((v) => v.status !== 'draft');
  const draftVenues = input.venues.filter((v) => v.status === 'draft');
  const venuesWithBuildings = input.venues.filter((venue) =>
    Boolean(
      getBuildingAssetForVenue(venue, input.buildingAssets, {
        listings: input.listings,
        venues: input.venues,
      }),
    ),
  );
  const venueCompletenessPct =
    input.venues.length > 0
      ? Math.round((venuesWithBuildings.length / input.venues.length) * 100)
      : 100;

  const categories: DirectoryCategoryHealth[] = [
    {
      key: 'clubs',
      label: 'Clubs',
      total: clubs.length,
      published: publishedClubs.length,
      draftOrPending: pendingClubs.length,
      secondaryLabel: 'Club brands',
      secondaryCount: input.clubBrands.length,
      completenessPct: clubCompletenessPct,
      completenessNote: `${completeClubs.length}/${clubs.length} with logo, schedule & 3D building`,
      targetView: 'manage-clubs',
    },
    {
      key: 'events',
      label: 'Events',
      total: events.length,
      published: publishedEvents.length,
      draftOrPending: pendingEvents.length,
      secondaryLabel: `${upcomingEvents.length} upcoming · ${input.eventSeries.length} series`,
      secondaryCount: upcomingEvents.length,
      completenessPct: eventCompletenessPct,
      completenessNote: `${completeUpcomingEvents.length}/${upcomingEvents.length} upcoming with media & coords`,
      targetView: 'manage-events',
    },
    {
      key: 'hosts',
      label: 'Hosts & Promoters',
      total: input.organizations.length,
      published: publishedOrgs.length,
      draftOrPending: draftOrgs.length,
      secondaryLabel: 'Venue links',
      secondaryCount: input.venueRelationships.length,
      completenessPct: orgCompletenessPct,
      completenessNote: `${completeOrgs.length}/${input.organizations.length} with logo & contact/website`,
      targetView: 'manage-organizations',
    },
    {
      key: 'resorts',
      label: 'Resorts',
      total: input.resorts.length,
      published: publishedResorts.length,
      draftOrPending: draftResorts.length,
      secondaryLabel: 'Destination properties',
      secondaryCount: publishedResorts.length,
      completenessPct: resortCompletenessPct,
      completenessNote: `${completeResorts.length}/${input.resorts.length} with brand logo & summary`,
      targetView: 'manage-travel',
    },
    {
      key: 'cruises',
      label: 'Cruises',
      total: input.cruiseSailings.length,
      published: publishedSailings.length,
      draftOrPending: draftSailings.length,
      secondaryLabel: `${upcomingSailings.length} upcoming · ${input.cruiseSeries.length} brands`,
      secondaryCount: input.cruiseSeries.length,
      completenessPct: cruiseCompletenessPct,
      completenessNote: `${completeSailings.length}/${input.cruiseSailings.length} sailings with ship & port`,
      targetView: 'manage-travel',
    },
    {
      key: 'venues',
      label: 'Physical Venues',
      total: input.venues.length,
      published: publishedVenues.length,
      draftOrPending: draftVenues.length,
      secondaryLabel: '3D footprints',
      secondaryCount: venuesWithBuildings.length,
      completenessPct: venueCompletenessPct,
      completenessNote: `${venuesWithBuildings.length}/${input.venues.length} with 3D building footprint`,
      targetView: 'manage-venues',
    },
  ];

  const totalPublishedListings =
    publishedClubs.length + publishedEvents.length + publishedResorts.length + publishedSailings.length;

  const totalCatalogRecords =
    clubs.length
    + events.length
    + input.organizations.length
    + input.resorts.length
    + input.cruiseSailings.length
    + input.venues.length;

  const overallCompletenessPct =
    categories.length > 0
      ? Math.round(categories.reduce((acc, c) => acc + c.completenessPct, 0) / categories.length)
      : 100;

  return {
    totalPublishedListings,
    totalCatalogRecords,
    overallCompletenessPct,
    categories,
  };
};

export const buildRecentActivityFeed = (
  input: DashboardSummaryInput,
  limit = 18,
): RecentActivityItem[] => {
  const items: RecentActivityItem[] = [];
  const venueById = new Map(input.venues.map((v) => [v.id, v]));
  const listingById = new Map(input.listings.map((l) => [l.id, l]));

  // 1. Substantiated 3D Building captures & updates
  for (const asset of input.buildingAssets) {
    const ts = asset.capture?.updatedAt || asset.capture?.createdAt;
    if (!ts) continue;
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) continue;

    const createdMs = asset.capture?.createdAt ? Date.parse(asset.capture.createdAt) : ms;
    const isNewCapture = Math.abs(ms - createdMs) < 60_000;

    const linkedVenue = asset.venueId ? venueById.get(asset.venueId) : undefined;
    const linkedListing = asset.listingId ? listingById.get(asset.listingId) : undefined;
    const entityName = linkedVenue?.name ?? linkedListing?.name ?? `Building #${asset.id.slice(0, 8)}`;

    let targetView: AdminView = 'building-inspector';
    if (linkedVenue) {
      targetView = { view: 'edit-venue', venueId: linkedVenue.id };
    } else if (linkedListing) {
      targetView =
        linkedListing.type === 'club'
          ? { view: 'edit-club', clubId: linkedListing.id }
          : { view: 'edit-event', eventId: linkedListing.id };
    }

    items.push({
      id: `building-${asset.id}-${ts}`,
      kind: 'building_verified',
      entityId: linkedVenue?.id ?? linkedListing?.id ?? asset.id,
      entityName,
      entityType: linkedVenue ? '3D Venue Footprint' : '3D Building Asset',
      actionLabel: isNewCapture ? '3D building captured' : '3D footprint updated',
      detail: `${asset.source?.provider ?? 'OpenFreeMap'} · ${asset.Parts?.length ?? 1} part${(asset.Parts?.length ?? 1) === 1 ? '' : 's'}`,
      occurredAt: ts,
      timestampMs: ms,
      isSubstantiatedTimestamp: true,
      targetView,
      secondaryHref: '/admin/building-inspector',
    });
  }

  // 2. Substantiated Admin Audit Log entries
  for (const log of input.auditLogs ?? []) {
    const ms = Date.parse(log.timestamp);
    if (!Number.isFinite(ms)) continue;
    const readableAction = log.action
      .split('.')
      .map((part) => part.replace(/_/g, ' '))
      .join(' · ');
    items.push({
      id: `audit-${log.id}`,
      kind: 'admin_audit',
      entityId: log.targetUserId ?? log.id,
      entityName: log.targetUserName || log.userName || 'System record',
      entityType: log.action.startsWith('user.') || log.action.startsWith('badge.') ? 'User Account' : 'Admin Action',
      actionLabel: readableAction,
      detail: log.reason ? `${log.reason} (by ${log.userName})` : `Executed by ${log.userName}`,
      occurredAt: log.timestamp,
      timestampMs: ms,
      isSubstantiatedTimestamp: true,
      targetView: log.action.startsWith('user.') || log.action.startsWith('badge.') ? 'users' : 'audit-log',
    });
  }

  // 3. Substantiated Organization creations & updates
  for (const org of input.organizations) {
    const createdMs = org.createdAt ? Date.parse(org.createdAt) : NaN;
    const updatedMs = org.updatedAt ? Date.parse(org.updatedAt) : NaN;
    const bestIso = org.updatedAt || org.createdAt;
    const bestMs = Number.isFinite(updatedMs) ? updatedMs : createdMs;
    if (!bestIso || !Number.isFinite(bestMs)) continue;

    const isCreated =
      Number.isFinite(createdMs) && (!Number.isFinite(updatedMs) || Math.abs(updatedMs - createdMs) <= 120_000);

    items.push({
      id: `org-${org.id}-${bestIso}`,
      kind: isCreated ? 'entity_created' : 'entity_updated',
      entityId: org.id,
      entityName: org.name,
      entityType: 'Host / Organization',
      actionLabel: isCreated ? 'New host added' : 'Record metadata updated',
      detail: `${org.displayTypes.map((t) => t.replaceAll('_', ' ')).join(', ') || 'Organization'} · ${org.status}`,
      occurredAt: bestIso,
      timestampMs: bestMs,
      isSubstantiatedTimestamp: true,
      targetView: { view: 'edit-organization', organizationId: org.id },
    });
  }

  // 4. Substantiated Venue creations & updates
  for (const venue of input.venues) {
    const createdMs = venue.createdAt ? Date.parse(venue.createdAt) : NaN;
    const updatedMs = venue.updatedAt ? Date.parse(venue.updatedAt) : NaN;
    const bestIso = venue.updatedAt || venue.createdAt;
    const bestMs = Number.isFinite(updatedMs) ? updatedMs : createdMs;
    if (!bestIso || !Number.isFinite(bestMs)) continue;

    const isCreated =
      Number.isFinite(createdMs) && (!Number.isFinite(updatedMs) || Math.abs(updatedMs - createdMs) <= 120_000);

    items.push({
      id: `venue-${venue.id}-${bestIso}`,
      kind: isCreated ? 'entity_created' : 'entity_updated',
      entityId: venue.id,
      entityName: venue.name,
      entityType: 'Venue',
      actionLabel: isCreated ? 'New venue created' : 'Venue record updated',
      detail: formatLocationSubtitle(venue.address?.city, venue.address?.region, venue.address?.country),
      occurredAt: bestIso,
      timestampMs: bestMs,
      isSubstantiatedTimestamp: true,
      targetView: { view: 'edit-venue', venueId: venue.id },
    });
  }

  // 5. Substantiated Club Brand & Event Series creations/updates
  for (const brand of input.clubBrands) {
    const createdMs = brand.createdAt ? Date.parse(brand.createdAt) : NaN;
    const updatedMs = brand.updatedAt ? Date.parse(brand.updatedAt) : NaN;
    const bestIso = brand.updatedAt || brand.createdAt;
    const bestMs = Number.isFinite(updatedMs) ? updatedMs : createdMs;
    if (!bestIso || !Number.isFinite(bestMs)) continue;

    const isCreated =
      Number.isFinite(createdMs) && (!Number.isFinite(updatedMs) || Math.abs(updatedMs - createdMs) <= 120_000);

    items.push({
      id: `brand-${brand.id}-${bestIso}`,
      kind: isCreated ? 'entity_created' : 'entity_updated',
      entityId: brand.id,
      entityName: brand.name,
      entityType: 'Club Brand',
      actionLabel: isCreated ? 'New club brand added' : 'Brand record updated',
      detail: `/${brand.slug} · ${brand.status}`,
      occurredAt: bestIso,
      timestampMs: bestMs,
      isSubstantiatedTimestamp: true,
      targetView: { view: 'edit-club-brand', clubBrandId: brand.id },
    });
  }

  for (const series of input.eventSeries) {
    const createdMs = series.createdAt ? Date.parse(series.createdAt) : NaN;
    const updatedMs = series.updatedAt ? Date.parse(series.updatedAt) : NaN;
    const bestIso = series.updatedAt || series.createdAt;
    const bestMs = Number.isFinite(updatedMs) ? updatedMs : createdMs;
    if (!bestIso || !Number.isFinite(bestMs)) continue;

    const isCreated =
      Number.isFinite(createdMs) && (!Number.isFinite(updatedMs) || Math.abs(updatedMs - createdMs) <= 120_000);

    items.push({
      id: `series-${series.id}-${bestIso}`,
      kind: isCreated ? 'entity_created' : 'entity_updated',
      entityId: series.id,
      entityName: series.name,
      entityType: 'Event Series',
      actionLabel: isCreated ? 'New event series added' : 'Series record updated',
      detail: `${series.cadenceLabel || 'Recurring series'} · ${series.status}`,
      occurredAt: bestIso,
      timestampMs: bestMs,
      isSubstantiatedTimestamp: true,
      targetView: { view: 'edit-event-series', eventSeriesId: series.id },
    });
  }

  // 6. Substantiated Listing Claims
  for (const claim of input.openClaims ?? []) {
    const ms = Date.parse(claim.createdAt);
    if (!Number.isFinite(ms)) continue;
    const matchedListing = listingById.get(claim.listingId);
    items.push({
      id: `claim-${claim.id}`,
      kind: 'claim_submitted',
      entityId: claim.id,
      entityName: matchedListing?.name ?? claim.organizationName ?? `Claim #${claim.id.slice(0, 8)}`,
      entityType: 'Ownership Claim',
      actionLabel: `Claim ${claim.status.replaceAll('_', ' ')}`,
      detail: `Submitted as ${claim.claimantRole || 'representative'}`,
      occurredAt: claim.createdAt,
      timestampMs: ms,
      isSubstantiatedTimestamp: true,
      targetView: 'listing-claims',
    });
  }

  return items
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, limit);
};

export const buildUserGrowthSummary = ({
  users,
  from,
  to,
  granularity,
}: {
  users: AdminManagedUser[];
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
}): UserGrowthSummary => {
  const activeUsers = users.filter((u) => u.status === 'Active').length;
  const suspendedUsers = users.filter((u) => u.status === 'Suspended').length;
  const adminMetadataAvailable = users.some((u) => u.adminMetadataAvailable);

  const verifiedUsers = users.filter((u) => Boolean(u.emailVerifiedAt)).length;
  const unverifiedUsers = Math.max(0, users.length - verifiedUsers);
  const verificationRatePct =
    users.length > 0 ? Math.round((verifiedUsers / users.length) * 100) : 0;

  const byRole = {
    user: users.filter((u) => u.role === 'User').length,
    host: users.filter((u) => u.role === 'Host').length,
    admin: users.filter((u) => u.role === 'Admin').length,
  };

  const foundingMembers = users.filter((u) => Boolean(u.founderNumber)).length;

  const startMs = new Date(`${from}T00:00:00Z`).getTime();
  const endMs = new Date(`${to}T23:59:59.999Z`).getTime();
  const spanDays = Math.max(
    1,
    Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1,
  );
  const prevFrom = shiftUtcDays(from, -spanDays);
  const prevTo = shiftUtcDays(from, -1);
  const prevStartMs = new Date(`${prevFrom}T00:00:00Z`).getTime();
  const prevEndMs = new Date(`${prevTo}T23:59:59.999Z`).getTime();

  let newUsersInPeriod = 0;
  let newUsersPreviousPeriod = 0;

  const dailyCounts = new Map<string, { total: number; verified: number }>();
  const prevDailyCounts = new Map<string, { total: number; verified: number }>();
  const hourlyCounts = new Map<string, { total: number; verified: number }>();

  for (const user of users) {
    if (!user.joinDate) continue;
    const joinMs = Date.parse(user.joinDate);
    if (!Number.isFinite(joinMs)) continue;
    const joinDateObj = new Date(joinMs);
    const dayKey = toDateInput(joinDateObj);
    const hourKey = `${joinDateObj.toISOString().slice(0, 13)}:00:00Z`;
    const isVer = Boolean(user.emailVerifiedAt);

    if (joinMs >= startMs && joinMs <= endMs) {
      newUsersInPeriod += 1;
      const curr = dailyCounts.get(dayKey) ?? { total: 0, verified: 0 };
      curr.total += 1;
      if (isVer) curr.verified += 1;
      dailyCounts.set(dayKey, curr);
    } else if (joinMs >= prevStartMs && joinMs <= prevEndMs) {
      newUsersPreviousPeriod += 1;
      const prev = prevDailyCounts.get(dayKey) ?? { total: 0, verified: 0 };
      prev.total += 1;
      if (isVer) prev.verified += 1;
      prevDailyCounts.set(dayKey, prev);
    }

    const hr = hourlyCounts.get(hourKey) ?? { total: 0, verified: 0 };
    hr.total += 1;
    if (isVer) hr.verified += 1;
    hourlyCounts.set(hourKey, hr);
  }

  const daily = Array.from(dailyCounts.entries())
    .map(([day, val]) => ({ day, primary: val.total, secondary: val.verified }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const previousDaily = Array.from(prevDailyCounts.entries())
    .map(([day, val]) => ({ day, primary: val.total, secondary: val.verified }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const hourly = Array.from(hourlyCounts.entries())
    .map(([hour, val]) => ({ hour, primary: val.total, secondary: val.verified }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  const trendPoints = buildAnalyticsTrendPoints({
    from,
    to,
    granularity,
    daily,
    previousDaily,
    hourly,
  });

  return {
    totalUsers: users.length,
    activeUsers,
    suspendedUsers,
    newUsersInPeriod,
    newUsersPreviousPeriod,
    newUsersDelta: computePercentageChange(newUsersInPeriod, newUsersPreviousPeriod),
    verifiedUsers,
    unverifiedUsers,
    verificationRatePct,
    adminMetadataAvailable,
    foundingMembers,
    byRole,
    trendPoints,
  };
};
