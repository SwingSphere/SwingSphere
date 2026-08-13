export const uiTokens = {
  hero: {
    defaultHeight: 'h-[340px] sm:h-[420px] lg:h-[460px]',
    clubHeight: 'h-[340px] sm:h-[410px] lg:h-[450px]',
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
