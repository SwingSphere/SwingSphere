import React from 'react';
import {
  Award,
  Bookmark,
  Building2,
  Eye,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Pencil,
  Settings,
  Bell,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import type { User } from '../../data/mockUsers';
import type { ProfilePrivacySettings } from '../../lib/profile/profileTypes';

const initialsFor = (displayName: string) => displayName
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || 'SS';

const navigation = [
  { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/account/saved', label: 'Saved', icon: Bookmark, end: false },
  { to: '/account/contributions', label: 'Contributions', icon: FileText, end: false },
  { to: '/account/achievements', label: 'Achievements', icon: Award, end: false },
  { to: '/account/public-profile', label: 'Profile', icon: Eye, end: false },
  { to: '/account/privacy', label: 'Privacy', icon: LockKeyhole, end: false },
  { to: '/account/notifications', label: 'Notifications', icon: Bell, end: false },
  { to: '/account/settings', label: 'Settings', icon: Settings, end: false },
] as const;

const visibilityCopy = {
  private: 'Private profile',
  visible: 'Visible by link',
} as const;

const MemberHubLayout: React.FC<{
  currentUser: User;
  privacy: ProfilePrivacySettings | null;
  isPrivacyLoading: boolean;
  children: React.ReactNode;
}> = ({ currentUser, privacy, isPrivacyLoading, children }) => {
  const visibility = privacy?.profileVisibility ?? 'private';

  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-8">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="ss-glass-surface overflow-hidden rounded-[24px] p-4 sm:p-5">
          <div className="flex items-center gap-3 lg:block">
            <div className="relative h-16 w-16 shrink-0 lg:h-20 lg:w-20">
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-red-500/25 via-zinc-900 to-black text-lg font-black text-white">
                {currentUser.avatarUrl
                  ? <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : initialsFor(currentUser.displayName)}
              </div>
              <Link
                to="/account/public-profile#profile-photo"
                aria-label="Change profile picture"
                title="Change profile picture"
                className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#111218] text-gray-200 shadow-lg transition hover:border-red-400/45 hover:bg-red-500/15 hover:text-white"
              >
                <Pencil size={14} aria-hidden="true" />
              </Link>
            </div>
            <div className="min-w-0 lg:mt-4">
              <h1 className="truncate text-lg font-black text-white">{currentUser.displayName}</h1>
              <p className="mt-0.5 truncate text-sm text-gray-500">@{currentUser.handle || 'profile-handle'}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[11px] font-semibold text-gray-300">
                <LockKeyhole size={12} aria-hidden="true" />
                {isPrivacyLoading ? 'Checking privacy…' : visibilityCopy[visibility]}
              </span>
            </div>
          </div>

          <nav aria-label="Member hub" className="mt-5 hidden space-y-1 lg:block">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'border border-red-400/30 bg-red-500/10 text-white'
                    : 'border border-transparent text-gray-400 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <Icon size={17} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          {(currentUser.role === 'Host' || currentUser.role === 'Admin') ? (
            <NavLink
              to="/host-dashboard"
              className="mt-4 hidden min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-red-400/30 hover:text-white lg:flex"
            >
              <Building2 size={17} aria-hidden="true" /> Organizer workspace
            </NavLink>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0">
        <nav aria-label="Member hub sections" className="ss-glass-surface sticky top-[72px] z-20 mb-4 flex gap-1 overflow-x-auto rounded-2xl p-1.5 lg:hidden">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                isActive ? 'bg-red-500/12 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              <Icon size={16} aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
};

export default MemberHubLayout;
