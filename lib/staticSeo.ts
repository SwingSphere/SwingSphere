export const SITE_ORIGIN = 'https://swingsphere.co';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;
export const DEFAULT_OG_IMAGE_ALT = 'SwingSphere | Global Lifestyle Discovery Platform';
export const DEFAULT_OG_WIDTH = 1200;
export const DEFAULT_OG_HEIGHT = 630;

export type SeoPayload = {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: 'website' | 'article' | 'profile';
  twitterCard: 'summary' | 'summary_large_image';
  imageUrl: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  noIndex: boolean;
  structuredData: Record<string, unknown> | Array<Record<string, unknown>>;
};

export const resolveStaticPageSeo = (pathname: string): SeoPayload => {
  const cleanPath = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const canonicalUrl = `${SITE_ORIGIN}${cleanPath === '/' ? '/' : cleanPath}`;

  // 1. Private and utility routes -> noindex, nofollow
  const isPrivate = /^(\/admin|\/dev|\/account|\/host-dashboard|\/submission|\/login|\/signup|\/forgot-password|\/reset-password|\/listing\/|\/mobile|\/tablet)/.test(cleanPath);
  if (isPrivate) {
    return {
      title: 'SwingSphere | Account & Administration',
      description: 'SwingSphere account, administration, and platform tools.',
      canonicalUrl,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: true,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'SwingSphere',
        url: SITE_ORIGIN,
      },
    };
  }

  // 2. Main Directory: /discover
  if (cleanPath === '/discover') {
    return {
      title: 'Discover Lifestyle Clubs, Swinger Parties & Hosts | SwingSphere',
      description: 'Explore approved swinger clubs, lifestyle events, play parties, and hosts worldwide. Filter by audience, amenities, and location on SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/discover`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: 'Discover Lifestyle Clubs & Events on SwingSphere',
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Discover Lifestyle Clubs, Swinger Parties & Hosts',
        description: 'Global discovery platform for approved lifestyle clubs, swinger parties, play parties, and community hosts.',
        url: `${SITE_ORIGIN}/discover`,
      },
    };
  }

  // 3. Events Index: /events
  if (cleanPath === '/events') {
    return {
      title: 'Upcoming Lifestyle Events & Swinger Parties | SwingSphere',
      description: 'Browse upcoming lifestyle events, swinger parties, play parties, and club theme nights worldwide. Access details, schedules, and tickets on SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/events`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: 'Upcoming Lifestyle Events on SwingSphere',
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Upcoming Lifestyle Events & Swinger Parties',
        description: 'Calendar of upcoming lifestyle events, swinger parties, and play parties.',
        url: `${SITE_ORIGIN}/events`,
      },
    };
  }

  // 4. Travel Index: /travel
  if (cleanPath === '/travel') {
    return {
      title: 'Lifestyle Resorts & Swinger Cruises | SwingSphere',
      description: 'Discover premier adults-only lifestyle resorts, clothing-optional destinations, and luxury swinger cruises around the globe on SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/travel`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: 'Lifestyle Resorts & Swinger Cruises',
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Lifestyle Resorts & Swinger Cruises',
        description: 'Adults-only lifestyle resorts, clothing-optional destinations, and swinger cruises.',
        url: `${SITE_ORIGIN}/travel`,
      },
    };
  }

  // 5. 3D Globe / Map: /globe, /map, /explore
  if (cleanPath === '/globe' || cleanPath === '/map' || cleanPath === '/explore') {
    return {
      title: 'Interactive 3D Lifestyle Globe & Map | SwingSphere',
      description: 'Explore lifestyle clubs, swinger events, and communities across the world with SwingSphere’s interactive 3D globe and discovery map.',
      canonicalUrl: `${SITE_ORIGIN}/globe`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: 'Interactive 3D Lifestyle Globe',
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'SwingSphere 3D Discovery Globe',
        url: `${SITE_ORIGIN}/globe`,
      },
    };
  }

  // 6. Informational pages: /about, /faq, /contact, /tos, /privacy, /pricing, /guidelines
  if (cleanPath === '/about') {
    return {
      title: 'About SwingSphere | Global Lifestyle Discovery',
      description: 'Learn about SwingSphere: the premium discovery platform for lifestyle clubs, swinger events, venues, hosts, resorts, and cruises.',
      canonicalUrl: `${SITE_ORIGIN}/about`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'About SwingSphere',
        url: `${SITE_ORIGIN}/about`,
      },
    };
  }

  if (cleanPath === '/faq') {
    return {
      title: 'Frequently Asked Questions | SwingSphere',
      description: 'Common questions about lifestyle clubs, swinger party etiquette, privacy protection, event tickets, and community standards on SwingSphere.',
      canonicalUrl: `${SITE_ORIGIN}/faq`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        name: 'SwingSphere FAQ',
        url: `${SITE_ORIGIN}/faq`,
      },
    };
  }

  if (cleanPath === '/privacy') {
    return {
      title: 'Privacy Policy | SwingSphere',
      description: 'SwingSphere’s privacy policy, personal data protection, private event location safeguards, and security standards.',
      canonicalUrl: `${SITE_ORIGIN}/privacy`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'SwingSphere Privacy Policy',
        url: `${SITE_ORIGIN}/privacy`,
      },
    };
  }

  if (cleanPath === '/tos') {
    return {
      title: 'Terms of Service | SwingSphere',
      description: 'SwingSphere platform terms of service, community standards, and user guidelines.',
      canonicalUrl: `${SITE_ORIGIN}/tos`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'SwingSphere Terms of Service',
        url: `${SITE_ORIGIN}/tos`,
      },
    };
  }

  if (cleanPath === '/contact') {
    return {
      title: 'Contact SwingSphere | Support & Inquiries',
      description: 'Get in touch with the SwingSphere team for listing inquiries, club partnerships, promoter access, and platform support.',
      canonicalUrl: `${SITE_ORIGIN}/contact`,
      ogType: 'website',
      twitterCard: 'summary_large_image',
      imageUrl: DEFAULT_OG_IMAGE,
      imageAlt: DEFAULT_OG_IMAGE_ALT,
      imageWidth: DEFAULT_OG_WIDTH,
      imageHeight: DEFAULT_OG_HEIGHT,
      noIndex: false,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: 'Contact SwingSphere',
        url: `${SITE_ORIGIN}/contact`,
      },
    };
  }

  // 7. Homepage Default: /
  return {
    title: 'SwingSphere | Lifestyle Clubs, Swinger Parties & Events',
    description: 'Discover lifestyle clubs, swinger parties, play parties, adult nightlife, hosts, luxury lifestyle resorts, and cruises worldwide with SwingSphere.',
    canonicalUrl: `${SITE_ORIGIN}/`,
    ogType: 'website',
    twitterCard: 'summary_large_image',
    imageUrl: DEFAULT_OG_IMAGE,
    imageAlt: DEFAULT_OG_IMAGE_ALT,
    imageWidth: DEFAULT_OG_WIDTH,
    imageHeight: DEFAULT_OG_HEIGHT,
    noIndex: false,
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'SwingSphere',
        url: `${SITE_ORIGIN}/`,
        description: 'Discover lifestyle clubs, swinger parties, play parties, events, hosts, resorts, and cruises around the world with SwingSphere.',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_ORIGIN}/discover?query={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'SwingSphere',
        url: `${SITE_ORIGIN}/`,
        logo: `${SITE_ORIGIN}/swingsphere-logo_2.png`,
        description: 'Global discovery platform for lifestyle clubs, swinger events, and community nightlife.',
      },
    ],
  };
};

export const resolvePageSeo = resolveStaticPageSeo;
