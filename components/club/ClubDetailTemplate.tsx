import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Expand, ExternalLink, Globe, Link2, Mail, Pencil, X, ZoomIn, ZoomOut } from 'lucide-react';
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
import {
  getCloudflareAlternateVariantUrls,
  getListingHeroPageUrl,
  markMediaUrlFailed,
} from '../../lib/listingImage';
import {
  filterSuitableClubGalleryUrls,
  isIntrinsicFlyerOrInvalidGalleryImage,
  resolveClubGalleryLightboxUrl,
} from '../../lib/clubGallery';
import { resolveEntityHeroCrop } from '../../lib/media/heroCrop';
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

export type AssociatedClubHost = {
  id: string;
  name: string;
  href: string;
  displayLabel: string;
  upcomingCount: number;
  totalCount: number;
};

type ClubDetailTemplateProps = {
  club: ClubData;
  clubKey: string;
  upcomingEvents: ClubEventPreviewItem[];
  pastEvents?: ClubEventPreviewItem[];
  ownerOrganization?: {
    name: string;
    href: string;
    displayLabel: string;
  };
  associatedHosts?: AssociatedClubHost[];
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

const ClubDetailTemplate: React.FC<ClubDetailTemplateProps> = ({
  club,
  upcomingEvents,
  pastEvents = [],
  ownerOrganization,
  associatedHosts = [],
  onQuickEdit,
  onEditLocation,
}) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControls = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);
  const extended = club as ClubData & {
    logoImageUrl?: string;
    houseRules?: string;
    isPrivateLocation?: boolean;
  };

  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const [isLightboxZoomed, setIsLightboxZoomed] = useState(false);
  const [hiddenGalleryUrls, setHiddenGalleryUrls] = useState<string[]>([]);

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
  const coverImage = getListingHeroPageUrl(club);
  const heroCrop = useMemo(() => resolveEntityHeroCrop(club, coverImage), [club, coverImage]);

  const eventImageUrls = useMemo(
    () =>
      [...upcomingEvents, ...pastEvents]
        .map((eventItem) => eventItem.coverImage)
        .filter((url): url is string => Boolean(url)),
    [pastEvents, upcomingEvents],
  );

  const galleryImages = useMemo(
    () =>
      filterSuitableClubGalleryUrls(club, {
        coverImageUrl: coverImage,
        logoImageUrl: extended.logoImageUrl,
        eventImageUrls,
        hiddenUrls: hiddenGalleryUrls,
        allowPlaceholders: club.id === 'club-dev-template',
      }),
    [club, coverImage, eventImageUrls, extended.logoImageUrl, hiddenGalleryUrls],
  );

  const hideGalleryUrl = (urlToHide: string) => {
    setHiddenGalleryUrls((prev) => (prev.includes(urlToHide) ? prev : [...prev, urlToHide]));
  };

  useEffect(() => {
    setActivePhotoIndex(null);
    setIsLightboxZoomed(false);
    setHiddenGalleryUrls([]);
  }, [club.id]);

  useEffect(() => {
    if (activePhotoIndex !== null && activePhotoIndex >= galleryImages.length) {
      setActivePhotoIndex(galleryImages.length > 0 ? galleryImages.length - 1 : null);
    }
  }, [activePhotoIndex, galleryImages.length]);

  useEffect(() => {
    if (activePhotoIndex === null) {
      setIsLightboxZoomed(false);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePhotoIndex(null);
      } else if (event.key === 'ArrowRight' && galleryImages.length > 1) {
        setActivePhotoIndex((prev) => (prev === null ? null : (prev + 1) % galleryImages.length));
      } else if (event.key === 'ArrowLeft' && galleryImages.length > 1) {
        setActivePhotoIndex((prev) =>
          prev === null ? null : (prev - 1 + galleryImages.length) % galleryImages.length,
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePhotoIndex, galleryImages.length]);

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
  const citySlug = (clubAddress.city ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const activeRawLightboxUrl =
    activePhotoIndex !== null ? galleryImages[activePhotoIndex] ?? null : null;
  const activeLightboxUrl = useMemo(
    () => resolveClubGalleryLightboxUrl(activeRawLightboxUrl),
    [activeRawLightboxUrl],
  );

  const handleGalleryThumbnailError = (
    event: React.SyntheticEvent<HTMLImageElement>,
    originalUrl: string,
  ) => {
    const imgEl = event.currentTarget;
    const failedSrc = imgEl.getAttribute('src') || imgEl.currentSrc || originalUrl;
    const altVariants = getCloudflareAlternateVariantUrls(failedSrc);
    const nextAlt = altVariants.find((candidate) => candidate && candidate !== failedSrc);
    if (nextAlt) {
      markMediaUrlFailed(failedSrc, { entityId: club.id, role: 'gallery', nextUrl: nextAlt });
      imgEl.src = nextAlt;
      return;
    }
    markMediaUrlFailed(originalUrl, { entityId: club.id, role: 'gallery', nextUrl: null });
    hideGalleryUrl(originalUrl);
  };

  const handleGalleryThumbnailLoad = (
    event: React.SyntheticEvent<HTMLImageElement>,
    originalUrl: string,
  ) => {
    const imgEl = event.currentTarget;
    if (
      isIntrinsicFlyerOrInvalidGalleryImage({
        url: originalUrl,
        naturalWidth: imgEl.naturalWidth,
        naturalHeight: imgEl.naturalHeight,
      })
    ) {
      hideGalleryUrl(originalUrl);
    }
  };

  return (
    <>
      <ClubPageLayout
        backgroundImageUrl={coverImage}
        contextNav={
          <DetailContextNav
            breadcrumbs={[
              { label: 'Directory', href: '/discover' },
              { label: 'Clubs', href: '/discover?type=clubs' },
              ...(clubAddress.city && citySlug
                ? [{ label: clubAddress.city, href: `/swinger-clubs/${citySlug}` }]
                : []),
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
            heroCrop={heroCrop}
            logoImageUrl={extended.logoImageUrl}
            mediaPresentation={club.mediaPresentation}
            onQuickEdit={onQuickEdit}
            onEditLocation={onEditLocation}
          />
        }
        main={
          <>
            <WhatHappensHere clubName={club.name} description={club.description_short} onQuickEdit={() => onQuickEdit?.('description')} />
            {(galleryImages.length > 0 || showQuickControls) ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Gallery</div>
                    <h2 className="mt-1 text-lg font-bold text-white">Photos</h2>
                  </div>
                  {showQuickControls ? <button type="button" onClick={() => onQuickEdit?.('gallery')} className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/60 px-3 py-2 text-xs font-black text-white"><Pencil size={13} /> Edit gallery</button> : null}
                </div>
                {galleryImages.length > 0 ? (
                  <div
                    className={
                      galleryImages.length === 1
                        ? 'mt-4 max-w-sm'
                        : 'mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3'
                    }
                  >
                    {galleryImages.slice(0, 6).map((image, index) => (
                      <button
                        key={image}
                        type="button"
                        onClick={() => setActivePhotoIndex(index)}
                        aria-label={`View ${club.name} photo ${index + 1} of ${galleryImages.length}`}
                        className="group relative aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      >
                        <img
                          src={image}
                          onError={(event) => handleGalleryThumbnailError(event, image)}
                          onLoad={(event) => handleGalleryThumbnailLoad(event, image)}
                          alt={`${club.name} photo ${index + 1}`}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                        <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          <Expand size={12} /> View
                        </span>
                        {index === 5 && galleryImages.length > 6 ? <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-bold text-white">+{galleryImages.length - 6}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-500">No additional venue photos have been added yet.</p>
                )}
              </section>
            ) : null}
            <ClubRhythmSection
              schedule={club.schedule ?? []}
              summary={scheduleSummary}
              specialScheduleNotes={club.specialScheduleNotes}
              attendancePolicy={club.attendancePolicy}
              entryRequirements={club.entryRequirements}
              calendarHref={`/events?clubId=${encodeURIComponent(club.id)}`}
              hasUpcomingEvents={upcomingEvents.length > 0}
              officialWebsiteUrl={website || undefined}
              onQuickEdit={() => onQuickEdit?.('schedule')}
            />
            <ClubHouseRulesSection content={extended.houseRules} />
            <ClubEventsPreview
              events={upcomingEvents}
              pastEvents={pastEvents}
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
            {(ownerOrganization || associatedHosts.length > 0) ? (
              <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">
                  {ownerOrganization && associatedHosts.length === 0 ? 'Host / promoter' : 'Organizers at this venue'}
                </p>
                <div className="mt-3 space-y-2">
                  {ownerOrganization ? (
                    <Link
                      to={ownerOrganization.href}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3 text-gray-200 transition hover:border-red-300/35 hover:bg-white/[0.045] hover:text-white"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{ownerOrganization.name}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">View {ownerOrganization.displayLabel.toLowerCase()} profile</p>
                      </div>
                      <ExternalLink size={14} className="shrink-0 text-red-300" />
                    </Link>
                  ) : null}
                  {associatedHosts.map((host) => (
                    <Link
                      key={host.id}
                      to={host.href}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3 text-gray-200 transition hover:border-red-300/35 hover:bg-white/[0.045] hover:text-white"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{host.name}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {host.upcomingCount > 0
                            ? `${host.upcomingCount} upcoming event${host.upcomingCount === 1 ? '' : 's'} here`
                            : `${host.totalCount} event${host.totalCount === 1 ? '' : 's'} hosted here`}
                        </p>
                      </div>
                      <ExternalLink size={14} className="shrink-0 text-red-300" />
                    </Link>
                  ))}
                </div>
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
            {clubAddress.city && citySlug ? (
              <section className="ss-glass ss-glass--ambient rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">City Guide</p>
                <div className="mt-2.5 flex flex-col gap-2">
                  <Link
                    to={`/swinger-clubs/${citySlug}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-xs font-semibold text-gray-200 transition hover:border-red-300/35 hover:bg-white/[0.045] hover:text-white"
                  >
                    <span>Lifestyle &amp; Swinger Clubs in {clubAddress.city}</span>
                    <ExternalLink size={13} className="shrink-0 text-red-300" />
                  </Link>
                </div>
              </section>
            ) : null}
          </>
        }
      />

      {activeLightboxUrl && activePhotoIndex !== null && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex flex-col bg-black/95 p-4 backdrop-blur-md"
              role="dialog"
              aria-modal="true"
              aria-label={`${club.name} photo viewer`}
              onClick={() => setActivePhotoIndex(null)}
            >
              <div
                className="flex shrink-0 items-center justify-between gap-3 pb-3"
                onClick={(event) => event.stopPropagation()}
              >
                <p className="truncate text-sm font-semibold text-gray-200">
                  {club.name} — Photo {activePhotoIndex + 1} of {galleryImages.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLightboxZoomed((prev) => !prev)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-3 text-xs font-semibold text-white transition hover:border-white/30"
                    aria-label={isLightboxZoomed ? 'Zoom out photo' : 'Zoom in photo'}
                  >
                    {isLightboxZoomed ? <ZoomOut size={15} /> : <ZoomIn size={15} />}
                    <span>{isLightboxZoomed ? '1x' : '2x'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePhotoIndex(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white transition hover:border-red-400/60 hover:bg-red-500/15"
                    aria-label="Close photo viewer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto">
                {galleryImages.length > 1 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setActivePhotoIndex((prev) =>
                        prev === null ? 0 : (prev - 1 + galleryImages.length) % galleryImages.length,
                      );
                    }}
                    className="absolute left-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-xl backdrop-blur-md transition hover:border-white/30"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={20} />
                  </button>
                ) : null}

                <img
                  src={activeLightboxUrl}
                  alt={`${club.name} photo ${activePhotoIndex + 1}`}
                  onError={(event) => {
                    if (activeRawLightboxUrl && event.currentTarget.src !== activeRawLightboxUrl) {
                      event.currentTarget.src = activeRawLightboxUrl;
                      return;
                    }
                    if (activeRawLightboxUrl) {
                      hideGalleryUrl(activeRawLightboxUrl);
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsLightboxZoomed((prev) => !prev);
                  }}
                  className={
                    isLightboxZoomed
                      ? 'max-h-none max-w-[160vw] cursor-zoom-out object-contain sm:max-w-[130vw]'
                      : 'max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-4rem)] cursor-zoom-in rounded-xl object-contain shadow-2xl'
                  }
                />

                {galleryImages.length > 1 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setActivePhotoIndex((prev) =>
                        prev === null ? 0 : (prev + 1) % galleryImages.length,
                      );
                    }}
                    className="absolute right-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-xl backdrop-blur-md transition hover:border-white/30"
                    aria-label="Next photo"
                  >
                    <ChevronRight size={20} />
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

export default ClubDetailTemplate;
