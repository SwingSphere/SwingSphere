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
import { formatListingPhysicalAddress, getListingPhysicalCityLabel } from '../../../lib/entityCompatibility';
import { getListingHeroUrl, getListingLogoUrl, handleListingImageError } from '../../../lib/listingImage';
import { applyDevMobileListingSafety } from '../../../lib/devMobileListingSafety';
import { getPublicLocationLabel, isApproximateLocation } from '../../../lib/publicLocation';
import type { AttendancePolicy, ClubData, EntryRequirement, EventData } from '../../../types';
import { DevMobileScreen, MobileHeader } from './DevMobileShell';
import { getDevMobileListingPath, getDevMobileMapPath } from './devMobileRouting';
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
  return (
    <DevMobileScreen>
      <MobileHeader title={`${entity} unavailable`} />
      <div className="flex h-full flex-col items-center justify-center px-8 pb-24 text-center" role="alert">
        <span className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/[0.08] bg-white/[0.035]"><Info className="h-6 w-6 text-red-200" /></span>
        <h1 className="mt-5 text-xl font-semibold text-white">We couldn’t open this {entity.toLowerCase()}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-400">{message || 'The link may be outdated, or the listing data is temporarily unavailable.'}</p>
        <button type="button" onClick={() => navigate('/dev/mobile-preview')} className="mt-6 min-h-12 rounded-2xl bg-red-500 px-6 text-sm font-bold text-white">Return to Explore</button>
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

const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="rounded-[24px] border border-white/[0.075] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
    <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-white">{icon ? <span className="text-red-200">{icon}</span> : null}{title}</div>
    {children}
  </section>
);

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

const Hero: React.FC<{ src: string; logoSrc?: string | null; name: string; type: string; location: string }> = ({ src, logoSrc, name, type, location }) => (
  <div>
    <div className="relative aspect-[4/3] overflow-hidden rounded-b-[30px] bg-[#11151b]">
      <img src={src} onError={handleListingImageError} alt={`${name} hero`} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#07090d] via-transparent to-black/10" />
      {logoSrc ? (
        <div className="absolute left-4 top-4 grid h-[70px] w-[70px] place-items-center overflow-hidden rounded-[20px] border border-white/[0.14] bg-black/70 p-2 shadow-[0_10px_30px_rgba(0,0,0,0.38)] backdrop-blur-md">
          <img src={logoSrc} onError={handleListingImageError} alt={`${name} logo`} className="h-full w-full object-contain" />
        </div>
      ) : null}
      <div className="absolute inset-x-4 bottom-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-200">{type}</div>
        <h1 className="mt-1 text-[clamp(1.65rem,8vw,2.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-white [overflow-wrap:anywhere]">{name}</h1>
        <div className="mt-2 flex items-start gap-1.5 text-[12px] leading-5 text-gray-300"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-200" />{location}</div>
      </div>
    </div>
  </div>
);

