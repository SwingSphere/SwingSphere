-- Migration: venue_ambient_building_massings
-- Holds manually drawn ambient context buildings per physical venue.
-- Ambient buildings provide spatial realism only; they do not create listings,
-- venues, or canonical BuildingAssets, and never affect discovery or search.

create table if not exists public.venue_ambient_building_massings (
  venue_id text primary key,
  version integer not null default 1 check (version = 1),
  objects jsonb not null default '[]'::jsonb check (jsonb_typeof(objects) = 'array'),
  updated_at timestamptz not null default now()
);

-- Admin-only RLS
alter table public.venue_ambient_building_massings enable row level security;

create policy "Admins can view venue ambient building massings"
  on public.venue_ambient_building_massings
  for select
  using (
    auth.jwt() ->> 'role' = 'service_role'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  );

create policy "Admins can manage venue ambient building massings"
  on public.venue_ambient_building_massings
  for all
  using (
    auth.jwt() ->> 'role' = 'service_role'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  );
