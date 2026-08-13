import { supabase } from '../supabase';
import * as api from '../api';
import type { User } from '../../data/mockUsers';
import type {
  BadgeAudience,
  BadgeAwardMode,
  BadgeCategory,
  BadgeMetadata,
  BadgeRarity,
  BadgeVisualStyle,
} from '../badges/badgeTypes';

export type AdminManagedUser = {
  id: string;
  displayName: string;
  handle?: string;
  email?: string;
  role: User['role'];
  status: User['status'];
  avatarUrl?: string;
  joinDate: string;
  emailVerifiedAt?: string;
  founderNumber?: number;
  profileVisibility: 'private' | 'visible';
  badgeCount: number;
  publicBadgeCount: number;
  organizationCount: number;
  approvedReviewCount: number;
  adminMetadataAvailable: boolean;
};

export type AdminUserAccountUpdate = {
  role: AdminManagedUser['role'];
  status: AdminManagedUser['status'];
  reason: string;
};

export type AdminUserBadgeState = {
  badgeId: string;
  badgeSlug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  audience: BadgeAudience;
  awardMode: BadgeAwardMode;
  iconKey?: string;
  assetKey?: string;
  criteria: Record<string, unknown>;
  visualStyle: BadgeVisualStyle;
  sortOrder: number;
  awardId?: string;
  awardedAt?: string;
  awardedBy?: string;
  awardReason?: string;
  awardSource?: string;
  metadata: BadgeMetadata;
  isPublic: boolean;
  isFeatured: boolean;
  featuredOrder?: number;
  isAwarded: boolean;
};

type AdminManagedUserRow = {
  id: string;
  display_name: string;
  handle: string | null;
  email: string | null;
  role: 'user' | 'promoter' | 'admin';
  status: 'active' | 'suspended' | 'deleted';
  avatar_url: string | null;
  created_at: string;
  email_verified_at: string | null;
  founder_number: number | null;
  profile_visibility: 'private' | 'visible';
  badge_count: number | string | null;
  public_badge_count: number | string | null;
  organization_count: number | string | null;
  approved_review_count: number | string | null;
};

type AdminUserBadgeRow = {
  badge_id: string;
  badge_slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  audience: BadgeAudience;
  award_mode: BadgeAwardMode;
  icon_key: string | null;
  asset_key: string | null;
  criteria: Record<string, unknown> | null;
  visual_style: BadgeVisualStyle | null;
  sort_order: number;
  award_id: string | null;
  awarded_at: string | null;
  awarded_by: string | null;
  award_reason: string | null;
  award_source: string | null;
  award_metadata: BadgeMetadata | null;
  is_public: boolean | null;
  is_featured: boolean | null;
  featured_order: number | null;
  is_awarded: boolean;
};

const toCount = (value: number | string | null | undefined): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const mapRole = (role: AdminManagedUserRow['role']): User['role'] =>
  role === 'admin' ? 'Admin' : role === 'promoter' ? 'Host' : 'User';

const mapStatus = (status: AdminManagedUserRow['status']): User['status'] =>
  status === 'active' ? 'Active' : status === 'deleted' ? 'Deleted' : 'Suspended';

export const getAdminManagedUsers = async (): Promise<AdminManagedUser[]> => {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (!error) {
    return ((data ?? []) as AdminManagedUserRow[]).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      handle: row.handle ?? undefined,
      email: row.email ?? undefined,
      role: mapRole(row.role),
      status: mapStatus(row.status),
      avatarUrl: row.avatar_url ?? undefined,
      joinDate: row.created_at,
      emailVerifiedAt: row.email_verified_at ?? undefined,
      founderNumber: row.founder_number ?? undefined,
      profileVisibility: row.profile_visibility ?? 'private',
      badgeCount: toCount(row.badge_count),
      publicBadgeCount: toCount(row.public_badge_count),
      organizationCount: toCount(row.organization_count),
      approvedReviewCount: toCount(row.approved_review_count),
      adminMetadataAvailable: true,
    }));
  }

  // Keep the existing admin screen usable before the pending migrations are
  // deployed. The fallback cannot expose other members' Auth emails or badge
  // counts, which is intentionally reflected by empty values.
  const fallback = await api.getUsers();
  return fallback.map((user) => ({
    id: user.id,
    displayName: user.displayName,
    handle: user.handle,
    email: user.email || undefined,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    joinDate: user.joinDate,
    profileVisibility: 'private',
    badgeCount: user.badges?.length ?? 0,
    publicBadgeCount: 0,
    organizationCount: 0,
    approvedReviewCount: 0,
    adminMetadataAvailable: false,
  }));
};

const toDatabaseRole = (role: AdminManagedUser['role']): 'user' | 'promoter' | 'admin' =>
  role === 'Admin' ? 'admin' : role === 'Host' ? 'promoter' : 'user';

const toDatabaseStatus = (status: AdminManagedUser['status']): 'active' | 'suspended' | 'deleted' =>
  status === 'Active' ? 'active' : status === 'Deleted' ? 'deleted' : 'suspended';

export const updateAdminManagedUser = async (
  userId: string,
  update: AdminUserAccountUpdate,
): Promise<void> => {
  const reason = update.reason.trim();
  if (!reason) throw new Error('A reason is required for account changes.');

  const { error } = await supabase.rpc('admin_update_user_account', {
    p_user_id: userId,
    p_role: toDatabaseRole(update.role),
    p_status: toDatabaseStatus(update.status),
    p_reason: reason,
  });
  if (error) throw error;
};

export const getAdminUserBadges = async (userId: string): Promise<AdminUserBadgeState[]> => {
  const { data, error } = await supabase.rpc('admin_get_user_badges', { p_user_id: userId });
  if (error) throw error;
  return ((data ?? []) as AdminUserBadgeRow[]).map((row) => ({
    badgeId: row.badge_id,
    badgeSlug: row.badge_slug,
    name: row.name,
    description: row.description,
    category: row.category,
    rarity: row.rarity,
    audience: row.audience,
    awardMode: row.award_mode,
    iconKey: row.icon_key ?? undefined,
    assetKey: row.asset_key ?? undefined,
    criteria: row.criteria ?? {},
    visualStyle: row.visual_style ?? {},
    sortOrder: row.sort_order,
    awardId: row.award_id ?? undefined,
    awardedAt: row.awarded_at ?? undefined,
    awardedBy: row.awarded_by ?? undefined,
    awardReason: row.award_reason ?? undefined,
    awardSource: row.award_source ?? undefined,
    metadata: row.award_metadata ?? {},
    isPublic: row.is_public ?? false,
    isFeatured: row.is_featured ?? false,
    featuredOrder: row.featured_order ?? undefined,
    isAwarded: Boolean(row.is_awarded),
  }));
};

export const revokeAdminUserBadge = async (
  userId: string,
  badgeSlug: string,
  reason?: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('admin_revoke_user_badge', {
    p_user_id: userId,
    p_badge_slug: badgeSlug,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
  return Boolean(data);
};
