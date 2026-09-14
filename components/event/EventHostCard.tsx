import React from 'react';
import { Link } from 'react-router-dom';

type EventHostCardProps = {
  hostName: string;
  hostPath?: string;
  hostEventsCount?: number;
  hostAvatarUrl?: string;
  hostLogoUrl?: string;
  hostHeroUrl?: string;
  hostBio?: string;
};

const getInitials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('');

const EventHostCard: React.FC<EventHostCardProps> = ({
  hostName,
  hostPath,
  hostEventsCount,
  hostAvatarUrl,
  hostLogoUrl,
  hostHeroUrl,
  hostBio,
}) => {
  const identityImage = hostLogoUrl || hostAvatarUrl;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
      {hostHeroUrl ? <img src={hostHeroUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" /> : null}
      {hostHeroUrl ? <div className="absolute inset-0 bg-gradient-to-r from-[#090b0f] via-[#090b0f]/90 to-[#090b0f]/55" /> : null}
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Presented by</p>
        <div className="mt-4 flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40 text-lg font-bold text-gray-300 shadow-lg">
            {identityImage ? <img src={identityImage} alt={`${hostName} logo`} className={`h-full w-full ${hostLogoUrl ? 'object-contain p-1' : 'object-cover'}`} /> : getInitials(hostName)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-white">{hostName || 'Host TBD'}</h2>
          {hostBio ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-400">{hostBio}</p> : null}
          {typeof hostEventsCount === 'number' ? (
            <p className="mt-2 text-xs text-gray-500">
              {hostEventsCount} event{hostEventsCount === 1 ? '' : 's'} listed on SwingSphere
            </p>
          ) : null}
            {hostPath ? (
              <Link to={hostPath} className="mt-4 inline-flex rounded-lg border border-gray-700 bg-black/30 px-3 py-2 text-sm font-semibold text-gray-200 transition hover:border-gray-600 hover:text-white">
                View promoter profile
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default EventHostCard;
