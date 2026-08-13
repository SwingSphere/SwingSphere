-- Keep taxonomy author/editor UUIDs and internal columns behind projections.
-- Public and authenticated browser reads use the taxonomy RPCs exclusively.

revoke select on public.tag_categories from anon, authenticated;
revoke select on public.tags from anon, authenticated;

comment on function public.taxonomy_list_tags() is
  'Public sanitized listing taxonomy projection with live canonical-listing usage counts. Raw taxonomy tables are not browser-readable.';
comment on function public.admin_taxonomy_list_tags() is
  'Active-admin taxonomy projection including hidden/deprecated tags and live usage counts.';
