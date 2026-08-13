import type { Listing, TimeLens } from '../types';

export const EXPLORER_ACCESS_FILTERS = [
  { id: 'couples-focused', label: 'Couples-Focused' },
  { id: 'couples-only', label: 'Couples Only' },
  { id: 'single-men', label: 'Single Men Welcome' },
  { id: 'single-women', label: 'Single Women Welcome' },
  { id: 'lgbtq', label: 'LGBTQ+ Friendly' },
  { id: 'trans-nonbinary', label: 'Trans & Non-Binary Inclusive' },
  { id: 'bipoc', label: 'BIPOC-Friendly' },
  { id: 'newbie', label: 'Newbie Friendly' },
] as const;

const normalize = (value: string) => value.trim().toLowerCase();

const collectAccessValues = (listing: Listing): Set<string> => {
  const values = new Set<string>();
  const add = (value?: string) => {
    if (value) values.add(normalize(value));
  };

  add(listing.attendancePolicy);
  const listingTags = listing.type === 'club' ? listing.generalAmenities : listing.tags;
  (listingTags ?? []).forEach(add);
  if (listing.type === 'club') {
    (listing.schedule ?? []).flatMap((day) => day.rules ?? []).forEach(add);
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
  const start = new Date(listing.time.start);
  const end = new Date(listing.time.end || listing.time.start);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return end >= range.start && start < range.end;
};
