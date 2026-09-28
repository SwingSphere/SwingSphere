import React, { useMemo } from 'react';
import { ExternalLink, Globe, Link2, Mail, Pencil } from 'lucide-react';
import { formatClockTime, resolveCountryFlagEmoji } from '../../lib/formatting';
import type { ClubData } from '../../types';
import ClubPageLayout from './ClubPageLayout';
import { DetailContextNav } from '../navigation/DetailContextNav';
import { hasStreetViewForListing } from '../../lib/streetViewAvailability';
import ClubHero from './ClubHero';
import WhatHappensHere from './WhatHappensHere';
import ClubEventsPreview, { type ClubEventPreviewItem } from './ClubEventsPreview';
import ClubRhythmSection from './ClubRhythmSection';
import ClubMapCard from './ClubMapCard';
import { getListingImageUrl } from '../../lib/listingImage';
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

const ClubDetailTemplate: React.FC<ClubDetailTemplateProps> = ({ club, clubKey, upcomingEvents, onQuickEdit, onEditLocation }) => {
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
  const clubCoords = approximateCenter
    ? { lat: approximateCenter.latitude, lng: approximateCenter.longitude }
    : physicalClubCoords;

  return (
    <ClubPageLayout
      contextNav={
        <DetailContextNav
          breadcrumbs={[
            { label: 'Directory', href: '/discover' },
            { label: 'Clubs', href: '/discover?type=clubs' },
            { label: club.name },
          ]}
          listingId={club.id}
          streetViewAvailable={!isApproximateVenue && hasStreetViewForListing(club.id)}
        />
      }
      hero={
        <ClubHero
          clubId={club.id}
          clubName={club.name}
          locationLine={locationLine}
          availabilityLine={scheduleSummary}
          tags={club.generalAmenities ?? []}
          backgroundImageUrl={coverImage}
          logoImageUrl={extended.logoImageUrl}
          mediaPresentation={club.mediaPresentation}
          thumbnails={thumbnails}
          onQuickEdit={onQuickEdit}
          onEditLocation={onEditLocation}
        />
      }
      main={
        <>
          <WhatHappensHere clubName={club.name} description={club.description_short} onQuickEdit={() => onQuickEdit?.('description')} />
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
            onEditLocation={onEditLocation}
          />
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
