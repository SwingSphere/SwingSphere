import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Image as ImageIcon, Layers, Search, Sparkles, X } from 'lucide-react';
import * as api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import {
  buildCanonicalMediaCatalog,
  type CanonicalAssetCategory,
  type CanonicalMediaAsset,
} from '../../lib/media/canonicalAssetModel';
import { getMediaRule } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaOwnerType, MediaRole } from '../../lib/media/types';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';

export interface MediaLibraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRole?: MediaRole;
  targetOwnerType?: MediaOwnerType;
  targetOwnerId?: string;
  targetEntityName?: string;
  preloadedAssets?: CanonicalMediaAsset[];
  onSelectCanonicalAsset: (selection: {
    canonicalAsset: CanonicalMediaAsset;
    syntheticMediaAsset: MediaAsset;
    resolvedUrl: string;
  }) => void;
}

const CATEGORY_TABS: Array<{ id: CanonicalAssetCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'logo', label: 'Logos' },
  { id: 'hero', label: 'Heroes' },
  { id: 'flyer', label: 'Flyers' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'other', label: 'Other' },
];

const roleToDefaultCategory = (role?: MediaRole): CanonicalAssetCategory => {
  if (role === 'logo') return 'logo';
  if (role === 'flyer') return 'flyer';
  if (role === 'hero' || role === 'cover') return 'hero';
  if (role === 'gallery') return 'gallery';
  return 'all';
};

