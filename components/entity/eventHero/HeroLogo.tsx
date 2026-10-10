import React, { useEffect, useMemo, useState } from 'react';
import { buildFallbackCandidateChain, markMediaUrlFailed } from '../../../lib/listingImage';

type HeroLogoProps = {
  eventTitle: string;
  eventLogoUrl?: string;
  clubLogoUrl?: string;
  hostLogoUrl?: string;
  inline?: boolean;
  className?: string;
};

const getInitial = (title: string): string => {
  const trimmed = title.trim();
  if (!trimmed) return 'E';
  return trimmed.charAt(0).toUpperCase();
};

const HeroLogo: React.FC<HeroLogoProps> = ({
  eventTitle,
  eventLogoUrl,
  clubLogoUrl,
  hostLogoUrl,
  inline = false,
  className,
}) => {
  const candidates = useMemo(
    () => buildFallbackCandidateChain([eventLogoUrl, clubLogoUrl, hostLogoUrl], false),
    [eventLogoUrl, clubLogoUrl, hostLogoUrl],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  const logoSrc = candidates[candidateIndex] ?? null;
  const fallback = getInitial(eventTitle);
  const hasLogo = Boolean(logoSrc);
  const wrapperClass = className ?? (inline ? 'shrink-0' : 'absolute left-4 top-4 z-20 sm:left-6 sm:top-6');
  const boxSizeClass = inline
    ? hasLogo
      ? 'h-16 w-16 md:h-20 md:w-20'
      : 'h-14 w-14 md:h-16 md:w-16'
    : hasLogo
      ? 'h-16 w-16 sm:h-24 sm:w-24'
      : 'h-14 w-14 sm:h-20 sm:w-20';

  return (
    <div className={wrapperClass}>
      <div
        className={`flex items-center justify-center overflow-hidden ss-glass ss-glass--liquid rounded-2xl ${boxSizeClass}`}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={`${eventTitle} logo`}
            className="h-full w-full object-contain"
            onError={() => {
              const nextUrl = candidates[candidateIndex + 1] ?? null;
              markMediaUrlFailed(logoSrc, { role: 'logo', nextUrl });
              setCandidateIndex((prev) => prev + 1);
            }}
          />
        ) : (
          <span className="text-2xl font-bold text-white">{fallback}</span>
        )}
      </div>
    </div>
  );
};

export default HeroLogo;

