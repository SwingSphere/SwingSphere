create table if not exists public.club_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  operator_organization_id uuid null,
  description_short text null,
  description_full text null,
  logo_image_url text null,
  header_image_url text null,
  default_amenities text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'approved', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_brands enable row level security;

drop policy if exists "Public can read approved club brands" on public.club_brands;
create policy "Public can read approved club brands"
on public.club_brands for select
to anon, authenticated
using (status = 'approved');

alter table public.media_assets drop constraint if exists media_assets_owner_type_check;
alter table public.media_assets add constraint media_assets_owner_type_check check (
  owner_type in ('club', 'club_brand', 'venue', 'event', 'event_series', 'organization', 'resort', 'cruise_series', 'cruise_sailing', 'user')
);
