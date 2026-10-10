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

export type OutboundEntityDestinationBreakdown = {
  entityType: string;
  entityId: string;
  organizationId: string;
  destinationType: string;
  destinationDomain: string;
  destinationPath: string;
  qualifiedClicks: number;
  totalClicks: number;
};

export type OutboundDomainBreakdown = {
  destinationDomain: string;
  destinationType: string;
  qualifiedClicks: number;
  totalClicks: number;
  entityCount?: number;
};

export type OutboundDailyPoint = {
  day: string;
  qualifiedClicks: number;
  totalClicks: number;
};

export type OutboundHourlyPoint = {
  hour: string;
  qualifiedClicks: number;
  totalClicks: number;
};

export type OutboundAnalyticsKpis = {
  clicksToday: number;
  qualifiedToday: number;
  clicksYesterday: number;
  qualifiedYesterday: number;
  clicks7d: number;
  qualified7d: number;
  clicksPrev7d: number;
  qualifiedPrev7d: number;
  clicks30d: number;
  qualified30d: number;
  clicksPrev30d: number;
  qualifiedPrev30d: number;
  clicksAllTime: number;
  qualifiedAllTime: number;
  firstRecordedDay: string | null;
};

export type OutboundPreviousPeriod = {
  from: string;
  to: string;
  totalClicks: number;
  qualifiedClicks: number;
};

