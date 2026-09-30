import React, { useEffect, useState } from 'react';
import LivingLowPolyBackground from '../LivingLowPolyBackground';
import {
  DEFAULT_SWINGSPHERE_PALETTE,
  type LivingBackgroundPalette,
  type Rgb,
  type LowPolyThemeSettings,
} from '../../lib/livingBackgroundThemes';

type EntityLowPolyBackgroundProps = {
  imageUrl?: string | null;
};

const GREEN_LOW_POLY_SETTINGS: LowPolyThemeSettings = {
  opacity: 90,
  morph: 50,
  morphSpeed: 24,
  panelSpeed: 20,
  panelPulse: 14,
  panelFlicker: 10,
  lines: 65,
  glow: 0,
  blur: 0,
  density: 70,
};

const paletteCache = new Map<string, LivingBackgroundPalette>();

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const luminance = (rgb: Rgb) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const saturation = (rgb: Rgb) => Math.max(...rgb) - Math.min(...rgb);
const scaleRgb = (rgb: Rgb, amount: number): Rgb => [
  clampByte(rgb[0] * amount),
  clampByte(rgb[1] * amount),
  clampByte(rgb[2] * amount),
];
const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [
  clampByte(a[0] + (b[0] - a[0]) * amount),
  clampByte(a[1] + (b[1] - a[1]) * amount),
  clampByte(a[2] + (b[2] - a[2]) * amount),
];

const extractPalette = (image: HTMLImageElement): LivingBackgroundPalette | null => {
  try {
    const canvas = document.createElement('canvas');
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const buckets = new Map<string, { rgb: [number, number, number]; count: number }>();

    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index + 3] < 180) continue;
      const rgb: [number, number, number] = [pixels[index], pixels[index + 1], pixels[index + 2]];
      const key = rgb.map((value) => Math.round(value / 24) * 24).join(',');
      const bucket = buckets.get(key);
      if (bucket) bucket.count += 1;
      else buckets.set(key, { rgb, count: 1 });
    }

    const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
    const useful = ranked.filter(({ rgb }) => luminance(rgb) > 18 && luminance(rgb) < 245);
    if (!useful.length) return null;

    const accents = [...useful].sort(
      (a, b) => saturation(b.rgb) * Math.sqrt(b.count) - saturation(a.rgb) * Math.sqrt(a.count),
    );
    const dominant = useful[0]?.rgb ?? [70, 70, 76];
    const rawAccent = accents[0]?.rgb ?? dominant;
    const rawSecondary =
      accents.find(
        ({ rgb }) =>
          Math.abs(rgb[0] - rawAccent[0]) +
            Math.abs(rgb[1] - rawAccent[1]) +
            Math.abs(rgb[2] - rawAccent[2]) >
          70,
      )?.rgb ?? mix(rawAccent, dominant, 0.5);

    const maxAccentLum = 135;
    const accentLum = luminance(rawAccent);
    const accent = accentLum > maxAccentLum ? scaleRgb(rawAccent, maxAccentLum / accentLum) : rawAccent;
    const secondaryLum = luminance(rawSecondary);
    const secondary =
      secondaryLum > maxAccentLum ? scaleRgb(rawSecondary, maxAccentLum / secondaryLum) : rawSecondary;

    return {
      darkA: scaleRgb(dominant, Math.min(0.06, 12 / (luminance(dominant) || 1))),
      darkB: mix(scaleRgb(dominant, 0.22), [38, 40, 46], 0.4),
      accentA: scaleRgb(accent, 0.25),
      accentB: mix(scaleRgb(accent, 0.65), secondary, 0.25),
      accentHot: mix(scaleRgb(accent, 0.95), [240, 242, 250], 0.12),
    };
  } catch {
    return null;
  }
};

const EntityLowPolyBackground: React.FC<EntityLowPolyBackgroundProps> = ({ imageUrl }) => {
  const [palette, setPalette] = useState<LivingBackgroundPalette>(() =>
    imageUrl ? paletteCache.get(imageUrl) ?? DEFAULT_SWINGSPHERE_PALETTE : DEFAULT_SWINGSPHERE_PALETTE,
  );

  useEffect(() => {
    if (!imageUrl) {
      setPalette(DEFAULT_SWINGSPHERE_PALETTE);
      return;
    }

    const cached = paletteCache.get(imageUrl);
    if (cached) {
      setPalette(cached);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      const extracted = extractPalette(image);
      if (!extracted) return;
      paletteCache.set(imageUrl, extracted);
      setPalette(extracted);
    };
    image.onerror = () => {
      if (!cancelled) setPalette(DEFAULT_SWINGSPHERE_PALETTE);
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#030405]" aria-hidden="true">
      <LivingLowPolyBackground
        opacity={GREEN_LOW_POLY_SETTINGS.opacity / 100}
        morphStrength={GREEN_LOW_POLY_SETTINGS.morph / 100}
        morphSpeed={GREEN_LOW_POLY_SETTINGS.morphSpeed / 100}
        colorSpeed={GREEN_LOW_POLY_SETTINGS.panelSpeed / 100}
        colorStrength={GREEN_LOW_POLY_SETTINGS.panelPulse / 100}
        panelFlicker={GREEN_LOW_POLY_SETTINGS.panelFlicker / 100}
        lineStrength={GREEN_LOW_POLY_SETTINGS.lines / 100}
        glowStrength={0}
        blurPx={0}
        density={GREEN_LOW_POLY_SETTINGS.density}
        interactive={false}
        palette={palette}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,4,5,0.18)_0%,rgba(3,4,5,0.06)_34%,rgba(3,4,5,0.30)_100%)]" />
    </div>
  );
};

export default EntityLowPolyBackground;
