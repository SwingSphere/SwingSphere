import React from 'react';

type HeroLogoProps = {
  eventTitle: string;
  eventLogoUrl?: string;
  clubLogoUrl?: string;
  hostLogoUrl?: string;
};

const getInitial = (title: string): string => {
  const trimmed = title.trim();
  if (!trimmed) return 'E';
  return trimmed.charAt(0).toUpperCase();
};

const HeroLogo: React.FC<HeroLogoProps> = ({ eventTitle, eventLogoUrl, clubLogoUrl, hostLogoUrl }) => {
  const logoSrc = eventLogoUrl || clubLogoUrl || hostLogoUrl;
  const fallback = getInitial(eventTitle);
  const hasLogo = Boolean(logoSrc);

  return (
    <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6">
      <div
        className={`flex items-center justify-center overflow-hidden ss-glass ss-glass--liquid rounded-2xl ${
          hasLogo ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-16 w-16 sm:h-20 sm:w-20'
        }`}
      >
        {logoSrc ? (
          <img src={logoSrc} alt={`${eventTitle} logo`} className="h-full w-full object-contain" />
        ) : (
          <span className="text-2xl font-bold text-white">{fallback}</span>
        )}
      </div>
    </div>
  );
};

export default HeroLogo;
