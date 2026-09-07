import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Globe2,
  Info,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEntityIndex } from '../../../hooks/useEntityIndex';
import { formatClockTime, formatEventTimeRange } from '../../../lib/formatting';
import { parsePrettyKeyParam } from '../../../lib/identityUtils';
import { formatListingPhysicalAddress, getListingPhysicalCityLabel, getVenueForEvent } from '../../../lib/entityCompatibility';
import { getListingHeroUrl, getListingLogoUrl, handleListingImageError } from '../../../lib/listingImage';
import { applyDevMobileListingSafety } from '../../../lib/devMobileListingSafety';
import { getPublicLocationLabel, isApproximateLocation } from '../../../lib/publicLocation';
import { resolveStreetViewSourceListingId } from '../../../lib/streetViewAvailability';
import type { AttendancePolicy, ClubData, EntryRequirement, EventData } from '../../../types';
import { useDeviceExperience } from '../../device/DeviceExperienceContext';
import SavedLivingLowPolyBackground from '../../SavedLivingLowPolyBackground';
import { DevMobileScreen, MobileHeader } from './DevMobileShell';
import { useDevMobileSaved } from './useDevMobileSaved';

const humanize = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const attendanceLabel = (value?: AttendancePolicy) => value ? humanize(value) : 'Check current attendance rules';
const entryLabel = (value: EntryRequirement) => humanize(value);

const shareListing = async (title: string) => {
  const url = window.location.href;
  if (navigator.share) {
    await navigator.share({ title, url }).catch(() => undefined);
    return;
  }
  await navigator.clipboard?.writeText(url).catch(() => undefined);
};

const LoadingState: React.FC<{ entity: string }> = ({ entity }) => (
  <DevMobileScreen>
    <MobileHeader title={`Loading ${entity}`} />
    <div className="animate-pulse px-3 pt-3" aria-label={`Loading ${entity}`}>
      <div className="h-56 rounded-[26px] bg-white/[0.055]" />
      <div className="mt-5 h-8 w-4/5 rounded-xl bg-white/[0.055]" />
      <div className="mt-3 h-4 w-1/2 rounded-lg bg-white/[0.04]" />
      <div className="mt-7 h-28 rounded-[22px] bg-white/[0.04]" />
    </div>
  </DevMobileScreen>
);

const NotFoundState: React.FC<{ entity: string; message?: string }> = ({ entity, message }) => {
  const navigate = useNavigate();
  const { basePath } = useDeviceExperience();
  return (
    <DevMobileScreen>
      <MobileHeader title={`${entity} unavailable`} />
      <div className="flex h-full flex-col items-center justify-center px-8 pb-24 text-center" role="alert">
        <span className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/[0.08] bg-white/[0.035]"><Info className="h-6 w-6 text-red-200" /></span>
        <h1 className="mt-5 text-xl font-semibold text-white">We couldn’t open this {entity.toLowerCase()}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-400">{message || 'The link may be outdated, or the listing data is temporarily unavailable.'}</p>
        <button type="button" onClick={() => navigate(basePath)} className="mt-6 min-h-12 rounded-2xl bg-red-500 px-6 text-sm font-bold text-white">Return to Explore</button>
      </div>
    </DevMobileScreen>
  );
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.045] text-red-200">{icon}</span>
    <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">{label}</div><div className="mt-1 text-[13px] leading-5 text-gray-200">{value}</div></div>
  </div>
);

const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode; tabletTone?: 'default' | 'warm' | 'quiet' }> = ({ title, icon, children, tabletTone = 'default' }) => {
  const { kind } = useDeviceExperience();
  const tabletMode = kind === 'tablet';
  const tabletToneClass = tabletTone === 'warm'
    ? 'border-red-300/[0.12] bg-[linear-gradient(145deg,rgba(36,18,22,0.72),rgba(10,12,16,0.70))]'
    : tabletTone === 'quiet'
      ? 'border-white/[0.055] bg-black/20'
      : 'border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))]';
  return (
    <section className={`${tabletMode ? `rounded-[26px] p-5 shadow-[0_18px_44px_rgba(0,0,0,0.20),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl ${tabletToneClass}` : 'rounded-[24px] border border-white/[0.075] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]'} border`}>
      <div className={`${tabletMode ? 'mb-4 text-[14px]' : 'mb-3 text-[13px]'} flex items-center gap-2 font-semibold text-white`}>{icon ? <span className="text-red-200">{icon}</span> : null}{title}</div>
      {children}
    </section>
  );
};

const Disclosure: React.FC<{ title: string; children: React.ReactNode; initiallyOpen?: boolean }> = ({ title, children, initiallyOpen = false }) => {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/[0.075] bg-white/[0.03]">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-[13px] font-semibold text-white" aria-expanded={open}>
        {title}<ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="border-t border-white/[0.06] px-4 py-4 text-[13px] leading-6 text-gray-300">{children}</div> : null}
    </section>
  );
};

