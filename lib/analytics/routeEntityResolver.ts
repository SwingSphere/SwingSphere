import type {
  ClubBrandData,
  ClubData,
  CruiseSailingData,
  CruiseSeriesData,
  EventData,
  EventSeriesData,
  Listing,
  OrganizationData,
  ResortData,
  VenueData,
} from '../../types';
import type { EntityIndex } from '../entityIndex';
import { getClubCanonicalPath, getEventCanonicalPath, getHostCanonicalPath, getVenueCanonicalPath } from '../entityUtils';
import { clubKey, eventKey, hostSlug, nameSlug, normalizeHostName } from '../identityUtils';

export type AnalyticsContentType =
  | 'Event'
  | 'Club'
  | 'Host'
  | 'Resort'
  | 'Cruise'
  | 'Venue'
  | 'Directory'
  | 'Globe'
  | 'Map'
  | 'Home'
  | 'Other';

export type AnalyticsCatalog = {
  listings?: Listing[];
  venues?: VenueData[];
  organizations?: OrganizationData[];
  eventSeries?: EventSeriesData[];
  clubBrands?: ClubBrandData[];
  resorts?: ResortData[];
  cruiseSeries?: CruiseSeriesData[];
  cruiseSailings?: CruiseSailingData[];
  entityIndex?: EntityIndex | null;
};

export type ResolvedInternalRoute = {
  title: string;
  entityType: AnalyticsContentType;
  href: string | null;
  rawPath: string;
  subtitle?: string;
  isResolvedEntity: boolean;
};

export type ResolvedAnalyticsEntity = {
  title: string;
  entityType: AnalyticsContentType;
  typeBadge: string;
  href: string | null;
  entityId: string;
  rawEntityType: string;
  subtitle?: string;
};

export type OutboundCategoryKey =
  | 'ticket'
  | 'website'
  | 'social'
  | 'rsvp'
  | 'booking'
  | 'directions'
  | 'calendar'
  | 'email'
  | 'other';

export type ClassifiedOutboundDestination = {
  categoryKey: OutboundCategoryKey;
  categoryLabel: string;
  providerLabel: string | null;
  displayDestination: string;
  domain: string;
  path: string;
  href: string | null;
};

