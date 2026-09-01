import React from 'react';
import { NavLink } from 'react-router-dom';
import Button from './Button';
import { useAppStore } from '../store/appStore';
import { DEV_TOOLS_ENABLED } from '../lib/devTools';
import { ChevronDown, UserRound } from 'lucide-react';

type HeaderProps = {
  variant?: 'default' | 'landing';
  onAddListing: () => void;
  onHomeClick: () => void;
  onLoginClick: () => void;
  onSignUpClick: () => void;
  onAdminClick: () => void;
  onHostDashboardClick: () => void;
  onAccountClick: () => void;
  onMapClick: () => void;
  onGlobeClick: () => void;
  explorerSurface?: 'globe' | 'map' | null;
};

const LOGO_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAABIAAAASABGyWs+AAAAB3RJTUUH6AYfESYc2sDpowAAAB10RVhqc29mdHdhcmUAbWF0cGxvdGxpYiB2ZXJzaW9uMy4yLjEsIGh0dHBzOi8vbWF0cGxvdGxpYi5vcmcv7pWeMAAAFW1JREFUeJzt3c2OZXld3vH340w/i304QBCJ15yYQCLBIEECQSy4/4QDBF5L4MvPQCABEgQSSODfCAgSQJCEpDdxo4hYPAgiDvZx2M/2ePq/313V7VTVq/rD6e6e2v5cnd25t9VVV1V19ZzWda1+B0dHRxP9AAAAAPg9jW3sAAAAAOCrQADwYyEAwI+FAADfFgIAfF0IAHwjCAA8EAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAEAkAEAgAECQAEAgAE';

export const Header: React.FC<HeaderProps> = ({ 
  variant = 'default',
  onAddListing, 
  onHomeClick, 
  onLoginClick, 
  onSignUpClick,
  onAdminClick,
  onHostDashboardClick,
  onAccountClick,
  onMapClick,
  onGlobeClick,
  explorerSurface = null,
}) => {
  const { currentUser } = useAppStore();
  const isLanding = variant === 'landing';

  return (
    <header
      className={`px-3 py-2.5 sm:px-6 sm:py-4 lg:px-8 ${
        isLanding
          ? 'ss-glass ss-glass--liquid fixed left-0 right-0 top-0 z-[80] rounded-none border-x-0 border-t-0'
          : 'ss-glass ss-glass--liquid sticky top-0 z-[80] rounded-none border-x-0 border-t-0'
      }`}
    >
      <div className="container mx-auto grid grid-cols-[1fr_auto] items-center gap-3 md:grid-cols-[1fr_auto_1fr] md:gap-6">
        <div onClick={onHomeClick} className="flex items-center gap-3 cursor-pointer justify-self-start">
          <img src="/swingsphere-logo.png" alt="SwingSphere Logo" className="h-9 w-auto sm:h-10" />
          <span className="hidden font-bold text-xl tracking-wider text-white sm:inline">
            <span className="text-red-500">SWING</span>SPHERE
          </span>
        </div>
        {explorerSurface ? (
          <div className="ss-glass ss-glass--liquid hidden items-center gap-1 md:flex rounded-full p-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-300 justify-self-center">
            <button
              type="button"
              onClick={onGlobeClick}
              className={`ss-glass--interactive rounded-full px-3 py-1.5 transition-colors ${explorerSurface === 'globe' ? 'ss-glass--crimson bg-red-500/12 text-white' : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}
            >
              Globe
            </button>
            <button
              type="button"
              onClick={onMapClick}
              className={`ss-glass--interactive rounded-full px-3 py-1.5 transition-colors ${explorerSurface === 'map' ? 'ss-glass--crimson bg-red-500/12 text-white' : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'}`}
            >
              Map
            </button>
          </div>
        ) : <span className="hidden md:block" />}
        <nav className="flex items-center gap-2 [&_button]:whitespace-nowrap sm:gap-4 justify-self-end">
          {currentUser ? (
            <>
              <div className="hidden items-center gap-2 md:flex lg:gap-4">
                {currentUser.status === 'Active' && <Button variant="secondary" onClick={onAddListing}>+ Add Listing</Button>}
                {currentUser.status === 'Active' && currentUser.role === 'Host' && (
                  <Button variant="secondary" onClick={onHostDashboardClick}>Host Dashboard</Button>
                )}
                {currentUser.status === 'Active' && currentUser.role === 'Admin' && (
                  <>
                    {DEV_TOOLS_ENABLED && (
                      <NavLink
                        to="/dev/sitemap"
                        className={({ isActive }) =>
                          `ss-glass ss-glass--liquid ss-glass--interactive px-3 py-1 text-sm font-medium rounded-lg ${
                            isActive ? 'ss-glass--crimson text-red-100' : 'text-red-200/85 hover:text-red-100'
                          }`
                        }
                      >
                        Dev Tools
                      </NavLink>
                    )}
                    <Button variant="secondary" onClick={onAdminClick}>Admin Panel</Button>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={onAccountClick}
                className="ss-glass ss-glass--liquid ss-glass--interactive flex h-11 items-center gap-2 rounded-full p-1.5 pr-3 text-sm font-semibold text-gray-100"
                aria-label="Open account"
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-black/35">
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound size={16} className="text-gray-300" />
                  )}
                </span>
                <span className="hidden max-w-28 truncate lg:block">{currentUser.displayName || currentUser.handle || 'Account'}</span>
                <ChevronDown size={14} className="hidden text-gray-400 md:block" />
              </button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onLoginClick}>Log In</Button>
              <Button variant="primary" onClick={onSignUpClick}>Sign Up</Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
