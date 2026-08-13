import React, { useEffect, useState } from 'react';
import { BedDouble, CalendarDays, CarFront, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { resortsBySlug } from '../../data/travelExperiences';
import type { CruiseSailingData, CruiseSeriesData, OrganizationData, ResortData } from '../../types';
import * as api from '../../lib/api';
import TravelPageAdminEditor from '../admin-edit/TravelPageAdminEditor';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import EntityPageShell from '../entity/EntityPageShell';
import { TravelChipList, TravelFact, TravelHero, TravelSection } from '../travel/TravelPagePrimitives';
import TrackedExternalLink from '../analytics/TrackedExternalLink';

const ResortPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [resort, setResort] = useState<ResortData | null>(() => slug ? resortsBySlug.get(slug) ?? null : null);
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [cruiseSeries, setCruiseSeries] = useState<CruiseSeriesData[]>([]);
  const [sailings, setSailings] = useState<CruiseSailingData[]>([]);
  const { registerPublicPage, clearPublicPage } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({ organizationIds: [resort?.operatorOrganizationId] });

  useEffect(() => {
    let active = true;
    Promise.all([api.getResorts(), api.getOrganizations(), api.getCruiseSeries(), api.getCruiseSailings()])
      .then(([resorts, organizationRows, seriesRows, sailingRows]) => {
        if (!active) return;
        setResort(resorts.find((item) => item.slug === slug) ?? null);
        setOrganizations(organizationRows);
        setCruiseSeries(seriesRows);
        setSailings(sailingRows);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!resort) return;
    registerPublicPage({
      entityId: resort.id,
      entityType: 'resort',
      label: resort.name,
      canEdit,
      supportsInlineQuickEdit: false,
    });
    return () => clearPublicPage(resort.id);
  }, [canEdit, clearPublicPage, registerPublicPage, resort]);

  if (!resort) {
    return <div className="flex min-h-[60vh] items-center justify-center text-gray-400">Resort not found.</div>;
  }

  const location = [resort.geopoint.address.city, resort.geopoint.address.region, resort.geopoint.address.country]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <TravelPageAdminEditor entity={resort} organizations={organizations} cruiseSeries={cruiseSeries} sailings={sailings} canEdit={canEdit} />
      <EntityPageShell
      hero={
        <TravelHero
          typeLabel="Resort"
          title={resort.name}
          location={location}
          subtitle={resort.descriptionShort}
          imageUrl={resort.headerImageUrl}
          badge="Stay + Experience"
        />
      }
      main={
        <>
          <TravelSection eyebrow="The destination" title="Why stay here">
            <p className="text-sm leading-7 text-gray-300 sm:text-base">{resort.descriptionFull}</p>
          </TravelSection>

          <TravelSection eyebrow="On property" title="Resort experience">
            <TravelChipList items={resort.amenities} tone="violet" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {resort.experienceHighlights.map((highlight) => (
                <div key={highlight} className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm leading-6 text-gray-200">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
                  {highlight}
                </div>
              ))}
            </div>
          </TravelSection>

          <TravelSection eyebrow="Before you book" title="Access and expectations">
            <div className="grid gap-3 sm:grid-cols-2">
              {(resort.accessNotes ?? []).map((note) => (
                <div key={note} className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm leading-6 text-gray-300">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                  {note}
                </div>
              ))}
            </div>
          </TravelSection>

          <TravelSection eyebrow="Calendar" title="Upcoming at this resort">
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
              <CalendarDays className="mx-auto h-6 w-6 text-gray-500" />
              <p className="mt-3 text-sm font-semibold text-gray-200">Property events will appear here</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">Takeovers, themed weekends, and promoter-produced events remain separate occurrences linked to this resort.</p>
            </div>
          </TravelSection>
        </>
      }
      aside={
        <>
          <TravelSection title="Plan your stay">
            <div className="grid gap-3">
              <TravelFact icon={<BedDouble className="h-5 w-5" />} label="Accommodations" value={resort.accommodationSummary} />
              <TravelFact icon={<CalendarDays className="h-5 w-5" />} label="Ideal stay" value={resort.stayLengthSummary ?? 'Multi-night stay'} />
              <TravelFact icon={<MapPin className="h-5 w-5" />} label="Destination" value={location} />
              <TravelFact icon={<CarFront className="h-5 w-5" />} label="Getting there" value={(resort.transportationNotes ?? ['Transportation details from the property']).join(' · ')} />
            </div>
            {resort.bookingUrl ? (
              <TrackedExternalLink
                href={resort.bookingUrl}
                target="_blank"
                rel="noreferrer"
                tracking={{
                  entityType: 'resort',
                  entityId: resort.id,
                  organizationId: resort.operatorOrganizationId,
                  destinationType: 'booking',
                  placement: 'resort_page_booking_cta',
                  surface: 'entity_page',
                }}
                className="ss-glass ss-glass--liquid ss-glass--interactive mt-4 flex min-h-12 items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-400/10 px-4 text-sm font-black text-white"
              >
                Check availability
              </TrackedExternalLink>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center text-xs text-gray-500">Booking link not yet published</div>
            )}
          </TravelSection>
        </>
      }
      />
    </>
  );
};

export default ResortPage;
