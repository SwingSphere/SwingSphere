import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  FileWarning,
  Filter,
  FolderOpen,
  GitMerge,
  Grid,
  History,
  Image as ImageIcon,
  Info,
  Layers,
  Link2,
  Link2Off,
  List,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import * as api from '../../lib/api';
import { adminFetchJson } from '../../lib/adminApi';
import { supabase } from '../../lib/supabase';
import {
  appendConsolidationAuditEntry,
  applyAssetAssignmentToListing,
  buildCanonicalMediaCatalog,
  computeFileSha256Hex,
  evaluateAssetRoleQuality,
  formatRatioBadge,
  previewDuplicateConsolidation,
  readConsolidationAuditLog,
  removeEventLogoOverrideFromListing,
  saveStoredUploadMetadata,
  validateExternalImageUrl,
  type AssetStatusBadge,
  type CanonicalAssetCategory,
  type CanonicalAssetUsage,
  type CanonicalEntityType,
  type CanonicalMediaAsset,
  type ConsolidationAuditEntry,
  type ConsolidationPreview,
  type DuplicateCandidateKind,
  type DuplicateReviewGroup,
  type MissingMediaAssignmentSlot,
} from '../../lib/media/canonicalAssetModel';
import {
  resolveEventLogoState,
  type BrandMediaCatalog,
} from '../../lib/entityBrandMedia';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { ALLOWED_MEDIA_MIME_TYPES, formatMaxUploadSize, getMediaRule } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaOwnerType, MediaRole } from '../../lib/media/types';
import MediaLibraryPickerModal from '../media/MediaLibraryPickerModal';
import type {
  ClubBrandData,
  ClubData,
  CruiseSailingData,
  CruiseSeriesData,
  EventData,
  EventSeriesData,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  ResortData,
  User,
  VenueData,
} from '../../types';

type WorkspaceTab = 'browser' | 'duplicates' | 'inheritance';
type ViewMode = 'grid' | 'list';
type UsageFilter =
  | 'all'
  | 'linked'
  | 'unlinked'
  | 'multi_ref'
  | 'inherited'
  | 'redundant_copies'
  | 'duplicates'
  | 'external_url'
  | 'broken_or_invalid'
  | 'recent';
type SortMode = 'most_referenced' | 'recent' | 'alphabetical' | 'attention';

type ImageMetric = {
  width: number;
  height: number;
  broken?: boolean;
};

const CATEGORY_TABS: Array<{ id: CanonicalAssetCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'logo', label: 'Logos' },
  { id: 'hero', label: 'Heroes' },
  { id: 'flyer', label: 'Flyers' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'other', label: 'Other' },
];

const ENTITY_TYPE_LABELS: Record<CanonicalEntityType, string> = {
  club: 'Club',
  event: 'Event',
  organization: 'Host / Org',
  venue: 'Venue',
  resort: 'Resort',
  cruise_series: 'Cruise Series',
  cruise_sailing: 'Cruise Sailing',
  event_series: 'Event Series',
  club_brand: 'Club Brand',
  user: 'User Profile',
};

const DUPLICATE_KIND_LABELS: Record<DuplicateCandidateKind, string> = {
  exact_byte_duplicates: 'Exact Byte Duplicates',
  duplicate_db_records: 'Same-File DB Records & Inherited Copies',
  repeated_storage_urls: 'Shared / Repeated URLs',
  visual_similarity_candidates: 'Visual / Revision Candidates',
  unused_or_orphaned: 'Unused / Orphaned Assets',
};

const BADGE_TONES: Record<AssetStatusBadge, string> = {
  Linked: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200',
  Unlinked: 'border-amber-500/35 bg-amber-500/12 text-amber-200',
  Missing: 'border-red-500/40 bg-red-500/15 text-red-200',
  'Potential Duplicate': 'border-violet-500/40 bg-violet-500/15 text-violet-200',
  'Invalid URL': 'border-red-500/45 bg-red-500/15 text-red-200',
  'Broken Image': 'border-red-500/45 bg-red-500/20 text-red-100',
  'Referenced by Multiple Listings': 'border-sky-500/35 bg-sky-500/12 text-sky-200',
};

