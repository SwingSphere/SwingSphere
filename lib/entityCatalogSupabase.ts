import type {
  ClubBrandData,
  CruiseSailingData,
  CruiseSeriesData,
  EventSeriesData,
  OrganizationData,
  OrganizationRelationship,
  OrganizationVenueRelationship,
  ResortData,
  VenueData,
} from '../types';
import { supabase } from './supabase';

const requireData = <T,>(data: T | null, error: unknown): T => {
  if (error) throw error;
  if (data === null) throw new Error('Supabase did not return the saved entity.');
  return data;
};

const currentUserId = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
};

const mapOrganization = (row: any): OrganizationData => ({
  id: row.id,
  type: 'organization',
  name: row.name,
  slug: row.slug,
  displayTypes: row.display_types ?? [],
  descriptionShort: row.description_short ?? undefined,
  descriptionFull: row.description_full ?? undefined,
  website: row.website ?? undefined,
  instagram: row.instagram ?? undefined,
  fetlife: row.fetlife ?? undefined,
  contactEmail: row.contact_email ?? undefined,
  logoImageUrl: row.logo_image_url ?? undefined,
  headerImageUrl: row.header_image_url ?? undefined,
  galleryImageUrls: row.gallery_image_urls ?? [],
  operatingRegions: row.operating_regions ?? [],
  globePresence: row.globe_presence ?? undefined,
  standards: row.standards ?? [],
  status: row.status,
  postedByUserId: row.created_by ?? undefined,
  createdAt: row.created_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
});

const mapVenue = (row: any): VenueData => ({
  id: row.id,
  type: 'venue',
  name: row.name,
  slug: row.slug,
  description: row.description ?? undefined,
  address: row.address ?? {},
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  locationMeta: row.location_meta ?? undefined,
  visibility: row.visibility,
  status: row.status,
  amenities: row.amenities ?? [],
  parkingNotes: row.parking_notes ?? undefined,
  accessibilityNotes: row.accessibility_notes ?? undefined,
  logoImageUrl: row.logo_image_url ?? undefined,
  headerImageUrl: row.header_image_url ?? undefined,
  galleryImageUrls: row.gallery_image_urls ?? [],
  buildingAssetId: row.building_asset_id ?? undefined,
  createdAt: row.created_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
});

const mapRelationship = (row: any): OrganizationVenueRelationship => ({
  id: row.id,
  organizationId: row.organization_id,
  venueId: row.venue_id,
  relationshipType: row.relationship_type,
  label: row.label ?? undefined,
  startsAt: row.starts_at ?? undefined,
  endsAt: row.ends_at ?? undefined,
  isPrimary: Boolean(row.is_primary),
  confidence: row.confidence === null || row.confidence === undefined ? undefined : Number(row.confidence),
  notes: row.notes ?? undefined,
});

const mapOrganizationRelationship = (row: any): OrganizationRelationship => ({
  id: row.id,
  sourceOrganizationId: row.source_organization_id,
  targetOrganizationId: row.target_organization_id,
  relationshipType: row.relationship_type,
  label: row.label ?? undefined,
  startsAt: row.starts_at ?? undefined,
  endsAt: row.ends_at ?? undefined,
  isPrimary: Boolean(row.is_primary),
  notes: row.notes ?? undefined,
  createdAt: row.created_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
});

const mapEventSeries = (row: any): EventSeriesData => ({
  id: row.id,
  type: 'event_series',
  name: row.name,
  slug: row.slug,
  organizerOrganizationId: row.organizer_organization_id ?? undefined,
  descriptionShort: row.description_short ?? undefined,
  descriptionFull: row.description_full ?? undefined,
  logoImageUrl: row.logo_image_url ?? undefined,
  headerImageUrl: row.header_image_url ?? undefined,
  defaultVenueId: row.default_venue_id ?? undefined,
  defaultTags: row.default_tags ?? [],
  status: row.status,
  postedByUserId: row.posted_by_user_id ?? undefined,
  createdAt: row.created_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
});

const mapClubBrand = (row: any): ClubBrandData => ({
  id: row.id,
  type: 'club_brand',
  name: row.name,
  slug: row.slug,
  operatorOrganizationId: row.operator_organization_id ?? undefined,
  descriptionShort: row.description_short ?? undefined,
  descriptionFull: row.description_full ?? undefined,
  logoImageUrl: row.logo_image_url ?? undefined,
  headerImageUrl: row.header_image_url ?? undefined,
  defaultAmenities: row.default_amenities ?? [],
  status: row.status,
  createdAt: row.created_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
});

