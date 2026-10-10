import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Compass,
  ExternalLink,
  Eye,
  Globe2,
  Info,
  Laptop,
  LoaderCircle,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Users,
  X,
} from 'lucide-react';
import {
  getInboundAnalyticsDetail,
  getInboundAnalyticsSummary,
  type InboundAnalyticsDetail,
  type InboundAnalyticsDetailFilter,
  type InboundAnalyticsSummary,
} from '../../lib/analytics/inboundReports';
import {
  formatInboundSourceCategory,
  formatInboundSourceName,
} from '../../lib/analytics/inboundAttribution';
import {
  formatBrowserFamily,
  formatDeviceClass,
  formatOsFamily,
} from '../../lib/analytics/deviceAttribution';
import {
  resolveInternalRoute,
  type AnalyticsCatalog,
  type AnalyticsContentType,
} from '../../lib/analytics/routeEntityResolver';
import { useAnalyticsCatalog } from '../../lib/analytics/useAnalyticsCatalog';
import {
  buildAnalyticsTrendPoints,
  resolveRangeDates,
  toDateInput,
  type AnalyticsGranularity,
  type AnalyticsRangePreset,
} from '../../lib/analytics/trendSeries';
import AnalyticsTrendChart, {
  DeltaBadge,
  EntityTypeBadge,
} from './charts/AnalyticsTrendChart';
import AdminDetailDialog from './AdminDetailDialog';
import { useAppStore } from '../../store/appStore';

const formatNumber = (value?: number): string => new Intl.NumberFormat('en-US').format(value ?? 0);

const formatPercent = (part: number, total: number): string => {
  if (!total || part <= 0) return '0.0%';
  const pct = (part / total) * 100;
  return `${pct >= 10 ? pct.toFixed(1) : pct.toFixed(1)}%`;
};

const friendlyReferrerName = (domain: string): string => {
  if (domain === 'com.reddit.frontpage') return 'Reddit Android App';
  if (domain === 'com.instagram.android') return 'Instagram Android App';
  if (domain === 'com.facebook.katana') return 'Facebook Android App';
  return domain;
};

const referrerDomainHref = (domain?: string | null): string | null => {
  if (!domain) return null;
  const clean = domain.trim().toLowerCase();
  if (
    clean === 'com.reddit.frontpage'
    || clean === 'com.instagram.android'
    || clean === 'com.facebook.katana'
    || clean === 'com.google.android.googlequicksearchbox'
  ) {
    return null;
  }
  if (!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(clean) || !clean.includes('.')) return null;
  return `https://${clean}`;
};

const normalizeReferrerPathForDisplay = (domain: string, path: string): string => {
  if (domain === 'com.reddit.frontpage' && path.startsWith('/https/www.reddit.com/')) {
    return `/${path.slice('/https/www.reddit.com/'.length)}`;
  }
  return path;
};

const sourceUrlFor = (domain: string, path: string): string | null => {
  if (!domain || !path) return null;
  if (domain === 'com.reddit.frontpage' && path.startsWith('/https/www.reddit.com/')) {
    return `https://www.reddit.com/${path.slice('/https/www.reddit.com/'.length)}`;
  }
  if (domain === 'com.instagram.android' || domain === 'com.facebook.katana') return null;
  if (!domain.includes('.') || !path.startsWith('/')) return null;
  return `https://${domain}${path}`;
};

type DetailSelection = {
  key: string;
  title: string;
  description: string;
  filter: Omit<InboundAnalyticsDetailFilter, 'from' | 'to'>;
  referrerDomain?: string;
};

type ContentTabMode = 'landing' | 'views';
type SourceTabMode = 'sources' | 'referrers' | 'campaigns';
type DeviceTabMode = 'devices' | 'os' | 'browsers';

const CONTENT_TYPE_FILTERS: Array<'All' | AnalyticsContentType> = [
  'All',
  'Event',
  'Club',
  'Host',
  'Resort',
  'Cruise',
  'Globe',
  'Map',
  'Directory',
  'Home',
  'Other',
];

const DeviceIcon: React.FC<{ deviceClass: string }> = ({ deviceClass }) => {
  const normalized = deviceClass.toLowerCase();
  if (normalized === 'mobile') return <Smartphone size={15} className="text-indigo-600" />;
  if (normalized === 'tablet') return <Tablet size={15} className="text-violet-600" />;
  if (normalized === 'desktop') return <Monitor size={15} className="text-slate-700" />;
  return <Laptop size={15} className="text-slate-400" />;
};

