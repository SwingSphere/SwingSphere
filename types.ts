export interface Geopoint {
  latitude: number;
  longitude: number;
  address: {
    addressLine1?: string;
    addressLine2?: string;
    city: string;
    region: string;
    postalCode?: string;
    country: string;
    countrySlug?: string;
    admin1Slug?: string;
    citySlug?: string;
    isCityState?: boolean;
  };
}

export interface DaySchedule {
  day: string;
  isClosed: boolean;
  open?: string;
  close?: string;
  rules?: string[];
}

export type AttendancePolicy =
  | 'mixed_open'
  | 'couples_focused'
  | 'couples_only'
  | 'couples_and_single_women'
  | 'couples_and_select_single_men'
  | 'women_only'
  | 'men_only'
  | 'lgbtq_centered'
  | 'varies_by_night'
  | 'open_to_approved_guests'
  | 'all_genders_welcome'
  | 'members_only'
  | 'invite_only'
  | 'application_required'
  | 'varies_by_event';

export type EntryRequirement =
  | 'screening_approval_required'
  | 'members_only'
  | 'invite_only';

export type LocationValidationStatus =
  | 'unvalidated'
  | 'validating'
  | 'validated'
  | 'needs_review'
  | 'manual';

export type BuildingVerificationStatus =
  | 'confirmed'
  | 'probable'
  | 'unconfirmed'
  | 'mismatch'
  | 'skipped';

export interface BuildingVerificationMeta {
  status: BuildingVerificationStatus;
  checkedAt: string;
  confidence: number;
  listingAddress?: string;
  candidateAddress?: string;
  candidateSecondary?: string;
  distanceMeters?: number;
  pinIntersects?: boolean;
  searchRadiusMeters?: number;
  providerFeatureIds?: string[];
  footprintFingerprint?: string;
  method?: 'exact_address_and_pin' | 'authoritative_unique_pin' | 'human_review';
  outcome?:
    | 'verified'
    | 'probable'
    | 'ambiguous'
    | 'address_mismatch'
    | 'pin_mismatch'
    | 'no_building_data'
    | 'needs_location_review'
    | 'private_or_approximate_skipped'
    | 'has_verified_asset';
  scoreGap?: number;
  notes?: string[];
}

export interface ListingLocationMeta {
  status: LocationValidationStatus;
  coordinatePrecision?: 'address' | 'building' | 'poi' | 'street' | 'locality' | 'unknown';
  validatedAt?: string;
  geocoderSource?: string;
  /** Legacy provenance field used by older curated location records. New writes should use geocoderSource. */
  source?: string;
  geocoderLabel?: string;
  confidence?: number;
  normalizedAddress?: string;
  warnings?: string[];
  manualAdjustment?: boolean;
  placeId?: string;
  buildingVerification?: BuildingVerificationMeta;
}

export type EntityStatus =
  | 'draft'
  | 'pending_review'
  | 'pending_approval'
  | 'approved'
  | 'flagged'
  | 'active'
  | 'private'
  | 'inactive'
  | 'closed'
  | 'archived';

export type VenueVisibility =
  | 'public_exact'
  | 'public_approximate'
  | 'private'
  | 'admin_only';

export type OrganizationDisplayType =
  | 'club'
  | 'host'
  | 'promoter'
  | 'event_brand'
  | 'community'
  | 'producer';

export type OrganizationVenueRelationshipType =
  | 'owner_operator'
  | 'primary_home'
  | 'resident'
  | 'recurring_guest'
  | 'monthly_guest'
  | 'annual_guest'
  | 'one_time_guest'
  | 'former_home'
  | 'historical'
  | 'unknown';

