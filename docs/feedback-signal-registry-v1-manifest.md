# Feedback Signal Registry v1 Manifest

Canonical source: `lib/feedback/promptRegistry.ts`

Registry version: `1`

This document is the exact seed contract for Supabase. Signal IDs are stable canonical values. Labels are presentation metadata. All listed signals support both `positive` and `improvement` polarity. No listed signal is safety-sensitive.

## Registry summary

- Unique signal definitions: 29
- Event applicability records: 10
- Club applicability records: 10
- Organization applicability records: 10
- Total applicability records: 30
- Shared signal: `clear_communication` applies to both `event` and `organization`

## Signal definitions

| Signal ID | Label | Positive label | Improvement label | Category |
|---|---|---|---|---|
| `friendly_crowd` | Crowd experience | Friendly crowd | Friendlier crowd | atmosphere |
| `great_music` | Music | Great music | Better music fit | atmosphere |
| `clear_communication` | Communication | Clear communication | Clearer communication | communication |
| `smooth_check_in` | Check-in | Smooth check-in | Smoother check-in | arrival |
| `newcomer_friendly` | Newcomer experience | Newcomer friendly | More newcomer support | hospitality |
| `enough_social_space` | Social space | Enough social space | More social space | space |
| `enough_play_space` | Play space | Enough play space | More play space | space |
| `clean_environment` | Environment | Clean environment | Cleaner environment | venue |
| `clear_rules` | Rules and expectations | Clear rules | Clearer rules | expectations |
| `matched_listing` | Listing accuracy | Matched the listing | More accurate listing | accuracy |
| `helpful_staff` | Staff | Helpful staff | More helpful staff | hospitality |
| `smooth_entry` | Entry | Smooth entry | Smoother entry | arrival |
| `clean_facilities` | Facilities | Clean facilities | Cleaner facilities | facilities |
| `useful_amenities` | Amenities | Useful amenities | More useful amenities | facilities |
| `privacy_respected` | Privacy practices | Privacy respected | Stronger privacy practices | privacy |
| `good_layout` | Layout | Good layout | Better layout | space |
| `comfortable_social_areas` | Social areas | Comfortable social areas | More comfortable social areas | space |
| `adequate_play_areas` | Play areas | Adequate play areas | Better play areas | space |
| `good_music` | Music | Good music | Better music fit | atmosphere |
| `admission_policy_accurate` | Admission policy | Accurate admission policy | Clearer admission policy | accuracy |
| `reliable_updates` | Updates | Reliable updates | More reliable updates | communication |
| `organized_events` | Organization | Organized events | More organized events | operations |
| `fair_screening` | Screening | Fair screening | Fairer screening | access |
| `newcomer_support` | Newcomer support | Strong newcomer support | More newcomer support | hospitality |
| `consistent_rules` | Rule consistency | Consistent rules | More consistent rules | expectations |
| `responsive_host` | Responsiveness | Responsive host | More responsive host | communication |
| `accurate_listings` | Listing accuracy | Accurate listings | More accurate listings | accuracy |
| `handles_problems_well` | Problem handling | Handles problems well | Better problem handling | operations |
| `would_attend_again` | Future attendance | Would attend again | More reason to return | overall |

## Applicability records

Every applicability record below supports both polarities: `positive` and `improvement`.

### Event

- `friendly_crowd`
- `great_music`
- `clear_communication`
- `smooth_check_in`
- `newcomer_friendly`
- `enough_social_space`
- `enough_play_space`
- `clean_environment`
- `clear_rules`
- `matched_listing`

### Club

- `helpful_staff`
- `smooth_entry`
- `clean_facilities`
- `useful_amenities`
- `privacy_respected`
- `good_layout`
- `comfortable_social_areas`
- `adequate_play_areas`
- `good_music`
- `admission_policy_accurate`

### Organization

- `clear_communication`
- `reliable_updates`
- `organized_events`
- `fair_screening`
- `newcomer_support`
- `consistent_rules`
- `responsive_host`
- `accurate_listings`
- `handles_problems_well`
- `would_attend_again`

## Private safety categories

These are not structured public signals and must not be inserted into `feedback_signals` or `feedback_signal_applicability` unless the backend has a separate safety-category registry designed for them.

- `consent_concern`
- `harassment`
- `privacy_violation`
- `discrimination`
- `unsafe_venue_conditions`
- `coercive_behavior`

## Required Supabase seed behavior

1. Seed or upsert registry version `1` without changing its aggregate threshold of `10`.
2. Seed exactly 29 unique signal definitions using the IDs above.
3. Seed exactly 30 target-applicability relationships.
4. Register both `positive` and `improvement` polarity for every applicability relationship, according to the installed schema.
5. Do not create a second definition for `clear_communication`; it is one signal with two target relationships.
6. Keep all IDs lowercase snake_case exactly as written.
7. Make the seed idempotent.
8. Verify that a Winter Masquerade event submission can use all 10 event signal IDs.
9. Verify that a club signal is rejected for an event target.
10. Verify that a valid event signal is accepted in either polarity but rejected when selected in both polarities for the same submission.

## Expected post-seed counts

- Registry versions: version `1` active
- Signal definitions for version 1: `29`
- Applicability rows for version 1: `30`
- Event-applicable signals: `10`
- Club-applicable signals: `10`
- Organization-applicable signals: `10`