const humanizeSlug = (slug: string): string => {
  const base = decodeURIComponent(slug)
    .split('--')[0]
    .replace(/^[-_]+|[-_]+$/g, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!base) return slug;
  return base.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const extractSlugParts = (segment: string): { full: string; prettyPart: string; keyPart: string } => {
  const clean = decodeURIComponent(segment).trim().toLowerCase();
  const splitIndex = clean.indexOf('--');
  if (splitIndex < 0) {
    return { full: clean, prettyPart: clean, keyPart: '' };
  }
  return {
    full: clean,
    prettyPart: clean.slice(0, splitIndex),
    keyPart: clean.slice(splitIndex + 2),
  };
};

export const resolveInternalRoute = (
  rawPathInput: string,
  catalog?: AnalyticsCatalog | null,
): ResolvedInternalRoute => {
  const rawPath = (rawPathInput || '/').trim();
  const cleanPath = rawPath.split(/[?#]/)[0] || '/';
  const lower = cleanPath.toLowerCase();

  // Handle mobile/tablet wrapper prefixes transparently while keeping clickable path
  const normalizedRoute = lower.replace(/^\/(mobile|tablet)(?=\/|$)/, '') || '/';
  const isMobilePrefix = lower.startsWith('/mobile');
  const isTabletPrefix = lower.startsWith('/tablet');
  const devicePrefixLabel = isMobilePrefix ? 'Mobile view' : isTabletPrefix ? 'Tablet view' : undefined;

  if (normalizedRoute === '/' || normalizedRoute === '/home') {
    return {
      title: 'SwingSphere Home',
      entityType: 'Home',
      href: cleanPath,
      rawPath,
      subtitle: devicePrefixLabel || 'Landing & hero overview',
      isResolvedEntity: true,
    };
  }

  if (normalizedRoute === '/globe' || normalizedRoute === '/explore' || normalizedRoute === '/nearby') {
    return {
      title: '3D Globe Explorer',
      entityType: 'Globe',
      href: cleanPath === '/explore' ? '/globe' : cleanPath,
      rawPath,
      subtitle: devicePrefixLabel || 'Interactive spatial discovery',
      isResolvedEntity: true,
    };
  }

  if (normalizedRoute === '/map') {
    return {
      title: 'Interactive Map',
      entityType: 'Map',
      href: cleanPath,
      rawPath,
      subtitle: devicePrefixLabel || 'MapLibre discovery surface',
      isResolvedEntity: true,
    };
  }

  if (normalizedRoute === '/discover' || normalizedRoute === '/search') {
    return {
      title: 'Discovery Directory',
      entityType: 'Directory',
      href: cleanPath,
      rawPath,
      subtitle: devicePrefixLabel || 'Clubs, events & hosts directory',
      isResolvedEntity: true,
    };
  }

  if (normalizedRoute === '/events') {
    return {
      title: 'Events Directory',
      entityType: 'Event',
      href: cleanPath,
      rawPath,
      subtitle: 'All upcoming events',
      isResolvedEntity: true,
    };
  }

  if (normalizedRoute === '/travel') {
    return {
      title: 'Travel: Resorts & Cruises',
      entityType: 'Resort',
      href: cleanPath,
      rawPath,
      subtitle: 'Lifestyle resorts and cruise sailings',
      isResolvedEntity: true,
    };
  }

  const cityMatch = normalizedRoute.match(
    /^\/(swinger-clubs|lifestyle-clubs|swinger-parties|lifestyle-events|play-parties)\/([^/]+)\/?$/,
  );
  if (cityMatch) {
    const [, intent, citySlug] = cityMatch;
    const cityTitle = humanizeSlug(citySlug);
    const kindLabel = intent.includes('club') ? 'Clubs' : 'Events & Parties';
    return {
      title: `${cityTitle} ${kindLabel}`,
      entityType: 'Directory',
      href: cleanPath,
      rawPath,
      subtitle: `City discovery · ${cityTitle}`,
      isResolvedEntity: true,
    };
  }

  const listings = catalog?.listings ?? [];
  const clubs = listings.filter((item): item is ClubData => item.type === 'club');
  const events = listings.filter((item): item is EventData => item.type === 'event');
  const index = catalog?.entityIndex ?? null;

  // /listing/:id legacy redirect route
  const listingMatch = normalizedRoute.match(/^\/listing\/([^/]+)\/?$/);
  if (listingMatch) {
    const id = decodeURIComponent(listingMatch[1]);
    const match = listings.find((item) => item.id.toLowerCase() === id.toLowerCase());
    if (match) {
      const canonical = match.type === 'event'
        ? getEventCanonicalPath(match, index ?? undefined)
        : getClubCanonicalPath(match, index ?? undefined);
      const city = match.geopoint?.address?.city || match.location || undefined;
      return {
        title: match.name,
        entityType: match.type === 'event' ? 'Event' : 'Club',
        href: canonical,
        rawPath,
        subtitle: city,
        isResolvedEntity: true,
      };
    }
  }

  // /events/:slug
  const eventMatch = normalizedRoute.match(/^\/events\/([^/]+)\/?$/);
  if (eventMatch) {
    const { full, prettyPart, keyPart } = extractSlugParts(eventMatch[1]);
    let matchedEvent: EventData | undefined;

    if (keyPart && index?.eventsByKey.has(keyPart)) {
      matchedEvent = index.eventsByKey.get(keyPart);
    }
    if (!matchedEvent) {
      matchedEvent = events.find((ev) => {
        const evId = ev.id.toLowerCase();
        const evSlug = nameSlug(ev.name).toLowerCase();
        const computedKey = (index?.eventKeyById.get(ev.id) ?? eventKey(ev, normalizeHostName(ev.hostName ?? ''))).toLowerCase();
        return (
          evId === full
          || evId === keyPart
          || computedKey === keyPart
          || computedKey === full
          || evSlug === full
          || evSlug === prettyPart
        );
      });
    }

    if (matchedEvent) {
      const canonical = getEventCanonicalPath(matchedEvent, index ?? undefined);
      const city = matchedEvent.geopoint?.address?.city || matchedEvent.location || undefined;
      return {
        title: matchedEvent.name,
        entityType: 'Event',
        href: canonical || cleanPath,
        rawPath,
        subtitle: city,
        isResolvedEntity: true,
      };
    }

    const matchedSeries = (catalog?.eventSeries ?? []).find(
      (series) =>
        series.slug.toLowerCase() === full
        || series.slug.toLowerCase() === prettyPart
        || series.id.toLowerCase() === full
        || nameSlug(series.name).toLowerCase() === prettyPart,
    );
    if (matchedSeries) {
      return {
        title: matchedSeries.name,
        entityType: 'Event',
        href: cleanPath,
        rawPath,
        subtitle: 'Event series',
        isResolvedEntity: true,
      };
    }

    return {
      title: humanizeSlug(eventMatch[1]),
      entityType: 'Event',
      href: cleanPath,
      rawPath,
      subtitle: devicePrefixLabel,
      isResolvedEntity: false,
    };
  }

  // /clubs/:slug
  const clubMatch = normalizedRoute.match(/^\/clubs\/([^/]+)\/?$/);
  if (clubMatch) {
    const { full, prettyPart, keyPart } = extractSlugParts(clubMatch[1]);
    let matchedClub: ClubData | undefined;

    if (keyPart && index?.clubsByKey.has(keyPart)) {
      matchedClub = index.clubsByKey.get(keyPart);
    }
    if (!matchedClub) {
      matchedClub = clubs.find((club) => {
        const cId = club.id.toLowerCase();
        const cSlug = nameSlug(club.name).toLowerCase();
        const computedKey = (index?.clubKeyById.get(club.id) ?? clubKey(club)).toLowerCase();
        return (
          cId === full
          || cId === keyPart
          || computedKey === keyPart
          || computedKey === full
          || cSlug === full
          || cSlug === prettyPart
        );
      });
    }

    if (matchedClub) {
      const canonical = getClubCanonicalPath(matchedClub, index ?? undefined);
      const city = matchedClub.geopoint?.address?.city || matchedClub.location || undefined;
      return {
        title: matchedClub.name,
        entityType: 'Club',
        href: canonical || cleanPath,
        rawPath,
        subtitle: city,
        isResolvedEntity: true,
      };
    }

    const matchedBrand = (catalog?.clubBrands ?? []).find(
      (brand) =>
        brand.slug.toLowerCase() === full
        || brand.slug.toLowerCase() === prettyPart
        || brand.id.toLowerCase() === full
        || nameSlug(brand.name).toLowerCase() === prettyPart,
    );
    if (matchedBrand) {
      return {
        title: matchedBrand.name,
        entityType: 'Club',
        href: cleanPath,
        rawPath,
        subtitle: 'Club brand',
        isResolvedEntity: true,
      };
    }

    return {
      title: humanizeSlug(clubMatch[1]),
      entityType: 'Club',
      href: cleanPath,
      rawPath,
      subtitle: devicePrefixLabel,
      isResolvedEntity: false,
    };
  }

  // /hosts/:slug
  const hostMatch = normalizedRoute.match(/^\/hosts\/([^/]+)\/?$/);
  if (hostMatch) {
    const { full, prettyPart } = extractSlugParts(hostMatch[1]);
    const hostFromIndex = index?.hostsBySlug.get(full) ?? index?.hostsBySlug.get(prettyPart);
    if (hostFromIndex) {
      return {
        title: hostFromIndex.name,
        entityType: 'Host',
        href: getHostCanonicalPath(hostFromIndex.slug),
        rawPath,
        subtitle: 'Host / Promoter',
        isResolvedEntity: true,
      };
    }

    const orgMatch = (catalog?.organizations ?? []).find(
      (org) =>
        org.slug.toLowerCase() === full
        || org.slug.toLowerCase() === prettyPart
        || org.id.toLowerCase() === full
        || nameSlug(org.name).toLowerCase() === prettyPart,
    );
    if (orgMatch) {
      return {
        title: orgMatch.name,
        entityType: 'Host',
        href: getHostCanonicalPath(orgMatch.slug),
        rawPath,
        subtitle: 'Host / Promoter',
        isResolvedEntity: true,
      };
    }

    return {
      title: humanizeSlug(hostMatch[1]),
      entityType: 'Host',
      href: cleanPath,
      rawPath,
      subtitle: 'Host / Promoter',
      isResolvedEntity: false,
    };
  }

  // /resorts/:slug
  const resortMatch = normalizedRoute.match(/^\/resorts\/([^/]+)\/?$/);
  if (resortMatch) {
    const { full, prettyPart } = extractSlugParts(resortMatch[1]);
    const resort = (catalog?.resorts ?? []).find(
      (item) =>
        item.slug.toLowerCase() === full
        || item.slug.toLowerCase() === prettyPart
        || item.id.toLowerCase() === full
        || nameSlug(item.name).toLowerCase() === prettyPart,
    );
    if (resort) {
      const location = [resort.geopoint?.address?.city, resort.geopoint?.address?.country].filter(Boolean).join(', ');
      return {
        title: resort.name,
        entityType: 'Resort',
        href: `/resorts/${resort.slug}`,
        rawPath,
        subtitle: location || 'Destination resort',
        isResolvedEntity: true,
      };
    }
    return {
      title: humanizeSlug(resortMatch[1]),
      entityType: 'Resort',
      href: cleanPath,
      rawPath,
      subtitle: 'Resort',
      isResolvedEntity: false,
    };
  }

  // /cruises/:slug
  const cruiseMatch = normalizedRoute.match(/^\/cruises\/([^/]+)\/?$/);
  if (cruiseMatch) {
    const { full, prettyPart } = extractSlugParts(cruiseMatch[1]);
    const sailing = (catalog?.cruiseSailings ?? []).find(
      (item) =>
        item.slug.toLowerCase() === full
        || item.slug.toLowerCase() === prettyPart
        || item.id.toLowerCase() === full
        || nameSlug(item.name).toLowerCase() === prettyPart,
    );
    if (sailing) {
      return {
        title: sailing.name,
        entityType: 'Cruise',
        href: `/cruises/${sailing.slug}`,
        rawPath,
        subtitle: sailing.shipName ? `${sailing.shipName} · Cruise sailing` : 'Cruise sailing',
        isResolvedEntity: true,
      };
    }
    const series = (catalog?.cruiseSeries ?? []).find(
      (item) =>
        item.slug.toLowerCase() === full
        || item.slug.toLowerCase() === prettyPart
        || item.id.toLowerCase() === full
        || nameSlug(item.name).toLowerCase() === prettyPart,
    );
    if (series) {
      return {
        title: series.name,
        entityType: 'Cruise',
        href: `/cruises/${series.slug}`,
        rawPath,
        subtitle: 'Cruise series',
        isResolvedEntity: true,
      };
    }
    return {
      title: humanizeSlug(cruiseMatch[1]),
      entityType: 'Cruise',
      href: cleanPath,
      rawPath,
      subtitle: 'Cruise',
      isResolvedEntity: false,
    };
  }

  // /venues/:slug
  const venueMatch = normalizedRoute.match(/^\/venues\/([^/]+)\/?$/);
  if (venueMatch) {
    const { full, prettyPart } = extractSlugParts(venueMatch[1]);
    const venue = (catalog?.venues ?? []).find(
      (item) =>
        item.slug.toLowerCase() === full
        || item.slug.toLowerCase() === prettyPart
        || item.id.toLowerCase() === full
        || nameSlug(item.name).toLowerCase() === prettyPart,
    );
    if (venue) {
      return {
        title: venue.name,
        entityType: 'Venue',
        href: getVenueCanonicalPath(venue),
        rawPath,
        subtitle: [venue.address?.city, venue.address?.country].filter(Boolean).join(', ') || 'Venue',
        isResolvedEntity: true,
      };
    }
    return {
      title: humanizeSlug(venueMatch[1]),
      entityType: 'Venue',
      href: cleanPath,
      rawPath,
      subtitle: 'Venue',
      isResolvedEntity: false,
    };
  }

  // Static pages
  const staticPages: Record<string, { title: string; subtitle: string }> = {
    '/about': { title: 'About SwingSphere', subtitle: 'Company & mission' },
    '/faq': { title: 'FAQ', subtitle: 'Help & frequently asked questions' },
    '/privacy': { title: 'Privacy Policy', subtitle: 'Legal & trust' },
    '/tos': { title: 'Terms of Service', subtitle: 'Legal & terms' },
    '/contact': { title: 'Contact Us', subtitle: 'Support & inquiries' },
    '/submission': { title: 'Submit a Listing', subtitle: 'Community submission flow' },
    '/host-dashboard': { title: 'Host Dashboard', subtitle: 'Organizer portal' },
  };
  if (staticPages[normalizedRoute]) {
    return {
      title: staticPages[normalizedRoute].title,
      entityType: 'Other',
      href: cleanPath,
      rawPath,
      subtitle: staticPages[normalizedRoute].subtitle,
      isResolvedEntity: true,
    };
  }

  const lastSegment = normalizedRoute.split('/').filter(Boolean).pop() || cleanPath;
  return {
    title: humanizeSlug(lastSegment),
    entityType: 'Other',
    href: cleanPath.startsWith('/') ? cleanPath : null,
    rawPath,
    subtitle: devicePrefixLabel,
    isResolvedEntity: false,
  };
};

export const resolveAnalyticsEntity = (
  rawEntityType: string,
  entityId: string,
  catalog?: AnalyticsCatalog | null,
): ResolvedAnalyticsEntity => {
  const type = (rawEntityType || 'other').toLowerCase().trim();
  const id = (entityId || '').trim();
  const idLower = id.toLowerCase();
  const listings = catalog?.listings ?? [];
  const index = catalog?.entityIndex ?? null;

  if (type === 'club') {
    const club = listings.find(
      (item): item is ClubData =>
        item.type === 'club' && (item.id.toLowerCase() === idLower || nameSlug(item.name).toLowerCase() === idLower),
    );
    if (club) {
      return {
        title: club.name,
        entityType: 'Club',
        typeBadge: 'Club',
        href: getClubCanonicalPath(club, index ?? undefined),
        entityId: id,
        rawEntityType: type,
        subtitle: club.geopoint?.address?.city || club.location || undefined,
      };
    }
    return {
      title: humanizeSlug(id),
      entityType: 'Club',
      typeBadge: 'Club',
      href: `/clubs/${encodeURIComponent(id)}`,
      entityId: id,
      rawEntityType: type,
    };
  }

  if (type === 'event') {
    const event = listings.find(
      (item): item is EventData =>
        item.type === 'event' && (item.id.toLowerCase() === idLower || nameSlug(item.name).toLowerCase() === idLower),
    );
    if (event) {
      return {
        title: event.name,
        entityType: 'Event',
        typeBadge: 'Event',
        href: getEventCanonicalPath(event, index ?? undefined),
        entityId: id,
        rawEntityType: type,
        subtitle: event.geopoint?.address?.city || event.location || undefined,
      };
    }
    return {
      title: humanizeSlug(id),
      entityType: 'Event',
      typeBadge: 'Event',
      href: `/events/${encodeURIComponent(id)}`,
      entityId: id,
      rawEntityType: type,
    };
  }

  if (type === 'event_series') {
    const series = (catalog?.eventSeries ?? []).find(
      (item) => item.id.toLowerCase() === idLower || item.slug.toLowerCase() === idLower,
    );
    if (series) {
      const firstOccurrence = listings.find(
        (item): item is EventData => item.type === 'event' && item.eventSeriesId === series.id,
      );
      return {
        title: series.name,
        entityType: 'Event',
        typeBadge: 'Event Series',
        href: firstOccurrence ? getEventCanonicalPath(firstOccurrence, index ?? undefined) : `/events/${series.slug}`,
        entityId: id,
        rawEntityType: type,
      };
    }
    return {
      title: humanizeSlug(id),
      entityType: 'Event',
      typeBadge: 'Event Series',
      href: `/events`,
      entityId: id,
      rawEntityType: type,
    };
  }

  if (type === 'organization') {
    const org = (catalog?.organizations ?? []).find(
      (item) => item.id.toLowerCase() === idLower || item.slug.toLowerCase() === idLower,
    );
    if (org) {
      return {
        title: org.name,
        entityType: 'Host',
        typeBadge: 'Host / Promoter',
        href: getHostCanonicalPath(org.slug || hostSlug(org.name)),
        entityId: id,
        rawEntityType: type,
      };
    }
    const cleanHost = id.replace(/^org-(host|promoter)-/i, '');
    return {
      title: humanizeSlug(cleanHost),
      entityType: 'Host',
      typeBadge: 'Host / Promoter',
      href: getHostCanonicalPath(cleanHost),
      entityId: id,
      rawEntityType: type,
    };
  }

  if (type === 'venue') {
    const venue = (catalog?.venues ?? []).find(
      (item) => item.id.toLowerCase() === idLower || item.slug.toLowerCase() === idLower,
    );
    if (venue) {
      return {
        title: venue.name,
        entityType: 'Venue',
        typeBadge: 'Venue',
        href: getVenueCanonicalPath(venue),
        entityId: id,
        rawEntityType: type,
        subtitle: [venue.address?.city, venue.address?.country].filter(Boolean).join(', ') || undefined,
      };
    }
    return {
      title: humanizeSlug(id),
      entityType: 'Venue',
      typeBadge: 'Venue',
      href: `/venues/${encodeURIComponent(id)}`,
      entityId: id,
      rawEntityType: type,
    };
  }

  if (type === 'resort') {
    const resort = (catalog?.resorts ?? []).find(
      (item) => item.id.toLowerCase() === idLower || item.slug.toLowerCase() === idLower,
    );
    if (resort) {
      return {
        title: resort.name,
        entityType: 'Resort',
        typeBadge: 'Resort',
        href: `/resorts/${resort.slug}`,
        entityId: id,
        rawEntityType: type,
        subtitle: [resort.geopoint?.address?.city, resort.geopoint?.address?.country].filter(Boolean).join(', ') || undefined,
      };
    }
    return {
      title: humanizeSlug(id),
      entityType: 'Resort',
      typeBadge: 'Resort',
      href: `/resorts/${encodeURIComponent(id)}`,
      entityId: id,
      rawEntityType: type,
    };
  }

  if (type === 'cruise_sailing' || type === 'cruise_series') {
    const sailing = (catalog?.cruiseSailings ?? []).find(
      (item) => item.id.toLowerCase() === idLower || item.slug.toLowerCase() === idLower,
    );
    if (sailing) {
      return {
        title: sailing.name,
        entityType: 'Cruise',
        typeBadge: 'Cruise Sailing',
        href: `/cruises/${sailing.slug}`,
        entityId: id,
        rawEntityType: type,
        subtitle: sailing.shipName || undefined,
      };
    }
    const series = (catalog?.cruiseSeries ?? []).find(
      (item) => item.id.toLowerCase() === idLower || item.slug.toLowerCase() === idLower,
    );
    if (series) {
      return {
        title: series.name,
        entityType: 'Cruise',
        typeBadge: 'Cruise Series',
        href: `/cruises/${series.slug}`,
        entityId: id,
        rawEntityType: type,
      };
    }
    return {
      title: humanizeSlug(id),
      entityType: 'Cruise',
      typeBadge: type === 'cruise_series' ? 'Cruise Series' : 'Cruise',
      href: `/cruises/${encodeURIComponent(id)}`,
      entityId: id,
      rawEntityType: type,
    };
  }

  return {
    title: humanizeSlug(id),
    entityType: 'Other',
    typeBadge: type.replaceAll('_', ' ') || 'Other',
    href: null,
    entityId: id,
    rawEntityType: type,
  };
};

const TICKET_PROVIDERS: Array<{ match: RegExp; label: string }> = [
  { match: /(^|\.)eventbrite\./i, label: 'Eventbrite' },
  { match: /(^|\.)posh\.vip$/i, label: 'Posh' },
  { match: /(^|\.)dice\.fm$/i, label: 'DICE' },
  { match: /(^|\.)shotgun\.live$/i, label: 'Shotgun' },
  { match: /(^|\.)ticketmaster\./i, label: 'Ticketmaster' },
  { match: /(^|\.)tixr\.com$/i, label: 'Tixr' },
  { match: /(^|\.)(lu\.ma|luma\.com)$/i, label: 'Luma' },
  { match: /(^|\.)partiful\.com$/i, label: 'Partiful' },
  { match: /(^|\.)humanitix\.com$/i, label: 'Humanitix' },
  { match: /(^|\.)tickettailor\.com$/i, label: 'Ticket Tailor' },
  { match: /(^|\.)ra\.co$/i, label: 'Resident Advisor' },
  { match: /(^|\.)universe\.com$/i, label: 'Universe' },
  { match: /(^|\.)brownpapertickets\.com$/i, label: 'Brown Paper Tickets' },
];

const SOCIAL_PROVIDERS: Array<{ match: RegExp; label: string }> = [
  { match: /(^|\.)instagram\.com$/i, label: 'Instagram' },
  { match: /(^|\.)reddit\.com$/i, label: 'Reddit' },
  { match: /(^|\.)(x\.com|twitter\.com)$/i, label: 'X / Twitter' },
  { match: /(^|\.)(bsky\.app|bsky\.social)$/i, label: 'Bluesky' },
  { match: /(^|\.)(threads\.net|threads\.com)$/i, label: 'Threads' },
  { match: /(^|\.)(facebook\.com|fb\.com)$/i, label: 'Facebook' },
  { match: /(^|\.)tiktok\.com$/i, label: 'TikTok' },
  { match: /(^|\.)(youtube\.com|youtu\.be)$/i, label: 'YouTube' },
  { match: /(^|\.)fetlife\.com$/i, label: 'FetLife' },
  { match: /(^|\.)kasidie\.com$/i, label: 'Kasidie' },
  { match: /(^|\.)sdc\.com$/i, label: 'SDC' },
  { match: /(^|\.)(discord\.com|discord\.gg)$/i, label: 'Discord' },
  { match: /(^|\.)(t\.me|telegram\.org)$/i, label: 'Telegram' },
];

const MAP_PROVIDERS: Array<{ match: RegExp; label: string }> = [
  { match: /(^|\.)maps\.google\.|google\.[a-z.]+\/maps/i, label: 'Google Maps' },
  { match: /(^|\.)maps\.apple\.com$/i, label: 'Apple Maps' },
  { match: /(^|\.)waze\.com$/i, label: 'Waze' },
  { match: /^device-maps\.local$/i, label: 'Device Maps' },
];

export const classifyOutboundDestination = (
  destinationType?: string | null,
  destinationDomain?: string | null,
  destinationPath?: string | null,
): ClassifiedOutboundDestination => {
  const type = (destinationType || 'other').toLowerCase().trim();
  const domain = (destinationDomain || '').toLowerCase().trim().replace(/^www\./, '');
  const path = (destinationPath || '').trim();
  const fullDisplay = path && path !== '/' ? `${domain}${path}` : domain || 'External destination';
  const isWebDomain = Boolean(domain) && !domain.endsWith('.local') && /^[a-z0-9.-]+(?::[0-9]+)?$/i.test(domain);
  const href = isWebDomain ? `https://${domain}${path || ''}` : null;

  for (const provider of TICKET_PROVIDERS) {
    if (provider.match.test(domain)) {
      return {
        categoryKey: 'ticket',
        categoryLabel: 'Ticket / Event Info',
        providerLabel: provider.label,
        displayDestination: fullDisplay,
        domain,
        path,
        href,
      };
    }
  }

  for (const provider of MAP_PROVIDERS) {
    if (provider.match.test(`${domain}${path}`)) {
      return {
        categoryKey: 'directions',
        categoryLabel: 'Maps & Directions',
        providerLabel: provider.label,
        displayDestination: domain === 'device-maps.local' ? 'Device Maps App' : fullDisplay,
        domain,
        path,
        href,
      };
    }
  }

  for (const provider of SOCIAL_PROVIDERS) {
    if (provider.match.test(domain)) {
      return {
        categoryKey: 'social',
        categoryLabel: 'Social Platform',
        providerLabel: provider.label,
        displayDestination: fullDisplay,
        domain,
        path,
        href,
      };
    }
  }

  if (type === 'ticket') {
    return {
      categoryKey: 'ticket',
      categoryLabel: 'Ticket / Event Info',
      providerLabel: isWebDomain ? domain : null,
      displayDestination: fullDisplay,
      domain,
      path,
      href,
    };
  }

  if (type === 'rsvp' || type === 'approval_form') {
    return {
      categoryKey: 'rsvp',
      categoryLabel: type === 'approval_form' ? 'Vetting / Approval Form' : 'RSVP / Guestlist',
      providerLabel: isWebDomain ? domain : null,
      displayDestination: fullDisplay,
      domain,
      path,
      href,
    };
  }

  if (type === 'booking') {
    return {
      categoryKey: 'booking',
      categoryLabel: 'Booking / Reservation',
      providerLabel: isWebDomain ? domain : null,
      displayDestination: fullDisplay,
      domain,
      path,
      href,
    };
  }

  if (type === 'social') {
    return {
      categoryKey: 'social',
      categoryLabel: 'Social Platform',
      providerLabel: isWebDomain ? domain : null,
      displayDestination: fullDisplay,
      domain,
      path,
      href,
    };
  }

  if (type === 'directions') {
    return {
      categoryKey: 'directions',
      categoryLabel: 'Maps & Directions',
      providerLabel: domain === 'device-maps.local' ? 'Device Maps' : domain || null,
      displayDestination: domain === 'device-maps.local' ? 'Device Maps App' : fullDisplay,
      domain,
      path,
      href,
    };
  }

  if (type === 'calendar_google' || type === 'calendar_ics' || domain === 'calendar.google.com') {
    return {
      categoryKey: 'calendar',
      categoryLabel: 'Calendar Save',
      providerLabel: type === 'calendar_ics' ? 'ICS Calendar File' : 'Google Calendar',
      displayDestination: domain === 'download.local' ? 'ICS Calendar Export' : fullDisplay,
      domain,
      path,
      href,
    };
  }

  if (type === 'email' || domain === 'email.local') {
    return {
      categoryKey: 'email',
      categoryLabel: 'Email / Contact',
      providerLabel: domain && domain !== 'email.local' ? domain : 'Direct Email',
      displayDestination: domain && domain !== 'email.local' ? `Email (${domain})` : 'Email Contact',
      domain,
      path,
      href: null,
    };
  }

  if (type === 'website' || isWebDomain) {
    return {
      categoryKey: 'website',
      categoryLabel: 'Official Website',
      providerLabel: isWebDomain ? domain : null,
      displayDestination: fullDisplay,
      domain,
      path,
      href,
    };
  }

  return {
    categoryKey: 'other',
    categoryLabel: 'Other Destination',
    providerLabel: null,
    displayDestination: fullDisplay,
    domain,
    path,
    href,
  };
};
