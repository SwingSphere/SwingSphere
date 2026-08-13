import type { Tag, TagCategory } from '../data/mockTags';
import { supabase } from './supabase';

export type TaxonomyScope = NonNullable<Tag['appliesTo']>[number];

type TagRow = {
  id: string;
  category_id: string;
  slug: string;
  value: string;
  label: string;
  description: string | null;
  aliases: string[] | null;
  applies_to: TaxonomyScope[] | null;
  is_visible: boolean;
  is_deprecated: boolean;
  sort_order: number;
  usage_count: number | string | null;
};

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active?: boolean;
};

const mapTag = (row: TagRow): Tag => ({
  id: row.id,
  categoryId: row.category_id,
  slug: row.slug,
  value: row.value,
  label: row.label,
  description: row.description ?? undefined,
  aliases: row.aliases ?? [],
  appliesTo: row.applies_to ?? ['club', 'event'],
  sortOrder: row.sort_order,
  usageCount: Number(row.usage_count ?? 0),
  isVisible: row.is_visible,
  isDeprecated: row.is_deprecated,
});

const mapCategory = (row: CategoryRow): TagCategory => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description ?? undefined,
  order: row.sort_order,
  isActive: row.is_active ?? true,
});

export const getPublicTags = async (): Promise<Tag[]> => {
  const { data, error } = await supabase.rpc('taxonomy_list_tags');
  if (error) throw error;
  return ((data ?? []) as TagRow[]).map(mapTag);
};

export const getPublicTagCategories = async (): Promise<TagCategory[]> => {
  const { data, error } = await supabase.rpc('taxonomy_list_categories');
  if (error) throw error;
  return ((data ?? []) as CategoryRow[]).map(mapCategory);
};

export const getAdminTags = async (): Promise<Tag[]> => {
  const { data, error } = await supabase.rpc('admin_taxonomy_list_tags');
  if (error) throw error;
  return ((data ?? []) as TagRow[]).map(mapTag);
};

export const getAdminTagCategories = async (): Promise<TagCategory[]> => {
  const { data, error } = await supabase.rpc('admin_taxonomy_list_categories');
  if (error) throw error;
  return ((data ?? []) as CategoryRow[]).map(mapCategory);
};

export const saveTag = async (tag: Partial<Tag> & { categoryId: string }): Promise<Tag> => {
  const payload = {
    id: tag.id || undefined,
    categoryId: tag.categoryId,
    slug: tag.slug || undefined,
    value: tag.value || tag.label,
    label: tag.label,
    description: tag.description || undefined,
    aliases: tag.aliases ?? [],
    appliesTo: tag.appliesTo ?? ['club', 'event'],
    isVisible: tag.isVisible ?? true,
    isDeprecated: tag.isDeprecated ?? false,
    sortOrder: tag.sortOrder ?? 100,
  };
  const { data, error } = await supabase.rpc('admin_save_tag', { p_payload: payload });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  return mapTag({
    id: String(row.id),
    category_id: String(row.category_id),
    slug: String(row.slug),
    value: String(row.value),
    label: String(row.label),
    description: typeof row.description === 'string' ? row.description : null,
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    applies_to: Array.isArray(row.applies_to) ? row.applies_to as TaxonomyScope[] : ['club', 'event'],
    is_visible: Boolean(row.is_visible),
    is_deprecated: Boolean(row.is_deprecated),
    sort_order: Number(row.sort_order ?? 100),
    usage_count: tag.usageCount ?? 0,
  });
};

export const deprecateTag = async (tagId: string, reason: string): Promise<void> => {
  const { error } = await supabase.rpc('admin_deprecate_tag', {
    p_tag_id: tagId,
    p_reason: reason,
  });
  if (error) throw error;
};

export const saveTagCategory = async (category: Partial<TagCategory>): Promise<TagCategory> => {
  const payload = {
    id: category.id || undefined,
    slug: category.slug || undefined,
    name: category.name,
    description: category.description || undefined,
    sortOrder: category.order ?? 100,
    isActive: category.isActive ?? true,
  };
  const { data, error } = await supabase.rpc('admin_save_tag_category', { p_payload: payload });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  return mapCategory({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    sort_order: Number(row.sort_order ?? 100),
    is_active: Boolean(row.is_active ?? true),
  });
};

export const tagsForScope = (tags: Tag[], scope: TaxonomyScope): Tag[] =>
  tags
    .filter((tag) => !tag.isDeprecated && tag.isVisible && (tag.appliesTo ?? ['club', 'event']).includes(scope))
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.label.localeCompare(b.label));

export type EditorTaxonomyGroup = {
  id: string;
  label: string;
  options: Array<{ value: string; label: string; description?: string; legacyValues?: string[] }>;
};

const EDITOR_CATEGORY_IDS: Record<'club' | 'event', string[]> = {
  club: ['cat-vibe', 'cat-amenities'],
  event: ['cat-community', 'cat-vibe', 'cat-amenities', 'cat-theme', 'cat-safety'],
};

export const buildEditorTaxonomyGroups = (
  tags: Tag[],
  categories: TagCategory[],
  scope: 'club' | 'event',
): EditorTaxonomyGroup[] => {
  const allowedCategories = new Set(EDITOR_CATEGORY_IDS[scope]);
  const scopedTags = tagsForScope(tags, scope);
  return categories
    .filter((category) => allowedCategories.has(category.id))
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      id: category.id,
      label: category.name,
      options: scopedTags
        .filter((tag) => tag.categoryId === category.id)
        .map((tag) => ({
          value: tag.value ?? tag.label,
          label: tag.label,
          description: tag.description,
          legacyValues: tag.aliases ?? [],
        })),
    }))
    .filter((group) => group.options.length > 0);
};
