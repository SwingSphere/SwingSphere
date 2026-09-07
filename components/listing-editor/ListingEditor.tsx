import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AttendancePolicy, ClubData, DaySchedule, EntryRequirement, EventData, Geopoint, Listing, ListingLocationMeta, User } from '../../types';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import { clubKey, normalizeHostName } from '../../lib/identityUtils';
import { formatListingAddress, isResolvedAddressPlausibleForInput, validateListingLocation, type ListingAddress } from '../../lib/listingLocationValidation';
import { findPotentialListingDuplicates, type ListingDuplicateMatch } from '../../lib/listingDuplicateDetection';
import ListingLocationPreview from './ListingLocationPreview';
import Button from '../Button';
import MediaUploader from '../media/MediaUploader';
import { EditorInput as Field, EditorSelect as Select, EditorSurface as Section, EditorTextArea as TextArea } from '../editor/EditorPrimitives';
import type { MediaAsset, MediaRole } from '../../lib/media/types';
import {
  ATTENDANCE_POLICY_OPTIONS,
  CLUB_AMENITY_TAGS,
  CLUB_SCHEDULE_ACCESS_RULES,
  CLUB_SCHEDULE_INCLUSION_RULES,
  CLUB_SCHEDULE_RULES,
  CLUB_VIBE_TAGS,
  ENTRY_REQUIREMENT_OPTIONS,
  EVENT_AMENITY_TAGS,
  EVENT_COMMUNITY_TAGS,
  EVENT_LEGACY_RULE_TAGS,
  EVENT_VIBE_TAGS,
  CLUB_LEGACY_PRIMARY_ACCESS_RULES,
  formatTaxonomyList,
  getTaxonomyLabel,
  getTaxonomyOptionValues,
  isTaxonomyValueSelected,
  toTaxonomyOption,
  toggleTaxonomyValue,
  type TaxonomyInput,
  type TaxonomyOption,
} from '../../lib/listingTaxonomy';
import { buildEditorTaxonomyGroups } from '../../lib/taxonomySupabase';

export type ListingEditorMode = 'public' | 'admin-create' | 'admin-edit';
export type ListingKind = 'club' | 'event';
type LocationVisibility = 'exact_public' | 'approximate_public';

type ListingDraft = {
  type: ListingKind | null;
  id?: string;
  name: string;
  hostName: string;
  venueKey: string;
  description_short: string;
  description_full: string;
  website: string;
  contactEmail: string;
  schedule: DaySchedule[];
  specialScheduleNotes: string;
  generalAmenities: string[];
  time: { start: string; end: string };
  tags: string[];
  addressInput: string;
  verifiedAddressInput: string;
  advancedAddress: ListingAddress;
  geopoint: Geopoint | null;
  locationMeta?: ListingLocationMeta;
  locationVisibility: LocationVisibility;
  attendancePolicy: AttendancePolicy;
  entryRequirements: EntryRequirement[];
  isAddressPrivate: boolean;
  postedByUserId: string;
  status: Listing['status'];
  headerImageUrl: string;
  galleryImageUrls: string[];
  mediaAssets: MediaAsset[];
  headerImageFile?: File | null;
  galleryImageFiles?: File[];
};

type ListingEditorProps = {
  mode: ListingEditorMode;
  initialKind?: ListingKind;
  listingToEdit?: ClubData | EventData;
  onSaved?: (listing: Listing) => void;
  onCancel: () => void;
  presentation?: 'default' | 'mobile';
};

const EDITOR_STEPS = ['Identity', 'Address Validation', 'Details', 'Schedule', 'Tags / Amenities', 'Images', 'Review'] as const;
const PUBLIC_SUBMISSION_STEPS = [
  { id: 'basic-info', label: 'Basic Info' },
  { id: 'location', label: 'Location' },
  { id: 'schedule-features', label: 'Schedule & Features' },
  { id: 'photos-review', label: 'Photos & Review' },
] as const;

const createInitialSchedule = (): DaySchedule[] => ([
  { day: 'Monday', isClosed: true, rules: [] },
  { day: 'Tuesday', isClosed: true, rules: [] },
  { day: 'Wednesday', isClosed: false, open: '19:00', close: '22:00', rules: [] },
  { day: 'Thursday', isClosed: true, rules: [] },
  { day: 'Friday', isClosed: false, open: '21:00', close: '03:00', rules: [] },
  { day: 'Saturday', isClosed: false, open: '21:00', close: '04:00', rules: [] },
  { day: 'Sunday', isClosed: false, open: '20:00', close: '02:00', rules: [] },
]);

const createEmptyGeopoint = (): Geopoint => ({
  latitude: 0,
  longitude: 0,
  address: {
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
  },
});

const createEmptyAddress = (): ListingAddress => ({
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
});

const buildAddressInput = (address: ListingAddress) => {
  const base = [address.addressLine1, address.addressLine2, address.city, address.region, address.postalCode, address.country]
    .filter(Boolean)
    .join(', ');
  const shortCity = [address.addressLine1, address.city, address.region].filter(Boolean).join(', ');
  return base || shortCity || '';
};

const createInitialDraft = (currentUser?: User | null, blankSchedule = false): ListingDraft => ({
  type: null,
  name: '',
  hostName: '',
  venueKey: '',
  description_short: '',
  description_full: '',
  website: '',
  contactEmail: '',
  schedule: blankSchedule
    ? createInitialSchedule().map((day) => ({ day: day.day, isClosed: true, rules: [] }))
    : createInitialSchedule(),
  specialScheduleNotes: '',
  generalAmenities: [],
  time: { start: '', end: '' },
  tags: [],
  addressInput: '',
  verifiedAddressInput: '',
  advancedAddress: createEmptyAddress(),
  geopoint: null,
  locationMeta: { status: 'unvalidated' },
  locationVisibility: 'exact_public',
  attendancePolicy: 'mixed_open',
  entryRequirements: [],
  isAddressPrivate: false,
  postedByUserId: currentUser?.id ?? 'user-submission',
  status: 'pending_approval',
  headerImageUrl: '',
  galleryImageUrls: [],
  mediaAssets: [],
});

const createDraftFromListing = (listing: ClubData | EventData, currentUser?: User | null): ListingDraft => {
  const addressInput = buildAddressInput(listing.geopoint.address);
  return {
  type: listing.type,
  id: listing.id,
  name: listing.name,
  hostName: listing.type === 'event' ? listing.hostName : '',
  venueKey: listing.type === 'event' ? listing.venueKey ?? '' : '',
  description_short: listing.type === 'club' ? listing.description_short : '',
  description_full: listing.type === 'event' ? listing.description_full : '',
  website: listing.website ?? '',
  contactEmail: listing.contactEmail,
  schedule: listing.type === 'club' ? listing.schedule : createInitialSchedule(),
  specialScheduleNotes: listing.type === 'club' ? listing.specialScheduleNotes ?? '' : '',
  generalAmenities: listing.type === 'club' ? listing.generalAmenities ?? [] : [],
  time: listing.type === 'event' ? listing.time : { start: '', end: '' },
  tags: listing.type === 'event' ? listing.tags ?? [] : [],
  addressInput,
  verifiedAddressInput: addressInput,
  advancedAddress: {
    addressLine1: listing.geopoint.address.addressLine1 ?? '',
    addressLine2: listing.geopoint.address.addressLine2 ?? '',
    city: listing.geopoint.address.city ?? '',
    region: listing.geopoint.address.region ?? '',
    postalCode: listing.geopoint.address.postalCode ?? '',
    country: listing.geopoint.address.country ?? '',
  },
  geopoint: listing.geopoint ?? createEmptyGeopoint(),
  locationMeta: listing.locationMeta ?? { status: 'validated' },
  locationVisibility: listing.type === 'club'
    ? listing.locationVisibility ?? 'exact_public'
    : listing.isAddressPrivate
      ? 'approximate_public'
      : 'exact_public',
  attendancePolicy: normalizeAttendancePolicy(listing.attendancePolicy),
  entryRequirements: listing.entryRequirements ?? deriveLegacyEntryRequirements(listing.attendancePolicy),
  isAddressPrivate: listing.type === 'event' ? Boolean(listing.isAddressPrivate) : false,
  postedByUserId: listing.postedByUserId || currentUser?.id || 'user-submission',
  status: listing.status,
  headerImageUrl: listing.headerImageUrl ?? '',
  galleryImageUrls: listing.galleryImageUrls ?? [],
  mediaAssets: listing.mediaAssets ?? [],
  };
};

const createListingId = (type: ListingKind) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${type}-${Date.now()}`;
};

const normalizeAddressText = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const createUnvalidatedLocationMeta = (normalizedAddress?: string): ListingLocationMeta => ({
  status: 'unvalidated',
  normalizedAddress,
});

const getDraftAddressText = (draft: ListingDraft) =>
  draft.addressInput.trim() || formatListingAddress(draft.advancedAddress).trim();

const hasCurrentVerifiedLocation = (draft: ListingDraft) =>
  Boolean(
    draft.geopoint
    && draft.locationMeta?.status
    && draft.locationMeta.status !== 'unvalidated'
    && normalizeAddressText(draft.verifiedAddressInput) === normalizeAddressText(getDraftAddressText(draft)),
  );

const formatClubScheduleRules = (values: string[] = []) =>
  formatTaxonomyList(values, [CLUB_LEGACY_PRIMARY_ACCESS_RULES, CLUB_SCHEDULE_ACCESS_RULES, CLUB_SCHEDULE_INCLUSION_RULES]);

const formatClubFeatureTags = (values: string[] = []) =>
  formatTaxonomyList(values, [CLUB_VIBE_TAGS, CLUB_AMENITY_TAGS]);

const formatLocationVisibility = (value: LocationVisibility) =>
  value === 'approximate_public' ? 'Approximate area only' : 'Exact address';

const normalizeAttendancePolicy = (value?: AttendancePolicy): AttendancePolicy => {
  if (!value) return 'mixed_open';
  if (value === 'open_to_approved_guests' || value === 'all_genders_welcome') return 'mixed_open';
  if (value === 'varies_by_event') return 'varies_by_night';
  if (value === 'members_only' || value === 'invite_only' || value === 'application_required') return 'mixed_open';
  return value;
};

const deriveLegacyEntryRequirements = (value?: AttendancePolicy): EntryRequirement[] => {
  if (value === 'members_only') return ['members_only'];
  if (value === 'invite_only') return ['invite_only'];
  if (value === 'application_required') return ['screening_approval_required'];
  return [];
};

const getAttendancePolicyOption = (value?: AttendancePolicy) =>
  ATTENDANCE_POLICY_OPTIONS.find((option) => option.value === normalizeAttendancePolicy(value))
  ?? ATTENDANCE_POLICY_OPTIONS[0];

const formatAttendancePolicy = (value?: AttendancePolicy) =>
  getAttendancePolicyOption(value).label;

const formatEntryRequirements = (values: EntryRequirement[] = []) =>
  values.length ? formatTaxonomyList(values, [ENTRY_REQUIREMENT_OPTIONS]) : 'None listed';

const formatScheduleTime = (value?: string) => {
  if (!value) return 'Not set';
  const [hourText, minuteText = '00'] = value.split(':');
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return value;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteText.padStart(2, '0')} ${period}`;
};