const formatBytes = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) return 'Managed variant';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatShortDate = (iso?: string | null): string => {
  if (!iso) return 'Catalog seed';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Catalog seed';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const DevImageLibraryPage: React.FC = () => {
  // Raw catalog state
  const [listings, setListings] = useState<Listing[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [relationships, setRelationships] = useState<OrganizationVenueRelationship[]>([]);
  const [eventSeries, setEventSeries] = useState<EventSeriesData[]>([]);
  const [clubBrands, setClubBrands] = useState<ClubBrandData[]>([]);
  const [resorts, setResorts] = useState<ResortData[]>([]);
  const [cruiseSeries, setCruiseSeries] = useState<CruiseSeriesData[]>([]);
  const [cruiseSailings, setCruiseSailings] = useState<CruiseSailingData[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [mediaAssetRows, setMediaAssetRows] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusBanner, setStatusBanner] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);

  // UI Workspace & Filter state
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('browser');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState<CanonicalAssetCategory>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<'all' | CanonicalEntityType>('all');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('most_referenced');
  const [searchQuery, setSearchQuery] = useState('');
  const [entityScopeFilter, setEntityScopeFilter] = useState<{ entityType: CanonicalEntityType; entityId: string; entityName: string } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = viewMode === 'grid' ? 24 : 36;

  // Image dimensions & broken state tracking
  const [metricsByCanonicalId, setMetricsByCanonicalId] = useState<Record<string, ImageMetric>>({});

  // Bounded Detail Drawer state
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string | null>(null);

  // Assignment form state inside Detail Drawer
  const [assignEntityType, setAssignEntityType] = useState<CanonicalEntityType>('event');
  const [assignEntityId, setAssignEntityId] = useState<string>('');
  const [assignRole, setAssignRole] = useState<'logo' | 'hero' | 'flyer' | 'gallery'>('flyer');
  const [assignEntitySearch, setAssignEntitySearch] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Upload & Quick-Replace Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTargetEntityType, setUploadTargetEntityType] = useState<CanonicalEntityType>('event');
  const [uploadTargetEntityId, setUploadTargetEntityId] = useState<string>('');
  const [uploadTargetRole, setUploadTargetRole] = useState<'logo' | 'hero' | 'flyer' | 'gallery'>('flyer');
  const [uploadQueuedFiles, setUploadQueuedFiles] = useState<
    Array<{
      file: File;
      previewUrl: string;
      sha256?: string;
      width?: number;
      height?: number;
      matchingExistingAsset?: CanonicalMediaAsset;
    }>
  >([]);
  const [uploadExternalUrlInput, setUploadExternalUrlInput] = useState('');
  const [isUploadingBatch, setIsUploadingBatch] = useState(false);
  const [uploadModalError, setUploadModalError] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Choose From Media Library Picker Modal (used from Missing Slots & Inheritance tab)
  const [pickerContext, setPickerContext] = useState<{
    entityType: CanonicalEntityType;
    entityId: string;
    entityName: string;
    role: 'logo' | 'hero' | 'flyer' | 'gallery';
  } | null>(null);

  // Duplicate Review & Consolidation state
  const [duplicateCategoryFilter, setDuplicateCategoryFilter] = useState<'all' | DuplicateCandidateKind>('all');
  const [selectedCanonicalByGroup, setSelectedCanonicalByGroup] = useState<Record<string, string>>({});
  const [consolidationPreview, setConsolidationPreview] = useState<ConsolidationPreview | null>(null);
  const [isConsolidating, setIsConsolidating] = useState(false);

  // Inheritance Inspector filter state
  const [inheritanceSearch, setInheritanceSearch] = useState('');
  const [inheritanceModeFilter, setInheritanceModeFilter] = useState<'all' | 'inherited_host' | 'explicit_override' | 'redundant_copy' | 'fallback'>('all');

  // Audit Trail Modal state
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<ConsolidationAuditEntry[]>(() => readConsolidationAuditLog());

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        listingsRes,
        orgsRes,
        venuesRes,
        relsRes,
        seriesRes,
        brandsRes,
        resortsRes,
        cruiseSeriesRes,
        cruiseSailingsRes,
        usersRes,
        mediaRowsRes,
      ] = await Promise.all([
        api.getListings().catch(() => []),
        api.getOrganizations().catch(() => []),
        api.getVenues().catch(() => []),
        api.getOrganizationVenueRelationships().catch(() => []),
        api.getEventSeries().catch(() => []),
        api.getClubBrands().catch(() => []),
        api.getResorts().catch(() => []),
        api.getCruiseSeries().catch(() => []),
        api.getCruiseSailings().catch(() => []),
        api.getUsers().catch(() => []),
        supabase
          .from('media_assets')
          .select('*')
          .neq('status', 'deleted')
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);

      setListings(listingsRes);
      setOrganizations(orgsRes);
      setVenues(venuesRes);
      setRelationships(relsRes);
      setEventSeries(seriesRes);
      setClubBrands(brandsRes);
      setResorts(resortsRes);
      setCruiseSeries(cruiseSeriesRes);
      setCruiseSailings(cruiseSailingsRes);
      setUsers(usersRes);
      setMediaAssetRows((mediaRowsRes.data as MediaAsset[] | null) ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const catalogResult = useMemo(
    () =>
      buildCanonicalMediaCatalog({
        listings,
        organizations,
        venues,
        relationships,
        eventSeries,
        clubBrands,
        resorts,
        cruiseSeries,
        cruiseSailings,
        users,
        mediaAssetRows,
      }),
    [
      clubBrands,
      cruiseSailings,
      cruiseSeries,
      eventSeries,
      listings,
      mediaAssetRows,
      organizations,
      relationships,
      resorts,
      users,
      venues,
    ],
  );

  const brandCatalog: BrandMediaCatalog = useMemo(
    () => ({
      listings,
      venues,
      organizations,
      relationships,
      eventSeries,
      clubBrands,
      resorts,
      cruiseSeries,
      cruiseSailings,
    }),
    [clubBrands, cruiseSailings, cruiseSeries, eventSeries, listings, organizations, relationships, resorts, venues],
  );

  // Enrich assets with live broken-image badges when detected
  const enrichedAssets = useMemo(() => {
    return catalogResult.assets.map((asset) => {
      const metric = metricsByCanonicalId[asset.canonicalId];
      if (!metric?.broken) return asset;
      const badges: AssetStatusBadge[] = asset.statusBadges.includes('Broken Image')
        ? asset.statusBadges
        : [...asset.statusBadges, 'Broken Image'];
      return {
        ...asset,
        statusBadges: badges,
      };
    });
  }, [catalogResult.assets, metricsByCanonicalId]);

  const categoryCounts = useMemo(() => {
    const counts: Record<CanonicalAssetCategory, number> = {
      all: enrichedAssets.length,
      logo: 0,
      hero: 0,
      flyer: 0,
      gallery: 0,
      other: 0,
    };
    for (const asset of enrichedAssets) {
      counts[asset.primaryCategory] = (counts[asset.primaryCategory] ?? 0) + 1;
    }
    return counts;
  }, [enrichedAssets]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = enrichedAssets.filter((asset) => {
      if (categoryFilter !== 'all') {
        const matchesCat =
          asset.primaryCategory === categoryFilter
          || (categoryFilter === 'hero' && (asset.roles.includes('hero') || asset.roles.includes('cover')))
          || asset.roles.includes(categoryFilter as MediaRole);
        if (!matchesCat) return false;
      }

      if (entityTypeFilter !== 'all') {
        if (!asset.usages.some((u) => u.entityType === entityTypeFilter)) return false;
      }

      if (entityScopeFilter) {
        if (!asset.usages.some((u) => u.entityType === entityScopeFilter.entityType && u.entityId === entityScopeFilter.entityId)) {
          return false;
        }
      }

      if (usageFilter === 'linked' && asset.activeReferenceCount === 0) return false;
      if (usageFilter === 'unlinked' && asset.activeReferenceCount > 0) return false;
      if (usageFilter === 'multi_ref' && asset.activeReferenceCount <= 1) return false;
      if (usageFilter === 'inherited' && asset.inheritedReferenceCount === 0) return false;
      if (usageFilter === 'redundant_copies' && asset.redundantCopyCount === 0) return false;
      if (usageFilter === 'duplicates' && !asset.statusBadges.includes('Potential Duplicate')) return false;
      if (usageFilter === 'external_url' && asset.storageProvider !== 'external_url') return false;
      if (
        usageFilter === 'broken_or_invalid'
        && !asset.statusBadges.includes('Broken Image')
        && !asset.statusBadges.includes('Invalid URL')
      ) {
        return false;
      }
      if (usageFilter === 'recent' && !asset.createdAt && !asset.updatedAt) return false;

      if (!q) return true;
      const haystack = [
        asset.title,
        asset.filename,
        asset.altText,
        asset.externalId ?? '',
        asset.canonicalId,
        asset.originalPreviewUrl,
        asset.storageLocationLabel,
        ...asset.usages.map((u) => `${u.entityName} ${u.entityId} ${u.role} ${u.inheritedFrom?.entityName ?? ''}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    list.sort((a, b) => {
      if (sortMode === 'alphabetical') {
        return a.title.localeCompare(b.title);
      }
      if (sortMode === 'recent') {
        const aTime = a.updatedAt || a.createdAt || '';
        const bTime = b.updatedAt || b.createdAt || '';
        if (aTime !== bTime) return bTime.localeCompare(aTime);
        return a.title.localeCompare(b.title);
      }
      if (sortMode === 'attention') {
        const aIssues =
          (a.statusBadges.includes('Broken Image') ? 4 : 0)
          + (a.statusBadges.includes('Invalid URL') ? 3 : 0)
          + (a.statusBadges.includes('Potential Duplicate') ? 2 : 0)
          + (a.statusBadges.includes('Unlinked') ? 1 : 0);
        const bIssues =
          (b.statusBadges.includes('Broken Image') ? 4 : 0)
          + (b.statusBadges.includes('Invalid URL') ? 3 : 0)
          + (b.statusBadges.includes('Potential Duplicate') ? 2 : 0)
          + (b.statusBadges.includes('Unlinked') ? 1 : 0);
        if (aIssues !== bIssues) return bIssues - aIssues;
      }
      // Default: most_referenced
      if (a.activeReferenceCount !== b.activeReferenceCount) {
        return b.activeReferenceCount - a.activeReferenceCount;
      }
      return a.title.localeCompare(b.title);
    });

    return list;
  }, [categoryFilter, enrichedAssets, entityScopeFilter, entityTypeFilter, searchQuery, sortMode, usageFilter]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, entityTypeFilter, usageFilter, sortMode, searchQuery, entityScopeFilter, viewMode]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedAssets = useMemo(
    () => filteredAssets.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredAssets, pageSize],
  );

  const selectedAsset = useMemo(
    () => enrichedAssets.find((a) => a.canonicalId === selectedCanonicalId) ?? null,
    [enrichedAssets, selectedCanonicalId],
  );

  // Selectable entities for assignment
  const assignableEntities = useMemo(() => {
    const q = assignEntitySearch.trim().toLowerCase();
    const items: Array<{ id: string; name: string; subtitle?: string }> = [];
    if (assignEntityType === 'event') {
      for (const ev of listings.filter((l): l is EventData => l.type === 'event')) {
        items.push({ id: ev.id, name: ev.name, subtitle: `${ev.hostName || 'Event'} · ${ev.location || ''}` });
      }
    } else if (assignEntityType === 'club') {
      for (const cl of listings.filter((l): l is ClubData => l.type === 'club')) {
        items.push({ id: cl.id, name: cl.name, subtitle: cl.location });
      }
    } else if (assignEntityType === 'organization') {
      for (const org of organizations) {
        items.push({ id: org.id, name: org.name, subtitle: org.displayTypes?.join(', ') });
      }
    } else if (assignEntityType === 'venue') {
      for (const v of venues) {
        items.push({ id: v.id, name: v.name, subtitle: v.address?.city });
      }
    } else if (assignEntityType === 'resort') {
      for (const r of resorts) {
        items.push({ id: r.id, name: r.name, subtitle: r.geopoint?.address?.country });
      }
    } else if (assignEntityType === 'cruise_series') {
      for (const cs of cruiseSeries) {
        items.push({ id: cs.id, name: cs.name });
      }
    } else if (assignEntityType === 'cruise_sailing') {
      for (const s of cruiseSailings) {
        items.push({ id: s.id, name: s.name, subtitle: s.shipName });
      }
    } else if (assignEntityType === 'event_series') {
      for (const es of eventSeries) {
        items.push({ id: es.id, name: es.name });
      }
    } else if (assignEntityType === 'club_brand') {
      for (const cb of clubBrands) {
        items.push({ id: cb.id, name: cb.name });
      }
    }
    const filtered = q
      ? items.filter((item) => `${item.name} ${item.id} ${item.subtitle ?? ''}`.toLowerCase().includes(q))
      : items;
    return filtered.slice(0, 100);
  }, [
    assignEntitySearch,
    assignEntityType,
    clubBrands,
    cruiseSailings,
    cruiseSeries,
    eventSeries,
    listings,
    organizations,
    resorts,
    venues,
  ]);

  useEffect(() => {
    if (assignableEntities.length > 0 && !assignableEntities.some((e) => e.id === assignEntityId)) {
      setAssignEntityId(assignableEntities[0].id);
    }
  }, [assignEntityId, assignableEntities]);

  // Assign an existing CanonicalMediaAsset to any entity & role without re-uploading
  const assignCanonicalAssetToEntity = useCallback(
    async (params: {
      asset: CanonicalMediaAsset;
      entityType: CanonicalEntityType;
      entityId: string;
      role: 'logo' | 'hero' | 'flyer' | 'gallery';
    }) => {
      const { asset, entityType, entityId, role } = params;
      setIsAssigning(true);
      setStatusBanner(null);
      try {
        const extId = asset.externalId;
        const resolvedUrl = extId
          ? getCloudflareImageUrl({
              externalId: extId,
              variant:
                role === 'logo'
                  ? 'logosquare'
                  : role === 'flyer'
                    ? 'flyervertical'
                    : role === 'gallery'
                      ? 'galleryfull'
                      : 'herowide',
            }) ?? asset.originalPreviewUrl
          : asset.originalPreviewUrl;

        if (entityType === 'club' || entityType === 'event') {
          const targetListing = listings.find((l) => l.type === entityType && l.id === entityId);
          if (!targetListing) throw new Error('Target listing not found.');
          const updatedListing = applyAssetAssignmentToListing(
            targetListing,
            {
              externalId: asset.externalId,
              originalPreviewUrl: resolvedUrl,
              title: asset.title,
            },
            role,
            { explicitEventLogoOverride: entityType === 'event' && role === 'logo' },
          );
          const saved =
            updatedListing.type === 'club'
              ? await api.saveClub(updatedListing).catch(() => updatedListing)
              : await api.saveEvent(updatedListing).catch(() => updatedListing);
          setListings((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        } else if (entityType === 'organization') {
          const target = organizations.find((o) => o.id === entityId);
          if (!target) throw new Error('Organization not found.');
          const next: OrganizationData = {
            ...target,
            ...(role === 'logo' ? { logoImageUrl: resolvedUrl } : {}),
            ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
            ...(role === 'gallery'
              ? { galleryImageUrls: Array.from(new Set([...(target.galleryImageUrls ?? []), resolvedUrl])) }
              : {}),
          };
          const saved = await api.saveOrganization(next).catch(() => next);
          setOrganizations((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        } else if (entityType === 'venue') {
          const target = venues.find((v) => v.id === entityId);
          if (!target) throw new Error('Venue not found.');
          const next: VenueData = {
            ...target,
            ...(role === 'logo' ? { logoImageUrl: resolvedUrl } : {}),
            ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
            ...(role === 'gallery'
              ? { galleryImageUrls: Array.from(new Set([...(target.galleryImageUrls ?? []), resolvedUrl])) }
              : {}),
          };
          const saved = await api.saveVenue(next).catch(() => next);
          setVenues((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        } else if (entityType === 'resort') {
          const target = resorts.find((r) => r.id === entityId);
          if (!target) throw new Error('Resort not found.');
          const next: ResortData = {
            ...target,
            ...(role === 'logo' ? { logoImageUrl: resolvedUrl } : {}),
            ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
            ...(role === 'gallery'
              ? { galleryImageUrls: Array.from(new Set([...(target.galleryImageUrls ?? []), resolvedUrl])) }
              : {}),
          };
          const saved = await api.saveResort(next).catch(() => next);
          setResorts((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        } else if (entityType === 'cruise_series') {
          const target = cruiseSeries.find((cs) => cs.id === entityId);
          if (!target) throw new Error('Cruise series not found.');
          const next: CruiseSeriesData = {
            ...target,
            ...(role === 'logo' ? { logoImageUrl: resolvedUrl } : {}),
            ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
            ...(role === 'gallery'
              ? { galleryImageUrls: Array.from(new Set([...(target.galleryImageUrls ?? []), resolvedUrl])) }
              : {}),
          };
          const saved = await api.saveCruiseSeries(next).catch(() => next);
          setCruiseSeries((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        } else if (entityType === 'cruise_sailing') {
          const target = cruiseSailings.find((s) => s.id === entityId);
          if (!target) throw new Error('Cruise sailing not found.');
          const next: CruiseSailingData = {
            ...target,
            ...(role === 'logo' ? { logoImageUrl: resolvedUrl } : {}),
            ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
          };
          const saved = await api.saveCruiseSailing(next).catch(() => next);
          setCruiseSailings((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        } else if (entityType === 'event_series') {
          const target = eventSeries.find((es) => es.id === entityId);
          if (!target) throw new Error('Event series not found.');
          const next: EventSeriesData = {
            ...target,
            ...(role === 'logo' ? { logoImageUrl: resolvedUrl } : {}),
            ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
          };
          const saved = await api.saveEventSeries(next).catch(() => next);
          setEventSeries((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        } else if (entityType === 'club_brand') {
          const target = clubBrands.find((cb) => cb.id === entityId);
          if (!target) throw new Error('Club brand not found.');
          const next: ClubBrandData = {
            ...target,
            ...(role === 'logo' ? { logoImageUrl: resolvedUrl } : {}),
            ...(role === 'hero' ? { headerImageUrl: resolvedUrl } : {}),
          };
          const saved = await api.saveClubBrand(next).catch(() => next);
          setClubBrands((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
        }

        setStatusBanner({
          tone: 'success',
          message: `Assigned "${asset.title}" to ${ENTITY_TYPE_LABELS[entityType]} (${entityId}) as ${role.toUpperCase()}.`,
        });
      } catch (err) {
        setStatusBanner({
          tone: 'error',
          message: err instanceof Error ? err.message : 'Unable to assign asset.',
        });
      } finally {
        setIsAssigning(false);
      }
    },
    [clubBrands, cruiseSailings, cruiseSeries, eventSeries, listings, organizations, resorts, venues],
  );

  // Remove explicit event logo override so host inheritance resumes
  const handleRemoveEventLogoOverride = useCallback(
    async (eventId: string) => {
      const targetEvent = listings.find((l): l is EventData => l.type === 'event' && l.id === eventId);
      if (!targetEvent) return;
      const cleaned = removeEventLogoOverrideFromListing(targetEvent);
      const saved = await api.saveEvent(cleaned).catch(() => cleaned);
      setListings((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));

      const updatedAudit = appendConsolidationAuditEntry({
        id: `audit-override-remove-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorLabel: 'Administrator',
        canonicalAssetId: `event:${eventId}:inherited-logo`,
        canonicalTitle: `${targetEvent.hostName || targetEvent.name} — Inherited Host Logo`,
        canonicalUrl: targetEvent.logoImageUrl ?? '',
        consolidatedAssetIds: [],
        kind: 'redundant_event_logo_cleanup',
        affectedEntities: [
          {
            entityType: 'event',
            entityId: targetEvent.id,
            entityName: targetEvent.name,
            role: 'logo',
            previousUrl: targetEvent.logoImageUrl,
            nextUrl: 'Inherited from parent host',
            action: 'removed_redundant_override',
          },
        ],
        sourceFilesDeleted: false,
      });
      setAuditEntries(updatedAudit);
      setStatusBanner({
        tone: 'success',
        message: `Removed event logo override on "${targetEvent.name}". Host logo inheritance is now active.`,
      });
    },
    [listings],
  );

  // Execute safe duplicate consolidation after admin confirms preview
  const executeConsolidation = useCallback(
    async (preview: ConsolidationPreview) => {
      setIsConsolidating(true);
      setStatusBanner(null);
      try {
        const canonical = preview.canonicalAsset;
        for (const item of preview.affectedEntities) {
          if (item.action === 'removed_redundant_override' && item.entityType === 'event') {
            const ev = listings.find((l): l is EventData => l.type === 'event' && l.id === item.entityId);
            if (ev) {
              const cleaned = removeEventLogoOverrideFromListing(ev);
              const saved = await api.saveEvent(cleaned).catch(() => cleaned);
              setListings((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
            }
          } else if (
            item.action === 'migrated_reference'
            && (item.role === 'logo' || item.role === 'hero' || item.role === 'flyer' || item.role === 'gallery')
          ) {
            await assignCanonicalAssetToEntity({
              asset: canonical,
              entityType: item.entityType,
              entityId: item.entityId,
              role: item.role,
            });
          }
        }

        const updatedAudit = appendConsolidationAuditEntry({
          id: `consolidation-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actorLabel: 'Administrator',
          canonicalAssetId: canonical.canonicalId,
          canonicalTitle: canonical.title,
          canonicalUrl: canonical.originalPreviewUrl,
          consolidatedAssetIds: preview.secondaryAssets.map((a) => a.canonicalId),
          kind: preview.kind,
          affectedEntities: preview.affectedEntities,
          sourceFilesDeleted: false,
        });
        setAuditEntries(updatedAudit);
        setConsolidationPreview(null);
        setStatusBanner({
          tone: 'success',
          message: `Consolidated ${preview.affectedEntities.length} reference(s) onto canonical asset "${canonical.title}". Audit trail saved; no source files were deleted.`,
        });
      } catch (err) {
        setStatusBanner({
          tone: 'error',
          message: err instanceof Error ? err.message : 'Consolidation failed.',
        });
      } finally {
        setIsConsolidating(false);
      }
    },
    [assignCanonicalAssetToEntity, listings],
  );

  // Handle selecting files in the Upload & Quick-Replace Modal
  const handleQueueUploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setUploadModalError('');
      const files = Array.from(fileList);
      const validFiles: typeof uploadQueuedFiles = [];

      for (const file of files) {
        if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type as any)) {
          setUploadModalError(`"${file.name}" has unsupported format (${file.type || 'unknown'}). Use JPG, PNG, or WebP.`);
          continue;
        }
        const rule = getMediaRule(uploadTargetRole);
        if (file.size > rule.maxUploadBytes) {
          setUploadModalError(`"${file.name}" exceeds ${formatMaxUploadSize(rule.maxUploadBytes)}.`);
          continue;
        }
        const sha256 = await computeFileSha256Hex(file).catch(() => undefined);
        const previewUrl = URL.createObjectURL(file);
        const matchingExistingAsset = sha256
          ? enrichedAssets.find((a) => a.contentHash === sha256)
          : undefined;
        validFiles.push({
          file,
          previewUrl,
          sha256,
          matchingExistingAsset,
        });
      }

      if (validFiles.length > 0) {
        setUploadQueuedFiles((prev) => [...prev, ...validFiles]);
      }
    },
    [enrichedAssets, uploadTargetRole],
  );

  // Events list with computed Host Logo Inheritance states for the Inheritance Inspector tab
  const eventLogoInheritanceRows = useMemo(() => {
    const q = inheritanceSearch.trim().toLowerCase();
    return listings
      .filter((l): l is EventData => l.type === 'event')
      .map((event) => {
        const state = resolveEventLogoState(event, brandCatalog);
        return { event, state };
      })
      .filter(({ event, state }) => {
        if (inheritanceModeFilter === 'inherited_host' && state.mode !== 'inherited_host') return false;
        if (inheritanceModeFilter === 'explicit_override' && state.mode !== 'explicit_override') return false;
        if (inheritanceModeFilter === 'redundant_copy' && !state.hasRedundantOccurrenceCopy) return false;
        if (inheritanceModeFilter === 'fallback' && state.mode !== 'fallback') return false;
        if (!q) return true;
        return `${event.name} ${event.hostName} ${event.id} ${state.resolvedLogo.sourceName ?? ''}`
          .toLowerCase()
          .includes(q);
      });
  }, [brandCatalog, inheritanceModeFilter, inheritanceSearch, listings]);

  const filteredDuplicateGroups = useMemo(() => {
    if (duplicateCategoryFilter === 'all') return catalogResult.duplicateGroups;
    return catalogResult.duplicateGroups.filter((g) => g.kind === duplicateCategoryFilter);
  }, [catalogResult.duplicateGroups, duplicateCategoryFilter]);

  const selectedMetric = selectedAsset ? metricsByCanonicalId[selectedAsset.canonicalId] : undefined;
  const selectedQualityReport = useMemo(() => {
    if (!selectedAsset) return null;
    return evaluateAssetRoleQuality({
      roles: selectedAsset.roles,
      width: selectedMetric?.width,
      height: selectedMetric?.height,
      isValidUrl: selectedAsset.isValidUrl,
      isBroken: selectedMetric?.broken,
      isPlaceholder: selectedAsset.isPlaceholder,
    });
  }, [selectedAsset, selectedMetric]);

  return (
    <div className="min-h-screen bg-[#07080b] text-gray-100">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Benchmark Header */}
        <header className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-5 shadow-2xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] tracking-wider text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Admin
                </Link>
                <span>SwingSphere Asset Governance v2</span>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Media Library & Canonical Asset System
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-gray-400">
                Single source of truth for inspecting, assigning, replacing, and consolidating imagery across clubs,
                events, hosts, venues, resorts, and cruises. Host logos automatically cascade to child events unless an
                explicit event override is set.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setUploadQueuedFiles([]);
                  setUploadExternalUrlInput('');
                  setUploadModalError('');
                  setIsUploadModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
              >
                <Upload className="h-4 w-4" />
                Upload / Quick-Replace
              </button>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-xs font-semibold text-gray-200 transition hover:bg-white/[0.08]"
              >
                <History className="h-4 w-4 text-gray-400" />
                Audit Trail ({auditEntries.length})
              </button>
              <button
                type="button"
                onClick={() => void loadCatalog()}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-xs font-semibold text-gray-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-red-400' : 'text-gray-400'}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* KPI Metric Strip */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <button
              type="button"
              onClick={() => {
                setWorkspaceTab('browser');
                setUsageFilter('all');
                setCategoryFilter('all');
              }}
              className="rounded-xl border border-white/10 bg-black/35 p-3.5 text-left transition hover:border-white/25"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Canonical Assets</div>
              <div className="mt-1 text-2xl font-bold text-white">{catalogResult.summary.totalCanonicalAssets}</div>
              <div className="mt-1 text-[11px] text-gray-500">
                {catalogResult.summary.externalUrlAssets} external URLs
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setWorkspaceTab('browser');
                setUsageFilter('linked');
              }}
              className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-3.5 text-left transition hover:border-emerald-500/40"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Active / Linked</div>
              <div className="mt-1 text-2xl font-bold text-white">{catalogResult.summary.linkedAssets}</div>
              <div className="mt-1 text-[11px] text-emerald-300/75">
                {catalogResult.summary.multiReferencedAssets} shared across multiple listings
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setWorkspaceTab('browser');
                setUsageFilter('inherited');
              }}
              className="rounded-xl border border-sky-500/20 bg-sky-950/15 p-3.5 text-left transition hover:border-sky-500/40"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">Inherited Event Logos</div>
              <div className="mt-1 text-2xl font-bold text-white">{catalogResult.summary.inheritedEventUsages}</div>
              <div className="mt-1 text-[11px] text-sky-300/75">
                Cascaded from canonical host / series
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setWorkspaceTab('duplicates');
              }}
              className="rounded-xl border border-violet-500/25 bg-violet-950/15 p-3.5 text-left transition hover:border-violet-500/45"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                Duplicate Candidates
              </div>
              <div className="mt-1 text-2xl font-bold text-white">
                {catalogResult.summary.duplicateCandidateGroups}
              </div>
              <div className="mt-1 text-[11px] text-violet-300/75">
                {catalogResult.summary.redundantEventLogoCopies} redundant occurrence copies
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setWorkspaceTab('browser');
                setUsageFilter('unlinked');
              }}
              className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-3.5 text-left transition hover:border-amber-500/40"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Unlinked / Superseded
              </div>
              <div className="mt-1 text-2xl font-bold text-white">{catalogResult.summary.unlinkedAssets}</div>
              <div className="mt-1 text-[11px] text-amber-300/75">0 active public references</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setWorkspaceTab('inheritance');
              }}
              className="rounded-xl border border-red-500/25 bg-red-950/15 p-3.5 text-left transition hover:border-red-500/45"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-red-300">
                Missing Assignments
              </div>
              <div className="mt-1 text-2xl font-bold text-white">{catalogResult.summary.missingEntitySlots}</div>
              <div className="mt-1 text-[11px] text-red-300/75">Slots needing flyer, hero, or logo</div>
            </button>
          </div>

          {/* Primary Workspace Mode Tabs */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Media Library Workspaces">
              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'browser'}
                onClick={() => setWorkspaceTab('browser')}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  workspaceTab === 'browser'
                    ? 'bg-red-600 text-white shadow'
                    : 'border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'
                }`}
              >
                <Grid className="h-3.5 w-3.5" />
                Asset Browser ({enrichedAssets.length})
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'duplicates'}
                onClick={() => setWorkspaceTab('duplicates')}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  workspaceTab === 'duplicates'
                    ? 'bg-red-600 text-white shadow'
                    : 'border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'
                }`}
              >
                <GitMerge className="h-3.5 w-3.5" />
                Duplicate Review & Consolidation ({catalogResult.duplicateGroups.length})
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'inheritance'}
                onClick={() => setWorkspaceTab('inheritance')}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  workspaceTab === 'inheritance'
                    ? 'bg-red-600 text-white shadow'
                    : 'border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Inheritance & Missing Assignments ({catalogResult.missingSlots.length})
              </button>
            </div>

            {workspaceTab === 'browser' ? (
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === 'grid' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                  aria-label="Thumbnail Grid View"
                >
                  <Grid className="h-3.5 w-3.5" />
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    viewMode === 'list' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                  aria-label="Compact List View"
                >
                  <List className="h-3.5 w-3.5" />
                  Compact List
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {/* Status Feedback Banner */}
        {statusBanner ? (
          <div
            className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              statusBanner.tone === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                : statusBanner.tone === 'error'
                  ? 'border-red-500/40 bg-red-950/30 text-red-200'
                  : 'border-sky-500/40 bg-sky-950/30 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* =====================================================================
            WORKSPACE 1: CANONICAL ASSET BROWSER (GRID & COMPACT LIST)
        ===================================================================== */}
        {workspaceTab === 'browser' ? (
          <section className="mt-6 space-y-4" aria-label="Canonical Media Browser">
            {/* Category Tabs & Filter Controls */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              {/* Category Pills: All | Logos | Heroes | Flyers | Gallery | Other */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 pb-3.5">
                {CATEGORY_TABS.map((tab) => {
                  const active = categoryFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCategoryFilter(tab.id)}
                      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                        active
                          ? 'bg-red-500/20 text-red-200 ring-1 ring-red-500/50'
                          : 'bg-black/30 text-gray-400 hover:bg-white/[0.05] hover:text-gray-200'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-300">
                        {categoryCounts[tab.id] ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search & Dropdown Filters */}
              <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search filename, asset name, club, event, host, or Cloudflare ID..."
                    className="w-full rounded-xl border border-white/10 bg-black/50 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:border-red-500/60 focus:outline-none"
                  />
                </div>

                <select
                  aria-label="Filter by entity type"
                  value={entityTypeFilter}
                  onChange={(e) => setEntityTypeFilter(e.target.value as any)}
                  className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs font-medium text-gray-200 focus:border-red-500/60 focus:outline-none"
                >
                  <option value="all">All Entity Types</option>
                  <option value="club">Clubs</option>
                  <option value="event">Events</option>
                  <option value="organization">Hosts / Organizations</option>
                  <option value="venue">Venues</option>
                  <option value="resort">Resorts</option>
                  <option value="cruise_series">Cruise Series</option>
                  <option value="cruise_sailing">Cruise Sailings</option>
                  <option value="event_series">Event Series</option>
                  <option value="club_brand">Club Brands</option>
                  <option value="user">User Avatars</option>
                </select>

                <select
                  aria-label="Filter by usage or status"
                  value={usageFilter}
                  onChange={(e) => setUsageFilter(e.target.value as UsageFilter)}
                  className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs font-medium text-gray-200 focus:border-red-500/60 focus:outline-none"
                >
                  <option value="all">All Usage & Status States</option>
                  <option value="linked">Linked (Active on Site)</option>
                  <option value="unlinked">Unlinked / Orphaned</option>
                  <option value="multi_ref">Referenced by Multiple Listings</option>
                  <option value="inherited">Inherited by Child Events</option>
                  <option value="redundant_copies">Has Redundant Occurrence Copies</option>
                  <option value="duplicates">Potential Duplicates</option>
                  <option value="external_url">External URLs</option>
                  <option value="broken_or_invalid">Broken or Invalid URL</option>
                  <option value="recent">Recently Uploaded / Modified</option>
                </select>

                <select
                  aria-label="Sort media assets"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs font-medium text-gray-200 focus:border-red-500/60 focus:outline-none"
                >
                  <option value="most_referenced">Sort: Most Referenced First</option>
                  <option value="recent">Sort: Recently Uploaded / Updated</option>
                  <option value="attention">Sort: Needs Attention First</option>
                  <option value="alphabetical">Sort: Alphabetical (A–Z)</option>
                </select>
              </div>

              {entityScopeFilter ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-2 text-xs text-red-200">
                  <span>
                    Filtered to entity:{' '}
                    <strong className="font-semibold text-white">{entityScopeFilter.entityName}</strong> (
                    {ENTITY_TYPE_LABELS[entityScopeFilter.entityType]})
                  </span>
                  <button
                    type="button"
                    onClick={() => setEntityScopeFilter(null)}
                    className="inline-flex items-center gap-1 font-semibold text-red-200 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" /> Clear entity filter
                  </button>
                </div>
              ) : null}
            </div>

            {/* Result Count & Top Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-gray-400">
              <div>
                Showing <strong className="text-white">{pagedAssets.length}</strong> of{' '}
                <strong className="text-white">{filteredAssets.length}</strong> canonical assets
              </div>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/[0.08] disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="text-gray-300">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/[0.08] disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>

            {/* Grid View vs Compact List View */}
            {isLoading ? (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-sm text-gray-400">
                Loading canonical media library…
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
                <ImageIcon className="mb-3 h-10 w-10 text-gray-600" />
                <h3 className="text-base font-semibold text-white">No matching canonical assets</h3>
                <p className="mt-1 max-w-md text-xs text-gray-400">
                  Adjust your category, entity type, usage filter, or search query to see more assets.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setEntityTypeFilter('all');
                    setUsageFilter('all');
                    setSearchQuery('');
                    setEntityScopeFilter(null);
                  }}
                  className="mt-4 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.1]"
                >
                  Reset all filters
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {pagedAssets.map((asset) => {
                  const isSelected = asset.canonicalId === selectedCanonicalId;
                  const metric = metricsByCanonicalId[asset.canonicalId];
                  const ratioLabel = formatRatioBadge(metric?.width, metric?.height);

                  return (
                    <button
                      key={asset.canonicalId}
                      type="button"
                      onClick={() => setSelectedCanonicalId(asset.canonicalId)}
                      className={`group flex flex-col overflow-hidden rounded-2xl border text-left transition ${
                        isSelected
                          ? 'border-red-500 bg-red-500/[0.07] ring-1 ring-red-500/60'
                          : 'border-white/10 bg-[#0d0f14] hover:border-white/25 hover:bg-[#12151c]'
                      }`}
                    >
                      {/* Accurate Original Image Thumbnail (Never Darkened) */}
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#050608]">
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.altText}
                          loading="lazy"
                          onLoad={(e) => {
                            const { naturalWidth, naturalHeight } = e.currentTarget;
                            if (naturalWidth > 0 && naturalHeight > 0) {
                              setMetricsByCanonicalId((prev) =>
                                prev[asset.canonicalId]?.width === naturalWidth
                                  ? prev
                                  : {
                                      ...prev,
                                      [asset.canonicalId]: { width: naturalWidth, height: naturalHeight, broken: false },
                                    },
                              );
                            }
                          }}
                          onError={() => {
                            setMetricsByCanonicalId((prev) => ({
                              ...prev,
                              [asset.canonicalId]: { width: 0, height: 0, broken: true },
                            }));
                          }}
                          className={`h-full w-full transition duration-200 group-hover:scale-[1.02] ${
                            asset.primaryCategory === 'logo' || asset.primaryCategory === 'flyer'
                              ? 'object-contain p-2'
                              : 'object-cover'
                          }`}
                        />

                        {/* Minimal Top Badges */}
                        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
                          <span className="rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-100 backdrop-blur-sm">
                            {asset.primaryCategory}
                          </span>
                          {ratioLabel ? (
                            <span className="rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-gray-300 backdrop-blur-sm">
                              {ratioLabel}
                            </span>
                          ) : null}
                        </div>

                        {asset.activeReferenceCount > 1 ? (
                          <div className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-sky-400/35 bg-sky-950/90 px-2 py-0.5 text-[10px] font-semibold text-sky-200 backdrop-blur-sm">
                            <Layers className="h-3 w-3" />
                            {asset.activeReferenceCount} uses
                          </div>
                        ) : null}
                      </div>

                      {/* Minimal Card Footer Metadata */}
                      <div className="flex flex-1 flex-col justify-between p-3">
                        <div>
                          <div className="truncate text-xs font-semibold text-white">{asset.title}</div>
                          <div className="mt-0.5 truncate text-[11px] text-gray-400">{asset.filename}</div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-white/5 pt-2">
                          <div className="flex flex-wrap gap-1">
                            {asset.statusBadges.slice(0, 2).map((badge) => (
                              <span
                                key={badge}
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_TONES[badge]}`}
                              >
                                {badge === 'Referenced by Multiple Listings' ? `Shared (${asset.activeReferenceCount})` : badge}
                              </span>
                            ))}
                          </div>
                          <span className="text-[10px] font-medium text-gray-500">
                            {asset.storageProvider === 'cloudflare_images' ? 'CF' : 'EXT'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Compact List View */
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f14]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        <th className="px-4 py-3">Asset</th>
                        <th className="px-3 py-3">Category / Roles</th>
                        <th className="px-3 py-3">Storage</th>
                        <th className="px-3 py-3">Linked Entities & Inheritance</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {pagedAssets.map((asset) => {
                        const isSelected = asset.canonicalId === selectedCanonicalId;
                        const primaryEntity = asset.usages[0];
                        return (
                          <tr
                            key={asset.canonicalId}
                            onClick={() => setSelectedCanonicalId(asset.canonicalId)}
                            className={`cursor-pointer transition ${
                              isSelected ? 'bg-red-500/10' : 'hover:bg-white/[0.03]'
                            }`}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-3">
                                <div className="h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050608]">
                                  <img
                                    src={asset.thumbnailUrl}
                                    alt={asset.altText}
                                    loading="lazy"
                                    className="h-full w-full object-contain"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-white">{asset.title}</div>
                                  <div className="truncate text-[11px] text-gray-400">{asset.filename}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-200">
                                {asset.primaryCategory}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-300">
                              <div className="truncate max-w-[180px]">{asset.storageLocationLabel}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {primaryEntity ? (
                                  <span className="font-medium text-gray-200">{primaryEntity.entityName}</span>
                                ) : (
                                  <span className="text-gray-500">Unlinked</span>
                                )}
                                {asset.inheritedReferenceCount > 0 ? (
                                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                                    +{asset.inheritedReferenceCount} inherited
                                  </span>
                                ) : null}
                                {asset.explicitReferenceCount > 1 ? (
                                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                    {asset.explicitReferenceCount} explicit
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {asset.statusBadges.map((b) => (
                                  <span
                                    key={b}
                                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_TONES[b]}`}
                                  >
                                    {b}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCanonicalId(asset.canonicalId);
                                }}
                                className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-gray-200 hover:bg-white/[0.1]"
                              >
                                Inspect
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {/* =====================================================================
            WORKSPACE 2: DUPLICATE REVIEW & CONSOLIDATION WORKFLOW
        ===================================================================== */}
        {workspaceTab === 'duplicates' ? (
          <section className="mt-6 space-y-5" aria-label="Duplicate Review & Consolidation">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Duplicate Detection & Safe Consolidation</h2>
                  <p className="mt-1 text-xs text-gray-400">
                    Review candidate groups side-by-side. Consolidating migrates entity references to your chosen
                    canonical asset and records a recoverable audit trail. Source files are never deleted automatically.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['all', 'All Candidates'],
                      ['exact_byte_duplicates', 'Exact Byte Duplicates'],
                      ['duplicate_db_records', 'Same-File & Inherited Copies'],
                      ['repeated_storage_urls', 'Repeated Storage URLs'],
                      ['visual_similarity_candidates', 'Visual / Revision Candidates'],
                      ['unused_or_orphaned', 'Unused / Orphaned'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDuplicateCategoryFilter(id)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        duplicateCategoryFilter === id
                          ? 'bg-red-500/20 text-red-200 ring-1 ring-red-500/50'
                          : 'border border-white/10 bg-black/30 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredDuplicateGroups.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-gray-400">
                No duplicate review candidates in this category.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredDuplicateGroups.map((group) => {
                  const chosenId =
                    selectedCanonicalByGroup[group.id]
                    ?? group.recommendedCanonicalId
                    ?? group.assets[0]?.canonicalId;

                  return (
                    <div
                      key={group.id}
                      className="rounded-2xl border border-white/10 bg-[#0d0f14] p-5 shadow-lg"
                    >
                      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
                              {DUPLICATE_KIND_LABELS[group.kind]}
                            </span>
                            {!group.canAutoRecommendCanonical ? (
                              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                                Manual Review Required — Never Auto-Merged
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-2 text-base font-bold text-white">{group.title}</h3>
                          <p className="mt-0.5 text-xs text-gray-400">{group.summary}</p>
                        </div>

                        {group.kind !== 'unused_or_orphaned' && chosenId ? (
                          <button
                            type="button"
                            onClick={() => {
                              const preview = previewDuplicateConsolidation(group, chosenId);
                              setConsolidationPreview(preview);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-red-500"
                          >
                            <GitMerge className="h-3.5 w-3.5" />
                            Preview Consolidation Impact
                          </button>
                        ) : null}
                      </div>

                      {/* Side-by-side Asset Previews */}
                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {group.assets.slice(0, 6).map((asset) => {
                          const isCanonicalChoice = chosenId === asset.canonicalId;
                          return (
                            <div
                              key={asset.canonicalId}
                              className={`flex flex-col justify-between rounded-xl border p-3.5 ${
                                isCanonicalChoice
                                  ? 'border-emerald-500/50 bg-emerald-950/15'
                                  : 'border-white/10 bg-black/35'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-xs font-semibold text-white">{asset.title}</span>
                                  {isCanonicalChoice ? (
                                    <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
                                      Canonical Target
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-2.5 flex h-36 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#050608] p-2">
                                  <img
                                    src={asset.originalPreviewUrl}
                                    alt={asset.altText}
                                    className="max-h-full max-w-full object-contain"
                                  />
                                </div>
                                <dl className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px] text-gray-400">
                                  <div>
                                    <span className="text-gray-500">Storage: </span>
                                    <span className="text-gray-200">{asset.externalId?.slice(0, 10) ?? 'External'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Active refs: </span>
                                    <span className="text-gray-200">{asset.activeReferenceCount}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">DB records: </span>
                                    <span className="text-gray-200">{asset.dbRecords.length}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Redundant copies: </span>
                                    <span className="text-gray-200">{asset.redundantCopyCount}</span>
                                  </div>
                                </dl>
                              </div>

                              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedCanonicalByGroup((prev) => ({
                                      ...prev,
                                      [group.id]: asset.canonicalId,
                                    }))
                                  }
                                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                    isCanonicalChoice
                                      ? 'bg-emerald-600 text-white'
                                      : 'border border-white/15 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]'
                                  }`}
                                >
                                  {isCanonicalChoice ? 'Selected as Canonical' : 'Choose as Canonical'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedCanonicalId(asset.canonicalId)}
                                  className="text-[11px] font-semibold text-gray-300 hover:text-white"
                                >
                                  Inspect Details →
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Consequences & Affected Entities Summary */}
                      <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3.5 text-xs text-gray-300">
                        <div className="font-semibold text-white">Expected Consolidation Consequences:</div>
                        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-gray-400">
                          {group.consequencesSummary.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {/* =====================================================================
            WORKSPACE 3: INHERITANCE & MISSING ASSIGNMENTS INSPECTOR
        ===================================================================== */}
        {workspaceTab === 'inheritance' ? (
          <section className="mt-6 space-y-6" aria-label="Inheritance and Missing Media Assignments">
            {/* Part A: Event Host-Logo Inheritance & Override Manager */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0f14] p-5">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Event Host-Logo Inheritance & Override Inspector
                  </h2>
                  <p className="mt-1 text-xs text-gray-400">
                    Precedence rule:{' '}
                    <strong className="text-gray-200">
                      Explicit event override → Parent host asset → Appropriate existing fallback
                    </strong>
                    . Remove an explicit override at any time so automatic host-logo inheritance resumes.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={inheritanceSearch}
                    onChange={(e) => setInheritanceSearch(e.target.value)}
                    placeholder="Search event or host..."
                    className="rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white placeholder:text-gray-500"
                  />
                  <select
                    aria-label="Filter event logo inheritance mode"
                    value={inheritanceModeFilter}
                    onChange={(e) => setInheritanceModeFilter(e.target.value as any)}
                    className="rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-gray-200"
                  >
                    <option value="all">All Event Logo States</option>
                    <option value="inherited_host">Using Inherited Host Logo</option>
                    <option value="explicit_override">Using Explicit Event Override</option>
                    <option value="redundant_copy">Has Redundant Occurrence Copy</option>
                    <option value="fallback">Using Fallback Logo</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <th className="px-3 py-2.5">Event</th>
                      <th className="px-3 py-2.5">Host / Organizer</th>
                      <th className="px-3 py-2.5">Active Logo Resolution</th>
                      <th className="px-3 py-2.5">Inheritance Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {eventLogoInheritanceRows.slice(0, 40).map(({ event, state }) => (
                      <tr key={event.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 font-semibold text-white">{event.name}</td>
                        <td className="px-3 py-2.5 text-gray-300">
                          {state.inheritedHostLogo.sourceName || event.hostName || 'Independent'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            {state.resolvedLogo.url ? (
                              <img
                                src={state.resolvedLogo.url}
                                alt=""
                                className="h-8 w-8 rounded-lg border border-white/10 bg-black object-contain p-0.5"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-gray-400">
                                {(event.name || 'E').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="truncate max-w-[180px] text-[11px] text-gray-400">
                              {state.resolvedLogo.sourceName
                                ? `From ${state.resolvedLogo.sourceName}`
                                : 'Fallback badge'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {state.mode === 'inherited_host' ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
                                Inherited Host Logo
                              </span>
                              {state.hasRedundantOccurrenceCopy ? (
                                <span className="rounded border border-violet-500/35 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                                  Redundant Occurrence Copy Stored
                                </span>
                              ) : null}
                            </div>
                          ) : state.mode === 'explicit_override' ? (
                            <span className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                              Explicit Event Override
                            </span>
                          ) : (
                            <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                              Fallback Logo
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setPickerContext({
                                  entityType: 'event',
                                  entityId: event.id,
                                  entityName: event.name,
                                  role: 'logo',
                                })
                              }
                              className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-gray-200 hover:bg-white/[0.1]"
                            >
                              {state.mode === 'explicit_override' ? 'Change Override' : 'Set Logo Override'}
                            </button>
                            {(state.mode === 'explicit_override' || state.hasRedundantOccurrenceCopy) ? (
                              <button
                                type="button"
                                onClick={() => void handleRemoveEventLogoOverride(event.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20"
                              >
                                <RotateCcw className="h-3 w-3" />
                                {state.mode === 'explicit_override' ? 'Remove Override' : 'Clean Redundant Copy'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Part B: Missing Asset Assignments */}
            <div className="rounded-2xl border border-white/10 bg-[#0d0f14] p-5">
              <h2 className="text-lg font-bold text-white">
                Entities with Missing Primary Media Assignments ({catalogResult.missingSlots.length})
              </h2>
              <p className="mt-1 text-xs text-gray-400">
                Assign an existing canonical asset from the library or upload a new image to fill missing logos, flyers,
                and heroes.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {catalogResult.missingSlots.slice(0, 48).map((slot) => (
                  <div
                    key={slot.id}
                    className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/35 p-3.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-300">
                          {ENTITY_TYPE_LABELS[slot.entityType]}
                        </span>
                        <span className="rounded border border-red-500/35 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-200">
                          Missing {slot.missingRole}
                        </span>
                      </div>
                      <div className="mt-2 font-semibold text-white">{slot.entityName}</div>
                      <p className="mt-1 text-xs text-gray-400">{slot.reason}</p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPickerContext({
                            entityType: slot.entityType,
                            entityId: slot.entityId,
                            entityName: slot.entityName,
                            role: slot.missingRole,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Choose From Library
                      </button>
                      {slot.publicRoute ? (
                        <Link
                          to={slot.publicRoute}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-300 hover:text-white"
                        >
                          View on Site <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {/* =====================================================================
          BOUNDED ASSET DETAIL DRAWER / MODAL
      ===================================================================== */}
      {selectedAsset ? (
        <div
          className="fixed inset-0 z-[100] flex justify-end bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Asset Details: ${selectedAsset.title}`}
          onClick={() => setSelectedCanonicalId(null)}
        >
          <aside
            className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-white/15 bg-[#0b0d12] text-gray-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                    {selectedAsset.primaryCategory}
                  </span>
                  {selectedAsset.statusBadges.map((badge) => (
                    <span
                      key={badge}
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${BADGE_TONES[badge]}`}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                <h2 className="mt-1.5 truncate text-lg font-bold text-white">{selectedAsset.title}</h2>
                <p className="truncate text-xs text-gray-400">{selectedAsset.filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCanonicalId(null)}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-gray-400 hover:bg-white/[0.1] hover:text-white"
                aria-label="Close Asset Details Drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Accurate Stored Asset Preview (No Darkened Overlay) */}
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#050608] p-3">
                <div className="flex max-h-80 min-h-48 items-center justify-center">
                  <img
                    src={selectedAsset.originalPreviewUrl}
                    alt={selectedAsset.altText}
                    onLoad={(e) => {
                      const { naturalWidth, naturalHeight } = e.currentTarget;
                      if (naturalWidth > 0 && naturalHeight > 0) {
                        setMetricsByCanonicalId((prev) => ({
                          ...prev,
                          [selectedAsset.canonicalId]: {
                            width: naturalWidth,
                            height: naturalHeight,
                            broken: false,
                          },
                        }));
                      }
                    }}
                    className="max-h-72 max-w-full rounded-lg object-contain"
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-[11px] text-gray-400">
                  <span>Original stored asset preview (no public page gradient/overlay applied)</span>
                  <a
                    href={selectedAsset.originalPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-red-300 hover:underline"
                  >
                    Open raw file <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              {/* Technical & Storage Metadata Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Asset Specifications & Provenance
                </h3>
                <dl className="mt-2.5 grid grid-cols-2 gap-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">Filename</dt>
                    <dd className="mt-0.5 truncate font-semibold text-white" title={selectedAsset.filename}>
                      {selectedAsset.filename}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Dimensions</dt>
                    <dd className="mt-0.5 font-semibold text-white">
                      {selectedMetric?.width && selectedMetric?.height
                        ? `${selectedMetric.width} × ${selectedMetric.height} px`
                        : 'Measuring…'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Aspect Ratio</dt>
                    <dd className="mt-0.5 font-semibold text-white">
                      {selectedQualityReport?.aspectRatioLabel
                        ?? selectedAsset.targetRatio
                        ?? 'Auto'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">File Type</dt>
                    <dd className="mt-0.5 font-semibold text-white">{selectedAsset.fileType}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">File Size</dt>
                    <dd className="mt-0.5 font-semibold text-white">{formatBytes(selectedAsset.fileSizeBytes)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Roles</dt>
                    <dd className="mt-0.5 font-semibold uppercase text-white">
                      {selectedAsset.roles.join(', ')}
                    </dd>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-gray-500">Storage Location</dt>
                    <dd className="mt-0.5 break-all font-mono text-[11px] text-gray-200">
                      {selectedAsset.storageLocationLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Upload Date</dt>
                    <dd className="mt-0.5 font-medium text-gray-200">{formatShortDate(selectedAsset.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Last Modified</dt>
                    <dd className="mt-0.5 font-medium text-gray-200">{formatShortDate(selectedAsset.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Active References</dt>
                    <dd className="mt-0.5 font-semibold text-emerald-300">
                      {selectedAsset.activeReferenceCount} ({selectedAsset.explicitReferenceCount} explicit,{' '}
                      {selectedAsset.inheritedReferenceCount} inherited)
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Quality & Role Dimension Checks */}
              {selectedQualityReport ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Role & Dimension Quality Checks
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {selectedQualityReport.checks.map((check) => (
                      <li
                        key={check.code}
                        className={`flex items-start gap-2 rounded-xl px-3 py-2 ${
                          check.level === 'error'
                            ? 'bg-red-500/15 text-red-200'
                            : check.level === 'warning'
                              ? 'bg-amber-500/15 text-amber-200'
                              : check.level === 'info'
                                ? 'bg-sky-500/15 text-sky-200'
                                : 'bg-emerald-500/12 text-emerald-200'
                        }`}
                      >
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{check.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Current Usage Across SwingSphere (Explicit vs Inherited) */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Used By ({selectedAsset.usages.length})
                  </h3>
                  {selectedAsset.redundantCopyCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const group = catalogResult.duplicateGroups.find(
                          (g) => g.id === `same-file-${selectedAsset.canonicalId}`,
                        );
                        if (group) {
                          setConsolidationPreview(previewDuplicateConsolidation(group, selectedAsset.canonicalId));
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/15 px-2.5 py-1 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/25"
                    >
                      <GitMerge className="h-3 w-3" />
                      Consolidate {selectedAsset.redundantCopyCount} redundant event copies
                    </button>
                  ) : null}
                </div>

                {selectedAsset.usages.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-gray-400">
                    This asset is currently unlinked. Use the assignment panel below to link it to any club, event,
                    host, venue, resort, or cruise.
                  </div>
                ) : (
                  <ul className="mt-2.5 space-y-2">
                    {selectedAsset.usages.map((usage) => (
                      <li
                        key={usage.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3.5 py-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEntityScopeFilter({
                                  entityType: usage.entityType,
                                  entityId: usage.entityId,
                                  entityName: usage.entityName,
                                });
                                setWorkspaceTab('browser');
                              }}
                              className="font-semibold text-white hover:text-red-300 hover:underline"
                            >
                              {usage.entityName}
                            </button>
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
                              {ENTITY_TYPE_LABELS[usage.entityType]}
                            </span>
                            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-gray-400">
                              {usage.role}
                            </span>
                            {usage.assignmentKind === 'explicit' ? (
                              <span className="rounded border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                                Explicit
                              </span>
                            ) : usage.assignmentKind === 'inherited' ? (
                              <span className="rounded border border-sky-500/35 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
                                Inherited{usage.inheritedFrom ? ` from ${usage.inheritedFrom.entityName}` : ''}
                              </span>
                            ) : usage.assignmentKind === 'redundant_copy' ? (
                              <span className="rounded border border-violet-500/35 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">
                                Redundant Occurrence Copy
                              </span>
                            ) : (
                              <span className="rounded border border-amber-500/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                                Historical / Superseded
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {usage.entityType === 'event'
                          && usage.role === 'logo'
                          && (usage.assignmentKind === 'explicit' || usage.assignmentKind === 'redundant_copy') ? (
                            <button
                              type="button"
                              onClick={() => void handleRemoveEventLogoOverride(usage.entityId)}
                              className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20"
                            >
                              Resume Host Inheritance
                            </button>
                          ) : null}
                          {usage.publicRoute ? (
                            <Link
                              to={usage.publicRoute}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-gray-200 hover:bg-white/[0.1] hover:text-white"
                            >
                              View on Site <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Assign This Canonical Asset to Another Listing / Entity */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Assign This Asset to a Listing / Entity
                </h3>
                <p className="mt-1 text-xs text-gray-400">
                  Reuse this canonical asset without uploading another physical file.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400">Entity Type</label>
                    <select
                      value={assignEntityType}
                      onChange={(e) => setAssignEntityType(e.target.value as CanonicalEntityType)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white"
                    >
                      <option value="event">Event</option>
                      <option value="club">Club</option>
                      <option value="organization">Host / Organization</option>
                      <option value="venue">Venue</option>
                      <option value="resort">Resort</option>
                      <option value="cruise_series">Cruise Series</option>
                      <option value="cruise_sailing">Cruise Sailing</option>
                      <option value="event_series">Event Series</option>
                      <option value="club_brand">Club Brand</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-400">Target Role</label>
                    <select
                      value={assignRole}
                      onChange={(e) => setAssignRole(e.target.value as any)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white"
                    >
                      <option value="logo">Logo (Brand / Host / Override)</option>
                      <option value="hero">Hero Image (Wide Header)</option>
                      {assignEntityType === 'event' ? (
                        <option value="flyer">Event Flyer (Card & Poster)</option>
                      ) : null}
                      <option value="gallery">Gallery Image</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-gray-400">Filter & Select Target Entity</label>
                    <input
                      type="search"
                      value={assignEntitySearch}
                      onChange={(e) => setAssignEntitySearch(e.target.value)}
                      placeholder="Filter entities by name..."
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white placeholder:text-gray-500"
                    />
                    <select
                      value={assignEntityId}
                      onChange={(e) => setAssignEntityId(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white"
                    >
                      {assignableEntities.map((ent) => (
                        <option key={ent.id} value={ent.id}>
                          {ent.name} {ent.subtitle ? `(${ent.subtitle})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={isAssigning || !assignEntityId}
                    onClick={() =>
                      void assignCanonicalAssetToEntity({
                        asset: selectedAsset,
                        entityType: assignEntityType,
                        entityId: assignEntityId,
                        role: assignRole,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-500 disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isAssigning ? 'Assigning…' : 'Assign Canonical Asset'}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {/* =====================================================================
          CONSOLIDATION IMPACT PREVIEW CONFIRMATION MODAL
      ===================================================================== */}
      {consolidationPreview ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Duplicate Consolidation"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0b0d12] p-6 text-gray-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-violet-300">
                  Safe Consolidation Impact Preview
                </div>
                <h2 className="mt-1 text-lg font-bold text-white">
                  Consolidate onto "{consolidationPreview.canonicalAsset.title}"
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConsolidationPreview(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
                <img
                  src={consolidationPreview.canonicalAsset.thumbnailUrl}
                  alt=""
                  className="h-14 w-14 rounded-lg border border-white/10 bg-black object-contain p-1"
                />
                <div>
                  <div className="font-semibold text-white">
                    Canonical Asset: {consolidationPreview.canonicalAsset.title}
                  </div>
                  <div className="text-gray-300">{consolidationPreview.canonicalAsset.storageLocationLabel}</div>
                </div>
              </div>

              <div>
                <div className="font-semibold uppercase tracking-wider text-gray-400">
                  Affected Entities ({consolidationPreview.affectedEntities.length})
                </div>
                {consolidationPreview.affectedEntities.length === 0 ? (
                  <p className="mt-1.5 text-gray-400">
                    No active public entity references will be disrupted; only duplicate record metadata will be
                    consolidated.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3">
                    {consolidationPreview.affectedEntities.map((item, idx) => (
                      <li key={`${item.entityId}-${idx}`} className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white">
                          {item.entityName} ({ENTITY_TYPE_LABELS[item.entityType]} · {item.role})
                        </span>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-gray-300">
                          {item.action === 'removed_redundant_override'
                            ? 'Resume host inheritance'
                            : 'Migrate to canonical asset'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200">
                <ul className="list-disc space-y-1 pl-4">
                  {consolidationPreview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setConsolidationPreview(null)}
                className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConsolidating}
                onClick={() => void executeConsolidation(consolidationPreview)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-500 disabled:opacity-50"
              >
                <GitMerge className="h-3.5 w-3.5" />
                {isConsolidating ? 'Consolidating…' : 'Confirm Non-Destructive Consolidation'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* =====================================================================
          UPLOAD & QUICK-REPLACE MODAL
      ===================================================================== */}
      {isUploadModalOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Upload or Quick-Replace Media Asset"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b0d12] text-gray-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-red-400">
                  Upload & Quick-Assign Workflow
                </div>
                <h2 className="mt-0.5 text-lg font-bold text-white">
                  Upload Files, Paste Validated URL, or Choose Existing
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
              {/* Target Entity & Role Selector */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold text-gray-400">Target Entity Type</label>
                  <select
                    value={uploadTargetEntityType}
                    onChange={(e) => {
                      setUploadTargetEntityType(e.target.value as CanonicalEntityType);
                      setAssignEntityType(e.target.value as CanonicalEntityType);
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
                  >
                    <option value="event">Event</option>
                    <option value="club">Club</option>
                    <option value="organization">Host / Organization</option>
                    <option value="venue">Venue</option>
                    <option value="resort">Resort</option>
                    <option value="cruise_series">Cruise Series</option>
                    <option value="cruise_sailing">Cruise Sailing</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-400">Target Role</label>
                  <select
                    value={uploadTargetRole}
                    onChange={(e) => setUploadTargetRole(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
                  >
                    <option value="flyer">Event Flyer</option>
                    <option value="hero">Hero Image</option>
                    <option value="logo">Logo</option>
                    <option value="gallery">Gallery</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-400">Target Entity</label>
                  <select
                    value={uploadTargetEntityId || assignEntityId}
                    onChange={(e) => setUploadTargetEntityId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
                  >
                    {assignableEntities.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Drag and Drop Multi-File Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.length) {
                    void handleQueueUploadFiles(e.dataTransfer.files);
                  }
                }}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-black/35 p-6 text-center transition hover:border-red-500/50"
              >
                <Upload className="h-8 w-8 text-red-400" />
                <p className="mt-2 font-semibold text-white">
                  Drag & drop image files here, or click to browse
                </p>
                <p className="mt-1 text-gray-400">
                  Supports JPG, PNG, WebP. Computes SHA-256 content hash before upload to warn if an identical file
                  already exists in the library.
                </p>
                <input
                  ref={uploadInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_MEDIA_MIME_TYPES.join(',')}
                  onChange={(e) => {
                    if (e.target.files?.length) void handleQueueUploadFiles(e.target.files);
                  }}
                  className="hidden"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="rounded-xl bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/15"
                  >
                    Select Image File(s)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = uploadTargetEntityId || assignEntityId;
                      const ent = assignableEntities.find((item) => item.id === targetId);
                      setIsUploadModalOpen(false);
                      setPickerContext({
                        entityType: uploadTargetEntityType,
                        entityId: targetId,
                        entityName: ent?.name ?? targetId,
                        role: uploadTargetRole,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 font-semibold text-red-200 hover:bg-red-500/25"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Choose Existing From Library Instead
                  </button>
                </div>
              </div>

              {/* Queued Files Pre-Save Preview */}
              {uploadQueuedFiles.length > 0 ? (
                <div className="space-y-2">
                  <div className="font-semibold text-white">
                    Pre-Save Preview ({uploadQueuedFiles.length} file{uploadQueuedFiles.length === 1 ? '' : 's'})
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {uploadQueuedFiles.map((item, idx) => (
                      <div
                        key={`${item.file.name}-${idx}`}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-2.5"
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-14 w-14 rounded-lg object-contain bg-black"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-white">{item.file.name}</div>
                          <div className="text-[11px] text-gray-400">
                            {formatBytes(item.file.size)} · SHA-256: {item.sha256?.slice(0, 10) ?? '…'}
                          </div>
                          {item.matchingExistingAsset ? (
                            <div className="mt-1 text-[11px] font-semibold text-amber-300">
                              Exact byte match in library: {item.matchingExistingAsset.title}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Validated External URL Paste Option */}
              <div className="rounded-xl border border-white/10 bg-black/30 p-3.5">
                <label className="block font-semibold text-white">
                  Or Link a Validated External / Cloudflare Image URL
                </label>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  External URLs are validated and clearly distinguished from locally managed Cloudflare Images.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="url"
                    value={uploadExternalUrlInput}
                    onChange={(e) => setUploadExternalUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const check = validateExternalImageUrl(uploadExternalUrlInput);
                      if (!check.valid || !check.normalizedUrl) {
                        setUploadModalError(check.error ?? 'Invalid image URL.');
                        return;
                      }
                      const targetId = uploadTargetEntityId || assignEntityId;
                      const syntheticAsset: CanonicalMediaAsset = {
                        canonicalId: `url:${check.normalizedUrl}`,
                        externalId: null,
                        storageProvider: check.isCloudflareManaged ? 'cloudflare_images' : 'external_url',
                        storageLocationLabel: `External URL (${check.host})`,
                        originalPreviewUrl: check.normalizedUrl,
                        thumbnailUrl: check.normalizedUrl,
                        filename: check.normalizedUrl.split('/').pop() || 'external-image',
                        title: `External ${uploadTargetRole.toUpperCase()}`,
                        altText: 'External image',
                        primaryCategory: uploadTargetRole === 'cover' ? 'hero' : uploadTargetRole,
                        roles: [uploadTargetRole],
                        status: 'approved',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        targetRatio: null,
                        aspectMode: null,
                        fileType: 'External Image',
                        fileSizeBytes: null,
                        contentHash: null,
                        visualHash: null,
                        dbRecords: [],
                        usages: [],
                        activeReferenceCount: 1,
                        explicitReferenceCount: 1,
                        inheritedReferenceCount: 0,
                        redundantCopyCount: 0,
                        isPlaceholder: false,
                        isValidUrl: true,
                        duplicateFlags: {
                          hasDuplicateDbRecords: false,
                          hasRedundantEventCopies: false,
                          exactByteDuplicateGroupId: null,
                          repeatedUrlGroupId: null,
                          visualSimilarityGroupId: null,
                          isUnlinkedOrOrphaned: false,
                        },
                        statusBadges: ['Linked'],
                      };
                      await assignCanonicalAssetToEntity({
                        asset: syntheticAsset,
                        entityType: uploadTargetEntityType,
                        entityId: targetId,
                        role: uploadTargetRole,
                      });
                      setIsUploadModalOpen(false);
                    }}
                    className="rounded-xl bg-red-600 px-3.5 py-2 font-semibold text-white hover:bg-red-500"
                  >
                    Validate & Assign URL
                  </button>
                </div>
              </div>

              {uploadModalError ? (
                <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-red-200">
                  {uploadModalError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* =====================================================================
          RECOVERABLE CONSOLIDATION AUDIT TRAIL MODAL
      ===================================================================== */}
      {isAuditModalOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Consolidation Audit Trail"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b0d12] text-gray-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-red-400">
                  Non-Destructive Governance
                </div>
                <h2 className="mt-0.5 text-lg font-bold text-white">
                  Consolidation & Override Audit Trail ({auditEntries.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 text-xs">
              {auditEntries.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  No duplicate consolidations or override removals have been recorded in this session yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {auditEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-white/10 bg-black/35 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-white">{entry.canonicalTitle}</span>
                        <span className="text-[11px] text-gray-400">{formatShortDate(entry.timestamp)}</span>
                      </div>
                      <div className="mt-1 text-gray-400">
                        Action: <span className="text-gray-200">{entry.kind}</span> · Source files deleted:{' '}
                        <span className="text-emerald-300">No (Preserved)</span>
                      </div>
                      {entry.affectedEntities.length > 0 ? (
                        <ul className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[11px] text-gray-300">
                          {entry.affectedEntities.map((aff, i) => (
                            <li key={i}>
                              • {aff.entityName} ({aff.entityType} · {aff.role}) → {aff.action}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* =====================================================================
          CHOOSE FROM MEDIA LIBRARY MODAL (FOR MISSING SLOTS & INHERITANCE TAB)
      ===================================================================== */}
      <MediaLibraryPickerModal
        isOpen={Boolean(pickerContext)}
        onClose={() => setPickerContext(null)}
        targetRole={pickerContext?.role ?? 'flyer'}
        targetOwnerType={(pickerContext?.entityType as MediaOwnerType) ?? 'event'}
        targetOwnerId={pickerContext?.entityId ?? ''}
        targetEntityName={pickerContext?.entityName}
        preloadedAssets={enrichedAssets}
        onSelectCanonicalAsset={({ canonicalAsset }) => {
          if (!pickerContext) return;
          void assignCanonicalAssetToEntity({
            asset: canonicalAsset,
            entityType: pickerContext.entityType,
            entityId: pickerContext.entityId,
            role: pickerContext.role,
          });
        }}
      />
    </div>
  );
};

export default DevImageLibraryPage;
