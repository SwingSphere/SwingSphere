import { supabase } from '../supabase';
import { recordMemberActivity } from './memberActivity';
import { getOutboundDestinationDomain, getOutboundDestinationPath } from './outboundDestination';
export { getOutboundDestinationDomain, getOutboundDestinationPath } from './outboundDestination';

export type OutboundEntityType =
  | 'club'
  | 'event'
  | 'event_series'
  | 'venue'
  | 'organization'
  | 'resort'
  | 'cruise_series'
  | 'cruise_sailing'
  | 'profile';

export type OutboundDestinationType =
  | 'ticket'
  | 'rsvp'
  | 'approval_form'
  | 'booking'
  | 'website'
  | 'social'
  | 'email'
  | 'directions'
  | 'calendar_google'
  | 'calendar_ics'
  | 'other';

export type OutboundSurface =
  | 'home'
  | 'globe'
  | 'map'
  | 'search'
  | 'details_panel'
  | 'entity_page'
  | 'saved'
  | 'recommendation'
  | 'direct'
  | 'unknown';

export type OutboundInteractionType = 'click' | 'auxclick' | 'keyboard';

export type OutboundTrackingMetadata = {
  entityType: OutboundEntityType;
  entityId: string;
  destinationType: OutboundDestinationType;
  placement: string;
  surface?: OutboundSurface;
  organizationId?: string;
  eventSeriesId?: string;
  campaignKey?: string;
  marketId?: string;
  destinationDomain?: string;
};

const SESSION_KEY = 'swingsphere.outbound-session.v1';
const CAMPAIGN_KEY = 'swingsphere.outbound-campaign.v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fallbackUuid = (): string => {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const createSessionId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return fallbackUuid();
};

export const getAnonymousSessionId = (): string => {
  if (typeof window === 'undefined') return createSessionId();
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;
    const created = createSessionId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return createSessionId();
  }
};

const normalizeCampaignKey = (value?: string | null): string | null => {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
  return normalized || null;
};

export const getCampaignKey = (explicit?: string): string | null => {
  const explicitKey = normalizeCampaignKey(explicit);
  if (explicitKey) return explicitKey;
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const incoming = normalizeCampaignKey(params.get('ss_campaign') || params.get('utm_campaign'));
    if (incoming) {
      window.sessionStorage.setItem(CAMPAIGN_KEY, incoming);
      return incoming;
    }
    return normalizeCampaignKey(window.sessionStorage.getItem(CAMPAIGN_KEY));
  } catch {
    return null;
  }
};

export const getDeviceClass = (): 'mobile' | 'tablet' | 'desktop' | 'unknown' => {
  if (typeof window === 'undefined') return 'unknown';
  const width = window.innerWidth;
  if (!Number.isFinite(width)) return 'unknown';
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
};

const inferSurface = (): OutboundSurface => {
  if (typeof window === 'undefined') return 'unknown';
  const path = window.location.pathname.toLowerCase();
  if (path === '/' || path.startsWith('/home')) return 'home';
  if (path.startsWith('/globe')) return 'globe';
  if (path.startsWith('/map')) return 'map';
  if (path.startsWith('/explore') || path.startsWith('/search')) return 'search';
  if (/^\/(clubs|events|venues|hosts|promoters|resorts|cruises|profiles)\//.test(path)) return 'entity_page';
  return 'unknown';
};

export const trackOutboundClick = async (
  href: string,
  metadata: OutboundTrackingMetadata,
  interactionType: OutboundInteractionType = 'click',
): Promise<void> => {
  const entityId = metadata.entityId.trim();
  const placement = metadata.placement.trim();
  if (!entityId || !placement) return;

  // The guarded activity RPC records only members who explicitly enabled sharing.
  // Exclude contact, directions, and calendar destinations from account activity.
  if (typeof window !== 'undefined' && ['ticket', 'rsvp', 'booking', 'website', 'social'].includes(metadata.destinationType)) {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const domain = metadata.destinationDomain ?? getOutboundDestinationDomain(href);
        const path = getOutboundDestinationPath(href);
        void recordMemberActivity('outbound', window.location.pathname, metadata.entityType, entityId, domain.endsWith('.local') ? '' : 'https://' + domain + (path || ''));
      }
    }).catch(() => {});
  }

  const payload = {
    p_anonymous_session_id: getAnonymousSessionId(),
    p_entity_type: metadata.entityType,
    p_entity_id: entityId,
    p_destination_type: metadata.destinationType,
    p_destination_domain: metadata.destinationDomain ?? getOutboundDestinationDomain(href),
    p_destination_path: getOutboundDestinationPath(href),
    p_placement: placement,
    p_surface: metadata.surface ?? inferSurface(),
    p_organization_id: metadata.organizationId?.trim() || null,
    p_event_series_id: metadata.eventSeriesId?.trim() || null,
    p_campaign_key: getCampaignKey(metadata.campaignKey),
    p_market_id: metadata.marketId?.trim() || null,
    p_device_class: getDeviceClass(),
    p_interaction_type: interactionType,
    p_app_version: import.meta.env.VITE_APP_VERSION || null,
  };

  let { error } = await supabase.rpc('record_outbound_click_v2', payload);
  if (error) {
    const { p_destination_path: _ignoredDestinationPath, ...legacyPayload } = payload;
    const fallback = await supabase.rpc('record_outbound_click', legacyPayload);
    error = fallback.error;
  }

  if (error && import.meta.env.DEV) {
    console.warn('Outbound click attribution failed:', error.message);
  }
};
