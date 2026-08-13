import React from 'react';
import { ArrowRight, Bookmark, Eye, FileText, LockKeyhole, MapPinned, Pencil, Sparkles, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User } from '../../data/mockUsers';
import { useMemberHubDemoContent } from '../../hooks/useMemberHubDemoContent';
import type { ProfilePrivacySettings } from '../../lib/profile/profileTypes';

const AccountOverview: React.FC<{
  currentUser: User;
  privacy: ProfilePrivacySettings | null;
}> = ({ currentUser, privacy }) => {
  const demo = useMemberHubDemoContent(currentUser);
  const visibility = privacy?.profileVisibility ?? 'private';
  const visibilityMessage = visibility === 'private'
    ? 'Your profile, saves, and activity are private. Reviews can show your username, but the username displays a private-profile lock instead of opening a page.'
    : 'Your member profile can be opened from your username or a direct link.';

  return (
    <div className="space-y-4">
      <section className="ss-glass-surface relative overflow-hidden rounded-[26px] p-6 sm:p-8">
        {currentUser.bannerUrl ? (
          <div className="absolute inset-0">
            <img src={currentUser.bannerUrl} alt="" className="h-full w-full object-cover opacity-35" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#08090e] via-[#08090e]/90 to-[#08090e]/55" />
          </div>
        ) : null}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/65 to-transparent" />
        <Link
          to="/account/public-profile#profile-banner"
          aria-label="Change profile banner"
          title="Change profile banner"
          className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55 text-gray-200 backdrop-blur-md transition hover:border-red-400/45 hover:bg-red-500/15 hover:text-white"
        >
          <Pencil size={16} aria-hidden="true" />
        </Link>
        <div className="relative z-10 max-w-3xl">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-red-200/80">
            <Sparkles size={14} aria-hidden="true" /> Member hub
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Welcome back, {currentUser.displayName}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400 sm:text-base">{visibilityMessage}</p>
        </div>
        <div className="relative z-10 mt-6 flex flex-wrap gap-3">
          <Link to="/globe" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-950/25 transition hover:bg-red-500">
            <MapPinned size={17} aria-hidden="true" /> Explore SwingSphere
          </Link>
          <Link to="/account/public-profile" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-red-400/35 hover:text-white">
            <Eye size={17} aria-hidden="true" /> Edit member profile
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OverviewCard
          icon={<Bookmark size={20} />}
          eyebrow="Private library"
          title={demo.isEnabled ? `${demo.savedDiscoveries.length} saved discoveries` : 'Saved discoveries'}
          copy={demo.isEnabled ? 'Winter Masquerade, Twist SF, and Connect.Dance.Love are currently in your temporary private library.' : 'Keep clubs, events, organizers, resorts, and cruises in a library visible only to you.'}
          to="/account/saved"
          action="Open saved"
        />
        <OverviewCard
          icon={<FileText size={20} />}
          eyebrow="Your activity"
          title={demo.isEnabled ? `${demo.contributions.length} contributions` : 'Contributions'}
          copy={demo.isEnabled ? 'See populated club and event reviews, including an edited-review state.' : 'Review feedback status, drafts, corrections, and published contributions without popularity rankings.'}
          to="/account/contributions"
          action="Review contributions"
        />
        <OverviewCard
          icon={<LockKeyhole size={20} />}
          eyebrow="Privacy"
          title={visibility === 'private' ? 'Private by default' : 'Visible by link'}
          copy="Control whether your @username stays private or opens a member profile by direct link."
          to="/account/privacy"
          action="Review visibility"
        />
      </div>

      {demo.isEnabled ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="ss-glass-surface rounded-[24px] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Recent activity</p>
                <h3 className="mt-1 text-xl font-bold text-white">Reviews</h3>
              </div>
              <Link to="/account/contributions" className="text-sm font-bold text-red-300 hover:text-red-200">View all</Link>
            </div>
            <div className="mt-5 space-y-3">
              {demo.contributions.slice(0, 3).map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                    <Star size={13} aria-hidden="true" />
                    {item.targetType} review
                    {item.editedAt ? <span className="rounded-full border border-white/10 px-2 py-0.5 normal-case tracking-normal text-gray-400">Edited</span> : null}
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">{item.targetName}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">“{item.body}”</p>
                </article>
              ))}
            </div>
          </section>

          <section className="ss-glass-surface rounded-[24px] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Private library</p>
                <h3 className="mt-1 text-xl font-bold text-white">Recently saved</h3>
              </div>
              <Link to="/account/saved" className="text-sm font-bold text-red-300 hover:text-red-200">View all</Link>
            </div>
            <div className="mt-5 space-y-3">
              {demo.savedDiscoveries.map((item) => (
                <Link key={item.id} to={`/listing/${item.entityId}`} className="flex min-h-20 items-center gap-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4 transition hover:border-red-400/25 hover:bg-red-500/[0.04]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-red-200"><Bookmark size={17} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-white">{item.targetName}</span>
                    <span className="mt-1 block truncate text-xs text-gray-500">{item.entityType.replace(/_/g, ' ')} · {item.location}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <section className="rounded-[24px] border border-white/[0.08] bg-black/25 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-gray-300">
            <LockKeyhole size={20} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-base font-bold text-white">What a review reveals</h3>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-gray-400">
              Approved written reviews may show your display name and @username. A private username displays a lock explanation; a visible username opens your member page. Your saves, attendance, recent views, email, and relationship associations remain private.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

const OverviewCard: React.FC<{
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  copy: string;
  to: string;
  action: string;
}> = ({ icon, eyebrow, title, copy, to, action }) => (
  <section className="ss-glass-surface rounded-[24px] p-5 sm:p-6">
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-red-200">{icon}</span>
    <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{eyebrow}</p>
    <h3 className="mt-1.5 text-xl font-bold text-white">{title}</h3>
    <p className="mt-2 min-h-[4.5rem] text-sm leading-6 text-gray-400">{copy}</p>
    <Link to={to} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-red-300 transition hover:text-red-200">
      {action} <ArrowRight size={16} aria-hidden="true" />
    </Link>
  </section>
);

export default AccountOverview;
