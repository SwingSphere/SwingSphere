export interface Tag {
  id: string;
  categoryId: string;
  slug?: string;
  value?: string;
  label: string;
  description?: string;
  aliases?: string[];
  appliesTo?: Array<'club' | 'event' | 'resort' | 'cruise_series' | 'cruise_sailing'>;
  sortOrder?: number;
  usageCount: number;
  isVisible: boolean;
  isDeprecated: boolean;
}

export interface TagCategory {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  order: number;
  isActive?: boolean;
}

// Canonical taxonomy records live in Supabase. This module intentionally keeps
// only the shared TypeScript shapes so there is no competing local tag catalog.