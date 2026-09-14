import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Flag,
  Globe2,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Megaphone,
  MousePointerClick,
  Plane,
  ScanSearch,
  ScrollText,
  Settings,
  Tags,
  UsersRound,
} from 'lucide-react';
import { AdminView } from './AdminPanel';
import { useAppStore } from '../../store/appStore';

type AdminSidebarProps = {
  currentView: string;
  setView: (view: AdminView) => void;
  pendingSubmissions: number;
  pendingFlags: number;
};

const NavLink: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badgeCount?: number;
}> = ({ icon, label, isActive, onClick, badgeCount }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors ${
      isActive
        ? 'bg-blue-600 text-white shadow-sm'
        : 'text-slate-600 hover:bg-blue-50 hover:text-slate-950'
    }`}
  >
    <span className="flex min-w-0 items-center gap-3">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${isActive ? 'text-white' : 'text-slate-500'}`}>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
    {badgeCount && badgeCount > 0 ? (
      <span className={`ml-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${isActive ? 'bg-white text-blue-700' : 'bg-red-500 text-white'}`}>
        {badgeCount}
      </span>
    ) : null}
  </button>
);

const NavSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mt-5 first:mt-0">
    <h3 className="px-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{title}</h3>
    <div className="mt-2 space-y-1">{children}</div>
  </div>
);

const iconProps = { size: 18, strokeWidth: 1.9 } as const;

const AdminSidebar: React.FC<AdminSidebarProps> = ({ currentView, setView, pendingSubmissions, pendingFlags }) => {
  const navigate = useNavigate();
  const { currentUser, logout } = useAppStore();
  const isAdmin = currentUser?.role === 'Admin';
  const canAccessTools = isAdmin || import.meta.env.DEV;

  const handleExit = async () => {
    await logout();
    navigate('/');
  };

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white p-4">
      <div className="mb-7 flex items-center gap-2.5 px-1">
        <img src="/swingsphere-logo.png" alt="SwingSphere" className="h-8 w-8 rounded-lg object-contain" />
        <div>
          <div className="text-base font-black tracking-wide text-slate-900">Admin Panel</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">SwingSphere</div>
        </div>
      </div>

      <nav className="flex-grow overflow-y-auto pr-1">
        <div className="space-y-1">
          <NavLink
            icon={<LayoutDashboard {...iconProps} />}
            label="Dashboard"
            isActive={currentView === 'dashboard'}
            onClick={() => setView('dashboard')}
          />
        </div>

        {isAdmin ? (
          <NavSection title="Moderation">
            <NavLink
              icon={<Inbox {...iconProps} />}
              label="Submissions Queue"
              isActive={currentView === 'submissions' || currentView === 'review-submission'}
              onClick={() => setView('submissions')}
              badgeCount={pendingSubmissions}
            />
            <NavLink
              icon={<Flag {...iconProps} />}
              label="Moderation Queue"
              isActive={currentView === 'moderation'}
              onClick={() => setView('moderation')}
              badgeCount={pendingFlags}
            />
            <NavLink
              icon={<BadgeCheck {...iconProps} />}
              label="Listing Claims"
              isActive={currentView === 'listing-claims'}
              onClick={() => setView('listing-claims')}
            />
          </NavSection>
        ) : null}

        <NavSection title="Content">
          <NavLink
            icon={<Building2 {...iconProps} />}
            label="Manage Clubs"
            isActive={['manage-clubs', 'add-club', 'edit-club'].includes(currentView)}
            onClick={() => setView('manage-clubs')}
          />
          <NavLink
            icon={<CalendarDays {...iconProps} />}
            label="Manage Events"
            isActive={['manage-events', 'add-event', 'edit-event'].includes(currentView)}
            onClick={() => setView('manage-events')}
          />
          <NavLink
            icon={<Plane {...iconProps} />}
            label="Managed Travel"
            isActive={['manage-travel', 'add-resort', 'edit-resort', 'add-cruise-series', 'edit-cruise-series', 'add-cruise-sailing', 'edit-cruise-sailing'].includes(currentView)}
            onClick={() => setView('manage-travel')}
          />
          <NavLink
            icon={<MapPinned {...iconProps} />}
            label="Manage Venues"
            isActive={['manage-venues', 'add-venue', 'edit-venue'].includes(currentView)}
            onClick={() => setView('manage-venues')}
          />
          <NavLink
            icon={<Megaphone {...iconProps} />}
            label="Promoters & Hosts"
            isActive={['manage-organizations', 'add-organization', 'edit-organization'].includes(currentView)}
            onClick={() => setView('manage-organizations')}
          />
        </NavSection>

        {isAdmin ? (
          <NavSection title="Administration">
            <NavLink
              icon={<UsersRound {...iconProps} />}
              label="User Management"
              isActive={currentView === 'users'}
              onClick={() => setView('users')}
            />
            <NavLink
              icon={<Tags {...iconProps} />}
              label="Tags & Filters"
              isActive={currentView === 'tags'}
              onClick={() => setView('tags')}
            />
            <NavLink
              icon={<Globe2 {...iconProps} />}
              label="Inbound Analytics"
              isActive={currentView === 'inbound-analytics'}
              onClick={() => setView('inbound-analytics')}
            />
            <NavLink
              icon={<MousePointerClick {...iconProps} />}
              label="Outbound Analytics"
              isActive={currentView === 'outbound-analytics'}
              onClick={() => setView('outbound-analytics')}
            />
            <NavLink
              icon={<ScrollText {...iconProps} />}
              label="Audit Log"
              isActive={currentView === 'audit-log'}
              onClick={() => setView('audit-log')}
            />
            <NavLink
              icon={<Settings {...iconProps} />}
              label="Settings"
              isActive={currentView === 'settings'}
              onClick={() => setView('settings')}
            />
          </NavSection>
        ) : null}

        {canAccessTools ? (
          <NavSection title={isAdmin ? 'Tools' : 'Developer Tools'}>
            <NavLink
              icon={<ScanSearch {...iconProps} />}
              label="Building Inspector"
              isActive={false}
              onClick={() => navigate('/admin/building-inspector')}
            />
          </NavSection>
        ) : null}
      </nav>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="px-3.5 pb-2 text-xs text-slate-400">
          <div>Logged in as</div>
          <div className="mt-0.5 truncate font-semibold text-slate-700">{currentUser?.displayName} · {currentUser?.role}</div>
        </div>
        <NavLink
          icon={<LogOut {...iconProps} />}
          label="Log Out & Exit"
          isActive={false}
          onClick={() => void handleExit()}
        />
      </div>
    </aside>
  );
};

export default AdminSidebar;
