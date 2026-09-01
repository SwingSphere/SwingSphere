import React, { useMemo, useState } from 'react';
import type { BuildingAsset, Listing, OrganizationData, OrganizationVenueRelationship, VenueData } from '../../types';
import {
  BUILDING_AUDIT_CATEGORY_LABELS,
  buildBuildingCatalogShadowReport,
  type BuildingAuditCategory,
} from '../../lib/buildingShadowAudit';
import type { BuildingVerificationEvidenceRecord } from '../../lib/buildingVerificationEvidence';

type Props = {
  listings: Listing[];
  venues: VenueData[];
  organizations: OrganizationData[];
  relationships: OrganizationVenueRelationship[];
  buildingAssets: BuildingAsset[];
  evidenceRecords: BuildingVerificationEvidenceRecord[];
  onSelectListing: (listingId: string) => void;
};

const queueOrder: BuildingAuditCategory[] = [
  'automatic_verification_candidate',
  'probable_quick_review',
  'address_mismatch',
  'pin_location_review',
  'ambiguous_buildings',
  'no_provider_footprint',
  'needs_provider_evaluation',
  'private_approximate_skipped',
  'has_verified_shared_asset',
];

const queueTone: Record<BuildingAuditCategory, string> = {
  automatic_verification_candidate: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
  probable_quick_review: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  ambiguous_buildings: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  address_mismatch: 'border-rose-400/25 bg-rose-400/10 text-rose-100',
  pin_location_review: 'border-rose-400/25 bg-rose-400/10 text-rose-100',
  no_provider_footprint: 'border-zinc-400/20 bg-zinc-400/10 text-zinc-200',
  needs_provider_evaluation: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
  private_approximate_skipped: 'border-violet-300/20 bg-violet-300/10 text-violet-100',
  has_verified_shared_asset: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
};

const BuildingVerificationAuditPanel: React.FC<Props> = ({
  listings,
  venues,
  organizations,
  relationships,
  buildingAssets,
  evidenceRecords,
  onSelectListing,
}) => {
  const [selectedQueue, setSelectedQueue] = useState<BuildingAuditCategory>('needs_provider_evaluation');
  const report = useMemo(() => buildBuildingCatalogShadowReport(
    listings,
    buildingAssets,
    { listings, venues, organizations, relationships },
    new Date().toISOString(),
    evidenceRecords,
  ), [buildingAssets, evidenceRecords, listings, organizations, relationships, venues]);
  const queueEntries = report.entries.filter((entry) => entry.category === selectedQueue);

  return (
    <details className="group border-b border-white/10 bg-sky-300/[0.025]">
      <summary className="cursor-pointer list-none px-4 py-3 transition-colors hover:bg-white/[0.03]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">Shadow verification audit</div>
            <div className="mt-1 text-[11px] text-zinc-500">No automatic writes · {report.totals.publicListings} public listings classified</div>
          </div>
          <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-sky-100">
            {report.totals.needsProviderEvaluation} exceptions
          </span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-white/10 px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-2"><div className="text-lg font-black text-zinc-100">{report.totals.publicExactAddressListingsEvaluated}</div><div className="text-[9px] uppercase tracking-wide text-zinc-600">Exact-address audited</div></div>
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-2"><div className="text-lg font-black text-emerald-200">{report.totals.hasVerifiedOrSharedAsset}</div><div className="text-[9px] uppercase tracking-wide text-emerald-300/60">Preserved assets</div></div>
          <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-2"><div className="text-lg font-black text-rose-200">{report.totals.pinLocationReview + report.totals.noUsableProviderFootprint}</div><div className="text-[9px] uppercase tracking-wide text-rose-300/60">Location / geometry</div></div>
        </div>
        <p className="text-[10px] leading-4 text-zinc-500">
          “Needs provider evaluation” means no footprint evidence has been collected yet. It is deliberately not mislabeled as “no building data.”
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {queueOrder.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedQueue(category)}
              className={`shrink-0 rounded-lg border px-2 py-1.5 text-[9px] font-semibold transition-opacity ${queueTone[category]} ${selectedQueue === category ? 'opacity-100 ring-1 ring-white/20' : 'opacity-55 hover:opacity-85'}`}
              title={BUILDING_AUDIT_CATEGORY_LABELS[category]}
            >
              {BUILDING_AUDIT_CATEGORY_LABELS[category]} · {report.categories[category]}
            </button>
          ))}
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {queueEntries.map((entry) => (
            <button
              key={entry.listingId}
              type="button"
              onClick={() => onSelectListing(entry.listingId)}
              className="block w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-sky-300/25 hover:bg-sky-300/[0.06]"
            >
              <div className="flex items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold text-zinc-200">{entry.listingName}</span><span className="shrink-0 text-[9px] uppercase text-zinc-600">{entry.listingType}</span></div>
              <div className="mt-1 line-clamp-2 text-[9px] leading-3.5 text-zinc-500">{entry.reason}</div>
              {entry.warnings.map((warning) => <div key={warning} className="mt-1 text-[9px] text-amber-300/75">{warning}</div>)}
            </button>
          ))}
          {!queueEntries.length && <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[10px] text-zinc-600">No listings in this queue.</div>}
        </div>
      </div>
    </details>
  );
};

export default BuildingVerificationAuditPanel;
