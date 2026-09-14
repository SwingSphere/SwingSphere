import type { ClubData, SocialLink, SocialNetworkKey } from '../types';

export const SOCIAL_NETWORK_OPTIONS: Array<{ value: SocialNetworkKey; label: string; placeholder: string }> = [
  { value: 'instagram', label: 'Instagram', placeholder: '@handle' },
  { value: 'facebook', label: 'Facebook', placeholder: '@page or full URL' },
  { value: 'fetlife', label: 'FetLife', placeholder: 'Profile/group URL' },
  { value: 'bluesky', label: 'Bluesky', placeholder: '@handle.bsky.social' },
  { value: 'x', label: 'X / Twitter', placeholder: '@handle' },
  { value: 'threads', label: 'Threads', placeholder: '@handle' },
  { value: 'tiktok', label: 'TikTok', placeholder: '@handle' },
  { value: 'youtube', label: 'YouTube', placeholder: '@handle or channel URL' },
  { value: 'reddit', label: 'Reddit', placeholder: '@username or community URL' },
  { value: 'mastodon', label: 'Mastodon', placeholder: 'Full profile URL' },
  { value: 'discord', label: 'Discord', placeholder: 'Invite or community URL' },
  { value: 'other', label: 'Other', placeholder: 'Full URL' },
];

export const getSocialNetworkLabel = (network: SocialNetworkKey): string =>
  SOCIAL_NETWORK_OPTIONS.find((option) => option.value === network)?.label ?? 'Social';

const trimHandle = (value: string): string => value.trim().replace(/^@+/, '').replace(/\/$/, '');

export const socialValueToUrl = (link: SocialLink): string => {
  const raw = link.value.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const handle = trimHandle(raw);
  switch (link.network) {
    case 'instagram': return `https://instagram.com/${handle}`;
    case 'facebook': return `https://facebook.com/${handle}`;
    case 'bluesky': return `https://bsky.app/profile/${handle}`;
    case 'x': return `https://x.com/${handle}`;
    case 'threads': return `https://threads.net/@${handle}`;
    case 'tiktok': return `https://tiktok.com/@${handle}`;
    case 'youtube': return `https://youtube.com/@${handle}`;
    case 'reddit': return `https://reddit.com/user/${handle}`;
    default: return /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw) ? `https://${raw}` : raw;
  }
};

const normalizeLegacy = (network: SocialNetworkKey, value?: string): SocialLink[] =>
  value?.trim() ? [{ network, value: value.trim() }] : [];

export const getClubSocialLinks = (
  club: Pick<ClubData, 'socialLinks' | 'instagram' | 'facebook' | 'fetlife'>,
  options: { includeEmpty?: boolean } = {},
): SocialLink[] => {
  const links = options.includeEmpty ? (club.socialLinks ?? []) : (club.socialLinks?.filter((link) => link.value.trim()) ?? []);
  const existingNetworks = new Set(links.map((link) => link.network));
  const legacy = [
    ...(!existingNetworks.has('instagram') ? normalizeLegacy('instagram', club.instagram) : []),
    ...(!existingNetworks.has('facebook') ? normalizeLegacy('facebook', club.facebook) : []),
    ...(!existingNetworks.has('fetlife') ? normalizeLegacy('fetlife', club.fetlife) : []),
  ];
  return [...links, ...legacy];
};

export const syncLegacySocialFields = (club: ClubData, socialLinks: SocialLink[]): ClubData => {
  const firstValue = (network: SocialNetworkKey) => socialLinks.find((link) => link.network === network)?.value || undefined;
  return {
    ...club,
    socialLinks,
    instagram: firstValue('instagram'),
    facebook: firstValue('facebook'),
    fetlife: firstValue('fetlife'),
  };
};
