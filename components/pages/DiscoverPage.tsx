import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpDown,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Compass,
  Globe2,
  MapPin,
  RotateCcw,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { getHostCanonicalPath, getListingCanonicalPath } from '../../lib/entityUtils';
import { getListingCardImageUrl, getListingLogoUrl, handleListingImageError } from '../../lib/listingImage';
import { isPlaceholderMediaUrl } from '../../lib/entityBrandMedia';
import { isActiveDiscoveryListing } from '../../lib/eventLifecycle';
import EntityTypePill from '../entity/EntityTypePill';
import type { AttendancePolicy, ClubData, Listing, OrganizationData } from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';

type Kind = 'all' | 'club' | 'event' | 'host';
type DateFilter = 'all' | 'today' | 'weekend' | '30days';
type SortOption = 'default' | 'az' | 'za' | 'upcoming';

type Card = {
  key: string;
  kind: Exclude<Kind, 'all'>;
  name: string;
  href: string;
  image?: string | null;
  logoUrl?: string | null;
  city?: string;
  region?: string;
  country?: string;
  date?: string;
  attendance?: AttendancePolicy;
  description?: string;
  globeListing?: Listing;
};

const KIND_TABS: { value: Kind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'all', label: 'All', icon: Compass },
  { value: 'club', label: 'Clubs', icon: Building2 },
  { value: 'event', label: 'Events', icon: CalendarDays },
  { value: 'host', label: 'Hosts', icon: UsersRound },
];

const AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All audiences' },
  { value: 'mixed_open', label: 'Mixed / open' },
  { value: 'couples_and_single_women', label: 'Couples + single women' },
  { value: 'couples_only', label: 'Couples only' },
  { value: 'couples_focused', label: 'Couples focused' },
  { value: 'all_genders_welcome', label: 'All genders welcome' },
  { value: 'application_required', label: 'Application required' },
  { value: 'open_to_approved_guests', label: 'Approved guests' },
  { value: 'members_only', label: 'Members only' },
  { value: 'men_only', label: 'Men only' },
];

const attendanceLabel = (policy?: AttendancePolicy): string | null => {
  if (!policy) return null;
  const labels: Partial<Record<AttendancePolicy, string>> = {
    mixed_open: 'Mixed / open',
    couples_focused: 'Couples focused',
    couples_only: 'Couples only',
    couples_and_single_women: 'Couples + single women',
    couples_and_select_single_men: 'Couples + select men',
    women_only: 'Women only',
    men_only: 'Men only',
    lgbtq_centered: 'LGBTQ+ centered',
    all_genders_welcome: 'All genders welcome',
    members_only: 'Members only',
    invite_only: 'Invite only',
    application_required: 'Application required',
    varies_by_night: 'Varies by night',
    varies_by_event: 'Varies by event',
    open_to_approved_guests: 'Approved guests',
  };
  return labels[policy] ?? policy.replaceAll('_', ' ');
};