export const MediaLibraryPickerModal: React.FC<MediaLibraryPickerModalProps> = ({
  isOpen,
  onClose,
  targetRole = 'hero',
  targetOwnerType = 'event',
  targetOwnerId = '',
  targetEntityName,
  preloadedAssets,
  onSelectCanonicalAsset,
}) => {
  const [assets, setAssets] = useState<CanonicalMediaAsset[]>(preloadedAssets ?? []);
  const [isLoading, setIsLoading] = useState(!preloadedAssets?.length);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CanonicalAssetCategory>(() =>
    roleToDefaultCategory(targetRole),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setCategoryFilter(roleToDefaultCategory(targetRole));
  }, [targetRole, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (preloadedAssets && preloadedAssets.length > 0) {
      setAssets(preloadedAssets);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const [
          listings,
          organizations,
          venues,
          relationships,
          eventSeries,
          clubBrands,
          resorts,
          cruiseSeries,
          cruiseSailings,
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
          supabase
            .from('media_assets')
            .select('*')
            .neq('status', 'deleted')
            .order('created_at', { ascending: false })
            .limit(500),
        ]);
        if (cancelled) return;
        const catalog = buildCanonicalMediaCatalog({
          listings,
          organizations,
          venues,
          relationships,
          eventSeries,
          clubBrands,
          resorts,
          cruiseSeries,
          cruiseSailings,
          mediaAssetRows: (mediaRowsRes.data as MediaAsset[] | null) ?? [],
        });
        setAssets(catalog.assets);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, preloadedAssets]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((asset) => {
      if (categoryFilter !== 'all' && asset.primaryCategory !== categoryFilter && !asset.roles.includes(categoryFilter as MediaRole)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        asset.title,
        asset.filename,
        asset.externalId ?? '',
        asset.originalPreviewUrl,
        ...asset.usages.map((u) => `${u.entityName} ${u.entityId}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assets, categoryFilter, searchQuery]);

  const selectedAsset = useMemo(
    () => filteredAssets.find((a) => a.canonicalId === selectedId) ?? assets.find((a) => a.canonicalId === selectedId) ?? null,
    [assets, filteredAssets, selectedId],
  );

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedAsset) return;
    const rule = getMediaRule(targetRole);
    const extId = selectedAsset.externalId ?? selectedAsset.canonicalId;
    const syntheticMediaAsset: MediaAsset = {
      id: selectedAsset.dbRecords[0]?.id ?? `library-${targetOwnerType}-${targetRole}-${Date.now()}`,
      owner_type: targetOwnerType,
      owner_id: targetOwnerId ? getMediaOwnerId(targetOwnerType, targetOwnerId) : '00000000-0000-0000-0000-000000000000',
      role: targetRole,
      storage_provider: 'cloudflare_images',
      external_id: extId,
      status: 'approved',
      aspect_mode: rule.aspectMode,
      target_ratio: rule.targetRatio,
      alt_text: selectedAsset.title,
      sort_order: 0,
    };
    onSelectCanonicalAsset({
      canonicalAsset: selectedAsset,
      syntheticMediaAsset,
      resolvedUrl: selectedAsset.originalPreviewUrl,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Choose From Media Library"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b0d11] text-gray-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
              <Sparkles className="h-3.5 w-3.5" />
              Canonical Media Library
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Choose From Media Library
              {targetEntityName ? (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  for {targetEntityName} ({targetRole})
                </span>
              ) : null}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-gray-400 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Close Media Library Picker"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-5 py-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by asset name, filename, host, club, event, or ID..."
              className="w-full rounded-xl border border-white/10 bg-black/50 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-red-500/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
            {CATEGORY_TABS.map((tab) => {
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-red-500/20 text-red-200 ring-1 ring-red-500/50'
                      : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-white/10 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px] lg:divide-x lg:divide-y-0">
          {/* Grid */}
          <div className="overflow-y-auto p-4 sm:p-5">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center text-sm text-gray-400">
                Loading canonical media library…
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-sm text-gray-400">
                <ImageIcon className="mb-2 h-8 w-8 text-gray-600" />
                <p>No matching assets found in this category.</p>
                {categoryFilter !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className="mt-2 text-xs font-semibold text-red-300 hover:underline"
                  >
                    Show all asset categories
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {filteredAssets.slice(0, 80).map((asset) => {
                  const isSelected = asset.canonicalId === selectedId;
                  return (
                    <button
                      key={asset.canonicalId}
                      type="button"
                      onClick={() => setSelectedId(asset.canonicalId)}
                      className={`group flex flex-col overflow-hidden rounded-xl border text-left transition ${
                        isSelected
                          ? 'border-red-500 bg-red-500/[0.08] ring-1 ring-red-500/60'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#060709]">
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.altText}
                          loading="lazy"
                          className={`h-full w-full ${
                            asset.primaryCategory === 'logo' ? 'object-contain p-3' : 'object-cover'
                          }`}
                        />
                        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                          <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-200">
                            {asset.primaryCategory}
                          </span>
                          {asset.activeReferenceCount > 1 ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-950/85 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                              <Layers className="h-2.5 w-2.5" />
                              {asset.activeReferenceCount}
                            </span>
                          ) : null}
                        </div>
                        {isSelected ? (
                          <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow">
                            <Check className="h-3 w-3" />
                          </div>
                        ) : null}
                      </div>
                      <div className="p-2.5">
                        <div className="truncate text-xs font-semibold text-white">{asset.title}</div>
                        <div className="mt-0.5 truncate text-[11px] text-gray-400">
                          {asset.usages[0]?.entityName ?? asset.filename}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Preview Sidebar */}
          <div className="flex flex-col justify-between bg-black/30 p-4 sm:p-5">
            {selectedAsset ? (
              <div className="space-y-4 overflow-y-auto">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-[#060709] p-2">
                  <img
                    src={selectedAsset.originalPreviewUrl}
                    alt={selectedAsset.altText}
                    className="max-h-48 w-full rounded-lg object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{selectedAsset.title}</h3>
                  <p className="mt-0.5 break-all text-xs text-gray-400">{selectedAsset.filename}</p>
                </div>
                <dl className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
                  <div>
                    <dt className="text-gray-500">Category</dt>
                    <dd className="mt-0.5 font-medium uppercase text-gray-200">{selectedAsset.primaryCategory}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Active Uses</dt>
                    <dd className="mt-0.5 font-medium text-gray-200">
                      {selectedAsset.activeReferenceCount} listing{selectedAsset.activeReferenceCount === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-gray-500">Storage</dt>
                    <dd className="mt-0.5 truncate font-medium text-gray-300">{selectedAsset.storageLocationLabel}</dd>
                  </div>
                </dl>
                {selectedAsset.usages.length > 0 ? (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Currently Used By
                    </div>
                    <ul className="mt-1.5 max-h-32 space-y-1 overflow-y-auto text-xs text-gray-300">
                      {selectedAsset.usages.slice(0, 6).map((usage) => (
                        <li key={usage.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2 py-1">
                          <span className="truncate">{usage.entityName}</span>
                          <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-400">
                            {usage.assignmentKind === 'inherited' ? 'inherited' : usage.role}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center text-xs text-gray-500">
                <ImageIcon className="mb-2 h-7 w-7 text-gray-600" />
                Select an existing asset from the grid to inspect its usage and assign it without re-uploading.
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-gray-300 transition hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedAsset}
                onClick={handleConfirm}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                Assign Selected Asset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaLibraryPickerModal;
