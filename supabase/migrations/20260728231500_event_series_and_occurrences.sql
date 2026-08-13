create table if not exists public.event_series (
  id text primary key,
  name text not null,
  slug text not null unique,
  organizer_organization_id text,
  description_short text,
  description_full text,
  logo_image_url text,
  header_image_url text,
  default_venue_id text,
  default_tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'pending_approval', 'approved', 'flagged', 'active', 'inactive', 'archived')),
  posted_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_occurrences (
  id text primary key,
  event_series_id text references public.event_series(id) on delete set null,
  organizer_organization_id text,
  venue_id text,
  name text not null,
  occurrence_title text,
  slug text not null unique,
  description_full text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  ticket_url text,
  rsvp_url text,
  logo_image_url text,
  header_image_url text,
  flyer_image_url text,
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'pending_approval', 'approved', 'flagged', 'active', 'inactive', 'archived', 'cancelled', 'completed')),
  posted_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists event_series_organizer_idx on public.event_series (organizer_organization_id);
create index if not exists event_occurrences_series_start_idx on public.event_occurrences (event_series_id, starts_at);
create index if not exists event_occurrences_venue_start_idx on public.event_occurrences (venue_id, starts_at);

alter table public.event_series enable row level security;
alter table public.event_occurrences enable row level security;

create policy "Public can read approved event series"
  on public.event_series for select
  using (status in ('approved', 'active'));

create policy "Public can read approved event occurrences"
  on public.event_occurrences for select
  using (status in ('approved', 'active'));

comment on table public.event_series is 'Durable recurring event brands such as Her Fantasy, Bronze Party, and Illuminaughty.';
comment on table public.event_occurrences is 'Individual dated editions of an event series, including one-off events when event_series_id is null.';
