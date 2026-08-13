-- Normalize legacy event payload venue IDs to the canonical venue namespace.
-- Three existing event records referenced `club-twist-sf` while the durable
-- Venue entity is `venue-club-twist-sf`. Apply the same rule generically when
-- a matching `venue-<legacy id>` record exists and preserve the change in the
-- listing moderation history.

with candidates as (
  select
    listing.id,
    listing.payload as before_payload,
    case
      when listing.payload ? 'venueId'
        and exists (
          select 1 from public.venues venue
          where venue.id = 'venue-' || (listing.payload ->> 'venueId')
        )
        then 'venueId'
      when listing.payload ? 'primaryVenueId'
        and exists (
          select 1 from public.venues venue
          where venue.id = 'venue-' || (listing.payload ->> 'primaryVenueId')
        )
        then 'primaryVenueId'
      else null
    end as payload_key,
    case
      when listing.payload ? 'venueId'
        and exists (
          select 1 from public.venues venue
          where venue.id = 'venue-' || (listing.payload ->> 'venueId')
        )
        then 'venue-' || (listing.payload ->> 'venueId')
      when listing.payload ? 'primaryVenueId'
        and exists (
          select 1 from public.venues venue
          where venue.id = 'venue-' || (listing.payload ->> 'primaryVenueId')
        )
        then 'venue-' || (listing.payload ->> 'primaryVenueId')
      else null
    end as canonical_venue_id
  from public.listings listing
  where listing.lifecycle_state = 'active'
),
updated as (
  update public.listings listing
  set payload = jsonb_set(
        listing.payload,
        array[candidate.payload_key],
        to_jsonb(candidate.canonical_venue_id),
        true
      ),
      updated_at = now()
  from candidates candidate
  where listing.id = candidate.id
    and candidate.payload_key is not null
    and candidate.canonical_venue_id is not null
  returning listing.id, listing.status, listing.lifecycle_state, listing.payload as after_payload
)
insert into public.listing_moderation_actions (
  listing_id,
  actor_user_id,
  action,
  reason,
  before_status,
  after_status,
  before_lifecycle_state,
  after_lifecycle_state,
  before_payload,
  after_payload
)
select
  updated.id,
  null,
  'legacy_import',
  'Normalized legacy listing venue reference to the canonical Venue entity ID.',
  updated.status,
  updated.status,
  updated.lifecycle_state,
  updated.lifecycle_state,
  candidate.before_payload,
  updated.after_payload
from updated
join candidates candidate on candidate.id = updated.id;