const summarizeScheduleDay = (day: DaySchedule) => {
  if (day.isClosed) return 'Closed';
  return `Open: ${formatScheduleTime(day.open)} - ${formatScheduleTime(day.close)}`;
};

const summarizeOpenSchedule = (schedule: DaySchedule[]) =>
  schedule
    .filter((day) => !day.isClosed)
    .map((day) => {
      const rules = day.rules?.length ? ` (${formatClubScheduleRules(day.rules)})` : '';
      return `${day.day} ${formatScheduleTime(day.open)} - ${formatScheduleTime(day.close)}${rules}`;
    })
    .join('; ') || 'Closed or not set';

const getOpenScheduleRows = (schedule: DaySchedule[]) =>
  schedule.filter((day) => !day.isClosed);

const getSelectedTaxonomyValues = (values: string[], options: TaxonomyInput[]) => {
  const optionValues = new Set(options.flatMap(getTaxonomyOptionValues));
  return values.filter((value) => optionValues.has(value));
};

const getDefaultExpandedScheduleDay = (schedule: DaySchedule[]) =>
  schedule.find((day) => !day.isClosed)?.day
  ?? schedule.find((day) => day.day === 'Saturday')?.day
  ?? schedule[0]?.day
  ?? null;

const CheckboxGroup: React.FC<{ title: string; options: TaxonomyInput[]; selected: string[]; onChange: (value: string[]) => void }> = ({ title, options, selected, onChange }) => (
  <div className="space-y-3">
    <div className="text-sm font-semibold text-white">{title}</div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {options.map((rawOption) => {
        const option = toTaxonomyOption(rawOption);
        const checked = isTaxonomyValueSelected(selected, option);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(toggleTaxonomyValue(selected, option))}
            className={[
              'rounded-2xl border px-3 py-2 text-left text-sm transition',
              checked ? 'border-red-400/70 bg-red-500/12 text-white' : 'border-white/10 bg-black/25 text-gray-300 hover:border-white/20',
            ].join(' ')}
          >
            <span className="block">{option.label}</span>
            {option.description && <span className="mt-1 block text-xs text-gray-400">{option.description}</span>}
          </button>
        );
      })}
    </div>
  </div>
);

const TogglePill: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string; helpText?: string }> = ({ checked, onChange, label, helpText }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={[
      'w-full rounded-2xl border px-4 py-3 text-left transition',
      checked ? 'border-red-400/80 bg-red-500/10 text-white' : 'border-white/10 bg-black/25 text-gray-200 hover:border-white/20',
    ].join(' ')}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        {helpText && <div className="mt-1 text-xs text-gray-400">{helpText}</div>}
      </div>
      <div className={['mt-0.5 h-5 w-5 rounded-full border', checked ? 'border-red-300 bg-red-400' : 'border-white/20 bg-transparent'].join(' ')} />
    </div>
  </button>
);

const ReviewLine: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid gap-2 border-b border-white/8 py-3 md:grid-cols-[180px_1fr]">
    <div className="text-sm font-medium text-gray-400">{label}</div>
    <div className="text-sm text-white">{children || 'N/A'}</div>
  </div>
);

const ReviewSection: React.FC<{ title: string; onEdit: () => void; children: React.ReactNode }> = ({ title, onEdit, children }) => (
  <div className="ss-glass ss-glass--ambient rounded-2xl p-4">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-gray-200 transition hover:bg-white/8"
      >
        Edit
      </button>
    </div>
    {children}
  </div>
);

const submitDraft = async (
  mode: ListingEditorMode,
  draft: ListingDraft,
): Promise<Listing> => {
  const fallbackAddress = draft.advancedAddress ?? createEmptyAddress();
  const base = draft.geopoint ?? {
    latitude: 0,
    longitude: 0,
    address: {
      addressLine1: fallbackAddress.addressLine1 || undefined,
      addressLine2: fallbackAddress.addressLine2 || undefined,
      city: fallbackAddress.city || '',
      region: fallbackAddress.region || '',
      postalCode: fallbackAddress.postalCode || undefined,
      country: fallbackAddress.country || '',
    },
  };
  const location = formatListingAddress(base.address);
  const shared = {
    id: draft.id || '',
    location,
    website: draft.website || undefined,
    contactEmail: draft.contactEmail,
    geopoint: base,
    locationMeta: draft.locationMeta,
    headerImageUrl: draft.headerImageFile ? `https://firebasestorage.googleapis.com/.../${draft.headerImageFile.name}` : draft.headerImageUrl || undefined,
    galleryImageUrls: draft.galleryImageFiles?.length
      ? draft.galleryImageFiles.map((file) => `https://firebasestorage.googleapis.com/.../${file.name}`)
      : draft.galleryImageUrls,
    mediaAssets: draft.mediaAssets,
    postedByUserId: draft.postedByUserId,
    status: draft.status,
  };

  if (draft.type === 'club') {
    const club: ClubData = {
      ...shared,
      id: draft.id || `club-${Date.now()}`,
      type: 'club',
      name: draft.name,
      description_short: draft.description_short,
      locationVisibility: draft.locationVisibility,
      attendancePolicy: normalizeAttendancePolicy(draft.attendancePolicy),
      entryRequirements: draft.entryRequirements,
      schedule: draft.schedule,
      specialScheduleNotes: draft.specialScheduleNotes || undefined,
      generalAmenities: draft.generalAmenities,
      status: draft.status,
      postedByUserId: draft.postedByUserId,
    } as ClubData;
    return api.saveClub(club);
  }

  const event: EventData = {
    ...shared,
    id: draft.id || `event-${Date.now()}`,
    type: 'event',
    name: draft.name,
    hostName: normalizeHostName(draft.hostName),
    description_full: draft.description_full,
    isAddressPrivate: draft.isAddressPrivate,
    attendancePolicy: normalizeAttendancePolicy(draft.attendancePolicy),
    entryRequirements: draft.entryRequirements,
    venueKey: draft.venueKey || undefined,
    time: draft.time,
    tags: draft.tags,
    status: draft.status,
    postedByUserId: draft.postedByUserId,
  } as EventData;
  return api.saveEvent(event);
};

const storageKeyForDraft = (mode: ListingEditorMode, kind: ListingKind | null, id?: string) =>
  ['swingsphere', 'listing-editor', mode, kind ?? 'unset', id ?? 'new'].join(':');

type ResumableDraft = {
  kind: ListingKind;
  name: string;
  step: number;
  savedAt: number;
};

const readResumableDraft = (mode: ListingEditorMode): ResumableDraft | null => {
  if (typeof window === 'undefined') return null;
  const candidates = (['club', 'event'] as const).flatMap((kind) => {
    const raw = window.localStorage.getItem(storageKeyForDraft(mode, kind));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Partial<ListingDraft> & { step?: number; draftSavedAt?: number };
      return [{
        kind,
        name: parsed.name?.trim() || `Untitled ${kind}`,
        step: typeof parsed.step === 'number' ? parsed.step : 0,
        savedAt: typeof parsed.draftSavedAt === 'number' ? parsed.draftSavedAt : 0,
      }];
    } catch {
      return [];
    }
  });
  return candidates.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
};

