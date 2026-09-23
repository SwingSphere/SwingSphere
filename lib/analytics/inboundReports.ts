import { supabase } from '../supabase';

export type InboundAnalyticsSummary = {
  from: string;
  to: string;
  totalSessions: number;
  bySource: Array<{ sourceCategory: string; sourceName: string; sessions: number }>;
  byReferrer: Array<{ referrerDomain: string; sessions: number }>;
  byLanding: Array<{ landingPath: string; sessions: number }>;
  byDevice: Array<{ deviceClass: string; sessions: number }>;
  byCountry: Array<{ countryCode: string; sessions: number }>;
  byRegion: Array<{ countryCode: string; regionCode: string; regionName: string; sessions: number }>;
  byCampaign: Array<{ campaignKey: string; utmSource: string; utmMedium: string; utmCampaign: string; sessions: number }>;
  daily: Array<{ day: string; sessions: number }>;
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

export const getInboundAnalyticsSummary = async (filters: {
  from: string;
  to: string;
}): Promise<InboundAnalyticsSummary> => {
  const { data, error } = await supabase.rpc('inbound_admin_summary', {
    p_from: filters.from,
    p_to: filters.to,
  });
  if (error) throw error;
  return data as InboundAnalyticsSummary;
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
