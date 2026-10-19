export const uiTokens = {
  hero: {
    defaultHeight: 'aspect-[4/3] min-h-[220px] sm:aspect-[16/9] sm:min-h-[320px] lg:aspect-[20/9] lg:min-h-[420px]',
    clubHeight: 'aspect-[4/3] min-h-[220px] sm:aspect-[16/9] sm:min-h-[320px] lg:aspect-[20/9] lg:min-h-[420px]',
    overlayRightPaddingDesktop: 'lg:pr-[24%]',
    overlayMaxWidthDesktop: 'lg:max-w-[70%]',
  },
  thumbnail: {
    desktopTileSize: 'h-[72px] w-[88px] xl:h-[80px] xl:w-[96px]',
    mobileTileSize: 'h-16 w-20',
    desktopGap: 'lg:gap-2',
  },
  surface: {
    sectionRadius: 'rounded-2xl',
    cardRadius: 'rounded-xl',
  },
} as const;

export type UiTokens = typeof uiTokens;
