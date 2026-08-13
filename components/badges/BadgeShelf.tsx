import React from 'react';
import {
  Archive,
  Award,
  Bug,
  CalendarDays,
  Compass,
  Footprints,
  HandHeart,
  Map,
  MessageCircle,
  Radio,
  Rocket,
  Sparkles,
  Star,
  UsersRound,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { badgeDisplayName, type BadgeAwardView } from '../../lib/badges/badgeTypes';

type BadgeShelfProps = {
  badges: BadgeAwardView[];
  limit?: number;
  compact?: boolean;
  showHeading?: boolean;
  heading?: string;
  className?: string;
};

const iconByKey: Record<string, LucideIcon> = {
  'founder-sphere': Sparkles,
  'beta-explorer': Rocket,
  footprint: Footprints,
  pathfinder: Compass,
  cartographer: Map,
  'fine-tuner': Wrench,
  archivist: Archive,
  'first-voice': MessageCircle,
  'trusted-voice': Radio,
  'bug-hunter': Bug,
  friend: HandHeart,
  'community-builder': UsersRound,
  trailblazer: Star,
  'early-supporter': HandHeart,
  'founding-organizer': Sparkles,
  'first-event': CalendarDays,
  'event-builder': CalendarDays,
  'seasoned-host': Award,
};

const paletteClasses: Record<string, string> = {
  founder: 'from-amber-300/35 via-fuchsia-500/20 to-cyan-400/30 ring-amber-200/35',
  violet: 'from-violet-400/35 via-fuchsia-500/20 to-indigo-500/30 ring-violet-300/30',
  cyan: 'from-cyan-300/35 via-sky-500/20 to-blue-500/30 ring-cyan-200/30',
  blue: 'from-blue-300/35 via-indigo-500/20 to-cyan-500/25 ring-blue-200/30',
  mint: 'from-emerald-300/35 via-cyan-500/20 to-teal-500/30 ring-emerald-200/30',
  amber: 'from-amber-300/35 via-orange-500/20 to-yellow-500/25 ring-amber-200/30',
  magenta: 'from-fuchsia-300/35 via-pink-500/20 to-violet-500/30 ring-fuchsia-200/30',
  'royal-blue': 'from-blue-400/35 via-violet-500/20 to-indigo-600/30 ring-blue-200/30',
  lime: 'from-lime-300/35 via-emerald-500/20 to-green-500/30 ring-lime-200/30',
  rose: 'from-rose-300/35 via-pink-500/20 to-fuchsia-500/25 ring-rose-200/30',
  orange: 'from-orange-300/35 via-red-500/20 to-amber-500/30 ring-orange-200/30',
  fuchsia: 'from-fuchsia-300/35 via-violet-500/20 to-pink-500/30 ring-fuchsia-200/30',
  gold: 'from-yellow-300/35 via-amber-500/20 to-orange-500/30 ring-yellow-200/30',
  ruby: 'from-red-300/35 via-rose-500/20 to-fuchsia-600/25 ring-red-200/30',
};

const AchievementBadge: React.FC<{ badge: BadgeAwardView; compact?: boolean }> = ({ badge, compact = false }) => {
  const Icon = iconByKey[badge.iconKey ?? ''] ?? Award;
  const palette = badge.visualStyle.palette ?? 'violet';
  const paletteClass = paletteClasses[palette] ?? paletteClasses.violet;
  const founderNumber = badge.badgeSlug === 'founding-member' && typeof badge.metadata.founder_number === 'number'
    ? String(badge.metadata.founder_number).padStart(3, '0')
    : null;

  return (
    <div
      className={`group flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'} backdrop-blur-md`}
      title={badge.description}
    >
      <div className={`relative flex ${compact ? 'h-10 w-10' : 'h-12 w-12'} shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-gradient-to-br ${paletteClass} ring-1 shadow-[0_10px_30px_rgba(0,0,0,.28)]`}>
        <div className="absolute inset-[5px] rotate-45 rounded-[9px] border border-white/20 bg-black/35" />
        <Icon className="relative text-white drop-shadow" size={compact ? 19 : 22} strokeWidth={2.2} aria-hidden="true" />
        {founderNumber ? (
          <span className="absolute bottom-0.5 right-1 rounded bg-black/70 px-1 text-[8px] font-black tracking-tight text-white">{founderNumber}</span>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className={`${compact ? 'text-xs' : 'text-sm'} truncate font-black text-white`}>{badgeDisplayName(badge)}</p>
        <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.13em] text-gray-500">{badge.category} · {badge.rarity}</p>
      </div>
    </div>
  );
};

const BadgeShelf: React.FC<BadgeShelfProps> = ({
  badges,
  limit = 4,
  compact = false,
  showHeading = true,
  heading = 'Achievements',
  className = '',
}) => {
  if (!badges.length) return null;
  const displayed = badges.slice(0, limit);
  const hiddenCount = Math.max(0, badges.length - displayed.length);

  return (
    <section className={className} aria-label={heading}>
      {showHeading ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{heading}</p>
          {hiddenCount ? <span className="text-[10px] font-semibold text-gray-600">+{hiddenCount} more</span> : null}
        </div>
      ) : null}
      <div className={`grid gap-2 ${compact ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'}`}>
        {displayed.map((badge) => <AchievementBadge key={badge.awardId} badge={badge} compact={compact} />)}
      </div>
    </section>
  );
};

export { AchievementBadge };
export default BadgeShelf;
