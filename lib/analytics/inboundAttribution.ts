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
  if (
    normalized === 'threads.net'
    || normalized.endsWith('.threads.net')
    || normalized === 'threads.com'
    || normalized.endsWith('.threads.com')
  ) {
    return { category: 'social', name: 'threads' };
  }
  if (
    normalized === 'bsky.app'
    || normalized.endsWith('.bsky.app')
    || normalized === 'bsky.social'
    || normalized.endsWith('.bsky.social')
  ) {
    return { category: 'social', name: 'bluesky' };
  }
  if (
    normalized === 'youtube.com'
    || normalized.endsWith('.youtube.com')
    || normalized === 'youtu.be'
  ) {
    return { category: 'social', name: 'youtube' };
  }
  if (
    normalized === 'linkedin.com'
    || normalized.endsWith('.linkedin.com')
    || normalized === 'lnkd.in'
  ) {
    return { category: 'social', name: 'linkedin' };
  }
  if (
    normalized === 'discord.com'
    || normalized.endsWith('.discord.com')
    || normalized === 'discordapp.com'
  ) {
    return { category: 'social', name: 'discord' };
  }
  if (
    normalized === 't.me'
    || normalized === 'telegram.org'
    || normalized.endsWith('.telegram.org')
  ) {
    return { category: 'social', name: 'telegram' };
  }

  return { category: 'referral', name: normalized.slice(0, 120) || 'referral' };
};

const KNOWN_SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct',
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  yahoo: 'Yahoo',
  reddit: 'Reddit',
  'com.reddit.frontpage': 'Reddit',
  bluesky: 'Bluesky',
  'bsky.app': 'Bluesky',
  threads: 'Threads',
  'threads.net': 'Threads',
  x: 'X / Twitter',
  twitter: 'X / Twitter',
  instagram: 'Instagram',
  'com.instagram.android': 'Instagram',
  facebook: 'Facebook',
  'com.facebook.katana': 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  discord: 'Discord',
  telegram: 'Telegram',
};

export const formatInboundSourceName = (sourceName?: string | null): string => {
  const raw = (sourceName || 'unknown').trim();
  const key = raw.toLowerCase();
  if (KNOWN_SOURCE_LABELS[key]) return KNOWN_SOURCE_LABELS[key];
  if (raw.includes('.')) return raw.toLowerCase().replace(/^www\./, '');
  return raw.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const formatInboundSourceCategory = (category?: string | null): string => {
  const key = (category || 'other').toLowerCase();
  if (key === 'direct') return 'Direct';
  if (key === 'search') return 'Search Engine';
  if (key === 'social') return 'Social Platform';
  if (key === 'referral') return 'Website Referral';
  if (key === 'email') return 'Email / Newsletter';
  if (key === 'campaign') return 'Campaign / UTM';
  return 'Other';
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
