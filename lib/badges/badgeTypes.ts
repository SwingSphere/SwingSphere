export type BadgeCategory =
  | 'founder'
  | 'legacy'
  | 'contribution'
  | 'community'
  | 'host'
  | 'seasonal'
  | 'staff'
  | 'special';

export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'unique';
export type BadgeAudience = 'member' | 'organization' | 'both';
export type BadgeAwardMode = 'automatic' | 'manual' | 'campaign' | 'future_automatic';

export type BadgeVisualStyle = {
  family?: string;
  palette?: string;
  [key: string]: unknown;
};

export type BadgeMetadata = {
  founder_number?: number;
  founder_limit?: number;
  variant?: string;
  [key: string]: unknown;
};

export type BadgeAwardView = {
  awardId: string;
  badgeSlug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  audience?: BadgeAudience;
  awardMode?: BadgeAwardMode;
  iconKey?: string;
  assetKey?: string;
  criteria?: Record<string, unknown>;
  visualStyle: BadgeVisualStyle;
  awardedAt: string;
  awardReason?: string;
  metadata: BadgeMetadata;
  isPublic: boolean;
  isFeatured: boolean;
  featuredOrder?: number;
};

export type BadgeCatalogItem = {
  id: string;
  slug: string;
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
};

export const badgeFounderNumber = (badge: BadgeAwardView): number | undefined => {
  const value = badge.metadata.founder_number;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

export const badgeDisplayName = (badge: BadgeAwardView): string => {
  const founderNumber = badge.badgeSlug === 'founding-member' ? badgeFounderNumber(badge) : undefined;
  return founderNumber ? `${badge.name} №${String(founderNumber).padStart(3, '0')}` : badge.name;
};
