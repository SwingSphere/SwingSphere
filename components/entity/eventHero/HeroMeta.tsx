import React from 'react';
import { Link } from 'react-router-dom';
import EntityTypePill from '../EntityTypePill';
import HeroTagRow from '../HeroTagRow';

type HeroMetaProps = {
  title: string;
  timeText?: string;
  locationText?: string;
  hostName?: string;
  hostPath?: string;
  venueName?: string;
  venuePath?: string;
  tags?: string[];
  topRightAction?: React.ReactNode;
};

const HeroMeta: React.FC<HeroMetaProps> = ({
  title,
  timeText,
  locationText,
  hostName,
  hostPath,
  venueName,
  venuePath,
  tags = [],
  topRightAction,
}) => {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <EntityTypePill tone="event">Event</EntityTypePill>
        {topRightAction ? <div className="shrink-0">{topRightAction}</div> : null}
      </div>
      <h1 className="mt-2 text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">{title}</h1>
      {timeText ? <p className="mt-2 text-sm text-gray-200">{timeText}</p> : null}
      {locationText ? <p className="mt-1 text-sm text-gray-300">{locationText}</p> : null}
      {hostName ? (
        <p className="mt-1 text-sm text-gray-300">
          Host:{' '}
          {hostPath ? (
            <Link to={hostPath} className="text-red-300 underline underline-offset-4 hover:text-red-200">
              {hostName}
            </Link>
          ) : (
            <span>{hostName}</span>
          )}
        </p>
      ) : null}
      {venueName ? (
        <p className="mt-1 text-sm text-gray-300">
          Venue:{' '}
          {venuePath ? (
            <Link to={venuePath} className="text-red-300 underline underline-offset-4 hover:text-red-200">
              {venueName} &rarr;
            </Link>
          ) : (
            <span>{venueName}</span>
          )}
        </p>
      ) : null}

      {tags.length ? (
        <div className="mt-3">
          <HeroTagRow tags={tags} mobileVisibleCount={2} desktopVisibleCount={3} />
        </div>
      ) : null}
    </>
  );
};

export default HeroMeta;
