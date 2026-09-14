import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Globe2, Laptop, LoaderCircle, MapPin, RefreshCw, Route, ShieldCheck } from 'lucide-react';
import { getInboundAnalyticsSummary, type InboundAnalyticsSummary } from '../../lib/analytics/inboundReports';
import { useAppStore } from '../../store/appStore';

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);
const formatNumber = (value?: number): string => new Intl.NumberFormat('en-US').format(value ?? 0);

const AdminInboundAnalytics: React.FC = () => {
  const { addToast } = useAppStore();
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(() => new Date(today.getTime() - 29 * 86_400_000), [today]);
  const [from, setFrom] = useState(toDateInput(thirtyDaysAgo));
  const [to, setTo] = useState(toDateInput(today));
  const [summary, setSummary] = useState<InboundAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    if (!from || !to || from > to) {
      addToast({ message: 'Choose a valid analytics date range.', type: 'error' });
      return;
    }
    setIsLoading(true);
    try {
      setSummary(await getInboundAnalyticsSummary({ from, to }));
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to load inbound analytics.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const topSource = summary?.bySource?.[0];
  const topLanding = summary?.byLanding?.[0];
  const topDevice = summary?.byDevice?.[0];
  const topCountry = summary?.byCountry?.[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">Traffic acquisition</p>
          <h1 className="mt-1 text-3xl font-black text-gray-900">Inbound Analytics</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">See how visitors arrive at SwingSphere: referral source, landing page, device class, country, region, and campaign attribution. Geography is supplied at the Cloudflare edge and stored only at coarse country/region level.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} /> Run report
        </button>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <p className="leading-6"><strong>Privacy-conscious acquisition data:</strong> SwingSphere stores the referring domain rather than the full referrer URL, the landing path without its query string, coarse country/region rather than precise location, and a rotating browser-session ID rather than a cross-device identity. IP addresses and user-agent strings are not stored in these analytics tables.</p>
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
        </div>
      </section>

      {isLoading ? (
        <div className="flex min-h-52 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500"><LoaderCircle size={18} className="mr-2 animate-spin" /> Loading report…</div>
      ) : summary ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={<BarChart3 size={14} />} label="Sessions" value={formatNumber(summary.totalSessions)} emphasis />
            <MetricCard icon={<Route size={14} />} label="Top source" value={topSource?.sourceName ?? '—'} footnote={topSource ? `${formatNumber(topSource.sessions)} sessions · ${topSource.sourceCategory}` : undefined} />
            <MetricCard icon={<MapPin size={14} />} label="Top landing" value={topLanding?.landingPath ?? '—'} footnote={topLanding ? `${formatNumber(topLanding.sessions)} sessions` : undefined} />
            <MetricCard icon={<Laptop size={14} />} label="Top device" value={topDevice?.deviceClass ?? '—'} footnote={topDevice ? `${formatNumber(topDevice.sessions)} sessions` : undefined} />
            <MetricCard icon={<Globe2 size={14} />} label="Top country" value={topCountry?.countryCode ?? '—'} footnote={topCountry ? `${formatNumber(topCountry.sessions)} sessions` : undefined} />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <SimpleBreakdown title="Traffic sources" empty="No inbound sessions in this range." rows={(summary.bySource ?? []).map((row) => ({ primary: row.sourceName, secondary: row.sourceCategory, sessions: row.sessions }))} />
            <SimpleBreakdown title="Referring domains" empty="No external referrers in this range." rows={(summary.byReferrer ?? []).map((row) => ({ primary: row.referrerDomain, secondary: 'referrer domain', sessions: row.sessions }))} />
            <SimpleBreakdown title="Landing pages" empty="No landing pages in this range." rows={(summary.byLanding ?? []).map((row) => ({ primary: row.landingPath, secondary: 'entry path', sessions: row.sessions }))} />
            <SimpleBreakdown title="Devices" empty="No device data in this range." rows={(summary.byDevice ?? []).map((row) => ({ primary: row.deviceClass, secondary: 'device class', sessions: row.sessions }))} />
            <SimpleBreakdown title="Countries" empty="No country data in this range." rows={(summary.byCountry ?? []).map((row) => ({ primary: row.countryCode || 'Unknown', secondary: 'Cloudflare country', sessions: row.sessions }))} />
            <SimpleBreakdown title="Regions" empty="No region data in this range." rows={(summary.byRegion ?? []).map((row) => ({ primary: row.regionName || row.regionCode || 'Unknown', secondary: [row.regionCode, row.countryCode].filter(Boolean).join(' · '), sessions: row.sessions }))} />
          </div>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4"><h2 className="font-bold text-gray-900">Campaign attribution</h2></div>
            {!summary.byCampaign?.length ? <div className="p-6 text-sm text-gray-500">No UTM or SwingSphere campaign traffic in this range.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Campaign</th><th className="px-5 py-3">Source / medium</th><th className="px-5 py-3 text-right">Sessions</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.byCampaign.map((row, index) => (
                      <tr key={`${row.campaignKey}-${row.utmCampaign}-${index}`}>
                        <td className="px-5 py-3"><div className="font-semibold text-gray-900">{row.utmCampaign || row.campaignKey || 'Campaign'}</div>{row.campaignKey ? <div className="text-xs text-gray-500">{row.campaignKey}</div> : null}</td>
                        <td className="px-5 py-3 text-gray-600">{[row.utmSource, row.utmMedium].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-violet-700">{formatNumber(row.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; emphasis?: boolean; footnote?: string }> = ({ icon, label, value, emphasis = false, footnote }) => (
  <div className={`rounded-xl border p-5 shadow-sm ${emphasis ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white'}`}>
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">{icon}{label}</div>
    <div className={`mt-2 break-words text-2xl font-black ${emphasis ? 'text-violet-700' : 'text-gray-900'}`}>{value}</div>
    {footnote ? <div className="mt-1 text-[11px] capitalize text-gray-500">{footnote}</div> : null}
  </div>
);

const SimpleBreakdown: React.FC<{
  title: string;
  empty: string;
  rows: Array<{ primary: string; secondary: string; sessions: number }>;
}> = ({ title, empty, rows }) => (
  <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
    <div className="border-b border-gray-200 px-5 py-4"><h2 className="font-bold text-gray-900">{title}</h2></div>
    {!rows.length ? <div className="p-6 text-sm text-gray-500">{empty}</div> : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Category</th><th className="px-5 py-3 text-right">Sessions</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => <tr key={`${row.primary}-${row.secondary}-${index}`}><td className="px-5 py-3"><div className="font-semibold text-gray-900">{row.primary}</div><div className="text-xs capitalize text-gray-500">{row.secondary}</div></td><td className="px-5 py-3 text-right font-bold tabular-nums text-violet-700">{formatNumber(row.sessions)}</td></tr>)}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export default AdminInboundAnalytics;
