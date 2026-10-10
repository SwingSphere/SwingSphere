import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Globe, Link2, Mail, Pencil } from 'lucide-react';
import { formatClockTime, resolveCountryFlagEmoji } from '../../lib/formatting';
import type { ClubData } from '../../types';
import ClubPageLayout from './ClubPageLayout';
import { DetailContextNav } from '../navigation/DetailContextNav';
import { isStreetViewEligibleListing } from '../../lib/streetViewAvailability';
import ClubHero from './ClubHero';
import WhatHappensHere from './WhatHappensHere';
import ClubEventsPreview, { type ClubEventPreviewItem } from './ClubEventsPreview';
import ClubRhythmSection from './ClubRhythmSection';
import ClubMapCard from './ClubMapCard';
import { getListingImageUrl, handleListingImageError } from '../../lib/listingImage';
import { formatListingPhysicalAddress, getListingPhysicalAddress, getListingPhysicalCoords } from '../../lib/entityCompatibility';
import { getApproximateLocationCenter, isApproximateLocation } from '../../lib/publicLocation';
import ClubReviewsSection from './ClubReviewsSection';
import ClubHouseRulesSection from './ClubHouseRulesSection';
import type { ClubQuickEditField } from '../admin-edit/ClubQuickEditPanel';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import type { OutboundTrackingMetadata } from '../../lib/analytics/outboundTracking';
import ListingClaimCard from '../claims/ListingClaimCard';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import { getClubSocialLinks, getSocialNetworkLabel, socialValueToUrl } from '../../lib/socialLinks';

type ClubDetailTemplateProps = {
  club: ClubData;
  clubKey: string;
  upcomingEvents: ClubEventPreviewItem[];
  ownerOrganization?: {
    name: string;
    href: string;
    displayLabel: string;
  };
  onQuickEdit?: (field: ClubQuickEditField) => void;
  onEditLocation?: () => void;
};

const getScheduleSummary = (club: ClubData): string => {
  if (!club.schedule?.length) {
    return club.specialScheduleNotes?.trim()
      ? 'See current hours and programming below.'
      : 'Current recurring hours are not published.';
  }
  const firstOpen = club.schedule.find((day) => !day.isClosed && day.open && day.close);
  if (!firstOpen) return 'Recurring days are known, but exact hours vary.';
  return `Typical availability: ${firstOpen.day} ${formatClockTime(firstOpen.open)} – ${formatClockTime(firstOpen.close)}.`;
};

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const formatExternalLinkLabel = (href: string): string => {
  if (href.startsWith('mailto:')) return href.slice('mailto:'.length);
  try {
    const url = new URL(href);
    const pathname = url.pathname.replace(/\/$/, '');
    return `${url.hostname.replace(/^www\./, '')}${pathname}`;
  } catch {
    return href;
  }
};

const ExternalLinkRow: React.FC<{
  href: string;
  icon: React.ReactNode;
  tracking: OutboundTrackingMetadata;
}> = ({ href, icon, tracking }) => (
  <TrackedExternalLink
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    tracking={tracking}
    className="ss-glass ss-glass--ambient ss-glass--interactive flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-gray-300 hover:text-gray-100"
  >
    <span className="shrink-0 text-red-300">{icon}</span>
    <span className="min-w-0 flex-1 truncate text-xs font-medium">{formatExternalLinkLabel(href)}</span>
    <ExternalLink size={13} className="shrink-0 text-gray-500" />
  </TrackedExternalLink>
);

