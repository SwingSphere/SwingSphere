import type { AttendancePolicy, EntryRequirement } from '../types';
import { ATTENDANCE_POLICY_OPTIONS, ENTRY_REQUIREMENT_OPTIONS } from './listingTaxonomy';

const compactAudienceLabels: Partial<Record<AttendancePolicy, string>> = {
  mixed_open: 'Mixed / Open',
  couples_focused: 'Couples-Focused',
  couples_only: 'Couples Only',
  couples_and_single_women: 'Couples + Single Women',
  couples_and_select_single_men: 'Couples + Select Men',
  women_only: 'Women Only',
  men_only: 'Men Only',
  lgbtq_centered: 'LGBTQ+ Centered',
  varies_by_night: 'Varies by Night',
  open_to_approved_guests: 'Mixed / Open',
  all_genders_welcome: 'Mixed / Open',
  members_only: 'Mixed / Open',
  invite_only: 'Mixed / Open',
  application_required: 'Mixed / Open',
  varies_by_event: 'Varies by Night',
};

const compactEntryRequirementLabels: Record<EntryRequirement, string> = {
  screening_approval_required: 'Screening Required',
  members_only: 'Members Only',
  invite_only: 'Invite Only',
};

const titleCase = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

export const getAudienceLabel = (policy?: AttendancePolicy): string =>
  policy
    ? ATTENDANCE_POLICY_OPTIONS.find((option) => option.value === policy || option.legacyValues?.includes(policy))?.label ?? titleCase(policy)
    : 'Mixed / Open Attendance';

export const getCompactAudienceLabel = (policy?: AttendancePolicy): string =>
  policy ? compactAudienceLabels[policy] ?? titleCase(policy) : 'Mixed / Open';

export const getEntryRequirementLabel = (requirement: EntryRequirement): string =>
  ENTRY_REQUIREMENT_OPTIONS.find((option) => option.value === requirement || option.legacyValues?.includes(requirement))?.label
    ?? titleCase(requirement);

export const getCompactEntryRequirementLabel = (requirement: EntryRequirement): string =>
  compactEntryRequirementLabels[requirement] ?? titleCase(requirement);

export const formatEntryRequirements = (
  requirements?: EntryRequirement[],
  options: { compact?: boolean; emptyLabel?: string } = {},
): string => {
  const values = requirements?.filter(Boolean) ?? [];
  if (!values.length) return options.emptyLabel ?? 'None listed';
  const format = options.compact ? getCompactEntryRequirementLabel : getEntryRequirementLabel;
  return values.map(format).join(', ');
};

export const getPrimaryEntryRequirementLabel = (
  requirements?: EntryRequirement[],
  options: { compact?: boolean } = {},
): string | null => {
  const first = requirements?.find(Boolean);
  if (!first) return null;
  return options.compact ? getCompactEntryRequirementLabel(first) : getEntryRequirementLabel(first);
};