const ListingEditor: React.FC<ListingEditorProps> = ({ mode, initialKind, listingToEdit, onSaved, onCancel, presentation = 'default' }) => {
  const { currentUser, addToast, tags: taxonomyTags, tagCategories, fetchTags } = useAppStore();
  const [draft, setDraft] = useState<ListingDraft>(() =>
    listingToEdit ? createDraftFromListing(listingToEdit, currentUser) : createInitialDraft(currentUser, mode === 'public'),
  );
  const [kind, setKind] = useState<ListingKind | null>(listingToEdit?.type ?? initialKind ?? null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [listings, setListings] = useState<Listing[]>([]);
  const [hosts, setHosts] = useState<User[]>([]);
  const [duplicateMatches, setDuplicateMatches] = useState<ListingDuplicateMatch[]>([]);
  const [validationMessage, setValidationMessage] = useState<string>('');
  const [isLoadingValidation, setIsLoadingValidation] = useState(false);
  const [resumableDraft, setResumableDraft] = useState<ResumableDraft | null>(() => readResumableDraft(mode));
  const [expandedScheduleDay, setExpandedScheduleDay] = useState<string | null>(() =>
    getDefaultExpandedScheduleDay(createInitialSchedule()),
  );
  const [showAdvancedAddress, setShowAdvancedAddress] = useState(() =>
    Boolean(
      listingToEdit?.locationMeta &&
      ['needs_review', 'manual'].includes(listingToEdit.locationMeta.status),
    ),
  );
  const validationSequenceRef = useRef(0);
  const isEditing = mode === 'admin-edit' || Boolean(listingToEdit);
  const canChooseType = mode === 'public' && !listingToEdit;
  const draftKey = storageKeyForDraft(mode, kind, listingToEdit?.id);
  const shouldPersistDraft = !isEditing && Boolean(kind);
  const hasInitializedSessionRef = useRef(false);
  const isPublicSubmission = mode === 'public' && !listingToEdit;
  const isMobilePresentation = presentation === 'mobile';
  const activeSteps = isPublicSubmission ? PUBLIC_SUBMISSION_STEPS : EDITOR_STEPS.map((label, index) => ({ id: `admin-${index}`, label }));
  const totalSteps = activeSteps.length;
  const currentStepLabel = kind ? activeSteps[Math.min(step, activeSteps.length - 1)].label : 'Choose below';
  const progress = kind ? ((step + 1) / totalSteps) * 100 : 0;

  useEffect(() => {
    if (!taxonomyTags.length || !tagCategories.length) void fetchTags();
  }, [fetchTags, tagCategories.length, taxonomyTags.length]);

  const liveClubGroups = useMemo(
    () => buildEditorTaxonomyGroups(taxonomyTags, tagCategories, 'club'),
    [tagCategories, taxonomyTags],
  );
  const liveEventGroups = useMemo(
    () => buildEditorTaxonomyGroups(taxonomyTags, tagCategories, 'event'),
    [tagCategories, taxonomyTags],
  );
  const clubVibeTags = liveClubGroups.find((group) => group.id === 'cat-vibe')?.options ?? CLUB_VIBE_TAGS;
  const clubAmenityTags = liveClubGroups.find((group) => group.id === 'cat-amenities')?.options ?? CLUB_AMENITY_TAGS;
  const eventCommunityTags = liveEventGroups.find((group) => group.id === 'cat-community')?.options ?? EVENT_COMMUNITY_TAGS;
  const eventVibeTags = liveEventGroups.find((group) => group.id === 'cat-vibe')?.options ?? EVENT_VIBE_TAGS;
  const eventAmenityTags = liveEventGroups.find((group) => group.id === 'cat-amenities')?.options ?? EVENT_AMENITY_TAGS;
  const eventThemeTags = liveEventGroups.find((group) => group.id === 'cat-theme')?.options ?? [];
  const eventSafetyTags = liveEventGroups.find((group) => group.id === 'cat-safety')?.options ?? [];

  const resetSubmissionState = (nextKind: ListingKind | null = initialKind ?? null, removeStoredDraft = true) => {
    const nextDraft = createInitialDraft(currentUser, mode === 'public');
    nextDraft.type = nextKind;
    nextDraft.id = nextKind ? createListingId(nextKind) : undefined;
    setKind(nextKind);
    setDraft(nextDraft);
    setStep(0);
    setErrors({});
    setDuplicateMatches([]);
    setValidationMessage('');
    setIsLoadingValidation(false);
    setExpandedScheduleDay(getDefaultExpandedScheduleDay(nextDraft.schedule));
    setShowAdvancedAddress(false);
    validationSequenceRef.current += 1;

    if (removeStoredDraft && typeof window !== 'undefined') {
      const keysToRemove = new Set([
        draftKey,
        storageKeyForDraft(mode, nextKind, listingToEdit?.id),
      ]);
      if (!listingToEdit?.id) {
        keysToRemove.add(storageKeyForDraft(mode, 'club', undefined));
        keysToRemove.add(storageKeyForDraft(mode, 'event', undefined));
        keysToRemove.add(storageKeyForDraft(mode, null, undefined));
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    }
  };

  useEffect(() => {
    if (hasInitializedSessionRef.current || isEditing) return;
    hasInitializedSessionRef.current = true;
    resetSubmissionState(initialKind ?? null, Boolean(initialKind));
  }, [initialKind, isEditing]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingMeta(true);
      try {
        const [listingRows, userRows] = await Promise.all([
          api.getListings(),
          api.getUsers(),
        ]);
        if (cancelled) return;
        setListings(listingRows);
        setHosts(userRows);
      } catch {
        if (!cancelled) {
          addToast({ message: 'Failed to load listing editor context.', type: 'error' });
        }
      } finally {
        if (!cancelled) setIsLoadingMeta(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  useEffect(() => {
    if (!shouldPersistDraft || listingToEdit) return;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ListingDraft> & { kind?: ListingKind; step?: number };
      setDraft((current) => {
        const nextDraft = {
          ...current,
          ...parsed,
          type: kind,
          geopoint: parsed.geopoint ?? current.geopoint,
        };
        if (
          nextDraft.addressInput
          && nextDraft.geopoint
          && !isResolvedAddressPlausibleForInput(nextDraft.addressInput, nextDraft.geopoint.address)
        ) {
          return {
            ...nextDraft,
            verifiedAddressInput: '',
            advancedAddress: createEmptyAddress(),
            geopoint: null,
            locationMeta: createUnvalidatedLocationMeta(nextDraft.addressInput),
          };
        }
        return nextDraft;
      });
      if (typeof parsed.step === 'number') {
        setStep(parsed.step);
      }
      if (parsed.kind && parsed.kind !== kind) {
        return;
      }
    } catch {
      // ignore draft load failures
    }
  }, [draftKey, kind, listingToEdit, shouldPersistDraft]);

  useEffect(() => {
    if (!kind) {
      setResumableDraft(readResumableDraft(mode));
      return;
    }
    setDraft((current) => ({ ...current, type: kind }));
  }, [kind, mode]);

  useEffect(() => {
    if (!kind) return;
    setStep((current) => Math.min(current, totalSteps - 1));
  }, [kind, totalSteps]);

  useEffect(() => {
    if (kind !== 'club') return;
    setExpandedScheduleDay((current) => (
      current && draft.schedule.some((day) => day.day === current)
        ? current
        : getDefaultExpandedScheduleDay(draft.schedule)
    ));
  }, [draft.schedule, kind]);

  useEffect(() => {
    if (typeof window === 'undefined' || !shouldPersistDraft || isSaving) return;
    const payload = {
      ...draft,
      kind,
      step,
      draftSavedAt: Date.now(),
      headerImageFile: undefined,
      galleryImageFiles: undefined,
    };
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }, [draft, draftKey, isSaving, kind, shouldPersistDraft, step]);

  useEffect(() => {
    if (typeof window === 'undefined' || isSaving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const hasChanges = Boolean(kind || draft.name || draft.description_short || draft.description_full || draft.contactEmail);
    if (!hasChanges) return;
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [draft, isSaving, kind]);

  useEffect(() => {
    if (!draft.type) return;
    const matches = findPotentialListingDuplicates({
      draft: {
        ...draft,
        type: draft.type,
      } as Partial<Listing> & { type: ListingKind },
      listings,
      excludeId: listingToEdit?.id,
    });
    setDuplicateMatches(matches);
  }, [draft, listings, listingToEdit?.id]);

  const clubVenueOptions = useMemo(() => (
    listings
      .filter((listing): listing is ClubData => listing.type === 'club')
      .map((club) => ({
        key: clubKey(club),
        label: `${club.name} (${club.geopoint.address.city}, ${club.geopoint.address.region})`,
        club,
      }))
  ), [listings]);

  const currentClubVenue = useMemo(() => clubVenueOptions.find((entry) => entry.key === draft.venueKey) ?? null, [clubVenueOptions, draft.venueKey]);

  const updateField = <K extends keyof ListingDraft>(field: K, value: ListingDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    if (!kind || draft.id) return;
    setDraft((current) => current.id ? current : { ...current, id: createListingId(kind), type: kind });
  }, [draft.id, kind]);

  const getDraftMediaAsset = (role: MediaRole) => {
    if (role === 'gallery') {
      return [...draft.mediaAssets].reverse().find((asset) => asset.role === role) ?? null;
    }
    return draft.mediaAssets.find((asset) => asset.role === role) ?? null;
  };

  const handleMediaUploaded = (asset: MediaAsset) => {
    setDraft((current) => {
      const mediaAssets = asset.role === 'gallery'
        ? [...current.mediaAssets, asset]
        : [...current.mediaAssets.filter((item) => item.role !== asset.role), asset];
      return { ...current, mediaAssets };
    });
  };

  const setAddressInput = (value: string) => {
    validationSequenceRef.current += 1;
    setValidationMessage('');
    setDraft((current) => {
      const hasChangedVerifiedAddress = normalizeAddressText(value) !== normalizeAddressText(current.verifiedAddressInput);
      return {
        ...current,
        addressInput: value,
        venueKey: hasChangedVerifiedAddress ? '' : current.venueKey,
        verifiedAddressInput: hasChangedVerifiedAddress ? '' : current.verifiedAddressInput,
        advancedAddress: hasChangedVerifiedAddress ? createEmptyAddress() : current.advancedAddress,
        geopoint: hasChangedVerifiedAddress ? null : current.geopoint,
        locationMeta: hasChangedVerifiedAddress
          ? createUnvalidatedLocationMeta(value.trim() || undefined)
          : current.locationMeta,
      };
    });
  };

  const setAdvancedAddress = (address: Partial<ListingAddress>) => {
    validationSequenceRef.current += 1;
    setValidationMessage('');
    setDraft((current) => {
      const nextAddress = {
        ...current.advancedAddress,
        ...address,
      };
      const nextAddressText = current.addressInput.trim() || formatListingAddress(nextAddress);
      const hasChangedVerifiedAddress = normalizeAddressText(nextAddressText) !== normalizeAddressText(current.verifiedAddressInput);
      return {
        ...current,
        advancedAddress: nextAddress,
        verifiedAddressInput: hasChangedVerifiedAddress ? '' : current.verifiedAddressInput,
        geopoint: hasChangedVerifiedAddress ? null : current.geopoint,
        locationMeta: hasChangedVerifiedAddress
          ? createUnvalidatedLocationMeta(nextAddressText || undefined)
          : current.locationMeta,
      };
    });
  };

  const applyValidatedAddress = (
    addressInput: string,
    result: Awaited<ReturnType<typeof validateListingLocation>>,
  ) => {
    if (result.geopoint) {
      setDraft((current) => ({
        ...current,
        addressInput,
        verifiedAddressInput: addressInput,
        geopoint: result.geopoint,
        advancedAddress: {
          addressLine1: result.geopoint?.address.addressLine1 ?? current.advancedAddress.addressLine1,
          addressLine2: result.geopoint?.address.addressLine2 ?? current.advancedAddress.addressLine2,
          city: result.geopoint?.address.city ?? current.advancedAddress.city,
          region: result.geopoint?.address.region ?? current.advancedAddress.region,
          postalCode: result.geopoint?.address.postalCode ?? current.advancedAddress.postalCode,
          country: result.geopoint?.address.country ?? current.advancedAddress.country,
        },
        locationMeta: {
          ...result.meta,
          manualAdjustment: false,
        },
      }));
      setShowAdvancedAddress(result.meta.status !== 'validated');
      setValidationMessage(result.meta.status === 'validated' ? 'Address verified.' : 'Address verified, but review is recommended.');
      return;
    }

    setDraft((current) => ({
      ...current,
      addressInput,
      verifiedAddressInput: '',
      geopoint: null,
      locationMeta: result.meta,
    }));
    setShowAdvancedAddress(true);
    setValidationMessage('We could not confidently verify this address. Use Advanced Address or submit for review.');
  };

  const syncVenueLocation = (venueKey: string) => {
    const venue = clubVenueOptions.find((entry) => entry.key === venueKey)?.club;
    validationSequenceRef.current += 1;
    setValidationMessage('');
    if (!venue) {
      setDraft((current) => ({
        ...current,
        venueKey: '',
        addressInput: '',
        verifiedAddressInput: '',
        advancedAddress: createEmptyAddress(),
        geopoint: null,
        locationMeta: createUnvalidatedLocationMeta(),
      }));
      setShowAdvancedAddress(false);
      return;
    }
    setDraft((current) => ({
      ...current,
      venueKey,
      addressInput: venue.location,
      verifiedAddressInput: venue.location,
      advancedAddress: {
        addressLine1: venue.geopoint.address.addressLine1 ?? '',
        addressLine2: venue.geopoint.address.addressLine2 ?? '',
        city: venue.geopoint.address.city ?? '',
        region: venue.geopoint.address.region ?? '',
        postalCode: venue.geopoint.address.postalCode ?? '',
        country: venue.geopoint.address.country ?? '',
      },
      geopoint: venue.geopoint,
      isAddressPrivate: false,
      locationMeta: {
        status: 'validated',
        validatedAt: new Date().toISOString(),
        geocoderSource: 'venue-club',
        geocoderLabel: venue.location,
        confidence: 1,
        normalizedAddress: venue.location,
      },
    }));
  };

  const validateStep = (targetStep: number) => {
    const nextErrors: Record<string, string> = {};
    if (!kind) {
      setErrors({ type: 'Choose whether you are submitting a club or an event.' });
      return false;
    }
    const shouldValidateIdentity = targetStep === 0;
    const shouldValidateDetails = isPublicSubmission ? targetStep === 0 : targetStep === 2;
    const shouldValidateSchedule = isPublicSubmission ? targetStep === 2 : targetStep === 3;

    if (shouldValidateIdentity) {
      if (!draft.name.trim()) nextErrors.name = `${kind === 'club' ? 'Club' : 'Event'} name is required.`;
      if (kind === 'event' && !draft.hostName.trim() && mode !== 'public') nextErrors.hostName = 'Host name is required.';
      if (!draft.contactEmail.trim()) nextErrors.contactEmail = 'Contact email is required.';
      if (kind === 'event' && mode !== 'public' && !draft.postedByUserId.trim()) nextErrors.postedByUserId = 'Submitting account is required.';
    }
    if (targetStep === 1) {
      if (!draft.addressInput.trim() && !draft.venueKey) {
        nextErrors.addressInput = 'Address is required.';
      } else if (draft.locationMeta?.status === 'validated' && !hasCurrentVerifiedLocation(draft)) {
        nextErrors.addressInput = 'Verify the current address before continuing.';
      }
    }
    if (shouldValidateDetails) {
      if (kind === 'club' && !draft.description_short.trim()) nextErrors.description_short = 'Short description is required.';
      if (kind === 'event' && !draft.description_full.trim()) nextErrors.description_full = 'Description is required.';
    }
    if (shouldValidateSchedule) {
      if (kind === 'event') {
        if (!draft.time.start) nextErrors.start = 'Start time is required.';
        if (!draft.time.end) nextErrors.end = 'End time is required.';
        if (draft.time.start && draft.time.end && draft.time.start >= draft.time.end) {
          nextErrors.end = 'End time must be after start time.';
        }
      }
    }
    if (targetStep === 6) {
      if (kind === 'club' && !draft.description_short.trim()) nextErrors.description_short = 'Short description is required.';
      if (kind === 'event' && !draft.description_full.trim()) nextErrors.description_full = 'Description is required.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateAddress = async () => {
    if (!kind) return;
    const rawAddress = draft.addressInput.trim() || formatListingAddress(draft.advancedAddress);
    if (!rawAddress && !draft.venueKey) return;
    if (hasCurrentVerifiedLocation(draft)) {
      setValidationMessage('Address verified.');
      return;
    }
    const requestId = ++validationSequenceRef.current;
    setIsLoadingValidation(true);
    setValidationMessage('');
    try {
      const result = await validateListingLocation({
        freeformAddress: rawAddress,
        listingType: kind,
        venueKey: draft.venueKey || undefined,
        advancedAddress: draft.advancedAddress,
      });

      if (requestId !== validationSequenceRef.current) {
        return;
      }
      applyValidatedAddress(rawAddress, result);
      if (result.meta.status !== 'validated') {
        setValidationMessage('Validated, but review is recommended.');
      }
    } catch {
      if (requestId !== validationSequenceRef.current) {
        return;
      }
      setShowAdvancedAddress(true);
      setValidationMessage('Validation failed. You can continue with manual address entry.');
      setDraft((current) => ({
        ...current,
        verifiedAddressInput: '',
        geopoint: null,
        locationMeta: {
          status: 'needs_review',
          normalizedAddress: formatListingAddress(current.advancedAddress),
          warnings: ['validation-request-failed'],
        },
      }));
    } finally {
      if (requestId === validationSequenceRef.current) {
        setIsLoadingValidation(false);
      }
    }
  };

  useEffect(() => {
    if (!kind || step !== 1) return;
    if (!draft.addressInput.trim() && !draft.venueKey) return;
    const id = window.setTimeout(() => {
      void validateAddress();
    }, 650);
    return () => window.clearTimeout(id);
  }, [draft.addressInput, draft.advancedAddress.addressLine1, draft.advancedAddress.addressLine2, draft.advancedAddress.city, draft.advancedAddress.region, draft.advancedAddress.postalCode, draft.advancedAddress.country, draft.venueKey, kind, step]);

  const handleNext = async () => {
    if (!kind) {
      if (validateStep(0)) setStep(0);
      return;
    }
    if (!validateStep(step)) return;
    if (step === 1) {
      await validateAddress();
    }
    setStep((current) => Math.min(current + 1, totalSteps - 1));
  };

  const resumeDraft = () => {
    if (!resumableDraft || typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(storageKeyForDraft(mode, resumableDraft.kind));
    if (!raw) {
      setResumableDraft(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<ListingDraft> & { step?: number };
      const nextDraft: ListingDraft = {
        ...createInitialDraft(currentUser, mode === 'public'),
        ...parsed,
        type: resumableDraft.kind,
        geopoint: parsed.geopoint ?? null,
      };
      setKind(resumableDraft.kind);
      setDraft(nextDraft);
      setStep(Math.max(0, Math.min(typeof parsed.step === 'number' ? parsed.step : 0, totalSteps - 1)));
      setErrors({});
      setDuplicateMatches([]);
      setValidationMessage('');
      setExpandedScheduleDay(getDefaultExpandedScheduleDay(nextDraft.schedule));
    } catch {
      window.localStorage.removeItem(storageKeyForDraft(mode, resumableDraft.kind));
      setResumableDraft(readResumableDraft(mode));
    }
  };

  const discardResumableDraft = () => {
    if (!resumableDraft || typeof window === 'undefined') return;
    window.localStorage.removeItem(storageKeyForDraft(mode, resumableDraft.kind));
    setResumableDraft(readResumableDraft(mode));
  };

  const handleBack = () => {
    if (!kind && canChooseType) {
      resetSubmissionState(null, true);
      onCancel();
      return;
    }
    if (kind && step > 0) {
      setStep((current) => current - 1);
      return;
    }
    if (kind && canChooseType) {
      resetSubmissionState(null, false);
      setResumableDraft(readResumableDraft(mode));
      return;
    }
    resetSubmissionState(initialKind ?? null, true);
    onCancel();
  };

  const saveListing = async () => {
    if (!kind) {
      addToast({ message: 'Choose a listing type before saving.', type: 'error' });
      return;
    }
    if (!validateStep(step) || !validateStep(0) || !validateStep(1) || !validateStep(2) || !validateStep(3)) {
      addToast({ message: 'Please fix the highlighted fields before saving.', type: 'error' });
      return;
    }
    if (!hasCurrentVerifiedLocation(draft)) {
      addToast({ message: 'Verify the current address before saving.', type: 'error' });
      setErrors((current) => ({
        ...current,
        addressInput: 'Verify the current address before saving.',
      }));
      setStep(1);
      return;
    }

    setIsSaving(true);
    try {
      const nextDraft: ListingDraft = {
        ...draft,
        type: kind,
        status: isEditing ? draft.status : mode === 'public' ? 'pending_approval' : 'approved',
        postedByUserId: draft.postedByUserId || currentUser?.id || 'user-submission',
        geopoint: draft.geopoint,
        locationMeta: draft.locationMeta,
      };
      const saved = await submitDraft(mode, nextDraft);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(draftKey);
      }
      resetSubmissionState(initialKind ?? null, true);
      addToast({ message: `${kind === 'club' ? 'Club' : 'Event'} saved successfully.`, type: 'success' });
      onSaved?.(saved);
    } catch (error) {
      const candidateMessage = error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown } | null)?.message === 'string'
          ? String((error as { message: string }).message)
          : '';
      const message = candidateMessage.trim() || 'Failed to save listing.';
      addToast({ message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const renderDuplicateNotice = () => {
    if (!duplicateMatches.length) return null;
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <div className="font-semibold text-amber-50">Possible duplicates</div>
        <ul className="mt-2 space-y-1">
          {duplicateMatches.map((match) => (
            <li key={match.listing.id}>
              <span className="font-medium text-white">{match.listing.name}</span>
              {' '}
              <span className="text-amber-200/80">({match.reasons.join(', ')})</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderTypeChoice = () => (
    <div className={isMobilePresentation ? 'grid gap-4' : 'grid gap-4 md:grid-cols-2'}>
      {[
        {
          type: 'club' as const,
          title: 'Add a Club',
          copy: 'Recurring venues, weekly schedules, and permanent spaces.',
          imageUrl: '/assets/submission/add-club-card.svg',
          imagePosition: 'center center',
          accent: 'from-red-950/10 via-black/18 to-black/82',
        },
        {
          type: 'event' as const,
          title: 'Add an Event',
          copy: 'One-time or recurring listings with date/time and optional venue.',
          imageUrl: '/assets/hosts/community-host/hero-banner.png',
          imagePosition: 'center 72%',
          accent: 'from-fuchsia-950/20 via-black/34 to-black/90',
        },
      ].map((option) => (
        <button
          key={option.type}
          type="button"
          onClick={() => {
            setKind(option.type);
            setDraft((currentUserDraft) => ({
              ...createInitialDraft(currentUser, mode === 'public'),
              id: createListingId(option.type),
              type: option.type,
              postedByUserId: currentUserDraft.postedByUserId || currentUser?.id || 'user-submission',
            }));
            setStep(0);
          }}
          className={isMobilePresentation
            ? 'group relative min-h-[184px] overflow-hidden rounded-[26px] border border-white/[0.09] text-left shadow-[0_18px_42px_rgba(0,0,0,0.28)] transition duration-200 active:scale-[0.99] active:border-red-300/45'
            : 'rounded-3xl border border-white/10 bg-black/25 p-6 text-left transition hover:border-red-400/60 hover:bg-white/5'}
        >
          {isMobilePresentation ? (
            <>
              <div
                className="absolute inset-0 scale-[1.02] bg-cover transition-transform duration-500 group-active:scale-105"
                style={{ backgroundImage: `url(${option.imageUrl})`, backgroundPosition: option.imagePosition }}
                aria-hidden="true"
              />
              <div className={`absolute inset-0 bg-gradient-to-b ${option.accent}`} aria-hidden="true" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(239,68,68,0.20),transparent_36%)]" aria-hidden="true" />
              <div className="relative z-10 flex min-h-[184px] flex-col justify-end p-5">
                <div className="text-[22px] font-semibold tracking-[-0.02em] text-white">{option.title}</div>
                <p className="mt-1.5 max-w-[30ch] text-[12px] leading-5 text-gray-200/85">{option.copy}</p>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300/80">Start here</div>
              <div className="mt-3 text-2xl font-semibold text-white">{option.title}</div>
              <p className="mt-2 text-sm text-gray-400">{option.copy}</p>
            </>
          )}
        </button>
      ))}
    </div>
  );

  const renderIdentity = () => (
    <Section title="Identity" eyebrow="Step 1">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label={kind === 'club' ? 'Club name' : 'Event name'}
          value={draft.name}
          onChange={(event) => updateField('name', event.target.value)}
          error={errors.name}
          placeholder={kind === 'club' ? 'Twist' : 'Midnight Masquerade'}
        />
        {kind === 'event' ? (
          <Field
            label="Public host name"
            value={draft.hostName}
            onChange={(event) => updateField('hostName', event.target.value)}
            error={errors.hostName}
            placeholder="Community Host"
          />
        ) : (
          <Field
            label="Contact email"
            type="email"
            value={draft.contactEmail}
            onChange={(event) => updateField('contactEmail', event.target.value)}
            error={errors.contactEmail}
            placeholder="info@club.com"
          />
        )}
        <Field
          label={kind === 'event' ? 'How to attend link' : 'Website'}
          type="url"
          value={draft.website}
          onChange={(event) => updateField('website', event.target.value)}
          placeholder="https://"
          helpText={kind === 'event'
            ? 'Add the ticket page, RSVP form, approval form, payment page, or other link guests should use first.'
            : 'Optional official website.'}
        />
        {kind === 'event' && (
          <Field
            label="Contact email"
            type="email"
            value={draft.contactEmail}
            onChange={(event) => updateField('contactEmail', event.target.value)}
            error={errors.contactEmail}
            placeholder="rsvp@event.com"
          />
        )}
        {kind === 'event' && mode !== 'public' && (
          <Select
            label="Submitting account"
            value={draft.postedByUserId}
            onChange={(event) => updateField('postedByUserId', event.target.value)}
            error={errors.postedByUserId}
          >
            <option value="">Select account</option>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>{host.displayName}</option>
            ))}
          </Select>
        )}
      </div>
      {kind === 'event' && mode === 'public' && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-gray-300">
          Public submissions are saved for moderation. The host account is filled automatically.
        </div>
      )}
    </Section>
  );

  const renderBasicInfo = () => (
    <Section title="Basic Info" eyebrow={isPublicSubmission ? undefined : 'Step 1'}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label={kind === 'club' ? 'Club name' : 'Event name'}
          value={draft.name}
          onChange={(event) => updateField('name', event.target.value)}
          error={errors.name}
          placeholder={kind === 'club' ? 'Twist' : 'Midnight Masquerade'}
        />
        {kind === 'event' && (
          <Field
            label="Host / promoter"
            value={draft.hostName}
            onChange={(event) => updateField('hostName', event.target.value)}
            error={errors.hostName}
            placeholder="Community Host"
          />
        )}
        <Field
          label={kind === 'event' ? 'How to attend link' : 'Website'}
          type="url"
          value={draft.website}
          onChange={(event) => updateField('website', event.target.value)}
          placeholder="https://"
          helpText={kind === 'event'
            ? 'Add the ticket page, RSVP form, approval form, payment page, or other link guests should use first.'
            : 'Optional official website.'}
        />
        <div className={kind === 'club' ? 'md:col-span-2' : undefined}>
          <Field
            label="Contact email"
            type="email"
            value={draft.contactEmail}
            onChange={(event) => updateField('contactEmail', event.target.value)}
            error={errors.contactEmail}
            placeholder={kind === 'club' ? 'info@club.com' : 'rsvp@event.com'}
          />
        </div>
        {kind === 'club' ? (
          <>
            <div className="md:col-span-2">
              <TextArea
                label="Short description"
                value={draft.description_short}
                onChange={(event) => updateField('description_short', event.target.value)}
                error={errors.description_short}
                helpText="A concise, one-line summary shown in discovery surfaces."
                maxLength={240}
                rows={3}
              />
            </div>
            <div className="md:col-span-2">
              <TextArea
                label="Schedule Notes"
                value={draft.specialScheduleNotes}
                onChange={(event) => updateField('specialScheduleNotes', event.target.value)}
                helpText="Use this for rotating themes, monthly events, holiday changes, RSVP requirements, door times, or anything the weekly schedule does not fully explain."
                placeholder="Example: Sunday themes rotate between Her Fantasy Party and couples massage classes. Dates may vary, so guests should check the official calendar before attending."
                rows={3}
              />
            </div>
          </>
        ) : (
          <div className="md:col-span-2">
            <TextArea
              label="Full description"
              value={draft.description_full}
              onChange={(event) => updateField('description_full', event.target.value)}
              error={errors.description_full}
              helpText="Include theme, dress code, house rules, and RSVP details."
              maxLength={1200}
            />
          </div>
        )}
      </div>
    </Section>
  );

  const renderAddress = (title = 'Address Validation', eyebrow: string | undefined = 'Step 2') => {
    const verifiedAddress = draft.geopoint?.address ?? createEmptyAddress();
    const normalizedAddress = draft.locationMeta?.normalizedAddress || formatListingAddress(verifiedAddress);
    const showPreview = Boolean(draft.geopoint) && draft.locationMeta?.status !== 'unvalidated';
    const shouldShowAdvanced = showAdvancedAddress || draft.locationMeta?.status === 'needs_review' || draft.locationMeta?.status === 'manual';
    const locationStatus = draft.locationMeta?.status ?? 'unvalidated';
    const verifiedCardClass = locationStatus === 'validated'
      ? 'border-emerald-300/20 bg-emerald-400/8'
      : locationStatus === 'needs_review' || locationStatus === 'manual'
        ? 'border-amber-300/25 bg-amber-400/8'
        : 'border-white/10 bg-black/25';
    const verifiedEyebrowClass = locationStatus === 'validated'
      ? 'text-emerald-200'
      : locationStatus === 'needs_review' || locationStatus === 'manual'
        ? 'text-amber-200'
        : 'text-gray-400';
    const verifiedStatusLabel = locationStatus === 'validated'
      ? 'Address verified'
      : locationStatus === 'needs_review'
        ? 'Needs review'
        : locationStatus === 'manual'
          ? 'Pin adjusted manually'
          : 'Waiting for verification';
    return (
      <Section title={title} eyebrow={eyebrow}>
        <div className="space-y-4">
          {kind === 'event' && (
            <div className={isPublicSubmission ? 'grid gap-3' : 'grid gap-3 md:grid-cols-2'}>
              <TogglePill
                checked={draft.isAddressPrivate}
                onChange={(checked) => updateField('isAddressPrivate', checked)}
                label="Keep exact address private"
                helpText="Only the city / region should be shown publicly."
              />
              {!isPublicSubmission && (
                <Select
                  label="Venue"
                  value={draft.venueKey}
                  onChange={(event) => syncVenueLocation(event.target.value)}
                  helpText="Optional. Select a club to inherit its pinned venue."
                >
                  <option value="">Private location / disclosed later</option>
                  {clubVenueOptions.map((venue) => (
                    <option key={venue.key} value={venue.key}>{venue.label}</option>
                  ))}
                </Select>
              )}
            </div>
          )}

          <Field
            label="Address"
            value={draft.addressInput}
            onChange={(event) => setAddressInput(event.target.value)}
            error={errors.addressInput}
            placeholder="387 Bay Street, San Francisco"
            helpText="Start with the one address line you know. We’ll verify it in the background."
            onBlur={() => void validateAddress()}
          />

          {kind === 'club' && isPublicSubmission && (
            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="text-sm font-semibold text-white">Public location display</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  {
                    value: 'exact_public' as LocationVisibility,
                    title: 'Show exact address publicly',
                    copy: 'Use this for public venues where guests can find the location directly.',
                  },
                  {
                    value: 'approximate_public' as LocationVisibility,
                    title: 'Show approximate area only',
                    copy: 'Use this for members-only, invite-only, or discreet venues. SwingSphere saves the exact address for review, but public users should only see the ZIP code or general area.',
                  },
                ].map((option) => {
                  const selected = draft.locationVisibility === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateField('locationVisibility', option.value)}
                      className={[
                        'rounded-2xl border p-4 text-left transition',
                        selected ? 'border-red-300/70 bg-red-500/10 text-white' : 'border-white/10 bg-black/25 text-gray-300 hover:border-white/20',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{option.title}</div>
                          <div className="mt-1 text-xs leading-5 text-gray-400">{option.copy}</div>
                        </div>
                        <span className={['mt-1 h-3 w-3 rounded-full border', selected ? 'border-red-200 bg-red-300' : 'border-white/25'].join(' ')} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">You entered</div>
              <div className="mt-2 text-sm text-white">{draft.addressInput || 'Enter an address to begin'}</div>
            </div>
            <div className={['rounded-2xl border p-4', verifiedCardClass].join(' ')}>
              <div className={['text-xs font-semibold uppercase tracking-[0.24em]', verifiedEyebrowClass].join(' ')}>Verified address</div>
              <div className="mt-2 space-y-1 text-sm text-white">
                <div className="font-medium">{verifiedStatusLabel}</div>
                <div className="hidden">
                  {draft.locationMeta?.status === 'validated'
                    ? '✓ Address Verified'
                    : draft.locationMeta?.status === 'needs_review'
                      ? 'Needs Review'
                      : 'Waiting for verification'}
                </div>
                <div className="text-gray-200">{normalizedAddress || 'No normalized address yet'}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void validateAddress()}>
              {isLoadingValidation ? 'Validating...' : 'Try Validation Again'}
            </Button>
            <span className="text-sm text-gray-300">
              {validationMessage || 'Validation runs automatically after a short pause.'}
            </span>
          </div>

          {showPreview && (
            <ListingLocationPreview
              geopoint={draft.geopoint}
              locationMeta={draft.locationMeta}
              resolvedAddress={normalizedAddress}
              showDetailsOverlay={!isPublicSubmission}
              onAdjustPin={(coords) => {
                setDraft((current) => ({
                  ...current,
                  geopoint: {
                    ...(current.geopoint ?? createEmptyGeopoint()),
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  },
                  locationMeta: {
                    status: 'manual',
                    validatedAt: new Date().toISOString(),
                    geocoderSource: current.locationMeta?.geocoderSource ?? 'manual',
                    normalizedAddress: current.locationMeta?.normalizedAddress ?? normalizedAddress,
                    manualAdjustment: true,
                    confidence: current.locationMeta?.confidence ?? 0.5,
                  },
                }));
                setShowAdvancedAddress(true);
              }}
            />
          )}

          {showPreview && draft.geopoint && isPublicSubmission && (
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-gray-300">
              <span className="font-medium text-white">Coordinates:</span>
              {' '}
              {draft.geopoint.latitude.toFixed(5)}, {draft.geopoint.longitude.toFixed(5)}
            </div>
          )}

          {shouldShowAdvanced && (
            <div className="rounded-3xl border border-white/10 bg-black/25 p-4 md:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Advanced Address</div>
                  <div className="text-xs text-gray-400">Use this only if the validator cannot confidently resolve the location.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedAddress((value) => !value)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:bg-white/8"
                >
                  {showAdvancedAddress ? 'Hide advanced' : 'Show advanced'}
                </button>
              </div>
              {showAdvancedAddress && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Street"
                    value={draft.advancedAddress.addressLine1}
                    onChange={(event) => setAdvancedAddress({ addressLine1: event.target.value })}
                    placeholder="387 Bay Street"
                  />
                  <Field
                    label="Address line 2"
                    value={draft.advancedAddress.addressLine2}
                    onChange={(event) => setAdvancedAddress({ addressLine2: event.target.value })}
                    placeholder="Suite 200"
                  />
                  <Field
                    label="City"
                    value={draft.advancedAddress.city}
                    onChange={(event) => setAdvancedAddress({ city: event.target.value })}
                    placeholder="San Francisco"
                  />
                  <Field
                    label="State / Region"
                    value={draft.advancedAddress.region}
                    onChange={(event) => setAdvancedAddress({ region: event.target.value })}
                    placeholder="CA"
                  />
                  <Field
                    label="Postal code"
                    value={draft.advancedAddress.postalCode}
                    onChange={(event) => setAdvancedAddress({ postalCode: event.target.value })}
                    placeholder="94133"
                  />
                  <Field
                    label="Country"
                    value={draft.advancedAddress.country}
                    onChange={(event) => setAdvancedAddress({ country: event.target.value })}
                    placeholder="United States"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </Section>
    );
  };

  const renderDetails = () => (
    <Section title="Details" eyebrow="Step 3">
      <div className="grid gap-4 md:grid-cols-2">
        {kind === 'club' ? (
          <>
            <TextArea
              label="Short description"
              value={draft.description_short}
              onChange={(event) => updateField('description_short', event.target.value)}
              error={errors.description_short}
              helpText="A concise, one-line summary shown in discovery surfaces."
              maxLength={240}
            />
            <TextArea
              label="Special schedule notes"
              value={draft.specialScheduleNotes}
              onChange={(event) => updateField('specialScheduleNotes', event.target.value)}
              helpText="Optional. Use for exceptions or recurring schedule caveats."
            />
          </>
        ) : (
          <>
            <TextArea
              label="Full description"
              value={draft.description_full}
              onChange={(event) => updateField('description_full', event.target.value)}
              error={errors.description_full}
              helpText="Include theme, dress code, house rules, and RSVP details."
              maxLength={1200}
            />
            <div className="space-y-4">
              <Field
                label="Public host name"
                value={draft.hostName}
                onChange={(event) => updateField('hostName', event.target.value)}
                error={errors.hostName}
                placeholder="Community Host"
              />
              <TogglePill
                checked={draft.isAddressPrivate}
                onChange={(checked) => updateField('isAddressPrivate', checked)}
                label="Hide exact address from public view"
                helpText="Use this for private residences or invite-only locations."
              />
            </div>
          </>
        )}
      </div>
      {kind === 'event' && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-gray-300">
          If you picked a venue, the address is inherited from that club and can still be adjusted later.
        </div>
      )}
    </Section>
  );

  const updateScheduleDay = (index: number, nextDay: DaySchedule) => {
    const next = [...draft.schedule];
    next[index] = nextDay;
    updateField('schedule', next);
  };

  const renderCompactClubSchedule = (title = 'Schedule', eyebrow: string | undefined = 'Step 4') => (
    <Section title={title} eyebrow={eyebrow}>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
        {draft.schedule.map((day, index) => {
          const isExpanded = expandedScheduleDay === day.day;
          const isOpen = !day.isClosed;
          return (
            <div
              key={day.day}
              className={[
                'border-b border-white/8 last:border-b-0 transition',
                isExpanded ? 'bg-white/6' : 'hover:bg-white/4',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => setExpandedScheduleDay(day.day)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-left md:grid-cols-[160px_1fr_auto]"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      'h-2.5 w-2.5 rounded-full',
                      isOpen ? 'bg-red-300 shadow-[0_0_16px_rgba(252,165,165,0.45)]' : 'bg-white/18',
                    ].join(' ')}
                  />
                  <span className="text-sm font-semibold text-white">{day.day}</span>
                </div>
                <div className={['text-sm md:text-left', isOpen ? 'text-gray-100' : 'text-gray-500'].join(' ')}>
                  {summarizeScheduleDay(day)}
                </div>
                <div className={['text-xs font-semibold', isExpanded ? 'text-red-200' : 'text-gray-400'].join(' ')}>
                  {isExpanded ? 'Editing' : 'Edit'}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-white/8 px-4 pb-4 pt-3">
                  <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                    <TogglePill
                      checked={isOpen}
                      onChange={(checked) => {
                        updateScheduleDay(index, {
                          ...day,
                          isClosed: !checked,
                          open: day.open ?? '21:00',
                          close: day.close ?? '02:00',
                        });
                      }}
                      label={isOpen ? 'Open this day' : 'Closed this day'}
                      helpText={isOpen ? 'This day will appear with public hours.' : 'Closed days stay compact in the weekly list.'}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field
                        label="Open"
                        type="time"
                        value={day.open ?? ''}
                        disabled={!isOpen}
                        onChange={(event) => updateScheduleDay(index, { ...day, open: event.target.value })}
                      />
                      <Field
                        label="Close"
                        type="time"
                        value={day.close ?? ''}
                        disabled={!isOpen}
                        onChange={(event) => updateScheduleDay(index, { ...day, close: event.target.value })}
                      />
                    </div>
                    <div className="space-y-5 md:col-span-2">
                      <CheckboxGroup
                        title="Day-specific welcome signals"
                        options={CLUB_SCHEDULE_ACCESS_RULES}
                        selected={day.rules ?? []}
                        onChange={(rules) => updateScheduleDay(index, { ...day, rules })}
                      />
                      <CheckboxGroup
                        title="Community & Inclusion"
                        options={CLUB_SCHEDULE_INCLUSION_RULES}
                        selected={day.rules ?? []}
                        onChange={(rules) => updateScheduleDay(index, { ...day, rules })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {errors.schedule && <div className="mt-3 text-sm text-red-300">{errors.schedule}</div>}
    </Section>
  );

  const renderSchedule = (title = 'Schedule', eyebrow: string | undefined = 'Step 4') => {
    if (kind === 'club' && isPublicSubmission) {
      return renderCompactClubSchedule(title, eyebrow);
    }

    return (
    <Section title={title} eyebrow={eyebrow}>
      {kind === 'club' ? (
        <div className="space-y-3">
          {draft.schedule.map((day, index) => (
            <div key={day.day} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">{day.day}</div>
                <TogglePill
                  checked={day.isClosed}
                  onChange={(checked) => {
                    const next = [...draft.schedule];
                    next[index] = { ...day, isClosed: checked };
                    updateField('schedule', next);
                  }}
                  label="Closed"
                />
              </div>
              {!day.isClosed && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field
                    label="Open"
                    type="time"
                    value={day.open ?? ''}
                    onChange={(event) => {
                      updateScheduleDay(index, { ...day, open: event.target.value });
                    }}
                  />
                  <Field
                    label="Close"
                    type="time"
                    value={day.close ?? ''}
                    onChange={(event) => {
                      updateScheduleDay(index, { ...day, close: event.target.value });
                    }}
                  />
                  <div className="md:col-span-2">
                    <CheckboxGroup
                      title="Rules for this day"
                      options={CLUB_SCHEDULE_RULES}
                      selected={day.rules ?? []}
                      onChange={(rules) => {
                        updateScheduleDay(index, { ...day, rules });
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
          {errors.schedule && <div className="text-sm text-red-300">{errors.schedule}</div>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Start date & time"
            type="datetime-local"
            value={draft.time.start}
            onChange={(event) => updateField('time', { ...draft.time, start: event.target.value })}
            error={errors.start}
          />
          <Field
            label="End date & time"
            type="datetime-local"
            value={draft.time.end}
            onChange={(event) => updateField('time', { ...draft.time, end: event.target.value })}
            error={errors.end}
          />
          <div className="md:col-span-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-sm font-semibold text-white">Venue selection</div>
              <div className="mt-1 text-sm text-gray-400">
                {draft.venueKey ? `Using ${currentClubVenue?.label ?? 'selected venue'}.` : 'No venue selected. Private location or custom address.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </Section>
    );
  };

  const renderTags = (title = 'Tags / Amenities', eyebrow: string | undefined = 'Step 5') => (
    <Section title={title} eyebrow={eyebrow}>
      {kind === 'club' ? (
        <div className="space-y-6">
          <CheckboxGroup title="Vibe" options={clubVibeTags} selected={draft.generalAmenities} onChange={(selected) => updateField('generalAmenities', selected)} />
          <CheckboxGroup title="Amenities" options={clubAmenityTags} selected={draft.generalAmenities} onChange={(selected) => updateField('generalAmenities', selected)} />
        </div>
      ) : (
        <div className="space-y-6">
          <CheckboxGroup title="Community & Inclusion" options={eventCommunityTags} selected={draft.tags} onChange={(selected) => updateField('tags', selected)} />
          <CheckboxGroup title="Vibe" options={eventVibeTags} selected={draft.tags} onChange={(selected) => updateField('tags', selected)} />
          <CheckboxGroup title="Amenities" options={eventAmenityTags} selected={draft.tags} onChange={(selected) => updateField('tags', selected)} />
          {eventThemeTags.length ? <CheckboxGroup title="Theme & Dress" options={eventThemeTags} selected={draft.tags} onChange={(selected) => updateField('tags', selected)} /> : null}
          {eventSafetyTags.length ? <CheckboxGroup title="Safety & Privacy" options={eventSafetyTags} selected={draft.tags} onChange={(selected) => updateField('tags', selected)} /> : null}
        </div>
      )}
    </Section>
  );

  const renderAudienceAndEntry = () => {
    if (!kind || !isPublicSubmission) return null;

    const audienceOptions = kind === 'club'
      ? ATTENDANCE_POLICY_OPTIONS
      : ATTENDANCE_POLICY_OPTIONS.filter((option) => option.value !== 'varies_by_night');

    return (
      <Section title="Audience">
        <p className="mb-4 text-sm leading-6 text-gray-300">
          Choose who this listing is primarily for. Use Schedule Notes or the listing description for rotating nights, exceptions, or special entry details.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {audienceOptions.map((option) => {
            const selected = normalizeAttendancePolicy(draft.attendancePolicy) === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updateField('attendancePolicy', option.value)}
                className={[
                  'rounded-2xl border p-4 text-left transition',
                  selected ? 'border-red-300/70 bg-red-500/10 text-white' : 'border-white/10 bg-black/25 text-gray-300 hover:border-white/20',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{option.label}</div>
                    {option.description && <div className="mt-1 text-xs leading-5 text-gray-400">{option.description}</div>}
                  </div>
                  <span className={['mt-1 h-3 w-3 rounded-full border', selected ? 'border-red-200 bg-red-300' : 'border-white/25'].join(' ')} />
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-6 border-t border-white/8 pt-5">
          <div className="text-sm font-semibold text-white">Entry / Screening</div>
          <p className="mt-1 text-sm text-gray-400">Select any access requirements guests should know before planning to attend.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {ENTRY_REQUIREMENT_OPTIONS.map((option) => {
              const selected = draft.entryRequirements.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateField(
                    'entryRequirements',
                    selected
                      ? draft.entryRequirements.filter((value) => value !== option.value)
                      : [...draft.entryRequirements, option.value],
                  )}
                  className={[
                    'rounded-2xl border px-3 py-3 text-left transition',
                    selected ? 'border-red-300/70 bg-red-500/10 text-white' : 'border-white/10 bg-black/25 text-gray-300 hover:border-white/20',
                  ].join(' ')}
                >
                  <div className="text-sm font-semibold">{option.label}</div>
                  {option.description && <div className="mt-1 text-xs leading-5 text-gray-400">{option.description}</div>}
                </button>
              );
            })}
          </div>
        </div>
      </Section>
    );
  };

  const renderImages = (title = 'Images', eyebrow: string | undefined = 'Step 6') => (
    <Section title={title} eyebrow={eyebrow}>
      <div className="grid gap-4 md:grid-cols-2">
        {kind === 'event' ? (
          <>
            <div className="md:col-span-2">
              <MediaUploader
                ownerType="event"
                ownerId={draft.id ?? ''}
                role="flyer"
                existingAsset={getDraftMediaAsset('flyer')}
                onUploaded={handleMediaUploaded}
                label="Event flyer"
              />
            </div>
            <MediaUploader
              ownerType="event"
              ownerId={draft.id ?? ''}
              role="hero"
              existingAsset={getDraftMediaAsset('hero')}
              onUploaded={handleMediaUploaded}
              label="Event hero image"
            />
            <MediaUploader
              ownerType="event"
              ownerId={draft.id ?? ''}
              role="gallery"
              existingAsset={getDraftMediaAsset('gallery')}
              onUploaded={handleMediaUploaded}
              label="Event gallery image"
            />
          </>
        ) : (
          <>
            <MediaUploader
              ownerType="club"
              ownerId={draft.id ?? ''}
              role="logo"
              existingAsset={getDraftMediaAsset('logo')}
              onUploaded={handleMediaUploaded}
              label="Club logo"
            />
            <MediaUploader
              ownerType="club"
              ownerId={draft.id ?? ''}
              role="hero"
              existingAsset={getDraftMediaAsset('hero')}
              onUploaded={handleMediaUploaded}
              label="Club hero image"
            />
            <div className="md:col-span-2">
              <MediaUploader
                ownerType="club"
                ownerId={draft.id ?? ''}
                role="gallery"
                existingAsset={getDraftMediaAsset('gallery')}
                onUploaded={handleMediaUploaded}
                label="Club gallery image"
              />
            </div>
          </>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-gray-300">
        {isPublicSubmission
          ? 'Images are optional and reviewed before public display. Avoid explicit images or copyrighted promotional material unless you have permission.'
          : 'Uploads go directly to Cloudflare Images. SwingSphere saves only named-variant media metadata for display.'}
      </div>
    </Section>
  );

  const renderScheduleFeatures = () => (
    <div className="space-y-6">
      {renderAudienceAndEntry()}
      {renderSchedule('Schedule', undefined)}
      {renderTags('Features', undefined)}
    </div>
  );

  const renderPublicScheduleSummary = () => {
    const openRows = getOpenScheduleRows(draft.schedule);
    if (!openRows.length) return 'Closed or not set';

    return (
      <div className="space-y-3">
        {openRows.map((day) => (
          <div key={day.day} className="grid gap-1 md:grid-cols-[120px_1fr]">
            <div className="font-medium text-white">{day.day}</div>
            <div>
              <div>{formatScheduleTime(day.open)} - {formatScheduleTime(day.close)}</div>
              {Boolean(day.rules?.length) && (
                <div className="mt-1 text-xs text-gray-400">{formatClubScheduleRules(day.rules)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderGroupedReview = () => (
    <Section title="Review your submission">
      <div className="space-y-4">
        {renderDuplicateNotice()}
        <ReviewSection title="Basic Info" onEdit={() => setStep(0)}>
          <ReviewLine label="Listing type">{kind}</ReviewLine>
          <ReviewLine label="Name">{draft.name}</ReviewLine>
          {kind === 'event' && <ReviewLine label="Host / promoter">{draft.hostName || 'Not provided'}</ReviewLine>}
          <ReviewLine label={kind === 'event' ? 'How to attend link' : 'Website'}>{draft.website || 'None'}</ReviewLine>
          <ReviewLine label="Contact email">{draft.contactEmail}</ReviewLine>
          {kind === 'club' ? (
            <>
              <ReviewLine label="Short description">{draft.description_short}</ReviewLine>
              <ReviewLine label="Schedule Notes">{draft.specialScheduleNotes || 'None'}</ReviewLine>
            </>
          ) : (
            <ReviewLine label="Description">{draft.description_full}</ReviewLine>
          )}
        </ReviewSection>

        <ReviewSection title="Location" onEdit={() => setStep(1)}>
          <ReviewLine label="You entered">{draft.addressInput || 'Not set'}</ReviewLine>
          <ReviewLine label="Verified address">{draft.locationMeta?.normalizedAddress || formatListingAddress(draft.geopoint?.address ?? createEmptyAddress())}</ReviewLine>
          <ReviewLine label="Validation status">{draft.locationMeta?.status ?? 'unvalidated'}</ReviewLine>
          {kind === 'club' && (
            <ReviewLine label="Public display">
              <div>
                <div>{formatLocationVisibility(draft.locationVisibility)}</div>
                {draft.locationVisibility === 'approximate_public' && (
                  <div className="mt-1 text-xs text-gray-400">
                    Exact address saved for review; public listing should show ZIP code or general area.
                  </div>
                )}
              </div>
            </ReviewLine>
          )}
          {kind === 'event' && <ReviewLine label="Public visibility">{draft.isAddressPrivate ? 'Exact address hidden' : 'Exact address visible'}</ReviewLine>}
        </ReviewSection>

        <ReviewSection title="Audience" onEdit={() => setStep(2)}>
          <ReviewLine label="Audience">{formatAttendancePolicy(draft.attendancePolicy)}</ReviewLine>
          <ReviewLine label="Entry / Screening">{formatEntryRequirements(draft.entryRequirements)}</ReviewLine>
        </ReviewSection>

        <ReviewSection title={kind === 'event' ? 'Event Time' : 'Schedule'} onEdit={() => setStep(2)}>
          {kind === 'club' ? (
            <ReviewLine label="Open days">
              {renderPublicScheduleSummary()}
            </ReviewLine>
          ) : (
            <>
              <ReviewLine label="Event time">{draft.time.start && draft.time.end ? `${new Date(draft.time.start).toLocaleString()} - ${new Date(draft.time.end).toLocaleString()}` : 'Not set'}</ReviewLine>
              <ReviewLine label="Venue">{draft.venueKey ? currentClubVenue?.label ?? draft.venueKey : 'Private location'}</ReviewLine>
            </>
          )}
        </ReviewSection>

        <ReviewSection title="Features" onEdit={() => setStep(2)}>
          <ReviewLine label={kind === 'club' ? 'Vibe and amenities' : 'Tags'}>
            {kind === 'club'
              ? formatClubFeatureTags(draft.generalAmenities) || 'None'
              : formatTaxonomyList(draft.tags, [eventCommunityTags, EVENT_LEGACY_RULE_TAGS, eventVibeTags, eventAmenityTags, eventThemeTags, eventSafetyTags]) || 'None'}
          </ReviewLine>
        </ReviewSection>

        <ReviewSection title="Photos" onEdit={() => setStep(3)}>
          {kind === 'club' ? (
            <>
              <ReviewLine label="Logo">{getDraftMediaAsset('logo') ? 'Uploaded' : 'None'}</ReviewLine>
              <ReviewLine label="Hero image">{getDraftMediaAsset('hero') ? 'Uploaded' : 'None'}</ReviewLine>
            </>
          ) : (
            <>
              <ReviewLine label="Event flyer">{getDraftMediaAsset('flyer') ? 'Uploaded' : 'None'}</ReviewLine>
              <ReviewLine label="Hero image">{getDraftMediaAsset('hero') ? 'Uploaded' : 'None'}</ReviewLine>
            </>
          )}
          <ReviewLine label="Gallery">{draft.mediaAssets.filter((asset) => asset.role === 'gallery').length ? `${draft.mediaAssets.filter((asset) => asset.role === 'gallery').length} uploaded` : 'None'}</ReviewLine>
        </ReviewSection>
      </div>
    </Section>
  );

  const renderPhotosReview = () => (
    <div className="space-y-6">
      {renderImages('Photos', undefined)}
      {renderGroupedReview()}
    </div>
  );

  const renderReview = () => (
    <Section title="Review" eyebrow="Step 7">
      <div className="space-y-4">
        {renderDuplicateNotice()}
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <ReviewLine label="Listing type">{kind}</ReviewLine>
          <ReviewLine label="Name">{draft.name}</ReviewLine>
          {kind === 'event' && <ReviewLine label="Host name">{draft.hostName}</ReviewLine>}
          <ReviewLine label="Contact email">{draft.contactEmail}</ReviewLine>
          <ReviewLine label="Audience">{formatAttendancePolicy(draft.attendancePolicy)}</ReviewLine>
          <ReviewLine label="Entry / Screening">{formatEntryRequirements(draft.entryRequirements)}</ReviewLine>
          <ReviewLine label="You entered">{draft.addressInput || 'Not set'}</ReviewLine>
          <ReviewLine label="Verified address">{draft.locationMeta?.normalizedAddress || formatListingAddress(draft.geopoint?.address ?? createEmptyAddress())}</ReviewLine>
          <ReviewLine label="Validation status">{draft.locationMeta?.status ?? 'unvalidated'}</ReviewLine>
          {kind === 'club' ? (
            <>
              <ReviewLine label="Description">{draft.description_short}</ReviewLine>
              <ReviewLine label="Schedule">{summarizeOpenSchedule(draft.schedule)}</ReviewLine>
              <ReviewLine label="Tags">{formatClubFeatureTags(draft.generalAmenities) || 'None'}</ReviewLine>
            </>
          ) : (
            <>
              <ReviewLine label="Description">{draft.description_full}</ReviewLine>
              <ReviewLine label="Event time">{draft.time.start && draft.time.end ? `${new Date(draft.time.start).toLocaleString()} - ${new Date(draft.time.end).toLocaleString()}` : 'Not set'}</ReviewLine>
              <ReviewLine label="Venue">{draft.venueKey ? currentClubVenue?.label ?? draft.venueKey : 'Private location'}</ReviewLine>
              <ReviewLine label="Tags">{formatTaxonomyList(draft.tags, [eventCommunityTags, EVENT_LEGACY_RULE_TAGS, eventVibeTags, eventAmenityTags, eventThemeTags, eventSafetyTags]) || 'None'}</ReviewLine>
            </>
          )}
          <ReviewLine label="Header image">{draft.headerImageFile?.name || draft.headerImageUrl || 'None'}</ReviewLine>
          <ReviewLine label="Uploaded media">{draft.mediaAssets.map((asset) => asset.role).join(', ') || 'None'}</ReviewLine>
          <ReviewLine label="Gallery">{draft.galleryImageFiles?.map((file) => file.name).join(', ') || draft.galleryImageUrls.join(', ') || 'None'}</ReviewLine>
        </div>
      </div>
    </Section>
  );

  const renderHelperList = (values: string[], groups: TaxonomyInput[][], emptyText: string) => (
    values.length ? (
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-xs text-gray-200">
            {getTaxonomyLabel(value, groups)}
          </span>
        ))}
      </div>
    ) : (
      <p className="mt-2 text-sm text-gray-500">{emptyText}</p>
    )
  );

  const renderPublicHelperPanel = () => {
    const normalizedAddress = draft.locationMeta?.normalizedAddress || formatListingAddress(draft.geopoint?.address ?? createEmptyAddress());
    const accessRules = Array.from(new Set(getSelectedTaxonomyValues(
      draft.schedule.flatMap((day) => day.rules ?? []),
      CLUB_SCHEDULE_ACCESS_RULES,
    )));
    const inclusionRules = Array.from(new Set(getSelectedTaxonomyValues(
      draft.schedule.flatMap((day) => day.rules ?? []),
      CLUB_SCHEDULE_INCLUSION_RULES,
    )));
    const featureTags = Array.from(new Set(getSelectedTaxonomyValues(draft.generalAmenities, [...clubVibeTags, ...clubAmenityTags])));
    const formattedEventTags = formatTaxonomyList(draft.tags, [eventCommunityTags, EVENT_LEGACY_RULE_TAGS, eventVibeTags, eventAmenityTags, eventThemeTags, eventSafetyTags]);
    const checklist = [
      { label: 'Basic info entered', done: Boolean(draft.name.trim() && draft.contactEmail.trim() && (kind === 'event' ? draft.description_full.trim() : draft.description_short.trim())) },
      { label: 'Location verified', done: hasCurrentVerifiedLocation(draft) },
      { label: kind === 'event' ? 'Event time added' : 'Schedule added', done: kind === 'event' ? Boolean(draft.time.start && draft.time.end) : draft.schedule.some((day) => !day.isClosed) },
      { label: 'Features reviewed', done: kind === 'event' ? draft.tags.length > 0 : draft.generalAmenities.length > 0 },
      { label: 'Photos optional', done: true },
    ];

    return (
      <aside className="hidden lg:block">
        <div className="ss-glass ss-glass--ambient sticky top-6 rounded-3xl p-5">
          {!kind && (
            <div>
              <h3 className="text-lg font-semibold text-white">What are you submitting?</h3>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                Choose Club for recurring venues or permanent spaces. Choose Event for one-time or recurring parties, takeovers, or hosted nights.
              </p>
            </div>
          )}

          {kind && step === 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white">
                {kind === 'event' ? 'Event listing tips' : 'Good listings are clear and specific.'}
              </h3>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                {kind === 'event'
                  ? 'Use a clear event name, host name, and description. Include theme, RSVP expectations, and what guests should know before attending.'
                  : 'Use a short description that helps people understand the club quickly. Mention the general vibe, what guests should expect, and any recurring schedule quirks.'}
              </p>
              {kind !== 'event' && <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm italic text-gray-300">
                "Upscale social club with weekly lifestyle nights, dancing, and on-premise play areas."
              </div>}
            </div>
          )}

          {kind && step === 1 && (
            <div>
              <h3 className="text-lg font-semibold text-white">{kind === 'event' ? 'Event location tips' : 'Location tips'}</h3>
              {kind === 'event' ? (
                <p className="mt-3 text-sm leading-6 text-gray-300">
                  Enter the event address or best available location details for review. If it happens at a known venue, SwingSphere can match or link it later during moderation.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-sm leading-6 text-gray-300">
                    Enter the real address when possible so SwingSphere can verify the listing accurately.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-gray-300">
                    For public venues, choose "Show exact address publicly." For members-only, invite-only, or discreet venues, choose "Show approximate area only." The exact address can be saved for review while public users see only the ZIP code or general area.
                  </p>
                </>
              )}
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Validation status</div>
                  <div className="mt-1 text-white">{draft.locationMeta?.status ?? 'unvalidated'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Verified address</div>
                  <div className="mt-1 text-gray-300">{normalizedAddress || 'No verified address yet.'}</div>
                </div>
                {kind === 'club' && <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Public display</div>
                  <div className="mt-1 text-gray-300">{formatLocationVisibility(draft.locationVisibility)}</div>
                </div>}
                {kind === 'event' && <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Public visibility</div>
                  <div className="mt-1 text-gray-300">{draft.isAddressPrivate ? 'Exact address hidden' : 'Exact address visible'}</div>
                </div>}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Coordinates</div>
                  <div className="mt-1 text-gray-300">
                    {draft.geopoint ? `${draft.geopoint.latitude.toFixed(5)}, ${draft.geopoint.longitude.toFixed(5)}` : 'Validation pending'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {kind && step === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-white">{kind === 'event' ? 'Event audience and timing' : 'Schedule & audience summary'}</h3>
              {kind === 'event' ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-gray-300">
                    Add the start and end time clearly. Tags should help guests understand the vibe, access rules, and amenities.
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-gray-300">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Audience</div>
                      <div className="mt-1">{formatAttendancePolicy(draft.attendancePolicy)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Entry / Screening</div>
                      <div className="mt-1">{formatEntryRequirements(draft.entryRequirements)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Event time</div>
                      <div className="mt-1">{draft.time.start && draft.time.end ? `${new Date(draft.time.start).toLocaleString()} - ${new Date(draft.time.end).toLocaleString()}` : 'No time selected yet.'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Tags</div>
                      <div className="mt-1">{formattedEventTags || 'No tags selected yet.'}</div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4 text-sm text-gray-300">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Audience</div>
                    <div className="mt-2">{formatAttendancePolicy(draft.attendancePolicy)}</div>
                  </div>
                  <div className="mt-5 text-sm text-gray-300">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Entry / Screening</div>
                    <div className="mt-2">{formatEntryRequirements(draft.entryRequirements)}</div>
                  </div>
                  <div className="mt-5 text-sm text-gray-300">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Open days</div>
                    <div className="mt-2">{renderPublicScheduleSummary()}</div>
                  </div>
                  <div className="mt-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Day-specific welcome signals</div>
                    {renderHelperList(accessRules, [CLUB_SCHEDULE_ACCESS_RULES], 'No access notes selected yet.')}
                  </div>
                  <div className="mt-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Community & Inclusion</div>
                    {renderHelperList(inclusionRules, [CLUB_SCHEDULE_INCLUSION_RULES], 'No inclusion notes selected yet.')}
                  </div>
                  <div className="mt-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Features / Amenities</div>
                    {renderHelperList(featureTags, [clubVibeTags, clubAmenityTags], 'No features selected yet.')}
                  </div>
                </>
              )}
            </div>
          )}

          {kind && step === 3 && (
            <div>
              <h3 className="text-lg font-semibold text-white">Before submitting</h3>
              {kind === 'event' && (
                <p className="mb-4 text-sm leading-6 text-gray-300">
                  Review the event details, time, location visibility, and contact information before submitting.
                </p>
              )}
              <div className="mt-4 space-y-2">
                {checklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className={['h-2.5 w-2.5 rounded-full', item.done ? 'bg-emerald-300' : 'bg-white/20'].join(' ')} />
                    {item.label}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-gray-300">
                Images are optional. Avoid explicit or copyrighted images unless you have permission to use them.
              </p>
            </div>
          )}
        </div>
      </aside>
    );
  };

  const stepContent = () => {
    if (!kind) return renderTypeChoice();
    if (isPublicSubmission) {
      switch (step) {
        case 0: return renderBasicInfo();
        case 1: return renderAddress('Location', undefined);
        case 2: return renderScheduleFeatures();
        case 3: return renderPhotosReview();
        default: return renderPhotosReview();
      }
    }
    switch (step) {
      case 0: return renderIdentity();
      case 1: return renderAddress();
      case 2: return renderDetails();
      case 3: return renderSchedule();
      case 4: return renderTags();
      case 5: return renderImages();
      case 6: return renderReview();
      default: return renderReview();
    }
  };

  const headerLabel = isEditing
    ? `Edit ${kind === 'club' ? 'Club' : 'Event'}`
    : isPublicSubmission
      ? kind === 'club'
        ? 'Create a Club Listing'
        : kind === 'event'
          ? 'Create an Event Listing'
          : 'Create a Listing'
    : kind
      ? `Create ${kind === 'club' ? 'Club' : 'Event'}`
      : 'Create Listing';

  return (
    <div className={isMobilePresentation ? 'text-white' : 'ss-submission-page ss-bg-geometric-muted min-h-screen px-4 py-6 text-white md:px-8'}>
      <div className={[
        'mx-auto flex w-full flex-col',
        isMobilePresentation ? 'gap-3' : 'gap-6',
        isPublicSubmission ? 'max-w-7xl' : 'max-w-5xl',
      ].join(' ')}>
        <div className={isMobilePresentation ? 'relative overflow-hidden rounded-[26px] border border-white/[0.09] bg-white/[0.045] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.20)] backdrop-blur-xl' : 'ss-glass ss-glass--liquid ss-glass--crimson rounded-[2rem] p-6'}>
          {isMobilePresentation ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_4%,rgba(239,68,68,0.20),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.008))]" />
              <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-red-500/[0.06] blur-3xl" />
            </>
          ) : null}
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              {!isPublicSubmission && (
                <div className="text-xs font-semibold uppercase tracking-[0.34em] text-red-300/80">Listing editor</div>
              )}
              {isMobilePresentation && isPublicSubmission ? (
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-200/80">Community submission</div>
              ) : null}
              <h1 className={isMobilePresentation ? 'mt-2 text-[28px] font-semibold leading-[1.02] tracking-[-0.035em] text-white' : 'mt-2 text-3xl font-semibold text-white md:text-4xl'}>{headerLabel}</h1>
              <p className={isMobilePresentation ? 'mt-2 w-full text-[12px] leading-5 text-gray-300/85' : 'mt-2 max-w-2xl text-sm text-gray-300'}>
                {mode === 'public'
                  ? kind === 'club'
                    ? 'Help people discover this club on SwingSphere. Submissions are reviewed before going live.'
                    : kind === 'event'
                      ? 'Help people discover this event on SwingSphere. Submissions are reviewed before going live.'
                      : 'Help people discover clubs and events on SwingSphere. Submissions are reviewed before going live.'
                  : 'Create or update a live listing using the same persisted workflow.'}
              </p>
            </div>
            <div className={isMobilePresentation ? 'rounded-2xl border border-white/[0.08] bg-black/25 px-3 py-2 text-[11px] text-gray-400 backdrop-blur-md' : 'rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-gray-300'}>
              <div className="font-semibold text-white">{currentStepLabel}</div>
              <div className="mt-1">{kind ? `Step ${step + 1} of ${totalSteps}` : 'Pick the one that fits best'}</div>
            </div>
          </div>
          {kind && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-gray-400">
                <span>{activeSteps[Math.min(step, activeSteps.length - 1)].label}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-300 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className={isPublicSubmission ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6' : ''}>
          <div className="min-w-0 space-y-6">
            {isLoadingMeta && !listingToEdit ? (
              <div className="ss-glass ss-glass--ambient rounded-3xl p-8 text-sm text-gray-300">
                Loading editor context...
              </div>
            ) : (
              <div className="space-y-6">
                {errors.type && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">{errors.type}</div>}
                {stepContent()}
              </div>
            )}

            {(!isMobilePresentation || kind || resumableDraft) ? (
              <div className={isMobilePresentation ? 'sticky bottom-0 z-20 flex flex-col gap-3 rounded-[22px] border border-white/[0.08] bg-[#0b0d12]/95 p-3 shadow-[0_-12px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl' : 'ss-glass ss-glass--liquid flex flex-col gap-3 rounded-3xl p-4 md:flex-row md:items-center md:justify-between'}>
                {isMobilePresentation && !kind && resumableDraft ? (
                  <>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-200/75">Saved draft</div>
                      <div className="mt-1 text-sm font-semibold text-white">{resumableDraft.name}</div>
                      <div className="mt-0.5 text-[11px] text-gray-500">Continue your {resumableDraft.kind} listing where you left off.</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" type="button" onClick={discardResumableDraft}>Discard</Button>
                      <Button type="button" onClick={resumeDraft}>Resume draft</Button>
                    </div>
                  </>
                ) : (
                  <>
                    {(listingToEdit || kind) ? (
                      <div className="text-sm text-gray-400">
                        {listingToEdit ? 'Changes save directly to the dev-local persistence file.' : 'Draft saved automatically.'}
                      </div>
                    ) : null}
                    <div className={isMobilePresentation ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-3'}>
                      <Button variant="secondary" type="button" onClick={handleBack} disabled={isSaving}>
                        Back
                      </Button>
                      {kind && step < totalSteps - 1 ? (
                        <Button type="button" onClick={() => void handleNext()} disabled={isSaving}>
                          Next
                        </Button>
                      ) : kind ? (
                        <Button type="button" onClick={() => void saveListing()} disabled={isSaving}>
                          {isSaving ? 'Saving...' : isEditing ? 'Update listing' : mode === 'public' ? 'Submit for review' : 'Save listing'}
                        </Button>
                      ) : (
                        <Button type="button" onClick={handleBack}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {isPublicSubmission && !isMobilePresentation && renderPublicHelperPanel()}
        </div>
      </div>
    </div>
  );
};

export default ListingEditor;
