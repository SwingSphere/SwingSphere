import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildFallbackCandidateChain,
  isMediaUrlKnownFailed,
  LISTING_IMAGE_FALLBACK,
  markMediaUrlFailed,
} from '../../lib/listingImage';

type EventCardCompactProps = {
  title: string;
  dateTime: string;
  tags: string[];
  city?: string;
  logoUrl?: string;
  logoAlt?: string;
  flyerUrl?: string;
  to?: string;
  isPast?: boolean;
};

const EventCardCompact: React.FC<EventCardCompactProps> = ({
  title,
  dateTime,
  tags,
  city,
  logoUrl,
  logoAlt = 'Event organizer',
  flyerUrl,
  to,
  isPast = false,
}) => {
  const logoCandidates = useMemo(
    () => buildFallbackCandidateChain([logoUrl]).filter((url) => url !== LISTING_IMAGE_FALLBACK),
    [logoUrl],
  );
  const flyerCandidates = useMemo(
    () => buildFallbackCandidateChain([flyerUrl]).filter((url) => url !== LISTING_IMAGE_FALLBACK),
    [flyerUrl],
  );
  const [failedLogoUrls, setFailedLogoUrls] = useState<string[]>([]);
  const [failedFlyerUrls, setFailedFlyerUrls] = useState<string[]>([]);
  useEffect(() => {
    setFailedLogoUrls([]);
  }, [logoUrl]);
  useEffect(() => {
    setFailedFlyerUrls([]);
  }, [flyerUrl]);
  const activeLogoUrl = logoCandidates.find((url) => !failedLogoUrls.includes(url) && !isMediaUrlKnownFailed(url));
  const activeFlyerUrl = flyerCandidates.find((url) => !failedFlyerUrls.includes(url) && !isMediaUrlKnownFailed(url));
  const showLogo = Boolean(activeLogoUrl);
  const showFlyer = Boolean(activeFlyerUrl);
  const titleClass = isPast ? 'text-gray-300' : 'text-gray-100';

  return (
    <article className="ss-glass ss-glass--ambient ss-glass--interactive relative isolate overflow-hidden rounded-xl px-4 py-3">
      {to ? (
        <Link
          to={to}
          aria-label={`View ${title}`}
          className="absolute inset-0 z-20 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-300"
        />
      ) : null}
      {showFlyer && activeFlyerUrl ? (
        <>
          <img
            src={activeFlyerUrl}
            alt=""
            aria-hidden="true"
            onError={() => {
              markMediaUrlFailed(activeFlyerUrl, 'EventCardCompact flyer');
              setFailedFlyerUrls((prev) => (prev.includes(activeFlyerUrl) ? prev : [...prev, activeFlyerUrl]));
            }}
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center opacity-45"
          />
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-[#090b10]/95 via-[#090b10]/80 to-[#090b10]/55" />
        </>
      ) : null}
      <div className="relative z-10 flex items-start gap-4">
        {showLogo && activeLogoUrl ? (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-black/70 p-1.5 sm:h-20 sm:w-20">
            <img
              src={activeLogoUrl}
              alt={`${logoAlt} logo`}
              onError={() => {
                markMediaUrlFailed(activeLogoUrl, 'EventCardCompact logo');
                setFailedLogoUrls((prev) => (prev.includes(activeLogoUrl) ? prev : [...prev, activeLogoUrl]));
              }}
              className="h-full w-full object-contain"
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
          <div className="min-w-0">
            <h4 className={`truncate text-sm font-semibold ${titleClass}`}>{title}</h4>
            <p className={`mt-1 text-xs ${isPast ? 'text-gray-500' : 'text-gray-400'}`}>
              {dateTime || 'Schedule TBD'}{city ? ` · ${city}` : ''}
            </p>
            {tags.length > 0 && (
              <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="ss-glass ss-glass--ambient shrink-0 rounded-full px-1.5 py-0.5 text-[10px] text-gray-300 sm:px-2 sm:text-[11px]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {to ? (
            <span aria-hidden="true" className={`shrink-0 text-xs font-semibold ${isPast ? 'text-gray-400' : 'text-red-300'}`}>
              View &rarr;
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export default EventCardCompact;
