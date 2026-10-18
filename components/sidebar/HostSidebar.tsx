import React from 'react';
import { ArrowRight, CalendarDays, Globe2, MapPinned, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EventData, OrganizationData } from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';
import { getListingCanonicalPath } from '../../lib/entityUtils';

interface HostSidebarProps {
  organization: OrganizationData;
  events: EventData[];
  onClose: () => void;
  entityIndex?: EntityIndex;
  mode?: 'drawer' | 'embedded' | 'floating';
}

const HostSidebar: React.FC<HostSidebarProps> = ({ organization, events, onClose, entityIndex, mode = 'drawer' }) => {
  const regions = organization.globePresence?.regions.filter((region) => region.status !== 'inactive') ?? [];
  const primaryRegion = regions[0];
  const upcomingEvents = [...events]
    .filter((event) => new Date(event.time.end).getTime() >= Date.now())
    .sort((a, b) => new Date(a.time.start).getTime() - new Date(b.time.start).getTime())
    .slice(0, 3);
  const displayType = organization.displayTypes.includes('promoter') ? 'Promoter' : 'Host';
  const regionLabels = regions.map((region) => region.label).filter(Boolean);
  const fallbackRegionLabels = organization.operatingRegions?.filter(Boolean) ?? [];
  const allRegionLabels = regionLabels.length ? regionLabels : fallbackRegionLabels;
  const visibleRegionLabels = allRegionLabels.slice(0, 2);
  const remainingRegionCount = Math.max(0, allRegionLabels.length - visibleRegionLabels.length);
  const regionSummary = visibleRegionLabels.length
    ? `${visibleRegionLabels.join(' · ')}${remainingRegionCount ? ` · +${remainingRegionCount} more` : ''}`
    : 'Regional host presence';
  const shellClass = mode === 'floating'
    ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] text-gray-100'
    : mode === 'embedded'
      ? 'ss-glass ss-glass--liquid flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100'
      : 'ss-glass ss-glass--liquid absolute right-0 top-0 z-20 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] text-gray-100 transition-transform duration-300 ease-in-out sm:w-[400px]';
  const heroImage = organization.headerImageUrl || organization.logoImageUrl || '/swingsphere-logo_2.png';
  const logoImage = organization.logoImageUrl || '/swingsphere-logo_2.png';

  const heroClass = mode === 'floating'
    ? 'relative h-40 shrink-0 xl:h-48'
    : 'relative h-48 shrink-0 xl:h-52';
  const contentClass = mode === 'embedded' || mode === 'floating'
    ? 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [scrollbar-width:thin]'
    : 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 [scrollbar-width:thin]';

  return (
    <div className={shellClass}>
      <div className={heroClass}>
        <img src={heroImage} alt={organization.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <button onClick={onClose} className="ss-glass ss-glass--liquid ss-glass--interactive absolute right-3.5 top-3.5 rounded-full p-2 text-white" aria-label="Close host details">
          <X className="h-5 w-5" />
        </button>
        <div className="ss-glass ss-glass--liquid absolute left-4 top-3.5 h-12 w-12 xl:h-16 xl:w-16 overflow-hidden rounded-[16px] xl:rounded-[18px]">
          <img src={logoImage} alt={`${organization.name} logo`} className="h-full w-full object-contain" />
        </div>
        <div className="absolute bottom-3.5 left-4 right-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/hosts/${organization.slug}`}
              className={`${mode === 'floating' ? 'text-xl xl:text-2xl' : 'text-2xl'} block truncate font-bold leading-tight text-white transition hover:text-blue-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300`}
            >
              {organization.name}
            </Link>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs xl:text-sm text-gray-300">
              <MapPinned className="h-3.5 w-3.5 xl:h-4 xl:w-4 shrink-0 text-blue-300" />
              <span className="truncate">{primaryRegion?.label || organization.operatingRegions?.[0] || 'Multiple operating regions'}</span>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-blue-400/50 bg-blue-500/18 px-2.5 py-0.5 text-[10px] xl:text-[11px] font-bold uppercase tracking-[0.14em] text-blue-100 backdrop-blur-md">{displayType}</span>
        </div>
      </div>

      <div className={contentClass}>
        <section className="ss-glass ss-glass--ambient shrink-0 rounded-2xl p-4">
          <p className="whitespace-pre-line text-sm leading-6 text-gray-300">
            {organization.descriptionFull || organization.descriptionShort || `${organization.name} produces recurring lifestyle events and community experiences.`}
          </p>
        </section>

        <section className="ss-glass ss-glass--ambient shrink-0 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <Globe2 className="h-5 w-5 shrink-0 text-blue-300" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{regions.length || organization.operatingRegions?.length || 1} operating region{(regions.length || organization.operatingRegions?.length || 1) === 1 ? '' : 's'}</div>
              <div className="max-w-full truncate text-xs text-gray-500" title={allRegionLabels.join(' · ')}>{regionSummary}</div>
            </div>
          </div>
        </section>

        <section className="ss-glass ss-glass--ambient flex shrink-0 flex-col rounded-2xl p-4">
          <div className="mb-3 flex shrink-0 items-center gap-2 text-blue-200">
            <CalendarDays className="h-4 w-4" />
            <div className="text-xs font-bold uppercase tracking-wide">
              {upcomingEvents.length ? `${upcomingEvents.length} upcoming event${upcomingEvents.length === 1 ? '' : 's'}` : 'Upcoming events'}
            </div>
          </div>
          {upcomingEvents.length ? (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <Link
                  key={event.id}
                  to={getListingCanonicalPath(event, entityIndex)}
                  className="group block shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition hover:border-blue-400/35 hover:bg-blue-500/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-sm font-semibold text-white" title={event.name}>{event.name}</div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-500 transition group-hover:translate-x-0.5 group-hover:text-blue-200" />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{new Date(event.time.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-4 text-sm text-gray-400">
              No upcoming events listed.
            </div>
          )}
        </section>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-4 pb-4 pt-3">
        <Link
          to={`/hosts/${organization.slug}`}
          className="ss-glass ss-glass--liquid ss-glass--interactive ss-discovery-next-step ss-discovery-next-step--host relative z-10 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[rgba(8,22,44,0.94)] px-5 text-base font-bold text-white shadow-[0_-8px_24px_rgba(0,0,0,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-blue-300"
        >
          View Host Profile
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};

export default HostSidebar;
