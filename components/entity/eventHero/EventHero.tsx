import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import HeroContainer from '../HeroContainer';
import HeroLogo from './HeroLogo';
import HeroThumbnailStack from '../HeroThumbnailStack';
import HeroTagRow from '../HeroTagRow';
import PublicFeedbackHeroBadge from '../../feedback/PublicFeedbackHeroBadge';
import { ImagePlus, Pencil, X } from 'lucide-react';
import { useAdminEditMode } from '../../admin-edit/AdminEditModeContext';
import SaveEntityButton from '../../profile/SaveEntityButton';

type EventHeroProps = {
  eventId: string;
  title: string;
  backgroundImageUrl?: string;
  mobileFlyerImageUrl?: string;
  eventLogoUrl?: string;
  clubLogoUrl?: string;
  hostLogoUrl?: string;
  locationText?: string;
  tags?: string[];
  mediaImages?: string[];
  onQuickEdit?: (field: 'title' | 'logo' | 'hero' | 'gallery' | 'flyer') => void;
};

const EventHero: React.FC<EventHeroProps> = ({
  eventId,
  title,
  backgroundImageUrl,
  mobileFlyerImageUrl,
  eventLogoUrl,
  clubLogoUrl,
  hostLogoUrl,
  locationText,
  tags,
  mediaImages = [],
  onQuickEdit,
}) => {
  const uniqueMedia = Array.from(new Set(mediaImages.filter(Boolean)));
  const [isMobileFlyerOpen, setIsMobileFlyerOpen] = useState(false);
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControls = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);

  const saveAction = (
    <SaveEntityButton
      entityType="event"
      entityId={eventId}
      entityName={title}
      entityLocation={locationText}
      className="bg-black/25 backdrop-blur-xl"
    />
  );

  return (
    <>
      <section className="mt-3 sm:hidden">
        <div className="relative aspect-[4/5] min-h-[440px] w-full overflow-hidden rounded-2xl border border-gray-800 bg-black">
          <button
            type="button"
            onClick={() => mobileFlyerImageUrl && setIsMobileFlyerOpen(true)}
            className={`absolute inset-0 z-0 flex h-full w-full items-center justify-center bg-black ${mobileFlyerImageUrl ? 'cursor-zoom-in' : 'cursor-default'}`}
            aria-label={mobileFlyerImageUrl ? `Enlarge ${title} flyer` : undefined}
          >
            <img
              src={mobileFlyerImageUrl || backgroundImageUrl}
              alt={mobileFlyerImageUrl ? `${title} flyer` : title}
              className={`h-full w-full ${mobileFlyerImageUrl ? 'object-cover object-top' : 'object-cover'}`}
            />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[42%] bg-gradient-to-b from-transparent via-black/55 to-black/90" />

          {showQuickControls ? (
            <div className="absolute left-3 top-3 z-40 flex flex-wrap gap-2">
              <button type="button" onClick={() => onQuickEdit?.('flyer')} className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"><ImagePlus size={14} /> Replace flyer</button>
            </div>
          ) : null}

          <HeroLogo
            eventTitle={title}
            eventLogoUrl={eventLogoUrl}
            clubLogoUrl={clubLogoUrl}
            hostLogoUrl={hostLogoUrl}
          />
          <div className="absolute right-4 top-4 z-20">{saveAction}</div>

          <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-12">
            <div className="min-w-0 drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
              <h1 className="text-2xl font-black leading-tight text-white">{title}</h1>
              {tags?.length ? (
                <div className="mt-3">
                  <HeroTagRow tags={tags} mobileVisibleCount={2} desktopVisibleCount={3} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {isMobileFlyerOpen && mobileFlyerImageUrl && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-3 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label={`${title} flyer viewer`}
              onClick={() => setIsMobileFlyerOpen(false)}
            >
              <button
                type="button"
                onClick={() => setIsMobileFlyerOpen(false)}
                className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-xl backdrop-blur-md"
                aria-label="Close flyer viewer"
              >
                <X size={22} />
              </button>
              <img
                src={mobileFlyerImageUrl}
                alt={`${title} flyer`}
                className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] object-contain"
                onClick={(event) => event.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}

      <div className="hidden sm:block">
      <HeroContainer
        title={title}
        imageUrl={backgroundImageUrl}
        heightClassName="h-[340px] lg:h-[460px]"
      >
        {showQuickControls ? (
          <div className="absolute left-3 top-3 z-40 flex flex-wrap gap-2 sm:left-6 sm:top-6">
            <button type="button" onClick={() => onQuickEdit?.('hero')} className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"><ImagePlus size={14} /> Replace hero</button>
            <button type="button" onClick={() => onQuickEdit?.('logo')} className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"><ImagePlus size={14} /> Replace logo</button>
            <button type="button" onClick={() => onQuickEdit?.('gallery')} className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"><ImagePlus size={14} /> Add gallery</button>
            <button type="button" onClick={() => onQuickEdit?.('title')} className="ss-glass ss-glass--interactive inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/65 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Edit title</button>
          </div>
        ) : null}
        <PublicFeedbackHeroBadge targetType="event" sourceId={eventId} onClick={() => document.getElementById(`event-feedback-${eventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <HeroLogo
          eventTitle={title}
          eventLogoUrl={eventLogoUrl}
          clubLogoUrl={clubLogoUrl}
          hostLogoUrl={hostLogoUrl}
        />
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          {saveAction}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-20 sm:px-6 sm:pb-6 lg:pr-[25%]">
          <div className="max-w-4xl lg:max-w-[76%]">
            <div className="min-w-0 drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
              <h1 className="text-2xl font-black leading-tight text-white sm:text-3xl lg:text-4xl">{title}</h1>
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
    </>
  );
};

export default EventHero;
