import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Database,
  Eye,
  FileCheck2,
  Filter,
  Flag,
  Globe2,
  Image as ImageIcon,
  Inbox,
  Info,
  Layers,
  LoaderCircle,
  MapPin,
  Megaphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Ship,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
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
  Tag,
  VenueData,
} from '../../types';
import type { AdminView } from './AdminPanel';
import * as api from '../../lib/api';
import { getOpenSiteIssueCount } from '../../lib/issueReports';
import { getPendingWrittenReviews, type PendingWrittenReview } from '../../lib/feedback/adminFeedbackModeration';
import { listListingClaimsForAdmin, type AdminListingClaim } from '../../lib/claims/listingClaims';
import { getAdminAuditLog, type AdminAuditLogEntry } from '../../lib/admin/auditLog';
import { getAdminManagedUsers, type AdminManagedUser } from '../../lib/admin/userManagement';
import { getPlatformHealth, type PlatformHealthSnapshot } from '../../lib/admin/platformHealth';
import {
  getInboundAnalyticsSummary,
  type InboundAnalyticsSummary,
} from '../../lib/analytics/inboundReports';
import {
  getOutboundAnalyticsSummary,
  type OutboundAnalyticsSummary,
} from '../../lib/analytics/outboundReports';
import {
  formatInboundSourceCategory,
  formatInboundSourceName,
} from '../../lib/analytics/inboundAttribution';
import {
  resolveAnalyticsEntity,
  resolveInternalRoute,
  type AnalyticsCatalog,
} from '../../lib/analytics/routeEntityResolver';
import {
  buildAnalyticsTrendPoints,
  computePercentageChange,
  resolveRangeDates,
  toDateInput,
  type AnalyticsGranularity,
  type AnalyticsRangePreset,
} from '../../lib/analytics/trendSeries';
import {
  AnalyticsTrendCanvas,
  DeltaBadge,
  EntityTypeBadge,
} from './charts/AnalyticsTrendChart';
import AdminDetailDialog from './AdminDetailDialog';
import {
  buildDirectoryHealthSummary,
  buildOperationalQueue,
  buildRecentActivityFeed,
  buildUserGrowthSummary,
  evaluateTrafficProvenance,
  type AdminQueueFilterSpec,
  type OperationalQueueItem,
  type OperationalSeverity,
  type RecentActivityItem,
} from '../../lib/admin/dashboardSummary';
import { isDevRouteEnabled } from '../../lib/devRoutes';
import { useAppStore } from '../../store/appStore';

export type DashboardCatalogCollections = {
  listings: Listing[];
  flagged: number | null;
  venues: VenueData[];
  resorts: ResortData[];
  cruiseSeries: CruiseSeriesData[];
  cruiseSailings: CruiseSailingData[];
  clubBrands: ClubBrandData[];
  eventSeries: EventSeriesData[];
  organizations: OrganizationData[];
  buildingAssets: BuildingAsset[];
  venueRelationships: OrganizationVenueRelationship[];
};

type AdminDashboardProps = {
  setView: (view: AdminView) => void;
  onNavigateWithFilter?: (view: AdminView, filter?: AdminQueueFilterSpec | null) => void;
  allTags: Tag[];
  initialCollections?: DashboardCatalogCollections;
  analyticsCatalog?: AnalyticsCatalog | null;
  onRefresh?: () => void;
};

const RANGE_PRESETS: Array<{ key: Exclude<AnalyticsRangePreset, 'custom'>; label: string; title: string }> = [
  { key: '24h', label: '24H', title: 'Last 24 hours (hourly)' },
  { key: '7d', label: '7D', title: 'Last 7 days (daily)' },
  { key: '30d', label: '30D', title: 'Last 30 days (daily)' },
  { key: '90d', label: '90D', title: 'Last 90 days (daily)' },
  { key: '12m', label: '12M', title: 'Last 12 months (weekly)' },
  { key: 'all', label: 'All', title: 'All recorded history' },
];

const formatNumber = (value?: number | null): string =>
  new Intl.NumberFormat('en-US').format(Number(value ?? 0));

