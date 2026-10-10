import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Expand, ExternalLink, ImagePlus, Mail, Pencil, Ticket, X, ZoomIn, ZoomOut } from 'lucide-react';
import HeroContainer from '../HeroContainer';
import HeroLogo from './HeroLogo';
import HeroThumbnailStack from '../HeroThumbnailStack';
import HeroTagRow from '../HeroTagRow';
import PublicFeedbackHeroBadge from '../../feedback/PublicFeedbackHeroBadge';
import { useAdminEditMode } from '../../admin-edit/AdminEditModeContext';
import SaveEntityButton from '../../profile/SaveEntityButton';
import {
  buildFallbackCandidateChain,
  isMediaUrlKnownFailed,
  LISTING_IMAGE_FALLBACK,
  markMediaUrlFailed,
} from '../../../lib/listingImage';
import { getCanonicalMediaSignature } from '../../../lib/entityBrandMedia';

type EventHeroProps = {
  eventId: string;
  title: string;
  backgroundImageUrl?: string;
  backgroundFallbackUrls?: Array<string | null | undefined>;
  mobileFlyerImageUrl?: string;
  flyerFallbackUrls?: Array<string | null | undefined>;
  eventLogoUrl?: string;
  clubLogoUrl?: string;
  hostLogoUrl?: string;
  locationText?: string;
  timeText?: string;
  venueName?: string;
  venuePath?: string;
  hostName?: string;
  hostPath?: string;
  attendanceText?: string;
  accessUrl?: string;
  accessDestinationType?: 'ticket' | 'rsvp' | 'website';
  contactEmail?: string;
  calendarActions?: React.ReactNode;
  tags?: string[];
  mediaImages?: string[];
  onQuickEdit?: (field: 'title' | 'logo' | 'hero' | 'gallery' | 'flyer') => void;
  inheritedLogoSourceName?: string;
};

