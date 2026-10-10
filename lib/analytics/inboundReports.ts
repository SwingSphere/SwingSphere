import { supabase } from '../supabase';

export type InboundAnalyticsKpis = {
  viewsToday: number;
  sessionsToday: number;
  viewsYesterday: number;
  sessionsYesterday: number;
  views7d: number;
  sessions7d: number;
  viewsPrev7d: number;
  sessionsPrev7d: number;
  views30d: number;
  sessions30d: number;
  viewsPrev30d: number;
  sessionsPrev30d: number;
  viewsAllTime: number;
  sessionsAllTime: number;
  visitorsAllTime: number;
  firstRecordedDay: string | null;
};

export type InboundPreviousPeriod = {
  from: string;
  to: string;
  totalSessions: number;
  totalViews: number;
  totalUniqueVisitors: number;
};

export type InboundDailyPoint = {
  day: string;
  sessions: number;
  views?: number;
  visitors?: number;
};

export type InboundHourlyPoint = {
  hour: string;
  sessions: number;
  views?: number;
};

export type InboundPageViewRow = {
  pagePath: string;
  views: number;
  entrySessions: number;
  uniqueSessions: number;
};

export type InboundDeviceOsRow = {
  deviceClass: string;
  osFamily: string;
  sessions: number;
};

export type InboundBrowserRow = {
  browserFamily: string;
  sessions: number;
};

export type InboundAnalyticsSummary = {
  from: string;
  to: string;
  totalSessions: number;
  totalViews?: number;
  totalUniqueVisitors?: number;
  previousPeriod?: InboundPreviousPeriod;
  kpis?: InboundAnalyticsKpis;
  bySource: Array<{
    sourceCategory: string;
    sourceName: string;
    sessions: number;
    visitors?: number;
    views?: number;
  }>;
  byReferrer: Array<{ referrerDomain: string; sessions: number }>;
  byLanding: Array<{ landingPath: string; sessions: number }>;
  byPageView?: InboundPageViewRow[];
  byDevice: Array<{ deviceClass: string; sessions: number }>;
  byDeviceOs?: InboundDeviceOsRow[];
  byBrowser?: InboundBrowserRow[];
  byCountry: Array<{ countryCode: string; sessions: number }>;
  byRegion: Array<{ countryCode: string; regionCode: string; regionName: string; sessions: number }>;
  byCampaign: Array<{ campaignKey: string; utmSource: string; utmMedium: string; utmCampaign: string; sessions: number }>;
  daily: InboundDailyPoint[];
  previousDaily?: InboundDailyPoint[];
  hourly?: InboundHourlyPoint[];
};

export type InboundAnalyticsDetail = {
  from: string;
  to: string;
  totalSessions: number;
  rawRetentionDays: number;
  topReferrerPaths: Array<{ referrerPath: string; sessions: number }>;
  topLandings: Array<{ landingPath: string; sessions: number }>;
  campaigns: Array<{ campaignKey: string; utmSource: string; utmMedium: string; utmCampaign: string; sessions: number }>;
  recentSessions: Array<{
    occurredAt: string;
    sourceCategory: string;
    sourceName: string;
    referrerDomain: string;
    referrerPath: string;
    landingPath: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    campaignKey: string;
    deviceClass: string;
    osFamily?: string;
    browserFamily?: string;
    countryCode: string;
    regionCode: string;
    regionName: string;
  }>;
};

