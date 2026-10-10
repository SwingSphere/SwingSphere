import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  Globe,
  Info,
  Layers,
  LoaderCircle,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import {
  getOutboundAnalyticsDetail,
  getOutboundAnalyticsSummary,
  type OutboundAnalyticsDetail,
  type OutboundAnalyticsDetailFilter,
  type OutboundAnalyticsSummary,
} from '../../lib/analytics/outboundReports';
import type { OutboundEntityType } from '../../lib/analytics/outboundTracking';
import {
  classifyOutboundDestination,
  resolveAnalyticsEntity,
  type AnalyticsCatalog,
  type OutboundCategoryKey,
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
  DestinationCategoryBadge,
  EntityTypeBadge,
} from './charts/AnalyticsTrendChart';
import AdminDetailDialog from './AdminDetailDialog';
import { useAppStore } from '../../store/appStore';

const formatNumber = (value?: number): string => new Intl.NumberFormat('en-US').format(value ?? 0);

const formatPercent = (part: number, total: number): string => {
  if (!total || part <= 0) return '0.0%';
  const pct = (part / total) * 100;
  return `${pct.toFixed(1)}%`;
};

const entityTypes: Array<{ value: '' | OutboundEntityType; label: string }> = [
  { value: '', label: 'All entity types' },
  { value: 'club', label: 'Clubs' },
  { value: 'event', label: 'Events' },
  { value: 'event_series', label: 'Event series' },
  { value: 'venue', label: 'Venues' },
  { value: 'organization', label: 'Organizations / Hosts' },
  { value: 'resort', label: 'Resorts' },
  { value: 'cruise_series', label: 'Cruise series' },
  { value: 'cruise_sailing', label: 'Cruise sailings' },
  { value: 'profile', label: 'Profiles' },
];

const CATEGORY_FILTER_OPTIONS: Array<{ key: 'all' | OutboundCategoryKey; label: string }> = [
  { key: 'all', label: 'All Categories' },
  { key: 'ticket', label: 'Ticket / Event Info' },
  { key: 'website', label: 'Official Website' },
  { key: 'social', label: 'Social Platform' },
  { key: 'rsvp', label: 'RSVP / Guestlist' },
  { key: 'booking', label: 'Booking' },
  { key: 'directions', label: 'Maps & Directions' },
  { key: 'calendar', label: 'Calendar' },
];

type DetailSelection = {
  key: string;
  title: string;
  description: string;
  filter: Omit<OutboundAnalyticsDetailFilter, 'from' | 'to'>;
};

