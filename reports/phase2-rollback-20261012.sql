-- =============================================================================
-- SwingSphere Phase 2 — Reversible Rollback Script
-- Generated: 2026-10-12
-- Pairs with: reports/phase2-proposed-data-reconciliation-20261012.sql
-- Restores exact pre-migration column and JSONB values captured on 2026-10-12.
-- =============================================================================

begin;

-- 1. Revert Connect.Dance.Love & Krystal Club Privé organizer links
update public.listings
set owner_organization_id = null,
    updated_at = now()
where id in (
    'event-connect-dance-love-2026-04-04',
    'event-krystal-dance-night-2026-04-04',
    'event-krystal-neon-night-2026-04-11',
    'event-krystal-fetish-night-2026-04-18',
    'event-krystal-toga-party-2026-04-25'
  )
  and listing_type = 'event';

-- 2. Revert Midweek Escape event_series_id links on the 3 previously unlinked occurrences
update public.listings
set event_series_id = null,
    updated_at = now()
where id in (
    'event-1775498062796',
    'event-1775500501297',
    'event-1775500825641'
  )
  and listing_type = 'event';

-- 3. Revert series-her-fantasy logo_image_url to pre-migration value
update public.event_series
set logo_image_url = 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/74bf9013-96a8-4cd5-3911-4be8dd89fb00/logosquare',
    updated_at = now()
where id = 'series-her-fantasy';

-- 4. Restore occurrence-level payload.logoImageUrl on Illuminaughty, Bronze Party,
--    Krystal Club Privé, and Trapeze Atlanta events
update public.listings
set payload = payload || jsonb_build_object(
      'logoImageUrl',
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/ae6636d9-f865-4baa-6256-794aa12f8b00/logosquare'
    ),
    updated_at = now()
where id in (
    'event-illuminaughty-denver-2026-03-14',
    'event-illuminaughty-san-francisco-2026-04-11',
    'event-illuminaughty-scottsdale-2026-04-25',
    'event-illuminaughty-st-louis-2026-05-02'
  );

update public.listings
set payload = payload || jsonb_build_object(
      'logoImageUrl',
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/f01802eb-7930-4e20-6903-2fd3da4be900/logosquare'
    ),
    updated_at = now()
where id in (
    'event-bronze-party-bay-area-2026-04-04',
    'event-bronze-party-sf-2026-04-11'
  );

update public.listings
set payload = payload || jsonb_build_object(
      'logoImageUrl',
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/2efe3573-92a8-4f7b-72cc-4224fc2f4c00/logosquare'
    ),
    updated_at = now()
where id in (
    'event-krystal-dance-night-2026-04-04',
    'event-krystal-neon-night-2026-04-11',
    'event-krystal-fetish-night-2026-04-18',
    'event-krystal-toga-party-2026-04-25'
  );

update public.listings
set payload = payload || jsonb_build_object(
      'logoImageUrl',
      'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/2d99a016-2bd4-4c61-2f5c-ec92df56bd00/logosquare'
    ),
    updated_at = now()
where id in (
    'event-trapeze-atlanta-glow-in-the-dark-2026-04-04',
    'event-trapeze-atlanta-interracial-night-2026-04-10',
    'event-trapeze-atlanta-lust-and-leather-2026-04-25'
  );

-- 5. Revert org-club-power-exchange logo_image_url to pre-migration value
update public.organizations
set logo_image_url = 'https://imagedelivery.net/0YABV7zDubNpRHPPku3C9Q/90077276-bf09-4e14-2cb2-b31039402e00/logosquare',
    updated_at = now()
where id = 'org-club-power-exchange';

-- 6. Revert resort coordinates & Sea Mountain locationVisibility
update public.resorts
set geopoint = (coalesce(geopoint, '{}'::jsonb) - 'latitude' - 'longitude' - 'locationVisibility')
      || jsonb_build_object('latitude', null, 'longitude', null),
    updated_at = now()
where id in (
    'resort-hedonism-ii-negril',
    'resort-paradise-lakes-resort',
    'resort-the-kraken-resort',
    'resort-sea-mountain-inn-spa'
  );

-- 7. Revert resort operator_organization_id links
update public.resorts
set operator_organization_id = null,
    updated_at = now()
where id in (
    'resort-caliente-tampa',
    'resort-cypress-cove-kissimmee'
  );

-- 8. Revert cruise sailing departure_port coordinates
update public.cruise_sailings
set departure_port = coalesce(departure_port, '{}'::jsonb) - 'latitude' - 'longitude',
    updated_at = now()
where id in (
    'sailing-desire-french-italian-riviera-2026-09',
    'sailing-desire-greek-islands-2026-10',
    'sailing-desire-rio-2026-12',
    'sailing-bliss-caribbean-2026-11',
    'sailing-temptation-western-caribbean-2027-02'
  );

commit;
