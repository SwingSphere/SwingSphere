import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  BuildingAsset,
  AttendancePolicy,
  ClubBrandData,
  ClubData,
  EntryRequirement,
  EventData,
  Geopoint,
  Listing,
  ListingLocationMeta,
  OrganizationData,
  OrganizationVenueRelationship,
  VenueData,
} from '../../../types';
import type { User } from '../../../data/mockUsers';
import type { EntityIndex } from '../../../lib/entityIndex';
import { useAppStore } from '../../../store/appStore';
import * as api from '../../../lib/api';
import { getPrimaryVenueForClub, getVenueForEvent, resolveEventOrganizerOrganizationId } from '../../../lib/entityCompatibility';
import { nameSlug } from '../../../lib/identityUtils';
import { formatListingAddress, validateListingLocation } from '../../../lib/listingLocationValidation';
import { swingMapStyle } from '../../maps/mapStyle';
import EntityRelationshipPanel from '../EntityRelationshipPanel';
import {
  ATTENDANCE_POLICY_OPTIONS,
  CLUB_TAXONOMY_GROUPS,
  ENTRY_REQUIREMENT_OPTIONS,
  EVENT_TAXONOMY_GROUPS,
  formatTaxonomyList,
  getTaxonomyLabel,
  isTaxonomyValueSelected,
  toTaxonomyOption,
  toggleTaxonomyValue,
  type TaxonomyInput,
} from '../../../lib/listingTaxonomy';
import { formatEntryRequirements as formatAccessEntryRequirements } from '../../../lib/accessDisplay';
import { buildEditorTaxonomyGroups } from '../../../lib/taxonomySupabase';
import MediaUploader from '../../media/MediaUploader';
import { getCloudflareImageUrl } from '../../../lib/media/getCloudflareImageUrl';
import { getMediaOwnerId } from '../../../lib/media/getMediaOwnerId';
import { getMediaRule } from '../../../lib/media/mediaRules';
import type { MediaAsset, MediaRole } from '../../../lib/media/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type SectionConfig = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  render: () => React.ReactNode;
  saveLabel?: string;
  onSave?: () => Promise<void>;
};

const statusLabel: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving...',
  saved: 'Saved ✓',
  error: 'Save failed',
};

const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-gray-500';

const formatDate = (value?: string) => {
  if (!value) return 'Not tracked';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const makeAddress = (geopoint: Geopoint) => {
  const address = geopoint.address;
  return [
    address.addressLine1,
    address.addressLine2,
    [address.city, address.region].filter(Boolean).join(', '),
    address.postalCode,
    address.country,
  ].filter(Boolean).join(', ');
};

const toListingAddress = (geopoint: Geopoint) => ({
  addressLine1: geopoint.address.addressLine1,
  addressLine2: geopoint.address.addressLine2,
  city: geopoint.address.city,
  region: geopoint.address.region,
  postalCode: geopoint.address.postalCode,
  country: geopoint.address.country,
});

const normalizeList = (value: string) =>
  value.split('\n').map((item) => item.trim()).filter(Boolean);

const normalizeImageUrl = (value: string) => value.trim();

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="block space-y-1.5">
    <span className={labelClass}>{label}</span>
    {children}
  </label>
);

const EmptySection = ({ text }: { text: string }) => (
  <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
    {text}
  </div>
);