const displayDate = (value?: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const inDateWindow = (value: string | undefined, filter: DateFilter): boolean => {
  if (filter === 'all') return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const end = new Date(now);
  if (filter === 'today') end.setHours(23, 59, 59, 999);
  if (filter === '30days') end.setDate(end.getDate() + 30);
  if (filter === 'weekend') {
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
    const start = new Date(now);
    start.setDate(start.getDate() + daysUntilSaturday);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return date >= start && date <= end;
  }
  return date >= now && date <= end;
};

const normalizeCountry = (country?: string): string => {
  if (!country) return '';
  const c = country.trim().toLowerCase();
  if (c === 'usa' || c === 'us' || c === 'united states') return 'United States';
  return country.trim();
};

const formatCardLocation = (city?: string, region?: string, country?: string): string => {
  const cleanCity = city?.trim() || '';
  const cleanRegion = region?.trim() || '';
  const cleanCountry = normalizeCountry(country);

  if (cleanCountry === 'United States') {
    return cleanRegion ? `${cleanCity}, ${cleanRegion}` : cleanCity;
  }
  return cleanCountry ? `${cleanCity}, ${cleanCountry}` : cleanCity;
};

const getEventHostingLogoUrl = (
  event: Extract<Listing, { type: 'event' }>,
  index: EntityIndex | null,
  listings: Listing[],
): string | null => {
  if (!index) return null;

  // 1. Through index.eventVenueClubKeyById or venueKey
  const clubKey = index.eventVenueClubKeyById.get(event.id) || event.venueKey;
  if (clubKey) {
    const club = index.clubsByKey.get(clubKey);
    if (club) {
      const logo = getListingLogoUrl(club);
      if (logo && !isPlaceholderMediaUrl(logo)) return logo;
    }
  }

  // 2. Through event.venueId (e.g. 'venue-club-twist-sf' -> club-twist-sf or venue in venuesById)
  if (event.venueId) {
    const rawId = event.venueId.replace(/^venue-/, '');
    const club = listings.find(
      (l): l is ClubData =>
        l.type === 'club' &&
        (l.id === event.venueId || l.id === rawId || l.primaryVenueId === event.venueId),
    );
    if (club) {
      const logo = getListingLogoUrl(club);
      if (logo && !isPlaceholderMediaUrl(logo)) return logo;
    }
    const venue = index.venuesById.get(event.venueId);
    if (venue?.logoImageUrl && !isPlaceholderMediaUrl(venue.logoImageUrl)) {
      return venue.logoImageUrl;
    }
  }

  // 3. Through location match with clubs (e.g. "Twist SF" in location text)
  if (event.location) {
    const locLower = event.location.toLowerCase();
    const club = listings.find(
      (l): l is ClubData =>
        l.type === 'club' && Boolean(l.name) && locLower.includes(l.name.toLowerCase()),
    );
    if (club) {
      const logo = getListingLogoUrl(club);
      if (logo && !isPlaceholderMediaUrl(logo)) return logo;
    }
  }

  // 4. Through organizerOrganizationId
  if (event.organizerOrganizationId) {
    const org = index.organizationsById.get(event.organizerOrganizationId);
    if (org?.logoImageUrl && !isPlaceholderMediaUrl(org.logoImageUrl)) {
      return org.logoImageUrl;
    }
  }

  // 5. Direct event logo fallback if available
  if (event.logoImageUrl && !isPlaceholderMediaUrl(event.logoImageUrl)) {
    return event.logoImageUrl;
  }

  return null;
};

const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { listings, organizations, index, isLoading, error } = useEntityIndex();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);

  const kind = (params.get('type') as Kind) || 'all';
  const location = params.get('location') ?? 'all';
  const dateFilter = (params.get('date') as DateFilter) || 'all';
  const audienceFilter = params.get('audience') ?? 'all';
  const sortOption = (params.get('sort') as SortOption) || 'default';
  const committedQuery = params.get('q') ?? '';

  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  // Click outside listener for search autocomplete
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
        setActiveSuggestionIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Keyboard shortcut to focus search with '/' or 'Cmd/Ctrl+K'
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) &&
        document.activeElement !== searchInputRef.current &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const setFilter = (key: string, value: string, emptyValue = 'all') => {
    const next = new URLSearchParams(params);
    if (!value || value === emptyValue) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete('page');
    setParams(next);
  };

  const clearAllFilters = () => {
    const next = new URLSearchParams();
    if (kind !== 'all') next.set('type', kind);
    setParams(next);
    setQuery('');
    setSearchOpen(false);
  };

  const approvedListings = useMemo(
    () => listings.filter((item) => item.status === 'approved' && isActiveDiscoveryListing(item)),
    [listings],
  );

  // Structured location options with formatted labels and counts
  const locations = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    approvedListings.forEach((item) => {
      const a = item.geopoint?.address;
      if (!a) return;
      const formatted = formatCardLocation(a.city, a.region, a.country);
      if (!formatted) return;
      const key = formatted.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { label: formatted, count: 1 });
      }
    });
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [approvedListings]);

  // Map database listings & active hosts to unified Card shape
  const allCards = useMemo<Card[]>(() => {
    if (!index) return [];
    const listingCards: Card[] = approvedListings.map((item) => ({
      key: `${item.type}:${item.id}`,
      kind: item.type,
      name: item.name,
      href: getListingCanonicalPath(item, index),
      image: getListingCardImageUrl(item),
      logoUrl:
        item.type === 'club'
          ? getListingLogoUrl(item)
          : item.type === 'event'
          ? getEventHostingLogoUrl(item, index, listings)
          : null,
      city: item.geopoint?.address?.city,
      region: item.geopoint?.address?.region,
      country: item.geopoint?.address?.country,
      date: item.type === 'event' ? item.time?.start : undefined,
      attendance: item.attendancePolicy,
      description: item.type === 'club' ? item.description_short : item.hostName,
      globeListing: item,
    }));

    const hostCards: Card[] = organizations
      .filter((org): org is OrganizationData => org.status === 'active' || org.status === 'approved')
      .filter((org) => org.displayTypes?.some((type) => type === 'host' || type === 'promoter' || type === 'producer'))
      .map((org) => ({
        key: `host:${org.id}`,
        kind: 'host',
        name: org.name,
        href: getHostCanonicalPath(org.slug),
        image: org.headerImageUrl || org.logoImageUrl,
        logoUrl: org.logoImageUrl,
        description: org.descriptionShort,
        region: org.operatingRegions?.[0],
      }));

    return [...listingCards, ...hostCards];
  }, [approvedListings, index, organizations]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { all: allCards.length, club: 0, event: 0, host: 0 };
    allCards.forEach((c) => {
      counts[c.kind] = (counts[c.kind] || 0) + 1;
    });
    return counts;
  }, [allCards]);

  // Filtered and sorted listings
  const filtered = useMemo(() => {
    const q = (params.get('q') ?? '').trim().toLowerCase();

    return allCards
      .filter((card) => kind === 'all' || card.kind === kind)
      .filter((card) => {
        if (location === 'all') return true;
        const loc = formatCardLocation(card.city, card.region, card.country).toLowerCase();
        return loc === location || loc.includes(location);
      })
      .filter((card) => {
        if (dateFilter === 'all') return true;
        if (card.kind !== 'event') return false;
        return inDateWindow(card.date, dateFilter);
      })
      .filter((card) => {
        if (audienceFilter === 'all') return true;
        return card.attendance === audienceFilter;
      })
      .filter((card) => {
        if (!q) return true;
        const searchTarget = [
          card.name,
          card.city,
          card.region,
          card.country,
          card.description,
          attendanceLabel(card.attendance),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchTarget.includes(q);
      })
      .sort((a, b) => {
        if (sortOption === 'az') return a.name.localeCompare(b.name);
        if (sortOption === 'za') return b.name.localeCompare(a.name);
        if (sortOption === 'upcoming') {
          const timeA = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
          const timeB = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
          if (timeA !== timeB) return timeA - timeB;
          return a.name.localeCompare(b.name);
        }
        // Default sort: if both are events, chronological; if kind is 'event', upcoming first; otherwise alphabetical
        if (a.kind === 'event' && b.kind === 'event') {
          return new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime();
        }
        if (a.kind === 'event' && b.kind !== 'event') return -1;
        if (b.kind === 'event' && a.kind !== 'event') return 1;
        return a.name.localeCompare(b.name);
      });
  }, [allCards, audienceFilter, dateFilter, kind, location, params, sortOption]);

  // Pagination (28 per page strictly enforced for even 4-column grid)
  const pageSize = 28;
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleCards = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
    if (resultsTopRef.current) {
      resultsTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Search Autocomplete Suggestions (Strictly 5 high-relevance matches)
  const searchSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allCards
      .filter((card) =>
        [card.name, card.city, card.region, card.country, card.description].some((value) =>
          value?.toLowerCase().includes(q),
        ),
      )
      .slice(0, 5);
  }, [allCards, query]);

  const suggestionCount = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    return allCards.filter((card) =>
      [card.name, card.city, card.region, card.country, card.description].some((value) =>
        value?.toLowerCase().includes(q),
      ),
    ).length;
  }, [allCards, query]);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setSearchOpen(Boolean(value.trim()));
    setActiveSuggestionIndex(-1);
  };

  const commitSearch = (explicitQuery?: string) => {
    const targetQuery = (explicitQuery ?? query).trim();
    setFilter('q', targetQuery, '');
    setSearchOpen(false);
    setActiveSuggestionIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setActiveSuggestionIndex(-1);
      searchInputRef.current?.blur();
      return;
    }

    if (!searchOpen || !searchSuggestions.length) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitSearch();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev < searchSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev > 0 ? prev - 1 : searchSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex >= 0 && searchSuggestions[activeSuggestionIndex]) {
        navigate(searchSuggestions[activeSuggestionIndex].href);
        setSearchOpen(false);
      } else {
        commitSearch();
      }
    }
  };

  const handleClearSearchInput = () => {
    setQuery('');
    setFilter('q', '', '');
    setSearchOpen(false);
    setActiveSuggestionIndex(-1);
    searchInputRef.current?.focus();
  };

  const hasActiveFilters = Boolean(
    committedQuery ||
      location !== 'all' ||
      dateFilter !== 'all' ||
      audienceFilter !== 'all' ||
      sortOption !== 'default',
  );

  return (
    <div className="relative min-h-screen bg-[#05070a] text-gray-100">
      {/* Hero Section — unclipped so dropdowns flow naturally */}
      <section className="relative isolate border-b border-white/[0.08]">
        {/* Nightlife Ambient Glow — constrained internally */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 20% 0%, rgba(197, 29, 52, 0.14), transparent 70%), radial-gradient(ellipse 50% 50% at 85% 20%, rgba(117, 17, 35, 0.1), transparent 60%), linear-gradient(180deg, #090b10 0%, #05070a 100%)',
          }}
        />

        <div className="mx-auto max-w-7xl px-4 pt-7 pb-6 sm:px-6 sm:pt-8 sm:pb-7 lg:px-8">
          {/* Top Section: Kicker & Modes, Title, Subtitle */}
          <div className="flex flex-col">
            {/* Row 1: Directory Explorer Pill + Other Modes (3D Globe & 2D Map) on the Same Row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-950/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-red-200 backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Directory Explorer
              </div>

              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="text-gray-500 text-[11px] font-medium hidden sm:inline">Other modes:</span>
                <button
                  type="button"
                  onClick={() => navigate('/globe')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                  title="Explore in 3D on the interactive globe"
                >
                  <Globe2 className="h-3.5 w-3.5 text-red-400" />
                  <span>3D Globe</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/map')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                  title="Explore on the flat map"
                >
                  <MapPin className="h-3.5 w-3.5 text-amber-400" />
                  <span>2D Map</span>
                </button>
              </div>
            </div>

            {/* Row 2: Headline */}
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Discover{' '}
              <span className="font-bold tracking-wider text-white">
                <span className="text-red-500">SWING</span>SPHERE
              </span>
            </h1>

            {/* Row 3: Subtitle Copy */}
            <p className="mt-2 text-sm leading-relaxed text-gray-400 sm:text-base max-w-2xl">
              Clubs, curated events, private hosts, and destinations — explore freely without navigating a map.
            </p>
          </div>

          {/* Controls Grid: Category Tabs and Filters vs Search Station */}
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_420px] lg:items-start lg:gap-10">
            {/* Left Column: Category Tabs, and Filters */}
            <div className="flex flex-col order-2 lg:order-1">
              {/* Row 4: Category Navigation Tabs */}
              <div className="flex items-center gap-4 overflow-x-auto pb-1 scrollbar-none">
                <nav className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#080b11]/80 p-1.5 backdrop-blur-md">
                  {KIND_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = kind === tab.value;
                    const count = categoryCounts[tab.value];
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setFilter('type', tab.value)}
                        className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                          isActive
                            ? 'border border-red-500/40 bg-red-500/15 text-white shadow-[0_0_16px_rgba(225,29,72,0.2)]'
                            : 'border border-transparent text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-red-400' : 'text-gray-400'}`} />
                        <span>{tab.label}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                            isActive ? 'bg-red-500/25 text-red-200' : 'bg-white/5 text-gray-400'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}

                  <Link
                    to="/travel"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-transparent px-3.5 py-2 text-xs font-semibold text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 transition-colors"
                    title="Curated resorts, cruises, and vacation travel"
                  >
                    <Compass className="h-3.5 w-3.5 text-gray-400" />
                    <span>Travel</span>
                    <ArrowUpRight className="h-3 w-3 text-gray-400" />
                  </Link>
                </nav>
              </div>

              {/* Row 5: Filters (All Locations, All Audiences, Any Date, Default Order) placed beneath category tabs */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {/* Location Filter */}
                <label className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-red-400" />
                  <select
                    value={location}
                    onChange={(e) => setFilter('location', e.target.value)}
                    className={`min-h-9.5 appearance-none rounded-xl border bg-[#0b0e14] py-1.5 pl-8 pr-7 text-xs font-semibold text-gray-200 outline-none transition-colors cursor-pointer ${
                      location !== 'all'
                        ? 'border-red-500/50 bg-red-950/20 text-white'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                    aria-label="Filter by location"
                  >
                    <option value="all">All locations</option>
                    {locations.map(([value, item]) => (
                      <option key={value} value={value}>
                        {item.label} ({item.count})
                      </option>
                    ))}
                  </select>
                </label>

                {/* Audience / Access Filter */}
                <label className="relative">
                  <UsersRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-400" />
                  <select
                    value={audienceFilter}
                    onChange={(e) => setFilter('audience', e.target.value)}
                    className={`min-h-9.5 appearance-none rounded-xl border bg-[#0b0e14] py-1.5 pl-8 pr-7 text-xs font-semibold text-gray-200 outline-none transition-colors cursor-pointer ${
                      audienceFilter !== 'all'
                        ? 'border-cyan-500/50 bg-cyan-950/20 text-white'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                    aria-label="Filter by audience or access policy"
                  >
                    {AUDIENCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Date Filter (Events or All) */}
                {(kind === 'all' || kind === 'event') && (
                  <label className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-400" />
                    <select
                      value={dateFilter}
                      onChange={(e) => setFilter('date', e.target.value)}
                      className={`min-h-9.5 appearance-none rounded-xl border bg-[#0b0e14] py-1.5 pl-8 pr-7 text-xs font-semibold text-gray-200 outline-none transition-colors cursor-pointer ${
                        dateFilter !== 'all'
                          ? 'border-amber-500/50 bg-amber-950/20 text-white'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                      aria-label="Filter by date"
                    >
                      <option value="all">Any date</option>
                      <option value="today">Today</option>
                      <option value="weekend">This weekend</option>
                      <option value="30days">Next 30 days</option>
                    </select>
                  </label>
                )}

                {/* Sort Order */}
                <label className="relative">
                  <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <select
                    value={sortOption}
                    onChange={(e) => setFilter('sort', e.target.value, 'default')}
                    className={`min-h-9.5 appearance-none rounded-xl border bg-[#0b0e14] py-1.5 pl-8 pr-7 text-xs font-semibold text-gray-200 outline-none transition-colors cursor-pointer ${
                      sortOption !== 'default'
                        ? 'border-white/30 text-white'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                    aria-label="Sort listings"
                  >
                    <option value="default">Default order</option>
                    <option value="az">Name (A–Z)</option>
                    <option value="za">Name (Z–A)</option>
                    <option value="upcoming">Upcoming events first</option>
                  </select>
                </label>

                {/* Reset Filters */}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex min-h-9.5 items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-gray-400" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Search Station at top right underneath Dev Tools and Admin Panel */}
            <div ref={searchContainerRef} className="relative w-full lg:w-full self-start lg:mt-0.5 order-1 lg:order-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitSearch();
                }}
                className="relative flex items-center min-h-11 rounded-2xl border border-white/15 bg-[#0a0d14]/90 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl transition duration-200 focus-within:border-red-500/50 focus-within:shadow-[0_0_24px_rgba(225,29,72,0.18)]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5">
                  <Search className="h-4 w-4 shrink-0 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={query}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => query.trim() && setSearchOpen(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search clubs, events, hosts..."
                    className="min-w-0 flex-1 bg-transparent py-1 text-xs sm:text-sm font-medium text-white outline-none placeholder:text-gray-500"
                    aria-label="Search directory"
                    aria-autocomplete="list"
                    aria-expanded={searchOpen}
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={handleClearSearchInput}
                      className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white transition-colors mr-0.5"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <kbd className="hidden sm:inline-block rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-gray-500">
                      /
                    </kbd>
                  )}
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-red-500 shadow-md shadow-red-950/40 shrink-0"
                >
                  Search
                </button>
              </form>

              {/* Autocomplete Dropdown — fits 5 listings comfortably without obstructing clubs below */}
              {searchOpen && query.trim() ? (
                <div
                  className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/15 bg-[#090c14]/[0.98] shadow-[0_24px_64px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
                  role="listbox"
                >
                  <div className="flex items-center justify-between border-b border-white/[0.08] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                    <span>Matching Listings ({suggestionCount})</span>
                    <span>Use ↑↓ to browse</span>
                  </div>

                  {searchSuggestions.length ? (
                    <div className="divide-y divide-white/[0.04]">
                      {searchSuggestions.map((card, idx) => {
                        const isSelected = idx === activeSuggestionIndex;
                        return (
                          <Link
                            key={card.key}
                            to={card.href}
                            onClick={() => setSearchOpen(false)}
                            className={`flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                              isSelected ? 'bg-red-500/15 text-white' : 'hover:bg-white/[0.06]'
                            }`}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <span
                              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
                                card.kind === 'event'
                                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                                  : card.kind === 'host'
                                  ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
                                  : 'border-red-400/30 bg-red-500/10 text-red-300'
                              }`}
                            >
                              {card.kind === 'event' ? (
                                <CalendarDays className="h-3.5 w-3.5" />
                              ) : card.kind === 'host' ? (
                                <UsersRound className="h-3.5 w-3.5" />
                              ) : (
                                <Building2 className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-white">
                                {card.name}
                              </span>
                              <span className="block truncate text-[11px] text-gray-400">
                                {formatCardLocation(card.city, card.region, card.country) ||
                                  card.description ||
                                  'SwingSphere'}
                              </span>
                            </div>
                            <EntityTypePill tone={card.kind} className="text-[9px] px-1.5 py-0.2 shrink-0">
                              {card.kind}
                            </EntityTypePill>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-5 text-center text-sm text-gray-400">
                      No direct matches for &ldquo;{query}&rdquo;.
                      <p className="mt-1 text-xs text-gray-500">
                        Press Enter to search descriptions and tags.
                      </p>
                    </div>
                  )}

                  {suggestionCount > 0 && (
                    <button
                      type="button"
                      onClick={() => commitSearch()}
                      className="flex w-full items-center justify-between border-t border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-xs font-bold text-red-300 transition hover:bg-white/[0.06] hover:text-red-200"
                    >
                      <span>
                        View all {suggestionCount} results for &ldquo;{query.trim()}&rdquo;
                      </span>
                      <span aria-hidden="true">→</span>
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Main Directory Workspace */}
      <div ref={resultsTopRef} className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Active Filters Row & Results Count Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {hasActiveFilters ? (
              <>
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Active filters:
                </span>
                {committedQuery && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-500/35 bg-red-950/30 px-2.5 py-0.5 text-xs text-red-200">
                    Search: &ldquo;{committedQuery}&rdquo;
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setFilter('q', '', '');
                      }}
                      className="hover:text-white"
                      aria-label="Remove search filter"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {location !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-500/35 bg-red-950/30 px-2.5 py-0.5 text-xs text-red-200">
                    <MapPin className="h-3 w-3" />
                    {locations.find(([k]) => k === location)?.[1].label || location}
                    <button
                      type="button"
                      onClick={() => setFilter('location', 'all')}
                      className="hover:text-white"
                      aria-label="Remove location filter"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {audienceFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/35 bg-cyan-950/30 px-2.5 py-0.5 text-xs text-cyan-200">
                    <UsersRound className="h-3 w-3" />
                    {AUDIENCE_OPTIONS.find((o) => o.value === audienceFilter)?.label || audienceFilter}
                    <button
                      type="button"
                      onClick={() => setFilter('audience', 'all')}
                      className="hover:text-white"
                      aria-label="Remove audience filter"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {dateFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-950/30 px-2.5 py-0.5 text-xs text-amber-200">
                    <CalendarDays className="h-3 w-3" />
                    {dateFilter === 'today'
                      ? 'Today'
                      : dateFilter === 'weekend'
                      ? 'This weekend'
                      : 'Next 30 days'}
                    <button
                      type="button"
                      onClick={() => setFilter('date', 'all')}
                      className="hover:text-white"
                      aria-label="Remove date filter"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {sortOption !== 'default' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300">
                    Sort:{' '}
                    {sortOption === 'az'
                      ? 'A–Z'
                      : sortOption === 'za'
                      ? 'Z–A'
                      : 'Upcoming first'}
                    <button
                      type="button"
                      onClick={() => setFilter('sort', 'default', 'default')}
                      className="hover:text-white"
                      aria-label="Reset sort option"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-[11px] font-semibold text-gray-400 hover:text-white underline underline-offset-2 ml-1"
                >
                  Clear all
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-500">
                Browse clubs, events, and hosts or filter by location and audience above.
              </span>
            )}
          </div>

          {/* Result Count Status */}
          <div className="text-xs font-medium text-gray-400 shrink-0 ml-auto">
            {isLoading ? (
              'Loading directory…'
            ) : (
              <span>
                Showing{' '}
                <strong className="text-white">
                  {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
                  {Math.min(safePage * pageSize, filtered.length)}
                </strong>{' '}
                of <strong className="text-white">{filtered.length}</strong> results
              </span>
            )}
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-red-200">
            <h2 className="font-bold">Could not load the directory</h2>
            <p className="mt-1 text-xs text-red-300/80">Please check your connection and reload.</p>
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="mt-6 grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-white/5 bg-[#090c12] animate-pulse"
              >
                <div className="aspect-[16/10] bg-white/[0.04]" />
                <div className="p-4 space-y-3">
                  <div className="h-4 w-3/4 rounded bg-white/[0.06]" />
                  <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
                  <div className="h-3 w-2/3 rounded bg-white/[0.04]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results Grid */}
        {!isLoading && !error && visibleCards.length > 0 && (
          <div className="mt-6 grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {visibleCards.map((card) => {
              const image = card.image && !isPlaceholderMediaUrl(card.image) ? card.image : null;
              const locationText = formatCardLocation(card.city, card.region, card.country);
              const dateText = displayDate(card.date);
              const policyText = attendanceLabel(card.attendance);

              return (
                <article
                  key={card.key}
                  className="group relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#090c12] transition-all duration-300 hover:-translate-y-1 hover:border-red-500/35 hover:shadow-[0_16px_36px_rgba(0,0,0,0.65)]"
                >
                  <Link
                    to={card.href}
                    className="relative block min-h-[360px] h-full focus:outline-none"
                    aria-label={`Open ${card.name}`}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        onError={handleListingImageError}
                        loading="lazy"
                        className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${
                          card.kind === 'event' ? 'object-top' : 'object-center'
                        }`}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#121620] to-[#06080d]">
                        <div
                          className="absolute inset-0 opacity-40"
                          style={{
                            background:
                              card.kind === 'event'
                                ? 'radial-gradient(circle at center, rgba(245, 158, 11, 0.2), transparent 70%)'
                                : card.kind === 'host'
                                ? 'radial-gradient(circle at center, rgba(6, 182, 212, 0.2), transparent 70%)'
                                : 'radial-gradient(circle at center, rgba(197, 29, 52, 0.25), transparent 70%)',
                          }}
                        />
                        {card.kind === 'event' ? (
                          <CalendarDays className="h-10 w-10 text-amber-400/25" />
                        ) : card.kind === 'host' ? (
                          <UsersRound className="h-10 w-10 text-cyan-400/25" />
                        ) : (
                          <Building2 className="h-10 w-10 text-red-400/25" />
                        )}
                      </div>
                    )}

                    {/* Full-card scrim: preserve the flyer/hero while keeping metadata readable. */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/[0.02] via-45% to-[#090c12] to-88%" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#090c12] via-[#090c12]/90 to-transparent" />

                    {/* Top Badges */}
                    <div className="absolute left-3 top-3 pointer-events-none">
                      <EntityTypePill tone={card.kind} className="shadow-md">
                        {card.kind}
                      </EntityTypePill>
                    </div>

                    {/* Identity badge remains useful over full-bleed imagery. */}
                    {card.logoUrl && !isPlaceholderMediaUrl(card.logoUrl) && (
                      <div className="absolute bottom-[118px] left-3 h-[50px] w-[50px] overflow-hidden rounded-xl border border-white/20 bg-black/80 p-1 shadow-lg shadow-black/60 backdrop-blur-md transition-transform duration-300 group-hover:scale-105">
                        <img
                          src={card.logoUrl}
                          alt=""
                          onError={handleListingImageError}
                          className="h-full w-full rounded-lg object-cover"
                        />
                      </div>
                    )}

                    {/* Metadata overlays the lower portion of the image instead of using a separate body/footer. */}
                    <div className="absolute inset-x-0 bottom-0 p-4 pr-14">
                      <h2
                        className="line-clamp-2 text-base font-bold tracking-tight text-white drop-shadow-sm transition-colors group-hover:text-red-200"
                        title={card.name}
                      >
                        {card.name}
                      </h2>

                      <div className="mt-2 space-y-1.5">
                        {locationText && (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-red-400" />
                            <span className="truncate">{locationText}</span>
                          </p>
                        )}

                        {card.kind === 'event' && dateText && (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-gray-200">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                            <span className="truncate">{dateText}</span>
                          </p>
                        )}

                        {policyText && (
                          <p className="flex items-center gap-1.5 text-xs text-gray-300">
                            <UsersRound className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span className="truncate">{policyText}</span>
                          </p>
                        )}

                        {card.description && card.kind !== 'event' && (
                          <p className="line-clamp-2 pt-1 text-xs leading-relaxed text-gray-400">
                            {card.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>

                  {card.globeListing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/globe?listing=${encodeURIComponent(card.globeListing!.id)}`);
                      }}
                      className="absolute bottom-3 right-3 z-20 rounded-xl border border-white/15 bg-black/60 p-2 text-gray-300 shadow-lg backdrop-blur-md transition-colors hover:border-red-400/40 hover:bg-red-500/15 hover:text-white"
                      title="Show on 3D Globe"
                      aria-label={`Show ${card.name} on 3D Globe`}
                    >
                      <Globe2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="mt-12 rounded-3xl border border-dashed border-white/10 bg-[#080b11]/60 p-12 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-gray-500">
              <Compass className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-base font-bold text-white">No directory results found</h2>
            <p className="mt-1.5 text-xs text-gray-400 max-w-md mx-auto">
              No clubs, events, or hosts match your current search and filter combination.
            </p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-red-500 shadow-lg shadow-red-950/30"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset all filters
            </button>
          </div>
        )}

        {/* Pagination Controls */}
        {!isLoading && !error && filtered.length > pageSize && (
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/[0.08] pt-6 sm:flex-row">
            <p className="text-xs text-gray-400">
              Page <strong className="text-white">{safePage}</strong> of{' '}
              <strong className="text-white">{pageCount}</strong> ({filtered.length} total results)
            </p>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-bold text-gray-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>

              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: pageCount }).map((_, i) => {
                  const pageNum = i + 1;
                  // Show current, first, last, and within 1 of current
                  if (
                    pageNum === 1 ||
                    pageNum === pageCount ||
                    Math.abs(pageNum - safePage) <= 1
                  ) {
                    const isCurrent = pageNum === safePage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setPage(pageNum)}
                        className={`h-8 w-8 rounded-xl text-xs font-bold transition ${
                          isCurrent
                            ? 'border border-red-500/40 bg-red-500/20 text-white shadow-[0_0_12px_rgba(225,29,72,0.25)]'
                            : 'border border-white/5 bg-white/[0.02] text-gray-400 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  if (pageNum === 2 && safePage > 3) {
                    return (
                      <span key="ellipsis-1" className="px-1 text-xs text-gray-600">
                        …
                      </span>
                    );
                  }
                  if (pageNum === pageCount - 1 && safePage < pageCount - 2) {
                    return (
                      <span key="ellipsis-2" className="px-1 text-xs text-gray-600">
                        …
                      </span>
                    );
                  }
                  return null;
                })}
              </div>

              <button
                type="button"
                disabled={safePage === pageCount}
                onClick={() => setPage(safePage + 1)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-bold text-gray-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverPage;
