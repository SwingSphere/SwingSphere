import { supabase } from '../supabase';
import type { OutboundEntityType } from './outboundTracking';

export type OutboundSummaryBreakdown = {
  destinationType?: string;
  placement?: string;
  surface?: string;
  qualifiedClicks: number;
  totalClicks: number;
};

export type OutboundLinkBreakdown = {
  destinationType: string;
  destinationDomain: string;
  destinationPath: string;
  qualifiedClicks: number;
  totalClicks: number;
};

export type OutboundEntityBreakdown = {
  entityType: string;
  entityId: string;
  organizationId: string;
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
  byLink: OutboundLinkBreakdown[];
  byEntity: OutboundEntityBreakdown[];
};

export type OutboundAnalyticsDetail = {
  from: string;
  to: string;
  totalClicks: number;
  qualifiedClicks: number;
  rawRetentionDays: number;
  byLink: OutboundLinkBreakdown[];
  byEntity: OutboundEntityBreakdown[];
  recentClicks: Array<{
    occurredAt: string;
    entityType: string;
    entityId: string;
    organizationId: string;
    destinationType: string;
    destinationDomain: string;
    destinationPath: string;
    placement: string;
    surface: string;
    campaignKey: string;
    deviceClass: string;
    interactionType: string;
    qualified: boolean;
  }>;
};

export type OutboundAnalyticsDetailFilter = {
  from: string;
  to: string;
  destinationType?: string | null;
  destinationDomain?: string | null;
  destinationPath?: string | null;
  placement?: string | null;
  surface?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  limit?: number;
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

export const getOutboundAnalyticsDetail = async (
  filters: OutboundAnalyticsDetailFilter,
): Promise<OutboundAnalyticsDetail> => {
  const { data, error } = await supabase.rpc('outbound_admin_detail', {
    p_from: filters.from,
    p_to: filters.to,
    p_destination_type: filters.destinationType ?? null,
    p_destination_domain: filters.destinationDomain ?? null,
    p_destination_path: filters.destinationPath ?? null,
    p_placement: filters.placement ?? null,
    p_surface: filters.surface ?? null,
    p_entity_type: filters.entityType ?? null,
    p_entity_id: filters.entityId ?? null,
    p_limit: filters.limit ?? 100,
  });
  if (error) throw error;
  return data as OutboundAnalyticsDetail;
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
