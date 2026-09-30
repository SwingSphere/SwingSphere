import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Compass, Globe2, MapPin, MapPinned } from 'lucide-react';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type DetailContextNavProps = {
  backTo?: string;
  backLabel?: string;
  breadcrumbs: BreadcrumbItem[];
  listingId?: string;
  streetViewAvailable?: boolean;
  showSpatialActions?: boolean;
  className?: string;
};

export const DetailContextNav: React.FC<DetailContextNavProps> = ({
  backTo = '/discover',
  backLabel = 'Back',
  breadcrumbs,
  listingId,
  streetViewAvailable = false,
  showSpatialActions = true,
  className = '',
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    // If the user has history in the app, go back. Otherwise use fallback destination.
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate(backTo);
    }
  };

  const globeHref = listingId ? `/globe?mapListing=${encodeURIComponent(listingId)}` : '/globe';
  const mapHref = listingId ? `/map?mapListing=${encodeURIComponent(listingId)}` : '/map';
  const streetViewHref = listingId && streetViewAvailable ? `/street-view?listingId=${encodeURIComponent(listingId)}` : null;

  return (
    <nav
      aria-label="Context navigation"
      className={`ss-glass ss-glass--liquid mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] px-3.5 py-2.5 shadow-lg backdrop-blur-xl ${className}`}
    >
      {/* Left: Back button & Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-gray-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          aria-label={backLabel}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
          <span>{backLabel}</span>
        </button>

        {breadcrumbs.length > 0 ? (
          <ol className="hidden items-center gap-1.5 text-xs text-gray-400 sm:flex">
            <span className="text-gray-600">|</span>
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${idx}`} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-gray-600" aria-hidden="true" />}
                  {crumb.href && !isLast ? (
                    <Link
                      to={crumb.href}
                      className="max-w-[140px] truncate font-medium text-gray-400 transition hover:text-gray-200"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={`max-w-[200px] truncate ${
                        isLast ? 'font-semibold text-white' : 'font-medium text-gray-400'
                      }`}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>

      {/* Right: Direct Spatial Discovery Jump Actions */}
      {showSpatialActions ? <div className="flex items-center gap-1.5 text-xs">
        <Link
          to={globeHref}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-white"
          title="View this location on the 3D globe"
        >
          <Globe2 className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
          <span className="hidden xs:inline sm:inline">View on Globe</span>
          <span className="xs:hidden sm:hidden">Globe</span>
        </Link>

        <Link
          to={mapHref}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-white"
          title="View this location on the flat map"
        >
          <MapPin className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          <span className="hidden xs:inline sm:inline">View on Map</span>
          <span className="xs:hidden sm:hidden">Map</span>
        </Link>

        {streetViewHref ? (
          <Link
            to={streetViewHref}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/25 hover:text-white"
            title="Explore 3D Street View"
          >
            <MapPinned className="h-3.5 w-3.5 text-red-300" aria-hidden="true" />
            <span className="hidden sm:inline">Street View</span>
          </Link>
        ) : null}
      </div> : null}
    </nav>
  );
};

export default DetailContextNav;
