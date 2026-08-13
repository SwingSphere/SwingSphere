import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { getOutboundAnalyticsSummary, type OutboundAnalyticsSummary } from '../../lib/analytics/outboundReports';
import type { OutboundEntityType } from '../../lib/analytics/outboundTracking';
import { useAppStore } from '../../store/appStore';

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

  const load = async () => {
    if (!from || !to || from > to) {
      addToast({ message: 'Choose a valid analytics date range.', type: 'error' });
      return;
    }
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
  }, []);

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

          <div className="grid gap-6 xl:grid-cols-2">
            <BreakdownTable
              title="By destination"
              empty="No outbound destination activity in this range."
              rows={(summary.byDestination ?? []).map((row) => ({
                primary: row.destinationType?.replaceAll('_', ' ') || 'Unknown',
                secondary: 'External action type',
                qualified: row.qualifiedClicks,
                total: row.totalClicks,
              }))}
            />
            <BreakdownTable
              title="By placement"
              empty="No placement activity in this range."
              rows={(summary.byPlacement ?? []).map((row) => ({
                primary: row.placement || 'Unknown placement',
                secondary: row.surface?.replaceAll('_', ' ') || 'Unknown surface',
                qualified: row.qualifiedClicks,
                total: row.totalClicks,
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

const BreakdownTable: React.FC<{
  title: string;
  empty: string;
  rows: Array<{ primary: string; secondary: string; qualified: number; total: number }>;
}> = ({ title, empty, rows }) => (
  <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
    <div className="border-b border-gray-200 px-5 py-4"><h2 className="font-bold text-gray-900">{title}</h2></div>
    {!rows.length ? <div className="p-6 text-sm text-gray-500">{empty}</div> : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Category</th><th className="px-5 py-3 text-right">Qualified</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => <tr key={`${row.primary}-${row.secondary}`}><td className="px-5 py-3"><div className="font-semibold capitalize text-gray-900">{row.primary}</div><div className="text-xs capitalize text-gray-500">{row.secondary}</div></td><td className="px-5 py-3 text-right font-bold tabular-nums text-blue-700">{formatNumber(row.qualified)}</td><td className="px-5 py-3 text-right tabular-nums text-gray-600">{formatNumber(row.total)}</td></tr>)}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export default AdminOutboundAnalytics;
