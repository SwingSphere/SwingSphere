import React, { useEffect, useId, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPublicProfileByHandle } from '../../lib/profile/profileService';

type ProfileAvailability = 'checking' | 'visible' | 'private' | 'unknown';

type AvailabilityCacheEntry = {
  value: Exclude<ProfileAvailability, 'checking'>;
  expiresAt: number;
  revision: string;
};

const availabilityCache = new Map<string, AvailabilityCacheEntry>();
const pendingAvailability = new Map<string, Promise<Exclude<ProfileAvailability, 'checking'>>>();
const CACHE_TTL_MS = 15_000;
const PROFILE_VISIBILITY_REVISION_KEY = 'swingsphere:profile-visibility-revision';

const getVisibilityRevision = () => (
  typeof window === 'undefined'
    ? '0'
    : window.localStorage.getItem(PROFILE_VISIBILITY_REVISION_KEY) ?? '0'
);

const normalizeHandle = (handle: string) => handle.trim().replace(/^@/, '').toLowerCase();

const getCachedAvailability = (handle: string) => {
  const cached = availabilityCache.get(handle);
  if (!cached) return null;
  if (cached.revision !== getVisibilityRevision() || cached.expiresAt <= Date.now()) {
    availabilityCache.delete(handle);
    return null;
  }
  return cached.value;
};

const resolveAvailability = (handle: string) => {
  const cached = getCachedAvailability(handle);
  if (cached) return Promise.resolve(cached);

  const pending = pendingAvailability.get(handle);
  if (pending) return pending;

  const revision = getVisibilityRevision();
  let request: Promise<Exclude<ProfileAvailability, 'checking'>>;
  request = getPublicProfileByHandle(handle)
    .then((profile) => {
      const value: Exclude<ProfileAvailability, 'checking'> = profile ? 'visible' : 'private';
      if (revision === getVisibilityRevision()) {
        availabilityCache.set(handle, { value, expiresAt: Date.now() + CACHE_TTL_MS, revision });
      }
      return value;
    })
    .catch(() => 'unknown' as const)
    .finally(() => {
      if (pendingAvailability.get(handle) === request) pendingAvailability.delete(handle);
    });

  pendingAvailability.set(handle, request);
  return request;
};

const MemberAttributionLink: React.FC<{
  displayName?: string;
  handle?: string;
  className?: string;
  profileAvailability?: Exclude<ProfileAvailability, 'checking' | 'unknown'>;
}> = ({ displayName, handle, className = '', profileAvailability }) => {
  const name = displayName?.trim() || 'SwingSphere member';
  const normalizedHandle = handle ? normalizeHandle(handle) : '';
  const popoverId = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [availability, setAvailability] = useState<ProfileAvailability>(() => {
    if (profileAvailability) return profileAvailability;
    if (!normalizedHandle) return 'unknown';
    return getCachedAvailability(normalizedHandle) ?? 'checking';
  });
  const [isPrivateNoticeOpen, setIsPrivateNoticeOpen] = useState(false);

  useEffect(() => {
    if (!normalizedHandle || profileAvailability) {
      setAvailability(profileAvailability ?? 'unknown');
      return;
    }

    let cancelled = false;
    setAvailability(getCachedAvailability(normalizedHandle) ?? 'checking');
    void resolveAvailability(normalizedHandle).then((value) => {
      if (!cancelled) setAvailability(value);
    });

    return () => { cancelled = true; };
  }, [normalizedHandle, profileAvailability, refreshKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || profileAvailability) return;

    const handleVisibilityChanged = () => {
      availabilityCache.clear();
      pendingAvailability.clear();
      setIsPrivateNoticeOpen(false);
      setAvailability(normalizedHandle ? 'checking' : 'unknown');
      setRefreshKey((current) => current + 1);
    };

    window.addEventListener('swingsphere:profile-visibility-changed', handleVisibilityChanged);
    return () => window.removeEventListener('swingsphere:profile-visibility-changed', handleVisibilityChanged);
  }, [normalizedHandle, profileAvailability]);

  useEffect(() => {
    if (!isPrivateNoticeOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setIsPrivateNoticeOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPrivateNoticeOpen(false);
    };

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isPrivateNoticeOpen]);

  const profilePath = normalizedHandle ? `/users/${normalizedHandle}` : '';

  return (
    <span className={`inline-flex min-w-0 flex-col items-start align-middle leading-tight ${className}`}>
      {availability === 'visible' && normalizedHandle ? (
        <>
          <Link
            to={profilePath}
            title="Open this member's profile"
            className="max-w-full truncate font-semibold text-zinc-200 transition hover:text-white"
          >
            {name}
          </Link>
          <Link
            to={profilePath}
            title="Open this member's profile"
            className="mt-0.5 max-w-full truncate text-[11px] font-medium text-red-300 transition hover:text-red-200"
          >
            @{normalizedHandle}
          </Link>
        </>
      ) : (
        <>
          <span className="max-w-full truncate font-semibold text-zinc-200">{name}</span>
          {normalizedHandle ? (
            availability === 'private' ? (
              <span ref={wrapperRef} className="relative mt-0.5 inline-flex">
                <button
                  type="button"
                  aria-expanded={isPrivateNoticeOpen}
                  aria-controls={popoverId}
                  onClick={() => setIsPrivateNoticeOpen((current) => !current)}
                  className="inline-flex min-h-6 items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] px-2 text-[11px] font-medium text-zinc-400 transition hover:border-white/20 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                  title="This member keeps their profile private"
                >
                  @{normalizedHandle}
                  <LockKeyhole size={10} aria-hidden="true" />
                </button>
                {isPrivateNoticeOpen ? (
                  <span
                    id={popoverId}
                    role="status"
                    className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border border-white/10 bg-zinc-950/95 p-3 text-left text-xs font-normal leading-5 text-zinc-300 shadow-2xl shadow-black/50 backdrop-blur-xl"
                  >
                    <span className="flex items-start gap-2">
                      <LockKeyhole size={14} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" />
                      This member keeps their profile private. Their username remains visible with the review they posted.
                    </span>
                  </span>
                ) : null}
              </span>
            ) : (
              <span
                className="mt-0.5 max-w-full truncate text-[11px] font-medium text-zinc-500"
                title={availability === 'checking' ? 'Checking profile visibility' : 'Profile visibility is unavailable'}
              >
                @{normalizedHandle}
              </span>
            )
          ) : null}
        </>
      )}
    </span>
  );
};

export default MemberAttributionLink;
