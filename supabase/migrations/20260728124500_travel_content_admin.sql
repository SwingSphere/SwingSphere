create table if not exists public.resorts (
  id text primary key,
  slug text not null unique,
  name text not null,
  operator_organization_id text references public.organizations(id) on delete set null,
  description_short text not null default '',
  description_full text not null default '',
  geopoint jsonb not null default '{}'::jsonb,
  location_visibility text,
  resort_style text not null default 'destination_resort',
  audience_label text not null default '',
  accommodation_summary text not null default '',
  stay_length_summary text,
  booking_url text,
  contact_email text,
  amenities text[] not null default '{}',
  experience_highlights text[] not null default '{}',
  access_notes text[] not null default '{}',
  transportation_notes text[] not null default '{}',
  logo_image_url text,
  header_image_url text,
  gallery_image_urls text[] not null default '{}',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cruise_series (
  id text primary key,
  slug text not null unique,
  name text not null,
  operator_organization_id text references public.organizations(id) on delete set null,
  description_short text not null default '',
  description_full text not null default '',
  audience_label text not null default '',
  experience_highlights text[] not null default '{}',
  logo_image_url text,
  header_image_url text,
  gallery_image_urls text[] not null default '{}',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cruise_sailings (
  id text primary key,
  cruise_series_id text not null references public.cruise_series(id) on delete cascade,
  slug text not null unique,
  name text not null,
  ship_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  departure_port jsonb not null default '{}'::jsonb,
  itinerary jsonb not null default '[]'::jsonb,
  duration_nights integer not null check (duration_nights > 0),
  booking_url text,
  booking_status text,
  cabin_summary text,
  pricing_summary text,
  theme text,
  header_image_url text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cruise_sailings_series_start_idx on public.cruise_sailings(cruise_series_id, starts_at);

alter table public.resorts enable row level security;
alter table public.cruise_series enable row level security;
alter table public.cruise_sailings enable row level security;

create policy "Approved resorts are public" on public.resorts for select using (status = 'approved');
create policy "Approved cruise series are public" on public.cruise_series for select using (status = 'approved');
create policy "Approved cruise sailings are public" on public.cruise_sailings for select using (status = 'approved');
