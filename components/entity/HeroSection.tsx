import React from 'react';
import { Link } from 'react-router-dom';
import SharedHeroImage from './SharedHeroImage';
import type { HeroCropConfig } from '../../lib/media/heroCrop';

type HeroLink = {
  label: string;
  to: string;
};

type HeroSectionProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  imageUrl?: string;
  heroCrop?: HeroCropConfig | null;
  pills?: string[];
  pillLabel?: string;
  links?: HeroLink[];
};

const HeroSection: React.FC<HeroSectionProps> = ({
  eyebrow,
  title,
  subtitle,
  meta,
  imageUrl,
  heroCrop,
  pills,
  pillLabel,
  links,
}) => {
  return (
    <section className="mt-6">
      <div className="rounded-2xl overflow-hidden border border-gray-800 bg-black/40">
        <div className="relative aspect-[4/3] min-h-[280px] sm:aspect-[16/9] sm:min-h-[360px] lg:aspect-[20/9] lg:min-h-[450px]">
          <SharedHeroImage
            src={imageUrl ?? '/placeholder.jpg'}
            alt={title}
            crop={heroCrop}
            className="w-full h-full"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05060a]/85 via-[#05060a]/20 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 [text-shadow:0_2px_6px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,0.9)]">
            {eyebrow && (
              <span className="inline-flex text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gray-900/70 text-gray-200">
                {eyebrow}
              </span>
            )}
            <h1 className="text-3xl sm:text-4xl font-bold text-white mt-2">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-gray-300 mt-2">{subtitle}</p>
            )}
            {meta && meta.length > 0 && (
              <div className="mt-2 text-sm text-gray-300 space-y-1">
                {meta.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
            {links && links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="text-red-300 hover:text-red-200 underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
            {pills && pills.length > 0 && (
              <div className="mt-4">
                {pillLabel && (
                  <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">
                    {pillLabel}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {pills.map((pill) => (
                    <span
                      key={pill}
                      className="text-xs bg-white/10 text-white px-2.5 py-1 rounded-full border border-white/15"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