export interface VenueData {
  id: string;
  type: 'venue';
  name: string;
  slug: string;
  description?: string;
  address: Geopoint['address'];
  latitude: number;
  longitude: number;
  locationMeta?: ListingLocationMeta;
  visibility: VenueVisibility;
  status: EntityStatus;
  amenities: string[];
  parkingNotes?: string;
  accessibilityNotes?: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  mediaAssets?: import('./lib/media/types').MediaAsset[];
  buildingAssetId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type OrganizationGlobeRegion = {
  id: string;
  label: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  status?: 'recurring' | 'upcoming' | 'seasonal' | 'inactive';
};

export type OrganizationGlobePresence = {
  visibility: 'visible' | 'represented_by_club' | 'hidden';
  regions: OrganizationGlobeRegion[];
};

export interface OrganizationData {
  id: string;
  type: 'organization';
  name: string;
  slug: string;
  displayTypes: OrganizationDisplayType[];
  descriptionShort?: string;
  descriptionFull?: string;
  website?: string;
  instagram?: string;
  fetlife?: string;
  contactEmail?: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  operatingRegions?: string[];
  globePresence?: OrganizationGlobePresence;
  standards?: string[];
  mediaAssets?: import('./lib/media/types').MediaAsset[];
  status: EntityStatus;
  postedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type OrganizationMemberRole = 'owner' | 'manager' | 'editor';
export type OrganizationMemberStatus = 'invited' | 'active' | 'suspended';

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  invitedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationVenueRelationship {
  id: string;
  organizationId: string;
  venueId: string;
  relationshipType: OrganizationVenueRelationshipType;
  label?: string;
  startsAt?: string;
  endsAt?: string;
  isPrimary?: boolean;
  confidence?: number;
  notes?: string;
}

export type OrganizationRelationshipType =
  | 'operates'
  | 'produces'
  | 'owns'
  | 'parent_brand'
  | 'co_promotes'
  | 'ticketing_provider'
  | 'partner'
  | 'affiliate';

export interface OrganizationRelationship {
  id: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  relationshipType: OrganizationRelationshipType;
  label?: string;
  startsAt?: string;
  endsAt?: string;
  isPrimary?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventSeriesData {
  id: string;
  type: 'event_series';
  name: string;
  slug: string;
  organizerOrganizationId?: string;
  descriptionShort?: string;
  descriptionFull?: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  mediaAssets?: import('./lib/media/types').MediaAsset[];
  defaultVenueId?: string;
  defaultTags?: string[];
  status: EntityStatus;
  postedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResortData {
  id: string;
  type: 'resort';
  name: string;
  slug: string;
  operatorOrganizationId?: string;
  descriptionShort: string;
  descriptionFull: string;
  geopoint: Geopoint;
  locationVisibility?: 'exact_public' | 'approximate_public';
  resortStyle: 'destination_resort' | 'hotel' | 'retreat' | 'campground' | 'villa_collection';
  audienceLabel: string;
  accommodationSummary: string;
  stayLengthSummary?: string;
  bookingUrl?: string;
  contactEmail?: string;
  amenities: string[];
  experienceHighlights: string[];
  accessNotes?: string[];
  transportationNotes?: string[];
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  mediaAssets?: import('./lib/media/types').MediaAsset[];
  status: EntityStatus;
}

export interface CruisePortCall {
  id: string;
  portName: string;
  city?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  arrivesAt?: string;
  departsAt?: string;
  isEmbarkation?: boolean;
  isDisembarkation?: boolean;
}

export interface CruiseSeriesData {
  id: string;
  type: 'cruise_series';
  name: string;
  slug: string;
  operatorOrganizationId?: string;
  descriptionShort: string;
  descriptionFull: string;
  audienceLabel: string;
  experienceHighlights: string[];
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  mediaAssets?: import('./lib/media/types').MediaAsset[];
  status: EntityStatus;
}

export interface CruiseSailingData {
  id: string;
  type: 'cruise_sailing';
  cruiseSeriesId: string;
  name: string;
  slug: string;
  shipName: string;
  startsAt: string;
  endsAt: string;
  departurePort: CruisePortCall;
  itinerary: CruisePortCall[];
  durationNights: number;
  bookingUrl?: string;
  bookingStatus?: 'announced' | 'booking_open' | 'limited' | 'waitlist' | 'sold_out' | 'completed';
  cabinSummary?: string;
  pricingSummary?: string;
  theme?: string;
  headerImageUrl?: string;
  mediaAssets?: import('./lib/media/types').MediaAsset[];
  status: EntityStatus;
}

export type TravelEntity = ResortData | CruiseSeriesData | CruiseSailingData;

export interface ClubBrandData {
  id: string;
  type: 'club_brand';
  name: string;
  slug: string;
  operatorOrganizationId?: string;
  descriptionShort?: string;
  descriptionFull?: string;
  logoImageUrl?: string;
  headerImageUrl?: string;
  defaultAmenities?: string[];
  status: EntityStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClubData {
  id: string;
  type: 'club';
  name: string;
  clubBrandId?: string;
  ownerOrganizationId?: string;
  description_short: string;
  location: string;
  website?: string;
  contactEmail: string;
  // Future public map rendering:
  // exact_public -> exact pin/address
  // approximate_public -> ZIP/city/region + soft radius marker
  locationVisibility?: 'exact_public' | 'approximate_public';
  attendancePolicy?: AttendancePolicy;
  entryRequirements?: EntryRequirement[];
  geopoint: Geopoint;
  locationMeta?: ListingLocationMeta;
  schedule: DaySchedule[];
  specialScheduleNotes?: string;
  generalAmenities: string[];
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  mediaPresentation?: 'default' | 'monochrome';
  mediaAssets?: import('./lib/media/types').MediaAsset[];
  status: 'pending_approval' | 'approved' | 'flagged';
  postedByUserId: string;
  buildingAssetId?: string;
  primaryVenueId?: string;
  reviewScore?: { thumbsUp: number; thumbsDown: number; };
  mockXY?: { x: number; y: number; region: string[] };
}

export interface EventData {
  id: string;
  type: 'event';
  name: string;
  hostName: string;
  description_full: string;
  location: string;
  website?: string;
  contactEmail: string;
  isAddressPrivate?: boolean;
  attendancePolicy?: AttendancePolicy;
  entryRequirements?: EntryRequirement[];
  venueKey?: string;
  venueId?: string;
  organizerOrganizationId?: string;
  eventSeriesId?: string;
  occurrenceTitle?: string;
  time: {
    start: string;
    end: string;
  };
  geopoint: Geopoint;
  locationMeta?: ListingLocationMeta;
  tags: string[];
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  mediaAssets?: import('./lib/media/types').MediaAsset[];
  status: 'pending_approval' | 'approved' | 'flagged';
  postedByUserId: string;
  buildingAssetId?: string;
  reviewScore?: { thumbsUp: number; thumbsDown: number; };
  mockXY?: { x: number; y: number; region: string[] };
}

export type Listing = ClubData | EventData;

export interface BuildingAsset {
  id: string;
  listingId: string;
  venueId?: string;
  version: 1;
  provider: {
    source: string;
    featureIds: string[];
    origin?: 'provider' | 'generated' | 'manual';
    generationMethod?: string;
    generationConfidence?: number;
    provenanceNote?: string;
  };
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  renderHeightMeters?: number;
  renderMinHeightMeters?: number;
  capture: {
    createdAt: string;
    updatedAt: string;
    polygonCount: number;
    ringCount: number;
    vertexCount: number;
  };
}

export type FormData = Omit<Partial<ClubData>, 'type' | 'geopoint' | 'status'> & Omit<Partial<EventData>, 'type'| 'geopoint' | 'status'> & {
    type?: 'club' | 'event',
    geopoint?: Geopoint,
    headerImageFile?: File,
    galleryImageFiles?: FileList,
};

export type ISODateString = string;

export type TimeLens =
  | { mode: 'none' }
  | { mode: 'soon'; preset: 'today' | 'weekend' | '7d' | '30d' }
  | { mode: 'date'; date: ISODateString }
  | { mode: 'range'; start: ISODateString; end: ISODateString };


// --- PHASE 2 TYPES ---
import type { User as UserType } from './data/mockUsers';
export type { UserType as User };
import type { Tag as TagType, TagCategory as TagCategoryType } from './data/mockTags';
export type { TagType as Tag, TagCategoryType as TagCategory };
import type { AuditLogEntry as AuditLogEntryType } from './data/mockAuditLog';
export type { AuditLogEntryType as AuditLogEntry };
import type { FlaggedContent as FlaggedContentType } from './data/mockFlaggedContent';
export type { FlaggedContentType as FlaggedContent };

export type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

export type Review = {
  id: string;
  listingId: string;
  userId: string;
  userName: string;
  userHandle?: string;
  userAvatarUrl?: string;
  rating: 'up' | 'down';
  text: string;
  timestamp: string; // ISO string
};

export type AppState = {
  currentUser: UserType | null;
  isAuthLoading: boolean;
  tags: TagType[];
  tagCategories: TagCategoryType[];
  toasts: Toast[];
  debugInfo: { label: string; extra?: string };
  timeLens: TimeLens;
  setTimeLens: (lens: TimeLens) => void;
  clearTimeLens: () => void;
  setDebugInfo: (info: { label: string; extra?: string }, duration?: number) => void;
  login: (email: string, pass: string) => Promise<UserType | null>;
  logout: () => Promise<void>;
  signUp: (credentials: { displayName: string; email: string; password: string; accountIntent: 'explore' | 'promote' }) => Promise<UserType>;
  requestPasswordReset: (email: string) => Promise<void>;
  updateUserProfile: (userId: string, profileData: { displayName: string; email: string; handle: string; bio: string; avatarUrl?: string }) => Promise<UserType>;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: number) => void;
  fetchTags: () => Promise<void>;
};

export type DashboardStats = {
  totalUsers: number;
  totalClubs: number;
  totalEvents: number;
  totalFlagged: number;
  submissionsOverTime: { date: string; clubs: number; events: number; }[];
};