export type InboundAnalyticsDetailFilter = {
  from: string;
  to: string;
  sourceCategory?: string | null;
  sourceName?: string | null;
  referrerDomain?: string | null;
  limit?: number;
};

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (dateStr: string, days: number): string => {
  const base = new Date(`${dateStr}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return toIsoDate(base);
};

const diffDaysInclusive = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
};

/**
 * If the connected Supabase instance has not yet applied the v3 analytics migration,
 * synthesize KPI windows, previousPeriod, and page-view fallbacks from the existing
 * v2 rollup data without manufacturing any fake numbers.
 */
const enrichLegacyInboundSummary = async (
  raw: InboundAnalyticsSummary,
  filters: { from: string; to: string },
): Promise<InboundAnalyticsSummary> => {
  if (raw.kpis && raw.previousPeriod) {
    return raw;
  }

  const todayStr = toIsoDate(new Date());
  const yesterdayStr = addDays(todayStr, -1);
  const last7Start = addDays(todayStr, -6);
  const prev7Start = addDays(todayStr, -13);
  const prev7End = addDays(todayStr, -7);
  const last30Start = addDays(todayStr, -29);
  const prev30Start = addDays(todayStr, -59);
  const prev30End = addDays(todayStr, -30);

  const span = diffDaysInclusive(filters.from, filters.to);
  const prevTo = addDays(filters.from, -1);
  const prevFrom = addDays(filters.from, -span);

  let allDaily: InboundDailyPoint[] = raw.daily ?? [];
  let recentHourly: InboundHourlyPoint[] = raw.hourly ?? [];

  try {
    // One lightweight rollup query covering all historical days gives exact KPI windows & previous period
    const { data: allTimeData } = await supabase.rpc('inbound_admin_summary', {
      p_from: '2024-01-01',
      p_to: todayStr,
    });
    if (allTimeData && Array.isArray((allTimeData as InboundAnalyticsSummary).daily)) {
      allDaily = (allTimeData as InboundAnalyticsSummary).daily;
    }
  } catch {
    // Keep raw.daily if secondary query is unavailable (e.g. in unit/browser mock tests).
  }

  // If range is <= 2 days and hourly is missing, derive hourly from recentSessions in detail RPC
  if (!recentHourly.length && span <= 2) {
    try {
      const { data: detailData } = await supabase.rpc('inbound_admin_source_detail', {
        p_from: addDays(filters.to, -1),
        p_to: filters.to,
        p_source_category: null,
        p_source_name: null,
        p_referrer_domain: null,
        p_limit: 250,
      });
      const recentSessions = (detailData as InboundAnalyticsDetail | null)?.recentSessions ?? [];
      const hourCounts = new Map<string, number>();
      for (const session of recentSessions) {
        if (!session.occurredAt) continue;
        const d = new Date(session.occurredAt);
        if (Number.isNaN(d.getTime())) continue;
        const bucket = `${d.toISOString().slice(0, 13)}:00:00Z`;
        hourCounts.set(bucket, (hourCounts.get(bucket) ?? 0) + 1);
      }
      recentHourly = Array.from(hourCounts.entries())
        .map(([hour, sessions]) => ({ hour, sessions, views: sessions }))
        .sort((a, b) => a.hour.localeCompare(b.hour));
    } catch {
      // Ignore if unavailable.
    }
  }

  const sumRange = (start: string, end: string): number =>
    allDaily
      .filter((d) => d.day >= start && d.day <= end)
      .reduce((acc, d) => acc + Number(d.sessions || 0), 0);

  const sessionsToday = sumRange(todayStr, todayStr);
  const sessionsYesterday = sumRange(yesterdayStr, yesterdayStr);
  const sessions7d = sumRange(last7Start, todayStr);
  const sessionsPrev7d = sumRange(prev7Start, prev7End);
  const sessions30d = sumRange(last30Start, todayStr);
  const sessionsPrev30d = sumRange(prev30Start, prev30End);
  const sessionsAllTime = Math.max(
    Number(raw.totalSessions || 0),
    allDaily.reduce((acc, d) => acc + Number(d.sessions || 0), 0),
  );
  const prevSessions = sumRange(prevFrom, prevTo);
  const previousDaily = allDaily
    .filter((d) => d.day >= prevFrom && d.day <= prevTo)
    .map((d) => ({ ...d, views: d.views ?? d.sessions }));

  const firstRecordedDay = allDaily.length ? allDaily[0].day : null;
  const totalSessions = Number(raw.totalSessions || 0);

  return {
    ...raw,
    totalSessions,
    totalViews: raw.totalViews ?? totalSessions,
    totalUniqueVisitors: raw.totalUniqueVisitors ?? totalSessions,
    previousPeriod: raw.previousPeriod ?? {
      from: prevFrom,
      to: prevTo,
      totalSessions: prevSessions,
      totalViews: prevSessions,
      totalUniqueVisitors: prevSessions,
    },
    kpis: raw.kpis ?? {
      viewsToday: sessionsToday,
      sessionsToday,
      viewsYesterday: sessionsYesterday,
      sessionsYesterday,
      views7d: sessions7d,
      sessions7d,
      viewsPrev7d: sessionsPrev7d,
      sessionsPrev7d,
      views30d: sessions30d,
      sessions30d,
      viewsPrev30d: sessionsPrev30d,
      sessionsPrev30d,
      viewsAllTime: sessionsAllTime,
      sessionsAllTime,
      visitorsAllTime: sessionsAllTime,
      firstRecordedDay,
    },
    bySource: (raw.bySource ?? []).map((row) => ({
      ...row,
      visitors: row.visitors ?? row.sessions,
      views: row.views ?? row.sessions,
    })),
    byPageView:
      raw.byPageView
      ?? (raw.byLanding ?? []).map((row) => ({
        pagePath: row.landingPath,
        views: row.sessions,
        entrySessions: row.sessions,
        uniqueSessions: row.sessions,
      })),
    byDeviceOs:
      raw.byDeviceOs
      ?? (raw.byDevice ?? []).map((row) => ({
        deviceClass: row.deviceClass,
        osFamily: 'unknown',
        sessions: row.sessions,
      })),
    byBrowser: raw.byBrowser ?? [],
    daily: (raw.daily ?? []).map((d) => ({
      ...d,
      views: d.views ?? d.sessions,
      visitors: d.visitors ?? d.sessions,
    })),
    previousDaily,
    hourly: recentHourly,
  };
};

export const getInboundAnalyticsSummary = async (filters: {
  from: string;
  to: string;
}): Promise<InboundAnalyticsSummary> => {
  const { data, error } = await supabase.rpc('inbound_admin_summary', {
    p_from: filters.from,
    p_to: filters.to,
  });
  if (error) throw error;
  return enrichLegacyInboundSummary(data as InboundAnalyticsSummary, filters);
};

export const getInboundAnalyticsDetail = async (
  filters: InboundAnalyticsDetailFilter,
): Promise<InboundAnalyticsDetail> => {
  const { data, error } = await supabase.rpc('inbound_admin_source_detail', {
    p_from: filters.from,
    p_to: filters.to,
    p_source_category: filters.sourceCategory ?? null,
    p_source_name: filters.sourceName ?? null,
    p_referrer_domain: filters.referrerDomain ?? null,
    p_limit: filters.limit ?? 100,
  });
  if (error) throw error;
  return data as InboundAnalyticsDetail;
};

export const applyInboundRetention = async (): Promise<{ deletedRawSessions: number }> => {
  const { data, error } = await supabase.rpc('inbound_apply_retention');
  if (error) throw error;
  return data as { deletedRawSessions: number };
};
