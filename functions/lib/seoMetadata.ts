import listingsData from '../../data/listings.local.json';
import { mockOrganizations } from '../../data/mockOrganizations';
import { resorts, cruiseSeries } from '../../data/travelExperiences';
import { clubKey, eventKey, hostSlug, nameSlug, normalizeHostName, parsePrettyKeyParam } from '../../lib/identityUtils';
import { slugifyPlace } from '../../lib/geoNormalize';

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

export type CityCatalogEntry = {
  slug: string;
  name: string;
  region: string;
  country: string;
  clubs: any[];
  events: any[];
};

export type ListingCatalog = {
  clubsByKey: Map<string, any>;
  clubsById: Map<string, any>;
  clubsBySlug: Map<string, any>;
  eventsByKey: Map<string, any>;
  eventsById: Map<string, any>;
  eventsBySlug: Map<string, any>;
  citiesMap: Map<string, CityCatalogEntry>;
  clubs: any[];
  events: any[];
};

export const buildListingCatalog = (rawListings: any[]): ListingCatalog => {
  const approvedListings = (rawListings || []).filter(
    (l) => l && l.status === 'approved' && ['club', 'event'].includes(l.type)
  );

  const clubs = approvedListings.filter((l) => l.type === 'club');
  const events = approvedListings.filter((l) => l.type === 'event');

  const clubsByKey = new Map<string, any>();
  const clubsById = new Map<string, any>();
  const clubsBySlug = new Map<string, any>();

  for (const club of clubs) {
    const key = clubKey(club);
    const pretty = nameSlug(club.name);
    clubsByKey.set(key, club);
    clubsById.set(club.id, club);
    clubsBySlug.set(pretty, club);
    clubsByKey.set(`${pretty}--${key}`, club);
  }

  const eventsByKey = new Map<string, any>();
  const eventsById = new Map<string, any>();
  const eventsBySlug = new Map<string, any>();

  for (const event of events) {
    const host = normalizeHostName(event.hostName ?? '');
    const key = eventKey(event, host);
    const pretty = nameSlug(event.name);
    eventsByKey.set(key, event);
    eventsById.set(event.id, event);
    eventsBySlug.set(pretty, event);
    eventsByKey.set(`${pretty}--${key}`, event);
  }

  const citiesMap = new Map<string, CityCatalogEntry>();
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  for (const listing of approvedListings) {
    const city = listing.geopoint?.address?.city;
    if (!city || typeof city !== 'string' || !city.trim()) continue;
    const slug = slugifyPlace(city);
    if (!slug) continue;

    if (!citiesMap.has(slug)) {
      citiesMap.set(slug, {
        slug,
        name: city.trim(),
        region: listing.geopoint?.address?.region || listing.geopoint?.address?.state || '',
        country: listing.geopoint?.address?.country || '',
        clubs: [],
        events: [],
      });
    }

    const cityEntry = citiesMap.get(slug)!;
    if (listing.type === 'club') {
      cityEntry.clubs.push(listing);
    } else if (listing.type === 'event') {
      // Content Quality Criterion: only consider upcoming or recent events (within 30 days)
      const startTime = listing.time?.start ? new Date(listing.time.start).getTime() : 0;
      if (!startTime || startTime >= thirtyDaysAgo) {
        cityEntry.events.push(listing);
      }
    }
  }

  return {
    clubsByKey,
    clubsById,
    clubsBySlug,
    eventsByKey,
    eventsById,
    eventsBySlug,
    citiesMap,
    clubs,
    events,
  };
};

// Static build-time snapshot fallback
const staticCatalog = buildListingCatalog(listingsData as any[]);