const ClickableInternalPageCell: React.FC<{
  path: string;
  catalog: AnalyticsCatalog | null;
  compact?: boolean;
}> = ({ path, catalog, compact = false }) => {
  const resolved = useMemo(() => resolveInternalRoute(path, catalog), [path, catalog]);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {resolved.href ? (
          <a
            href={resolved.href}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${resolved.title} (${resolved.rawPath}) in a new tab`}
            onClick={(e) => e.stopPropagation()}
            className="group inline-flex min-w-0 items-center gap-1 font-semibold text-slate-900 transition hover:text-indigo-600 hover:underline"
          >
            <span className="truncate">{resolved.title}</span>
            <ArrowUpRight
              size={13}
              className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-indigo-600"
            />
          </a>
        ) : (
          <span className="truncate font-semibold text-slate-900">{resolved.title}</span>
        )}
        {compact ? <EntityTypeBadge type={resolved.entityType} /> : null}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span className="truncate font-mono text-[11px] text-slate-400" title={resolved.rawPath}>
          {resolved.rawPath}
        </span>
        {resolved.subtitle ? (
          <>
            <span className="text-slate-300">·</span>
            <span className="truncate text-[11px] text-slate-500">{resolved.subtitle}</span>
          </>
        ) : null}
      </div>
    </div>
  );
};

const AdminInboundAnalytics: React.FC<{ catalog?: AnalyticsCatalog | null }> = ({
  catalog: passedCatalog,
}) => {
  const { addToast } = useAppStore();
  const catalog = useAnalyticsCatalog(passedCatalog);
  const todayStr = useMemo(() => toDateInput(new Date()), []);
  const initialRange = useMemo(() => resolveRangeDates('30d', todayStr), [todayStr]);

  const [rangePreset, setRangePreset] = useState<AnalyticsRangePreset>('30d');
  const [granularity, setGranularity] = useState<AnalyticsGranularity>(initialRange.defaultGranularity);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [showComparison, setShowComparison] = useState(true);
  const [chartMetricMode, setChartMetricMode] = useState<'both' | 'views' | 'sessions'>('both');

  const [summary, setSummary] = useState<InboundAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [sourceTab, setSourceTab] = useState<SourceTabMode>('sources');
  const [deviceTab, setDeviceTab] = useState<DeviceTabMode>('devices');
  const [expandedDeviceClass, setExpandedDeviceClass] = useState<string | null>('tablet');
  const [contentTab, setContentTab] = useState<ContentTabMode>('landing');
  const [contentTypeFilter, setContentTypeFilter] = useState<'All' | AnalyticsContentType>('All');
  const [showPrivacyNote, setShowPrivacyNote] = useState(false);

  const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);
  const [detail, setDetail] = useState<InboundAnalyticsDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequest = useRef(0);

  const closeDetail = () => {
    detailRequest.current += 1;
    setDetailSelection(null);
    setDetail(null);
    setDetailError(null);
    setIsDetailLoading(false);
  };

  const loadRange = async (targetFrom: string, targetTo: string) => {
    if (!targetFrom || !targetTo || targetFrom > targetTo) {
      addToast({ message: 'Choose a valid analytics date range.', type: 'error' });
      return;
    }
    closeDetail();
    setIsLoading(true);
    try {
      const result = await getInboundAnalyticsSummary({ from: targetFrom, to: targetTo });
      setSummary(result);
    } catch (error) {
      addToast({
        message: error instanceof Error ? error.message : 'Unable to load inbound analytics.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRange(from, to);
  }, []);

  const handleSelectRangePreset = (preset: AnalyticsRangePreset) => {
    setRangePreset(preset);
    if (preset === 'custom') return;
    const resolved = resolveRangeDates(preset, todayStr, summary?.kpis?.firstRecordedDay);
    setFrom(resolved.from);
    setTo(resolved.to);
    setGranularity(resolved.defaultGranularity);
    void loadRange(resolved.from, resolved.to);
  };

  const openDetail = async (selection: DetailSelection) => {
    if (detailSelection?.key === selection.key) {
      closeDetail();
      return;
    }
    const request = ++detailRequest.current;
    setDetailError(null);
    setDetailSelection(selection);
    setDetail(null);
    setIsDetailLoading(true);
    try {
      const result = await getInboundAnalyticsDetail({
        from: summary?.from ?? from,
        to: summary?.to ?? to,
        ...selection.filter,
      });
      if (request === detailRequest.current) setDetail(result);
    } catch (error) {
      if (request === detailRequest.current) {
        setDetailError(
          error instanceof Error
            ? error.message
            : 'Unable to load details. Try collapsing and reopening this row.',
        );
      }
    } finally {
      if (request === detailRequest.current) setIsDetailLoading(false);
    }
  };

  const rangeMeta = useMemo(
    () => resolveRangeDates(rangePreset, todayStr, summary?.kpis?.firstRecordedDay),
    [rangePreset, todayStr, summary?.kpis?.firstRecordedDay],
  );

  const trendPoints = useMemo(() => {
    if (!summary) return [];
    const primaryIsSessions = chartMetricMode === 'sessions';
    return buildAnalyticsTrendPoints({
      from: summary.from || from,
      to: summary.to || to,
      granularity,
      daily: (summary.daily ?? []).map((d) => ({
        day: d.day,
        primary: primaryIsSessions ? d.sessions : (d.views ?? d.sessions),
        secondary: d.sessions,
      })),
      previousDaily: (summary.previousDaily ?? []).map((d) => ({
        day: d.day,
        primary: primaryIsSessions ? d.sessions : (d.views ?? d.sessions),
        secondary: d.sessions,
      })),
      hourly: (summary.hourly ?? []).map((h) => ({
        hour: h.hour,
        primary: primaryIsSessions ? h.sessions : (h.views ?? h.sessions),
        secondary: h.sessions,
      })),
    });
  }, [summary, from, to, granularity, chartMetricMode]);

  const totalSessions = summary?.totalSessions ?? 0;
  const totalViews = summary?.totalViews ?? totalSessions;
  const totalVisitors =
    summary?.totalUniqueVisitors ?? (summary as { uniqueVisitors?: number } | null)?.uniqueVisitors ?? totalSessions;
  const prevSessions = summary?.previousPeriod?.totalSessions ?? 0;
  const prevViews = summary?.previousPeriod?.totalViews ?? prevSessions;
  const prevVisitors =
    summary?.previousPeriod?.totalUniqueVisitors ??
    (summary?.previousPeriod as { uniqueVisitors?: number } | undefined)?.uniqueVisitors ??
    prevSessions;

  // Device + OS grouped structure for interactive drill-down
  const deviceBreakdowns = useMemo(() => {
    const rawDevices = summary?.byDevice ?? [];
    const rawDeviceOs = summary?.byDeviceOs ?? [];

    const order: Record<string, number> = { desktop: 0, mobile: 1, tablet: 2, unknown: 3 };
    const sortedDevices = [...rawDevices].sort(
      (a, b) => b.sessions - a.sessions || (order[a.deviceClass] ?? 9) - (order[b.deviceClass] ?? 9),
    );

    return sortedDevices.map((device) => {
      const matchingOs = rawDeviceOs
        .filter((item) => item.deviceClass === device.deviceClass)
        .sort((a, b) => b.sessions - a.sessions);

      const sumOs = matchingOs.reduce((acc, item) => acc + item.sessions, 0);
      const osRows = [...matchingOs];
      if (sumOs < device.sessions) {
        osRows.push({
          deviceClass: device.deviceClass,
          osFamily: 'unknown',
          sessions: device.sessions - sumOs,
        });
      }

      return {
        deviceClass: device.deviceClass,
        label: formatDeviceClass(device.deviceClass),
        sessions: device.sessions,
        osRows,
      };
    });
  }, [summary?.byDevice, summary?.byDeviceOs]);

  // Aggregate OS breakdown across all devices
  const overallOsRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of summary?.byDeviceOs ?? []) {
      const label = formatOsFamily(row.osFamily, row.deviceClass);
      map.set(label, (map.get(label) ?? 0) + row.sessions);
    }
    return Array.from(map.entries())
      .map(([label, sessions]) => ({ label, sessions }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [summary?.byDeviceOs]);

  // Unified Content / Landing Pages list with entity resolution
  const contentRows = useMemo(() => {
    const landingMap = new Map<string, number>();
    for (const l of summary?.byLanding ?? []) {
      landingMap.set(l.landingPath, l.sessions);
    }

    const pageViewMap = new Map<string, { views: number; uniqueSessions: number; entrySessions: number }>();
    for (const pv of summary?.byPageView ?? []) {
      pageViewMap.set(pv.pagePath, {
        views: pv.views,
        uniqueSessions: pv.uniqueSessions,
        entrySessions: pv.entrySessions,
      });
    }

    const allPaths = new Set<string>([...landingMap.keys(), ...pageViewMap.keys()]);
    const built = Array.from(allPaths).map((path) => {
      const landingCount = landingMap.get(path) ?? 0;
      const pv = pageViewMap.get(path);
      const entrySessions = Math.max(landingCount, pv?.entrySessions ?? 0);
      const views = Math.max(pv?.views ?? 0, entrySessions);
      const uniqueSessions = Math.max(pv?.uniqueSessions ?? 0, entrySessions);
      const resolved = resolveInternalRoute(path, catalog);

      return {
        path,
        resolved,
        views,
        uniqueSessions,
        entrySessions,
      };
    });

    const filtered =
      contentTypeFilter === 'All'
        ? built
        : built.filter((item) => item.resolved.entityType === contentTypeFilter);

    return filtered.sort((a, b) =>
      contentTab === 'landing'
        ? b.entrySessions - a.entrySessions || b.views - a.views
        : b.views - a.views || b.entrySessions - a.entrySessions,
    );
  }, [summary?.byLanding, summary?.byPageView, catalog, contentTypeFilter, contentTab]);

  const kpis = summary?.kpis;

  return (
    <div className="mx-auto max-w-[1500px] min-w-0 space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
              <Activity size={12} />
              Traffic & Growth
            </span>
            <button
              type="button"
              onClick={() => setShowPrivacyNote((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <ShieldCheck size={12} className="text-emerald-600" />
              Privacy-first attribution
              <Info size={11} className="text-slate-400" />
            </button>
          </div>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Inbound Analytics
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Monitor overall traffic growth, acquisition channels, device & OS usage, and the SwingSphere pages attracting visitors.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void loadRange(from, to)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh report
          </button>
        </div>
      </header>

      {showPrivacyNote ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs leading-5 text-indigo-950">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-indigo-600" />
              <p>
                <strong>Privacy-conscious instrumentation:</strong> SwingSphere records coarse source attribution, sanitized referrer paths (query strings and fragments removed), coarse OS/browser families, and Cloudflare country/region. No IP addresses, raw user-agent strings, or cross-site identifiers are stored. Historical dates prior to multi-page view tracking reflect 1 landing view per recorded entry session.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPrivacyNote(false)}
              className="rounded p-1 text-indigo-700 hover:bg-indigo-100"
              aria-label="Dismiss privacy note"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-xs">
          <LoaderCircle size={18} className="mr-2 animate-spin text-indigo-600" />
          Loading inbound analytics…
        </div>
      ) : summary ? (
        <>
          {/* ROW 1 — KPI SUMMARY */}
          <section
            aria-label="Traffic KPI overview"
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          >
            <KpiCard
              label="Views Today"
              value={formatNumber(kpis?.viewsToday ?? 0)}
              subValue={`${formatNumber(kpis?.sessionsToday ?? 0)} sessions today`}
              delta={
                <DeltaBadge
                  current={kpis?.viewsToday ?? 0}
                  previous={kpis?.viewsYesterday ?? 0}
                  suffix="vs yesterday"
                />
              }
              icon={<Eye size={14} className="text-indigo-600" />}
            />
            <KpiCard
              label="Views (7 Days)"
              value={formatNumber(kpis?.views7d ?? 0)}
              subValue={`${formatNumber(kpis?.sessions7d ?? 0)} sessions`}
              delta={
                <DeltaBadge
                  current={kpis?.views7d ?? 0}
                  previous={kpis?.viewsPrev7d ?? 0}
                  suffix="vs prior 7d"
                />
              }
              icon={<Activity size={14} className="text-indigo-600" />}
            />
            <KpiCard
              label="Views (30 Days)"
              value={formatNumber(kpis?.views30d ?? totalViews)}
              subValue={`${formatNumber(kpis?.sessions30d ?? totalSessions)} sessions`}
              delta={
                <DeltaBadge
                  current={kpis?.views30d ?? totalViews}
                  previous={kpis?.viewsPrev30d ?? prevViews}
                  suffix="vs prior 30d"
                />
              }
              icon={<Sparkles size={14} className="text-indigo-600" />}
            />
            <KpiCard
              label="All-Time Views"
              value={formatNumber(kpis?.viewsAllTime ?? totalViews)}
              subValue={`${formatNumber(kpis?.sessionsAllTime ?? totalSessions)} total sessions`}
              footnote={
                kpis?.firstRecordedDay
                  ? `Tracked since ${kpis.firstRecordedDay}`
                  : 'All recorded history'
              }
              icon={<Globe2 size={14} className="text-slate-600" />}
            />
            <KpiCard
              label="Sessions (Range)"
              value={formatNumber(totalSessions)}
              subValue={
                totalSessions > 0
                  ? `${(totalViews / Math.max(1, totalSessions)).toFixed(1)} views / session`
                  : 'Selected range'
              }
              delta={
                rangePreset !== 'all' ? (
                  <DeltaBadge
                    current={totalSessions}
                    previous={prevSessions}
                    suffix={rangeMeta.comparisonLabel}
                  />
                ) : undefined
              }
              emphasis
              icon={<Compass size={14} className="text-indigo-600" />}
            />
            <KpiCard
              label="Unique Visitors"
              value={formatNumber(totalVisitors)}
              subValue="Daily distinct visitors"
              delta={
                rangePreset !== 'all' ? (
                  <DeltaBadge
                    current={totalVisitors}
                    previous={prevVisitors}
                    suffix={rangeMeta.comparisonLabel}
                  />
                ) : undefined
              }
              icon={<Users size={14} className="text-violet-600" />}
            />
          </section>

          {/* ROW 2 — LARGE TRAFFIC TREND GRAPH */}
          <AnalyticsTrendChart
            title="Traffic & Growth Trend"
            subtitle="Track page views and visitor sessions over time, with automatic comparison against the preceding equivalent period."
            accentColor="indigo"
            points={trendPoints}
            primaryLabel={chartMetricMode === 'sessions' ? 'Sessions' : 'Page Views'}
            secondaryLabel={chartMetricMode === 'both' ? 'Sessions' : undefined}
            showSecondaryLine={chartMetricMode === 'both'}
            primaryTotal={chartMetricMode === 'sessions' ? totalSessions : totalViews}
            previousPrimaryTotal={chartMetricMode === 'sessions' ? prevSessions : prevViews}
            secondaryTotal={chartMetricMode === 'both' ? totalSessions : undefined}
            comparisonLabel={rangeMeta.comparisonLabel}
            rangePreset={rangePreset}
            onSelectRangePreset={handleSelectRangePreset}
            granularity={granularity}
            onSelectGranularity={setGranularity}
            showComparison={showComparison}
            onToggleComparison={setShowComparison}
            from={from}
            to={to}
            onChangeCustomRange={(nextFrom, nextTo) => {
              setFrom(nextFrom);
              setTo(nextTo);
            }}
            onApplyCustomRange={() => void loadRange(from, to)}
            headerRightExtra={
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                {[
                  { id: 'both', label: 'Views & Sessions' },
                  { id: 'views', label: 'Views' },
                  { id: 'sessions', label: 'Sessions' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setChartMetricMode(m.id as 'both' | 'views' | 'sessions')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      chartMetricMode === m.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            }
          />

          {/* Controlled Detail Modal (Never widens layout) */}
          {detailSelection ? (
            <AdminDetailDialog title={detailSelection.title} onClose={closeDetail}>
              {detailError ? (
                <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
                  {detailError}
                  <span className="ml-2">Close and reopen the details to retry.</span>
                </div>
              ) : (
                <InboundDetailPanel
                  selection={detailSelection}
                  detail={detail}
                  isLoading={isDetailLoading}
                  catalog={catalog}
                  onClose={closeDetail}
                />
              )}
            </AdminDetailDialog>
          ) : null}

          {/* ROW 3 — TRAFFIC SOURCES & DEVICE BREAKDOWN */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Traffic Sources (7 cols) */}
            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs xl:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Traffic Sources</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Where visitors originate before arriving on SwingSphere. Click any source to inspect paths & arrivals.
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setSourceTab('sources')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      sourceTab === 'sources'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Channels ({summary.bySource?.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceTab('referrers')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      sourceTab === 'referrers'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Referring Domains ({summary.byReferrer?.length ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceTab('campaigns')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      sourceTab === 'campaigns'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    UTM / Campaigns ({summary.byCampaign?.length ?? 0})
                  </button>
                </div>
              </div>

              {sourceTab === 'sources' ? (
                !summary.bySource?.length ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No inbound traffic sources recorded in this range.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-0 text-left text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Source</th>
                          <th className="hidden px-3 py-3 text-right sm:table-cell">Visitors</th>
                          <th className="px-3 py-3 text-right">Sessions</th>
                          <th className="hidden px-3 py-3 text-right md:table-cell">Views</th>
                          <th className="px-5 py-3 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.bySource.map((row) => {
                          const key = 'bySource:' + JSON.stringify({
                            sourceCategory: row.sourceCategory,
                            sourceName: row.sourceName,
                            sessions: row.sessions,
                          });
                          const expanded = detailSelection?.key === key;
                          const label = formatInboundSourceName(row.sourceName);
                          const categoryLabel = formatInboundSourceCategory(row.sourceCategory);
                          const sharePct = totalSessions > 0 ? (row.sessions / totalSessions) * 100 : 0;
                          const extHref =
                            row.sourceCategory === 'referral' ? referrerDomainHref(row.sourceName) : null;

                          return (
                            <tr
                              key={key}
                              className={`transition ${expanded ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}
                            >
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    aria-haspopup="dialog"
                                    aria-expanded={expanded}
                                    onClick={() =>
                                      void openDetail({
                                        key,
                                        title: label,
                                        description:
                                          row.sourceCategory === 'direct'
                                            ? 'Direct arrivals have no browser referrer or UTM tags (typed URLs, bookmarks, messaging apps, or privacy-protected browsers).'
                                            : `Inbound sessions and entry pages attributed to ${label} (${categoryLabel}).`,
                                        filter: {
                                          sourceCategory: row.sourceCategory,
                                          sourceName: row.sourceName,
                                        },
                                      })
                                    }
                                    className="group flex min-w-0 flex-1 items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                                  >
                                    <span className="min-w-0">
                                      <span className="flex items-center gap-1.5 font-semibold text-slate-900 group-hover:text-indigo-600">
                                        <span className="truncate">{label}</span>
                                        <ChevronRight
                                          size={14}
                                          className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                                        />
                                      </span>
                                      <span className="mt-0.5 block text-xs text-slate-500">
                                        {row.sourceCategory === 'direct'
                                          ? 'Direct / untagged entry'
                                          : categoryLabel}
                                      </span>
                                    </span>
                                  </button>
                                  {extHref ? (
                                    <a
                                      href={extHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={`Open ${row.sourceName} in a new tab`}
                                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                                    >
                                      <ExternalLink size={13} />
                                    </a>
                                  ) : null}
                                </div>
                              </td>
                              <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 sm:table-cell">
                                {formatNumber(row.visitors ?? row.sessions)}
                              </td>
                              <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-900">
                                {formatNumber(row.sessions)}
                              </td>
                              <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 md:table-cell">
                                {formatNumber(row.views ?? row.sessions)}
                              </td>
                              <td className="w-32 px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="w-12 text-xs font-semibold tabular-nums text-slate-700">
                                    {formatPercent(row.sessions, totalSessions)}
                                  </span>
                                  <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 sm:block">
                                    <div
                                      className="h-full rounded-full bg-indigo-600"
                                      style={{ width: `${Math.min(100, Math.max(4, sharePct))}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : sourceTab === 'referrers' ? (
                !summary.byReferrer?.length ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No external referring domains recorded in this range.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-0 text-left text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Referring Domain</th>
                          <th className="px-3 py-3 text-right">Sessions</th>
                          <th className="px-5 py-3 text-right">% of Traffic</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.byReferrer.map((row) => {
                          const key = 'byReferrer:' + JSON.stringify(row);
                          const expanded = detailSelection?.key === key;
                          const extHref = referrerDomainHref(row.referrerDomain);
                          const sharePct = totalSessions > 0 ? (row.sessions / totalSessions) * 100 : 0;

                          return (
                            <tr
                              key={key}
                              className={`transition ${expanded ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}
                            >
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    aria-haspopup="dialog"
                                    aria-expanded={expanded}
                                    onClick={() =>
                                      void openDetail({
                                        key,
                                        title: friendlyReferrerName(row.referrerDomain),
                                        description:
                                          'Exact source paths appear when the referring browser or app supplies them. Click any landing page inside to open it.',
                                        filter: { referrerDomain: row.referrerDomain },
                                        referrerDomain: row.referrerDomain,
                                      })
                                    }
                                    className="group flex min-w-0 flex-1 items-center gap-1.5 text-left font-semibold text-slate-900 hover:text-indigo-600"
                                  >
                                    <span className="truncate">
                                      {friendlyReferrerName(row.referrerDomain)}
                                    </span>
                                    <ChevronRight
                                      size={14}
                                      className="shrink-0 text-slate-400 group-hover:text-indigo-600"
                                    />
                                  </button>
                                  {extHref ? (
                                    <a
                                      href={extHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={`Visit ${row.referrerDomain}`}
                                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                                    >
                                      <ExternalLink size={13} />
                                    </a>
                                  ) : null}
                                </div>
                                <div className="mt-0.5 text-xs text-slate-500">
                                  {row.referrerDomain} · click to inspect referrer paths
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-900">
                                {formatNumber(row.sessions)}
                              </td>
                              <td className="w-32 px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="w-12 text-xs font-semibold tabular-nums text-slate-700">
                                    {formatPercent(row.sessions, totalSessions)}
                                  </span>
                                  <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 sm:block">
                                    <div
                                      className="h-full rounded-full bg-indigo-600"
                                      style={{ width: `${Math.min(100, Math.max(4, sharePct))}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : !summary.byCampaign?.length ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No UTM or SwingSphere campaign parameters recorded in this range.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-0 text-left text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Campaign</th>
                        <th className="px-3 py-3">Source / Medium</th>
                        <th className="px-5 py-3 text-right">Sessions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.byCampaign.map((row, idx) => (
                        <tr key={`${row.campaignKey}-${row.utmCampaign}-${idx}`} className="hover:bg-slate-50">
                          <td className="px-5 py-3">
                            <div className="font-semibold text-slate-900">
                              {row.utmCampaign || row.campaignKey || 'Tagged Campaign'}
                            </div>
                            {row.campaignKey && row.utmCampaign && row.campaignKey !== row.utmCampaign ? (
                              <div className="text-xs text-slate-500">{row.campaignKey}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600">
                            {[row.utmSource, row.utmMedium].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td className="px-5 py-3 text-right font-bold tabular-nums text-indigo-700">
                            {formatNumber(row.sessions)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Device, OS & Browser Breakdown (5 cols) */}
            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs xl:col-span-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Devices & Platforms</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Click a device class to drill down into iOS, iPadOS, Android, Windows, or macOS.
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setDeviceTab('devices')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      deviceTab === 'devices'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    By Device
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceTab('os')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      deviceTab === 'os'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All OS
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceTab('browsers')}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      deviceTab === 'browsers'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Browsers
                  </button>
                </div>
              </div>

              {deviceTab === 'devices' ? (
                !deviceBreakdowns.length ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No device data in this range.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {deviceBreakdowns.map((device) => {
                      const isExpanded = expandedDeviceClass === device.deviceClass;
                      const sharePct =
                        totalSessions > 0 ? (device.sessions / totalSessions) * 100 : 0;

                      return (
                        <div key={device.deviceClass} className="min-w-0">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedDeviceClass((curr) =>
                                curr === device.deviceClass ? null : device.deviceClass,
                              )
                            }
                            className={`flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition ${
                              isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-2xs">
                                <DeviceIcon deviceClass={device.deviceClass} />
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                                  <span>{device.label}</span>
                                  {isExpanded ? (
                                    <ChevronDown size={14} className="text-slate-400" />
                                  ) : (
                                    <ChevronRight size={14} className="text-slate-400" />
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Click to inspect {device.label.toLowerCase()} operating systems
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                              <div className="text-right">
                                <div className="font-bold tabular-nums text-slate-900">
                                  {formatNumber(device.sessions)}
                                </div>
                                <div className="text-[11px] font-medium tabular-nums text-slate-500">
                                  {formatPercent(device.sessions, totalSessions)}
                                </div>
                              </div>
                              <div className="hidden h-2 w-16 overflow-hidden rounded-full bg-slate-100 sm:block">
                                <div
                                  className="h-full rounded-full bg-indigo-600"
                                  style={{ width: `${Math.min(100, Math.max(4, sharePct))}%` }}
                                />
                              </div>
                            </div>
                          </button>

                          {isExpanded ? (
                            <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                <span>{device.label} OS Breakdown</span>
                                <span>Sessions · Share of {device.label}</span>
                              </div>
                              <div className="space-y-2">
                                {device.osRows.map((osRow) => {
                                  const osLabel = formatOsFamily(
                                    osRow.osFamily,
                                    device.deviceClass,
                                  );
                                  const withinDevicePct =
                                    device.sessions > 0
                                      ? (osRow.sessions / device.sessions) * 100
                                      : 0;
                                  return (
                                    <div
                                      key={`${device.deviceClass}-${osRow.osFamily}`}
                                      className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs shadow-2xs"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-slate-800">
                                          {osLabel}
                                        </span>
                                        <span className="font-bold tabular-nums text-slate-900">
                                          {formatNumber(osRow.sessions)}{' '}
                                          <span className="font-normal text-slate-500">
                                            ({formatPercent(osRow.sessions, device.sessions)})
                                          </span>
                                        </span>
                                      </div>
                                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                        <div
                                          className="h-full rounded-full bg-violet-500"
                                          style={{
                                            width: `${Math.min(100, Math.max(3, withinDevicePct))}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : deviceTab === 'os' ? (
                !overallOsRows.length ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No OS breakdown recorded in this range.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {overallOsRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                      >
                        <span className="font-semibold text-slate-800">{row.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold tabular-nums text-slate-900">
                            {formatNumber(row.sessions)}
                          </span>
                          <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                            {formatPercent(row.sessions, totalSessions)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : !summary.byBrowser?.length ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Browser family attribution is active for new sessions going forward.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {summary.byBrowser.map((row) => (
                    <div
                      key={row.browserFamily}
                      className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                    >
                      <span className="font-semibold text-slate-800">
                        {formatBrowserFamily(row.browserFamily)}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-bold tabular-nums text-slate-900">
                          {formatNumber(row.sessions)}
                        </span>
                        <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                          {formatPercent(row.sessions, totalSessions)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ROW 4 — TOP LANDING PAGES & MOST VIEWED CONTENT */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Top Content & Entry Pages
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {contentTab === 'landing'
                    ? 'Landing Pages show where visitors first entered SwingSphere. Click any page title to open it in a new tab.'
                    : 'Most Viewed Pages rank all SwingSphere pages by total views across sessions.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setContentTab('landing')}
                    className={`rounded-lg px-3 py-1 font-semibold transition ${
                      contentTab === 'landing'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Top Landing Pages (Entries)
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentTab('views')}
                    className={`rounded-lg px-3 py-1 font-semibold transition ${
                      contentTab === 'views'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Most Viewed Pages (Total Views)
                  </button>
                </div>
              </div>
            </div>

            {/* Entity Type Filter Bar */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/50 px-5 py-2.5">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Type:
              </span>
              {CONTENT_TYPE_FILTERS.map((typeOption) => {
                const active = contentTypeFilter === typeOption;
                return (
                  <button
                    key={typeOption}
                    type="button"
                    onClick={() => setContentTypeFilter(typeOption)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {typeOption}
                  </button>
                );
              })}
            </div>

            {!contentRows.length ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No matching SwingSphere pages recorded in this range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-0 text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Page / SwingSphere Entity</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3 text-right">Total Views</th>
                      <th className="hidden px-3 py-3 text-right sm:table-cell">Sessions</th>
                      <th className="px-5 py-3 text-right">Entry Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contentRows.slice(0, 30).map((row) => {
                      const shareDenom =
                        contentTab === 'landing'
                          ? Math.max(1, totalSessions)
                          : Math.max(1, totalViews);
                      const metricForShare =
                        contentTab === 'landing' ? row.entrySessions : row.views;
                      const sharePct = (metricForShare / shareDenom) * 100;

                      return (
                        <tr key={row.path} className="transition hover:bg-slate-50">
                          <td className="max-w-[380px] px-5 py-3">
                            <ClickableInternalPageCell path={row.path} catalog={catalog} />
                          </td>
                          <td className="px-3 py-3">
                            <EntityTypeBadge type={row.resolved.entityType} />
                          </td>
                          <td
                            className={`px-3 py-3 text-right tabular-nums ${
                              contentTab === 'views'
                                ? 'font-bold text-indigo-700'
                                : 'font-semibold text-slate-800'
                            }`}
                          >
                            {formatNumber(row.views)}
                          </td>
                          <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 sm:table-cell">
                            {formatNumber(row.uniqueSessions)}
                          </td>
                          <td className="w-40 px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2.5">
                              <span
                                className={`tabular-nums ${
                                  contentTab === 'landing'
                                    ? 'font-bold text-indigo-700'
                                    : 'font-semibold text-slate-800'
                                }`}
                              >
                                {formatNumber(row.entrySessions)}
                              </span>
                              <span className="w-11 text-right text-xs tabular-nums text-slate-400">
                                {formatPercent(metricForShare, shareDenom)}
                              </span>
                              <div className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-slate-100 md:block">
                                <div
                                  className="h-full rounded-full bg-indigo-600"
                                  style={{ width: `${Math.min(100, Math.max(4, sharePct))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ROW 5 — GEOGRAPHY (COUNTRIES & REGIONS) */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-bold text-slate-900">Top Countries</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Coarse country-level visitor distribution from the Cloudflare edge.
                </p>
              </div>
              {!summary.byCountry?.length ? (
                <div className="p-6 text-sm text-slate-500">No country data in this range.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {summary.byCountry.slice(0, 12).map((row) => {
                    const sharePct = totalSessions > 0 ? (row.sessions / totalSessions) * 100 : 0;
                    return (
                      <div
                        key={row.countryCode || 'unknown'}
                        className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900">
                            {row.countryCode || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold tabular-nums text-slate-900">
                            {formatNumber(row.sessions)}
                          </span>
                          <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                            {formatPercent(row.sessions, totalSessions)}
                          </span>
                          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${Math.min(100, Math.max(4, sharePct))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-bold text-slate-900">Top Regions / States</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Regional concentration of inbound sessions.
                </p>
              </div>
              {!summary.byRegion?.length ? (
                <div className="p-6 text-sm text-slate-500">No regional data in this range.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {summary.byRegion.slice(0, 12).map((row, idx) => {
                    const sharePct = totalSessions > 0 ? (row.sessions / totalSessions) * 100 : 0;
                    return (
                      <div
                        key={`${row.countryCode}-${row.regionCode}-${row.regionName}-${idx}`}
                        className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900">
                            {row.regionName || row.regionCode || 'Unknown'}
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            {[row.regionCode, row.countryCode].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold tabular-nums text-slate-900">
                            {formatNumber(row.sessions)}
                          </span>
                          <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                            {formatPercent(row.sessions, totalSessions)}
                          </span>
                          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${Math.min(100, Math.max(4, sharePct))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  subValue?: string;
  footnote?: string;
  delta?: React.ReactNode;
  icon?: React.ReactNode;
  emphasis?: boolean;
}> = ({ label, value, subValue, footnote, delta, icon, emphasis = false }) => (
  <div
    className={`flex min-w-0 flex-col justify-between rounded-2xl border p-4 shadow-xs ${
      emphasis
        ? 'border-indigo-200 bg-indigo-50/40'
        : 'border-slate-200/90 bg-white'
    }`}
  >
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span className="truncate">{label}</span>
        {icon}
      </div>
      <div
        className={`mt-1.5 text-2xl font-black tracking-tight tabular-nums ${
          emphasis ? 'text-indigo-700' : 'text-slate-950'
        }`}
      >
        {value}
      </div>
      {subValue ? <div className="mt-0.5 text-xs text-slate-500">{subValue}</div> : null}
    </div>
    {delta ? <div className="mt-2.5">{delta}</div> : null}
    {footnote ? <div className="mt-2 text-[11px] text-slate-400">{footnote}</div> : null}
  </div>
);

const InboundDetailPanel: React.FC<{
  selection: DetailSelection;
  detail: InboundAnalyticsDetail | null;
  isLoading: boolean;
  catalog: AnalyticsCatalog | null;
  onClose: () => void;
}> = ({ selection, detail, isLoading, catalog, onClose }) => (
  <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-xs">
    <div className="flex items-start justify-between gap-4 border-b border-indigo-100 bg-indigo-50/70 px-5 py-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
          Source Acquisition Detail
        </p>
        <h2 className="mt-1 text-xl font-black text-slate-900">{selection.title}</h2>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{selection.description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900"
        aria-label="Close source detail"
      >
        <X size={18} />
      </button>
    </div>

    {isLoading ? (
      <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">
        <LoaderCircle size={17} className="mr-2 animate-spin text-indigo-600" />
        Loading source detail…
      </div>
    ) : detail ? (
      <div className="space-y-6 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Sessions in range
            </div>
            <div className="mt-1 text-2xl font-black tabular-nums text-slate-900">
              {formatNumber(detail.totalSessions)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Raw-detail retention
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-700">
              Recent session rows are kept for {detail.rawRetentionDays || 90} days. Aggregate counts remain available longer.
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-900">Exact referrer paths</h3>
              <p className="mt-1 text-xs text-slate-500">
                Available when the referring site or app sends a path. Query strings and fragments are stripped.
              </p>
            </div>
            {!detail.topReferrerPaths?.length ? (
              <div className="p-4 text-sm leading-6 text-slate-500">
                No exact path was supplied for these visits. Many social apps and browsers send origin-only referrer headers.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.topReferrerPaths.map((row, index) => {
                  const domain =
                    selection.referrerDomain
                    || detail.recentSessions?.find((session) => session.referrerPath === row.referrerPath)
                      ?.referrerDomain
                    || '';
                  const sourceUrl = sourceUrlFor(domain, row.referrerPath);
                  return (
                    <div
                      key={`${row.referrerPath}-${index}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="break-all text-sm font-semibold text-slate-900">
                          {normalizeReferrerPathForDisplay(domain, row.referrerPath)}
                        </div>
                        {domain ? (
                          <div className="mt-0.5 text-xs text-slate-500">
                            {friendlyReferrerName(domain)}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-bold tabular-nums text-indigo-700">
                          {formatNumber(row.sessions)}
                        </span>
                        {sourceUrl ? (
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-700"
                            aria-label="Open referring source"
                          >
                            <ExternalLink size={15} />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-900">Landing pages from this source</h3>
              <p className="mt-1 text-xs text-slate-500">
                Click any SwingSphere entry page to open it in a new tab.
              </p>
            </div>
            {!detail.topLandings?.length ? (
              <div className="p-4 text-sm text-slate-500">No landing-page data.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.topLandings.slice(0, 12).map((row, index) => (
                  <div
                    key={`${row.landingPath}-${index}`}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <ClickableInternalPageCell path={row.landingPath} catalog={catalog} compact />
                    <span className="shrink-0 text-sm font-bold tabular-nums text-indigo-700">
                      {formatNumber(row.sessions)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="font-bold text-slate-900">Campaigns for this source</h3>
            <p className="mt-1 text-xs text-slate-500">
              Tagged links identify the specific post or promotion even when an app supplies only its domain.
            </p>
          </div>
          {!detail.campaigns?.length ? (
            <div className="p-4 text-sm text-slate-500">
              No campaign tags were recorded for this source.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {detail.campaigns.map((row, index) => (
                <div key={index} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="break-all text-sm font-semibold text-slate-900">
                      {row.utmCampaign || row.campaignKey || 'Unnamed campaign'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {[row.utmSource, row.utmMedium, row.campaignKey].filter(Boolean).join(' · ')
                        || 'No source / medium supplied'}
                    </div>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums text-indigo-700">
                    {formatNumber(row.sessions)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="font-bold text-slate-900">Recent arrivals</h3>
            <p className="mt-1 text-xs text-slate-500">
              Session-level detail retained temporarily for acquisition debugging. No IP address or raw user-agent string is stored.
            </p>
          </div>
          {!detail.recentSessions?.length ? (
            <div className="p-4 text-sm text-slate-500">
              No raw session rows remain for this selection. Older aggregate totals may still be shown above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Arrived</th>
                    <th className="px-4 py-3">Source detail</th>
                    <th className="px-4 py-3">Landing Page</th>
                    <th className="px-4 py-3">Device / OS / Region</th>
                    <th className="px-4 py-3">Campaign</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.recentSessions.map((session, index) => {
                    const sourceUrl = sourceUrlFor(session.referrerDomain, session.referrerPath);
                    const osPart =
                      session.osFamily && session.osFamily !== 'unknown'
                        ? formatOsFamily(session.osFamily, session.deviceClass)
                        : null;
                    return (
                      <tr key={`${session.occurredAt}-${index}`}>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                          {new Date(session.occurredAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {formatInboundSourceName(session.sourceName)}
                          </div>
                          {session.referrerDomain ? (
                            <div className="text-xs text-slate-500">
                              {friendlyReferrerName(session.referrerDomain)}
                            </div>
                          ) : null}
                          {session.referrerPath ? (
                            <div className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                              <span className="max-w-[260px] break-all">
                                {normalizeReferrerPathForDisplay(
                                  session.referrerDomain,
                                  session.referrerPath,
                                )}
                              </span>
                              {sourceUrl ? (
                                <a
                                  href={sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 text-indigo-600"
                                  aria-label="Open referring source"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-400">
                              {session.referrerDomain
                                ? 'Domain only'
                                : 'No referrer supplied'}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[260px] px-4 py-3">
                          <ClickableInternalPageCell
                            path={session.landingPath}
                            catalog={catalog}
                            compact
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {[
                            formatDeviceClass(session.deviceClass),
                            osPart,
                            session.regionName || session.regionCode,
                            session.countryCode,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {session.utmCampaign
                            || session.campaignKey
                            || [session.utmSource, session.utmMedium].filter(Boolean).join(' / ')
                            || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    ) : null}
  </section>
);

export default AdminInboundAnalytics;
