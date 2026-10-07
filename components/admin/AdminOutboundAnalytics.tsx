import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  getOutboundAnalyticsDetail,
  getOutboundAnalyticsSummary,
  type OutboundAnalyticsDetail,
  type OutboundAnalyticsDetailFilter,
  type OutboundAnalyticsSummary,
} from '../../lib/analytics/outboundReports';
import type { OutboundEntityType } from '../../lib/analytics/outboundTracking';
import AdminDetailDialog from './AdminDetailDialog';
import { useAppStore } from '../../store/appStore';
import * as api from '../../lib/api';

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

const entityTypes: Array<{ value: '' | OutboundEntityType; label: string }> = [
  { value: '', label: 'All entity types' },
  { value: 'club', label: 'Clubs' },
  { value: 'event', label: 'Events' },
  { value: 'event_series', label: 'Event series' },
  { value: 'venue', label: 'Venues' },
  { value: 'organization', label: 'Organizations' },
  { value: 'resort', label: 'Resorts' },
  { value: 'cruise_series', label: 'Cruise series' },
  { value: 'cruise_sailing', label: 'Cruise sailings' },
  { value: 'profile', label: 'Profiles' },
];

const formatNumber = (value?: number): string => new Intl.NumberFormat('en-US').format(value ?? 0);

const formatDestination = (domain: string, path?: string | null): string => {
  if (!path) return domain;
  return `${domain}${path}`;
};

const destinationHref = (domain: string, path?: string | null): string | null => {
  if (!domain || domain.endsWith('.local')) return null;
  if (!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(domain)) return null;
  return `https://${domain}${path || ''}`;
};

type DetailSelection = {
  key: string;
  title: string;
  description: string;
  filter: Omit<OutboundAnalyticsDetailFilter, 'from' | 'to'>;
};

