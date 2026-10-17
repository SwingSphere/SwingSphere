import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getAnonymousSessionId, getCampaignKey, getDeviceClass } from '../../lib/analytics/outboundTracking';
import { inferInboundSource } from '../../lib/analytics/inboundAttribution';
import {
  getAnonymousVisitorId,
  resolveBrowserFamily,
  resolveOsFamily,
} from '../../lib/analytics/deviceAttribution';

type GeoResponse = {
  countryCode?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
};

const SENT_KEY = 'swingsphere.inbound-session-recorded.v1';
const LAST_PATH_KEY = 'swingsphere.inbound-last-path.v1';

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

export const shouldTrackInboundPath = (pathname: string): boolean => {
  const normalized = pathname.toLowerCase();
  return !normalized.startsWith('/admin')
    && !normalized.startsWith('/dev/')
    && !normalized.startsWith('/auth/')
    && !normalized.startsWith('/account')
    && !normalized.startsWith('/login')
    && !normalized.startsWith('/signup')
    && !normalized.startsWith('/forgot-password')
    && !normalized.startsWith('/reset-password')
    && normalized !== '/street-view';
};

const scheduleLowPriority = (task: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(task, { timeout: 1500 });
    return () => win.cancelIdleCallback?.(id);
  }
  const timer = window.setTimeout(task, 120);
  return () => window.clearTimeout(timer);
};

let memorySessionRecorded = false;
let memoryLastPath: string | null = null;
let trackingQueue: Promise<void> = Promise.resolve();

export const normalizeTrackedPagePath = (pathname: string): string => {
  const raw = pathname.startsWith('/') ? pathname.slice(0, 500) || '/' : '/';
  if (raw.length > 1 && raw.endsWith('/')) {
    return raw.replace(/\/+$/, '') || '/';
  }
  return raw;
};

const isTrackingEnabled = (): boolean => {
  if (!import.meta.env.DEV) return true;
  if (typeof window !== 'undefined') {
    const win = window as Window & { __SWINGSPHERE_ENABLE_ANALYTICS_IN_DEV__?: boolean };
    if (win.__SWINGSPHERE_ENABLE_ANALYTICS_IN_DEV__ === true) return true;
  }
  return false;
};

const getRecordedSessionState = (): { recorded: boolean; lastPath: string | null } => {
  try {
    const recorded = window.sessionStorage.getItem(SENT_KEY) === '1' || memorySessionRecorded;
    const lastPath = window.sessionStorage.getItem(LAST_PATH_KEY) ?? memoryLastPath;
    return { recorded, lastPath };
  } catch {
    return { recorded: memorySessionRecorded, lastPath: memoryLastPath };
  }
};

const setRecordedSessionState = (pagePath: string, markSessionRecorded = false): void => {
  if (markSessionRecorded) {
    memorySessionRecorded = true;
  }
  memoryLastPath = pagePath;
  try {
    if (markSessionRecorded) {
      window.sessionStorage.setItem(SENT_KEY, '1');
    }
    window.sessionStorage.setItem(LAST_PATH_KEY, pagePath);
  } catch {
    // In-memory state preserves deduplication when sessionStorage is restricted.
  }
};

const recordSubsequentPageView = async (pathname: string) => {
  if (!isTrackingEnabled() || !shouldTrackInboundPath(pathname)) return;
  const pagePath = normalizeTrackedPagePath(pathname);

  const { lastPath } = getRecordedSessionState();
  if (lastPath === pagePath) return;
  setRecordedSessionState(pagePath, false);

  const sessionId = getAnonymousSessionId();
  const payload = {
    p_anonymous_session_id: sessionId,
    p_page_path: pagePath,
    p_device_class: getDeviceClass(),
    p_os_family: resolveOsFamily(),
    p_browser_family: resolveBrowserFamily(),
  };

  try {
    await supabase.rpc('record_inbound_page_view', payload);
  } catch {
    // Gracefully ignore when v3 page-view RPC is not yet deployed.
  }
};

const recordInboundSession = async (pathname: string, search: string) => {
  if (!isTrackingEnabled() || !shouldTrackInboundPath(pathname)) return;

  const pagePath = normalizeTrackedPagePath(pathname);
  const { recorded: alreadyRecordedSession } = getRecordedSessionState();

  if (alreadyRecordedSession) {
    await recordSubsequentPageView(pagePath);
    return;
  }

  const source = inferInboundSource({
    search,
    referrer: document.referrer,
    currentOrigin: window.location.origin,
  });
  const geo = await fetchCoarseGeo();
  const sessionId = getAnonymousSessionId();
  const visitorId = getAnonymousVisitorId(sessionId);
  const deviceClass = getDeviceClass();
  const osFamily = resolveOsFamily();
  const browserFamily = resolveBrowserFamily();

  const v2Payload = {
    p_anonymous_session_id: sessionId,
    p_source_category: source.category,
    p_source_name: source.name,
    p_referrer_domain: source.referrerDomain,
    p_referrer_path: source.referrerPath,
    p_landing_path: pagePath,
    p_utm_source: source.utmSource,
    p_utm_medium: source.utmMedium,
    p_utm_campaign: source.utmCampaign,
    p_campaign_key: getCampaignKey(),
    p_device_class: deviceClass,
    p_country_code: cleanParam(geo.countryCode ?? null, 2)?.toUpperCase() ?? null,
    p_region_code: cleanParam(geo.regionCode ?? null, 40),
    p_region_name: cleanParam(geo.regionName ?? null, 120),
    p_app_version: import.meta.env.VITE_APP_VERSION || null,
  };

  const v3Payload = {
    ...v2Payload,
    p_os_family: osFamily,
    p_browser_family: browserFamily,
    p_anonymous_visitor_id: visitorId,
  };

  let { error } = await supabase.rpc('record_inbound_visit_v3', v3Payload);
  if (error) {
    const fallbackV2 = await supabase.rpc('record_inbound_visit_v2', v2Payload);
    error = fallbackV2.error;
    if (error) {
      const { p_referrer_path: _ignoredReferrerPath, ...legacyPayload } = v2Payload;
      const fallbackV1 = await supabase.rpc('record_inbound_visit', legacyPayload);
      error = fallbackV1.error;
    }
  }

  if (!error) {
    setRecordedSessionState(pagePath, true);
  } else if (import.meta.env.DEV) {
    console.warn('Inbound analytics recording failed:', error.message);
  }
};

const enqueueInboundTracking = (pathname: string, search: string): void => {
  trackingQueue = trackingQueue
    .then(() => recordInboundSession(pathname, search))
    .catch(() => {});
};

const InboundAnalyticsTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    return scheduleLowPriority(() => {
      enqueueInboundTracking(location.pathname, location.search);
    });
  }, [location.pathname, location.search]);

  return null;
};

export default InboundAnalyticsTracker;
