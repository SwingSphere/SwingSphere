import { supabase } from '../supabase';
import type { OutboundEntityType } from './outboundTracking';

export type OutboundSummaryBreakdown = {
  destinationType?: string;
  placement?: string;
  surface?: string;
  qualifiedClicks: number;
  totalClicks: number;
};

export type OutboundAnalyticsSummary = {
  from: string;
  to: string;
  totalClicks: number;
  qualifiedClicks: number;
  dailyUniqueSessions: number;
  dailyUniqueUsers: number;
  uniqueCountsComplete: boolean;
  uniqueCountCoverageStart: string;
  byDestination: OutboundSummaryBreakdown[];
  byPlacement: OutboundSummaryBreakdown[];
};

export const getOutboundAnalyticsSummary = async (filters: {
  from: string;
  to: string;
  entityType?: OutboundEntityType;
  entityId?: string;
  organizationId?: string;
  campaignKey?: string;
}): Promise<OutboundAnalyticsSummary> => {
  const { data, error } = await supabase.rpc('outbound_admin_summary', {
    p_from: filters.from,
    p_to: filters.to,
    p_entity_type: filters.entityType ?? null,
    p_entity_id: filters.entityId ?? null,
    p_organization_id: filters.organizationId ?? null,
    p_campaign_key: filters.campaignKey ?? null,
  });
  if (error) throw error;
  return data as OutboundAnalyticsSummary;
};

export const applyOutboundRetention = async (): Promise<{
  anonymizedRawClicks: number;
  deletedRawClicks: number;
  deletedSessionHashes: number;
  deletedUserHashes: number;
}> => {
  const { data, error } = await supabase.rpc('outbound_apply_retention');
  if (error) throw error;
  return data as {
    anonymizedRawClicks: number;
    deletedRawClicks: number;
    deletedSessionHashes: number;
    deletedUserHashes: number;
  };
};
