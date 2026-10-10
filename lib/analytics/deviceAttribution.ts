import { resolveBrowserDeviceExperience, resolveDeviceExperience, type DeviceEnvironment } from '../deviceExperience';

export type AnalyticsDeviceClass = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export type AnalyticsOsFamily =
  | 'ios'
  | 'ipados'
  | 'android'
  | 'windows'
  | 'macos'
  | 'chromeos'
  | 'linux'
  | 'other'
  | 'unknown';

export type AnalyticsBrowserFamily =
  | 'safari'
  | 'chrome'
  | 'firefox'
  | 'edge'
  | 'other'
  | 'unknown';

const VISITOR_KEY = 'swingsphere.anonymous-visitor.v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createUuid = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
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

export const getAnonymousVisitorId = (fallbackSessionId?: string): string => {
  if (typeof window === 'undefined') return fallbackSessionId || createUuid();
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;
    const created = createUuid();
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return fallbackSessionId || createUuid();
  }
};

export const resolveAnalyticsDeviceClass = (environment?: DeviceEnvironment): AnalyticsDeviceClass => {
  if (environment) {
    return resolveDeviceExperience(environment);
  }
  if (typeof window === 'undefined') return 'unknown';
  return resolveBrowserDeviceExperience();
};

export const resolveOsFamily = (environment?: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}): AnalyticsOsFamily => {
  const env = environment ?? (typeof navigator !== 'undefined'
    ? {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      }
    : {});

  const ua = env.userAgent || '';
  const platform = env.platform || '';
  const maxTouchPoints = env.maxTouchPoints ?? 0;

  if (!ua && !platform) return 'unknown';

  // Distinguish iPadOS (including desktop-class Safari on iPadOS 13+) from macOS and iOS.
  if (/iPad/i.test(ua) || (/MacIntel/i.test(platform) && maxTouchPoints > 1)) {
    return 'ipados';
  }
  if (/iPhone|iPod/i.test(ua)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  if (/CrOS/i.test(ua)) {
    return 'chromeos';
  }
  if (/Windows|Win32|Win64|WOW64/i.test(ua) || /^Win/i.test(platform)) {
    return 'windows';
  }
  if (/Macintosh|Mac OS X/i.test(ua) || /^Mac/i.test(platform)) {
    return 'macos';
  }
  if (/Linux|X11|Ubuntu|Fedora|Debian/i.test(ua) || /Linux/i.test(platform)) {
    return 'linux';
  }

  return 'other';
};

export const resolveBrowserFamily = (userAgent?: string): AnalyticsBrowserFamily => {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return 'unknown';

  if (/Edg\/|EdgA\/|EdgiOS\//i.test(ua)) return 'edge';
  if (/OPR\/|Opera|Brave\/|Vivaldi\/|SamsungBrowser\/|UCBrowser\/|DuckDuckGo\//i.test(ua)) return 'other';
  if (/Firefox\/|FxiOS\//i.test(ua)) return 'firefox';
  if (/Chrome\/|CriOS\/|Chromium\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua)) return 'safari';

  return 'other';
};

export const formatDeviceClass = (deviceClass?: string | null): string => {
  const normalized = (deviceClass || 'unknown').toLowerCase();
  if (normalized === 'desktop') return 'Desktop';
  if (normalized === 'mobile') return 'Mobile';
  if (normalized === 'tablet') return 'Tablet';
  return 'Unknown';
};

export const formatOsFamily = (osFamily?: string | null, deviceClass?: string | null): string => {
  const normalized = (osFamily || 'unknown').toLowerCase();
  if (normalized === 'ios') return 'iOS';
  if (normalized === 'ipados') return 'iPadOS';
  if (normalized === 'android') {
    if (deviceClass?.toLowerCase() === 'tablet') return 'Android tablet';
    return 'Android';
  }
  if (normalized === 'windows') return 'Windows';
  if (normalized === 'macos') return 'macOS';
  if (normalized === 'chromeos') return 'ChromeOS';
  if (normalized === 'linux') return 'Linux';
  if (normalized === 'other') return 'Other';
  return 'Unspecified (legacy)';
};

export const formatBrowserFamily = (browserFamily?: string | null): string => {
  const normalized = (browserFamily || 'unknown').toLowerCase();
  if (normalized === 'safari') return 'Safari';
  if (normalized === 'chrome') return 'Chrome';
  if (normalized === 'firefox') return 'Firefox';
  if (normalized === 'edge') return 'Edge';
  if (normalized === 'other') return 'Other browser';
  return 'Unspecified (legacy)';
};