export const MobileClubPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const key = parsePrettyKeyParam(slug ?? '');
  const { index, listings, isLoading, error } = useEntityIndex();
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
  const location = privateLocation
    ? getPublicLocationLabel(club)
    : getListingPhysicalCityLabel(club, { listings });
  const address = privateLocation ? location : formatListingPhysicalAddress(club, { listings });
  const saved = isSaved(club.id);
  const logoSrc = club.logoImageUrl || club.mediaAssets?.some((asset) => asset.role === 'logo') ? getListingLogoUrl(club) : null;
  return (
    <DevMobileScreen>
      <div className="flex h-full min-h-0 flex-col">
        <MobileHeader title={club.name} eyebrow="Club" onSave={() => toggleSaved(club.id)} saved={saved} onShare={() => shareListing(club.name)} />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          <Hero src={getListingHeroUrl(club)} logoSrc={logoSrc} name={club.name} type="Club" location={location} />
          <div className="space-y-3 px-3 pt-4">
            <StatusBadges status={club.status} privateLocation={privateLocation} />
            <p className="text-[14px] leading-6 text-gray-300">{club.description_short}</p>

            <Section title="Plan your visit" icon={<UsersRound className="h-4 w-4" />}>
              <InfoRow icon={<UsersRound className="h-4 w-4" />} label="Who can attend" value={attendanceLabel(club.attendancePolicy)} />
              <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Entry requirements" value={club.entryRequirements?.length ? club.entryRequirements.map(entryLabel).join(' · ') : 'Confirm current entry requirements with the club'} />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={address || location} />
              {privateLocation ? (
                <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] leading-5 text-gray-400">Exact location is private. Follow the club’s confirmation or ticketing process for address details.</p>
              ) : (
                <button type="button" onClick={() => navigate(getDevMobileMapPath(club.id))} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-[13px] font-semibold text-white"><MapPin className="h-4 w-4 text-red-200" />View on map</button>
              )}
            </Section>

            <Section title="Hours & schedule" icon={<Clock3 className="h-4 w-4" />}>
              {club.schedule.length ? <div className="divide-y divide-white/[0.055]">{club.schedule.map((day) => <div key={day.day} className="flex items-center justify-between gap-3 py-2.5 text-[12px]"><span className="font-medium text-gray-200">{day.day}</span><span className="text-right text-gray-400">{day.isClosed ? 'Closed' : [day.open ? formatClockTime(day.open) : '', day.close ? formatClockTime(day.close) : ''].filter(Boolean).join(' – ') || 'See current schedule'}</span></div>)}</div> : <p className="text-[13px] leading-6 text-gray-400">Hours vary by event. Check the official schedule before visiting.</p>}
              {club.specialScheduleNotes ? <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] leading-5 text-gray-400">{club.specialScheduleNotes}</p> : null}
            </Section>

            {club.generalAmenities.length ? <Disclosure title="Amenities"><div className="flex flex-wrap gap-2">{club.generalAmenities.map((amenity) => <span key={amenity} className="rounded-full bg-white/[0.055] px-2.5 py-1 text-[11px] text-gray-300">{amenity}</span>)}</div></Disclosure> : null}
            <Disclosure title="About this club"><p>{club.description_short}</p></Disclosure>

            <Section title="Upcoming events" icon={<CalendarDays className="h-4 w-4" />}>
              {upcomingEvents.length ? <div className="space-y-2">{upcomingEvents.map((event) => <button key={event.id} type="button" onClick={() => navigate(getDevMobileListingPath(event, index))} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/[0.045] p-3 text-left"><CalendarDays className="h-4 w-4 shrink-0 text-red-200" /><span className="min-w-0"><span className="block line-clamp-2 text-[12px] font-semibold text-white">{event.name}</span><span className="mt-1 block text-[10px] text-gray-400">{formatEventTimeRange(event.time.start, event.time.end)}</span></span></button>)}</div> : <p className="text-[13px] leading-6 text-gray-400">No upcoming events are listed yet. Check the club’s official channels for the latest schedule.</p>}
            </Section>

            <Section title="Official contact" icon={<Globe2 className="h-4 w-4" />}>
              {club.website ? <a href={club.website} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.045] px-3 text-[13px] text-white"><ExternalLink className="h-4 w-4 shrink-0 text-red-200" /><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Website</span><span className="mt-0.5 block truncate text-[13px] text-white">{club.website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span></span></a> : null}
              {club.contactEmail ? <a href={`mailto:${club.contactEmail}`} className="mt-2 flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.045] px-3 text-[13px] text-white"><Mail className="h-4 w-4 shrink-0 text-red-200" /><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Email</span><span className="mt-0.5 block break-all text-[13px] text-white">{club.contactEmail}</span></span></a> : null}
            </Section>

            <Section title="Trust, privacy & provenance" icon={<ShieldCheck className="h-4 w-4" />}>
              <p className="text-[12px] leading-5 text-gray-400">SwingSphere presents this listing for discovery. Rules, hours, prices, and attendance policies can change; verify important details with the official club. Respect consent, privacy, and local venue policies at all times.</p>
            </Section>
          </div>
        </main>
      </div>
    </DevMobileScreen>
  );
};

export const MobileEventPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const key = parsePrettyKeyParam(slug ?? '');
  const { index, listings, venues, organizations, organizationVenueRelationships, isLoading, error } = useEntityIndex();
  const rawEvent = index?.eventsByKey.get(key) ?? null;
  const event = rawEvent ? applyDevMobileListingSafety(rawEvent) as EventData : null;
  const { isSaved, toggleSaved } = useDevMobileSaved();
  const navigate = useNavigate();

  if (isLoading) return <LoadingState entity="event" />;
  if (error || !index || !event) return <NotFoundState entity="Event" message={error ?? undefined} />;

  const venue = event.venueKey ? index.clubsByKey.get(event.venueKey) ?? null : null;
  const privateLocation = isApproximateLocation(event);
  const locationCollections = { listings, venues, organizations, relationships: organizationVenueRelationships };
  const location = privateLocation
    ? getPublicLocationLabel(event)
    : formatListingPhysicalAddress(event, locationCollections) || getListingPhysicalCityLabel(event, locationCollections);
  const saved = isSaved(event.id);
  const website = event.website?.trim();
  const logoSrc = event.logoImageUrl || event.mediaAssets?.some((asset) => asset.role === 'logo') ? getListingLogoUrl(event) : null;
  return (
    <DevMobileScreen>
      <div className="flex h-full min-h-0 flex-col">
        <MobileHeader title={event.name} eyebrow="Event" onSave={() => toggleSaved(event.id)} saved={saved} onShare={() => shareListing(event.name)} />
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
                <button type="button" onClick={() => navigate(getDevMobileMapPath(event.id))} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 text-[13px] font-semibold text-white"><MapPin className="h-4 w-4 text-red-200" />View on map</button>
              )}
            </Section>

            <Section title="About this event" icon={<Info className="h-4 w-4" />}><p className="text-[13px] leading-6 text-gray-300">{event.description_full}</p></Section>
            {event.tags.length ? <Disclosure title="Attendance rules & event details" initiallyOpen><div className="flex flex-wrap gap-2">{event.tags.map((tag) => <span key={tag} className="rounded-full bg-white/[0.055] px-2.5 py-1 text-[11px] text-gray-300">{tag}</span>)}</div>{event.entryRequirements?.length ? <p className="mt-3 text-[12px] text-gray-400">Entry: {event.entryRequirements.map(entryLabel).join(' · ')}</p> : null}</Disclosure> : null}

            <Section title="Venue details" icon={<MapPin className="h-4 w-4" />}>
              {venue ? <button type="button" onClick={() => navigate(getDevMobileListingPath(venue, index))} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/[0.045] px-3 text-left"><MapPin className="h-4 w-4 shrink-0 text-red-200" /><span><span className="block text-[13px] font-semibold text-white">{venue.name}</span><span className="mt-1 block text-[11px] text-gray-400">Open club details</span></span></button> : <p className="text-[13px] leading-6 text-gray-400">{privateLocation ? 'The precise venue is intentionally withheld. Follow the host’s confirmation process.' : event.location || 'Venue details are not yet published.'}</p>}
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

