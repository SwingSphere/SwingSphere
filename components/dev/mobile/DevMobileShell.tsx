import React from 'react';
import { ArrowLeft, Bookmark, Globe2, MapPin, Plus, Share2, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/appStore';
import { DEV_MOBILE_BASE, toDevMobilePath } from './devMobileRouting';

type MobileHeaderProps = {
  title: string;
  eyebrow?: string;
  showBack?: boolean;
  onBack?: () => void;
  onSave?: () => void;
  saved?: boolean;
  onShare?: () => void;
};

export const MobileHeader: React.FC<MobileHeaderProps> = ({ title, eyebrow, showBack = true, onBack, onSave, saved, onShare }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAppStore();

  return (
    <header className="relative z-30 flex min-h-[64px] shrink-0 items-center gap-2 border-b border-white/[0.07] bg-[rgba(7,9,13,0.88)] px-3 pb-2 pt-[max(2rem,env(safe-area-inset-top))] backdrop-blur-2xl">
      <button
        type="button"
        onClick={() => {
          if (onBack) {
            onBack();
            return;
          }
          if (!showBack) {
            navigate(DEV_MOBILE_BASE);
            return;
          }
          if (location.key === 'default') navigate(DEV_MOBILE_BASE);
          else navigate(-1);
        }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.055] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
        aria-label={showBack ? 'Go back' : 'Explore'}
      >
        {showBack ? <ArrowLeft className="h-5 w-5" /> : <img src="/swingsphere-logo.png" alt="" className="h-7 w-7 object-contain" />}
      </button>
      <div className="min-w-0 flex-1 px-1">
        {eyebrow ? <div className="truncate text-[9px] font-bold uppercase tracking-[0.2em] text-red-300/80">{eyebrow}</div> : null}
        <div className="truncate text-[15px] font-semibold text-white">{title}</div>
      </div>
      {onSave ? (
        <button type="button" onClick={onSave} className={`grid h-11 w-11 place-items-center rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300 ${saved ? 'bg-red-500/15 text-red-200' : 'bg-white/[0.055] text-gray-200'}`} aria-label={saved ? 'Remove from saved' : 'Save'} aria-pressed={saved}>
          <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
        </button>
      ) : null}
      {onShare ? (
        <button type="button" onClick={onShare} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.055] text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300" aria-label="Share">
          <Share2 className="h-5 w-5" />
        </button>
      ) : null}
      {!onSave && !onShare ? (
        <button type="button" onClick={() => navigate(toDevMobilePath('/account'))} className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-white/[0.055]" aria-label="Account">
          {currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <UserRound className="h-5 w-5 text-gray-300" />}
        </button>
      ) : null}
    </header>
  );
};

export const mobileNavItems: Array<{ label: string; path: string; icon: typeof Globe2; emphasized?: boolean }> = [
  { label: 'Explore', path: '', icon: Globe2 },
  { label: 'Nearby', path: '/nearby', icon: MapPin },
  { label: 'Add', path: '/add', icon: Plus, emphasized: true },
  { label: 'Saved', path: '/saved', icon: Bookmark },
  { label: 'Account', path: '/account', icon: UserRound },
];

export const getMobileNavTarget = (path: string) => `${DEV_MOBILE_BASE}${path}`;

export const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav className="grid min-h-[68px] shrink-0 grid-cols-5 border-t border-white/[0.07] bg-[rgba(6,8,11,0.96)] px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-2xl" aria-label="Mobile navigation">
      {mobileNavItems.map(({ label, path, icon: Icon, emphasized }) => {
        const target = getMobileNavTarget(path);
        const active = path ? location.pathname === target || location.pathname.startsWith(`${target}/`) : location.pathname === DEV_MOBILE_BASE || location.pathname === `${DEV_MOBILE_BASE}/`;
        return (
          <button key={label} type="button" onClick={() => navigate(target)} className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300 ${active ? 'text-red-200' : 'text-gray-500'}`} aria-current={active ? 'page' : undefined}>
            <span className={emphasized ? '-mt-5 grid h-11 w-11 place-items-center rounded-2xl bg-red-500 text-white shadow-[0_10px_28px_rgba(239,68,68,0.32)]' : ''}><Icon className="h-[19px] w-[19px]" /></span>
            <span className={emphasized ? '-mt-0.5' : ''}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export const DevMobileScreen: React.FC<{ children: React.ReactNode; className?: string; withNav?: boolean }> = ({ children, className = '', withNav = true }) => (
  <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#07090d] text-gray-100">
    <div className={`min-h-0 flex-1 ${className}`}>{children}</div>
    {withNav ? <MobileBottomNav /> : null}
  </div>
);
