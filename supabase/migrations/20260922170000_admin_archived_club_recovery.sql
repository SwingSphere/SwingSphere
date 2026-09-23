-- Let admins recover archived club locations without exposing them to public discovery.
create or replace function public.admin_list_archived_clubs()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin(auth.uid()) then
    raise exception 'Administrator access required.';
  end if;

  return query
  select private.listing_payload(listing, false)
  from public.listings listing
  where listing.listing_type = 'club'
    and listing.lifecycle_state = 'archived'
  order by listing.updated_at desc;
end;
$$;

revoke all on function public.admin_list_archived_clubs() from public, anon, authenticated;
grant execute on function public.admin_list_archived_clubs() to authenticated;