const formatRelativeTime = (isoString: string, nowMs = Date.now()): string => {
  const ts = Date.parse(isoString);
  if (!Number.isFinite(ts)) return isoString;
  const diffSec = Math.round((nowMs - ts) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const severityStyles: Record<
  OperationalSeverity,
  {
    badge: string;
    border: string;
    iconBg: string;
    countText: string;
    label: string;
  }
> = {
  critical: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    border: 'border-rose-200/90 bg-white hover:border-rose-300',
    iconBg: 'bg-rose-100 text-rose-700',
    countText: 'text-rose-700',
    label: 'Action Required',
  },
  warning: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    border: 'border-amber-200/80 bg-white hover:border-amber-300',
    iconBg: 'bg-amber-100 text-amber-700',
    countText: 'text-amber-700',
    label: 'Needs Review',
  },
  info: {
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    border: 'border-slate-200 bg-white hover:border-indigo-200',
    iconBg: 'bg-indigo-50 text-indigo-600',
    countText: 'text-slate-900',
    label: 'Completeness',
  },
  healthy: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    border: 'border-slate-200/80 bg-slate-50/50 hover:border-slate-300',
    iconBg: 'bg-emerald-100 text-emerald-700',
    countText: 'text-emerald-700',
    label: 'Healthy',
  },
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  setView,
  onNavigateWithFilter,
  initialCollections,
  analyticsCatalog,
  onRefresh,
}) => {
  const { currentUser, addToast } = useAppStore();
  const isAdmin = currentUser?.role === 'Admin';
  const canAccessBuildingInspector = isAdmin || import.meta.env.DEV;
  const devToolsEnabled = isDevRouteEnabled();

  // Global Date Range State (default: 30D per spec)
  const todayStr = useMemo(() => toDateInput(new Date()), []);
  const [rangePreset, setRangePreset] = useState<Exclude<AnalyticsRangePreset, 'custom'>>('30d');
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('daily');
  const [showComparison, setShowComparison] = useState<boolean>(true);
  const [trafficMetricMode, setTrafficMetricMode] = useState<'views' | 'visitors'>('views');

  // Catalog collections (uses initialCollections from AdminPanel if provided, else fetches standalone)
  const [collections, setCollections] = useState<DashboardCatalogCollections | null>(
    initialCollections ?? null,
  );
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(!initialCollections);

  // Extended operational & analytics state
  const [inboundSummary, setInboundSummary] = useState<InboundAnalyticsSummary | null>(null);
  const [outboundSummary, setOutboundSummary] = useState<OutboundAnalyticsSummary | null>(null);
  const [isTrafficLoading, setIsTrafficLoading] = useState<boolean>(true);

  const [managedUsers, setManagedUsers] = useState<AdminManagedUser[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingWrittenReview[]>([]);
  const [openClaims, setOpenClaims] = useState<AdminListingClaim[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>([]);
  const [platformHealth, setPlatformHealth] = useState<PlatformHealthSnapshot | null>(null);
  const [isSupplementalLoading, setIsSupplementalLoading] = useState<boolean>(true);

  // Operational Queue UI state
  const [queueFilterTab, setQueueFilterTab] = useState<'attention' | 'all' | 'healthy'>('attention');
  const [inspectedQueueItemId, setInspectedQueueItemId] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState<string>('');

  // Recent Activity UI state
  const [activityFilter, setActivityFilter] = useState<'all' | 'spatial' | 'catalog' | 'admin'>('all');

  useEffect(() => {
    if (initialCollections) {
      setCollections(initialCollections);
      setIsCatalogLoading(false);
    }
  }, [initialCollections]);

  const loadStandaloneCatalog = useCallback(async () => {
    if (initialCollections) return;
    setIsCatalogLoading(true);
    try {
      const [
        listings,
        flagged,
        venues,
        resorts,
        cruiseSeries,
        cruiseSailings,
        clubBrands,
        eventSeries,
        organizations,
        buildingAssets,
        venueRelationships,
      ] = await Promise.all([
        api.getListings(),
        getOpenSiteIssueCount(),
        api.getVenues(),
        api.getResorts(),
        api.getCruiseSeries(),
        api.getCruiseSailings(),
        api.getClubBrands(),
        api.getEventSeries(),
        api.getOrganizations(),
        api.getBuildingAssets(),
        api.getOrganizationVenueRelationships(),
      ]);
      setCollections({
        listings,
        flagged,
        venues,
        resorts,
        cruiseSeries,
        cruiseSailings,
        clubBrands,
        eventSeries,
        organizations,
        buildingAssets,
        venueRelationships,
      });
    } catch {
      addToast({ message: 'Failed to load dashboard catalog data.', type: 'error' });
    } finally {
      setIsCatalogLoading(false);
    }
  }, [addToast, initialCollections]);

  useEffect(() => {
    void loadStandaloneCatalog();
  }, [loadStandaloneCatalog]);

  // Resolve date range from preset
  const firstRecordedDay = inboundSummary?.kpis?.firstRecordedDay ?? outboundSummary?.kpis?.firstRecordedDay ?? null;
  const resolvedRange = useMemo(
    () => resolveRangeDates(rangePreset, todayStr, firstRecordedDay),
    [rangePreset, todayStr, firstRecordedDay],
  );

  // Update default granularity when preset changes
  const handleSelectPreset = (nextPreset: Exclude<AnalyticsRangePreset, 'custom'>) => {
    setRangePreset(nextPreset);
    const nextResolved = resolveRangeDates(nextPreset, todayStr, firstRecordedDay);
    setGranularity(nextResolved.defaultGranularity);
  };

  // Load Inbound & Outbound Analytics for selected date range
  const loadTrafficSummaries = useCallback(async () => {
    setIsTrafficLoading(true);
    try {
      const [inbound, outbound] = await Promise.all([
        getInboundAnalyticsSummary(resolvedRange.from, resolvedRange.to).catch(() => null),
        getOutboundAnalyticsSummary({ from: resolvedRange.from, to: resolvedRange.to }).catch(() => null),
      ]);
      if (inbound) setInboundSummary(inbound);
      if (outbound) setOutboundSummary(outbound);
    } finally {
      setIsTrafficLoading(false);
    }
  }, [resolvedRange.from, resolvedRange.to]);

  useEffect(() => {
    void loadTrafficSummaries();
  }, [loadTrafficSummaries]);

  // Load supplemental operational queues, users, audit log, and platform health
  const loadSupplementalAdminData = useCallback(async () => {
    setIsSupplementalLoading(true);
    try {
      const [usersResult, reviewsResult, claimsResult, auditResult, healthResult] = await Promise.all([
        getAdminManagedUsers().catch(() => [] as AdminManagedUser[]),
        getPendingWrittenReviews().catch(() => [] as PendingWrittenReview[]),
        isAdmin ? listListingClaimsForAdmin().catch(() => [] as AdminListingClaim[]) : Promise.resolve([] as AdminListingClaim[]),
        isAdmin ? getAdminAuditLog(20, 0).catch(() => [] as AdminAuditLogEntry[]) : Promise.resolve([] as AdminAuditLogEntry[]),
        isAdmin ? getPlatformHealth().catch(() => null) : Promise.resolve(null),
      ]);
      setManagedUsers(usersResult);
      setPendingReviews(reviewsResult);
      setOpenClaims(claimsResult);
      setAuditLogs(auditResult);
      setPlatformHealth(healthResult);
    } finally {
      setIsSupplementalLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadSupplementalAdminData();
  }, [loadSupplementalAdminData]);

  const handleFullRefresh = () => {
    if (onRefresh) onRefresh();
    else void loadStandaloneCatalog();
    void loadTrafficSummaries();
    void loadSupplementalAdminData();
  };

  const navigateTo = useCallback(
    (targetView: AdminView, filterSpec?: AdminQueueFilterSpec | null) => {
      if (onNavigateWithFilter && filterSpec) {
        onNavigateWithFilter(targetView, filterSpec);
      } else {
        setView(targetView);
      }
    },
    [onNavigateWithFilter, setView],
  );

  // Compute Operational Queue, Directory Health, Recent Activity, and User Growth
  const dashboardModel = useMemo(() => {
    if (!collections) return null;

    const summaryInput = {
      listings: collections.listings,
      venues: collections.venues,
      organizations: collections.organizations,
      venueRelationships: collections.venueRelationships,
      clubBrands: collections.clubBrands,
      eventSeries: collections.eventSeries,
      resorts: collections.resorts,
      cruiseSeries: collections.cruiseSeries,
      cruiseSailings: collections.cruiseSailings,
      buildingAssets: collections.buildingAssets,
      openSiteIssueCount: collections.flagged ?? 0,
      pendingWrittenReviews: pendingReviews,
      openClaims,
      auditLogs,
      managedUsers,
      platformHealth,
    };

    const operationalQueue = buildOperationalQueue(summaryInput);
    const directoryHealth = buildDirectoryHealthSummary(summaryInput);
    const recentActivity = buildRecentActivityFeed(summaryInput, 24);
    const userGrowth = buildUserGrowthSummary({
      users: managedUsers,
      from: resolvedRange.from,
      to: resolvedRange.to,
      granularity,
    });

    const events = collections.listings.filter((item): item is EventData => item.type === 'event');
    const upcomingEvents = events
      .filter((event) => Date.parse(event.time.start) > Date.now())
      .sort((a, b) => Date.parse(a.time.start) - Date.parse(b.time.start));

    const upcomingSailings = collections.cruiseSailings
      .filter((sailing) => Date.parse(sailing.startsAt) > Date.now())
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

    return {
      operationalQueue,
      directoryHealth,
      recentActivity,
      userGrowth,
      upcomingEvents,
      upcomingSailings,
    };
  }, [
    auditLogs,
    collections,
    granularity,
    managedUsers,
    openClaims,
    pendingReviews,
    platformHealth,
    resolvedRange.from,
    resolvedRange.to,
  ]);

  // Compute Traffic KPIs, Deltas, Trend Points, and Data Provenance
  const trafficMetrics = useMemo(() => {
    const totalSessions = Number(inboundSummary?.totalSessions ?? 0);
    const totalViews = Number(inboundSummary?.totalViews ?? totalSessions);
    const totalVisitors = Number(inboundSummary?.totalUniqueVisitors ?? totalSessions);

    const prevSessions = Number(inboundSummary?.previousPeriod?.totalSessions ?? 0);
    const prevViews = Number(inboundSummary?.previousPeriod?.totalViews ?? prevSessions);
    const prevVisitors = Number(inboundSummary?.previousPeriod?.totalUniqueVisitors ?? prevSessions);

    const viewsDelta = computePercentageChange(totalViews, prevViews);
    const visitorsDelta = computePercentageChange(totalVisitors, prevVisitors);
    const sessionsDelta = computePercentageChange(totalSessions, prevSessions);

    const outboundClicks = Number(outboundSummary?.totalClicks ?? 0);
    const prevOutboundClicks = Number(outboundSummary?.previousPeriod?.totalClicks ?? 0);
    const outboundDelta = computePercentageChange(outboundClicks, prevOutboundClicks);

    const daily = (inboundSummary?.daily ?? []).map((d) => ({
      day: d.day,
      primary:
        trafficMetricMode === 'views'
          ? Number(d.views ?? d.sessions ?? 0)
          : Number(d.visitors ?? d.sessions ?? 0),
      secondary: Number(d.sessions ?? 0),
    }));

    const previousDaily = (inboundSummary?.previousDaily ?? []).map((d) => ({
      day: d.day,
      primary:
        trafficMetricMode === 'views'
          ? Number(d.views ?? d.sessions ?? 0)
          : Number(d.visitors ?? d.sessions ?? 0),
      secondary: Number(d.sessions ?? 0),
    }));

    const hourly = (inboundSummary?.hourly ?? []).map((h) => ({
      hour: h.hour,
      primary: Number(h.views ?? h.sessions ?? 0),
      secondary: Number(h.sessions ?? 0),
    }));

    const trendPoints = buildAnalyticsTrendPoints({
      from: resolvedRange.from,
      to: resolvedRange.to,
      granularity,
      daily,
      previousDaily,
      hourly,
    });

    const provenance = evaluateTrafficProvenance(inboundSummary);

    const topSources = (inboundSummary?.bySource ?? []).slice(0, 4);
    const topLandingPages = (inboundSummary?.byLanding ?? []).slice(0, 4).map((row) => ({
      ...row,
      resolved: resolveInternalRoute(row.landingPath, analyticsCatalog ?? null),
    }));

    const topOutboundListing = outboundSummary?.byEntity?.[0]
      ? {
          ...outboundSummary.byEntity[0],
          resolved: resolveAnalyticsEntity(
            outboundSummary.byEntity[0].entityType,
            outboundSummary.byEntity[0].entityId,
            analyticsCatalog ?? null,
          ),
        }
      : null;

    const topOutboundDomain = outboundSummary?.byDomain?.[0] ?? null;

    return {
      totalViews,
      totalVisitors,
      totalSessions,
      viewsDelta,
      visitorsDelta,
      sessionsDelta,
      outboundClicks,
      outboundDelta,
      trendPoints,
      provenance,
      topSources,
      topLandingPages,
      topOutboundListing,
      topOutboundDomain,
    };
  }, [analyticsCatalog, granularity, inboundSummary, outboundSummary, resolvedRange.from, resolvedRange.to, trafficMetricMode]);

  const inspectedQueueItem: OperationalQueueItem | null = useMemo(() => {
    if (!inspectedQueueItemId || !dashboardModel) return null;
    return dashboardModel.operationalQueue.find((item) => item.id === inspectedQueueItemId) ?? null;
  }, [dashboardModel, inspectedQueueItemId]);

  const filteredModalRecords = useMemo(() => {
    if (!inspectedQueueItem) return [];
    const q = modalSearch.trim().toLowerCase();
    if (!q) return inspectedQueueItem.records;
    return inspectedQueueItem.records.filter((rec) =>
      [rec.name, rec.entityType, rec.subtitle, rec.reason].some((val) => val?.toLowerCase().includes(q)),
    );
  }, [inspectedQueueItem, modalSearch]);

  if (isCatalogLoading || !collections || !dashboardModel) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-slate-600">
          <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600" />
          <span className="text-sm font-semibold">Loading SwingSphere Command Center…</span>
        </div>
      </div>
    );
  }

  const {
    operationalQueue,
    directoryHealth,
    recentActivity,
    userGrowth,
    upcomingEvents,
    upcomingSailings,
  } = dashboardModel;

  const actionNeededItems = operationalQueue.filter((item) => item.count > 0 && item.severity !== 'healthy');
  const healthyItems = operationalQueue.filter((item) => item.count === 0 || item.severity === 'healthy');
  const criticalCount = actionNeededItems.filter((item) => item.severity === 'critical').reduce((sum, i) => sum + i.count, 0);
  const totalAttentionRecords = actionNeededItems.reduce((sum, i) => sum + i.count, 0);

  const visibleQueueItems =
    queueFilterTab === 'attention'
      ? actionNeededItems.length > 0
        ? actionNeededItems
        : operationalQueue
      : queueFilterTab === 'healthy'
        ? healthyItems
        : operationalQueue;

  const filteredRecentActivity: RecentActivityItem[] = recentActivity.filter((item) => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'spatial') return item.kind === 'building_verified';
    if (activityFilter === 'catalog') return item.kind === 'entity_created' || item.kind === 'entity_updated';
    if (activityFilter === 'admin') return item.kind === 'admin_audit' || item.kind === 'claim_submitted';
    return true;
  });

  const canUseHourly = rangePreset === '24h' || rangePreset === '7d';
  const viewsPerSession =
    trafficMetrics.totalSessions > 0
      ? (trafficMetrics.totalViews / trafficMetrics.totalSessions).toFixed(2)
      : '1.00';

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-10">
      {/* Command Center Top Header & Global Date-Range Bar */}
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700">
                <Sparkles size={12} />
                Command Center
              </span>
              {criticalCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('operational-queue-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                  {criticalCount} critical item{criticalCount === 1 ? '' : 's'} awaiting action
                </button>
              ) : actionNeededItems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('operational-queue-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {actionNeededItems.length} queue categor{actionNeededItems.length === 1 ? 'y' : 'ies'} need review
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  All operational queues clear
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              SwingSphere Overview
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Platform growth, operational queues, directory completeness, and substantiated catalog activity.
            </p>
          </div>

          {/* Global Date Range Selector + Refresh */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div
              role="group"
              aria-label="Global dashboard date range"
              className="inline-flex flex-wrap items-center rounded-xl border border-slate-200 bg-slate-100/80 p-1"
            >
              {RANGE_PRESETS.map((preset) => {
                const active = rangePreset === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    title={preset.title}
                    onClick={() => handleSelectPreset(preset.key)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition sm:px-3 ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleFullRefresh}
              title="Refresh dashboard metrics"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <RefreshCw
                size={14}
                className={isTrafficLoading || isSupplementalLoading ? 'animate-spin text-indigo-600' : 'text-slate-500'}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Actions Strip */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Quick Actions:
          </span>
          <button
            type="button"
            onClick={() => navigateTo('add-club')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus size={13} />
            Add Club
          </button>
          <button
            type="button"
            onClick={() => navigateTo('add-event')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus size={13} />
            Add Event
          </button>
          <button
            type="button"
            onClick={() => navigateTo('submissions')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
          >
            <Inbox size={13} className="text-slate-500" />
            Review Submissions
            {operationalQueue.find((i) => i.id === 'pending-submissions')?.count ? (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {operationalQueue.find((i) => i.id === 'pending-submissions')?.count}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => navigateTo('moderation')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
          >
            <Flag size={13} className="text-slate-500" />
            Moderation Queue
            {operationalQueue.find((i) => i.id === 'moderation-queue')?.count ? (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {operationalQueue.find((i) => i.id === 'moderation-queue')?.count}
              </span>
            ) : null}
          </button>
          {canAccessBuildingInspector && (
            <button
              type="button"
              onClick={() => navigateTo('building-inspector')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              <Building2 size={13} className="text-indigo-600" />
              Building Inspector
            </button>
          )}
          {devToolsEnabled && (
            <a
              href="/dev/images"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              <ImageIcon size={13} className="text-violet-600" />
              Dev Image Manager
            </a>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigateTo('settings')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              <Rocket size={13} className="text-emerald-600" />
              Platform & Releases
            </button>
          )}
        </div>
      </header>

      {/* 1. Overview KPIs (6 Compact Cards) */}
      <section aria-label="Overview KPIs" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* KPI 1: Page Views */}
        <button
          type="button"
          onClick={() => navigateTo('inbound-analytics')}
          className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Page Views ({rangePreset.toUpperCase()})
            </span>
            <span className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 transition group-hover:bg-indigo-100">
              <Eye size={15} />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-950">
                {formatNumber(trafficMetrics.totalViews)}
              </span>
              {rangePreset !== 'all' && <DeltaBadge delta={trafficMetrics.viewsDelta} />}
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>Today: {formatNumber(inboundSummary?.kpis?.viewsToday ?? 0)}</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 opacity-80 group-hover:opacity-100">
                Inbound <ChevronRight size={12} />
              </span>
            </p>
          </div>
        </button>

        {/* KPI 2: Unique Visitors */}
        <button
          type="button"
          onClick={() => navigateTo('inbound-analytics')}
          className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Unique Visitors ({rangePreset.toUpperCase()})
            </span>
            <span className="rounded-lg bg-sky-50 p-1.5 text-sky-600 transition group-hover:bg-sky-100">
              <Compass size={15} />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-950">
                {formatNumber(trafficMetrics.totalVisitors)}
              </span>
              {rangePreset !== 'all' && <DeltaBadge delta={trafficMetrics.visitorsDelta} />}
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>All-time: {formatNumber(inboundSummary?.kpis?.visitorsAllTime ?? trafficMetrics.totalVisitors)}</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 opacity-80 group-hover:opacity-100">
                Explore <ChevronRight size={12} />
              </span>
            </p>
          </div>
        </button>

        {/* KPI 3: Sessions */}
        <button
          type="button"
          onClick={() => navigateTo('inbound-analytics')}
          className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Sessions ({rangePreset.toUpperCase()})
            </span>
            <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 transition group-hover:bg-emerald-100">
              <Activity size={15} />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-950">
                {formatNumber(trafficMetrics.totalSessions)}
              </span>
              {rangePreset !== 'all' && <DeltaBadge delta={trafficMetrics.sessionsDelta} />}
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>{viewsPerSession} views / session</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 opacity-80 group-hover:opacity-100">
                Sources <ChevronRight size={12} />
              </span>
            </p>
          </div>
        </button>

        {/* KPI 4: Registered Users (Lifetime Inventory) */}
        <button
          type="button"
          onClick={() => navigateTo('users')}
          className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Registered Users
            </span>
            <span className="rounded-lg bg-violet-50 p-1.5 text-violet-600 transition group-hover:bg-violet-100">
              <Users size={15} />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-950">
                {formatNumber(userGrowth.totalUsers)}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                All-time
              </span>
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>
                {userGrowth.adminMetadataAvailable
                  ? `${formatNumber(userGrowth.verifiedUsers)} verified (${userGrowth.verificationRatePct}%)`
                  : `${formatNumber(userGrowth.activeUsers)} active accounts`}
              </span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 opacity-80 group-hover:opacity-100">
                Users <ChevronRight size={12} />
              </span>
            </p>
          </div>
        </button>

        {/* KPI 5: New Registrations (Selected Period) */}
        <button
          type="button"
          onClick={() => navigateTo('users')}
          className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              New Signups ({rangePreset.toUpperCase()})
            </span>
            <span className="rounded-lg bg-amber-50 p-1.5 text-amber-600 transition group-hover:bg-amber-100">
              <UserPlus size={15} />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-950">
                {formatNumber(userGrowth.newUsersInPeriod)}
              </span>
              {rangePreset !== 'all' && <DeltaBadge delta={userGrowth.newUsersDelta} />}
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>Prev period: {formatNumber(userGrowth.newUsersPreviousPeriod)}</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 opacity-80 group-hover:opacity-100">
                Cohort <ChevronRight size={12} />
              </span>
            </p>
          </div>
        </button>

        {/* KPI 6: Total Published Listings (Lifetime Inventory) */}
        <button
          type="button"
          onClick={() => navigateTo('manage-clubs')}
          className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Published Listings
            </span>
            <span className="rounded-lg bg-rose-50 p-1.5 text-rose-600 transition group-hover:bg-rose-100">
              <Globe2 size={15} />
            </span>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-950">
                {formatNumber(directoryHealth.totalPublishedListings)}
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {directoryHealth.overallCompletenessPct}% complete
              </span>
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>{formatNumber(directoryHealth.totalCatalogRecords)} total records</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 opacity-80 group-hover:opacity-100">
                Catalog <ChevronRight size={12} />
              </span>
            </p>
          </div>
        </button>
      </section>

      {/* 2. Traffic & Growth Visualization (Primary Centerpiece) */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950 sm:text-xl">
                Traffic & Discovery Growth
              </h2>
              <span
                title={trafficMetrics.provenance.explanation}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                  trafficMetrics.provenance.mode === 'full_pageviews'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : trafficMetrics.provenance.mode === 'mixed_history'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-slate-100 text-slate-700'
                }`}
              >
                <Info size={12} />
                {trafficMetrics.provenance.badgeLabel}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              {resolvedRange.from} to {resolvedRange.to} ({resolvedRange.comparisonLabel}) · {trafficMetrics.provenance.shortNote}
            </p>
          </div>

          {/* Chart Controls: Metric toggle, Granularity, Previous Period comparison */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Mode Switcher */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTrafficMetricMode('views')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  trafficMetricMode === 'views'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Page Views & Sessions
              </button>
              <button
                type="button"
                onClick={() => setTrafficMetricMode('visitors')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  trafficMetricMode === 'visitors'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unique Visitors & Sessions
              </button>
            </div>

            {/* Granularity Selector */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
              {(['hourly', 'daily', 'weekly', 'monthly'] as AnalyticsGranularity[]).map((g) => {
                const disabled = g === 'hourly' && !canUseHourly;
                return (
                  <button
                    key={g}
                    type="button"
                    disabled={disabled}
                    onClick={() => setGranularity(g)}
                    className={`rounded-lg px-2.5 py-1 capitalize transition ${
                      granularity === g
                        ? 'bg-white text-slate-900 shadow-xs'
                        : disabled
                          ? 'cursor-not-allowed text-slate-300'
                          : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>

            {/* Comparison Toggle */}
            {rangePreset !== 'all' && (
              <button
                type="button"
                onClick={() => setShowComparison((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  showComparison
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    showComparison ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                />
                Compare previous
              </button>
            )}
          </div>
        </div>

        {/* Main Trend Line Chart */}
        <div className="mt-4">
          <AnalyticsTrendCanvas
            points={trafficMetrics.trendPoints}
            primaryLabel={trafficMetricMode === 'views' ? 'Page Views' : 'Unique Visitors'}
            secondaryLabel="Sessions"
            showSecondary={true}
            showComparison={showComparison && rangePreset !== 'all'}
            primaryColor="#4f46e5"
            secondaryColor="#0ea5e9"
            height={280}
            emptyMessage="No recorded traffic in the selected period."
          />
        </div>

        {/* Data Provenance Callout Footnote */}
        <div className="mt-3 flex flex-col justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3.5 py-2.5 text-xs text-slate-600 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2 sm:items-center">
            <Info size={14} className="mt-0.5 shrink-0 text-indigo-600 sm:mt-0" />
            <span>
              <strong className="font-semibold text-slate-800">Measurement provenance:</strong>{' '}
              {trafficMetrics.provenance.explanation}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigateTo('inbound-analytics')}
              className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              Full Inbound Report <ArrowRight size={13} />
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => navigateTo('outbound-analytics')}
              className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              Outbound Clicks ({formatNumber(trafficMetrics.outboundClicks)}) <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* Compact Acquisition & Outbound Pulse Strip */}
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 lg:grid-cols-3">
          {/* Top Inbound Acquisition Sources */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Top Traffic Sources ({rangePreset.toUpperCase()})
              </h3>
              <button
                type="button"
                onClick={() => navigateTo('inbound-analytics')}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                All sources →
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {trafficMetrics.topSources.map((src) => {
                const sharePct =
                  trafficMetrics.totalSessions > 0
                    ? Math.round((src.sessions / trafficMetrics.totalSessions) * 100)
                    : 0;
                return (
                  <div
                    key={`${src.sourceCategory}-${src.sourceName}`}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-slate-800">
                        {formatInboundSourceName(src.sourceName)}
                      </span>
                      <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {formatInboundSourceCategory(src.sourceCategory)}
                      </span>
                    </div>
                    <div className="shrink-0 font-semibold text-slate-700">
                      {formatNumber(src.sessions)}{' '}
                      <span className="font-normal text-slate-400">({sharePct}%)</span>
                    </div>
                  </div>
                );
              })}
              {trafficMetrics.topSources.length === 0 && (
                <p className="text-xs text-slate-400">No source attribution recorded for this window.</p>
              )}
            </div>
          </div>

          {/* Top Entry / Landing Pages */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Top Entry Pages ({rangePreset.toUpperCase()})
              </h3>
              <button
                type="button"
                onClick={() => navigateTo('inbound-analytics')}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Content report →
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {trafficMetrics.topLandingPages.map((row) => (
                <div key={row.landingPath} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <EntityTypeBadge type={row.resolved.entityType} />
                    <a
                      href={row.resolved.href || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={row.landingPath}
                      className="inline-flex min-w-0 items-center gap-1 truncate font-semibold text-slate-800 hover:text-indigo-600 hover:underline"
                    >
                      <span className="truncate">{row.resolved.title}</span>
                      <ArrowUpRight size={11} className="shrink-0 text-slate-400" />
                    </a>
                  </div>
                  <span className="shrink-0 font-semibold text-slate-700">
                    {formatNumber(row.sessions)} entries
                  </span>
                </div>
              ))}
              {trafficMetrics.topLandingPages.length === 0 && (
                <p className="text-xs text-slate-400">No entry pages recorded for this window.</p>
              )}
            </div>
          </div>

          {/* Outbound Partner Referrals Pulse */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Outbound Referrals ({rangePreset.toUpperCase()})
              </h3>
              <button
                type="button"
                onClick={() => navigateTo('outbound-analytics')}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Outbound report →
              </button>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-xl font-black text-slate-900">
                {formatNumber(trafficMetrics.outboundClicks)}
              </span>
              <span className="text-xs font-medium text-slate-500">clicks</span>
              {rangePreset !== 'all' && <DeltaBadge delta={trafficMetrics.outboundDelta} />}
            </div>
            <div className="mt-2.5 space-y-1.5 border-t border-slate-200/60 pt-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Top clicked listing:</span>
                {trafficMetrics.topOutboundListing ? (
                  <span className="truncate font-semibold text-slate-800">
                    {trafficMetrics.topOutboundListing.resolved.title} ({formatNumber(trafficMetrics.topOutboundListing.totalClicks)})
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Top destination domain:</span>
                {trafficMetrics.topOutboundDomain ? (
                  <span className="truncate font-semibold text-slate-800">
                    {trafficMetrics.topOutboundDomain.destinationDomain} ({formatNumber(trafficMetrics.topOutboundDomain.totalClicks)})
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Requires Attention — Operational Queue */}
      <section
        id="operational-queue-section"
        aria-label="Requires Attention Operational Queue"
        className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-950 sm:text-xl">
                Requires Attention — Operational Queue
              </h2>
              {actionNeededItems.length > 0 ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  {actionNeededItems.length} active queue{actionNeededItems.length === 1 ? '' : 's'} · {formatNumber(totalAttentionRecords)} affected record{totalAttentionRecords === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  0 items require action
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Live administrative checks across submissions, moderation, 3D building verification, media completeness, and duplicate detection.
            </p>
          </div>

          <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setQueueFilterTab('attention')}
              className={`rounded-lg px-3 py-1.5 transition ${
                queueFilterTab === 'attention'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Needs Attention ({actionNeededItems.length})
            </button>
            <button
              type="button"
              onClick={() => setQueueFilterTab('all')}
              className={`rounded-lg px-3 py-1.5 transition ${
                queueFilterTab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Checks ({operationalQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setQueueFilterTab('healthy')}
              className={`rounded-lg px-3 py-1.5 transition ${
                queueFilterTab === 'healthy'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Healthy ({healthyItems.length})
            </button>
          </div>
        </div>

        {queueFilterTab === 'attention' && actionNeededItems.length === 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold">All operational queues are clear</p>
              <p className="text-xs text-emerald-700">
                No pending submissions, open reports, unverified 3D buildings, or missing media require immediate action. Showing all health checks below.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {visibleQueueItems.map((item) => {
            const style = severityStyles[item.severity];
            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-xl border p-4 transition shadow-2xs ${style.border}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${style.badge}`}
                    >
                      {item.severity === 'critical' && <ShieldAlert size={12} />}
                      {item.severity === 'warning' && <AlertTriangle size={12} />}
                      {item.severity === 'info' && <Info size={12} />}
                      {item.severity === 'healthy' && <CheckCircle2 size={12} />}
                      {style.label}
                    </span>
                    <span className={`text-2xl font-black tracking-tight ${style.countText}`}>
                      {formatNumber(item.count)}
                    </span>
                  </div>

                  <h3 className="mt-2.5 text-sm font-bold text-slate-950">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</p>

                  {/* Preview up to 2 affected record names inline */}
                  {item.records.length > 0 && (
                    <div className="mt-3 space-y-1 rounded-lg border border-slate-100 bg-slate-50/90 p-2 text-[11px]">
                      {item.records.slice(0, 2).map((rec) => (
                        <button
                          key={`${item.id}-${rec.id}`}
                          type="button"
                          onClick={() => navigateTo(rec.editView)}
                          className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left transition hover:bg-white hover:text-indigo-600"
                        >
                          <span className="truncate font-semibold text-slate-800">{rec.name}</span>
                          <span className="shrink-0 text-[10px] font-medium text-slate-400">
                            {rec.entityType} →
                          </span>
                        </button>
                      ))}
                      {item.records.length > 2 && (
                        <div className="px-1.5 pt-0.5 text-[10px] font-medium text-slate-400">
                          +{item.records.length - 2} more affected record{item.records.length - 2 === 1 ? '' : 's'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => navigateTo(item.targetView, item.filterSpec)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 transition hover:text-indigo-800 hover:underline"
                  >
                    <span>{item.actionLabel}</span>
                    <ArrowRight size={13} />
                  </button>

                  {item.records.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalSearch('');
                        setInspectedQueueItemId(item.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Filter size={11} />
                      Inspect ({item.records.length})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 & 5. Content & Directory Health + Recent User Growth (Side-by-Side SaaS Grid) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Section 5: Content & Directory Health (7 cols on XL) */}
        <section
          aria-label="Content and Directory Health"
          className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6 xl:col-span-7"
        >
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-950 sm:text-xl">
                  Content & Directory Health
                </h2>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  {directoryHealth.overallCompletenessPct}% avg completeness
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Inventory status and metadata completeness across clubs, events, hosts, resorts, cruises, and physical venues.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pr-3">Category</th>
                  <th className="px-3 pb-3 text-right">Published</th>
                  <th className="px-3 pb-3 text-right">Draft / Pending</th>
                  <th className="hidden px-3 pb-3 sm:table-cell">Structure</th>
                  <th className="px-3 pb-3">Completeness</th>
                  <th className="pb-3 pl-2 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {directoryHealth.categories.map((cat) => {
                  const barColor =
                    cat.completenessPct >= 80
                      ? 'bg-emerald-500'
                      : cat.completenessPct >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500';
                  return (
                    <tr
                      key={cat.key}
                      onClick={() => navigateTo(cat.targetView)}
                      className="group cursor-pointer transition hover:bg-slate-50/90"
                    >
                      <td className="py-3.5 pr-3">
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600">
                          {cat.label}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {formatNumber(cat.total)} total record{cat.total === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-bold text-emerald-700">
                        {formatNumber(cat.published)}
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        {cat.draftOrPending > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                            {formatNumber(cat.draftOrPending)}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-3.5 text-xs text-slate-600 sm:table-cell">
                        {cat.secondaryLabel}: <strong className="text-slate-800">{cat.secondaryCount}</strong>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100 sm:w-24">
                            <div
                              className={`h-full rounded-full ${barColor}`}
                              style={{ width: `${Math.max(4, cat.completenessPct)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-800">
                            {cat.completenessPct}%
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {cat.completenessNote}
                        </div>
                      </td>
                      <td className="py-3.5 pl-2 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:translate-x-0.5">
                          Open <ChevronRight size={13} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 6: Recent User Growth (5 cols on XL) */}
        <section
          aria-label="Recent User Growth"
          className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6 xl:col-span-5"
        >
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950 sm:text-xl">
                  Recent User Growth
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Member registrations, verification status, and account roles.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo('users')}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
              >
                Manage Users <ArrowRight size={12} />
              </button>
            </div>

            {/* Compact User Growth KPIs */}
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total Users
                </div>
                <div className="mt-1 text-xl font-black text-slate-950">
                  {formatNumber(userGrowth.totalUsers)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {formatNumber(userGrowth.activeUsers)} active
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  New ({rangePreset.toUpperCase()})
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                  <span className="text-xl font-black text-slate-950">
                    {formatNumber(userGrowth.newUsersInPeriod)}
                  </span>
                  {rangePreset !== 'all' && <DeltaBadge delta={userGrowth.newUsersDelta} />}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Prev: {formatNumber(userGrowth.newUsersPreviousPeriod)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Verified Email
                </div>
                <div className="mt-1 text-xl font-black text-emerald-700">
                  {userGrowth.adminMetadataAvailable
                    ? `${userGrowth.verificationRatePct}%`
                    : '—'}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {userGrowth.adminMetadataAvailable
                    ? `${formatNumber(userGrowth.verifiedUsers)} / ${formatNumber(userGrowth.totalUsers)}`
                    : 'RPC metadata pending'}
                </div>
              </div>
            </div>

            {/* Registrations Over Time Trend */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  Registrations Over Time ({rangePreset.toUpperCase()})
                </span>
                <span className="text-[11px] text-slate-400">
                  Grouped by {granularity}
                </span>
              </div>
              <AnalyticsTrendCanvas
                points={userGrowth.trendPoints}
                primaryLabel="New Registrations"
                secondaryLabel="Verified Signups"
                showSecondary={userGrowth.adminMetadataAvailable}
                showComparison={showComparison && rangePreset !== 'all'}
                primaryColor="#7c3aed"
                secondaryColor="#10b981"
                height={180}
                emptyMessage="No user registrations recorded in this date window."
              />
            </div>
          </div>

          {/* Account Role & Verification Breakdown Footer */}
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-600">Account Roles:</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                  Members: {formatNumber(userGrowth.byRole.user)}
                </span>
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                  Hosts: {formatNumber(userGrowth.byRole.host)}
                </span>
                <span className="rounded-md bg-violet-50 px-2 py-0.5 font-semibold text-violet-700">
                  Admins: {formatNumber(userGrowth.byRole.admin)}
                </span>
                {userGrowth.foundingMembers > 0 && (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                    Founders: {formatNumber(userGrowth.foundingMembers)}
                  </span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Privacy note: Individual member browsing history is never tracked. Email verification timestamps and roles are sourced from <code className="rounded bg-slate-100 px-1">admin_list_users</code>.
            </p>
          </div>
        </section>
      </div>

      {/* 6. Recently Added & Recently Changed + Upcoming Schedule */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Recently Added & Recently Changed Feed (8 cols on XL) */}
        <section
          aria-label="Recently Added and Recently Changed"
          className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6 xl:col-span-8"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950 sm:text-xl">
                Recently Added & Recently Changed
              </h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Substantiated activity from 3D building captures, catalog creation/update timestamps, ownership claims, and privileged admin audit logs.
              </p>
            </div>

            <div className="inline-flex w-fit flex-wrap rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'spatial', label: '3D Buildings' },
                  { key: 'catalog', label: 'Catalog' },
                  { key: 'admin', label: 'Audit & Claims' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActivityFilter(tab.key)}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    activityFilter === tab.key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {filteredRecentActivity.slice(0, 10).map((act) => {
              const badgeStyles: Record<RecentActivityItem['kind'], string> = {
                building_verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                entity_created: 'border-indigo-200 bg-indigo-50 text-indigo-700',
                entity_updated: 'border-sky-200 bg-sky-50 text-sky-700',
                admin_audit: 'border-violet-200 bg-violet-50 text-violet-700',
                claim_submitted: 'border-amber-200 bg-amber-50 text-amber-800',
                submission_pending: 'border-rose-200 bg-rose-50 text-rose-700',
              };
              return (
                <div
                  key={act.id}
                  className="flex flex-col justify-between gap-2 py-3 transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:px-2"
                >
                  <button
                    type="button"
                    onClick={() => navigateTo(act.targetView)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeStyles[act.kind]}`}
                    >
                      {act.actionLabel}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-slate-900 hover:text-indigo-600">
                          {act.entityName}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {act.entityType}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{act.detail}</p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                    <span
                      title={new Date(act.occurredAt).toLocaleString()}
                      className="text-xs font-medium text-slate-400"
                    >
                      {formatRelativeTime(act.occurredAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateTo(act.targetView)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-600"
                    >
                      Open <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredRecentActivity.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-400">
                No substantiated activity entries match the selected filter.
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
            <span>
              Only records with verified creation, capture, claim, or audit timestamps are listed here.
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigateTo('audit-log')}
                className="font-semibold text-indigo-600 hover:underline"
              >
                View full Admin Audit Log →
              </button>
            )}
          </div>
        </section>

        {/* Upcoming Events & Sailings Horizon (4 cols on XL) */}
        <section
          aria-label="Upcoming Events and Sailings"
          className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6 xl:col-span-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950 sm:text-xl">
                Upcoming Schedule
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Next scheduled events and cruise sailings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('manage-events')}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              All events →
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            {upcomingEvents.slice(0, 5).map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => navigateTo({ view: 'edit-event', eventId: event.id })}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-left transition hover:border-indigo-300 hover:bg-white"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                      Event
                    </span>
                    <span className="truncate text-sm font-bold text-slate-900 group-hover:text-indigo-600">
                      {event.name}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {new Date(event.time.start).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    · {event.geopoint?.address?.city || event.location}
                  </p>
                </div>
                <ChevronRight
                  size={15}
                  className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                />
              </button>
            ))}

            {upcomingSailings.slice(0, 3).map((sailing) => (
              <button
                key={sailing.id}
                type="button"
                onClick={() => navigateTo({ view: 'edit-cruise-sailing', cruiseSailingId: sailing.id })}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-left transition hover:border-indigo-300 hover:bg-white"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-700">
                      Cruise
                    </span>
                    <span className="truncate text-sm font-bold text-slate-900 group-hover:text-indigo-600">
                      {sailing.name}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {new Date(sailing.startsAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    · {sailing.shipName} ({sailing.departurePort?.portName || 'Port TBD'})
                  </p>
                </div>
                <ChevronRight
                  size={15}
                  className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                />
              </button>
            ))}

            {upcomingEvents.length === 0 && upcomingSailings.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-400">
                No upcoming events or cruise sailings currently scheduled.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Operational Queue Filtered Record Inspection Dialog */}
      {inspectedQueueItem && (
        <AdminDetailDialog
          onClose={() => setInspectedQueueItemId(null)}
          title={`${inspectedQueueItem.title} (${inspectedQueueItem.count})`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">{inspectedQueueItem.description}</p>

            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="Filter affected records by name, city, or reason…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {filteredModalRecords.map((rec) => (
                <div
                  key={`${inspectedQueueItem.id}-${rec.id}`}
                  className="flex flex-col justify-between gap-3 p-3.5 transition hover:bg-slate-50 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{rec.name}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        {rec.entityType}
                      </span>
                      {rec.status && (
                        <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {rec.status}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{rec.subtitle}</p>
                    <p className="mt-1 text-xs font-medium text-amber-800">{rec.reason}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {rec.secondaryAction && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectedQueueItemId(null);
                          if (rec.secondaryAction?.view) {
                            navigateTo(rec.secondaryAction.view);
                          }
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      >
                        {rec.secondaryAction.label}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedQueueItemId(null);
                        navigateTo(rec.editView);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <span>Open Editor</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              ))}

              {filteredModalRecords.length === 0 && (
                <div className="p-8 text-center text-sm text-slate-400">
                  No affected records match “{modalSearch}”.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-500">
                Showing {filteredModalRecords.length} of {inspectedQueueItem.records.length} affected record{inspectedQueueItem.records.length === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectedQueueItemId(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = inspectedQueueItem.targetView;
                    const spec = inspectedQueueItem.filterSpec;
                    setInspectedQueueItemId(null);
                    navigateTo(target, spec);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <span>{inspectedQueueItem.actionLabel}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </AdminDetailDialog>
      )}
    </div>
  );
};

export default AdminDashboard;