const ClickableEntityCell: React.FC<{
  entityType: string;
  entityId: string;
  catalog: AnalyticsCatalog | null;
  showBadge?: boolean;
}> = ({ entityType, entityId, catalog, showBadge = true }) => {
  const resolved = useMemo(
    () => resolveAnalyticsEntity(entityType, entityId, catalog),
    [entityType, entityId, catalog],
  );

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {resolved.href ? (
          <a
            href={resolved.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Open ${resolved.title} on SwingSphere in a new tab`}
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
        {showBadge ? <EntityTypeBadge type={resolved.entityType} /> : null}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
        {resolved.subtitle ? (
          <span className="truncate">{resolved.subtitle}</span>
        ) : (
          <span className="truncate font-mono text-slate-400">
            {entityType.replaceAll('_', ' ')} · {entityId}
          </span>
        )}
      </div>
    </div>
  );
};

const AdminOutboundAnalytics: React.FC<{ catalog?: AnalyticsCatalog | null }> = ({
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
  const [chartMetricMode, setChartMetricMode] = useState<'both' | 'qualified' | 'total'>('both');

  // Optional entity/campaign filters
  const [showFilters, setShowFilters] = useState(false);
  const [entityType, setEntityType] = useState<'' | OutboundEntityType>('');
  const [entityId, setEntityId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [campaignKey, setCampaignKey] = useState('');

  // Section tabs & category filter
  const [categoryFilter, setCategoryFilter] = useState<'all' | OutboundCategoryKey>('all');
  const [domainViewMode, setDomainViewMode] = useState<'domains' | 'links'>('domains');
  const [showSponsorGuidance, setShowSponsorGuidance] = useState(false);

  const [summary, setSummary] = useState<OutboundAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);
  const [detail, setDetail] = useState<OutboundAnalyticsDetail | null>(null);
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
      const next = await getOutboundAnalyticsSummary({
        from: targetFrom,
        to: targetTo,
        entityType: entityType || undefined,
        entityId: entityId.trim() || undefined,
        organizationId: organizationId.trim() || undefined,
        campaignKey: campaignKey.trim() || undefined,
      });
      setSummary(next);
    } catch (error) {
      addToast({
        message: error instanceof Error ? error.message : 'Unable to load outbound analytics.',
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
    const resolved = resolveRangeDates(
      preset,
      todayStr,
      summary?.kpis?.firstRecordedDay ?? null,
    );
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
      const result = await getOutboundAnalyticsDetail({
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
            : 'Unable to load details. Try closing and reopening this row.',
        );
      }
    } finally {
      if (request === detailRequest.current) setIsDetailLoading(false);
    }
  };

  // Build chart trend points
  const trendPoints = useMemo(() => {
    if (!summary) return [];
    const currentDaily = (summary.daily ?? []).map((d) => ({
      day: d.day,
      primary: d.qualifiedClicks ?? 0,
      secondary: d.totalClicks ?? 0,
    }));
    const prevDaily = (summary.previousDaily ?? []).map((d) => ({
      day: d.day,
      primary: d.qualifiedClicks ?? 0,
      secondary: d.totalClicks ?? 0,
    }));
    const hourly = (summary.hourly ?? []).map((h) => ({
      hour: h.hour,
      primary: h.qualifiedClicks ?? 0,
      secondary: h.totalClicks ?? 0,
    }));

    return buildAnalyticsTrendPoints({
      from: summary.from || from,
      to: summary.to || to,
      granularity,
      daily: currentDaily,
      previousDaily: prevDaily,
      hourly,
    });
  }, [summary, from, to, granularity]);

  const qualifiedRate = summary?.totalClicks
    ? Math.round((summary.qualifiedClicks / summary.totalClicks) * 1000) / 10
    : 0;

  // Derived top listing & top external domain
  const topEntity = useMemo(() => {
    const first = summary?.byEntity?.[0];
    if (!first) return null;
    return {
      ...first,
      resolved: resolveAnalyticsEntity(first.entityType, first.entityId, catalog),
    };
  }, [summary?.byEntity, catalog]);

  const topDomain = useMemo(() => {
    const firstDomain = summary?.byDomain?.[0];
    if (firstDomain) {
      return {
        domain: firstDomain.destinationDomain,
        qualifiedClicks: firstDomain.qualifiedClicks,
        totalClicks: firstDomain.totalClicks,
        classified: classifyOutboundDestination(
          firstDomain.destinationType,
          firstDomain.destinationDomain,
          '',
        ),
      };
    }
    const firstLink = summary?.byLink?.[0];
    if (!firstLink) return null;
    return {
      domain: firstLink.destinationDomain,
      qualifiedClicks: firstLink.qualifiedClicks,
      totalClicks: firstLink.totalClicks,
      classified: classifyOutboundDestination(
        firstLink.destinationType,
        firstLink.destinationDomain,
        firstLink.destinationPath,
      ),
    };
  }, [summary?.byDomain, summary?.byLink]);

  // Listing -> Destination -> Clicks enriched rows
  const entityDestinationRows = useMemo(() => {
    const rawRows = summary?.byEntityDestination ?? [];
    const enriched = rawRows.map((row) => {
      const entity = resolveAnalyticsEntity(row.entityType, row.entityId, catalog);
      const destination = classifyOutboundDestination(
        row.destinationType,
        row.destinationDomain,
        row.destinationPath,
      );
      return {
        ...row,
        entity,
        destination,
      };
    });

    if (categoryFilter === 'all') return enriched;
    return enriched.filter((row) => row.destination.categoryKey === categoryFilter);
  }, [summary?.byEntityDestination, catalog, categoryFilter]);

  const activeFiltersCount = [entityType, entityId.trim(), organizationId.trim(), campaignKey.trim()].filter(
    Boolean,
  ).length;

  const kpis = summary?.kpis;

  return (
    <div className="min-w-0 max-w-full space-y-6 pb-10">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
              <MousePointerClick size={12} /> Commercial Attribution
            </span>
            <button
              type="button"
              onClick={() => setShowSponsorGuidance((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            >
              <ShieldCheck size={12} className="text-emerald-600" />
              Sponsor-safe guidelines
            </button>
          </div>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Outbound Analytics
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Understand where SwingSphere visitors go after engaging with clubs, events, hosts, and travel listings—across ticket providers, official websites, socials, RSVP links, and maps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-sm transition ${
              showFilters || activeFiltersCount > 0
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter size={14} />
            Filters
            {activeFiltersCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-indigo-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {activeFiltersCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => void loadRange(from, to)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
            Refresh
          </button>
        </div>
      </div>

      {/* Collapsible Sponsor Guidance */}
      {showSponsorGuidance ? (
        <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-4 text-xs leading-relaxed text-indigo-950">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-indigo-600" />
              <div>
                <span className="font-bold">Sponsor-safe reporting:</span> Share aggregate qualified clicks, destination categories, placements, and session counts. Never share individual user click histories or account identifiers.
                {summary ? (
                  <p className="mt-1.5 rounded-lg bg-white/80 px-3 py-2 text-slate-700 ring-1 ring-indigo-200/60">
                    <strong>Recommended wording:</strong> “From {summary.from} through {summary.to}, SwingSphere generated{' '}
                    <strong>{formatNumber(summary.qualifiedClicks)} qualified outbound clicks</strong> ({formatNumber(summary.totalClicks)} total) to external ticketing, RSVP, booking, and official partner destinations.”
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSponsorGuidance(false)}
              className="rounded-lg p-1 text-indigo-500 hover:bg-indigo-100"
              aria-label="Dismiss sponsor guidance"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Collapsible Entity / Campaign Filter Drawer */}
      {showFilters ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Filter Outbound Attribution
            </h2>
            {activeFiltersCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setEntityType('');
                  setEntityId('');
                  setOrganizationId('');
                  setCampaignKey('');
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold text-slate-600">
              Entity type
              <select
                value={entityType}
                onChange={(event) => setEntityType(event.target.value as '' | OutboundEntityType)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                {entityTypes.map((item) => (
                  <option key={item.value || 'all'} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Entity ID
              <input
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                placeholder="Optional exact ID"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Organization ID
              <input
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                placeholder="Optional host / org ID"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Campaign key
              <input
                value={campaignKey}
                onChange={(event) => setCampaignKey(event.target.value)}
                placeholder="Optional campaign key"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void loadRange(from, to)}
                className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ROW 1 — Top-Level Outbound KPIs */}
      <section aria-label="Outbound key metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Clicks Today"
          value={formatNumber(kpis?.qualifiedToday ?? 0)}
          deltaCurrent={kpis?.qualifiedToday ?? 0}
          deltaPrevious={kpis?.qualifiedYesterday ?? 0}
          sublabel={`${formatNumber(kpis?.clicksToday ?? 0)} total · vs yesterday`}
        />
        <KpiCard
          label="Clicks (7 Days)"
          value={formatNumber(kpis?.qualified7d ?? summary?.qualifiedClicks ?? 0)}
          deltaCurrent={kpis?.qualified7d ?? 0}
          deltaPrevious={kpis?.qualifiedPrev7d ?? 0}
          sublabel={`${formatNumber(kpis?.clicks7d ?? summary?.totalClicks ?? 0)} total · vs prior 7d`}
        />
        <KpiCard
          label="Clicks (30 Days)"
          value={formatNumber(kpis?.qualified30d ?? summary?.qualifiedClicks ?? 0)}
          deltaCurrent={kpis?.qualified30d ?? 0}
          deltaPrevious={kpis?.qualifiedPrev30d ?? 0}
          sublabel={`${formatNumber(kpis?.clicks30d ?? summary?.totalClicks ?? 0)} total · vs prior 30d`}
          accent
        />
        <KpiCard
          label="All-Time Clicks"
          value={formatNumber(kpis?.qualifiedAllTime ?? summary?.qualifiedClicks ?? 0)}
          sublabel={`${formatNumber(kpis?.clicksAllTime ?? summary?.totalClicks ?? 0)} total · ${qualifiedRate}% qualified`}
        />
        <KpiCard
          label="Unique Destinations"
          value={formatNumber(summary?.uniqueDestinations ?? summary?.byLink?.length ?? 0)}
          sublabel={`${formatNumber(summary?.uniqueDomains ?? summary?.byDomain?.length ?? 0)} external domains`}
        />

        {/* Most-Clicked Listing / Domain Spotlight Card */}
        <div className="col-span-2 flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:col-span-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Top Clicked Listing
            </span>
            {topEntity ? <EntityTypeBadge type={topEntity.resolved.entityType} /> : null}
          </div>
          {topEntity ? (
            <div className="mt-2 min-w-0">
              {topEntity.resolved.href ? (
                <a
                  href={topEntity.resolved.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex max-w-full items-center gap-1 text-base font-black text-slate-900 hover:text-indigo-600 hover:underline"
                  title={`Open ${topEntity.resolved.title} in new tab`}
                >
                  <span className="truncate">{topEntity.resolved.title}</span>
                  <ArrowUpRight size={14} className="shrink-0 text-slate-400 group-hover:text-indigo-600" />
                </a>
              ) : (
                <div className="truncate text-base font-black text-slate-900">
                  {topEntity.resolved.title}
                </div>
              )}
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="shrink-0">{formatNumber(topEntity.qualifiedClicks)} qualified</span>
                {topDomain ? (
                  <span className="truncate font-medium text-slate-600" title={`Top domain: ${topDomain.domain}`}>
                    → {topDomain.domain}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm font-semibold text-slate-400">No clicks in range</div>
          )}
        </div>
      </section>

      {/* ROW 2 — Large Outbound Trend Graph */}
      <AnalyticsTrendChart
        title="Outbound Clicks & Referral Growth"
        subtitle="Qualified external clicks sent from SwingSphere listings to partner websites, ticket pages, and socials"
        points={trendPoints}
        primaryLabel={chartMetricMode === 'total' ? 'Total Clicks' : 'Qualified Clicks'}
        secondaryLabel={chartMetricMode === 'both' ? 'Total Clicks' : undefined}
        primaryTotal={
          chartMetricMode === 'total'
            ? summary?.totalClicks ?? 0
            : summary?.qualifiedClicks ?? 0
        }
        previousPrimaryTotal={
          chartMetricMode === 'total'
            ? summary?.previousPeriod?.totalClicks ?? null
            : summary?.previousPeriod?.qualifiedClicks ?? null
        }
        secondaryTotal={chartMetricMode === 'both' ? summary?.totalClicks ?? 0 : undefined}
        previousSecondaryTotal={
          chartMetricMode === 'both' ? summary?.previousPeriod?.totalClicks ?? null : undefined
        }
        rangePreset={rangePreset}
        onSelectRangePreset={handleSelectRangePreset}
        granularity={granularity}
        onSelectGranularity={setGranularity}
        showComparison={showComparison}
        onToggleComparison={() => setShowComparison((prev) => !prev)}
        comparisonLabel={
          resolveRangeDates(rangePreset, todayStr, summary?.kpis?.firstRecordedDay ?? null)
            .comparisonLabel
        }
        from={from}
        to={to}
        onChangeCustomDates={(nextFrom, nextTo) => {
          setFrom(nextFrom);
          setTo(nextTo);
        }}
        onApplyCustomDates={() => void loadRange(from, to)}
        isLoading={isLoading}
        accentColor="#4f46e5"
        secondaryColor="#0ea5e9"
        headerRightExtra={
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                { id: 'both', label: 'Qualified + Total' },
                { id: 'qualified', label: 'Qualified' },
                { id: 'total', label: 'Total' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setChartMetricMode(mode.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  chartMetricMode === mode.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        }
      />

      {!summary?.uniqueCountsComplete && summary ? (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
          Note: Deduplicated daily session ({formatNumber(summary.dailyUniqueSessions)}) and signed-in user ({formatNumber(summary.dailyUniqueUsers)}) counts are available from {summary.uniqueCountCoverageStart}. Total and qualified click counts cover the full selected date range.
        </div>
      ) : null}

      {/* Viewport-Safe Modal Drill-down */}
      {detailSelection ? (
        <AdminDetailDialog title={detailSelection.title} onClose={closeDetail}>
          {detailError ? (
            <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
              {detailError}
              <span className="ml-2">Close and reopen the details to retry.</span>
            </div>
          ) : (
            <OutboundDetailPanel
              selection={detailSelection}
              detail={detail}
              isLoading={isDetailLoading}
              catalog={catalog}
              onClose={closeDetail}
            />
          )}
        </AdminDetailDialog>
      ) : null}

      {summary ? (
        <>
          {/* ROW 3 — Primary Ranking: Listing → Destination → Clicks */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Outbound Click Flows (Listing → Destination → Clicks)
                  </h2>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                    {entityDestinationRows.length} flows
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Which SwingSphere listings are sending visitors to which external ticket pages, websites, and socials. Click any listing title to open its SwingSphere page, or click a row to inspect recent clicks.
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1">
                {CATEGORY_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setCategoryFilter(option.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      categoryFilter === option.key
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {!entityDestinationRows.length ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No outbound listing-to-destination flows recorded for this filter and date range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">SwingSphere Listing</th>
                      <th className="px-3 py-3">External Destination</th>
                      <th className="hidden px-3 py-3 md:table-cell">Category</th>
                      <th className="px-3 py-3 text-right">Qualified</th>
                      <th className="hidden px-3 py-3 text-right sm:table-cell">Total</th>
                      <th className="px-5 py-3 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entityDestinationRows.slice(0, 30).map((row, idx) => {
                      const rowKey = `flow:${row.entityType}:${row.entityId}:${row.destinationDomain}:${row.destinationPath}:${idx}`;
                      const isExpanded = detailSelection?.key === rowKey;
                      const sharePct = summary.qualifiedClicks
                        ? Math.min(100, (row.qualifiedClicks / summary.qualifiedClicks) * 100)
                        : 0;

                      return (
                        <tr
                          key={rowKey}
                          onClick={() =>
                            void openDetail({
                              key: rowKey,
                              title: `${row.entity.title} → ${row.destination.displayDestination}`,
                              description: `Outbound clicks from ${row.entity.title} (${row.entity.typeBadge}) to ${row.destination.displayDestination}.`,
                              filter: {
                                entityType: row.entityType,
                                entityId: row.entityId,
                                destinationType: row.destinationType || null,
                                destinationDomain: row.destinationDomain || null,
                                destinationPath: row.destinationPath || null,
                              },
                            })
                          }
                          className={`cursor-pointer transition ${
                            isExpanded ? 'bg-indigo-50/70' : 'hover:bg-slate-50/90'
                          }`}
                        >
                          {/* Listing Column */}
                          <td className="max-w-[240px] px-5 py-3.5 sm:max-w-[300px]">
                            <ClickableEntityCell
                              entityType={row.entityType}
                              entityId={row.entityId}
                              catalog={catalog}
                            />
                          </td>

                          {/* Destination Column */}
                          <td className="max-w-[240px] px-3 py-3.5 sm:max-w-[320px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <ArrowRight size={13} className="shrink-0 text-slate-400" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {row.destination.href ? (
                                    <a
                                      href={row.destination.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      title={`Open https://${row.destination.displayDestination} in a new tab`}
                                      className="group inline-flex min-w-0 items-center gap-1 font-semibold text-slate-800 hover:text-indigo-600 hover:underline"
                                    >
                                      <span className="truncate">{row.destination.displayDestination}</span>
                                      <ExternalLink
                                        size={12}
                                        className="shrink-0 text-slate-400 group-hover:text-indigo-600"
                                      />
                                    </a>
                                  ) : (
                                    <span className="truncate font-semibold text-slate-800">
                                      {row.destination.displayDestination}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                  {row.destination.providerLabel ? (
                                    <span className="font-semibold text-indigo-600">
                                      {row.destination.providerLabel}
                                    </span>
                                  ) : (
                                    <span>{row.destination.domain || 'External link'}</span>
                                  )}
                                  <span className="md:hidden">· {row.destination.categoryLabel}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Category Badge */}
                          <td className="hidden px-3 py-3.5 md:table-cell">
                            <DestinationCategoryBadge
                              categoryKey={row.destination.categoryKey}
                              label={row.destination.categoryLabel}
                            />
                          </td>

                          {/* Qualified Clicks */}
                          <td className="px-3 py-3.5 text-right font-bold tabular-nums text-indigo-700">
                            {formatNumber(row.qualifiedClicks)}
                          </td>

                          {/* Total Clicks */}
                          <td className="hidden px-3 py-3.5 text-right tabular-nums text-slate-600 sm:table-cell">
                            {formatNumber(row.totalClicks)}
                          </td>

                          {/* Share & Inspect Trigger */}
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2.5">
                              <div className="hidden w-16 overflow-hidden rounded-full bg-slate-100 sm:block">
                                <div
                                  className="h-1.5 rounded-full bg-indigo-600"
                                  style={{ width: `${Math.max(4, sharePct)}%` }}
                                />
                              </div>
                              <span className="w-11 text-right text-xs font-medium tabular-nums text-slate-500">
                                {formatPercent(row.qualifiedClicks, summary.qualifiedClicks)}
                              </span>
                              <button
                                type="button"
                                aria-haspopup="dialog"
                                aria-expanded={isExpanded}
                                aria-label={`Inspect outbound clicks for ${row.entity.title} to ${row.destination.displayDestination}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openDetail({
                                    key: rowKey,
                                    title: `${row.entity.title} → ${row.destination.displayDestination}`,
                                    description: `Outbound clicks from ${row.entity.title} (${row.entity.typeBadge}) to ${row.destination.displayDestination}.`,
                                    filter: {
                                      entityType: row.entityType,
                                      entityId: row.entityId,
                                      destinationType: row.destinationType || null,
                                      destinationDomain: row.destinationDomain || null,
                                      destinationPath: row.destinationPath || null,
                                    },
                                  });
                                }}
                                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                              >
                                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              </button>
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

          {/* ROW 4 — Top Clicked Listings & Top External Domains / Links */}
          <div className="grid gap-6 xl:grid-cols-2">
            {/* Left: Most-Clicked SwingSphere Listings */}
            <section className="min-w-0 self-start overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Most-Clicked Listings</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    SwingSphere entities generating the most outbound referrals
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {(summary.byEntity ?? []).length} listings
                </span>
              </div>

              {!summary.byEntity?.length ? (
                <div className="p-6 text-sm text-slate-500">
                  No entity-level outbound traffic in this range.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Listing / Entity</th>
                        <th className="px-3 py-3 text-right">Qualified</th>
                        <th className="px-3 py-3 text-right">Total</th>
                        <th className="px-5 py-3 text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.byEntity.slice(0, 15).map((row, idx) => {
                        const rowKey = `byEntity:${row.entityType}:${row.entityId}:${idx}`;
                        const resolved = resolveAnalyticsEntity(row.entityType, row.entityId, catalog);
                        const isExpanded = detailSelection?.key === rowKey;
                        return (
                          <tr
                            key={rowKey}
                            onClick={() =>
                              void openDetail({
                                key: rowKey,
                                title: resolved.title,
                                description:
                                  'Shows the websites, socials, ticketing, booking, and other outbound actions generated by this listing.',
                                filter: { entityType: row.entityType, entityId: row.entityId },
                              })
                            }
                            className={`cursor-pointer transition ${
                              isExpanded ? 'bg-indigo-50/70' : 'hover:bg-slate-50/90'
                            }`}
                          >
                            <td className="max-w-[240px] px-5 py-3">
                              <ClickableEntityCell
                                entityType={row.entityType}
                                entityId={row.entityId}
                                catalog={catalog}
                              />
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums text-indigo-700">
                              {formatNumber(row.qualifiedClicks)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                              {formatNumber(row.totalClicks)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs font-medium tabular-nums text-slate-500">
                                  {formatPercent(row.qualifiedClicks, summary.qualifiedClicks)}
                                </span>
                                <button
                                  type="button"
                                  aria-haspopup="dialog"
                                  aria-expanded={isExpanded}
                                  aria-label={`Inspect outbound clicks for ${resolved.title}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openDetail({
                                      key: rowKey,
                                      title: resolved.title,
                                      description:
                                        'Shows the websites, socials, ticketing, booking, and other outbound actions generated by this listing.',
                                      filter: { entityType: row.entityType, entityId: row.entityId },
                                    });
                                  }}
                                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
                                >
                                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>
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

            {/* Right: Top External Domains & Exact Links */}
            <section className="min-w-0 self-start overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Top External Destinations</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    External domains and sanitized URLs receiving traffic from SwingSphere
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDomainViewMode('domains')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      domainViewMode === 'domains'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Domains ({(summary.byDomain ?? []).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDomainViewMode('links')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      domainViewMode === 'links'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Exact URLs ({(summary.byLink ?? []).length})
                  </button>
                </div>
              </div>

              {domainViewMode === 'domains' ? (
                !summary.byDomain?.length ? (
                  <div className="p-6 text-sm text-slate-500">
                    No external domain activity recorded in this range.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-5 py-3">External Domain</th>
                          <th className="px-3 py-3">Category</th>
                          <th className="px-3 py-3 text-right">Qualified</th>
                          <th className="px-5 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.byDomain.slice(0, 15).map((row, idx) => {
                          const rowKey = `byDomain:${row.destinationDomain}:${idx}`;
                          const classified = classifyOutboundDestination(
                            row.destinationType,
                            row.destinationDomain,
                            '',
                          );
                          const isExpanded = detailSelection?.key === rowKey;
                          return (
                            <tr
                              key={rowKey}
                              onClick={() =>
                                void openDetail({
                                  key: rowKey,
                                  title: row.destinationDomain,
                                  description: `All outbound clicks sent to ${row.destinationDomain}.`,
                                  filter: { destinationDomain: row.destinationDomain },
                                })
                              }
                              className={`cursor-pointer transition ${
                                isExpanded ? 'bg-indigo-50/70' : 'hover:bg-slate-50/90'
                              }`}
                            >
                              <td className="max-w-[220px] px-5 py-3">
                                <div className="flex items-center gap-1.5">
                                  {classified.href ? (
                                    <a
                                      href={classified.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="group inline-flex min-w-0 items-center gap-1 font-semibold text-slate-900 hover:text-indigo-600 hover:underline"
                                    >
                                      <span className="truncate">{row.destinationDomain}</span>
                                      <ExternalLink
                                        size={12}
                                        className="shrink-0 text-slate-400 group-hover:text-indigo-600"
                                      />
                                    </a>
                                  ) : (
                                    <span className="truncate font-semibold text-slate-900">
                                      {row.destinationDomain}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-500">
                                  {classified.providerLabel
                                    ? `${classified.providerLabel}`
                                    : classified.categoryLabel}
                                  {row.entityCount
                                    ? ` · ${row.entityCount} ${row.entityCount === 1 ? 'listing' : 'listings'}`
                                    : ''}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <DestinationCategoryBadge
                                  categoryKey={classified.categoryKey}
                                  label={classified.categoryLabel}
                                />
                              </td>
                              <td className="px-3 py-3 text-right font-bold tabular-nums text-indigo-700">
                                {formatNumber(row.qualifiedClicks)}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="tabular-nums text-slate-600">
                                    {formatNumber(row.totalClicks)}
                                  </span>
                                  <button
                                    type="button"
                                    aria-haspopup="dialog"
                                    aria-expanded={isExpanded}
                                    aria-label={`Inspect outbound clicks for ${row.destinationDomain}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void openDetail({
                                        key: rowKey,
                                        title: row.destinationDomain,
                                        description: `All outbound clicks sent to ${row.destinationDomain}.`,
                                        filter: { destinationDomain: row.destinationDomain },
                                      });
                                    }}
                                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
                                  >
                                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : !summary.byLink?.length ? (
                <div className="p-6 text-sm text-slate-500">
                  No exact outbound link detail in this range.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Sanitized Destination URL</th>
                        <th className="px-3 py-3">Category</th>
                        <th className="px-3 py-3 text-right">Qualified</th>
                        <th className="px-5 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.byLink.slice(0, 15).map((row, idx) => {
                        const rowKey = `byLink:${row.destinationDomain}:${row.destinationPath}:${idx}`;
                        const classified = classifyOutboundDestination(
                          row.destinationType,
                          row.destinationDomain,
                          row.destinationPath,
                        );
                        const isExpanded = detailSelection?.key === rowKey;
                        return (
                          <tr
                            key={rowKey}
                            onClick={() =>
                              void openDetail({
                                key: rowKey,
                                title: classified.displayDestination,
                                description:
                                  'Shows which SwingSphere entities and placements sent traffic to this destination.',
                                filter: {
                                  destinationType: row.destinationType,
                                  destinationDomain: row.destinationDomain,
                                  destinationPath: row.destinationPath,
                                },
                              })
                            }
                            className={`cursor-pointer transition ${
                              isExpanded ? 'bg-indigo-50/70' : 'hover:bg-slate-50/90'
                            }`}
                          >
                            <td className="max-w-[230px] px-5 py-3">
                              <div className="flex items-center gap-1.5">
                                {classified.href ? (
                                  <a
                                    href={classified.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="group inline-flex min-w-0 items-center gap-1 font-semibold text-slate-900 hover:text-indigo-600 hover:underline"
                                  >
                                    <span className="truncate">{classified.displayDestination}</span>
                                    <ExternalLink
                                      size={12}
                                      className="shrink-0 text-slate-400 group-hover:text-indigo-600"
                                    />
                                  </a>
                                ) : (
                                  <span className="truncate font-semibold text-slate-900">
                                    {classified.displayDestination}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {classified.providerLabel || row.destinationType.replaceAll('_', ' ')}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <DestinationCategoryBadge
                                categoryKey={classified.categoryKey}
                                label={classified.categoryLabel}
                              />
                            </td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums text-indigo-700">
                              {formatNumber(row.qualifiedClicks)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="tabular-nums text-slate-600">
                                  {formatNumber(row.totalClicks)}
                                </span>
                                <button
                                  type="button"
                                  aria-haspopup="dialog"
                                  aria-expanded={isExpanded}
                                  aria-label={`Inspect outbound clicks for ${classified.displayDestination}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openDetail({
                                      key: rowKey,
                                      title: classified.displayDestination,
                                      description:
                                        'Shows which SwingSphere entities and placements sent traffic to this destination.',
                                      filter: {
                                        destinationType: row.destinationType,
                                        destinationDomain: row.destinationDomain,
                                        destinationPath: row.destinationPath,
                                      },
                                    });
                                  }}
                                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
                                >
                                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>
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
          </div>

          {/* ROW 5 — Destination Action Types & UI Placements */}
          <div className="grid gap-6 xl:grid-cols-2">
            <BreakdownTable
              title="By Destination Action Type"
              subtitle="Distribution across websites, ticketing, RSVP, socials, and directions"
              empty="No outbound destination activity in this range."
              expandedKey={detailSelection?.key}
              totalQualified={summary.qualifiedClicks}
              rows={(summary.byDestination ?? []).map((row) => {
                const classified = classifyOutboundDestination(row.destinationType || 'website', '', '');
                return {
                  key: 'byDestination:' + JSON.stringify(row),
                  primary: classified.categoryLabel,
                  secondary: `${(row.destinationType || 'unknown').replaceAll('_', ' ')} · click to inspect`,
                  categoryKey: classified.categoryKey,
                  qualified: row.qualifiedClicks,
                  total: row.totalClicks,
                  onClick: () =>
                    void openDetail({
                      key: 'byDestination:' + JSON.stringify(row),
                      title: `${classified.categoryLabel} clicks`,
                      description:
                        'Shows which entities, placements, and exact sanitized destinations produced this outbound action.',
                      filter: { destinationType: row.destinationType ?? null },
                    }),
                };
              })}
            />

            <BreakdownTable
              title="By SwingSphere UI Placement"
              subtitle="Which buttons and surfaces drive outbound referrals"
              empty="No placement activity in this range."
              expandedKey={detailSelection?.key}
              totalQualified={summary.qualifiedClicks}
              rows={(summary.byPlacement ?? []).map((row) => ({
                key: 'byPlacement:' + JSON.stringify(row),
                primary: (row.placement || 'Unknown placement').replaceAll('_', ' '),
                secondary: `Surface: ${(row.surface || 'Unknown surface').replaceAll('_', ' ')}`,
                qualified: row.qualifiedClicks,
                total: row.totalClicks,
                onClick: () =>
                  void openDetail({
                    key: 'byPlacement:' + JSON.stringify(row),
                    title: row.placement || 'Unknown placement',
                    description:
                      'Shows the outbound destinations and entities clicked from this SwingSphere placement.',
                    filter: { placement: row.placement ?? null, surface: row.surface ?? null },
                  }),
              }))}
            />
          </div>
        </>
      ) : null}
    </div>
  );
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  sublabel?: string;
  deltaCurrent?: number;
  deltaPrevious?: number;
  accent?: boolean;
}> = ({ label, value, sublabel, deltaCurrent, deltaPrevious, accent = false }) => (
  <div
    className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition ${
      accent
        ? 'border-indigo-200/90 bg-gradient-to-br from-indigo-50/70 via-white to-white'
        : 'border-slate-200/90 bg-white'
    }`}
  >
    <div className="flex items-center justify-between gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      {deltaCurrent !== undefined && deltaPrevious !== undefined ? (
        <DeltaBadge current={deltaCurrent} previous={deltaPrevious} />
      ) : null}
    </div>
    <div className="mt-2">
      <div className="text-2xl font-black tracking-tight tabular-nums text-slate-900 sm:text-3xl">
        {value}
      </div>
      {sublabel ? <div className="mt-1 truncate text-[11px] text-slate-500">{sublabel}</div> : null}
    </div>
  </div>
);

const BreakdownTable: React.FC<{
  title: string;
  subtitle?: string;
  empty: string;
  expandedKey?: string;
  totalQualified: number;
  rows: Array<{
    key?: string;
    primary: string;
    secondary: string;
    categoryKey?: OutboundCategoryKey;
    qualified: number;
    total: number;
    href?: string | null;
    onClick?: () => void;
  }>;
}> = ({ title, subtitle, empty, rows, expandedKey, totalQualified }) => (
  <section className="min-w-0 self-start overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-5 py-4">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
    </div>
    {!rows.length ? (
      <div className="p-6 text-sm text-slate-500">{empty}</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Category / Placement</th>
              <th className="px-3 py-3 text-right">Qualified</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const key = row.key || `${row.primary}:${row.secondary}:${index}`;
              const expanded = !!row.onClick && expandedKey === key;
              const content = (
                <>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-all font-semibold capitalize text-slate-900">
                        {row.primary}
                      </span>
                      {row.categoryKey ? (
                        <DestinationCategoryBadge
                          categoryKey={row.categoryKey}
                          label={row.primary}
                        />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{row.secondary}</span>
                  </span>
                  <span className="text-right font-bold tabular-nums text-indigo-700">
                    {formatNumber(row.qualified)}
                    <span className="block text-[10px] font-normal text-slate-400">
                      {formatPercent(row.qualified, totalQualified)}
                    </span>
                  </span>
                  <span className="flex items-center justify-end gap-2 tabular-nums text-slate-600">
                    {formatNumber(row.total)}
                    {row.onClick ? (
                      expanded ? (
                        <ChevronDown size={15} className="text-slate-400" />
                      ) : (
                        <ChevronRight size={15} className="text-slate-400" />
                      )
                    ) : null}
                  </span>
                </>
              );
              return (
                <tr key={key} className={expanded ? 'bg-indigo-50/70' : ''}>
                  <td colSpan={3} className="p-0">
                    <div className="flex items-center">
                      {row.onClick ? (
                        <button
                          type="button"
                          onClick={row.onClick}
                          aria-haspopup="dialog"
                          aria-expanded={expanded}
                          className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_85px_85px] items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="grid w-full grid-cols-[minmax(0,1fr)_85px_85px] items-center gap-3 px-5 py-3">
                          {content}
                        </div>
                      )}
                      {row.href ? (
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mr-3 shrink-0 rounded p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                          aria-label={'Open destination ' + row.primary}
                        >
                          <ExternalLink size={14} />
                        </a>
                      ) : null}
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
);

const OutboundDetailPanel: React.FC<{
  selection: DetailSelection;
  detail: OutboundAnalyticsDetail | null;
  isLoading: boolean;
  catalog: AnalyticsCatalog | null;
  onClose: () => void;
}> = ({ selection, detail, isLoading, catalog, onClose }) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
          Outbound drill-down
        </p>
        <h2 className="mt-1 text-xl font-black text-slate-900">{selection.title}</h2>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{selection.description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900"
        aria-label="Close outbound detail"
      >
        <X size={18} />
      </button>
    </div>

    {isLoading ? (
      <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">
        <LoaderCircle size={17} className="mr-2 animate-spin" /> Loading outbound detail…
      </div>
    ) : detail ? (
      <div className="space-y-6 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Qualified clicks
            </div>
            <div className="mt-1 text-2xl font-black text-indigo-700">
              {formatNumber(detail.qualifiedClicks)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Total clicks
            </div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              {formatNumber(detail.totalClicks)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Raw-detail retention
            </div>
            <div className="mt-1 text-sm leading-5 text-slate-700">
              Recent click rows are kept for {detail.rawRetentionDays || 90} days.
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-900">Destinations</h3>
            </div>
            {!detail.byLink?.length ? (
              <div className="p-4 text-sm text-slate-500">No link-level data.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.byLink.map((row, index) => {
                  const classified = classifyOutboundDestination(
                    row.destinationType,
                    row.destinationDomain,
                    row.destinationPath,
                  );
                  return (
                    <div
                      key={`${row.destinationDomain}-${row.destinationPath}-${index}`}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="break-all text-sm font-semibold text-slate-900">
                          {classified.displayDestination}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <DestinationCategoryBadge
                            categoryKey={classified.categoryKey}
                            label={classified.categoryLabel}
                          />
                          {classified.providerLabel ? (
                            <span className="text-xs text-slate-500">
                              {classified.providerLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-bold tabular-nums text-indigo-700">
                          {formatNumber(row.qualifiedClicks)} q
                        </span>
                        {classified.href ? (
                          <a
                            href={classified.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-700"
                            aria-label="Open outbound destination"
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
              <h3 className="font-bold text-slate-900">Entities generating clicks</h3>
            </div>
            {!detail.byEntity?.length ? (
              <div className="p-4 text-sm text-slate-500">No entity-level data.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.byEntity.map((row, index) => (
                  <div
                    key={`${row.entityType}-${row.entityId}-${index}`}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <ClickableEntityCell
                        entityType={row.entityType}
                        entityId={row.entityId}
                        catalog={catalog}
                      />
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-indigo-700">
                      {formatNumber(row.qualifiedClicks)} q
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="font-bold text-slate-900">Recent outbound clicks</h3>
            <p className="mt-1 text-xs text-slate-500">
              Admin-only operational detail. Sponsor reporting should use aggregate qualified-click counts rather than individual click histories.
            </p>
          </div>
          {!detail.recentClicks?.length ? (
            <div className="p-4 text-sm text-slate-500">
              No raw click rows remain for this selection.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Clicked</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Placement</th>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Quality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.recentClicks.map((click, index) => {
                    const classified = classifyOutboundDestination(
                      click.destinationType,
                      click.destinationDomain,
                      click.destinationPath,
                    );
                    return (
                      <tr key={`${click.occurredAt}-${index}`}>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                          {new Date(click.occurredAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <ClickableEntityCell
                            entityType={click.entityType}
                            entityId={click.entityId}
                            catalog={catalog}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 font-medium text-slate-800">
                            <span className="max-w-[300px] break-all">
                              {classified.displayDestination}
                            </span>
                            {classified.href ? (
                              <a
                                href={classified.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-indigo-600"
                                aria-label="Open outbound destination"
                              >
                                <ExternalLink size={12} />
                              </a>
                            ) : null}
                          </div>
                          <div className="mt-1">
                            <DestinationCategoryBadge
                              categoryKey={classified.categoryKey}
                              label={classified.categoryLabel}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {click.placement}
                          <div className="text-xs capitalize text-slate-500">
                            {click.surface.replaceAll('_', ' ')}
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-600">{click.deviceClass}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold ${
                              click.qualified
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {click.qualified ? 'Qualified' : 'Repeat / filtered'}
                          </span>
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

export default AdminOutboundAnalytics;
