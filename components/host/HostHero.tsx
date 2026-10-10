import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPin, Pencil } from 'lucide-react';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import EntityTypePill from '../entity/EntityTypePill';
import BadgeShelf from '../badges/BadgeShelf';
import type { BadgeAwardView } from '../../lib/badges/badgeTypes';
import { buildFallbackCandidateChain, markMediaUrlFailed } from '../../lib/listingImage';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import type { HostQuickEditField } from '../admin-edit/HostQuickEditPanel';

type HostHeroProps = {
  hostSlug: string;
  organizationId?: string;
  hostName: string;
  cadenceText: string;
  themePills: string[];
  logoImageUrl?: string;
  headerImageUrl?: string;
  description?: string;
  operatorName?: string;
  displayLabel?: string;
  regions?: string[];
  website?: string;
  eventsListed?: number;
  cruisesListed?: number;
  hostingSince?: string;
  badges?: BadgeAwardView[];
  onQuickEdit?: (field: HostQuickEditField) => void;
};

const toInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'H';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const HostHero: React.FC<HostHeroProps> = ({
  hostSlug,
  organizationId,
  hostName,
  cadenceText,
  logoImageUrl,
  headerImageUrl,
  operatorName,
  displayLabel = 'Promoter',
  regions = [],
  website,
  badges = [],
  onQuickEdit,
}) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControls = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);

  const headerCandidates = useMemo(
    () => buildFallbackCandidateChain([headerImageUrl], false),
    [headerImageUrl],
  );
  const logoCandidates = useMemo(
    () => buildFallbackCandidateChain([logoImageUrl], false),
    [logoImageUrl],
  );
  const [headerIdx, setHeaderIdx] = useState(0);
  const [logoIdx, setLogoIdx] = useState(0);

  useEffect(() => {
    setHeaderIdx(0);
  }, [headerCandidates]);

  useEffect(() => {
    setLogoIdx(0);
  }, [logoCandidates]);

  const activeHeaderUrl = headerCandidates[headerIdx] ?? null;
  const activeLogoUrl = logoCandidates[logoIdx] ?? null;

  return (
    <section className="relative mt-6 overflow-hidden rounded-[30px] border border-white/10 bg-black/55 shadow-2xl shadow-black/40">
      <div className="relative min-h-[360px] sm:min-h-[420px]">
        {activeHeaderUrl ? (
          <img
            src={activeHeaderUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => {
              const nextUrl = headerCandidates[headerIdx + 1] ?? null;
              markMediaUrlFailed(activeHeaderUrl, { entityId: organizationId ?? hostSlug, role: 'hero', nextUrl });
              setHeaderIdx((prev) => prev + 1);
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(185,28,28,0.28),transparent_34%),linear-gradient(135deg,#17191f,#07090d_62%,#14070a)]" />
        )}


        {showQuickControls ? (
          <div className="absolute right-4 top-4 z-30 flex flex-wrap gap-2 sm:right-6 sm:top-6">
            <button
              type="button"
              onClick={() => onQuickEdit?.('hero')}
              className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"
            >
              <Pencil size={14} /> Hero
            </button>
            <button
              type="button"
              onClick={() => onQuickEdit?.('profile')}
              className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"
            >
              <Pencil size={14} /> Profile
            </button>
          </div>
        ) : null}

        <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6">
          <div className="ss-glass ss-glass--liquid relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl text-2xl font-black text-white sm:h-24 sm:w-24">
            {activeLogoUrl ? (
              <img
                src={activeLogoUrl}
                alt={`${hostName} logo`}
                className="h-full w-full object-contain"
                onError={() => {
                  const nextUrl = logoCandidates[logoIdx + 1] ?? null;
                  markMediaUrlFailed(activeLogoUrl, { entityId: organizationId ?? hostSlug, role: 'logo', nextUrl });
                  setLogoIdx((prev) => prev + 1);
                }}
              />
            ) : (
              <>
                <span className="font-serif text-3xl tracking-[-0.12em] text-white sm:text-4xl">{toInitials(hostName)}</span>
                <span className="absolute bottom-3 h-0.5 w-8 rotate-[-18deg] bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.8)]" />
              </>
            )}
          </div>
          {showQuickControls ? (
            <button
              type="button"
              onClick={() => onQuickEdit?.('logo')}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"
            >
              <Pencil size={14} /> Logo
            </button>
          ) : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="max-w-4xl rounded-2xl p-4 [text-shadow:0_2px_6px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,0.9)]">
            <div className="flex flex-wrap items-center gap-2">
              <EntityTypePill tone="host">{displayLabel}</EntityTypePill>
              {operatorName ? (
                <span className="text-xs font-medium text-gray-400">
                  Operated by <span className="text-gray-200">{operatorName}</span>
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">{hostName}</h1>
                {regions.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-300">
                    <MapPin size={14} className="text-red-300" />
                    {regions.slice(0, 4).map((region, index) => (
                      <React.Fragment key={region}>
                        <span>{region}</span>
                        {index < Math.min(regions.length, 4) - 1 ? <span className="text-gray-600">•</span> : null}
                      </React.Fragment>
                    ))}
                  </div>
                ) : null}
                {cadenceText ? <p className="mt-1 text-sm text-gray-400">{cadenceText}</p> : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                >
                  + Follow
                </button>
                {website ? (
                  <TrackedExternalLink
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    tracking={{
                      entityType: organizationId ? 'organization' : 'profile',
                      entityId: organizationId ?? hostSlug,
                      organizationId,
                      destinationType: 'website',
                      placement: 'host_hero_website_cta',
                      surface: 'entity_page',
                    }}
                    className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-100"
                  >
                    Website <ExternalLink size={14} />
                  </TrackedExternalLink>
                ) : null}
              </div>
            </div>

            {badges.length ? (
              <BadgeShelf
                badges={badges}
                limit={4}
                compact
                heading="Organizer achievements"
                className="mt-3 border-t border-white/10 pt-3"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HostHero;
