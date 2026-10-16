import type { ClubData, EventData, Listing, TimeLens } from '../types';

export const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export const normalizeListing = (listing: Listing): Listing => {
  const common = {
    ...listing,
    location: typeof listing.location === 'string' ? listing.location : '',
    mediaAssets: Array.isArray(listing.mediaAssets) ? listing.mediaAssets : [],
    entryRequirements: Array.isArray(listing.entryRequirements) ? listing.entryRequirements : [],
    galleryImageUrls: toStringArray(listing.galleryImageUrls),
  };

  if (listing.type === 'club') {
    return {
      ...common,
      schedule: Array.isArray(listing.schedule) ? listing.schedule : [],
      generalAmenities: toStringArray(listing.generalAmenities),
      description_short: typeof listing.description_short === 'string' ? listing.description_short : '',
    } as ClubData;
  }

  if (listing.type === 'event') {
    const start = typeof listing.time?.start === 'string' ? listing.time.start : '';
    const end = typeof listing.time?.end === 'string' ? listing.time.end : start;
    const fallbackDesc = typeof (listing as { description_short?: unknown }).description_short === 'string'
      ? (listing as { description_short: string }).description_short
      : '';
    return {
      ...common,
      tags: toStringArray(listing.tags),
      time: { ...listing.time, start, end },
      description_full: typeof listing.description_full === 'string' ? listing.description_full : fallbackDesc,
    } as EventData;
  }

  return common as Listing;
};

export const normalizeListings = (listings: Listing[]): Listing[] =>
  Array.isArray(listings) ? listings.map(normalizeListing) : [];

export const EXPLORER_ACCESS_FILTERS = [
  { id: 'couples-focused', label: 'Couples' },
  { id: 'couples-only', label: 'Couples only' },
  { id: 'single-men', label: 'Solo men' },
  { id: 'single-women', label: 'Solo women' },
  { id: 'lgbtq', label: 'LGBTQ+' },
  { id: 'trans-nonbinary', label: 'Trans / NB' },
  { id: 'bipoc', label: 'BIPOC' },
  { id: 'newbie', label: 'Newcomers' },
] as const;

const normalize = (value: string) => value.trim().toLowerCase();

const collectAccessValues = (listing: Listing): Set<string> => {
  const values = new Set<string>();
  const add = (value?: string) => {
    if (typeof value === 'string' && value) values.add(normalize(value));
  };

  add(listing.attendancePolicy);
  const listingTags = listing.type === 'club'
    ? toStringArray(listing.generalAmenities)
    : toStringArray(listing.tags);
  listingTags.forEach(add);
  if (listing.type === 'club') {
    const schedule = Array.isArray(listing.schedule) ? listing.schedule : [];
    schedule.flatMap((day) => (Array.isArray(day?.rules) ? day.rules : [])).forEach(add);
  }
  return values;
};

export const matchesExplorerAccessFilter = (listing: Listing, filterId: string): boolean => {
  const values = collectAccessValues(listing);
  const has = (...candidates: string[]) => candidates.some((candidate) => values.has(normalize(candidate)));

  switch (filterId) {
    case 'couples-focused':
      return has('couples_focused', 'couples_and_single_women', 'couples_and_select_single_men');
    case 'couples-only':
      return has('couples_only', 'Couples Only');
    case 'single-men':
      return has('mixed_open', 'all_genders_welcome', 'couples_and_select_single_men', 'Single Men Welcome');
    case 'single-women':
      return has('mixed_open', 'all_genders_welcome', 'couples_and_single_women', 'Single Women Welcome');
    case 'lgbtq':
      return has('lgbtq_centered', 'LGBTQ+ Friendly', 'LGBT Friendly', 'Queer-Centered');
    case 'trans-nonbinary':
      return has('Trans & Non-Binary Inclusive', 'Trans/NB Focused');
    case 'bipoc':
      return has('BIPOC-Friendly', 'POC Friendly');
    case 'newbie':
      return has('Newbie Friendly');
    default:
      return true;
  }
};

const atLocalMidnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addDays = (value: Date, days: number) => {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
};

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const resolveTimeLensRange = (lens: TimeLens, now = new Date()): { start: Date; end: Date } | null => {
  const today = atLocalMidnight(now);

  if (lens.mode === 'none') return null;
  if (lens.mode === 'date') {
    const start = parseLocalDate(lens.date);
    return { start, end: addDays(start, 1) };
  }
  if (lens.mode === 'range') {
    return { start: parseLocalDate(lens.start), end: addDays(parseLocalDate(lens.end), 1) };
  }
  if (lens.preset === 'today') {
    const start = now;
    const tomorrowMorning = addDays(today, 1);
    tomorrowMorning.setHours(6, 0, 0, 0);
    return { start, end: tomorrowMorning };
  }
  if (lens.preset === 'weekend') {
    const day = today.getDay();
    const daysUntilFriday = (5 - day + 7) % 7;
    const friday = addDays(today, daysUntilFriday);
    friday.setHours(17, 0, 0, 0);
    const start = day === 0 || day === 6 || (day === 5 && now >= friday) ? now : friday;
    const sundayEnd = addDays(friday, 3);
    sundayEnd.setHours(6, 0, 0, 0);
    return { start, end: sundayEnd };
  }
  const days = lens.preset === '7d' ? 7 : 30;
  return { start: now, end: addDays(now, days) };
};

export const eventOverlapsTimeLens = (listing: Listing, lens: TimeLens, now = new Date()): boolean => {
  if (listing.type !== 'event') return lens.mode === 'none';
  const range = resolveTimeLensRange(lens, now);
  if (!range) return true;
  const startRaw = listing.time?.start ?? '';
  const endRaw = listing.time?.end || startRaw;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return end >= range.start && start < range.end;
};
