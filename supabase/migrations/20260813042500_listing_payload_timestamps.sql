create or replace function private.listing_payload(
  p_listing public.listings,
  p_public boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_geo jsonb;
  v_address jsonb;
  v_public_address jsonb;
  v_public_location text;
  v_lat numeric;
  v_lon numeric;
begin
  v_payload := coalesce(p_listing.payload, '{}'::jsonb)
    || jsonb_build_object(
      'id', p_listing.id,
      'type', p_listing.listing_type,
      'name', p_listing.name,
      'status', p_listing.status,
      'createdAt', p_listing.created_at,
      'updatedAt', p_listing.updated_at
    );

  if p_listing.submitted_by is not null then
    v_payload := v_payload || jsonb_build_object('postedByUserId', p_listing.submitted_by::text);
  elsif p_listing.submitter_ref is not null then
    v_payload := v_payload || jsonb_build_object('postedByUserId', p_listing.submitter_ref);
  end if;

  if p_listing.owner_organization_id is not null and p_listing.listing_type = 'event' then
    v_payload := v_payload || jsonb_build_object('organizerOrganizationId', p_listing.owner_organization_id);
  end if;

  if not p_public then
    return v_payload;
  end if;

  if (v_payload ->> 'locationVisibility') = 'approximate_public'
     or lower(coalesce(v_payload ->> 'isAddressPrivate', 'false')) = 'true' then
    v_geo := coalesce(v_payload -> 'geopoint', '{}'::jsonb);
    v_address := coalesce(v_geo -> 'address', '{}'::jsonb);
    v_public_address := jsonb_strip_nulls(jsonb_build_object(
      'city', v_address ->> 'city',
      'region', v_address ->> 'region',
      'postalCode', v_address ->> 'postalCode',
      'country', v_address ->> 'country'
    ));

    v_public_location := concat_ws(', ',
      nullif(v_address ->> 'city', ''),
      nullif(v_address ->> 'region', ''),
      nullif(v_address ->> 'postalCode', ''),
      nullif(v_address ->> 'country', '')
    );

    if coalesce(v_geo ->> 'latitude', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
      v_lat := round((v_geo ->> 'latitude')::numeric, 2);
    end if;
    if coalesce(v_geo ->> 'longitude', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
      v_lon := round((v_geo ->> 'longitude')::numeric, 2);
    end if;

    v_payload := v_payload - 'locationMeta';
    v_payload := v_payload || jsonb_build_object(
      'location', v_public_location,
      'geopoint', jsonb_strip_nulls(jsonb_build_object(
        'latitude', v_lat,
        'longitude', v_lon,
        'address', v_public_address
      ))
    );
  end if;

  return v_payload;
end;
$$;
