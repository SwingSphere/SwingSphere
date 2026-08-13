import React from 'react';
import { Building2, CalendarDays, Globe2, MapPinned } from 'lucide-react';
import type { Listing } from '../types';
import { isActiveDiscoveryListing } from '../lib/eventLifecycle';

type LandingStatsBarProps = {
  listings: Listing[];
};

const formatStatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);

const LandingStatsBar: React.FC<LandingStatsBarProps> = ({ listings }) => {
  const publishedListings = listings.filter(
    (listing) => listing.status === 'approved' && isActiveDiscoveryListing(listing),
  );
  const clubs = publishedListings.filter((listing) => listing.type === 'club').length;
  const activeEvents = publishedListings.filter((listing) => listing.type === 'event').length;
  const countries = new Set(
    publishedListings
      .map((listing) => listing.geopoint.address.country)
      .filter(Boolean),
  ).size;

  const stats = [
    {
      label: 'Clubs',
      value: formatStatNumber(clubs),
      icon: Building2,
    },
    {
      label: 'Active Events',
      value: formatStatNumber(activeEvents),
      icon: CalendarDays,
    },
    {
      label: 'Countries',
      value: formatStatNumber(countries),
      icon: Globe2,
    },
    {
      label: 'Published Listings',
      value: formatStatNumber(publishedListings.length),
      icon: MapPinned,
    },
  ];

  return (
    <div className="relative z-10 container mx-auto max-w-6xl px-6 pb-8 lg:px-8">
      <div className="ss-glass ss-glass--liquid grid grid-cols-2 overflow-hidden rounded-[22px] sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex min-h-24 items-center justify-center gap-3 border-white/10 px-4 py-3 border-r last:border-r-0"
          >
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-red-500/35 bg-red-500/10 text-red-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight text-white">{value}</div>
              <div className="mt-1 text-xs font-medium text-gray-400">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LandingStatsBar;