// Live in-memory cache for Supabase RPC results
let cachedLiveCatalog: { catalog: ListingCatalog; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const getListingCatalog = async (env?: Record<string, unknown>): Promise<ListingCatalog> => {
  const supabaseUrl = (env?.VITE_SUPABASE_URL || env?.SUPABASE_URL) as string | undefined;
  const supabaseKey = (env?.VITE_SUPABASE_PUBLISHABLE_KEY || env?.SUPABASE_ANON_KEY || env?.VITE_SUPABASE_ANON_KEY) as string | undefined;

  if (!supabaseUrl || !supabaseKey) {
    return staticCatalog;
  }

  const now = Date.now();
  if (cachedLiveCatalog && (now - cachedLiveCatalog.timestamp < CACHE_TTL_MS)) {
    return cachedLiveCatalog.catalog;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/rest/v1/rpc/list_public_listings`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const liveCatalog = buildListingCatalog(data);
        cachedLiveCatalog = { catalog: liveCatalog, timestamp: now };
        return liveCatalog;
      }
    }
  } catch (_err) {
    // If Supabase fetch fails or times out, gracefully fall back to static snapshot
  }

  return staticCatalog;
};

// Static host, resort, and cruise lookup tables
const hostsBySlug = new Map<string, any>();
for (const org of mockOrganizations) {
  if (org.status === 'active' || org.status === 'approved') {
    hostsBySlug.set(org.slug, org);
    hostsBySlug.set(hostSlug(org.name), org);
    hostsBySlug.set(org.id, org);
  }
}

const resortsBySlug = new Map<string, any>();
for (const resort of resorts) {
  if (resort.status === 'approved') {
    resortsBySlug.set(resort.slug, resort);
    resortsBySlug.set(resort.id, resort);
  }
}

const cruisesBySlug = new Map<string, any>();
for (const cruise of cruiseSeries) {
  if (cruise.status === 'approved') {
    cruisesBySlug.set(cruise.slug, cruise);
    cruisesBySlug.set(cruise.id, cruise);
  }
}

export const getApprovedCities = (catalog: ListingCatalog = staticCatalog): CityCatalogEntry[] => {
  return Array.from(catalog.citiesMap.values()).sort(
    (a, b) => (b.clubs.length + b.events.length) - (a.clubs.length + a.events.length)
  );
};

export const getCityBySlug = (slug: string, catalog: ListingCatalog = staticCatalog): CityCatalogEntry | null => {
  const clean = slugifyPlace(slug);
  return catalog.citiesMap.get(clean) ?? null;
};

export const toAbsoluteUrl = (pathOrUrl?: string | null): string => {
  if (!pathOrUrl) return DEFAULT_OG_IMAGE;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${SITE_ORIGIN}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

const resolveListingSocialImage = (listing: any): { url: string; width: number; height: number; alt: string; card: 'summary' | 'summary_large_image' } => {
  // Check hero image (landscape)
  const hero = listing.headerImageUrl || listing.coverImage || listing.imageUrl;
  if (hero && typeof hero === 'string' && hero.trim() && !hero.includes('picsum.photos')) {
    return {
      url: toAbsoluteUrl(hero),
      width: 1280,
      height: 720,
      alt: `${listing.name} cover`,
      card: 'summary_large_image',
    };
  }

  // For events: check flyer (typically 1:1 square)
  const flyer = listing.flyerImageUrl || listing.flyerUrl;
  if (flyer && typeof flyer === 'string' && flyer.trim() && !flyer.includes('picsum.photos')) {
    return {
      url: toAbsoluteUrl(flyer),
      width: 1080,
      height: 1080,
      alt: `${listing.name} flyer`,
      card: 'summary', // Prevents Twitter/X from cropping square flyers into horizontal strips
    };
  }

  // Check logo (1:1 square)
  const logo = listing.logoImageUrl || listing.logo;
  if (logo && typeof logo === 'string' && logo.trim() && !logo.includes('picsum.photos')) {
    return {
      url: toAbsoluteUrl(logo),
      width: 800,
      height: 800,
      alt: `${listing.name} logo`,
      card: 'summary',
    };
  }

  return {
    url: DEFAULT_OG_IMAGE,
    width: DEFAULT_OG_WIDTH,
    height: DEFAULT_OG_HEIGHT,
    alt: `${listing.name} on SwingSphere`,
    card: 'summary_large_image',
  };
};

const formatLocationString = (city?: string, region?: string, country?: string): string => {
  const parts = [city?.trim(), region?.trim(), country?.trim()].filter(Boolean);
  return parts.join(', ');
};

const resolvePageSeoWithCatalog = (pathname: string, catalog: ListingCatalog): SeoPayload => {
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

  // 2. Club detail page: /clubs/:slug
  const clubMatch = cleanPath.match(/^\/clubs\/([^/]+)$/);
  if (clubMatch) {
    const rawParam = decodeURIComponent(clubMatch[1]);
    const parts = rawParam.split('--');
    const slugPrefix = parts[0];
    const parsedKey = parts.length > 1 ? parts[parts.length - 1] : rawParam;
    const club = catalog.clubsByKey.get(parsedKey)
      || catalog.clubsById.get(parsedKey)
      || catalog.clubsBySlug.get(parsedKey)
      || catalog.clubsBySlug.get(slugPrefix)
      || catalog.clubsByKey.get(rawParam)
      || catalog.clubsById.get(rawParam)
      || catalog.clubsBySlug.get(rawParam);

    if (club) {
      const address = club.geopoint?.address ?? {};
      const city = address.city || '';
      const region = address.region || '';
      const country = address.country || '';
      const loc = formatLocationString(city, region);
      const isPrivateLocation = club.isAddressPrivate === true
        || club.locationVisibility === 'approximate_public'
        || club.locationVisibility === 'private'
        || club.locationVisibility === 'hidden';

      const imageInfo = resolveListingSocialImage(club);
      const title = loc
        ? `${club.name} | Swinger & Lifestyle Club in ${loc} | SwingSphere`
        : `${club.name} | Lifestyle Club | SwingSphere`;

      const description = club.description_short?.trim()
        ? `Explore ${club.name}${loc ? ` in ${loc}` : ''}. ${club.description_short} Operating schedule, amenities, dress code, and access guidelines on SwingSphere.`
        : `Explore ${club.name}${loc ? ` in ${loc}` : ''} on SwingSphere. View lifestyle club amenities, operating schedule, party calendar, dress code, and guest guidelines.`;

      const key = clubKey(club);
      const prettySlug = `${nameSlug(club.name)}--${key}`;
      const canonicalPath = `${SITE_ORIGIN}/clubs/${prettySlug}`;

      const postalAddress: Record<string, unknown> = {
        '@type': 'PostalAddress',
        addressLocality: city || undefined,
        addressRegion: region || undefined,
        addressCountry: country || 'US',
      };
      // Strict privacy check: only include addressLine1 if address is explicitly public
      if (!isPrivateLocation && address.addressLine1) {
        postalAddress.streetAddress = address.addressLine1;
      }
      if (!isPrivateLocation && address.postalCode) {
        postalAddress.postalCode = address.postalCode;
      }

      const structuredData: any[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'NightClub',
          name: club.name,
          description,
          url: canonicalPath,
          image: imageInfo.url,
          address: postalAddress,
          ...(!isPrivateLocation && club.geopoint?.latitude && club.geopoint?.longitude ? {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: club.geopoint.latitude,
              longitude: club.geopoint.longitude,
            },
          } : {}),
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Clubs', item: `${SITE_ORIGIN}/discover` },
            { '@type': 'ListItem', position: 3, name: club.name, item: canonicalPath },
          ],
        },
      ];

      return {
        title,
        description: description.slice(0, 200),
        canonicalUrl: canonicalPath,
        ogType: 'article',
        twitterCard: imageInfo.card,
        imageUrl: imageInfo.url,
        imageAlt: imageInfo.alt,
        imageWidth: imageInfo.width,
        imageHeight: imageInfo.height,
        noIndex: false,
        structuredData,
      };
    }
  }

  // 3. Event detail page: /events/:slug
  const eventMatch = cleanPath.match(/^\/events\/([^/]+)$/);
  if (eventMatch) {
    const rawParam = decodeURIComponent(eventMatch[1]);
    const parts = rawParam.split('--');
    const slugPrefix = parts[0];
    const parsedKey = parts.length > 1 ? parts[parts.length - 1] : rawParam;
    const event = catalog.eventsByKey.get(parsedKey)
      || catalog.eventsById.get(parsedKey)
      || catalog.eventsBySlug.get(parsedKey)
      || catalog.eventsBySlug.get(slugPrefix)
      || catalog.eventsByKey.get(rawParam)
      || catalog.eventsById.get(rawParam)
      || catalog.eventsBySlug.get(rawParam);

    if (event) {
      const address = event.geopoint?.address ?? {};
      const city = address.city || '';
      const region = address.region || '';
      const loc = formatLocationString(city, region);
      const isPrivateLocation = event.isAddressPrivate === true
        || event.locationVisibility === 'approximate_public'
        || event.locationVisibility === 'private'
        || event.locationVisibility === 'hidden';

      const dateStr = event.time?.start
        ? new Date(event.time.start).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '';

      const hostName = event.hostName || 'Community Host';
      const imageInfo = resolveListingSocialImage(event);
      const title = loc
        ? `${event.name} | Swinger & Lifestyle Party in ${loc} | SwingSphere`
        : `${event.name} | Lifestyle Party & Event | SwingSphere`;

      const description = event.description_full?.trim()
        ? `${dateStr ? `${dateStr}: ` : ''}${event.description_full.slice(0, 140)}... Hosted by ${hostName}. Event guidelines, attire, and access details on SwingSphere.`
        : `${event.name}${dateStr ? ` on ${dateStr}` : ''}${loc ? ` in ${loc}` : ''}. Hosted by ${hostName}. Explore theme nights, schedule, attendee guidelines, and tickets on SwingSphere.`;

      const host = normalizeHostName(event.hostName ?? '');
      const key = eventKey(event, host);
      const prettySlug = `${nameSlug(event.name)}--${key}`;
      const canonicalPath = `${SITE_ORIGIN}/events/${prettySlug}`;

      const postalAddress: Record<string, unknown> = {
        '@type': 'PostalAddress',
        addressLocality: city || undefined,
        addressRegion: region || undefined,
        addressCountry: address.country || 'US',
      };
      if (!isPrivateLocation && address.addressLine1) {
        postalAddress.streetAddress = address.addressLine1;
      }

      const structuredData: any[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: event.name,
          description,
          url: canonicalPath,
          image: imageInfo.url,
          startDate: event.time?.start || undefined,
          endDate: event.time?.end || undefined,
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: {
            '@type': 'Place',
            name: isPrivateLocation ? `Private Venue, ${city}` : event.name,
            address: postalAddress,
          },
          organizer: {
            '@type': 'Organization',
            name: hostName,
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Events', item: `${SITE_ORIGIN}/events` },
            { '@type': 'ListItem', position: 3, name: event.name, item: canonicalPath },
          ],
        },
      ];

      return {
        title,
        description: description.slice(0, 200),
        canonicalUrl: canonicalPath,
        ogType: 'article',
        twitterCard: imageInfo.card,
        imageUrl: imageInfo.url,
        imageAlt: imageInfo.alt,
        imageWidth: imageInfo.width,
        imageHeight: imageInfo.height,
        noIndex: false,
        structuredData,
      };
    }
  }

  // 4. Host detail page: /hosts/:slug
  const hostMatch = cleanPath.match(/^\/hosts\/([^/]+)$/);
  if (hostMatch) {
    const rawParam = decodeURIComponent(hostMatch[1]).toLowerCase();
    const host = hostsBySlug.get(rawParam) || hostsBySlug.get(hostSlug(rawParam));
    if (host) {
      const canonicalPath = `${SITE_ORIGIN}/hosts/${host.slug}`;
      const title = `${host.name} | Lifestyle Host & Event Promoter | SwingSphere`;
      const description = host.descriptionShort?.trim()
        ? `${host.descriptionShort.slice(0, 140)}. Explore upcoming swinger parties, play parties, and events produced by ${host.name} on SwingSphere.`
        : `Explore events and parties hosted by ${host.name} on SwingSphere. Verified screening policies, party schedules, and community guidelines.`;

      const imageUrl = host.headerImageUrl ? toAbsoluteUrl(host.headerImageUrl) : DEFAULT_OG_IMAGE;
      const structuredData: any[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: host.name,
          description,
          url: canonicalPath,
          logo: host.logoImageUrl ? toAbsoluteUrl(host.logoImageUrl) : undefined,
          image: imageUrl,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Hosts', item: `${SITE_ORIGIN}/discover` },
            { '@type': 'ListItem', position: 3, name: host.name, item: canonicalPath },
          ],
        },
      ];

      return {
        title,
        description: description.slice(0, 200),
        canonicalUrl: canonicalPath,
        ogType: 'profile',
        twitterCard: 'summary_large_image',
        imageUrl,
        imageAlt: `${host.name} on SwingSphere`,
        imageWidth: 1200,
        imageHeight: 630,
        noIndex: false,
        structuredData,
      };
    }
  }

  // 5. Resort detail page: /resorts/:slug
  const resortMatch = cleanPath.match(/^\/resorts\/([^/]+)$/);
  if (resortMatch) {
    const slug = resortMatch[1].toLowerCase();
    const resort = resortsBySlug.get(slug);
    if (resort) {
      const canonicalPath = `${SITE_ORIGIN}/resorts/${resort.slug}`;
      const loc = formatLocationString(resort.city, resort.country);
      const title = loc
        ? `${resort.name} | Adults-Only Lifestyle Resort in ${loc} | SwingSphere`
        : `${resort.name} | Adults-Only Lifestyle Resort | SwingSphere`;

      const description = resort.descriptionShort?.trim()
        ? `${resort.name} in ${loc}. ${resort.descriptionShort} Amenities, theme nights, dress codes, and booking details on SwingSphere.`
        : `Discover ${resort.name} in ${loc} on SwingSphere. Premier adults-only lifestyle resort, clothing-optional amenities, entertainment, and booking info.`;

      const imageUrl = resort.headerImageUrl ? toAbsoluteUrl(resort.headerImageUrl) : DEFAULT_OG_IMAGE;
      const structuredData: any[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'Resort',
          name: resort.name,
          description,
          url: canonicalPath,
          image: imageUrl,
          address: {
            '@type': 'PostalAddress',
            addressLocality: resort.city || undefined,
            addressCountry: resort.country || undefined,
          },
          ...(resort.latitude && resort.longitude ? {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: resort.latitude,
              longitude: resort.longitude,
            },
          } : {}),
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Travel', item: `${SITE_ORIGIN}/travel` },
            { '@type': 'ListItem', position: 3, name: resort.name, item: canonicalPath },
          ],
        },
      ];

      return {
        title,
        description: description.slice(0, 200),
        canonicalUrl: canonicalPath,
        ogType: 'article',
        twitterCard: 'summary_large_image',
        imageUrl,
        imageAlt: `${resort.name} resort`,
        imageWidth: 1200,
        imageHeight: 630,
        noIndex: false,
        structuredData,
      };
    }
  }

  // 6. Cruise detail page: /cruises/:slug
  const cruiseMatch = cleanPath.match(/^\/cruises\/([^/]+)$/);
  if (cruiseMatch) {
    const slug = cruiseMatch[1].toLowerCase();
    const cruise = cruisesBySlug.get(slug);
    if (cruise) {
      const canonicalPath = `${SITE_ORIGIN}/cruises/${cruise.slug}`;
      const title = `${cruise.name} | Adults-Only Lifestyle Cruise | SwingSphere`;
      const description = cruise.descriptionShort?.trim()
        ? `${cruise.descriptionShort} Discover luxury adults-only swinger cruises, theme sailings, and booking details on SwingSphere.`
        : `Explore ${cruise.name} on SwingSphere. Adults-only lifestyle cruise, luxury amenities, clothing-optional decks, and itinerary details.`;

      const imageUrl = cruise.headerImageUrl ? toAbsoluteUrl(cruise.headerImageUrl) : DEFAULT_OG_IMAGE;
      const structuredData: any[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'TouristTrip',
          name: cruise.name,
          description,
          url: canonicalPath,
          image: imageUrl,
          provider: cruise.cruiseLine ? {
            '@type': 'Organization',
            name: cruise.cruiseLine,
          } : undefined,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Travel', item: `${SITE_ORIGIN}/travel` },
            { '@type': 'ListItem', position: 3, name: cruise.name, item: canonicalPath },
          ],
        },
      ];

      return {
        title,
        description: description.slice(0, 200),
        canonicalUrl: canonicalPath,
        ogType: 'article',
        twitterCard: 'summary_large_image',
        imageUrl,
        imageAlt: `${cruise.name} cruise`,
        imageWidth: 1200,
        imageHeight: 630,
        noIndex: false,
        structuredData,
      };
    }
  }

  // 7. Regional discovery routes:
  // /swinger-clubs/:city, /lifestyle-clubs/:city
  // /swinger-parties/:city, /lifestyle-events/:city, /play-parties/:city
  const regionalMatch = cleanPath.match(/^\/(swinger-clubs|lifestyle-clubs|swinger-parties|lifestyle-events|play-parties)\/([^/]+)$/);
  if (regionalMatch) {
    const routeCategory = regionalMatch[1];
    const citySlug = regionalMatch[2].toLowerCase();
    const cityEntry = getCityBySlug(citySlug, catalog);

    const isClubIntent = routeCategory === 'swinger-clubs' || routeCategory === 'lifestyle-clubs';
    const isPlayPartyIntent = routeCategory === 'play-parties';

    // Canonicalize to primary URL patterns: /swinger-clubs/:city or /swinger-parties/:city
    const primaryPrefix = isPlayPartyIntent ? 'play-parties' : isClubIntent ? 'swinger-clubs' : 'swinger-parties';
    const cityCanonical = `${SITE_ORIGIN}/${primaryPrefix}/${citySlug}`;

    if (cityEntry) {
      const count = isClubIntent ? cityEntry.clubs.length : cityEntry.events.length;
      const noun = isClubIntent ? (count === 1 ? 'venue' : 'venues') : (count === 1 ? 'party' : 'parties');
      const countText = count > 0 ? ` (${count} approved ${noun})` : '';
      const regionState = cityEntry.region ? `, ${cityEntry.region}` : '';
      const cityHeading = `${cityEntry.name}${regionState}`;

      const title = isPlayPartyIntent
        ? `Play Parties & Lifestyle Events in ${cityHeading} | SwingSphere`
        : isClubIntent
        ? `Swinger Clubs & Lifestyle Venues in ${cityHeading} | SwingSphere`
        : `Swinger Parties & Lifestyle Events in ${cityHeading} | SwingSphere`;

      const description = isPlayPartyIntent
        ? `Explore curated play parties, consent-first lifestyle events, and adult socials in ${cityHeading}${countText}. Attendee guidelines, schedules, and RSVP access on SwingSphere.`
        : isClubIntent
        ? `Discover approved swinger clubs and lifestyle venues in ${cityHeading}${countText}. View club amenities, access policies, dress codes, and upcoming party schedules on SwingSphere.`
        : `Browse upcoming swinger parties, play parties, and lifestyle events in ${cityHeading}${countText}. Attendee requirements, theme nights, and ticket access on SwingSphere.`;

      // Pick top listing image for rich social card if available
      const topListing = isClubIntent ? cityEntry.clubs[0] : cityEntry.events[0];
      const imageInfo = topListing ? resolveListingSocialImage(topListing) : {
        url: DEFAULT_OG_IMAGE,
        width: DEFAULT_OG_WIDTH,
        height: DEFAULT_OG_HEIGHT,
        alt: `${cityHeading} lifestyle discovery on SwingSphere`,
        card: 'summary_large_image' as const,
      };

      const structuredData: any[] = [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: cityCanonical,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
            { '@type': 'ListItem', position: 2, name: 'Directory', item: `${SITE_ORIGIN}/discover` },
            { '@type': 'ListItem', position: 3, name: `${cityEntry.name} ${isClubIntent ? 'Clubs' : 'Parties'}`, item: cityCanonical },
          ],
        },
      ];

      return {
        title,
        description: description.slice(0, 200),
        canonicalUrl: cityCanonical,
        ogType: 'website',
        twitterCard: imageInfo.card,
        imageUrl: imageInfo.url,
        imageAlt: imageInfo.alt,
        imageWidth: imageInfo.width,
        imageHeight: imageInfo.height,
        noIndex: count === 0, // Noindex empty cities to prevent thin pages while preserving active smaller markets
        structuredData,
      };
    } else {
      // Empty / unknown city: serve noindex fallback
      const cleanCityName = citySlug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return {
        title: `Lifestyle Discovery in ${cleanCityName} | SwingSphere`,
        description: `Explore lifestyle clubs, swinger parties, and community nightlife in ${cleanCityName} on SwingSphere.`,
        canonicalUrl: cityCanonical,
        ogType: 'website',
        twitterCard: 'summary_large_image',
        imageUrl: DEFAULT_OG_IMAGE,
        imageAlt: DEFAULT_OG_IMAGE_ALT,
        imageWidth: DEFAULT_OG_WIDTH,
        imageHeight: DEFAULT_OG_HEIGHT,
        noIndex: true, // Crucial: protect against thin door-pages for unlisted cities
        structuredData: {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'SwingSphere',
          url: SITE_ORIGIN,
        },
      };
    }
  }

  // 8. Main Directory: /discover
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

  // 9. Events Index: /events
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

  // 10. Travel Index: /travel
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

  // 11. 3D Globe / Map: /globe, /map, /explore
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

  // 12. Informational pages: /about, /faq, /contact, /tos, /privacy
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

  // 13. Homepage Default: /
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

export const resolvePageSeo = async (
  pathname: string,
  env?: Record<string, unknown>
): Promise<SeoPayload> => {
  const catalog = await getListingCatalog(env);
  return resolvePageSeoWithCatalog(pathname, catalog);
};

export const resolvePageSeoSync = (pathname: string): SeoPayload => {
  return resolvePageSeoWithCatalog(pathname, staticCatalog);
};

const generateSitemapXmlWithCatalog = (catalog: ListingCatalog): string => {
  const urls: Array<{ loc: string; changefreq: string; priority: string; lastmod?: string }> = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const fourteenDaysAgo = now.getTime() - (14 * 24 * 60 * 60 * 1000);

  // Core static pages
  urls.push({ loc: `${SITE_ORIGIN}/`, changefreq: 'weekly', priority: '1.0', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/discover`, changefreq: 'daily', priority: '0.9', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/events`, changefreq: 'daily', priority: '0.9', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/travel`, changefreq: 'weekly', priority: '0.8', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/globe`, changefreq: 'weekly', priority: '0.8', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/about`, changefreq: 'monthly', priority: '0.5', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/faq`, changefreq: 'monthly', priority: '0.5', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/contact`, changefreq: 'monthly', priority: '0.4', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/privacy`, changefreq: 'monthly', priority: '0.3', lastmod: todayStr });
  urls.push({ loc: `${SITE_ORIGIN}/tos`, changefreq: 'monthly', priority: '0.3', lastmod: todayStr });

  // Approved clubs
  for (const club of catalog.clubs) {
    const key = clubKey(club);
    const prettySlug = `${nameSlug(club.name)}--${key}`;
    const loc = `${SITE_ORIGIN}/clubs/${prettySlug}`;
    urls.push({
      loc,
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: todayStr,
    });
  }

  // Approved upcoming & recent events (exclude events older than 14 days)
  for (const event of catalog.events) {
    if (event.id.includes('mock') || event.id.includes('dummy')) continue;
    const startTime = event.time?.start ? new Date(event.time.start).getTime() : 0;
    if (startTime && startTime < fourteenDaysAgo) continue; // Skip expired events

    const host = normalizeHostName(event.hostName ?? '');
    const key = eventKey(event, host);
    const prettySlug = `${nameSlug(event.name)}--${key}`;
    const loc = `${SITE_ORIGIN}/events/${prettySlug}`;
    urls.push({
      loc,
      changefreq: 'daily',
      priority: '0.8',
      lastmod: todayStr,
    });
  }

  // Approved hosts
  for (const org of mockOrganizations) {
    if ((org.status === 'active' || org.status === 'approved') && org.slug) {
      urls.push({
        loc: `${SITE_ORIGIN}/hosts/${org.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: todayStr,
      });
    }
  }

  // Approved resorts & cruises
  for (const resort of resorts) {
    if (resort.status === 'approved' && resort.slug) {
      urls.push({
        loc: `${SITE_ORIGIN}/resorts/${resort.slug}`,
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: todayStr,
      });
    }
  }

  for (const cruise of cruiseSeries) {
    if (cruise.status === 'approved' && cruise.slug) {
      urls.push({
        loc: `${SITE_ORIGIN}/cruises/${cruise.slug}`,
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: todayStr,
      });
    }
  }

  // Active regional discovery pages (ONLY cities with approved clubs or active events)
  const approvedCities = getApprovedCities(catalog);
  for (const city of approvedCities) {
    if (city.clubs.length > 0) {
      urls.push({
        loc: `${SITE_ORIGIN}/swinger-clubs/${city.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: todayStr,
      });
    }
    if (city.events.length > 0) {
      urls.push({
        loc: `${SITE_ORIGIN}/swinger-parties/${city.slug}`,
        changefreq: 'daily',
        priority: '0.7',
        lastmod: todayStr,
      });
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueUrls = urls.filter((item) => {
    if (seen.has(item.loc)) return false;
    seen.add(item.loc);
    return true;
  });

  const xmlEntries = uniqueUrls.map(
    (u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod || todayStr}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlEntries.join('\n')}\n</urlset>\n`;
};

export const generateSitemapXml = async (
  env?: Record<string, unknown>
): Promise<string> => {
  const catalog = await getListingCatalog(env);
  return generateSitemapXmlWithCatalog(catalog);
};

export const generateSitemapXmlSync = (): string => {
  return generateSitemapXmlWithCatalog(staticCatalog);
};
