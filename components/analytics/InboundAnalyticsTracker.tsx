import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getAnonymousSessionId, getCampaignKey, getDeviceClass } from '../../lib/analytics/outboundTracking';

type SourceCategory = 'direct' | 'search' | 'social' | 'referral' | 'email' | 'campaign' | 'other';

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

const normalizedHost = (value: string): string => value.toLowerCase().replace(/^www\./, '');

const sourceFromHost = (host: string): { category: SourceCategory; name: string } => {
  const normalized = normalizedHost(host);
  if (/^(google\.|googleusercontent\.)/.test(normalized) || normalized.includes('.google.')) return { category: 'search', name: 'google' };
  if (normalized === 'bing.com' || normalized.endsWith('.bing.com')) return { category: 'search', name: 'bing' };
  if (normalized === 'duckduckgo.com' || normalized.endsWith('.duckduckgo.com')) return { category: 'search', name: 'duckduckgo' };
  if (normalized === 'search.yahoo.com' || normalized.endsWith('.search.yahoo.com')) return { category: 'search', name: 'yahoo' };
  if (normalized === 'instagram.com' || normalized.endsWith('.instagram.com')) return { category: 'social', name: 'instagram' };
  if (normalized === 'reddit.com' || normalized.endsWith('.reddit.com')) return { category: 'social', name: 'reddit' };
  if (normalized === 'facebook.com' || normalized.endsWith('.facebook.com') || normalized === 'fb.com') return { category: 'social', name: 'facebook' };
  if (normalized === 'tiktok.com' || normalized.endsWith('.tiktok.com')) return { category: 'social', name: 'tiktok' };
  if (normalized === 'x.com' || normalized.endsWith('.x.com') || normalized === 'twitter.com' || normalized.endsWith('.twitter.com')) return { category: 'social', name: 'x' };
  if (normalized === 'threads.net' || normalized.endsWith('.threads.net')) return { category: 'social', name: 'threads' };
  return { category: 'referral', name: normalized.slice(0, 120) || 'referral' };
};

const inferSource = (params: URLSearchParams): {
  category: SourceCategory;
  name: string;
  referrerDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
} => {
  const utmSource = cleanParam(params.get('utm_source'), 120)?.toLowerCase() ?? null;
  const utmMedium = cleanParam(params.get('utm_medium'), 120)?.toLowerCase() ?? null;
  const utmCampaign = cleanParam(params.get('utm_campaign'), 160);

  let referrerDomain: string | null = null;
  try {
    if (document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== window.location.origin) referrerDomain = normalizedHost(referrer.host).slice(0, 255);
    }
  } catch {
    referrerDomain = null;
  }

  if (utmMedium?.includes('email') || utmMedium === 'newsletter') {
    return { category: 'email', name: utmSource || 'email', referrerDomain, utmSource, utmMedium, utmCampaign };
  }

  if (utmSource || utmCampaign) {
    return { category: 'campaign', name: utmSource || 'campaign', referrerDomain, utmSource, utmMedium, utmCampaign };
  }

  if (referrerDomain) {
    const source = sourceFromHost(referrerDomain);
    return { ...source, referrerDomain, utmSource, utmMedium, utmCampaign };
  }

  return { category: 'direct', name: 'direct', referrerDomain: null, utmSource, utmMedium, utmCampaign };
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

  const params = new URLSearchParams(search);
  const source = inferSource(params);
  const geo = await fetchCoarseGeo();
  const landingPath = pathname.startsWith('/') ? pathname.slice(0, 500) || '/' : '/';

  const { error } = await supabase.rpc('record_inbound_visit', {
    p_anonymous_session_id: getAnonymousSessionId(),
    p_source_category: source.category,
    p_source_name: source.name,
    p_referrer_domain: source.referrerDomain,
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
  });

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