const mapResort = (row: any): ResortData => ({
  id: row.id,
  type: 'resort',
  name: row.name,
  slug: row.slug,
  operatorOrganizationId: row.operator_organization_id ?? undefined,
  descriptionShort: row.description_short ?? '',
  descriptionFull: row.description_full ?? '',
  geopoint: row.geopoint ?? { latitude: 0, longitude: 0, address: {} },
  locationVisibility: row.location_visibility ?? undefined,
  resortStyle: row.resort_style,
  audienceLabel: row.audience_label ?? '',
  accommodationSummary: row.accommodation_summary ?? '',
  stayLengthSummary: row.stay_length_summary ?? undefined,
  bookingUrl: row.booking_url ?? undefined,
  contactEmail: row.contact_email ?? undefined,
  amenities: row.amenities ?? [],
  experienceHighlights: row.experience_highlights ?? [],
  accessNotes: row.access_notes ?? [],
  transportationNotes: row.transportation_notes ?? [],
  logoImageUrl: row.logo_image_url ?? undefined,
  headerImageUrl: row.header_image_url ?? undefined,
  galleryImageUrls: row.gallery_image_urls ?? [],
  status: row.status,
});

const mapCruiseSeries = (row: any): CruiseSeriesData => ({
  id: row.id,
  type: 'cruise_series',
  name: row.name,
  slug: row.slug,
  operatorOrganizationId: row.operator_organization_id ?? undefined,
  descriptionShort: row.description_short ?? '',
  descriptionFull: row.description_full ?? '',
  audienceLabel: row.audience_label ?? '',
  experienceHighlights: row.experience_highlights ?? [],
  logoImageUrl: row.logo_image_url ?? undefined,
  headerImageUrl: row.header_image_url ?? undefined,
  galleryImageUrls: row.gallery_image_urls ?? [],
  status: row.status,
});

const mapCruiseSailing = (row: any): CruiseSailingData => ({
  id: row.id,
  type: 'cruise_sailing',
  cruiseSeriesId: row.cruise_series_id,
  name: row.name,
  slug: row.slug,
  shipName: row.ship_name,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  departurePort: row.departure_port ?? {},
  itinerary: row.itinerary ?? [],
  durationNights: Number(row.duration_nights),
  bookingUrl: row.booking_url ?? undefined,
  bookingStatus: row.booking_status ?? undefined,
  cabinSummary: row.cabin_summary ?? undefined,
  pricingSummary: row.pricing_summary ?? undefined,
  theme: row.theme ?? undefined,
  headerImageUrl: row.header_image_url ?? undefined,
  status: row.status,
});

export const getOrganizations = async (): Promise<OrganizationData[]> => {
  const { data, error } = await supabase.from('organizations').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapOrganization);
};

export const saveOrganization = async (organization: OrganizationData): Promise<OrganizationData> => {
  const actorId = organization.postedByUserId || await currentUserId();
  const entityId = organization.id || `org-${organization.slug || 'organization'}-${Date.now()}`;
  const { data, error } = await supabase.from('organizations').upsert({
    id: entityId,
    name: organization.name,
    slug: organization.slug,
    display_types: organization.displayTypes,
    description_short: organization.descriptionShort ?? null,
    description_full: organization.descriptionFull ?? null,
    website: organization.website ?? null,
    instagram: organization.instagram ?? null,
    fetlife: organization.fetlife ?? null,
    contact_email: organization.contactEmail ?? null,
    logo_image_url: organization.logoImageUrl ?? null,
    header_image_url: organization.headerImageUrl ?? null,
    gallery_image_urls: organization.galleryImageUrls ?? [],
    operating_regions: organization.operatingRegions ?? [],
    globe_presence: organization.globePresence ?? null,
    standards: organization.standards ?? [],
    status: organization.status,
    created_by: actorId,
  }).select('*').single();
  return mapOrganization(requireData(data, error));
};

export const deleteOrganization = async (organizationId: string): Promise<void> => {
  const { error } = await supabase.from('organizations').delete().eq('id', organizationId);
  if (error) throw error;
};

export const getVenues = async (): Promise<VenueData[]> => {
  const { data, error } = await supabase.from('venues').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapVenue);
};

