alter table public.media_assets
  drop constraint if exists media_assets_owner_type_check;

alter table public.media_assets
  add constraint media_assets_owner_type_check
  check (
    owner_type in (
      'club',
      'venue',
      'event',
      'organization',
      'resort',
      'cruise_series',
      'cruise_sailing',
      'user'
    )
  );
