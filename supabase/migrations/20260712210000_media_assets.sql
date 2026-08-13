create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('club', 'venue', 'event', 'user')),
  owner_id uuid not null,
  role text not null check (role in ('logo', 'avatar', 'hero', 'cover', 'flyer', 'gallery')),
  storage_provider text not null default 'cloudflare_images',
  external_id text not null,
  status text not null default 'pending_review',
  aspect_mode text not null check (aspect_mode in ('contain', 'cover')),
  target_ratio text,
  alt_text text,
  sort_order integer not null default 0,
  focal_point_x numeric,
  focal_point_y numeric,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_owner_idx on public.media_assets(owner_type, owner_id);
create index if not exists media_assets_role_idx on public.media_assets(role);
create index if not exists media_assets_status_idx on public.media_assets(status);

drop trigger if exists media_assets_set_updated_at on public.media_assets;
create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute procedure public.set_updated_at();

alter table public.media_assets enable row level security;

grant select on public.media_assets to anon, authenticated;
grant insert on public.media_assets to authenticated;

create policy "Public can read approved media assets"
on public.media_assets
for select
to anon, authenticated
using (status = 'approved');

create policy "Authenticated users can create pending media assets"
on public.media_assets
for insert
to authenticated
with check (status = 'pending_review');
