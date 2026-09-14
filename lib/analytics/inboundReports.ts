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

export const applyInboundRetention = async (): Promise<{ deletedRawSessions: number }> => {
  const { data, error } = await supabase.rpc('inbound_apply_retention');
  if (error) throw error;
  return data as { deletedRawSessions: number };
};
