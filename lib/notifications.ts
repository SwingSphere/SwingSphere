import { supabase } from './supabase';

export type NotificationCategory = 'listing_updates' | 'claim_updates' | 'achievements' | 'security' | 'admin_alerts';

export type SwingSphereNotification = {
  id: string;
  category: NotificationCategory;
  eventKey: string;
  title: string;
  body: string;
  actionUrl?: string;
  metadata: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
};

export type NotificationPreference = {
  category: NotificationCategory;
  inAppEnabled: boolean;
  emailEnabled: boolean;
};

export type NotificationDeliveryStatus = {
  inAppEnabled: boolean;
  emailProviderEnabled: boolean;
  emailProvider?: string;
  fromAddress?: string;
};

type NotificationRow = {
  id: string;
  category: NotificationCategory;
  event_key: string;
  title: string;
  body: string;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type PreferenceRow = {
  category: NotificationCategory;
  in_app_enabled: boolean;
  email_enabled: boolean;
};

export const getMyNotifications = async (limit = 50, offset = 0): Promise<SwingSphereNotification[]> => {
  const { data, error } = await supabase.rpc('list_my_notifications', { p_limit: limit, p_offset: offset });
  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).map((row) => ({
    id: row.id,
    category: row.category,
    eventKey: row.event_key,
    title: row.title,
    body: row.body,
    actionUrl: row.action_url ?? undefined,
    metadata: row.metadata ?? {},
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  }));
};

export const getUnreadNotificationCount = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('notification_unread_count');
  if (error) throw error;
  return Number(data ?? 0);
};

export const markNotificationRead = async (id: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('mark_my_notification_read', { p_notification_id: id });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent('swingsphere:notifications-changed'));
  return Boolean(data);
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('mark_all_my_notifications_read');
  if (error) throw error;
  window.dispatchEvent(new CustomEvent('swingsphere:notifications-changed'));
  return Number(data ?? 0);
};

export const getMyNotificationPreferences = async (): Promise<NotificationPreference[]> => {
  const { data, error } = await supabase.rpc('get_my_notification_preferences');
  if (error) throw error;
  return ((data ?? []) as PreferenceRow[]).map((row) => ({
    category: row.category,
    inAppEnabled: row.in_app_enabled,
    emailEnabled: row.email_enabled,
  }));
};

export const saveMyNotificationPreference = async (preference: NotificationPreference): Promise<boolean> => {
  const { data, error } = await supabase.rpc('save_my_notification_preference', {
    p_category: preference.category,
    p_in_app_enabled: preference.inAppEnabled,
    p_email_enabled: preference.emailEnabled,
  });
  if (error) throw error;
  return Boolean(data);
};

export const getNotificationDeliveryStatus = async (): Promise<NotificationDeliveryStatus> => {
  const { data, error } = await supabase.rpc('notification_delivery_status');
  if (error) throw error;
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    inAppEnabled: row.inAppEnabled !== false,
    emailProviderEnabled: Boolean(row.emailProviderEnabled),
    emailProvider: typeof row.emailProvider === 'string' ? row.emailProvider : undefined,
    fromAddress: typeof row.fromAddress === 'string' ? row.fromAddress : undefined,
  };
};
