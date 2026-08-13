import React from "react";
import type { Listing } from "../types";
import { getListingImageUrl, handleListingImageError } from "../lib/listingImage";
import { getPublicLocationLabel, isApproximateLocation } from "../lib/publicLocation";
import ListingAccessSummary from "./listing/ListingAccessSummary";

const ThumbsUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333V17h8.258-3.086a2 2 0 01-1.523-.727l-4.286-5.714a2 2 0 01.12-2.673A1.996 1.996 0 018 6h6.5a2 2 0 012 2v6a2 2 0 01-2 2H6v-1.707z" />
  </svg>
);

type ResultCardProps = {
  listing: Listing;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClick: () => void;
  isHovered?: boolean;
  isSelected?: boolean;
};

export const ResultCard: React.FC<ResultCardProps> = ({
  listing,
  onPointerEnter,
  onPointerLeave,
  onClick,
  isHovered = false,
  isSelected = false,
}) => {
  // Prefer a unified tags array with safe fallback
  const tags = (listing.type === "club" ? listing.generalAmenities : listing.tags) ?? [];

  // Safe review calc
  const up = listing.reviewScore?.thumbsUp ?? 0;
  const down = listing.reviewScore?.thumbsDown ?? 0;
  const total = up + down;
  const pct = total > 0 ? Math.round((up / total) * 100) : null;
  const locationLabel = getPublicLocationLabel(listing);
  const isApproximate = isApproximateLocation(listing);

  const stateClasses = isSelected
    ? "border-red-500 ring-2 ring-red-500/40"
    : isHovered
    ? "border-red-500/50"
    : "border-gray-800";
    
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      className={`bg-gray-900/50 rounded-lg border flex gap-4 p-3 hover:bg-gray-800/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/40 ${stateClasses}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onKeyDown={handleKey}
    >
      <img
        src={getListingImageUrl(listing)}
        onError={handleListingImageError}
        alt={listing.name ?? "Listing image"}
        loading="lazy"
        className="w-24 h-full md:w-32 object-cover rounded-md flex-shrink-0 bg-gray-800"
      />

      <div className="flex flex-col flex-grow min-w-0">
        <div className="flex justify-between items-start gap-3">
          <span
            className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${
              listing.type === "club"
                ? "bg-red-950/45 text-red-200"
                : "bg-blue-900/40 text-blue-200"
            }`}
          >
            {listing.type}
          </span>

          {pct === null ? (
            <span className="text-xs text-gray-500">No reviews</span>
          ) : (
            <div className="flex items-center gap-1 text-green-400 shrink-0">
              <ThumbsUpIcon />
              <span className="text-xs font-bold">{pct}%</span>
              <span className="text-xs text-gray-500">({total})</span>
            </div>
          )}
        </div>

        <h3 className="text-base md:text-lg font-bold text-white mt-1 truncate">{listing.name}</h3>
        <div className="mt-1 min-w-0">
          {isApproximate ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200/80">Approximate location</p>
              <p className="truncate text-sm text-gray-400">{locationLabel}</p>
            </>
          ) : (
            <p className="truncate text-sm text-gray-400">{locationLabel}</p>
          )}
        </div>
        <ListingAccessSummary listing={listing} variant="card" />

        <div className="mt-auto pt-2">
            {!!tags.length && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-xs bg-gray-700 text-gray-200 px-2 py-1 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
