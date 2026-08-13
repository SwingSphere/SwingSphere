import React from 'react';
import type { Listing } from '../../types';
import {
  formatEntryRequirements,
  getAudienceLabel,
  getCompactAudienceLabel,
  getPrimaryEntryRequirementLabel,
} from '../../lib/accessDisplay';

type ListingAccessSummaryProps = {
  listing: Listing;
  variant?: 'card' | 'detail' | 'panel';
};

const accessPillClass =
  'rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-200';

const audiencePillClass =
  'rounded-full border border-red-300/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-100';

export const ListingAccessSummary: React.FC<ListingAccessSummaryProps> = ({
  listing,
  variant = 'card',
}) => {
  const entryRequirements = listing.entryRequirements ?? [];
  const primaryEntry = getPrimaryEntryRequirementLabel(entryRequirements, { compact: true });
  const extraEntryCount = Math.max(0, entryRequirements.length - 1);

  if (variant === 'card') {
    const compactLabels = [
      getCompactAudienceLabel(listing.attendancePolicy),
      ...entryRequirements.map((requirement) => formatEntryRequirements([requirement], { emptyLabel: '' })).filter(Boolean),
    ];
    const remainingCount = Math.max(0, compactLabels.length - 1);

    return (
      <div className="mt-2 flex items-center gap-1.5">
        <span className={audiencePillClass}>{compactLabels[0]}</span>
        {remainingCount > 0 ? <span className={accessPillClass}>+{remainingCount}</span> : null}
      </div>
    );
  }

  if (variant === 'panel') {
    return (
      <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-100">Access</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={audiencePillClass}>{getCompactAudienceLabel(listing.attendancePolicy)}</span>
          {primaryEntry ? <span className={accessPillClass}>{primaryEntry}</span> : null}
          {extraEntryCount > 0 ? <span className={accessPillClass}>+{extraEntryCount}</span> : null}
        </div>
        {!primaryEntry ? (
          <p className="mt-2 text-xs text-gray-500">Entry / Screening: None listed</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/65 p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Access</p>
        <h2 className="mt-1 text-xl font-semibold text-gray-100">Who Can Attend</h2>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Audience</div>
          <div className="mt-2">
            <span className={audiencePillClass}>{getAudienceLabel(listing.attendancePolicy)}</span>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Entry Requirements</div>
          {entryRequirements.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {entryRequirements.map((requirement) => {
                const label = formatEntryRequirements([requirement], { emptyLabel: '' });
                return label ? <span key={requirement} className={accessPillClass}>{label}</span> : null;
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No special entry requirements listed.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default ListingAccessSummary;

