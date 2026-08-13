import { supabase } from '../supabase';
import type {
  BadgeAudience,
  BadgeAwardMode,
  BadgeAwardView,
  BadgeCatalogItem,
  BadgeCategory,
  BadgeMetadata,
  BadgeRarity,
  BadgeVisualStyle,
} from './badgeTypes';

type BadgeAwardRow = {
  award_id: string;
  badge_slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  audience?: BadgeAudience | null;
  award_mode?: BadgeAwardMode | null;
  icon_key?: string | null;
  asset_key?: string | null;
  criteria?: Record<string, unknown> | null;
  visual_style?: BadgeVisualStyle | null;
  awarded_at: string;
  award_reason?: string | null;
  metadata?: BadgeMetadata | null;
  is_public?: boolean | null;
  is_featured?: boolean | null;
  featured_order?: number | null;
};

type BadgeCatalogRow = {
  id: string;
  slug: string;
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
};

const mapAward = (row: BadgeAwardRow): BadgeAwardView => ({
  awardId: row.award_id,
  badgeSlug: row.badge_slug,
  name: row.name,
  description: row.description,
  category: row.category,
  rarity: row.rarity,
  audience: row.audience ?? undefined,
  awardMode: row.award_mode ?? undefined,
  iconKey: row.icon_key ?? undefined,
  assetKey: row.asset_key ?? undefined,
  criteria: row.criteria ?? undefined,
  visualStyle: row.visual_style ?? {},
  awardedAt: row.awarded_at,
  awardReason: row.award_reason ?? undefined,
  metadata: row.metadata ?? {},
  isPublic: row.is_public ?? true,
  isFeatured: row.is_featured ?? false,
  featuredOrder: row.featured_order ?? undefined,
});

const mapCatalogItem = (row: BadgeCatalogRow): BadgeCatalogItem => ({
  id: row.id,
  slug: row.slug,
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
});

export const getMyBadges = async (): Promise<BadgeAwardView[]> => {
  const { data, error } = await supabase.rpc('get_my_badges');
  if (error) throw error;
  return ((data ?? []) as BadgeAwardRow[]).map(mapAward);
};

export const getPublicProfileBadgesByHandle = async (handle: string): Promise<BadgeAwardView[]> => {
  const { data, error } = await supabase.rpc('get_public_profile_badges_by_handle', {
    p_handle: handle,
  });
  if (error) throw error;
  return ((data ?? []) as BadgeAwardRow[]).map(mapAward);
};

export const getAdminProfileBadgesByHandle = async (handle: string): Promise<BadgeAwardView[]> => {
  const { data, error } = await supabase.rpc('admin_get_profile_badges_by_handle', {
    p_handle: handle,
  });
  if (error) throw error;
  return ((data ?? []) as BadgeAwardRow[]).map(mapAward);
};

export const getPublicOrganizationBadges = async (organizationId: string): Promise<BadgeAwardView[]> => {
  const { data, error } = await supabase.rpc('get_public_organization_badges', {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return ((data ?? []) as BadgeAwardRow[]).map(mapAward);
};

export const getVisibleBadgeCatalog = async (): Promise<BadgeCatalogItem[]> => {
  const { data, error } = await supabase
    .from('badges')
    .select('id, slug, name, description, category, rarity, audience, award_mode, icon_key, asset_key, criteria, visual_style, sort_order')
    .eq('is_active', true)
    .eq('is_catalog_visible', true)
    .eq('is_secret', false)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as BadgeCatalogRow[]).map(mapCatalogItem);
};

export const adminAwardUserBadge = async (
  userId: string,
  badgeSlug: string,
  reason?: string,
  metadata: Record<string, unknown> = {},
): Promise<string> => {
  const { data, error } = await supabase.rpc('admin_award_user_badge', {
    p_user_id: userId,
    p_badge_slug: badgeSlug,
    p_reason: reason ?? null,
    p_metadata: metadata,
  });
  if (error) throw error;
  return data as string;
};

export const adminAwardOrganizationBadge = async (
  organizationId: string,
  badgeSlug: string,
  reason?: string,
  metadata: Record<string, unknown> = {},
): Promise<string> => {
  const { data, error } = await supabase.rpc('admin_award_organization_badge', {
    p_organization_id: organizationId,
    p_badge_slug: badgeSlug,
    p_reason: reason ?? null,
    p_metadata: metadata,
  });
  if (error) throw error;
  return data as string;
};

export const adminSetFounderProgramEnabled = async (enabled: boolean): Promise<boolean> => {
  const { data, error } = await supabase.rpc('admin_set_founder_program_enabled', {
    p_enabled: enabled,
  });
  if (error) throw error;
  return Boolean(data);
};

export const adminAssignFounderNumber = async (userId: string): Promise<number | null> => {
  const { data, error } = await supabase.rpc('admin_assign_founder_number', {
    p_user_id: userId,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : null;
};

export const updateMyBadgePresentation = async (
  awardId: string,
  input: { isPublic: boolean; isFeatured: boolean; featuredOrder?: number },
): Promise<void> => {
  const payload = {
    is_public: input.isPublic,
    is_featured: input.isPublic && input.isFeatured,
    featured_order: input.isPublic && input.isFeatured ? input.featuredOrder ?? 1 : null,
  };

  const { error } = await supabase
    .from('user_badges')
    .update(payload)
    .eq('id', awardId);

  if (error) throw error;
};
