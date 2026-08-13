import type { AttendancePolicy, EntryRequirement } from '../types';

export type TaxonomyOption = {
  value: string;
  label: string;
  description?: string;
  legacyValues?: string[];
};

export type TaxonomyInput = string | TaxonomyOption;

export type AttendancePolicyOption = TaxonomyOption & { value: AttendancePolicy };
export type EntryRequirementOption = TaxonomyOption & { value: EntryRequirement };

export const ATTENDANCE_POLICY_OPTIONS: AttendancePolicyOption[] = [
  {
    value: 'mixed_open',
    label: 'Mixed / Open Attendance',
    description: 'Guests may attend individually, as couples, or with friends, subject to the organizer normal rules.',
    legacyValues: ['open_to_approved_guests', 'all_genders_welcome', 'members_only', 'invite_only', 'application_required'],
  },
  {
    value: 'couples_focused',
    label: 'Couples-Focused',
    description: 'The space is primarily built around couples, but may allow select singles.',
  },
  { value: 'couples_only', label: 'Couples Only', description: 'Attendance is limited to couples.' },
  { value: 'couples_and_single_women', label: 'Couples and Single Women', description: 'Couples and single women are generally welcome.' },
  {
    value: 'couples_and_select_single_men',
    label: 'Couples and Select Single Men',
    description: 'Couples are welcome, and single men may attend only on select nights or with approval.',
  },
  { value: 'women_only', label: 'Women Only', description: 'Attendance is limited to women.', legacyValues: ['Female Only'] },
  { value: 'men_only', label: 'Men Only', description: 'Attendance is limited to men.' },
  {
    value: 'lgbtq_centered',
    label: 'LGBTQ+ Centered',
    description: 'The listing is primarily centered around LGBTQ+ guests or community.',
  },
  {
    value: 'varies_by_night',
    label: 'Varies by Night',
    description: 'Different nights may have different audience or access rules.',
    legacyValues: ['varies_by_event'],
  },
];

export const ENTRY_REQUIREMENT_OPTIONS: EntryRequirementOption[] = [
  {
    value: 'screening_approval_required',
    label: 'Screening / Approval Required',
    description: 'Guests must be screened, approved, or cleared by the organizer before attending.',
    legacyValues: ['application_required'],
  },
  { value: 'members_only', label: 'Members Only', description: 'Attendance is limited to members.' },
  { value: 'invite_only', label: 'Invite Only', description: 'Guests must be invited or directly approved before attending.' },
];

export const LISTING_COMMUNITY_INCLUSION_TAGS: TaxonomyOption[] = [
  { value: 'LGBTQ+ Friendly', label: 'LGBTQ+ Friendly', legacyValues: ['LGBT Friendly'] },
  { value: 'Trans & Non-Binary Inclusive', label: 'Trans & Non-Binary Inclusive', legacyValues: ['Trans/NB Focused'] },
  { value: 'Newbie Friendly', label: 'Newbie Friendly' },
  { value: 'Consent-Focused', label: 'Consent-Focused' },
  { value: 'Body Positive', label: 'Body Positive' },
  { value: 'Women-Centered', label: 'Women-Centered' },
  { value: 'Queer-Centered', label: 'Queer-Centered' },
  { value: 'BIPOC-Friendly', label: 'BIPOC-Friendly' },
];

export const LISTING_VIBE_TAGS: TaxonomyOption[] = [
  { value: 'Upscale', label: 'Upscale' },
  { value: 'Casual', label: 'Casual' },
  { value: 'Dance Club', label: 'Dance Club' },
  { value: 'Lounge', label: 'Lounge' },
  { value: 'Kink / BDSM Friendly', label: 'Kink / BDSM Friendly', legacyValues: ['Dungeon / Kink', 'Kink / BDSM Space'] },
  { value: 'Mansion Party', label: 'Mansion Party' },
  { value: 'Hotel Takeover', label: 'Hotel Takeover' },
];

export const LISTING_AMENITY_TAGS: TaxonomyOption[] = [
  { value: 'Showers', label: 'Showers' },
  { value: 'Parking', label: 'Parking' },
  { value: 'Food Served', label: 'Food Served' },
  { value: 'Lockers', label: 'Lockers' },
  { value: 'Pool / Hot Tub', label: 'Pool / Hot Tub' },
  { value: 'Alcohol Available', label: 'Alcohol Available', legacyValues: ['Serves Alcohol'] },
  { value: 'BYOB', label: 'BYOB' },
  { value: 'Safer Sex Supplies', label: 'Safer Sex Supplies' },
];

