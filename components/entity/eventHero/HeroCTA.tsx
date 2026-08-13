import React from 'react';

type HeroCTAProps = {
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

const HeroCTA: React.FC<HeroCTAProps> = ({
  primaryLabel = 'RSVP / Interested',
  primaryHref = '#rsvp',
  secondaryLabel,
  secondaryHref,
}) => {
  return (
    <div className="mt-4 flex items-center gap-3">
      <a
        href={primaryHref}
        className="inline-flex items-center rounded-md border border-red-500/70 bg-red-600/90 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-red-500"
      >
        {primaryLabel}
      </a>
      {secondaryLabel && secondaryHref ? (
        <a
          href={secondaryHref}
          className="ss-glass ss-glass--liquid ss-glass--interactive inline-flex items-center rounded-xl px-2.5 py-1 text-[11px] font-semibold text-gray-200 hover:text-gray-100"
        >
          {secondaryLabel}
        </a>
      ) : null}
    </div>
  );
};

export default HeroCTA;