export const saveVenue = async (venue: VenueData): Promise<VenueData> => {
  const actorId = await currentUserId();
  const entityId = venue.id || `venue-${venue.slug || 'venue'}-${Date.now()}`;
  const { data, error } = await supabase.from('venues').upsert({
    id: entityId,
    name: venue.name,
    slug: venue.slug,
    description: venue.description ?? null,
    address: venue.address ?? {},
    latitude: venue.latitude,
    longitude: venue.longitude,
    location_meta: venue.locationMeta ?? null,
    visibility: venue.visibility,
    status: venue.status,
    amenities: venue.amenities ?? [],
    parking_notes: venue.parkingNotes ?? null,
    accessibility_notes: venue.accessibilityNotes ?? null,
    logo_image_url: venue.logoImageUrl ?? null,
    header_image_url: venue.headerImageUrl ?? null,
    gallery_image_urls: venue.galleryImageUrls ?? [],
    building_asset_id: venue.buildingAssetId ?? null,
    created_by: actorId,
  }).select('*').single();
  return mapVenue(requireData(data, error));
};

export const deleteVenue = async (venueId: string): Promise<void> => {
  const { error } = await supabase.from('venues').delete().eq('id', venueId);
  if (error) throw error;
};

export const getOrganizationVenueRelationships = async (): Promise<OrganizationVenueRelationship[]> => {
  const { data, error } = await supabase.from('organization_venue_relationships').select('*').order('organization_id');
  if (error) throw error;
  return (data ?? []).map(mapRelationship);
};

export const saveOrganizationVenueRelationship = async (
  relationship: OrganizationVenueRelationship,
): Promise<OrganizationVenueRelationship> => {
  const relationshipId = relationship.id || `rel-${relationship.organizationId}-${relationship.venueId}-${Date.now()}`;
  const { data, error } = await supabase.from('organization_venue_relationships').upsert({
    id: relationshipId,
    organization_id: relationship.organizationId,
    venue_id: relationship.venueId,
    relationship_type: relationship.relationshipType,
    label: relationship.label ?? null,
    starts_at: relationship.startsAt ?? null,
    ends_at: relationship.endsAt ?? null,
    is_primary: relationship.isPrimary ?? false,
    confidence: relationship.confidence ?? null,
    notes: relationship.notes ?? null,
  }).select('*').single();
  return mapRelationship(requireData(data, error));
};

export const getOrganizationRelationships = async (): Promise<OrganizationRelationship[]> => {
  const { data, error } = await supabase.from('organization_relationships').select('*').order('source_organization_id');
  if (error) throw error;
  return (data ?? []).map(mapOrganizationRelationship);
};

export const saveOrganizationRelationship = async (
  relationship: OrganizationRelationship,
): Promise<OrganizationRelationship> => {
  const { data, error } = await supabase.rpc('admin_save_organization_relationship', {
    p_payload: {
      id: relationship.id || undefined,
      sourceOrganizationId: relationship.sourceOrganizationId,
      targetOrganizationId: relationship.targetOrganizationId,
      relationshipType: relationship.relationshipType,
      label: relationship.label,
      startsAt: relationship.startsAt,
      endsAt: relationship.endsAt,
      isPrimary: relationship.isPrimary ?? false,
      notes: relationship.notes,
    },
  });
  if (error) throw error;
  return mapOrganizationRelationship(requireData(data as any, error));
};

export const deleteOrganizationRelationship = async (
  relationshipId: string,
  reason: string,
): Promise<void> => {
  const { error } = await supabase.rpc('admin_delete_organization_relationship', {
    p_relationship_id: relationshipId,
    p_reason: reason,
  });
  if (error) throw error;
};

export const getEventSeries = async (): Promise<EventSeriesData[]> => {
  const { data, error } = await supabase.from('event_series').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapEventSeries);
};

export const saveEventSeries = async (series: EventSeriesData): Promise<EventSeriesData> => {
  const actorId = series.postedByUserId || await currentUserId();
  const { data, error } = await supabase.from('event_series').upsert({
    id: series.id,
    name: series.name,
    slug: series.slug,
    organizer_organization_id: series.organizerOrganizationId ?? null,
    description_short: series.descriptionShort ?? null,
    description_full: series.descriptionFull ?? null,
    logo_image_url: series.logoImageUrl ?? null,
    header_image_url: series.headerImageUrl ?? null,
    default_venue_id: series.defaultVenueId ?? null,
    default_tags: series.defaultTags ?? [],
    status: series.status,
    posted_by_user_id: actorId,
  }).select('*').single();
  return mapEventSeries(requireData(data, error));
};

export const getClubBrands = async (): Promise<ClubBrandData[]> => {
  const { data, error } = await supabase.from('club_brands').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapClubBrand);
};