export const CLUB_VIBE_TAGS = LISTING_VIBE_TAGS.filter((option) =>
  ['Upscale', 'Casual', 'Dance Club', 'Lounge', 'Kink / BDSM Friendly'].includes(option.value),
);

export const CLUB_AMENITY_TAGS = LISTING_AMENITY_TAGS;

export const CLUB_SCHEDULE_ACCESS_RULES: TaxonomyOption[] = [
  { value: 'Single Men Welcome', label: 'Single Men Welcome' },
  { value: 'Single Women Welcome', label: 'Single Women Welcome' },
];

export const CLUB_SCHEDULE_INCLUSION_RULES: TaxonomyOption[] = [
  { value: 'LGBTQ+ Friendly', label: 'LGBTQ+ Friendly', legacyValues: ['LGBT Friendly'] },
  { value: 'Newbie Friendly', label: 'Newbie Friendly' },
  { value: 'Trans & Non-Binary Inclusive', label: 'Trans & Non-Binary Inclusive', legacyValues: ['Trans/NB Focused'] },
];

export const CLUB_LEGACY_PRIMARY_ACCESS_RULES: TaxonomyOption[] = [
  { value: 'Couples Only', label: 'Couples-Focused' },
  { value: 'Women Only', label: 'Women Only', legacyValues: ['Female Only'] },
  { value: 'Men Only', label: 'Men Only' },
];

export const CLUB_SCHEDULE_RULES: TaxonomyOption[] = [
  ...CLUB_LEGACY_PRIMARY_ACCESS_RULES,
  ...CLUB_SCHEDULE_ACCESS_RULES,
  ...CLUB_SCHEDULE_INCLUSION_RULES,
];

export const EVENT_COMMUNITY_TAGS = LISTING_COMMUNITY_INCLUSION_TAGS;
export const EVENT_VIBE_TAGS = LISTING_VIBE_TAGS;
export const EVENT_AMENITY_TAGS = LISTING_AMENITY_TAGS;

export const EVENT_LEGACY_RULE_TAGS: TaxonomyOption[] = [
  { value: 'Couples Only', label: 'Couples Only' },
  { value: 'Women Only', label: 'Women Only', legacyValues: ['Female Only'] },
  { value: 'Men Only', label: 'Men Only' },
  { value: 'Single Men Welcome', label: 'Single Men Welcome' },
  { value: 'Single Women Welcome', label: 'Single Women Welcome' },
];

export const CLUB_TAXONOMY_GROUPS = [
  { id: 'vibe', label: 'Vibe', options: CLUB_VIBE_TAGS },
  { id: 'amenities', label: 'Amenities', options: CLUB_AMENITY_TAGS },
] as const;

export const EVENT_TAXONOMY_GROUPS = [
  { id: 'community', label: 'Community & Inclusion', options: EVENT_COMMUNITY_TAGS },
  { id: 'vibe', label: 'Vibe', options: EVENT_VIBE_TAGS },
  { id: 'amenities', label: 'Amenities', options: EVENT_AMENITY_TAGS },
] as const;

export const toTaxonomyOption = (option: TaxonomyInput): TaxonomyOption =>
  typeof option === 'string' ? { value: option, label: option } : option;

export const getTaxonomyOptionValues = (option: TaxonomyInput): string[] => {
  const normalized = toTaxonomyOption(option);
  return [normalized.value, ...(normalized.legacyValues ?? [])];
};

export const isTaxonomyValueSelected = (selected: string[], option: TaxonomyInput): boolean => {
  const values = new Set(getTaxonomyOptionValues(option));
  return selected.some((value) => values.has(value));
};

export const toggleTaxonomyValue = (selected: string[], option: TaxonomyInput): string[] => {
  const normalized = toTaxonomyOption(option);
  const values = new Set(getTaxonomyOptionValues(normalized));
  if (selected.some((value) => values.has(value))) {
    return selected.filter((value) => !values.has(value));
  }
  return [...selected.filter((value) => !values.has(value)), normalized.value];
};

export const getTaxonomyLabel = (value: string, optionGroups: TaxonomyInput[][]): string => {
  const options = optionGroups.flat().map(toTaxonomyOption);
  return options.find((option) => getTaxonomyOptionValues(option).includes(value))?.label ?? value;
};

export const formatTaxonomyList = (values: string[], optionGroups: TaxonomyInput[][]): string =>
  values.map((value) => getTaxonomyLabel(value, optionGroups)).join(', ');

