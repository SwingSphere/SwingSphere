import React, { useEffect, useState } from 'react';
import { Anchor, CalendarDays, Clock3, MapPin, Ship, Ticket, Waves } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { cruiseSailingsBySeriesId, cruiseSeriesBySlug } from '../../data/travelExperiences';
import type { CruiseSailingData, CruiseSeriesData, OrganizationData } from '../../types';
import * as api from '../../lib/api';
import TravelPageAdminEditor from '../admin-edit/TravelPageAdminEditor';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { usePublicEditAccess } from '../admin-edit/usePublicEditAccess';
import EntityPageShell from '../entity/EntityPageShell';
import { TravelChipList, TravelFact, TravelHero, TravelSection } from '../travel/TravelPagePrimitives';
import TrackedExternalLink from '../analytics/TrackedExternalLink';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const CruisePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const initialSeries = slug ? cruiseSeriesBySlug.get(slug) ?? null : null;
  const [series, setSeries] = useState<CruiseSeriesData | null>(initialSeries);
  const [sailings, setSailings] = useState<CruiseSailingData[]>(() => initialSeries ? cruiseSailingsBySeriesId.get(initialSeries.id) ?? [] : []);
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [allSeries, setAllSeries] = useState<CruiseSeriesData[]>(initialSeries ? [initialSeries] : []);
  const { registerPublicPage, clearPublicPage } = useAdminEditMode();
  const { canEdit } = usePublicEditAccess({ organizationIds: [series?.operatorOrganizationId] });

  useEffect(() => {
    let active = true;
    Promise.all([api.getCruiseSeries(), api.getCruiseSailings(), api.getOrganizations()])
      .then(([seriesRows, sailingRows, organizationRows]) => {
        if (!active) return;
        const matched = seriesRows.find((item) => item.slug === slug) ?? null;
        setSeries(matched);
        setAllSeries(seriesRows);
        setSailings(matched ? sailingRows.filter((item) => item.cruiseSeriesId === matched.id).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : []);
        setOrganizations(organizationRows);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!series) return;
    registerPublicPage({
      entityId: series.id,
      entityType: 'cruise',
      label: series.name,
      canEdit,
      supportsInlineQuickEdit: false,
    });
    return () => clearPublicPage(series.id);
  }, [canEdit, clearPublicPage, registerPublicPage, series]);

  const nextSailing = sailings.find((sailing) => Date.parse(sailing.endsAt) >= Date.now()) ?? sailings[0] ?? null;

  if (!series) {
    return <div className="flex min-h-[60vh] items-center justify-center text-gray-400">Cruise not found.</div>;
  }

  const dateRange = nextSailing
    ? `${dateFormatter.format(new Date(nextSailing.startsAt))} – ${dateFormatter.format(new Date(nextSailing.endsAt))}`
    : 'Future sailing dates pending';
  const departure = nextSailing
    ? [nextSailing.departurePort.portName, nextSailing.departurePort.city, nextSailing.departurePort.country].filter(Boolean).join(', ')
    : 'Departure port pending';

  return (
    <>
      <TravelPageAdminEditor entity={series} organizations={organizations} cruiseSeries={allSeries} sailings={sailings} canEdit={canEdit} />
      <EntityPageShell
      hero={
        <TravelHero
          typeLabel="Cruise"
          title={series.name}
          location={nextSailing ? `${dateRange} · ${departure}` : departure}
          subtitle={series.descriptionShort}
          imageUrl={nextSailing?.headerImageUrl ?? series.headerImageUrl}
          badge="Sailing series"
          tone="cruise"
        />
      }
      main={
        <>
          <TravelSection eyebrow="At sea" title="The cruise experience">
            <p className="text-sm leading-7 text-gray-300 sm:text-base">{series.descriptionFull}</p>
            <div className="mt-5"><TravelChipList items={series.experienceHighlights} /></div>
          </TravelSection>

          {nextSailing ? (
            <TravelSection eyebrow="Next departure" title={nextSailing.name}>
              <div className="grid gap-3 sm:grid-cols-2">
                <TravelFact icon={<CalendarDays className="h-5 w-5" />} label="Dates" value={dateRange} />
                <TravelFact icon={<Clock3 className="h-5 w-5" />} label="Duration" value={`${nextSailing.durationNights} nights`} />
                <TravelFact icon={<Ship className="h-5 w-5" />} label="Ship" value={nextSailing.shipName} />
                <TravelFact icon={<MapPin className="h-5 w-5" />} label="Embarkation" value={departure} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {nextSailing.theme ? <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">{nextSailing.theme}</span> : null}
                {nextSailing.bookingStatus ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold capitalize text-gray-200">{nextSailing.bookingStatus.replaceAll('_', ' ')}</span> : null}
              </div>
            </TravelSection>
          ) : null}

          {nextSailing ? (
            <TravelSection eyebrow="Route" title="Itinerary">
              <div className="relative space-y-0 pl-4 before:absolute before:bottom-4 before:left-[1.45rem] before:top-4 before:w-px before:bg-gradient-to-b before:from-cyan-300/60 before:via-cyan-300/20 before:to-transparent">
                {nextSailing.itinerary.map((port, index) => (
                  <div key={port.id} className="relative flex gap-4 py-3">
                    <div className="relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-200/35 bg-[#071118]">
                      <div className="h-1.5 w-1.5 rounded-full bg-cyan-200" />
                    </div>
                    <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/20 px-4 py-3 flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">Stop {index + 1}</div>
                      <div className="mt-1 font-bold text-white">{port.portName}</div>
                      <div className="mt-0.5 text-xs text-gray-400">{[port.city, port.country].filter(Boolean).join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </TravelSection>
          ) : null}

          <TravelSection eyebrow="Future departures" title="Choose a sailing">
            <div className="space-y-3">
              {sailings.map((sailing) => (
                <Link key={sailing.id} to={`/cruises/${series.slug}`} className="ss-glass ss-glass--interactive flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                  <Anchor className="h-5 w-5 shrink-0 text-cyan-200" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white">{sailing.name}</div>
                    <div className="mt-1 text-xs text-gray-400">{dateFormatter.format(new Date(sailing.startsAt))} · {sailing.durationNights} nights · {sailing.departurePort.city}</div>
                  </div>
                  <span className="text-xs font-semibold capitalize text-cyan-100">{sailing.bookingStatus?.replaceAll('_', ' ')}</span>
                </Link>
              ))}
            </div>
          </TravelSection>
        </>
      }
      aside={
        <TravelSection title="Sailing at a glance">
          <div className="grid gap-3">
            <TravelFact icon={<Waves className="h-5 w-5" />} label="Audience" value={series.audienceLabel} />
            <TravelFact icon={<Ship className="h-5 w-5" />} label="Ship" value={nextSailing?.shipName ?? 'To be announced'} />
            <TravelFact icon={<Ticket className="h-5 w-5" />} label="Cabins" value={nextSailing?.cabinSummary ?? 'Cabin details pending'} />
            <TravelFact icon={<Anchor className="h-5 w-5" />} label="Departure" value={departure} />
          </div>
          {nextSailing?.bookingUrl ? (
            <TrackedExternalLink
              href={nextSailing.bookingUrl}
              target="_blank"
              rel="noreferrer"
              tracking={{
                entityType: 'cruise_sailing',
                entityId: nextSailing.id,
                organizationId: series.operatorOrganizationId,
                destinationType: 'booking',
                placement: 'cruise_page_booking_cta',
                surface: 'entity_page',
              }}
              className="ss-glass ss-glass--liquid ss-glass--interactive mt-4 flex min-h-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 text-sm font-black text-white"
            >
              View cabins and booking
            </TrackedExternalLink>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center text-xs text-gray-500">Booking details not yet published</div>
          )}
        </TravelSection>
      }
      />
    </>
  );
};

export default CruisePage;
