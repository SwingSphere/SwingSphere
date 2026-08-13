import React, { useMemo } from 'react';
import { ExternalLink, Facebook, Globe, Instagram, Link2, Mail } from 'lucide-react';
import { resolveCountryFlagEmoji } from '../../lib/formatting';
import type { ClubData } from '../../types';
import ClubPageLayout from './ClubPageLayout';
import ClubHero from './ClubHero';
import WhatHappensHere from './WhatHappensHere';
import ClubEventsPreview, { type ClubEventPreviewItem } from './ClubEventsPreview';
import ClubRhythmSection from './ClubRhythmSection';
import ClubMapCard from './ClubMapCard';
import { getListingImageUrl } from '../../lib/listingImage';
import { getListingPhysicalAddress, getListingPhysicalCoords } from '../../lib/entityCompatibility';
import { getApproximateLocationCenter, isApproximateLocation } from '../../lib/publicLocation';
import ListingAccessSummary from '../listing/ListingAccessSummary';
import ClubReviewsSection from './ClubReviewsSection';
import ClubHouseRulesSection from './ClubHouseRulesSection';
import type { ClubQuickEditField } from '../admin-edit/ClubQuickEditPanel';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import type { OutboundTrackingMetadata } from '../../lib/analytics/outboundTracking';
import ListingClaimCard from '../claims/ListingClaimCard';

type ClubDetailTemplateProps = {
  club: ClubData;
  clubKey: string;
  upcomingEvents: ClubEventPreviewItem[];
  onQuickEdit?: (field: ClubQuickEditField) => void;
};

const getScheduleSummary = (club: ClubData): string => {
  if (!club.schedule?.length) return 'Typical availability: baseline only, hours vary.';
  const firstOpen = club.schedule.find((day) => !day.isClosed && day.open && day.close);
  if (!firstOpen) return 'Typical availability: baseline only, hours vary.';
  return `Typical availability: ${firstOpen.day} ${firstOpen.open} - ${firstOpen.close}.`;
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

const ClubDetailTemplate: React.FC<ClubDetailTemplateProps> = ({ club, clubKey, upcomingEvents, onQuickEdit }) => {
  const extended = club as ClubData & {
    logoImageUrl?: string;
    houseRules?: string;
    isPrivateLocation?: boolean;
    instagram?: string;
    facebook?: string;
    fetlife?: string;
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
  const instagram = normalizeExternalUrl(extended.instagram);
  const facebook = normalizeExternalUrl(extended.facebook);
  const fetlife = normalizeExternalUrl(extended.fetlife);
  const emailHref = club.contactEmail ? `mailto:${club.contactEmail}` : '';
  const clubAddress = getListingPhysicalAddress(club);
  const isApproximateVenue = isApproximateLocation(club);
  const approximateCenter = isApproximateVenue ? getApproximateLocationCenter(club) : null;
  const physicalClubCoords = getListingPhysicalCoords(club) ?? { lat: club.geopoint.latitude, lng: club.geopoint.longitude };
  const clubCoords = approximateCenter
    ? { lat: approximateCenter.latitude, lng: approximateCenter.longitude }
    : physicalClubCoords;

  return (
    <ClubPageLayout
      hero={
        <ClubHero
          clubId={club.id}
          clubName={club.name}
          locationLine={locationLine}
          availabilityLine={scheduleSummary}
          tags={club.generalAmenities ?? []}
          backgroundImageUrl={coverImage}
          logoImageUrl={extended.logoImageUrl}
          thumbnails={thumbnails}
          onQuickEdit={onQuickEdit}
        />
      }
      main={
        <>
          <section className="ss-glass ss-glass--ambient rounded-[24px] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Start here</p>
            <h2 className="mt-1 text-2xl font-bold text-white">What to Expect</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">The essential visitor information in one place: who can attend, what entry requires, when the club is typically open, and any club-specific guidance to know before arriving.</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ListingAccessSummary listing={club} variant="detail" />
              <ClubRhythmSection schedule={club.schedule ?? []} summary={scheduleSummary} />
              <ClubHouseRulesSection content={extended.houseRules} />
            </div>
          </section>
          <WhatHappensHere description={club.description_short} onQuickEdit={() => onQuickEdit?.('description')} />
          <ClubEventsPreview events={upcomingEvents} viewAllHref="/explore" />
          <ClubReviewsSection listingId={club.id} listingName={club.name} />
        </>
      }
      rail={
        <>
          <ClubMapCard
            clubName={club.name}
            city={clubAddress.city ?? ''}
            region={clubAddress.region ?? ''}
            lat={clubCoords.lat}
            lng={clubCoords.lng}
            isPrivateLocation={Boolean(extended.isPrivateLocation) || isApproximateVenue}
            showDirections={!isApproximateVenue}
          />
          <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Transparency</p>
            <h2 className="mt-1 text-sm font-semibold text-gray-100">About This Listing</h2>
            <div className="mt-3 space-y-2 text-xs text-gray-400">
              <p>{club.status === 'approved' ? 'This listing is approved for public display.' : 'This listing is awaiting review.'}</p>
              <p>{upcomingEvents.length} upcoming event{upcomingEvents.length === 1 ? '' : 's'} currently connected to this club.</p>
              <p>Listing information is descriptive and should not be interpreted as a safety certification or endorsement.</p>
            </div>
          </section>
          <ListingClaimCard
            entityType="club"
            entityId={club.id}
            entityName={club.name}
            defaultRole="manager"
          />
          {(website || emailHref || instagram || facebook || fetlife) ? (
            <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-gray-200">External Links</h2>
              <p className="mt-1 text-xs text-gray-500">Official website, contact, and social profiles.</p>
              <div className="mt-3 space-y-2">
                {website ? <ExternalLinkRow href={website} icon={<Globe size={15} />} tracking={{ entityType: 'club', entityId: club.id, destinationType: 'website', placement: 'club_page_external_website', surface: 'entity_page' }} /> : null}
                {emailHref ? <ExternalLinkRow href={emailHref} icon={<Mail size={15} />} tracking={{ entityType: 'club', entityId: club.id, destinationType: 'email', placement: 'club_page_external_email', surface: 'entity_page' }} /> : null}
                {instagram ? <ExternalLinkRow href={instagram} icon={<Instagram size={15} />} tracking={{ entityType: 'club', entityId: club.id, destinationType: 'social', placement: 'club_page_external_instagram', surface: 'entity_page' }} /> : null}
                {facebook ? <ExternalLinkRow href={facebook} icon={<Facebook size={15} />} tracking={{ entityType: 'club', entityId: club.id, destinationType: 'social', placement: 'club_page_external_facebook', surface: 'entity_page' }} /> : null}
                {fetlife ? <ExternalLinkRow href={fetlife} icon={<Link2 size={15} />} tracking={{ entityType: 'club', entityId: club.id, destinationType: 'social', placement: 'club_page_external_fetlife', surface: 'entity_page' }} /> : null}
              </div>
            </section>
          ) : null}
        </>
      }
    />
  );
};

export default ClubDetailTemplate;