const EventHero: React.FC<EventHeroProps> = ({
  eventId,
  title,
  backgroundImageUrl,
  backgroundFallbackUrls = [],
  mobileFlyerImageUrl,
  flyerFallbackUrls = [],
  eventLogoUrl,
  clubLogoUrl,
  hostLogoUrl,
  locationText,
  timeText,
  venueName,
  venuePath,
  hostName,
  hostPath,
  attendanceText,
  accessUrl,
  accessDestinationType = 'website',
  contactEmail,
  calendarActions,
  tags,
  mediaImages = [],
  onQuickEdit,
  inheritedLogoSourceName,
}) => {
  const uniqueMedia = Array.from(new Set(mediaImages.filter(Boolean)));
  const [isFlyerViewerOpen, setIsFlyerViewerOpen] = useState(false);
  const [isViewerZoomed, setIsViewerZoomed] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);

  useEffect(() => {
    setFailedImageUrls([]);
    setIsFlyerViewerOpen(false);
    setIsViewerZoomed(false);
  }, [eventId, mobileFlyerImageUrl, backgroundImageUrl]);

  useEffect(() => {
    if (!isFlyerViewerOpen) {
      setIsViewerZoomed(false);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFlyerViewerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlyerViewerOpen]);

  const flyerCandidates = useMemo(
    () => buildFallbackCandidateChain([mobileFlyerImageUrl, ...flyerFallbackUrls], false),
    [mobileFlyerImageUrl, flyerFallbackUrls],
  );

  const heroCandidates = useMemo(
    () =>
      buildFallbackCandidateChain(
        [
          backgroundImageUrl,
          ...backgroundFallbackUrls,
          mobileFlyerImageUrl,
          ...flyerFallbackUrls,
          eventLogoUrl,
          hostLogoUrl,
          clubLogoUrl,
        ],
        true,
      ),
    [
      backgroundImageUrl,
      backgroundFallbackUrls,
      mobileFlyerImageUrl,
      flyerFallbackUrls,
      eventLogoUrl,
      hostLogoUrl,
      clubLogoUrl,
    ],
  );

  const primaryVisualCandidates = useMemo(
    () =>
      buildFallbackCandidateChain(
        [
          mobileFlyerImageUrl,
          ...flyerFallbackUrls,
          backgroundImageUrl,
          ...backgroundFallbackUrls,
          eventLogoUrl,
          hostLogoUrl,
          clubLogoUrl,
        ],
        true,
      ),
    [
      mobileFlyerImageUrl,
      flyerFallbackUrls,
      backgroundImageUrl,
      backgroundFallbackUrls,
      eventLogoUrl,
      hostLogoUrl,
      clubLogoUrl,
    ],
  );

  const isCandidateAvailable = (url: string) =>
    url === LISTING_IMAGE_FALLBACK || (!failedImageUrls.includes(url) && !isMediaUrlKnownFailed(url));

  const activeFlyerUrl = flyerCandidates.find(isCandidateAvailable) ?? null;
  const activeHeroUrl = heroCandidates.find(isCandidateAvailable) ?? LISTING_IMAGE_FALLBACK;
  const activePrimaryVisualUrl = primaryVisualCandidates.find(isCandidateAvailable) ?? LISTING_IMAGE_FALLBACK;
  const activeVisualIsFlyer = Boolean(activeFlyerUrl && activePrimaryVisualUrl === activeFlyerUrl);
  const canOpenViewer = Boolean(activePrimaryVisualUrl && activePrimaryVisualUrl !== LISTING_IMAGE_FALLBACK);

  const tabletGalleryImages = useMemo(() => {
    const primarySig = getCanonicalMediaSignature(activePrimaryVisualUrl);
    return uniqueMedia.filter((url) => {
      if (url === activePrimaryVisualUrl) return false;
      const sig = getCanonicalMediaSignature(url);
      if (primarySig && sig && primarySig === sig) return false;
      return true;
    });
  }, [uniqueMedia, activePrimaryVisualUrl]);

  const recordCandidateFailure = (failedUrl: string, role: 'flyer' | 'hero') => {
    const pool = role === 'flyer' ? primaryVisualCandidates : heroCandidates;
    const currentIdx = pool.indexOf(failedUrl);
    const nextUrl = currentIdx >= 0 ? pool[currentIdx + 1] ?? LISTING_IMAGE_FALLBACK : LISTING_IMAGE_FALLBACK;
    markMediaUrlFailed(failedUrl, { entityId: eventId, role, nextUrl });
    setFailedImageUrls((previous) => (previous.includes(failedUrl) ? previous : [...previous, failedUrl]));
  };

  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControls = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);

  const saveAction = (
    <SaveEntityButton
      entityType="event"
      entityId={eventId}
      entityName={title}
      entityLocation={locationText}
      className="border-white/20 bg-black/75 text-white shadow-lg backdrop-blur-xl"
    />
  );

  const tabletSummaryItems: Array<{ label: string; value: string; subValue?: string; href?: string }> = [
    { label: 'When', value: timeText || 'Schedule TBD' },
    {
      label: 'Where',
      value: venueName || locationText || 'Location TBD',
      subValue: venueName && locationText && venueName !== locationText ? locationText : undefined,
      href: venueName && venuePath ? venuePath : undefined,
    },
    ...(hostName
      ? [
          {
            label: 'Host',
            value: hostName,
            href: hostPath,
          },
        ]
      : []),
    { label: 'Admission', value: attendanceText || 'See event details' },
  ];

  const accessButtonLabel =
    accessDestinationType === 'ticket'
      ? 'Get Tickets'
      : accessDestinationType === 'rsvp'
        ? 'RSVP / Request Access'
        : 'Official Event Page';

  return (
    <>
      {/* MOBILE (< 640px): Portrait flyer is the primary visual, uncropped, with localized title footer */}
      <section className="ss-event-hero-mobile mt-3" data-testid="event-hero-mobile">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#07090d] shadow-2xl">
          <div
            className={`relative w-full overflow-hidden bg-[#06080c] ${
              activeVisualIsFlyer
                ? 'flex min-h-[410px] max-h-[72vh] items-center justify-center'
                : 'aspect-[4/3] min-h-[260px]'
            }`}
          >
            {activeVisualIsFlyer ? (
              <img
                src={activePrimaryVisualUrl}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
              />
            ) : null}

            <button
              type="button"
              onClick={() => canOpenViewer && setIsFlyerViewerOpen(true)}
              className={`relative z-10 flex h-full w-full items-center justify-center ${
                canOpenViewer ? 'cursor-zoom-in' : 'cursor-default'
              }`}
              aria-label={
                canOpenViewer
                  ? `Open full-screen ${activeVisualIsFlyer ? 'flyer' : 'image'} for ${title}`
                  : undefined
              }
            >
              <img
                src={activePrimaryVisualUrl}
                onError={() => recordCandidateFailure(activePrimaryVisualUrl, 'flyer')}
                alt={activeVisualIsFlyer ? `${title} flyer` : title}
                className={
                  activeVisualIsFlyer
                    ? 'max-h-[72vh] w-full object-contain'
                    : 'h-full w-full object-cover'
                }
              />
            </button>

            {showQuickControls ? (
              <div className="absolute left-3 top-20 z-40 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onQuickEdit?.('flyer')}
                  className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"
                >
                  <ImagePlus size={14} /> Replace flyer
                </button>
              </div>
            ) : null}

            <HeroLogo
              eventTitle={title}
              eventLogoUrl={eventLogoUrl}
              clubLogoUrl={clubLogoUrl}
              hostLogoUrl={hostLogoUrl}
              className="absolute left-3.5 top-3.5 z-20"
            />
            <div className="absolute right-3.5 top-3.5 z-20">{saveAction}</div>

            {canOpenViewer ? (
              <button
                type="button"
                onClick={() => setIsFlyerViewerOpen(true)}
                className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-gray-100 shadow-lg backdrop-blur-md transition hover:border-white/30 hover:bg-black/85"
                aria-label={`View full-screen ${activeVisualIsFlyer ? 'flyer' : 'image'}`}
              >
                <Expand className="h-3.5 w-3.5 text-red-300" />
                <span>{activeVisualIsFlyer ? 'Full flyer' : 'Enlarge'}</span>
              </button>
            ) : null}
          </div>

          <div className="border-t border-white/10 bg-[#080b10]/95 px-4 py-3.5 backdrop-blur-xl">
            <h1 className="text-2xl font-black leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.85)]">
              {title}
            </h1>
            {tags?.length ? (
              <div className="mt-2.5">
                <HeroTagRow tags={tags} mobileVisibleCount={3} desktopVisibleCount={3} />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* TABLET (640px to 1024px): Dedicated composition with uncropped portrait flyer on left and essential details on right */}
      <section
        className="ss-event-hero-tablet relative mt-3 overflow-hidden rounded-3xl border border-white/10 bg-[#080b10] shadow-2xl"
        data-testid="event-hero-tablet"
      >
        <img
          src={activeHeroUrl}
          onError={() => recordCandidateFailure(activeHeroUrl, 'hero')}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#07090d]/92 via-[#090c12]/88 to-[#07090d]/95" />

        {showQuickControls ? (
          <div className="relative z-40 flex flex-wrap gap-2 border-b border-white/10 bg-black/50 px-5 py-3">
            <button
              type="button"
              onClick={() => onQuickEdit?.('flyer')}
              className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-1.5 text-xs font-black text-white"
            >
              <ImagePlus size={14} /> Replace flyer
            </button>
            <button
              type="button"
              onClick={() => onQuickEdit?.('hero')}
              className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-1.5 text-xs font-black text-white"
            >
              <ImagePlus size={14} /> Replace hero
            </button>
            {inheritedLogoSourceName ? (
              <span className="ss-glass inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-black/65 px-3 py-1.5 text-xs font-black text-violet-100">
                Logo from {inheritedLogoSourceName}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onQuickEdit?.('logo')}
                className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-1.5 text-xs font-black text-white"
              >
                <ImagePlus size={14} /> Replace logo
              </button>
            )}
            <button
              type="button"
              onClick={() => onQuickEdit?.('title')}
              className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-1.5 text-xs font-black text-white"
            >
              <Pencil size={14} /> Edit title
            </button>
          </div>
        ) : null}

        <div className="ss-event-tablet-grid relative z-10">
          {/* Left column: Portrait flyer preserving aspect ratio */}
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => canOpenViewer && setIsFlyerViewerOpen(true)}
              className={`group relative flex min-h-[340px] max-h-[480px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/12 bg-black/60 p-2 shadow-2xl ${
                canOpenViewer ? 'cursor-zoom-in' : 'cursor-default'
              }`}
              aria-label={
                canOpenViewer
                  ? `Open full-screen ${activeVisualIsFlyer ? 'flyer' : 'image'} for ${title}`
                  : undefined
              }
            >
              <img
                src={activePrimaryVisualUrl}
                onError={() => recordCandidateFailure(activePrimaryVisualUrl, 'flyer')}
                alt={activeVisualIsFlyer ? `${title} flyer` : title}
                className="max-h-[460px] w-full rounded-xl object-contain transition duration-300 group-hover:scale-[1.01]"
              />
              {canOpenViewer ? (
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-3 py-1.5 text-xs font-semibold text-gray-100 shadow-lg backdrop-blur-md transition group-hover:border-white/30 group-hover:bg-black/90">
                  <Expand className="h-3.5 w-3.5 text-red-300" />
                  <span>{activeVisualIsFlyer ? 'Expand flyer' : 'Enlarge'}</span>
                </span>
              ) : null}
            </button>
          </div>

          {/* Right column: Logo, Save, Title, Tags, and Essential Event Information */}
          <div className="flex min-w-0 flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <HeroLogo
                    inline
                    eventTitle={title}
                    eventLogoUrl={eventLogoUrl}
                    clubLogoUrl={clubLogoUrl}
                    hostLogoUrl={hostLogoUrl}
                  />
                  <div className="min-w-0">
                    <span className="inline-flex items-center rounded-full border border-amber-300/35 bg-amber-400/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                      Event
                    </span>
                    {hostName ? (
                      <div className="mt-1 truncate text-xs font-medium text-gray-300">
                        Hosted by{' '}
                        {hostPath ? (
                          <Link to={hostPath} className="font-semibold text-red-200 hover:text-white hover:underline">
                            {hostName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-white">{hostName}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">{saveAction}</div>
              </div>

              <h1 className="mt-4 text-2xl font-black leading-tight text-white md:text-3xl [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]">
                {title}
              </h1>

              {tags?.length ? (
                <div className="mt-3">
                  <HeroTagRow tags={tags} mobileVisibleCount={3} desktopVisibleCount={4} />
                </div>
              ) : null}

              <div className="ss-event-tablet-summary-grid mt-4">
                {tabletSummaryItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-white/8 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-md"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                      {item.label}
                    </p>
                    {item.href ? (
                      <Link
                        to={item.href}
                        className="mt-1 inline-flex text-sm font-semibold leading-5 text-red-200 underline decoration-red-300/40 underline-offset-4 hover:text-white"
                      >
                        {item.value} →
                      </Link>
                    ) : (
                      <p className="mt-1 text-sm font-medium leading-5 text-gray-100">{item.value}</p>
                    )}
                    {item.subValue ? (
                      <p className="mt-0.5 text-xs leading-4 text-gray-400">{item.subValue}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {(accessUrl || contactEmail || calendarActions || tabletGalleryImages.length > 0) ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  {accessUrl ? (
                    <a
                      href={accessUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500"
                    >
                      {accessDestinationType === 'ticket' ? (
                        <Ticket className="h-3.5 w-3.5" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                      <span>{accessButtonLabel}</span>
                    </a>
                  ) : contactEmail ? (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-400/35 bg-red-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/25"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>Contact Host to RSVP</span>
                    </a>
                  ) : null}
                  {calendarActions ? <div className="min-w-0">{calendarActions}</div> : null}
                </div>
                {tabletGalleryImages.length > 0 ? (
                  <HeroThumbnailStack images={tabletGalleryImages} title={title} showDesktop={false} showMobile />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* DESKTOP (> 1024px): Preserve cinematic horizontal HeroContainer presentation */}
      <div className="ss-event-hero-desktop" data-testid="event-hero-desktop">
        <HeroContainer
          title={title}
          imageUrl={activeHeroUrl}
          fallbackImageUrls={heroCandidates.slice(1)}
          heightClassName="h-[460px]"
        >
          {showQuickControls ? (
            <div className="absolute left-6 top-6 z-40 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onQuickEdit?.('hero')}
                className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"
              >
                <ImagePlus size={14} /> Replace hero
              </button>
              {inheritedLogoSourceName ? (
                <span
                  className="ss-glass inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-black/65 px-3 py-2 text-xs font-black text-violet-100"
                  title={`This event inherits its logo from ${inheritedLogoSourceName}. Edit that reusable brand instead of creating an occurrence copy.`}
                >
                  Logo from {inheritedLogoSourceName}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onQuickEdit?.('logo')}
                  className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"
                >
                  <ImagePlus size={14} /> Replace logo
                </button>
              )}
              <button
                type="button"
                onClick={() => onQuickEdit?.('gallery')}
                className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"
              >
                <ImagePlus size={14} /> Add gallery
              </button>
              <button
                type="button"
                onClick={() => onQuickEdit?.('title')}
                className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"
              >
                <Pencil size={14} /> Edit title
              </button>
            </div>
          ) : null}
          <PublicFeedbackHeroBadge
            targetType="event"
            sourceId={eventId}
            onClick={() =>
              document
                .getElementById(`event-feedback-${eventId}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          />
          <HeroLogo
            eventTitle={title}
            eventLogoUrl={eventLogoUrl}
            clubLogoUrl={clubLogoUrl}
            hostLogoUrl={hostLogoUrl}
          />
          <div className="absolute right-6 top-6 z-20">{saveAction}</div>

          <div className="absolute inset-x-0 bottom-0 z-20 px-6 pb-6 pt-20 pr-[25%]">
            <div className="max-w-[76%]">
              <div className="min-w-0 drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
                <h1 className="text-4xl font-black leading-tight text-white">{title}</h1>
                {tags?.length ? (
                  <div className="mt-3">
                    <HeroTagRow tags={tags} mobileVisibleCount={2} desktopVisibleCount={3} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <HeroThumbnailStack images={uniqueMedia} title={title} showDesktop showMobile={false} />
        </HeroContainer>
      </div>

      {/* FULL-SCREEN FLYER / IMAGE VIEWER */}
      {isFlyerViewerOpen && canOpenViewer && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex flex-col bg-black/95 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] backdrop-blur-md"
              role="dialog"
              aria-modal="true"
              aria-label={`${title} ${activeVisualIsFlyer ? 'flyer' : 'image'} viewer`}
              onClick={() => setIsFlyerViewerOpen(false)}
            >
              <div
                className="flex shrink-0 items-center justify-between gap-3 px-2 pb-2"
                onClick={(event) => event.stopPropagation()}
              >
                <p className="truncate text-sm font-semibold text-gray-200">{title}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsViewerZoomed((current) => !current)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-3.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md transition hover:border-white/30"
                    aria-label={isViewerZoomed ? 'Zoom out flyer' : 'Zoom in flyer'}
                  >
                    {isViewerZoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
                    <span>{isViewerZoomed ? '1x' : '2x'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFlyerViewerOpen(false)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-xl backdrop-blur-md transition hover:border-white/30"
                    aria-label="Close flyer viewer"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
                <img
                  src={activePrimaryVisualUrl}
                  onError={() => recordCandidateFailure(activePrimaryVisualUrl, 'flyer')}
                  alt={activeVisualIsFlyer ? `${title} flyer` : title}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsViewerZoomed((current) => !current);
                  }}
                  className={
                    isViewerZoomed
                      ? 'max-h-none max-w-[180vw] cursor-zoom-out object-contain sm:max-w-[140vw]'
                      : 'max-h-[calc(100dvh-5rem)] max-w-[calc(100vw-1.5rem)] cursor-zoom-in object-contain'
                  }
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

export default EventHero;
