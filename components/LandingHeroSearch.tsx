import React, { useEffect, useState } from 'react';
import { ChevronDown, MapPin, Search } from 'lucide-react';

const popularSearches = ['Twist', 'Miami Velvet', 'Bronze Party', 'Illuminaughty', 'CDTL'];

type LandingHeroSearchProps = {
  onSearch: (query: string, location: string) => void;
  onChipSelect: (query: string, location: string) => void;
  locationOptions: string[];
  defaultLocation: string;
};

const LandingHeroSearch: React.FC<LandingHeroSearchProps> = ({
  onSearch,
  onChipSelect,
  locationOptions,
  defaultLocation,
}) => {
  const [query, setQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(defaultLocation);

  useEffect(() => {
    setSelectedLocation(defaultLocation);
  }, [defaultLocation]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(query, selectedLocation);
  };

  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={submitSearch}
        className="ss-glass ss-glass--liquid grid gap-3 rounded-[24px] p-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.08fr)_minmax(248px,0.9fr)_auto]"
      >
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-gray-300 transition focus-within:border-red-500/60 focus-within:bg-white/[0.06] sm:col-span-2 lg:col-span-1">
          <Search className="h-5 w-5 flex-none text-gray-400" aria-hidden="true" />
          <span className="sr-only">Search clubs or events</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clubs or events..."
            className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-gray-500 outline-none"
          />
        </label>

        <label
          className="relative flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-left text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.07] focus-within:border-red-500/60 focus-within:bg-white/[0.06]"
          aria-label={`Current search location: ${selectedLocation}`}
        >
          <MapPin className="h-4 w-4 flex-none text-red-400" aria-hidden="true" />
          <span className="sr-only">Search location</span>
          <select
            value={selectedLocation}
            onChange={(event) => setSelectedLocation(event.target.value)}
            className="min-w-0 flex-1 appearance-none bg-transparent pr-9 text-sm font-semibold text-white outline-none"
          >
            {locationOptions.map((location) => (
              <option key={location} value={location} className="bg-[#0a0a0a] text-white">
                {location}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 h-4 w-4 text-gray-400" aria-hidden="true" />
        </label>

        <button
          type="submit"
          className="ss-glass ss-glass--liquid ss-glass--crimson ss-glass--interactive min-h-12 rounded-xl px-7 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-red-300"
        >
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-left">
        <span className="mr-1 text-xs font-medium text-gray-400">Popular Searches:</span>
        {popularSearches.map((search) => (
          <button
            key={search}
            type="button"
            onClick={() => onChipSelect(search, selectedLocation)}
            className="ss-glass ss-glass--ambient ss-glass--interactive rounded-full px-3 py-1.5 text-xs font-semibold text-gray-200 hover:text-white"
          >
            {search}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LandingHeroSearch;
