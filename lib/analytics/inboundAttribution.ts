export type InboundSourceCategory =
  | 'direct'
  | 'search'
  | 'social'
  | 'referral'
  | 'email'
  | 'campaign'
  | 'other';

export type InboundSourceAttribution = {
  category: InboundSourceCategory;
  name: string;
  referrerDomain: string | null;
  referrerPath: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

const cleanParam = (value: string | null, maxLength: number): string | null => {
  const normalized = value?.trim().slice(0, maxLength);
  return normalized || null;
};

export const normalizedInboundHost = (value: string): string =>
  value.toLowerCase().replace(/^www\./, '');

export const sourceFromInboundHost = (
  host: string,
): { category: InboundSourceCategory; name: string } => {
  const normalized = normalizedInboundHost(host);

  if (
    /^(google\.|googleusercontent\.)/.test(normalized)
    || normalized.includes('.google.')
    || normalized === 'com.google.android.googlequicksearchbox'
  ) return { category: 'search', name: 'google' };

  if (normalized === 'bing.com' || normalized.endsWith('.bing.com')) {
    return { category: 'search', name: 'bing' };
  }
  if (normalized === 'duckduckgo.com' || normalized.endsWith('.duckduckgo.com')) {
    return { category: 'search', name: 'duckduckgo' };
  }
  if (normalized === 'search.yahoo.com' || normalized.endsWith('.search.yahoo.com')) {
    return { category: 'search', name: 'yahoo' };
  }

  if (
    normalized === 'reddit.com'
    || normalized.endsWith('.reddit.com')
    || normalized === 'com.reddit.frontpage'
    || normalized === 'reddit.app.link'
  ) return { category: 'social', name: 'reddit' };

  if (
    normalized === 'instagram.com'
    || normalized.endsWith('.instagram.com')
    || normalized === 'com.instagram.android'
  ) return { category: 'social', name: 'instagram' };

  if (
    normalized === 'facebook.com'
    || normalized.endsWith('.facebook.com')
    || normalized === 'fb.com'
    || normalized === 'com.facebook.katana'
  ) return { category: 'social', name: 'facebook' };

  if (normalized === 'tiktok.com' || normalized.endsWith('.tiktok.com')) {
    return { category: 'social', name: 'tiktok' };
  }
  if (
    normalized === 'x.com'
    || normalized.endsWith('.x.com')
    || normalized === 'twitter.com'
    || normalized.endsWith('.twitter.com')
  ) return { category: 'social', name: 'x' };
  if (normalized === 'threads.net' || normalized.endsWith('.threads.net')) {
    return { category: 'social', name: 'threads' };
  }

  return { category: 'referral', name: normalized.slice(0, 120) || 'referral' };
};

const getExternalReferrer = (
  referrerValue: string,
  currentOrigin: string,
): { domain: string | null; path: string | null } => {
  if (!referrerValue) return { domain: null, path: null };

  try {
    const referrer = new URL(referrerValue);
    if ((referrer.protocol === 'http:' || referrer.protocol === 'https:') && referrer.origin === currentOrigin) {
      return { domain: null, path: null };
    }

    const domain = normalizedInboundHost(referrer.host).slice(0, 255) || null;
    const path = referrer.pathname && referrer.pathname !== '/'
      ? referrer.pathname.slice(0, 500)
      : null;

    return { domain, path };
  } catch {
    return { domain: null, path: null };
  }
};

export const inferInboundSource = ({
  search,
  referrer,
  currentOrigin,
}: {
  search: string;
  referrer: string;
  currentOrigin: string;
}): InboundSourceAttribution => {
  const params = new URLSearchParams(search);
  const utmSource = cleanParam(params.get('utm_source'), 120)?.toLowerCase() ?? null;
  const utmMedium = cleanParam(params.get('utm_medium'), 120)?.toLowerCase() ?? null;
  const utmCampaign = cleanParam(params.get('utm_campaign'), 160);
  const external = getExternalReferrer(referrer, currentOrigin);

  if (utmMedium?.includes('email') || utmMedium === 'newsletter') {
    return {
      category: 'email',
      name: utmSource || 'email',
      referrerDomain: external.domain,
      referrerPath: external.path,
      utmSource,
      utmMedium,
      utmCampaign,
    };
  }

  if (utmSource || utmCampaign) {
    return {
      category: 'campaign',
      name: utmSource || 'campaign',
      referrerDomain: external.domain,
      referrerPath: external.path,
      utmSource,
      utmMedium,
      utmCampaign,
    };
  }

  if (external.domain) {
    const source = sourceFromInboundHost(external.domain);
    return {
      ...source,
      referrerDomain: external.domain,
      referrerPath: external.path,
      utmSource,
      utmMedium,
      utmCampaign,
    };
  }

  return {
    category: 'direct',
    name: 'direct',
    referrerDomain: null,
    referrerPath: null,
    utmSource,
    utmMedium,
    utmCampaign,
  };
};