const AdminOutboundAnalytics: React.FC = () => {
  const { addToast } = useAppStore();
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(() => new Date(today.getTime() - 29 * 86_400_000), [today]);
  const [from, setFrom] = useState(toDateInput(thirtyDaysAgo));
  const [to, setTo] = useState(toDateInput(today));
  const [entityType, setEntityType] = useState<'' | OutboundEntityType>('');
  const [entityId, setEntityId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [campaignKey, setCampaignKey] = useState('');
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
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});

  const load = async () => {
    if (!from || !to || from > to) {
      addToast({ message: 'Choose a valid analytics date range.', type: 'error' });
      return;
    }
    closeDetail();
    setIsLoading(true);
    try {
      const next = await getOutboundAnalyticsSummary({
        from,
        to,
        entityType: entityType || undefined,
        entityId: entityId.trim() || undefined,
        organizationId: organizationId.trim() || undefined,
        campaignKey: campaignKey.trim() || undefined,
      });
      setSummary(next);
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to load outbound analytics.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void (async () => {
      try {
        const [listings, organizations, eventSeries, venues, resorts, cruiseSeries, cruiseSailings] = await Promise.all([
          api.getListings(),
          api.getOrganizations(),
          api.getEventSeries(),
          api.getVenues(),
          api.getResorts(),
          api.getCruiseSeries(),
          api.getCruiseSailings(),
        ]);
        const next: Record<string, string> = {};
        listings.forEach((item) => { next[`${item.type}:${item.id}`] = item.name; });
        organizations.forEach((item) => { next[`organization:${item.id}`] = item.name; });
        eventSeries.forEach((item) => { next[`event_series:${item.id}`] = item.name; });
        venues.forEach((item) => { next[`venue:${item.id}`] = item.name; });
        resorts.forEach((item) => { next[`resort:${item.id}`] = item.name; });
        cruiseSeries.forEach((item) => { next[`cruise_series:${item.id}`] = item.name; });
        cruiseSailings.forEach((item) => { next[`cruise_sailing:${item.id}`] = item.name; });
        setEntityNames(next);
      } catch {
        // IDs remain available even if friendly-name lookup fails.
      }
    })();
  }, []);

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
        setDetailError(error instanceof Error ? error.message : 'Unable to load details. Try collapsing and reopening this row.');
      }
    } finally {
      if (request === detailRequest.current) setIsDetailLoading(false);
    }
  };

  const getEntityName = (type: string, id: string) => entityNames[`${type}:${id}`] || id;

  const qualifiedRate = summary?.totalClicks
    ? Math.round((summary.qualifiedClicks / summary.totalClicks) * 1000) / 10
    : 0;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Commercial attribution</p>
          <h1 className="mt-1 text-3xl font-black text-gray-900">Outbound Analytics</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">Measure traffic SwingSphere sends to ticketing, RSVP, booking, website, calendar, contact, and directions destinations. These figures represent referrals, not confirmed purchases or attendance.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} /> Run report
        </button>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <p className="leading-6"><strong>Sponsor-safe reporting:</strong> use qualified clicks, destination categories, placements, and aggregate session counts. Do not provide account-level click histories, email addresses, or lists of people who opened a specific destination.</p>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-gray-700">From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-700">To
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-700">Entity type
            <select value={entityType} onChange={(event) => setEntityType(event.target.value as '' | OutboundEntityType)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              {entityTypes.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-700">Entity ID
            <input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="Optional exact ID" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-700">Organization ID
            <input value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} placeholder="Optional organization" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-semibold text-gray-700">Campaign key
            <input value={campaignKey} onChange={(event) => setCampaignKey(event.target.value)} placeholder="Optional sponsored campaign" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
        </div>
      </section>

      {isLoading ? (
        <div className="flex min-h-52 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"><LoaderCircle size={18} className="mr-2 animate-spin" /> Loading report…</div>
      ) : summary ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Total outbound clicks" value={formatNumber(summary.totalClicks)} />
            <MetricCard label="Qualified clicks" value={formatNumber(summary.qualifiedClicks)} emphasis />
            <MetricCard label="Qualified rate" value={`${qualifiedRate}%`} />
            <MetricCard label="Daily distinct sessions" value={formatNumber(summary.dailyUniqueSessions)} footnote="Deduplicated per day, then summed" />
            <MetricCard label="Daily signed-in users" value={formatNumber(summary.dailyUniqueUsers)} footnote="Deduplicated per day, then summed" />
          </section>

          {!summary.uniqueCountsComplete ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Unique-session and signed-in-user counts are only complete from {summary.uniqueCountCoverageStart}. Total and qualified click counts still cover the full selected range.
            </div>
          ) : null}

          {detailSelection ? (
            <AdminDetailDialog title={detailSelection.title} onClose={closeDetail}>
              {detailError ? <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{detailError}<span className="ml-2">Close and reopen the details to retry.</span></div> : <OutboundDetailPanel selection={detailSelection} detail={detail} isLoading={isDetailLoading} entityName={getEntityName} onClose={closeDetail} />}
            </AdminDetailDialog>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <BreakdownTable
              title="By destination"
              empty="No outbound destination activity in this range."
              expandedKey={detailSelection?.key}
              rows={(summary.byDestination ?? []).map((row) => ({
                key: 'byDestination:' + JSON.stringify(row),
                primary: row.destinationType?.replaceAll('_', ' ') || 'Unknown',
                secondary: 'External action type · view details',
                qualified: row.qualifiedClicks,
                total: row.totalClicks,
                onClick: () => void openDetail({
                  key: 'byDestination:' + JSON.stringify(row),
                  title: `${row.destinationType?.replaceAll('_', ' ') || 'Unknown'} clicks`,
                  description: 'Shows which entities, placements, and exact sanitized destinations produced this outbound action.',
                  filter: { destinationType: row.destinationType ?? null },
                }),
              }))}
            />
            <BreakdownTable
              title="By placement"
              empty="No placement activity in this range."
              expandedKey={detailSelection?.key}
              rows={(summary.byPlacement ?? []).map((row) => ({
                key: 'byPlacement:' + JSON.stringify(row),
                primary: row.placement || 'Unknown placement',
                secondary: `${row.surface?.replaceAll('_', ' ') || 'Unknown surface'} · view details`,
                qualified: row.qualifiedClicks,
                total: row.totalClicks,
                onClick: () => void openDetail({
                  key: 'byPlacement:' + JSON.stringify(row),
                  title: row.placement || 'Unknown placement',
                  description: 'Shows the outbound destinations and entities clicked from this SwingSphere placement.',
                  filter: { placement: row.placement ?? null, surface: row.surface ?? null },
                }),
              }))}
            />
            <BreakdownTable
              title="Exact outbound links"
              empty="No exact outbound link detail in this range."
              expandedKey={detailSelection?.key}
              rows={(summary.byLink ?? []).map((row) => ({
                key: 'byLink:' + JSON.stringify(row),
                primary: formatDestination(row.destinationDomain, row.destinationPath),
                secondary: `${row.destinationType.replaceAll('_', ' ')}${row.destinationPath ? '' : ' · domain only / legacy'}`,
                qualified: row.qualifiedClicks,
                total: row.totalClicks,
                href: destinationHref(row.destinationDomain, row.destinationPath),
                onClick: () => void openDetail({
                  key: 'byLink:' + JSON.stringify(row),
                  title: formatDestination(row.destinationDomain, row.destinationPath),
                  description: 'Shows which SwingSphere entities and placements sent traffic to this destination.',
                  filter: {
                    destinationType: row.destinationType,
                    destinationDomain: row.destinationDomain,
                    destinationPath: row.destinationPath,
                  },
                }),
              }))}
            />
            <BreakdownTable
              title="By entity"
              empty="No entity-level outbound traffic in this range."
              expandedKey={detailSelection?.key}
              rows={(summary.byEntity ?? []).map((row) => ({
                key: 'byEntity:' + JSON.stringify(row),
                primary: getEntityName(row.entityType, row.entityId),
                secondary: `${row.entityType.replaceAll('_', ' ')} · ${row.entityId}`,
                qualified: row.qualifiedClicks,
                total: row.totalClicks,
                onClick: () => void openDetail({
                  key: 'byEntity:' + JSON.stringify(row),
                  title: getEntityName(row.entityType, row.entityId),
                  description: 'Shows the websites, socials, ticketing, booking, and other outbound actions generated by this entity.',
                  filter: { entityType: row.entityType, entityId: row.entityId },
                }),
              }))}
            />
          </div>



          <section className="rounded-xl border border-gray-200 bg-white p-5 text-sm leading-6 text-gray-600 shadow-sm">
            <div className="flex items-center gap-2 font-bold text-gray-900"><ExternalLink size={16} /> Recommended sponsor wording</div>
            <p className="mt-2">“From {summary.from} through {summary.to}, SwingSphere generated <strong>{formatNumber(summary.qualifiedClicks)} qualified outbound clicks</strong> to the selected ticketing, RSVP, booking, or official destinations.”</p>
            <p className="mt-2 text-xs text-gray-500">Do not describe these as sales, bookings, purchases, or attendees unless a separately disclosed conversion source verifies that outcome.</p>
          </section>
        </>
      ) : null}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; emphasis?: boolean; footnote?: string }> = ({ label, value, emphasis = false, footnote }) => (
  <div className={`rounded-xl border p-5 shadow-sm ${emphasis ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500"><BarChart3 size={14} />{label}</div>
    <div className={`mt-2 text-3xl font-black tabular-nums ${emphasis ? 'text-blue-700' : 'text-gray-900'}`}>{value}</div>
    {footnote ? <div className="mt-1 text-[11px] text-gray-500">{footnote}</div> : null}
  </div>
);

const OutboundDetailPanel: React.FC<{
  selection: DetailSelection;
  detail: OutboundAnalyticsDetail | null;
  isLoading: boolean;
  entityName: (type: string, id: string) => string;
  onClose: () => void;
}> = ({ selection, detail, isLoading, entityName, onClose }) => (
  <section className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
    <div className="flex items-start justify-between gap-4 border-b border-blue-100 bg-blue-50 px-5 py-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Outbound detail</p>
        <h2 className="mt-1 text-xl font-black text-gray-900">{selection.title}</h2>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-gray-600">{selection.description}</p>
      </div>
      <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-gray-900" aria-label="Close outbound detail">
        <X size={18} />
      </button>
    </div>

    {isLoading ? (
      <div className="flex min-h-40 items-center justify-center text-sm text-gray-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Loading outbound detail…</div>
    ) : detail ? (
      <div className="space-y-6 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Qualified clicks</div>
            <div className="mt-1 text-2xl font-black text-blue-700">{formatNumber(detail.qualifiedClicks)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Total clicks</div>
            <div className="mt-1 text-2xl font-black text-gray-900">{formatNumber(detail.totalClicks)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Raw-detail retention</div>
            <div className="mt-1 text-sm leading-5 text-gray-700">Recent click rows are kept for {detail.rawRetentionDays || 90} days.</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-gray-200">
            <div className="border-b border-gray-100 px-4 py-3"><h3 className="font-bold text-gray-900">Destinations</h3></div>
            {!detail.byLink?.length ? <div className="p-4 text-sm text-gray-500">No link-level data.</div> : (
              <div className="divide-y divide-gray-100">
                {detail.byLink.map((row, index) => {
                  const href = destinationHref(row.destinationDomain, row.destinationPath);
                  return (
                    <div key={`${row.destinationDomain}-${row.destinationPath}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <div className="break-all text-sm font-semibold text-gray-900">{formatDestination(row.destinationDomain, row.destinationPath)}</div>
                        <div className="mt-0.5 text-xs capitalize text-gray-500">{row.destinationType.replaceAll('_', ' ')}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-bold tabular-nums text-blue-700">{formatNumber(row.qualifiedClicks)} q</span>
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-700" aria-label="Open outbound destination"><ExternalLink size={15} /></a> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200">
            <div className="border-b border-gray-100 px-4 py-3"><h3 className="font-bold text-gray-900">Entities generating clicks</h3></div>
            {!detail.byEntity?.length ? <div className="p-4 text-sm text-gray-500">No entity-level data.</div> : (
              <div className="divide-y divide-gray-100">
                {detail.byEntity.map((row, index) => (
                  <div key={`${row.entityType}-${row.entityId}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{entityName(row.entityType, row.entityId)}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{row.entityType.replaceAll('_', ' ')} · {row.entityId}</div>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-blue-700">{formatNumber(row.qualifiedClicks)} q</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-bold text-gray-900">Recent outbound clicks</h3>
            <p className="mt-1 text-xs text-gray-500">Admin-only operational detail. Sponsor reporting should use aggregate qualified-click counts rather than individual click histories.</p>
          </div>
          {!detail.recentClicks?.length ? (
            <div className="p-4 text-sm text-gray-500">No raw click rows remain for this selection.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3">Clicked</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Destination</th><th className="px-4 py-3">Placement</th><th className="px-4 py-3">Device</th><th className="px-4 py-3">Quality</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.recentClicks.map((click, index) => {
                    const href = destinationHref(click.destinationDomain, click.destinationPath);
                    return (
                      <tr key={`${click.occurredAt}-${index}`}>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{new Date(click.occurredAt).toLocaleString()}</td>
                        <td className="px-4 py-3"><div className="font-semibold text-gray-900">{entityName(click.entityType, click.entityId)}</div><div className="text-xs text-gray-500">{click.entityType.replaceAll('_', ' ')}</div></td>
                        <td className="px-4 py-3"><div className="flex items-center gap-1 font-medium text-gray-800"><span className="max-w-[320px] break-all">{formatDestination(click.destinationDomain, click.destinationPath)}</span>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-blue-600" aria-label="Open outbound destination"><ExternalLink size={12} /></a> : null}</div><div className="text-xs capitalize text-gray-500">{click.destinationType.replaceAll('_', ' ')}</div></td>
                        <td className="px-4 py-3 text-gray-600">{click.placement}<div className="text-xs capitalize text-gray-500">{click.surface.replaceAll('_', ' ')}</div></td>
                        <td className="px-4 py-3 text-gray-600">{click.deviceClass}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${click.qualified ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{click.qualified ? 'Qualified' : 'Repeat / filtered'}</span></td>
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

const BreakdownTable: React.FC<{
  title: string;
  empty: string;
  expandedKey?: string;
  rows: Array<{ key?: string; primary: string; secondary: string; qualified: number; total: number; href?: string | null; onClick?: () => void }>;
}> = ({ title, empty, rows, expandedKey }) => (
  <section className="min-w-0 self-start overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
    <div className="border-b border-gray-200 px-5 py-4"><h2 className="font-bold text-gray-900">{title}</h2>{rows.some((row) => row.onClick) ? <p className="mt-1 text-xs text-gray-500">Select a row to open its details.</p> : null}</div>
    {!rows.length ? <div className="p-6 text-sm text-gray-500">{empty}</div> : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Category</th><th className="px-5 py-3 text-right">Qualified</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => {
              const key = row.key || row.primary + ':' + row.secondary + ':' + index;
              const expanded = !!row.onClick && expandedKey === key;
              const content = <><span className="min-w-0"><span className="block break-all font-semibold text-gray-900">{row.primary}</span><span className="block text-xs text-gray-500">{row.secondary}</span></span><span className="text-right font-bold tabular-nums text-blue-700">{formatNumber(row.qualified)}</span><span className="flex items-center justify-end gap-2 tabular-nums text-gray-600">{formatNumber(row.total)}{row.onClick ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}</span></>;
              return (
                <React.Fragment key={key}>
                  <tr className={expanded ? 'bg-blue-50' : ''}>
                    <td colSpan={3} className="p-0">
                      <div className="flex items-center">
                      {row.onClick ? <button type="button" onClick={row.onClick} aria-haspopup="dialog" aria-expanded={expanded} className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_70px_70px] items-center gap-3 px-5 py-3 text-left transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{content}</button> : <div className="grid w-full grid-cols-[minmax(0,1fr)_70px_70px] items-center gap-3 px-5 py-3">{content}</div>}
                      {row.href ? <a href={row.href} target="_blank" rel="noopener noreferrer" className="mr-3 shrink-0 rounded p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600" aria-label={"Open destination " + row.primary}><ExternalLink size={14} /></a> : null}</div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export default AdminOutboundAnalytics;
