import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Image as ImageIcon, MapPin, UserRound } from 'lucide-react';
import type { Listing } from '../../types';
import type { User } from '../../data/mockUsers';
import * as api from '../../lib/api';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule } from '../../lib/media/mediaRules';

type AdminSubmissionsQueueProps = {
  users: User[];
  onReview: (listing: Listing) => void;
};

const descriptionFor = (listing: Listing) => (
  listing.type === 'club' ? listing.description_short : listing.description_full
).trim();

const mediaAssetUrl = (listing: Listing, role: 'logo' | 'hero') => {
  const asset = listing.mediaAssets?.find((candidate) => candidate.role === role);
  if (!asset) return undefined;
  return getCloudflareImageUrl({ externalId: asset.external_id, variant: getMediaRule(role).defaultVariant });
};

const mediaCountFor = (listing: Listing) => {
  if (listing.mediaAssets?.length) return new Set(listing.mediaAssets.map((asset) => asset.id)).size;
  return new Set([
    listing.logoImageUrl,
    listing.headerImageUrl,
    ...(listing.galleryImageUrls ?? []),
  ].filter((value): value is string => Boolean(value))).size;
};

const logoFor = (listing: Listing) => listing.logoImageUrl || mediaAssetUrl(listing, 'logo');
const heroFor = (listing: Listing) => listing.headerImageUrl || mediaAssetUrl(listing, 'hero');

const AdminSubmissionsQueue: React.FC<AdminSubmissionsQueueProps> = ({ users, onReview }) => {
  const [pendingSubmissions, setPendingSubmissions] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    api.getPendingSubmissions()
      .then((data) => {
        if (active) setPendingSubmissions(data);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading submissions…</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-red-600">Moderation</p>
        <h1 className="text-4xl font-bold text-gray-800">Submissions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          Review user-submitted clubs and events before they enter public discovery. Open each submission to inspect and correct its text, location, media, schedule, access rules, and other listing details before publishing.
        </p>
      </div>

      <div className="space-y-4">
        {pendingSubmissions.map((listing) => {
          const submitter = usersById.get(listing.postedByUserId);
          const hero = heroFor(listing);
          const logo = logoFor(listing);
          const description = descriptionFor(listing);
          const mediaCount = mediaCountFor(listing);
          const validationStatus = listing.locationMeta?.status?.replaceAll('_', ' ') ?? 'unvalidated';

          return (
            <article key={listing.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="grid lg:grid-cols-[240px_minmax(0,1fr)_220px]">
                <div className="relative min-h-40 bg-slate-100">
                  {hero ? (
                    <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-slate-400">
                      <div className="text-center">
                        <ImageIcon className="mx-auto h-7 w-7" />
                        <p className="mt-2 text-xs font-semibold">No hero image</p>
                      </div>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700 shadow-sm">
                    {listing.type}
                  </span>
                  {logo ? (
                    <div className="absolute bottom-3 left-3 grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-white/80 bg-white p-1.5 shadow-md">
                      <img src={logo} alt={`${listing.name} logo`} className="h-full w-full object-contain" />
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0 p-5 lg:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{listing.name}</h2>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-500"><MapPin size={14} />{listing.location}</p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Pending review</span>
                  </div>

                  <p className="mt-4 line-clamp-3 max-w-3xl text-sm leading-6 text-gray-600">
                    {description || 'No description was submitted.'}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5"><ImageIcon size={14} />{mediaCount} media item{mediaCount === 1 ? '' : 's'}</span>
                    <span className="inline-flex items-center gap-1.5"><MapPin size={14} />Location: <span className="capitalize">{validationStatus}</span></span>
                    {listing.type === 'event' ? (
                      <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />{new Date(listing.time.start).toLocaleString()}</span>
                    ) : null}
                  </div>
                </div>

                <aside className="border-t border-gray-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0 lg:p-6">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-200 text-slate-500">
                      {submitter?.avatarUrl ? <img src={submitter.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound size={17} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Submitted by</p>
                      <p className="mt-1 truncate text-sm font-bold text-gray-800">{submitter?.displayName ?? 'Unknown user'}</p>
                      <p className="truncate text-xs text-gray-500">{submitter?.email ?? listing.postedByUserId}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onReview(listing)}
                    className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
                  >
                    Review submission
                  </button>
                  <p className="mt-2 text-center text-[11px] leading-4 text-gray-400">Inspect the full listing before publishing or rejecting it.</p>
                </aside>
              </div>
            </article>
          );
        })}

        {pendingSubmissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
            <h3 className="text-lg font-semibold text-gray-800">No submissions waiting</h3>
            <p className="mt-1 text-sm">New club and event submissions will appear here for review.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AdminSubmissionsQueue;
