import React from 'react';
import HeroContainer from '../entity/HeroContainer';
import HeroThumbnailStack from '../entity/HeroThumbnailStack';
import EntityTypePill from '../entity/EntityTypePill';
import HeroTagRow from '../entity/HeroTagRow';
import { uiTokens } from '../../lib/uiTokens';
import PublicFeedbackHeroBadge from '../feedback/PublicFeedbackHeroBadge';
import { Pencil } from 'lucide-react';
import { useAdminEditMode } from '../admin-edit/AdminEditModeContext';
import type { ClubQuickEditField } from '../admin-edit/ClubQuickEditPanel';
import SaveEntityButton from '../profile/SaveEntityButton';

type ClubHeroProps = {
  clubId: string;
  clubName: string;
  locationLine: string;
  availabilityLine: string;
  tags: string[];
  backgroundImageUrl?: string;
  logoImageUrl?: string;
  mediaPresentation?: 'default' | 'monochrome';
  thumbnails?: string[];
  onQuickEdit?: (field: ClubQuickEditField) => void;
  onEditLocation?: () => void;
};

const initials = (value: string): string => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'C';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const ClubHero: React.FC<ClubHeroProps> = ({
  clubId,
  clubName,
  locationLine,
  availabilityLine,
  tags,
  backgroundImageUrl,
  logoImageUrl,
  mediaPresentation = 'default',
  thumbnails = [],
  onQuickEdit,
  onEditLocation,
}) => {
  const { isEditing, isAdvancedEditorOpen } = useAdminEditMode();
  const showQuickControls = isEditing && !isAdvancedEditorOpen && Boolean(onQuickEdit);
  const uniqueThumbs = Array.from(new Set(thumbnails.filter(Boolean)));
  const hasLogo = Boolean(logoImageUrl);
  const monochrome = mediaPresentation === 'monochrome' || clubId === 'club-epicure-cape-town';

  return (
    <HeroContainer
      title={clubName}
      imageUrl={backgroundImageUrl}
      imageClassName={monochrome ? 'grayscale contrast-[1.08]' : ''}
      heightClassName={uiTokens.hero.clubHeight}
    >
      <PublicFeedbackHeroBadge targetType="club" sourceId={clubId} onClick={() => document.getElementById(`club-feedback-${clubId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      {showQuickControls ? (
        <div className="absolute right-4 top-4 z-30 flex flex-wrap justify-end gap-2 sm:right-6 sm:top-6">
          <button type="button" onClick={() => onQuickEdit?.('hero')} className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Hero</button>
          <button type="button" onClick={() => onQuickEdit?.('gallery')} className="inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Gallery</button>
        </div>
      ) : null}
      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6">
        <div
          className={`flex items-center justify-center overflow-hidden ss-glass ss-glass--liquid rounded-2xl text-2xl font-semibold text-white ${
            hasLogo ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-16 w-16 sm:h-20 sm:w-20'
          }`}
        >
          {logoImageUrl ? (
            <img src={logoImageUrl} alt={`${clubName} logo`} className={`h-full w-full object-contain ${monochrome ? 'grayscale contrast-[1.12]' : ''}`} />
          ) : (
            <span>{initials(clubName)}</span>
          )}
        </div>
        {showQuickControls ? <button type="button" onClick={() => onQuickEdit?.('logo')} className="mt-2 inline-flex items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Logo</button> : null}
      </div>

      <div className={`absolute inset-x-0 bottom-0 z-20 px-4 pb-4 sm:px-6 sm:pb-6 ${uiTokens.hero.overlayRightPaddingDesktop}`}>
        <div className={`ss-glass ss-glass--liquid max-w-4xl rounded-2xl p-4 ${uiTokens.hero.overlayMaxWidthDesktop}`}>
          <div className="flex items-start justify-between gap-3">
            <EntityTypePill tone="club">Club</EntityTypePill>
            <SaveEntityButton
              entityType="club"
              entityId={clubId}
              entityName={clubName}
              entityLocation={locationLine}
              className="shrink-0 bg-black/25 backdrop-blur-xl"
            />
          </div>
          <div className="mt-2 flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">{clubName}</h1>
            {showQuickControls ? <button type="button" onClick={() => onQuickEdit?.('title')} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-red-300/35 bg-black/75 px-3 py-2 text-xs font-black text-white"><Pencil size={14} /> Title</button> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-200">{locationLine}</p>
            {showQuickControls && onEditLocation ? (
              <button type="button" onClick={onEditLocation} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-300/35 bg-black/60 px-2.5 py-1 text-[11px] font-black text-white">
                <Pencil size={12} /> Location
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-gray-300">{availabilityLine}</p>
          <HeroThumbnailStack images={uniqueThumbs} title={clubName} showDesktop={false} showMobile />
          {tags.length ? (
            <div className="mt-3 min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Environment & Facilities</div>
              <div className="mt-2">
                <HeroTagRow tags={tags} desktopVisibleCount={3} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <HeroThumbnailStack images={uniqueThumbs} title={clubName} showDesktop showMobile={false} />
    </HeroContainer>
  );
};

export default ClubHero;