export const EditorSection = ({
  title,
  defaultOpen = false,
  children,
  saveLabel,
  onSave,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  saveLabel?: string;
  onSave?: () => Promise<void>;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const handleSave = async () => {
    if (!onSave) return;
    setSaveStatus('saving');
    try {
      await onSave();
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 1800);
    } catch {
      setSaveStatus('error');
    }
  };

  return (
    <section id={title.toLowerCase().replace(/[^a-z0-9]+/g, '-')} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="text-base font-semibold text-gray-900">{isOpen ? '▼' : '▶'} {title}</span>
        {saveStatus !== 'idle' && (
          <span className={`text-xs font-semibold ${saveStatus === 'error' ? 'text-red-600' : saveStatus === 'saved' ? 'text-green-700' : 'text-gray-500'}`}>
            {statusLabel[saveStatus]}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 p-5">
          {children}
          {onSave && (
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveStatus === 'saving' ? 'Saving...' : saveLabel ?? 'Save Section'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export const AdminEditorPage = ({
  title,
  entityType,
  entityId,
  owner,
  status,
  created,
  updated,
  sections,
  onBack,
  onSave,
  onPublish,
  onArchive,
  onDelete,
}: {
  title: string;
  entityType: string;
  entityId: string;
  owner?: string;
  status: string;
  created?: string;
  updated?: string;
  sections: SectionConfig[];
  onBack: () => void;
  onSave: () => Promise<void>;
  onPublish?: () => Promise<void>;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) => {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const runAction = async (action: () => Promise<void>, successStatus: SaveStatus = 'saved') => {
    setSaveStatus('saving');
    try {
      await action();
      setSaveStatus(successStatus);
      window.setTimeout(() => setSaveStatus('idle'), 1800);
    } catch {
      setSaveStatus('error');
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <button type="button" onClick={onBack} className="mb-4 text-sm font-semibold text-gray-600 hover:text-gray-900">
        ← Back to list
      </button>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{entityType} Detail Editor</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">{title}</h1>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-5">
              <div><dt className={labelClass}>ID</dt><dd className="font-mono text-xs text-gray-800">{entityId}</dd></div>
              <div><dt className={labelClass}>Created</dt><dd>{formatDate(created)}</dd></div>
              <div><dt className={labelClass}>Updated</dt><dd>{formatDate(updated)}</dd></div>
              <div><dt className={labelClass}>Owner</dt><dd>{owner ?? 'Unassigned'}</dd></div>
              <div><dt className={labelClass}>Status</dt><dd className="capitalize">{status.replace('_', ' ')}</dd></div>
            </dl>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => runAction(onSave)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Save</button>
            {onPublish && <button type="button" onClick={() => runAction(onPublish)} className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-100">Publish</button>}
            {onArchive && <button type="button" onClick={() => runAction(onArchive)} className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-semibold text-yellow-800 hover:bg-yellow-100">Archive</button>}
            {onDelete && <button type="button" onClick={() => runAction(onDelete)} className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">Delete</button>}
          </div>
        </div>
        {saveStatus !== 'idle' && (
          <div className={`mt-4 text-sm font-semibold ${saveStatus === 'error' ? 'text-red-600' : saveStatus === 'saved' ? 'text-green-700' : 'text-gray-500'}`}>
            {statusLabel[saveStatus]}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="hidden self-start rounded-lg border border-gray-200 bg-white p-3 shadow-sm lg:block lg:sticky lg:top-6">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
              {section.title}
            </a>
          ))}
        </nav>
        <div className="space-y-4">
          {sections.map((section) => (
            <EditorSection
              key={section.id}
              title={section.title}
              defaultOpen={section.defaultOpen}
              saveLabel={section.saveLabel}
              onSave={section.onSave}
            >
              {section.render()}
            </EditorSection>
          ))}
        </div>
      </div>
    </div>
  );
};

const AddressSection = ({
  geopoint,
  locationMeta,
  listingType,
  onChange,
  onLocationMetaChange,
}: {
  geopoint: Geopoint;
  locationMeta?: ListingLocationMeta;
  listingType: Listing['type'];
  onChange: (geopoint: Geopoint) => void;
  onLocationMetaChange: (meta: ListingLocationMeta) => void;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [validationStatus, setValidationStatus] = useState<SaveStatus>('idle');
  const center = useMemo<[number, number]>(() => [geopoint.longitude, geopoint.latitude], [geopoint.latitude, geopoint.longitude]);

  const setAddressField = (field: keyof Geopoint['address'], value: string) => {
    onChange({ ...geopoint, address: { ...geopoint.address, [field]: value } });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: swingMapStyle,
      center,
      zoom: 14.5,
      interactive: true,
      attributionControl: false,
      scrollZoom: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!markerRef.current) {
      const markerElement = document.createElement('div');
      markerElement.style.width = '20px';
      markerElement.style.height = '20px';
      markerElement.style.borderRadius = '9999px';
      markerElement.style.background = '#ef4444';
      markerElement.style.border = '2px solid rgba(255,255,255,0.95)';
      markerElement.style.boxShadow = '0 0 0 9px rgba(239,68,68,0.18), 0 8px 28px rgba(0,0,0,0.45)';

      const marker = new maplibregl.Marker({ element: markerElement, anchor: 'center', draggable: true })
        .setLngLat(center)
        .addTo(map);

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        onChange({
          ...geopoint,
          latitude: Number(lngLat.lat.toFixed(6)),
          longitude: Number(lngLat.lng.toFixed(6)),
        });
        onLocationMetaChange({
          ...(locationMeta ?? { status: 'manual' as const }),
          status: 'manual',
          manualAdjustment: true,
          validatedAt: new Date().toISOString(),
        });
      });

      markerRef.current = marker;
      return;
    }

    markerRef.current.setLngLat(center);
  }, [center, geopoint, locationMeta, onChange, onLocationMetaChange]);

  const recenter = () => {
    mapRef.current?.easeTo({ center, zoom: 14.5, duration: 300 });
  };

  const rerunValidation = async () => {
    setValidationStatus('saving');
    const address = toListingAddress(geopoint);
    const result = await validateListingLocation({
      freeformAddress: formatListingAddress(address),
      listingType,
      advancedAddress: address,
    });

    if (result.geopoint) {
      onChange(result.geopoint);
    }
    onLocationMetaChange(result.meta);
    setValidationStatus(result.geopoint ? 'saved' : 'error');
    window.setTimeout(() => setValidationStatus('idle'), 1800);
  };

  const verificationLabel = locationMeta?.status
    ? locationMeta.status.replace('_', ' ')
    : 'unvalidated';

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-950">
        <div ref={containerRef} className="h-80 w-full" />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-gray-950 p-3">
          <div className="text-xs text-gray-300">
            Drag the red pin to adjust the listing coordinates.
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={recenter} className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15">
              Re-center
            </button>
            <button type="button" onClick={rerunValidation} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
              {validationStatus === 'saving' ? 'Validating...' : 'Re-run validation'}
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude"><input className={inputClass} type="number" step="0.000001" value={geopoint.latitude} onChange={(event) => onChange({ ...geopoint, latitude: Number(event.target.value) })} /></Field>
          <Field label="Longitude"><input className={inputClass} type="number" step="0.000001" value={geopoint.longitude} onChange={(event) => onChange({ ...geopoint, longitude: Number(event.target.value) })} /></Field>
        </div>
        <MetadataSection rows={[
          ['Verified address', locationMeta?.normalizedAddress ?? (makeAddress(geopoint) || 'Not validated')],
          ['Verification status', verificationLabel],
          ['Confidence', locationMeta?.confidence !== undefined ? `${Math.round(locationMeta.confidence * 100)}%` : 'Not scored'],
          ['Source', locationMeta?.geocoderSource ?? 'Manual'],
        ]} />
        {validationStatus !== 'idle' && (
          <div className={`text-sm font-semibold ${validationStatus === 'error' ? 'text-red-600' : validationStatus === 'saved' ? 'text-green-700' : 'text-gray-500'}`}>
            {statusLabel[validationStatus]}
          </div>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:col-span-2">
        <Field label="Address line 1"><input className={inputClass} value={geopoint.address.addressLine1 ?? ''} onChange={(event) => setAddressField('addressLine1', event.target.value)} /></Field>
        <Field label="Address line 2"><input className={inputClass} value={geopoint.address.addressLine2 ?? ''} onChange={(event) => setAddressField('addressLine2', event.target.value)} /></Field>
        <Field label="City"><input className={inputClass} value={geopoint.address.city} onChange={(event) => setAddressField('city', event.target.value)} /></Field>
        <Field label="Region"><input className={inputClass} value={geopoint.address.region} onChange={(event) => setAddressField('region', event.target.value)} /></Field>
        <Field label="Postal code"><input className={inputClass} value={geopoint.address.postalCode ?? ''} onChange={(event) => setAddressField('postalCode', event.target.value)} /></Field>
        <Field label="Country"><input className={inputClass} value={geopoint.address.country} onChange={(event) => setAddressField('country', event.target.value)} /></Field>
      </div>
    </div>
  );
};

const ImagesSection = ({
  ownerType,
  ownerId,
  mediaAssets,
  logoImageUrl,
  headerImageUrl,
  galleryImageUrls,
  onAssetUploaded,
  onLogoChange,
  onHeaderChange,
  onGalleryChange,
}: {
  ownerType: 'club' | 'event';
  ownerId: string;
  mediaAssets?: MediaAsset[];
  logoImageUrl?: string;
  headerImageUrl?: string;
  galleryImageUrls?: string[];
  onAssetUploaded: (asset: MediaAsset) => void;
  onLogoChange: (value: string | undefined) => void;
  onHeaderChange: (value: string) => void;
  onGalleryChange: (value: string[]) => void;
}) => {
  const mediaOwnerId = getMediaOwnerId(ownerType, ownerId);
  const getAsset = (role: MediaRole) => mediaAssets?.find((asset) => asset.role === role) ?? null;
  const handleUploaded = (asset: MediaAsset) => {
    const variant = getMediaRule(asset.role).defaultVariant;
    const url = getCloudflareImageUrl({ externalId: asset.external_id, variant });
    onAssetUploaded(asset);
    if (asset.role === 'logo') onLogoChange(url);
    if (asset.role === 'hero') onHeaderChange(url);
    if (asset.role === 'gallery') onGalleryChange([...(galleryImageUrls ?? []), url]);
  };

  const moveGalleryImage = (index: number, direction: -1 | 1) => {
    const next = [...(galleryImageUrls ?? [])];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onGalleryChange(next);
  };

  const ImageSlot = ({
    title,
    description,
    value,
    onChange,
    shape,
  }: {
    title: string;
    description: string;
    value?: string;
    onChange: (value: string | undefined) => void;
    shape: 'square' | 'hero';
  }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex min-h-10 items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
        </div>
        {value && (
          <button type="button" onClick={() => onChange(undefined)} className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
            Remove
          </button>
        )}
      </div>
      <div className={shape === 'square' ? 'mx-auto aspect-square w-full max-w-[220px]' : 'aspect-[16/7] w-full'}>
        {value ? (
          <img src={value} alt="" className={`h-full w-full rounded-lg border border-gray-200 bg-gray-50 ${shape === 'square' ? 'object-contain p-2' : 'object-cover'}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-gray-400">
            No image set
          </div>
        )}
      </div>
      {value && <div className="mt-3 truncate rounded-md bg-gray-50 px-2.5 py-2 text-[11px] text-gray-500" title={value}>{value}</div>}
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MediaUploader tone="light" ownerType={ownerType} ownerId={mediaOwnerId} role="logo" existingAsset={getAsset('logo')} label={ownerType === 'event' ? 'Optional occurrence logo override' : 'Upload or replace logo'} onUploaded={handleUploaded} />
      <MediaUploader tone="light" ownerType={ownerType} ownerId={mediaOwnerId} role="hero" existingAsset={getAsset('hero')} label={ownerType === 'event' ? 'Upload or replace occurrence banner' : 'Upload or replace hero image'} helperText={ownerType === 'event' ? 'Wide image used as the background banner for this specific date. Leave empty to inherit the event-series banner.' : undefined} onUploaded={handleUploaded} />
      {ownerType === 'event' && (
        <div className="md:col-span-2">
          <MediaUploader tone="light" ownerType={ownerType} ownerId={mediaOwnerId} role="flyer" existingAsset={getAsset('flyer')} label="Upload or replace occurrence flyer" helperText="Date-specific vertical flyer. The complete artwork is preserved without cropping." onUploaded={handleUploaded} />
        </div>
      )}
      <div className="md:col-span-2"><MediaUploader tone="light" ownerType={ownerType} ownerId={mediaOwnerId} role="gallery" label="Add gallery image" onUploaded={handleUploaded} /></div>
      <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Current media</h3>
          <p className="mt-1 text-xs text-gray-500">Preview the images currently saved to this listing.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,2fr)]">
          <ImageSlot title="Logo" description="Displayed in a square frame throughout SwingSphere." value={logoImageUrl} onChange={onLogoChange} shape="square" />
          <ImageSlot title="Hero / background" description="Wide image used for the listing header and large visual surfaces." value={headerImageUrl} onChange={(value) => onHeaderChange(value ?? '')} shape="hero" />
        </div>
      </div>
      <div className="md:col-span-2 rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Gallery</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(galleryImageUrls ?? []).map((url, index) => (
            <div key={`${url}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <img src={url} alt="" className="h-32 w-full rounded-md object-cover" />
              <div className="mt-2 truncate text-xs text-gray-500">{url}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onHeaderChange(url)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100">Set as Hero</button>
                <button type="button" onClick={() => moveGalleryImage(index, -1)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100">Move Up</button>
                <button type="button" onClick={() => moveGalleryImage(index, 1)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100">Move Down</button>
                <button type="button" onClick={() => onGalleryChange((galleryImageUrls ?? []).filter((_, itemIndex) => itemIndex !== index))} className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Delete</button>
              </div>
            </div>
          ))}
          {!(galleryImageUrls ?? []).length && (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
              No gallery images.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TagSelector = ({
  kind,
  selected,
  onChange,
}: {
  kind: 'club' | 'event';
  selected: string[];
  onChange: (selected: string[]) => void;
}) => {
  const { tags, tagCategories, fetchTags } = useAppStore();
  useEffect(() => {
    if (!tags.length || !tagCategories.length) void fetchTags();
  }, [fetchTags, tagCategories.length, tags.length]);

  const liveGroups = useMemo(
    () => buildEditorTaxonomyGroups(tags, tagCategories, kind),
    [kind, tagCategories, tags],
  );
  const groupedTags = liveGroups.length
    ? liveGroups
    : kind === 'club' ? CLUB_TAXONOMY_GROUPS : EVENT_TAXONOMY_GROUPS;
  const optionGroups = groupedTags.map((group) => [...group.options] as TaxonomyInput[]);
  const knownValues = new Set(optionGroups.flatMap((group) => group.flatMap((rawOption) => {
    const option = toTaxonomyOption(rawOption);
    return [option.value, ...(option.legacyValues ?? [])];
  })));

  const toggleTag = (option: TaxonomyInput) => {
    onChange(toggleTaxonomyValue(selected, option));
  };

  if (!groupedTags.length) {
    return <EmptySection text="No visible taxonomy tags are available." />;
  }

  return (
    <div className="space-y-5">
      {groupedTags.map((group) => (
        <div key={group.id}>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">{group.label}</h3>
          <div className="flex flex-wrap gap-2">
            {group.options.map((rawOption) => {
              const option = toTaxonomyOption(rawOption);
              const checked = isTaxonomyValueSelected(selected, option);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleTag(option)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${checked ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}
                >
                  {checked ? 'Selected: ' : ''}{option.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {selected.some((label) => !knownValues.has(label)) && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Legacy / custom tags</h3>
          <div className="flex flex-wrap gap-2">
            {selected.filter((label) => !knownValues.has(label)).map((label) => (
              <button key={label} type="button" onClick={() => onChange(selected.filter((item) => item !== label))} className="rounded-full border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-800">
                ✓ {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const normalizeAttendancePolicy = (value?: AttendancePolicy): AttendancePolicy => {
  if (!value) return 'mixed_open';
  const match = ATTENDANCE_POLICY_OPTIONS.find((option) => option.value === value || option.legacyValues?.includes(value));
  return match?.value ?? 'mixed_open';
};

const AccessSection = ({
  attendancePolicy,
  entryRequirements = [],
  isEvent = false,
  onAttendancePolicyChange,
  onEntryRequirementsChange,
}: {
  attendancePolicy?: AttendancePolicy;
  entryRequirements?: EntryRequirement[];
  isEvent?: boolean;
  onAttendancePolicyChange: (attendancePolicy: AttendancePolicy) => void;
  onEntryRequirementsChange: (entryRequirements: EntryRequirement[]) => void;
}) => {
  const audienceOptions = isEvent
    ? ATTENDANCE_POLICY_OPTIONS.filter((option) => option.value !== 'varies_by_night')
    : ATTENDANCE_POLICY_OPTIONS;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Audience</h3>
        <div className="flex flex-wrap gap-2">
          {audienceOptions.map((option) => {
            const checked = normalizeAttendancePolicy(attendancePolicy) === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onAttendancePolicyChange(option.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${checked ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}
              >
                {checked ? '✓ ' : ''}{option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Entry / Screening</h3>
        <div className="flex flex-wrap gap-2">
          {ENTRY_REQUIREMENT_OPTIONS.map((option) => {
            const checked = entryRequirements.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onEntryRequirementsChange(checked
                  ? entryRequirements.filter((value) => value !== option.value)
                  : [...entryRequirements, option.value])}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${checked ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}
              >
                {checked ? '✓ ' : ''}{option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Current: {formatAccessEntryRequirements(entryRequirements, { emptyLabel: 'None listed' })}
        </p>
      </div>
    </div>
  );
};

const ModerationSection = ({
  status,
  onChange,
}: {
  status: Listing['status'];
  onChange: (status: Listing['status']) => void;
}) => (
  <div className="grid gap-4 md:grid-cols-2">
    <Field label="Status">
      <select className={inputClass} value={status} onChange={(event) => onChange(event.target.value as Listing['status'])}>
        <option value="pending_approval">Pending approval</option>
        <option value="approved">Approved</option>
        <option value="flagged">Flagged</option>
      </select>
    </Field>
    <EmptySection text="Moderation notes and review history can be attached here when backend support lands." />
  </div>
);

const MetadataSection = ({ rows }: { rows: Array<[string, React.ReactNode]> }) => (
  <dl className="grid gap-3 text-sm md:grid-cols-2">
    {rows.map(([label, value]) => (
      <div key={label} className="rounded-md bg-gray-50 p-3">
        <dt className={labelClass}>{label}</dt>
        <dd className="mt-1 break-words text-gray-800">{value}</dd>
      </div>
    ))}
  </dl>
);

const DebugSection = ({ value }: { value: unknown }) => (
  <pre className="max-h-96 overflow-auto rounded-md bg-gray-950 p-4 text-xs text-gray-100">
    {JSON.stringify(value, null, 2)}
  </pre>
);

const buildVenueFromListing = (listing: ClubData | EventData): VenueData => {
  const id = `venue-admin-${listing.id}-${Date.now()}`;
  const name = listing.type === 'club'
    ? listing.name
    : listing.isAddressPrivate
      ? `${listing.geopoint.address.city || listing.location || listing.name} private venue`
      : listing.location || listing.name;
  return {
    id,
    type: 'venue',
    name,
    slug: `${nameSlug(name)}-${id}`,
    description: listing.type === 'club' ? listing.description_short : undefined,
    address: listing.geopoint.address,
    latitude: listing.geopoint.latitude,
    longitude: listing.geopoint.longitude,
    locationMeta: listing.locationMeta,
    visibility: listing.type === 'event' && listing.isAddressPrivate ? 'private' : 'public_exact',
    status: listing.status,
    amenities: listing.type === 'club' ? [...listing.generalAmenities] : [],
    logoImageUrl: listing.logoImageUrl,
    headerImageUrl: listing.headerImageUrl,
    galleryImageUrls: listing.galleryImageUrls,
    buildingAssetId: listing.buildingAssetId,
  };
};

const formatVenueAddress = (venue: VenueData) => [
  venue.address.addressLine1,
  venue.address.addressLine2,
  [venue.address.city, venue.address.region].filter(Boolean).join(', '),
  venue.address.postalCode,
  venue.address.country,
].filter(Boolean).join(', ');

const syncListingPhysicalFieldsFromVenue = <T extends ClubData | EventData>(
  listing: T,
  venue: VenueData | undefined,
): T => {
  if (!venue) return listing;
  const synced = {
    ...listing,
    location: formatVenueAddress(venue),
    geopoint: {
      latitude: venue.latitude,
      longitude: venue.longitude,
      address: venue.address,
    },
    locationMeta: venue.locationMeta ?? listing.locationMeta,
    buildingAssetId: venue.buildingAssetId ?? listing.buildingAssetId,
  };
  // TODO(SEMv2 Phase 4): remove legacy listing field sync once public/admin code reads Venue directly.
  return (listing.type === 'club'
    ? { ...synced, generalAmenities: venue.amenities.length ? [...venue.amenities] : listing.generalAmenities }
    : synced) as T;
};

const VenueSelect = ({
  label,
  venues,
  value,
  onChange,
  onCreateVenue,
}: {
  label: string;
  venues: VenueData[];
  value?: string;
  onChange: (venueId: string | undefined) => void;
  onCreateVenue: () => void;
}) => (
  <div className="grid gap-2">
    <Field label={label}>
      <select className={inputClass} value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">No venue selected</option>
        {[...venues].sort((a, b) => a.name.localeCompare(b.name)).map((venue) => (
          <option key={venue.id} value={venue.id}>
            {venue.name} ({[venue.address.city, venue.address.region].filter(Boolean).join(', ') || venue.visibility})
          </option>
        ))}
      </select>
    </Field>
    <button
      type="button"
      onClick={onCreateVenue}
      className="justify-self-start rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
    >
      Create venue from current location
    </button>
  </div>
);

export const AdminListingDetailEditor = ({
  listing,
  users,
  venues,
  organizations,
  clubBrands,
  relationships,
  listings,
  buildingAssets,
  entityIndex,
  onVenueSaved,
  onRelationshipSaved,
  onBack,
  onSaved,
}: {
  listing: ClubData | EventData;
  users: User[];
  venues: VenueData[];
  organizations: OrganizationData[];
  clubBrands: ClubBrandData[];
  relationships: OrganizationVenueRelationship[];
  listings: Listing[];
  buildingAssets: BuildingAsset[];
  entityIndex: EntityIndex | null;
  onVenueSaved: (venue: VenueData) => void;
  onRelationshipSaved: (relationship: OrganizationVenueRelationship) => void;
  onBack: () => void;
  onSaved: (listing: ClubData | EventData) => void;
}) => {
  const [draft, setDraft] = useState<ClubData | EventData>(listing);
  const { addToast } = useAppStore();
  const owner = users.find((user) => user.id === draft.postedByUserId);
  const semv2Collections = useMemo(() => ({
    listings,
    venues,
    organizations,
    relationships,
  }), [listings, organizations, relationships, venues]);

  const saveDraft = async (nextDraft = draft) => {
    const saved = nextDraft.type === 'club' ? await api.saveClub(nextDraft) : await api.saveEvent(nextDraft);
    setDraft(saved);
    addToast({ message: `${saved.name} saved.`, type: 'success' });
    onSaved(saved);
  };

  const saveStatus = async (status: Listing['status']) => {
    const nextDraft = { ...draft, status } as ClubData | EventData;
    setDraft(nextDraft);
    await saveDraft(nextDraft);
  };

  const deleteListing = async () => {
    if (!window.confirm(`Delete "${draft.name}"? This cannot be undone.`)) return;
    await api.deleteListing(draft.id);
    addToast({ message: `${draft.name} deleted.`, type: 'success' });
    onBack();
  };

  const createVenueFromDraft = async () => {
    const savedVenue = await api.saveVenue(buildVenueFromListing(draft));
    onVenueSaved(savedVenue);

    if (draft.type === 'club') {
      const nextDraft = syncListingPhysicalFieldsFromVenue({ ...draft, primaryVenueId: savedVenue.id } as ClubData, savedVenue);
      setDraft(nextDraft);
      if (nextDraft.ownerOrganizationId) {
        const savedRelationship = await api.saveOrganizationVenueRelationship({
          id: `rel-${nextDraft.ownerOrganizationId}-${savedVenue.id}`,
          organizationId: nextDraft.ownerOrganizationId,
          venueId: savedVenue.id,
          relationshipType: 'owner_operator',
          label: 'Primary club venue',
          isPrimary: true,
          confidence: 1,
        });
        onRelationshipSaved(savedRelationship);
      }
      await saveDraft(nextDraft);
      return;
    }

    const nextDraft = syncListingPhysicalFieldsFromVenue({ ...draft, venueId: savedVenue.id } as EventData, savedVenue);
    setDraft(nextDraft);
    await saveDraft(nextDraft);
  };

  const sections = useMemo<SectionConfig[]>(() => {
    const shared: SectionConfig[] = [
      {
        id: 'basic',
        title: 'Basic Information',
        defaultOpen: true,
        saveLabel: 'Save Basic',
        onSave: () => saveDraft(),
        render: () => (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name"><input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value } as ClubData | EventData)} /></Field>
            <Field label="Contact email"><input className={inputClass} value={draft.contactEmail} onChange={(event) => setDraft({ ...draft, contactEmail: event.target.value } as ClubData | EventData)} /></Field>
            <Field label="Website"><input className={inputClass} value={draft.website ?? ''} onChange={(event) => setDraft({ ...draft, website: event.target.value } as ClubData | EventData)} /></Field>
            {draft.type === 'event' && <Field label="Host name"><input className={inputClass} value={draft.hostName} onChange={(event) => setDraft({ ...draft, hostName: event.target.value })} /></Field>}
            <div className="md:col-span-2">
              <Field label="Description">
                <textarea
                  className={`${inputClass} min-h-32`}
                  value={draft.type === 'club' ? draft.description_short : draft.description_full}
                  onChange={(event) => setDraft(draft.type === 'club' ? { ...draft, description_short: event.target.value } : { ...draft, description_full: event.target.value })}
                />
              </Field>
            </div>
          </div>
        ),
      },
      {
        id: 'address',
        title: 'Address & Map',
        saveLabel: 'Save Address',
        onSave: () => saveDraft(),
        render: () => (
          <AddressSection
            geopoint={draft.geopoint}
            locationMeta={draft.locationMeta}
            listingType={draft.type}
            onChange={(geopoint) => setDraft({ ...draft, geopoint, location: makeAddress(geopoint) } as ClubData | EventData)}
            onLocationMetaChange={(locationMeta) => setDraft({ ...draft, locationMeta } as ClubData | EventData)}
          />
        ),
      },
      {
        id: 'images',
        title: 'Images',
        saveLabel: 'Save Images',
        onSave: () => saveDraft(),
        render: () => (
          <ImagesSection
            ownerType={draft.type}
            ownerId={draft.id}
            mediaAssets={draft.mediaAssets}
            logoImageUrl={draft.logoImageUrl}
            headerImageUrl={draft.headerImageUrl}
            galleryImageUrls={draft.galleryImageUrls}
            onAssetUploaded={(asset) => setDraft((current) => ({
              ...current,
              mediaAssets: asset.role === 'gallery'
                ? [...(current.mediaAssets ?? []), asset]
                : [...(current.mediaAssets ?? []).filter((item) => item.role !== asset.role), asset],
            } as ClubData | EventData))}
            onLogoChange={(logoImageUrl) => setDraft((current) => ({ ...current, logoImageUrl } as ClubData | EventData))}
            onHeaderChange={(headerImageUrl) => setDraft((current) => ({ ...current, headerImageUrl } as ClubData | EventData))}
            onGalleryChange={(galleryImageUrls) => setDraft((current) => ({ ...current, galleryImageUrls } as ClubData | EventData))}
          />
        ),
      },
    ];

    if (draft.type === 'club') {
      shared.push(
        {
          id: 'access',
          title: 'Access',
          saveLabel: 'Save Access',
          onSave: () => saveDraft(),
          render: () => (
            <AccessSection
              attendancePolicy={draft.attendancePolicy}
              entryRequirements={draft.entryRequirements}
              onAttendancePolicyChange={(attendancePolicy) => setDraft({ ...draft, attendancePolicy })}
              onEntryRequirementsChange={(entryRequirements) => setDraft({ ...draft, entryRequirements })}
            />
          ),
        },
        {
          id: 'tags',
          title: 'Tags',
          saveLabel: 'Save Tags',
          onSave: () => saveDraft(),
          render: () => <TagSelector kind="club" selected={draft.generalAmenities} onChange={(generalAmenities) => setDraft({ ...draft, generalAmenities })} />,
        },
        {
          id: 'schedule',
          title: 'Schedule',
          saveLabel: 'Save Schedule',
          onSave: () => saveDraft(),
          render: () => (
            <div className="grid gap-4">
              <Field label="Special schedule notes"><textarea className={`${inputClass} min-h-24`} value={draft.specialScheduleNotes ?? ''} onChange={(event) => setDraft({ ...draft, specialScheduleNotes: event.target.value })} /></Field>
              <DebugSection value={draft.schedule} />
            </div>
          ),
        },
        {
          id: 'relationships',
          title: 'Relationships',
          saveLabel: 'Save Relationships',
          onSave: async () => {
            if (draft.type === 'club' && draft.primaryVenueId && draft.ownerOrganizationId) {
              const savedRelationship = await api.saveOrganizationVenueRelationship({
                id: `rel-${draft.ownerOrganizationId}-${draft.primaryVenueId}`,
                organizationId: draft.ownerOrganizationId,
                venueId: draft.primaryVenueId,
                relationshipType: 'owner_operator',
                label: 'Primary club venue',
                isPrimary: true,
                confidence: 1,
              });
              onRelationshipSaved(savedRelationship);
            }
            await saveDraft();
          },
          render: () => (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <VenueSelect
                  label="Primary Venue"
                  venues={venues}
                  value={draft.primaryVenueId ?? getPrimaryVenueForClub(draft, semv2Collections)?.id}
                  onChange={(primaryVenueId) => {
                    const selectedVenue = venues.find((venue) => venue.id === primaryVenueId);
                    setDraft(syncListingPhysicalFieldsFromVenue({ ...draft, primaryVenueId } as ClubData, selectedVenue));
                  }}
                  onCreateVenue={() => void createVenueFromDraft()}
                />
                <Field label="Owner / operator organization">
                  <select className={inputClass} value={draft.ownerOrganizationId ?? ''} onChange={(event) => setDraft({ ...draft, ownerOrganizationId: event.target.value })}>
                    <option value="">Not linked</option>
                    {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                  </select>
                </Field>
                <Field label="Club brand">
                  <select className={inputClass} value={draft.clubBrandId ?? ''} onChange={(event) => setDraft({ ...draft, clubBrandId: event.target.value })}>
                    <option value="">Independent / no brand</option>
                    {clubBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                  </select>
                </Field>
              </div>
              <EntityRelationshipPanel
                entityType="club"
                entity={draft}
                index={entityIndex}
                listings={listings}
                venues={venues}
                organizations={organizations}
                relationships={relationships}
                buildingAssets={buildingAssets}
              />
            </div>
          ),
        },
      );
    } else {
      shared.push(
        {
          id: 'access',
          title: 'Access',
          saveLabel: 'Save Access',
          onSave: () => saveDraft(),
          render: () => (
            <AccessSection
              attendancePolicy={draft.attendancePolicy}
              entryRequirements={draft.entryRequirements}
              isEvent
              onAttendancePolicyChange={(attendancePolicy) => setDraft({ ...draft, attendancePolicy })}
              onEntryRequirementsChange={(entryRequirements) => setDraft({ ...draft, entryRequirements })}
            />
          ),
        },
        {
          id: 'dates',
          title: 'Schedule',
          saveLabel: 'Save Dates',
          onSave: () => saveDraft(),
          render: () => (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Start"><input className={inputClass} type="datetime-local" value={draft.time.start.slice(0, 16)} onChange={(event) => setDraft({ ...draft, time: { ...draft.time, start: new Date(event.target.value).toISOString() } })} /></Field>
              <Field label="End"><input className={inputClass} type="datetime-local" value={draft.time.end.slice(0, 16)} onChange={(event) => setDraft({ ...draft, time: { ...draft.time, end: new Date(event.target.value).toISOString() } })} /></Field>
            </div>
          ),
        },
        {
          id: 'tickets',
          title: 'Tickets',
          saveLabel: 'Save Tickets',
          onSave: () => saveDraft(),
          render: () => <Field label="Ticket / RSVP URL"><input className={inputClass} value={draft.website ?? ''} onChange={(event) => setDraft({ ...draft, website: event.target.value })} /></Field>,
        },
        {
          id: 'tags',
          title: 'Tags',
          saveLabel: 'Save Tags',
          onSave: () => saveDraft(),
          render: () => <TagSelector kind="event" selected={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} />,
        },
        {
          id: 'relationships',
          title: 'Relationships',
          saveLabel: 'Save Relationships',
          onSave: () => saveDraft(),
          render: () => (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <VenueSelect
                  label="Venue"
                  venues={venues}
                  value={draft.venueId ?? getVenueForEvent(draft, semv2Collections)?.id}
                  onChange={(venueId) => {
                    const selectedVenue = venues.find((venue) => venue.id === venueId);
                    setDraft(syncListingPhysicalFieldsFromVenue({ ...draft, venueId } as EventData, selectedVenue));
                  }}
                  onCreateVenue={() => void createVenueFromDraft()}
                />
                <Field label="Private address"><select className={inputClass} value={draft.isAddressPrivate ? 'yes' : 'no'} onChange={(event) => setDraft({ ...draft, isAddressPrivate: event.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes</option></select></Field>
                <Field label="Legacy venue key"><input className={inputClass} value={draft.venueKey ?? ''} onChange={(event) => setDraft({ ...draft, venueKey: event.target.value })} /></Field>
                <Field label="Organizer ID"><input className={inputClass} value={draft.organizerOrganizationId ?? resolveEventOrganizerOrganizationId(draft, semv2Collections) ?? ''} onChange={(event) => setDraft({ ...draft, organizerOrganizationId: event.target.value || undefined })} /></Field>
              </div>
              <EntityRelationshipPanel
                entityType="event"
                entity={draft}
                index={entityIndex}
                listings={listings}
                venues={venues}
                organizations={organizations}
                relationships={relationships}
                buildingAssets={buildingAssets}
              />
            </div>
          ),
        },
      );
    }

    shared.push(
      {
        id: 'moderation',
        title: 'Moderation',
        saveLabel: 'Save Moderation',
        onSave: () => saveDraft(),
        render: () => <ModerationSection status={draft.status} onChange={(status) => setDraft({ ...draft, status } as ClubData | EventData)} />,
      },
      {
        id: 'metadata',
        title: 'Metadata',
        saveLabel: 'Save Metadata',
        onSave: () => saveDraft(),
        render: () => (
          <MetadataSection rows={[
            ['Posted by', draft.postedByUserId],
            ['Location status', draft.locationMeta?.status ?? 'Unvalidated'],
            ['Building asset', draft.buildingAssetId ?? 'None'],
            ['Coordinates', `${draft.geopoint.latitude}, ${draft.geopoint.longitude}`],
          ]} />
        ),
      },
      {
        id: 'debug',
        title: 'Debug',
        render: () => <DebugSection value={draft} />,
      },
    );

    return shared;
  }, [buildingAssets, draft, entityIndex, listings, organizations, relationships, semv2Collections, venues]);

  return (
    <AdminEditorPage
      title={draft.name}
      entityType={draft.type === 'club' ? 'Club' : 'Event'}
      entityId={draft.id}
      owner={owner?.displayName}
      status={draft.status}
      sections={sections}
      onBack={onBack}
      onSave={() => saveDraft()}
      onPublish={() => saveStatus('approved')}
      onArchive={() => saveStatus('flagged')}
      onDelete={deleteListing}
    />
  );
};

export const AdminUserDetailEditor = ({
  user,
  onBack,
  onSaved,
}: {
  user: User;
  onBack: () => void;
  onSaved: (user: User) => void;
}) => {
  const [draft, setDraft] = useState<User>(user);
  const { addToast } = useAppStore();

  const saveDraft = async () => {
    const saved = await api.updateUser(draft);
    setDraft(saved);
    addToast({ message: `${saved.displayName} saved.`, type: 'success' });
    onSaved(saved);
  };

  const sections: SectionConfig[] = [
    {
      id: 'profile',
      title: 'Profile',
      defaultOpen: true,
      saveLabel: 'Save Profile',
      onSave: saveDraft,
      render: () => (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Display name"><input className={inputClass} value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></Field>
          <Field label="Email"><input className={inputClass} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></Field>
          <Field label="Avatar URL"><input className={inputClass} value={draft.avatarUrl ?? ''} onChange={(event) => setDraft({ ...draft, avatarUrl: event.target.value })} /></Field>
          <Field label="Avatar safety"><select className={inputClass} value={draft.isAvatarNsfw ? 'nsfw' : 'safe'} onChange={(event) => setDraft({ ...draft, isAvatarNsfw: event.target.value === 'nsfw' })}><option value="safe">Safe</option><option value="nsfw">NSFW</option></select></Field>
        </div>
      ),
    },
    {
      id: 'permissions',
      title: 'Permissions',
      saveLabel: 'Save Permissions',
      onSave: saveDraft,
      render: () => (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Role"><select className={inputClass} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as User['role'] })}><option value="User">User</option><option value="Host">Host</option><option value="Admin">Admin</option></select></Field>
          <Field label="Badges"><textarea className={`${inputClass} min-h-24`} value={(draft.badges ?? []).join('\n')} onChange={(event) => setDraft({ ...draft, badges: normalizeList(event.target.value) })} /></Field>
        </div>
      ),
    },
    {
      id: 'activity',
      title: 'Activity',
      render: () => <MetadataSection rows={[['Submissions', draft.submissionCount], ['Joined', formatDate(draft.joinDate)]]} />,
    },
    {
      id: 'submissions',
      title: 'Submissions',
      render: () => <EmptySection text="User-owned listing review can plug in here once the admin detail framework receives cross-entity relationship queries." />,
    },
    {
      id: 'moderation',
      title: 'Moderation',
      saveLabel: 'Save Moderation',
      onSave: saveDraft,
      render: () => <Field label="Status"><select className={inputClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as User['status'] })}><option value="Active">Active</option><option value="Suspended">Suspended</option></select></Field>,
    },
    {
      id: 'metadata',
      title: 'Metadata',
      render: () => <MetadataSection rows={[['User ID', draft.id], ['Email', draft.email], ['Role', draft.role], ['Status', draft.status]]} />,
    },
    {
      id: 'debug',
      title: 'Debug',
      render: () => <DebugSection value={draft} />,
    },
  ];

  return (
    <AdminEditorPage
      title={draft.displayName}
      entityType="User"
      entityId={draft.id}
      owner={draft.email}
      status={draft.status}
      created={draft.joinDate}
      sections={sections}
      onBack={onBack}
      onSave={saveDraft}
      onPublish={() => {
        const nextDraft = { ...draft, status: 'Active' as const };
        setDraft(nextDraft);
        return api.updateUser(nextDraft).then((saved) => {
          setDraft(saved);
          onSaved(saved);
        });
      }}
      onArchive={() => {
        const nextDraft = { ...draft, status: 'Suspended' as const };
        setDraft(nextDraft);
        return api.updateUser(nextDraft).then((saved) => {
          setDraft(saved);
          onSaved(saved);
        });
      }}
    />
  );
};
