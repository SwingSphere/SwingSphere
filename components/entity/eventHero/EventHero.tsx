import React from 'react';
import HeroContainer from '../HeroContainer';
import HeroLogo from './HeroLogo';
import HeroMeta from './HeroMeta';
import HeroThumbnailStack from '../HeroThumbnailStack';
import { uiTokens } from '../../../lib/uiTokens';
import PublicFeedbackHeroBadge from '../../feedback/PublicFeedbackHeroBadge';
import { ImagePlus, Pencil } from 'lucide-react';
import { useAdminEditMode } from '../../admin-edit/AdminEditModeContext';
import SaveEntityButton from '../../profile/SaveEntityButton';

type EventHeroProps = {
  eventId: string;
  title: string;
  backgroundImageUrl?: string;
  eventLogoUrl?: string;
  clubLogoUrl?: string;
  hostLogoUrl?: string;
  timeText?: string;
  locationText?: string;
  hostName?: string;
  hostPath?: string;
  venueName?: string;
  venuePath?: string;
  tags?: string[];
  mediaImages?: string[];
  onQuickEdit?: (field: 'title' | 'logo' | 'hero' | 'gallery') => void;
};

const EventHero: React.FC<EventHeroProps> = ({
  eventId,
  title,
  backgroundImageUrl,
  eventLogoUrl,
  clubLogoUrl,
  hostLogoUrl,
  timeText,
  locationText,
  hostName,
  hostPath,
  venueName,
  venuePath,
  tags,
  mediaImages = [],
  onQuickEdit,
}) => {
  const uniqueMedia = Array.from(new Set(mediaImages.filter(Boolean)));
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControls = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);

  return (
    <HeroContainer title={title} imageUrl={backgroundImageUrl}>
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
      <div className={`absolute inset-x-0 bottom-0 z-20 px-4 pb-4 sm:px-6 sm:pb-6 ${uiTokens.hero.overlayRightPaddingDesktop}`}>
        <div className={`max-w-4xl ${uiTokens.hero.overlayMaxWidthDesktop}`}>
          <div className="ss-glass ss-glass--liquid rounded-2xl p-3 sm:p-3.5">
            <HeroMeta
              title={title}
              timeText={timeText}
              locationText={locationText}
              hostName={hostName}
              hostPath={hostPath}
              venueName={venueName}
              venuePath={venuePath}
              tags={tags}
              topRightAction={
                <SaveEntityButton
                  entityType="event"
                  entityId={eventId}
                  entityName={title}
                  entityLocation={locationText}
                  className="bg-black/25 backdrop-blur-xl"
                />
              }
            />
            <HeroThumbnailStack images={uniqueMedia} title={title} showDesktop={false} showMobile />
          </div>
        </div>
      </div>
      <HeroThumbnailStack images={uniqueMedia} title={title} showDesktop showMobile={false} />
    </HeroContainer>
  );
};

export default EventHero;