const ClubDetailTemplate: React.FC<ClubDetailTemplateProps> = ({ club, clubKey, upcomingEvents, ownerOrganization, onQuickEdit, onEditLocation }) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControls = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);
  const extended = club as ClubData & {
    logoImageUrl?: string;
    houseRules?: string;
    isPrivateLocation?: boolean;
  };

  const locationLine = useMemo(() => {
    const address = getListingPhysicalAddress(club);
    const city = address.city ?? '';
    const region = address.region ?? '';
    const country = address.country ?? '';
    const emoji = resolveCountryFlagEmoji(country);
    const parts = [city, region].filter(Boolean).join(', ');
    return `${parts}${emoji ? ` ${emoji}` : ''}` || club.location || 'Location TBD';
  }, [club]);

  const scheduleSummary = useMemo(() => getScheduleSummary(club), [club]);
  const coverImage = getListingImageUrl(club);

  const thumbnails = useMemo(
    () => unique([...(club.galleryImageUrls ?? []), coverImage]),
    [club.galleryImageUrls, coverImage],
  );

  const normalizeExternalUrl = (value?: string): string => {
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  };
  const website = normalizeExternalUrl(club.website);
  const socialLinks = getClubSocialLinks(club)
    .map((link) => ({ ...link, href: socialValueToUrl(link) }))
    .filter((link) => Boolean(link.href));
  const emailHref = club.contactEmail ? `mailto:${club.contactEmail}` : '';
  const clubAddress = getListingPhysicalAddress(club);
  const clubAddressText = formatListingPhysicalAddress(club);
  const isApproximateVenue = isApproximateLocation(club);
  const approximateCenter = isApproximateVenue ? getApproximateLocationCenter(club) : null;
  const physicalClubCoords = getListingPhysicalCoords(club) ?? { lat: club.geopoint.latitude, lng: club.geopoint.longitude };
  const streetViewAvailable = !isApproximateVenue && isStreetViewEligibleListing(club);
  const clubCoords = approximateCenter
    ? { lat: approximateCenter.latitude, lng: approximateCenter.longitude }
    : physicalClubCoords;

  return (
    <ClubPageLayout
      backgroundImageUrl={coverImage}
      contextNav={
        <DetailContextNav
          breadcrumbs={[
            { label: 'Directory', href: '/discover' },
            { label: 'Clubs', href: '/discover?type=clubs' },
            { label: club.name },
          ]}
          listingId={club.id}
          streetViewAvailable={streetViewAvailable}
          showSpatialActions={false}
          className="hidden sm:flex"
        />
      }
      hero={
        <ClubHero
          clubId={club.id}
          clubName={club.name}
          locationLine={locationLine}
          tags={club.generalAmenities ?? []}
          backgroundImageUrl={coverImage}
          logoImageUrl={extended.logoImageUrl}
          mediaPresentation={club.mediaPresentation}
          onQuickEdit={onQuickEdit}
          onEditLocation={onEditLocation}
        />
      }
      main={
        <>
          <WhatHappensHere clubName={club.name} description={club.description_short} onQuickEdit={() => onQuickEdit?.('description')} />
          {thumbnails.length > 1 ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Gallery</div>
                  <h2 className="mt-1 text-lg font-bold text-white">Photos</h2>
                </div>
                {showQuickControls ? <button type="button" onClick={() => onQuickEdit?.('gallery')} className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/60 px-3 py-2 text-xs font-black text-white"><Pencil size={13} /> Edit gallery</button> : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                {thumbnails.slice(0, 6).map((image, index) => (
                  <a key={`${image}-${index}`} href={image} target="_blank" rel="noopener noreferrer" className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    <img src={image} onError={handleListingImageError} alt={`${club.name} photo ${index + 1}`} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    {index === 5 && thumbnails.length > 6 ? <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-bold text-white">+{thumbnails.length - 6}</span> : null}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
          <ClubRhythmSection schedule={club.schedule ?? []} summary={scheduleSummary} specialScheduleNotes={club.specialScheduleNotes} attendancePolicy={club.attendancePolicy} entryRequirements={club.entryRequirements} calendarHref={`/events?clubId=${encodeURIComponent(club.id)}`} onQuickEdit={() => onQuickEdit?.('schedule')} />
          <ClubHouseRulesSection content={extended.houseRules} />
          <ClubEventsPreview
            events={upcomingEvents}
            viewAllHref={`/events?clubId=${encodeURIComponent(club.id)}`}
            addEventHref={`/submission?type=event${club.ownerOrganizationId ? `&organizationId=${encodeURIComponent(club.ownerOrganizationId)}` : ''}&clubId=${encodeURIComponent(club.id)}`}
          />
          <ClubReviewsSection listingId={club.id} listingName={club.name} />
        </>
      }
      rail={
        <>
          <ClubMapCard
            listingId={club.id}
            clubName={club.name}
            addressText={clubAddressText}
            city={clubAddress.city ?? ''}
            region={clubAddress.region ?? ''}
            lat={clubCoords.lat}
            lng={clubCoords.lng}
            isPrivateLocation={Boolean(extended.isPrivateLocation) || isApproximateVenue}
            showDirections={!isApproximateVenue}
            streetViewAvailable={streetViewAvailable}
            onEditLocation={onEditLocation}
          />
          {ownerOrganization ? (
            <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">Host / promoter</p>
              <Link
                to={ownerOrganization.href}
                className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3 text-gray-200 transition hover:border-red-300/35 hover:bg-white/[0.045] hover:text-white"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{ownerOrganization.name}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">View {ownerOrganization.displayLabel.toLowerCase()} profile</p>
                </div>
                <ExternalLink size={14} className="shrink-0 text-red-300" />
              </Link>
            </section>
          ) : null}
          <ListingClaimCard
            entityType="club"
            entityId={club.id}
            entityName={club.name}
            organizationId={club.ownerOrganizationId}
            defaultRole="manager"
          />
          {(website || emailHref || socialLinks.length > 0 || showQuickControls) ? (
            <section className="ss-glass ss-glass--ambient relative rounded-2xl p-4">
              {showQuickControls ? <button type="button" onClick={() => onQuickEdit?.('links')} className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={13} /> Edit links</button> : null}
              <h2 className="pr-24 text-sm font-semibold text-gray-200">External Links</h2>
              <p className="mt-1 text-xs text-gray-500">Official website, contact, and social profiles.</p>
              <div className="mt-3 space-y-2">
                {website ? <ExternalLinkRow href={website} icon={<Globe size={15} />} tracking={{ entityType: 'club', entityId: club.id, destinationType: 'website', placement: 'club_page_external_website', surface: 'entity_page' }} /> : null}
                {emailHref ? <ExternalLinkRow href={emailHref} icon={<Mail size={15} />} tracking={{ entityType: 'club', entityId: club.id, destinationType: 'email', placement: 'club_page_external_email', surface: 'entity_page' }} /> : null}
                {socialLinks.map((link, index) => (
                  <ExternalLinkRow
                    key={`${link.network}-${link.value}-${index}`}
                    href={link.href}
                    icon={<Link2 size={15} aria-label={getSocialNetworkLabel(link.network)} />}
                    tracking={{ entityType: 'club', entityId: club.id, destinationType: 'social', placement: `club_page_external_${link.network}`, surface: 'entity_page' }}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      }
    />
  );
};

export default ClubDetailTemplate;