export type OutboundAnalyticsSummary = {
  from: string;
  to: string;
  totalClicks: number;
  qualifiedClicks: number;
  uniqueDomains?: number;
  uniqueDestinations?: number;
  dailyUniqueSessions: number;
  dailyUniqueUsers: number;
  uniqueCountsComplete: boolean;
  uniqueCountCoverageStart: string;
  previousPeriod?: OutboundPreviousPeriod;
  kpis?: OutboundAnalyticsKpis;
  byDestination: OutboundSummaryBreakdown[];
  byPlacement: OutboundSummaryBreakdown[];
  byLink: OutboundLinkBreakdown[];
  byEntity: OutboundEntityBreakdown[];
  byEntityDestination?: OutboundEntityDestinationBreakdown[];
  byDomain?: OutboundDomainBreakdown[];
  daily?: OutboundDailyPoint[];
  previousDaily?: OutboundDailyPoint[];
  hourly?: OutboundHourlyPoint[];
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
 * Enriches legacy v2 outbound_admin_summary responses when the v3 SQL migration
 * has not yet been pushed to the remote database.
 */
const enrichLegacyOutboundSummary = async (
  raw: OutboundAnalyticsSummary,
  filters: {
    from: string;
    to: string;
    entityType?: OutboundEntityType;
    entityId?: string;
    organizationId?: string;
    campaignKey?: string;
  },
): Promise<OutboundAnalyticsSummary> => {
  const byLink = raw.byLink ?? [];
  const byEntity = raw.byEntity ?? [];

  // Build domain breakdown from byLink if not supplied by v3 RPC
  const domainMap = new Map<string, OutboundDomainBreakdown>();
  for (const link of byLink) {
    if (!link.destinationDomain) continue;
    const existing = domainMap.get(link.destinationDomain);
    if (existing) {
      existing.qualifiedClicks += Number(link.qualifiedClicks || 0);
      existing.totalClicks += Number(link.totalClicks || 0);
    } else {
      domainMap.set(link.destinationDomain, {
        destinationDomain: link.destinationDomain,
        destinationType: link.destinationType || 'website',
        qualifiedClicks: Number(link.qualifiedClicks || 0),
        totalClicks: Number(link.totalClicks || 0),
      });
    }
  }
  const derivedDomains = Array.from(domainMap.values()).sort(
    (a, b) => b.qualifiedClicks - a.qualifiedClicks || b.totalClicks - a.totalClicks,
  );

  if (raw.kpis && raw.previousPeriod && raw.byEntityDestination && raw.daily) {
    return {
      ...raw,
      byDomain: raw.byDomain ?? derivedDomains,
      uniqueDomains: raw.uniqueDomains ?? derivedDomains.length,
      uniqueDestinations: raw.uniqueDestinations ?? byLink.length,
    };
  }

  const todayStr = toIsoDate(new Date());
  const span = diffDaysInclusive(filters.from, filters.to);
  const prevTo = addDays(filters.from, -1);
  const prevFrom = addDays(filters.from, -span);

  let derivedDaily: OutboundDailyPoint[] = raw.daily ?? [];
  let derivedHourly: OutboundHourlyPoint[] = raw.hourly ?? [];
  let derivedEntityDest: OutboundEntityDestinationBreakdown[] = raw.byEntityDestination ?? [];

  // Attempt to derive recent daily/hourly and entity->destination pairs from outbound_admin_detail
  try {
    const { data: detailData } = await supabase.rpc('outbound_admin_detail', {
      p_from: filters.from,
      p_to: filters.to,
      p_destination_type: null,
      p_destination_domain: null,
      p_destination_path: null,
      p_placement: null,
      p_surface: null,
      p_entity_type: filters.entityType ?? null,
      p_entity_id: filters.entityId ?? null,
      p_limit: 250,
    });
    const detail = detailData as OutboundAnalyticsDetail | null;
    const recentClicks = detail?.recentClicks ?? [];

    if (recentClicks.length > 0) {
      if (!derivedDaily.length) {
        const dayMap = new Map<string, { qualifiedClicks: number; totalClicks: number }>();
        for (const click of recentClicks) {
          if (!click.occurredAt) continue;
          const day = click.occurredAt.slice(0, 10);
          const item = dayMap.get(day) ?? { qualifiedClicks: 0, totalClicks: 0 };
          item.totalClicks += 1;
          if (click.qualified) item.qualifiedClicks += 1;
          dayMap.set(day, item);
        }
        derivedDaily = Array.from(dayMap.entries())
          .map(([day, counts]) => ({ day, ...counts }))
          .sort((a, b) => a.day.localeCompare(b.day));
      }

      if (!derivedHourly.length) {
        const hourMap = new Map<string, { qualifiedClicks: number; totalClicks: number }>();
        for (const click of recentClicks) {
          if (!click.occurredAt) continue;
          const d = new Date(click.occurredAt);
          if (Number.isNaN(d.getTime())) continue;
          const hour = `${d.toISOString().slice(0, 13)}:00:00Z`;
          const item = hourMap.get(hour) ?? { qualifiedClicks: 0, totalClicks: 0 };
          item.totalClicks += 1;
          if (click.qualified) item.qualifiedClicks += 1;
          hourMap.set(hour, item);
        }
        derivedHourly = Array.from(hourMap.entries())
          .map(([hour, counts]) => ({ hour, ...counts }))
          .sort((a, b) => a.hour.localeCompare(b.hour));
      }

      if (!derivedEntityDest.length) {
        const pairMap = new Map<string, OutboundEntityDestinationBreakdown>();
        for (const click of recentClicks) {
          const key = [
            click.entityType,
            click.entityId,
            click.destinationType,
            click.destinationDomain,
            click.destinationPath || '',
          ].join('|');
          const existing = pairMap.get(key);
          if (existing) {
            existing.totalClicks += 1;
            if (click.qualified) existing.qualifiedClicks += 1;
          } else {
            pairMap.set(key, {
              entityType: click.entityType,
              entityId: click.entityId,
              organizationId: click.organizationId || '',
              destinationType: click.destinationType,
              destinationDomain: click.destinationDomain,
              destinationPath: click.destinationPath || '',
              qualifiedClicks: click.qualified ? 1 : 0,
              totalClicks: 1,
            });
          }
        }
        derivedEntityDest = Array.from(pairMap.values()).sort(
          (a, b) => b.qualifiedClicks - a.qualifiedClicks || b.totalClicks - a.totalClicks,
        );
      }
    }
  } catch {
    // Ignore if detail RPC is unavailable.
  }

  const sumDailyRange = (start: string, end: string) =>
    derivedDaily
      .filter((d) => d.day >= start && d.day <= end)
      .reduce(
        (acc, d) => ({
          total: acc.total + Number(d.totalClicks || 0),
          qualified: acc.qualified + Number(d.qualifiedClicks || 0),
        }),
        { total: 0, qualified: 0 },
      );

  const todayCounts = sumDailyRange(todayStr, todayStr);
  const yesterdayStr = addDays(todayStr, -1);
  const yesterdayCounts = sumDailyRange(yesterdayStr, yesterdayStr);
  const last7Counts = sumDailyRange(addDays(todayStr, -6), todayStr);
  const prev7Counts = sumDailyRange(addDays(todayStr, -13), addDays(todayStr, -7));
  const last30Counts = sumDailyRange(addDays(todayStr, -29), todayStr);
  const prev30Counts = sumDailyRange(addDays(todayStr, -59), addDays(todayStr, -30));

  return {
    ...raw,
    uniqueDomains: raw.uniqueDomains ?? derivedDomains.length,
    uniqueDestinations: raw.uniqueDestinations ?? byLink.length,
    previousPeriod: raw.previousPeriod ?? {
      from: prevFrom,
      to: prevTo,
      totalClicks: 0,
      qualifiedClicks: 0,
    },
    kpis: raw.kpis ?? {
      clicksToday: todayCounts.total,
      qualifiedToday: todayCounts.qualified,
      clicksYesterday: yesterdayCounts.total,
      qualifiedYesterday: yesterdayCounts.qualified,
      clicks7d: last7Counts.total || Number(raw.totalClicks || 0),
      qualified7d: last7Counts.qualified || Number(raw.qualifiedClicks || 0),
      clicksPrev7d: prev7Counts.total,
      qualifiedPrev7d: prev7Counts.qualified,
      clicks30d: last30Counts.total || Number(raw.totalClicks || 0),
      qualified30d: last30Counts.qualified || Number(raw.qualifiedClicks || 0),
      clicksPrev30d: prev30Counts.total,
      qualifiedPrev30d: prev30Counts.qualified,
      clicksAllTime: Number(raw.totalClicks || 0),
      qualifiedAllTime: Number(raw.qualifiedClicks || 0),
      firstRecordedDay: derivedDaily.length ? derivedDaily[0].day : null,
    },
    byEntityDestination: derivedEntityDest.length
      ? derivedEntityDest
      : byEntity.slice(0, 25).map((entity, idx) => {
          const fallbackLink = byLink[idx] ?? byLink[0];
          return {
            entityType: entity.entityType,
            entityId: entity.entityId,
            organizationId: entity.organizationId || '',
            destinationType: fallbackLink?.destinationType || 'website',
            destinationDomain: fallbackLink?.destinationDomain || '',
            destinationPath: fallbackLink?.destinationPath || '',
            qualifiedClicks: entity.qualifiedClicks,
            totalClicks: entity.totalClicks,
          };
        }),
    byDomain: raw.byDomain ?? derivedDomains,
    daily: derivedDaily,
    previousDaily: raw.previousDaily ?? [],
    hourly: derivedHourly,
  };
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
  return enrichLegacyOutboundSummary(data as OutboundAnalyticsSummary, filters);
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
