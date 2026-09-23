import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getAnonymousSessionId, getCampaignKey, getDeviceClass } from '../../lib/analytics/outboundTracking';
import { inferInboundSource } from '../../lib/analytics/inboundAttribution';

type GeoResponse = {
  countryCode?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
};

const SENT_KEY = 'swingsphere.inbound-session-recorded.v1';

const cleanParam = (value: string | null, maxLength: number): string | null => {
  const normalized = value?.trim().slice(0, maxLength);
  return normalized || null;
};


const fetchCoarseGeo = async (): Promise<GeoResponse> => {
  try {
    const response = await fetch('/api/analytics/geo', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return {};
    return await response.json() as GeoResponse;
  } catch {
    return {};
  }
};

const shouldTrackPath = (pathname: string): boolean => {
  const normalized = pathname.toLowerCase();
  return !normalized.startsWith('/admin')
    && !normalized.startsWith('/dev/')
    && normalized !== '/street-view';
};

const recordInboundSession = async (pathname: string, search: string) => {
  if (import.meta.env.DEV || !shouldTrackPath(pathname)) return;

  try {
    if (window.sessionStorage.getItem(SENT_KEY) === '1') return;
  } catch {
    // Continue without the optimization when storage is unavailable.
  }

  const source = inferInboundSource({
    search,
    referrer: document.referrer,
    currentOrigin: window.location.origin,
  });
  const geo = await fetchCoarseGeo();
  const landingPath = pathname.startsWith('/') ? pathname.slice(0, 500) || '/' : '/';

  const payload = {
    p_anonymous_session_id: getAnonymousSessionId(),
    p_source_category: source.category,
    p_source_name: source.name,
    p_referrer_domain: source.referrerDomain,
    p_referrer_path: source.referrerPath,
    p_landing_path: landingPath,
    p_utm_source: source.utmSource,
    p_utm_medium: source.utmMedium,
    p_utm_campaign: source.utmCampaign,
    p_campaign_key: getCampaignKey(),
    p_device_class: getDeviceClass(),
    p_country_code: cleanParam(geo.countryCode ?? null, 2)?.toUpperCase() ?? null,
    p_region_code: cleanParam(geo.regionCode ?? null, 40),
    p_region_name: cleanParam(geo.regionName ?? null, 120),
    p_app_version: import.meta.env.VITE_APP_VERSION || null,
  };

  let { error } = await supabase.rpc('record_inbound_visit_v2', payload);
  if (error) {
    const { p_referrer_path: _ignoredReferrerPath, ...legacyPayload } = payload;
    const fallback = await supabase.rpc('record_inbound_visit', legacyPayload);
    error = fallback.error;
  }

  if (!error) {
    try {
      window.sessionStorage.setItem(SENT_KEY, '1');
    } catch {
      // The database uniqueness constraint still prevents duplicate session rows.
    }
  } else if (import.meta.env.DEV) {
    console.warn('Inbound analytics recording failed:', error.message);
  }
};

const InboundAnalyticsTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    void recordInboundSession(location.pathname, location.search);
  }, [location.pathname, location.search]);

  return null;
};

export default InboundAnalyticsTracker;
