import React from 'react';
import { CalendarDays, ExternalLink, MapPin, Pencil, ShieldCheck } from 'lucide-react';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import EntityTypePill from '../entity/EntityTypePill';
import BadgeShelf from '../badges/BadgeShelf';
import type { BadgeAwardView } from '../../lib/badges/badgeTypes';
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
  themePills,
  logoImageUrl,
  headerImageUrl,
  description,
  operatorName,
  displayLabel = 'Promoter',
  regions = [],
  website,
  eventsListed = 0,
  hostingSince,
  badges = [],
  onQuickEdit,
}) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControls = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);

  return (
    <section className="relative mt-6 overflow-hidden rounded-[30px] border border-white/10 bg-black/55 shadow-2xl shadow-black/40">
      <div className="relative min-h-[360px] sm:min-h-[420px]">
        {headerImageUrl ? (
          <img src={headerImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(185,28,28,0.28),transparent_34%),linear-gradient(135deg,#17191f,#07090d_62%,#14070a)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/48 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/20" />
        {showQuickControls ? (
          <div className="absolute right-4 top-4 z-20 flex flex-wrap gap-2">
            <button type="button" onClick={() => onQuickEdit?.('hero')} className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Hero</button>
            <button type="button" onClick={() => onQuickEdit?.('profile')} className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Profile</button>
          </div>
        ) : null}

        <div className="relative flex min-h-[360px] items-end p-4 sm:min-h-[420px] sm:p-7">
          <div className="w-full max-w-3xl">
            <div className="ss-glass ss-glass--liquid rounded-[26px] p-4 sm:p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="shrink-0">
                  <div className="ss-glass ss-glass--liquid relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[22px] text-3xl font-black text-white sm:h-28 sm:w-28">
                    {logoImageUrl ? <img src={logoImageUrl} alt={`${hostName} logo`} className="h-full w-full object-contain" /> : <><span className="font-serif text-4xl tracking-[-0.12em] text-white sm:text-5xl">{toInitials(hostName)}</span><span className="absolute bottom-3 h-0.5 w-9 rotate-[-18deg] bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.8)]" /></>}
                  </div>
                  {showQuickControls ? <button type="button" onClick={() => onQuickEdit?.('logo')} className="mt-2 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Logo</button> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{hostName}</h1>
                    <EntityTypePill tone="host">{displayLabel}</EntityTypePill>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-200 sm:text-base">{description || cadenceText}</p>
                  {operatorName ? <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Operated by <span className="normal-case tracking-normal text-gray-200">{operatorName}</span></p> : null}
                  {regions.length ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-gray-300">
                      <MapPin size={14} className="text-red-300" />
                      {regions.slice(0, 4).map((region, index) => <React.Fragment key={region}><span>{region}</span>{index < Math.min(regions.length, 4) - 1 ? <span className="text-gray-600">•</span> : null}</React.Fragment>)}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive rounded-xl px-5 py-2.5 text-sm font-bold text-white">+ Follow</button>
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
                        className="ss-glass ss-glass--ambient ss-glass--interactive inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-gray-100"
                      >
                        Visit website <ExternalLink size={14} />
                      </TrackedExternalLink>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {badges.length ? (
              <BadgeShelf
                badges={badges}
                limit={4}
                compact
                heading="Organizer achievements"
                className="ss-glass ss-glass--ambient mt-3 rounded-2xl p-3"
              />
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <div className="ss-glass ss-glass--ambient flex items-center gap-3 rounded-2xl px-4 py-3"><CalendarDays size={18} className="text-red-300" /><div><div className="font-bold text-white">{eventsListed}</div><div className="text-[11px] text-gray-400">events listed</div></div></div>
              <div className="ss-glass ss-glass--ambient flex items-center gap-3 rounded-2xl px-4 py-3"><ShieldCheck size={18} className="text-red-300" /><div><div className="font-bold text-white">Profile</div><div className="text-[11px] text-gray-400">promoter identity</div></div></div>
              {hostingSince ? <div className="ss-glass ss-glass--ambient rounded-2xl px-4 py-3"><div className="font-bold text-white">Since {hostingSince}</div><div className="text-[11px] text-gray-400">on SwingSphere</div></div> : null}
            </div>
          </div>
        </div>
      </div>

      {themePills.length ? (
        <details className="border-t border-white/10 bg-black/20 px-5 py-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-gray-300">Styles & audience</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {themePills.slice(0, 8).map((pill) => <span key={pill} className="ss-glass ss-glass--ambient rounded-full px-3 py-1 text-xs text-gray-200">{pill}</span>)}
          </div>
        </details>
      ) : null}
    </section>
  );
};

export default HostHero;
