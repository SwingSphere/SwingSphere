import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronRight, ExternalLink, Globe2, Laptop, LoaderCircle, MapPin, RefreshCw, Route, ShieldCheck, X } from 'lucide-react';
import {
  getInboundAnalyticsDetail,
  getInboundAnalyticsSummary,
  type InboundAnalyticsDetail,
  type InboundAnalyticsDetailFilter,
  type InboundAnalyticsSummary,
} from '../../lib/analytics/inboundReports';
import { useAppStore } from '../../store/appStore';

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);
const formatNumber = (value?: number): string => new Intl.NumberFormat('en-US').format(value ?? 0);

const friendlySourceName = (sourceName: string): string => {
  if (sourceName === 'direct') return 'Direct / unknown referrer';
  if (sourceName === 'com.reddit.frontpage') return 'Reddit (legacy app referrer)';
  return sourceName.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const friendlyReferrerName = (domain: string): string => {
  if (domain === 'com.reddit.frontpage') return 'Reddit app';
  if (domain === 'com.instagram.android') return 'Instagram app';
  if (domain === 'com.facebook.katana') return 'Facebook app';
  return domain;
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
  title: string;
  description: string;
  filter: Omit<InboundAnalyticsDetailFilter, 'from' | 'to'>;
  referrerDomain?: string;
};

const AdminInboundAnalytics: React.FC = () => {
  const { addToast } = useAppStore();
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(() => new Date(today.getTime() - 29 * 86_400_000), [today]);
  const [from, setFrom] = useState(toDateInput(thirtyDaysAgo));
  const [to, setTo] = useState(toDateInput(today));
  const [summary, setSummary] = useState<InboundAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);
  const [detail, setDetail] = useState<InboundAnalyticsDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

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

  const openDetail = async (selection: DetailSelection) => {
    setDetailSelection(selection);
    setDetail(null);
    setIsDetailLoading(true);
    try {
      setDetail(await getInboundAnalyticsDetail({
        from: summary?.from ?? from,
        to: summary?.to ?? to,
        ...selection.filter,
      }));
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to load source details.', type: 'error' });
    } finally {
      setIsDetailLoading(false);
    }
  };

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
          <p className="leading-6"><strong>Privacy-conscious acquisition data:</strong> SwingSphere stores the referring domain and, when the browser supplies it, the referrer path with query strings and fragments removed. Landing paths are also stored without their query string. Geography remains coarse country/region only, and analytics use a rotating browser-session ID rather than a cross-device identity. IP addresses and user-agent strings are not stored.</p>
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
            <MetricCard icon={<Route size={14} />} label="Top source" value={topSource ? friendlySourceName(topSource.sourceName) : '—'} footnote={topSource ? `${formatNumber(topSource.sessions)} sessions · ${topSource.sourceCategory}` : undefined} />
            <MetricCard icon={<MapPin size={14} />} label="Top landing" value={topLanding?.landingPath ?? '—'} footnote={topLanding ? `${formatNumber(topLanding.sessions)} sessions` : undefined} />
            <MetricCard icon={<Laptop size={14} />} label="Top device" value={topDevice?.deviceClass ?? '—'} footnote={topDevice ? `${formatNumber(topDevice.sessions)} sessions` : undefined} />
            <MetricCard icon={<Globe2 size={14} />} label="Top country" value={topCountry?.countryCode ?? '—'} footnote={topCountry ? `${formatNumber(topCountry.sessions)} sessions` : undefined} />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <SimpleBreakdown
              title="Traffic sources"
              empty="No inbound sessions in this range."
              rows={(summary.bySource ?? []).map((row) => ({
                primary: friendlySourceName(row.sourceName),
                secondary: row.sourceCategory === 'direct'
                  ? 'No referrer or campaign data was supplied'
                  : row.sourceCategory,
                sessions: row.sessions,
                onClick: () => void openDetail({
                  title: friendlySourceName(row.sourceName),
                  description: row.sourceCategory === 'direct'
                    ? 'Direct means the browser supplied no external referrer and the visit had no campaign attribution. This can include typed/bookmarked URLs, copied links, messages, apps, privacy-protected browsers, and some redirects.'
                    : `Recent arrivals attributed to ${friendlySourceName(row.sourceName)}.`,
                  filter: { sourceCategory: row.sourceCategory, sourceName: row.sourceName },
                }),
              }))}
            />
            <SimpleBreakdown
              title="Referring domains"
              empty="No external referrers in this range."
              rows={(summary.byReferrer ?? []).map((row) => ({
                primary: friendlyReferrerName(row.referrerDomain),
                secondary: row.referrerDomain === 'com.reddit.frontpage'
                  ? 'Reddit Android app · tap for available source detail'
                  : `${row.referrerDomain} · tap for available source detail`,
                sessions: row.sessions,
                onClick: () => void openDetail({
                  title: friendlyReferrerName(row.referrerDomain),
                  description: 'Exact source paths appear only when the referring browser or app provides them. Some sites intentionally send only their domain.',
                  filter: { referrerDomain: row.referrerDomain },
                  referrerDomain: row.referrerDomain,
                }),
              }))}
            />
            <SimpleBreakdown title="Landing pages" empty="No landing pages in this range." rows={(summary.byLanding ?? []).map((row) => ({ primary: row.landingPath, secondary: 'entry path', sessions: row.sessions }))} />
            <SimpleBreakdown title="Devices" empty="No device data in this range." rows={(summary.byDevice ?? []).map((row) => ({ primary: row.deviceClass, secondary: 'device class', sessions: row.sessions }))} />
            <SimpleBreakdown title="Countries" empty="No country data in this range." rows={(summary.byCountry ?? []).map((row) => ({ primary: row.countryCode || 'Unknown', secondary: 'Cloudflare country', sessions: row.sessions }))} />
            <SimpleBreakdown title="Regions" empty="No region data in this range." rows={(summary.byRegion ?? []).map((row) => ({ primary: row.regionName || row.regionCode || 'Unknown', secondary: [row.regionCode, row.countryCode].filter(Boolean).join(' · '), sessions: row.sessions }))} />
          </div>

          {detailSelection ? (
            <InboundDetailPanel
              selection={detailSelection}
              detail={detail}
              isLoading={isDetailLoading}
              onClose={() => {
                setDetailSelection(null);
                setDetail(null);
              }}
            />
          ) : null}

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

const InboundDetailPanel: React.FC<{
  selection: DetailSelection;
  detail: InboundAnalyticsDetail | null;
  isLoading: boolean;
  onClose: () => void;
}> = ({ selection, detail, isLoading, onClose }) => (
  <section className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
    <div className="flex items-start justify-between gap-4 border-b border-violet-100 bg-violet-50 px-5 py-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">Source detail</p>
        <h2 className="mt-1 text-xl font-black text-gray-900">{selection.title}</h2>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-gray-600">{selection.description}</p>
      </div>
      <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-gray-900" aria-label="Close source detail">
        <X size={18} />
      </button>
    </div>

    {isLoading ? (
      <div className="flex min-h-40 items-center justify-center text-sm text-gray-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Loading source detail…</div>
    ) : detail ? (
      <div className="space-y-6 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Sessions in range</div>
            <div className="mt-1 text-2xl font-black text-gray-900">{formatNumber(detail.totalSessions)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 md:col-span-2">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Raw-detail retention</div>
            <p className="mt-1 text-sm leading-5 text-gray-700">Recent session rows are kept for {detail.rawRetentionDays || 90} days. Aggregate counts remain available longer.</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-gray-200">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="font-bold text-gray-900">Exact referrer paths</h3>
              <p className="mt-1 text-xs text-gray-500">Available only when the source site/app sends a path. Query strings and fragments are never stored.</p>
            </div>
            {!detail.topReferrerPaths?.length ? (
              <div className="p-4 text-sm leading-6 text-gray-500">No exact path was supplied for these visits. This is normal for Reddit, messaging apps, privacy-protected browsers, and sites using origin-only referrer policies. Visits recorded before this analytics upgrade also have domain-only attribution.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {detail.topReferrerPaths.map((row, index) => {
                  const domain = selection.referrerDomain
                    || detail.recentSessions?.find((session) => session.referrerPath === row.referrerPath)?.referrerDomain
                    || '';
                  const sourceUrl = sourceUrlFor(domain, row.referrerPath);
                  return (
                    <div key={`${row.referrerPath}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <div className="break-all text-sm font-semibold text-gray-900">{normalizeReferrerPathForDisplay(domain, row.referrerPath)}</div>
                        {domain ? <div className="mt-0.5 text-xs text-gray-500">{friendlyReferrerName(domain)}</div> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-bold tabular-nums text-violet-700">{formatNumber(row.sessions)}</span>
                        {sourceUrl ? (
                          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-violet-700" aria-label="Open referring source">
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

          <div className="rounded-xl border border-gray-200">
            <div className="border-b border-gray-100 px-4 py-3"><h3 className="font-bold text-gray-900">Landing pages</h3></div>
            {!detail.topLandings?.length ? <div className="p-4 text-sm text-gray-500">No landing-page data.</div> : (
              <div className="divide-y divide-gray-100">
                {detail.topLandings.slice(0, 12).map((row, index) => (
                  <div key={`${row.landingPath}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="break-all text-sm font-semibold text-gray-900">{row.landingPath}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-violet-700">{formatNumber(row.sessions)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-bold text-gray-900">Recent arrivals</h3>
            <p className="mt-1 text-xs text-gray-500">Session-level detail retained temporarily for acquisition debugging. No IP address or user-agent string is stored.</p>
          </div>
          {!detail.recentSessions?.length ? (
            <div className="p-4 text-sm text-gray-500">No raw session rows remain for this selection. Older aggregate totals may still be shown above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3">Arrived</th><th className="px-4 py-3">Source detail</th><th className="px-4 py-3">Landing</th><th className="px-4 py-3">Device / region</th><th className="px-4 py-3">Campaign</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.recentSessions.map((session, index) => {
                    const sourceUrl = sourceUrlFor(session.referrerDomain, session.referrerPath);
                    return (
                      <tr key={`${session.occurredAt}-${index}`}>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{new Date(session.occurredAt).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{friendlySourceName(session.sourceName)}</div>
                          {session.referrerDomain ? <div className="text-xs text-gray-500">{friendlyReferrerName(session.referrerDomain)}</div> : null}
                          {session.referrerPath ? (
                            <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                              <span className="max-w-[300px] break-all">{normalizeReferrerPathForDisplay(session.referrerDomain, session.referrerPath)}</span>
                              {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-violet-600" aria-label="Open referring source"><ExternalLink size={12} /></a> : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-700">{session.landingPath}</td>
                        <td className="px-4 py-3 text-gray-600">{[session.deviceClass, session.regionName || session.regionCode, session.countryCode].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{session.utmCampaign || session.campaignKey || [session.utmSource, session.utmMedium].filter(Boolean).join(' / ') || '—'}</td>
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

const SimpleBreakdown: React.FC<{
  title: string;
  empty: string;
  rows: Array<{ primary: string; secondary: string; sessions: number; onClick?: () => void }>;
}> = ({ title, empty, rows }) => (
  <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
    <div className="border-b border-gray-200 px-5 py-4"><h2 className="font-bold text-gray-900">{title}</h2></div>
    {!rows.length ? <div className="p-6 text-sm text-gray-500">{empty}</div> : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Category</th><th className="px-5 py-3 text-right">Sessions</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => (
              <tr key={`${row.primary}-${row.secondary}-${index}`} className={row.onClick ? 'transition hover:bg-violet-50/60' : ''}>
                <td className="p-0" colSpan={row.onClick ? 2 : 1}>
                  {row.onClick ? (
                    <button type="button" onClick={row.onClick} className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left">
                      <span className="min-w-0"><span className="block font-semibold text-gray-900">{row.primary}</span><span className="block text-xs text-gray-500">{row.secondary}</span></span>
                      <span className="flex shrink-0 items-center gap-2"><span className="font-bold tabular-nums text-violet-700">{formatNumber(row.sessions)}</span><ChevronRight size={15} className="text-gray-400" /></span>
                    </button>
                  ) : (
                    <div className="px-5 py-3"><div className="font-semibold text-gray-900">{row.primary}</div><div className="text-xs capitalize text-gray-500">{row.secondary}</div></div>
                  )}
                </td>
                {!row.onClick ? <td className="px-5 py-3 text-right font-bold tabular-nums text-violet-700">{formatNumber(row.sessions)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export default AdminInboundAnalytics;
