const browserOrigin = (): string =>
  typeof window === 'undefined' ? 'https://swingsphere.co' : window.location.origin;

export const getOutboundDestinationDomain = (href: string): string => {
  const trimmed = href.trim();
  if (!trimmed) return 'unknown.local';
  if (trimmed.startsWith('mailto:')) {
    const email = trimmed.slice('mailto:'.length).split('?')[0];
    return email.includes('@') ? email.split('@').pop()?.toLowerCase() || 'email.local' : 'email.local';
  }
  if (trimmed.startsWith('geo:')) return 'device-maps.local';
  if (trimmed.startsWith('blob:')) return 'download.local';
  try {
    return new URL(trimmed, browserOrigin())
      .host
      .replace(/^www\./i, '')
      .toLowerCase();
  } catch {
    return 'unknown.local';
  }
};

export const getOutboundDestinationPath = (href: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed || /^(mailto|geo|blob|data|tel):/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed, browserOrigin());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return (url.pathname || '/').slice(0, 500);
  } catch {
    return null;
  }
};
