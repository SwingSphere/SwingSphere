export type DeviceExperienceKind = 'desktop' | 'mobile' | 'tablet';

export type DeviceEnvironment = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  coarsePointer?: boolean;
};

const PHONE_UA = /iPhone|iPod|Android.*Mobile|Mobi/i;
const TABLET_UA = /iPad|Tablet|PlayBook|Silk|Kindle|KF[A-Z]{2,}|Android(?!.*Mobile)/i;

export const resolveDeviceExperience = (environment: DeviceEnvironment): DeviceExperienceKind => {
  const userAgent = environment.userAgent || '';
  const platform = environment.platform || '';
  const maxTouchPoints = environment.maxTouchPoints ?? 0;

  if (PHONE_UA.test(userAgent)) return 'mobile';
  if (TABLET_UA.test(userAgent)) return 'tablet';

  // iPadOS 13+ can identify itself as a Macintosh desktop browser.
  if (/MacIntel/i.test(platform) && maxTouchPoints > 1) return 'tablet';

  const width = environment.viewportWidth ?? 0;
  const height = environment.viewportHeight ?? 0;
  const shortestSide = width && height ? Math.min(width, height) : 0;
  const longestSide = width && height ? Math.max(width, height) : 0;

  // Conservative fallback for tablet-class touch browsers with ambiguous UAs.
  // Screen size alone is intentionally insufficient so touchscreen laptops do
  // not get pushed into the tablet experience merely because of their viewport.
  if (
    environment.coarsePointer === true &&
    maxTouchPoints > 1 &&
    shortestSide >= 600 &&
    longestSide <= 1600
  ) {
    return 'tablet';
  }

  return 'desktop';
};

export const resolveBrowserDeviceExperience = (): DeviceExperienceKind => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop';

  return resolveDeviceExperience({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    coarsePointer: Boolean(window.matchMedia?.('(pointer: coarse)').matches),
  });
};
