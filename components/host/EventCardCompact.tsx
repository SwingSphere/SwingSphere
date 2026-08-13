import React from 'react';
import { Link } from 'react-router-dom';

type EventCardCompactProps = {
  title: string;
  dateTime: string;
  city: string;
  tags: string[];
  to?: string;
  isPast?: boolean;
};

const EventCardCompact: React.FC<EventCardCompactProps> = ({
  title,
  dateTime,
  city,
  tags,
  to,
  isPast = false,
}) => {
  const visibleTags = tags.slice(0, 3);
  const overflow = Math.max(0, tags.length - visibleTags.length);
  const titleClass = isPast ? 'text-gray-300' : 'text-gray-100';

  return (
    <article className="ss-glass ss-glass--ambient ss-glass--interactive rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className={`truncate text-sm font-semibold ${titleClass}`}>{title}</h4>
          <p className={`mt-1 text-xs ${isPast ? 'text-gray-500' : 'text-gray-400'}`}>
            {dateTime || 'Schedule TBD'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {city ? (
              <span className="ss-glass ss-glass--ambient rounded-full px-2 py-0.5 text-[11px] text-gray-300">
                {city}
              </span>
            ) : null}
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="ss-glass ss-glass--ambient rounded-full px-2 py-0.5 text-[11px] text-gray-400"
              >
                {tag}
              </span>
            ))}
            {overflow > 0 ? (
              <span className="ss-glass ss-glass--ambient rounded-full px-2 py-0.5 text-[11px] text-gray-400">
                +{overflow}
              </span>
            ) : null}
          </div>
        </div>
        {to ? (
          <Link
            to={to}
            className={`shrink-0 text-xs font-semibold transition-colors ${
              isPast ? 'text-gray-400 hover:text-gray-300' : 'text-red-300 hover:text-red-200'
            }`}
          >
            View &rarr;
          </Link>
        ) : null}
      </div>
    </article>
  );
};

export default EventCardCompact;