export const saveClubBrand = async (brand: ClubBrandData): Promise<ClubBrandData> => {
  const actorId = await currentUserId();
  const { data, error } = await supabase.from('club_brands').upsert({
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    operator_organization_id: brand.operatorOrganizationId ?? null,
    description_short: brand.descriptionShort ?? null,
    description_full: brand.descriptionFull ?? null,
    logo_image_url: brand.logoImageUrl ?? null,
    header_image_url: brand.headerImageUrl ?? null,
    default_amenities: brand.defaultAmenities ?? [],
    status: brand.status,
    created_by: actorId,
  }).select('*').single();
  return mapClubBrand(requireData(data, error));
};

export const getResorts = async (): Promise<ResortData[]> => {
  const { data, error } = await supabase.from('resorts').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapResort);
};

export const saveResort = async (resort: ResortData): Promise<ResortData> => {
  const actorId = await currentUserId();
  const { data, error } = await supabase.from('resorts').upsert({
    id: resort.id,
    slug: resort.slug,
    name: resort.name,
    operator_organization_id: resort.operatorOrganizationId ?? null,
    description_short: resort.descriptionShort,
    description_full: resort.descriptionFull,
    geopoint: resort.geopoint,
    location_visibility: resort.locationVisibility ?? null,
    resort_style: resort.resortStyle,
    audience_label: resort.audienceLabel,
    accommodation_summary: resort.accommodationSummary,
    stay_length_summary: resort.stayLengthSummary ?? null,
    booking_url: resort.bookingUrl ?? null,
    contact_email: resort.contactEmail ?? null,
    amenities: resort.amenities ?? [],
    experience_highlights: resort.experienceHighlights ?? [],
    access_notes: resort.accessNotes ?? [],
    transportation_notes: resort.transportationNotes ?? [],
    logo_image_url: resort.logoImageUrl ?? null,
    header_image_url: resort.headerImageUrl ?? null,
    gallery_image_urls: resort.galleryImageUrls ?? [],
    status: resort.status,
    created_by: actorId,
  }).select('*').single();
  return mapResort(requireData(data, error));
};

export const getCruiseSeries = async (): Promise<CruiseSeriesData[]> => {
  const { data, error } = await supabase.from('cruise_series').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapCruiseSeries);
};

export const saveCruiseSeries = async (series: CruiseSeriesData): Promise<CruiseSeriesData> => {
  const actorId = await currentUserId();
  const { data, error } = await supabase.from('cruise_series').upsert({
    id: series.id,
    slug: series.slug,
    name: series.name,
    operator_organization_id: series.operatorOrganizationId ?? null,
    description_short: series.descriptionShort,
    description_full: series.descriptionFull,
    audience_label: series.audienceLabel,
    experience_highlights: series.experienceHighlights ?? [],
    logo_image_url: series.logoImageUrl ?? null,
    header_image_url: series.headerImageUrl ?? null,
    gallery_image_urls: series.galleryImageUrls ?? [],
    status: series.status,
    created_by: actorId,
  }).select('*').single();
  return mapCruiseSeries(requireData(data, error));
};

export const getCruiseSailings = async (): Promise<CruiseSailingData[]> => {
  const { data, error } = await supabase.from('cruise_sailings').select('*').order('starts_at');
  if (error) throw error;
  return (data ?? []).map(mapCruiseSailing);
};

export const saveCruiseSailing = async (sailing: CruiseSailingData): Promise<CruiseSailingData> => {
  const actorId = await currentUserId();
  const { data, error } = await supabase.from('cruise_sailings').upsert({
    id: sailing.id,
    cruise_series_id: sailing.cruiseSeriesId,
    slug: sailing.slug,
    name: sailing.name,
    ship_name: sailing.shipName,
    starts_at: sailing.startsAt,
    ends_at: sailing.endsAt,
    departure_port: sailing.departurePort,
    itinerary: sailing.itinerary ?? [],
    duration_nights: sailing.durationNights,
    booking_url: sailing.bookingUrl ?? null,
    booking_status: sailing.bookingStatus ?? null,
    cabin_summary: sailing.cabinSummary ?? null,
    pricing_summary: sailing.pricingSummary ?? null,
    theme: sailing.theme ?? null,
    header_image_url: sailing.headerImageUrl ?? null,
    status: sailing.status,
    created_by: actorId,
  }).select('*').single();
  return mapCruiseSailing(requireData(data, error));
};
