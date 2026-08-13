import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getUnreadNotificationCount } from '../lib/notifications';

const NotificationBell: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const count = await getUnreadNotificationCount();
        if (mounted) setUnreadCount(count);
      } catch {
        // Notification availability should never block primary navigation.
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    const onFocus = () => void refresh();
    const onChanged = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('swingsphere:notifications-changed', onChanged);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('swingsphere:notifications-changed', onChanged);
    };
  }, []);

  return (
    <NavLink
      to="/account/notifications"
      aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
      title="Notifications"
      className={({ isActive }) => `ss-glass ss-glass--liquid ss-glass--interactive relative flex h-11 w-11 items-center justify-center rounded-full transition ${isActive ? 'ss-glass--crimson text-red-100' : 'text-gray-300 hover:text-white'}`}
    >
      <Bell size={18} aria-hidden="true" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#0d0e12] bg-red-500 px-1 text-[10px] font-black leading-none text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </NavLink>
  );
};

export default NotificationBell;
