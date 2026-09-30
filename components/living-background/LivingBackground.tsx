import React from 'react';
import LivingLowPolyBackground, { type LivingLowPolyBackgroundProps } from '../LivingLowPolyBackground';
import LivingSilkRibbonsTheme from './themes/LivingSilkRibbonsTheme';
import LivingWatercolorTheme from './themes/LivingWatercolorTheme';
import LivingAuroraTheme from './themes/LivingAuroraTheme';
import LivingSculpturalTheme from './themes/LivingSculpturalTheme';
import type {
  AuroraThemeSettings,
  LivingBackgroundPalette,
  LivingBackgroundPerformanceMode,
  LivingBackgroundThemeId,
  LowPolyThemeSettings,
  SculpturalThemeSettings,
  SilkRibbonsThemeSettings,
  WatercolorThemeSettings,
} from '../../lib/livingBackgroundThemes';

export type LivingBackgroundProps = {
  theme?: LivingBackgroundThemeId;
  opacity?: number;
  blurPx?: number;
  interactive?: boolean;
  className?: string;
  palette?: LivingBackgroundPalette;
  lowPolySettings?: Partial<LowPolyThemeSettings>;
  silkSettings?: Partial<SilkRibbonsThemeSettings>;
  silkRibbonsSettings?: Partial<SilkRibbonsThemeSettings>;
  liquidSettings?: Partial<WatercolorThemeSettings>;
  watercolorSettings?: Partial<WatercolorThemeSettings>;
  auroraSettings?: Partial<AuroraThemeSettings>;
  sculpturalSettings?: Partial<SculpturalThemeSettings>;
  performanceMode?: LivingBackgroundPerformanceMode;
};

export default function LivingBackground({
  theme = 'low-poly',
  opacity = 0.7,
  blurPx = 0,
  interactive = true,
  className = '',
  palette,
  lowPolySettings,
  silkSettings,
  silkRibbonsSettings,
  liquidSettings,
  watercolorSettings,
  auroraSettings,
  sculpturalSettings,
  performanceMode = 'balanced',
}: LivingBackgroundProps) {
  const containerStyle: React.CSSProperties = {
    opacity,
    filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
  };

  switch (theme) {
    case 'silk-ribbons':
    case 'silk':
      return (
        <div style={containerStyle} className={`pointer-events-none absolute inset-0 ${className}`}>
          <LivingSilkRibbonsTheme
            interactive={interactive}
            palette={palette}
            settings={(silkRibbonsSettings ?? silkSettings) as SilkRibbonsThemeSettings | undefined}
            performanceMode={performanceMode}
          />
        </div>
      );

    case 'watercolor':
    case 'liquid':
      return (
        <div style={containerStyle} className={`pointer-events-none absolute inset-0 ${className}`}>
          <LivingWatercolorTheme
            interactive={interactive}
            palette={palette}
            settings={(watercolorSettings ?? liquidSettings) as WatercolorThemeSettings | undefined}
            performanceMode={performanceMode}
          />
        </div>
      );

    case 'aurora':
      return (
        <div style={containerStyle} className={`pointer-events-none absolute inset-0 ${className}`}>
          <LivingAuroraTheme
            interactive={interactive}
            palette={palette}
            settings={auroraSettings as AuroraThemeSettings | undefined}
          />
        </div>
      );

    case 'sculptural':
      return (
        <div style={containerStyle} className={`pointer-events-none absolute inset-0 ${className}`}>
          <LivingSculpturalTheme
            interactive={interactive}
            palette={palette}
            settings={sculpturalSettings as SculpturalThemeSettings | undefined}
          />
        </div>
      );

    case 'low-poly':
    default: {
      const lpProps: LivingLowPolyBackgroundProps = {
        opacity: 1, // Opacity handled by outer wrapper
        morphStrength: lowPolySettings?.morph !== undefined ? lowPolySettings.morph / 100 : 1,
        morphSpeed: lowPolySettings?.morphSpeed !== undefined ? lowPolySettings.morphSpeed / 100 : 1.6,
        colorSpeed: lowPolySettings?.panelSpeed !== undefined ? lowPolySettings.panelSpeed / 100 : 0.99,
        colorStrength: lowPolySettings?.panelPulse !== undefined ? lowPolySettings.panelPulse / 100 : 1,
        panelFlicker: lowPolySettings?.panelFlicker !== undefined ? lowPolySettings.panelFlicker / 100 : 0.07,
        lineStrength: lowPolySettings?.lines !== undefined ? lowPolySettings.lines / 100 : 0,
        glowStrength: lowPolySettings?.glow !== undefined ? lowPolySettings.glow / 100 : 0.41,
        density: lowPolySettings?.density ?? 100,
        blurPx: 0, // Managed by container wrapper
        interactive,
        palette,
      };

      return (
        <div style={containerStyle} className={`pointer-events-none absolute inset-0 ${className}`}>
          <LivingLowPolyBackground {...lpProps} />
        </div>
      );
    }
  }
}