const StatusBadges: React.FC<{ status: string; privateLocation?: boolean }> = ({ status, privateLocation }) => (
  <div className="flex flex-wrap gap-2">
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/[0.08] px-2.5 text-[10px] font-semibold text-emerald-100"><CheckCircle2 className="h-3.5 w-3.5" />{status === 'approved' ? 'Active listing' : humanize(status)}</span>
    {privateLocation ? <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-400/[0.08] px-2.5 text-[10px] font-semibold text-amber-100"><ShieldCheck className="h-3.5 w-3.5" />Private location</span> : null}
  </div>
);

const Hero: React.FC<{ src: string; logoSrc?: string | null; name: string; type: string; location: string; monochrome?: boolean }> = ({ src, logoSrc, name, type, location, monochrome = false }) => {
  const { kind } = useDeviceExperience();
  const isTablet = kind === 'tablet';
  return (
    <div>
      <div className={`relative overflow-hidden bg-[#11151b] ${isTablet ? 'h-[300px] rounded-b-[34px]' : 'aspect-[4/3] rounded-b-[30px]'}`}>
        <img src={src} onError={handleListingImageError} alt={`${name} hero`} className={`h-full w-full object-cover ${monochrome ? 'grayscale contrast-[1.08]' : ''}`} />
        <div className={`absolute inset-0 ${isTablet ? 'bg-gradient-to-t from-[#07090d] via-black/5 to-black/15' : 'bg-gradient-to-t from-[#07090d] via-transparent to-black/10'}`} />
        {logoSrc ? (
          <div className={`absolute overflow-hidden border border-white/[0.14] bg-black/70 shadow-[0_14px_38px_rgba(0,0,0,0.44)] backdrop-blur-md ${isTablet ? 'left-6 top-6 h-[150px] w-[150px] rounded-[30px]' : 'left-4 top-4 h-[70px] w-[70px] rounded-[20px]'}`}>
            <img src={logoSrc} onError={handleListingImageError} alt={`${name} logo`} className={`h-full w-full object-contain ${monochrome ? 'grayscale contrast-[1.12]' : ''}`} />
          </div>
        ) : null}
        <div className={`absolute bottom-4 ${isTablet ? 'inset-x-6' : 'inset-x-4'}`}>
          <div className={`${isTablet ? 'text-[11px]' : 'text-[10px]'} font-bold uppercase tracking-[0.2em] text-red-200`}>{type}</div>
          <h1 className={`mt-1 font-semibold leading-[1.02] tracking-[-0.035em] text-white [overflow-wrap:anywhere] ${isTablet ? 'text-[32px]' : 'text-[clamp(1.65rem,8vw,2.25rem)]'}`}>{name}</h1>
          <div className={`mt-2 flex items-start gap-1.5 leading-5 text-gray-300 ${isTablet ? 'text-[13px]' : 'text-[12px]'}`}><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-200" />{location}</div>
        </div>
      </div>
    </div>
  );
};

export const MobileClubPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { getListingPath, getMapPath, toPath, kind } = useDeviceExperience();
  const isTablet = kind === 'tablet';
  const key = parsePrettyKeyParam(slug ?? '');
  const { index, listings, venues, organizations, organizationVenueRelationships, isLoading, error } = useEntityIndex();
  const rawClub = index?.clubsByKey.get(key) ?? null;
  const club = rawClub ? applyDevMobileListingSafety(rawClub) as ClubData : null;
  const { isSaved, toggleSaved } = useDevMobileSaved();
  const navigate = useNavigate();
  const upcomingEvents = useMemo(() => {
    if (!club || !index) return [];
    const clubKey = index.clubKeyById.get(club.id) ?? key;
    return (index.eventsByVenueClubKey.get(clubKey) ?? [])
      .filter((event) => Date.parse(event.time.end) >= Date.now())
      .sort((a, b) => Date.parse(a.time.start) - Date.parse(b.time.start))
      .slice(0, 4);
  }, [club, index, key]);

  if (isLoading) return <LoadingState entity="club" />;
  if (error || !index || !club) return <NotFoundState entity="Club" message={error ?? undefined} />;

  const privateLocation = isApproximateLocation(club);
  const locationCollections = { listings, venues, organizations, relationships: organizationVenueRelationships };
  const location = privateLocation
    ? getPublicLocationLabel(club)
    : getListingPhysicalCityLabel(club, locationCollections);
  const address = privateLocation ? location : formatListingPhysicalAddress(club, locationCollections);
  const saved = isSaved(club.id);
  const schedule = Array.isArray(club.schedule) ? club.schedule : [];
  const generalAmenities = Array.isArray(club.generalAmenities) ? club.generalAmenities : [];
  const logoSrc = club.logoImageUrl || club.mediaAssets?.some((asset) => asset.role === 'logo') ? getListingLogoUrl(club) : null;
  const streetViewSourceListingId = privateLocation ? null : resolveStreetViewSourceListingId(club, locationCollections);
  const openLocationView = () => {
    if (streetViewSourceListingId) {
      // Street View currently derives its authored scene at module initialization.
      // Use a full route load so switching venues can never retain a prior scene.
      window.location.assign(`${toPath('/street-view')}?listingId=${encodeURIComponent(streetViewSourceListingId)}&sourceId=${encodeURIComponent(club.id)}`);
      return;
    }
    navigate(getMapPath(club.id));
  };
  return (
    <DevMobileScreen>
      <div className="flex h-full min-h-0 flex-col">
        <MobileHeader title={club.name} eyebrow="Club" onSave={() => void toggleSaved(club.id, 'club')} saved={saved} onShare={() => shareListing(club.name)} />
        <main className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 ${isTablet ? 'bg-[#05070a]' : ''}`}>
          {isTablet ? (
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-35" aria-hidden="true">
              <SavedLivingLowPolyBackground className="absolute inset-0" interactive={false} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(239,68,68,0.10),transparent_26%),linear-gradient(to_bottom,rgba(3,5,8,0.30)_0%,rgba(3,5,8,0.64)_34%,rgba(3,5,8,0.88)_100%)]" />
            </div>
          ) : null}
          <div className="relative z-10">
          <Hero src={getListingHeroUrl(club)} logoSrc={logoSrc} name={club.name} type="Club" location={location} monochrome={club.mediaPresentation === 'monochrome' || club.id === 'club-epicure-cape-town'} />
          <div className={`${isTablet ? 'space-y-4 px-5 pt-4' : 'space-y-3 px-3 pt-4'}`}>
            <div className={isTablet ? 'flex items-start justify-between gap-5' : ''}>
              <div className="min-w-0 flex-1">
                <StatusBadges status={club.status} privateLocation={privateLocation} />
                <p className={`${isTablet ? 'mt-3 max-w-[680px] border-l border-red-300/35 pl-4 text-[13px] leading-5 text-gray-200' : 'text-[14px] leading-6 text-gray-300'}`}>{club.description_short}</p>
              </div>
            </div>

            <div className={isTablet ? 'grid grid-cols-2 items-start gap-3' : 'space-y-3'}>
              <Section title="Plan your visit" icon={<UsersRound className="h-4 w-4" />} tabletTone="warm">
                <InfoRow icon={<UsersRound className="h-4 w-4" />} label="Who can attend" value={attendanceLabel(club.attendancePolicy)} />
                <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Entry requirements" value={club.entryRequirements?.length ? club.entryRequirements.map(entryLabel).join(' · ') : 'Confirm current entry requirements with the club'} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={address || location} />
                {privateLocation ? (
                  <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] leading-5 text-gray-400">Exact location is private. Follow the club’s confirmation or ticketing process for address details.</p>
                ) : (
                  <button type="button" onClick={openLocationView} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-[13px] font-semibold text-white"><MapPin className="h-4 w-4 text-red-200" />View on map</button>
                )}
              </Section>

              <Section title="Hours & schedule" icon={<Clock3 className="h-4 w-4" />}>
                {schedule.length ? <div className="divide-y divide-white/[0.055]">{schedule.map((day) => <div key={day.day} className="flex items-center justify-between gap-3 py-2.5 text-[12px]"><span className="font-medium text-gray-200">{day.day}</span><span className="text-right text-gray-400">{day.isClosed ? 'Closed' : [day.open ? formatClockTime(day.open) : '', day.close ? formatClockTime(day.close) : ''].filter(Boolean).join(' – ') || 'See current schedule'}</span></div>)}</div> : <p className="text-[13px] leading-6 text-gray-400">Hours vary by event. Check the official schedule before visiting.</p>}
                {club.specialScheduleNotes ? <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] leading-5 text-gray-400">{club.specialScheduleNotes}</p> : null}
              </Section>
            </div>

            {generalAmenities.length ? (
              isTablet ? (
                <Section title="Amenities" icon={<Sparkles className="h-4 w-4" />}>
                  <div className="flex flex-wrap gap-2.5">{generalAmenities.map((amenity) => <span key={amenity} className="rounded-full border border-white/[0.07] bg-black/25 px-3 py-1.5 text-[11px] font-medium text-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">{amenity}</span>)}</div>
                </Section>
              ) : <Disclosure title="Amenities"><div className="flex flex-wrap gap-2">{generalAmenities.map((amenity) => <span key={amenity} className="rounded-full bg-white/[0.055] px-2.5 py-1 text-[11px] text-gray-300">{amenity}</span>)}</div></Disclosure>
            ) : null}
            {!isTablet ? <Disclosure title="About this club"><p>{club.description_short}</p></Disclosure> : null}

            <div className={isTablet ? 'grid grid-cols-[0.9fr_1.1fr] items-start gap-3' : 'space-y-3'}>
              <Section title="Upcoming events" icon={<CalendarDays className="h-4 w-4" />} tabletTone="warm">
                {upcomingEvents.length ? <div className="space-y-2">{upcomingEvents.map((event) => <button key={event.id} type="button" onClick={() => navigate(getListingPath(event, index))} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/[0.045] p-3 text-left"><CalendarDays className="h-4 w-4 shrink-0 text-red-200" /><span className="min-w-0"><span className="block line-clamp-2 text-[12px] font-semibold text-white">{event.name}</span><span className="mt-1 block text-[10px] text-gray-400">{formatEventTimeRange(event.time.start, event.time.end)}</span></span></button>)}</div> : <p className="text-[13px] leading-6 text-gray-400">No upcoming events are listed yet. Check the club’s official channels for the latest schedule.</p>}
              </Section>

              <Section title="Official contact" icon={<Globe2 className="h-4 w-4" />}>
                {club.website ? <a href={club.website} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.045] px-3 text-[13px] text-white"><ExternalLink className="h-4 w-4 shrink-0 text-red-200" /><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Website</span><span className="mt-0.5 block truncate text-[13px] text-white">{club.website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span></span></a> : null}
                {club.contactEmail ? <a href={`mailto:${club.contactEmail}`} className="mt-2 flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.045] px-3 text-[13px] text-white"><Mail className="h-4 w-4 shrink-0 text-red-200" /><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Email</span><span className="mt-0.5 block break-all text-[13px] text-white">{club.contactEmail}</span></span></a> : null}
              </Section>
            </div>

            <Section title="Trust, privacy & provenance" icon={<ShieldCheck className="h-4 w-4" />} tabletTone="quiet">
              <p className="text-[12px] leading-5 text-gray-400">SwingSphere presents this listing for discovery. Rules, hours, prices, and attendance policies can change; verify important details with the official club. Respect consent, privacy, and local venue policies at all times.</p>
            </Section>
          </div>
          </div>
        </main>
      </div>
    </DevMobileScreen>
  );
};

export const MobileEventPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { getListingPath, getMapPath, toPath } = useDeviceExperience();
  const key = parsePrettyKeyParam(slug ?? '');
  const { index, listings, venues, organizations, organizationVenueRelationships, isLoading, error } = useEntityIndex();
  const rawEvent = index?.eventsByKey.get(key) ?? null;
  const event = rawEvent ? applyDevMobileListingSafety(rawEvent) as EventData : null;
  const { isSaved, toggleSaved } = useDevMobileSaved();
  const navigate = useNavigate();

  if (isLoading) return <LoadingState entity="event" />;
  if (error || !index || !event) return <NotFoundState entity="Event" message={error ?? undefined} />;

  const privateLocation = isApproximateLocation(event);
  const locationCollections = { listings, venues, organizations, relationships: organizationVenueRelationships };
  const venueEntity = getVenueForEvent(event, locationCollections);
  const legacyVenueClub = event.venueKey ? index.clubsByKey.get(event.venueKey) ?? null : null;
  const location = privateLocation
    ? getPublicLocationLabel(event)
    : formatListingPhysicalAddress(event, locationCollections) || getListingPhysicalCityLabel(event, locationCollections);
  const saved = isSaved(event.id);
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const website = event.website?.trim();
  const logoSrc = event.logoImageUrl || event.mediaAssets?.some((asset) => asset.role === 'logo') ? getListingLogoUrl(event) : null;
  const streetViewSourceListingId = privateLocation ? null : resolveStreetViewSourceListingId(event, locationCollections);
  const openLocationView = () => {
    if (streetViewSourceListingId) {
      window.location.assign(`${toPath('/street-view')}?listingId=${encodeURIComponent(streetViewSourceListingId)}&sourceId=${encodeURIComponent(event.id)}`);
      return;
    }
    navigate(getMapPath(event.id));
  };
  return (
    <DevMobileScreen>
      <div className="flex h-full min-h-0 flex-col">
        <MobileHeader title={event.name} eyebrow="Event" onSave={() => void toggleSaved(event.id, 'event')} saved={saved} onShare={() => shareListing(event.name)} />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          <Hero src={getListingHeroUrl(event)} logoSrc={logoSrc} name={event.name} type="Event" location={location} />
          <div className="space-y-3 px-3 pt-4">
            <StatusBadges status={event.status} privateLocation={privateLocation} />
            <Section title="Event essentials" icon={<Sparkles className="h-4 w-4" />}>
              <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="Date & time" value={formatEventTimeRange(event.time.start, event.time.end) || 'Time to be confirmed'} />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={location} />
              <InfoRow icon={<UserRound className="h-4 w-4" />} label="Host" value={event.hostName || 'Host details to be confirmed'} />
              <InfoRow icon={<UsersRound className="h-4 w-4" />} label="Attendance" value={attendanceLabel(event.attendancePolicy)} />
              <InfoRow icon={<Ticket className="h-4 w-4" />} label="Pricing & access" value={website ? 'See the official event page for current pricing and access' : 'Pricing is not published on SwingSphere; confirm with the host'} />
              {privateLocation ? (
                <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] leading-5 text-gray-400">Exact location is private. Follow the host’s confirmation or ticketing process for address details.</p>
              ) : (
                <button type="button" onClick={openLocationView} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-[13px] font-semibold text-white"><MapPin className="h-4 w-4 text-red-200" />View on map</button>
              )}
            </Section>

            <Section title="About this event" icon={<Info className="h-4 w-4" />}><p className="text-[13px] leading-6 text-gray-300">{event.description_full}</p></Section>
            {tags.length ? <Disclosure title="Attendance rules & event details" initiallyOpen><div className="flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="rounded-full bg-white/[0.055] px-2.5 py-1 text-[11px] text-gray-300">{tag}</span>)}</div>{event.entryRequirements?.length ? <p className="mt-3 text-[12px] text-gray-400">Entry: {event.entryRequirements.map(entryLabel).join(' · ')}</p> : null}</Disclosure> : null}

            <Section title="Venue details" icon={<MapPin className="h-4 w-4" />}>
              {venueEntity ? (
                legacyVenueClub ? (
                  <button type="button" onClick={() => navigate(getListingPath(legacyVenueClub, index))} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/[0.045] px-3 text-left"><MapPin className="h-4 w-4 shrink-0 text-red-200" /><span><span className="block text-[13px] font-semibold text-white">{venueEntity.name}</span><span className="mt-1 block text-[11px] text-gray-400">Open club details</span></span></button>
                ) : (
                  <div className="rounded-2xl bg-white/[0.045] px-3 py-3"><div className="text-[13px] font-semibold text-white">{venueEntity.name}</div><div className="mt-1 text-[11px] leading-5 text-gray-400">{formatListingPhysicalAddress(event, locationCollections) || 'Venue address available from the event details above.'}</div></div>
                )
              ) : <p className="text-[13px] leading-6 text-gray-400">{privateLocation ? 'The precise venue is intentionally withheld. Follow the host’s confirmation process.' : event.location || 'Venue details are not yet published.'}</p>}
            </Section>

            {(website || event.contactEmail) ? (
              <Section title="Official contact" icon={<Globe2 className="h-4 w-4" />}>
                {website ? <a href={website} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.045] px-3 text-[13px] text-white"><ExternalLink className="h-4 w-4 shrink-0 text-red-200" /><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Website</span><span className="mt-0.5 block truncate text-[13px] text-white">{website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span></span></a> : null}
                {event.contactEmail ? <a href={`mailto:${event.contactEmail}`} className="mt-2 flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.045] px-3 text-[13px] text-white"><Mail className="h-4 w-4 shrink-0 text-red-200" /><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Email</span><span className="mt-0.5 block break-all text-[13px] text-white">{event.contactEmail}</span></span></a> : null}
              </Section>
            ) : null}

            <Section title="Safety & privacy" icon={<ShieldCheck className="h-4 w-4" />}>
              <p className="text-[12px] leading-5 text-gray-400">Confirm attendance, pricing, address, and entry rules with the host before traveling. Respect consent and privacy. Never share a private-event location without permission.</p>
            </Section>
          </div>
        </main>
      </div>
    </DevMobileScreen>
  );
};

