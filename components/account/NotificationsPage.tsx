import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, Mail, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import {
  getMyNotificationPreferences,
  getMyNotifications,
  getNotificationDeliveryStatus,
  markAllNotificationsRead,
  markNotificationRead,
  saveMyNotificationPreference,
  type NotificationCategory,
  type NotificationDeliveryStatus,
  type NotificationPreference,
  type SwingSphereNotification,
} from '../../lib/notifications';

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  listing_updates: 'Listing updates',
  claim_updates: 'Listing claims',
  achievements: 'Achievements',
  security: 'Security & account',
  admin_alerts: 'Administrator alerts',
};

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useAppStore();
  const [notifications, setNotifications] = useState<SwingSphereNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [deliveryStatus, setDeliveryStatus] = useState<NotificationDeliveryStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<NotificationCategory | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const [rows, prefs, status] = await Promise.all([
        getMyNotifications(),
        getMyNotificationPreferences(),
        getNotificationDeliveryStatus(),
      ]);
      setNotifications(rows);
      setPreferences(prefs);
      setDeliveryStatus(status);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      addToast({ message: 'Unable to load notifications.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.readAt).length, [notifications]);

  const openNotification = async (notification: SwingSphereNotification) => {
    if (!notification.readAt) {
      try {
        await markNotificationRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      } catch (error) {
        console.error('Unable to mark notification read:', error);
      }
    }
    if (notification.actionUrl) navigate(notification.actionUrl);
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      const timestamp = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? timestamp })));
    } catch (error) {
      addToast({ message: 'Unable to mark notifications read.', type: 'error' });
    }
  };

  const updatePreference = async (category: NotificationCategory, field: 'inAppEnabled' | 'emailEnabled', value: boolean) => {
    const current = preferences.find((pref) => pref.category === category);
    if (!current) return;
    const next = { ...current, [field]: value };
    setSavingCategory(category);
    try {
      await saveMyNotificationPreference(next);
      setPreferences((items) => items.map((item) => item.category === category ? next : item));
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to save notification preference.', type: 'error' });
    } finally {
      setSavingCategory(null);
    }
  };

  if (isLoading) return <div className="text-gray-500">Loading notifications…</div>;

  return (
    <div className="space-y-4">
      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-red-300"><Bell size={15} /> Notifications</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">What needs your attention</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">Listing decisions, claim updates, achievements, security notices, and administrator alerts are delivered here.</p>
          </div>
          <button type="button" disabled={!unreadCount} onClick={() => void markAllRead()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-gray-200 transition hover:bg-white/[0.07] disabled:cursor-default disabled:opacity-40">
            <CheckCheck size={17} /> Mark all read
          </button>
        </div>
      </section>

      <section className="ss-glass-surface overflow-hidden rounded-[26px]">
        {notifications.length ? notifications.map((notification) => (
          <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`flex w-full items-start gap-4 border-b border-white/[0.06] px-5 py-5 text-left transition last:border-b-0 hover:bg-white/[0.035] sm:px-6 ${notification.readAt ? '' : 'bg-red-500/[0.035]'}`}>
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.readAt ? 'bg-gray-700' : 'bg-red-400'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">{CATEGORY_LABELS[notification.category]}</span>
                <span className="text-xs text-gray-600">{new Date(notification.createdAt).toLocaleString()}</span>
              </div>
              <h3 className="mt-1 text-base font-bold text-white">{notification.title}</h3>
              <p className="mt-1 text-sm leading-6 text-gray-400">{notification.body}</p>
            </div>
            {notification.actionUrl ? <ExternalLink size={16} className="mt-1 shrink-0 text-gray-600" /> : null}
          </button>
        )) : (
          <div className="px-6 py-14 text-center">
            <Bell size={28} className="mx-auto text-gray-700" />
            <p className="mt-3 font-bold text-gray-300">Nothing needs your attention.</p>
            <p className="mt-1 text-sm text-gray-500">New workflow updates will appear here automatically.</p>
          </div>
        )}
      </section>

      <section className="ss-glass-surface rounded-[26px] p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-red-200" />
          <div>
            <h3 className="text-xl font-bold text-white">Delivery preferences</h3>
            <p className="mt-1 text-sm leading-6 text-gray-400">In-app delivery is active. Security/account notices always remain enabled in-app.</p>
          </div>
        </div>
        <div className="mt-5 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-black/20">
          {preferences.map((preference) => (
            <div key={preference.category} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-gray-200">{CATEGORY_LABELS[preference.category]}</div>
                {preference.category === 'security' ? <div className="mt-1 text-xs text-gray-500">Required for important account/security events.</div> : null}
              </div>
              <div className="flex items-center gap-5 text-sm text-gray-400">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={preference.inAppEnabled} disabled={preference.category === 'security' || savingCategory === preference.category} onChange={(event) => void updatePreference(preference.category, 'inAppEnabled', event.target.checked)} /> In-app
                </label>
                <label className="flex items-center gap-2" title={deliveryStatus?.emailProviderEnabled ? undefined : 'Transactional email provider is not configured yet.'}>
                  <input type="checkbox" checked={preference.emailEnabled} disabled={!deliveryStatus?.emailProviderEnabled || savingCategory === preference.category} onChange={(event) => void updatePreference(preference.category, 'emailEnabled', event.target.checked)} /> <Mail size={14} /> Email
                </label>
              </div>
            </div>
          ))}
        </div>
        {!deliveryStatus?.emailProviderEnabled ? (
          <p className="mt-4 text-xs leading-5 text-amber-300/80">Email workflow delivery is staged but disabled until a transactional provider is configured. Supabase Auth emails such as password reset continue to use the separate Auth mail channel.</p>
        ) : null}
      </section>
    </div>
  );
};

export default NotificationsPage;
